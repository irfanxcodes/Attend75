"""
Career Compass — Static Knowledge Base

Contains the curated degree/career/company data used to:
  1. Ground LLM prompts with real, India-specific facts
  2. Populate the company directory without LLM calls (deterministic, fast)
  3. Give the LLM context about what subjects the student is studying

This file is the single source of truth for career data.
Update it as market conditions change — no DB migration needed.

Sources:
  - Deloitte India Campus Talent Report FY26 (July 2026)
  - Naukri Campus Fresher Hiring Report 2026
  - NASSCOM India Tech Talent Report 2026
  - ITM/Lingayas/BMU BBA placement outcome data
"""

from __future__ import annotations

# ── Degree programme profiles ─────────────────────────────────────────────────
# Maps normalised programme keywords → structured profile

DEGREE_PROFILES: dict[str, dict] = {
    "bba": {
        "label": "BBA (Bachelor of Business Administration)",
        "duration_years": 3,
        "core_domains": ["Management", "Marketing", "Finance", "HR", "Operations"],
        "typical_semesters": 6,
        "employability_rate_india_2024": 71,   # % — ITM data
    },
    "bcom": {
        "label": "B.Com (Bachelor of Commerce)",
        "duration_years": 3,
        "core_domains": ["Accounting", "Finance", "Taxation", "Auditing"],
        "typical_semesters": 6,
        "employability_rate_india_2024": 65,
    },
    "mba": {
        "label": "MBA (Master of Business Administration)",
        "duration_years": 2,
        "core_domains": ["Strategy", "Finance", "Marketing", "Operations", "HR"],
        "typical_semesters": 4,
        "employability_rate_india_2024": 88,
    },
    "bsc": {
        "label": "B.Sc",
        "duration_years": 3,
        "core_domains": ["Science", "Research", "Analytics"],
        "typical_semesters": 6,
        "employability_rate_india_2024": 55,
    },
    "btech": {
        "label": "B.Tech / B.E.",
        "duration_years": 4,
        "core_domains": ["Engineering", "Technology", "Software"],
        "typical_semesters": 8,
        "employability_rate_india_2024": 60,
    },
    "default": {
        "label": "Undergraduate Degree",
        "duration_years": 3,
        "core_domains": ["General"],
        "typical_semesters": 6,
        "employability_rate_india_2024": 60,
    },
}


def resolve_degree_profile(program_str: str) -> dict:
    """
    Map a raw programme string (from portal) to a degree profile.
    e.g. 'Faculty of Management' → 'bba' profile
         'B.Com (Hons)' → 'bcom' profile
    """
    p = (program_str or "").lower()
    if any(k in p for k in ["bba", "business admin", "management"]):
        return DEGREE_PROFILES["bba"]
    if any(k in p for k in ["mba", "master of business"]):
        return DEGREE_PROFILES["mba"]
    if any(k in p for k in ["b.com", "bcom", "commerce"]):
        return DEGREE_PROFILES["bcom"]
    if any(k in p for k in ["b.tech", "btech", "b.e.", "engineering"]):
        return DEGREE_PROFILES["btech"]
    if any(k in p for k in ["b.sc", "bsc", "science"]):
        return DEGREE_PROFILES["bsc"]
    return DEGREE_PROFILES["default"]


# ── Career track definitions ──────────────────────────────────────────────────
# Each track has a static skeleton; the LLM enriches it with personalised
# skill gaps and certifications based on the student's actual subjects.

