"""
Admin Analytics Service — High-Priority Metrics

Provides:
1. App Rating analytics (distribution, average, trend)
2. DAU / WAU / MAU engagement metrics
3. Subject Request demand board
4. College Interest signups
5. Feature adoption rates
6. User retention (Day-1, Day-7)
7. Peak usage hours
8. Auth provider breakdown
"""

from datetime import date, datetime, timedelta

from sqlalchemy import func, distinct, case, and_

from db.models.college_interest import CollegeInterest
from db.models.feature_usage_event import FeatureUsageEvent
from db.models.portal_credential import PortalCredential
from db.models.studyme_event import StudyMeEvent
from db.models.student_registry import StudentRegistry
from db.models.subject_request import SubjectRequest
from db.models.user import User
from db.models.user_rating import UserRating
from db.session import SessionLocal


# ---------------------------------------------------------------------------
# 1. App Rating Analytics
# ---------------------------------------------------------------------------

def get_rating_analytics() -> dict:
    """Rating distribution (1-5), average, total count, and daily trend (last 14 days)."""
    with SessionLocal() as session:
        total_ratings = int(session.query(func.count(UserRating.id)).scalar() or 0)
        unique_raters = int(session.query(func.count(distinct(UserRating.user_identifier))).scalar() or 0)
        average_rating = float(session.query(func.avg(UserRating.rating)).scalar() or 0.0)

        # Distribution
        distribution_rows = (
            session.query(UserRating.rating, func.count(UserRating.id))
            .group_by(UserRating.rating)
            .all()
        )
        distribution = {i: 0 for i in range(1, 6)}
        for rating_val, count in distribution_rows:
            distribution[int(rating_val)] = int(count)

        # NPS proxy: % of users who rated 4 or 5
        promoters = distribution.get(4, 0) + distribution.get(5, 0)
        nps_proxy = round((promoters / total_ratings) * 100, 1) if total_ratings > 0 else 0.0

        # Trend: ratings per day (last 14 days)
        trend_start = date.today() - timedelta(days=13)
        trend_rows = (
            session.query(
                func.date(UserRating.created_at).label("day"),
                func.count(UserRating.id),
                func.avg(UserRating.rating),
            )
            .filter(func.date(UserRating.created_at) >= trend_start.isoformat())
            .group_by(func.date(UserRating.created_at))
            .all()
        )
        trend_map = {str(row[0]): {"count": int(row[1]), "avg": round(float(row[2] or 0), 2)} for row in trend_rows}
        trend = []
        for offset in range(14):
            day_key = (trend_start + timedelta(days=offset)).isoformat()
            entry = trend_map.get(day_key, {"count": 0, "avg": 0.0})
            trend.append({"date": day_key, **entry})

    return {
        "totalRatings": total_ratings,
        "uniqueRaters": unique_raters,
        "averageRating": round(average_rating, 2),
        "npsProxyPercent": nps_proxy,
        "distribution": distribution,
        "trend": trend,
    }


# ---------------------------------------------------------------------------
# 2. DAU / WAU / MAU
# ---------------------------------------------------------------------------

def get_engagement_metrics() -> dict:
    """Daily, Weekly, Monthly Active Users based on logins and event activity."""
    today = date.today()
    week_ago = today - timedelta(days=6)
    month_ago = today - timedelta(days=29)

    with SessionLocal() as session:
        # Count active users from student_registry (login-based) + event activity
        def _count_active_users(start_date: date) -> int:
            # Students who logged in during the period
            registry_users = int(
                session.query(func.count(StudentRegistry.roll_number))
                .filter(func.date(StudentRegistry.last_seen_at) >= start_date.isoformat())
                .scalar() or 0
            )
            return registry_users

        dau = _count_active_users(today)
        wau = _count_active_users(week_ago)
        mau = _count_active_users(month_ago)

        total_users = int(session.query(func.count(StudentRegistry.roll_number)).scalar() or 0)

        # DAU trend (last 14 days) from student_registry
        trend_start = today - timedelta(days=13)
        registry_daily = (
            session.query(
                func.date(StudentRegistry.last_seen_at).label("day"),
                func.count(StudentRegistry.roll_number),
            )
            .filter(func.date(StudentRegistry.last_seen_at) >= trend_start.isoformat())
            .group_by(func.date(StudentRegistry.last_seen_at))
            .all()
        )

        daily_map = {}
        for row in registry_daily:
            day_key = str(row[0])
            daily_map[day_key] = int(row[1])

        dau_trend = []
        for offset in range(14):
            day_key = (trend_start + timedelta(days=offset)).isoformat()
            dau_trend.append({"date": day_key, "activeUsers": daily_map.get(day_key, 0)})

    return {
        "dau": dau,
        "wau": wau,
        "mau": mau,
        "totalUsers": total_users,
        "dauPercent": round((dau / total_users) * 100, 1) if total_users > 0 else 0.0,
        "wauPercent": round((wau / total_users) * 100, 1) if total_users > 0 else 0.0,
        "mauPercent": round((mau / total_users) * 100, 1) if total_users > 0 else 0.0,
        "dauTrend": dau_trend,
    }


