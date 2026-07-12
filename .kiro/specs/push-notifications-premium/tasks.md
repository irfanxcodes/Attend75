# Implementation Plan: Push Notifications Premium

## Overview

Convert the design into incremental backend + frontend changes. Foundational DB models (`premium_subscription.py`, `push_subscription.py`, `notification_preference.py`, `notification_history.py`, `notification_job.py`, `attendance_alert_state.py`, `payment_transaction.py`) and services (`premium_service.py`, `notification_queue.py`) already exist and are reused as-is. Work proceeds bottom-up: shared utilities → subscription management → delivery engine → dispatchers/engines that produce jobs → admin/background fetcher → frontend → PhonePe (last, per Requirement 17). Each numbered task builds on the previous and ends with the new component wired into `app.py` or an existing router/service, with no orphaned code. Language: Python (backend, matching existing FastAPI/SQLAlchemy codebase) and JavaScript/React (frontend, matching existing Vite PWA codebase).

## Tasks

- [x] 1. Add new dependencies and shared payload/preference utilities
  - Add `pywebpush`, `py-vapid` to `backend/requirements.txt`; add `hypothesis` as a dev/test dependency
  - Create `backend/services/payload_builder.py` implementing `build_payload`, `is_high_priority`, `notice_deep_link`, and `CATEGORY_TTL_SECONDS` mapping
  - Create `backend/services/preference_filter.py` implementing `should_send_notice`, `should_send`, `get_or_create_preferences` (using `NotificationPreference` model defaults)
  - _Requirements: 3.2, 3.4, 3.5, 6.1, 6.2, 6.5, 7.2, 7.4, 10.4, 10.6, 13.2_

  - [ ]* 1.1 Write property test for payload construction and size cap
    - **Property 9: Notification payload construction**
    - **Validates: Requirements 3.2, 7.2, 10.4, 13.2**

  - [ ]* 1.2 Write property test for high-priority classification
    - **Property 11: High-priority classification**
    - **Validates: Requirements 3.4**

  - [ ]* 1.3 Write property test for TTL mapping by priority
    - **Property 20: TTL mapping by priority**
    - **Validates: Requirements 7.4**

  - [ ]* 1.4 Write property test for default preferences on first subscription
    - **Property 18: Default preferences on first subscription**
    - **Validates: Requirements 6.5**

- [x] 2. Implement Subscription Manager and its rate limiter
  - Create `backend/services/subscription_manager.py` with `register_subscription`, `remove_subscription`, `remove_subscription_by_id`, `list_subscriptions`, and an in-memory `RateLimiter` (10/hour sliding window)
  - Reuse `services/crypto_service.py`'s `CredentialCryptoService` pattern to encrypt `endpoint`/`p256dh_key`/`auth_key` before persisting to `push_subscriptions`
  - Implement the 5-device eviction rule (delete oldest `created_at` row when a 6th is registered) and the premium gate check via `premium_service.is_premium`
  - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.7, 1.10, 18.1, 18.4_

  - [ ]* 2.1 Write property test for subscription registration round-trip
    - **Property 1: Subscription registration round-trip**
    - **Validates: Requirements 1.1, 1.10, 18.4**

  - [ ]* 2.2 Write property test for subscription removal exactness
    - **Property 2: Subscription removal is exact**
    - **Validates: Requirements 1.2, 1.3**

  - [ ]* 2.3 Write property test for five-device cap eviction
    - **Property 3: Five-device cap evicts oldest**
    - **Validates: Requirements 1.4**

  - [ ]* 2.4 Write property test for premium gate authorization
    - **Property 4: Premium gate authorizes only active/grace subscriptions**
    - **Validates: Requirements 1.5, 2.1, 2.2, 2.5**

  - [ ]* 2.5 Write property test for registration rate limiting
    - **Property 5: Registration rate limiting**
    - **Validates: Requirements 1.7**

  - [ ]* 2.6 Write property test for renewal resuming delivery without touching endpoints
    - **Property 6: Renewal resumes delivery without touching endpoints**
    - **Validates: Requirements 2.3**

  - [ ]* 2.7 Write property test for subscription status reflecting stored state
    - **Property 7: Subscription status reflects stored state**
    - **Validates: Requirements 2.4**

  - [ ]* 2.8 Write property test for subscription endpoint encryption round-trip
    - **Property 22: Subscription endpoint encryption round-trip**
    - **Validates: Requirements 7.8, 18.1**

