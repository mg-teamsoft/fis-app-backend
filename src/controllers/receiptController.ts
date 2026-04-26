// controllers/receiptController.ts
import { Request, Response } from 'express';
import ReceiptModel from '../models/ReceiptModel';
import { JwtUtil } from '../utils/jwtUtil';
import * as XLSX from 'xlsx';
import { monthNameTr } from '../utils/dateUtil';
import { ReceiptDataListItem } from '../types/receiptTypes';
import { createPresignedGetUrl } from '../services/s3Service';
import { consumeQuota } from '../utils/consumeQuota';

type CreateReceiptOptions = {
    bodyOverride?: Record<string, any>;
};

type CreateReceiptResult = {
    ok: boolean;
    status: number;
    body?: any;
    receipt?: any;
};

export async function createReceiptInternal(req: Request, options?: CreateReceiptOptions): Promise<CreateReceiptResult> {
    try {
        const { userId: userId, fullname: fullname } = await JwtUtil.extractUser(req);
        if (!userId) {
            return { ok: false, status: 401, body: { message: 'Unauthorized' } };
        }

        const receiptBody = {
            ...(options?.bodyOverride ?? req.body),
            userId,
        };

        if (receiptBody.transactionDate) {
            const incomingDate = receiptBody.transactionDate;
            const asString = typeof incomingDate === 'string' ? incomingDate.trim() : null;

            if (asString && /^\d{2}\.\d{2}\.\d{4}$/.test(asString)) {
                const [day, month, year] = asString.split('.');
                receiptBody.transactionDate = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
            } else {
                const normalizedDate = new Date(incomingDate);
                if (!isNaN(normalizedDate.getTime())) {
                    normalizedDate.setUTCHours(0, 0, 0, 0);
                    receiptBody.transactionDate = normalizedDate;
                }
            }
        }

        const receiptIdentity = {
            businessName: receiptBody.businessName,
            receiptNumber: receiptBody.receiptNumber,
            transactionDate: receiptBody.transactionDate,
            userId,
        };

        const upsertResult = await ReceiptModel.findOneAndUpdate(
            receiptIdentity,
            { $set: receiptBody },
            {
                upsert: true,
                new: true,
                runValidators: true,
                setDefaultsOnInsert: true,
                includeResultMetadata: true,
            }
        );

        const receipt = upsertResult.value;
        const wasExistingReceipt = Boolean(upsertResult.lastErrorObject?.updatedExisting);

        if (!receipt) {
            return { ok: false, status: 500, body: { message: 'Failed to create or update receipt.' } };
        }

        if (!wasExistingReceipt) {
            try {
                await consumeQuota(userId);
            } catch (quotaError: any) {
                // Keep business rule consistent: receipt creation must cost quota.
                await ReceiptModel.deleteOne({ _id: receipt._id, userId }).catch(() => { });
                const quotaResponse = {
                    message: 'Paket hakkınız kalmadı. Yeni bir plan satın alın.',
                    error: quotaError?.message,
                };
                return { ok: false, status: 403, body: quotaResponse };
            }
        }

        return { ok: true, status: wasExistingReceipt ? 200 : 201, receipt };
    } catch (error: any) {
        if (error.code === 11000) {
            const duplicateResponse = {
                message: 'Receipt already exists with this businessName, receiptNumber and transactionDate.',
            };
            return { ok: false, status: 409, body: duplicateResponse };
        }
        const errorResponse = { message: 'Internal server error. ', error: error.message };
        return { ok: false, status: 500, body: errorResponse };
    }
}

export async function createReceipt(req: Request, res: Response) {
    const result = await createReceiptInternal(req);
    if (!result.ok) {
        return res.status(result.status).json(result.body);
    }
    return res.status(result.status).json(result.receipt);
}

export async function listReceipts(req: Request, res: Response) {
    try {
        const { userId: userId, fullname: fullname } = await JwtUtil.extractUser(req);
        if (!userId) return res.status(401).json({ message: 'Unauthorized' });

        const { businessName, receiptNumber, transactionDate } = req.query;

        const query: any = {};
        if (userId) query.userId = userId;
        if (businessName) query.businessName = { $regex: businessName as string, $options: 'i' };
        if (receiptNumber) query.receiptNumber = { $regex: receiptNumber as string, $options: 'i' };

        if (transactionDate) {
            // transactionDate can be string | ParsedQs | string[]; normalize to a single string
            const td = Array.isArray(transactionDate) ? transactionDate[0] : transactionDate;
            if (typeof td === 'string') {
                const dateParts = td.split('.');
                if (dateParts.length === 2) {
                    // Format: mm.yyyy → filter by month
                    const [month, year] = dateParts;
                    const startDate = new Date(`${year}-${month}-01`);
                    const endDate = new Date(startDate);
                    endDate.setMonth(endDate.getMonth() + 1);

                    query.transactionDate = {
                        $gte: startDate,
                        $lt: endDate,
                    };
                } else if (dateParts.length === 3) {
                    // Format: dd.mm.yyyy → filter by exact date
                    const [day, month, year] = dateParts;
                    const exactDate = new Date(`${year}-${month}-${day}`);
                    query.transactionDate = exactDate;
                }
            }
        }

        const receipts = await ReceiptModel
            .find(query)
            .sort({ transactionDate: -1 })
            .select('receiptNumber totalAmount imageUrl transactionDate');

        return res.json(receipts);
    } catch (error: any) {
        return res.status(500).json({ message: 'Internal server error.', error: error.message });
    }
}

