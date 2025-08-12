import vision from '@google-cloud/vision';
import dotenv from 'dotenv';
import { extractLinesFromAnnotations } from '../utils/reconstructVisionLines';

dotenv.config();

const client = new vision.ImageAnnotatorClient();

async function testVisionFullText() {
  const imagePath = './uploads/ok/2025-05-12_09.20.35.jpg';
  const [result] = await client.textDetection(imagePath);
  console.log('--- Full Vision API Response ---');
  console.log(JSON.stringify(result, null, 2));

  const annotations = result.textAnnotations;

  const fusedLines: string[] = extractLinesFromAnnotations(annotations as any);
  if (fusedLines) {
    console.log(fusedLines.map(line => line.trim()).filter(line => line))
  } else {
    console.log('Metin okunamadı');
  }

}

testVisionFullText().catch(console.error);