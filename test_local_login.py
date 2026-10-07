import requests, re
import os
from bs4 import BeautifulSoup

BASE = 'http://111.93.16.209/sz'
LOGIN = BASE + '/login.aspx'
ROLL_NUMBER = os.environ.get('PORTAL_ROLL_NUMBER', '').strip().upper()
PASSWORD = os.environ.get('PORTAL_PASSWORD', '')

if not ROLL_NUMBER or not PASSWORD:
    raise SystemExit('Set PORTAL_ROLL_NUMBER and PORTAL_PASSWORD before running this helper.')

session = requests.Session()
session.headers.update({'User-Agent': 'Mozilla/5.0 (Linux; Android 8.0.0; SM-G955U Build/R16NW) AppleWebKit/537.36'})

r = session.get(LOGIN, timeout=10)
soup = BeautifulSoup(r.text, 'html.parser')
payload = {}
for inp in soup.find_all('input', {'type': 'hidden'}):
    n = (inp.get('name') or '').strip()
    if n:
        payload[n] = (inp.get('value') or '').strip()

cr = session.get(BASE + '/captchimage.ashx', timeout=8)
chars = re.findall(r'<text[^>]+\bx=["\'](\d+(?:\.\d+)?)["\'][^>]*>([^<]+)</text>', cr.text)
captcha = ''.join(c.strip() for _, c in sorted(chars, key=lambda m: float(m[0]))).upper()
print('Captcha:', captcha)

payload.update({
    'txtLogin': ROLL_NUMBER,
    'txtPassword': PASSWORD,
    'bl': 'Student',
    'btnSubmit': 'Submit',
    'txtCaptcha': captcha,
})

resp = session.post(LOGIN, data=payload, timeout=15, allow_redirects=True,
    headers={'Referer': LOGIN, 'Origin': 'http://111.93.16.209'})

rsoup = BeautifulSoup(resp.text, 'html.parser')
lbl = rsoup.find(id='lblmsg')
still = rsoup.find('input', {'name': 'txtLogin'}) is not None
print('Portal msg:', lbl.get_text(strip=True) if lbl else 'none')
print('Still on login page:', still)
print('Final URL:', resp.url)

if not still:
    print('LOGIN POST SUCCESS - checking Index.aspx...')
    ir = session.get(BASE + '/Index.aspx', timeout=20, headers={'Referer': LOGIN})
    isoup = BeautifulSoup(ir.text, 'html.parser')
    name = isoup.find(id='lblName')
    print('Student name:', name.get_text(strip=True) if name else 'not found')
    print('Back to login:', isoup.find('input', {'name': 'txtLogin'}) is not None)
