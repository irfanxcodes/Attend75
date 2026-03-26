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
        self.base_url = os.getenv("PORTAL_BASE_URL", "http://111.93.16.209/sz")
        self.login_path = os.getenv("PORTAL_LOGIN_PATH", "/login.aspx")

    def login(self, roll_number: str, password: str) -> dict:
        login_url = urljoin(self.base_url, self.login_path)

        try:
            # Load the login page first to receive cookies and optional CSRF token.
            login_page = self.session.get(login_url, timeout=15)
            login_page.raise_for_status()

            payload = {
                "txtLogin": roll_number,
                "txtPassword": password,
                "bl": "Student",
            }

            csrf_token = self._extract_csrf_token(login_page.text)
            if csrf_token:
                payload["csrf_token"] = csrf_token

            # Portal has Student/Parent radio options; enforce Student selection.
            payload.update(self._get_student_radio_payload(login_page.text))

            response = self.session.post(login_url, data=payload, timeout=15, allow_redirects=True)
            response.raise_for_status()
        except requests.RequestException as exc:
            raise PortalNetworkError("Unable to connect to college portal") from exc

        if self._is_invalid_credentials(response.text):
            raise PortalAuthenticationError("Invalid credentials")

        if not self._is_login_successful(response.text, response.url):
            raise PortalAuthenticationError("Invalid credentials")
        ##attendance scraping
        attendance_url = urljoin(self.base_url, "/CommonS.aspx?qs=ap")

        try:
            attendance_response = self.session.get(attendance_url, timeout=15)
            attendance_response.raise_for_status()
        except requests.RequestException as exc:
            raise PortalNetworkError("Unable to fetch attendance data from college portal") from exc

        return self._parse_attendance(attendance_response.text)
        ##till here
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
        text = html.lower()
        return (
            "documents" in text
            or "academics" in text
            or "examinations" in text
        )

    def _get_student_radio_payload(self, html: str) -> dict[str, str]:
        # Exact field discovered from the portal form.
        fallback_selection = {"bl": "Student"}

        soup = BeautifulSoup(html, "html.parser")
        radios = soup.find_all("input", {"type": "radio"})

        if not radios:
            return fallback_selection

        labels_by_id: dict[str, str] = {}
        for label in soup.find_all("label"):
            target = (label.get("for") or "").strip()
            if target:
                labels_by_id[target] = label.get_text(" ", strip=True).lower()

        for radio in radios:
            name = (radio.get("name") or "").strip()
            value = (radio.get("value") or "").strip()

            if not name:
                continue

            radio_id = (radio.get("id") or "").strip()
            marker_text = " ".join(
                [
                    radio_id.lower(),
                    name.lower(),
                    value.lower(),
                    labels_by_id.get(radio_id, ""),
                    (radio.get("aria-label") or "").lower(),
                ]
            )

            if "student" in marker_text:
                return {name: value or "Student"}

        # Fallback for common value conventions.
        for radio in radios:
            name = (radio.get("name") or "").strip()
            value = (radio.get("value") or "").strip()

            if not name:
                continue

            if value.lower() in {"student", "s", "1"}:
                return {name: value}

        return fallback_selection

    def _parse_attendance(self, html: str) -> dict:
        soup = BeautifulSoup(html, "html.parser")
        attendance_items: list[dict[str, str]] = []

        for row in soup.find_all("tr"):
            columns = [cell.get_text(" ", strip=True) for cell in row.find_all("td")]

            if len(columns) < 2:
                continue

            subject = columns[0]
            attendance_value = columns[1]

            if not subject or not attendance_value:
                continue

            if subject.lower() in {"subject", "subject name", "course"}:
                continue

            attendance_items.append(
                {
                    "subject": subject,
                    "attendance": attendance_value,
                }
            )

        return {"attendance": attendance_items}
