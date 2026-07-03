import { ReceiptData } from "../types/receiptTypes";

type ReceiptPayload =
  | ReceiptData
  | {
      receipt?: ReceiptData | null;
      receipts?: ReceiptData | ReceiptData[] | null;
      job?: {
        receipt?: ReceiptData | null;
        receipts?: ReceiptData | ReceiptData[] | null;
      } | null;
      jobs?: {
        receipt?: ReceiptData | null;
        receipts?: ReceiptData | ReceiptData[] | null;
      } | null;
    };

export function normalizeReceiptDataPayload(data: ReceiptPayload): ReceiptData {
  const source: any = data;
  const candidate =
    source?.receipts ??
    source?.receipt ??
    source?.job?.receipts ??
    source?.job?.receipt ??
    source?.jobs?.receipts ??
    source?.jobs?.receipt ??
    source;

  return (Array.isArray(candidate) ? candidate[0] : candidate) as ReceiptData;
}

function toNumberOrFallback(value: unknown, fallback = 0): number {
  if (typeof value === "number") return Number.isFinite(value) ? value : fallback;
  if (typeof value !== "string") return fallback;

  const trimmed = value.trim();
  if (!trimmed) return fallback;

  const normalized = trimmed.replace(/\./g, "").replace(",", ".");
  const parsed = Number.parseFloat(normalized);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function mapKdvAmountToVatAmount(data: ReceiptPayload): number | undefined {
  const receipt = normalizeReceiptDataPayload(data);
  if (receipt?.kdvAmount === null || receipt?.kdvAmount === undefined) return undefined;
  return toNumberOrFallback(receipt.kdvAmount);
}

export function mapReceiptDataToReceiptModel(
  data: ReceiptPayload,
  userId: string,
  imageUrl: string,
  sourceKey?: string
) {
  const receipt = normalizeReceiptDataPayload(data);

  return {
    userId,
    businessName: receipt.businessName ?? "Bilinmeyen Şirket",
    businessTaxNo: receipt.businessTaxNo ?? undefined,
    receiptNumber: receipt.receiptNumber ?? "Bilinmiyor",
    totalAmount: toNumberOrFallback(receipt.totalAmount),
    vatAmount: mapKdvAmountToVatAmount(receipt) ?? 0,
    vatRate: toNumberOrFallback(receipt.transactionType?.kdvRate),
    transactionDate: parseTransactionDate(receipt.transactionDate) ?? new Date(),
    transactionType: receipt.transactionType?.type ?? "Bilinmiyor",
    paymentType: receipt.paymentType ?? "Bilinmiyor",
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
