# Requirements Document

## Introduction

Push Notifications Premium is a paid feature for Attend75 that delivers real-time push notifications to students' devices using the Web Push API. The feature leverages existing data streams — college notices, attendance percentages, and personalized timetables — to proactively inform students about important events, attendance risks, and upcoming classes. Access is gated behind a premium subscription (₹19/month via PhonePe UPI autopay) to monetize the app while keeping the core attendance-tracking experience free.

All scheduled operations use IST (UTC+5:30) as the reference timezone.

## Glossary

- **Push_Service**: The backend component responsible for composing, scheduling, and dispatching Web Push notifications to subscribed devices via a message queue
- **Subscription_Manager**: The backend component that stores and manages Web Push subscription endpoints (max 5 per student) and their association with student accounts
- **Premium_Gate**: The authorization layer that verifies a student holds an active premium subscription before enabling push notification features
- **Notification_Preferences**: The user-configurable settings that control which notification categories a student receives, persisted server-side
- **Web_Push_Client**: The frontend service worker component that receives and displays push notifications on the student's device
- **Attendance_Monitor**: The backend component that evaluates attendance data and triggers alerts when thresholds are crossed, using state-based deduplication
- **Timetable_Reminder_Engine**: The backend component that generates class reminders based on the student's personalized timetable
- **Notice_Dispatcher**: The backend component that triggers notifications when new college notices are scraped and categorized
- **Premium_Subscription**: A paid plan (₹19/month) associated with a student account that unlocks push notification features
- **Notification_Payload**: The structured data sent via Web Push containing title, body, category, action URL, and metadata (max 4KB)
- **Notification_Queue**: A persistent job queue that decouples notification generation from delivery, ensuring reliability and backpressure handling
- **Background_Fetcher**: The background job that logs into the portal on behalf of Firebase-linked premium students to fetch fresh attendance data without requiring them to open the app

## Requirements

### Requirement 1: Web Push Subscription Management

**User Story:** As a premium student, I want my device to be registered for push notifications, so that I can receive timely alerts without keeping the app open.

#### Acceptance Criteria

1. WHEN a premium student grants notification permission in the browser, THE Subscription_Manager SHALL store the Web Push subscription endpoint, keys, and associated roll number in the database
2. WHEN a premium student revokes notification permission or unsubscribes from the settings page, THE Subscription_Manager SHALL remove the subscription endpoint from the database within 5 seconds
3. WHEN a push delivery fails with an HTTP 410 (Gone) response from the push service, THE Subscription_Manager SHALL automatically remove the expired subscription endpoint
4. THE Subscription_Manager SHALL support up to 5 subscription endpoints per student (multi-device). Attempts to register a 6th device SHALL remove the oldest endpoint
5. IF a subscription registration request is received from a non-premium student, THEN THE Premium_Gate SHALL reject the request and return a response indicating premium is required with a link to the subscription page
6. THE system SHALL only allow subscription creation when the service worker is registered and active
7. THE system SHALL rate-limit subscription creation to 10 requests per hour per student
8. IF the browser previously denied notification permission, THE system SHALL display instructions to manually enable notifications in browser settings
9. THE system SHALL display a success confirmation when a subscription is registered
10. THE system SHALL record the notification consent timestamp and method (browser prompt) for compliance

### Requirement 2: Premium Subscription Gating

**User Story:** As a product owner, I want push notifications gated behind a premium plan, so that the feature generates revenue while the core app remains free.

#### Acceptance Criteria

1. THE Premium_Gate SHALL verify the student's active premium subscription status before allowing any push notification subscription or preference change
2. WHEN a student's premium subscription expires AND the 3-day grace period has ended, THE Premium_Gate SHALL stop dispatching new notifications to that student's endpoints within 1 hour
3. WHEN a previously expired subscription is renewed, THE Push_Service SHALL resume notification delivery using existing subscription endpoints without requiring re-registration; the first notification after renewal SHALL be delivered within the next scheduled cycle
4. THE Premium_Gate SHALL expose a subscription status endpoint that the frontend can query to determine whether to show push notification UI controls
5. WHILE a student's subscription is in a grace period (up to 3 days past expiration), THE Push_Service SHALL continue delivering notifications AND the frontend SHALL display a banner indicating remaining grace days and a renewal action button
6. Background attendance monitoring (Requirement 17) requires Firebase linking — this limitation SHALL be clearly stated on the premium feature page

### Requirement 3: Notice Notifications

**User Story:** As a premium student, I want to receive push notifications when new college notices are posted, so that I never miss important announcements.

#### Acceptance Criteria

