# Active Session Display Threshold

## Overview

Implemented a separate "active display threshold" for the admin dashboard that's independent of the authentication TTL.

## Problem Solved

**Before:**
- Session TTL: 24 hours
- Dashboard showed ALL sessions as "active" for full 24 hours
- User logs in at 9 AM, closes app at 5 PM
- Session still appears "active" at 11 PM (even though user left 6 hours ago)
- **Result:** Inflated "active sessions" count

**After:**
- Session TTL: 24 hours (unchanged - users stay logged in)
- Dashboard only shows sessions accessed in **last 10 hours**
- User logs in at 9 AM, closes app at 5 PM
- Session disappears from dashboard at 3 AM next day (10h after last use)
- **Result:** Accurate "currently active" metrics

---

## Configuration

### New Environment Variable

**File:** `backend/.env`

```env
# Active session display threshold: 10 hours
# Sessions remain valid for authentication for full 24h TTL, but only appear in
# "Active sessions" dashboard if accessed within this threshold (default: 10 hours).
# This provides accurate "currently active" metrics without forcing users to re-login.
SESSION_ACTIVE_DISPLAY_HOURS=10
```

### Existing Variable (Unchanged)

```env
# Session lifetime: 24 hours (86400 seconds)
SESSION_STORE_TTL_SECONDS=86400
```

---

## Implementation Details

### Changes Made

**File:** `backend/services/session_store.py`

1. **Added active display threshold** to `SessionStore.__init__()`:
   ```python
   self._active_display_threshold_seconds = int(os.getenv("SESSION_ACTIVE_DISPLAY_HOURS", "10")) * 3600
   ```

2. **Updated `active_sessions_list()`** to filter by last activity:
   ```python
   active_threshold = now - self._active_display_threshold_seconds
   recently_active = [
       record for record in self._sessions.values()
       if record.last_accessed_at > active_threshold
   ]
   ```

3. **Added `lastActiveSecondsAgo`** to session response:
   ```python
   "lastActiveSecondsAgo": int(now - record.last_accessed_at)
   ```

4. **Updated `stats()`** to show both counts:
   ```python
   {
       "active_sessions": len(self._sessions),  # All authenticated (24h)
       "recently_active_sessions": recently_active_count,  # Active within 10h
       "active_display_threshold_seconds": self._active_display_threshold_seconds,
   }
   ```

---

## Behavior

### Session Lifecycle

```
Time | Session State             | Authentication | Dashboard Display
-----|---------------------------|----------------|-------------------
0h   | User logs in              | ✅ Valid       | ✅ Shows
2h   | User uses app             | ✅ Valid       | ✅ Shows
5h   | User closes app           | ✅ Valid       | ✅ Shows
8h   | (No activity)             | ✅ Valid       | ✅ Shows
10h  | (No activity)             | ✅ Valid       | ✅ Shows
12h  | (No activity)             | ✅ Valid       | ❌ Hidden (>10h)
15h  | User opens app again      | ✅ Valid       | ✅ Shows (refreshed)
24h  | (No activity)             | ✅ Valid       | ✅ Shows (<10h from 15h)
26h  | (No activity)             | ❌ Expired     | ❌ Hidden
```

### Example Scenarios

#### Scenario 1: Active User
- 9:00 AM: Login → Shows in dashboard
- 11:00 AM: Check attendance → Shows in dashboard
- 2:00 PM: Check marks → Shows in dashboard
- 5:00 PM: Closes app
- 8:00 PM: Still shows (5h + 3h = 8h < 10h)
- 11:00 PM: Still shows (5h + 6h = 11h... wait, hidden now!)
- **Next day 9:00 AM:** Opens app → Shows again (session still valid from yesterday!)

#### Scenario 2: Idle User
- 9:00 AM: Login → Shows in dashboard
- 9:10 AM: Closes app immediately
- 7:00 PM: Hidden from dashboard (10h threshold)
- **Next day 8:00 AM:** Opens app → Shows again (session was still valid!)

---

## API Response Changes

### GET /internal/admin/sessions/active

**New field added:**

```json
{
  "rollNumber": "24FMUCHH014059",
  "userName": "Student Name",
  "startedSecondsAgo": 7200,
  "lastActiveSecondsAgo": 3600,  // NEW: when they last made a request
  "eventCount": 15
}
```

