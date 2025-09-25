// src/utils/crc32.ts
export function crc32Base64(buf: Buffer): string {
  // build table once (small & fast, do inline for simplicity)
  const table = new Uint32Array(256).map((_, i) => {
    let c = i;
    for (let j = 0; j < 8; j++) {
      c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    }
    return c >>> 0;
  });

  let crc = 0 ^ (-1);
  for (let i = 0; i < buf.length; i++) {
    crc = (crc >>> 8) ^ table[(crc ^ buf[i]) & 0xff];
  }
  crc = (crc ^ (-1)) >>> 0;

  const out = Buffer.alloc(4);
  out.writeUInt32BE(crc, 0);
  return out.toString('base64');
}