#!/bin/bash

# =============================================================================
# Script for deploying Event Logger to remote host (gif.murafon.srv08.ru)
# =============================================================================

set -e

# Configuration
REMOTE_HOST="gif.murafon.srv08.ru"
REMOTE_USER="root"
REMOTE_DIR="/opt/event-logger"
PROJECT_NAME="event-logger"

echo "=============================================="
echo "  Event Logger Deployment Script"
echo "=============================================="
echo ""

# Step 1: Build Docker image locally
echo "[1/5] Building Docker image locally..."
docker build -t ${PROJECT_NAME}:latest .

# Step 2: Save Docker image to tar file
echo "[2/5] Saving Docker image to tar file..."
docker save -o ${PROJECT_NAME}.tar ${PROJECT_NAME}:latest

# Step 3: Copy files to remote host
echo "[3/5] Copying files to remote host ${REMOTE_HOST}..."
scp ${PROJECT_NAME}.tar ${REMOTE_USER}@${REMOTE_HOST}:${REMOTE_DIR}/
scp docker-compose.yml ${REMOTE_USER}@${REMOTE_HOST}:${REMOTE_DIR}/
scp .env ${REMOTE_USER}@${REMOTE_HOST}:${REMOTE_DIR}/

# Step 4: Deploy on remote host
echo "[4/5] Deploying on remote host..."
ssh ${REMOTE_USER}@${REMOTE_HOST} << 'ENDSSH'
  cd ${REMOTE_DIR}
  
  # Load Docker image
  echo "Loading Docker image..."
  docker load -i ${PROJECT_NAME}.tar
  
  # Stop existing container
  echo "Stopping existing container (if any)..."
  docker compose stop ${PROJECT_NAME} 2>/dev/null || true
  
  # Remove existing container
  echo "Removing existing container (if any)..."
  docker compose rm -f ${PROJECT_NAME} 2>/dev/null || true
  
  # Start new container
  echo "Starting new container..."
  docker compose up -d ${PROJECT_NAME}
  
  # Clean up tar file
  echo "Cleaning up..."
  rm -f ${PROJECT_NAME}.tar
  
  # Show container status
  echo ""
  echo "Container status:"
  docker compose ps
  
  # Show logs
  echo ""
  echo "Last 20 lines of logs:"
  docker compose logs --tail=20 ${PROJECT_NAME}
ENDSSH

# Step 5: Cleanup local tar file
echo "[5/5] Cleaning up local files..."
rm -f ${PROJECT_NAME}.tar

echo ""
echo "=============================================="
echo "  Deployment Complete!"
echo "=============================================="
echo ""
echo "Application URL: http://${REMOTE_HOST}:3000"
echo "Swagger UI:      http://${REMOTE_HOST}:3000/api/docs"
echo "Health Check:    http://${REMOTE_HOST}:3000/health"
echo ""
