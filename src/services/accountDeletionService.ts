import { AssetModel } from "../models/AssetModel";
import { AuditLogModel } from "../models/AuditLog";
import { AccountDeletionJobModel } from "../models/AccountDeletionJobModel";
import { ContactInviteModel } from "../models/ContactInviteModel";
import { ContactLinkModel } from "../models/ContactLinkModel";
import { ExcelFileModel } from "../models/ExcelFileModel";
import { JobModel } from "../models/JobModel";
import { NotificationModel } from "../models/NotificationModel";
import { NotificationUserStateModel } from "../models/NotificationUserStateModel";
import { PurchaseTransaction } from "../models/PurchaseTransactionModel";
import ReceiptModel from "../models/ReceiptModel";
import { TokenSession } from "../models/TokenSession";
import { UserPlan } from "../models/UserPlanModel";
import { UserRulesModel } from "../models/UserRules";
import { UserModel } from "../models/User";
import { awsConfig } from "../configs/aws";
import { deleteObjectsByPrefix } from "./s3Service";
import { v4 as uuidv4 } from "uuid";

type DeletedCounts = Record<string, number>;
const runningJobs = new Set<string>();
const MAX_DELETION_ATTEMPTS = 5;
const RETRY_DELAY_MS = 30_000;

function deletedCount(result: { deletedCount?: number } | null | undefined) {
  return result?.deletedCount ?? 0;
}

function userS3Prefixes(userId: string) {
  const prefixes = [
    `${awsConfig.uploadPrefix}${userId}/`,
    `receipts/images/${userId}/`,
    `receipts/excel/${userId}/`,
    `receipt/images/${userId}/`,
    `receipt/excel/${userId}/`,
  ];

  return [...new Set(prefixes)];
}

export async function deleteAccountData(userId: string) {
  const s3DeletedCounts = await Promise.all(
    userS3Prefixes(userId).map(async (prefix) => ({
      prefix,
      deletedCount: await deleteObjectsByPrefix(prefix),
    }))
  );

  const [
    assets,
    auditLogs,
    contactInvites,
    contactLinks,
    excelFiles,
    jobs,
    notifications,
    notificationUserStates,
    purchaseTransactions,
    receipts,
    tokenSessions,
    userPlans,
    userRules,
  ] = await Promise.all([
    AssetModel.deleteMany({ userId }),
    AuditLogModel.deleteMany({ userId }),
    ContactInviteModel.deleteMany({ $or: [{ inviterUserId: userId }, { inviteeUserId: userId }] }),
    ContactLinkModel.deleteMany({ $or: [{ customerUserId: userId }, { supervisorUserId: userId }] }),
    ExcelFileModel.deleteMany({ userId }),
    JobModel.deleteMany({ userId }),
    NotificationModel.deleteMany({ userId }),
    NotificationUserStateModel.deleteMany({ userId }),
    PurchaseTransaction.deleteMany({ userId }),
    ReceiptModel.deleteMany({ userId }),
    TokenSession.deleteMany({ userId }),
    UserPlan.deleteMany({ userId }),
    UserRulesModel.deleteMany({ userId }),
  ]);

  const deletedRecords: DeletedCounts = {
    assets: deletedCount(assets),
    auditLogs: deletedCount(auditLogs),
    contactInvites: deletedCount(contactInvites),
    contactLinks: deletedCount(contactLinks),
    excelFiles: deletedCount(excelFiles),
    jobs: deletedCount(jobs),
    notifications: deletedCount(notifications),
    notificationUserStates: deletedCount(notificationUserStates),
    purchaseTransactions: deletedCount(purchaseTransactions),
    receipts: deletedCount(receipts),
    tokenSessions: deletedCount(tokenSessions),
    userPlans: deletedCount(userPlans),
    userRules: deletedCount(userRules),
  };

  return {
    deletedRecords,
    deletedS3Objects: s3DeletedCounts.reduce((sum, item) => sum + item.deletedCount, 0),
    s3DeletedCounts,
  };
}

export async function enqueueAccountDeletion(userId: string, options: { schedule?: boolean } = {}) {
  const shouldSchedule = options.schedule ?? true;
  const existingJob = await AccountDeletionJobModel.findOne({
    userId,
    status: { $in: ["queued", "running", "failed"] },
  }).lean();

  if (existingJob) {
    if (shouldSchedule) {
      scheduleAccountDeletionJob(existingJob.jobId);
    }
    return existingJob;
  }

  const job = await AccountDeletionJobModel.create({
    jobId: uuidv4(),
    userId,
    status: "queued",
  });

  if (shouldSchedule) {
    scheduleAccountDeletionJob(job.jobId);
  }
  return job.toObject();
}

export async function getAccountDeletionStatus(jobId: string) {
  return AccountDeletionJobModel.findOne({ jobId })
    .select("-_id jobId status attempts deletedRecords deletedS3Objects s3DeletedCounts error startedAt finishedAt createdAt updatedAt")
    .lean();
}

export function scheduleAccountDeletionJob(jobId: string) {
  setImmediate(() => {
    runAccountDeletionJob(jobId).catch((error) => {
      console.error("[AccountDeletion] job failed outside handler", { jobId, error });
    });
  });
}

export async function resumePendingAccountDeletionJobs() {
  const jobs = await AccountDeletionJobModel.find({ status: { $in: ["queued", "running"] } })
    .select({ jobId: 1 })
    .lean();

  for (const job of jobs) {
    scheduleAccountDeletionJob(job.jobId);
  }
}

async function runAccountDeletionJob(jobId: string) {
  if (runningJobs.has(jobId)) return;
  runningJobs.add(jobId);

  try {
    const job = await AccountDeletionJobModel.findOneAndUpdate(
      { jobId, status: { $in: ["queued", "running", "failed"] } },
      {
        $set: { status: "running", error: null, startedAt: new Date() },
        $inc: { attempts: 1 },
      },
      { new: true }
    );

    if (!job?.userId) return;

    const cleanup = await deleteAccountData(job.userId);
    const deletedAt = new Date();
    await UserModel.deleteOne({ userId: job.userId });

    await AccountDeletionJobModel.updateOne(
      { jobId },
      {
        $set: {
          status: "done",
          userId: null,
          deletedRecords: {
            ...cleanup.deletedRecords,
            users: 1,
          },
          deletedS3Objects: cleanup.deletedS3Objects,
          s3DeletedCounts: cleanup.s3DeletedCounts,
          error: null,
          finishedAt: deletedAt,
        },
      }
    );
  } catch (error: any) {
    const currentJob = await AccountDeletionJobModel.findOne({ jobId }).select({ attempts: 1 }).lean();
    const shouldRetry = (currentJob?.attempts ?? 0) < MAX_DELETION_ATTEMPTS;

    await AccountDeletionJobModel.updateOne(
      { jobId },
      {
        $set: {
          status: shouldRetry ? "queued" : "failed",
          error: error?.message || "Account deletion failed",
          finishedAt: new Date(),
        },
      }
    );

    if (shouldRetry) {
      setTimeout(() => scheduleAccountDeletionJob(jobId), RETRY_DELAY_MS);
    }
  } finally {
    runningJobs.delete(jobId);
  }
}
