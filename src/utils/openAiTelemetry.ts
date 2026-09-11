import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';
import type { RequestHandler } from 'express';
import { usageMetrics, writeOpenAiUsage } from './openAiUsageLogger';

type RequestTrace = { requestId: string; calls: number; endpoint?: string; method?: string };
export const openAiRequestContext = new AsyncLocalStorage<RequestTrace>();
const callContext = new AsyncLocalStorage<{ callId: string; requestId: string; attempts: number }>();

function log(event: string, fields: Record<string, unknown>) {
  console.log(JSON.stringify({ event, ...fields }));
}

export const openAiRequestTracing: RequestHandler = (req, res, next) => {
  const trace = { requestId: randomUUID(), calls: 0, endpoint: req.originalUrl.split('?')[0], method: req.method };
  res.setHeader('X-Request-ID', trace.requestId);
  res.once('finish', () => log('openai.http_finished', {
    requestId: trace.requestId, method: req.method, path: req.path,
    // Background jobs may continue after this snapshot.
    callsStartedAtHttpFinish: trace.calls,
  }));
  openAiRequestContext.run(trace, next);
};

// Counts actual SDK transport attempts, including automatic retries.
export const tracedOpenAiFetch: typeof fetch = async (input, init) => {
  const trace = callContext.getStore();
  if (trace) {
    trace.attempts += 1;
    log('openai.attempt', { ...trace });
  }
  return fetch(input, init);
};

type Completion = { id: string; model: string; usage?: unknown; _request_id?: string | null };
export async function traceOpenAiCall<T extends Completion>(
  metadata: { api: string; model: string; lines: string[]; prompt: string; jobId?: string; fileId?: string },
  create: () => PromiseLike<T>,
): Promise<T> {
  const request = openAiRequestContext.getStore() ?? { requestId: randomUUID(), calls: 0 };
  const trace = { requestId: request.requestId, callId: randomUUID(), attempts: 0 };
  const fields = {
    requestId: trace.requestId, callId: trace.callId, callNumber: ++request.calls,
    endpoint: request.endpoint ?? null, method: request.method ?? null,
    api: metadata.api, model: metadata.model, jobId: metadata.jobId, fileId: metadata.fileId,
  };
  log('openai.call_started', {
    ...fields, ocrLines: metadata.lines.length,
    ocrChars: metadata.lines.join('\n').length,
    promptChars: metadata.prompt.length,
    promptBytes: Buffer.byteLength(metadata.prompt, 'utf8'),
  });
  const started = Date.now();
  return callContext.run(trace, async () => {
    try {
      const completion = await create();
      log('openai.call_completed', {
        ...fields, model: completion.model, responseId: completion.id,
        openaiRequestId: completion._request_id, attempts: trace.attempts,
        durationMs: Date.now() - started, usage: completion.usage ?? null,
      });
      await writeOpenAiUsage({
        ...fields, status: 'completed', model: completion.model,
        responseId: completion.id, openaiRequestId: completion._request_id ?? null,
        attempts: trace.attempts, durationMs: Date.now() - started,
        ...usageMetrics(completion.model, completion.usage),
      });
      return completion;
    } catch (error) {
      log('openai.call_failed', {
        ...fields, attempts: trace.attempts, durationMs: Date.now() - started,
        errorType: error instanceof Error ? error.name : 'UnknownError',
      });
      await writeOpenAiUsage({
        ...fields, status: 'failed', attempts: trace.attempts,
        durationMs: Date.now() - started,
        openaiRequestId: (error as { request_id?: string } | null)?.request_id ?? null,
        ...usageMetrics(metadata.model, null),
      });
      throw error;
    }
  });
}
