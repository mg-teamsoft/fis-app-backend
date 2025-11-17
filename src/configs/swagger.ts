// src/swagger.ts
import swaggerJsdoc from 'swagger-jsdoc';
import swaggerUi from 'swagger-ui-express';

import { Express } from 'express';

const options: swaggerJsdoc.Options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'OCR Receipt API',
      version: '1.0.0',
      description: 'Secure API for presigned uploads, OCR processing, and Excel export',
    },
    servers: [
      {
        url: 'http://localhost:3000/api',
        description: 'Local API (defaults to /api prefix)',
      },
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          description: 'JWT issued by /auth/login',
        },
      },
      schemas: {
        ReceiptProduct: {
          type: 'object',
          properties: {
            name: { type: 'string' },
            quantity: { type: 'number', nullable: true },
            unitPrice: { type: 'number', nullable: true },
            lineTotal: { type: 'number' },
          },
          required: ['name', 'lineTotal'],
        },
        ReceiptData: {
          type: 'object',
          properties: {
            businessName: { type: 'string', nullable: true },
            transactionDate: { type: 'string', nullable: true },
            receiptNumber: { type: 'string', nullable: true },
            products: {
              type: 'array',
              items: { $ref: '#/components/schemas/ReceiptProduct' },
            },
            kdvAmount: { type: 'number', nullable: true },
            totalAmount: { type: 'number', nullable: true },
            transactionType: {
              type: 'object',
              nullable: true,
              properties: {
                type: { type: 'string' },
                kdvRate: { type: 'number', nullable: true },
              },
            },
            paymentType: { type: 'string', nullable: true },
          },
        },
        Job: {
          type: 'object',
          properties: {
            jobId: { type: 'string' },
            userId: { type: 'string' },
            sourceKey: { type: 'string' },
            status: { type: 'string', enum: ['queued', 'processing', 'done', 'error'] },
            receipt: { $ref: '#/components/schemas/ReceiptData' },
            error: { type: 'string', nullable: true },
            createdAt: { type: 'string', format: 'date-time' },
            updatedAt: { type: 'string', format: 'date-time' },
            finishedAt: { type: 'string', format: 'date-time', nullable: true },
          },
        },
        JobListItem: {
          type: 'object',
          properties: {
            jobId: { type: 'string' },
            userId: { type: 'string' },
            sourceKey: { type: 'string' },
            status: { type: 'string', enum: ['queued', 'processing', 'done', 'error'] },
            createdAt: { type: 'string', format: 'date-time' },
            updatedAt: { type: 'string', format: 'date-time' },
            finishedAt: { type: 'string', format: 'date-time', nullable: true },
          },
        },
      },
    },
    security: [{ bearerAuth: [] }],
    tags: [
      { name: 'Upload', description: 'Upload and OCR receipts' },
      { name: 'Files', description: 'Presigned upload helpers' },
      { name: 'Jobs', description: 'Async processing jobs' },
      { name: 'Excel', description: 'Excel export helpers' },
    ],
  },
  apis: ['./src/routes/**/*.ts'],
};

const specs = swaggerJsdoc(options);

export function setupSwagger(app: Express) {
  app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(specs));
}
