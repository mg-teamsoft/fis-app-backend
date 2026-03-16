import { ContactInviteModel } from "../models/ContactInviteModel";
import { ContactLinkModel } from "../models/ContactLinkModel";
import { UserModel } from "../models/User";
import { randomUuid, sha256 } from "../utils/cryptoUtil";

export async function revokeContactLink(args: {
  linkId: string;
  customerUserId: string;
}) {
  const { linkId, customerUserId } = args;
  const now = new Date();

  // Ensure the link exists and belongs to this customer (owner check)
  const link = await ContactLinkModel.findOne({ linkId }).lean();
  if (!link) {
    const e: any = new Error("Link not found");
    e.statusCode = 404;
    throw e;
  }

  if (link.customerUserId !== customerUserId) {
    const e: any = new Error("Forbidden: you do not own this link");
    e.statusCode = 403;
    throw e;
  }

  // Idempotent revoke
  if (link.isActive === false) {
    return link; // already revoked
  }

  const updated = await ContactLinkModel.findOneAndUpdate(
    { linkId, customerUserId },
    { $set: { isActive: false, revokedAt: now } },
    { new: true }
  ).lean();

  if (!updated) {
    const e: any = new Error("Failed to revoke link");
    e.statusCode = 500;
    throw e;
  }

  return updated;
}

export async function acceptInviteById(args: {
  inviteId: string;
  supervisorUserId: string;
  token: string;
}) {
  const { inviteId, supervisorUserId, token } = args;

  // 1) Load supervisor email (match-by-email default)
  const supervisor = await UserModel.findOne({ userId: supervisorUserId })
    .select({ email: 1, userId: 1 })
    .lean();

  const supervisorEmail = (supervisor?.email ?? "").trim().toLowerCase();
  const now = new Date();

  // 2) Load invite
  const invite = await ContactInviteModel.findOne({ inviteId }).lean();
  if (!invite) {
    const e: any = new Error("Invite not found");
    e.statusCode = 404;
    throw e;
  }

  // 3) Validate status + expiry
  if (invite.status !== "PENDING") {
    // idempotency: if already accepted, return existing link (if any)
    if (invite.status === "ACCEPTED") {
      const existing = await ContactLinkModel.findOne({
        customerUserId: invite.inviterUserId,
        supervisorUserId,
      }).lean();

      if (existing) return existing;

      // If invite accepted but link missing, we can recreate it
      const recreated = await ContactLinkModel.findOneAndUpdate(
        { customerUserId: invite.inviterUserId, supervisorUserId },
        { $set: { isActive: true, permissions: invite.permissions, revokedAt: null } },
        { new: true, upsert: true }
      ).lean();

      return recreated;
    }

    const e: any = new Error(`Invite is not pending (status=${invite.status})`);
    e.statusCode = 409;
    throw e;
  }

  if (invite.expiresAt && invite.expiresAt <= now) {
    // mark expired
    await ContactInviteModel.updateOne(
      { inviteId, status: "PENDING" },
      { $set: { status: "EXPIRED" } }
    );

    const e: any = new Error("Invite expired");
    e.statusCode = 410;
    throw e;
  }

  // 4) Verify token hash
  const tokenHash = sha256(token);
  if (tokenHash !== invite.tokenHash) {
    const e: any = new Error("Invalid token");
    e.statusCode = 401;
    throw e;
  }

  // 5) Ensure invite belongs to this supervisor (email or userId)
  const inviteEmail = (invite.inviteeEmail ?? "").trim().toLowerCase();

  const emailMatches = supervisorEmail && inviteEmail && supervisorEmail === inviteEmail;
  const userMatches = invite.inviteeUserId && invite.inviteeUserId === supervisorUserId;

  if (!emailMatches && !userMatches) {
    const e: any = new Error("Invite does not belong to this user");
    e.statusCode = 403;
    throw e;
  }

  // 6) Create / reactivate link (unique index prevents duplicates)
  const link = await ContactLinkModel.findOneAndUpdate(
    { customerUserId: invite.inviterUserId, supervisorUserId },
    {
      $set: {
        isActive: true,
        permissions: invite.permissions,
        revokedAt: null,
      },
      $setOnInsert: {
        linkId: randomUuid(),
        customerUserId: invite.inviterUserId,
        supervisorUserId,
      },
    },
    { new: true, upsert: true }
  ).lean();

  // 7) Mark invite accepted + set inviteeUserId
  await ContactInviteModel.updateOne(
    { inviteId, status: "PENDING" },
    {
      $set: {
        status: "ACCEPTED",
        inviteeUserId: supervisorUserId,
        respondedAt: now,
      },
    }
  );

  return link;
}

