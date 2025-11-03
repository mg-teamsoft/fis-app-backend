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
  const startOfMonth = now.startOf('month').toDate();
  const endOfMonth = now.endOf('month').toDate();

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