### GET /internal/admin/sessions/stats

**New fields added:**

```json
{
  "active_sessions": 42,  // All authenticated sessions (24h TTL)
  "recently_active_sessions": 28,  // Only sessions active in last 10h
  "active_display_threshold_seconds": 36000,  // 10 hours
  "session_ttl_seconds": 86400  // 24 hours
}
```

---

## Benefits

### 1. Accurate Metrics
- **Before:** 100 sessions shown, but 40 are dormant (users closed app hours ago)
- **After:** 60 sessions shown (only truly active users)

### 2. Better Monitoring
- See real-time active users
- Identify peak usage hours accurately
- Better capacity planning

### 3. No UX Impact
- Users still stay logged in for 24 hours
- No forced re-logins
- Only affects dashboard display

### 4. Configurable
- Change threshold via `.env` without code changes
- Want 6-hour threshold? Set `SESSION_ACTIVE_DISPLAY_HOURS=6`
- Want to match TTL? Set `SESSION_ACTIVE_DISPLAY_HOURS=24`

---

## Testing

### Test 1: Verify Threshold Works

```bash
# Create a session
curl -X POST https://api.attend75.xyz/login/start \
  -H "Content-Type: application/json" \
  -d '{"roll_number":"YOUR_ROLL","password":"YOUR_PASS"}'

# Check active sessions immediately
curl https://api.attend75.xyz/internal/admin/sessions/active \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN"
# Should show your session

# Wait 11 hours (or manually set timestamp in DB)

# Check active sessions again
curl https://api.attend75.xyz/internal/admin/sessions/active \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN"
# Should NOT show your session (>10h threshold)

# But authentication still works!
curl https://api.attend75.xyz/attendance \
  -H "Authorization: Bearer YOUR_SESSION_TOKEN"
# Should return data (session still valid for 24h)
```

### Test 2: Verify Stats

```bash
curl https://api.attend75.xyz/internal/admin/sessions/stats \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN"

# Response:
{
  "active_sessions": 50,  // All authenticated
  "recently_active_sessions": 32,  // Active in last 10h
  "active_display_threshold_seconds": 36000
}
```

---

## Deployment

### Production Server

```bash
# SSH into server
ssh ubuntu@129.159.239.36

# Edit .env
cd /opt/attend75/backend
sudo nano .env

# Add this line (or verify it exists):
SESSION_ACTIVE_DISPLAY_HOURS=10

# Restart service
sudo systemctl restart attend75

# Verify
sudo journalctl -u attend75 -n 20 --no-pager
```

### Verify Deployment

```bash
# Check stats endpoint
curl https://api.attend75.xyz/internal/admin/sessions/stats

# Should include:
# "active_display_threshold_seconds": 36000
```

---

## Future Enhancements (Optional)

### 1. Configurable per User Type
```python
# Premium users: 24h display
# Free users: 10h display
threshold = 24 * 3600 if user.is_premium else 10 * 3600
```

### 2. Time-of-Day Adjustments
```python
# During exams: 12h threshold
# Normal days: 10h threshold
```

### 3. Auto-Adjust Based on Load
```python
# If server load > 80%: reduce threshold to 6h
# If server load < 50%: increase threshold to 12h
```

---

## Related Files

- `backend/services/session_store.py` - Session storage and filtering logic
- `backend/.env` - Configuration variables
- `backend/routers/internal.py` - Admin endpoints that use active sessions

---

## Backward Compatibility

✅ **Fully backward compatible**

- Existing sessions continue working
- No database migrations needed
- API responses are extended (new fields), not changed
- Default threshold (10h) maintains reasonable behavior
- Can be deployed without frontend changes

---

## Summary

**What changed:**
- Added 10-hour "active display" threshold
- Dashboard only shows recently active sessions
- Authentication TTL remains 24 hours

**What stayed the same:**
- Users stay logged in for 24 hours
- No forced re-logins
- Session functionality unchanged

**Result:**
- ✅ Accurate "active sessions" metrics
- ✅ Better monitoring and capacity planning
- ✅ No UX impact on users
- ✅ Configurable via environment variable