CAREER_TRACKS: list[dict] = [
    {
        "slug": "finance",
        "label": "Financial Analyst",
        "description": "Analyse financial data, build models, and advise on investments or business decisions. One of the highest-paying BBA tracks in India.",
        "relevant_degree_keywords": ["bba", "bcom", "mba"],
        "relevant_subjects": ["Financial Management", "FM", "Accounting", "QBM", "Economics", "Cost Accounting"],
        "entry_role": "Junior Financial Analyst / Finance Executive",
        "salary_range_inr": "₹4–6.5 LPA",
        "demand_trend": "rising",
        "timeline_months": 8,
        "top_skills": ["Advanced Excel", "Power BI", "Financial Modelling", "Ratio Analysis", "Python basics"],
        "top_certs": [
            {"name": "NSE Certified Capital Market Professional", "provider": "NSE India", "free": False, "weeks": 4},
            {"name": "Google Data Analytics Certificate", "provider": "Coursera/Google", "free": True, "weeks": 6},
            {"name": "CFA Level 1", "provider": "CFA Institute", "free": False, "weeks": 16},
        ],
        "hiring_companies": ["Deloitte", "EY", "KPMG", "PwC", "HDFC Bank", "ICICI Bank", "Kotak", "Bajaj Finserv", "Zerodha", "Angel One"],
    },
    {
        "slug": "digital_marketing",
        "label": "Digital Marketing Executive",
        "description": "Drive brand growth through SEO, paid ads, social media, and analytics. India's marketing industry is growing at 15% YoY — high fresher absorption.",
        "relevant_degree_keywords": ["bba", "mba"],
        "relevant_subjects": ["Marketing Management", "Consumer Behaviour", "OB", "Business Communication"],
        "entry_role": "Digital Marketing Executive / SEO Analyst",
        "salary_range_inr": "₹3.5–5.5 LPA",
        "demand_trend": "rising",
        "timeline_months": 5,
        "top_skills": ["Google Ads", "Meta Ads Manager", "SEO/SEM", "Google Analytics 4", "Canva/basic design", "Email marketing"],
        "top_certs": [
            {"name": "Google Digital Marketing & E-commerce Certificate", "provider": "Coursera/Google", "free": True, "weeks": 6},
            {"name": "HubSpot Content Marketing Certification", "provider": "HubSpot Academy", "free": True, "weeks": 2},
            {"name": "Meta Social Media Marketing Certificate", "provider": "Coursera/Meta", "free": True, "weeks": 5},
        ],
        "hiring_companies": ["Dentsu", "Ogilvy", "WPP", "Zomato", "Swiggy", "Nykaa", "Myntra", "PubMatic", "InMobi", "D2C startups"],
    },
    {
        "slug": "hr",
        "label": "HR Generalist / Talent Acquisition",
        "description": "Manage people processes — hiring, onboarding, payroll, and employee engagement. Steady demand across all sectors.",
        "relevant_degree_keywords": ["bba", "mba"],
        "relevant_subjects": ["Human Resource Management", "HRM", "OB", "Organizational Behavior", "Business Laws"],
        "entry_role": "HR Executive / Talent Acquisition Executive",
        "salary_range_inr": "₹3–4.5 LPA",
        "demand_trend": "stable",
        "timeline_months": 4,
        "top_skills": ["MS Excel", "HRMS tools (Darwinbox/Keka)", "LinkedIn Recruiter", "Interviewing", "Labour law basics"],
        "top_certs": [
            {"name": "SHRM Essentials of HR", "provider": "SHRM", "free": False, "weeks": 6},
            {"name": "HR Management Specialisation", "provider": "Coursera/University of Minnesota", "free": True, "weeks": 8},
            {"name": "People Analytics", "provider": "Coursera/Wharton", "free": True, "weeks": 4},
        ],
        "hiring_companies": ["Infosys BPO", "TCS", "Wipro", "Randstad", "ManpowerGroup", "Quess Corp", "TeamLease", "HDFC Life", "Max Life"],
    },
    {
        "slug": "business_analyst",
        "label": "Business Analyst",
        "description": "Bridge business needs and technical solutions. One of the fastest-growing roles — commands 10–15% premium over standard fresher packages per Deloitte 2026.",
        "relevant_degree_keywords": ["bba", "bcom", "mba", "btech"],
        "relevant_subjects": ["QBM", "Quantitative Methods", "FM", "Database Management", "Data Science", "Information Systems"],
        "entry_role": "Junior Business Analyst / Process Associate",
        "salary_range_inr": "₹4.5–7 LPA",
        "demand_trend": "rising",
        "timeline_months": 7,
        "top_skills": ["SQL basics", "Excel (pivot tables, VLOOKUP)", "Power BI / Tableau", "Requirement gathering", "Process mapping", "Wireframing basics"],
        "top_certs": [
            {"name": "Google Data Analytics Certificate", "provider": "Coursera/Google", "free": True, "weeks": 6},
            {"name": "Business Analysis Foundations", "provider": "LinkedIn Learning / IIBA", "free": False, "weeks": 4},
            {"name": "SQL for Data Science", "provider": "Coursera/UC Davis", "free": True, "weeks": 4},
        ],
        "hiring_companies": ["Deloitte USI", "EY GDS", "Accenture", "Genpact", "WNS", "Mphasis", "Capgemini", "Cognizant", "Amazon", "Flipkart"],
    },
    {
        "slug": "sales_bdm",
        "label": "Sales / Business Development",
        "description": "Drive revenue through client acquisition and relationship management. Fastest entry point with the highest incentive upside. Great for building networks early.",
        "relevant_degree_keywords": ["bba", "mba", "bcom"],
        "relevant_subjects": ["Marketing Management", "Consumer Behaviour", "OB", "Business Communication", "Negotiation"],
        "entry_role": "Sales Executive / BDE / Account Executive",
        "salary_range_inr": "₹3–5 LPA + incentives",
        "demand_trend": "stable",
        "timeline_months": 3,
        "top_skills": ["CRM tools (Salesforce/Zoho)", "Cold outreach", "Negotiation", "Presentation skills", "LinkedIn prospecting"],
        "top_certs": [
            {"name": "Salesforce Sales Development Representative", "provider": "Coursera/Salesforce", "free": True, "weeks": 5},
            {"name": "Inbound Sales Certification", "provider": "HubSpot Academy", "free": True, "weeks": 2},
        ],
        "hiring_companies": ["HDFC Bank", "ICICI Bank", "Axis Bank", "Bajaj Finserv", "PolicyBazaar", "Paytm", "UrbanCompany", "Meesho", "Moglix"],
    },
    {
        "slug": "operations",
        "label": "Operations / Supply Chain",
        "description": "Optimise processes, manage vendors, and ensure smooth delivery. India's logistics and manufacturing boom is creating thousands of operations roles annually.",
        "relevant_degree_keywords": ["bba", "mba"],
        "relevant_subjects": ["Supply Chain Management", "SCM", "Operations Management", "QBM", "Business Process Re-Engineering", "BPR"],
        "entry_role": "Operations Trainee / Supply Chain Associate",
        "salary_range_inr": "₹3.5–5 LPA",
        "demand_trend": "rising",
        "timeline_months": 5,
        "top_skills": ["ERP basics (SAP/Oracle)", "Excel", "Lean / Six Sigma basics", "Vendor management", "Logistics software"],
        "top_certs": [
            {"name": "Lean Six Sigma White Belt", "provider": "6sigmastudy", "free": True, "weeks": 2},
            {"name": "Supply Chain Management Specialisation", "provider": "Coursera/Rutgers", "free": True, "weeks": 8},
            {"name": "APICS CSCP (entry)", "provider": "ASCM", "free": False, "weeks": 12},
        ],
        "hiring_companies": ["Amazon", "Flipkart", "Blue Dart", "DTDC", "Delhivery", "Maersk", "Mahindra Logistics", "Hindustan Unilever", "ITC", "DMart"],
    },
    {
        "slug": "data_analyst",
        "label": "Data Analyst",
        "description": "Turn raw data into business insights. AI/data roles command a 20–25% salary premium over standard BBA packages (Deloitte India 2026). Best ROI skill investment for non-tech graduates.",
        "relevant_degree_keywords": ["bba", "bcom", "mba", "bsc"],
        "relevant_subjects": ["QBM", "Quantitative Business Methods", "Statistics", "Data Science", "Python", "Database Management"],
        "entry_role": "Junior Data Analyst / MIS Executive",
        "salary_range_inr": "₹4–6.5 LPA",
        "demand_trend": "rising",
        "timeline_months": 8,
        "top_skills": ["Python (pandas, numpy)", "SQL", "Power BI / Tableau", "Excel (advanced)", "Data storytelling", "Statistics fundamentals"],
        "top_certs": [
            {"name": "Google Data Analytics Certificate", "provider": "Coursera/Google", "free": True, "weeks": 6},
            {"name": "IBM Data Analyst Professional Certificate", "provider": "Coursera/IBM", "free": True, "weeks": 11},
            {"name": "SQL for Everybody", "provider": "Coursera/UMich", "free": True, "weeks": 4},
        ],
        "hiring_companies": ["Deloitte", "EY", "KPMG", "TCS", "Infosys", "Capgemini", "Accenture", "Genpact", "Amazon", "Flipkart", "Naukri"],
    },
    {
        "slug": "consulting",
        "label": "Management Consultant",
        "description": "Help organisations solve complex problems and improve performance. Highest-paid track but most competitive — requires strong case-solving and communication skills.",
        "relevant_degree_keywords": ["bba", "mba"],
        "relevant_subjects": ["Strategic Management", "FM", "QBM", "OB", "Business Laws", "Marketing Management"],
        "entry_role": "Analyst / Associate Consultant",
        "salary_range_inr": "₹5–8 LPA",
        "demand_trend": "stable",
        "timeline_months": 10,
        "top_skills": ["Case frameworks (MECE, BCG matrix)", "Excel", "PowerPoint storytelling", "Problem decomposition", "Communication"],
        "top_certs": [
            {"name": "Consulting Approach Specialisation", "provider": "Coursera/Emory", "free": True, "weeks": 5},
            {"name": "Excel Skills for Business", "provider": "Coursera/Macquarie", "free": True, "weeks": 6},
            {"name": "Business Strategy Specialisation", "provider": "Coursera/UVA", "free": True, "weeks": 8},
        ],
        "hiring_companies": ["Deloitte USI", "EY GDS", "KPMG", "PwC", "Accenture Strategy", "BCG Platinion", "Gartner", "Alvarez & Marsal", "McKinsey (lateral)"],
    },
]


