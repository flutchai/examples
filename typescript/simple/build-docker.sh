#!/bin/bash
set -e

# Build Docker image for simple-graph-service
# Usage: ./build-docker.sh [VERSION]

# Load environment variables from .env file
if [ -f .env ]; then
  export $(grep -v '^#' .env | grep -E '^DOCKER_' | xargs)
fi

# Default values if not set in .env
DOCKER_REGISTRY=${DOCKER_REGISTRY:-"docker.io"}
DOCKER_IMAGE_NAME=${DOCKER_IMAGE_NAME:-"simple-graph-service"}
VERSION=${1:-"latest"}

# Construct full image tag
IMAGE_TAG="${DOCKER_REGISTRY}/${DOCKER_IMAGE_NAME}:${VERSION}"

echo "🐳 Building Docker image: ${IMAGE_TAG}"
echo "📦 Registry: ${DOCKER_REGISTRY}"
echo "🏷️  Version: ${VERSION}"
echo ""

docker build -t "${IMAGE_TAG}" .

echo ""
echo "✅ Build successful!"
echo ""
echo "Next steps:"
echo "  1. Push to registry: docker push ${IMAGE_TAG}"
echo "  2. Update k8s deployment image to: ${IMAGE_TAG}"
echo "  3. Apply deployment: kubectl apply -f <path-to-deployment.yaml>"