# ---------------------------------------------------------------------------
# 3. Subject Request Board
# ---------------------------------------------------------------------------

def get_subject_request_analytics() -> dict:
    """Subject requests ranked by demand, with requester names."""
    with SessionLocal() as session:
        total_requests = int(session.query(func.count(SubjectRequest.id)).scalar() or 0)
        unique_requesters = int(
            session.query(func.count(distinct(SubjectRequest.user_identifier))).scalar() or 0
        )

        demand_rows = (
            session.query(
                SubjectRequest.subject_code,
                func.max(SubjectRequest.subject_name).label("subject_name"),
                func.max(SubjectRequest.subject_abbreviation).label("abbreviation"),
                func.count(SubjectRequest.id).label("request_count"),
                func.count(distinct(SubjectRequest.user_identifier)).label("unique_users"),
            )
            .group_by(SubjectRequest.subject_code)
            .order_by(func.count(SubjectRequest.id).desc())
            .all()
        )

        # Get requester roll numbers and names per subject
        all_requests = session.query(SubjectRequest.subject_code, SubjectRequest.user_identifier).all()
        requesters_by_code = {}
        for req in all_requests:
            code = req.subject_code
            user = req.user_identifier
            if code not in requesters_by_code:
                requesters_by_code[code] = set()
            if user:
                requesters_by_code[code].add(user)

        # Resolve roll numbers to names AND program
        all_roll_numbers = set()
        for rolls in requesters_by_code.values():
            all_roll_numbers.update(rolls)

        roll_to_name = {}
        roll_to_program = {}
        if all_roll_numbers:
            # Firebase-linked users: get display name
            name_rows = (
                session.query(PortalCredential.roll_number, User.display_name)
                .join(User, User.id == PortalCredential.user_id)
                .filter(PortalCredential.roll_number.in_(list(all_roll_numbers)))
                .all()
            )
            for row in name_rows:
                if row.roll_number and row.display_name:
                    roll_to_name[row.roll_number] = row.display_name

            # All users: get program from student_registry
            registry_rows = (
                session.query(StudentRegistry.roll_number, StudentRegistry.display_name, StudentRegistry.program)
                .filter(StudentRegistry.roll_number.in_(list(all_roll_numbers)))
                .all()
            )
            for row in registry_rows:
                if row.roll_number:
                    # Prefer Firebase display_name, fallback to registry
                    if row.roll_number not in roll_to_name and row.display_name:
                        roll_to_name[row.roll_number] = row.display_name
                    if row.program:
                        roll_to_program[row.roll_number] = row.program

        demand_board = []
        for row in demand_rows:
            code = row.subject_code
            requester_rolls = list(requesters_by_code.get(code, []))
            requesters = [roll_to_name.get(r, r) for r in requester_rolls]

            # Derive program for this subject from its requesters' programs
            programs_for_subject = [
                roll_to_program[r] for r in requester_rolls if r in roll_to_program
            ]
            # Most common program among requesters
            subject_program = None
            if programs_for_subject:
                subject_program = max(set(programs_for_subject), key=programs_for_subject.count)

            demand_board.append({
                "subjectCode": code,
                "subjectName": row.subject_name,
                "abbreviation": row.abbreviation,
                "requestCount": int(row.request_count),
                "uniqueUsers": int(row.unique_users),
                "requesters": [
                    {"roll": r, "name": roll_to_name.get(r) or None}
                    for r in requester_rolls
                ],
                "program": subject_program,
            })

    return {
        "totalRequests": total_requests,
        "uniqueRequesters": unique_requesters,
        "demandBoard": demand_board,
    }


