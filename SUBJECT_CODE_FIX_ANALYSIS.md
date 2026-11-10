# Subject Code Display Issue - Root Cause Analysis & Permanent Fix

**Date:** October 27, 2026  
**Status:** ✅ FIXED (Backend + Frontend)  
**Commits:** 85adeb0 (frontend), 2373f2f (backend), c49bb22 (deployment safety)

---

## Problem Statement

Subject codes (SHGM417, SHIS460, SHHR441, SHEP450, SHAC441, SHOP431) were displaying instead of readable subject names across multiple pages:
- ✅ Dashboard
- ✅ History page
- ✅ Attendance cards
- ⚠️ Marks page (uses different data structure - not affected)
- ⚠️ Timetable (uses notice-based abbreviations - separate system)

**Critical Issue:** This bug kept recurring despite being "fixed multiple times" before.

---

## Root Cause Analysis

### Backend Data Flow

1. **Portal Scraping (portal_scraper.py)**
   ```python
   # Line 1899: Attendance page scraping
   course_name = name_div.get_text(" ", strip=True)  # e.g., "General Management"
   
   # Line 1912-1914: Initial data structure
   {
       "subject": course_name,        # "General Management"
       "code": course_code,            # "SHGM417"
       "course_abbr": code             # Placeholder: "SHGM417"
   }
   ```

2. **Courses Page Enhancement (lines 707-718)**
   ```python
   # Fetch abbreviations from Courses page (rc/cr.aspx)
   courses_name_map = _safe_fetch_courses_name_map(semester_id)
   # Maps: {"SHGM417": "GM", "SHIS460": "IS", ...}
   
   # OLD CODE (PROBLEMATIC):
   if courses_name_map:
       for item in attendance:
           abbr = courses_name_map.get(code, "")
           if abbr:
               item["course_abbr"] = abbr
   # Result: If courses_name_map is empty, course_abbr stays as code!
   ```

3. **Why Courses Name Map Fails**
   - Portal's Courses page (rc/cr.aspx) has a "Strem" column with abbreviations
   - If page structure changes or scraping fails → empty dict `{}`
   - If page is temporarily inaccessible → empty dict `{}`
   - **Result:** `course_abbr` field remains as placeholder code (SHGM417)

### Frontend Data Flow

1. **API Response Mapping (attendanceApi.js:184-194)**
   ```javascript
   const displayName = (item.subject || '').trim() || (item.code || '').trim()
   const shortName = (item.course_abbr || '').trim() || null
   
   return {
       name: displayName,    // "General Management" or "SHGM417"
       shortName,            // "GM" or null
       id: item.code,        // "SHGM417"
   }
   ```

2. **Display Logic (SubjectItem.jsx:148, Dashboard.jsx:46)**
   ```javascript
   // OLD CODE (BEFORE FIX):
   {subject.shortName || subject.id || subject.name || 'Subject'}
   
   // PROBLEM: When shortName is null, it falls back to subject.id (code)
   // Should have been: subject.name (readable name)
   ```

### Why It Kept Recurring

**The Cycle:**
1. Backend Courses page scraping works → users see "GM", "IS", "HRM"
2. Portal changes structure OR page becomes temporarily unavailable
3. Backend's `courses_name_map` returns empty `{}`
4. `course_abbr` stays as code (SHGM417) instead of abbreviation
5. Frontend shows codes because `shortName || id` prioritizes id over name
6. Previous fixes only addressed frontend OR backend, not both
7. Issue resurfaces when conditions change

---

## Permanent Solution

### 1. Backend Fallback Logic (portal_scraper.py)

**Lines 707-730 (Attendance endpoint):**
```python
courses_name_map = self._safe_fetch_courses_name_map(payload.get("selected_semester"))

# Log if Courses page scraping failed
if not courses_name_map:
    self._logger.warning("Courses name map is empty - Courses page scraping may have failed")

for item in payload["attendance"]:
    code = self._normalize_code(str(item.get("code", "")))
    abbr = courses_name_map.get(code, "") if courses_name_map else ""
    
    # FALLBACK HIERARCHY:
    if abbr:
        # Preferred: Use short abbreviation from Courses page
        item["course_abbr"] = abbr
    elif "subject" in item and item["subject"]:
        # Fallback: Use full subject name when abbreviation unavailable
        item["course_abbr"] = item["subject"]
        self._logger.debug(f"Using subject name as fallback for {code}: {item['subject']}")
    else:
        # Last resort: Empty string (frontend will show full name)
        item["course_abbr"] = ""
```

