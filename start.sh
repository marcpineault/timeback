#!/bin/sh
set -e

echo "Running database migrations..."
node ./node_modules/prisma/build/index.js db push --schema=./prisma/schema.prisma --skip-generate

echo "Starting server..."
exec node server.js
