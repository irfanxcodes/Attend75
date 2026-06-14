# Terms & Conditions

**Attend75**
**Last Updated: June 12, 2026**
**Effective Date: June 12, 2026**

---

## 1. Acceptance of Terms

By accessing, downloading, installing, or using Attend75 ("the Platform," "we," "us," "our"), you ("User," "you," "your") agree to be bound by these Terms & Conditions ("Terms"). If you do not agree to these Terms in their entirety, you must immediately cease all use of the Platform.

These Terms constitute a legally binding agreement between you and Attend75.

---

## 2. Platform Description

Attend75 is an independent, student-built platform that provides:
- Attendance tracking and visualization based on data retrieved from your college portal
- Attendance predictions and feasibility analysis
- Attendance streak tracking
- Consolidated marks viewing
- Faculty Mail (email draft composition via mailto: links)
- StudyMe (study material browsing, topic tracking, importance voting)
- Feedback submission and app rating
- Subject request submissions
- College interest form for unsupported institutions

The Platform retrieves data from your college's student portal using the credentials YOU provide, processes it, and presents it in an enhanced interface.

---

## 3. Independence & Non-Affiliation

**Attend75 is an independent platform. It is NOT affiliated with, endorsed by, sponsored by, or operated on behalf of any college, university, educational institution, or their administration unless explicitly stated in writing.**

- The Platform does not represent any college or its official records.
- Data displayed on Attend75 is derived from your college portal but is processed and presented independently.
- No college or university has authorized, sanctioned, or approved the existence or operation of this Platform.
- References to college names, portal systems, or institutional data are solely for the purpose of describing the service and do not imply any partnership or endorsement.

---

## 4. Eligibility

You must be:
- At least 16 years of age
- A currently enrolled student at a supported educational institution (or submitting a college interest form)
- The legitimate owner of the portal credentials you provide

By using the Platform, you represent and warrant that you meet these eligibility requirements.

---

## 5. User Account & Authentication

### 5.1 Guest Mode (Portal Login)

- You may log in using your college portal credentials (roll number and password).
- Your credentials are used solely to authenticate with the college portal in real-time.
- No persistent account is created. All data is session-only and discarded upon session expiry or server restart.

### 5.2 Google Sign-In (Firebase Authentication)

- You may sign in using your Google account via Firebase Authentication.
- You may link your portal credentials to your Google account for automatic re-login.
- Linked portal passwords are encrypted with Fernet (AES-128-CBC + HMAC-SHA256) before storage.
- You are responsible for maintaining the security of your Google account.

### 5.3 Your Responsibilities

- You are solely responsible for the confidentiality and security of your portal credentials and Google account.
- You must not share your session token or provide access to your authenticated session to others.
- You must not use another student's credentials to access the Platform.
- You must notify us immediately if you believe your account or session has been compromised.

---

## 6. Credential Handling & Security

### 6.1 What We Do With Your Credentials

- **Guest Mode:** Your password is transmitted over HTTPS, used in server memory to authenticate with the college portal, and immediately discarded. It is never stored to disk, database, or logs.
- **Firebase Linked Credentials:** Your portal password is encrypted using Fernet symmetric encryption and stored in our database. It is only decrypted when needed to re-authenticate with the portal on your behalf.
- **We never store plaintext passwords.**
- **We never log, display, or expose your password in any form.**

### 6.2 Limitations of Security

While we implement industry-standard encryption and security practices, **no system is 100% secure.** You acknowledge that:
- The transmission of information over the internet carries inherent risks.
- We cannot guarantee absolute security against all possible threats.
- You use the Platform and provide credentials at your own risk.
- We are not liable for unauthorized access resulting from vulnerabilities beyond our reasonable control.

---

## 7. Acceptable Use

You agree NOT to:

