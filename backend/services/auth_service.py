from scrapers.portal_scraper import PortalScraper


def login_user(roll_number: str, password: str) -> dict:
    scraper = PortalScraper()
    return scraper.login(roll_number=roll_number, password=password)
