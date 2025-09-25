import fs from 'fs';
import path from 'path';
import ExcelJS from 'exceljs';
import * as XLSX from 'xlsx';
import { ReceiptData } from '../types/receiptTypes';

const OUTPUT_DIR = path.join(process.cwd(), 'output');
const SHEET_NAME = 'Receipts';

function ensureOutputDir() {
  if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

function receiptToRow(receipt: ReceiptData) {
  return [
    receipt.businessName ?? '',
    receipt.transactionDate ?? '',
    receipt.receiptNumber ?? '',
    receipt.kdvAmount ?? '',
    receipt.totalAmount ?? '',
    receipt.transactionType ? `${receipt.transactionType.type}` : '',
    receipt.transactionType ? `${receipt.transactionType.kdvRate}` : '',
    receipt.paymentType ?? ''
  ];
}

export async function writeReceiptToExcel(receipt: ReceiptData): Promise<{ filePath: string }> {
    ensureOutputDir();

    const now = new Date();
    const monthYear = `${String(now.getMonth() + 1).padStart(2, '0')}${now.getFullYear()}`;
    const fileName = `receipts_${monthYear}.xlsx`;
    const absolutePath = path.join(OUTPUT_DIR, fileName);

    let worksheet: XLSX.WorkSheet;
    let workbook: XLSX.WorkBook;

    // If file exists → load and append
    if (fs.existsSync(absolutePath)) {
      workbook = XLSX.readFile(absolutePath);
      worksheet = workbook.Sheets[workbook.SheetNames[0]];
      const data = XLSX.utils.sheet_to_json<any[]>(worksheet, { header: 1 });
      data.push(receiptToRow(receipt));
      const updatedSheet = XLSX.utils.aoa_to_sheet(data);
      workbook.Sheets[workbook.SheetNames[0]] = updatedSheet;
    } else {
      // Create new workbook
      const headers = [
        'Firma Adı',
        'İşlem Tarihi',
        'Fiş No',
        'KDV Tutarı',
        'Toplam Tutar',
        'Harcama Türü',
        'KDV Oranı (%)',
        'Ödeme Tipi'
      ];
      const rows = [headers, receiptToRow(receipt)];
      worksheet = XLSX.utils.aoa_to_sheet(rows);
      workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, SHEET_NAME);
    }

    await XLSX.writeFile(workbook, absolutePath);
    return { filePath: absolutePath };
}