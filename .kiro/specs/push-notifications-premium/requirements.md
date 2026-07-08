# Requirements Document

## Introduction

Push Notifications Premium is a paid feature for Attend75 that delivers real-time push notifications to students' devices using the Web Push API. The feature leverages existing data streams — college notices, attendance percentages, and personalized timetables — to proactively inform students about important events, attendance risks, and upcoming classes. Access is gated behind a premium subscription to monetize the app while keeping the core attendance-tracking experience free.

## Glossary

- **Push_Service**: The backend component responsible for composing, scheduling, and dispatching Web Push notifications to subscribed devices
- **Subscription_Manager**: The backend component that stores and manages Web Push subscription endpoints and their association with student accounts
- **Premium_Gate**: The authorization layer that verifies a student holds an active premium subscription before enabling push notification features
- **Notification_Preferences**: The user-configurable settings that control which notification categories a student receives
- **Web_Push_Client**: The frontend service worker component that receives and displays push notifications on the student's device
- **Attendance_Monitor**: The backend component that evaluates attendance data and triggers alerts when thresholds are crossed
- **Timetable_Reminder_Engine**: The backend component that generates class reminders based on the student's personalized timetable
- **Notice_Dispatcher**: The backend component that triggers notifications when new college notices are scraped and categorized
- **Premium_Subscription**: A paid plan associated with a student account that unlocks push notification features
- **Notification_Payload**: The structured data sent via Web Push containing title, body, category, action URL, and metadata

## Requirements

### Requirement 1: Web Push Subscription Management

**User Story:** As a premium student, I want my device to be registered for push notifications, so that I can receive timely alerts without keeping the app open.

#### Acceptance Criteria

1. WHEN a premium student grants notification permission in the browser, THE Subscription_Manager SHALL store the Web Push subscription endpoint, keys, and associated roll number in the database
2. WHEN a premium student revokes notification permission or unsubscribes from the settings page, THE Subscription_Manager SHALL remove the subscription endpoint from the database within 5 seconds
3. WHEN a push delivery fails with an HTTP 410 (Gone) response from the push service, THE Subscription_Manager SHALL automatically remove the expired subscription endpoint
4. THE Subscription_Manager SHALL support multiple subscription endpoints per student to allow notifications on multiple devices
5. IF a subscription registration request is received from a non-premium student, THEN THE Premium_Gate SHALL reject the request and return a clear upgrade prompt

### Requirement 2: Premium Subscription Gating

**User Story:** As a product owner, I want push notifications gated behind a premium plan, so that the feature generates revenue while the core app remains free.

#### Acceptance Criteria

1. THE Premium_Gate SHALL verify the student's active premium subscription status before allowing any push notification subscription or preference change
2. WHEN a student's premium subscription expires, THE Premium_Gate SHALL stop dispatching new notifications to that student's endpoints within 1 hour of expiration
3. WHEN a previously expired subscription is renewed, THE Push_Service SHALL resume notification delivery using existing subscription endpoints without requiring re-registration
4. THE Premium_Gate SHALL expose a subscription status endpoint that the frontend can query to determine whether to show push notification UI controls
5. WHILE a student's subscription is in a grace period (up to 3 days past expiration), THE Push_Service SHALL continue delivering notifications

### Requirement 3: Notice Notifications

**User Story:** As a premium student, I want to receive push notifications when new college notices are posted, so that I never miss important announcements.

#### Acceptance Criteria

1. WHEN a new notice is scraped and categorized with processing_status "done", THE Notice_Dispatcher SHALL send a push notification to all subscribed premium students whose program matches the notice source_program
2. THE Notification_Payload SHALL include the notice title, category, summary (first 100 characters), and a deep-link URL to the notice detail page
3. WHEN multiple notices are scraped in a single batch (more than 3 notices within 5 minutes), THE Notice_Dispatcher SHALL consolidate them into a single summary notification listing the count and highest-priority category
4. WHEN a notice has category "Exam" or priority greater than 60, THE Notice_Dispatcher SHALL mark the notification as high-priority requiring user interaction to dismiss
5. IF the student has disabled the notice category in Notification_Preferences, THEN THE Notice_Dispatcher SHALL skip sending the notification for that category

### Requirement 4: Attendance Alert Notifications

**User Story:** As a premium student, I want to receive alerts when my attendance drops near the 75% threshold, so that I can take corrective action before facing consequences.

#### Acceptance Criteria