# ── Full company directory ────────────────────────────────────────────────────

COMPANIES: list[dict] = [
    # ── BFSI ──────────────────────────────────────────────────────────────────
    {"name": "HDFC Bank", "sector": "BFSI", "tracks": ["finance", "sales_bdm", "hr"],
     "roles": ["Sales Trainee", "Credit Analyst", "Relationship Manager"],
     "process": "Aptitude test → HR interview", "package": "₹3.5–5 LPA", "tier": "tier1",
     "website": "https://www.hdfcbank.com/careers"},
    {"name": "ICICI Bank", "sector": "BFSI", "tracks": ["finance", "sales_bdm"],
     "roles": ["PO Programme", "Sales Officer", "Credit Officer"],
     "process": "Online test → GD → PI", "package": "₹4–5.5 LPA", "tier": "tier1",
     "website": "https://www.icicicareers.com"},
    {"name": "Axis Bank", "sector": "BFSI", "tracks": ["finance", "sales_bdm"],
     "roles": ["Young Bankers Programme", "Relationship Executive"],
     "process": "Aptitude → HR → Operations round", "package": "₹3.5–5 LPA", "tier": "tier1",
     "website": "https://www.axisbank.com/careers"},
    {"name": "Kotak Mahindra Bank", "sector": "BFSI", "tracks": ["finance", "sales_bdm"],
     "roles": ["Sales Officer", "Wealth Associate"],
     "process": "Online test → PI", "package": "₹4–5.5 LPA", "tier": "tier1",
     "website": "https://careers.kotak.com"},
    {"name": "Bajaj Finserv", "sector": "BFSI", "tracks": ["finance", "sales_bdm"],
     "roles": ["Management Trainee", "Sales Officer", "Credit Analyst"],
     "process": "Aptitude → GD → PI", "package": "₹4–6 LPA", "tier": "tier1",
     "website": "https://www.bajajfinserv.in/careers"},
    {"name": "PolicyBazaar", "sector": "BFSI / InsurTech", "tracks": ["sales_bdm", "digital_marketing"],
     "roles": ["Sales Executive", "Relationship Manager"],
     "process": "HR call → Sales round", "package": "₹3–4.5 LPA + incentives", "tier": "tier2",
     "website": "https://careers.policybazaar.com"},

    # ── Consulting / BPO / KPO ────────────────────────────────────────────────
    {"name": "Deloitte USI", "sector": "Consulting / Advisory", "tracks": ["consulting", "finance", "business_analyst", "data_analyst"],
     "roles": ["Analyst", "Process Associate", "BA Trainee"],
     "process": "Aptitude → Case interview → HR", "package": "₹5–7 LPA", "tier": "tier1",
     "website": "https://jobs2.deloitte.com/in"},
    {"name": "EY GDS", "sector": "Consulting / Advisory", "tracks": ["consulting", "finance", "business_analyst"],
     "roles": ["Associate", "Analyst", "Tax Associate"],
     "process": "Online test → Technical → HR", "package": "₹4.5–6.5 LPA", "tier": "tier1",
     "website": "https://careers.ey.com"},
    {"name": "KPMG", "sector": "Consulting / Advisory", "tracks": ["consulting", "finance", "data_analyst"],
     "roles": ["Analyst", "Associate", "Tax Analyst"],
     "process": "Aptitude → Case study → HR", "package": "₹5–7 LPA", "tier": "tier1",
     "website": "https://home.kpmg/xx/en/home/careers.html"},
    {"name": "PwC", "sector": "Consulting / Advisory", "tracks": ["consulting", "finance"],
     "roles": ["Associate", "Finance Analyst"],
     "process": "Online assessment → PI → HR", "package": "₹5–6.5 LPA", "tier": "tier1",
     "website": "https://www.pwc.in/careers.html"},
    {"name": "Accenture", "sector": "Consulting / IT", "tracks": ["business_analyst", "operations", "data_analyst"],
     "roles": ["Associate Software Engineer", "Operations Analyst", "BA"],
     "process": "Aptitude → Comm test → HR", "package": "₹4.5–6 LPA", "tier": "tier1",
     "website": "https://www.accenture.com/in-en/careers"},
    {"name": "Genpact", "sector": "BPO / Analytics", "tracks": ["business_analyst", "finance", "hr"],
     "roles": ["Process Associate", "Finance Analyst", "HR Associate"],
     "process": "Aptitude → Versant English → HR", "package": "₹3.5–5 LPA", "tier": "tier2",
     "website": "https://careers.genpact.com"},
    {"name": "WNS Global", "sector": "BPO / Analytics", "tracks": ["business_analyst", "finance", "operations"],
     "roles": ["Process Associate", "Finance Executive"],
     "process": "Aptitude → Voice/Accent → HR", "package": "₹3–4.5 LPA", "tier": "tier2",
     "website": "https://www.wns.com/careers"},
    {"name": "Capgemini", "sector": "IT / Consulting", "tracks": ["business_analyst", "data_analyst"],
     "roles": ["Analyst", "Business Analyst Trainee"],
     "process": "AMCAT → Technical → HR", "package": "₹4–5.5 LPA", "tier": "tier2",
     "website": "https://www.capgemini.com/in-en/careers"},

    # ── FMCG / Retail ────────────────────────────────────────────────────────
    {"name": "Hindustan Unilever (HUL)", "sector": "FMCG", "tracks": ["sales_bdm", "operations", "digital_marketing"],
     "roles": ["Management Trainee", "Sales Officer", "Brand Executive"],
     "process": "Online assessment → Case → PI", "package": "₹6–8 LPA", "tier": "tier1",
     "website": "https://www.unilever.com/careers/"},
    {"name": "ITC Limited", "sector": "FMCG", "tracks": ["sales_bdm", "operations"],
     "roles": ["Management Trainee", "Area Sales Manager Trainee"],
     "process": "Written test → GD → PI", "package": "₹5.5–7 LPA", "tier": "tier1",
     "website": "https://www.itcportal.com/careers/"},
    {"name": "Marico", "sector": "FMCG", "tracks": ["sales_bdm", "digital_marketing"],
     "roles": ["Management Trainee"],
     "process": "Resume shortlist → Case → Interviews", "package": "₹5–7 LPA", "tier": "tier1",
     "website": "https://www.marico.com/india/career"},
    {"name": "DMart (Avenue Supermarts)", "sector": "Retail", "tracks": ["operations", "sales_bdm"],
     "roles": ["Management Trainee", "Operations Executive"],
     "process": "Walk-in / Campus drive → HR", "package": "₹3.5–5 LPA", "tier": "tier2",
     "website": "https://www.dmartindia.com/career"},

    # ── E-commerce / Startups ─────────────────────────────────────────────────
    {"name": "Amazon India", "sector": "E-commerce / Tech", "tracks": ["operations", "business_analyst", "data_analyst"],
     "roles": ["Operations Manager Trainee", "Analyst", "Associate"],
     "process": "Online test → Loop interviews", "package": "₹4.5–7 LPA", "tier": "tier1",
     "website": "https://www.amazon.jobs/en/locations/india"},
    {"name": "Flipkart", "sector": "E-commerce", "tracks": ["operations", "business_analyst", "digital_marketing"],
     "roles": ["Operations Executive", "Category Analyst", "Marketing Executive"],
     "process": "Aptitude → Case study → HR", "package": "₹4.5–6.5 LPA", "tier": "tier1",
     "website": "https://careers.flipkart.com"},
    {"name": "Nykaa", "sector": "E-commerce / Beauty", "tracks": ["digital_marketing", "sales_bdm", "operations"],
     "roles": ["Digital Marketing Executive", "Brand Executive", "Operations"],
     "process": "Portfolio review → HR → Case", "package": "₹3.5–5.5 LPA", "tier": "tier2",
     "website": "https://careers.nykaa.com"},
    {"name": "Meesho", "sector": "E-commerce / Social Commerce", "tracks": ["sales_bdm", "operations", "business_analyst"],
     "roles": ["Supplier Success Executive", "Growth Associate"],
     "process": "Case study → Interviews", "package": "₹4–6 LPA", "tier": "tier2",
     "website": "https://meesho.io/careers"},
    {"name": "Zomato / Blinkit", "sector": "Food-tech / Quick Commerce", "tracks": ["operations", "digital_marketing", "sales_bdm"],
     "roles": ["City Operations Executive", "Marketing Executive"],
     "process": "Aptitude → Case → HR", "package": "₹4–5.5 LPA", "tier": "tier2",
     "website": "https://www.zomato.com/careers"},

    # ── IT Services (non-tech roles) ──────────────────────────────────────────
    {"name": "TCS BPS", "sector": "IT Services / BPO", "tracks": ["business_analyst", "hr", "finance"],
     "roles": ["Process Executive", "Finance Analyst", "HR Associate"],
     "process": "TCS NQT → HR", "package": "₹3.5–4.5 LPA", "tier": "tier2",
     "website": "https://www.tcs.com/careers"},
    {"name": "Infosys BPM", "sector": "IT Services / BPO", "tracks": ["business_analyst", "finance", "operations"],
     "roles": ["Process Executive", "Operations Analyst"],
     "process": "Infosys HackWithInfy / Campus → HR", "package": "₹3.5–4.5 LPA", "tier": "tier2",
     "website": "https://www.infosys.com/careers/"},
    {"name": "Wipro", "sector": "IT Services / BPO", "tracks": ["business_analyst", "hr", "operations"],
     "roles": ["Process Analyst", "HR Analyst"],
     "process": "NLTH test → HR", "package": "₹3.5–4.5 LPA", "tier": "tier2",
     "website": "https://careers.wipro.com"},

    # ── Insurance ─────────────────────────────────────────────────────────────
    {"name": "HDFC Life", "sector": "Insurance", "tracks": ["sales_bdm", "finance"],
     "roles": ["Relationship Manager", "Sales Officer", "Financial Consultant"],
     "process": "Direct HR → Sales assessment", "package": "₹3–4.5 LPA + incentives", "tier": "tier2",
     "website": "https://www.hdfclife.com/careers"},
    {"name": "Max Life Insurance", "sector": "Insurance", "tracks": ["sales_bdm", "finance"],
     "roles": ["Sales Executive", "Financial Advisor"],
     "process": "Walk-in → HR → Training", "package": "₹3–4.5 LPA + incentives", "tier": "tier3",
     "website": "https://www.maxlifeinsurance.com/careers"},

    # ── Analytics / Research ──────────────────────────────────────────────────
    {"name": "Nielsen IQ", "sector": "Market Research / Analytics", "tracks": ["data_analyst", "consulting"],
     "roles": ["Research Analyst", "Data Analyst"],
     "process": "Aptitude → Analytical round → HR", "package": "₹4–5.5 LPA", "tier": "tier2",
     "website": "https://nielseniq.com/global/en/careers/"},
    {"name": "CRISIL (S&P)", "sector": "Financial Research", "tracks": ["finance", "data_analyst"],
     "roles": ["Research Analyst", "Ratings Analyst"],
     "process": "Test → Technical → HR", "package": "₹4.5–6 LPA", "tier": "tier2",
     "website": "https://www.crisil.com/en/home/careers.html"},
]


