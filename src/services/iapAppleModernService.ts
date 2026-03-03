import { getTransactionInfo } from "./apple/appleServerApiClient";
import { decodeJwsPayload } from "./apple/jws";
import { PurchaseTransaction } from "../models/PurchaseTransactionModel";
import { Plan, PlanKey } from "../models/PlanModel";
import {
  applySubscriptionEntitlement,
  applyConsumableEntitlement,
  getUserEntitlementSnapshot,
} from "./userPlanEntitlementService";
import { appleConfig } from "../configs/apple";

export async function verifyAppleTransactionAndGrantEntitlement(args: {
  userId: string;
  productId: string;
  transactionId: string;
}) {
  const { userId, productId, transactionId } = args;
  console.log("[IAP][Step 1/8] Validate productId against Plan", { userId, productId, transactionId });

  // 1) Validate product against your Plan collection
  const plan = await Plan.findOne({ "storeIds.ios": productId }).lean();
  if (!plan) {
    console.log("[IAP][Step 1/8] Plan lookup failed", { productId });
    const e: any = new Error("Unknown productId");
    e.statusCode = 400;
    throw e;
  }
  console.log("[IAP][Step 1/8] Plan found", { planKey: plan.key, productType: plan.productType });

  // 2) Idempotency
  console.log("[IAP][Step 2/8] Check existing verified transaction", { transactionId });
  const existing = await PurchaseTransaction.findOne({ platform: "ios", transactionId }).lean();
  if (existing?.status === "verified") {
    console.log("[IAP][Step 2/8] Existing verified transaction found, returning entitlement snapshot", {
      transactionId,
    });
    return await getUserEntitlementSnapshot(userId);
  }
  console.log("[IAP][Step 2/8] No existing verified transaction found", { transactionId });

  // 3) Call Apple Server API
  console.log("[IAP][Step 3/8] Fetch transaction from Apple Server API", { transactionId });
  const txRes = await getTransactionInfo(transactionId);
  const signedTx = txRes?.signedTransactionInfo;
  if (!signedTx) {
    console.log("[IAP][Step 3/8] Missing signedTransactionInfo in Apple response", { transactionId });
    const e: any = new Error("Apple response missing signedTransactionInfo");
    e.statusCode = 502;
    throw e;
  }
  console.log("[IAP][Step 3/8] Apple response includes signedTransactionInfo", { transactionId });

  // 4) Decode payload (PoC). Later: verify signature.
  console.log("[IAP][Step 4/8] Decode JWS payload", { transactionId });
  const tx = decodeJwsPayload(signedTx);
  console.log("[IAP][Step 4/8] Decoded payload", {
    txProductId: tx.productId,
    txBundleId: tx.bundleId,
    originalTransactionId: tx.originalTransactionId,
  });

  // 5) Validate payload matches request
  console.log("[IAP][Step 5/8] Validate payload fields", {
    requestedProductId: productId,
    txProductId: tx.productId,
    requestedBundleId: appleConfig.bundleId,
    txBundleId: tx.bundleId,
  });
  if (tx.productId !== productId) {
    console.log("[IAP][Step 5/8] productId mismatch", { requestedProductId: productId, txProductId: tx.productId });
    const e: any = new Error("productId mismatch");
    e.statusCode = 400;
    throw e;
  }
  if (tx.bundleId !== appleConfig.bundleId) {
    console.log("[IAP][Step 5/8] bundleId mismatch", { requestedBundleId: appleConfig.bundleId, txBundleId: tx.bundleId });
    const e: any = new Error("bundleId mismatch");
    e.statusCode = 400;
    throw e;
  }
  console.log("[IAP][Step 5/8] Payload validation passed", { transactionId });

  const originalTransactionId = tx.originalTransactionId;
  const purchaseDate = tx.purchaseDate ? new Date(tx.purchaseDate) : undefined;
  const expiresAt = tx.expiresDate ? new Date(tx.expiresDate) : undefined;

  // 6) Idempotency for restored/same entitlement payloads.
  // Apple may resend an already granted subscription entitlement with a different transactionId.
  console.log("[IAP][Step 6/8] Check subscription entitlement idempotency", {
    productType: plan.productType,
    originalTransactionId,
    expiresAt: expiresAt?.toISOString() ?? null,
  });
  if (plan.productType === "subscription" && originalTransactionId && expiresAt) {
    const existingEntitlement = await PurchaseTransaction.findOne({
      userId,
      platform: "ios",
      productId,
      productType: "subscription",
      originalTransactionId,
      expiresDate: expiresAt,
      status: "verified",
    }).lean();

    if (existingEntitlement) {
      console.log("[IAP][Step 6/8] Existing subscription entitlement found, returning snapshot", {
        originalTransactionId,
        expiresAt: expiresAt.toISOString(),
      });
      return await getUserEntitlementSnapshot(userId);
    }
  }
  console.log("[IAP][Step 6/8] No duplicate subscription entitlement detected", { transactionId });

  // 7) Ensure transaction insert (dedupe) before entitlement
  console.log("[IAP][Step 7/8] Insert verified purchase transaction", { transactionId });
  try {
    await PurchaseTransaction.create({
      userId,
      platform: "ios",
      productId,
      productType: plan.productType,
      transactionId,
      originalTransactionId,
      purchaseDate,
      expiresDate: expiresAt,
      status: "verified",
      raw: { environment: tx.environment },
    });
    console.log("[IAP][Step 7/8] Transaction insert successful", { transactionId });
  } catch (e: any) {
    if (e?.code === 11000) {
      console.log("[IAP][Step 7/8] Duplicate transaction insert detected, returning snapshot", { transactionId });
      return await getUserEntitlementSnapshot(userId);
    }
    throw e;
  }

  // 8) Grant entitlement after successful transaction insert
  console.log("[IAP][Step 8/8] Grant entitlement", {
    productType: plan.productType,
    planKey: plan.key,
    expiresAt: expiresAt?.toISOString() ?? null,
  });
  if (plan.productType === "subscription") {
    if (expiresAt && expiresAt.getTime() < Date.now()) {
      console.log("[IAP][Step 8/8] Subscription is expired", { expiresAt: expiresAt.toISOString() });
      const e: any = new Error("Subscription is expired");
      e.statusCode = 409;
      throw e;
    }

    const validSubscriptionKeys = [PlanKey.MONTHLY_100, PlanKey.YEARLY_1200];
    if (!validSubscriptionKeys.includes(plan.key as PlanKey)) {
      console.log("[IAP][Step 8/8] Invalid subscription plan key", { planKey: plan.key });
      const e: any = new Error("Invalid subscription plan key");
      e.statusCode = 400;
      throw e;
    }

    console.log("[IAP][Step 8/8] Applying subscription entitlement", {
      userId,
      planKey: plan.key,
      period: plan.period,
    });
    return await applySubscriptionEntitlement({
      userId,
      planKey: plan.key as PlanKey.MONTHLY_100 | PlanKey.YEARLY_1200,
      period: plan.period,
      planQuota: plan.quota,
      expiresAt,
      purchaseDate,
    });
  }

  console.log("[IAP][Step 8/8] Applying consumable entitlement", {
    userId,
    planKey: plan.key,
    addQuota: plan.quota ?? 100,
  });
  return await applyConsumableEntitlement({
    userId,
    addQuota: plan.quota ?? 100,
    planKey: plan.key as PlanKey,
    period: plan.period,
  });
}
