import { NextFunction, Request, Response } from "express";
import { v4 as uuidv4 } from "uuid";
import { AuditAction, AuditLogModel } from "../models/AuditLog";
import { JwtUtil } from "../utils/jwtUtil";

async function getUserFromReq(req: Request) {
    // Adapt this to your auth. Fallback to headers if no auth middleware.
    // e.g., req.user = { id, name } if you have JWT/session middleware.
    const { userId: userId, fullname: userName } = await JwtUtil.extractUser(req);
    
    //const userId = (req as any)?.user?.id || (req.headers["x-user-id"] as string) || null;
    //const userName = (req as any)?.user?.name || (req.headers["x-user-name"] as string) || null;
    return { userId, userName };
}

/**
 * Use in routes:
 *  - Put any context you want to log into res.locals.auditPayload before sending response.
 *  - Example: res.locals.auditPayload = { fileCount, fileNames } or { receiptPreview }
 */
export function auditInterceptor(action: AuditAction) {
    return async function (req: Request, res: Response, next: NextFunction) {
        const start = Date.now();
        const requestId = (req.headers["x-request-id"] as string) || uuidv4();
        (res.locals as any).requestId = requestId;

        const { userId, userName } = await getUserFromReq(req);
        const ip = (req.headers["x-forwarded-for"] as string) || req.socket.remoteAddress || null;
        const userAgent = (req.headers["user-agent"] as string) || null;

        // Hook into finish & error to log outcome
        const onFinish = async () => {
            try {
                const statusCode = res.statusCode;
                const status: "success" | "error" = statusCode >= 200 && statusCode < 400 ? "success" : "error";
                const message =
                    (res.locals as any).auditMessage ||
                    (status === "success" ? `${action} completed` : `${action} failed with ${statusCode}`);

                await AuditLogModel.create({
                    requestId,
                    action,
                    userId,
                    userName,
                    ip,
                    userAgent,
                    status,
                    message,
                    payload: (res.locals as any).auditPayload || null,
                    latencyMs: Date.now() - start,
                });
            } catch (e) {
                // avoid throwing in finish handler
                // console.error("Audit log write failed", e);
            } finally {
                res.removeListener("finish", onFinish);
                res.removeListener("close", onFinish);
                res.removeListener("error", onError);
            }
        };

        const onError = async (err: any) => {
            try {
                await AuditLogModel.create({
                    requestId,
                    action,
                    userId,
                    userName,
                    ip,
                    userAgent,
                    status: "error",
                    message: err?.message || `${action} error`,
                    payload: (res.locals as any).auditPayload || null,
                    latencyMs: Date.now() - start,
                });
            } catch {
                // swallow
            } finally {
                // res.removeListener("finish", onFinish);
                res.removeListener("close", onFinish);
                res.removeListener("error", onError);
            }
        };

        res.on("finish", onFinish);
        res.on("close", onFinish);
        res.on("error", onError);

        next();
    };
}