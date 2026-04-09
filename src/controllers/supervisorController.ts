import { Request, Response } from "express";
import { JwtUtil } from "../utils/jwtUtil";
import { listActiveCustomersForSupervisor } from "./contactController";
import { getReceiptDetail, listReceiptListItems } from "./receiptController";
import { listUserExcelFiles, presignExcelGetUrl } from "../services/excelWriterService";

export async function supervisorListCustomers(req: Request, res: Response) {
  try {
    const { userId } = await JwtUtil.extractUser(req);
    if (!userId) {
      return res.status(401).json({ status: "error", message: "Unauthorized" });
    }

    const permission = typeof req.query.permission === "string" ? req.query.permission : undefined;
    const customers = await listActiveCustomersForSupervisor(userId, permission);

    return res.json(
      customers.map((customer: any) => ({
        customerUserId: customer.customerUserId,
        userName: customer.customer?.userName ?? null,
        email: customer.customer?.email ?? null,
      }))
    );
  } catch (error: any) {
    return res.status(500).json({ status: "error", message: error?.message ?? "Failed to list customers" });
  }
}

export async function supervisorListCustomerReceipts(req: Request, res: Response) {
  return listReceiptListItems(req, res);
}

export async function supervisorGetReceiptDetail(req: Request, res: Response) {
  return getReceiptDetail(req, res);
}

export async function supervisorListExcelFiles(req: Request, res: Response) {
  try {
    const customerUserId = req.accessScope!.customerUserId;
    const files = await listUserExcelFiles(customerUserId);
    return res.json({ status: "success", files });
  } catch (error: any) {
    return res.status(500).json({ status: "error", message: error?.message ?? "Failed to list excel files" });
  }
}

export async function supervisorDownloadExcel(req: Request, res: Response) {
  try {
    const customerUserId = req.accessScope!.customerUserId;
    const fileId = req.params.fileId;
    const result = await presignExcelGetUrl(customerUserId, fileId, 900);

    return res.json({ status: "success", ...result });
  } catch (error: any) {
    if (error?.code === "NOT_FOUND") {
      return res.status(404).json({ status: "error", message: "file not found" });
    }

    return res.status(500).json({ status: "error", message: error?.message ?? "presign failed" });
  }
}
