#!/usr/bin/env python3
"""
Test script to diagnose login issues by attempting a real portal login.
"""
import sys
import logging
from services.auth_service import login_user
from scrapers.portal_scraper import PortalAuthenticationError, PortalNetworkError, PortalScraper

# Set up detailed logging
logging.basicConfig(
    level=logging.DEBUG,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)

def test_direct_portal_access():
    """Test if portal is accessible directly"""
    print(f"\n{'='*80}")
    print("Testing direct portal accessibility...")
    print(f"{'='*80}\n")
    
    scraper = PortalScraper()
    login_url = scraper._build_url(scraper.login_path)
    
    try:
        import requests
        response = requests.get("http://111.93.16.209/sz/login.aspx", timeout=10)
        print(f"✅ Portal is accessible")
        print(f"   Status Code: {response.status_code}")
        print(f"   Response Size: {len(response.text)} bytes")
        print(f"   Contains login form: {'txtLogin' in response.text}")
        return True
    except Exception as e:
        print(f"❌ Portal is NOT accessible: {e}")
        return False

def test_login_detailed(roll_number: str, password: str):
    """
    Test login with detailed error capture
    """
    print(f"\n{'='*80}")
    print(f"Testing login with detailed error capture...")
    print(f"{'='*80}\n")
    
    from scrapers.portal_scraper import PortalScraper
    scraper = PortalScraper()
    
    try:
        result = scraper.login(roll_number=roll_number, password=password)
        print("✅ Login succeeded!")
        print(f"Student: {result.get('student_name')}")
        print(f"Attendance records: {len(result.get('attendance', []))}")
        return True
    except PortalAuthenticationError as e:
        print(f"❌ Authentication Error: {e.code}")
        print(f"Message: {e}")
    except PortalNetworkError as e:
        print(f"❌ Network Error: {e.code}")
        print(f"Message: {e}")
    except Exception as e:
        print(f"❌ Unexpected Error: {type(e).__name__}")
        print(f"Message: {e}")
        import traceback
        traceback.print_exc()
    
    return False

def test_login(roll_number: str, password: str):
    """
    Test login with the provided credentials
    """
    print(f"\n{'='*80}")
    print(f"Testing login for roll number: {roll_number}")
    print(f"{'='*80}\n")
    
    try:
        result = login_user(
            roll_number=roll_number,
            password=password,
            user_agent="Kiro-LoginTest/1.0"
        )
        
        print(f"\n{'='*80}")
        print("✅ LOGIN SUCCESSFUL!")
        print(f"{'='*80}")
        print(f"\nStudent Name: {result.get('student_name')}")
        print(f"Roll Number: {result.get('roll_number')}")
        print(f"Token: {result.get('token')[:20]}..." if result.get('token') else "No token")
        print(f"Program: {result.get('program_full')}")
        print(f"\nAttendance Summary:")
        
        attendance = result.get('attendance', [])
        if attendance:
            for course in attendance:
                code = course.get('code', 'N/A')
                abbr = course.get('course_abbr', 'N/A')
                attended = course.get('attended', 0)
                sessions = course.get('sessions', 0)
                percent = round((attended / sessions * 100), 1) if sessions > 0 else 0
                print(f"  • {code} ({abbr}): {attended}/{sessions} ({percent}%)")
        else:
            print("  No attendance data found")
        
        print(f"\n{'='*80}\n")
        return True
        
    except PortalAuthenticationError as e:
        print(f"\n{'='*80}")
        print("❌ AUTHENTICATION ERROR")
        print(f"{'='*80}")
        print(f"Error Code: {e.code}")
        print(f"Message: {e}")
        print(f"\nThis means:")
        if e.code == "INVALID_USERNAME":
            print("  → The roll number format is invalid or not recognized by the portal")
        elif e.code == "INCORRECT_PASSWORD":
            print("  → The password is incorrect")
        else:
            print("  → The portal rejected the credentials for an unknown reason")
        print(f"\n{'='*80}\n")
        return False
        
    except PortalNetworkError as e:
        print(f"\n{'='*80}")
        print("❌ NETWORK ERROR")
        print(f"{'='*80}")
        print(f"Error Code: {e.code}")
        print(f"Stage: {getattr(e, 'stage', 'Unknown')}")
        print(f"HTTP Status: {getattr(e, 'http_status', 'N/A')}")
        print(f"Retriable: {getattr(e, 'retriable', 'N/A')}")
        print(f"Message: {e}")
        print(f"\nThis means:")
        if "TIMEOUT" in e.code:
            print("  → The portal/proxy took too long to respond (>30s)")
        elif "BAD_PROXY" in e.code:
            print("  → The proxy returned garbage instead of the actual portal page")
        elif "GITHUB_SCRAPER" in e.code:
            print("  → All IPs failed and GitHub Actions fallback also failed")
        else:
            print("  → Network connectivity issue between our system and the portal")
        print(f"\n{'='*80}\n")
        return False
        
    except Exception as e:
        print(f"\n{'='*80}")
        print("❌ UNEXPECTED ERROR")
        print(f"{'='*80}")
        print(f"Type: {type(e).__name__}")
        print(f"Message: {e}")
        print(f"\n{'='*80}\n")
        import traceback
        traceback.print_exc()
        return False

if __name__ == "__main__":
    import os
    
    # First test portal accessibility
    test_direct_portal_access()
    
    # Then test login
    # Test with credentials from command line args or environment variables
    if len(sys.argv) >= 3:
        roll = sys.argv[1]
        pwd = sys.argv[2]
    else:
        roll = os.getenv('TEST_ROLL_NUMBER', '').strip()
        pwd = os.getenv('TEST_PASSWORD', '').strip()
        
        if not roll or not pwd:
            print("\n❌ No credentials provided!")
            print("\nUsage:")
            print("  python3 test_login.py <roll_number> <password>")
            print("  OR")
            print("  TEST_ROLL_NUMBER=xxx TEST_PASSWORD=yyy python3 test_login.py")
            sys.exit(1)
    
    # Run detailed test first
    test_login_detailed(roll, pwd)
    
    # Then run full service test
    test_login(roll, pwd)