1. Use the Platform for any unlawful purpose or in violation of your institution's policies.
2. Attempt to access another student's data, account, or session.
3. Reverse engineer, decompile, disassemble, or attempt to extract the source code of the Platform.
4. Interfere with, disrupt, or place an unreasonable load on the Platform's infrastructure.
5. Use automated scripts, bots, or scrapers to access the Platform (beyond normal usage).
6. Attempt to bypass authentication, session management, or rate-limiting mechanisms.
7. Misrepresent your identity or provide false credentials.
8. Use data obtained through the Platform for commercial purposes, harassment, or to harm others.
9. Redistribute, resell, or sublicense access to the Platform.
10. Use the Faculty Mail feature to send harassing, threatening, fraudulent, or inappropriate communications to faculty or staff.
11. Claim that information from Attend75 constitutes official institutional records.
12. Hold the Platform responsible for academic decisions you make based on data shown.

Violation of these terms may result in immediate termination of access without notice.

---

## 8. Attendance Data, Predictions & Analytics

### 8.1 Informational Purpose Only

**All attendance data, calculations, predictions, feasibility analyses, streaks, subject rankings, and analytics provided by Attend75 are for INFORMATIONAL PURPOSES ONLY.**

- They are derived from portal data at a point in time and may not reflect the most current official records.
- They are NOT official records and should NOT be treated as such.
- They may contain inaccuracies due to portal data entry delays, portal bugs, parsing errors, or network issues.

### 8.2 Student Responsibility

**YOU are solely responsible for:**
- Verifying your official attendance records through your institution's official channels.
- Making academic decisions based on official records, not Attend75 data.
- Attending classes and maintaining adequate attendance regardless of what Attend75 displays.
- Understanding your institution's attendance requirements and consequences.
- Cross-checking predictions and "classes to attend" calculations against official rules.

### 8.3 No Guarantee of Accuracy

We make **NO guarantees, representations, or warranties** that:
- Attendance percentages shown are identical to official records.
- Prediction calculations (classes needed, feasibility) will result in the stated outcome.
- Streak counts are perfectly accurate.
- Marks data matches official transcripts.
- Faculty contact information is current or correct.

---

## 9. Faculty Mail Feature

### 9.1 How It Works

The Faculty Mail feature:
1. Retrieves faculty email addresses from the college portal on your behalf.
2. Generates a suggested email subject and body based on your attendance data.
3. Opens a `mailto:` link on YOUR device, which launches YOUR email client.

**Attend75 does NOT send any emails on your behalf. Emails are composed and sent entirely through your own email application.**

### 9.2 Your Responsibility

- YOU are solely and entirely responsible for any emails you compose, edit, and send using this feature.
- YOU are responsible for the accuracy, tone, appropriateness, and content of any communication sent to faculty.
- The pre-composed draft is a suggestion only. You must review and edit it before sending.
- Attend75 is not liable for any consequences arising from emails you send, including but not limited to: disciplinary action, faculty complaints, misunderstandings, or academic penalties.
- Misuse of this feature (spam, harassment, impersonation, false claims) is a violation of these Terms and may result in immediate termination of access.

### 9.3 No Endorsement

The existence of the Faculty Mail feature does not constitute advice, encouragement, or endorsement of contacting faculty about attendance. Whether and how to communicate with faculty is entirely your decision and responsibility.

---

## 10. StudyMe Feature

### 10.1 Content Ownership

- Study materials, topic structures, lesson content, and educational resources available through StudyMe are the intellectual property of Attend75 or its content contributors.
- You may use StudyMe content for personal educational purposes only.
- You may NOT reproduce, distribute, sell, or publicly share StudyMe content without explicit written permission.

### 10.2 User-Generated Data

- Importance votes, completion data, and event tracking associated with your account are your data contributions.
- By using the feature, you grant Attend75 a non-exclusive license to aggregate and display community-level statistics (e.g., vote counts, popularity) without identifying you personally.

### 10.3 No Academic Guarantee

StudyMe is a supplementary study aid. It does not guarantee academic success, exam performance, or completeness of curriculum coverage.

---

## 11. Limitation of Liability

### 11.1 Disclaimer of Warranties

THE PLATFORM IS PROVIDED "AS IS" AND "AS AVAILABLE" WITHOUT WARRANTIES OF ANY KIND, WHETHER EXPRESS, IMPLIED, STATUTORY, OR OTHERWISE. WE SPECIFICALLY DISCLAIM ALL IMPLIED WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, AND NON-INFRINGEMENT.

