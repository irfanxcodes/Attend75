import os
from urllib.parse import urljoin

import requests
from bs4 import BeautifulSoup


class PortalAuthenticationError(Exception):
    pass


class PortalNetworkError(Exception):
    pass


class PortalScraper:
    PASSWORD_MAX_LENGTH = 10

    def __init__(self, session: requests.Session | None = None):
        self.session = session or requests.Session()
        self.base_url = os.getenv("PORTAL_BASE_URL", "http://111.93.16.209/sz")
        self.login_path = os.getenv("PORTAL_LOGIN_PATH", "login.aspx")
        self.session.headers.update(
            {
                "User-Agent": (
                    "Mozilla/5.0 (Linux; Android 8.0.0; SM-G955U Build/R16NW) "
                    "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Mobile Safari/537.36"
                ),
                "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
                "Accept-Language": "en-US,en;q=0.9",
            }
        )

    def login(self, roll_number: str, password: str) -> dict:
        login_url = self._build_url(self.login_path)

        try:
            # Load the login page first to receive cookies and optional CSRF token.
            login_page = self.session.get(login_url, timeout=15)
            login_page.raise_for_status()

            payload = self._extract_hidden_form_fields(login_page.text)
            payload.update(
                {
                    "txtLogin": roll_number,
                    "txtPassword": self._normalize_password(password),
                    "bl": "Student",
                    "btnSubmit": "Submit",
                }
            )

            # Portal has Student/Parent radio options; enforce Student selection.
            payload.update(self._get_student_radio_payload(login_page.text))

            response = self.session.post(
                login_url,
                data=payload,
                timeout=15,
                allow_redirects=True,
                headers={
                    "Referer": login_url,
                    "Origin": self.base_url.rsplit("/", 1)[0],
                },
            )
            response.raise_for_status()
        except requests.RequestException as exc:
            raise PortalNetworkError(f"Unable to connect to college portal: {exc}") from exc

        login_redirected = self._is_success_redirect(response)

        if self._is_invalid_credentials(response.text):
            raise PortalAuthenticationError("Invalid credentials")

        # Some ASP.NET portals keep users on the same URL even after successful login,
        # so verify auth by requesting attendance page with the same session.
        attendance_url = self._build_url("CommonS.aspx?qs=ap")

        try:
            attendance_response = self.session.get(attendance_url, timeout=15)
            attendance_response.raise_for_status()
        except requests.RequestException as exc:
            raise PortalNetworkError(f"Unable to fetch attendance data from college portal: {exc}") from exc

        if self._looks_like_login_page(attendance_response.text) and not login_redirected:
            raise PortalAuthenticationError("Invalid credentials")

        return self._parse_attendance(attendance_response.text)

    def _extract_hidden_form_fields(self, html: str) -> dict[str, str]:
        soup = BeautifulSoup(html, "html.parser")
        fields: dict[str, str] = {}

        for hidden_input in soup.find_all("input", {"type": "hidden"}):
            name = (hidden_input.get("name") or "").strip()
            if not name:
                continue
            fields[name] = (hidden_input.get("value") or "").strip()

        return fields

    def _is_invalid_credentials(self, html: str) -> bool:
        text = html.lower()
        keywords = [
            "invalid credentials",
            "incorrect password",
            "login failed",
            "invalid roll number",
            "please enter valid",
        ]
        return any(keyword in text for keyword in keywords)

    def _is_success_redirect(self, response: requests.Response) -> bool:
        redirect_targets = [
            (hop.headers.get("Location") or "").lower() for hop in response.history
        ]
        final_url = (response.url or "").lower()

        return any("index.aspx" in target for target in redirect_targets) or "index.aspx" in final_url

    def _normalize_password(self, password: str) -> str:
        return (password or "")[: self.PASSWORD_MAX_LENGTH]

    def _looks_like_login_page(self, html: str) -> bool:
        text = html.lower()

        login_markers = [
            "txtlogin",
            "txtpassword",
            "login.aspx",
            "sign in",
            "student",
            "parent",
        ]

        return sum(marker in text for marker in login_markers) >= 2

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

    def _build_url(self, path: str) -> str:
        normalized_base = self.base_url.rstrip("/") + "/"
        normalized_path = path.lstrip("/")
        return urljoin(normalized_base, normalized_path)
