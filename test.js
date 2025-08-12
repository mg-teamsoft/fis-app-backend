const vision = require('@google-cloud/vision');

// Make sure GOOGLE_APPLICATION_CREDENTIALS is set
const client = new vision.ImageAnnotatorClient();

async function main() {
  const [result] = await client.textDetection('./uploads/2025-06-21 16.20.35.jpg');
  console.log(result.textAnnotations?.[0]?.description || 'No text found');
}

main();