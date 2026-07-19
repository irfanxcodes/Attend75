# Attend75 — Admin Dashboard Expansion Plan

## Current State Summary

The admin dashboard currently has 7 sections: Homepage, App Health, User Analytics, Scraper Performance, Feature Usage, StudyMe Analytics, and Feedback Management. It aggregates data from 9 database tables and 3 in-memory metric stores, served via a single `GET /admin/overview` endpoint.

**Data already collected but NOT exposed to admin:**
- `user_ratings` — star ratings per user (distribution, average, trends)
- `subject_requests` — users requesting new StudyMe subjects
- `college_interests` — signups from other colleges
- Per-user activity breakdowns (data exists in `feature_usage_events` and `studyme_events`)
- Time-series breakdowns for all events (timestamps exist but no charts/trends)

---

## 1. Recommended Admin Navigation Structure

### Proposed Menu Hierarchy

```
📊 Overview (Homepage)
├── Executive KPIs
├── Quick Alerts
└── Activity Feed

👥 Users
├── User Growth & Retention
├── User Directory (table)
├── Auth Provider Breakdown (Guest vs Firebase)
└── College Interest Signups

📈 Engagement
├── Daily/Weekly Active Users
├── Feature Adoption Rates
├── Session Duration Estimates
└── Semester Usage Patterns

🔧 System Health
├── API Performance (latency, error rates)
├── Scraper Performance (success rate, downtime)
├── Portal Status (up/down detection)
└── Failed Request Diagnostics

📚 StudyMe
├── Funnel Analytics
├── Lesson Performance Table
├── AI Usage Insights
├── PDF Engagement
├── Subject Requests Board
└── Importance Voting Insights

✉️ Mail Faculty
├── Compose vs Send Rates
├── Top Subjects Mailed
├── Unique Users Using Feature
└── Activity Over Time

⭐ Ratings & Feedback
├── App Rating Distribution
├── Rating Trend Over Time
├── Feedback Management (existing)
├── Feedback Categorization
└── Sentiment Overview

🏫 College Expansion
├── Interest Signups Table
├── College-wise Breakdown
└── Geographic Demand Map (future)
```

---

## 2. KPIs & Metrics (From Existing Data)

### Platform KPIs

| Metric | Data Source | Computation | Currently Shown? |
|--------|-------------|-------------|-----------------|
| Total Registered Users | `users` table COUNT | Simple count | ✅ Yes |
| Daily Active Users (DAU) | `feature_usage_events` + `studyme_events` DISTINCT user_identifier per day | Count distinct users with any event today | ❌ No |
| Weekly Active Users (WAU) | Same, 7-day window | Count distinct users in last 7 days | ❌ No |
| Monthly Active Users (MAU) | Same, 30-day window | Count distinct users in last 30 days | ❌ No |
| New Users Today | `users.created_at` = today | Count | ✅ Partial (in growth chart) |
| User Growth Rate | `users.created_at` grouped by day | % change week-over-week | ❌ No |
| Firebase vs Guest Ratio | `users` COUNT vs `portal_credentials` COUNT - users | Linked = Firebase, unlinked = likely guest-only | ❌ No |
| Active Sessions | In-memory session store | Live count | ✅ Yes |
| Average App Rating | `user_ratings` AVG(rating) | Simple average | ❌ No |
| NPS Proxy (% 4-5 star) | `user_ratings` WHERE rating >= 4 / total | Percentage | ❌ No |
| Feedback Volume | `feedback_entries` COUNT | Count per day/week | ✅ Partial |
| Portal Uptime | `scraper_metrics` consecutive failures | Heuristic | ✅ Yes |
| API Error Rate | `request_metrics` server errors / total | Percentage | ✅ Yes |

### User Engagement Metrics

