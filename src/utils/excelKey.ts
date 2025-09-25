// src/utils/excelKey.ts
export function buildUserExcelKey(userId: string, fullname: string) {
  // File name pattern: "<Firstname Lastname>-FİŞ LİSTESİ.xlsx"
  const safeName = fullname.replace(/[^\p{L}\p{N}\s\-_.]/gu, "").trim() || "Kullanici";
  const fileName = `${safeName}-Fis_Listesi.xlsx`;

  // S3 key. Keep it predictable per user; one file, many sheets inside.
  // e.g., receipts/excel/<userId>/Fis_Listesi.xlsx
  return `receipts/excel/${userId}/${fileName}`;
}