# Stage 1: Build the frontend
FROM node:20-slim AS builder

WORKDIR /app

# Install build dependencies
COPY package*.json ./
RUN npm install

# Copy the source code
COPY . .

# Build the frontend assets. Song data is generated at runtime from the mounted content repo.
RUN npm run build:app

# Stage 2: Final image
FROM node:20-slim

# Install Python, Git, and other necessary tools
RUN apt-get update && apt-get install -y \
    python3 \
    python3-pip \
    python3-venv \
    git \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy built frontend from stage 1
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/public ./public
COPY --from=builder /app/package*.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/tsconfig*.json ./
COPY --from=builder /app/scripts ./scripts
COPY --from=builder /app/src/lib ./src/lib
COPY --from=builder /app/src/types.ts ./src/types.ts
COPY --from=builder /app/backend ./backend

# Install Python dependencies
COPY backend/requirements.txt ./backend/
RUN python3 -m venv /opt/venv && \
    /opt/venv/bin/pip install --no-cache-dir -r backend/requirements.txt

# Add node_modules/.bin to PATH for tsx
ENV PATH="/app/node_modules/.bin:/opt/venv/bin:$PATH"

# Make songs and dist directories writable
RUN mkdir -p /app/songs /app/dist/data && chmod -R 777 /app/songs /app/dist /app/backend

# Set environment variables
ENV NODE_ENV=production
ENV SONGS_OUTPUT_DIR=/app/dist/data

# Expose the backend/frontend port
EXPOSE 8000

# Start the application
CMD ["python3", "backend/main.py"]
