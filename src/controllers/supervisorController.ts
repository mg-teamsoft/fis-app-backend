import { Request, Response } from "express";
import ReceiptModel from "../models/ReceiptModel";
import { createPresignedGetUrl } from "../services/s3Service"; // adjust if you already have a presign service

export async function supervisorListCustomerReceipts(req: Request, res: Response) {
  const customerUserId = req.accessScope!.customerUserId;

  // Optional pagination
  const page = Math.max(parseInt((req.query.page as string) ?? "1", 10), 1);
  const limit = Math.min(Math.max(parseInt((req.query.limit as string) ?? "10", 10), 1), 50);
  const skip = (page - 1) * limit;

  const [items, total] = await Promise.all([
    ReceiptModel.find({ userId: customerUserId })
      .select({ imageUrl: 1, receiptNumber: 1, totalAmount: 1, transactionDate: 1 })
      .sort({ transactionDate: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    ReceiptModel.countDocuments({ userId: customerUserId }),
  ]);

  return res.json({
    status: "ok",
    page,
    limit,
    total,
    items,
  });
}

export async function supervisorGetReceiptDetail(req: Request, res: Response) {
  const customerUserId = req.accessScope!.customerUserId;
  const receiptId = req.params.receiptId;

  const receipt = await ReceiptModel.findOne({ _id: receiptId, userId: customerUserId }).lean();
  if (!receipt) {
    return res.status(404).json({ status: "error", message: "Receipt not found" });
  }

  // If you store sourceKey, generate a new signed URL for detail screen:
  // receipt.sourceKey example: "receipts/images/<userId>/<file>.jpg"
  let freshImageUrl = receipt.imageUrl;
  if ((receipt as any).sourceKey) {
    freshImageUrl = await createPresignedGetUrl((receipt as any).sourceKey, 900); // 15 min
  }

  return res.json({
    status: "ok",
    receipt: {
      ...receipt,
      imageUrl: freshImageUrl,
    },
  });
}

export async function supervisorDownloadExcel(req: Request, res: Response) {
  const customerUserId = req.accessScope!.customerUserId;
  const fileKey = req.params.fileKey; 
  // fileKey should be URL-encoded; if it contains slashes, you may prefer query param instead.

  // ✅ Safety check: restrict to this customer's prefix
  const prefix = `receipts/excel/${customerUserId}/`;
  if (!fileKey.startsWith(prefix)) {
    return res.status(403).json({ status: "error", message: "Forbidden: invalid file key" });
  }

  const url = await createPresignedGetUrl(fileKey, 900);
  return res.redirect(url);
}