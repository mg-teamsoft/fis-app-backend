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

  // 1) Validate product against your Plan collection
  const plan = await Plan.findOne({ "storeIds.ios": productId }).lean();
  if (!plan) {
    const e: any = new Error("Unknown productId");
    e.statusCode = 400;
    throw e;
  }

  // 2) Idempotency
  const existing = await PurchaseTransaction.findOne({ platform: "ios", transactionId }).lean();
  if (existing?.status === "verified") {
    return await getUserEntitlementSnapshot(userId);
  }

  // 3) Call Apple Server API
  const txRes = await getTransactionInfo(transactionId);
  const signedTx = txRes?.signedTransactionInfo;
  if (!signedTx) {
    const e: any = new Error("Apple response missing signedTransactionInfo");
    e.statusCode = 502;
    throw e;
  }

  // 4) Decode payload (PoC). Later: verify signature.
  const tx = decodeJwsPayload(signedTx);

  // 5) Validate payload matches request
  if (tx.productId !== productId) {
    const e: any = new Error("productId mismatch");
    e.statusCode = 400;
    throw e;
  }
  if (tx.bundleId !== appleConfig.bundleId) {
    const e: any = new Error("bundleId mismatch");
    e.statusCode = 400;
    throw e;
  }

  const originalTransactionId = tx.originalTransactionId;
  const purchaseDate = tx.purchaseDate ? new Date(tx.purchaseDate) : undefined;
  const expiresAt = tx.expiresDate ? new Date(tx.expiresDate) : undefined;

  // 6) Idempotency for restored/same entitlement payloads.
  // Apple may resend an already granted subscription entitlement with a different transactionId.
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
      return await getUserEntitlementSnapshot(userId);
    }
  }

  // 7) Ensure transaction insert (dedupe) before entitlement
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
  } catch (e: any) {
    if (e?.code === 11000) {
      return await getUserEntitlementSnapshot(userId);
    }
    throw e;
  }

  // 8) Grant entitlement after successful transaction insert
  if (plan.productType === "subscription") {
    if (expiresAt && expiresAt.getTime() < Date.now()) {
      const e: any = new Error("Subscription is expired");
      e.statusCode = 409;
      throw e;
    }

    const validSubscriptionKeys = [PlanKey.MONTHLY_100, PlanKey.YEARLY_1200];
    if (!validSubscriptionKeys.includes(plan.key as PlanKey)) {
      const e: any = new Error("Invalid subscription plan key");
      e.statusCode = 400;
      throw e;
    }

    return await applySubscriptionEntitlement({
      userId,
      planKey: plan.key as PlanKey.MONTHLY_100 | PlanKey.YEARLY_1200,
      period: plan.period,
      planQuota: plan.quota,
      expiresAt,
      purchaseDate,
    });
  }

  return await applyConsumableEntitlement({
    userId,
    addQuota: plan.quota ?? 100,
    planKey: plan.key as PlanKey,
    period: plan.period,
  });
}
