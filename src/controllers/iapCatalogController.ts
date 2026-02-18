import { Request, Response } from "express";
import { listInAppPurchases, listSubscriptionGroupsWithSubscriptions } from "../services/apple/appStoreConnectClient";
import { appleConfig } from "../configs/apple";
import {
  getSubscriptionInfo,
  getTransactionHistory,
  getTransactionInfo,
} from "../services/apple/appleServerApiClient";

export async function getAppleProducts(req: Request, res: Response) {
  const appId = appleConfig.ascAppId;
  if (!appId) {
    return res.status(500).json({ status: "error", message: "ASC_APP_ID is not set" });
  }

  try {
    const data = await listInAppPurchases(appId);
    return res.json({ status: "ok", data });
  } catch (e: any) {
    console.error("ASC API error", {
      status: e?.response?.status,
      data: e?.response?.data,
    });
    return res.status(502).json({
      status: "error",
      message: "Failed to fetch products from App Store Connect",
      details: e?.response?.data ?? null,
    });
  }
}

export async function getAppleSubscriptions(req: Request, res: Response) {
  const appId = appleConfig.ascAppId;
  if (!appId) {
    return res.status(500).json({ status: "error", message: "ASC_APP_ID is not set" });
  }

  try {
    const data = await listSubscriptionGroupsWithSubscriptions(appId);
    return res.json({ status: "ok", data });
  } catch (e: any) {
    console.error("ASC subscriptions error", {
      status: e?.response?.status,
      data: e?.response?.data,
    });
    return res.status(502).json({
      status: "error",
      message: "Failed to fetch subscriptions from App Store Connect",
      details: e?.response?.data ?? null,
    });
  }
}

export async function getAppleTransaction(req: Request, res: Response) {
  const transactionId = req.params?.transactionId;
  
  if (!transactionId || typeof transactionId !== "string") {
    return res.status(400).json({
      status: "error",
      message: "transactionId is required",
    });
  }

  try {
    const data = await getTransactionInfo(transactionId);
    return res.json({ status: "ok", data });
  } catch (e: any) {
    console.error("Apple transaction error", {
      status: e?.response?.status,
      data: e?.response?.data,
    });
    return res.status(502).json({
      status: "error",
      message: "Failed to fetch transaction from Apple Server API",
      details: e?.response?.data ?? null,
    });
  }
}

export async function getAppleSubscription(req: Request, res: Response) {
  const transactionId = req.params?.transactionId;

  if (!transactionId || typeof transactionId !== "string") {
    return res.status(400).json({
      status: "error",
      message: "transactionId is required",
    });
  }

  try {
    const data = await getSubscriptionInfo(transactionId);
    return res.json({ status: "ok", data });
  } catch (e: any) {
    console.error("Apple subscription error", {
      status: e?.response?.status,
      data: e?.response?.data,
    });
    return res.status(502).json({
      status: "error",
      message: "Failed to fetch subscription from Apple Server API",
      details: e?.response?.data ?? null,
    });
  }
}

export async function getAppleHistory(req: Request, res: Response) {
  const transactionId = req.params?.transactionId;

  if (!transactionId || typeof transactionId !== "string") {
    return res.status(400).json({
      status: "error",
      message: "transactionId is required",
    });
  }

  const allowedParams = [
    "revision",
    "startDate",
    "endDate",
    "productId",
    "productType",
    "sort",
    "subscriptionGroupIdentifier",
    "inAppOwnershipType",
    "revoked",
  ] as const;

  const params: Record<string, string> = {};
  for (const key of allowedParams) {
    const value = req.query?.[key];
    if (typeof value === "string" && value.length > 0) {
      params[key] = value;
    }
  }

  try {
    const data = await getTransactionHistory(transactionId, params);
    return res.json({ status: "ok", data });
  } catch (e: any) {
    console.error("Apple history error", {
      status: e?.response?.status,
      data: e?.response?.data,
      transactionId,
      params,
    });
    return res.status(502).json({
      status: "error",
      message: "Failed to fetch transaction history from Apple Server API",
      details: e?.response?.data ?? null,
    });
  }
}