- [x] 3. Create `routers/push.py` and wire subscription/preferences/history endpoints
  - Implement `POST /push/subscribe`, `DELETE /push/subscribe`, `GET /push/preferences`, `PUT /push/preferences`, `GET /push/history`, `POST /push/history/{id}/read`, `GET /push/vapid-public-key`
  - Use `session_store` token auth (matching `routers/notices.py` pattern) for all endpoints except the public VAPID key endpoint
  - Add read-marking logic (`mark_read`) to `notification_history` access, and a `list_history`/paginated query (last 50, `created_at DESC`)
  - Register `push_router` in `backend/app.py`
  - _Requirements: 1.1, 1.2, 1.5, 1.6, 1.8, 1.9, 6.3, 6.4, 6.6, 8.2, 8.3, 8.4, 8.6_

  - [ ]* 3.1 Write property test for preferences persistence and immediate application
    - **Property 17: Preferences persist and apply immediately**
    - **Validates: Requirements 6.3, 6.4**

  - [ ]* 3.2 Write property test for history pagination
    - **Property 24: History pagination**
    - **Validates: Requirements 8.2**

  - [ ]* 3.3 Write property test for idempotent read-marking
    - **Property 25: Read-marking is idempotent**
    - **Validates: Requirements 8.4**

  - [ ]* 3.4 Write property test for unread badge count computation
    - **Property 27: Unread badge count**
    - **Validates: Requirements 9.5**

  - [ ]* 3.5 Write unit tests for push router endpoints
    - Cover non-premium rejection, malformed requests, and empty-history response shape
    - _Requirements: 1.5, 1.6, 1.8, 1.9, 8.6_

- [x] 4. Implement retention cleanup jobs
  - Add `cleanup_notification_history(days=90)` and `cleanup_payment_transactions(days=365)` functions (co-located in `services/notification_queue.py` or a new `services/retention_service.py`), scheduled via a `threading.Timer` daily loop started in `app.py`
  - _Requirements: 8.5, 18.2, 18.3_

  - [ ]* 4.1 Write property test for retention window enforcement
    - **Property 26: Retention windows enforce deletion**
    - **Validates: Requirements 8.5, 18.2, 18.3**

- [ ] 5. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 6. Implement the Push Worker delivery engine
  - Create `backend/services/push_worker.py` with a `PushWorker` class (threading-based, default concurrency 10) that claims `push_send` jobs via `notification_queue.claim_pending_jobs`
  - Integrate `pywebpush.webpush` with VAPID keys read from environment (`VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_CONTACT_EMAIL`); document key generation in a short comment/README note
  - Implement per-subscription delivery: success → insert `notification_history` row + `mark_done`; HTTP 410 → `subscription_manager.remove_subscription_by_id`; HTTP 429/5xx → `mark_failed(can_retry=True)`; other errors → `mark_failed(can_retry=False)` + failed history row
  - Start/stop the worker in `backend/app.py`'s startup/shutdown events, alongside the existing `notice_scheduler`
  - _Requirements: 1.3, 7.1, 7.3, 7.6, 7.7_

  - [ ]* 6.1 Write property test for retry backoff schedule
    - **Property 19: Retry backoff schedule**
    - **Validates: Requirements 7.3**

  - [ ]* 6.2 Write unit/integration test for VAPID header presence on a mocked webpush call
    - Cover the smoke-tested Req 7.1 (protocol wiring) with 1-2 examples using a mocked `pywebpush.webpush`
    - _Requirements: 7.1_

- [x] 7. Implement the Notice Dispatcher and hook it into the notice pipeline
  - Create `backend/services/notice_dispatcher.py` with `dispatch_for_new_notices`, `is_timetable_change_title`, and `_subscribed_students_for_program`
  - Call `notice_dispatcher.dispatch_for_new_notices(notice_ids)` from `services/notice_scheduler.py`'s `_execute_scrape` and `trigger_immediate` right after `process_batch` succeeds
  - Implement batch consolidation (>3 notices) and idempotent `notification_sent_at` marking on `Notice`
  - Wire timetable-change detection to invalidate `timetable_service._timetable_cache` and enqueue `has_timetable` re-evaluation jobs
  - _Requirements: 3.1, 3.3, 13.1, 13.3, 13.4_

  - [ ]* 7.1 Write property test for notice dispatch targeting
    - **Property 8: Notice dispatch targets exactly the matching, subscribed, opted-in audience**
    - **Validates: Requirements 3.1, 3.5, 6.1, 6.2, 6.3, 10.6**

  - [ ]* 7.2 Write property test for batch consolidation
    - **Property 10: Batch consolidation picks highest-priority category**
    - **Validates: Requirements 3.3**

  - [ ]* 7.3 Write property test for timetable-change title classification
    - **Property 34: Timetable-change title classification**
    - **Validates: Requirements 13.1**

  - [ ]* 7.4 Write property test for timetable cache invalidation
    - **Property 35: Timetable cache invalidation**
    - **Validates: Requirements 13.3**

