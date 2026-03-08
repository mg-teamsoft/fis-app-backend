import { getTransactionHistory } from "./apple/appleServerApiClient";
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

  let appleTransactionId: string;

  // 3) Call Apple Transaction History API (v2) and select the transaction matching this productId
  console.log("[IAP][Step 3/8] Fetch transaction history from Apple Server API", { transactionId });
  const history = await getTransactionHistory(transactionId);

  const signedList: string[] = Array.isArray(history?.signedTransactions)
    ? history.signedTransactions
    : [];

  if (!signedList.length) {
    console.log("[IAP][Step 3/8] Apple history returned no signedTransactions", { transactionId });
    const e: any = new Error("Apple history returned no signedTransactions");
    e.statusCode = 502;
    throw e;
  }

  console.log("[IAP][Step 4/8] Decode signedTransactions and match by productId", {
    requestedProductId: productId,
    count: signedList.length,
  });

  let matched: any = null;
  for (const signed of signedList) {
    try {
      const payload = decodeJwsPayload(signed);
      if (payload?.productId === productId) {
        matched = payload;
        break;
      }
    } catch (_) {
      // ignore decode errors for individual entries
    }
  }

  if (!matched) {
    console.log("[IAP][Step 4/8] No matching transaction found in history for requested productId", {
      requestedProductId: productId,
      transactionId,
    });
    // Sandbox can be eventually consistent; treat as pending rather than hard error
    const e: any = new Error("No matching transaction found for requested productId");
    e.statusCode = 409;
    throw e;
  }

  console.log("[IAP][Step 4/8] Matched Apple payload", {
    txProductId: matched.productId,
    txBundleId: matched.bundleId,
    appleTransactionId: matched.transactionId,
    originalTransactionId: matched.originalTransactionId,
    type: matched.type,
  });

  // 5) Validate bundle id
  console.log("[IAP][Step 5/8] Validate payload bundleId", {
    requestedBundleId: appleConfig.bundleId,
    txBundleId: matched.bundleId,
  });
  if (matched.bundleId !== appleConfig.bundleId) {
    console.log("[IAP][Step 5/8] bundleId mismatch", {
      requestedBundleId: appleConfig.bundleId,
      txBundleId: matched.bundleId,
    });
    const e: any = new Error("bundleId mismatch");
    e.statusCode = 400;
    throw e;
  }
  console.log("[IAP][Step 5/8] Payload validation passed", {
    transactionId,
    appleTransactionId: matched.transactionId,
  });

  appleTransactionId = matched.transactionId as string;

  // 2) Idempotency (by real Apple transactionId)
  console.log("[IAP][Step 2/8] Check existing verified transaction", {
    transactionId,
    appleTransactionId,
  });
  const existing = await PurchaseTransaction.findOne({
    platform: "ios",
    transactionId: appleTransactionId,
  }).lean();
  if (existing?.status === "verified") {
    console.log(
      "[IAP][Step 2/8] Existing verified transaction found, returning entitlement snapshot",
      { transactionId, appleTransactionId }
    );
    return await getUserEntitlementSnapshot(userId);
  }
  console.log("[IAP][Step 2/8] No existing verified transaction found", {
    transactionId,
    appleTransactionId,
  });

  const originalTransactionId = matched.originalTransactionId as string | undefined;
  const purchaseDate = matched.purchaseDate ? new Date(matched.purchaseDate) : undefined;
  const expiresAt = matched.expiresDate ? new Date(matched.expiresDate) : undefined;

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
  console.log("[IAP][Step 7/8] Insert verified purchase transaction", { transactionId, appleTransactionId });
  try {
    await PurchaseTransaction.create({
      userId,
      platform: "ios",
      productId,
      productType: plan.productType,
      transactionId: appleTransactionId,
      originalTransactionId,
      purchaseDate,
      expiresDate: expiresAt,
      status: "verified",
      raw: { environment: matched.environment },
    });
    console.log("[IAP][Step 7/8] Transaction insert successful", { transactionId, appleTransactionId });
  } catch (e: any) {
    if (e?.code === 11000) {
      console.log("[IAP][Step 7/8] Duplicate transaction insert detected, returning snapshot", { transactionId, appleTransactionId });
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
  });
}
