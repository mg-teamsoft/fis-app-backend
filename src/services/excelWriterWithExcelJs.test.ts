import { describe, expect, it, jest } from "@jest/globals";

jest.mock("./s3Service", () => ({
  createPresignedGetUrl: jest.fn(),
  getObjectBufferAsU8: jest.fn(),
  uploadBufferToS3: jest.fn(),
}));

import { enrichReceiptData } from "./excelWriterWithExcelJs";
import { ReceiptData } from "../types/receiptTypes";

function buildReceipt(overrides: Partial<ReceiptData> = {}): ReceiptData {
  return {
    businessName: "Test Market",
    businessTaxNo: "1234567890",
    transactionDate: "2026-04-26",
    receiptNumber: "R-001",
    products: [],
    kdvAmount: null,
    totalAmount: null,
    transactionType: null,
    paymentType: "CARD",
    ...overrides,
  };
}

describe("enrichReceiptData", () => {
  it("throws when total amount is missing or invalid", () => {
    const receipt = buildReceipt({
      totalAmount: null,
      kdvAmount: 18,
      transactionType: { type: "SALE", kdvRate: 10 },
    });

    expect(() => enrichReceiptData(receipt)).toThrow(
      "Total amount is required for Excel export and must be a valid number."
    );
  });

  it("rejects excel write when kdv amount and kdv rate are both not greater than zero", () => {
    const receipt = buildReceipt({
      totalAmount: "100,00" as unknown as number,
      kdvAmount: "0" as unknown as number,
      transactionType: { type: "SALE", kdvRate: 0 },
    });

    expect(() => enrichReceiptData(receipt)).toThrow(
      "KDV rate and KDV amount must not both be less than or equal to 0 for Excel export."
    );
  });

  it("derives kdv amount when total exists and rate is present", () => {
    const receipt = buildReceipt({
      totalAmount: "110,00" as unknown as number,
      kdvAmount: null,
      transactionType: { type: "SALE", kdvRate: 10 },
    });

    enrichReceiptData(receipt);

    expect(receipt.totalAmount).toBe(110);
    expect(receipt.kdvAmount).toBe(10);
    expect(receipt.transactionType?.kdvRate).toBe(10);
  });

  it("treats non-positive kdv amount as missing and derives it from a positive rate", () => {
    const receipt = buildReceipt({
      totalAmount: "120,00" as unknown as number,
      kdvAmount: 0,
      transactionType: { type: "SALE", kdvRate: 20 },
    });

    enrichReceiptData(receipt);

    expect(receipt.totalAmount).toBe(120);
    expect(receipt.kdvAmount).toBe(0);
    expect(receipt.transactionType?.kdvRate).toBe(20);
  });

  it("derives nearest supported kdv rate when only total and kdv amount exist", () => {
    const receipt = buildReceipt({
      totalAmount: "120,00" as unknown as number,
      kdvAmount: "20,00" as unknown as number,
      transactionType: { type: "SALE", kdvRate: null },
    });

    enrichReceiptData(receipt);

    expect(receipt.totalAmount).toBe(120);
    expect(receipt.kdvAmount).toBe(20);
    expect(receipt.transactionType?.kdvRate).toBe(20);
  });

  it("normalizes valid numeric strings to two-decimal numbers without recalculating", () => {
    const receipt = buildReceipt({
      totalAmount: "100,235" as unknown as number,
      kdvAmount: "18,499" as unknown as number,
      transactionType: { type: "SALE", kdvRate: 18 },
    });

    enrichReceiptData(receipt);

    expect(receipt.totalAmount).toBe(100.23);
    expect(receipt.kdvAmount).toBe(18.5);
    expect(receipt.transactionType?.kdvRate).toBe(18);
  });
});
