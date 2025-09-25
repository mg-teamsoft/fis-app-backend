import { crc32Base64 } from "../utils/crc32";
import { readFileSync } from "fs";

async function testCrc32() {
    const imagePath = './uploads/ok/2025-05-12 18.37.36.jpg';
    const file = readFileSync(imagePath);

    console.log(crc32Base64(file));  // e.g. "y3H8dQ=="
}

testCrc32().catch(console.error);