import { describe, expect, it } from "@jest/globals";
import { mapKdvAmountToVatAmount, mapReceiptDataToReceiptModel, normalizeReceiptDataPayload } from "./receiptMapper";
import { ReceiptData } from "../types/receiptTypes";

function buildReceipt(overrides: Partial<ReceiptData> = {}): ReceiptData {
  return {
    businessName: "Test Market",
    businessTaxNo: "1234567890",
    transactionDate: "03.06.2026",
    receiptNumber: "R-001",
    products: [],
    kdvAmount: 15,
    totalAmount: 90,
    transactionType: { type: "purchase", kdvRate: 20 },
    paymentType: "credit_card",
    ...overrides,
  };
}

describe("receiptMapper", () => {
  it("maps kdvAmount to vatAmount from a plain receipt payload", () => {
    const receipt = buildReceipt({ kdvAmount: 12.5 });

    const mapped = mapReceiptDataToReceiptModel(receipt, "user-1", "");

    expect(mapped.vatAmount).toBe(12.5);
  });

  it("maps job.receipts.kdvAmount to vatAmount", () => {
    const receipt = buildReceipt({ kdvAmount: 18.75 });

    const mapped = mapReceiptDataToReceiptModel({ job: { receipts: receipt } }, "user-1", "");

    expect(mapped.vatAmount).toBe(18.75);
  });

  it("maps jobs.receipts.kdvAmount to vatAmount", () => {
    const receipt = buildReceipt({ kdvAmount: 21.4 });

    const mapped = mapReceiptDataToReceiptModel({ jobs: { receipts: receipt } }, "user-1", "");

    expect(mapped.vatAmount).toBe(21.4);
  });

  it("extracts vatAmount for the direct receipt creation path", () => {
    const receipt = buildReceipt({ kdvAmount: 37.25 });

    expect(mapKdvAmountToVatAmount({ job: { receipt } })).toBe(37.25);
  });

  it("maps receipt.kdvAmount from a job document to vatAmount", () => {
    const receipt = buildReceipt({
      kdvAmount: 163.64,
      totalAmount: 1800,
      receiptNumber: "0006",
      transactionDate: "25.04.2026",
    });

    const mapped = mapReceiptDataToReceiptModel(
      { receipt },
      "93e8a814-bb74-48c6-a014-6f9a4a28cc28",
      "",
      "receipts/images/example.jpg"
    );

    expect(mapped.vatAmount).toBe(163.64);
    expect(mapped.totalAmount).toBe(1800);
    expect(mapped.receiptNumber).toBe("0006");
  });

  it("normalizes receipts wrapper before excel write validation", () => {
    const receipt = buildReceipt({ kdvAmount: "193,55" as unknown as number });

    const normalized = normalizeReceiptDataPayload({ receipts: receipt });
    const mapped = mapReceiptDataToReceiptModel(normalized, "user-1", "");

    expect(normalized.kdvAmount).toBe("193,55");
    expect(mapped.vatAmount).toBe(193.55);
  });
});
