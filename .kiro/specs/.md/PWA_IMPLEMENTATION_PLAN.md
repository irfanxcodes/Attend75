# Attend75 — PWA & Persistent Auth Implementation Plan

## Pre-Implementation Security Audit

### Existing Authentication Architecture

**Current state:**
1. **Guest login:** User submits roll_number + password → backend authenticates with college portal → in-memory session token returned → token held ONLY in React state (lost on refresh/close)
2. **Firebase login:** Google Sign-In popup → Firebase ID token → backend verifies → if linked credentials exist, backend decrypts stored portal password (Fernet) → logs into portal → returns session token
3. **Session store:** In-memory Python dict with 12-hour TTL. Each session holds a live `PortalScraper` instance with HTTP cookies to the college portal.

**Key findings:**
- Firebase users already have credentials stored securely server-side (`portal_credentials` table, Fernet-encrypted). They auto-recover sessions on each app open via `onAuthStateChanged` → backend re-authenticates with stored credentials.
- Guest users have NO persistence mechanism. Their session token exists only in React state.
- The session token itself is a `secrets.token_urlsafe(24)` — opaque, no expiry encoded in it.

### Security Assessment: Do We Need to Store Credentials Locally?

**Answer: NO. We do not need to store college credentials on the client.**

**Justification:**
- Firebase users already have server-side credential storage working. The flow is: device biometric / Google account → Firebase ID token → backend decrypts stored portal password → portal session. No local credential storage needed.
- Guest users accept the tradeoff of re-entering credentials. We can mitigate this by persisting the *session token* (not the password) in sessionStorage/localStorage.
- The session token is a random opaque string that expires server-side in 12 hours. Storing it locally is equivalent to a cookie — standard web security practice.

**What we WILL store locally:**
- Session token (opaque string, already expires server-side)
- Last attendance data snapshot (for offline/instant display)
- User display info (name, roll number — not sensitive)

