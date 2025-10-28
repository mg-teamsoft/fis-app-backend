import { S3Client, PutObjectCommand, GetObjectCommand, HeadObjectCommand, PutObjectCommandInput } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { awsConfig } from "../configs/aws";
import { Readable } from "stream";

const s3 = new S3Client({ region: awsConfig.region });

export async function createPresignedPutUrl(key: string, contentType: string, checksumCRC32: string, expiresSec = awsConfig.presignExpires) {
  const cmd: any = {
    Bucket: awsConfig.bucket,
    Key: key,
    ContentType: contentType,
  };
  // If the client supplied the CRC32 (Base64), include it in the PUT presign
  if (checksumCRC32) {
    cmd.ChecksumCRC32 = checksumCRC32;
  }
  const url = await getSignedUrl(s3, cmd, { expiresIn: expiresSec });
  return url;
}

export async function createPresignedPutUrlWithInput(
  input: PutObjectCommandInput
): Promise<string> {
  const command = new PutObjectCommand({
    ...input, // includes Bucket, Key, ContentType, optional ChecksumCRC32
  });

  return getSignedUrl(s3, command, {
    expiresIn: awsConfig.presignExpires,
  });
}

export async function createPresignedGetUrl(key: string, expiresSec = 900) {
  const cmd = new GetObjectCommand({ Bucket: awsConfig.bucket, Key: key });
  const url = await getSignedUrl(s3, cmd, { expiresIn: expiresSec });
  return url;
}

export async function headObject(key: string) {
  return s3.send(new HeadObjectCommand({ Bucket: awsConfig.bucket, Key: key }));
}

export async function getObjectBuffer(key: string): Promise<Buffer> {
  const { Body } = await s3.send(new GetObjectCommand({ Bucket: awsConfig.bucket, Key: key }));
  const stream = Body as Readable;
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks);
}

export async function uploadBufferToS3(params: {
  key: string;
  buffer: Buffer;
  contentType: string;
  metadata?: Record<string, string>;
  sse?: "AES256";
}) {
  const cmd = new PutObjectCommand({
    Bucket: awsConfig.bucket,
    Key: params.key,
    Body: params.buffer,
    ContentType: params.contentType,
    Metadata: params.metadata,
    ServerSideEncryption: params.sse, // optional if your bucket enforces SSE
    CacheControl: "no-cache",
  });
  await s3.send(cmd);
  return { bucket: awsConfig.bucket, key: params.key };
}

export async function getObjectBufferAsU8(key: string): Promise<Uint8Array> {
  const out = await s3.send(
    new GetObjectCommand({ Bucket: awsConfig.bucket, Key: key })
  );

  const stream = out.Body as Readable;
  const chunks: Buffer[] = [];

  for await (const chunk of stream) {
    chunks.push(Buffer.from(chunk));
  }

  const buf = Buffer.concat(chunks); // Node Buffer
  // Wrap in Uint8Array view using exact range
  return new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
}