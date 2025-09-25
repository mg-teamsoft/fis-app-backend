import { Router, Request, Response } from "express";
import { UserRulesModel } from "../models/UserRules";
import { parseRulesString } from "../utils/rulesParser";
import { auditInterceptor } from "../middleware/auditInterceptor"; // optional, if you want audit logs
import { JwtUtil } from "../utils/jwtUtil";

const router = Router();

/**
 * Upsert user rules.
 * Body: { userId: string, rulesString: string }
 * Stores raw string and parsed JSON.
 */
router.post(
  "/",
  auditInterceptor?.("RULE_WRITE") ?? ((req, _res, next) => next()),
  async (req: Request, res: Response) => {
    try {
      const { userId: userId, fullname: fullname } = await JwtUtil.extractUser(req);  
      
      const { rulesString } = req.body || {};
      if (!rulesString) {
        return res.status(400).json({ status: "error", message: "rulesString is required" });
      }

      const parsed = parseRulesString(rulesString);

      const doc = await UserRulesModel.findOneAndUpdate(
        { userId },
        { $set: { rulesString, rules: parsed } },
        { upsert: true, new: true }
      );

      // optional audit payload
      res.locals.auditPayload = { userId, rulesString, parsed };

      return res.json({
        status: "success",
        message: "Rules saved",
        data: {
          userId: doc.userId,
          rulesString: doc.rulesString,
          rules: doc.rules,
          updatedAt: doc.updatedAt
        }
      });
    } catch (err: any) {
      return res.status(500).json({ status: "error", message: err?.message || "Failed to save rules" });
    }
  }
);

/**
 * Get user rules by userId
 * Query: ?userId=...
 */
router.get("/", 
  auditInterceptor?.("RULE_GET") ?? ((req, _res, next) => next()),
    async (req: Request, res: Response) => {
  try {
    const { userId: userId, fullname: fullname } = await JwtUtil.extractUser(req);  

    if (!userId) {
      return res.status(400).json({ status: "error", message: "userId is required" });
    }

    const doc = await UserRulesModel.findOne({ userId });
    if (!doc) {
      return res.status(404).json({ status: "error", message: "Rules not found" });
    }

    return res.json({
      status: "success",
      data: {
        userId: doc.userId,
        rulesString: doc.rulesString,
        rules: doc.rules,
        updatedAt: doc.updatedAt,
      }
    });
  } catch (err: any) {
    return res.status(500).json({ status: "error", message: err?.message || "Failed to fetch rules" });
  }
});

export default router;