| Metric | Data Source | Computation |
|--------|-------------|-------------|
| Feature Adoption: Mail Faculty | `feature_usage_events` WHERE feature=mail_faculty, DISTINCT user_identifier | Unique users who used mail at least once |
| Feature Adoption: Marks | `feature_usage_events` WHERE feature=consolidated_marks | Unique users |
| Feature Adoption: History | `feature_usage_events` WHERE feature=attendance_history | Unique users |
| Feature Adoption: StudyMe | `studyme_events` DISTINCT user_name | Unique users |
| Mail Faculty Conversion Rate | send_confirmed / compose_opened | Percentage |
| StudyMe Completion Rate | lesson_completed / lesson_opened events | Percentage |
| AI Prompt Usage Rate | (ai_copied + topic_prompt_copied) / lesson_opened | Percentage |
| Semester Switching Behavior | `feature_usage_events.semester_id` diversity per user | Users viewing multiple semesters |

### Retention Metrics (Derivable)

| Metric | Data Source | Computation |
|--------|-------------|-------------|
| Day-1 Retention | `users.created_at` vs `feature_usage_events.created_at` next day | % of users active the day after signup |
| Day-7 Retention | Same, 7 days later | % of users active 7 days after signup |
| Returning Users (Today) | Users with `updated_at` = today AND `created_at` < today | Count |
| Churned Users (30-day) | Users with no events in last 30 days | Count |

---

## 3. Analytics & Insights

### A. User Behavior Analytics

| Insight | Data Source | Implementation |
|---------|-------------|---------------|
| Peak usage hours | `feature_usage_events.created_at` + `studyme_events.created_at` grouped by hour | Histogram of event counts per hour of day |
| Most active days of week | Same, grouped by weekday | Bar chart |
| User journey: Login → Dashboard → History/Marks/StudyMe | `feature_usage_events` sequence by user per session | Funnel |
| Multi-feature users | `feature_usage_events` DISTINCT feature per user_identifier | % using 2+ features |
| Power users | Users with highest event count in last 7 days | Top 10 list |

### B. Attendance-Related Insights

| Insight | Data Source | Implementation |
|---------|-------------|---------------|
| Most mailed subjects (attendance issues) | `feature_usage_events` WHERE mail_faculty, GROUP BY subject_code | Already exists, can add time trend |
| Mail faculty by attendance date | `feature_usage_events.attendance_date` distribution | Which days generate most mails |
| Semester popularity | `feature_usage_events.semester_id` GROUP BY | Which semesters are most viewed |
| Marks vs Attendance correlation | Cross-query marks views and attendance syncs per user | % overlap |

### C. StudyMe Usage Analytics

| Insight | Data Source | Already Shown? |
|---------|-------------|---------------|
| Engagement funnel | `studyme_events` event_type sequence | ✅ Yes |
| Lesson popularity ranking | `studyme_events` GROUP BY lesson_name | ✅ Yes |
| AI usage breakdown | `studyme_events` WHERE type IN (ai_opened, ai_copied, topic_prompt_copied) | ✅ Yes |
| Daily StudyMe users trend | `studyme_events` DISTINCT user_name per day | ❌ No |
| Subject request demand | `subject_requests` GROUP BY subject_code, COUNT | ❌ No |
| Important votes leaderboard | `studyme_important_votes` GROUP BY lesson_name/topic_name | ✅ Partial |
| PDF page engagement (pages read per session) | `studyme_events` page_next/page_prev counts | ✅ Partial |

### D. Feature Adoption Metrics

| Feature | Adoption Rate Formula | Data Source |
|---------|----------------------|-------------|
| Mail Faculty | unique mail_faculty users / total users × 100 | `feature_usage_events` + `users` |
| Marks Viewing | unique marks viewers / total users × 100 | `feature_usage_events` |
| History Calendar | unique history viewers / total users × 100 | `feature_usage_events` |
| StudyMe | unique studyme users / total users × 100 | `studyme_events` |
| Ratings | users who rated / total users × 100 | `user_ratings` + `users` |
| Feedback | users who submitted / total users × 100 | `feedback_entries` |

