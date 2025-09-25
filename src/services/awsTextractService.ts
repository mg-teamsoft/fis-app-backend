// services/textractService.ts
import {
  TextractClient,
  DetectDocumentTextCommand,
} from '@aws-sdk/client-textract';
import { readFileSync } from 'fs';
import { awsConfig } from '../configs/aws';

const client = new TextractClient({ region: awsConfig.region }); // choose your region

export async function extractTextFromImage(imagePath: string): Promise<string[]> {
  console.log('Retrying with AWS Textract OCR...');
  const imageBytes = readFileSync(imagePath);

  const command = new DetectDocumentTextCommand({
    Document: { Bytes: imageBytes },
  });

  const response = await client.send(command);

  const lines: string[] = [];
  response?.Blocks?.forEach((block) => {
    if (block.BlockType === 'LINE' && block.Text) {
      lines.push(block.Text);
    }
  });

  console.log(lines);
  return lines;
}