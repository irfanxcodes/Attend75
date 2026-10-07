#!/bin/bash
#
# Deploy Cookie-Preserving Proxy to All 10 Cloudflare Workers
#
# Prerequisites:
#   1. Install Wrangler: npm install -g wrangler
#   2. Login: wrangler login
#   3. Ensure cloudflare-worker-proxy.js exists in current directory
#

set -e  # Exit on error

WORKER_FILE="cloudflare-worker-proxy.js"
ACCOUNT_ID="63ef39c35614df731c1a4edffc667397"

# Check if worker file exists
if [ ! -f "$WORKER_FILE" ]; then
    echo "❌ Error: $WORKER_FILE not found!"
    echo "   Make sure you're in the Attend75 directory"
    exit 1
fi

# Check if wrangler is installed
if ! command -v wrangler &> /dev/null; then
    echo "❌ Error: wrangler CLI not found!"
    echo ""
    echo "Install it with: npm install -g wrangler"
    echo "Then login with: wrangler login"
    exit 1
fi

# Array of worker names
WORKERS=(
    "attend75-proxy"
    "attend75-proxy-2"
    "attend75-proxy-3"
    "attend75-proxy-4"
    "attend75-proxy-5"
    "attend75-proxy-6"
    "attend75-proxy-7"
    "attend75-proxy-8"
    "attend75-proxy-9"
    "attend75-proxy-10"
)

echo "════════════════════════════════════════════════════════════════"
echo "Deploying Cookie-Preserving Proxy to All Workers"
echo "════════════════════════════════════════════════════════════════"
echo ""

TOTAL=${#WORKERS[@]}
SUCCESS=0
FAILED=0

for WORKER_NAME in "${WORKERS[@]}"; do
    echo "📦 Deploying to: $WORKER_NAME"
    
    if wrangler deploy "$WORKER_FILE" --name "$WORKER_NAME" --compatibility-date 2024-01-01; then
        echo "   ✅ SUCCESS"
        ((SUCCESS++))
    else
        echo "   ❌ FAILED"
        ((FAILED++))
    fi
    
    echo ""
done

echo "════════════════════════════════════════════════════════════════"
echo "Deployment Complete"
echo "════════════════════════════════════════════════════════════════"
echo "Total workers: $TOTAL"
echo "Successful: $SUCCESS"
echo "Failed: $FAILED"
echo ""

if [ $FAILED -eq 0 ]; then
    echo "🎉 All workers updated successfully!"
    echo ""
    echo "Next step: Test login at https://attend75.xyz"
else
    echo "⚠️  Some workers failed to deploy. Check the errors above."
    exit 1
fi
