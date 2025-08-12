// npm i openai zod
import 'dotenv/config';
import OpenAI from "openai";
import { z } from "zod";

export type ParsedReceipt = {
  firmaAd: string | null;
  fisNo: string | null;        // 0015
  tutar: string | null;        // "2.129,00"
  kdv: string | null;          // "193,55"
  kdvOran: string | null;      // "%10"
  islemTarihi: string | null;  // "15.06.2025" or "2025-06-15"
  islemTuru: string | null;    // "SATIŞ", "İADE"
  odemeTuru: string | null;    // "KREDİ KARTI", "NAKİT"
};

const AmountTR = z
  .string()
  .regex(/^[0-9]{1,3}(\.[0-9]{3})*,[0-9]{2}$/, "Turkish amount like 1.234,56");

const ReceiptSchema = z.object({
  firmaAd: z.string().nullable(),
  fisNo: z.string().nullable(),
  tutar: AmountTR.nullable(),
  kdv: AmountTR.nullable(),
  kdvOran: z.string().regex(/^%\d{1,2}$/, "e.g. %10").nullable(),
  islemTarihi: z.string().nullable(),
  islemTuru: z.string().nullable(),
  odemeTuru: z.string().nullable(),
});

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });

export async function extractReceiptWithOpenAIOld(lines: string[]): Promise<ParsedReceipt> {
  const text = lines.join("\n");

  const system =
    "Aşağıdaki fiş metninden alanları çıkar ve SADECE JSON döndür. " +
    'Alanlar: firmaAd, fisNo, tutar, kdv, kdvOran, islemTarihi, islemTuru, odemeTuru. ' +
    'Rakam formatını KORU: "2.129,00" / "193,55". KDV oranını "%10" gibi döndür. Emin değilsen null kullan.';

  const completion = await client.chat.completions.create({
    model: "gpt-4o-mini", // or gpt-4o
    temperature: 0,
    response_format: { type: "json_object" }, // ✅ JSON mode works on 5.12.2
    messages: [
      { role: "system", content: system },
      { role: "user", content: `Metin (satırlar):\n${text}` },
    ],
  });

  const content = completion.choices[0]?.message?.content ?? "{}";
  let parsed: ParsedReceipt;

  try {
    const json = JSON.parse(content);
    const safe = ReceiptSchema.safeParse(json);
    if (safe.success) {
      parsed = safe.data as ParsedReceipt;
    } else {
      // If validation fails, normalize to nulls
      parsed = {
        firmaAd: json.firmaAd ?? null,
        fisNo: json.fisNo ?? null,
        tutar: json.tutar ?? null,
        kdv: json.kdv ?? null,
        kdvOran: json.kdvOran ?? null,
        islemTarihi: json.islemTarihi ?? null,
        islemTuru: json.islemTuru ?? null,
        odemeTuru: json.odemeTuru ?? null,
      };
    }
  } catch {
    parsed = {
      firmaAd: null,
      fisNo: null,
      tutar: null,
      kdv: null,
      kdvOran: null,
      islemTarihi: null,
      islemTuru: null,
      odemeTuru: null,
    };
  }

  return parsed;
}