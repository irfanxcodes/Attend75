# Portal Timeout Optimization

## Problem
Login takes too long (10+ seconds) to show error when college portal is down.

## Root Cause
`PORTAL_CONNECT_TIMEOUT_SECONDS=10` in backend/.env causes each connection attempt to wait 10 seconds before timing out.

## Solution Applied
Reduced `PORTAL_CONNECT_TIMEOUT_SECONDS` from **10 seconds** to **3 seconds**.

## Impact

### Before (10s timeout):
- Portal down → 10s × 2-5 retries = **20-50 seconds** to show error
- User sees "Just a moment..." for 20-50 seconds

### After (3s timeout):
- Portal down → 3s × 2-5 retries = **6-15 seconds** to show error  
- User sees "Just a moment..." for 6-15 seconds
- **67-70% faster** error detection

### When Portal is UP:
- **No impact** - normal connection is <1 second
- Login still takes same ~19 seconds (portal pages are slow)

## Configuration Change

**File:** `backend/.env`

```diff
- PORTAL_CONNECT_TIMEOUT_SECONDS=10
+ PORTAL_CONNECT_TIMEOUT_SECONDS=3
```

## Deployment

On production server:
```bash
ssh ubuntu@129.159.239.36
cd /opt/attend75/backend
sudo nano .env
# Change PORTAL_CONNECT_TIMEOUT_SECONDS from 10 to 3
sudo systemctl restart attend75
```

## Optional Frontend Enhancement

For **instant** error detection (3s instead of 6-15s), add a pre-flight portal status check in the frontend:

```typescript
// Before attempting login, check portal status
const statusResponse = await fetch('/portal-status', { 
  signal: AbortSignal.timeout(3000) 
});

if (statusData.portal_status === 'offline') {
  // Show error immediately - don't attempt login
  return;
}
```

This provides error feedback in **3 seconds** instead of 6-15 seconds.

## Testing

Portal down scenario:
```bash
# Should return error in ~3-6 seconds
time curl -X POST https://api.attend75.xyz/login/start \
  -H "Content-Type: application/json" \
  -d '{"roll_number":"test","password":"test"}'
```

Portal status check:
```bash
# Should return in <3 seconds
time curl https://api.attend75.xyz/portal-status
```

## Related Changes

See also:
- `backend/routers/auth.py` - Added `/portal-status` endpoint
- `backend/scrapers/portal_scraper.py` - Enhanced error detection
- Commit `81d432f` - Error message improvements