---

## 4. Reports & Dashboards

### A. Executive Dashboard (Summary View)

| Widget | Data |
|--------|------|
| Total Users (with +X today badge) | `users` COUNT + today's signups |
| DAU / WAU / MAU | Derived from events |
| App Rating (star average + distribution bar) | `user_ratings` |
| Portal Health Indicator (green/yellow/red) | `scraper_metrics` |
| Revenue-proxy: Growth trend spark line | `users.created_at` 14-day series |
| Key Alerts (feedback spike, portal down, error rate spike) | Threshold checks |

### B. Operational Reports

| Report | Content |
|--------|---------|
| Scraper Health Daily | Success rate, avg latency, downtime windows, top failure codes |
| API Performance Daily | P50/P95 latency, error rate, top failing endpoints |
| Session Utilization | Active sessions vs max capacity, eviction rate |
| Portal Availability Log | Timestamps of detected downtime + recovery |

### C. User Activity Reports

| Report | Content |
|--------|---------|
| New User Report (daily/weekly) | Signup count, Firebase vs Guest split, linked credential rate |
| User Directory | Searchable/filterable table with name, email, roll, created_at, last_active |
| Retention Cohort Table | Week-by-week retention grid |
| Churned Users List | Users with no activity in 30+ days |

### D. Content Performance Reports

| Report | Content |
|--------|---------|
| StudyMe Lesson Rankings | Opens, unique users, completion rate, AI usage, votes |
| Subject Request Board | Requested subjects ranked by demand, with user counts |
| PDF Engagement Report | Total opens, avg pages viewed, top PDFs |
| Feedback Category Breakdown | Auto-categorized feedback volumes |

### E. System Health Reports

| Report | Content |
|--------|---------|
| API Error Log | Failed paths, error codes, timestamps |
| Scraper Failure Log | Failure codes, stages, retriability |
| Downtime Timeline | Portal availability over time |
| Database Health | Connection status, query performance (future) |

---

## 5. Data Opportunities

### Currently Available (Just Not Shown)

| Opportunity | Tables Involved | Value |
|------------|-----------------|-------|
| App rating distribution (1-5 star histogram) | `user_ratings` | Understand satisfaction |
| Rating trend over time | `user_ratings.created_at` | Track if satisfaction improves |
| Subject demand ranking board | `subject_requests` | Prioritize next content to add |
| College interest pipeline | `college_interests` | Expansion planning |
| Per-user activity timeline | `feature_usage_events` + `studyme_events` | Identify power users, churn risk |
| Peak usage hours | All event tables timestamps | Optimize portal scraping/maintenance windows |
| DAU/WAU/MAU from existing events | `feature_usage_events` + `studyme_events` | Core growth metric |

### Recommended Future Data Points to Collect

| Data Point | Where to Add | Value |
|-----------|--------------|-------|
| Login event (with auth_type: guest/firebase) | New record on each login in `feature_usage_events` | Track login frequency, auth preference |
| Session duration (start + last_activity timestamp) | Extend `SessionRecord` to track | Understand engagement depth |
| Device/platform info (mobile/desktop, OS) | Capture User-Agent on login, store in events | Understand device mix |
| Page view events (which pages visited) | Frontend sends page_view events | Full user journey mapping |
| Notification delivery/click events | When push notifications are implemented | Notification effectiveness |
| PWA install event | Capture from `appinstalled` event → send to backend | Track PWA adoption |

---

## 6. Implementation Priority

### High Priority (High business value, low-medium complexity)

