// "2.129,00" → 2129.00
export function parseCurrency(val: string): number {
  const normalized = val.replace(/\./g, "").replace(",", ".");
  const num = parseFloat(normalized);
  return isNaN(num) ? 0 : num;
}

export function parsePercent(val?: string): number | null {
  if (!val) return null;
  const m = val.match(/(\d{1,2})/);
  return m ? Number(m[1]) : null;
}

export function parsePaymentType(val?: string): number | null {
  if (!val) return null;
  const s = val.toLowerCase();
  if (s.includes("visa") || s.includes("master") || s.includes("kredi") || s.includes("kart")) return 1;
  if (s.includes("nakit") || s.includes("cash")) return 0;
  return null;
}

export function safeJson<T>(s: string): T {
  try { return JSON.parse(s) as T; }
  catch { return {} as T; }
}

export function normalizeTransactionType(val?: string): string | null {
  if (!val) return null;
  const s = val.toLowerCase();

  if (s.includes("yemek") || s.includes("yiyecek")) return "YIYECEK";
  if (s.includes("akaryakit") || s.includes("yakıt") || s.includes("benzin") || s.includes("mazot")) return "AKARYAKIT";
  if (s.includes("otopark") || s.includes("park")) return "OTOPARK";

  // Eğer net eşleşme bulunmazsa varsayılan olarak YIYECEK döndürmek istemiyorsak null bırakıyoruz
  return null;
}