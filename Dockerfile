# Use official Node.js base image
FROM node:20-slim

# Install Python, Tesseract, and required tools
RUN apt-get update && apt-get install -y \
  python3 \
  python3-pip \
  tesseract-ocr \
  && apt-get clean \
  && rm -rf /var/lib/apt/lists/*

# Create non-root user
RUN useradd -m -s /bin/bash appuser

# Set working directory
WORKDIR /app

# Copy package files and install dependencies
COPY package*.json ./
RUN npm install --production

# Copy app source
COPY . .

# Change ownership to appuser
RUN chown -R appuser:appuser /app

# Switch to non-root user
USER appuser

# Expose service port
EXPOSE 3000

# Healthcheck (assumes /health-me endpoint exists)
HEALTHCHECK --interval=30s --timeout=10s --start-period=10s --retries=3 \
  CMD curl --fail http://localhost:3000/health-me || exit 1

HEALTHCHECK --interval=30s --timeout=10s --start-period=10s --retries=3 \
  CMD curl --fail http://localhost:3000/health-me/db || exit 1

# Start the app
CMD ["node", "dist/index.js"]