#!/bin/bash
# Start ngrok tunnel for PlayMeld local dev
# Uses canonical hostname: intensely-actual-chipmunk.ngrok-free.app
# Requires NGROK_AUTHTOKEN env var and ngrok installed

set -e

PORT=${1:-3000}
DOMAIN="intensely-actual-chipmunk.ngrok-free.app"

if ! command -v ngrok &> /dev/null; then
  echo "ngrok not found. Install from https://ngrok.com/download"
  exit 1
fi

if [ -z "$NGROK_AUTHTOKEN" ]; then
  echo "NGROK_AUTHTOKEN not set. Set env var or configure ~/.config/ngrok/ngrok.yml"
  echo "Get token from https://dashboard.ngrok.com/get-started/your-authtoken"
  exit 1
fi

echo "Starting ngrok tunnel..."
echo "Local: http://localhost:$PORT"
echo "Public: https://$DOMAIN"
echo "Health check: https://$DOMAIN/api/health"
echo "OAuth callback should be: https://$DOMAIN/api/connected-accounts/callback/spotify"
echo ""
echo "Make sure your Next.js app is running on port $PORT"
echo "Press Ctrl+C to stop"
echo ""

ngrok http --domain=$DOMAIN $PORT
