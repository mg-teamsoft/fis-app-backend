import { beforeEach, describe, expect, it, jest } from '@jest/globals';

jest.mock('./awsTextractService', () => ({ extractTextFromBuffer: jest.fn() }));
jest.mock('./openaiToReceiptDataService', () => ({ extractReceiptWithOpenAI: jest.fn() }));
jest.mock('./s3Service', () => ({ getObjectBuffer: jest.fn() }));
jest.mock('../models/JobModel', () => ({ JobModel: { create: jest.fn(), updateOne: jest.fn() } }));
import { startJobFromKey } from './jobProcessor';
import { getObjectBuffer } from './s3Service';
import { extractTextFromBuffer } from './awsTextractService';
import { extractReceiptWithOpenAI } from './openaiToReceiptDataService';
import { JobModel } from '../models/JobModel';
import { ReceiptData } from '../types/receiptTypes';

const receipt: ReceiptData = {
  businessName: 'Market', businessTaxNo: null, transactionDate: null,
  receiptNumber: null, products: [], totalAmount: 100, kdvAmount: 10,
  transactionType: null, paymentType: null,
};
const flush = () => new Promise(resolve => setImmediate(resolve));
const params = { userId: 'user', sourceKey: 'receipt.jpg', mime: 'image/jpeg' };

beforeEach(() => {
  jest.resetAllMocks();
  jest.mocked(getObjectBuffer).mockResolvedValue(Buffer.from('jpeg'));
  jest.mocked(extractTextFromBuffer).mockResolvedValue(['TOTAL 100']);
  jest.mocked(extractReceiptWithOpenAI).mockResolvedValue(receipt);
});

describe('Textract → OpenAI jobs', () => {
  it.each([false, true])('always runs both services and persists needsReview=%s', async needsReview => {
    jest.mocked(extractReceiptWithOpenAI).mockResolvedValue({ ...receipt, kdvAmount: needsReview ? null : 10 });
    const { jobId } = await startJobFromKey(params);
    await flush();
    expect(extractTextFromBuffer).toHaveBeenCalledWith(Buffer.from('jpeg'));
    expect(extractReceiptWithOpenAI).toHaveBeenCalledWith(['TOTAL 100'], { jobId });
    expect(JobModel.updateOne).toHaveBeenCalledWith({ jobId }, expect.objectContaining({ status: 'processing' }));
    expect(JobModel.updateOne).toHaveBeenCalledWith({ jobId }, expect.objectContaining({ status: 'done', needsReview }));
  });

  it.each(['s3', 'textract', 'openai'])('persists %s failures without completing the job', async stage => {
    const error = new Error(`${stage} failed`);
    if (stage === 's3') jest.mocked(getObjectBuffer).mockRejectedValue(error);
    if (stage === 'textract') jest.mocked(extractTextFromBuffer).mockRejectedValue(error);
    if (stage === 'openai') jest.mocked(extractReceiptWithOpenAI).mockRejectedValue(error);
    const { jobId } = await startJobFromKey(params);
    await flush();
    expect(JobModel.updateOne).toHaveBeenCalledWith({ jobId }, expect.objectContaining({ status: 'error', error: error.message, finishedAt: expect.any(Date) }));
    expect(JobModel.updateOne).not.toHaveBeenCalledWith({ jobId }, expect.objectContaining({ status: 'done' }));
    if (stage !== 'openai') expect(extractReceiptWithOpenAI).not.toHaveBeenCalled();
  });
});