# ---------------------------------------------------------------------------
# 4. College Interest Signups
# ---------------------------------------------------------------------------

def get_college_interest_analytics() -> dict:
    """College interest signups with college-wise breakdown."""
    with SessionLocal() as session:
        total_signups = int(session.query(func.count(CollegeInterest.id)).scalar() or 0)

        college_rows = (
            session.query(
                CollegeInterest.college_name,
                func.count(CollegeInterest.id).label("count"),
            )
            .group_by(CollegeInterest.college_name)
            .order_by(func.count(CollegeInterest.id).desc())
            .all()
        )

        college_breakdown = [
            {"collegeName": row.college_name, "count": int(row.count)}
            for row in college_rows
        ]

        # Recent signups (last 20)
        recent_rows = (
            session.query(CollegeInterest)
            .order_by(CollegeInterest.created_at.desc())
            .limit(20)
            .all()
        )

        recent_signups = [
            {
                "name": row.name,
                "email": row.email,
                "collegeName": row.college_name,
                "message": row.message,
                "createdAt": row.created_at.isoformat() if row.created_at else None,
            }
            for row in recent_rows
        ]

    return {
        "totalSignups": total_signups,
        "collegeBreakdown": college_breakdown,
        "recentSignups": recent_signups,
    }


# ---------------------------------------------------------------------------
# 5. Feature Adoption Rates
# ---------------------------------------------------------------------------

def get_feature_adoption_rates() -> dict:
    """What % of total students have used each feature at least once."""
    with SessionLocal() as session:
        total_users = int(session.query(func.count(StudentRegistry.roll_number)).scalar() or 0)
        if total_users == 0:
            return {"totalUsers": 0, "features": []}

        # Mail faculty users
        mail_users = int(
            session.query(func.count(distinct(FeatureUsageEvent.user_identifier)))
            .filter(FeatureUsageEvent.feature_name == "mail_faculty")
            .filter(FeatureUsageEvent.user_identifier.isnot(None))
            .scalar() or 0
        )

        # Marks users
        marks_users = int(
            session.query(func.count(distinct(FeatureUsageEvent.user_identifier)))
            .filter(FeatureUsageEvent.feature_name == "consolidated_marks")
            .filter(FeatureUsageEvent.user_identifier.isnot(None))
            .scalar() or 0
        )

        # History users
        history_users = int(
            session.query(func.count(distinct(FeatureUsageEvent.user_identifier)))
            .filter(FeatureUsageEvent.feature_name == "attendance_history")
            .filter(FeatureUsageEvent.user_identifier.isnot(None))
            .scalar() or 0
        )

        # StudyMe users
        studyme_users = int(
            session.query(func.count(distinct(StudyMeEvent.user_name)))
            .filter(StudyMeEvent.user_name.isnot(None))
            .scalar() or 0
        )

        # Rating users
        rating_users = int(
            session.query(func.count(distinct(UserRating.user_identifier)))
            .scalar() or 0
        )

        features = [
            {"feature": "Attendance History", "uniqueUsers": history_users, "adoptionPercent": round((history_users / total_users) * 100, 1)},
            {"feature": "Consolidated Marks", "uniqueUsers": marks_users, "adoptionPercent": round((marks_users / total_users) * 100, 1)},
            {"feature": "Mail Faculty", "uniqueUsers": mail_users, "adoptionPercent": round((mail_users / total_users) * 100, 1)},
            {"feature": "StudyMe", "uniqueUsers": studyme_users, "adoptionPercent": round((studyme_users / total_users) * 100, 1)},
            {"feature": "App Rating", "uniqueUsers": rating_users, "adoptionPercent": round((rating_users / total_users) * 100, 1)},
        ]

        features.sort(key=lambda x: -x["adoptionPercent"])

    return {
        "totalUsers": total_users,
        "features": features,
    }


# ---------------------------------------------------------------------------
# 6. User Retention (Day-1, Day-7)
# ---------------------------------------------------------------------------

