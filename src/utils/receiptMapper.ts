import { ReceiptData } from "../types/receiptTypes";

export function mapReceiptDataToReceiptModel(
  data: ReceiptData,
  userId: string,
  imageUrl: string,
  sourceKey?: string
) {
  return {
    userId,
    businessName: data.businessName ?? "Bilinmeyen Şirket",
    receiptNumber: data.receiptNumber ?? "Bilinmiyor",
    totalAmount: data.totalAmount ?? 0,
    vatAmount: data.kdvAmount ?? 0,
    vatRate: data.transactionType?.kdvRate ?? 0,
    transactionDate: parseTransactionDate(data.transactionDate) ?? new Date(),
    transactionType: data.transactionType?.type ?? "Bilinmiyor",
    paymentType: data.paymentType ?? "Bilinmiyor",
    imageUrl,
    sourceKey,
  };
}

// Optional utility to convert date string like "dd.mm.yyyy" or "yyyy-mm-dd"
function parseTransactionDate(dateStr: string | null): Date | null {
  if (!dateStr) return null;

  const trimmed = dateStr.trim();
  const dotMatch = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(trimmed);

  if (dotMatch) {
    const [, day, month, year] = dotMatch;
    return new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
  }

  const iso = new Date(trimmed);
  if (isNaN(iso.getTime())) return null;
  iso.setUTCHours(0, 0, 0, 0);
  return iso;
}
