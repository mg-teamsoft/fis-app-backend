import { Router, Request, Response } from "express";
import { SignJWT } from "jose";
import { v4 as uuidv4 } from "uuid";
import { UserModel } from "../models/User";
import { verifyPassword, hashPassword } from "../utils/password";
import { TokenSession, sha256 } from "../models/TokenSession";
import crypto from 'crypto';
import { sendVerificationEmail, sendWelcomeEmail, sendPasswordResetEmail } from "../services/sendEmailService";
import { purchasePlan } from "../controllers/planController";

const router = Router();
const ONE_DAY_SEC = 24 * 60 * 60;
const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^a-zA-Z0-9]).{8,}$/;

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
    let { userId, userName, password, email, planKey } = req.body || {};
    if (!userName || !password) {
      return res.status(400).json({ status: "error", message: "userName and password are required" });
    }

    if (!passwordRegex.test(password)) {
      return res.status(400).json({
        error: 'Password must be at least 8 characters, contain at least (1 uppercase & 1 lowercase & 1 number & 1 special) char.'
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

    const token = crypto.randomBytes(32).toString('hex');
    const expires = new Date(Date.now() + 24 * 60 * 60 * 1000); // 1 day

    user.verificationToken = token;
    user.verificationTokenExpires = expires;
    await user.save();

    if (planKey) {
      try {
        await purchasePlan(user.userId, planKey);
      } catch (planError: any) {
        return res.status(400).json({
          status: "error",
          message: "Plan assignment failed",
          detail: planError?.message || "Unknown error",
        });
      }
    }

    const verificationLink = `${process.env.FRONTEND_URL}/api/auth/verify-email?token=${token}`;
    await sendVerificationEmail(email!, verificationLink);

    return res.json({ status: "success", message: "User created", data: { userId: user.userId, userName: user.userName } });
  } catch (err: any) {
    return res.status(500).json({ status: "error", message: err?.message || "Register failed" });
  }
});

/**
 * verify user email
 * GET /auth/verify-email
 * body: { token }
 */
router.get("/verify-email", async (req: Request, res: Response) => {
  try {
    const { token } = req.query;
    const user = await UserModel.findOne({ verificationToken: token });

    if (!user || user.verificationTokenExpires < new Date()) {
      return res.status(400).json({ message: 'Invalid or expired token' });
    }

    user.emailVerified = true;
    user.verificationToken = undefined;
    user.verificationTokenExpires = undefined;
    await user.save();

    // Send Welcome Email
    await sendWelcomeEmail(user.email, user.userName || ' Kullanıcı');

    return res.json({ message: 'Email verified successfully' });
  } catch (err: any) {
    return res.status(500).json({ status: "error", message: err?.message || "Verify email failed" });
  }
});

/**
 * resend user email
 * POST /auth/resend-email-verification
 * body: { token }
 */
router.post("/resend-email-verification", async (req: Request, res: Response) => {
  try {
    const { email } = req.body;

    const user = await UserModel.findOne({ email });
    if (!user) return res.status(404).json({ error: 'Kullanıcı bulunamadı.' });

    if (user.isEmailVerified) {
      return res.status(400).json({ error: 'E-posta zaten doğrulandı.' });
    }

    const token = crypto.randomBytes(32).toString('hex');
    const expires = new Date(Date.now() + 24 * 60 * 60 * 1000); // 1 day
    user.verificationToken = token;
    user.verificationTokenExpires = expires;
    await user.save();

    const verificationLink = `${process.env.FRONTEND_URL}/api/auth/verify-email?token=${token}`;
    await sendVerificationEmail(user.email, verificationLink);

    return res.json({ message: 'Doğrulama e-postası tekrar gönderildi.' });
  } catch (err: any) {
    return res.status(500).json({ status: "error", message: err?.message || "Verify email failed" });
  }
});

router.post("/request-password-reset", async (req: Request, res: Response) => {
  try {
    const { email } = req.body || {};
    if (!email) {
      return res.status(400).json({ status: "error", message: "email is required" });
    }

    const user = await UserModel.findOne({ email });
    if (!user) {
      return res.json({ status: "success", message: "If the account exists, a reset email has been sent." });
    }

    const token = crypto.randomBytes(32).toString('hex');
    const expires = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

    user.passwordResetToken = token;
    user.passwordResetExpires = expires;
    await user.save();

    const baseUrl = process.env.FRONTEND_URL ?? '';
    const resetLink = baseUrl ? `${baseUrl}/api/auth/reset-password?token=${token}` : token;

    await sendPasswordResetEmail(user.email!, resetLink);

    return res.json({ status: "success", message: "If the account exists, a reset email has been sent." });
  } catch (err: any) {
    return res.status(500).json({ status: "error", message: err?.message || "Request password reset failed" });
  }
});

router.post("/reset-password", async (req: Request, res: Response) => {
  try {
    const { token, password } = req.body || {};
    if (!token || !password) {
      return res.status(400).json({ status: "error", message: "token and password are required" });
    }

    if (!passwordRegex.test(password)) {
      return res.status(400).json({
        error: 'Password must be at least 8 characters, contain at least (1 uppercase & 1 lowercase & 1 number & 1 special) char.'
      });
    }

    const user = await UserModel.findOne({
      passwordResetToken: token,
      passwordResetExpires: { $gt: new Date() },
    });

    if (!user) {
      return res.status(400).json({ status: "error", message: "Invalid or expired token" });
    }

    user.passwordHash = await hashPassword(password);
    user.passwordResetToken = undefined;
    user.passwordResetExpires = undefined;
    await user.save();

    return res.json({ status: "success", message: "Password has been reset successfully." });
  } catch (err: any) {
    return res.status(500).json({ status: "error", message: err?.message || "Reset password failed" });
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
