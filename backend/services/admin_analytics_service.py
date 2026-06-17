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
        "averageRating": round(average_rating, 2),
        "npsProxyPercent": nps_proxy,
        "distribution": distribution,
        "trend": trend,
    }


# ---------------------------------------------------------------------------
# 2. DAU / WAU / MAU
# ---------------------------------------------------------------------------

def get_engagement_metrics() -> dict:
    """Daily, Weekly, Monthly Active Users based on event activity."""
    today = date.today()
    week_ago = today - timedelta(days=6)
    month_ago = today - timedelta(days=29)

    with SessionLocal() as session:
        # Count distinct users from feature_usage_events
        def _count_active_users(start_date: date) -> int:
            fue_users = (
                session.query(func.count(distinct(FeatureUsageEvent.user_identifier)))
                .filter(FeatureUsageEvent.user_identifier.isnot(None))
                .filter(func.date(FeatureUsageEvent.created_at) >= start_date.isoformat())
                .scalar()
            )
            sme_users = (
                session.query(func.count(distinct(StudyMeEvent.user_name)))
                .filter(StudyMeEvent.user_name.isnot(None))
                .filter(StudyMeEvent.event_date >= start_date)
                .scalar()
            )
            return int(fue_users or 0) + int(sme_users or 0)

        dau = _count_active_users(today)
        wau = _count_active_users(week_ago)
        mau = _count_active_users(month_ago)

        total_users = int(session.query(func.count(User.id)).scalar() or 0)

        # DAU trend (last 14 days)
        trend_start = today - timedelta(days=13)
        fue_daily = (
            session.query(
                func.date(FeatureUsageEvent.created_at).label("day"),
                func.count(distinct(FeatureUsageEvent.user_identifier)),
            )
            .filter(FeatureUsageEvent.user_identifier.isnot(None))
            .filter(func.date(FeatureUsageEvent.created_at) >= trend_start.isoformat())
            .group_by(func.date(FeatureUsageEvent.created_at))
            .all()
        )
        sme_daily = (
            session.query(
                StudyMeEvent.event_date.label("day"),
                func.count(distinct(StudyMeEvent.user_name)),
            )
            .filter(StudyMeEvent.user_name.isnot(None))
            .filter(StudyMeEvent.event_date >= trend_start)
            .group_by(StudyMeEvent.event_date)
            .all()
        )

        daily_map = {}
        for row in fue_daily:
            day_key = str(row[0])
            daily_map[day_key] = daily_map.get(day_key, 0) + int(row[1])
        for row in sme_daily:
            day_key = str(row[0])
            daily_map[day_key] = daily_map.get(day_key, 0) + int(row[1])

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
    """Subject requests ranked by demand."""
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

        demand_board = [
            {
                "subjectCode": row.subject_code,
                "subjectName": row.subject_name,
                "abbreviation": row.abbreviation,
                "requestCount": int(row.request_count),
                "uniqueUsers": int(row.unique_users),
            }
            for row in demand_rows
        ]

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
    """What % of total users have used each feature at least once."""
    with SessionLocal() as session:
        total_users = int(session.query(func.count(User.id)).scalar() or 0)
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
                func.strftime("%H", FeatureUsageEvent.created_at).label("hour"),
                func.count(FeatureUsageEvent.id),
            )
            .group_by("hour")
            .all()
        )

        sme_hourly = (
            session.query(
                func.strftime("%H", StudyMeEvent.created_at).label("hour"),
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

    hours = [{"hour": h, "count": hourly_counts[h]} for h in sorted(hourly_counts.keys())]
    peak_hour = max(hours, key=lambda x: x["count"])["hour"] if hours else "00"

    return {
        "hourlyDistribution": hours,
        "peakHour": peak_hour,
    }


# ---------------------------------------------------------------------------
# 8. Auth Provider Breakdown
# ---------------------------------------------------------------------------

def get_auth_breakdown() -> dict:
    """Firebase (linked credentials) vs Guest-only users."""
    with SessionLocal() as session:
        total_users = int(session.query(func.count(User.id)).scalar() or 0)
        linked_users = int(session.query(func.count(PortalCredential.id)).scalar() or 0)
        unlinked_users = max(total_users - linked_users, 0)

    return {
        "totalRegisteredUsers": total_users,
        "firebaseLinkedUsers": linked_users,
        "unlinkedUsers": unlinked_users,
        "firebasePercent": round((linked_users / total_users) * 100, 1) if total_users > 0 else 0.0,
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
    }
