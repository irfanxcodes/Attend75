#!/bin/bash
# Production Server Diagnostic Script for Login Issues
# Run this on the Oracle Cloud server (129.159.239.36) as ubuntu user

set -e

echo "============================================================================"
echo "Attend75 Production Login Diagnostics"
echo "Server: $(hostname) - $(date)"
echo "============================================================================"

# Color codes
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Helper functions
check_ok() {
    echo -e "${GREEN}✓${NC} $1"
}

check_warn() {
    echo -e "${YELLOW}⚠${NC} $1"
}

check_fail() {
    echo -e "${RED}✗${NC} $1"
}

echo ""
echo "1. Backend Service Status"
echo "────────────────────────────────────────────────────────────────────────────"
if systemctl is-active --quiet attend75; then
    check_ok "Backend service is running"
    systemctl status attend75 --no-pager -n 3
else
    check_fail "Backend service is NOT running!"
    systemctl status attend75 --no-pager -n 10
fi

echo ""
echo "2. Health Check"
echo "────────────────────────────────────────────────────────────────────────────"
HEALTH=$(curl -s http://localhost:8000/health 2>&1)
if echo "$HEALTH" | grep -q "Backend is running"; then
    check_ok "Health endpoint responding"
else
    check_fail "Health endpoint not responding: $HEALTH"
fi

echo ""
echo "3. Python Dependencies Check"
echo "────────────────────────────────────────────────────────────────────────────"
cd /opt/attend75/backend
source .venv/bin/activate

# Check ddddocr
if python3 -c "import ddddocr; print('ddddocr', ddddocr.__version__)" 2>/dev/null; then
    check_ok "ddddocr is installed"
else
    check_fail "ddddocr is NOT installed!"
fi

# Check onnxruntime
if python3 -c "import onnxruntime; print('onnxruntime', onnxruntime.__version__)" 2>/dev/null; then
    check_ok "onnxruntime is installed"
else
    check_fail "onnxruntime is NOT installed!"
fi

# Check tesseract
if command -v tesseract &> /dev/null; then
    check_ok "tesseract is installed: $(tesseract --version | head -1)"
else
    check_warn "tesseract is NOT installed (fallback only)"
fi

echo ""
echo "4. Recent Login Errors (Last 50 lines)"
echo "────────────────────────────────────────────────────────────────────────────"
sudo journalctl -u attend75 -n 50 --no-pager | grep -i "login\|captcha\|lambda\|auth" | tail -20 || echo "No login-related logs found"

echo ""
echo "5. Captcha Solver Test"
echo "────────────────────────────────────────────────────────────────────────────"
cat > /tmp/test_captcha.py << 'PYEOF'
import sys
sys.path.insert(0, '/opt/attend75/backend')

import requests
from services.captcha_solver import fetch_and_solve

# Download a fresh captcha from portal
captcha_url = "http://111.93.16.209/sz/captchimage.ashx?t=123456789"
session = requests.Session()

try:
    result = fetch_and_solve(captcha_url, session)
    print(f"✓ Captcha solved successfully: {result}")
except Exception as e:
    print(f"✗ Captcha solving FAILED: {e}")
    import traceback
    traceback.print_exc()
PYEOF

python3 /tmp/test_captcha.py

echo ""
echo "6. Environment Variables Check"
echo "────────────────────────────────────────────────────────────────────────────"
if [ -f /opt/attend75/backend/.env ]; then
    check_ok ".env file exists"
    echo "   Lambda endpoints configured: $(grep -c 'AWS_LAMBDA_ENDPOINTS' /opt/attend75/backend/.env || echo 0)"
    echo "   API Gateway endpoints configured: $(grep -c 'AWS_API_GATEWAY_ENDPOINTS' /opt/attend75/backend/.env || echo 0)"
else
    check_fail ".env file NOT found!"
fi

echo ""
echo "7. Lambda Rotator Status"
echo "────────────────────────────────────────────────────────────────────────────"
cat > /tmp/test_lambda_rotator.py << 'PYEOF'
import sys
sys.path.insert(0, '/opt/attend75/backend')

from dotenv import load_dotenv
load_dotenv('/opt/attend75/backend/.env')

from services.lambda_rotator import lambda_rotator

stats = lambda_rotator.get_usage_stats()
print(f"Monthly usage: {stats['monthly_usage']:,} / {stats['monthly_cap']:,} ({stats['usage_percent']}%)")
print(f"Available endpoints: {stats['available_endpoints']} / {stats['total_endpoints']}")
print(f"Is available: {lambda_rotator.is_available()}")

if not lambda_rotator.is_available():
    print("✗ Lambda is NOT available (monthly cap hit or all endpoints blocked)")
else:
    print("✓ Lambda is available")
PYEOF

python3 /tmp/test_lambda_rotator.py

echo ""
echo "8. Test Actual Login Flow"
echo "────────────────────────────────────────────────────────────────────────────"
cat > /tmp/test_login.py << 'PYEOF'
import sys
sys.path.insert(0, '/opt/attend75/backend')

from dotenv import load_dotenv
load_dotenv('/opt/attend75/backend/.env')

from scrapers.portal_scraper import PortalScraper, PortalAuthenticationError, PortalNetworkError
import logging

logging.basicConfig(level=logging.INFO)

roll = "24FMUCHH014059"
password = "Hulk@112233"

print(f"Testing login for: {roll}")

try:
    scraper = PortalScraper()
    print(f"Base URL: {scraper.base_url}")
    
    result = scraper.login(roll, password)
    print(f"✓ Login SUCCEEDED!")
    print(f"  Student: {result.get('student_name')}")
    print(f"  Attendance records: {len(result.get('attendance', []))}")
    
except PortalAuthenticationError as e:
    print(f"✗ Authentication Error: {e.code}")
    print(f"  Message: {e}")
    
except PortalNetworkError as e:
    print(f"✗ Network Error: {e.code}")
    print(f"  Stage: {e.stage}")
    print(f"  Message: {e}")
    
except Exception as e:
    print(f"✗ Unexpected Error: {type(e).__name__}")
    print(f"  Message: {e}")
    import traceback
    traceback.print_exc()
PYEOF

python3 /tmp/test_login.py

echo ""
echo "9. Disk Space"
echo "────────────────────────────────────────────────────────────────────────────"
df -h / | tail -1

echo ""
echo "10. Memory Usage"
echo "────────────────────────────────────────────────────────────────────────────"
free -h

echo ""
echo "============================================================================"
echo "Diagnostic Complete"
echo "============================================================================"
echo ""
echo "Next Steps:"
echo "  1. If ddddocr is missing: pip install ddddocr && sudo systemctl restart attend75"
echo "  2. If captcha test fails: Check logs above for specific error"
echo "  3. If login test fails: Note the error code and check Lambda endpoints"
echo ""