1. WHEN a new notice is scraped and categorized with processing_status "done", THE Notice_Dispatcher SHALL enqueue a push notification to all subscribed premium students whose program matches the notice source_program. IF a student's program is NULL, notices SHALL be sent for all programs
2. THE Notification_Payload SHALL include the notice title, category, summary (first 100 characters), and a deep-link URL to the notice detail page (`/app/notices?open={noticeId}`)
3. WHEN multiple notices are scraped in a single batch (more than 3 notices within 5 minutes), THE Notice_Dispatcher SHALL consolidate them into a single summary notification listing the count and highest-priority category. Priority order: Exam > Fee > Academic > Internship > Event > Guest Lecture > General
4. WHEN a notice has category "Exam" or priority greater than 60, THE Notice_Dispatcher SHALL mark the notification as high-priority requiring user interaction to dismiss
5. IF the student has disabled the notice category in Notification_Preferences, THEN THE Notice_Dispatcher SHALL skip sending the notification for that category

### Requirement 4: Attendance Alert Notifications

**User Story:** As a premium student, I want to receive alerts when my attendance drops near the 75% threshold, so that I can take corrective action before facing consequences.

#### Acceptance Criteria

1. WHEN a student's overall attendance percentage drops below 80%, THE Attendance_Monitor SHALL enqueue a warning notification indicating current percentage and projected impact of missing one more class
2. WHEN a student's overall attendance percentage drops below 75%, THE Attendance_Monitor SHALL enqueue a critical high-priority notification indicating the student has fallen below the mandatory threshold
3. WHEN a specific subject's attendance drops below 75%, THE Attendance_Monitor SHALL enqueue a subject-specific alert including: subject abbreviation, current percentage, and how many consecutive classes the student must attend to recover above 75%
4. WHEN a subject attendance crosses back above 75% after a previous alert, THE Attendance_Monitor SHALL send a positive "recovered" notification for that subject
5. THE Attendance_Monitor SHALL use state-based deduplication: store the last-alerted state (percentage bracket) per student per subject. A new alert is only sent when the state changes (e.g., 80%→75% triggers, but 76%→74% does not re-trigger if already alerted for <75%)
6. WHEN attendance data is refreshed (on student login or background fetch), THE Attendance_Monitor SHALL evaluate the latest percentages against stored last-alerted states

### Requirement 5: Timetable Reminders

**User Story:** As a premium student, I want to receive reminders before my classes start, so that I can prepare and arrive on time.

#### Acceptance Criteria

1. WHERE the timetable reminder feature is enabled in Notification_Preferences AND the student has `has_timetable` set to true, THE Timetable_Reminder_Engine SHALL enqueue a reminder notification at the configured lead time before each scheduled class
2. THE Notification_Payload for timetable reminders SHALL include the subject name, section, room number (if available), faculty name (if available), and time until class starts
3. WHEN a student has no classes scheduled for the day, THE Timetable_Reminder_Engine SHALL not send any reminder notifications for that day
4. THE Timetable_Reminder_Engine SHALL allow students to configure reminder lead time with options of 10, 15, 30, or 60 minutes before class (default: 15 minutes)
5. IF the timetable data is unavailable or matching returns zero results for the student, THEN THE system SHALL set `has_timetable` to false and not attempt to send reminders. The absence SHALL be logged
6. THE Timetable_Reminder_Engine SHALL use the stored timetable text from the database (not a live portal request) to determine class schedule

### Requirement 6: Notification Preferences

**User Story:** As a premium student, I want to control which types of notifications I receive, so that I only get alerts relevant to me.

#### Acceptance Criteria

1. THE Notification_Preferences SHALL allow students to independently enable or disable each notification category: Notice Alerts, Attendance Alerts, Timetable Reminders, Daily Digest, Weekly Summary
2. THE Notification_Preferences SHALL allow students to filter notice notifications by category (Exam, Fee, Academic, Internship, Event, Guest Lecture, General)
3. WHEN a student updates notification preferences, THE Push_Service SHALL apply the changes to all subsequent notifications without requiring device re-registration
4. THE Notification_Preferences SHALL persist server-side associated with the student's roll number so preferences are consistent across devices
5. WHEN a new premium student subscribes for the first time, THE Notification_Preferences SHALL default to all categories enabled with timetable reminder lead time set to 15 minutes and daily digest time set to 8:00 AM IST
6. WHILE preferences are loading, THE system SHALL display a loading indicator

### Requirement 7: Notification Delivery and Reliability

**User Story:** As a premium student, I want notifications to be delivered reliably, so that I can trust the system to alert me about important events.

#### Acceptance Criteria

