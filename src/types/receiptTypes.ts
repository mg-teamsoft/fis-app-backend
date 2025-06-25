export interface Product {
    name: string;
    quantity?: number;
    unitPrice?: number;
    lineTotal: number;
}

export interface KDVInfo {
    [rate: string]: number;
}

export interface ReceiptData {
    businessName: string | null;
    transactionDate: string | null;
    receiptNumber: string | null;
    products: Product[];
    kdvAmount: number | null;
    totalAmount: number | null;
    transactionType: { type: string; kdvRate: number | null } | null;
    paymentType: number | null;
}
