import OpenAI from "openai";
import { ReceiptData } from "../types/receiptTypes";
import { parseCurrency, parsePercent } from "../utils/parserHelpers";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

function toNullableString(value: unknown): string | null {
  if (value === null || typeof value === "undefined") return null;
  const normalized = String(value).trim();
  return normalized ? normalized : null;
}

export async function extractReceiptWithOpenAI(lines: string[]): Promise<ReceiptData> {
  console.log('extractedData from OpenAI');

  const text = lines.join("\n");

  const prompt = `
Sen bir fiş/fatura metni yorumlayıcısısın. Aşağıdaki metni incele ve yalnızca JSON formatında yanıt ver.
Kurallar:
1. Alanlar: firmaAd, fisNo, tutar, kdv, kdvOran, islemTarihi, islemTuru, odemeTuru, firmaVN
2. Toplam tutar ve kdv tutarı değerleri Türk Lirası formatında olmalı (örn: "1.234,56")
3. İşlem tarihi formatı dd.mm.yyyy olmalı
4. İşlem tipi yalnızca şu değerlerden biri olabilir: "ALIŞVERİŞ", "YEMEK", "AKARYAKIT", "OTOPARK", "ELEKTRONİK", "İLAÇ", "KIRTASİYE", "DİĞER"
5. Ödeme tipi yalnızca şu değerlerden biri olabilir: "Kredi Kartı", "Nakit", "Mobil Ödeme", "Diğer"
6. Alan adları çift tırnak içinde olmalı. 
7. VN (vergi numarası) Metinde "V.N.", "V.D.", "VN" değerlerinden sonra gelir. Alan varsa, sadece rakamlardan oluşan 10 veya 11 haneli bir sayı olmalı (örn: "1234567890"). Eğer yoksa null olarak bırak.
JSON dışında hiçbir şey yazma.

Metin:
${text}
`;

  console.log('OpenAI Prompt is ', prompt);

  const completion = await openai.responses.create({
    model: "gpt-4.1-mini",
    input: prompt
  });

  let raw = completion.output_text.trim();

  // JSON olmayan kısımları temizle
  raw = raw.replace(/```json|```/g, "").trim();

  let ai: any;
  try {
    ai = JSON.parse(raw);
  } catch (e) {
    console.error("AI JSON parse error:", raw);
    throw e;
  }

  const result = {
    businessName: toNullableString(ai.firmaAd),
    businessTaxNo: toNullableString(ai.firmaVN),
    transactionDate: toNullableString(ai.islemTarihi),
    receiptNumber: toNullableString(ai.fisNo),
    products: [],
    kdvAmount: ai.kdv ? parseCurrency(ai.kdv) : null,
    totalAmount: ai.tutar ? parseCurrency(ai.tutar) : null,
    transactionType: ai.islemTuru
      ? { type: toNullableString(ai.islemTuru) ?? "DİĞER", kdvRate: parsePercent(ai.kdvOran) }
      : null,
    paymentType: toNullableString(ai.odemeTuru),
  };
  console.log('OpenAI extracted result: ', result);
  return result;
}
