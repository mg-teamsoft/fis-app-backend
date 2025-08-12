import vision from '@google-cloud/vision';
import { groupTextAnnotationsByLines } from '../utils/reconstructVisionLines';

const client = new vision.ImageAnnotatorClient();

export async function callGoogleVisionOCR(imagePath: string): Promise<string> {
  const [result] = await client.textDetection(imagePath);
  const detections = result.textAnnotations;
  return detections?.[0]?.description || '';
}

export async function callGoogleVisionOCRLineJoined(imagePath: string): Promise<string[]> {
  const [result] = await client.textDetection(imagePath);
  const detections = result.textAnnotations;

  const rawText = detections?.[0]?.description || '';
  const lines = rawText.split('\n').map(line => line.trim());

  return groupTextAnnotationsByLines(lines);
}