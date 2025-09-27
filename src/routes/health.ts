import { Router } from "express";
import os from "node:os";
import mongoose from "mongoose";
import { S3Client, HeadBucketCommand } from "@aws-sdk/client-s3";
import { awsConfig } from "../configs/aws"; // assumes you already have region/bucket here
import pkg from "../../package.json";

export const healthRouter = Router();

const startedAt = Date.now();
const s3 = new S3Client({ region: awsConfig.region });

/**
 * GET /health
 * Liveness by default. If you pass ?full=1 it also performs lightweight
 * readiness checks (Mongo + S3 bucket reachability).
 */
healthRouter.get("/", async (req, res) => {
  const now = Date.now();

  // base payload (liveness)
  const payload: any = {
    status: "ok",
    service: pkg.name || "fis-app-backend",
    version: pkg.version,
    node: process.version,
    uptimeSec: Math.round(process.uptime()),
    startedAt: new Date(startedAt).toISOString(),
    now: new Date(now).toISOString(),
    host: os.hostname(),
    pid: process.pid,
  };

  // readiness checks if requested
  const doFull = req.query.full === "1" || req.query.full === "true";
  if (doFull) {
    // Mongo
    const mongoState = mongoose.connection?.readyState ?? 0; // 0=disconnected,1=connected,2=connecting,3=disconnecting
    payload.mongo = {
      state: mongoState,
      ok: mongoState === 1,
    };

    // S3
    try {
      if (awsConfig.bucket) {
        await s3.send(new HeadBucketCommand({ Bucket: awsConfig.bucket }));
        payload.s3 = { bucket: awsConfig.bucket, ok: true, region: awsConfig.region };
      } else {
        payload.s3 = { ok: false, reason: "missing bucket in config" };
      }
    } catch (e: any) {
      payload.s3 = { ok: false, error: e?.name || "S3Error", message: e?.message };
    }

    // overall readiness
    payload.readiness = {
      ok: Boolean(payload.mongo?.ok) && Boolean(payload.s3?.ok),
    };

    const httpStatus = payload.readiness.ok ? 200 : 503;
    return res.status(httpStatus).json(payload);
  }

  // liveness only
  return res.json(payload);
});

// GET /health/db
healthRouter.get('/db', async (req, res) => {
  const dbState = mongoose.connection.readyState;

  // States: 0 = disconnected, 1 = connected, 2 = connecting, 3 = disconnecting
  if (dbState === 1) {
    res.status(200).json({ database: 'up' });
  } else {
    res.status(503).json({ database: 'down' });
  }
});