export async function listPendingInvitesForSupervisor(supervisorUserId: string) {
  // 1) Load user email (we match invites by email + userId)
  const user = await UserModel.findOne({ userId: supervisorUserId })
    .select({ email: 1, userId: 1 })
    .lean();

  const email = (user?.email ?? "").trim().toLowerCase();
  const now = new Date();

  // 2) Query: pending invites for this supervisor
  // Match by:
  // - inviteeUserId == supervisorUserId (if already linked)
  // - OR inviteeEmail == supervisor email (initial invite)
  const or: any[] = [{ inviteeUserId: supervisorUserId }];

  if (email) {
    or.push({ inviteeEmail: email });
  }

  // Optional: auto-expire old invites
  await ContactInviteModel.updateMany(
    { status: "PENDING", expiresAt: { $lte: now }, $or: or },
    { $set: { status: "EXPIRED" } }
  );

  const invites = await ContactInviteModel.find({
    status: "PENDING",
    expiresAt: { $gt: now },
    $or: or,
  })
    .select({
      inviteId: 1,
      inviterUserId: 1,
      inviteeEmail: 1,
      status: 1,
      permissions: 1,
      expiresAt: 1,
      createdAt: 1,
    })
    .sort({ createdAt: -1 })
    .lean();

  return invites;
}

export async function rejectInviteById(args: {
  inviteId: string;
  supervisorUserId: string;
  token: string;
}) {
  const { inviteId, supervisorUserId, token } = args;

  const supervisor = await UserModel.findOne({ userId: supervisorUserId })
    .select({ email: 1, userId: 1 })
    .lean();

  const supervisorEmail = (supervisor?.email ?? "").trim().toLowerCase();
  const now = new Date();

  const invite = await ContactInviteModel.findOne({ inviteId }).lean();
  if (!invite) {
    const e: any = new Error("Invite not found");
    e.statusCode = 404;
    throw e;
  }

  // idempotent: if already rejected/accepted/etc.
  if (invite.status !== "PENDING") {
    return invite;
  }

  if (invite.expiresAt && invite.expiresAt <= now) {
    await ContactInviteModel.updateOne(
      { inviteId, status: "PENDING" },
      { $set: { status: "EXPIRED" } }
    );
    const e: any = new Error("Invite expired");
    e.statusCode = 410;
    throw e;
  }

  // token check
  const tokenHash = sha256(token);
  if (tokenHash !== invite.tokenHash) {
    const e: any = new Error("Invalid token");
    e.statusCode = 401;
    throw e;
  }

  // ownership check (email or userId)
  const inviteEmail = (invite.inviteeEmail ?? "").trim().toLowerCase();
  const emailMatches = supervisorEmail && inviteEmail && supervisorEmail === inviteEmail;
  const userMatches = invite.inviteeUserId && invite.inviteeUserId === supervisorUserId;
  if (!emailMatches && !userMatches) {
    const e: any = new Error("Invite does not belong to this user");
    e.statusCode = 403;
    throw e;
  }

  await ContactInviteModel.updateOne(
    { inviteId, status: "PENDING" },
    { $set: { status: "REJECTED", inviteeUserId: supervisorUserId, respondedAt: now } }
  );

  return await ContactInviteModel.findOne({ inviteId }).lean();
}
