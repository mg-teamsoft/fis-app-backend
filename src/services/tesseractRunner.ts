// src/services/terresactRunner.ts
import { execFile } from 'child_process';
import path from 'path';

function runPythonOCR(imagePath: string, lang: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const scriptPath = path.join(__dirname, '../scripts/tesseract.py');

    execFile('python3', [scriptPath, '-i', imagePath, '-l', lang], (error, stdout, stderr) => {
      if (error) {
        console.error('Python OCR error:', stderr);
        reject(stderr || error.message);
      } else {
        console.log("Python stdout:", stdout); // 🐞 debug line

        resolve(stdout.trim());
      }
    });
  });
}

export default runPythonOCR;
