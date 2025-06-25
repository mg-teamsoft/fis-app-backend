// src/routes/jobs.ts
import { Router } from 'express';
import path from 'path';
import config from '../configs/config';
import { jobStore } from '../services/jobProcessor';

const router = Router();

/**
 * @swagger
 * /status/{jobId}:
 *   get:
 *     summary: Get OCR job status
 *     tags: [Jobs]
 *     parameters:
 *       - in: path
 *         name: jobId
 *         schema:
 *           type: string
 *         required: true
 *         description: Job ID returned after upload
 *     responses:
 *       200:
 *         description: Job status
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 jobId:
 *                   type: string
 *                 status:
 *                   type: string
 *       404:
 *         description: Job not found
 */
router.get('/status/:jobId', (req, res) => {
  const job = jobStore[req.params.jobId];
  if (!job) {
    res.status(404).json({ error: 'Job not found' });
  } 
  res.json({ jobId: job.jobId, status: job.status });
});

/**
 * @swagger
 * /download/{jobId}:
 *   get:
 *     summary: Download Excel file for a completed OCR job
 *     tags: [Jobs]
 *     parameters:
 *       - in: path
 *         name: jobId
 *         schema:
 *           type: string
 *         required: true
 *         description: Job ID of the completed OCR task
 *     responses:
 *       200:
 *         description: Excel file download
 *         content:
 *           application/vnd.openxmlformats-officedocument.spreadsheetml.sheet:
 *             schema:
 *               type: string
 *               format: binary
 *       404:
 *         description: Excel not ready or job not found
 */
router.get('/download/:jobId', (req, res) => {
  const job = jobStore[req.params.jobId];
  if (!job || job.status !== 'completed') {
   res.status(404).json({ error: 'Excel not ready' });
  }

  const filePath = path.join(__dirname, '..', config.outputDir, `${job.jobId}.xlsx`);
  res.download(filePath, 'fis_aktarimi.xlsx');
});

export default router;