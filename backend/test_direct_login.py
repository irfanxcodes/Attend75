#!/usr/bin/env python3
"""
Test login DIRECTLY to portal (no proxy) to verify credentials work
"""
import requests
from bs4 import BeautifulSoup
from services.captcha_solver import extract_from_svg
from urllib.parse import urljoin

def test_direct_login(roll: str, password: str):
    session = requests.Session()
    login_url = "http://111.93.16.209/sz/login.aspx"
    
    print(f"\n{'='*80}")
    print("Testing DIRECT login (no Cloudflare Worker proxy)")
    print(f"{'='*80}\n")
    
    try:
        # Step 1: Load login page
        print("📥 Step 1: Loading login page...")
        login_page = session.get(login_url, timeout=30)
        print(f"   Status: {login_page.status_code}")
        print(f"   Cookies: {dict(session.cookies)}")
        
        # Step 2: Extract form fields
        print("\n📝 Step 2: Extracting form fields...")
        soup = BeautifulSoup(login_page.text, "html.parser")
        
        payload = {}
        for inp in soup.find_all("input", {"type": "hidden"}):
            name = inp.get("name")
            value = inp.get("value", "")
            if name:
                payload[name] = value
        
        print(f"   Hidden fields: {list(payload.keys())}")
        
        # Step 3: Solve captcha
        print("\n🔢 Step 3: Solving captcha...")
        captcha_img = soup.find("img", {"id": "captchaImage"})
        img_src = captcha_img.get("src", "").strip()
        captcha_url = urljoin(login_url, img_src)
        
        captcha_response = session.get(captcha_url, timeout=10)
        print(f"   Cookies after captcha: {dict(session.cookies)}")
        
        captcha_text = extract_from_svg(captcha_response.content)
        print(f"   Captcha: {captcha_text}")
        
        # Step 4: Submit
        print("\n🚀 Step 4: Submitting login...")
        payload.update({
            "txtLogin": roll.strip().upper(),
            "txtPassword": password,
            "bl": "Student",
            "btnSubmit": "Submit",
            "txtCaptcha": captcha_text,
        })
        
        # Find which radio button field to use
        student_radio = soup.find("input", {"type": "radio", "value": "Student"})
        if student_radio:
            radio_name = student_radio.get("name")
            if radio_name:
                payload[radio_name] = "Student"
        
        print(f"   Cookies before POST: {dict(session.cookies)}")
        
        response = session.post(
            login_url,
            data=payload,
            timeout=30,
            allow_redirects=False,
            headers={
                "Referer": login_url,
                "Origin": "http://111.93.16.209",
            },
        )
        
        print(f"   Response status: {response.status_code}")
        print(f"   Cookies after POST: {dict(session.cookies)}")
        
        # Step 5: Analyze
        print("\n🔍 Step 5: Analyzing response...")
        
        if response.status_code in (301, 302, 303, 307, 308):
            location = response.headers.get("Location", "")
            print(f"   ✅ REDIRECTED to: {location}")
            print("   This means login was SUCCESSFUL!")
            return True
        elif "txtLogin" not in response.text:
            print("   ✅ NOT on login page anymore")
            print("   Login might be successful!")
            return True
        elif "incorrect security code" in response.text.lower():
            print("   ❌ Captcha rejected")
            return False
        elif "invalid" in response.text.lower() or "incorrect" in response.text.lower():
            print("   ❌ Invalid credentials or other error")
            
            # Find error message
            soup = BeautifulSoup(response.text, "html.parser")
            error_span = soup.find("span", {"id": "lblmsg"})
            if error_span:
                print(f"   Error: {error_span.text.strip()}")
            return False
        else:
            print("   ❓ Unexpected response")
            return False
            
    except Exception as e:
        print(f"\n❌ Exception: {type(e).__name__}: {e}")
        import traceback
        traceback.print_exc()
        return False
    
    finally:
        print(f"\n{'='*80}\n")

if __name__ == "__main__":
    import sys
    if len(sys.argv) < 3:
        print("Usage: python3 test_direct_login.py <roll_number> <password>")
        sys.exit(1)
    
    test_direct_login(sys.argv[1], sys.argv[2])
