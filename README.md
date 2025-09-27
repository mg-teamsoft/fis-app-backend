# FIS_APP

This application processes receipt images, extracts text using OCR, and parses relevant fields such as date, total amount, and tax. Final results are exported to Excel.

## 📂 Folder Structure

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
```

## 🐳 Docker Workflow

### Compose basics

- Ensure Docker and Docker Compose are installed locally.
- Copy or create an environment file for your target stage (for example `.env.dev` or `.env.prod`). The compose stack reads the file declared via the `ENV` flag in the Makefile (defaults to `.env.dev`).
- Build and start the stack:
  ```bash
  docker-compose --env-file .env.dev -p fis-app up -d --build
  ```
- Stop the stack:
  ```bash
  docker-compose -p fis-app down
  ```

### Using the provided Makefile

Most common Docker Compose commands are aliased in the root `Makefile`.

```bash
# start services (defaults to ENV=dev)
make up

# build containers without starting
make build

# watch logs or inspect status
make logs
make ps

# stop services when you're done
make down
```

Switch between environments by overriding `ENV`:

```bash
make up ENV=prod
```

The Make targets also include helpers such as `make shell` (opens a shell in the backend container), `make mongo-shell` (Mongo shell), `make test`, and `make prune`. Run `make help` to see the full list.

### Container health checks

The Dockerfile exposes port `3000` and defines health checks against `/health-me` and `/health-me/db`. Ensure the `dist/` build exists before building the image (`npm run build`) or mount the source in development mode via compose.

## 📚 API Documentation

Swagger available at: `http://localhost:<PORT>/docs`

---

## 🔧 Requirements

- Node.js 18+
- Python 3.x
- Tesseract installed
- `tur.traineddata` copied into Tesseract's `tessdata` directory