- [x] 8. Implement the deadline reminder job
  - Add `run_deadline_evaluation` to `notice_dispatcher.py` (or a sibling `deadline_service.py`), scheduled daily at 7:00 AM IST via a `threading.Timer` loop started in `app.py`
  - Implement day-count-to-reminder-type mapping and `UserNotice.dismissed` / preference exclusion checks
  - _Requirements: 10.1, 10.2, 10.3, 10.5, 10.7_

  - [ ]* 8.1 Write property test for deadline reminder type mapping
    - **Property 28: Deadline reminder type mapping**
    - **Validates: Requirements 10.2, 10.3**

  - [ ]* 8.2 Write property test for dismissed-notice exclusion
    - **Property 29: Dismissed notices are excluded from deadline reminders**
    - **Validates: Requirements 10.5**

- [ ] 9. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 10. Implement the Attendance Monitor
  - Create `backend/services/attendance_monitor.py` with `bracket_for`, `evaluate_attendance`, and `classes_to_recover`
  - Wire `evaluate_attendance` into the existing student-login/attendance-refresh code path (call after attendance data is computed) so live logins trigger evaluation
  - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6_

  - [ ]* 10.1 Write property test for the attendance bracket dedup state machine
    - **Property 12: Attendance bracket dedup state machine**
    - **Validates: Requirements 4.1, 4.2, 4.4, 4.5, 4.6**

  - [ ]* 10.2 Write property test for the classes-needed-to-recover formula
    - **Property 13: Classes-needed-to-recover formula**
    - **Validates: Requirements 4.3**

- [ ] 11. Implement the Timetable Reminder Engine and daily digest
  - Create `backend/services/timetable_reminder_engine.py` with `schedule_reminders_for_today`, `get_todays_classes`, `reevaluate_has_timetable`, and `VALID_LEAD_MINUTES` validation
  - Reuse `timetable_service.get_personalized_timetable` and `_match_student_classes`; add a thin per-day filter
  - Schedule the daily run (early morning) via a `threading.Timer` loop started in `app.py`; jitter digest `scheduled_at` per student to spread across a 15-minute window
  - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 11.1, 11.2, 11.3, 11.4, 11.5, 11.6_

  - [ ]* 11.1 Write property test for reminder scheduling
    - **Property 14: Timetable reminder scheduling**
    - **Validates: Requirements 5.1, 5.2, 5.3**

  - [ ]* 11.2 Write property test for lead time validation
    - **Property 15: Lead time validation**
    - **Validates: Requirements 5.4**

  - [ ]* 11.3 Write property test for has_timetable computation
    - **Property 16: has_timetable reflects match results**
    - **Validates: Requirements 5.5, 11.4, 11.5, 13.4**

  - [ ]* 11.4 Write property test for daily digest content and empty-day suppression
    - **Property 30: Daily digest content and empty-day suppression**
    - **Validates: Requirements 11.2, 11.3**

- [ ] 12. Implement the Weekly Summary Service and Nudge Service
  - Create `backend/services/weekly_summary_service.py` with `compute_weekly_summary` (guest staleness gate, Firebase-linked fresh-data selection, delta/tone/priority computation via `attendance_monitor.classes_to_recover`)
  - Create `backend/services/nudge_service.py` with `should_nudge` and `run_nudge_evaluation`
  - Schedule weekly summary (Monday 9:00 AM IST, 30-min batch spread) and nudge evaluation (daily 10:00 AM IST) via `threading.Timer` loops started in `app.py`
  - _Requirements: 12.1, 12.2, 12.3, 12.4, 12.5, 12.6, 14.1, 14.2, 14.3, 14.4, 14.5_

  - [ ]* 12.1 Write property test for weekly summary computation
    - **Property 31: Weekly summary computation**
    - **Validates: Requirements 12.2**

  - [ ]* 12.2 Write property test for weekly summary tone/priority mapping
    - **Property 32: Weekly summary tone/priority mapping**
    - **Validates: Requirements 12.3, 12.4**

  - [ ]* 12.3 Write property test for guest staleness gate and data-source selection
    - **Property 33: Guest weekly summary staleness gate and data-source selection**
    - **Validates: Requirements 12.5, 12.6**

  - [ ]* 12.4 Write property test for the inactive nudge eligibility state machine
    - **Property 36: Inactive nudge eligibility state machine**
    - **Validates: Requirements 14.1, 14.2, 14.3, 14.4**

