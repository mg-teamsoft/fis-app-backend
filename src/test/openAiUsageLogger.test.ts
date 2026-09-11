import { describe, it, expect, jest, afterEach } from '@jest/globals';
import { mkdtemp, readFile, writeFile, readdir, mkdir, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { usageMetrics, usageLogDate, writeOpenAiUsage, pruneOpenAiUsageLogs } from '../utils/openAiUsageLogger';

const previousDir = process.env.OPENAI_USAGE_LOG_DIR;
const previousZone = process.env.OPENAI_USAGE_LOG_TIMEZONE;
afterEach(() => {
  jest.restoreAllMocks();
  if (previousDir === undefined) delete process.env.OPENAI_USAGE_LOG_DIR;
  else process.env.OPENAI_USAGE_LOG_DIR = previousDir;
  if (previousZone === undefined) delete process.env.OPENAI_USAGE_LOG_TIMEZONE;
  else process.env.OPENAI_USAGE_LOG_TIMEZONE = previousZone;
});

describe('daily usage logger', () => {
  it('prices both APIs with cached input discounted exactly once', () => {
    const responses = usageMetrics('gpt-4o-mini', { input_tokens: 1000, output_tokens: 200, input_tokens_details: { cached_tokens: 400 } });
    const chat = usageMetrics('gpt-4o-mini', { prompt_tokens: 1000, completion_tokens: 200, prompt_tokens_details: { cached_tokens: 400 } });
    expect(responses).toEqual(chat);
    expect(responses.estimatedCostUsd).toBe(0.00024);
    expect(usageMetrics('gpt-4o-mini', null).estimatedCostUsd).toBeNull();
    expect(usageMetrics('unknown', { input_tokens: 1000, output_tokens: 200 }).pricingStatus).toBe('model_price_unknown');
  });

  it('rotates by Istanbul day and appends complete JSONL records', async () => {
    jest.spyOn(console, 'log').mockImplementation(() => {});
    const directory = await mkdtemp(join(tmpdir(), 'openai-usage-test-'));
    process.env.OPENAI_USAGE_LOG_DIR = directory;
    process.env.OPENAI_USAGE_LOG_TIMEZONE = 'Europe/Istanbul';
    const before = new Date('2026-09-10T20:59:59Z');
    const after = new Date('2026-09-10T21:00:00Z');
    expect(usageLogDate(after, 'Europe/Istanbul')).toBe('2026-09-11');
    await writeOpenAiUsage({ requestId: 'before' }, before);
    await Promise.all(['a', 'b'].map(requestId => writeOpenAiUsage({ requestId }, after)));
    const first = JSON.parse((await readFile(join(directory, 'usage-2026-09-10.jsonl'), 'utf8')).trim());
    expect(first.requestId).toBe('before');
    const next = (await readFile(join(directory, 'usage-2026-09-11.jsonl'), 'utf8')).trim().split('\n').map(line => JSON.parse(line));
    expect(next.map(x => x.requestId).sort()).toEqual(['a', 'b']);
    expect(next[0].timestamp).toBe(after.toISOString());
  });

  it('removes only dated regular logs older than 30 days, including across year boundaries', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'openai-retention-test-'));
    const names = ['usage-2025-12-10.jsonl', 'usage-2025-12-11.jsonl',
      'usage-2026-01-10.jsonl', 'usage-2026-02-01.jsonl', 'usage-2025-02-30.jsonl', 'other.jsonl'];
    await Promise.all(names.map(name => writeFile(join(directory, name), '{}\n')));
    await mkdir(join(directory, 'usage-2025-12-01.jsonl'));
    await symlink(join(directory, 'other.jsonl'), join(directory, 'usage-2025-12-02.jsonl'));
    await pruneOpenAiUsageLogs(directory, '2026-01-10');
    const remaining = await readdir(directory);
    expect(remaining).not.toContain('usage-2025-12-10.jsonl');
    for (const name of names.slice(1)) expect(remaining).toContain(name);
    expect(remaining).toContain('usage-2025-12-01.jsonl');
    expect(remaining).toContain('usage-2025-12-02.jsonl');
  });

  it('runs retention automatically on the first daily write', async () => {
    jest.spyOn(console, 'log').mockImplementation(() => {});
    const directory = await mkdtemp(join(tmpdir(), 'openai-daily-retention-test-'));
    process.env.OPENAI_USAGE_LOG_DIR = directory;
    process.env.OPENAI_USAGE_LOG_TIMEZONE = 'Europe/Istanbul';
    await writeFile(join(directory, 'usage-2026-08-10.jsonl'), '{}\n');
    await writeOpenAiUsage({ requestId: 'test' }, new Date('2026-09-10T12:00:00Z'));
    expect(await readdir(directory)).toEqual(['usage-2026-09-10.jsonl']);
  });

  it('reports write failure without rejecting the extraction', async () => {
    jest.spyOn(console, 'log').mockImplementation(() => {});
    const errors = jest.spyOn(console, 'error').mockImplementation(() => {});
    process.env.OPENAI_USAGE_LOG_TIMEZONE = 'invalid-zone';
    await expect(writeOpenAiUsage({ requestId: 'test' })).resolves.toBeUndefined();
    expect(JSON.parse(String(errors.mock.calls[0][0])).event).toBe('openai.usage_write_failed');
  });
});
