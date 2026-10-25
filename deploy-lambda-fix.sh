#!/bin/bash
# Deploy Lambda 502 fix to Oracle Cloud VPS
set -e

VPS_IP="129.159.239.36"
VPS_USER="ubuntu"
SSH_KEY="$HOME/Downloads/oracle-vps.key"
DEPLOY_DIR="/opt/attend75"

echo "🚀 Deploying Lambda timeout fix to $VPS_IP..."

# Pull latest code on server
ssh -i "$SSH_KEY" $VPS_USER@$VPS_IP << 'ENDSSH'
cd /opt/attend75/repo
sudo git pull origin main

# Copy backend files (exclude .env, .venv, __pycache__, *.db)
sudo rsync -a --exclude='.env' --exclude='.venv/' --exclude='__pycache__/' --exclude='*.db' /opt/attend75/repo/backend/ /opt/attend75/backend/

# Restart backend
sudo systemctl restart attend75

# Wait for service to start
sleep 3

# Check status
sudo systemctl status attend75 --no-pager || true

# Test health endpoint
curl -s http://localhost:8000/health | head -5 || echo "Health check pending..."

# Clear Lambda blocks
curl -s -X POST http://localhost:8000/api/admin/clear-blocks || echo "Clear blocks called"

echo ""
echo "✅ Deployment complete!"
ENDSSH

echo ""
echo "📊 Lambda status: Lambda timeouts will now rotate to next endpoint without cooldown"
echo "🔧 Fix: HTTP 502 from Lambda now treated as timeout, not session issue"
echo ""
echo "Next: Try logging in to test Lambda — it should work without getting blocked"
