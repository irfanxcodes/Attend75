# Legal & Security Recommendations Before Publishing

**Attend75 — Pre-Publication Audit Findings**
**Date: June 12, 2026**

---

## Part 1: Security Audit Findings

### Critical Issues

#### 1. Hardcoded Development Encryption Key in Source Code

**File:** `backend/services/crypto_service.py`
**Issue:** A default Fernet key (`4D4BAQv4ai8ujln1Q0x6u6Nvh6v7Gc0Je6gVVO5jvMg=`) is hardcoded as a fallback.

**Risk:** If `CREDENTIAL_ENCRYPTION_KEY` environment variable is not set in production, all portal passwords are encrypted with a publicly visible key (in version control). Anyone with access to the source code and database can decrypt all stored credentials.

**Recommendation:**
- Remove the hardcoded fallback key entirely.
- Make the service FAIL to start if `CREDENTIAL_ENCRYPTION_KEY` is not set in production.
- Add a startup check that validates the encryption key is set and is not the default dev key.

```python
class CredentialCryptoService:
    def __init__(self, key: str | None = None):
        encryption_key = (key or os.getenv("CREDENTIAL_ENCRYPTION_KEY") or "").strip()
        if not encryption_key:
            raise RuntimeError("CREDENTIAL_ENCRYPTION_KEY must be set. Cannot start without encryption key.")
        self._fernet = Fernet(encryption_key.encode("utf-8"))
```

#### 2. In-Memory Session Store — No Persistence

**File:** `backend/services/session_store.py`
**Issue:** All active sessions are stored in a Python dictionary. On server restart, ALL users are logged out immediately with no recovery.

**Risk (Operational, not Security):** This is actually a security benefit (no session data on disk), but it means deployments cause mass session invalidation.

**Recommendation:** This is acceptable for current scale but document it clearly. Users should understand sessions don't survive restarts.

---

### Medium Issues

#### 3. No Rate Limiting on Login Endpoint

**File:** `backend/routers/auth.py`
**Issue:** There is no rate limiting on the `/login` endpoint. A malicious actor could brute-force portal credentials through your server.

**Recommendation:**
- Add IP-based rate limiting (e.g., 5 attempts per minute per IP).
- Add user-based rate limiting (e.g., 10 attempts per hour per roll number).
- Consider using a library like `slowapi` or a reverse proxy (nginx) rate limit.
- Return 429 Too Many Requests when limits are exceeded.

#### 4. No HTTPS Enforcement in Application Code

**Issue:** The app relies on deployment infrastructure for HTTPS. If misconfigured, credentials could be transmitted in plaintext.

**Recommendation:**
- Add a middleware or startup check that warns/refuses to serve on HTTP in production.
- Document that a reverse proxy (nginx, Caddy) with TLS is required.
- Consider adding HSTS headers.

#### 5. Session Token Passed in Request Body, Not Headers

**Issue:** Session tokens are sent in the POST body rather than as `Authorization: Bearer` headers. This is unconventional and could lead to tokens appearing in server logs if body logging is enabled.

**Recommendation:** Consider migrating to `Authorization: Bearer <token>` header pattern (lower priority, but more standard).

#### 6. No Account Lockout Mechanism

**Issue:** Failed logins are not tracked. There's no mechanism to lock accounts after repeated failures.

**Recommendation:** Implement a temporary lockout (e.g., 15-minute cooldown after 5 failed attempts per roll number).

---

### Low Issues

#### 7. Portal Password Truncation Without User Warning

**File:** `backend/scrapers/portal_scraper.py` — `PASSWORD_MAX_LENGTH = 10`
**Issue:** Passwords are silently truncated to 10 characters. If a user's password is longer, they won't know only the first 10 chars are used.

**Recommendation:** Warn users in the UI that only the first 10 characters of their password are used (or validate length client-side).

#### 8. No Explicit Data Retention Auto-Deletion

**Issue:** Feature usage events, StudyMe data, feedback, and ratings are retained indefinitely. There's no automated cleanup.

**Recommendation:**
- Implement a data retention schedule (e.g., auto-delete usage events older than 2 years).
- Or document the indefinite retention clearly (which the Privacy Policy now does).

---

## Part 2: Legal Risk Assessment

### Risks Identified

