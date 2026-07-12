# Technical Design: Push Notifications Premium

## Overview

Push Notifications Premium adds real-time Web Push alerts on top of Attend75's existing scraping and notice pipeline. It is a paid add-on (₹19/month via PhonePe UPI autopay) that layers a **Notification_Queue** (already scaffolded as `notification_jobs` + `services/notification_queue.py`) between every event source (notice scraper, attendance refresh, timetable parser, background fetcher, admin) and a single **Push Delivery Worker** that performs the actual Web Push send.

The feature reuses existing architectural patterns rather than introducing new ones:

- **Database-backed job queue** (like the existing `notice_jobs`-style polling used by `notice_scheduler.py`) instead of an external broker (Redis/SQS) — consistent with the project's "no new infra" philosophy.
- **`threading.Timer` background loops** (same pattern as `NoticeScheduler`) for the push worker, deadline job, digest job, weekly summary job, nudge job, and background fetcher.
- **Fernet encryption** (`services/crypto_service.py`, already used for portal passwords) reused for push subscription endpoint/key encryption at rest.
- **Session-token authentication** (`session_store`) for all student-facing endpoints, matching `routers/notices.py`.
- **Hooks into existing pipelines**: the Notice_Dispatcher hooks into `notice_processor.process_notice()` (via `notification_sent_at` on `Notice`, already added by migration `20260712_0007`) instead of a separate scraper.

