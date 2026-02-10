#!/bin/sh
set -e

echo "Running database migrations..."
cd /app
prisma migrate deploy

echo "Starting server with memory limits..."
# Limit Node.js heap to 512MB to reduce Railway costs while staying stable
exec node --max-old-space-size=512 server.js
