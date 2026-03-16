import { Request, Response, NextFunction } from "express";
import { ContactLinkModel } from "../models/ContactLinkModel";
import { JwtUtil } from "../utils/jwtUtil";

export type ContactPermission = "VIEW_RECEIPTS" | "DOWNLOAD_FILES";

declare global {
  namespace Express {
    interface Request {
      accessScope?: {
        customerUserId: string;
        permissions: string[];
      };
    }
  }
}

export function requireSupervisorAccess(
  customerUserIdParam: string, // e.g. "customerUserId" from req.params
  permission: ContactPermission
) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const { userId } = await JwtUtil.extractUser(req);
    if (!userId) {
      return res.status(401).json({ status: "error", message: "Unauthorized" });
    }

    const customerUserId = (req.params as any)?.[customerUserIdParam]; 
    if (!customerUserId) {
      return res.status(400).json({ status: "error", message: "customerUserId is required" });
    }

    const link = await ContactLinkModel.findOne({
      customerUserId,
      userId,
      isActive: true,
    }).lean();

    if (!link) {
      return res.status(403).json({ status: "error", message: "Forbidden: no active access link" });
    }

    const perms = link.permissions ?? [];
    if (!perms.includes(permission)) {
      return res.status(403).json({ status: "error", message: "Forbidden: missing permission" });
    }

    req.accessScope = { customerUserId, permissions: perms };
    next();
  };
}