1. THE Push_Service SHALL use the Web Push protocol (RFC 8030) with VAPID authentication for sending notifications
2. THE Push_Service SHALL encrypt notification payloads using the subscription's public key as required by the Web Push standard. Payload size SHALL not exceed 4KB
3. IF a notification delivery attempt fails with a transient error (HTTP 429 or 5xx), THEN THE Push_Service SHALL retry up to 3 times with exponential backoff (30s, 120s, 480s delays)
4. THE Push_Service SHALL set a TTL (Time-To-Live) of 24 hours for standard notifications and 48 hours for high-priority notifications (Exam, critical attendance)
5. THE Web_Push_Client SHALL display received notifications using the Notification API with appropriate icons, badges, and action buttons configured per notification category
6. THE Push_Service SHALL use a persistent Notification_Queue to decouple notification generation from delivery. All notification triggers SHALL enqueue jobs rather than sending synchronously
7. THE Notification_Queue SHALL support parallel dispatch with up to 10 concurrent workers for delivery throughput of at least 5,000 endpoints within 5 minutes
8. THE Push_Service SHALL store subscription endpoints encrypted at rest in the database

### Requirement 8: Notification History

**User Story:** As a premium student, I want to see a history of notifications I've received, so that I can review alerts I may have missed.

#### Acceptance Criteria

1. THE Push_Service SHALL log each dispatched notification with timestamp, category, title, delivery status, and target roll number. Notification history table SHALL be indexed by (roll_number, created_at DESC)
2. WHEN a premium student requests notification history, THE Push_Service SHALL return the last 50 notifications in reverse chronological order
3. THE Notification_Payload logged in history SHALL include the deep-link URL so students can navigate to the relevant content from the history view
4. WHEN a notification has been clicked/opened by the student, THE Web_Push_Client SHALL report the interaction back to the backend to mark it as read in history
5. Notification history records SHALL be automatically deleted after 90 days to limit storage growth
6. WHEN notification history is empty, THE system SHALL display an empty state message explaining that notifications will appear here as they arrive

### Requirement 9: Service Worker Push Handler

**User Story:** As a premium student, I want notifications to appear even when I don't have the app open, so that I receive alerts in real time.

#### Acceptance Criteria

1. THE Web_Push_Client SHALL register a push event listener in the service worker that activates when a push message is received from the browser's push service
2. WHEN a push event is received, THE Web_Push_Client SHALL parse the encrypted payload and display a notification using the Notification API with the title, body, icon, and actions from the payload
3. WHEN a student clicks on a displayed notification, THE Web_Push_Client SHALL open the app at the deep-link URL specified in the notification payload
4. IF the notification payload cannot be decrypted or parsed, THEN THE Web_Push_Client SHALL display a generic fallback notification prompting the student to open the app
5. THE Web_Push_Client SHALL include a notification badge count reflecting unread notification count

### Requirement 10: Deadline Reminder Notifications

**User Story:** As a premium student, I want to receive reminders when notice deadlines are approaching, so that I don't miss important submissions or fee due dates.

#### Acceptance Criteria

1. THE Push_Service SHALL run a deadline evaluation job daily at 7:00 AM IST that checks all notices with non-null `deadline` fields
2. WHEN a notice deadline is 3 days away, THE Push_Service SHALL enqueue a "deadline approaching" notification to subscribed students whose program matches the notice
3. WHEN a notice deadline is 1 day away (tomorrow), THE Push_Service SHALL enqueue a final reminder notification marked as high-priority
4. THE Notification_Payload for deadline reminders SHALL include the notice title, category, deadline date, and a deep-link to the notice detail
5. THE Push_Service SHALL NOT send deadline reminders for notices the student has dismissed in UserNotice
6. IF the student has disabled the notice category (e.g., "Fee") in Notification_Preferences, THEN deadline reminders for that category SHALL be skipped
7. Deadline reminders are separate from the initial "new notice" notification (Req 3). A student may receive both: one when the notice is first scraped, and subsequent deadline reminders as the date approaches

### Requirement 11: Daily Schedule Digest Notification

**User Story:** As a premium student, I want a morning summary of my classes for the day, so that I can plan my day without opening the app.

#### Acceptance Criteria

1. THE Timetable_Reminder_Engine SHALL send a daily schedule digest notification at the student's configured time (default 8:00 AM IST, configurable in 30-minute increments between 6:00 AM and 10:00 AM IST)
2. THE Notification_Payload for the daily digest SHALL include the number of classes, first class time, and subjects scheduled for the day
3. IF the student has no classes on that day (weekend or free day), THE Timetable_Reminder_Engine SHALL NOT send the digest notification
4. THE Timetable_Reminder_Engine SHALL only send the daily digest to students who have `has_timetable` flag set to true on their subscription record
5. WHEN a student's timetable matching returns zero results, THE system SHALL set `has_timetable` to false and disable timetable-related notifications for that student
6. Daily digests SHALL be dispatched in batches over a 15-minute window to avoid thundering-herd load spikes

