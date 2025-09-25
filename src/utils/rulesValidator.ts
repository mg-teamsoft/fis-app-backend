import { ReceiptData } from "../types/receiptTypes";
import { UserRulesModel } from "../models/UserRules";

/** Convert "2.129,00" | number -> number */
function toNumber(val: string | number | null | undefined): number | null {
    if (val === null || val === undefined || val === "") return null;
    if (typeof val === "number") return Number.isFinite(val) ? val : null;
    const cleaned = val.replace(/\./g, "").replace(",", ".");
    const num = Number(cleaned);
    return Number.isFinite(num) ? num : null;
}

export type RuleCheckResult =
    | { ok: true }
    | { ok: false; reason: string };

/**
 * Apply user rules to a receipt.
 * Supported keys (from your examples):
 * - MIN_AMOUNT_LIMIT (number)
 * - MAX_AMOUNT_LIMIT (number)
 * - TRANSACTION_TYPE_EXCLUDE_LIST (CSV string, e.g. "İLAÇ,YİYECEK")
 */
export function validateReceiptWithRules(
    receipt: ReceiptData,
    rules: Record<string, any> | null | undefined
): RuleCheckResult {
    if (!rules) return { ok: true }; // no rules => allow

    const total = toNumber(receipt.totalAmount);
    const txType = receipt.transactionType?.type?.trim() || "";

    // MIN_AMOUNT_LIMIT
    if (typeof rules.MIN_AMOUNT_LIMIT === "number" && total !== null) {
        if (total < rules.MIN_AMOUNT_LIMIT) {
            return {
                ok: false,
                reason: `Rule MIN_AMOUNT_LIMIT violated: totalAmount ${total} < ${rules.MIN_AMOUNT_LIMIT}`,
            };
        }
    }

    // MAX_AMOUNT_LIMIT
    if (typeof rules.MAX_AMOUNT_LIMIT === "number" && total !== null) {
        if (total > rules.MAX_AMOUNT_LIMIT) {
            return {
                ok: false,
                reason: `Rule MAX_AMOUNT_LIMIT violated: totalAmount ${total} > ${rules.MAX_AMOUNT_LIMIT}`,
            };
        }
    }

    // TRANSACTION_TYPE_EXCLUDE_LIST (CSV → array)
    if (typeof rules.TRANSACTION_TYPE_EXCLUDE_LIST === "string" && txType) {
        const list = rules.TRANSACTION_TYPE_EXCLUDE_LIST
            .split(",")
            .map(s => s.trim())
            .filter(Boolean);

        // Case-insensitive compare but keep Turkish chars
        const found = list.some(item => item.localeCompare(txType, "tr", { sensitivity: "accent" }) === 0);
        if (found) {
            return {
                ok: false,
                reason: `Rule TRANSACTION_TYPE_EXCLUDE_LIST violated: "${txType}" is excluded`,
            };
        }
    }

    return { ok: true };
}

/** Fetch rules doc by userId and validate */
export async function validateByUserId(
    userId: string,
    receipt: ReceiptData
): Promise<RuleCheckResult> {
    const doc = await UserRulesModel.findOne({ userId });
    const rules = doc?.rules ?? null; // we saved parsed JSON alongside rulesString
    return validateReceiptWithRules(receipt, rules);
}