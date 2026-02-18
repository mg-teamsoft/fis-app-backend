import fs from "fs";
import { SignJWT, importPKCS8 } from "jose";
import { appleConfig } from "../../configs/apple";

const alg = "ES256";

export async function createAppleServerApiToken() {
  const issuerId = appleConfig.issuerId!;
  const keyId = appleConfig.keyId!;
  const bundleId = appleConfig.bundleId!;
  const keyPath = appleConfig.privateKeyPath!;

  if (!issuerId || !keyId || !bundleId || !keyPath) {
    throw new Error("Missing Apple Server API env vars (ISSUER_ID, KEY_ID, BUNDLE_ID, PRIVATE_KEY_PATH)");
  }

  const privateKeyPem = fs.readFileSync(keyPath, "utf8");
  const privateKey = await importPKCS8(privateKeyPem, alg);

  const now = Math.floor(Date.now() / 1000);

  return await new SignJWT({ bid: bundleId })
    .setProtectedHeader({ alg, kid: keyId, typ: "JWT" })
    .setIssuer(issuerId)
    .setAudience("appstoreconnect-v1")
    .setIssuedAt(now)
    .setExpirationTime(now + 20 * 60) // 20 mins
    .sign(privateKey);
}