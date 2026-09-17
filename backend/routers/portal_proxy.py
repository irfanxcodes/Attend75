"""
Portal proxy endpoint — Oracle server acts as a CORS proxy for the college portal.

The browser can't hit the portal directly (HTTP from HTTPS = mixed content blocked).
Oracle can hit login.aspx fine (only authenticated pages after login are blocked).

GET  /portal-proxy/page?path=login.aspx     — fetch a portal page
POST /portal-proxy/login                    — submit login form, return cookies as JSON
GET  /portal-proxy/attendance               — fetch attendance with provided cookies
GET  /portal-proxy/courses                  — fetch courses page with provided cookies
"""
import logging
import os

import requests
from bs4 import BeautifulSoup
from fastapi import APIRouter, Header, Query, Request
from fastapi.responses import JSONResponse

from services.captcha_solver import CaptchaSolveError, fetch_and_solve

router = APIRouter(prefix="/portal-proxy", tags=["portal-proxy"])
logger = logging.getLogger(__name__)

PORTAL_BASE = os.getenv("PORTAL_BASE_URL", "http://111.93.16.209/sz").rstrip("/")
TIMEOUT = 15


def _make_session(cookie_header: str = "") -> requests.Session:
    s = requests.Session()
    s.headers.update({
        "User-Agent": (
            "Mozilla/5.0 (Linux; Android 8.0.0; SM-G955U Build/R16NW) "
            "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Mobile Safari/537.36"
        ),
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
    })
    if cookie_header:
        for pair in cookie_header.split(";"):
            pair = pair.strip()
            if "=" in pair:
                name, _, value = pair.partition("=")
                s.cookies.set(name.strip(), value.strip(), domain="111.93.16.209")
    return s


def _build_url(path: str) -> str:
    return f"{PORTAL_BASE}/{path.lstrip('/')}"


@router.get("/page")
async def proxy_page(path: str = Query(...)):
    """Fetch a portal page and return HTML."""
    s = _make_session()
    try:
        resp = s.get(_build_url(path), timeout=TIMEOUT)
        return JSONResponse({"html": resp.text, "status": resp.status_code})
    except Exception as e:
        return JSONResponse({"error": str(e)}, status_code=502)


@router.post("/login")
async def proxy_login(request: Request):
    """
    Submit login form to portal.
    Body: { roll_number, password }
    Returns: { success, cookies, student_name } or { error }
    """
    body = await request.json()
    roll = (body.get("roll_number") or "").strip().upper()
    password = (body.get("password") or "").strip()

    if not roll or not password:
        return JSONResponse({"error": "roll_number and password required"}, status_code=400)

    s = _make_session()

    try:
        # GET login page
        login_url = _build_url("login.aspx")
        login_resp = s.get(login_url, timeout=TIMEOUT)
        login_resp.raise_for_status()

        soup = BeautifulSoup(login_resp.text, "html.parser")
        fields = {
            inp.get("name", "").strip(): inp.get("value", "")
            for inp in soup.find_all("input", {"type": "hidden"})
            if inp.get("name", "").strip()
        }

        # Solve captcha
        captcha_img = soup.find("img", {"id": "captchaImage"})
        if captcha_img:
            src = (captcha_img.get("src") or "").strip()
            if src:
                from urllib.parse import urljoin
                captcha_url = urljoin(login_url, src)
                try:
                    captcha_text = fetch_and_solve(captcha_url, s)
                    fields["txtCaptcha"] = captcha_text
                    logger.info("[portal-proxy] Captcha solved: %s", captcha_text)
                except CaptchaSolveError as e:
                    logger.warning("[portal-proxy] Captcha solve failed: %s", e)

        fields.update({
            "txtLogin": roll,
            "txtPassword": password,
            "bl": "Student",
            "btnSubmit": "Submit",
        })

        # POST login — don't follow redirect to Index.aspx (it's blocked)
        post_resp = s.post(
            login_url, data=fields, timeout=TIMEOUT,
            allow_redirects=False,
            headers={"Referer": login_url, "Origin": "http://111.93.16.209"},
        )

        if post_resp.status_code == 302:
            # Success — capture all cookies from the session
            cookies = {c.name: c.value for c in s.cookies}
            has_auth = bool({"UserID", "CurrentSession", "Enrolno"}.intersection(cookies))

            if not has_auth:
                return JSONResponse({
                    "success": False,
                    "error": "Login appeared to succeed but auth cookies missing",
                    "error_code": "LOGIN_FAILED",
                })

            student_name = cookies.get("Name", "").replace("+", " ").strip() or roll
            return JSONResponse({
                "success": True,
                "cookies": cookies,
                "student_name": student_name,
                "program_sn": cookies.get("ProgramSN", ""),
                "program_full": cookies.get("Program", "").replace("+", " ").strip(),
            })

        # 200 = login failed (wrong credentials/captcha)
        err_soup = BeautifulSoup(post_resp.text, "html.parser")
        err_el = err_soup.find(class_="help-block") or err_soup.find(class_="text-danger")
        err_msg = err_el.get_text(strip=True) if err_el else "Login failed"
        err_lower = err_msg.lower()

        if "password" in err_lower or "incorrect" in err_lower:
            code = "INCORRECT_PASSWORD"
        elif "invalid" in err_lower or "username" in err_lower or "roll" in err_lower:
            code = "INVALID_USERNAME"
        else:
            code = "LOGIN_FAILED"

        return JSONResponse({"success": False, "error": err_msg, "error_code": code})

    except requests.Timeout:
        return JSONResponse({"error": "Portal timed out", "error_code": "PORTAL_TIMEOUT"}, status_code=502)
    except Exception as e:
        logger.exception("[portal-proxy] Login error")
        return JSONResponse({"error": str(e), "error_code": "PORTAL_UNREACHABLE"}, status_code=502)