- [ ] 13. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 14. Implement Admin Broadcast
  - Create `backend/services/broadcast_service.py` with `send_broadcast` and `get_broadcast_stats`
  - Extend `services/admin_service.py`'s `require_admin_user` (or add a helper) to check for `super_admin` role
  - Add `POST /admin/broadcast` and `GET /admin/broadcast/{batch}/stats` endpoints to `backend/routers/admin.py`
  - _Requirements: 15.1, 15.2, 15.3, 15.4, 15.5_

  - [ ]* 14.1 Write property test for broadcast targeting
    - **Property 37: Broadcast targeting matches audience selector**
    - **Validates: Requirements 15.2**

  - [ ]* 14.2 Write property test for broadcast delivery statistics
    - **Property 38: Broadcast delivery statistics**
    - **Validates: Requirements 15.4**

  - [ ]* 14.3 Write property test for broadcast authorization
    - **Property 39: Broadcast authorization**
    - **Validates: Requirements 15.5**

  - [ ]* 14.4 Write property test for history logging completeness (individual + broadcast)
    - **Property 23: History logging is complete and consistent**
    - **Validates: Requirements 8.1, 8.3, 15.3**

  - [ ]* 14.5 Write unit test for the broadcast admin form submit endpoint
    - Cover required-field validation and non-super_admin rejection with 2-3 concrete examples
    - _Requirements: 15.1_

- [ ] 15. Implement the Background Fetcher
  - Create migration adding `status` column to `portal_credentials` (default `valid`) and a new `background_fetch_state` table (roll_number PK, `last_fetch_at`, `last_fetch_status`, `consecutive_failures`, `next_eligible_at`)
  - Create `backend/db/models/background_fetch_state.py` matching the migration
  - Create `backend/services/background_fetcher.py` with `BackgroundFetcher` (6-hour scheduler) and `process_fetch_job` implementing eligibility filtering, round-robin ordering, 10s spacing, credential-invalid handling, transient-retry/24h-pause logic, and a credential-decrypt audit log call
  - Wire `process_fetch_job` to call `attendance_monitor.evaluate_attendance` after a successful fetch, and to update `student_registry.last_attendance_percent`
  - Add `GET /admin/fetcher/health` to `backend/routers/admin.py` reporting queue depth, students processed, failures, and average duration
  - Start/stop `BackgroundFetcher` in `backend/app.py`
  - _Requirements: 16.1, 16.2, 16.3, 16.4, 16.5, 16.6, 16.7, 16.8, 16.9, 16.10, 18.6, 18.7_

  - [ ]* 15.1 Write property test for background fetcher login spacing
    - **Property 40: Background fetcher login spacing**
    - **Validates: Requirements 16.3**

  - [ ]* 15.2 Write property test for attendance percent persistence
    - **Property 41: Attendance percent persists after fetch**
    - **Validates: Requirements 16.4**

  - [ ]* 15.3 Write property test for invalid-credential handling
    - **Property 42: Invalid-credential handling is a one-time, terminal state**
    - **Validates: Requirements 16.5**

  - [ ]* 15.4 Write property test for transient failure retry and 24-hour pause
    - **Property 43: Transient failure retry and 24-hour pause**
    - **Validates: Requirements 16.6**

  - [ ]* 15.5 Write property test for eligible-and-ordered fetch queue
    - **Property 44: Eligible-and-ordered fetch queue**
    - **Validates: Requirements 16.7, 16.10**

  - [ ]* 15.6 Write property test for credential decrypt audit logging
    - **Property 54: Credential decrypt operations are audit-logged**
    - **Validates: Requirements 18.7**

  - [ ]* 15.7 Write unit/integration test for the fetcher health admin endpoint
    - Cover the response shape with 2-3 concrete examples
    - _Requirements: 16.9_