| Risk | Severity | Mitigation |
|------|----------|------------|
| Student claims Attend75 data caused them to miss attendance threshold | High | Strong disclaimers in ToS §8, §11, §17 |
| College takes action against Attend75 for scraping | High | Non-affiliation clause §3; authorization by user §13 |
| Student uses Faculty Mail to harass faculty | Medium | User responsibility clause §9.2; indemnification §12 |
| Data breach exposes encrypted credentials | High | Encryption documented; limitation of liability §11.2.12 |
| Portal changes break the app, students rely on stale data | Medium | No accuracy guarantee §8.3; portal dependency §13.3 |
| Student claims Attend75 endorsed by college | Medium | Clear non-affiliation §3 |
| Student shares account/credentials and blames platform | Low | User responsibility §5.3 |

### Missing Legal Protections to Consider

1. **Age verification:** The Terms require 16+ but there's no verification mechanism. Consider adding a checkbox during signup.

2. **Terms acceptance tracking:** There's no mechanism to record that a user agreed to the Terms. Consider adding a "I agree to Terms & Privacy Policy" checkbox on first login that is logged.

3. **Terms version history:** When Terms change, you should maintain a changelog or version history. Consider keeping dated versions.

4. **GDPR/DPDPA compliance (if applicable):**
   - The Indian Digital Personal Data Protection Act (DPDPA) 2023 may apply.
   - You may need to designate a "Data Fiduciary" and implement consent mechanisms.
   - Consider adding explicit consent checkboxes for data collection.

5. **College-specific disclaimers:** If colleges send cease-and-desist notices, you should have a process to respond or restrict access for specific institutions.

---

## Part 3: Product Recommendations Before Publishing

### Must-Do (Before Launch)

1. **Remove hardcoded encryption key from source code** — Critical security fix.
2. **Add rate limiting** to login endpoints.
3. **Add a Terms acceptance checkbox** on first login/signup and log the acceptance timestamp.
4. **Add a contact email** to both documents (replace `[Insert contact email here]`).
5. **Add an in-app link** to both the Privacy Policy and Terms & Conditions (footer or settings page).
6. **Ensure HTTPS is enforced** in production deployment.

### Should-Do (Soon After Launch)

7. **Implement account deletion flow in the UI** — Allow users to self-serve delete their account and data.
8. **Add a "data downloaded" export feature** — Let users export their data (DPDPA right to data portability).
9. **Implement login rate limiting** — Both IP-based and roll-number-based.
10. **Add session invalidation on credential change** — If a user re-links credentials, invalidate old sessions.
11. **Add a Terms version number** and track which version each user accepted.
12. **Warn users about password truncation** in the login UI.

### Nice-to-Have (Future)

13. **Audit logging** — Log credential access events (decrypt operations) for security monitoring.
14. **Key rotation plan** — Document how to rotate the Fernet encryption key without breaking existing encrypted passwords.
15. **Automated data retention cleanup** — Cron job to purge old feature_usage_events.
16. **Security headers** — Add Content-Security-Policy, X-Frame-Options, X-Content-Type-Options headers.
17. **Penetration testing** — Before scaling to multiple colleges.

---

## Part 4: Summary of Current Implementation (Verified)

| Aspect | Status | Notes |
|--------|--------|-------|
| Password storage (Guest) | ✅ Secure | Never stored, memory-only, discarded after portal auth |
| Password storage (Firebase) | ⚠️ Acceptable | Encrypted with Fernet, but hardcoded fallback key exists |
| Session tokens | ✅ Secure | 192-bit random, in-memory only, 12h TTL, LRU eviction |
| Firebase auth | ✅ Secure | Server-side ID token verification via Admin SDK |
| Portal scraping | ✅ Read-only | No write operations, user-authorized |
| Faculty Mail | ✅ Safe | Client-side mailto: only, no server-side email sending |
| Data minimization | ✅ Good | Guest mode stores nothing; Firebase stores minimum |
| Third-party services | ✅ Minimal | Only Firebase Auth, no analytics/ads |
| CORS | ✅ Configured | Origin whitelist with regex support |
| Input validation | ✅ Present | Pydantic schemas via FastAPI |
| Rate limiting | ❌ Missing | No rate limiting on any endpoint |
| HTTPS enforcement | ❌ Not in app | Relies on deployment infrastructure |
| Terms acceptance tracking | ❌ Missing | No record of user accepting terms |

---

*This document reflects the actual codebase as audited on June 12, 2026.*
