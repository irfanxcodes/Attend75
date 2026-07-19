# Attend75 — PWA Feasibility & Implementation Plan

## Executive Summary

Attend75 is **85% PWA-ready today**. The application is already a mobile-first React SPA with a fully decoupled REST API. Converting it to a production-ready PWA requires adding 4–5 configuration files and minor code adjustments — estimated at **3–5 days of focused development** for core PWA features, with push notifications adding another 5–7 days.

The biggest challenge is NOT the PWA conversion itself — it's the **session architecture**. The backend's in-memory session model (12-hour TTL, lost on server restart) creates friction for persistent mobile logins that no client-side change can solve alone.

---

## 1. Current Readiness Assessment

### What's Already PWA-Ready (works without modification)

| Component | Status | Notes |
|-----------|--------|-------|
| React SPA architecture | ✅ Ready | Single-page app, client-side routing |
| Mobile-first responsive design | ✅ Ready | Tailwind breakpoints, `min-h-dvh` usage |
| All page components | ✅ Ready | Dashboard, History, Marks, StudyMe, Profile |
| SVG-based charts (AttendanceCircle) | ✅ Ready | Pure inline SVG, no Canvas dependency |
| Radar chart (MarksRadarChart) | ✅ Ready | Pure SVG, no external charting library |
| react-pdf (PDF viewer) | ✅ Ready | Works in PWA webview contexts |
| react-katex (LaTeX rendering) | ✅ Ready | CSS + DOM-based rendering |
| Firebase Auth (Google Sign-In) | ✅ Ready | Works in standalone PWA mode |
| All API calls (fetch-based) | ✅ Ready | Standard REST over HTTPS |
| Vite build system | ✅ Ready | Easy to add PWA plugin |
| Vercel deployment | ✅ Ready | Supports service worker serving |
| localStorage usage | ✅ Ready | StudyMe progress, streak cache |
| Lazy-loaded routes | ✅ Ready | Code splitting already in place |

### What's Missing (blockers for PWA installation)

| Missing Item | Severity | Effort |
|--------------|----------|--------|
| `manifest.json` / `manifest.webmanifest` | **Critical** — install won't trigger | 1 hour |
| Service Worker | **Critical** — not installable without it | 4–8 hours |
| App icons (192x192, 512x512 PNG) | **Critical** — required for install | 2 hours |
| `<link rel="manifest">` in index.html | **Critical** | 5 minutes |
| `<meta name="theme-color">` | Medium — affects status bar | 5 minutes |
| Apple-specific meta tags | Medium — iOS experience | 30 minutes |
| Offline fallback page | Medium — graceful degradation | 2 hours |
| HTTPS requirement | ✅ Already met | Vercel serves HTTPS |

### Estimated Effort Breakdown

| Phase | Time |
|-------|------|
| Core PWA (installable, icons, manifest) | 1 day |
| Service worker + offline caching | 2 days |
| Push notifications (full implementation) | 5–7 days |
| Auth session persistence improvements | 3–4 days |
| Testing across devices | 2 days |
| **Total** | **13–18 days** |

---

## 2. User Experience Analysis

### How Attend75 Would Behave as a PWA

#### Installation Experience

**Android (Chrome):**
- After 2nd visit: Chrome shows "Add to Home Screen" mini-infobar automatically
- Custom install prompt can be triggered via a button in the UI
- Installs in ~2 seconds, icon appears on home screen immediately
- Opens in standalone mode (no browser chrome)

**iOS (Safari):**
- No automatic prompt — users must tap Share → "Add to Home Screen" manually
- This is the biggest UX gap vs Play Store
- PWA opens in standalone mode, no Safari UI bars
- As of iOS 16.4+: push notifications are supported in installed PWAs

#### Once Installed

