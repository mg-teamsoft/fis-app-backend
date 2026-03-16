import { Request, Response } from "express";
import { v4 as uuidv4 } from "uuid";
import { ContactInviteModel } from "../models/ContactInviteModel";
import { ContactLinkModel } from "../models/ContactLinkModel";
import { UserModel } from "../models/User";
import { ContactPermissions } from "../types/contactPermissions";
import { JwtUtil } from "../utils/jwtUtil";
import { sendContactInviteEmail } from "../services/sendEmailService";
import { acceptInviteById, listPendingInvitesForSupervisor, rejectInviteById, revokeContactLink } from "../services/contactService";
import { randomTokenHex, sha256 } from "../utils/cryptoUtil";
import { normalizeEmail } from "../utils/normalizeUtil";
import config from "../configs/config";

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
const allowedPermissions = new Set(Object.values(ContactPermissions));

function buildInviteLinks(token: string) {
  const frontendBase = (config.frontendUrl ?? "").replace(/\/$/, "");
  const encodedToken = encodeURIComponent(token);

  if (frontendBase) {
    return {
      acceptUrl: `${frontendBase}/contacts/invites/accept?token=${encodedToken}`,
      registerThenAcceptUrl: `${frontendBase}/register?inviteToken=${encodedToken}`,
    };
  }

  return {
    acceptUrl: token,
    registerThenAcceptUrl: token,
  };
}

// Customer revokes supervisor access (active link)
export async function revokeLink(req: Request, res: Response) {
  const { userId } = await JwtUtil.extractUser(req);
  if (!userId) {
    return res.status(401).json({ message: "Unauthorized" });
  }

  const linkId = req.params.id;

  if (!linkId) {
    return res.status(400).json({ status: "error", message: "linkId is required" });
  }

  try {
    const link = await revokeContactLink({ linkId, customerUserId: userId });
    return res.json({ status: "ok", link });
  } catch (e: any) {
    const status = e?.statusCode ?? 500;
    return res.status(status).json({
      status: "error",
      message: e?.message ?? "Failed to revoke link",
    });
  }
}

// Customer creates invite
export async function createContactInvite(req: Request, res: Response) {
  const { userId } = await JwtUtil.extractUser(req);
  if (!userId) {
    return res.status(401).json({ message: "Unauthorized" });
  }

  const { inviteeEmail, permissions } = req.body ?? {};
  if (!inviteeEmail || typeof inviteeEmail !== "string") {
    return res.status(400).json({ message: "inviteeEmail is required." });
  }

  const normalizedInviteeEmail = normalizeEmail(inviteeEmail);
  const inviter = await UserModel.findOne({ userId }).select("userName email").lean();
  if (!inviter) {
    return res.status(404).json({ message: "Inviter user not found." });
  }

  if ((inviter.email ?? "").toLowerCase() === normalizedInviteeEmail) {
    return res.status(400).json({ message: "You cannot invite yourself." });
  }


  const requestedPermissions: string[] = Array.isArray(permissions) && permissions.length > 0
    ? permissions
    : [ContactPermissions.VIEW_RECEIPTS, ContactPermissions.DOWNLOAD_FILES];

  const hasInvalidPermission = requestedPermissions.some((perm) => !allowedPermissions.has(perm as any));
  if (hasInvalidPermission) {
    return res.status(400).json({
      message: "Invalid permissions. Allowed: VIEW_RECEIPTS, DOWNLOAD_FILES",
    });
  }
  try {
    const inviteeUser = await UserModel.findOne({ email: normalizedInviteeEmail }).select("userId").lean();
    if (inviteeUser) {
      const existingActiveLink = await ContactLinkModel.findOne({
        customerUserId: userId,
        supervisorUserId: inviteeUser.userId,
        isActive: true,
      }).lean();
      if (existingActiveLink) {
        return res.status(409).json({ message: "This supervisor already has active access." });
      }
    }

    const existingPendingInvite = await ContactInviteModel.findOne({
      inviterUserId: userId,
      inviteeEmail: normalizedInviteeEmail,
      status: "PENDING",
      expiresAt: { $gt: new Date() },
    }).lean();
    if (existingPendingInvite) {
      return res.status(409).json({ message: "A pending invite already exists for this supervisor." });
    }

    const rawToken = randomTokenHex();
    console.log(`Generated invite token (not hashed): ${rawToken} for email: ${normalizedInviteeEmail}`); // Debug log
    const tokenHash = sha256(rawToken);
    const expiresAt = new Date(Date.now() + SEVEN_DAYS_MS);

    const invite = await ContactInviteModel.create({
      inviteId: uuidv4(),
      inviterUserId: userId,
      inviteeEmail: normalizedInviteeEmail,
      inviteeUserId: inviteeUser?.userId ?? null,
      status: "PENDING",
      tokenHash,
      permissions: requestedPermissions,
      expiresAt,
    });

    const links = buildInviteLinks(rawToken);
    try {
      await sendContactInviteEmail({
        toEmail: normalizedInviteeEmail,
        inviterDisplayName: inviter.userName ?? "A customer",
        isRegistered: Boolean(inviteeUser),
        acceptUrl: links.acceptUrl,
        registerThenAcceptUrl: links.registerThenAcceptUrl,
        expiresAt,
        permissions: requestedPermissions,
      });
    } catch (emailError: any) {
      await ContactInviteModel.deleteOne({ _id: invite._id });
      return res.status(500).json({
        message: "Failed to send invite email.",
        error: emailError?.message,
      });
    }

    res.locals.auditPayload = {
      inviteId: invite.inviteId,
      inviteeEmail: normalizedInviteeEmail,
      permissions: requestedPermissions,
      expiresAt,
    };
    res.locals.auditMessage = "Contact invite created";

    return res.status(201).json({
      inviteId: invite.inviteId,
      status: invite.status,
      inviteeEmail: invite.inviteeEmail,
      permissions: invite.permissions,
      expiresAt: invite.expiresAt,
      inviteeRegistered: Boolean(inviteeUser),
    });
  } catch (error: any) {
    if (error?.code === 11000) {
      return res.status(409).json({ message: "A duplicate invite exists." });
    }
    return res.status(500).json({ message: "Failed to create contact invite.", error: error?.message });
  }
}

