import { Router } from 'express';
import multer from 'multer';
import { v4 as uuidv4 } from 'uuid';
import fs from 'fs';
import config from '../configs/config';
import { processJob, jobStore, processJobWithRows } from '../services/jobProcessor';
import runPythonOCR from '../services/tesseractRunner';
import { receiptRegexConfig } from '../configs/receiptConfig'; // Konfigürasyonu import et
import {
  parseBusinessName,
  parseTransactionDate,
  parseReceiptNumber,
  parseProducts,
  parseKdvAmount,
  parseTotalAmount,
  parseTransactionType,
  parsePaymentType,
  isMatching,
  normalizeAmounts,
  extractAmountsFromLines
} from '../utils/receiptParser'; // Ayrıştırma metodlarını import et
import { Product, KDVInfo, ReceiptData } from '../types/receiptTypes';
import { callGoogleVisionOCR, callGoogleVisionOCRLineJoined } from '../services/googleVisionService';
import { checkAnomaly } from '../utils/checkAnomaly';
import { extractValueNearLabel, extractKdvRate } from '../utils/receiptValueExtractor';
import { fuzzyFind } from '../utils/fuzzySearch';
import { extractTextFromImage } from '../services/awsTextractService';
import { extractReceiptWithOpenAI } from '../services/openaiToReceiptDataService';

const upload = multer({ dest: config.uploadDir });
const router = Router();

// Referans kelimeler (template1 keywords)
const fuzzyKdvKeywords = [
  'toplam kdv',
  'kdv',
];

// Referans kelimeler (template1 keywords)
const fuzzyTotalKeywords = [
  'genel toplam',
  'toplam tutar',
  'toplam',
];

/**
 * @swagger
 * /upload:
 *   post:
 *     summary: Upload multiple receipt images and generate a single Excel file
 *     tags: [Upload]
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               receipts:
 *                 type: array
 *                 items:
 *                   type: string
 *                   format: binary
 *                 description: One or more receipt image files
 *     responses:
 *       200:
 *         description: Returns a single jobId for the batch
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 jobId:
 *                   type: string
 *                 message:
 *                   type: string
 *       400:
 *         description: No files uploaded
 */
router.post('/', upload.array('receipts'), async (req, res) => {
  const files = req.files as Express.Multer.File[];

  if (!files || files.length === 0) {
    res.status(400).json({ error: 'No files uploaded' });
    return;
  }

  const jobId = uuidv4();
  const rows: any[] = [];

  for (const file of files) {
    console.log('started processing file: ', file.filename);
    const extractedData: ReceiptData = {
      businessName: null,
      transactionDate: null,
      receiptNumber: null,
      products: [],
      kdvAmount: null,
      totalAmount: null,
      transactionType: null,
      paymentType: null
    };

    try {
      // const rawText = await runPythonOCR(file.path, config.defaultLang);
      // parse receipt lines offline
      // parseReceiptLines(rawText, extractedData);

      console.log('extractedData from offline OCR: ');
      console.log(extractedData);

      // Step 5 – Anomaly check & Cloud Vision fallback
      if (checkAnomaly(extractedData)) {
        console.warn(`Anomaly detected in ${file.originalname}. Retrying with AWS Textract OCR...`);
        const lines = await extractTextFromImage(file.path);
        console.log(lines);

        // `lines` = your AWS Textract lines (string[])
        const openAiExtData = await extractReceiptWithOpenAI(lines);
        console.log('extractedData from Open Ai Prompt: ');
        console.log(openAiExtData);
      }

      // rows.push([date || '', '', description || '', '', '', '', '', '', '', total || '', '', '', '']);
      fs.unlink(file.path, () => { });
      console.log('finished processing file: ', file.filename)
    } catch (err) {
      console.error('OCR failed for one file:', err);
      fs.unlink(file.path, () => { });
    }
  }

  jobStore[jobId] = { status: 'pending', rows };
  // setImmediate(() => processJobWithRows(jobId, rows));

  res.json({ jobId, message: 'Batch processing started' });
});

function parseReceiptLines(rawText: string, extractedData: ReceiptData) {
  const lines = rawText.split('\n').map((l: string) => l.trim()).filter(Boolean);

  for (const line of lines) {
    console.log('line: ', line);
    const lowerLine = line.toLocaleLowerCase();

    // Firma Adı
    if (extractedData.businessName == null && isMatching(lowerLine, receiptRegexConfig.businessNameIndicators)) {
      extractedData.businessName = parseBusinessName(lines, receiptRegexConfig);
    }

    // Tarih
    if (extractedData.transactionDate == null && isMatching(line, receiptRegexConfig.datePatterns)) {
      extractedData.transactionDate = parseTransactionDate(line, receiptRegexConfig);
    }

    // Fiş No
    if (extractedData.receiptNumber == null && isMatching(line, receiptRegexConfig.receiptNoPatterns)) {
      extractedData.receiptNumber = parseReceiptNumber(line, receiptRegexConfig);
    }

    // Kdv Tutarı
    // if (extractedData.kdvAmount == null && isMatching(line, receiptRegexConfig.kdvPatterns)) {
    if (!extractedData.kdvAmount && fuzzyFind(lowerLine, fuzzyKdvKeywords, config.fuzzyThreshold)) {
      const normalized = normalizeAmounts(line);
      extractedData.kdvAmount = parseKdvAmount(normalized, receiptRegexConfig);
    }

    // Toplam Tutar
    // if (extractedData.totalAmount == null && isMatching(line, receiptRegexConfig.totalPatterns)) {
    if (!extractedData.totalAmount && fuzzyFind(lowerLine, fuzzyTotalKeywords, config.fuzzyThreshold)) {
      const normalized = normalizeAmounts(line);
      console.log('normalized: ', normalized);
      extractedData.totalAmount = parseTotalAmount(normalized, receiptRegexConfig);
    }

    // İşlem Türü
    if (extractedData.transactionType == null && isMatching(line, receiptRegexConfig.transactionTypePatterns)) {
      extractedData.transactionType = parseTransactionType(line, receiptRegexConfig);
    }

    // Ödeme Şekli
    if (extractedData.paymentType == null && isMatching(line, receiptRegexConfig.paymentTypePatterns)) {
      extractedData.paymentType = parsePaymentType(line, receiptRegexConfig);
    }
  }
}

/**
 * Ham OCR metninden fiş bilgilerini ayrıştırır.
 * Bu fonksiyon, Python'daki extract_info_from_receipt metodunun mantığını içerir.
 */
function extractReceiptInfo(rawText: string): ReceiptData {
  const lines = rawText.split('\n'); // Tüm parser'lar için bir kez parçala

  const extractedData: ReceiptData = {
    businessName: parseBusinessName(lines, receiptRegexConfig),
    transactionDate: parseTransactionDate(rawText, receiptRegexConfig),
    receiptNumber: parseReceiptNumber(rawText, receiptRegexConfig),
    products: parseProducts(lines, receiptRegexConfig),
    kdvAmount: parseKdvAmount(rawText, receiptRegexConfig),
    totalAmount: parseTotalAmount(rawText, receiptRegexConfig),
    transactionType: parseTransactionType(rawText, receiptRegexConfig),
    paymentType: parsePaymentType(rawText, receiptRegexConfig)
  };

  return extractedData
}

export default router;