def get_retention_metrics() -> dict:
    """Day-1 and Day-7 retention based on user signup date vs activity."""
    today = date.today()

    with SessionLocal() as session:
        # Users who signed up 1-7 days ago (cohort for Day-1 retention)
        day1_cohort_date = today - timedelta(days=1)
        day7_cohort_date = today - timedelta(days=7)

        # Day-1: users who signed up yesterday and had activity today
        users_signed_up_yesterday = (
            session.query(User.firebase_uid)
            .filter(func.date(User.created_at) == day1_cohort_date.isoformat())
            .all()
        )
        yesterday_signup_count = len(users_signed_up_yesterday)

        # Check if any of these users had activity today (via portal_credentials roll_number → feature events)
        if yesterday_signup_count > 0:
            yesterday_uids = [row[0] for row in users_signed_up_yesterday]
            # Get roll numbers for these users
            roll_numbers = (
                session.query(PortalCredential.roll_number)
                .join(User, User.id == PortalCredential.user_id)
                .filter(User.firebase_uid.in_(yesterday_uids))
                .all()
            )
            roll_set = {r[0].upper() for r in roll_numbers if r[0]}

            if roll_set:
                returned_count = int(
                    session.query(func.count(distinct(FeatureUsageEvent.user_identifier)))
                    .filter(FeatureUsageEvent.user_identifier.in_(roll_set))
                    .filter(func.date(FeatureUsageEvent.created_at) == today.isoformat())
                    .scalar() or 0
                )
            else:
                returned_count = 0
        else:
            returned_count = 0

        day1_retention = round((returned_count / yesterday_signup_count) * 100, 1) if yesterday_signup_count > 0 else 0.0

        # Day-7: users who signed up 7 days ago and had any activity in last 7 days
        users_signed_up_7days_ago = (
            session.query(User.firebase_uid)
            .filter(func.date(User.created_at) == day7_cohort_date.isoformat())
            .all()
        )
        day7_signup_count = len(users_signed_up_7days_ago)

        if day7_signup_count > 0:
            day7_uids = [row[0] for row in users_signed_up_7days_ago]
            roll_numbers_7 = (
                session.query(PortalCredential.roll_number)
                .join(User, User.id == PortalCredential.user_id)
                .filter(User.firebase_uid.in_(day7_uids))
                .all()
            )
            roll_set_7 = {r[0].upper() for r in roll_numbers_7 if r[0]}

            if roll_set_7:
                returned_7_count = int(
                    session.query(func.count(distinct(FeatureUsageEvent.user_identifier)))
                    .filter(FeatureUsageEvent.user_identifier.in_(roll_set_7))
                    .filter(func.date(FeatureUsageEvent.created_at) >= (day7_cohort_date + timedelta(days=1)).isoformat())
                    .scalar() or 0
                )
            else:
                returned_7_count = 0
        else:
            returned_7_count = 0

        day7_retention = round((returned_7_count / day7_signup_count) * 100, 1) if day7_signup_count > 0 else 0.0

    return {
        "day1": {
            "cohortSize": yesterday_signup_count,
            "returnedUsers": returned_count,
            "retentionPercent": day1_retention,
        },
        "day7": {
            "cohortSize": day7_signup_count,
            "returnedUsers": returned_7_count,
            "retentionPercent": day7_retention,
        },
    }


# ---------------------------------------------------------------------------
# 7. Peak Usage Hours
# ---------------------------------------------------------------------------

def get_peak_usage_hours() -> dict:
    """Distribution of activity by hour of day (0-23)."""
    with SessionLocal() as session:
        fue_hourly = (
            session.query(
                func.to_char(FeatureUsageEvent.created_at, "HH24").label("hour"),
                func.count(FeatureUsageEvent.id),
            )
            .group_by("hour")
            .all()
        )

        sme_hourly = (
            session.query(
                func.to_char(StudyMeEvent.created_at, "HH24").label("hour"),
                func.count(StudyMeEvent.id),
            )
            .group_by("hour")
            .all()
        )

    hourly_counts = {str(h).zfill(2): 0 for h in range(24)}
    for row in fue_hourly:
        hour_key = str(row[0] or "00").zfill(2)
        hourly_counts[hour_key] = hourly_counts.get(hour_key, 0) + int(row[1])
    for row in sme_hourly:
        hour_key = str(row[0] or "00").zfill(2)
        hourly_counts[hour_key] = hourly_counts.get(hour_key, 0) + int(row[1])

    hours = [{"hour": h, "events": hourly_counts[h]} for h in sorted(hourly_counts.keys())]
    peak_hour = max(hours, key=lambda x: x["events"])["hour"] if hours else "00"

    return {
        "hourlyDistribution": hours,
        "peakHour": peak_hour,
    }


