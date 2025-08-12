import * as dotenv from 'dotenv';
dotenv.config();

const config = {
  port: parseInt(process.env.PORT || '3000', 10),
  uploadDir: process.env.UPLOAD_DIR || 'uploads',
  outputDir: process.env.OUTPUT_DIR || 'output',
  defaultLang: process.env.OCR_LANG || 'tur+eng',
  fuzzyThreshold: parseFloat(process.env.THRESHOLD || '0.2'),
};

export default config;