### Requirement 12: Weekly Attendance Summary Notification

**User Story:** As a premium student, I want a weekly summary of my attendance trends, so that I can track my progress over time.

#### Acceptance Criteria

1. THE Push_Service SHALL send a weekly attendance summary notification every Monday at 9:00 AM IST to premium students, dispatched in batches over a 30-minute window
2. THE summary SHALL include overall attendance percentage, change from previous week (up/down arrow + delta), and the subject with lowest attendance
3. IF overall attendance is above 85%, THE notification SHALL include a positive prefix ("Great week!") and be marked standard priority
4. IF overall attendance is below 75%, THE notification SHALL be marked high-priority and include the number of consecutive classes needed across all subjects to recover above 75%
5. FOR guest users (no stored credentials), THE weekly summary SHALL use `last_attendance_percent` from the student_registry. The summary SHALL only be sent if last_attendance_percent was updated within the past 7 days
6. FOR Firebase-linked users, THE summary SHALL use fresh data from the most recent background fetch

### Requirement 13: Timetable Change Notification

**User Story:** As a premium student, I want to be notified when a new timetable is posted, so that I can check for schedule changes.

#### Acceptance Criteria

1. WHEN a new notice containing "TIMETABLE" or "TIME TABLE" in the title (excluding SPECIAL, SUMMER, REMEDIAL, EXAM) is scraped and processed, THE Notice_Dispatcher SHALL enqueue a timetable-change notification to all subscribed students in the matching program
2. THE Notification_Payload SHALL include the notice title and a deep-link to the Notices page
3. THE system SHALL invalidate the in-memory timetable cache when a new timetable notice is detected so subsequent requests parse the new data
4. THE system SHALL re-evaluate `has_timetable` for all subscribed students in the matching program after a new timetable notice is processed

### Requirement 14: Inactive Nudge Notification

**User Story:** As a product owner, I want to re-engage inactive students, so that they continue using the app and maintain their premium subscription.

#### Acceptance Criteria

1. WHEN a premium student has not logged in for 3 or more days (based on `last_seen_at` in student_registry), THE Push_Service SHALL enqueue an engagement nudge notification
2. THE nudge SHALL reference the student's days since last login and include a specific call-to-action (e.g., "Tap to check your latest attendance")
3. THE Push_Service SHALL send at most one nudge notification per 7-day period per student to prevent annoyance
4. IF the student has been inactive for more than 14 days, THE Push_Service SHALL stop sending nudges (likely churned or semester ended)
5. THE inactive nudge evaluation SHALL run daily at 10:00 AM IST

### Requirement 15: Admin Broadcast Notification

**User Story:** As an admin, I want to send push notifications to all premium students or a specific program group, so that I can communicate important announcements directly.

#### Acceptance Criteria

1. THE Admin Panel SHALL provide a broadcast notification form with fields: title (required), body (required), target audience (all / specific program), priority level (standard / high), and optional deep-link URL
2. WHEN an admin submits a broadcast, THE Push_Service SHALL queue and deliver the notification to all matching premium subscriptions within 5 minutes
3. THE broadcast SHALL be logged in notification history for all recipients
4. THE Admin Panel SHALL show delivery statistics: sent count (updated within 5 minutes), opened count (updated within 1 hour of interactions)
5. Only users with super-admin role SHALL be authorized to send broadcast notifications

### Requirement 16: Background Attendance Fetch for Firebase Users

**User Story:** As a Firebase-linked premium student, I want the system to check my attendance in the background, so that I receive timely alerts without needing to open the app.

#### Acceptance Criteria

1. THE Background_Fetcher SHALL run on a recurring schedule (every 6 hours: 6:00 AM, 12:00 PM, 6:00 PM, 12:00 AM IST) and process all eligible Firebase-linked premium students
2. THE Background_Fetcher SHALL use a queue-based architecture:
   a. A scheduler job enqueues fetch tasks for all eligible students into the Notification_Queue
   b. Workers consume tasks from the queue with configurable concurrency (default: 3 concurrent portal logins)
   c. Each task: decrypt credentials → login to portal → fetch attendance → compare → trigger alerts → logout
