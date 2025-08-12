import { ReceiptData } from '../types/receiptTypes';

/**
 * Checks if the receipt has suspicious or inconsistent financial data:
 * - totalAmount is missing or zero
 * - kdvAmount is missing, zero, or greater than totalAmount
 */
export function checkAnomaly(receipt: ReceiptData): boolean {
  const { kdvAmount, totalAmount } = receipt;
  console.log('receipt data : ', kdvAmount, totalAmount)
  
  const isTotalMissing = totalAmount === null || totalAmount === 0;
  const isKDVInvalid = kdvAmount === null || kdvAmount === 0;
  const isKDVGreaterThanTotal =
    kdvAmount !== null && totalAmount !== null && kdvAmount > totalAmount;
  
  console.log('checkAnomaly return: ', isTotalMissing || isKDVInvalid || isKDVGreaterThanTotal)

  return isTotalMissing || isKDVInvalid || isKDVGreaterThanTotal;
}