// Supervisor lists pending invite
export async function getPendingInvites(req: Request, res: Response) {
  const { userId } = await JwtUtil.extractUser(req);
  if (!userId) {
    return res.status(401).json({ message: "Unauthorized" });
  }

  try {
    const invites = await listPendingInvitesForSupervisor(userId);
    return res.json({ status: "ok", invites });
  } catch (e: any) {
    return res.status(500).json({
      status: "error",
      message: e?.message ?? "Failed to fetch pending invites",
    });
  }
}

// Supervisor accepts invite
export async function acceptInvite(req: Request, res: Response) {
  const { userId } = await JwtUtil.extractUser(req);
  if (!userId) {
    return res.status(401).json({ message: "Unauthorized" });
  }
  const inviteId = req.params.id;
  const { token } = req.body ?? {};

  if (!inviteId) {
    return res.status(400).json({ status: "error", message: "inviteId is required" });
  }
  if (!token || typeof token !== "string") {
    return res.status(400).json({ status: "error", message: "token is required" });
  }

  try {
    const link = await acceptInviteById({ inviteId, supervisorUserId: userId, token });
    return res.json({ status: "ok", link });
  } catch (e: any) {
    const status = e?.statusCode ?? 500;
    return res.status(status).json({
      status: "error",
      message: e?.message ?? "Failed to accept invite",
    });
  }
}

// Supervisor rejects invite
export async function rejectInvite(req: Request, res: Response) {
  const { userId } = await JwtUtil.extractUser(req);
  if (!userId) {
    return res.status(401).json({ message: "Unauthorized" });
  }
  const inviteId = req.params.id;
  if (!inviteId) return res.status(400).json({ status: "error", message: "inviteId is required" });

  const { token } = req.body ?? {};
  if (!token || typeof token !== "string") {
    return res.status(400).json({ status: "error", message: "token is required" });
  }

  try {
    const invite = await rejectInviteById({ inviteId, supervisorUserId: userId, token });
    return res.json({ status: "ok", invite });
  } catch (e: any) {
    return res.status(e?.statusCode ?? 500).json({
      status: "error",
      message: e?.message ?? "Failed to reject invite",
    });
  }
}

// Customer lists my supervisors (active links)
export async function listMySupervisors(req: Request, res: Response) {
  const { userId } = await JwtUtil.extractUser(req);
  if (!userId) {
    return res.status(401).json({ message: "Unauthorized" });
  }
  
  try {
    const supervisors = await listActiveSupervisorsForCustomer(userId);
    return res.json({ status: "ok", supervisors });
  } catch (e: any) {
    return res.status(500).json({ status: "error", message: e?.message ?? "Failed to list supervisors" });
  }
}

// Supervisor lists my customers (active links)
export async function listMyCustomers(req: Request, res: Response) {
  const { userId } = await JwtUtil.extractUser(req);
  if (!userId) {
    return res.status(401).json({ message: "Unauthorized" });
  }

  try {
    const customers = await listActiveCustomersForSupervisor(userId);
    return res.json({ status: "ok", customers });
  } catch (e: any) {
    return res.status(500).json({ status: "error", message: e?.message ?? "Failed to list customers" });
  }
}

export async function listActiveSupervisorsForCustomer(customerUserId: string) {
  const links = await ContactLinkModel.find({ customerUserId, isActive: true })
    .select({ linkId: 1, supervisorUserId: 1, permissions: 1, createdAt: 1 })
    .sort({ createdAt: -1 })
    .lean();

  const supervisorIds = links.map((l: { supervisorUserId: string }) => l.supervisorUserId);

  // Optional enrichment with userName/email
  const users = await UserModel.find({ userId: { $in: supervisorIds } })
    .select({ userId: 1, userName: 1, email: 1 })
    .lean();

  const userById = new Map(users.map((u: { userId: string; userName?: string; email?: string }) => [u.userId, u]));

  return links.map((l: { linkId: string; supervisorUserId: string; permissions: string[]; createdAt: Date }) => ({
    linkId: l.linkId,
    supervisorUserId: l.supervisorUserId,
    permissions: l.permissions,
    createdAt: l.createdAt,
    supervisor: userById.get(l.supervisorUserId) ?? null,
  }));
}

export async function listActiveCustomersForSupervisor(supervisorUserId: string) {
  const links = await ContactLinkModel.find({ supervisorUserId, isActive: true })
    .select({ linkId: 1, customerUserId: 1, permissions: 1, createdAt: 1 })
    .sort({ createdAt: -1 })
    .lean();

  const customerIds = links.map((l: { customerUserId: string }) => l.customerUserId);

  const users = await UserModel.find({ userId: { $in: customerIds } })
    .select({ userId: 1, userName: 1, email: 1 })
    .lean();

  const userById = new Map(users.map((u: { userId: string; userName?: string; email?: string }) => [u.userId, u]));

  return links.map((l: { linkId: string; customerUserId: string; permissions: string[]; createdAt: Date }) => ({
    linkId: l.linkId,
    customerUserId: l.customerUserId,
    permissions: l.permissions,
    createdAt: l.createdAt,
    customer: userById.get(l.customerUserId) ?? null,
  }));
}