- [ ] 16. Implement account-deletion cascade for notification data
  - Extend the account-deletion code path (or add one in `services/subscription_manager.py`/a new `services/account_deletion_service.py`) to remove `push_subscriptions`, `notification_history`, `notification_preferences`, `attendance_alert_states`, `premium_subscriptions`, and `payment_transactions` (respecting the 365-day legal retention) for a given roll number
  - Wire this into the existing `DELETE /admin/users/{user_id}` flow in `backend/routers/admin.py` (and/or a student-facing self-service endpoint if one exists) so deletion is complete rather than partial
  - _Requirements: 18.5_

  - [ ]* 16.1 Write property test for account deletion cascade completeness
    - **Property 53: Account deletion removes all associated data**
    - **Validates: Requirements 18.5**

- [ ] 17. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 18. Implement frontend push subscription flow and service worker integration
  - Switch `frontend/vite.config.js`'s VitePWA plugin to `injectManifest` strategy (or add `importScripts`) so a custom `push` and `notificationclick` listener can run inside the generated service worker
  - Create `frontend/src/pwa/push/push-handlers.js` with the `push` event listener (parse JSON payload, build `Notification` options per category with icon/badge/actions, fallback to a generic notification on parse failure) and `notificationclick` listener (open the app at the payload's deep-link)
  - Create `frontend/src/pwa/push/subscribe.js` wrapping `PushManager.subscribe()` using the VAPID public key from `GET /push/vapid-public-key`
  - Create `frontend/src/services/pushApi.js` with `subscribe`, `unsubscribe`, `getPreferences`, `updatePreferences`, `getHistory`, `markHistoryRead`
  - _Requirements: 1.6, 1.8, 1.9, 7.5, 9.1, 9.2, 9.3, 9.4, 9.5_

  - [ ]* 18.1 Write property test for notification rendering (payload → display options)
    - **Property 21: Notification rendering maps payload to display options**
    - **Validates: Requirements 7.5, 9.2, 9.4**

  - [ ]* 18.2 Write unit tests for notification-click deep-link navigation
    - Cover with-deep-link and without-deep-link cases with 2-3 concrete examples
    - _Requirements: 9.3_

- [ ] 19. Implement frontend Notification Settings, History, and Premium pages
  - Create `frontend/src/pages/NotificationSettings.jsx` (category toggles, notice sub-category filters, lead-time selector, digest time selector, loading indicator) using `pushApi.js`
  - Create `frontend/src/pages/NotificationHistory.jsx` (last-50 list, empty state, mark-read-on-click) using `pushApi.js`
  - Create `frontend/src/pages/Premium.jsx` (paywall/upsell copy, subscribe button, grace-period banner with remaining days, cancel flow with explicit confirmation) using a new `frontend/src/services/premiumApi.js`
  - Add routes for these pages and a settings-page permission-denied prompt for non-premium users trying to enable notifications (instructing manual browser settings when permission was previously denied)
  - _Requirements: 1.5, 1.6, 1.8, 1.9, 2.4, 2.5, 6.1, 6.2, 6.4, 6.6, 8.2, 8.6_

- [ ] 20. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 21. Implement PhonePe subscription and webhook handling
  - Create `backend/services/phonepe_service.py` with `initiate_subscription`, `handle_webhook`, `cancel_subscription`
  - Implement webhook validation: `X-VERIFY` signature check, 5-minute timestamp window, 64KB payload cap, and idempotency by `transaction_id`
  - Wire `payment.success`/`recurring.success` to `premium_service.activate_premium` and `recurring.failed` to `premium_service.enter_grace_period` (both already implemented)
  - _Requirements: 17.1, 17.2, 17.3, 17.4, 17.5, 17.6, 17.10, 17.11, 17.12_

  - [ ]* 21.1 Write property test for webhook payload activation consistency
    - **Property 45: Webhook payload activates subscription consistently**
    - **Validates: Requirements 17.4**

  - [ ]* 21.2 Write property test for recurring success expiry extension
    - **Property 46: Recurring success extends expiry by one month**
    - **Validates: Requirements 17.5**

  - [ ]* 21.3 Write property test for recurring failure grace period entry
    - **Property 47: Recurring failure enters grace period**
    - **Validates: Requirements 17.6**

  - [ ]* 21.4 Write property test for webhook request validation rules
    - **Property 50: Webhook request validation rules**
    - **Validates: Requirements 17.10**

  - [ ]* 21.5 Write property test for webhook idempotency
    - **Property 51: Webhook idempotency prevents double-activation**
    - **Validates: Requirements 17.10**

  - [ ]* 21.6 Write property test for atomic failure handling on gateway errors
    - **Property 52: Subscription initiation/cancellation is atomic on gateway failure**
    - **Validates: Requirements 17.11**

  - [ ]* 21.7 Write unit/integration test for the subscribe-initiation redirect flow
    - Cover the "processing" state redirect using a mocked PhonePe client, 1-2 examples
    - _Requirements: 17.3_

- [ ] 22. Implement subscription cancellation and payment history endpoints
  - Add `POST /premium/subscribe`, `POST /premium/cancel`, `POST /premium/webhook`, `GET /premium/transactions` to `backend/routers/premium.py` (also add `GET /premium/status` using the existing `premium_service.get_subscription_status`)
  - Enforce owner-or-admin access control on `GET /premium/transactions`
  - Register `premium_router` in `backend/app.py`
  - _Requirements: 2.4, 17.7, 17.8, 17.9_

  - [ ]* 22.1 Write property test for cancellation access preservation and no proration
    - **Property 48: Cancellation preserves access until expiry, no proration**
    - **Validates: Requirements 17.7, 17.9**

  - [ ]* 22.2 Write property test for payment transaction access control
    - **Property 49: Payment transaction access control**
    - **Validates: Requirements 17.8**

- [ ] 23. Final checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional (tests) and can be skipped for a faster MVP, but are recommended given the correctness-critical nature of billing/dedup logic.
- All property tests use Hypothesis with a minimum of 100 examples per property, tagged with a comment referencing the design document's property number.
- Requirement 17 (PhonePe) is deliberately last, per the requirements document's explicit note that it should follow Requirements 1–16.
- Scheduling/cron wiring (notice dispatch cadence, deadline job, digest job, weekly summary job, nudge job, background fetcher cadence, VAPID protocol wiring, throughput/load targets) is validated via smoke/integration tests rather than property tests, per the design document's Testing Strategy.

## Task Dependency Graph

```
1. Shared payload/preference utilities
   └─▶ 2. Subscription Manager
         └─▶ 3. push router (subscribe/preferences/history)
               └─▶ 4. Retention cleanup jobs
                     └─▶ 5. Checkpoint
                           └─▶ 6. Push Worker (delivery engine)
                                 └─▶ 7. Notice Dispatcher
                                       └─▶ 8. Deadline reminder job
                                             └─▶ 9. Checkpoint
                                                   └─▶ 10. Attendance Monitor
                                                         └─▶ 11. Timetable Reminder Engine + digest
                                                               └─▶ 12. Weekly Summary + Nudge Service
                                                                     └─▶ 13. Checkpoint
                                                                           └─▶ 14. Admin Broadcast
                                                                                 └─▶ 15. Background Fetcher
                                                                                       └─▶ 16. Account deletion cascade
                                                                                             └─▶ 17. Checkpoint
                                                                                                   └─▶ 18. Frontend push/service worker integration
                                                                                                         └─▶ 19. Frontend Settings/History/Premium pages
                                                                                                               └─▶ 20. Checkpoint
                                                                                                                     └─▶ 21. PhonePe subscription/webhook
                                                                                                                           └─▶ 22. Cancellation + payment history endpoints
                                                                                                                                 └─▶ 23. Final checkpoint
```

Each task depends only on the components built in prior tasks (shared utilities → delivery engine → event dispatchers/engines → admin/background fetcher → frontend → PhonePe), matching the layering in the design document's Architecture section.

```json
{
  "waves": [
    { "wave": 1, "tasks": [1] },
    { "wave": 2, "tasks": [2] },
    { "wave": 3, "tasks": [3] },
    { "wave": 4, "tasks": [4] },
    { "wave": 5, "tasks": [5] },
    { "wave": 6, "tasks": [6] },
    { "wave": 7, "tasks": [7] },
    { "wave": 8, "tasks": [8] },
    { "wave": 9, "tasks": [9] },
    { "wave": 10, "tasks": [10] },
    { "wave": 11, "tasks": [11] },
    { "wave": 12, "tasks": [12] },
    { "wave": 13, "tasks": [13] },
    { "wave": 14, "tasks": [14] },
    { "wave": 15, "tasks": [15] },
    { "wave": 16, "tasks": [16] },
    { "wave": 17, "tasks": [17] },
    { "wave": 18, "tasks": [18] },
    { "wave": 19, "tasks": [19] },
    { "wave": 20, "tasks": [20] },
    { "wave": 21, "tasks": [21] },
    { "wave": 22, "tasks": [22] },
    { "wave": 23, "tasks": [23] }
  ]
}
```
