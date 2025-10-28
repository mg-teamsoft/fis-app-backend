// controllers/receiptController.ts
import { Request, Response } from 'express';
import ReceiptModel from '../models/ReceiptModel';
import { JwtUtil } from '../utils/jwtUtil';
import * as XLSX from 'xlsx';
import { monthNameTr } from '../utils/dateUtil';
import { ReceiptDataListItem } from '../types/receiptTypes';
import { GetObjectCommand } from '@aws-sdk/client-s3';
import { awsConfig } from '../configs/aws';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { createPresignedGetUrl } from '../services/s3Service';

export async function createReceipt(req: Request, res: Response) {
    try {
        const { userId: userId, fullname: fullname } = await JwtUtil.extractUser(req);
        if (!userId) return res.status(401).json({ message: 'Unauthorized' });

        const receiptBody = {
            ...req.body,
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

        const receipt = await ReceiptModel.create(receiptBody);
        return res.status(201).json(receipt);
    } catch (error: any) {
        if (error.code === 11000) {
            return res.status(409).json({
                message: 'Receipt already exists with this businessName, receiptNumber and transactionDate.',
            });
        }
        return res.status(500).json({ message: 'Internal server error. ', error: error.message });
    }
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

        const { businessName, receiptNumber, transactionDate } = req.query;

        const query: any = {};
        if (userId) query.userId = userId;
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
            .select('businessName receiptNumber totalAmount transactionDate');

        const response: ReceiptDataListItem[] = receipts.map((receipt) => ({
            id: receipt.id.toString(),
            businessName: receipt.businessName,
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

        const receipt = await ReceiptModel.findOne({ _id: req.params.id, userId });
        if (!receipt) return res.status(404).json({ message: 'Not found', id: req.params.id });

        // Generate signed URL for the image
        let signedImageUrl = '';
        if (receipt.imageUrl) {
            await createPresignedGetUrl(receipt.imageUrl).then((url) => {
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
