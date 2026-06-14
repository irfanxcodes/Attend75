# Privacy Policy

**Attend75**
**Last Updated: June 12, 2026**
**Effective Date: June 12, 2026**

---

## 1. Introduction

Attend75 ("we," "us," "our," "the Platform") is an independent student-built platform that helps students track and manage their attendance. This Privacy Policy explains what information we collect, why we collect it, how we use and protect it, and what rights you have regarding your data.

**Attend75 is not affiliated with, endorsed by, or operated on behalf of any college, university, or educational institution.** We are an independent third-party tool that interfaces with college portals solely at the direction and authorization of individual students.

By using Attend75, you acknowledge that you have read, understood, and agree to this Privacy Policy. If you do not agree, you must stop using the Platform immediately.

---

## 2. Information We Collect

### 2.1 Portal Credentials (Roll Number & Password)

When you log in to Attend75 using your college portal credentials:

- **Guest Mode (Portal Login):** Your roll number and password are used in real-time to authenticate with your college portal. Your password is transmitted over HTTPS to our server, used solely to establish a session with the college portal, and is **never stored to disk or database** in guest mode. It exists only in server memory for the duration of the scraping request and is discarded immediately afterward.

- **Firebase/Google Sign-In with Linked Credentials:** If you choose to link your portal credentials to your Google account for automatic login, your portal password is **encrypted using Fernet symmetric encryption (AES-128-CBC with HMAC-SHA256)** before being stored in our database. The password is only decrypted server-side when needed to re-authenticate with your college portal on your behalf.

### 2.2 Account Information (Firebase/Google Users)

If you sign in with Google, we store:
- Firebase UID (unique identifier from Google/Firebase)
- Email address (from your Google account)
- Display name (from your Google account)
- Account creation and last-update timestamps

### 2.3 Session Data

- Server-side session tokens (cryptographically random, 192-bit) are generated upon login and stored **in server memory only** (not in any database).
- Sessions expire after 12 hours of inactivity and are lost on server restart.
- Session tokens are not cookies; they are passed explicitly by the client with each request.

### 2.4 Feature Usage Data

We collect anonymized and pseudonymized usage metrics to understand how features are used and to improve the Platform:
- Feature name and action type (e.g., "sync_attendance / viewed," "mail_faculty / compose_opened")
- User identifier (roll number, uppercased)
- Subject code and name (when relevant)
- Semester identifier and label
- Timestamp of the event

### 2.5 StudyMe Data

When you use the StudyMe feature:
- Event type (e.g., topic viewed, lesson completed)
- Your display name or username
- Subject, lesson, and topic identifiers and names
- Importance votes (which topics/lessons you mark as important)
- Event dates and timestamps

### 2.6 Feedback & Ratings

- Feedback messages you submit (with optional username, defaults to "Anonymous")
- Star ratings (1–5) associated with your roll number

### 2.7 College Interest Submissions

If you submit a college interest form (for users whose college is not yet supported):
- Your name
- Email address
- College name
- Optional message

### 2.8 Subject Requests

If you request a subject be added to StudyMe:
- Your roll number (user identifier)
- Subject code, name, and abbreviation

### 2.9 Information We Do NOT Collect

- We do **not** use cookies for tracking.
- We do **not** collect IP addresses or device fingerprints.
- We do **not** integrate any third-party analytics services (no Google Analytics, Mixpanel, etc.).
- We do **not** store or log your portal password in plaintext at any point.
- We do **not** read, store, or have access to your email content, inbox, or sent messages.

---

## 3. How We Use Your Information

| Data | Purpose |
|------|---------|
| Portal credentials | Authenticate with your college portal to fetch YOUR attendance, marks, and faculty contacts |
| Firebase account info | Identify you across sessions for persistent login |
| Encrypted portal password | Enable automatic re-login for Google Sign-In users without re-entering credentials |
| Feature usage events | Internal analytics to improve features, prioritize development, and understand usage patterns |
| StudyMe events & votes | Enable collaborative study features, track popular content |
| Feedback & ratings | Improve the Platform based on user input |
| Session tokens | Maintain your authenticated state during a session |
| College interest form | Evaluate demand for expanding to new colleges |

We do **not** sell, rent, lease, or trade your personal information to any third party.

---

## 4. How We Protect Your Information

### 4.1 Credential Encryption

