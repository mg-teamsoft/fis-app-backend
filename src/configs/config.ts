import * as dotenv from 'dotenv';
dotenv.config();

const config = {
  frontendUrl: process.env.FRONTEND_URL || 'http://localhost:3000',
  baseUrl: process.env.BASE_URL || 'http://localhost',
  port: parseInt(process.env.PORT || '3000', 10),
  uploadDir: process.env.UPLOAD_DIR || 'uploads',
  outputDir: process.env.OUTPUT_DIR || 'output',
  defaultLang: process.env.OCR_LANG || 'tur+eng',
  fuzzyThreshold: parseFloat(process.env.THRESHOLD || '0.2'),
  monthlyLimitFallback: parseFloat(process.env.MONTHLY_LIMIT_FALLBACK || '20000'),
};

export default config;