| # | Feature | Tables | Complexity | Business Value |
|---|---------|--------|-----------|---------------|
| 1 | App Rating Dashboard (distribution + average + trend) | `user_ratings` | Low — simple GROUP BY query | High — direct satisfaction signal |
| 2 | DAU/WAU/MAU metrics | `feature_usage_events` + `studyme_events` | Medium — distinct user counting by date ranges | High — core growth KPI |
| 3 | Subject Request Board | `subject_requests` | Low — simple GROUP BY subject_code | High — content roadmap prioritization |
| 4 | College Interest Table | `college_interests` | Low — paginated table display | High — expansion strategy |
| 5 | User retention (Day-1, Day-7) | `users.created_at` + `feature_usage_events.created_at` | Medium — cohort cross-join | High — retention is key metric |
| 6 | Feature adoption rates | `feature_usage_events` + `users` COUNT | Low — ratio calculation | High — understand what users value |

### Medium Priority (Moderate complexity, clear value)

| # | Feature | Tables | Complexity | Business Value |
|---|---------|--------|-----------|---------------|
| 7 | Peak usage hours chart | All event timestamps | Low — GROUP BY HOUR | Medium — operational planning |
| 8 | Daily StudyMe users trend | `studyme_events` GROUP BY date | Low — simple time series | Medium — content engagement trend |
| 9 | Auth provider breakdown (Guest vs Firebase) | `users` vs `portal_credentials` | Low — count comparison | Medium — understand auth preference |
| 10 | Mail Faculty time-series (weekly sends) | `feature_usage_events` GROUP BY week | Low — time bucket | Medium — feature engagement trend |
| 11 | Feedback volume over time (chart) | `feedback_entries.timestamp` GROUP BY date | Low — time series | Medium — monitor feedback patterns |
| 12 | Per-user activity log (admin lookup) | All event tables filtered by user_identifier | Medium — cross-table query | Medium — support/debugging |

### Nice to Have (Future enhancements)

| # | Feature | Tables | Complexity | Business Value |
|---|---------|--------|-----------|---------------|
| 13 | Retention cohort grid (week-by-week) | `users` + events cross-reference | High — complex cohort analysis | Medium — deep retention understanding |
| 14 | User journey flow visualization | `feature_usage_events` ordered by time per user | High — session reconstruction | Medium — UX optimization |
| 15 | Churn prediction (30-day inactive) | `users` LEFT JOIN recent events | Medium — date comparison | Low-Medium — early for current scale |
| 16 | Geographic/college distribution | `college_interests.college_name` | Low — if data exists | Low — future expansion |
| 17 | A/B testing framework | New tables needed | High — new infrastructure | Low — premature at current scale |
| 18 | Export reports (CSV/PDF) | All admin data | Medium — serialization layer | Low — admin is likely 1 person |

---

## 7. New API Endpoints Needed

| Endpoint | Purpose | Priority |
|----------|---------|----------|
| `GET /admin/ratings` | Rating distribution, average, trend over time | High |
| `GET /admin/subject-requests` | Subject demand board with counts | High |
| `GET /admin/college-interests` | Paginated college interest signups | High |
| `GET /admin/engagement/dau` | DAU/WAU/MAU for date range | High |
| `GET /admin/engagement/retention` | Retention cohort data | Medium |
| `GET /admin/engagement/peak-hours` | Hour-of-day activity distribution | Medium |
| `GET /admin/users/:identifier/activity` | Per-user activity timeline | Medium |

OR: Extend the existing `GET /admin/overview` with optional `?section=ratings` query params to lazy-load sections.

---

## Summary

The existing data already supports 80% of the recommended analytics. The highest-value additions that require minimal backend work are:

1. **Ratings dashboard** — data exists in `user_ratings`, just needs a query + frontend chart
2. **DAU/WAU/MAU** — data exists across event tables, needs date-range distinct counting
3. **Subject request board** — data exists in `subject_requests`, just needs exposure
4. **College interest table** — data exists in `college_interests`, needs a paginated view
5. **Feature adoption rates** — all counts exist, needs ratio calculation against total users
6. **Retention metrics** — user creation dates + event dates allow cohort analysis

No new data collection is required for any High Priority items.
