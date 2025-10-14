import OpenAI from "openai";
import { ReceiptData } from "../types/receiptTypes";
import { parseCurrency, parsePercent, parsePaymentType } from "../utils/parserHelpers";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export async function extractReceiptWithOpenAI(lines: string[]): Promise<ReceiptData> {
  console.log('extractedData from OpenAI');

  const text = lines.join("\n");

  const prompt = `
Sen bir fiş/fatura metni yorumlayıcısısın. Aşağıdaki metni incele ve yalnızca JSON formatında yanıt ver.
Kurallar:
1. Alanlar: firmaAd, fisNo, tutar, kdv, kdvOran, islemTarihi, islemTuru, odemeTuru
2. tutar ve kdv değerleri Türk Lirası formatında olmalı (örn: "1.234,56")
3. islemTarihi formatı dd.mm.yyyy olmalı
4. islemTuru yalnızca şu beş değerden biri olmalı: "YİYECEK", "YEMEK", "AKARYAKIT", "OTOPARK", "ELEKTRONİK", "İLAÇ", "KIRTASİYE"
5. Alan adları çift tırnak içinde olmalı, JSON dışında hiçbir şey yazma.

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
    businessName: ai.firmaAd?.trim() || null,
    transactionDate: ai.islemTarihi?.trim() || null,
    receiptNumber: ai.fisNo?.trim() || null,
    products: [],
    kdvAmount: ai.kdv ? parseCurrency(ai.kdv) : null,
    totalAmount: ai.tutar ? parseCurrency(ai.tutar) : null,
    transactionType: ai.islemTuru
      ? { type: ai.islemTuru, kdvRate: parsePercent(ai.kdvOran) }
      : null,
    paymentType: parsePaymentType(ai.odemeTuru),
  };
  console.log('OpenAI extracted result: ', result);
  return result
}