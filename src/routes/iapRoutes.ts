import { Router } from "express";
import { verifyApplePurchase } from "../controllers/iapController";
import {
  getAppleHistory,
  getAppleProducts,
  getAppleSubscription,
  getAppleSubscriptions,
  getAppleTransaction,
} from "../controllers/iapCatalogController";

const router = Router();

/**
 * POST /api/iap/apple/verify
 * body: { productId: string, receiptData: string }
 */
router.post("/apple/verify", verifyApplePurchase);

router.get("/apple/products", getAppleProducts);

router.get("/apple/subscriptions", getAppleSubscriptions);

router.get("/inApps/v1/transactions/:transactionId", getAppleTransaction);

router.get("/inApps/v1/subscriptions/:transactionId", getAppleSubscription);

router.get("/inApps/v2/history/:transactionId", getAppleHistory);

export default router;
