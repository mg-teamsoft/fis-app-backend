import path from 'path';
import dotenv from 'dotenv';

const envLoaded =
  dotenv.config({ path: path.resolve(__dirname, '../../.env') }).parsed ??
  dotenv.config({ path: path.resolve(__dirname, '../../.env.dev') }).parsed;

if (!envLoaded) {
  console.warn('⚠️  No .env file found; relying on existing environment variables.');
}

import { connectMongo } from "../db/mongo";
import { manualUserPlanReset } from "../schedules/userPlanScheduler";

(async () => {
  try {
    await connectMongo();
    await manualUserPlanReset();
    process.exit(0);
  } catch (err) {
    console.error('❌ Plan reset failed:', err);
    process.exit(1);
  }
})();
