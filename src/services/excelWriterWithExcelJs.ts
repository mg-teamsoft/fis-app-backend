// src/services/excelWriter.ts
import fs from "fs";
import path from "path";
import ExcelJS from "exceljs";
import { ReceiptData } from "../types/receiptTypes";
import { buildUserExcelKey } from "../utils/excelKey";
import { createPresignedGetUrl, getObjectBufferAsU8, uploadBufferToS3 } from "./s3Service";
import { ExcelFileModel } from "../models/ExcelFileModel";
import { monthNameTr } from "../utils/dateUtil";

const OUTPUT_DIR = path.join(process.cwd(), "output");
const FILE_EXT = "Fis_Listesi.xlsx";

function sheetNameFor(d = new Date()): string {
    const yy = String(d.getFullYear()).slice(-2);
    return `${monthNameTr(d)} ${yy}`; // e.g. "Ağustos 25"
}

// ---- File name ----
function fileNameFor(fullName: string): string {
    return `${fullName}-${FILE_EXT}`;
}
function filePathFor(fullName: string, userId: string): string {
    const userDir = ensureOutputDir(userId);
    return path.join(userDir, fileNameFor(fullName));
}

const HEADERS = [
    "Şirket Adı",
    "İşlem Tarihi",
    "Fiş No",
    "KDV Tutarı",
    "Toplam Tutar",
    "KDV Oranı (%)",
    "İşlem Tipi",
    "Ödeme Tipi",
] as const;

function monthYear(): string {
    const now = new Date();
    return `${String(now.getMonth() + 1).padStart(2, "0")}${now.getFullYear()}`; // MMYYYY
}

function monthlyFilePath(): string {
    return path.join(OUTPUT_DIR, `receipts_${monthYear()}.xlsx`);
}

function ensureOutputDir(userId?: string): string {
    if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true });
    if (!userId) return OUTPUT_DIR;
    const userDir = path.join(OUTPUT_DIR, userId);
    if (!fs.existsSync(userDir)) fs.mkdirSync(userDir, { recursive: true });
    return userDir;
}

// add this helper
function toNumber2(val: string | number | null | undefined): number | '' {
    if (val === null || val === undefined || val === '') return '';
    let n: number;
    if (typeof val === 'string') {
        // handle TR format "1.234,56" → 1234.56
        const cleaned = val.replace(/\./g, '').replace(',', '.');
        n = Number(cleaned);
    } else {
        n = val;
    }
    if (!Number.isFinite(n)) return '';
    return Number(n.toFixed(2)); // ensure exactly 2 decimals
}

function toRowArray(r: ReceiptData): (string | number)[] {
    return [
        r.businessName ?? "",
        r.transactionDate ?? "",
        r.receiptNumber ?? "",
        toNumber2(r.kdvAmount),
        toNumber2(r.totalAmount),
        r.transactionType?.type ?? "",
        r.transactionType?.kdvRate ?? "",
        r.paymentType ?? "",
    ];
}

function autoFitColumns(ws: ExcelJS.Worksheet, min = 10, max = 60) {
    ws.columns?.forEach((col) => {
        if (!col) return;
        let maxLength = 0;
        col.eachCell?.({ includeEmpty: true }, (cell) => {
            const v = cell.value;
            const s =
                v == null ? "" :
                    typeof v === "object" && "richText" in (v as any)
                        ? (v as any).richText.map((t: any) => t.text).join("")
                        : String(v);
            maxLength = Math.max(maxLength, s.length);
        });
        col.width = Math.min(max, Math.max(min, maxLength + 2));
    });
}

function formatLastRow(ws: ExcelJS.Worksheet) {
    const last = ws.lastRow;
    if (!last) return;
    // Wrap products column (I)
    ws.getCell(`I${last.number}`).alignment = { wrapText: true, vertical: "top" };
    // Right align and format numeric columns
    const d = ws.getCell(`D${last.number}`); // KDV
    const e = ws.getCell(`E${last.number}`); // Total
    const g = ws.getCell(`G${last.number}`); // KDV Rate
    d.numFmt = "#.##0,00";
    e.numFmt = "#.##0,00";
    g.numFmt = "0";
    [d, e, g].forEach((c) => (c.alignment = { horizontal: "right" }));
}

function enrichReceiptData(receipt: ReceiptData): void {
    // Ensure numbers
    const total = receipt.totalAmount;
    const kdv = receipt.kdvAmount;
    const rate = receipt.transactionType?.kdvRate ?? null;

    // Rule 1: If kdvAmount is missing but kdvRate exists
    if ((kdv === null || kdv === undefined) && rate !== null) {
        if (total !== null && total !== undefined) {
            receipt.kdvAmount = Number(
                (total - (total / (1 + rate / 100))).toFixed(2)
            );
        }
    }

    // Rule 2: If kdvRate is missing but kdvAmount exists
    if ((rate === null || rate === undefined) && kdv !== null) {
        if (total !== null && total !== undefined && total !== 0) {
            const calcRate = (kdv * 100) / total;
            const nearest = [1, 10, 20].reduce((prev, curr) =>
                Math.abs(curr - calcRate) < Math.abs(prev - calcRate) ? curr : prev
            );

            if (!receipt.transactionType) {
                receipt.transactionType = { kdvRate: nearest } as any;
            } else {
                receipt.transactionType.kdvRate = nearest;
            }
        }
    }

    // Update totalAmount as number with 2 decimals if string
    if (total !== null && total !== undefined) {
        receipt.totalAmount = Number(total.toFixed(2));
    }
    if (kdv !== null && kdv !== undefined) {
        receipt.kdvAmount = Number(kdv.toFixed(2));
    }
}

