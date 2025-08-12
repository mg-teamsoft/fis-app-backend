// services/textractService.ts
import {
  TextractClient,
  DetectDocumentTextCommand,
} from '@aws-sdk/client-textract';
import { readFileSync } from 'fs';

const client = new TextractClient({ region: 'eu-central-1' }); // choose your region

export async function extractTextFromImage(imagePath: string): Promise<string[]> {
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

  return lines;
}