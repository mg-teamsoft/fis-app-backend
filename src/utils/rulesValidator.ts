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

function logRuleDebug(
    ruleName: string,
    status: "applied" | "skipped" | "violated",
    details: Record<string, unknown>
) {
    console.log(`[rulesValidator] ${ruleName} ${status}`, details);
}

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
    if (!rules) {
        console.log("[rulesValidator] validateReceiptWithRules skipped: no rules configured");
        return { ok: true }; // no rules => allow
    }

    const total = toNumber(receipt.totalAmount);
    const txType = receipt.transactionType?.type?.trim() || "";

    console.log("[rulesValidator] validateReceiptWithRules started", {
        rules,
        receipt: {
            businessName: receipt.businessName,
            receiptNumber: receipt.receiptNumber,
            totalAmount: receipt.totalAmount,
            parsedTotalAmount: total,
            transactionType: txType,
        },
    });

    // MIN_AMOUNT_LIMIT
    if (typeof rules.MIN_AMOUNT_LIMIT === "number" && total !== null) {
        if (total < rules.MIN_AMOUNT_LIMIT) {
            logRuleDebug("MIN_AMOUNT_LIMIT", "violated", {
                totalAmount: total,
                limit: rules.MIN_AMOUNT_LIMIT,
            });
            return {
                ok: false,
                reason: `Rule MIN_AMOUNT_LIMIT violated: totalAmount ${total} < ${rules.MIN_AMOUNT_LIMIT}`,
            };
        }
        logRuleDebug("MIN_AMOUNT_LIMIT", "applied", {
            totalAmount: total,
            limit: rules.MIN_AMOUNT_LIMIT,
            result: "passed",
        });
    } else {
        logRuleDebug("MIN_AMOUNT_LIMIT", "skipped", {
            configuredValue: rules.MIN_AMOUNT_LIMIT,
            parsedTotalAmount: total,
            reason: typeof rules.MIN_AMOUNT_LIMIT !== "number"
                ? "rule is not configured as a number"
                : "receipt totalAmount is missing or invalid",
        });
    }

    // MAX_AMOUNT_LIMIT
    if (typeof rules.MAX_AMOUNT_LIMIT === "number" && total !== null) {
        if (total > rules.MAX_AMOUNT_LIMIT) {
            logRuleDebug("MAX_AMOUNT_LIMIT", "violated", {
                totalAmount: total,
                limit: rules.MAX_AMOUNT_LIMIT,
            });
            return {
                ok: false,
                reason: `Rule MAX_AMOUNT_LIMIT violated: totalAmount ${total} > ${rules.MAX_AMOUNT_LIMIT}`,
            };
        }
        logRuleDebug("MAX_AMOUNT_LIMIT", "applied", {
            totalAmount: total,
            limit: rules.MAX_AMOUNT_LIMIT,
            result: "passed",
        });
    } else {
        logRuleDebug("MAX_AMOUNT_LIMIT", "skipped", {
            configuredValue: rules.MAX_AMOUNT_LIMIT,
            parsedTotalAmount: total,
            reason: typeof rules.MAX_AMOUNT_LIMIT !== "number"
                ? "rule is not configured as a number"
                : "receipt totalAmount is missing or invalid",
        });
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
            logRuleDebug("TRANSACTION_TYPE_EXCLUDE_LIST", "violated", {
                transactionType: txType,
                excludedTypes: list,
            });
            return {
                ok: false,
                reason: `Rule TRANSACTION_TYPE_EXCLUDE_LIST violated: "${txType}" is excluded`,
            };
        }
        logRuleDebug("TRANSACTION_TYPE_EXCLUDE_LIST", "applied", {
            transactionType: txType,
            excludedTypes: list,
            result: "passed",
        });
    } else {
        logRuleDebug("TRANSACTION_TYPE_EXCLUDE_LIST", "skipped", {
            configuredValue: rules.TRANSACTION_TYPE_EXCLUDE_LIST,
            transactionType: txType,
            reason: typeof rules.TRANSACTION_TYPE_EXCLUDE_LIST !== "string"
                ? "rule is not configured as a string"
                : "receipt transactionType.type is missing",
        });
    }

    console.log("[rulesValidator] validateReceiptWithRules completed", { ok: true });
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