### 11.2 No Liability For

**To the maximum extent permitted by applicable law, Attend75 and its developers, contributors, and operators shall NOT be liable for any direct, indirect, incidental, special, consequential, or punitive damages arising from or related to:**

1. **Attendance shortages** — including failure to meet minimum attendance requirements, exam debarment, or academic consequences of any kind.
2. **Exam eligibility** — denial of permission to sit exams, loss of marks, or academic penalties.
3. **Incorrect or outdated data** — any inaccuracy in attendance records, marks, faculty contacts, predictions, or analytics displayed by the Platform.
4. **Prediction inaccuracies** — incorrect feasibility calculations, wrong "classes to attend" numbers, or misleading streak data.
5. **Portal changes** — changes to the college portal's structure, URL, authentication mechanism, or data format that cause the Platform to malfunction.
6. **Scraping failures** — inability to retrieve data due to portal downtime, network issues, CAPTCHAs, IP blocking, rate limiting, or structural HTML changes.
7. **Third-party outages** — Firebase downtime, Google authentication failures, or college portal unavailability.
8. **Service interruptions** — planned or unplanned downtime, maintenance, server crashes, or data loss.
9. **Bugs and software errors** — any defect, error, vulnerability, or unintended behavior in the Platform.
10. **Session expiry or data loss** — sessions expire after inactivity or on server restart; in-memory data is not persisted.
11. **Faculty Mail consequences** — any outcome resulting from emails you compose and send through your own email client.
12. **Credential exposure** — unauthorized access to credentials resulting from compromise of the server, encryption key, or your own device/account.
13. **Academic decisions** — any decision you make based on information provided by the Platform.
14. **College disciplinary actions** — any action taken by your institution related to your use of this Platform or any emails sent via the Faculty Mail feature.

### 11.3 Maximum Liability

In no event shall our total aggregate liability exceed the amount you have paid to use the Platform (which, if the Platform is free, is zero).

### 11.4 Assumption of Risk

By using the Platform, you expressly acknowledge and accept that:
- You are using an independent third-party tool that interfaces with your college's systems.
- The Platform may produce inaccurate results at any time without warning.
- You remain fully responsible for your own academic record and attendance.
- You will not rely solely on Attend75 for attendance management decisions.

---

## 12. Indemnification

You agree to indemnify, defend, and hold harmless Attend75 and its developers, operators, contributors, and affiliates from and against any and all claims, damages, losses, liabilities, costs, and expenses (including reasonable legal fees) arising from:

1. Your use or misuse of the Platform.
2. Your violation of these Terms.
3. Any email or communication you send using or based on the Faculty Mail feature.
4. Any false or misleading claims you make regarding data obtained from the Platform.
5. Your violation of any third-party rights or applicable law.
6. Any academic or disciplinary consequences resulting from your reliance on Platform data.
7. Unauthorized use of your credentials provided through the Platform.

---

## 13. Portal Interaction & Scraping

### 13.1 Authorization

By providing your portal credentials and using the Platform, you authorize Attend75 to:
- Log in to the college portal on your behalf using YOUR credentials.
- Retrieve attendance data, marks data, faculty contact information, and related academic data.
- Cache retrieved data temporarily in server memory for performance purposes.

### 13.2 Read-Only Access

Attend75 performs **read-only** operations on the college portal. We do NOT:
- Modify any portal records.
- Submit forms on your behalf (except the login form).
- Change your password, attendance records, or any other portal data.
- Access other students' information.

### 13.3 Portal Dependency

The Platform depends on the structure and availability of the college portal. We make no guarantee that the Platform will continue to function if the portal:
- Changes its login mechanism, URL, or HTML structure.
- Implements CAPTCHAs, rate limiting, or IP-based blocking.
- Goes offline temporarily or permanently.
- Restricts automated access.

Such changes may render the Platform partially or fully non-functional without notice, and this shall not constitute a breach of these Terms.

---

## 14. Intellectual Property

### 14.1 Platform Ownership

Attend75, including its source code, design, user interface, branding, logos, name, algorithms, documentation, and all related intellectual property, is owned by the Attend75 team.

