// src/utils/hashUtil.ts
export function normalizeSha256(input: string): string {
  // Accept hex or base64/base64url from clients; store lowercase hex.
  const value = String(input || "").trim();
  const hexRegex = /^[0-9a-fA-F]{64}$/;
  if (hexRegex.test(value)) return value.toLowerCase();

  // Normalize base64url -> base64 and restore padding.
  const base64Candidate = value.replace(/-/g, "+").replace(/_/g, "/");
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(base64Candidate)) {
    throw new Error("Invalid sha256 format");
  }
  const padded = base64Candidate.padEnd(Math.ceil(base64Candidate.length / 4) * 4, "=");
  const buf = Buffer.from(padded, "base64");

  // SHA-256 digest must be exactly 32 bytes.
  if (buf.length !== 32) {
    throw new Error("Invalid sha256 length");
  }

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
