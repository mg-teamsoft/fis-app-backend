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

  console.log("[AppleJWT] Creating Apple Server API token", {
    env: appleConfig.env,
    bundleId,
    keyId,
    issuerId,
    keyPath,
    cwd: process.cwd(),
    keyFileExists: fs.existsSync(keyPath),
  });

  let privateKeyPem: string;
  try {
    privateKeyPem = fs.readFileSync(keyPath, "utf8");
  } catch (error: any) {
    console.error("[AppleJWT] Failed to read Apple private key file", {
      keyPath,
      cwd: process.cwd(),
      code: error?.code,
      message: error?.message,
    });
    throw error;
  }

  let privateKey: Awaited<ReturnType<typeof importPKCS8>>;
  try {
    privateKey = await importPKCS8(privateKeyPem, alg);
  } catch (error: any) {
    console.error("[AppleJWT] Failed to import Apple private key", {
      keyPath,
      message: error?.message,
    });
    throw error;
  }

  const now = Math.floor(Date.now() / 1000);

  return await new SignJWT({ bid: bundleId })
    .setProtectedHeader({ alg, kid: keyId, typ: "JWT" })
    .setIssuer(issuerId)
    .setAudience("appstoreconnect-v1")
    .setIssuedAt(now)
    .setExpirationTime(now + 20 * 60) // 20 mins
    .sign(privateKey);
}
