import express from 'express';
import dayjs from 'dayjs';
import { UserRulesModel } from '../models/UserRules';
import ReceiptModel from '../models/ReceiptModel';
import { JwtUtil } from '../utils/jwtUtil';
import { auditInterceptor } from '../middleware/auditInterceptor';
import config from '../configs/config';

const router = express.Router();

router.get('/summary', 
  auditInterceptor?.("HOME_SUMMARY") ?? ((req, _res, next) => next()),
  async (req, res) => {
    const { userId: userId, fullname: userName } = await JwtUtil.extractUser(req);

    const now = dayjs();
    const monthParam = req.query.month;
    const parsedMonth = monthParam !== undefined ? parseInt(monthParam as string, 10) : now.month() + 1;

    if (Number.isNaN(parsedMonth) || parsedMonth < 1 || parsedMonth > 12) {
      return res.status(400).json({ message: 'Invalid month. Provide a value between 1 and 12.' });
    }

    const targetMonth = now.month(parsedMonth - 1);
    const startOfMonth = targetMonth.startOf('month').toDate();
    const endOfMonth = targetMonth.endOf('month').toDate();

    try {
      // 1. Total limit from user rules
      const rule = await UserRulesModel.findOne({ userId });
      const monthlyLimitAmount = Number(rule?.rules?.MOUNTLY_TARGET_AMOUNT ?? config.monthlyLimitFallback);

      // 2. Sum of receipts in current month
      const receiptsThisMonth = await ReceiptModel.aggregate([
        {
          $match: {
            userId,
            transactionDate: { $gte: startOfMonth, $lte: endOfMonth }
          }
        },
        {
          $group: {
            _id: null,
            totalSpent: { $sum: '$totalAmount' }
          }
        }
      ]);
      const totalSpent = receiptsThisMonth[0]?.totalSpent ?? 0;

      // 3. Last 3 receipts this month
      const recentReceipts = await ReceiptModel.find({
        userId,
        transactionDate: { $gte: startOfMonth, $lte: endOfMonth }
      })
        .sort({ transactionDate: -1 })
        .limit(3)
        .select('businessName receiptNumber totalAmount transactionDate');

      return res.json({
        totalSpent,
        monthlyLimitAmount,
        limitUsageText: `${totalSpent} / ${monthlyLimitAmount}`,
        recentReceipts
      });
    } catch (err) {
      console.error('[Home Summary Error]', err);
      return res.status(500).json({ message: 'Failed to load home summary.' });
    }
});

export default router;