3. THE Background_Fetcher SHALL enforce a minimum 10-second delay between consecutive portal login attempts to avoid overwhelming the college portal
4. THE Background_Fetcher SHALL update `last_attendance_percent` in the student_registry after each successful fetch
5. IF a portal login fails with INCORRECT_PASSWORD for a stored credential, THE system SHALL:
   a. Mark that credential as `invalid` in the database
   b. Send a one-time "please re-link your account" notification
   c. Display a warning badge in the app when the student next opens it
   d. Skip this student in future background fetch cycles until credentials are updated
6. IF a portal login fails with a transient error (timeout, network error, portal down), THE system SHALL:
   a. Retry the task up to 2 times with 60-second delays
   b. After 3 consecutive cycle failures for the same student, pause that student for 24 hours
   c. Log the failure for admin monitoring
7. THE Background_Fetcher SHALL support graceful scaling: if eligible students exceed what can be processed in one cycle (given the 10-second delay), remaining students SHALL be prioritized in the next cycle using a round-robin approach (students not fetched recently go first)
8. THE Background_Fetcher SHALL track per-student metrics: last_fetch_at, last_fetch_status, consecutive_failures, next_eligible_at
9. THE system SHALL expose an admin endpoint showing Background_Fetcher health: queue depth, students processed this cycle, failures, average fetch duration
10. THE Background_Fetcher SHALL NOT process students whose `last_seen_at` is more than 30 days ago (likely inactive/graduated — skip to save portal resources)

### Requirement 17: Premium Subscription via PhonePe Payment Gateway

**User Story:** As a student, I want to pay ₹19/month via UPI to unlock premium push notifications, so that I can access real-time alerts affordably.

#### Acceptance Criteria

1. THE system SHALL integrate PhonePe Payment Gateway (PG) for accepting payments via UPI autopay (recurring subscription)
2. THE subscription plan SHALL be ₹19/month with automatic monthly renewal via UPI autopay mandate
3. WHEN a student initiates subscription, THE system SHALL create a PhonePe subscription with a UPI autopay mandate and redirect the student to the PhonePe payment flow. The UI SHALL show a "processing" state while awaiting confirmation
4. WHEN PhonePe sends a payment.success webhook callback, THE system SHALL activate the student's premium subscription and store the subscription record (roll_number, plan, start_date, expiry_date, phonepe_subscription_id, payment_status)
5. WHEN a recurring payment is successfully charged by PhonePe, THE system SHALL extend the subscription expiry_date by 1 month
6. WHEN a recurring payment fails (insufficient balance, mandate revoked), THE system SHALL mark the subscription as "payment_failed" and enter a 3-day grace period before deactivating premium features
7. THE system SHALL expose an API endpoint for students to cancel their subscription, which revokes the UPI autopay mandate via PhonePe API. The cancellation flow SHALL require explicit confirmation showing what will be lost and when access ends
8. THE system SHALL store all payment transaction records (transaction_id, amount, status, timestamp, phonepe_reference) for audit and dispute resolution. Payment records SHALL only be accessible by the owning student and admin users
9. WHEN a student cancels their subscription, THE system SHALL allow access until the current billing period ends (no prorated refunds)
10. THE PhonePe webhook endpoint SHALL:
    a. Validate the X-VERIFY signature header to prevent fraudulent callbacks
    b. Reject callbacks with timestamps older than 5 minutes (replay protection)
    c. Be idempotent — processing the same transaction_id multiple times SHALL NOT create duplicate records or double-activate subscriptions
    d. Be rate-limited and reject payloads larger than 64KB
11. IF PhonePe API is unavailable during subscription initiation or cancellation, THE system SHALL display a clear error message and suggest retrying in a few minutes. No partial state SHALL be persisted
12. THE system SHALL expose a webhook endpoint over HTTPS only

**Note:** This requirement will be implemented after push notification features (Requirements 1–16) are complete.

### Requirement 18: Data Privacy and Retention

**User Story:** As a student, I want my notification data handled responsibly, so that my privacy is protected.

#### Acceptance Criteria

1. Push subscription endpoints SHALL be stored encrypted at rest in the database (they are bearer-capability URLs)
2. Notification history records SHALL be automatically deleted after 90 days
3. Payment transaction records SHALL be retained for 365 days for dispute resolution, then archived or deleted
4. THE system SHALL record notification consent: timestamp, method (browser prompt), and device info at the time of subscription registration
5. WHEN a student deletes their account, ALL associated data SHALL be deleted: push subscriptions, notification history, preferences, payment records (except legally required retention)
6. Portal credentials used by Background_Fetcher (Req 16) SHALL remain encrypted with the existing Fernet key and SHALL only be decrypted in-memory for the duration of a single fetch operation
7. THE system SHALL log all credential access (decrypt operations) for security audit
