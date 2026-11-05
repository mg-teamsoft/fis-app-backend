import { performance } from 'node:perf_hooks';
import config from '../configs/config';
import { checkAnomaly } from '../utils/checkAnomaly';
import { extractTextFromBuffer } from './awsTextractService';
import { extractReceiptWithOpenAI } from './openaiToReceiptDataService';
import { getObjectBuffer } from './s3Service';
import { JobModel } from '../models/JobModel';
import { randomUuid } from '../utils/cryptoUtil';
import { JobQueue } from './jobQueue';

const queue = new JobQueue(config.jobConcurrency);

type JobParams = { userId: string; sourceKey: string; mime: string };
type BufferJobParams = JobParams & { buffer: Buffer };

async function startJob(params: JobParams, load: () => Promise<Buffer>) {
  const started = performance.now();
  const jobId = randomUuid();
  await JobModel.create({ jobId, userId: params.userId, sourceKey: params.sourceKey, status: 'queued' });
  queue.add(async () => {
    const timings: Record<string, number> = { queueMs: performance.now() - started };
    let stage = 'processing';
    async function measure<T>(name: string, operation: () => Promise<T>): Promise<T> {
      stage = name;
      const stepStarted = performance.now();
      try { return await operation(); }
      finally { timings[`${name}Ms`] = performance.now() - stepStarted; }
    }
    try {
      await JobModel.updateOne({ jobId }, { status: 'processing' });
      const buffer = await measure('s3', load);
      const lines = await measure('textract', () => extractTextFromBuffer(buffer));
      const receipt = await measure('openai', () => extractReceiptWithOpenAI(lines, { jobId }));
      stage = 'anomaly';
      const needsReview = checkAnomaly(receipt);
      stage = 'persist';
      await JobModel.updateOne({ jobId }, {
        status: 'done', receipt, needsReview, finishedAt: new Date(),
      });
      console.log(JSON.stringify({ event: 'job.completed', jobId, needsReview, ...timings, totalMs: performance.now() - started }));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(JSON.stringify({ event: 'job.failed', jobId, stage, error: message, ...timings, totalMs: performance.now() - started }));
      await JobModel.updateOne({ jobId }, { status: 'error', error: message, finishedAt: new Date() });
    }
  });
  return { jobId };
}

export function startJobFromKey(params: JobParams) {
  return startJob(params, () => getObjectBuffer(params.sourceKey));
}

// Retained for callers that already have the image in memory.
export function startJobFromBuffer(params: BufferJobParams) {
  return startJob(params, async () => params.buffer);
}
