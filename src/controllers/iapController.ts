import { Request, Response } from "express";
import { verifyAppleTransactionAndGrantEntitlement } from "../services/iapAppleModernService";
import { JwtUtil } from "../utils/jwtUtil";

export async function verifyApplePurchase(req: Request, res: Response) {
  const { userId } = await JwtUtil.extractUser(req);
  const { productId, transactionId } = req.body ?? {};

  if (!productId || typeof productId !== "string") {
    return res.status(400).json({ status: "error", message: "productId is required" });
  }
  if (!transactionId || typeof transactionId !== "string") {
    return res.status(400).json({ status: "error", message: "transactionId is required" });
  }

  try {
    const entitlement = await verifyAppleTransactionAndGrantEntitlement({
      userId,
      productId,
      transactionId,
    });
    return res.json({ status: "ok", entitlement });
  } catch (err: any) {
    return res.status(err?.statusCode ?? 500).json({
      status: "error",
      message: err?.message ?? "Verification failed",
    });
  }
}