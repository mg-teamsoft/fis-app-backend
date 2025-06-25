# FIS_APP

This application processes receipt images, extracts text using OCR, and parses relevant fields such as date, total amount, and tax. Final results are exported to Excel.

## 📂 Folder Structure
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
├── .env              # Environment variables
├── package.json      # Project metadata
├── tsconfig.json     # TypeScript config
└── tur.traineddata   # Turkish OCR model

## 🛠️ Features

- 🖼 Upload image files via REST API
- 📖 Run OCR (Tesseract) via Python script
- 📄 Parse receipts into structured data
- 📥 Export to Excel
- ✅ Swagger UI for documentation
- 🔒 Role-based access in future scope

## 🚀 Run Instructions

```bash
npm install
npm run dev        # with nodemon
npm run build      # compile to dist/
npm run start      # run built app