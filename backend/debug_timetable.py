"""
Debug script to analyze timetable matching for roll 24FMUCHH014059
"""
import sys
import json
from collections import Counter, defaultdict

from db.session import SessionLocal
from db.models.notice import Notice
from db.models.push_subscription import PushSubscription
from services.timetable_service import _parse_timetable_pdf, _match_student_classes

# User's correct timetable (ground truth)
CORRECT_SCHEDULE = {
    'Monday': [
        ('12:20', 'MA'),
        ('2:10', 'CSCL'),
        ('3:10', 'OM'),
    ],
    'Tuesday': [
        ('10:25', 'OM'),
        ('12:20', 'MA'),
        ('2:10', 'CSCL'),
        ('3:10', 'BE'),
    ],
    'Wednesday': [
        ('10:25', 'ESE'),
        ('12:20', 'HRM'),
        ('2:10', 'CSCL'),
        ('3:10', 'OM'),
    ],
    'Thursday': [
        ('10:25', 'ESE'),
        ('12:20', 'HRM'),
        ('2:10', 'MA'),
        ('3:10', 'BE'),
    ],
    'Friday': [
        ('10:25', 'ESE'),
        ('12:20', 'HRM'),
        ('2:10', 'BE'),
    ],
}

def main():
    with SessionLocal() as session:
        # Get user's cached subjects
        sub = session.query(PushSubscription).filter(
            PushSubscription.roll_number == "24FMUCHH014059"
        ).first()
        
        if not sub or not sub.cached_subjects_json:
            print("ERROR: No cached subjects found")
            return
            
        student_subjects = json.loads(sub.cached_subjects_json)
        print(f"=== User's Subjects ===")
        for s in student_subjects:
            print(f"  {s['abbr']:6s} - Section: {s['section']}")
        print()
        
        # Get the timetable notice
        notice = session.query(Notice).filter(Notice.notice_id == 49099).first()
        if not notice:
            print("ERROR: Notice 49099 not found")
            return
            
        # Parse the schedule
        schedule = _parse_timetable_pdf(notice.cleaned_text or "")
        print(f"Total classes in notice: {len(schedule)}\n")
        
        # Filter to Semester 5, Section L only
        sem5_l = [c for c in schedule if c.get('semester') == '5' and c.get('section') == 'L']
        print(f"Semester 5, Section L classes: {len(sem5_l)}\n")
        
        # Group by day and show what's in the notice
        by_day = defaultdict(list)
        for cls in sem5_l:
            by_day[cls['day']].append(cls)
        
        print("=== ALL Semester 5, Section L classes in notice ===")
        for day in ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday']:
            classes = sorted(by_day.get(day, []), key=lambda x: x.get('time_sort', ''))
            print(f"\n{day}: ({len(classes)} classes)")
            for c in classes:
                time = c.get('time', '')
                course = c.get('course', '')
                course_key = c.get('course_key', '')
                room = c.get('room', '')
                print(f"  {time:20s} | {course:6s} | key={course_key:10s} | {room}")
        
        # Now try matching with the user's subjects
        print("\n\n=== Matching with user's subjects ===")
        matched = _match_student_classes(schedule, student_subjects)
        print(f"Matched {len(matched)} classes\n")
        
        by_day_matched = defaultdict(list)
        for cls in matched:
            by_day_matched[cls['day']].append(cls)
        
        for day in ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday']:
            classes = sorted(by_day_matched.get(day, []), key=lambda x: x.get('time_sort', ''))
            correct = CORRECT_SCHEDULE.get(day, [])
            
            print(f"\n{day}:")
            print(f"  Matched: {len(classes)}, Should be: {len(correct)}")
            
            if len(classes) != len(correct):
                print(f"  ❌ COUNT MISMATCH!")
            
            for c in classes:
                time = c.get('time', '')[:5]  # Get just HH:MM
                course = c.get('course', '')
                # Check if this time+course is in the correct schedule
                is_correct = any(ct[0] == time and ct[1] == course for ct in correct)
                marker = "✅" if is_correct else "❌"
                print(f"  {marker} {time:5s} | {course:6s}")
        
        # Analyze what's different
        print("\n\n=== Analysis ===")
        # Check if there are multiple "groups" within Section L
        monday_classes = by_day.get('Monday', [])
        monday_times = Counter(c.get('time') for c in monday_classes)
        print(f"Monday time slots with multiple classes:")
        for time, count in monday_times.items():
            if count > 1:
                classes_at_time = [c for c in monday_classes if c.get('time') == time]
                courses = [c.get('course') for c in classes_at_time]
                print(f"  {time}: {courses}")

if __name__ == "__main__":
    main()
