# Portal Login Fix - Captcha OCR Issue

## Problem

The app is failing to log in because the captcha solver dependencies are missing:
- `ddddocr` (deep learning captcha OCR) - **NOT INSTALLED**
- `onnxruntime` (required by ddddocr) - **NOT INSTALLED**

This causes all login attempts to fail with "INCORRECT_PASSWORD" even when credentials are correct.

## Root Cause

The production server (`api.attend75.xyz` on Oracle Cloud) is missing the captcha OCR dependencies that were added when the portal switched from SVG captcha to PNG captcha in October 2026.

## Solution

### Step 1: SSH to Production Server

```bash
ssh opc@129.159.239.36
# or
ssh opc@api.attend75.xyz
```

### Step 2: Update Python Dependencies

```bash
cd /opt/attend75/backend

# Activate virtual environment
source .venv/bin/activate

# Pull latest code (if not already done)
git pull origin main

# Install/update dependencies (ddddocr was just added to requirements.txt)
pip install -r requirements.txt

# Verify ddddocr is installed
python3 -c "import ddddocr; print('ddddocr:', ddddocr.__version__)"
python3 -c "import onnxruntime; print('onnxruntime:', onnxruntime.__version__)"
```

### Step 3: Restart Backend Service

```bash
sudo systemctl restart attend75
sudo systemctl status attend75
```

### Step 4: Verify Fix

Test login from your local machine:

```bash
curl -X POST https://api.attend75.xyz/login \
  -H "Content-Type: application/json" \
  -d '{"roll_number":"24FMUCHH014059","password":"Hulk@112233"}'
```

You should see a successful response with attendance data, not "INCORRECT_PASSWORD".

## Alternative: Tesseract Fallback (if ddddocr fails)

If `ddddocr` installation fails due to dependency issues, install Tesseract as fallback:

```bash
# On Oracle Linux/RHEL
sudo yum install tesseract tesseract-langpack-eng

# On Ubuntu/Debian
sudo apt update && sudo apt install tesseract-ocr
```

Then restart the backend service.

## Technical Details

### Why This Happened

1. Portal switched from SVG captcha (text in XML) to PNG captcha (image) in Oct 2026
2. `captcha_solver.py` was updated to use ddddocr (99% accuracy)
3. But `ddddocr` was never added to `requirements.txt`
4. Production server continued working with old code/dependencies
5. When new code was deployed without installing ddddocr, captcha solving failed

### How Login Works

1. Frontend sends roll number + password to `/login/start` (async) or `/login` (sync)
2. Backend fetches portal login page
3. Backend extracts captcha image from page
4. **ddddocr solves the captcha** ← THIS STEP IS FAILING
5. Backend POSTs credentials + solved captcha to portal
6. Portal validates and redirects on success
7. Backend scrapes attendance and returns to frontend

### Error Flow When Captcha Fails

Without working captcha solver:
1. Captcha solve fails → empty captcha text submitted
2. Portal rejects login → shows login page again (not redirect)
3. Backend sees login page instead of success page
4. Backend classifies as "INCORRECT_PASSWORD"
5. Frontend shows 401 error

## Verification Checklist

After deploying the fix, verify:

- [ ] `ddddocr` is installed: `pip show ddddocr`
- [ ] `onnxruntime` is installed: `pip show onnxruntime`
- [ ] Backend service is running: `sudo systemctl status attend75`
- [ ] Health check passes: `curl https://api.attend75.xyz/health`
- [ ] Login succeeds with real credentials (not "INCORRECT_PASSWORD")
- [ ] Frontend app can log in successfully

## If Still Not Working

If login still fails after installing ddddocr:

1. Check backend logs:
   ```bash
   sudo journalctl -u attend75 -n 50 -f
   ```

2. Look for captcha-related errors:
   - "ddddocr failed"
   - "All OCR methods failed"
   - "CAPTCHA_OCR_FAILED"

3. Test captcha solving manually:
   ```python
   import ddddocr
   ocr = ddddocr.DdddOcr(show_ad=False)
   
   # Test with a sample captcha image
   with open('captcha.png', 'rb') as f:
       img_bytes = f.read()
       result = ocr.classification(img_bytes)
       print(f"Solved: {result}")
   ```

4. If ddddocr still fails, ensure Tesseract is installed as fallback (see Alternative above)

## Quick Fix Script

Save this as `fix_captcha.sh` on the production server:

```bash
#!/bin/bash
set -e

echo "Fixing captcha solver dependencies..."

cd /opt/attend75/backend
source .venv/bin/activate

echo "Installing ddddocr..."
pip install --upgrade ddddocr

echo "Verifying installation..."
python3 -c "import ddddocr; print('✅ ddddocr installed:', ddddocr.__version__)"
python3 -c "import onnxruntime; print('✅ onnxruntime installed:', onnxruntime.__version__)"

echo "Restarting backend service..."
sudo systemctl restart attend75

echo "Waiting for service to start..."
sleep 3

echo "Checking service status..."
sudo systemctl status attend75 --no-pager | head -20

echo ""
echo "✅ Fix applied! Test login now."
```

Run it:
```bash
chmod +x fix_captcha.sh
./fix_captcha.sh
```

## Contact

If issues persist, check:
- Backend logs: `/var/log/attend75/` or `journalctl -u attend75`
- Portal accessibility: `curl http://111.93.16.209/sz/login.aspx`
- Lambda endpoints: Check if they're returning 503 or timing out