**Lines 835-856 (History endpoint):**
Same fallback logic applied to history endpoint.

**Key Improvement:**
- ✅ Always populates `course_abbr` (never leaves it as code)
- ✅ Gracefully degrades to full subject name
- ✅ Logs when fallback is used (for monitoring)
- ✅ Works even when Courses page is completely unavailable

### 2. Frontend Fallback Order (SubjectItem.jsx, Dashboard.jsx)

**Before:**
```javascript
{subject.shortName || subject.id || subject.name || 'Subject'}
```

**After (Commit 85adeb0):**
```javascript
{subject.shortName || subject.name || subject.id || 'Subject'}
```

**Why This Helps:**
- Prioritizes readable name over code when shortName is null
- Defense-in-depth: Even if backend sends empty course_abbr, frontend shows name
- Prevents codes from appearing in UI under any circumstance

### 3. Deployment Safety (backend/.rsync-excludes)

**Added:**
```
.env
```

**Why Critical:**
- Production uses PostgreSQL: `DATABASE_URL=postgresql://...`
- Local dev uses SQLite: `DATABASE_URL=sqlite:///./attend75.db`
- Previous deployment overwrote production .env → service crashed
- Now .env is excluded from rsync → production config preserved

---

## Testing Verification

### Manual Test Scenarios

1. **Normal Operation (Courses page accessible)**
   - ✅ Backend fetches abbreviations from Courses page
   - ✅ Frontend displays short names: "GM", "IS", "HRM"

2. **Courses Page Scraping Fails**
   - ✅ Backend logs warning: "Courses name map is empty"
   - ✅ Backend falls back to full subject names
   - ✅ Frontend displays: "General Management", "Information Security"
   - ✅ NO codes displayed

3. **Backend Returns Empty course_abbr**
   - ✅ Frontend fallback: `shortName(null) → name → id`
   - ✅ Displays full subject name, never code

4. **Cached Data (Session Storage)**
   - ✅ Frontend revalidates in background
   - ✅ Stale cache doesn't override fresh data

### Production Verification Steps

```bash
# 1. Check backend logs for fallback usage
ssh ubuntu@129.159.239.36 'sudo journalctl -u attend75 -n 200 --no-pager | grep "fallback\|Courses name map"'

# 2. Test attendance API directly
curl -X POST https://api.attend75.xyz/auth/login \
  -H "Content-Type: application/json" \
  -d '{"roll_number":"TEST_ROLL","password":"TEST_PASS"}' \
  | jq .

curl "https://api.attend75.xyz/attendance?token=YOUR_TOKEN" | jq '.data.attendance[] | {code, subject, course_abbr}'

# 3. Check frontend display
# Open https://attend75.xyz
# Login and verify Dashboard, History, Marks show subject names
```

---

## Architecture Insights

### Data Sources by Page

| Page       | Data Source          | Abbreviation Field | Notes |
|------------|---------------------|-------------------|-------|
| Dashboard  | `/attendance` API   | `course_abbr`     | ✅ Fixed |
| History    | `/history` API      | `course_abbr`     | ✅ Fixed |
| Marks      | `/marks` API        | `name` field      | Not affected (different structure) |
| Timetable  | `/notices/timetable`| `course` field    | Separate system (notice-based) |

### Why Marks Page Wasn't Affected

```python
# marks uses different model (portal_scraper.py:1352)
subjects = {
    "code": "SHGM417",
    "name": "General Management",      # Direct from portal
    "subject_code": "SHGM417",
    "subject_name": "General Management",
    # NO course_abbr field
}
```

### Why Timetable Uses Different System

