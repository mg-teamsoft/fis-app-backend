import { describe, it, expect, jest, afterEach } from '@jest/globals';
import OpenAI from 'openai';
import { openAiRequestContext, traceOpenAiCall, tracedOpenAiFetch } from '../utils/openAiTelemetry';

jest.mock('../utils/openAiUsageLogger', () => ({
  ...jest.requireActual<typeof import('../utils/openAiUsageLogger')>('../utils/openAiUsageLogger'),
  writeOpenAiUsage: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
}));

const metadata = { api: 'responses', model: 'gpt-4o-mini', lines: ['özel fiş'], prompt: 'talimat özel fiş' };
afterEach(() => { jest.restoreAllMocks(); });

describe('OpenAI telemetry', () => {
  it('isolates concurrent requests and counts calls while preserving usage without prompt text', async () => {
    const output = jest.spyOn(console, 'log').mockImplementation(() => {});
    const result = { id: 'resp_test', model: 'gpt-4o-mini', usage: { input_tokens: 12, output_tokens: 4, total_tokens: 16 } };
    await Promise.all(['a', 'b'].map(requestId => openAiRequestContext.run({ requestId, calls: 0 }, async () => {
      await traceOpenAiCall(metadata, async () => { await Promise.resolve(); return result; });
      await traceOpenAiCall(metadata, async () => result);
    })));
    const logs = output.mock.calls.map(([line]) => JSON.parse(String(line)));
    for (const id of ['a', 'b']) {
      expect(logs.filter(x => x.event === 'openai.call_started' && x.requestId === id).map(x => x.callNumber)).toEqual([1, 2]);
    }
    expect(logs.find(x => x.event === 'openai.call_completed').usage).toEqual(result.usage);
    expect(JSON.stringify(logs)).not.toContain('özel fiş');
  });

  it('counts SDK retries as attempts of one create call', async () => {
    const output = jest.spyOn(console, 'log').mockImplementation(() => {});
    const network = jest.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response('{}', { status: 429, headers: { 'retry-after-ms': '1' } }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: 'resp_test', model: 'gpt-4o-mini', usage: null }), {
        status: 200, headers: { 'content-type': 'application/json', 'x-request-id': 'req_test' },
      }));
    const client = new OpenAI({ apiKey: 'test-only', fetch: tracedOpenAiFetch });
    await traceOpenAiCall(metadata, () => client.responses.create({ model: metadata.model, input: metadata.prompt }));
    expect(network).toHaveBeenCalledTimes(2);
    const logs = output.mock.calls.map(([line]) => JSON.parse(String(line)));
    expect(logs.filter(x => x.event === 'openai.call_started')).toHaveLength(1);
    expect(logs.find(x => x.event === 'openai.call_completed')).toMatchObject({ attempts: 2, usage: null, openaiRequestId: 'req_test' });
  });

  it('logs failed calls and rethrows the original error', async () => {
    const output = jest.spyOn(console, 'log').mockImplementation(() => {});
    const error = new Error('sensitive error body');
    await expect(traceOpenAiCall(metadata, async () => { throw error; })).rejects.toBe(error);
    expect(output.mock.calls.map(([line]) => JSON.parse(String(line))).slice(-1)[0]).toMatchObject({ event: 'openai.call_failed', errorType: 'Error' });
    expect(JSON.stringify(output.mock.calls)).not.toContain(error.message);
  });
});