Six DB models and one service (queue) already exist (`premium_subscription.py`, `push_subscription.py`, `notification_preference.py`, `notification_history.py`, `notification_job.py`, `attendance_alert_state.py`, `payment_transaction.py`, `premium_service.py`, `notification_queue.py`). This design specifies the remaining components that consume/produce jobs on that queue, the Web Push delivery engine, the frontend service worker integration, and the PhonePe integration (implemented last, per Requirement 17's note).

## Architecture

```
┌───────────────────────────────────────────────────────────────────────────┐
│                                FRONTEND (PWA)                             │
│                                                                             │
│  ┌────────────────┐  ┌─────────────────────┐  ┌─────────────────────────┐ │
│  │ NotificationSettings│  PremiumUpsell/Paywall│  NotificationHistory     │ │
│  │ Page (prefs UI)     │  (subscribe/cancel)   │  Page                   │ │
│  └────────┬───────┘  └──────────┬──────────┘  └────────────┬────────────┘ │
│           │                     │                           │              │
│  ┌────────┴─────────────────────┴───────────────────────────┴───────────┐ │
│  │              services/pushApi.js  /  services/premiumApi.js          │ │
│  └────────┬───────────────────────────────────────────────────────────┬─┘ │
│           │ subscribe()/PushManager                                  │    │
│  ┌────────┴────────┐                                                 │    │
│  │  sw-push.js      │  (imported into the vite-plugin-pwa generated  │    │
│  │  push/notifi-    │   service worker via importScripts / injectManifest) │
│  │  click listeners │                                                      │
│  └──────────────────┘                                                      │
└───────────────────────────────────────┬───────────────────────────────────┘
                                        │ HTTPS (token / Firebase auth)
┌───────────────────────────────────────┴───────────────────────────────────┐
│                                  BACKEND (FastAPI)                        │
│                                                                             │
│  ┌───────────────────┐  ┌────────────────────┐  ┌───────────────────────┐ │
│  │ routers/push.py    │  │ routers/premium.py │  │ routers/admin.py       │ │
│  │ (subscribe, prefs, │  │ (status, subscribe,│  │ (+broadcast, +fetcher  │ │
│  │  history, unsub)   │  │  cancel, webhook)  │  │  health)               │ │
│  └────────┬──────────┘  └────────┬───────────┘  └──────────┬────────────┘ │
│           │                       │                          │             │
│  ┌────────┴──────────┐  ┌─────────┴──────────┐  ┌───────────┴───────────┐ │
│  │ subscription_      │  │ premium_service.py │  │ broadcast_service.py   │ │
│  │ manager.py          │  │ (existing)         │  │                        │ │
│  │ (existing model +   │  │ + phonepe_service.py│ │                        │ │
│  │  new logic)         │  │  (webhook, mandate) │  │                        │ │
│  └────────┬──────────┘  └────────────────────┘  └────────────────────────┘ │
│           │                                                                │
│           │      ┌──────────────────────────────────────────────────┐      │
│           └─────▶│         services/notification_queue.py (existing) │      │
│                   │         notification_jobs table (DB queue)        │      │
│                   └──────────┬───────────────────────────────────────┘      │
│                              │ claim_pending_jobs()                         │
│         ┌────────────────────┼─────────────────────┬─────────────────────┐  │
│         ▼                    ▼                     ▼                     ▼  │
│  ┌─────────────┐   ┌───────────────────┐  ┌──────────────────┐  ┌──────────┐│
│  │ push_worker  │   │ attendance_monitor │  │ timetable_       │  │ background││
│  │ .py          │   │ .py                 │  │ reminder_engine.py│ │ _fetcher ││
│  │ (dequeues     │   │ (bracket dedup,     │  │ (reminders,      │  │ .py       ││
│  │  push_send    │   │  triggers push_send │  │  daily digest)   │  │ (portal   ││
│  │  jobs, calls   │   │  jobs)              │  │                  │  │  logins)  ││
│  │  pywebpush)    │   └─────────┬──────────┘  └────────┬─────────┘  └────┬─────┘│
│  └──────┬────────┘             │                       │                 │      │
│         │                      │                       │                 │      │
│         │              ┌───────┴────────┐    ┌─────────┴───────┐         │      │
│         │              │notice_dispatcher│    │ weekly_summary  │         │      │
│         │              │.py (hooks       │    │ / nudge / deadline│        │      │
│         │              │ notice_processor)│   │ jobs (schedulers)│         │      │
│         │              └─────────────────┘    └─────────────────┘         │      │
│         │                                                                  │      │
│         ▼                                                                  ▼      │
│  ┌───────────────────────────┐                              ┌─────────────────┐  │
│  │  Web Push Service          │                              │ college portal   │  │
│  │  (browser vendor endpoint, │                              │ (rate-limited    │  │
│  │  VAPID auth, RFC 8030)     │                              │  logins)         │  │
│  └───────────────────────────┘                              └─────────────────┘  │
│                                                                                   │
│  ┌───────────────────────────────────────────────────────────────────────────┐   │
│  │                              PostgreSQL                                    │   │
│  │  premium_subscriptions · push_subscriptions · notification_preferences     │   │
│  │  notification_history · notification_jobs · attendance_alert_states       │   │
│  │  payment_transactions · notices(+notification_sent_at) · student_registry  │   │
│  └───────────────────────────────────────────────────────────────────────────┘   │
└───────────────────────────────────────────────────────────────────────────────────┘
```

### Why a database-backed queue (not Redis/SQS)

The project already runs a single-process FastAPI app with `threading.Timer` background loops (`NoticeScheduler`). `notification_jobs` (already created) follows the same philosophy: `SELECT ... FOR UPDATE SKIP LOCKED` gives safe multi-worker dequeue semantics on PostgreSQL without adding new infrastructure. Workers are `threading.Thread` pools started at app startup, mirroring `notice_scheduler.start()`.

### Component responsibility summary

| Component | Responsibility | Status |
|---|---|---|
| `db/models/*` (7 models) | Schema for subscriptions, prefs, history, jobs, alert state, payments | **Done** |
| `services/notification_queue.py` | Enqueue/claim/complete/fail jobs | **Done** |
| `services/premium_service.py` | Premium status/gating primitives | **Done** |
| `services/subscription_manager.py` | Push endpoint CRUD, 5-device cap, encryption, rate limiting | New |
| `routers/push.py` | Subscribe/unsubscribe/prefs/history endpoints | New |
| `services/push_worker.py` | Dequeues `push_send` jobs, calls `pywebpush`, handles retries/410 | New |
| `services/payload_builder.py` | Builds/truncates `Notification_Payload` per category | New |
| `services/notice_dispatcher.py` | Hooks notice pipeline → enqueues notice/deadline/timetable-change jobs | New |
| `services/attendance_monitor.py` | Bracket-dedup evaluation → enqueues attendance alert jobs | New |
| `services/timetable_reminder_engine.py` | Class reminders + daily digest scheduling | New |
| `services/weekly_summary_service.py` | Monday summary computation | New |
| `services/nudge_service.py` | Inactive-user nudge eligibility | New |
| `services/broadcast_service.py` | Admin broadcast targeting + stats | New |
| `services/background_fetcher.py` | Queue-based portal login for Firebase users | New |
| `services/phonepe_service.py` | Mandate creation, webhook verification, cancellation | New (last) |
| `routers/premium.py` | Subscribe/status/cancel/webhook endpoints | New |
| `routers/admin.py` (extend) | Broadcast form submit, fetcher health | Extend existing |
| `frontend/src/pwa/push/*` | Service worker push/notificationclick handlers | New |
| `frontend/src/services/pushApi.js`, `premiumApi.js` | Frontend API clients | New |
| `frontend/src/pages/NotificationSettings.jsx`, etc. | UI | New |

## Components and Interfaces

### 1. Subscription Manager (`services/subscription_manager.py`)

Owns all `push_subscriptions` CRUD. Endpoint/key values are encrypted at rest using the existing `credential_crypto_service` pattern (a dedicated `CredentialCryptoService` instance keyed by the same Fernet mechanism, reusing `crypto_service.py`).

```python
def register_subscription(
    roll_number: str,
    endpoint: str,
    p256dh_key: str,
    auth_key: str,
    device_info: str | None,
    consent_method: str = "browser_prompt",
) -> dict:
    """
    1. Premium_Gate check via premium_service.is_premium(roll_number); raise PermissionError if not premium.
    2. Rate-limit check: count registrations for this roll_number in the last hour
       (query push_subscriptions... actually tracked via a lightweight in-memory/DB counter,
       see RateLimiter below); raise RateLimitError if >= 10/hour.
    3. Encrypt endpoint/p256dh_key/auth_key with crypto_service before storing.
    4. Upsert by (roll_number, endpoint) — re-registering the same endpoint updates keys/consent.
    5. If count of subscriptions for roll_number > 5 after insert, delete the row with the
       oldest created_at (evict-oldest).
    6. Return the created/updated subscription (decrypted for the response is NOT needed —
       return only id/device_info/created_at).
    """

def remove_subscription(roll_number: str, endpoint: str) -> bool:
    """Delete by (roll_number, endpoint). Used for explicit unsubscribe AND for HTTP 410 cleanup."""

def remove_subscription_by_id(subscription_id: int) -> bool:
    """Used internally by push_worker on 410 Gone responses."""

def list_subscriptions(roll_number: str) -> list[dict]:
    """Return decrypted-enough info for settings UI (endpoint host only, not full keys)."""

class RateLimiter:
    """
    Simple sliding-window counter backed by a small in-memory dict keyed by roll_number,
    storing a deque of registration timestamps (mirrors the lightweight, no-new-infra style
    already used by session_store). 10 requests / rolling 3600s window.
    """
```

### 2. Payload Builder (`services/payload_builder.py`)

Single source of truth for constructing a `Notification_Payload` dict and enforcing the 4KB cap (Req 7.2), shared by every dispatcher (notice, deadline, timetable-change, attendance, digest, weekly summary, nudge, broadcast).

```python
CATEGORY_TTL_SECONDS = {"standard": 24 * 3600, "high": 48 * 3600}

def build_payload(
    category: str,           # notice, attendance, timetable, digest, weekly_summary, nudge, broadcast
    title: str,
    body: str,
    deep_link: str | None,
    priority: str = "standard",   # standard | high
    icon: str = "/icons/icon-192.png",
    actions: list[dict] | None = None,
) -> dict:
    """
    Truncates `body` so the JSON-serialized payload never exceeds 4096 bytes
    (truncate body first, preserving title/deep_link/category which are small
    and required for the client to render/act). Returns the final dict ready
    for pywebpush's `data=json.dumps(payload)`.
    """

def is_high_priority(category: str, notice_priority: int | None = None) -> bool:
    """category == 'Exam' or (notice_priority is not None and notice_priority > 60)."""

def notice_deep_link(notice_id: int) -> str:
    return f"/app/notices?open={notice_id}"
```

### 3. Push Worker (`services/push_worker.py`)

Dequeues `push_send` jobs and performs the actual Web Push delivery using `pywebpush` (new dependency) with VAPID auth.

```python
class PushWorker:
    """
    Mirrors NoticeScheduler's threading.Timer loop, but with N worker threads
    (default 10, Req 7.7) each polling claim_pending_jobs(job_types=["push_send"]).
    """
    def start(self, concurrency: int = 10): ...
    def stop(self): ...

    def _process_job(self, job: dict) -> None:
        """
        payload = job["payload"]  # {roll_number, notification: {...}, subscription_id?}
        For each active PushSubscription of roll_number (or the single one referenced):
          1. Skip if not premium (unless job explicitly allows grace-period delivery —
             checked once via premium_service.is_premium which already accounts for grace).
          2. webpush(subscription_info, data=json.dumps(payload), vapid_private_key=...,
             ttl=CATEGORY_TTL_SECONDS[priority])
          3. On success: insert notification_history row (delivery_status='sent'), mark_done(job.id).
          4. On WebPushException with response.status_code == 410:
             subscription_manager.remove_subscription_by_id(sub.id); continue other subs.
          5. On 429/5xx: mark_failed(job.id, error, can_retry=True)
             -> notification_queue applies the existing 30s/120s/480s backoff.
          6. On other errors (400, invalid keys): mark_failed(job.id, error, can_retry=False),
             insert notification_history row with delivery_status='failed'.
        """
```

VAPID keys are read from environment variables (`VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_CONTACT_EMAIL`), generated once via `vapid_gen()` (from `pywebpush`/`py_vapid`) and stored in `backend/.env` (never committed) — same convention as `CREDENTIAL_ENCRYPTION_KEY`.

### 4. Notice Dispatcher (`services/notice_dispatcher.py`)

Hooks into the existing notice pipeline. Rather than modifying `notice_processor.py` directly, `notice_scheduler.py`'s `_execute_scrape` / `trigger_immediate` calls `notice_dispatcher.dispatch_for_new_notices(notice_ids)` right after `process_batch()` succeeds (same call site pattern as the existing scrape cycle).

```python
def dispatch_for_new_notices(notice_ids: list[int]) -> None:
    """
    1. Load Notice rows where notice_id in notice_ids and processing_status == 'done'
       and notification_sent_at is NULL.
    2. Detect timetable-change notices (Req 13.1) via is_timetable_change_title(title);
       for those, additionally enqueue a 'timetable_change' job per matching program AND
       invalidate timetable_service._timetable_cache, and re-queue a has_timetable
       re-evaluation job (has_timetable_reeval) for subscribed students in that program.
    3. Batch check (Req 3.3): if more than 3 non-timetable notices in this call
       (proxy for "within 5 minutes", since dispatch runs once per scrape cycle),
       consolidate into a single summary job per target program instead of N jobs.
    4. Otherwise, for each notice: resolve target roll numbers via
       _subscribed_students_for_program(notice.target_program or notice.source_program),
       filter out students who disabled the category (notification_preferences,
       see preference_filter.should_send) or the specific notice category flag,
       and enqueue one 'push_send' job per student (priority = payload_builder.is_high_priority(...)).
    5. Mark notices.notification_sent_at = now() for all processed ids (idempotency — dispatcher
       is safe to call twice for the same notice_id).
    """

def is_timetable_change_title(title: str) -> bool:
    """
    True iff title (uppercased) contains 'TIMETABLE' or 'TIME TABLE'
    AND does not contain 'SPECIAL', 'SUMMER', 'REMEDIAL', or 'EXAM'.
    Mirrors timetable_service._find_latest_timetable_notice's exclusion rule.
    """

def _subscribed_students_for_program(program: str | None) -> list[str]:
    """
    SELECT roll_number FROM push_subscriptions
    JOIN premium_subscriptions ... (is_premium)
    JOIN student_registry ON program = :program OR student_registry.program IS NULL
    -- program is NULL on the notice side too => match ALL subscribed students (Req 3.1).
    """
```

Deadline reminders (Req 10) run as their own daily job rather than being part of `dispatch_for_new_notices`, since they operate on already-processed notices with a `deadline` column:

```python
def run_deadline_evaluation() -> None:
    """
    Scheduled daily 07:00 IST (threading.Timer loop in a small DeadlineScheduler,
    same shape as NoticeScheduler). For every Notice with deadline is not NULL and
    deadline >= today:
      days_left = (deadline - today_ist()).days
      if days_left == 3: reminder_type = 'approaching'
      elif days_left == 1: reminder_type = 'final' (priority='high')
      else: skip
      For each subscribed student in the matching program:
        - skip if UserNotice(user_id/roll, notice_id).dismissed is True
        - skip if category disabled in NotificationPreferences
        - enqueue push_send job with payload_builder.build_payload(category='notice', ...)
    """
```

### 5. Notification Preference Filter (`services/preference_filter.py`)

Small pure module shared by every dispatcher (Req 3.5, 6.1, 6.2, 6.3, 10.6):

```python
CATEGORY_FLAG_MAP = {
    "Exam": "notice_exam", "Fee": "notice_fee", "Academic": "notice_academic",
    "Internship": "notice_internship", "Event": "notice_event",
    "Guest Lecture": "notice_guest_lecture", "General": "notice_general",
}

def should_send_notice(prefs: NotificationPreference, notice_category: str) -> bool:
    """prefs.notices_enabled and getattr(prefs, CATEGORY_FLAG_MAP.get(notice_category, 'notice_general'))"""

def should_send(prefs: NotificationPreference, master_flag: str) -> bool:
    """getattr(prefs, master_flag) — used for attendance_enabled/timetable_enabled/etc."""

def get_or_create_preferences(roll_number: str) -> NotificationPreference:
    """
    Req 6.5: default all-enabled, reminder_lead_minutes=15, daily_digest_hour=8, minute=0.
    Model defaults already encode these — this just does get-or-insert.
    """
```

### 6. Attendance Monitor (`services/attendance_monitor.py`)

Implements the bracket-based dedup state machine (Req 4). Triggered from two call sites: (a) the existing student-login attendance fetch path, (b) `background_fetcher.py` after each successful portal fetch.

```python
def bracket_for(percent: float) -> str:
    """'below_75' if percent < 75 else '75_to_80' if percent < 80 else 'above_80'"""

def evaluate_attendance(roll_number: str, overall_percent: float, subject_percents: dict[str, float]) -> None:
    """
    1. Overall alerts: bracket_for(overall_percent) vs a synthetic subject_abbr='__overall__'
       row in attendance_alert_states. On bracket change to '75_to_80' -> enqueue warning
       (Req 4.1). On change to 'below_75' -> enqueue critical/high-priority (Req 4.2).
       On change to 'above_80' from a lower bracket -> no alert defined for overall recovery
       (only subject-level recovery is specified, Req 4.4) — just update state silently.
    2. Per-subject alerts: for each (subject_abbr, percent) in subject_percents:
         new_bracket = bracket_for(percent)
         state = get_or_create(roll_number, subject_abbr)
         if new_bracket == state.last_alerted_bracket: continue  # Req 4.5 dedup
         if new_bracket == 'below_75':
             classes_needed = classes_to_recover(percent, attended, total)  # Req 4.3
             enqueue push_send(category='attendance', priority='high', ...)
         elif state.last_alerted_bracket == 'below_75' and new_bracket in ('75_to_80','above_80'):
             enqueue push_send(category='attendance', priority='standard', body='Recovered...')  # Req 4.4
         update state.last_alerted_bracket = new_bracket, last_alerted_percent = percent
    3. All writes gated by preference_filter.should_send(prefs, 'attendance_enabled').
    """

def classes_to_recover(current_percent: float, attended: int, total: int) -> int:
    """
    Smallest integer n such that (attended + n) / (total + n) >= 0.75.
    Solved algebraically: n = ceil((0.75*total - attended) / 0.25), clamped to >= 0.
    """
```

`evaluate_attendance` is called with `subject_percents` derived from the same attendance-parsing logic already used by `/attendance` (existing scraper output); no new scraping logic is introduced here — this module only adds the alerting layer on top of numbers Attend75 already computes.

### 7. Timetable Reminder Engine (`services/timetable_reminder_engine.py`)

Builds on `services/timetable_service.py` (existing `_find_latest_timetable_notice`, `_get_parsed_schedule`, `_match_student_classes`).

```python
VALID_LEAD_MINUTES = {10, 15, 30, 60}

def schedule_reminders_for_today() -> None:
    """
    Runs once daily (early morning) via a small threading.Timer loop:
    1. For each premium student with has_timetable=True and timetable_enabled preference:
       a. today_classes = timetable_service.get_todays_classes(roll_number)  # thin wrapper
          around _match_student_classes filtered to today's weekday
       b. if not today_classes: skip (Req 5.3) — also compute and send the daily digest
          decision here (Req 11.3 shares the same "no classes" check)
       c. For each class: schedule_at = class_start - lead_minutes (validated against
          VALID_LEAD_MINUTES, default 15 if invalid); enqueue a push_send job with
          scheduled_at=schedule_at (notification_queue.enqueue supports scheduled_at already)
       d. Build the daily digest payload (count, first class time, subjects) and enqueue
          one push_send job scheduled at the student's daily_digest_hour:minute,
          batched across a 15-minute window (Req 11.6) by spreading scheduled_at with a
          small random/deterministic jitter per student (roll_number hash % 900 seconds).
    """

def get_todays_classes(roll_number: str) -> list[dict]:
    """Thin wrapper: reuse get_personalized_timetable() output, filter to today's weekday."""

def reevaluate_has_timetable(roll_number: str) -> bool:
    """
    Req 5.5 / 11.5 / 13.4: recompute matching via timetable_service; if zero classes
    across the whole week (not just today), set push_subscriptions... actually
    has_timetable lives on PushSubscription — update all of the student's subscription
    rows. Returns the new has_timetable value.
    """
```

### 8. Weekly Summary Service (`services/weekly_summary_service.py`)

```python
def compute_weekly_summary(roll_number: str) -> dict | None:
    """
    1. Resolve current overall % and per-subject %:
       - Firebase-linked: latest values from the most recent successful background fetch
         (stored via background_fetcher on student_registry.last_attendance_percent,
         plus a small in-memory/DB snapshot of subject-level percents kept by
         attendance_monitor's last evaluate_attendance call — reuse attendance_alert_states
         `last_alerted_percent` per subject as the "current known percent" source for
         Firebase-linked users, since that's already updated by every fetch cycle).
       - Guest (no Firebase link): student_registry.last_attendance_percent, only if
         updated within the last 7 days; otherwise return None (Req 12.5) — skip entirely.
    2. Look up last week's snapshot (a lightweight table is NOT introduced; instead we
       diff against the previous Monday's computed value stored in NotificationHistory's
       logged payload for category='weekly_summary' — parse the last weekly_summary
       history row's stored overall percent). If no prior snapshot exists, delta=None.
    3. tone = 'positive' if overall >= 85 else 'critical' if overall < 75 else 'neutral'
       priority = 'high' if tone == 'critical' else 'standard'
       recovery_classes = classes_to_recover(...) summed across subjects below 75% if critical.
    4. Returns {overall, delta, direction, lowest_subject, tone, priority, recovery_classes}
       or None if the student should be skipped entirely (Req 12.5 staleness).
    """
```

### 9. Nudge Service (`services/nudge_service.py`)

```python
def should_nudge(days_since_last_seen: int, days_since_last_nudge: int | None) -> bool:
    """
    3 <= days_since_last_seen <= 14
    AND (days_since_last_nudge is None or days_since_last_nudge >= 7)
    """

def run_nudge_evaluation() -> None:
    """
    Daily 10:00 IST. For every premium student:
      days_since_last_seen = (today - student_registry.last_seen_at).days
      last_nudge = most recent notification_history row with category='nudge' for roll_number
      days_since_last_nudge = (today - last_nudge.created_at).days if last_nudge else None
      if should_nudge(...): enqueue push_send(category='nudge', body=f"{days} days since your last check-in...")
    """
```

### 10. Broadcast Service (`services/broadcast_service.py`)

```python
def send_broadcast(title: str, body: str, audience: str, program: str | None,
                    priority: str, deep_link: str | None, admin_username: str) -> dict:
    """
    1. Resolve targets: audience == 'all' -> all premium (is_premium True) subscribed
       students; audience == 'program' -> filtered by student_registry.program == program.
       (Same targeting/filter function as notice_dispatcher._subscribed_students_for_program,
       reused here — this is precisely the "targeting logic" property in the design's
       Correctness Properties section.)
    2. enqueue_batch one push_send job per target roll_number with category='broadcast'.
    3. Every push_send job, regardless of source, writes a notification_history row on
       delivery (Req 15.3) — no special-casing needed here.
    4. Return {queued_count: len(targets)}.
    """

def get_broadcast_stats(broadcast_batch_id: str) -> dict:
    """sent_count = count(history where batch_id=...), opened_count = count(...is_read=True)."""
```

Broadcast jobs are tagged with a `batch_id` (a UUID stored in the job payload and copied into `notification_history` — a new nullable `batch_id` column is NOT required for MVP; instead the broadcast title+created_at window is used to group stats, since `notification_history.title` is already indexed). Only `require_admin_user` sessions with `role == "super_admin"` (extends `admin_service.require_admin_user` to check role) may call this.

### 11. Background Fetcher (`services/background_fetcher.py`)

Implements Req 16's queue-based portal-login pipeline.

```python
class BackgroundFetcher:
    """
    Scheduler (threading.Timer, 6h interval at 00:00/06:00/12:00/18:00 IST) that:
    1. Selects eligible students: Firebase-linked (has PortalCredential via User),
       is_premium(roll_number), last_seen_at within 30 days (Req 16.10), credential
       status != 'invalid', and not currently paused (next_eligible_at <= now).
    2. Orders them round-robin by last_fetch_at ascending (least-recently-fetched first,
       Req 16.7) and enqueues one 'attendance_fetch' job per eligible student, each with
       scheduled_at spaced >= 10 seconds apart (Req 16.3) — computed as
       base_time + index * 10s when enqueuing, rather than enforced by the worker,
       so a single worker naturally respects the spacing via claim_pending_jobs()
       returning nothing until scheduled_at.
    """
    def start(self): ...
    def stop(self): ...

def process_fetch_job(roll_number: str) -> None:
    """
    1. Load PortalCredential via User.roll_number lookup; decrypt password
       (crypto_service.decrypt) — log a credential_access_log entry (Req 18.7) for audit.
    2. login_user(roll_number, password) [reuses services/auth_service.login_user]
    3. On PortalAuthenticationError(code='INCORRECT_PASSWORD'/'INVALID_USERNAME'):
       mark credential invalid (a new `status` column added to PortalCredential via
       migration, default 'valid'), enqueue a one-time 'relink_required' push_send job
       (only if not already sent — checked via notification_history dedupe on category),
       set BackgroundFetchState.consecutive_failures unaffected (this is terminal, not transient).
    4. On transient errors (timeout/connection): increment consecutive_failures;
       if attempts within this job < 2, mark_failed(can_retry=True) with a 60s delay
       (override the default exponential backoff for this job_type); if this is the
       3rd consecutive CYCLE failure (tracked via a small BackgroundFetchState row,
       new table `background_fetch_state` keyed by roll_number with columns
       last_fetch_at, last_fetch_status, consecutive_failures, next_eligible_at),
       set next_eligible_at = now + 24h (Req 16.6c).
    5. On success: fetch attendance (existing scraper call), update
       student_registry.last_attendance_percent, call attendance_monitor.evaluate_attendance(...),
       reset consecutive_failures=0, set last_fetch_at=now, last_fetch_status='success', logout.
    """
```

A new small table `background_fetch_state` (roll_number PK, last_fetch_at, last_fetch_status, consecutive_failures, next_eligible_at) is added — this is the natural home for Req 16.8's per-student metrics and keeps `PortalCredential` free of scheduling concerns; `PortalCredential` only gains a `status` column (`valid`/`invalid`).

### 12. PhonePe Service (`services/phonepe_service.py`) — implemented after Req 1–16

```python
def initiate_subscription(roll_number: str) -> dict:
    """
    Calls PhonePe PG "Create Subscription" API (UPI Autopay) with amount=1900 (paise),
    frequency=MONTHLY. Returns {redirect_url, merchant_transaction_id}. On any PhonePe
    API error, returns an error dict WITHOUT writing any premium_subscriptions or
    payment_transactions row (Req 17.11 — atomicity).
    """

def handle_webhook(raw_body: bytes, x_verify_header: str, timestamp: str) -> dict:
    """
    1. Reject if len(raw_body) > 64KB (Req 17.10d).
    2. Reject if abs(now - parse(timestamp)) > 5 minutes (Req 17.10b).
    3. Recompute SHA256(base64(raw_body) + salt) and compare to x_verify_header
       (Req 17.10a) — constant-time compare.
    4. Parse event type: payment.success | recurring.success | recurring.failed.
    5. Idempotency (Req 17.10c): look up payment_transactions by transaction_id first;
       if it already exists with status='success', return {"status": "already_processed"}
       WITHOUT calling premium_service.activate_premium again.
    6. On payment.success (first payment): premium_service.activate_premium(roll_number,
       phonepe_subscription_id); insert payment_transactions row.
    7. On recurring.success: premium_service.activate_premium(...) again (its existing
       renew-by-extending-30-days logic already handles this, Req 17.5); insert
       payment_transactions row.
    8. On recurring.failed: premium_service.enter_grace_period(roll_number) (already
       implemented, Req 17.6); insert payment_transactions row with status='failed'.
    """

def cancel_subscription(roll_number: str) -> dict:
    """
    Calls PhonePe "Cancel Mandate" API; on success calls
    premium_service.cancel_subscription(roll_number) (already implemented — sets
    status='cancelled', cancelled_at=now; expiry_date is untouched so is_premium()
    keeps returning True until expiry_date passes, satisfying Req 17.9's no-proration rule).
    On PhonePe API failure, returns an error and does NOT call cancel_subscription
    (Req 17.11 atomicity).
    """
```

### 13. API Routers

`routers/push.py` (new):

```python
router = APIRouter(prefix="/push", tags=["push"])

POST /push/subscribe          # {token, endpoint, keys:{p256dh, auth}, device_info}
DELETE /push/subscribe        # {token, endpoint}
GET  /push/preferences        # ?token=...
PUT  /push/preferences        # {token, ...fields}
GET  /push/history            # ?token=...  (last 50, Req 8.2)
POST /push/history/{id}/read  # {token}     (Req 8.4)
GET  /push/vapid-public-key   # public, no auth needed — browser needs this to call subscribe()
```

`routers/premium.py` (new):

```python
router = APIRouter(prefix="/premium", tags=["premium"])

GET  /premium/status          # ?token=...  -> premium_service.get_subscription_status
POST /premium/subscribe       # {token}     -> phonepe_service.initiate_subscription
POST /premium/cancel          # {token}     -> phonepe_service.cancel_subscription
POST /premium/webhook         # PhonePe callback (no session token; signature-verified) — HTTPS only
GET  /premium/transactions     # ?token=...  -> owner-only payment history (Req 17.8)
```

`routers/admin.py` (extend existing router):

```python
POST /admin/broadcast          # {title, body, audience, program?, priority, deep_link?} — super_admin only
GET  /admin/broadcast/{batch}/stats
GET  /admin/fetcher/health     # queue depth, processed this cycle, failures, avg duration
```

## Data Models

The seven models below already exist exactly as shown (read from the repository) and require no changes, **except** two additive migrations:

1. Add `status: Mapped[str] = mapped_column(String(16), default="valid")` to `db/models/portal_credential.py` (valid/invalid).
2. New model `db/models/background_fetch_state.py`:

```python
class BackgroundFetchState(Base):
    __tablename__ = "background_fetch_state"
    roll_number: Mapped[str] = mapped_column(String(32), primary_key=True)
    last_fetch_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    last_fetch_status: Mapped[str] = mapped_column(String(16), default="pending")  # success, failed, invalid_credentials
    consecutive_failures: Mapped[int] = mapped_column(Integer, default=0)
    next_eligible_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
```

Existing models referenced (no changes): `PremiumSubscription`, `PushSubscription`, `NotificationPreference`, `NotificationHistory`, `NotificationJob`, `AttendanceAlertState`, `PaymentTransaction`, `Notice.notification_sent_at`, `StudentRegistry.last_attendance_percent` / `last_seen_at`, `PortalCredential`, `User`.

### Notification_Payload shape (in-memory / JSON, not a DB table)

```json
{
  "category": "notice | attendance | timetable | digest | weekly_summary | nudge | broadcast",
  "title": "string, required",
  "body": "string, required, truncated so total payload <= 4096 bytes",
  "deepLink": "string | null, e.g. /app/notices?open=123",
  "priority": "standard | high",
  "icon": "/icons/icon-192.png",
  "badge": "/icons/badge-72.png",
  "actions": [{"action": "open", "title": "View"}]
}
```

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system-essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property 1: Subscription registration round-trip

For any roll number and any valid subscription payload (endpoint, p256dh_key, auth_key, device_info, consent method), registering the subscription and then reading it back returns a record whose decrypted endpoint/keys and consent fields (timestamp, method, device info) equal the values provided.

**Validates: Requirements 1.1, 1.10, 18.4**

### Property 2: Subscription removal is exact

For any set of push subscriptions belonging to one or more students, removing a subscription by endpoint (whether via explicit unsubscribe or an HTTP 410 response during delivery) results in exactly that subscription being absent afterward and all other subscriptions remaining unchanged.

**Validates: Requirements 1.2, 1.3**

### Property 3: Five-device cap evicts oldest

For any sequence of subscription registrations for a single student, the stored subscription set never exceeds 5 rows, and after registering more than 5 endpoints, the stored set always consists of the 5 most-recently-registered endpoints (the oldest is evicted first).

**Validates: Requirements 1.4**

### Property 4: Premium gate authorizes only active/grace subscriptions

For any roll number and any premium-gated action (push subscription registration, preference update), the action is permitted if and only if `premium_service.is_premium(roll_number)` is true for that student's stored subscription state (active-and-unexpired, or grace-and-within-grace_ends_at).

**Validates: Requirements 1.5, 2.1, 2.2, 2.5**

### Property 5: Registration rate limiting

For any sequence of subscription registration attempts for one student with associated timestamps, at most 10 attempts within any rolling 60-minute window succeed; all subsequent attempts within that window are rejected.

**Validates: Requirements 1.7**

### Property 6: Renewal resumes delivery without touching endpoints

For any student with existing push subscriptions whose premium subscription is expired, renewing the subscription (`activate_premium`) leaves the `push_subscriptions` rows unmodified and flips `is_premium(roll_number)` back to true, so the eligibility check in Property 4 passes again without re-registration.

**Validates: Requirements 2.3**

### Property 7: Subscription status reflects stored state

For any premium subscription record state (active/grace/expired/cancelled, with arbitrary expiry_date/grace_ends_at), `get_subscription_status(roll_number)` returns `is_premium`, `status`, and `grace_remaining_days` values that are consistent with that state (e.g., `grace_remaining_days` equals the whole days between now and `grace_ends_at` only while in grace, and is `None` otherwise).

**Validates: Requirements 2.4**

### Property 8: Notice dispatch targets exactly the matching, subscribed, opted-in audience

For any notice (with a given `target_program`/`source_program`) and any set of subscribed premium students each with a program (or `None`) and a set of notification preferences, the set of students enqueued for that notice equals exactly `{ students whose program matches the notice's program OR whose program is NULL } ∩ { students who have not disabled the notice's category in their preferences }`.

**Validates: Requirements 3.1, 3.5, 6.1, 6.2, 6.3, 10.6**

### Property 9: Notification payload construction

For any notice/attendance/timetable/digest input used to build a `Notification_Payload`, the constructed payload always contains the required fields for its category (title, truncated body/summary, deep-link matching the expected pattern), and the serialized JSON size never exceeds 4096 bytes regardless of how long the source title/body/summary is.

**Validates: Requirements 3.2, 7.2, 10.4, 13.2**

### Property 10: Batch consolidation picks highest-priority category

For any batch of more than 3 notices dispatched together, the system produces a single consolidated notification whose stated count equals the batch size and whose category equals the highest-priority category present in the batch, using the order Exam > Fee > Academic > Internship > Event > Guest Lecture > General.

**Validates: Requirements 3.3**

### Property 11: High-priority classification

For any combination of notice category and priority score, a notification is marked high-priority if and only if the category is "Exam" or the priority score is greater than 60.

**Validates: Requirements 3.4**

### Property 12: Attendance bracket dedup state machine

For any sequence of attendance percentage readings for a student/subject pair, an alert is enqueued only when the computed bracket (`below_75` / `75_to_80` / `above_80`) differs from the previously stored `last_alerted_bracket`; repeated readings within the same bracket never produce additional alerts, a transition into `below_75` always produces a critical/high-priority alert, and a transition out of `below_75` into a higher bracket always produces a "recovered" notification.

**Validates: Requirements 4.1, 4.2, 4.4, 4.5, 4.6**

### Property 13: Classes-needed-to-recover formula

For any current attended/total class counts with a percentage below 75%, `classes_to_recover` returns the smallest non-negative integer of additional consecutive classes attended such that the resulting percentage is at least 75%, and that value, when actually added to attended/total, produces a percentage >= 75% while one fewer additional class does not.

**Validates: Requirements 4.3**

### Property 14: Timetable reminder scheduling

For any day's list of scheduled classes and a configured lead time, the engine schedules exactly one reminder job per class at `class_start - lead_minutes`, with a payload containing the subject, section, room, faculty, and computed time-until-class; when the day's class list is empty, no reminder jobs are scheduled.

**Validates: Requirements 5.1, 5.2, 5.3**

### Property 15: Lead time validation

For any requested reminder lead time value, it is accepted only if it is one of {10, 15, 30, 60}; any other value is rejected and the student's setting falls back to the default of 15 minutes.

**Validates: Requirements 5.4**

### Property 16: has_timetable reflects match results

For any timetable-matching result for a student (including zero matched classes across the week), `has_timetable` is set to true if and only if at least one class was matched; this holds identically whether triggered by initial matching, daily digest evaluation, or re-evaluation after a new timetable notice.

**Validates: Requirements 5.5, 11.4, 11.5, 13.4**

### Property 17: Preferences persist and apply immediately

For any valid notification preference object, saving it and then loading it by roll number returns an equal object; and for any notice/category, changing a preference flag changes the outcome of the dispatch-targeting filter (Property 8) on the very next evaluation without any change to the student's stored push subscriptions.

**Validates: Requirements 6.3, 6.4**

### Property 18: Default preferences on first subscription

For any new roll number that becomes premium for the first time, the created `NotificationPreference` record has every category enabled, `reminder_lead_minutes = 15`, and `daily_digest_hour/minute = 8:00`.

**Validates: Requirements 6.5**

### Property 19: Retry backoff schedule

For any job that fails with a retryable error, the computed retry delay for attempt N (N = 1, 2, 3) equals `30 * 4^(N-1)` seconds (30s, 120s, 480s), and after the 3rd failed attempt the job is marked permanently failed rather than rescheduled.

**Validates: Requirements 7.3**

### Property 20: TTL mapping by priority

For any notification priority value, the Web Push TTL used for delivery is 24 hours for "standard" priority and 48 hours for "high" priority.

**Validates: Requirements 7.4**

### Property 21: Notification rendering maps payload to display options

For any received push payload (varying category, title, body, deep-link, and validity), the service worker's push handler produces `Notification` display options whose title/body/icon/badge/actions match the payload's category-specific configuration, and malformed or undecryptable payloads always fall back to a generic notification rather than throwing.

**Validates: Requirements 7.5, 9.2, 9.4**

### Property 22: Subscription endpoint encryption round-trip

For any subscription endpoint or key string, encrypting then decrypting returns the original string exactly, and the value actually persisted to `push_subscriptions` never equals the original plaintext.

**Validates: Requirements 7.8, 18.1**

### Property 23: History logging is complete and consistent

For any dispatched notification (individual, deadline, digest, weekly summary, nudge, or admin broadcast), a corresponding `notification_history` row is created with matching timestamp, category, title, delivery status, target roll number, and deep-link, for every recipient of a broadcast as well as individual sends.

**Validates: Requirements 8.1, 8.3, 15.3**

### Property 24: History pagination

For any student with more than 50 notification history records, requesting history returns exactly 50 records ordered by `created_at` descending.

**Validates: Requirements 8.2**

### Property 25: Read-marking is idempotent

For any notification history record, marking it as read sets `is_read = true` and a non-null `read_at`; marking it as read a second time leaves `is_read` true and does not raise an error or change the original `read_at` in a way that violates monotonicity.

**Validates: Requirements 8.4**

### Property 26: Retention windows enforce deletion

For any notification history record older than 90 days, a cleanup pass removes it while leaving records newer than 90 days untouched; for any payment transaction record older than 365 days, an equivalent cleanup removes/archives it while leaving newer records untouched.

**Validates: Requirements 8.5, 18.2, 18.3**

### Property 27: Unread badge count

For any list of notification history records, the computed badge count equals the number of records with `is_read = false`.

**Validates: Requirements 9.5**

### Property 28: Deadline reminder type mapping

For any notice deadline date and current date, the deadline evaluation produces no reminder if `days_until != 3` and `days_until != 1`, an "approaching" (standard priority) reminder if `days_until == 3`, and a "final" (high priority) reminder if `days_until == 1`.

**Validates: Requirements 10.2, 10.3**

### Property 29: Dismissed notices are excluded from deadline reminders

For any notice and any set of a student's dismissed notice ids, a deadline reminder is enqueued for that student only if the notice id is not in that student's dismissed set.

**Validates: Requirements 10.5**

### Property 30: Daily digest content and empty-day suppression

For any day's matched class list, the computed digest contains the correct class count, first class time, and subject list; when the list is empty, no digest is produced for that day.

**Validates: Requirements 11.2, 11.3**

### Property 31: Weekly summary computation

For any pair of current and previous week attendance snapshots (overall percent and per-subject percents), the computed weekly summary's delta and direction arithmetically match the difference between the two snapshots, and the reported lowest-attendance subject is always the subject with the minimum percent in the current snapshot.

**Validates: Requirements 12.2**

### Property 32: Weekly summary tone/priority mapping

For any overall attendance percentage, the weekly summary's tone/priority is "positive"/standard when the percentage is above 85%, "critical"/high when below 75%, and neutral/standard otherwise; when critical, the reported recovery-classes count matches the sum of `classes_to_recover` across all subjects currently below 75%.

**Validates: Requirements 12.3, 12.4**

### Property 33: Guest weekly summary staleness gate and data-source selection

For any guest student, the weekly summary is computed only if `student_registry.last_attendance_percent` was updated within the last 7 days, and is skipped entirely otherwise; for any Firebase-linked student, the summary always uses the most recent background-fetch value rather than a stale registry value.

**Validates: Requirements 12.5, 12.6**

### Property 34: Timetable-change title classification

For any notice title, `is_timetable_change_title` returns true if and only if the uppercased title contains "TIMETABLE" or "TIME TABLE" and does not contain "SPECIAL", "SUMMER", "REMEDIAL", or "EXAM".

**Validates: Requirements 13.1**

### Property 35: Timetable cache invalidation

For any cached timetable entry, processing a new timetable-change notice removes that entry from the in-memory cache so the next lookup re-parses rather than returning stale data.

**Validates: Requirements 13.3**

### Property 36: Inactive nudge eligibility state machine

For any combination of days since a student's last login and days since their last nudge (or no prior nudge), a nudge is sent if and only if `3 <= days_since_last_seen <= 14` and (`no prior nudge` or `days_since_last_nudge >= 7`); the nudge payload always references the correct day count.

**Validates: Requirements 14.1, 14.2, 14.3, 14.4**

### Property 37: Broadcast targeting matches audience selector

For any admin broadcast request with audience "all" or "program"+specific program, and any set of premium subscriptions with programs, the enqueued recipient set exactly equals the filtered set implied by the audience selector (all premium subscribers, or only those in the specified program).

**Validates: Requirements 15.2**

### Property 38: Broadcast delivery statistics

For any set of notification history records tied to a broadcast, the reported sent count equals the total number of records and the reported opened count equals the number with `is_read = true`.

**Validates: Requirements 15.4**

### Property 39: Broadcast authorization

For any admin role, submitting a broadcast succeeds only if the role is "super_admin"; all other roles are rejected.

**Validates: Requirements 15.5**

### Property 40: Background fetcher login spacing

For any number of eligible students queued in one background-fetch cycle, the computed scheduled dispatch times for consecutive fetch jobs are always at least 10 seconds apart.

**Validates: Requirements 16.3**

### Property 41: Attendance percent persists after fetch

For any successfully fetched attendance percentage, storing it via the background fetcher and then reading `student_registry.last_attendance_percent` returns the same value.

**Validates: Requirements 16.4**

### Property 42: Invalid-credential handling is a one-time, terminal state

For any student whose portal login fails with `INCORRECT_PASSWORD`/`INVALID_USERNAME`, the credential is marked invalid, exactly one "please re-link" notification is enqueued (not repeated on subsequent cycles while still invalid), and the student is excluded from the eligible set of every future cycle until the credential status changes back to valid.

**Validates: Requirements 16.5**

### Property 43: Transient failure retry and 24-hour pause

For any sequence of transient login failures for a student, within-cycle retries follow the 60-second delay rule up to 2 additional attempts, and upon the 3rd consecutive cycle-level failure, `next_eligible_at` is set to at least 24 hours in the future, making the student ineligible for that period.

**Validates: Requirements 16.6**

### Property 44: Eligible-and-ordered fetch queue

For any set of students with varying `last_seen_at` and `last_fetch_at` values, the eligible set for a fetch cycle excludes every student whose `last_seen_at` is more than 30 days old, and the eligible students are ordered by `last_fetch_at` ascending (least-recently-fetched first).

**Validates: Requirements 16.7, 16.10**

### Property 45: Webhook payload activates subscription consistently

For any valid PhonePe `payment.success`/`recurring.success` webhook payload, processing it results in a `premium_subscriptions` record whose `roll_number`, `plan`, `phonepe_subscription_id`, and `payment_status` match the payload, and a corresponding `payment_transactions` row is created with matching `transaction_id` and `amount`.

**Validates: Requirements 17.4**

### Property 46: Recurring success extends expiry by one month

For any current `expiry_date` on an active subscription, a successful recurring-charge webhook sets the new `expiry_date` to exactly one month later than the previous `expiry_date` (or one month from now if the subscription had already lapsed).

**Validates: Requirements 17.5**

### Property 47: Recurring failure enters grace period

For any active subscription, a failed recurring-charge webhook sets `status = "grace"` and `grace_ends_at = now + 3 days`.

**Validates: Requirements 17.6**

### Property 48: Cancellation preserves access until expiry, no proration

For any subscription that is cancelled, `is_premium(roll_number)` continues to return true while `now < expiry_date` and false afterward, and `expiry_date` is never modified as a result of cancellation.

**Validates: Requirements 17.7, 17.9**

### Property 49: Payment transaction access control

For any payment transaction record and any requester, access is granted if and only if the requester's roll number matches the record's `roll_number` or the requester is an admin.

**Validates: Requirements 17.8**

### Property 50: Webhook request validation rules

For any webhook request varying signature validity, timestamp age, and payload size, the endpoint accepts the request only if the `X-VERIFY` signature is valid, the timestamp is within 5 minutes of now, and the payload is at most 64KB; any single violated rule causes rejection.

**Validates: Requirements 17.10**

### Property 51: Webhook idempotency prevents double-activation

For any `transaction_id` processed more than once (duplicate webhook delivery), only one `payment_transactions` row exists for that `transaction_id` afterward, and the subscription is not double-extended or double-activated as a result of the duplicate delivery.

**Validates: Requirements 17.10**

### Property 52: Subscription initiation/cancellation is atomic on gateway failure

For any simulated PhonePe API failure during subscription initiation or cancellation, no `premium_subscriptions` or `payment_transactions` row is created or mutated as a result of the failed attempt.

**Validates: Requirements 17.11**

### Property 53: Account deletion removes all associated data

For any roll number with existing rows across `push_subscriptions`, `notification_history`, `notification_preferences`, `attendance_alert_states`, `premium_subscriptions`, and `payment_transactions` (excluding legally-required retained records), deleting the account leaves no rows referencing that roll number in the deletable tables.

**Validates: Requirements 18.5**

### Property 54: Credential decrypt operations are audit-logged

For any sequence of background-fetch credential decrypt operations, the number of audit log entries created equals the number of decrypt calls, each referencing the correct roll number and timestamp.

**Validates: Requirements 18.7**

## Error Handling

| Scenario | Handling |
|---|---|
| Non-premium student calls any push/premium-gated endpoint | `PermissionError` → HTTP 402/403 with `{status:"error", message:"Premium required", upgradeUrl:"/app/premium"}` |
| Registration rate limit exceeded | HTTP 429 with retry-after hint |
| Push delivery gets HTTP 410 from vendor | `subscription_manager.remove_subscription_by_id` called inline in `push_worker`; job still marked done (not a failure — the notification target no longer exists) |
| Push delivery gets HTTP 429/5xx | `notification_queue.mark_failed(can_retry=True)` → existing exponential backoff (30s/120s/480s); after 3 attempts, job marked `failed` and a `delivery_status='failed'` history row is written |
| Malformed push payload (client-side) | Service worker push handler wraps `JSON.parse` in try/catch; on failure shows a generic fallback notification (`"You have a new update — open Attend75"`) instead of throwing/silently dropping |
| Background fetcher: `INCORRECT_PASSWORD` | Credential marked `invalid`; one-time relink notification; student excluded from future cycles (checked at queue-population time) |
| Background fetcher: transient portal error | Retry up to 2x within-cycle with 60s delay; 3 consecutive cycle failures → `next_eligible_at = now + 24h` |
| PhonePe webhook: bad signature / stale timestamp / oversized payload | HTTP 400 immediately, nothing persisted, request logged for monitoring |
| PhonePe webhook: duplicate `transaction_id` | Short-circuit to `{"status":"already_processed"}` (HTTP 200, so PhonePe doesn't retry indefinitely) without re-activating |
| PhonePe API unreachable during initiate/cancel | No DB writes performed; HTTP 502 with a "try again in a few minutes" message |
| Admin broadcast by non-super_admin | HTTP 403 |
| Notice dispatcher called twice for the same notice (e.g., scheduler retry) | Guarded by `notification_sent_at IS NULL` filter — safe to call repeatedly (idempotent) |
| Timetable matching returns zero classes | `has_timetable` set to `False`, absence logged at INFO level, no exception raised |

## Testing Strategy

**Dual approach**: unit/integration tests for infrastructure-facing and scheduling concerns (marked "no"/"integration"/"smoke" in the prework above — e.g., VAPID wiring, cron timing, PhonePe gateway calls, admin fetcher-health endpoint shape), and property-based tests (pytest + **Hypothesis**, the standard Python PBT library) for the 54 properties above, each configured for a minimum of 100 examples.

- **Property tests** live alongside each new service module (e.g., `backend/tests/test_attendance_monitor_properties.py`) and use Hypothesis strategies to generate: percentages/counts (`st.floats`, `st.integers`), titles/bodies (`st.text`), program/category enums (`st.sampled_from`), timestamps (`st.datetimes`), and composite subscription/preference objects (`st.builds`). External calls (PhonePe API, `pywebpush.webpush`, portal login) are mocked so properties test pure logic cheaply.
- **Unit/example tests** cover: VAPID header presence on an actual mocked `webpush()` call, admin broadcast form validation, fetcher-health endpoint response shape, notification-click deep-link navigation (2-3 concrete examples per Req 9.3), and cron/schedule wiring smoke tests (scheduler starts/stops cleanly).
- **Integration tests** (1-3 examples, not iterated) cover: end-to-end scrape → dispatch → history flow using an in-memory/test SQLite DB, and PhonePe webhook flow against a mocked gateway.
- Each Hypothesis test is tagged with a comment referencing its design property, e.g.:
  ```python
  # Feature: push-notifications-premium, Property 12: Attendance bracket dedup state machine
  @given(readings=st.lists(st.floats(min_value=0, max_value=100), min_size=1, max_size=20))
  @settings(max_examples=100)
  def test_attendance_bracket_dedup(readings): ...
  ```
- New dependency: `hypothesis` (dev/test only), `pywebpush` (runtime, Web Push delivery + VAPID header generation).

## File Structure (new/changed files only)

```
backend/
├── routers/
│   ├── push.py                          # NEW
│   ├── premium.py                       # NEW
│   └── admin.py                         # EXTEND (broadcast, fetcher health)
├── services/
│   ├── subscription_manager.py          # NEW
│   ├── payload_builder.py               # NEW
│   ├── preference_filter.py             # NEW
│   ├── push_worker.py                   # NEW
│   ├── notice_dispatcher.py             # NEW
│   ├── attendance_monitor.py            # NEW
│   ├── timetable_reminder_engine.py     # NEW
│   ├── weekly_summary_service.py        # NEW
│   ├── nudge_service.py                 # NEW
│   ├── broadcast_service.py             # NEW
│   ├── background_fetcher.py            # NEW
│   ├── phonepe_service.py               # NEW (last)
│   ├── notification_queue.py            # EXISTING (no changes)
│   └── premium_service.py               # EXISTING (no changes)
├── db/models/
│   ├── background_fetch_state.py        # NEW
│   ├── portal_credential.py             # EXTEND (+status column)
│   └── (7 existing push/premium models) # EXISTING (no changes)
├── alembic/versions/
│   └── XXXX_add_credential_status_and_fetch_state.py   # NEW migration
└── requirements.txt                     # + pywebpush, py_vapid; +hypothesis (dev)

frontend/src/
├── pwa/push/
│   ├── push-handlers.js                 # NEW: push + notificationclick listeners
│   └── subscribe.js                     # NEW: PushManager.subscribe() wrapper
├── services/
│   ├── pushApi.js                       # NEW
│   └── premiumApi.js                    # NEW
├── pages/
│   ├── NotificationSettings.jsx         # NEW
│   ├── NotificationHistory.jsx          # NEW
│   └── Premium.jsx                      # NEW (upsell + subscribe/cancel)
└── vite.config.js                       # EXTEND: switch to injectManifest or
                                          #   add importScripts for push-handlers.js
```

## Key Design Decisions

1. **Database-backed queue over external broker** — consistent with the existing single-VM deployment and `NoticeScheduler` pattern; PostgreSQL's `SKIP LOCKED` gives real concurrency without new infrastructure.
2. **Reuse `premium_service.is_premium` everywhere** — grace-period logic is written once and consumed by the push worker, dispatcher, and gate checks, avoiding drift between "who is premium" definitions.
3. **Payload builder as single choke point for the 4KB cap** — every dispatcher funnels through `payload_builder.build_payload`, so the size constraint (Req 7.2) is enforced in one place rather than duplicated per notification type.
4. **`push_send` is the only job type the worker needs to understand deeply** — attendance/timetable/notice/digest/etc. dispatchers all terminate in a generic `push_send` job; this keeps `push_worker.py` simple and keeps category-specific logic in the dispatcher/engine that produced the job.
5. **`background_fetch_state` as a separate table from `PortalCredential`** — keeps scheduling metrics (retries, pauses) independent of the credential/auth model, which already has its own lifecycle tied to login flows.
6. **PhonePe integration deferred and isolated** — per Requirement 17's explicit note, `phonepe_service.py` is the last component built and touches only `premium_subscriptions`/`payment_transactions`, so it can be developed and tested without blocking push notification delivery work.
7. **No new "current week" snapshot table for weekly summaries** — the previous week's percentage is derived from the last `notification_history` row of category `weekly_summary`, avoiding a new table at the cost of a slightly less direct lookup.
