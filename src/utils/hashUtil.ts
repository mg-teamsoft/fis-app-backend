// src/utils/hashUtil.ts
export function normalizeSha256(input: string): string {
  // Accept hex or base64 from clients; store hex lowercase
  const hexRegex = /^[0-9a-fA-F]{64}$/;
  if (hexRegex.test(input)) return input.toLowerCase();
  // If base64 was sent, convert to hex
  const buf = Buffer.from(input, "base64");
  return buf.toString("hex");
}

// src/utils/s3Key.ts
export function buildDeterministicKey({
  userId,
  sha256Hex,
  ext = "jpg",
}: { userId: string; sha256Hex: string; ext?: string }) {
  // You can dedupe across all users (omit userId) or per user. Here we keep per user.
  // Example: receipts/images/<userId>/<yyyy>/<sha256>.jpg
  const now = new Date();
  const yyyy = now.getFullYear();
  return `receipts/images/${userId}/${yyyy}/${sha256Hex}.${ext}`;
}