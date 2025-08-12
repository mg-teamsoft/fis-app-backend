import vision from '@google-cloud/vision';
import dotenv from 'dotenv';
dotenv.config();

const client = new vision.ImageAnnotatorClient();

async function testOCR() {
  const imagePath = './uploads/ok/2025-05-12_09.20.35.jpg';
  const [result] = await client.textDetection(imagePath);
  const detections = result.textAnnotations;

  if (!detections || detections.length === 0) {
    console.log('❌ No text detected');
  } else {
    console.log('✅ Text detected:\n');
    console.log(detections[0].description);
  }
}

testOCR().catch(console.error);