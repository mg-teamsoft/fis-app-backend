import { Request, Response } from "express";
import { v4 as uuidv4 } from "uuid";
import { ContactInviteModel } from "../models/ContactInviteModel";
import { ContactLinkModel } from "../models/ContactLinkModel";
import { UserModel } from "../models/User";
import { ContactPermissions } from "../types/contactPermissions";
import { JwtUtil } from "../utils/jwtUtil";
import { sendContactInviteEmail } from "../services/sendEmailService";
import { acceptInviteById, listInvitesCreatedByUser, listPendingInvitesForSupervisor, rejectInviteById, revokeContactLink } from "../services/contactService";
import { randomTokenHex, sha256 } from "../utils/cryptoUtil";
import { normalizeEmail } from "../utils/normalizeUtil";
import config from "../configs/config";

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
const allowedPermissions = new Set(Object.values(ContactPermissions));

function readInviteToken(req: Request): string | undefined {
  const bodyToken = req.body?.token ?? req.body?.inviteToken;
  if (typeof bodyToken === "string" && bodyToken.trim()) {
    return bodyToken.trim();
  }

  const queryToken = req.query?.token ?? req.query?.inviteToken;
  if (typeof queryToken === "string" && queryToken.trim()) {
    return queryToken.trim();
  }

  return undefined;
}

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
      resendCount: 0,
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
      resendCount: invite.resendCount,
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

// Customer lists all invites they created
export async function listMyCreatedInvites(req: Request, res: Response) {
  const { userId } = await JwtUtil.extractUser(req);
  if (!userId) {
    return res.status(401).json({ message: "Unauthorized" });
  }

  try {
    const invites = await listInvitesCreatedByUser(userId);
    return res.json({ status: "ok", invites });
  } catch (e: any) {
    return res.status(500).json({
      status: "error",
      message: e?.message ?? "Failed to list created invites",
    });
  }
}

// Customer resends a pending invite once
export async function resendContactInvite(req: Request, res: Response) {
  const { userId } = await JwtUtil.extractUser(req);
  if (!userId) {
    return res.status(401).json({ message: "Unauthorized" });
  }

  const inviteId = req.params.id;
  if (!inviteId) {
    return res.status(400).json({ status: "error", message: "inviteId is required" });
  }

  const invite = await ContactInviteModel.findOne({ inviteId }).lean();
  if (!invite) {
    return res.status(404).json({ status: "error", message: "Invite not found" });
  }

  if (invite.inviterUserId !== userId) {
    return res.status(403).json({ status: "error", message: "Forbidden" });
  }

  if (invite.status !== "EXPIRED") {
    return res.status(409).json({ status: "error", message: "Only expired invites can be resent" });
  }

  if ((invite.resendCount ?? 0) >= 1) {
    return res.status(409).json({ status: "error", message: "Invite can only be resent once" });
  }

  const inviter = await UserModel.findOne({ userId }).select("userName").lean();
  if (!inviter) {
    return res.status(404).json({ status: "error", message: "Inviter user not found" });
  }

  const inviteeUser = await UserModel.findOne({ email: invite.inviteeEmail }).select("userId").lean();
  const nextInviteeUserId = inviteeUser?.userId ?? null;
  const rawToken = randomTokenHex();
  const nextTokenHash = sha256(rawToken);
  const nextExpiresAt = new Date(Date.now() + SEVEN_DAYS_MS);
  const nextResendCount = (invite.resendCount ?? 0) + 1;
  const links = buildInviteLinks(rawToken);

  await ContactInviteModel.updateOne(
    {
      inviteId,
      inviterUserId: userId,
      status: "EXPIRED",
      $or: [
        { resendCount: { $lt: 1 } },
        { resendCount: { $exists: false } },
      ],
    },
    {
      $set: {
        status: "PENDING",
        tokenHash: nextTokenHash,
        expiresAt: nextExpiresAt,
        inviteeUserId: nextInviteeUserId,
        resendCount: nextResendCount,
      },
    }
  );

  try {
    await sendContactInviteEmail({
      toEmail: invite.inviteeEmail,
      inviterDisplayName: inviter.userName ?? "A customer",
      isRegistered: Boolean(inviteeUser),
      acceptUrl: links.acceptUrl,
      registerThenAcceptUrl: links.registerThenAcceptUrl,
      expiresAt: nextExpiresAt,
      permissions: invite.permissions,
    });
  } catch (emailError: any) {
    await ContactInviteModel.updateOne(
      { inviteId, inviterUserId: userId },
      {
        $set: {
          tokenHash: invite.tokenHash,
          expiresAt: invite.expiresAt,
          inviteeUserId: invite.inviteeUserId ?? null,
          resendCount: invite.resendCount ?? 0,
        },
      }
    );

    return res.status(500).json({
      status: "error",
      message: "Failed to resend invite email.",
      error: emailError?.message,
    });
  }

  const updatedInvite = await ContactInviteModel.findOne({ inviteId })
    .select({
      inviteId: 1,
      inviterUserId: 1,
      inviteeEmail: 1,
      inviteeUserId: 1,
      resendCount: 1,
      status: 1,
      permissions: 1,
      expiresAt: 1,
      respondedAt: 1,
      createdAt: 1,
      updatedAt: 1,
    })
    .lean();

  res.locals.auditPayload = {
    inviteId,
    inviteeEmail: invite.inviteeEmail,
    resendCount: nextResendCount,
    expiresAt: nextExpiresAt,
  };
  res.locals.auditMessage = "Contact invite resent";

  return res.json({ status: "ok", invite: updatedInvite });
}

