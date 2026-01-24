#!/bin/sh
set -e

echo "Running database migrations..."
cd /app
prisma db push --accept-data-loss

echo "Starting server with memory limits..."
# Limit Node.js heap to 256MB to reduce Railway costs
exec node --max-old-space-size=256 server.js
