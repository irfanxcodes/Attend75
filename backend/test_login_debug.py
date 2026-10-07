#!/usr/bin/env python3
"""
Deep diagnostic for login issues - captures actual portal responses
"""
import sys
import logging
from scrapers.portal_scraper import PortalScraper
from bs4 import BeautifulSoup

logging.basicConfig(level=logging.INFO)

def deep_login_test(roll: str, password: str):
    scraper = PortalScraper()
    login_url = scraper._build_url(scraper.login_path)
    
    print(f"\n{'='*80}")
    print("DEEP LOGIN DIAGNOSTIC")
    print(f"{'='*80}\n")
    
    try:
        # Step 1: Load login page
        print("📥 Step 1: Loading login page...")
        login_page = scraper.session.get(login_url, timeout=30)
        print(f"   Status: {login_page.status_code}")
        print(f"   Size: {len(login_page.text)} bytes")
        
        # Step 2: Extract form fields
        print("\n📝 Step 2: Extracting form fields...")
        payload = scraper._extract_hidden_form_fields(login_page.text)
        print(f"   Hidden fields: {list(payload.keys())}")
        
        # Step 3: Solve captcha
        print("\n🔢 Step 3: Solving captcha...")
        soup = BeautifulSoup(login_page.text, "html.parser")
        captcha_img = soup.find("img", {"id": "captchaImage"})
        if captcha_img:
            from urllib.parse import urljoin
            img_src = captcha_img.get("src", "").strip()
            captcha_url = urljoin(login_url, img_src)
            print(f"   Captcha URL: {captcha_url}")
            
            from services.captcha_solver import fetch_and_solve
            try:
                captcha_text = fetch_and_solve(captcha_url, scraper.session)
                print(f"   ✅ Captcha solved: {captcha_text}")
                payload["txtCaptcha"] = captcha_text
            except Exception as e:
                print(f"   ❌ Captcha failed: {e}")
        else:
            print("   ⚠️  No captcha found on page")
        
        # Step 4: Build payload
        print("\n📦 Step 4: Building login payload...")
        payload.update({
            "txtLogin": roll.strip().upper(),
            "txtPassword": scraper._normalize_password(password),
            "bl": "Student",
            "btnSubmit": "Submit",
        })
        payload.update(scraper._get_student_radio_payload(login_page.text))
        print(f"   Payload keys: {list(payload.keys())}")
        print(f"   Roll: {payload.get('txtLogin')}")
        print(f"   Captcha: {payload.get('txtCaptcha', 'NOT SET')}")
        
        # Step 5: Submit login
        print("\n🚀 Step 5: Submitting login...")
        response = scraper.session.post(
            login_url,
            data=payload,
            timeout=30,
            allow_redirects=False,
            headers={
                "Referer": login_url,
                "Origin": scraper.base_url.rsplit("/", 1)[0],
            },
        )
        print(f"   Status: {response.status_code}")
        print(f"   Size: {len(response.text)} bytes")
        
        # Step 6: Check for redirect
        if response.status_code in (301, 302, 303, 307, 308):
            location = response.headers.get("Location", "")
            print(f"   🔄 Redirect to: {location}")
            
            redirect_url = scraper._build_url(location)
            response = scraper.session.get(redirect_url, timeout=30, allow_redirects=True)
            print(f"   Followed redirect - Status: {response.status_code}")
        
        # Step 7: Analyze response
        print("\n🔍 Step 7: Analyzing response...")
        soup = BeautifulSoup(response.text, "html.parser")
        
        # Check if still on login page
        has_login_form = soup.find("input", {"name": "txtLogin"}) is not None
        print(f"   Still on login page: {has_login_form}")
        
        if has_login_form:
            # Look for error messages
            print("\n❌ LOGIN FAILED - Looking for error messages:")
            
            # Common error containers
            error_labels = soup.find_all("span", {"class": "error"})
            for label in error_labels:
                if label.text.strip():
                    print(f"   • Error span: {label.text.strip()}")
            
            # Look for validation messages
            validation_msgs = soup.find_all("span", id=lambda x: x and "validation" in x.lower())
            for msg in validation_msgs:
                if msg.text.strip():
                    print(f"   • Validation: {msg.text.strip()}")
            
            # Look for alert/message divs
            alerts = soup.find_all("div", class_=lambda x: x and any(k in str(x).lower() for k in ["alert", "error", "message"]))
            for alert in alerts:
                if alert.text.strip():
                    print(f"   • Alert: {alert.text.strip()}")
            
            # Check for specific error text in page
            text_lower = response.text.lower()
            error_keywords = [
                "invalid captcha", "invalid security code", "incorrect captcha",
                "invalid credentials", "invalid password", "incorrect password",
                "invalid username", "invalid roll number", "login failed",
                "please enter valid", "captcha mismatch"
            ]
            
            found_errors = [kw for kw in error_keywords if kw in text_lower]
            if found_errors:
                print(f"\n   🎯 Found error keywords in response:")
                for err in found_errors:
                    print(f"      • {err}")
            
            # Save response for manual inspection
            with open("/tmp/portal_login_response.html", "w") as f:
                f.write(response.text)
            print(f"\n   💾 Full response saved to: /tmp/portal_login_response.html")
            
        else:
            print("\n✅ LOGIN SUCCESSFUL - Not on login page anymore")
            
            # Check what page we're on
            title = soup.find("title")
            if title:
                print(f"   Page title: {title.text.strip()}")
            
            # Check for student name
            student_indicators = soup.find_all("span", id=lambda x: x and "student" in str(x).lower())
            for indicator in student_indicators:
                if indicator.text.strip():
                    print(f"   Student info: {indicator.text.strip()}")
        
        print(f"\n{'='*80}\n")
        
    except Exception as e:
        print(f"\n❌ Exception during test: {type(e).__name__}")
        print(f"   Message: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    if len(sys.argv) < 3:
        print("Usage: python3 test_login_debug.py <roll_number> <password>")
        sys.exit(1)
    
    deep_login_test(sys.argv[1], sys.argv[2])
