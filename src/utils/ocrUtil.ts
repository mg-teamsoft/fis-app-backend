export function cleanOcrLine(line: string): string {
  return line
    .normalize('NFKD')                    // unicode normalize
    .replace(/[\u0000-\u001F\u007F-\u009F]/g, '') // kontrol karakterlerini sil
    .replace(/[^a-zA-Z0-9şŞıİçÇöÖüÜğĞ .,:%&@()\\-]/g, '') // sadece istenen karakterleri tut
    .trim();
}