// Supervisor accepts invite
export async function acceptInvite(req: Request, res: Response) {
  const { userId } = await JwtUtil.extractUser(req);
  if (!userId) {
    return res.status(401).json({ message: "Unauthorized" });
  }
  const inviteId = req.params.id;
  const token = readInviteToken(req);

  if (!inviteId && (!token || typeof token !== "string")) {
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
  const token = readInviteToken(req);
  if (!inviteId && (!token || typeof token !== "string")) {
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

// Customer deletes supervisor access by supervisorUserId or linkId
export async function deleteMySupervisor(req: Request, res: Response) {
  const { userId } = await JwtUtil.extractUser(req);
  if (!userId) {
    return res.status(401).json({ message: "Unauthorized" });
  }

  const supervisorId = req.params.id;
  if (!supervisorId) {
    return res.status(400).json({ status: "error", message: "supervisor id is required" });
  }

  try {
    const now = new Date();
    const link = await ContactLinkModel.findOneAndUpdate(
      {
        customerUserId: userId,
        isActive: true,
        $or: [
          { supervisorUserId: supervisorId },
          { linkId: supervisorId },
        ],
      },
      { $set: { isActive: false, revokedAt: now } },
      { new: true }
    ).lean();

    if (!link) {
      return res.status(404).json({
        status: "error",
        message: "Active supervisor link not found.",
      });
    }

    res.locals.auditPayload = {
      linkId: link.linkId,
      supervisorUserId: link.supervisorUserId,
    };
    res.locals.auditMessage = "Supervisor access deleted";

    return res.json({ status: "ok", link });
  } catch (e: any) {
    return res.status(500).json({
      status: "error",
      message: e?.message ?? "Failed to delete supervisor",
    });
  }
}

// Supervisor lists my customers (active links)
export async function listMyCustomers(req: Request, res: Response) {
  const { userId } = await JwtUtil.extractUser(req);
  if (!userId) {
    return res.status(401).json({ message: "Unauthorized" });
  }

  try {
    const permission = typeof req.query.permission === "string" ? req.query.permission : undefined;
    const customers = await listActiveCustomersForSupervisor(userId, permission);
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

export async function listActiveCustomersForSupervisor(supervisorUserId: string, permission?: string | null) {
  const query: any = { supervisorUserId, isActive: true };
  if (permission) {
    query.permissions = permission;
  }

  const links = await ContactLinkModel.find(query)
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
