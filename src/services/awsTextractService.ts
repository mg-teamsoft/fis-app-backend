// services/textractService.ts
import {
  TextractClient,
  DetectDocumentTextCommand,
} from '@aws-sdk/client-textract';
import { readFile } from 'fs/promises';
import { awsConfig } from '../configs/aws';

const client = new TextractClient({ region: awsConfig.region }); // choose your region

export async function extractTextFromImage(imagePath: string): Promise<string[]> {
  return extractTextFromBuffer(await readFile(imagePath));
}

export async function extractTextFromBuffer(imageBytes: Uint8Array): Promise<string[]> {
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

  return lines;
}