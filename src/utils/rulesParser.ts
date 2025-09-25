/**
 * Input format example:
 * "MIN_AMOUNT_LIMIT=0;MAX_AMOUNT_LIMIT=1000;TRANSACTION_TYPE_EXCLUDE_LIST=İLAÇ,YİYECEK"
 *
 * Rules:
 * - Pairs separated by ';'
 * - Key and value separated by '='
 * - Values may contain commas (we keep them as string unless it looks numeric)
 */
export function parseRulesString(rulesString: string): Record<string, any> {
  const out: Record<string, any> = {};
  if (!rulesString || typeof rulesString !== "string") return out;

  const pairs = rulesString.split(";").map(s => s.trim()).filter(Boolean);
  for (const p of pairs) {
    const eqIdx = p.indexOf("=");
    if (eqIdx === -1) continue;
    const key = p.slice(0, eqIdx).trim();
    const valueRaw = p.slice(eqIdx + 1).trim();

    if (!key) continue;

    // Try to coerce numeric values (e.g., "1000" -> 1000)
    if (/^-?\d+(\.\d+)?$/.test(valueRaw)) {
      out[key] = Number(valueRaw);
      continue;
    }

    // Otherwise keep as string (including comma-separated lists)
    out[key] = valueRaw;
  }
  return out;
}