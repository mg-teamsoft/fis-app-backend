// src/services/jobProcessor.ts
import XLSX from 'xlsx';
import fs from 'fs';
import path from 'path';
import config from '../configs/config';

export const jobStore: Record<string, any> = {};

export function processJob(job: any) {
  try {
    const worksheetData = [
      ['Tarih', 'Ürün', 'Tutar'],
      ...job.products.map((p: any) => [job.date, p.name, p.price]),
      ['', 'TOPLAM', job.total],
    ];

    const worksheet = XLSX.utils.aoa_to_sheet(worksheetData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Fiş');

    const outputDir = path.join(__dirname, '..', '..', config.outputDir);
    if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir);

    const outputPath = path.join(outputDir, `${job.jobId}.xlsx`);
    XLSX.writeFile(workbook, outputPath);

    job.status = 'completed';
    fs.unlink(job.imagePath, () => {});
  } catch (error) {
    console.error('Excel generation failed:', error);
    job.status = 'failed';
  }
}

export function processJobWithRows(jobId: string, rows: any[][]) {
  try {
    const worksheetData = [
      ['TARİH', 'FİŞ NO', 'AÇIKLAMA', 'MATRAH', '%1 KDV', '%10 KDV', '%20 KDV', '%30 KDV', '%70 KDV', 'GENEL TOPLAM', 'KREDİ KARTI', 'KKG', 'KKEG'],
      ...rows,
    ];

    const worksheet = XLSX.utils.aoa_to_sheet(worksheetData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Fişler');

    const outputDir = path.join(__dirname, '..', '..', config.outputDir);
    if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir);

    const outputPath = path.join(outputDir, `${jobId}.xlsx`);
    XLSX.writeFile(workbook, outputPath);

    jobStore[jobId].status = 'completed';
  } catch (error) {
    console.error('Batch Excel generation failed:', error);
    jobStore[jobId].status = 'failed';
  }
}