def get_companies_for_track(track_slug: str | None) -> list[dict]:
    """Return companies filtered by career track. If track is None, return all."""
    if not track_slug:
        return COMPANIES
    return [c for c in COMPANIES if not track_slug or track_slug in c.get("tracks", [])]


def get_track_by_slug(slug: str) -> dict | None:
    """Look up a career track definition by its slug."""
    for t in CAREER_TRACKS:
        if t["slug"] == slug:
            return t
    return None


def score_tracks_for_profile(program_str: str, subjects: list[str]) -> list[dict]:
    """
    Score all tracks against the student's degree and subjects.
    Returns tracks sorted by fit_score descending.
    Used to pre-rank before the LLM call so we only send the top-N to the LLM.
    """
    degree_profile = resolve_degree_profile(program_str)
    degree_key = _detect_degree_key(program_str)
    subject_lower = [s.lower() for s in subjects]

    scored = []
    for track in CAREER_TRACKS:
        score = 0

        # +30 if degree matches
        if any(dk in track["relevant_degree_keywords"] for dk in [degree_key, "default"]):
            score += 30

        # +up to 40 for subject overlap
        relevant = track.get("relevant_subjects", [])
        matched = sum(
            1 for rs in relevant
            if any(rs.lower() in sl or sl in rs.lower() for sl in subject_lower)
        )
        score += min(40, matched * 10)

        # +rising demand bonus
        if track.get("demand_trend") == "rising":
            score += 15

        # Short timeline bonus (quick to placement-ready)
        tl = track.get("timeline_months", 12)
        if tl <= 5:
            score += 15
        elif tl <= 8:
            score += 8

        scored.append({**track, "fit_score": min(100, score)})

    scored.sort(key=lambda t: t["fit_score"], reverse=True)
    return scored


def _detect_degree_key(program_str: str) -> str:
    p = (program_str or "").lower()
    if any(k in p for k in ["bba", "business admin", "management"]):
        return "bba"
    if any(k in p for k in ["mba", "master of business"]):
        return "mba"
    if any(k in p for k in ["b.com", "bcom", "commerce"]):
        return "bcom"
    if any(k in p for k in ["b.tech", "btech", "b.e.", "engineering"]):
        return "btech"
    if any(k in p for k in ["b.sc", "bsc", "science"]):
        return "bsc"
    return "bba"  # sensible default for this app's user base
