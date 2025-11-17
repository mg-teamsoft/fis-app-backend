import { Router } from 'express';
import multer from 'multer';
import fs from 'fs';
import config from '../configs/config';
import runPythonOCR from '../services/tesseractRunner';
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
  extractAmountsFromLines,
  parseReceiptLines
} from '../utils/receiptParser'; // Ayrıştırma metodlarını import et
import { checkAnomaly } from '../utils/checkAnomaly';
import { extractTextFromImage } from '../services/awsTextractService';
import { extractReceiptWithOpenAI } from '../services/openaiToReceiptDataService';
import { auditInterceptor } from '../middleware/auditInterceptor';

const upload = multer({ dest: config.uploadDir });
const router = Router();

/**
 * @swagger
 * /image/upload:
 *   post:
 *     summary: Upload multiple receipt images and get parsed data immediately
 *     description: Direct upload endpoint that runs OCR + parsing synchronously (use /upload/by-key for async jobs).
 *     tags: [Upload]
 *     security:
 *       - bearerAuth: []
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
 *         description: Parsed receipt response for the uploaded images
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 response:
 *                   $ref: '#/components/schemas/ReceiptData'
 *                 message:
 *                   type: string
 *       400:
 *         description: No files uploaded
 */
router.post('/upload',
  auditInterceptor("IMAGE_UPLOAD"),
  upload.array('receipts'),
  async (req, res) => {
    const files = req.files as Express.Multer.File[];

    if (!files || files.length === 0) {
      res.status(400).json({ error: 'No files uploaded' });
      return;
    }

    for (const file of files) {
      console.log('started processing file: ', file.filename);

      try {
        const rawText = await runPythonOCR(file.path, config.defaultLang);
        // parse receipt lines offline
        console.log('extractedData from offline OCR: ');
        let extractedData = parseReceiptLines(rawText);

        // Step 5 – Anomaly check & Cloud Vision fallback
        if (checkAnomaly(extractedData)) {
          console.warn(`Anomaly detected in ${file.originalname}. Retrying with AWS Textract OCR...`);
          const lines = await extractTextFromImage(file.path);
          console.log(lines);

          // `lines` = your AWS Textract lines (string[])
          extractedData = await extractReceiptWithOpenAI(lines);
          console.log('extractedData from OpenAI Prompt: ');
          console.log(extractedData);
        }

        // rows.push([date || '', '', description || '', '', '', '', '', '', '', total || '', '', '', '']);
        fs.unlink(file.path, () => { });
        console.log('finished processing file: ', file.filename)
        res.json({ response: extractedData, message: 'SUCCESS' });
      } catch (err) {
        console.error('OCR failed for one file:', err);
        fs.unlink(file.path, () => { });
        res.json({ response: null, message: err });
      }
    }


  });

export default router;
