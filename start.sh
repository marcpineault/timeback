#!/bin/sh
set -e

echo "Running database migrations..."
cd /app

# Try prisma migrate deploy. If it fails (e.g., tables already exist from
# a previous db push), mark the baseline migration as already applied and retry.
if prisma migrate deploy 2>&1; then
  echo "Migrations applied successfully."
else
  echo "migrate deploy failed — marking baseline as already applied..."
  prisma migrate resolve --applied "20260122134856_init" 2>&1 || true
  prisma migrate deploy 2>&1
  echo "Migrations applied after resolving baseline."
fi

echo "Starting server with memory limits..."
# Limit Node.js heap to 512MB to reduce Railway costs while staying stable
exec node --max-old-space-size=512 server.js