# ---------------------------------------------------------------------------
# 8. Auth Provider Breakdown
# ---------------------------------------------------------------------------

def get_auth_breakdown() -> dict:
    """Google-linked vs Guest-only users from student_registry."""
    with SessionLocal() as session:
        total_students = int(
            session.query(func.count(StudentRegistry.roll_number)).scalar() or 0
        )
        google_linked = int(
            session.query(func.count(StudentRegistry.roll_number))
            .filter(StudentRegistry.has_google_linked == True)
            .scalar() or 0
        )
        guest_only = total_students - google_linked

    return {
        "totalRegisteredUsers": total_students,
        "firebaseLinkedUsers": google_linked,
        "unlinkedUsers": guest_only,
        "firebasePercent": round((google_linked / total_students) * 100, 1) if total_students > 0 else 0.0,
    }


# ---------------------------------------------------------------------------
# Notice Board Analytics
# ---------------------------------------------------------------------------

def get_notice_analytics() -> dict:
    """Notice board metrics: total notices, category breakdown, views, bookmarks."""
    from db.models.notice import Notice
    from db.models.user_notice import UserNotice

    with SessionLocal() as session:
        total_notices = int(session.query(func.count(Notice.notice_id)).filter(Notice.processing_status == "done").scalar() or 0)
        failed_notices = int(session.query(func.count(Notice.notice_id)).filter(Notice.processing_status == "failed").scalar() or 0)

        # Category breakdown
        category_rows = (
            session.query(Notice.category, func.count(Notice.notice_id))
            .filter(Notice.processing_status == "done")
            .group_by(Notice.category)
            .all()
        )
        categories = {str(cat): int(count) for cat, count in category_rows}

        # Total views (sum of viewed_count)
        total_views = int(session.query(func.coalesce(func.sum(Notice.viewed_count), 0)).scalar() or 0)

        # Bookmarks and dismissals
        total_bookmarks = int(
            session.query(func.count(UserNotice.id))
            .filter(UserNotice.bookmarked == True)
            .scalar() or 0
        )
        total_dismissals = int(
            session.query(func.count(UserNotice.id))
            .filter(UserNotice.dismissed == True)
            .scalar() or 0
        )

        # Unique users who opened at least one notice
        unique_readers = int(
            session.query(func.count(distinct(UserNotice.user_id)))
            .filter(UserNotice.opened_at.isnot(None))
            .scalar() or 0
        )

        # Important notices count
        important_count = int(
            session.query(func.count(Notice.notice_id))
            .filter(Notice.processing_status == "done", Notice.is_important == True)
            .scalar() or 0
        )

        # Recent notices (last 7 days)
        week_ago = date.today() - timedelta(days=6)
        recent_count = int(
            session.query(func.count(Notice.notice_id))
            .filter(Notice.processing_status == "done", Notice.portal_date >= week_ago)
            .scalar() or 0
        )

    return {
        "totalNotices": total_notices,
        "failedNotices": failed_notices,
        "recentNotices": recent_count,
        "importantNotices": important_count,
        "totalViews": total_views,
        "totalBookmarks": total_bookmarks,
        "totalDismissals": total_dismissals,
        "uniqueReaders": unique_readers,
        "categories": categories,
    }


# ---------------------------------------------------------------------------
# Combined analytics endpoint
# ---------------------------------------------------------------------------

def get_full_admin_analytics() -> dict:
    """Returns all expanded analytics in one call."""
    return {
        "ratings": get_rating_analytics(),
        "engagement": get_engagement_metrics(),
        "subjectRequests": get_subject_request_analytics(),
        "collegeInterests": get_college_interest_analytics(),
        "featureAdoption": get_feature_adoption_rates(),
        "retention": get_retention_metrics(),
        "peakHours": get_peak_usage_hours(),
        "authBreakdown": get_auth_breakdown(),
        "dailyActivity": get_daily_activity(),
        "studentMetrics": get_student_metrics(),
        "guestEngagement": get_guest_engagement(),
        "pwaInstalls": get_pwa_install_metrics(),
        "notices": get_notice_analytics(),
        "waitlist": get_waitlist_analytics(),
    }


