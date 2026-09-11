# FIS_APP

Backend for the receipt OCR pipeline. It presigns uploads to S3, runs OCR + parsing, tracks async jobs, and writes per-user Excel workbooks.

## What It Does
- Presigned S3 upload flow with duplicate detection via `sha256`
- Async OCR job runner (Tesseract → Textract → OpenAI fallback) with status tracking in MongoDB
- Manual Excel append endpoint (per-user workbook stored in S3)
- Auth + email verification; most routes are JWT-protected
- Swagger UI available at `http://localhost:3000/api-docs`

## Folder Structure

```
FIS_APP/
├── dist/             # Compiled JS output
├── output/           # Generated Excel files
├── src/
│   ├── configs/      # Configuration files
│   ├── model/        # Request/response models
│   ├── routes/       # API endpoints
│   ├── scripts/      # Python OCR script
│   ├── services/     # Business logic
│   ├── types/        # Type definitions
│   ├── utils/        # Utility functions
│   ├── app.ts        # Express app entry
│   └── index.ts      # Server bootstrap
├── uploads/          # Uploaded image files
├── package.json      # Project metadata
└── tsconfig.json     # TypeScript config
```

## Requirements
- Node.js 18+
- MongoDB (set `MONGODB_URI` and optionally `MONGODB_DB`)
- AWS S3 credentials (`S3_BUCKET`, `AWS_REGION`, `S3_UPLOAD_PREFIX`)
- JWT secret/keys (`JWT_SECRET` or `JWT_PUBLIC_KEY`/`JWT_JWKS_URL`)
- Python 3.x + Tesseract (`tur.traineddata` in your tessdata path) for local OCR

## Local Run
1. Copy `.env.example` if present (or create `.env`) and set at least:  
   `PORT=3000`, `MONGODB_URI=mongodb://localhost:27017/fis`, `S3_BUCKET=...`, `JWT_SECRET=...`, `FRONTEND_URL=...`
2. Install deps: `npm install`
3. Start dev server: `npm run dev` (or `npm run start` after `npm run build`)
4. Swagger UI: `http://localhost:3000/api-docs` (API base path is `/api`)

Docker Compose is available for Mongo + API: `docker-compose up -d --build`. Use the Makefile shortcuts (`make up`, `make down`, `make logs`, etc.) if you prefer.

## API Quickstart (JWT required unless noted)
Base URL: `http://localhost:3000/api`

1. Authenticate: `POST /auth/login` to get a Bearer token (register via `POST /auth/register` during development).
2. Presign upload: `POST /file/init` with `{ sha256, contentType, filename }` → returns `key`, `presignedUrl`, and required headers. Upload the file directly to S3 using that URL.
3. (Optional) Confirm object: `POST /file/confirm` with `{ key }` to verify metadata.
4. Start OCR job: `POST /upload/by-key` with `{ key, mime }` → returns `jobId` (requires verified email).
5. Poll status: `GET /job/{jobId}` or `GET /job/{jobId}/receipt` until `status` becomes `done`.
6. Save to Excel: `POST /excel/write` with `receiptJson` to append to the user's workbook; fetch presigned download via `GET /excel/files/{id}/presign`.
7. Synchronous fallback: `POST /image/upload` (multipart `receipts[]`) runs OCR immediately and returns parsed data in the response body.

Troubleshooting tips:
- Ensure your JWT uses the same issuer/audience configured in env.
- `/upload/by-key` returns 403 until the user verifies email via the link sent on registration.
- Missing `S3_BUCKET` or `MONGODB_URI` will make the server exit during startup.

## OpenAI Usage Logger

Both OpenAI extraction services write one `openai.usage` JSON record per completed
or failed SDK call to stdout and `logs/openai/usage-YYYY-MM-DD.jsonl`.
Set `OPENAI_USAGE_LOG_DIR` to change the directory and
`OPENAI_USAGE_LOG_TIMEZONE` to change the daily rotation timezone (default:
`Europe/Istanbul`). `timestamp` is ISO 8601 UTC. In containers, mount this log
directory on a persistent volume if files must survive container replacement.

Records include `endpoint`, `method`, `requestId` (the user HTTP request, also
returned as `X-Request-ID`), `callId`, `callNumber`, `jobId`/`fileId`, `model`,
`inputTokens`, `outputTokens`, `cachedInputTokens`, `totalTokens`,
`estimatedCostUsd`, `openaiRequestId`, `attempts`, `durationMs`, and `status`.
Request bodies and OCR text are not copied into these usage records. Background
work inherits the initiating request's context even after the HTTP response.
Calls made outside an HTTP context have a generated request ID and null endpoint.

Cost uses standard text API rates for `gpt-4o-mini` and its `2024-07-18` snapshot:
$0.15 input, $0.075 cached input, $0.60 output per million tokens, verified
2026-09-10 at https://developers.openai.com/api/docs/models/gpt-4o-mini.
The applied rates are included in each record. Update the rate table in
`src/utils/openAiUsageLogger.ts` when pricing changes or models are added.
Unknown models or missing usage produce null cost, never a fabricated zero.
Cost estimates cover returned usage only, not unreported retry usage or an
account-specific invoice. SDK retries increase `attempts`, not `callNumber`.
File write errors emit `openai.usage_write_failed` without failing extraction;
stdout remains available. On the first write each local day (and the first write
following a process restart), the logger deletes its own dated JSONL files older
than 30 days. The cutoff day is retained in full. Cleanup only targets regular
`usage-YYYY-MM-DD.jsonl` files in the configured directory; other files and
symlinks are left untouched. If there are no new writes, cleanup waits until the
next write. Cleanup failures are logged and retried the next day or restart.
This retention does not manage Docker/stdout log storage.
