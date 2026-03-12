#!/bin/bash

# =============================================================================
# Script for deploying Event Logger to remote host (gif.murafon.srv08.ru)
# =============================================================================

set -e

# Configuration
REMOTE_HOST="gif.murafon.srv08.ru"
REMOTE_USER="root"
REMOTE_DIR="/opt/event-logger"
IMAGE_NAME="event-logger-ms-clickhouse-event-logger:latest"
TAR_FILE="event-logger.tar"

echo "=============================================="
echo "  Event Logger Deployment Script"
echo "=============================================="
echo ""

# Step 1: Build Docker image locally
echo "[1/5] Building Docker image locally..."
docker compose build

# Step 2: Save Docker image to tar file
echo "[2/5] Saving Docker image to tar file..."
docker save -o ${TAR_FILE} ${IMAGE_NAME}

# Step 3: Copy files to remote host
echo "[3/5] Copying files to remote host ${REMOTE_HOST}..."
scp ${TAR_FILE} ${REMOTE_USER}@${REMOTE_HOST}:${REMOTE_DIR}/
scp docker-compose.yml ${REMOTE_USER}@${REMOTE_HOST}:${REMOTE_DIR}/
scp .env ${REMOTE_USER}@${REMOTE_HOST}:${REMOTE_DIR}/

# Step 4: Deploy on remote host
echo "[4/5] Deploying on remote host..."
ssh ${REMOTE_USER}@${REMOTE_HOST} << ENDSSH
  cd ${REMOTE_DIR}

  # Load Docker image
  echo "Loading Docker image..."
  docker load -i ${TAR_FILE}

  # Stop existing container
  echo "Stopping existing container (if any)..."
  docker compose stop 2>/dev/null || true

  # Remove existing container
  echo "Removing existing container (if any)..."
  docker compose rm -f 2>/dev/null || true

  # Start new container
  echo "Starting new container..."
  docker compose up -d

  # Clean up tar file
  echo "Cleaning up..."
  rm -f ${TAR_FILE}

  # Show container status
  echo ""
  echo "Container status:"
  docker compose ps

  # Show logs
  echo ""
  echo "Last 20 lines of logs:"
  docker compose logs --tail=20
ENDSSH

# Step 5: Cleanup local tar file
echo "[5/5] Cleaning up local files..."
rm -f ${TAR_FILE}

echo ""
echo "=============================================="
echo "  Deployment Complete!"
echo "=============================================="
echo ""
echo "Application URL: http://${REMOTE_HOST}:3000"
echo "Swagger UI:      http://${REMOTE_HOST}:3000/api/docs"
echo "Health Check:    http://${REMOTE_HOST}:3000/health"
echo ""