| Aspect | Behavior |
|--------|----------|
| Home screen icon | Custom icon with app name "Attend75" |
| Launch | Custom splash screen (background color + icon) |
| Display mode | Full-screen standalone — no URL bar, no browser tabs |
| Navigation | Hardware back button works (React Router handles it) |
| Status bar | Themed to match app color (#5B5878) |
| Task switcher | Shows as independent app with own thumbnail |
| Link handling | Internal links stay in-app, external links open browser |

#### Does It Feel Native?

**What feels native:**
- Full-screen app with no browser chrome
- Smooth SPA transitions between pages
- Bottom navigation bar (AppLayout)
- Pull-to-refresh can be implemented
- Push notifications appear identical to native ones
- App icon on home screen, app shows in task switcher

**What doesn't feel native:**
- No smooth 60fps page transitions (React Router transitions are instant but abrupt)
- No haptic feedback on interactions
- Slightly slower initial load vs compiled native code
- iOS: no badge count on app icon (Android supports it)
- No access to native share sheet beyond Web Share API
- Scrolling momentum slightly different from native

### Realistic Comparison

| Dimension | Current Web | PWA | React Native |
|-----------|-------------|-----|--------------|
| Install friction | None (just a URL) | Low (1-tap on Android, 3-tap iOS) | High (Play Store download) |
| Home screen presence | ❌ | ✅ | ✅ |
| Offline access | ❌ | ✅ (cached data) | ✅ (full offline) |
| Push notifications | ❌ | ✅ (Android full, iOS 16.4+) | ✅ |
| App-like feel | Partial (has URL bar) | Strong (standalone mode) | Best (native components) |
| Performance | Good | Good (same engine) | Best (native threads) |
| Biometric auth | ❌ | ✅ (WebAuthn) | ✅ (native APIs) |
| Development effort | Already done | +2 weeks | +8–12 weeks |
| Maintenance cost | 1 codebase | 1 codebase | 2 codebases |
| Update deployment | Instant | Instant (SW update) | Store review (1–3 days) |
| Play Store presence | ❌ | Possible (TWA wrapper) | ✅ |

---

## 3. Feature Compatibility Audit

### Works Immediately (zero changes)

| Feature | Details |
|---------|---------|
| Dashboard (ring chart, subjects list, predictions) | Pure SVG + Tailwind |
| Attendance History (calendar, timeline, date scroller) | DOM-based, no external libs |
| Consolidated Marks (radar chart) | Pure SVG `<polygon>` — fully PWA-safe |
| Mail Faculty (mailto: links) | Works identically in PWA standalone mode |
| StudyMe (subject roadmap, lesson navigation) | Standard React components |
| StudyMe YouTube integration | iframe embed, works in PWA webview |
| StudyMe LaTeX rendering | react-katex, CSS-based |
| Profile page (rating, feedback, share) | Standard DOM |
| Login (roll number + password) | Standard form submission |
| Semester selection | Dropdown, standard behavior |
| Subject item expansion cards | CSS animations + state |
| Progress bars on subjects | Tailwind utility classes |
| Admin dashboard | Standard CRUD UI |
| In-flight request deduplication | Pure JS Map-based |
| localStorage caching (streak, study progress) | Fully supported in PWA |

### Requires Minor Changes

| Feature | Change Needed | Effort |
|---------|---------------|--------|
| Google Sign-In (popup flow) | `signInWithPopup` may fail in some PWA contexts on Android; add `signInWithRedirect` as fallback | 2–4 hours |
| PDF Viewer (react-pdf) | PDF.js worker needs to be included in service worker precache; large PDFs may need range request handling | 4 hours |
| Refresh button behavior | Add pull-to-refresh gesture for mobile PWA (native apps have this) | 3 hours |
| Deep linking | Ensure `start_url` and `scope` in manifest align with React Router paths | 1 hour |
| Share functionality | Replace custom share with Web Share API for native share sheet | 1 hour |

### Requires Major Changes

| Feature | Change Needed | Effort |
|---------|---------------|--------|
| Session persistence across app restarts | Backend must support persistent tokens (not just in-memory sessions) for Firebase users to stay logged in after PWA kill/restart | 3–4 days |
| Push notifications | Full new system: backend FCM integration, notification service, subscription management, scheduling | 5–7 days |
| Offline mode (cached attendance data) | Service worker cache strategy for API responses, stale-while-revalidate pattern, offline UI indicators | 3–4 days |
| Background sync (queue requests when offline) | Service Worker Background Sync API + request queue | 2–3 days |

### Not Supported / Not Feasible in PWA

| Feature | Reason |
|---------|--------|
| Automatic badge count on iOS icon | iOS doesn't support Badging API for PWAs |
| Always-on background scraping | Service workers are killed after inactivity; cannot maintain persistent portal sessions in background |
| True native animations (shared element transitions) | Web platform limitation |
| Widget on Android home screen | PWAs cannot create widgets |

### Chart Verification

Both the **AttendanceCircle** (ring chart) and **MarksRadarChart** (radar) use pure inline SVG — no `<canvas>`, no WebGL, no external charting library (no Chart.js, no D3). They will render identically in a PWA standalone window because it uses the same rendering engine as the browser. **Zero issues expected.**

---

## 4. Push Notification Strategy

### Architecture Overview

```
┌────────────┐     ┌──────────────────┐     ┌─────────────────┐
│ PWA Client │────▶│ FastAPI Backend   │────▶│  Firebase Cloud  │
│ (SW + FCM) │     │ + Notification    │     │  Messaging (FCM) │
│            │◀────│   Service         │◀────│                  │
└────────────┘     └──────────────────┘     └─────────────────┘
```

### Notification Types

| Notification | Trigger | Priority |
|-------------|---------|----------|
| Attendance warning | Attendance drops below 75% for a subject | High |
| Recovery alert | "Attend next 3 classes to recover to 75%" | High |
| Daily summary | Morning summary: "Today you need 4/5 classes" | Medium |
| Study reminder | Scheduled based on user-set study goals | Low |
| Feature announcement | Admin-triggered broadcast | Low |

### Platform Support Matrix

| Platform | Push Support | Notes |
|----------|-------------|-------|
| Android (Chrome 42+) | ✅ Full | Works in background, even when PWA is closed |
| Android (Firefox) | ✅ Full | Same capabilities |
| iOS (Safari 16.4+) | ✅ Supported | ONLY works when PWA is installed to home screen |
| iOS (Safari < 16.4) | ❌ | Not supported at all |
| Desktop Chrome | ✅ Full | Works in background |
| Desktop Firefox | ✅ Full | Works in background |
| Desktop Safari | ✅ (macOS Sonoma+) | Limited |

### Key iOS Limitation

iOS push notifications require:
1. The PWA MUST be installed to home screen (not just bookmarked)
2. User must grant permission from within the installed PWA
3. Safari won't show push prompts from the regular browser tab

**Impact for Attend75:** ~40–50% of your student users likely use iPhones. They need explicit guidance to install the PWA before notifications work.

### Backend Changes Required

```
New endpoints needed:
  POST /notifications/subscribe     — Store FCM token + user mapping
  POST /notifications/unsubscribe   — Remove FCM token
  POST /notifications/preferences   — Set per-notification-type preferences
  
New background job:
  - Daily attendance check (cron or scheduled task)
  - For each user with stored credentials:
    1. Login to portal (using stored encrypted password)
    2. Check attendance percentages
    3. If below threshold → send FCM push

New dependencies:
  - firebase-admin (already installed!) — use messaging module
  - A task scheduler (celery, APScheduler, or simple cron)
```

### Implementation Plan

**Phase 1 (MVP — 3 days):**
1. Add Firebase Messaging to frontend (request permission, get FCM token)
2. Create `/notifications/subscribe` endpoint to store tokens
3. Backend sends test notification on demand

**Phase 2 (Attendance alerts — 4 days):**
1. Add scheduled job (APScheduler) that runs every morning
2. For Firebase users with linked credentials: login, check attendance
3. If subject below 75%: send push via FCM
4. Store last-notified timestamp to avoid spam

**Phase 3 (Rich notifications — 2 days):**
1. Add notification actions ("View Dashboard", "Dismiss")
2. Add notification preferences UI in Profile page
3. Daily summary notifications

### Firebase Cloud Messaging Integration

Since `firebase-admin` is already in `requirements.txt`, FCM sending requires ~20 lines of Python:

```python
from firebase_admin import messaging

def send_push_notification(fcm_token: str, title: str, body: str, data: dict = None):
    message = messaging.Message(
        notification=messaging.Notification(title=title, body=body),
        data=data or {},
        token=fcm_token,
    )
    messaging.send(message)
```

The frontend needs `firebase/messaging` (already in the `firebase` npm package).

---

## 5. Authentication & Session Persistence

### Current State Analysis

| Auth Method | Current Behavior | PWA Problem |
|-------------|-----------------|-------------|
| Guest login | Token in React state only; lost on page refresh | User must re-login every time they open PWA |
| Firebase login | `onAuthStateChanged` auto-restores Firebase session → re-authenticates with backend | Works, but causes 3–7 second delay on every app open |
| Session store | In-memory, 12-hour TTL, lost on server restart | If server restarts during class hours, all users are logged out |

### The Core Problem

Guest users lose their session every time the PWA is closed and reopened because the token is only held in React state (not persisted). Firebase users survive because `onAuthStateChanged` fires and re-authenticates, but this adds noticeable startup delay.

### Recommended Approach

**For Firebase users (recommended primary auth):**
1. Firebase handles persistence automatically (`IndexedDB`)
2. On PWA launch, `onAuthStateChanged` fires → backend issues new session token
3. **Improvement:** Cache the last session token + attendance data in IndexedDB so the UI shows immediately while re-auth happens in background

**For guest users:**
1. Store session token in `sessionStorage` (persists across refreshes within same tab, cleared on close) — minimal change
2. OR store in `localStorage` with an explicit 12-hour expiry check — allows reopening PWA without re-login
3. **Security tradeoff:** localStorage token means anyone with device access can impersonate the user. Acceptable for a college attendance app, but document the risk.

**Session duration recommendations:**
- Firebase users: effectively permanent (auto-re-auth on each app open)
- Guest users: 12 hours (match server TTL), with localStorage persistence
- Add a "Remember me" checkbox on guest login to opt into localStorage storage

### Google Sign-In in PWA Standalone Mode

**Android:** `signInWithPopup()` works correctly. Opens a system popup that returns focus to the PWA.

**iOS:** `signInWithPopup()` fails silently in some iOS PWA contexts because Safari standalone mode blocks popup windows.

**Fix:** Implement `signInWithRedirect()` as a fallback:
```javascript
// Detect standalone mode
const isStandalone = window.matchMedia('(display-mode: standalone)').matches
  || window.navigator.standalone

if (isStandalone && isIOS) {
  await signInWithRedirect(firebaseAuth, provider)
} else {
  await signInWithPopup(firebaseAuth, provider)
}
```

### Biometric Authentication / Passkeys

**Can Attend75 support biometric login in a PWA?** YES.

| Method | Support | How It Works |
|--------|---------|--------------|
| WebAuthn / Passkeys | ✅ Android, ✅ iOS 16+ | User registers a passkey tied to their device biometric. On next login, they authenticate with fingerprint/face — no password needed. |
| Fingerprint unlock | ✅ via WebAuthn | The device's biometric sensor is used as the authenticator |
| Face unlock | ✅ via WebAuthn | Same — Face ID on iOS, face unlock on Android |

**How it would work for Attend75:**

1. User logs in normally (guest or Firebase) for the first time
2. After successful login, prompt: "Enable quick login with fingerprint?"
3. If accepted → call `navigator.credentials.create()` to register a passkey
4. On next app open → call `navigator.credentials.get()` → device prompts biometric
5. If verified → backend validates the assertion and issues a session token

**Important constraints:**
- We are NOT storing passwords locally — passkeys store a cryptographic key pair, not credentials
- The backend needs a new table: `user_passkeys` (credential_id, public_key, user_id, created_at)
- Passkeys are device-specific unless synced via iCloud Keychain / Google Password Manager
- Implementation complexity: **Medium** (2–3 days for basic WebAuthn, 1 more day for backend changes)

**Platform limitations:**
- Older Android phones (< Android 9) may not support platform authenticators
- iOS requires 16.0+ for passkey support in PWAs
- Desktop support is excellent (Chrome, Firefox, Safari all support WebAuthn)

---

## 6. Offline Capability Assessment

### What Can Be Cached

| Resource | Cache Strategy | Freshness |
|----------|---------------|-----------|
| Static assets (JS, CSS, fonts, images) | **Precache** (install-time) | Updated on SW update |
| App shell (index.html) | **Precache** | Updated on SW update |
| SVG icons | **Precache** | Static |
| StudyMe lesson content (JSON constants) | **Precache** (bundled in JS) | Updated on build |
| StudyMe PDFs | **Runtime cache** (cache-first) | Rarely changes |
| Google Fonts (Inter, Francois One) | **Runtime cache** (stale-while-revalidate) | CDN-cached |
| Last attendance data | **Runtime cache** (IndexedDB snapshot) | Stale after 20s server-side |
| Last marks data | **Runtime cache** (IndexedDB snapshot) | Stale after 45s server-side |
| KaTeX CSS | **Runtime cache** (cache-first) | Versioned by npm |

### Offline Strategy Recommendation

**Tier 1: App Shell + Static Assets (service worker precache)**
- All JS/CSS chunks, images, fonts
- Allows the app to "open" instantly even offline
- Shows cached dashboard data or "You're offline" indicator

**Tier 2: Last-known data (IndexedDB)**
- After each successful API call, write response to IndexedDB
- On app open: show IndexedDB data immediately, then refresh from network
- Display "Last updated: 5 minutes ago" indicator
- **Specific caches:**
  - Dashboard attendance subjects array
  - Selected semester
  - Marks data
  - Attendance streak

**Tier 3: StudyMe content (full offline access)**
- StudyMe lessons/topics are static constants bundled in JS → already cached
- PDFs need explicit cache: user taps "Download for offline" → caches in SW
- YouTube videos: cannot be cached (iframe embed)

### What Cannot Work Offline

| Feature | Why |
|---------|-----|
| Login (guest or Firebase) | Requires network to authenticate with portal/Firebase |
| Fresh attendance data | Real-time portal scraping requires active connection |
| Fresh marks data | Same reason |
| Mail Faculty (mailto:) | Actually works offline — opens mail client |
| Importance voting | Requires API call — queue with Background Sync |
| Feedback submission | Queue with Background Sync |

### Background Sync Opportunities

When offline, queue these actions for automatic retry when connection returns:
- Rating submission
- Feedback submission
- Feature usage tracking events
- StudyMe importance votes

---

## 7. Required Technical Changes

### Implementation Checklist

#### Critical (PWA won't install without these)

- [ ] **Create `public/manifest.json`**
```json
{
  "name": "Attend75 — Attendance Tracker",
  "short_name": "Attend75",
  "description": "Track your college attendance and stay above 75%",
  "start_url": "/app/dashboard",
  "display": "standalone",
  "background_color": "#5B5878",
  "theme_color": "#5B5878",
  "orientation": "portrait",
  "icons": [
    { "src": "/icons/icon-192.png", "sizes": "192x192", "type": "image/png" },
    { "src": "/icons/icon-512.png", "sizes": "512x512", "type": "image/png" },
    { "src": "/icons/icon-maskable-512.png", "sizes": "512x512", "type": "image/png", "purpose": "maskable" }
  ],
  "screenshots": [
    { "src": "/screenshots/dashboard.png", "sizes": "390x844", "type": "image/png", "form_factor": "narrow" }
  ]
}
```

- [ ] **Create app icons** (at minimum: 192x192, 512x512, maskable variant)
  - File: `public/icons/icon-192.png`
  - File: `public/icons/icon-512.png`
  - File: `public/icons/icon-maskable-512.png`

- [ ] **Add manifest + meta tags to `frontend/index.html`**
```html
<link rel="manifest" href="/manifest.json" />
<meta name="theme-color" content="#5B5878" />
<meta name="apple-mobile-web-app-capable" content="yes" />
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
<link rel="apple-touch-icon" href="/icons/icon-192.png" />
```

- [ ] **Install vite-plugin-pwa**
```bash
npm install -D vite-plugin-pwa
```

- [ ] **Update `vite.config.js`**
```javascript
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'icons/*.png'],
      manifest: false, // use public/manifest.json
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/fonts\.googleapis\.com/,
            handler: 'StaleWhileRevalidate',
          },
          {
            urlPattern: /^https:\/\/fonts\.gstatic\.com/,
            handler: 'CacheFirst',
            options: { cacheName: 'google-fonts', expiration: { maxEntries: 10, maxAgeSeconds: 31536000 } },
          },
        ],
      },
    }),
  ],
})
```

#### High Priority

- [ ] **Add install prompt UI component** (`frontend/src/components/common/InstallPrompt.jsx`)
  - Listen for `beforeinstallprompt` event
  - Show custom "Install Attend75" banner
  - For iOS: show instructions modal ("Tap Share → Add to Home Screen")

- [ ] **Add offline indicator** (`frontend/src/components/common/OfflineBar.jsx`)
  - Listen for `navigator.onLine` changes
  - Show a subtle top bar: "You're offline — showing cached data"

- [ ] **Update Firebase Auth for standalone mode**
  - Detect `display-mode: standalone`
  - Use `signInWithRedirect` on iOS standalone
  - File: `frontend/src/services/firebaseAuth.js`

- [ ] **Persist session token in localStorage for guest users**
  - Add "Remember me" option
  - File: `frontend/src/store/AppStateProvider.jsx`

#### Medium Priority

- [ ] **Add push notification support**
  - File: `frontend/src/services/pushNotifications.js`
  - File: `frontend/public/firebase-messaging-sw.js` (FCM service worker)
  - Backend: new `routers/notifications.py`
  - Backend: new `services/notification_service.py`
  - Backend: new migration for `push_subscriptions` table
  - Backend: scheduled job for attendance checks

- [ ] **IndexedDB caching for offline data**
  - File: `frontend/src/services/offlineCache.js`
  - Write attendance data after each fetch
  - Read from cache on app open before network call

- [ ] **Background Sync for queued actions**
  - Register sync events for: rating, feedback, feature usage tracking

#### Low Priority

- [ ] **Add screenshots to manifest** (improves install prompt UX on Android)
- [ ] **Web Share API** (replace custom share with native share sheet)
- [ ] **Periodic Background Sync** (auto-refresh attendance data; limited browser support)
- [ ] **WebAuthn / Passkey registration** (fingerprint login)

### File-Level Summary

| New File | Purpose |
|----------|---------|
| `frontend/public/manifest.json` | PWA manifest |
| `frontend/public/icons/icon-192.png` | App icon |
| `frontend/public/icons/icon-512.png` | App icon |
| `frontend/public/icons/icon-maskable-512.png` | Maskable icon |
| `frontend/public/firebase-messaging-sw.js` | FCM service worker |
| `frontend/src/components/common/InstallPrompt.jsx` | Install banner |
| `frontend/src/components/common/OfflineBar.jsx` | Offline indicator |
| `frontend/src/services/pushNotifications.js` | Push notification logic |
| `frontend/src/services/offlineCache.js` | IndexedDB caching |
| `backend/routers/notifications.py` | Notification endpoints |
| `backend/services/notification_service.py` | FCM send logic |
| `backend/db/models/push_subscription.py` | FCM token storage |

| Modified File | Change |
|---------------|--------|
| `frontend/index.html` | Add manifest link, meta tags |
| `frontend/vite.config.js` | Add vite-plugin-pwa |
| `frontend/package.json` | Add vite-plugin-pwa dependency |
| `frontend/src/services/firebaseAuth.js` | Redirect fallback for standalone |
| `frontend/src/store/AppStateProvider.jsx` | Optional localStorage persistence |
| `frontend/src/main.jsx` | SW registration check |
| `backend/app.py` | Include notifications router |

---

## 8. Business Recommendation

### Recommendation: **A. Build the PWA first.**

### Why

| Factor | PWA | React Native |
|--------|-----|------------|
| Dev effort | 2–3 weeks | 8–12 weeks minimum |
| Team skills needed | Same (React + existing codebase) | React Native expertise (new paradigm) |
| Maintenance cost | 1 codebase | 2 codebases (web still needed) |
| Time to market | Ship in 2 weeks | Ship in 2–3 months |
| User experience gap vs native | ~15% worse (mostly animations) | Best possible |
| Risk | Low (nothing to lose, web still works) | High (large investment, uncertain adoption) |
| Update cycle | Instant (push to Vercel) | 1–3 day store review |
| User acquisition | Share a link → 1-tap install | Download from Play Store |

### Development Effort Comparison

**PWA (incremental from existing codebase):**
- Core installability: 1 day
- Service worker + offline: 2 days
- Push notifications: 5–7 days
- Auth improvements: 3–4 days
- Testing: 2 days
- **Total: ~15 days**

**React Native (from scratch):**
- Project setup + navigation: 3 days
- Recreate all 10+ screens: 15–20 days
- Recreate all charts (SVG → react-native-svg): 3 days
- API integration (rewrite all service calls): 3 days
- Firebase auth (react-native-firebase): 3 days
- Push notifications (easier in RN): 2 days
- Testing on devices: 5 days
- Play Store setup + review: 3 days
- **Total: ~40–50 days**

### Growth & Distribution

**PWA advantages for Attend75 specifically:**
- College students share links on WhatsApp/Instagram — a URL is frictionless
- No Play Store listing means no reviews, but also no 1-star bombs from portal downtime
- Can ship PWA in 2 weeks and get real usage data before committing to native
- If PWA gets 500+ active installs → that validates demand for a Play Store presence

**When to build React Native:**
- After PWA proves product-market fit with 500+ weekly active users
- When you want Play Store discoverability
- When you need features impossible in a PWA (e.g., background always-on sync, widgets)
- When monetization requires it (ads are harder in PWAs)

### Monetization Implications

| Revenue Model | PWA | React Native |
|---------------|-----|-------------|
| Free with no ads | ✅ Best fit | ✅ Works |
| In-app ads | Possible but limited | Full AdMob support |
| Premium subscription | Web Payments API | Google Play Billing |
| Freemium features | Works | Works |

For a college attendance tracker, ad-free + optional premium (e.g., push notifications for free users limited to 1/day, unlimited for premium) works in both PWA and native.

### Hidden Risks

1. **Portal session volatility:** The college portal at `111.93.16.209` is unreliable. Push notifications that require portal scraping will fail during portal downtime, generating "Unable to load data" notifications. Need circuit breaker logic.

2. **iOS install education:** 40–50% of college students use iPhones. They won't know how to install a PWA without explicit guidance (tutorial screen or video).

3. **Service Worker update strategy:** If you ship a broken SW, users can get stuck on a cached broken version. Use `skipWaiting` + `clients.claim` carefully.

4. **Firebase Messaging on iOS:** Requires the installed PWA to have been opened at least once after installing. Silent push to wake the app doesn't work on iOS PWAs.

5. **Vercel cold starts:** The backend on DigitalOcean doesn't have cold start issues, but if you ever move to serverless, session-based architecture breaks.

---

## 9. Implementation Roadmap

### Phase 1: Core PWA (Week 1)
- Create manifest.json
- Generate app icons
- Add meta tags to index.html
- Install and configure vite-plugin-pwa
- Add basic service worker (precache static assets)
- Add install prompt component
- Test installation on Android + iOS

### Phase 2: Offline & Persistence (Week 2)
- IndexedDB cache for attendance and marks data
- Offline fallback page
- Network status indicator
- Persist guest session token in localStorage
- Fix Firebase signInWithRedirect for iOS standalone

### Phase 3: Push Notifications (Week 3–4)
- Frontend: Firebase Messaging integration
- Frontend: Notification permission UI
- Backend: `/notifications/subscribe` endpoint
- Backend: Push subscription table + migration
- Backend: Scheduled attendance check job
- Backend: FCM send integration
- Test on Android and iOS

### Phase 4: Advanced (Week 5+)
- WebAuthn / Passkey registration for biometric login
- Background Sync for queued actions
- Notification preferences UI
- Richer notification content (actions, images)
- TWA wrapper for Play Store listing (optional)

---

## 10. Final Verdict

**Build the PWA. Ship it in 2 weeks. Validate with real users. Then decide on native.**

The technical gap between a PWA and a native app for Attend75's use case is small — the app is data display + forms, not a game or camera app. The development cost difference is 5x. The maintenance burden difference is permanent.

If after 2 months the PWA has 500+ active installs and users are requesting Play Store presence, wrap the PWA in a Trusted Web Activity (TWA) for a Play Store listing (1 day of work), or begin a React Native build with validated demand.
