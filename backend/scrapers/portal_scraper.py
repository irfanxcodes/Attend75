import os
import re
from datetime import datetime
from urllib.parse import urljoin

import requests
from bs4 import BeautifulSoup


class PortalAuthenticationError(Exception):
    def __init__(self, message: str, code: str = "AUTH_FAILED"):
        super().__init__(message)
        self.code = code


class PortalNetworkError(Exception):
    def __init__(self, message: str, code: str = "DATA_FETCH_FAILED"):
        super().__init__(message)
        self.code = code


class PortalScraper:
    PASSWORD_MAX_LENGTH = 10

    def __init__(self, session: requests.Session | None = None):
        self.session = session or requests.Session()
        self.base_url = os.getenv("PORTAL_BASE_URL", "http://111.93.16.209/sz")
        self.login_path = os.getenv("PORTAL_LOGIN_PATH", "login.aspx")
        self.request_timeout = float(os.getenv("PORTAL_REQUEST_TIMEOUT_SECONDS", "15"))
        self._history_cache: dict[str, dict[str, list[dict[str, str | bool]]]] = {}
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
            login_page = self.session.get(login_url, timeout=self.request_timeout)
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
                timeout=self.request_timeout,
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

        if self._looks_like_login_page(response.text) and not (login_redirected or has_auth_session):
            invalid_reason = self._classify_invalid_credentials(response.text)
            if invalid_reason == "INVALID_USERNAME":
                raise PortalAuthenticationError(
                    "Portal rejected login due to invalid username/roll number",
                    code="INVALID_USERNAME",
                )
            if invalid_reason == "INCORRECT_PASSWORD":
                raise PortalAuthenticationError(
                    "Portal rejected login due to incorrect password",
                    code="INCORRECT_PASSWORD",
                )
            if invalid_reason == "LOGIN_FAILED":
                raise PortalAuthenticationError(
                    "Portal rejected login details (login error shown on login response)",
                    code="LOGIN_FAILED",
                )

        # Follow the same navigation chain observed in browser logs:
        # login POST -> Index.aspx -> SDB.aspx -> CommonS.aspx?qs=ap
        navigation_payload = self._run_post_login_navigation(login_url)
        attendance_response = navigation_payload["attendance_response"]
        student_name = navigation_payload.get("student_name")

        if self._looks_like_login_page(attendance_response.text) and not (login_redirected or has_auth_session):
            raise PortalAuthenticationError(
                "Portal redirected to login while loading attendance (session not authenticated)",
                code="LOGIN_FAILED",
            )

        if self._looks_like_login_page(attendance_response.text) and not self._contains_attendance_table(attendance_response.text):
            raise PortalAuthenticationError(
                "Portal returned login page while loading attendance (session expired or invalid)",
                code="LOGIN_FAILED",
            )

        payload = self._build_attendance_payload(attendance_response.text)
        courses_map = self._safe_fetch_courses_map(payload.get("selected_semester"))
        payload["attendance"] = self._merge_attendance_with_total_sessions(
            payload.get("attendance", []),
            courses_map,
        )
        payload["feasibility"] = {
            "overall": self._build_overall_feasibility(payload.get("attendance", []))
        }
        payload["student_name"] = student_name or normalized_roll
        return payload

    def fetch_attendance_for_semester(self, semester_id: str | None = None) -> dict:
        attendance_url = self._build_url("CommonS.aspx?qs=ap")

        try:
            attendance_response = self.session.get(
                attendance_url,
                timeout=self.request_timeout,
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
                "Portal returned login page while loading attendance (session expired or invalid)",
                code="SESSION_EXPIRED",
            )

        payload = self._build_attendance_payload(html)
        courses_map = self._safe_fetch_courses_map(payload.get("selected_semester"))
        payload["attendance"] = self._merge_attendance_with_total_sessions(
            payload.get("attendance", []),
            courses_map,
        )
        payload["feasibility"] = {
            "overall": self._build_overall_feasibility(payload.get("attendance", []))
        }
        return payload

    def fetch_subject_attendance_history(self, semester_id: str | None = None, date: str | None = None) -> dict:
        attendance_payload = self.fetch_attendance_for_semester(semester_id=semester_id)
        selected_semester = attendance_payload.get("selected_semester") or semester_id or "default"
        cache_key = str(selected_semester)

        if cache_key in self._history_cache:
            history_by_date = self._history_cache[cache_key]
            if not self._history_cache_has_abbreviations(history_by_date):
                history_by_date = self._scrape_all_subject_history(attendance_payload.get("attendance", []))
                self._history_cache[cache_key] = history_by_date
        else:
            history_by_date = self._scrape_all_subject_history(attendance_payload.get("attendance", []))
            self._history_cache[cache_key] = history_by_date

        if date:
            return {
                "date": date,
                "entries": history_by_date.get(date, []),
                "selected_semester": selected_semester,
            }

        return {
            "history_by_date": history_by_date,
            "selected_semester": selected_semester,
        }

    def fetch_consolidated_marks(self, semester_id: str | None = None) -> dict:
        if semester_id:
            self.session.cookies.set("SemesterID", str(semester_id).strip())

        html, page_url = self._load_consolidated_marks_page()

        if semester_id:
            switched_html = self._switch_semester_on_page(html, page_url, semester_id)
            if switched_html is not None:
                html = switched_html
            self.session.cookies.set("SemesterID", str(semester_id).strip())

        if self._looks_like_login_page(html):
            raise PortalAuthenticationError(
                "Portal returned login page while loading consolidated marks",
                code="SESSION_EXPIRED",
            )

        semesters, selected_semester = self._extract_semesters(html)
        subjects = self._parse_consolidated_marks_subjects(html)

        return {
            "subjects": subjects,
            "semesters": semesters,
            "selected_semester": selected_semester,
        }

    def _load_consolidated_marks_page(self) -> tuple[str, str]:
        env_path = (os.getenv("PORTAL_CONSOLIDATED_MARKS_PATH", "CommonS.aspx?qs=cmarks") or "").strip()
        candidate_paths: list[str] = []
        if env_path:
            candidate_paths.append(env_path)

        candidate_paths.extend(
            [
                "CommonS.aspx?qs=cmarks",
                "rc/cml.aspx",
                "rc/cm.aspx",
                "CommonS.aspx?qs=cml",
                "CommonS.aspx?qs=cm",
            ]
        )

        first_login_html: str | None = None

        for path in candidate_paths:
            url = self._build_url(path)
            try:
                response = self.session.get(
                    url,
                    timeout=self.request_timeout,
                    headers={"Referer": self._build_url("Index.aspx")},
                )
                response.raise_for_status()
            except requests.RequestException:
                continue

            html = response.text
            if self._looks_like_login_page(html):
                if first_login_html is None:
                    first_login_html = html
                continue

            if self._find_consolidated_marks_table(BeautifulSoup(html, "html.parser")) is not None:
                return html, url

        if first_login_html is not None:
            raise PortalAuthenticationError(
                "Portal returned login page while loading consolidated marks",
                code="SESSION_EXPIRED",
            )

        raise PortalNetworkError("Consolidated marks table not found on portal")

    def _find_consolidated_marks_table(self, soup: BeautifulSoup):
        expected_headers = ["code", "units", "component", "weightage"]

        for candidate in soup.find_all("table"):
            classes = candidate.get("class") or []
            if classes and "table" not in classes:
                continue

            headers = [th.get_text(" ", strip=True).lower() for th in candidate.find_all("th")]
            if not headers:
                continue

            if all(any(token in header for header in headers) for token in expected_headers):
                return candidate

        return None

    def _parse_consolidated_marks_subjects(self, html: str) -> list[dict[str, object]]:
        soup = BeautifulSoup(html, "html.parser")
        marks_table = self._find_consolidated_marks_table(soup)
        if marks_table is None:
            raise PortalNetworkError("Consolidated marks table not found on portal page")

        headers = [th.get_text(" ", strip=True).lower() for th in marks_table.find_all("th")]
        code_index = self._find_column_index(headers, ["code", "course code", "subject code"])
        course_index = self._find_column_index(headers, ["course", "course name", "subject", "subject name"])
        units_index = self._find_column_index(headers, ["units", "unit"])
        component_index = self._find_column_index(headers, ["component", "components"])
        weightage_index = self._find_column_index(headers, ["weightage", "marks", "score"])

        if code_index is None or course_index is None or component_index is None or weightage_index is None:
            raise PortalNetworkError("Required consolidated marks columns are missing")

        header_count = len(headers)

        subjects_by_code: dict[str, dict[str, object]] = {}
        subject_order: list[str] = []
        current_code = ""
        current_name = ""
        current_units = ""

        for row in marks_table.find_all("tr"):
            cells = row.find_all("td", recursive=False)
            if not cells:
                cells = row.find_all("td")
            if not cells:
                continue

            columns = self._expand_row_cells(cells, header_count)
            if len(columns) <= max(code_index, course_index, component_index, weightage_index):
                continue

            row_code = columns[code_index].strip() if code_index < len(columns) else ""
            row_name = columns[course_index].strip() if course_index < len(columns) else ""
            row_component = columns[component_index].strip() if component_index < len(columns) else ""
            row_weightage = columns[weightage_index].strip() if weightage_index < len(columns) else ""
            row_units = columns[units_index].strip() if units_index is not None and units_index < len(columns) else ""

            if row_code:
                current_code = row_code
            if row_name:
                current_name = row_name
            if row_units:
                current_units = row_units

            if not current_code or not row_component:
                continue

            normalized_code = self._normalize_code(current_code)
            if not normalized_code:
                continue

            if normalized_code not in subjects_by_code:
                subjects_by_code[normalized_code] = {
                    "code": normalized_code,
                    "name": current_name or normalized_code,
                    "subject_code": normalized_code,
                    "subject_name": current_name or normalized_code,
                    "units": self._parse_int(current_units) if self._parse_int(current_units) is not None else (current_units or None),
                    "components": [],
                    "_total_obtained": 0.0,
                    "_total_max": 0.0,
                    "_explicit_total": None,
                }
                subject_order.append(normalized_code)
            else:
                if current_name:
                    subjects_by_code[normalized_code]["name"] = current_name
                    subjects_by_code[normalized_code]["subject_name"] = current_name
                if current_units:
                    parsed_units = self._parse_int(current_units)
                    subjects_by_code[normalized_code]["units"] = parsed_units if parsed_units is not None else current_units

            subject_entry = subjects_by_code[normalized_code]
            numeric_obtained, numeric_max = self._parse_component_weightage(row_weightage)

            if row_component.lower().replace(" ", "") in {"total:", "total"}:
                subject_entry["_explicit_total"] = self._to_number_or_none(numeric_obtained)
                if numeric_max is not None:
                    subject_entry["_total_max"] += numeric_max
                continue

            existing_components = subject_entry.get("components", [])
            if existing_components:
                previous = existing_components[-1]
                previous_name = str(previous.get("name") or "").strip().lower()
                previous_value = str(previous.get("value") or "").strip()
                if previous_name == row_component.strip().lower() and previous_value == row_weightage.strip():
                    continue

            subject_entry["components"].append(
                {
                    "name": row_component,
                    "value": row_weightage,
                    "numeric_value": self._to_number_or_none(numeric_obtained),
                    "max_value": self._to_number_or_none(numeric_max),
                }
            )

            if numeric_obtained is not None:
                subject_entry["_total_obtained"] += numeric_obtained
            if numeric_max is not None:
                subject_entry["_total_max"] += numeric_max

        subjects: list[dict[str, object]] = []
        for code in subject_order:
            entry = subjects_by_code[code]
            total_obtained = float(entry.pop("_total_obtained", 0.0))
            total_max = float(entry.pop("_total_max", 0.0))
            explicit_total = entry.pop("_explicit_total", None)

            has_numeric_components = total_obtained > 0
            entry["total"] = self._to_number_or_zero(total_obtained) if has_numeric_components else (explicit_total or 0)
            entry["max_total"] = self._to_number_or_zero(total_max) if total_max > 0 else 60
            subjects.append(entry)

        if not subjects:
            raise PortalNetworkError("Consolidated marks rows not found for the selected semester")

        return subjects

    def _expand_row_cells(self, cells, header_count: int) -> list[str]:
        columns: list[str] = []

        for cell in cells:
            text = self._clean_cell_text(cell.get_text(" ", strip=True))
            colspan_raw = (cell.get("colspan") or "1").strip()

            try:
                span = max(int(colspan_raw), 1)
            except ValueError:
                span = 1

            columns.extend([text] * span)

        if len(columns) < header_count:
            columns.extend([""] * (header_count - len(columns)))

        return columns[:header_count]

    def _clean_cell_text(self, value: str) -> str:
        cleaned = (value or "").replace("\xa0", " ").strip()
        return "" if cleaned in {"-", "--"} else cleaned

    def _parse_component_weightage(self, raw_value: str) -> tuple[float | None, float | None]:
        value = (raw_value or "").strip()
        if not value:
            return None, None

        ratio_match = re.search(r"(\d+(?:\.\d+)?)\s*/\s*(\d+(?:\.\d+)?)", value)
        if ratio_match:
            return float(ratio_match.group(1)), float(ratio_match.group(2))

        numbers = re.findall(r"\d+(?:\.\d+)?", value)
        if not numbers:
            return None, None

        return float(numbers[0]), None

    def _to_number_or_none(self, value: float | None) -> int | float | None:
        if value is None:
            return None
        return int(value) if float(value).is_integer() else round(float(value), 2)

    def _to_number_or_zero(self, value: float) -> int | float:
        return int(value) if float(value).is_integer() else round(float(value), 2)

    def _extract_hidden_form_fields(self, html: str) -> dict[str, str]:
        soup = BeautifulSoup(html, "html.parser")
        fields: dict[str, str] = {}

        for hidden_input in soup.find_all("input", {"type": "hidden"}):
            name = (hidden_input.get("name") or "").strip()
            if not name:
                continue
            fields[name] = (hidden_input.get("value") or "").strip()

        return fields

    def _classify_invalid_credentials(self, html: str) -> str | None:
        text = html.lower()
        username_keywords = [
            "invalid roll number",
            "invalid username",
            "invalid login",
            "username does not exist",
            "invalid user",
            "user not found",
            "invalid enrol",
        ]
        password_keywords = [
            "incorrect password",
            "invalid password",
            "wrong password",
            "password incorrect",
            "password mismatch",
        ]
        generic_keywords = [
            "invalid credentials",
            "login failed",
            "please enter valid",
        ]
        if any(keyword in text for keyword in username_keywords):
            return "INVALID_USERNAME"
        if any(keyword in text for keyword in password_keywords):
            return "INCORRECT_PASSWORD"
        if any(keyword in text for keyword in generic_keywords):
            return "LOGIN_FAILED"
        return None

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

    def _run_post_login_navigation(self, login_url: str) -> dict:
        index_url = self._build_url("Index.aspx")
        sdb_url = self._build_url("SDB.aspx")
        attendance_url = self._build_url("CommonS.aspx?qs=ap")

        try:
            index_response = self.session.get(
                index_url,
                timeout=self.request_timeout,
                headers={"Referer": login_url},
            )
            index_response.raise_for_status()
            student_name = self._extract_student_name(index_response.text)

            sdb_response = self.session.get(
                sdb_url,
                timeout=self.request_timeout,
                headers={"Referer": index_url},
            )
            sdb_response.raise_for_status()

            attendance_response = self.session.get(
                attendance_url,
                timeout=self.request_timeout,
                headers={"Referer": index_url},
            )
            attendance_response.raise_for_status()
            return {
                "attendance_response": attendance_response,
                "student_name": student_name,
            }
        except requests.RequestException as exc:
            raise PortalNetworkError(f"Unable to complete post-login navigation flow: {exc}") from exc

    def _extract_student_name(self, html: str) -> str | None:
        soup = BeautifulSoup(html, "html.parser")
        name_label = soup.find(id="lblName")
        if name_label is None:
            return None

        name_text = name_label.get_text(" ", strip=True)
        return name_text or None

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

        headers = [th.get_text(" ", strip=True).lower() for th in attendance_table.find_all("th")]

        code_index = self._find_column_index(headers, ["code", "course code", "subject code"])
        abbr_index = self._find_column_index(
            headers,
            ["course abbr", "courseabbr", "abbr", "short name", "shortname"],
        )
        course_index = self._find_column_index(headers, ["course name", "subject name"])
        if course_index is None:
            course_index = self._find_column_index(headers, ["course", "subject"])
        if course_index is not None and abbr_index is not None and course_index == abbr_index:
            course_index = None

        section_index = self._find_column_index(headers, ["section"])
        sessions_index = self._find_column_index(headers, ["sessions", "session"]) 
        attended_index = self._find_column_index(headers, ["attended", "attendance"]) 
        percentage_index = self._find_column_index(headers, ["%", "percentage"])

        def get_column(columns: list[str], index: int | None, fallback_index: int) -> str:
            if index is not None and 0 <= index < len(columns):
                return columns[index]
            if 0 <= fallback_index < len(columns):
                return columns[fallback_index]
            return ""

        for row in attendance_table.find_all("tr"):
            cells = row.find_all("td")
            columns = [cell.get_text(" ", strip=True) for cell in cells]

            # Expected columns from the portal table:
            # S#, Code, CourseAbbr, Course, Section, Sessions, Attended, %
            if len(columns) < 8:
                continue

            code = get_column(columns, code_index, 1)
            code_cell_index = code_index if code_index is not None else 1
            code_cell = cells[code_cell_index] if 0 <= code_cell_index < len(cells) else None
            code_link = code_cell.find("a") if len(cells) > 1 else None
            history_link = self._resolve_url(code_link.get("href")) if code_link and code_link.get("href") else None
            course_abbr = get_column(columns, abbr_index, 2)
            course_name = get_column(columns, course_index, 3)
            section = get_column(columns, section_index, 4)
            sessions = get_column(columns, sessions_index, 5)
            attended = get_column(columns, attended_index, 6)
            percentage = get_column(columns, percentage_index, 7)

            if not course_name or not percentage:
                continue

            attendance_items.append(
                {
                    "subject": course_name,
                    "course_abbr": course_abbr,
                    "attendance": percentage,
                    "code": code,
                    "history_link": history_link,
                    "section": section,
                    "sessions": sessions,
                    "attended": attended,
                }
            )

        if not attendance_items:
            raise PortalNetworkError("Attendance rows not found on My Attendance page")

        return {"attendance": attendance_items}

    def _history_cache_has_abbreviations(self, history_by_date: dict[str, list[dict[str, str | bool]]]) -> bool:
        for entries in history_by_date.values():
            for entry in entries:
                if str(entry.get("subject_abbr") or "").strip():
                    return True
        return False

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
                timeout=self.request_timeout,
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

    def _safe_fetch_courses_map(self, semester_id: str | None) -> dict[str, int]:
        try:
            return self._fetch_courses_map(semester_id)
        except Exception:
            # Do not break attendance flow if Courses tab parsing fails.
            return {}

    def _fetch_courses_map(self, semester_id: str | None) -> dict[str, int]:
        # Use the exact Academics -> Courses page as requested.
        courses_url = self._build_url("rc/cr.aspx")

        try:
            courses_response = self.session.get(
                courses_url,
                timeout=self.request_timeout,
                headers={"Referer": self._build_url("Index.aspx")},
            )
            courses_response.raise_for_status()
        except requests.RequestException as exc:
            raise PortalNetworkError(f"Unable to fetch Courses page from college portal: {exc}") from exc

        html = courses_response.text
        if semester_id:
            switched_html = self._switch_semester_on_page(html, courses_url, semester_id)
            if switched_html is not None:
                html = switched_html

        if self._looks_like_login_page(html):
            raise PortalAuthenticationError(
                "Portal returned login page while loading Courses",
                code="SESSION_EXPIRED",
            )

        return self._parse_courses_map(html)

    def _switch_semester_on_page(self, html: str, page_url: str, semester_id: str) -> str | None:
        soup = BeautifulSoup(html, "html.parser")

        select_element = soup.find("select", {"name": "ddlSem"})
        if select_element is None:
            # Fallback to first select with numeric options.
            for candidate in soup.find_all("select"):
                values = [(option.get("value") or "").strip() for option in candidate.find_all("option")]
                if any(value.isdigit() for value in values):
                    select_element = candidate
                    break

        if select_element is None:
            return None

        selected_option = select_element.find("option", selected=True)
        selected_value = (selected_option.get("value") if selected_option else "") or ""

        requested_value = (semester_id or "").strip()
        if not requested_value:
            return html

        available_values = {
            (option.get("value") or "").strip()
            for option in select_element.find_all("option")
        }
        if requested_value not in available_values:
            return html

        if selected_value == requested_value:
            return html

        select_name = (select_element.get("name") or "").strip()
        event_target = (select_element.get("id") or select_name).strip()
        if not select_name or not event_target:
            return None

        payload = self._extract_hidden_form_fields(html)
        payload.update(
            {
                "__EVENTTARGET": event_target,
                "__EVENTARGUMENT": "",
                select_name: requested_value,
            }
        )

        try:
            response = self.session.post(
                page_url,
                data=payload,
                timeout=self.request_timeout,
                allow_redirects=True,
                headers={"Referer": page_url},
            )
            response.raise_for_status()
            return response.text
        except requests.RequestException as exc:
            raise PortalNetworkError(f"Unable to switch semester on Courses page: {exc}") from exc

    def _parse_courses_map(self, html: str) -> dict[str, int]:
        soup = BeautifulSoup(html, "html.parser")
        courses_map: dict[str, int] = {}

        for table in soup.find_all("table"):
            headers = [th.get_text(" ", strip=True).lower() for th in table.find_all("th")]
            if not headers:
                continue

            code_index = self._find_column_index(headers, ["code", "course code", "subject code"])
            total_index = self._find_column_index(
                headers,
                ["total sessions", "totalsessions", "session total", "no. of sessions", "sessions"],
            )

            if code_index is None or total_index is None:
                continue

            for row in table.find_all("tr"):
                cols = row.find_all("td")
                if len(cols) <= max(code_index, total_index):
                    continue

                code_value = self._normalize_code(cols[code_index].get_text(" ", strip=True))
                total_value = self._parse_int(cols[total_index].get_text(" ", strip=True))

                if code_value and total_value is not None:
                    courses_map[code_value] = total_value

        return courses_map

    def _merge_attendance_with_total_sessions(
        self,
        attendance_items: list[dict[str, str]],
        courses_map: dict[str, int],
    ) -> list[dict[str, str | int | None]]:
        merged: list[dict[str, str | int | None]] = []

        for item in attendance_items:
            code = self._normalize_code(str(item.get("code", "")))
            sessions = self._parse_int(str(item.get("sessions", "")))
            attended = self._parse_int(str(item.get("attended", "")))
            total_sessions = courses_map.get(code)

            remaining_classes: int | None = None
            max_possible_percentage: float | None = None

            if total_sessions is not None and sessions is not None:
                remaining_classes = max(total_sessions - sessions, 0)

            if total_sessions is not None and total_sessions > 0 and attended is not None:
                possible_attended = attended + (remaining_classes or 0)
                max_possible_percentage = round((possible_attended / total_sessions) * 100, 2)

            merged.append(
                {
                    **item,
                    "total_sessions": total_sessions,
                    "remaining_classes": remaining_classes,
                    "max_possible_percentage": max_possible_percentage,
                }
            )

        return merged

    def _build_overall_feasibility(self, attendance_items: list[dict[str, str | int | float | None]]) -> dict:
        if not attendance_items:
            return {
                "sessions": 0,
                "attended": 0,
                "total_sessions": None,
                "remaining_classes": None,
                "max_possible_percentage": None,
            }

        sessions_total = 0
        attended_total = 0
        total_sessions_total = 0
        has_missing_total_sessions = False

        for item in attendance_items:
            sessions_value = self._parse_int(str(item.get("sessions", ""))) or 0
            attended_value = self._parse_int(str(item.get("attended", ""))) or 0
            total_sessions_value = item.get("total_sessions")

            sessions_total += sessions_value
            attended_total += attended_value

            if isinstance(total_sessions_value, int):
                total_sessions_total += total_sessions_value
            else:
                has_missing_total_sessions = True

        if has_missing_total_sessions or total_sessions_total <= 0:
            return {
                "sessions": sessions_total,
                "attended": attended_total,
                "total_sessions": None,
                "remaining_classes": None,
                "max_possible_percentage": None,
            }

        remaining_total = max(total_sessions_total - sessions_total, 0)
        max_possible = round(((attended_total + remaining_total) / total_sessions_total) * 100, 2)

        return {
            "sessions": sessions_total,
            "attended": attended_total,
            "total_sessions": total_sessions_total,
            "remaining_classes": remaining_total,
            "max_possible_percentage": max_possible,
        }

    def _scrape_all_subject_history(self, attendance_items: list[dict[str, str]]) -> dict[str, list[dict[str, str | bool]]]:
        history_by_date: dict[str, list[dict[str, str | bool]]] = {}

        for item in attendance_items:
            history_link = str(item.get("history_link") or "").strip()
            if not history_link:
                continue

            entries = self._scrape_subject_history_page(
                history_link=history_link,
                subject=str(item.get("subject") or "").strip(),
                subject_abbr=str(item.get("course_abbr") or "").strip(),
                code=str(item.get("code") or "").strip(),
            )

            for entry in entries:
                entry_date = str(entry.get("date") or "").strip()
                if not entry_date:
                    continue
                history_by_date.setdefault(entry_date, []).append(entry)

        return history_by_date

    def _scrape_subject_history_page(
        self,
        history_link: str,
        subject: str,
        subject_abbr: str,
        code: str,
    ) -> list[dict[str, str | bool]]:
        url = self._resolve_url(history_link)

        try:
            response = self.session.get(
                url,
                timeout=self.request_timeout,
                headers={"Referer": self._build_url("CommonS.aspx?qs=ap")},
            )
            response.raise_for_status()
        except requests.RequestException as exc:
            raise PortalNetworkError(f"Unable to fetch subject history page: {exc}") from exc

        soup = BeautifulSoup(response.text, "html.parser")
        entries: list[dict[str, str | bool]] = []

        for table in soup.find_all("table"):
            headers = [th.get_text(" ", strip=True).lower() for th in table.find_all("th")]
            if not headers:
                continue

            date_index = self._find_column_index(headers, ["date", "session date", "ssessiondt"])
            attended_index = self._find_column_index(headers, ["attended", "attendance"])

            if date_index is None or attended_index is None:
                continue

            for row in table.find_all("tr"):
                cells = row.find_all("td")
                if len(cells) <= max(date_index, attended_index):
                    continue

                parsed_date = self._extract_history_date([cells[date_index].get_text(" ", strip=True)])
                attended = self._extract_history_attendance(cells, attended_index)

                if not parsed_date or attended is None:
                    continue

                entries.append(
                    {
                        "date": parsed_date,
                        "attended": attended,
                        "subject": subject,
                        "subject_abbr": subject_abbr,
                        "code": code,
                    }
                )

            if entries:
                break

        return entries

    def _extract_history_date(self, values: list[str]) -> str | None:
        date_formats = [
            "%d/%m/%Y",
            "%d-%m-%Y",
            "%Y-%m-%d",
            "%d %b %Y",
            "%d %B %Y",
        ]

        for value in values:
            cleaned = " ".join((value or "").split())
            if not cleaned:
                continue

            for fmt in date_formats:
                try:
                    return datetime.strptime(cleaned, fmt).strftime("%Y-%m-%d")
                except ValueError:
                    continue

            match = re.search(r"(\d{1,2}[/-]\d{1,2}[/-]\d{4})", cleaned)
            if match:
                candidate = match.group(1)
                for fmt in ("%d/%m/%Y", "%d-%m-%Y"):
                    try:
                        return datetime.strptime(candidate, fmt).strftime("%Y-%m-%d")
                    except ValueError:
                        continue

        return None

    def _extract_history_attendance(self, cells, attended_index: int | None = None) -> bool | None:
        true_tokens = {"present", "yes", "attended", "true", "p", "1", "y"}
        false_tokens = {"absent", "no", "not attended", "false", "a", "0", "n"}

        cells_to_check = cells
        if attended_index is not None and 0 <= attended_index < len(cells):
            cells_to_check = [cells[attended_index]]

        for cell in cells_to_check:
            image = cell.find("img")
            if image:
                image_signature = " ".join(
                    [
                        (image.get("src") or "").lower(),
                        (image.get("alt") or "").lower(),
                        (image.get("title") or "").lower(),
                    ]
                )
                if "present" in image_signature:
                    return True
                if "absent" in image_signature:
                    return False

            text = " ".join((cell.get_text(" ", strip=True) or "").split()).lower()
            if not text:
                continue

            if text in true_tokens:
                return True
            if text in false_tokens:
                return False

            if "present" in text:
                return True
            if "absent" in text:
                return False

        return None

    def _find_column_index(self, headers: list[str], candidates: list[str]) -> int | None:
        for index, header in enumerate(headers):
            normalized = " ".join(header.split())
            if any(candidate in normalized for candidate in candidates):
                return index
        return None

    def _normalize_code(self, code: str) -> str:
        return "".join((code or "").upper().split())

    def _parse_int(self, value: str) -> int | None:
        match = re.search(r"\d+", value or "")
        if not match:
            return None
        return int(match.group(0))

    def _resolve_url(self, maybe_relative_path: str) -> str:
        return self._build_url(maybe_relative_path)

    def _build_url(self, path: str) -> str:
        normalized_base = self.base_url.rstrip("/") + "/"
        normalized_path = path.lstrip("/")
        return urljoin(normalized_base, normalized_path)
