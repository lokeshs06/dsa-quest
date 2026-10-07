#!/usr/bin/env bash
set -e

echo "============================================="
echo "   Deploying Judge0 CE v1.13.1"
echo "============================================="

# Ensure Docker and Docker Compose are installed
if ! command -v docker &> /dev/null; then
    echo "❌ Docker is not installed. Please install Docker first."
    exit 1
fi

# judge0.conf holds passwords, so it is not in git: make one from the example with fresh passwords
if [ ! -f judge0.conf ]; then
    echo "==> Creating judge0.conf with newly generated passwords..."
    cp judge0.conf.example judge0.conf
    sed -i "s/^REDIS_PASSWORD=.*/REDIS_PASSWORD=$(openssl rand -hex 16)/" judge0.conf
    sed -i "s/^POSTGRES_PASSWORD=.*/POSTGRES_PASSWORD=$(openssl rand -hex 16)/" judge0.conf
fi

# Step 1: Start Redis and Postgres DB
echo "==> Step 1/3: Starting database and Redis..."
docker compose up -d db redis

echo "==> Waiting 10 seconds for DB & Redis to initialize..."
sleep 10s

# Step 2: Start Judge0 server and workers
echo "==> Step 2/3: Starting Judge0 server and background workers..."
docker compose up -d

echo "==> Waiting 5 seconds for Judge0 server startup..."
sleep 5s

# Step 3: Verify installation
echo "==> Step 3/3: Verifying Judge0 API..."
if curl -s -f http://localhost:2358/system_info > /dev/null; then
    echo "✅ Judge0 is successfully running on http://localhost:2358"
    echo "📖 Interactive API docs: http://localhost:2358/docs"
else
    echo "⚠️ Started, but check status with: docker compose ps"
fi
