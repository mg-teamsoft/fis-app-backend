import { Router, Request, Response } from "express";
import { SignJWT } from "jose";
import { v4 as uuidv4 } from "uuid";
import { UserModel } from "../models/User";
import { verifyPassword, hashPassword } from "../utils/password";
import { TokenSession, sha256 } from "../models/TokenSession";

const router = Router();
const ONE_DAY_SEC = 24 * 60 * 60;
const passwordRegex = /^(?=.*[A-Z])(?=.*[^a-zA-Z0-9]).{8,}$/;

// --- helper to sign HS256 JWT ---
async function signJwt(payload: Record<string, any>, expSeconds = ONE_DAY_SEC): Promise<{ token: string; exp: number }> {
  const secretStr = process.env.JWT_SECRET;
  if (!secretStr) throw new Error("JWT_SECRET is not set");
  const secret = new TextEncoder().encode(secretStr);

  const now = Math.floor(Date.now() / 1000);
  const exp = now + expSeconds;

  const jwt = await new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setIssuedAt(now)
    .setExpirationTime(exp)
    .setIssuer(process.env.JWT_ISSUER || "fis-app")
    .setAudience(process.env.JWT_AUDIENCE || "fis-api")
    .sign(secret);

  return { token: jwt, exp };
}

/**
 * (Optional) Register user for testing:
 * POST /auth/register
 * body: { userId, userName, password, email? }
 */
router.post("/register", async (req: Request, res: Response) => {
  try {
    let { userId, userName, password, email } = req.body || {};
    if (!userName || !password) {
      return res.status(400).json({ status: "error", message: "userName and password are required" });
    }
    if (!passwordRegex.test(password)) {
      return res.status(400).json({
        error: 'Password must be at least 8 characters, contain at least one uppercase letter and one special character.'
      });
    }
    // generate UUID if userId is null or empty
    if (!userId) {
      userId = uuidv4();
    }
    
    const exists = await UserModel.findOne({ $or: [{ userId }, { userName }] });
    if (exists) return res.status(409).json({ status: "error", message: "User already exists" });

    const passwordHash = await hashPassword(password);
    const user = await UserModel.create({ userId, userName, email: email ?? null, passwordHash });

    return res.json({ status: "success", message: "User created", data: { userId: user.userId, userName: user.userName } });
  } catch (err: any) {
    return res.status(500).json({ status: "error", message: err?.message || "Register failed" });
  }
});

/**
 * Login:
 * POST /auth/login
 * body: { userName, password }
 * response: { status, token, exp, user: { userId, userName } }
 */
router.post("/login", async (req: Request, res: Response) => {
  try {
    const { userName, password } = req.body || {};
    if (!userName || !password) {
      return res.status(400).json({ status: "error", message: "userName and password are required" });
    }

    const user = await UserModel.findOne({ userName });
    if (!user) return res.status(401).json({ status: "error", message: "Invalid credentials" });

    const ok = await verifyPassword(password, user.passwordHash);
    if (!ok) return res.status(401).json({ status: "error", message: "Invalid credentials" });

    // sign JWT with user info
    const { token, exp } = await signJwt({
      sub: user.userId,
      name: user.userName,
    });

    // persist session with 24h TTL (also limited by JWT exp)
    const tokenHash = sha256(token);
    const expiresAt = new Date(exp * 1000);
    await TokenSession.findOneAndUpdate(
      { tokenHash },
      {
        $setOnInsert: {
          tokenHash,
          userId: user.userId,
          userName: user.userName,
          issuer: process.env.JWT_ISSUER || "fis-app",
          audience: process.env.JWT_AUDIENCE || "fis-api",
        },
        $set: { expiresAt, revoked: false },
      },
      { upsert: true, new: true }
    );

    return res.json({
      status: "success",
      token,
      exp, // unix seconds
      // user: { userId: user.userId, userName: user.userName },
    });
  } catch (err: any) {
    return res.status(500).json({ status: "error", message: err?.message || "Login failed" });
  }
});

router.post("/revoke", async (req, res) => {
  const token = (req.body?.token as string) || "";
  if (!token) return res.status(400).json({ status: "error", message: "token is required" });

  const tokenHash = sha256(token);
  await TokenSession.findOneAndUpdate({ tokenHash }, { $set: { revoked: true } });
  return res.json({ status: "success", message: "token revoked" });
});

export default router;