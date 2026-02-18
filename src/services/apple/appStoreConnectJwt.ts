import fs from "fs";
import { SignJWT, importPKCS8 } from "jose";
import { appleConfig } from "../../configs/apple";

const alg = "ES256";

export async function createAppStoreConnectToken() {
  const issuerId = appleConfig.issuerId!;
  const keyId = appleConfig.keyId!;
  const keyPath = appleConfig.privateKeyPath!;

  if (!issuerId || !keyId || !keyPath) {
    throw new Error("Missing ASC env vars (ASC_ISSUER_ID, ASC_KEY_ID, ASC_PRIVATE_KEY_PATH)");
  }

  const privateKeyPem = fs.readFileSync(keyPath, "utf8");
  const privateKey = await importPKCS8(privateKeyPem, alg);

  const now = Math.floor(Date.now() / 1000);

  return await new SignJWT({
    aud: "appstoreconnect-v1", // ✅ REQUIRED for App Store Connect API
  })
    .setProtectedHeader({ alg, kid: keyId, typ: "JWT" })
    .setIssuer(issuerId)
    .setIssuedAt(now)
    .setExpirationTime(now + 20 * 60) // max 20 min recommended
    .sign(privateKey);
}