@router.get("/attendance")
async def proxy_attendance(x_portal_cookies: str = Header(default="")):
    """
    Fetch AttendanceDashboard.aspx using provided cookies.
    Cookies come from the /login endpoint response.
    """
    if not x_portal_cookies:
        return JSONResponse({"error": "X-Portal-Cookies header required"}, status_code=400)

    s = _make_session(x_portal_cookies)
    try:
        url = _build_url("AttendanceDashboard.aspx")
        resp = s.get(url, timeout=TIMEOUT, headers={"Referer": _build_url("Index.aspx")})

        # Fallback to old portal if new dashboard is empty
        if "ad-card" not in resp.text and "<table" not in resp.text:
            fallback = s.get(_build_url("CommonS.aspx?qs=ap"), timeout=TIMEOUT,
                             headers={"Referer": _build_url("Index.aspx")})
            if "ad-card" in fallback.text or "<table" in fallback.text:
                return JSONResponse({"html": fallback.text, "status": fallback.status_code})

        return JSONResponse({"html": resp.text, "status": resp.status_code})
    except requests.Timeout:
        return JSONResponse({"error": "Portal timed out", "error_code": "PORTAL_TIMEOUT"}, status_code=502)
    except Exception as e:
        return JSONResponse({"error": str(e), "error_code": "PORTAL_UNREACHABLE"}, status_code=502)


@router.get("/courses")
async def proxy_courses(
    semester_id: str = Query(default=""),
    x_portal_cookies: str = Header(default=""),
):
    """Fetch rc/cr.aspx and optionally switch semester."""
    s = _make_session(x_portal_cookies)
    try:
        courses_url = _build_url("rc/cr.aspx")
        resp = s.get(courses_url, timeout=TIMEOUT, headers={"Referer": _build_url("Index.aspx")})
        html = resp.text

        if semester_id:
            from scrapers.portal_scraper import PortalScraper
            scraper = PortalScraper()
            scraper.session = s
            switched = scraper._switch_semester_on_page(html, courses_url, semester_id)
            if switched:
                html = switched

        return JSONResponse({"html": html, "status": resp.status_code})
    except requests.Timeout:
        return JSONResponse({"error": "Portal timed out", "error_code": "PORTAL_TIMEOUT"}, status_code=502)
    except Exception as e:
        return JSONResponse({"error": str(e), "error_code": "PORTAL_UNREACHABLE"}, status_code=502)
