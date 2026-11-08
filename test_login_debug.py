#!/usr/bin/env python3
"""
Debug script to test portal login flow
"""
import sys
import os

# Add backend to path
sys.path.insert(0, '/Users/ibranansari/Desktop/Attend75/backend')

# Load environment
from dotenv import load_dotenv
load_dotenv('/Users/ibranansari/Desktop/Attend75/backend/.env')

from scrapers.portal_scraper import PortalScraper, PortalAuthenticationError, PortalNetworkError
import logging

logging.basicConfig(level=logging.INFO, format='%(levelname)s: %(message)s')

roll_number = "24FMUCHH014059"
password = "Hulk@112233"

print(f"=" * 80)
print(f"Testing login for: {roll_number}")
print(f"=" * 80)

try:
    scraper = PortalScraper()
    print("\n1. PortalScraper initialized")
    print(f"   Base URL: {scraper.base_url}")
    print(f"   Timeout: {scraper.request_timeout}")
    
    print("\n2. Attempting login...")
    result = scraper.login(roll_number, password)
    
    print("\n✅ Login successful!")
    print(f"   Student: {result.get('student_name')}")
    print(f"   Attendance records: {len(result.get('attendance', []))}")
    print(f"   Overall: {result.get('overall_percentage')}%")
    
except PortalAuthenticationError as e:
    print(f"\n❌ Authentication Error!")
    print(f"   Code: {e.code}")
    print(f"   Message: {str(e)}")
    
except PortalNetworkError as e:
    print(f"\n❌ Network Error!")
    print(f"   Code: {e.code}")
    print(f"   Stage: {e.stage}")
    print(f"   HTTP Status: {e.http_status}")
    print(f"   Message: {str(e)}")
    print(f"   Retriable: {e.retriable}")
    
except Exception as e:
    print(f"\n❌ Unexpected Error!")
    print(f"   Type: {type(e).__name__}")
    print(f"   Message: {str(e)}")
    import traceback
    traceback.print_exc()

print(f"\n" + "=" * 80)
