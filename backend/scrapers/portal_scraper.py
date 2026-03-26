import os
from urllib.parse import urljoin

import requests
from bs4 import BeautifulSoup


class PortalAuthenticationError(Exception):
    pass


class PortalNetworkError(Exception):
    pass


class PortalScraper:
    def __init__(self, session: requests.Session | None = None):
        self.session = session or requests.Session()
        self.base_url = os.getenv("PORTAL_BASE_URL", "https://portal.example.edu")
        self.login_path = os.getenv("PORTAL_LOGIN_PATH", "/login")

    def login(self, roll_number: str, password: str) -> dict:
        login_url = urljoin(self.base_url, self.login_path)

        try:
            # Load the login page first to receive cookies and optional CSRF token.
            login_page = self.session.get(login_url, timeout=15)
            login_page.raise_for_status()

            payload = {
                "roll_number": roll_number,
                "password": password,
            }

            csrf_token = self._extract_csrf_token(login_page.text)
            if csrf_token:
                payload["csrf_token"] = csrf_token

            response = self.session.post(login_url, data=payload, timeout=15, allow_redirects=True)
            response.raise_for_status()
        except requests.RequestException as exc:
            raise PortalNetworkError("Unable to connect to college portal") from exc

        if self._is_invalid_credentials(response.text):
            raise PortalAuthenticationError("Invalid credentials")

        if not self._is_login_successful(response.text, response.url):
            raise PortalAuthenticationError("Invalid credentials")

        # Attendance scraping will be added here in the next phase.
        return {}

    def _extract_csrf_token(self, html: str) -> str | None:
        soup = BeautifulSoup(html, "html.parser")
        for field_name in ("csrf_token", "csrfmiddlewaretoken", "_token"):
            token_input = soup.find("input", {"name": field_name})
            if token_input and token_input.get("value"):
                return token_input.get("value")
        return None

    def _is_invalid_credentials(self, html: str) -> bool:
        text = html.lower()
        keywords = [
            "invalid credentials",
            "incorrect password",
            "login failed",
            "invalid roll number",
        ]
        return any(keyword in text for keyword in keywords)

    def _is_login_successful(self, html: str, final_url: str) -> bool:
        lower_url = final_url.lower()
        if any(path in lower_url for path in ["dashboard", "attendance", "home"]):
            return True

        text = html.lower()
        logged_in_hints = ["logout", "attendance", "welcome"]
        return any(hint in text for hint in logged_in_hints) and "login" not in lower_url
