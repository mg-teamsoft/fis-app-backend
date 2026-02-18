export function decodeJwsPayload(jws: string) {
  const parts = jws.split(".");
  if (parts.length !== 3) throw new Error("Invalid JWS");
  const payload = Buffer.from(parts[1], "base64url").toString("utf8");
  return JSON.parse(payload);
}