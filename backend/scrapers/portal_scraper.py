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
        normalized_roll = (roll_number or "").strip().upper()

        try:
            # Load the login page first to receive cookies and optional CSRF token.
            login_page = self.session.get(login_url, timeout=15)
            login_page.raise_for_status()

            payload = self._extract_hidden_form_fields(login_page.text)
            payload.update(
                {
                    "txtLogin": normalized_roll,
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
        has_auth_session = self._has_authenticated_session()

        if (
            self._looks_like_login_page(response.text)
            and self._is_invalid_credentials(response.text)
            and not (login_redirected or has_auth_session)
        ):
            raise PortalAuthenticationError(
                "Portal rejected login details (login error shown on login response)"
            )

        # Follow the same navigation chain observed in browser logs:
        # login POST -> Index.aspx -> SDB.aspx -> CommonS.aspx?qs=ap
        attendance_response = self._run_post_login_navigation(login_url)

        if self._looks_like_login_page(attendance_response.text) and not (login_redirected or has_auth_session):
            raise PortalAuthenticationError(
                "Portal redirected to login while loading attendance (session not authenticated)"
            )

        if self._looks_like_login_page(attendance_response.text) and not self._contains_attendance_table(attendance_response.text):
            raise PortalAuthenticationError(
                "Portal returned login page while loading attendance (session expired or invalid)"
            )

        return self._build_attendance_payload(attendance_response.text)

    def fetch_attendance_for_semester(self, semester_id: str | None = None) -> dict:
        attendance_url = self._build_url("CommonS.aspx?qs=ap")

        try:
            attendance_response = self.session.get(
                attendance_url,
                timeout=15,
                headers={"Referer": self._build_url("Index.aspx")},
            )
            attendance_response.raise_for_status()
        except requests.RequestException as exc:
            raise PortalNetworkError(f"Unable to fetch attendance data from college portal: {exc}") from exc

        html = attendance_response.text

        if semester_id:
            switched_html = self._switch_semester(html, attendance_url, semester_id)
            if switched_html is not None:
                html = switched_html

        if self._looks_like_login_page(html) and not self._contains_attendance_table(html):
            raise PortalAuthenticationError(
                "Portal returned login page while loading attendance (session expired or invalid)"
            )

        return self._build_attendance_payload(html)

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

    def _has_authenticated_session(self) -> bool:
        cookie_names = {cookie.name for cookie in self.session.cookies}

        # Cookies observed on successful portal auth flow.
        required_any = {"UserID", "CurrentSession", "Enrolno"}
        required_base = {"ASP.NET_SessionId", "CenterID"}

        return required_base.issubset(cookie_names) and bool(cookie_names.intersection(required_any))

    def _looks_like_login_page(self, html: str) -> bool:
        soup = BeautifulSoup(html, "html.parser")

        login_input = soup.find("input", {"name": "txtLogin"})
        password_input = soup.find("input", {"name": "txtPassword"})
        submit_button = soup.find("input", {"name": "btnSubmit"})

        form = soup.find("form")
        form_action = ((form.get("action") if form else "") or "").lower()

        has_login_form_action = "login.aspx" in form_action
        has_login_controls = bool(login_input and password_input)
        has_submit = submit_button is not None

        return (has_login_controls and has_submit) or (has_login_controls and has_login_form_action)

    def _run_post_login_navigation(self, login_url: str) -> requests.Response:
        index_url = self._build_url("Index.aspx")
        sdb_url = self._build_url("SDB.aspx")
        attendance_url = self._build_url("CommonS.aspx?qs=ap")

        try:
            index_response = self.session.get(
                index_url,
                timeout=15,
                headers={"Referer": login_url},
            )
            index_response.raise_for_status()

            sdb_response = self.session.get(
                sdb_url,
                timeout=15,
                headers={"Referer": index_url},
            )
            sdb_response.raise_for_status()

            attendance_response = self.session.get(
                attendance_url,
                timeout=15,
                headers={"Referer": index_url},
            )
            attendance_response.raise_for_status()
            return attendance_response
        except requests.RequestException as exc:
            raise PortalNetworkError(f"Unable to complete post-login navigation flow: {exc}") from exc

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

        attendance_table = self._find_attendance_table(soup)
        if attendance_table is None:
            raise PortalNetworkError("Attendance table not found on My Attendance page")

        for row in attendance_table.find_all("tr"):
            cells = row.find_all("td")
            columns = [cell.get_text(" ", strip=True) for cell in cells]

            # Expected columns from the portal table:
            # S#, Code, CourseAbbr, Course, Section, Sessions, Attended, %
            if len(columns) < 8:
                continue

            code = columns[1]
            course_name = columns[3]
            section = columns[4]
            sessions = columns[5]
            attended = columns[6]
            percentage = columns[7]

            if not course_name or not percentage:
                continue

            attendance_items.append(
                {
                    "subject": course_name,
                    "attendance": percentage,
                    "code": code,
                    "section": section,
                    "sessions": sessions,
                    "attended": attended,
                }
            )

        if not attendance_items:
            raise PortalNetworkError("Attendance rows not found on My Attendance page")

        return {"attendance": attendance_items}

    def _find_attendance_table(self, soup: BeautifulSoup):
        # Primary selector from the portal sample.
        table = soup.find("table", {"id": "table"})
        if table is not None:
            return table

        expected_headers = ["code", "course", "sessions", "attended", "%"]

        for candidate in soup.find_all("table"):
            header_text = " ".join(
                th.get_text(" ", strip=True).lower() for th in candidate.find_all("th")
            )
            if header_text and all(token in header_text for token in expected_headers):
                return candidate

        return None

    def _contains_attendance_table(self, html: str) -> bool:
        soup = BeautifulSoup(html, "html.parser")
        return self._find_attendance_table(soup) is not None

    def _switch_semester(self, html: str, attendance_url: str, semester_id: str) -> str | None:
        soup = BeautifulSoup(html, "html.parser")
        semester_dropdown = soup.find("select", {"name": "ddlSem"})

        if semester_dropdown is None:
            return None

        selected_option = semester_dropdown.find("option", selected=True)
        selected_value = (selected_option.get("value") if selected_option else "") or ""

        requested_value = (semester_id or "").strip()
        if not requested_value:
            return html

        available_values = {
            (option.get("value") or "").strip()
            for option in semester_dropdown.find_all("option")
        }
        if requested_value not in available_values:
            return html

        if selected_value == requested_value:
            return html

        payload = self._extract_hidden_form_fields(html)
        payload.update(
            {
                "__EVENTTARGET": "ddlSem",
                "__EVENTARGUMENT": "",
                "ddlSem": requested_value,
            }
        )

        try:
            response = self.session.post(
                attendance_url,
                data=payload,
                timeout=15,
                allow_redirects=True,
                headers={"Referer": attendance_url},
            )
            response.raise_for_status()
            return response.text
        except requests.RequestException as exc:
            raise PortalNetworkError(f"Unable to switch semester: {exc}") from exc

    def _extract_semesters(self, html: str) -> tuple[list[dict[str, str]], str | None]:
        soup = BeautifulSoup(html, "html.parser")
        semester_dropdown = soup.find("select", {"name": "ddlSem"})

        if semester_dropdown is None:
            return [], None

        semesters: list[dict[str, str]] = []
        selected_semester: str | None = None

        for option in semester_dropdown.find_all("option"):
            value = (option.get("value") or "").strip()
            label = option.get_text(" ", strip=True)

            if not value.isdigit():
                continue

            semesters.append({"id": value, "label": label})
            if option.has_attr("selected"):
                selected_semester = value

        if not selected_semester and semesters:
            selected_semester = semesters[-1]["id"]

        return semesters, selected_semester

    def _build_attendance_payload(self, html: str) -> dict:
        semesters, selected_semester = self._extract_semesters(html)
        parsed = self._parse_attendance(html)
        parsed["semesters"] = semesters
        parsed["selected_semester"] = selected_semester
        return parsed

    def _build_url(self, path: str) -> str:
        normalized_base = self.base_url.rstrip("/") + "/"
        normalized_path = path.lstrip("/")
        return urljoin(normalized_base, normalized_path)