def get_student_metrics() -> dict:
    """Student-centric metrics from the student registry."""
    today = date.today()

    with SessionLocal() as session:
        total_students = int(session.query(func.count(StudentRegistry.roll_number)).scalar() or 0)
        google_linked = int(
            session.query(func.count(StudentRegistry.roll_number))
            .filter(StudentRegistry.has_google_linked == True)
            .scalar() or 0
        )
        guest_only = int(
            session.query(func.count(StudentRegistry.roll_number))
            .filter(StudentRegistry.has_google_linked == False)
            .scalar() or 0
        )
        new_today = int(
            session.query(func.count(StudentRegistry.roll_number))
            .filter(func.date(StudentRegistry.first_seen_at) == today.isoformat())
            .scalar() or 0
        )
        active_today = int(
            session.query(func.count(StudentRegistry.roll_number))
            .filter(func.date(StudentRegistry.last_seen_at) == today.isoformat())
            .scalar() or 0
        )

        # Data integrity: find actual duplicates — same email registered multiple times
        # (not users without email, which would be wrongly counted as duplicates)
        total_user_rows = int(session.query(func.count(User.id)).scalar() or 0)
        unique_emails = int(
            session.query(func.count(distinct(User.email)))
            .filter(User.email.isnot(None))
            .scalar() or 0
        )
        # Users with no email are guests, not duplicates — count them separately
        no_email_count = int(
            session.query(func.count(User.id))
            .filter(User.email.is_(None))
            .scalar() or 0
        )
        # True duplicates: emails that appear more than once
        from sqlalchemy import text
        dup_result = session.execute(
            text(
                "SELECT COUNT(*) FROM ("
                "  SELECT email FROM users WHERE email IS NOT NULL"
                "  GROUP BY email HAVING COUNT(*) > 1"
                ") AS dups"
            )
        ).scalar()
        duplicate_email_count = int(dup_result or 0)

    return {
        "totalStudents": total_students,
        "googleLinked": google_linked,
        "guestOnly": guest_only,
        "newToday": new_today,
        "activeToday": active_today,
        "dataIntegrity": {
            "totalUserRows": total_user_rows,
            "uniqueEmails": unique_emails,
            "usersWithoutEmail": no_email_count,
            "duplicateEmailsDetected": duplicate_email_count,
        },
    }


def get_daily_activity() -> dict:
    """Daily platform activity (combined events) for the last 30 days — real data for charts."""
    today = date.today()
    start = today - timedelta(days=29)

    with SessionLocal() as session:
        fue_daily = (
            session.query(
                func.date(FeatureUsageEvent.created_at).label("day"),
                func.count(FeatureUsageEvent.id),
            )
            .filter(func.date(FeatureUsageEvent.created_at) >= start.isoformat())
            .group_by(func.date(FeatureUsageEvent.created_at))
            .all()
        )
        sme_daily = (
            session.query(
                StudyMeEvent.event_date.label("day"),
                func.count(StudyMeEvent.id),
            )
            .filter(StudyMeEvent.event_date >= start)
            .group_by(StudyMeEvent.event_date)
            .all()
        )

        # Hourly distribution (for API activity chart)
        fue_hourly = (
            session.query(
                func.to_char(FeatureUsageEvent.created_at, "HH24").label("hour"),
                func.count(FeatureUsageEvent.id),
            )
            .filter(func.date(FeatureUsageEvent.created_at) >= start.isoformat())
            .group_by("hour")
            .all()
        )
        sme_hourly = (
            session.query(
                func.to_char(StudyMeEvent.created_at, "HH24").label("hour"),
                func.count(StudyMeEvent.id),
            )
            .filter(StudyMeEvent.event_date >= start)
            .group_by("hour")
            .all()
        )

    # Merge daily
    daily_map = {}
    for row in fue_daily:
        daily_map[str(row[0])] = daily_map.get(str(row[0]), 0) + int(row[1])
    for row in sme_daily:
        daily_map[str(row[0])] = daily_map.get(str(row[0]), 0) + int(row[1])

    daily_series = []
    for offset in range(30):
        day_key = (start + timedelta(days=offset)).isoformat()
        daily_series.append({"date": day_key, "events": daily_map.get(day_key, 0)})

    # Merge hourly
    hourly_map = {str(h).zfill(2): 0 for h in range(24)}
    for row in fue_hourly:
        hourly_map[str(row[0] or "00").zfill(2)] += int(row[1])
    for row in sme_hourly:
        hourly_map[str(row[0] or "00").zfill(2)] += int(row[1])

    hourly_series = [{"hour": h, "events": hourly_map[h]} for h in sorted(hourly_map.keys())]

    return {
        "dailySeries": daily_series,
        "hourlySeries": hourly_series,
    }


