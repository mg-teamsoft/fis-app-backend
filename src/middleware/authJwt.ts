import { NextFunction, Request, Response } from "express";
import { jwtVerify, createRemoteJWKSet, importSPKI, JWTPayload } from "jose";
import { TokenSession, sha256 } from "../models/TokenSession";

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

type Verified = { payload: JWTPayload; issuer?: string; audience?: string };

// Build a verifier from env (JWKS → RSA public key → HMAC secret)
async function verifyJwt(token: string): Promise<Verified> {
  const issuer = process.env.JWT_ISSUER || undefined;
  const audience = process.env.JWT_AUDIENCE || undefined;

  if (process.env.JWT_JWKS_URL) {
    const JWKS = createRemoteJWKSet(new URL(process.env.JWT_JWKS_URL));
    const { payload } = await jwtVerify(token, JWKS, { issuer, audience });
    return { payload, issuer, audience };
  }

  if (process.env.JWT_PUBLIC_KEY) {
    // PEM public key (RSA/ECDSA)
    const pub = await importSPKI(process.env.JWT_PUBLIC_KEY, "RS256");
    const { payload } = await jwtVerify(token, pub, { issuer, audience });
    return { payload, issuer, audience };
  }

  if (process.env.JWT_SECRET) {
    const secret = new TextEncoder().encode(process.env.JWT_SECRET);
    const { payload } = await jwtVerify(token, secret, { issuer, audience });
    return { payload, issuer, audience };
  }

  throw new Error("No verifier configured. Set JWT_JWKS_URL or JWT_PUBLIC_KEY or JWT_SECRET");
}

// Ensure we have a DB session for this token, with 24h TTL
async function ensureTokenSession(token: string, verified: Verified) {
  const tokenHash = sha256(token);
  const now = Date.now();
  // Respect token exp if present; session TTL is min(24h, token exp)
  const jwtExpMs =
    verified.payload.exp ? verified.payload.exp * 1000 : now + ONE_DAY_MS;
  const expiresAt = new Date(Math.min(now + ONE_DAY_MS, jwtExpMs));

  const jti = (verified.payload.jti as string) || null;
  const userId =
    ((verified.payload.sub as string) ||
      (verified.payload["user_id"] as string) ||
      (verified.payload["preferred_username"] as string)) ?? null;

  const userName =
    ((verified.payload["name"] as string) ||
      (verified.payload["email"] as string) ||
      (verified.payload["preferred_username"] as string)) ?? null;

  // Upsert session
  const doc = await TokenSession.findOneAndUpdate(
    { tokenHash },
    {
      $setOnInsert: {
        tokenHash,
        jti,
        userId,
        userName,
        issuer: verified.issuer ?? (verified.payload.iss as string) ?? null,
        audience: verified.audience ?? (verified.payload.aud as string)?.toString() ?? null,
      },
      $set: { expiresAt }, // refresh TTL on use
    },
    { upsert: true, new: true }
  );

  if (doc?.revoked) {
    const err: any = new Error("Token revoked");
    err.status = 401;
    throw err;
  }

  return { userId, userName, jti, expiresAt };
}

export function requireAuth() {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const auth = req.headers.authorization || "";
      const m = auth.match(/^Bearer\s+(.+)$/i);
      if (!m) return res.status(401).json({ status: "error", message: "Missing Bearer token" });

      const token = m[1].trim();
      const verified = await verifyJwt(token);
      const session = await ensureTokenSession(token, verified);

      // Attach user info for downstream
      (req as any).user = {
        id: session.userId,
        name: session.userName,
        jti: session.jti,
        tokenExpiresAt: session.expiresAt,
        claims: verified.payload,
      };

      next();
    } catch (err: any) {
      const code = err?.status || 401;
      return res.status(code).json({
        status: "error",
        message: err?.message || "Unauthorized",
      });
    }
  };
}