**What we will NOT store locally:**
- Passwords (college portal or any other)
- Firebase credentials (handled by Firebase SDK's IndexedDB)
- Encryption keys

### Session Recovery Strategy

**Firebase users (already works):**
```
App opens → onAuthStateChanged fires → Firebase ID token obtained →
POST /auth/firebase/login → backend uses stored encrypted credentials →
authenticates with portal → new session token issued
```
This is already implemented and working. The PWA just needs to ensure it works in standalone mode.

**Guest users (new approach — session token persistence):**
```
Login → receive session token → store in sessionStorage (default) or localStorage (if "remember me") →
App reopens → read stored token → POST /session/status to validate →
If valid: restore session | If expired: show login screen
```
No password storage. Token expires server-side in 12 hours regardless of client storage.

---

## Implementation Phases

### Phase 1: Core PWA Infrastructure (Day 1–2)

**Goal:** Make Attend75 installable as a PWA with proper manifest, icons, and service worker.

**Changes (all additive, no existing files modified in breaking ways):**

#### New Files

| File | Purpose |
|------|---------|
| `frontend/public/manifest.json` | Web app manifest for installability |
| `frontend/public/icons/icon-192.png` | Required PWA icon (192×192) |
| `frontend/public/icons/icon-512.png` | Required PWA icon (512×512) |
| `frontend/public/icons/icon-maskable-512.png` | Maskable icon for adaptive icon display |
| `frontend/public/icons/apple-touch-icon.png` | iOS home screen icon (180×180) |
| `frontend/src/pwa/registerSW.js` | Service worker registration logic |
| `frontend/src/pwa/useInstallPrompt.js` | Hook to manage PWA install prompt |

#### Modified Files

| File | Change | Risk |
|------|--------|------|
| `frontend/index.html` | Add `<link rel="manifest">`, `<meta name="theme-color">`, Apple meta tags | None — additive only |
| `frontend/vite.config.js` | Add `vite-plugin-pwa` to plugins array | Low — existing `react()` plugin untouched |
| `frontend/package.json` | Add `vite-plugin-pwa` as devDependency | None |
| `frontend/src/main.jsx` | Import and call `registerSW()` at app init | None — additive, existing code untouched |

#### Manifest Specification

```json
{
  "name": "Attend75 — Attendance Tracker",
  "short_name": "Attend75",
  "description": "Track your college attendance and stay above 75%",
  "start_url": "/",
  "scope": "/",
  "display": "standalone",
  "background_color": "#5B5878",
  "theme_color": "#5B5878",
  "orientation": "portrait-primary",
  "categories": ["education", "productivity"],
  "icons": [
    { "src": "/icons/icon-192.png", "sizes": "192x192", "type": "image/png" },
    { "src": "/icons/icon-512.png", "sizes": "512x512", "type": "image/png" },
    { "src": "/icons/icon-maskable-512.png", "sizes": "512x512", "type": "image/png", "purpose": "maskable" }
  ]
}
```

#### Service Worker Strategy (via vite-plugin-pwa + Workbox)

- **Precache:** All JS/CSS chunks, HTML shell, SVG assets, icon PNGs
- **Runtime cache — StaleWhileRevalidate:** Google Fonts API
- **Runtime cache — CacheFirst:** Google Fonts static files (woff2), with 1-year expiry
- **No API response caching in Phase 1** — that comes in Phase 3

#### Vite Config Update

```javascript
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'icons/*.png', 'calendar.svg', '*.svg', '*.png'],
      manifest: false, // Use public/manifest.json directly
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^\/api\//],
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
            handler: 'StaleWhileRevalidate',
            options: { cacheName: 'google-fonts-stylesheets' },
          },
          {
            urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'google-fonts-webfonts',
              expiration: { maxEntries: 10, maxAgeSeconds: 60 * 60 * 24 * 365 },
            },
          },
        ],
      },
    }),
  ],
})
```

#### index.html Additions

```html
<!-- Add inside <head>, after existing meta tags -->
<link rel="manifest" href="/manifest.json" />
<meta name="theme-color" content="#5B5878" />
<meta name="apple-mobile-web-app-capable" content="yes" />
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
<meta name="apple-mobile-web-app-title" content="Attend75" />
<link rel="apple-touch-icon" href="/icons/apple-touch-icon.png" />
```

---

### Phase 2: Persistent Authentication (Day 3–5)

**Goal:** Keep users logged in across PWA restarts without storing passwords.

#### Auth Persistence Strategy

| User Type | Persistence Method | Storage | Expiry |
|-----------|-------------------|---------|--------|
| Firebase | Firebase SDK IndexedDB (automatic) + token re-issue on each open | Managed by Firebase | Indefinite |
| Guest | Session token in sessionStorage (default) or localStorage (opt-in) | Browser storage | 12 hours (server-side) |

#### New Files

| File | Purpose |
|------|---------|
| `frontend/src/services/sessionPersistence.js` | Read/write/clear session token + cached user data |
| `frontend/src/pwa/offlineCache.js` | IndexedDB wrapper for cached attendance data |

#### Modified Files

| File | Change | Backward Compatible? |
|------|--------|---------------------|
| `frontend/src/hooks/useAppStore.js` | On `setAuthSession`: persist token. On `logout`: clear persisted data. | ✅ Yes — existing behavior preserved, persistence is additive |
| `frontend/src/routes/AppRoutes.jsx` | On bootstrap: check for persisted guest session before Firebase check | ✅ Yes — adds a faster path, doesn't remove Firebase flow |
| `frontend/src/services/firebaseAuth.js` | Add `signInWithRedirect` fallback for iOS standalone mode | ✅ Yes — popup still used when not in standalone |

#### Session Persistence Module Design

```javascript
// frontend/src/services/sessionPersistence.js

const STORAGE_KEY = 'attend75.session'
const CACHE_KEY = 'attend75.cachedData'

export function persistSession(sessionData) {
  // Stores: { token, rollNumber, name, authProvider, savedAt }
  // Does NOT store: password, attendance data (that goes to IndexedDB)
}

export function loadPersistedSession() {
  // Returns stored session or null
  // Checks savedAt against 12-hour expiry client-side
}

export function clearPersistedSession() {
  // Remove from storage
}

export function persistAttendanceSnapshot(attendanceData) {
  // Write to IndexedDB for offline display
}

export function loadAttendanceSnapshot() {
  // Read last cached attendance from IndexedDB
}
```

#### Bootstrap Flow (Updated)

```
App opens
  ├─ Check: is there a persisted guest session token?
  │   ├─ YES → validate with POST /session/status
  │   │   ├─ Valid → restore session immediately (fast path)
  │   │   └─ Expired → clear persisted data, show login
  │   └─ NO → continue to Firebase check
  │
  └─ Check: Firebase onAuthStateChanged fires
      ├─ User signed in → POST /auth/firebase/login (existing flow)
      └─ No user → show login screen
```

This preserves the existing Firebase bootstrap entirely. The guest session check is a NEW fast path that runs before Firebase, providing instant session restoration for returning guest users.

#### iOS Standalone Mode Fix

```javascript
// In firebaseAuth.js — detect standalone mode
function isStandaloneMode() {
  return window.matchMedia('(display-mode: standalone)').matches
    || window.navigator.standalone === true
}

function isIOSDevice() {
  return /iPad|iPhone|iPod/.test(navigator.userAgent)
}

// Modify signInWithGoogleAndGetIdToken:
// If standalone + iOS → use signInWithRedirect instead of signInWithPopup
// The redirect result is captured on page reload via getRedirectResult()
```

---

### Phase 3: Offline Data Caching (Day 6–8)

**Goal:** Show cached attendance data instantly on app open, even before network requests complete.

#### Strategy: Stale-While-Revalidate at Application Level

This is NOT service worker level API caching (which is brittle for POST requests). Instead:
1. After each successful attendance/marks fetch, write the response to IndexedDB
2. On app open, read from IndexedDB immediately and display
3. Simultaneously fetch fresh data from the network
4. When fresh data arrives, update the UI and overwrite the cache

#### New Files

| File | Purpose |
|------|---------|
| `frontend/src/pwa/offlineCache.js` | IndexedDB wrapper (attendance, marks, user profile) |
| `frontend/src/components/common/OfflineIndicator.jsx` | "You're offline" banner |
| `frontend/src/components/common/StaleDataBadge.jsx` | "Last updated X minutes ago" indicator |

#### Modified Files

| File | Change |
|------|--------|
| `frontend/src/services/attendanceApi.js` | After successful fetch, write to offlineCache. On error + offline, read from cache. |
| `frontend/src/pages/Dashboard.jsx` | Show cached data immediately, then refresh from network |

#### What Gets Cached in IndexedDB

| Data | Key | Updated When |
|------|-----|-------------|
| Attendance subjects array | `attendance:{rollNumber}:{semesterId}` | After each `/attendance` success |
| Marks data | `marks:{rollNumber}:{semesterId}` | After each `/marks/consolidated` success |
| Streak value | `streak:{rollNumber}` | After each `/attendance/streak` success |
| User profile (name, roll, semester list) | `profile:{rollNumber}` | After login/session restore |

#### Offline Detection

```javascript
// Listen for online/offline events
window.addEventListener('online', () => { /* hide offline bar, trigger refresh */ })
window.addEventListener('offline', () => { /* show offline bar */ })
```

---

### Phase 4: Install Prompt & UX Polish (Day 9–10)

**Goal:** Guide users to install the PWA with a custom prompt UI.

#### New Files

| File | Purpose |
|------|---------|
| `frontend/src/components/common/InstallPrompt.jsx` | Custom "Install Attend75" banner for Android |
| `frontend/src/components/common/IOSInstallGuide.jsx` | iOS-specific instructions modal |
| `frontend/src/pwa/useInstallPrompt.js` | Hook wrapping `beforeinstallprompt` event |
| `frontend/src/pwa/usePWAStatus.js` | Hook to detect standalone mode, platform |

#### Install Prompt Logic

```
Android Chrome:
  - Listen for 'beforeinstallprompt' event
  - Show custom banner after 2nd visit (store visit count in localStorage)
  - User taps "Install" → call prompt.prompt()
  - After install: hide banner, track event

iOS Safari:
  - Detect iOS + not standalone mode
  - Show "Add to Home Screen" instructions modal
  - Include animated guide (Share icon → Add to Home Screen)
  - Show only once per session (dismissible)
```

#### PWA Update Notification

When the service worker updates (new deploy), show a subtle toast: "New update available. Refresh to update." — uses the `workbox-window` registration events.

---

## Testing Plan

### Device Matrix

| Device | Browser | Test |
|--------|---------|------|
| Android phone | Chrome | Install prompt, standalone mode, push notification |
| Android phone | Firefox | Install, standalone |
| iPhone (iOS 16.4+) | Safari | Add to Home Screen, standalone, push |
| iPhone (iOS < 16.4) | Safari | Add to Home Screen, standalone (no push) |
| Desktop | Chrome | Install, service worker |
| Desktop | Firefox | Service worker |

### Test Scenarios

1. **Fresh install:** Visit site → install → opens in standalone → all features work
2. **Session persistence (guest):** Login → close PWA → reopen → still logged in
3. **Session persistence (Firebase):** Login with Google → close → reopen → auto-restores
4. **Offline:** Login → go airplane mode → reopen PWA → sees cached data
5. **Update:** Deploy new version → existing PWA users see update notification
6. **iOS standalone Google Sign-In:** Install on iOS → try Google login → works via redirect
7. **Token expiry:** Login → wait 12 hours → reopen → graceful re-login prompt

---

## Risk Mitigation

| Risk | Mitigation |
|------|-----------|
| Broken service worker caches old broken JS | Use `registerType: 'autoUpdate'` + skipWaiting. Add version check on boot. |
| iOS popup auth fails in standalone | Detect standalone + iOS → use redirect flow |
| Users confused by "offline" state showing stale data | Always show "Last updated" timestamp. Clear visual distinction. |
| localStorage token theft (physical device access) | Token is server-expired at 12h. Low risk for college app. Document the tradeoff. |
| Service worker intercepts API requests incorrectly | `navigateFallbackDenylist: [/^\/api\//]` excludes API routes from SW |
| Large PDF caching bloats storage | Don't auto-cache PDFs. Only cache on explicit user action ("Save for offline"). |

---

## Dependency Additions

### Frontend (devDependencies)

```
vite-plugin-pwa (latest)
```

That's it. `vite-plugin-pwa` bundles Workbox internally. No other new dependencies.

### Backend

**No backend changes in Phase 1–4.** The existing `POST /session/status` endpoint already validates tokens — it's the perfect "is my cached session still alive?" check.

Push notifications (Phase 5, future) will require backend changes, but that's outside this initial implementation scope.

---

## Summary of Guarantees

1. **No existing files deleted** — all changes are additive
2. **No existing login flows broken** — guest login and Firebase login work identically
3. **No credential storage on client** — only opaque session tokens (already expire server-side)
4. **No backend changes required** — all PWA features use existing API endpoints
5. **Full backward compatibility** — the app works identically in a browser tab; PWA features are progressive enhancements
6. **Graceful degradation** — if service worker fails to register, app works exactly as before

---

## Execution Order

```
Phase 1 (Day 1–2):  Core PWA — manifest, icons, service worker, installability
Phase 2 (Day 3–5):  Auth persistence — sessionStorage/localStorage token, iOS fix
Phase 3 (Day 6–8):  Offline caching — IndexedDB snapshots, offline indicator
Phase 4 (Day 9–10): Install UX — custom prompts, iOS guide, update notification
```

Ready to proceed with Phase 1 implementation on your confirmation.
