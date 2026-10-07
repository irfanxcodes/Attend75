#!/usr/bin/env python3
"""
Test if session cookies are being preserved correctly through the proxy
"""
from scrapers.portal_scraper import PortalScraper
from bs4 import BeautifulSoup
from urllib.parse import urljoin

def test_session_flow():
    scraper = PortalScraper()
    login_url = scraper._build_url(scraper.login_path)
    
    print(f"\n{'='*80}")
    print("Testing session cookie flow")
    print(f"{'='*80}\n")
    
    # Step 1: Load login page
    print("📥 Step 1: Loading login page...")
    login_page = scraper.session.get(login_url, timeout=30)
    print(f"   Cookies after page load: {dict(scraper.session.cookies)}")
    
    # Step 2: Load captcha
    print("\n🔢 Step 2: Loading captcha...")
    soup = BeautifulSoup(login_page.text, "html.parser")
    captcha_img = soup.find("img", {"id": "captchaImage"})
    img_src = captcha_img.get("src", "").strip()
    captcha_url = urljoin(login_url, img_src)
    
    captcha_response = scraper.session.get(captcha_url, timeout=10)
    print(f"   Cookies after captcha load: {dict(scraper.session.cookies)}")
    
    from services.captcha_solver import extract_from_svg
    captcha_text = extract_from_svg(captcha_response.content)
    print(f"   Captcha text: {captcha_text}")
    
    # Step 3: Submit form
    print("\n🚀 Step 3: Submitting form...")
    payload = scraper._extract_hidden_form_fields(login_page.text)
    payload.update({
        "txtLogin": "24FMUCHH014059",
        "txtPassword": scraper._normalize_password("Hulk@112233"),
        "bl": "Student",
        "btnSubmit": "Submit",
        "txtCaptcha": captcha_text,
    })
    payload.update(scraper._get_student_radio_payload(login_page.text))
    
    print(f"   Cookies before POST: {dict(scraper.session.cookies)}")
    
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
    
    print(f"   Cookies after POST: {dict(scraper.session.cookies)}")
    print(f"   Response status: {response.status_code}")
    
    # Check result
    if "incorrect security code" in response.text.lower():
        print("\n❌ Captcha was rejected")
        
        # Check if ASP.NET session changed
        print("\n🔍 Checking session state...")
        print(f"   ASP.NET_SessionId: {scraper.session.cookies.get('ASP.NET_SessionId', 'NOT SET')}")
        
    elif "txtLogin" not in response.text:
        print("\n✅ Login succeeded!")
    else:
        print("\n❓ Unexpected response")
        
        # Look for other errors
        if "invalid" in response.text.lower():
            print("   Contains 'invalid' in response")
        if "incorrect" in response.text.lower():
            print("   Contains 'incorrect' in response")
    
    print(f"\n{'='*80}\n")

if __name__ == "__main__":
    test_session_flow()
