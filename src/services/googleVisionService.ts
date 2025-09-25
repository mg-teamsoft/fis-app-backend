import vision from '@google-cloud/vision';

const client = new vision.ImageAnnotatorClient();

export async function callGoogleVisionOCR(imagePath: string): Promise<string> {
  const [result] = await client.textDetection(imagePath);
  const detections = result.textAnnotations;
  return detections?.[0]?.description || '';
}