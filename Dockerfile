# Multi-stage build for minimal image size
FROM oven/bun:1 as base

WORKDIR /app

# Install system dependencies for language servers
RUN apt-get update && apt-get install -y \
    curl \
    git \
    python3 \
    python3-pip \
    golang-go \
    clangd \
    && rm -rf /var/lib/apt/lists/*

# Copy package files
COPY package.json bun.lockb ./

# Install Node dependencies
RUN bun install

# Install global language servers
RUN go install golang.org/x/tools/gopls@latest && \
    pip3 install --no-cache-dir pyright

# Copy source code
COPY . .

# Expose port
EXPOSE 3939

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:3939/health || exit 1

# Run the server
CMD ["bun", "run", "src/enhanced-server.ts"]