Portal passwords stored for Firebase-linked accounts are encrypted using **Fernet symmetric encryption** (from Python's `cryptography` library), which provides:
- AES-128-CBC encryption
- HMAC-SHA256 authentication (tamper detection)
- Timestamp-based token format

The encryption key is configured via a server environment variable (`CREDENTIAL_ENCRYPTION_KEY`) and is not stored in the codebase in production.

### 4.2 Session Security

- Session tokens are generated using Python's `secrets.token_urlsafe(24)` (192 bits of cryptographic randomness).
- Sessions are stored **exclusively in server memory** — not written to any database, log file, or persistent storage.
- Sessions automatically expire after 12 hours of inactivity.
- A maximum of 5,000 concurrent sessions is enforced, with least-recently-used eviction.
- Each session has its own reentrant lock for thread-safe access.

### 4.3 Transport Security

- All client-server communication uses HTTPS in production.
- CORS (Cross-Origin Resource Sharing) is configured to restrict which domains can communicate with our backend.

### 4.4 Data Minimization

- Guest mode users have zero persistent data stored — everything is discarded when the session ends.
- We collect only what is necessary to provide Platform functionality.
- Portal credentials are only accessed (decrypted) when actively needed for portal authentication.

---

## 5. Third-Party Services

### 5.1 Firebase Authentication (Google)

We use **Firebase Authentication by Google** to provide Google Sign-In functionality.
- Firebase processes your Google ID token for identity verification.
- We receive and store only: UID, email, and display name.
- Firebase's privacy policy applies to their handling of your Google credentials: https://firebase.google.com/support/privacy

### 5.2 College Portal

- We access your college's student portal (`http://111.93.16.209/sz` or as configured) **on your behalf** using the credentials **you provide**.
- We act as your authorized agent to retrieve your own attendance, marks, and faculty contact data.
- We do not access other students' data, alter any portal records, or perform any actions beyond read-only data retrieval.
- We are not responsible for the availability, accuracy, or security of the college portal itself.

### 5.3 No Other Third Parties

We do not use any other third-party services for analytics, advertising, tracking, or data processing. All usage analytics are first-party and server-side.

---

## 6. Data Retention

| Data Type | Retention Period |
|-----------|----------------|
| Guest mode sessions | Duration of session only (max 12 hours, lost on server restart) |
| Firebase user accounts & linked credentials | Until you request deletion |
| Feature usage events | Indefinite (pseudonymized by roll number) |
| StudyMe events & votes | Indefinite |
| Feedback entries | Indefinite (unless you request removal) |
| Ratings | Indefinite (associated with roll number) |
| College interest forms | Indefinite |
| Subject requests | Indefinite |

---

## 7. Your Rights

### 7.1 Access

You have the right to request a copy of the personal data we hold about you.

### 7.2 Correction

You can update your linked portal credentials at any time through the Platform. Firebase account details (email, display name) are synced from your Google account.

### 7.3 Deletion

You may request complete deletion of your account and all associated data by contacting us. Upon receiving a valid deletion request, we will:
- Delete your Firebase user record and linked portal credentials from our database.
- Remove all feature usage events, StudyMe data, feedback, ratings, and subject requests associated with your identifier.
- This action is **irreversible**.

Guest mode users have no persistent data to delete — sessions are ephemeral.

### 7.4 Data Portability

You may request an export of your data in a machine-readable format.

### 7.5 Withdraw Consent

You may stop using the Platform at any time. If you have linked credentials, you can request deletion per Section 7.3.

### 7.6 How to Exercise Your Rights

Contact us at the information provided in Section 11 to exercise any of these rights. We will respond within 30 days.

---

## 8. Children's Privacy

Attend75 is designed for college/university students. We do not knowingly collect data from anyone under the age of 16. If we become aware that we have inadvertently collected data from a minor under 16, we will take steps to delete such data promptly.

---

## 9. Faculty Mail Feature

The "Mail Faculty" feature in Attend75 **does not send emails through our servers.** It:
1. Retrieves faculty contact information from the college portal (on your behalf using your session).
2. Generates a pre-composed email draft.
3. Opens a `mailto:` link in YOUR device's default email application.

**We never send, relay, read, or store any email content.** The email is composed and sent entirely through your own email client. We only track that you initiated the compose action (for usage analytics), not the content or whether it was actually sent.

---

## 10. Changes to This Privacy Policy

We may update this Privacy Policy from time to time. The "Last Updated" date at the top will reflect the most recent revision. Continued use of the Platform after changes constitutes acceptance of the updated policy. We encourage you to review this page periodically.

---

## 11. Contact Us

For privacy-related inquiries, data deletion requests, or questions about this Privacy Policy, contact:

**Attend75 Team**
Email: [Insert contact email here]

---

*This Privacy Policy is specific to the Attend75 platform and reflects its actual technical implementation as of the effective date.*