def get_guest_engagement() -> dict:
    """Metrics from guest/demo explore users — measures interest from non-registered visitors."""
    with SessionLocal() as session:
        # StudyMe events from demo users (user_name = 'Demo Student')
        guest_studyme_events = int(
            session.query(func.count(StudyMeEvent.id))
            .filter(StudyMeEvent.user_name == "Demo Student")
            .scalar() or 0
        )

        # Unique days with demo activity
        guest_active_days = int(
            session.query(func.count(distinct(StudyMeEvent.event_date)))
            .filter(StudyMeEvent.user_name == "Demo Student")
            .scalar() or 0
        )

    return {
        "guestStudyMeEvents": guest_studyme_events,
        "guestActiveDays": guest_active_days,
    }


def get_pwa_install_metrics() -> dict:
    """PWA install counts by platform."""
    from db.models.pwa_install import PwaInstall

    with SessionLocal() as session:
        total = int(session.query(func.count(PwaInstall.id)).scalar() or 0)
        android = int(
            session.query(func.count(PwaInstall.id))
            .filter(PwaInstall.device_platform == "android")
            .scalar() or 0
        )
        ios = int(
            session.query(func.count(PwaInstall.id))
            .filter(PwaInstall.device_platform == "ios")
            .scalar() or 0
        )
        desktop = int(
            session.query(func.count(PwaInstall.id))
            .filter(PwaInstall.device_platform == "desktop")
            .scalar() or 0
        )

    return {
        "total": total,
        "android": android,
        "ios": ios,
        "desktop": desktop,
    }


def get_waitlist_analytics() -> dict:
    """Premium waitlist signups — total count, recent entries, and daily trend (last 14 days)."""
    from db.models.premium_waitlist import PremiumWaitlist

    today = date.today()
    window_start = today - timedelta(days=13)

    with SessionLocal() as session:
        total = int(session.query(func.count(PremiumWaitlist.id)).scalar() or 0)

        # Daily counts for the last 14 days
        daily_rows = (
            session.query(
                func.date(PremiumWaitlist.joined_at).label("day"),
                func.count(PremiumWaitlist.id).label("count"),
            )
            .filter(func.date(PremiumWaitlist.joined_at) >= window_start.isoformat())
            .group_by(func.date(PremiumWaitlist.joined_at))
            .all()
        )
        daily_map: dict[str, int] = {str(row.day): int(row.count) for row in daily_rows}
        trend = []
        for i in range(14):
            d = (window_start + timedelta(days=i)).isoformat()
            trend.append({"date": d, "count": daily_map.get(d, 0)})

        # 10 most recent signups
        recent_rows = (
            session.query(PremiumWaitlist)
            .order_by(PremiumWaitlist.joined_at.desc())
            .limit(10)
            .all()
        )
        recent = [
            {
                "rollNumber": row.roll_number,
                "joinedAt": row.joined_at.isoformat() if row.joined_at else None,
            }
            for row in recent_rows
        ]

        # Joined in the last 7 days
        week_ago = today - timedelta(days=7)
        last7days = int(
            session.query(func.count(PremiumWaitlist.id))
            .filter(func.date(PremiumWaitlist.joined_at) >= week_ago.isoformat())
            .scalar() or 0
        )

    return {
        "total": total,
        "last7days": last7days,
        "trend": trend,
        "recent": recent,
    }
