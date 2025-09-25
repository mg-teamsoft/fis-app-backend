export const awsConfig = {
  region: process.env.AWS_REGION || "eu-central-1",
  bucket: process.env.S3_BUCKET as string,
  uploadPrefix: process.env.S3_UPLOAD_PREFIX || "receipts/",
  presignExpires: Number(process.env.S3_PRESIGN_EXPIRES || 900),
};

if (!awsConfig.bucket) {
  throw new Error("S3_BUCKET is required");
}