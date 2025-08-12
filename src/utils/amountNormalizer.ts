export function normalizeAmount(text: string): number | null {
  const cleaned = text
    .replace(/[^\d,\.]/g, '') // Remove everything except digits, comma, and dot
    .replace(/\.(?=\d{3})/g, '') // Remove thousands separators (e.g. 1.000,00)
    .replace(',', '.'); // Convert decimal comma to dot

  const parsed = parseFloat(cleaned);
  return isNaN(parsed) ? null : parsed;
}