export async function listReceiptListItems(req: Request, res: Response) {
    try {
        const { userId: userId, fullname: fullname } = await JwtUtil.extractUser(req);
        if (!userId) return res.status(401).json({ message: 'Unauthorized' });
        
        const queryUserId = req.accessScope?.customerUserId ?? userId;
        const { businessName, receiptNumber, transactionDate } = req.query;

        const query: any = {};
        if (queryUserId) query.userId = queryUserId;
        if (businessName) query.businessName = { $regex: businessName as string, $options: 'i' };
        if (receiptNumber) query.receiptNumber = { $regex: receiptNumber as string, $options: 'i' };

        if (transactionDate) {
            const td = Array.isArray(transactionDate) ? transactionDate[0] : transactionDate;
            if (typeof td === 'string') {
                const dateParts = td.split('.');
                if (dateParts.length === 2) {
                    const [month, year] = dateParts;
                    const startDate = new Date(`${year}-${month}-01`);
                    const endDate = new Date(startDate);
                    endDate.setMonth(endDate.getMonth() + 1);

                    query.transactionDate = {
                        $gte: startDate,
                        $lt: endDate,
                    };
                } else if (dateParts.length === 3) {
                    const [day, month, year] = dateParts;
                    const exactDate = new Date(`${year}-${month}-${day}`);
                    query.transactionDate = exactDate;
                }
            }
        }

        const receipts = await ReceiptModel
            .find(query)
            .sort({ transactionDate: -1 })
            .select('businessName businessTaxNo receiptNumber totalAmount transactionDate');

        const response: ReceiptDataListItem[] = receipts.map((receipt) => ({
            id: receipt.id.toString(),
            businessName: receipt.businessName,
            businessTaxNo: receipt.businessTaxNo ?? null,
            transactionDate: receipt.transactionDate ? receipt.transactionDate.toISOString() : null,
            receiptNumber: receipt.receiptNumber,
            totalAmount: typeof receipt.totalAmount === 'number' ? receipt.totalAmount : null,
        }));

        return res.json(response);
    } catch (error: any) {
        return res.status(500).json({ message: 'Internal server error.', error: error.message });
    }
}

export async function getReceiptDetail(req: Request, res: Response) {
    try {
        const { userId: userId, fullname: fullname } = await JwtUtil.extractUser(req);
        if (!userId) return res.status(401).json({ message: 'Unauthorized' });

        const queryUserId = req.accessScope?.customerUserId ?? userId;
        const receiptId = req.params.id ?? req.params.receiptId;
        if (!receiptId) return res.status(400).json({ message: 'Receipt id is required' });

        const receipt = await ReceiptModel.findOne({ _id: receiptId, userId: queryUserId });
        if (!receipt) return res.status(404).json({ message: 'Not found', id: receiptId });

        // Generate signed URL for the image
        let signedImageUrl = '';
        if (receipt.sourceKey) {
            await createPresignedGetUrl(receipt.sourceKey).then((url) => {
                signedImageUrl = url;
            
            }).catch((error) => {
                console.error('Error generating presigned URL:', error);
            });
        }
        receipt.imageUrl = signedImageUrl;

        return res.json(receipt);
    } catch (error: any) {
        return res.status(500).json({ message: 'Internal server error.', error: error.message });
    }
}

export async function exportReceiptsToExcel(req: Request, res: Response) {
    const { userId: userId, fullname: fullname } = await JwtUtil.extractUser(req);
    if (!userId) return res.status(401).json({ message: 'Unauthorized' });
    const { year, month } = req.query;

    if (!year || !month) {
        return res.status(400).json({ message: 'Missing "year" or "month" in query params' });
    }

    // Build date range for the query
    const startDate = new Date(Number(year), Number(month) - 1, 1); // First day of month
    const endDate = new Date(Number(year), Number(month), 1);       // First day of next month

    try {
        const receipts = await ReceiptModel.find({
            userId,
            transactionDate: {
                $gte: startDate,
                $lt: endDate,
            },
        }).sort({ transactionDate: -1 });

        const sheetData = receipts.map((r) => ({
            'Şirket Adı': r.businessName,
            'Vergi No': r.businessTaxNo ?? '',
            'İşlem Tarihi': r.transactionDate.toISOString().split('T')[0],
            'Fiş No': r.receiptNumber,
            'KDV Tutarı': r.vatAmount,
            'Toplam Tutar': r.totalAmount,
            'KDV Oranı (%)': r.vatRate,
            'İşlem Tipi': r.transactionType,
            'Ödeme Tipi': r.paymentType,
        }));

        const workbook = XLSX.utils.book_new();
        const worksheet = XLSX.utils.json_to_sheet(sheetData);
        XLSX.utils.book_append_sheet(workbook, worksheet, 'Fişler');

        const buffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'buffer' });
        const monthName = monthNameTr(startDate);
        const originalFileName = `${fullname}-Fişler-${monthName} ${year}.xlsx`;
        const fallbackFileName = originalFileName
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '') // strip accents for ASCII header
            .replace(/[^\w.-]/g, '_');

        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader(
            'Content-Disposition',
            `attachment; filename="${fallbackFileName}"; filename*=UTF-8''${encodeURIComponent(originalFileName)}`
        );
        res.send(buffer);
    } catch (error: any) {
        console.error('Error exporting receipts:', error);
        res.status(500).json({ message: 'Export failed', error: error.message });
    }
}
