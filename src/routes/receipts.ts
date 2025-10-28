import express from 'express';
import {
  createReceipt,
  listReceipts,
  getReceiptDetail,
  exportReceiptsToExcel,
  listReceiptListItems,
} from '../controllers/receiptController';
import { auditInterceptor } from '../middleware/auditInterceptor';

const router = express.Router();

router.post('/', auditInterceptor('RECEIPT_CREATE'), createReceipt);
router.get('/', auditInterceptor('RECEIPT_LIST'), listReceipts);
router.get('/listReceiptListItems', auditInterceptor('RECEIPT_LIST_ITEM'), listReceiptListItems);
router.get('/export', auditInterceptor('RECEIPT_EXPORT'), exportReceiptsToExcel);
router.get('/:id', auditInterceptor('RECEIPT_DETAIL'), getReceiptDetail);

export default router;
