#!/usr/bin/env python3
"""
Test captcha solving multiple times to check accuracy
"""
from scrapers.portal_scraper import PortalScraper
from services.captcha_solver import fetch_and_solve, extract_from_svg
from urllib.parse import urljoin
from bs4 import BeautifulSoup

def test_captcha_multiple_times(iterations=5):
    scraper = PortalScraper()
    login_url = scraper._build_url(scraper.login_path)
    
    print(f"\n{'='*80}")
    print(f"Testing captcha solver {iterations} times")
    print(f"{'='*80}\n")
    
    successes = 0
    failures = 0
    
    for i in range(1, iterations + 1):
        try:
            # Load login page
            login_page = scraper.session.get(login_url, timeout=30)
            
            # Get captcha
            soup = BeautifulSoup(login_page.text, "html.parser")
            captcha_img = soup.find("img", {"id": "captchaImage"})
            
            if not captcha_img:
                print(f"❌ Attempt {i}: No captcha found on page")
                failures += 1
                continue
            
            img_src = captcha_img.get("src", "").strip()
            captcha_url = urljoin(login_url, img_src)
            
            # Fetch and solve
            response = scraper.session.get(captcha_url, timeout=10)
            svg_content = response.content
            
            captcha_text = extract_from_svg(svg_content)
            
            # Save SVG for inspection
            svg_filename = f"/tmp/captcha_{i}.svg"
            with open(svg_filename, "wb") as f:
                f.write(svg_content)
            
            print(f"✅ Attempt {i}: Solved as '{captcha_text}' (saved to {svg_filename})")
            
            # Try a test login to see if captcha is correct
            payload = scraper._extract_hidden_form_fields(login_page.text)
            payload.update({
                "txtLogin": "TESTUSER123",
                "txtPassword": "wrongpass",
                "bl": "Student",
                "btnSubmit": "Submit",
                "txtCaptcha": captcha_text,
            })
            payload.update(scraper._get_student_radio_payload(login_page.text))
            
            test_response = scraper.session.post(
                login_url,
                data=payload,
                timeout=30,
                allow_redirects=False,
                headers={
                    "Referer": login_url,
                    "Origin": scraper.base_url.rsplit("/", 1)[0],
                },
            )
            
            # Check if captcha was accepted (we expect wrong username/password, not wrong captcha)
            if "incorrect security code" in test_response.text.lower():
                print(f"   ❌ Captcha was WRONG (portal rejected it)")
                failures += 1
            else:
                print(f"   ✅ Captcha was CORRECT (portal accepted it)")
                successes += 1
            
        except Exception as e:
            print(f"❌ Attempt {i}: Error - {e}")
            failures += 1
    
    print(f"\n{'='*80}")
    print(f"Results: {successes} correct, {failures} incorrect")
    print(f"Accuracy: {(successes/(successes+failures)*100):.1f}%" if (successes+failures) > 0 else "N/A")
    print(f"{'='*80}\n")

if __name__ == "__main__":
    test_captcha_multiple_times(10)