function setHeadersIfNew(ws: ExcelJS.Worksheet) {
    if (ws.rowCount >= 3) return; // already has title/period/headers
    const headerRowIndex = 3;
    ws.getRow(headerRowIndex).values = [...HEADERS];
    ws.getRow(headerRowIndex).font = { bold: true };
    ws.views = [{ state: "frozen", ySplit: headerRowIndex }]; // freeze above data
    ensureColumnStyles(ws);
}

function setTitleAndPeriodIfNew(ws: ExcelJS.Worksheet, fullname: string, d = new Date()) {
    if (ws.getCell("A1").value || ws.getCell("A2").value) return;
    const { title, period } = headerTexts(fullname, d);
    ws.getCell("A1").value = title;
    ws.getCell("A2").value = period;
}

// ---- Header/title helpers ----
function headerTexts(fullname: string, d = new Date()) {
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const lastD = String(new Date(yyyy, d.getMonth() + 1, 0).getDate()).padStart(2, "0");
    const title = `${fullname} - ${yyyy}/${mm} DÖNEM FİŞ LİSTESİ`;
    const period = `01/${mm}/${yyyy}--${lastD}/${mm}/${yyyy}`;
    return { title, period };
}

function ensureColumnStyles(ws: ExcelJS.Worksheet) {
    // set widths & numeric formats (US-style codes; Excel shows locale)
    ws.getColumn(1).width = 30;
    ws.getColumn(2).width = 20;
    ws.getColumn(3).width = 18;
    ws.getColumn(4).width = 15; ws.getColumn(4).numFmt = "#,##0.00"; // KDV
    ws.getColumn(5).width = 15; ws.getColumn(5).numFmt = "#,##0.00"; // Total
    ws.getColumn(6).width = 18;
    ws.getColumn(7).width = 12; ws.getColumn(7).numFmt = "0";       // KDV rate
    ws.getColumn(8).width = 14;
    ws.getColumn(9).width = 50;
}

export async function writeReceiptToS3WithMonthlySheets(
    userId: string,
    fullname: string,
    receipt: ReceiptData,
    presignTtlSec?: number,    // 900 by default
    useSSE?: boolean,
): Promise<{
    status: "success" | "error";
    message: string;
    filePath?: string;
    sheet?: string;
    row?: number;
}> {
    try {
        const at = new Date();
        const filePath = filePathFor(fullname, userId);
        const key = buildUserExcelKey(userId, fullname);

        const wb = new ExcelJS.Workbook();

        // Try to load existing workbook from S3
        let loadedExisting = false;
        try {
            const body: Uint8Array = await getObjectBufferAsU8(key);

            await wb.xlsx.load(toArrayBufferStrict(body));  // <- normalized ArrayBuffer
            loadedExisting = true;
        } catch (err) {
            // ignore, will create new
            console.log("No existing workbook in S3, will create new.");
        }

        const sheetName = sheetNameFor(at);
        let ws = wb.getWorksheet(sheetName);
        if (!ws) {
            ws = wb.addWorksheet(sheetName);
            setTitleAndPeriodIfNew(ws, fullname, at); // A1/A2
            setHeadersIfNew(ws);                      // row 3
        } else {
            // Make sure styles are present even on reopen
            ensureColumnStyles(ws);
        }

        // Always append as ARRAY in the same column order
        enrichReceiptData(receipt);
        const newRow = ws.addRow(toRowArray(receipt));

        // Style/fit
        //formatLastRow(ws);
        //autoFitColumns(ws);

        await wb.xlsx.writeFile(filePath);
        // Save to buffer and upload back to S3
        const buffer = await wb.xlsx.writeBuffer();
        await uploadBufferToS3({
            key,
            buffer: Buffer.from(buffer),
            contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            metadata: { userId: userId, fullName: fullname },
            sse: useSSE ? "AES256" : undefined,
        });

        // Upsert single record per user
        await ExcelFileModel.updateOne(
            { userId: userId },
            {
                $setOnInsert: {
                    userId: userId,
                    fullName: fullname,
                    s3Key: key,
                    fileName: `${fullname}-${FILE_EXT}`,
                    createdAt: new Date(),
                },
                $set: {
                    updatedAt: new Date(),
                },
                $addToSet: { sheets: sheetName },
            },
            { upsert: true }
        );

        const url = await createPresignedGetUrl(key, presignTtlSec ?? 900);

        return {
            status: "success", 
            message: "Row appended.", 
            filePath: url, 
            sheet: sheetName,      // <-- include
            row: newRow.number,
        };
    } catch (err: any) {
        // If the file is open in Excel (Windows), writeFile will fail
        const hint = err?.code === "EBUSY" || err?.code === "EPERM"
            ? " (Close the Excel file if it's open and try again.)"
            : "";
        return { status: "error", message: (err?.message || "Failed to write Excel") + hint };
    }
}

function toArrayBufferStrict(u8: Uint8Array): ArrayBuffer {
    const { buffer, byteOffset, byteLength } = u8;

    // Fast path: real ArrayBuffer → slice the exact range
    if (buffer instanceof ArrayBuffer) {
        return buffer.slice(byteOffset, byteOffset + byteLength);
    }

    // Fallback: SharedArrayBuffer (or anything ArrayBufferLike)
    // Copy into a fresh ArrayBuffer
    const ab = new ArrayBuffer(byteLength);
    new Uint8Array(ab).set(new Uint8Array(buffer as ArrayBufferLike, byteOffset, byteLength));
    return ab;
}
