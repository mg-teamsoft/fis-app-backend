export const appleConfig = {
  issuerId: process.env.APPLE_ISSUER_ID || "",
  keyId: process.env.APPLE_KEY_ID || "",
  bundleId: process.env.APPLE_BUNDLE_ID || "com.mg.fisapp.dev",
  privateKeyPath: process.env.APPLE_PRIVATE_KEY_PATH,
  env: process.env.APPLE_ENV || "SANDBOX",
  ascAppId: process.env.APPLE_ASC_APP_ID || "",
};

if (!appleConfig.issuerId || !appleConfig.keyId || !appleConfig.privateKeyPath) {
  throw new Error("Apple configuration is incomplete. Please set APPLE_ISSUER_ID, APPLE_KEY_ID, and APPLE_PRIVATE_KEY_PATH. ");
}