# Cloudflare Worker Deployment Guide

## 🎯 Problem
The current workers don't forward cookies, causing 100% captcha failure rate. The portal's ASP.NET session cookies are required for captcha validation.

## ✅ Solution
Deploy the updated `cloudflare-worker-proxy.js` to all 10 workers.

---

## Option 1: Automated Deployment (Recommended)

### Prerequisites
```bash
# Install Wrangler CLI
npm install -g wrangler

# Login to Cloudflare
wrangler login
```

### Deploy
```bash
cd /Users/ibranansari/Desktop/Attend75
./deploy-workers.sh
```

This will automatically deploy to all 10 workers in sequence.

---

## Option 2: Manual Deployment via Dashboard

### Step-by-Step for Each Worker

1. **Go to Cloudflare Dashboard**
   - Visit: https://dash.cloudflare.com/
   - Navigate to: Workers & Pages

2. **For Each Worker** (repeat 10 times):
   
   **Worker 1:** `attend75-proxy`
   - Click on the worker name
   - Click "Edit Code" button
   - **Delete ALL existing code**
   - Copy the contents of `cloudflare-worker-proxy.js`
   - Paste into the editor
   - Click "Save and Deploy"
   - Wait for "Deployed successfully" message
   
   **Worker 2:** `attend75-proxy-2`
   - (Repeat same steps)
   
   **Worker 3:** `attend75-proxy-3`
   - (Repeat same steps)
   
   **Worker 4:** `attend75-proxy-4`
   - (Repeat same steps)
   
   **Worker 5:** `attend75-proxy-5`
   - (Repeat same steps)
   
   **Worker 6:** `attend75-proxy-6`
   - (Repeat same steps)
   
   **Worker 7:** `attend75-proxy-7`
   - (Repeat same steps)
   
   **Worker 8:** `attend75-proxy-8`
   - (Repeat same steps)
   
   **Worker 9:** `attend75-proxy-9`
   - (Repeat same steps)
   
   **Worker 10:** `attend75-proxy-10`
   - (Repeat same steps)

---

## Option 3: Individual Worker Deployment via CLI

For a single worker:
```bash
wrangler deploy cloudflare-worker-proxy.js --name attend75-proxy
```

Replace `attend75-proxy` with the worker name you want to update.

---

## 🧪 Test After Deployment

### 1. Test Cookie Forwarding
```bash
cd /Users/ibranansari/Desktop/Attend75/backend
python3 test_session_cookies.py
```

**Expected output:**
```
Cookies after page load: {'CenterID': '8'}
Cookies after captcha load: {'CenterID': '8', 'ASP.NET_SessionId': 'xxx'}
```

If you see `ASP.NET_SessionId`, cookies are working! ✅

### 2. Test Actual Login
```bash
python3 test_login.py "24FMUCHH014059" "YOUR_PASSWORD"
```

**Expected:** No more "incorrect security code" errors. Should either succeed or show password/username error.

---

## 📋 Checklist

- [ ] Updated worker code exists at `/Users/ibranansari/Desktop/Attend75/cloudflare-worker-proxy.js`
- [ ] Deployed to `attend75-proxy` (Worker 1)
- [ ] Deployed to `attend75-proxy-2` (Worker 2)
- [ ] Deployed to `attend75-proxy-3` (Worker 3)
- [ ] Deployed to `attend75-proxy-4` (Worker 4)
- [ ] Deployed to `attend75-proxy-5` (Worker 5)
- [ ] Deployed to `attend75-proxy-6` (Worker 6)
- [ ] Deployed to `attend75-proxy-7` (Worker 7)
- [ ] Deployed to `attend75-proxy-8` (Worker 8)
- [ ] Deployed to `attend75-proxy-9` (Worker 9)
- [ ] Deployed to `attend75-proxy-10` (Worker 10)
- [ ] Tested cookie forwarding
- [ ] Tested actual login

---

## ⚠️ Important Notes

1. **All 10 workers must be updated** - If even one worker still has the old code, it will cause intermittent failures
2. **Password issue separate** - The current test shows "incorrect password" from portal, which is a different issue from captcha
3. **Verify credentials** - Make sure your portal password is correct by testing at http://111.93.16.209/sz/login.aspx

---

## 🆘 Troubleshooting

### "Captcha still failing after deployment"
- Verify ALL 10 workers were updated (check deployment timestamp in dashboard)
- Clear browser cache and cookies
- Run `python3 test_session_cookies.py` to verify cookies are being set

### "Wrangler login fails"
- Try: `wrangler logout && wrangler login`
- Make sure you're logged into the correct Cloudflare account

### "Worker not found error"
- Double-check worker name spelling
- Verify workers exist in your Cloudflare account

---

## 📞 Support

If deployment fails or you need help, the updated worker code is in:
`/Users/ibranansari/Desktop/Attend75/cloudflare-worker-proxy.js`

You can always copy-paste this code manually into each worker through the Cloudflare dashboard.
