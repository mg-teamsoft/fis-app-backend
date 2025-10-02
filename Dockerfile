# Use official Node.js base image
FROM node:20-slim

# Install Python, Tesseract, required tools, and create non-root user
RUN apt-get update && \
  apt-get install -y python3 python3-pip tesseract-ocr tesseract-ocr-tur && \
  apt-get clean && \
  rm -rf /var/lib/apt/lists/* && \
  useradd -m -s /bin/bash appuser

# Set working directory
WORKDIR /app

# Copy package files and install dependencies
COPY package*.json ./
RUN npm ci

# 📌 Copy Python requirements and install Python packages
COPY src/scripts/requirements.txt ./scripts/
RUN pip3 install --break-system-packages --no-cache-dir -r scripts/requirements.txt

# Copy all source files
COPY . .

# Compile TypeScript, check build output, prune dev dependencies, and change ownership in one layer
RUN rm -rf dist \ 
  && npm run build \
  && ls dist/index.js || (echo "❌ Build failed: dist/index.js not found" && exit 1) \
  && npm prune --omit=dev \
  && chown -R appuser:appuser /app

# Switch to non-root user
USER appuser

# Expose service port
EXPOSE 3000

# Healthcheck (assumes /health-me endpoint exists)
HEALTHCHECK --interval=30s --timeout=10s --start-period=10s --retries=3 \
  CMD curl --fail http://localhost:3000/health-me || exit 1

# Start the app
CMD ["node", "dist/index.js"]