1. WHEN a student's overall attendance percentage drops below 80%, THE Attendance_Monitor SHALL send a warning notification indicating current percentage and projected impact of missing one more class
2. WHEN a student's overall attendance percentage drops below 75%, THE Attendance_Monitor SHALL send a critical notification indicating the student has fallen below the mandatory threshold
3. WHEN a specific subject's attendance drops below 75%, THE Attendance_Monitor SHALL send a subject-specific alert naming the subject and its current attendance percentage
4. THE Attendance_Monitor SHALL send at most one alert per subject per day to prevent notification fatigue
5. WHEN attendance data is refreshed (on student login or manual refresh), THE Attendance_Monitor SHALL evaluate the latest percentages and trigger alerts only if the status has changed since the last evaluation

### Requirement 5: Timetable Reminders

**User Story:** As a premium student, I want to receive reminders before my classes start, so that I can prepare and arrive on time.

#### Acceptance Criteria

1. WHERE the timetable reminder feature is enabled in Notification_Preferences, THE Timetable_Reminder_Engine SHALL send a reminder notification a configurable number of minutes before each scheduled class
2. THE Notification_Payload for timetable reminders SHALL include the subject name, room number (if available), and time until class starts
3. WHEN a student has no classes scheduled for the day, THE Timetable_Reminder_Engine SHALL not send any reminder notifications for that day
4. THE Timetable_Reminder_Engine SHALL allow students to configure reminder lead time with options of 10, 15, 30, or 60 minutes before class
5. IF the timetable data is unavailable or has not been parsed for the student's semester, THEN THE Timetable_Reminder_Engine SHALL not attempt to send reminders and SHALL log the absence

### Requirement 6: Notification Preferences

**User Story:** As a premium student, I want to control which types of notifications I receive, so that I only get alerts relevant to me.

#### Acceptance Criteria

1. THE Notification_Preferences SHALL allow students to independently enable or disable each notification category: Notice Alerts, Attendance Alerts, and Timetable Reminders
2. THE Notification_Preferences SHALL allow students to filter notice notifications by category (Exam, Fee, Academic, Internship, Event, Guest Lecture, General)
3. WHEN a student updates notification preferences, THE Push_Service SHALL apply the changes to all subsequent notifications without requiring device re-registration
4. THE Notification_Preferences SHALL persist server-side associated with the student's roll number so preferences are consistent across devices
5. WHEN a new premium student subscribes for the first time, THE Notification_Preferences SHALL default to all categories enabled with timetable reminder lead time set to 15 minutes

### Requirement 7: Notification Delivery and Reliability

**User Story:** As a premium student, I want notifications to be delivered reliably, so that I can trust the system to alert me about important events.

#### Acceptance Criteria

1. THE Push_Service SHALL use the Web Push protocol (RFC 8030) with VAPID authentication for sending notifications
2. THE Push_Service SHALL encrypt notification payloads using the subscription's public key as required by the Web Push standard
3. IF a notification delivery attempt fails with a transient error (HTTP 429 or 5xx), THEN THE Push_Service SHALL retry up to 3 times with exponential backoff (30s, 120s, 480s delays)
4. THE Push_Service SHALL set a TTL (Time-To-Live) of 24 hours for standard notifications and 48 hours for high-priority notifications (Exam, critical attendance)
5. THE Web_Push_Client SHALL display received notifications using the Notification API with appropriate icons, badges, and action buttons configured per notification category

### Requirement 8: Notification History

**User Story:** As a premium student, I want to see a history of notifications I've received, so that I can review alerts I may have missed.

#### Acceptance Criteria

1. THE Push_Service SHALL log each dispatched notification with timestamp, category, title, delivery status, and target roll number
2. WHEN a premium student requests notification history, THE Push_Service SHALL return the last 50 notifications in reverse chronological order
3. THE Notification_Payload logged in history SHALL include the deep-link URL so students can navigate to the relevant content from the history view
4. WHEN a notification has been clicked/opened by the student, THE Web_Push_Client SHALL report the interaction back to the backend to mark it as read in history

### Requirement 9: Service Worker Push Handler

**User Story:** As a premium student, I want notifications to appear even when I don't have the app open, so that I receive alerts in real time.

#### Acceptance Criteria

1. THE Web_Push_Client SHALL register a push event listener in the service worker that activates when a push message is received from the browser's push service
2. WHEN a push event is received, THE Web_Push_Client SHALL parse the encrypted payload and display a notification using the Notification API with the title, body, icon, and actions from the payload
3. WHEN a student clicks on a displayed notification, THE Web_Push_Client SHALL open the app at the deep-link URL specified in the notification payload
4. IF the notification payload cannot be decrypted or parsed, THEN THE Web_Push_Client SHALL display a generic fallback notification prompting the student to open the app
5. THE Web_Push_Client SHALL include a notification badge count reflecting unread notification count