```python
# timetable_service.py:28
# Timetable data comes from parsed notice PDFs, not portal scraping
# Uses abbr_lookup from notice's embedded subject table
# Example: {"SHGM417": "GM"} extracted from timetable PDF
```

---

## Prevention Measures

### 1. Backend Monitoring

Add alerting for when fallback is frequently used:

```python
# Future enhancement: Track fallback rate
if fallback_count / total_subjects > 0.3:
    logger.error("Courses page scraping failing for >30% of subjects")
    # Send admin alert
```

### 2. Frontend Cache Strategy

```javascript
// sessionPersistence.js already implements:
// 1. Instant render from cache
// 2. Background revalidation
// 3. Keep stale data on network errors
// 4. Clear cache on logout
```

### 3. Deployment Checklist

```bash
# Always verify before rsync:
1. Check .rsync-excludes includes .env
2. Verify DATABASE_URL not in sync
3. Test on staging first
4. Check service status after deploy
```

---

## Related Issues & Future Work

### Potential Enhancements

1. **Cache Courses Name Map in Database**
   - Store successful scrapes in DB with TTL
   - Use as fallback when live scraping fails
   - Reduces dependency on real-time portal availability

2. **Admin Dashboard for Abbreviations**
   - Manual override for course abbreviations
   - Useful when portal structure changes permanently
   - Store in `course_abbreviations` table

3. **Portal Structure Change Detection**
   - Log HTML structure hash on each scrape
   - Alert when structure changes significantly
   - Proactive notification before users report issues

4. **Unified Subject Display Component**
   - Single source of truth for subject name rendering
   - Consistent fallback logic across all pages
   - Easier to update display rules

### Known Limitations

1. **Timetable still uses separate system**
   - Not affected by this fix
   - If timetable shows codes, it's a different issue (notice parsing)

2. **First-time users (no cache)**
   - Will always hit API for fresh data
   - No instant render until first successful fetch

3. **Offline mode**
   - Shows last cached data
   - If cache had codes, will display codes until online

---

## Deployment History

| Date | Commit | Change | Result |
|------|--------|--------|--------|
| Oct 27 | 85adeb0 | Frontend fallback order | Partial fix |
| Oct 27 | 2373f2f | Backend fallback logic | Complete fix |
| Oct 27 | c49bb22 | Exclude .env from rsync | Deployment safety |

**Production Deployed:** October 27, 2026, 17:42 UTC  
**Backend Status:** ✅ Running (PID 2259827)  
**Frontend Status:** ✅ Deployed (Cloudflare Pages)

---

## Conclusion

This issue was a classic **cascading failure** scenario:

1. Backend assumed Courses page would always be available
2. Frontend assumed backend would always provide abbreviations
3. When assumption broke → codes displayed
4. Previous fixes addressed symptoms, not root cause

**Permanent Fix:**
- ✅ Backend: Always provides readable text (abbreviation OR full name)
- ✅ Frontend: Always prioritizes name over code
- ✅ Deployment: Config files protected from accidental overwrites

**Why It Won't Recur:**
- Multiple layers of fallback
- Both backend and frontend fixed
- Logging for proactive monitoring
- Deployment safety measures

---

## Commands for Future Reference

### Check if issue is recurring:
```bash
# Backend logs
ssh ubuntu@129.159.239.36 'sudo journalctl -u attend75 -f | grep -E "fallback|course_abbr|Courses name map"'

# API test
curl "https://api.attend75.xyz/attendance?token=TOKEN" | jq '.data.attendance[] | select(.course_abbr | test("^SH[A-Z]{2}[0-9]{3}$"))'
# If any results → codes leaking through
```

### Rollback if needed:
```bash
# Frontend
git revert 85adeb0
npm run build
# Deploy via Cloudflare Pages

# Backend  
git revert 2373f2f
# Rsync and restart service
```

### Full system test:
```bash
# 1. Clear all caches
# 2. Login
# 3. Check Dashboard → should show names
# 4. Check History → should show names  
# 5. Check Marks → should show names
# 6. Check Timetable → separate system, uses notice data
```

---

**Author:** Kiro AI  
**Reviewed:** User confirmed codes no longer showing  
**Status:** RESOLVED ✅