### 14.2 StudyMe Content

Study materials, curricula structures, topic databases, and educational content within StudyMe are protected intellectual property. Unauthorized reproduction, distribution, or commercial use is prohibited.

### 14.3 Restrictions

You may not:
- Copy, modify, or create derivative works from the Platform without written permission.
- Use the "Attend75" name, logo, or branding for any purpose without prior authorization.
- Scrape, crawl, or extract data from the Platform for any purpose.
- Present the Platform's features, content, or design as your own work.

### 14.4 User Content

By submitting feedback, subject requests, or other content to the Platform, you grant Attend75 a non-exclusive, royalty-free, perpetual license to use, display, and incorporate such content to improve the Platform.

---

## 15. Service Availability & Modifications

### 15.1 No Uptime Guarantee

We do not guarantee any specific level of availability or uptime. The Platform may be unavailable due to:
- Server maintenance or upgrades
- Infrastructure failures
- Portal changes or outages
- Third-party service disruptions
- Security incidents
- Resource constraints

### 15.2 Right to Modify or Discontinue

We reserve the right to modify, suspend, or discontinue any feature or the entire Platform at any time, with or without notice. This includes changes to:
- Features and functionality
- Data retention policies
- Authentication mechanisms
- Supported colleges or portals
- API endpoints and behavior

### 15.3 No Obligation

We are under no obligation to maintain, update, support, or continue operating the Platform.

---

## 16. Termination

### 16.1 By Us

We may terminate or suspend your access to the Platform at any time, for any reason, including but not limited to:
- Violation of these Terms
- Abusive, fraudulent, or harmful behavior
- Excessive load or misuse of Platform resources
- Legal requirements or requests

### 16.2 By You

You may stop using the Platform at any time. If you have a Firebase account with linked credentials, you may request account deletion per our Privacy Policy.

### 16.3 Effect of Termination

Upon termination:
- Your session will be invalidated immediately.
- You will lose access to all Platform features.
- Any data retained per our Privacy Policy will be handled according to data retention schedules or deletion requests.

---

## 17. Disclaimer Regarding Academic Outcomes

**ATTEND75 IS NOT RESPONSIBLE FOR YOUR ACADEMIC OUTCOMES.**

This includes but is not limited to:
- Failure to meet attendance requirements
- Exam debarment or eligibility denial
- Loss of marks, grades, or credits
- Academic probation or suspension
- Any penalty imposed by your institution

The Platform is a supplementary information tool. It does not replace, override, or supplement official institutional records or processes. Your academic success is entirely your responsibility.

---

## 18. Governing Law & Dispute Resolution

### 18.1 Governing Law

These Terms shall be governed by and construed in accordance with the laws of India, without regard to its conflict of law provisions.

### 18.2 Dispute Resolution

Any dispute arising from or relating to these Terms shall first be attempted to be resolved through informal negotiation. If informal resolution fails within 30 days, disputes shall be subject to the exclusive jurisdiction of the courts in India.

### 18.3 Waiver of Class Action

You agree to resolve disputes individually and waive any right to participate in class action lawsuits or class-wide arbitration.

---

## 19. Severability

If any provision of these Terms is found to be invalid, illegal, or unenforceable by a court of competent jurisdiction, the remaining provisions shall continue in full force and effect. The invalid provision shall be modified to the minimum extent necessary to make it valid while preserving its original intent.

---

## 20. Entire Agreement

These Terms, together with the Privacy Policy, constitute the entire agreement between you and Attend75 regarding your use of the Platform. They supersede all prior or contemporaneous agreements, representations, or understandings.

---

## 21. Changes to These Terms

We reserve the right to update or modify these Terms at any time. Changes will be indicated by the "Last Updated" date. Your continued use of the Platform after any modification constitutes acceptance of the revised Terms. If you disagree with changes, you must stop using the Platform.

---

## 22. Contact

For questions, concerns, or legal notices regarding these Terms, contact:

**Attend75 Team**
Email: [Insert contact email here]

---

*These Terms & Conditions are specific to the Attend75 platform and reflect its actual technical implementation, features, and operational model as of the effective date.*
