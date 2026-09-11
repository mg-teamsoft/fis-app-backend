import { appendFile, mkdir, readdir, unlink } from 'node:fs/promises';
import { resolve, join } from 'node:path';

// Standard text API USD / 1M tokens, verified 2026-09-10.
// https://developers.openai.com/api/docs/models/gpt-4o-mini
const miniRate = { input: 0.15, cachedInput: 0.075, output: 0.60 };
const rates: Record<string, typeof miniRate> = {
  'gpt-4o-mini': miniRate,
  'gpt-4o-mini-2024-07-18': miniRate,
};

export function usageMetrics(model: string, usage: unknown) {
  const u = usage as Record<string, any> | null | undefined;
  const count = (n: unknown): number | null =>
    typeof n === 'number' && Number.isSafeInteger(n) && n >= 0 ? n : null;
  const inputTokens = count(u?.input_tokens ?? u?.prompt_tokens);
  const outputTokens = count(u?.output_tokens ?? u?.completion_tokens);
  const cachedInputTokens = count(u?.input_tokens_details?.cached_tokens ?? u?.prompt_tokens_details?.cached_tokens) ?? 0;
  const rate = rates[model];
  const known = inputTokens !== null && outputTokens !== null && cachedInputTokens <= inputTokens;
  return {
    inputTokens, outputTokens, cachedInputTokens: inputTokens === null ? null : cachedInputTokens,
    totalTokens: count(u?.total_tokens) ?? (known ? inputTokens! + outputTokens! : null),
    estimatedCostUsd: rate && known
      ? Number((((inputTokens! - cachedInputTokens) * rate.input + cachedInputTokens * rate.cachedInput + outputTokens! * rate.output) / 1_000_000).toFixed(12))
      : null,
    pricingStatus: !known ? 'usage_unavailable' : rate ? 'estimated' : 'model_price_unknown',
    pricingUsdPerMillion: rate ?? null,
    pricingVerifiedOn: rate ? '2026-09-10' : null,
  };
}

export function usageLogDate(now: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(now);
  const part = (type: string) => parts.find(p => p.type === type)!.value;
  return `${part('year')}-${part('month')}-${part('day')}`;
}

// Only this logger's dated regular files are eligible; keep the boundary day.
export async function pruneOpenAiUsageLogs(directory: string, today: string): Promise<void> {
  const cutoffDate = new Date(`${today}T00:00:00Z`);
  cutoffDate.setUTCDate(cutoffDate.getUTCDate() - 30);
  const cutoff = cutoffDate.toISOString().slice(0, 10);
  const entries = await readdir(directory, { withFileTypes: true });
  for (const entry of entries) {
    const match = /^usage-(\d{4}-\d{2}-\d{2})\.jsonl$/.exec(entry.name);
    if (!entry.isFile() || !match || match[1] >= cutoff) continue;
    const parsed = new Date(`${match[1]}T00:00:00Z`);
    if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== match[1]) continue;
    try {
      await unlink(join(directory, entry.name));
    } catch (error) {
      // Another process may have already removed this file.
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
  }
}

const cleanupState = new Map<string, { day: string; pending: Promise<void> }>();
async function cleanOnceDaily(directory: string, day: string): Promise<void> {
  const previous = cleanupState.get(directory);
  if (previous?.day === day) return previous.pending;
  const pending = (async () => {
    await previous?.pending;
    try {
      await pruneOpenAiUsageLogs(directory, day);
    } catch (error) {
      console.error(JSON.stringify({ event: 'openai.usage_cleanup_failed', day,
        errorCode: (error as NodeJS.ErrnoException)?.code ?? 'UNKNOWN',
      }));
    }
  })();
  cleanupState.set(directory, { day, pending });
  await pending;
}

// Awaited append; logging failures must not turn successful extraction into a retry.
export async function writeOpenAiUsage(fields: Record<string, unknown>, now = new Date()): Promise<void> {
  const timeZone = process.env.OPENAI_USAGE_LOG_TIMEZONE || 'Europe/Istanbul';
  const record = { ...fields, event: 'openai.usage', timestamp: now.toISOString(), timeZone };
  console.log(JSON.stringify(record));
  try {
    const directory = resolve(process.env.OPENAI_USAGE_LOG_DIR || 'logs/openai');
    const date = usageLogDate(now, timeZone);
    await mkdir(directory, { recursive: true });
    await appendFile(join(directory, `usage-${date}.jsonl`), JSON.stringify(record) + '\n', { encoding: 'utf8', mode: 0o600 });
    await cleanOnceDaily(directory, date);
  } catch (error) {
    console.error(JSON.stringify({ event: 'openai.usage_write_failed', timestamp: now.toISOString(),
      requestId: fields.requestId, callId: fields.callId,
      errorCode: (error as NodeJS.ErrnoException)?.code ?? 'UNKNOWN',
    }));
  }
}
