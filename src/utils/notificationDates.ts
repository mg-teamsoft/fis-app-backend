/** Add one UTC calendar month, clamping to the last day of the target month. */
export function nextNotificationMonth(start: Date): Date {
  const end = new Date(start);
  const day = end.getUTCDate();
  end.setUTCDate(1);
  end.setUTCMonth(end.getUTCMonth() + 1);
  const lastDay = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth() + 1, 0)).getUTCDate();
  end.setUTCDate(Math.min(day, lastDay));
  return end;
}

export function notificationVisibility(userId: string, registeredAt: Date, now = new Date()) {
  return {
    $and: [
      { $or: [{ userId }, { userId: null }] },
      { startDate: { $lte: now }, endDate: { $gt: now } },
      // Private notifications remain visible to their recipient; broadcasts target existing users.
      { $or: [{ userId }, { createdAt: { $gte: registeredAt } }] },
    ],
  };
}
