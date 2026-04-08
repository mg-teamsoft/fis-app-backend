import { Request, Response } from "express";
import { NotificationModel } from "../models/NotificationModel";
import { NotificationUserStateModel } from "../models/NotificationUserStateModel";
import { JwtUtil } from "../utils/jwtUtil";

const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 50;

type NotificationListItem = {
  notificationId: string;
  userId: string;
  title: string;
  subtitle: string;
  content?: string;
  time: string;
  isUnread?: boolean;
};

type NotificationUserStateListItem = {
  notificationId: string;
  isUnread: boolean;
};

function parsePositiveInteger(value: unknown, fallback: number) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(parsed) || parsed < 1) {
    return fallback;
  }
  return parsed;
}

export async function listNotifications(req: Request, res: Response) {
  try {
    const { userId } = await JwtUtil.extractUser(req);
    if (!userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const page = parsePositiveInteger(req.query.page, DEFAULT_PAGE);
    const limit = Math.min(parsePositiveInteger(req.query.limit, DEFAULT_LIMIT), MAX_LIMIT);
    const skip = (page - 1) * limit;

    const [total, notifications] = await Promise.all([
      NotificationModel.countDocuments({ userId }),
      NotificationModel.find({ userId })
        .sort({ createdAt: -1, _id: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
    ]);
    const typedNotifications = notifications as NotificationListItem[];
    const notificationIds = typedNotifications.map((notification) => notification.notificationId);
    const readStates = notificationIds.length > 0
      ? await NotificationUserStateModel.find({
          userId,
          notificationId: { $in: notificationIds },
        }).lean()
      : [];
    const readStateMap = new Map(
      (readStates as NotificationUserStateListItem[]).map(
        (state: NotificationUserStateListItem) => [state.notificationId, state.isUnread]
      )
    );

    const totalPages = total === 0 ? 0 : Math.ceil(total / limit);

    res.locals.auditPayload = {
      page,
      limit,
      total,
      returnedCount: notifications.length,
    };
    res.locals.auditMessage = "Notifications listed";

    return res.json({
      items: typedNotifications.map((notification: NotificationListItem) => ({
        id: notification.notificationId,
        title: notification.title,
        subtitle: notification.subtitle,
        content: notification.content ?? "",
        time: notification.time,
        isUnread: readStateMap.has(notification.notificationId)
          ? readStateMap.get(notification.notificationId)
          : (notification.isUnread ?? true),
      })),
      pagination: {
        page,
        limit,
        total,
        totalPages,
        hasNextPage: page < totalPages,
        hasPreviousPage: page > 1,
      },
    });
  } catch (error: any) {
    return res.status(500).json({
      message: "Failed to list notifications.",
      error: error?.message,
    });
  }
}

export async function insertReadNotifications(req: Request, res: Response) {
  try {
    const { userId } = await JwtUtil.extractUser(req);
    if (!userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const body = req.body ?? {};
    const notificationIds = Array.isArray(body.notificationIds)
      ? body.notificationIds
      : (body.notificationId ? [body.notificationId] : []);

    const normalizedNotificationIds = [...new Set(
      notificationIds
        .map((notificationId: unknown) => String(notificationId ?? "").trim())
        .filter(Boolean)
    )];

    if (normalizedNotificationIds.length === 0) {
      return res.status(400).json({
        message: "notificationId or notificationIds is required.",
      });
    }

    const existingNotifications = await NotificationModel.find({
      userId,
      notificationId: { $in: normalizedNotificationIds },
    })
      .select("notificationId")
      .lean();

    const existingNotificationIds = existingNotifications.map(
      (notification: { notificationId: string }) => notification.notificationId
    );

    if (existingNotificationIds.length === 0) {
      return res.status(404).json({
        message: "No notifications found for the provided ids.",
      });
    }

    await NotificationUserStateModel.bulkWrite(
      existingNotificationIds.map((notificationId: string) => ({
        updateOne: {
          filter: { userId, notificationId },
          update: {
            $set: { isUnread: false },
            $setOnInsert: { userId, notificationId },
          },
          upsert: true,
        },
      }))
    );

    res.locals.auditPayload = {
      notificationIds: existingNotificationIds,
      insertedCount: existingNotificationIds.length,
    };
    res.locals.auditMessage = "Notification read states inserted";

    return res.status(201).json({
      status: "success",
      notificationIds: existingNotificationIds,
    });
  } catch (error: any) {
    return res.status(500).json({
      message: "Failed to insert read notifications.",
      error: error?.message,
    });
  }
}
