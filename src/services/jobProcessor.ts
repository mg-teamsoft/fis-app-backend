// src/services/jobProcessor.ts
import config from '../configs/config';
import { randomUUID } from "crypto";
import { writeFile, unlink } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import runPythonOCR from './tesseractRunner';
import { parseReceiptLines } from '../utils/receiptParser';
import { checkAnomaly } from '../utils/checkAnomaly';
import { extractTextFromImage } from './awsTextractService';
import { extractReceiptWithOpenAI } from './openaiToReceiptDataService';
import { JobModel } from '../models/JobModel';


type BufferJobParams = {
  userId: string;
  sourceKey: string; // S3 key
  mime: string;
  buffer: Buffer;
};

export async function startJobFromBuffer(params: BufferJobParams) {
  const jobId = randomUUID();

  // You might want to persist a "job" doc in DB here with status = "queued"
  await JobModel.create({
    jobId,
    userId: params.userId,
    sourceKey: params.sourceKey,
    status: "queued",
    createdAt: new Date(),
  });

  // Fire & forget (or queue it in Bull/Rabbit/etc)
  process.nextTick(async () => {
    let tmpPath;
    try {
      tmpPath = join(tmpdir(), `${randomUUID()}.jpg`);
      await writeFile(tmpPath, params.buffer);

      // 1) OCR (Tesseract, Cloud Vision, or Textract)
      const text = await runPythonOCR(tmpPath, config.defaultLang);
      // 2) Parse values
      console.log('extractedData from offline OCR: ');
      let extractedData = parseReceiptLines(text);

      // 3) chcek anomaly
      if (checkAnomaly(extractedData)) {
        console.warn(`Anomaly detected in ${tmpPath}.`);

        // 4) Retry with AWS Textract
        const lines = await extractTextFromImage(tmpPath);

        // 5) extract with OpenAI
        extractedData = await extractReceiptWithOpenAI(lines);
      }

      // rows.push([date || '', '', description || '', '', '', '', '', '', '', total || '', '', '', '']);
      if (tmpPath) {
        await unlink(tmpPath).catch(() => { });
      }
      console.log('extractedData final: ', extractedData);

      await JobModel.updateOne({ jobId }, {
        status: "done",
        receipt: extractedData,
        finishedAt: new Date(),
      });
      console.log('finished processing file: ', tmpPath);
      // await jobsRepo.update(jobId, { status: "done", receipt, finishedAt: new Date() });
    } catch (err: any) {
      if (tmpPath) {
        await unlink(tmpPath).catch(() => { });
      }
      await JobModel.updateOne({ jobId }, {
        status: "error",
        error: err.message,
      });      // Log error
      console.error("Job error:", jobId, err);
    }
  });
  return { jobId };

}
