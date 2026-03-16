import crypto from "crypto";

export function sha256(input: string): string {
  return crypto.createHash("sha256").update(input, "utf8").digest("hex");
}

export function randomTokenHex(size = 32): string {
  return crypto.randomBytes(size).toString("hex");
}

export function randomUuid(): string {
  return crypto.randomUUID();
}
