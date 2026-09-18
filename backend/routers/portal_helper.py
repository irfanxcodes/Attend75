"""
Portal helper page — served over HTTP so the browser can make
cross-origin HTTP requests to the college portal without mixed-content errors.

The page is loaded in a hidden iframe on the HTTPS main site.
It communicates results back via postMessage.
"""
from fastapi import APIRouter
from fastapi.responses import HTMLResponse

router = APIRouter(tags=["portal-helper"])

HELPER_HTML = """<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><title>Portal Helper</title></head>
<body>
<script>
const PORTAL = 'http://111.93.16.209/sz';

function extractHidden(html) {
  const fields = {};
  const re = /<input[^>]+type=["']hidden["'][^>]*>/gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    const n = m[0].match(/name=["']([^"']+)["']/);
    const v = m[0].match(/value=["']([^"']*)["']/);
    if (n) fields[n[1]] = v ? v[1] : '';
  }
  return fields;
}

function solveSvg(svg) {
  const matches = [...svg.matchAll(/<text[^>]*>\\s*([^<\\s][^<]*?)\\s*<\\/text>/gi)];
  return matches.map(m => m[1].trim()).join('');
}

function encode(data) {
  return Object.entries(data).map(([k,v]) => encodeURIComponent(k)+'='+encodeURIComponent(v)).join('&');
}

function reply(data) {
  window.parent.postMessage(data, '*');
}

async function doLogin(rollNumber, password) {
  try {
    // GET login page
    const resp = await fetch(PORTAL + '/login.aspx', {credentials: 'include'});
    const html = await resp.text();
    const fields = extractHidden(html);

    // Solve captcha
    const captchaMatch = html.match(/id="captchaImage"[^>]+src="([^"]+)"/);
    if (captchaMatch) {
      const src = captchaMatch[1];
      const captchaUrl = src.startsWith('http') ? src : PORTAL + '/' + src.replace(/^\\/sz\\//, '').replace(/^\\//, '');
      const cr = await fetch(captchaUrl, {credentials: 'include'});
      const svg = await cr.text();
      const captcha = solveSvg(svg);
      if (captcha) fields.txtCaptcha = captcha;
    }

    Object.assign(fields, {txtLogin: rollNumber.toUpperCase(), txtPassword: password, bl: 'Student', btnSubmit: 'Submit'});

    // POST login — allow_redirects so cookies get set automatically by browser
    const postResp = await fetch(PORTAL + '/login.aspx', {
      method: 'POST',
      credentials: 'include',
      headers: {'Content-Type': 'application/x-www-form-urlencoded', 'Referer': PORTAL + '/login.aspx'},
      body: encode(fields),
      redirect: 'follow',
    });

    const postHtml = await postResp.text();
    const finalUrl = postResp.url || '';

    if (finalUrl.includes('login') || finalUrl.includes('Login')) {
      const errMatch = postHtml.match(/class="[^"]*(?:help-block|text-danger)[^"]*"[^>]*>\\s*([^<]+?)/);
      const errMsg = errMatch ? errMatch[1].trim() : '';
      const lower = errMsg.toLowerCase();
      const code = lower.includes('password') ? 'INCORRECT_PASSWORD' : lower.includes('invalid') ? 'INVALID_USERNAME' : 'LOGIN_FAILED';
      reply({type: 'LOGIN_ERROR', code, message: errMsg || 'Login failed'});
      return;
    }

    // Login succeeded — now fetch attendance
    const attResp = await fetch(PORTAL + '/AttendanceDashboard.aspx', {
      credentials: 'include',
      headers: {Referer: PORTAL + '/Index.aspx'},
    });
    const attHtml = await attResp.text();

    // Check if we got real data
    let finalAttHtml = attHtml;
    if (!attHtml.includes('ad-card') && !attHtml.includes('<table')) {
      const fallback = await fetch(PORTAL + '/CommonS.aspx?qs=ap', {
        credentials: 'include',
        headers: {Referer: PORTAL + '/Index.aspx'},
      });
      finalAttHtml = await fallback.text();
    }

    // Get courses for abbreviations — try semester from attendance
    const semMatch = finalAttHtml.match(/value="(\\d+)"[^>]*selected/);
    const semId = semMatch ? semMatch[1] : '';
    let coursesHtml = '';
    try {
      const cr = await fetch(PORTAL + '/rc/cr.aspx', {credentials: 'include', headers: {Referer: PORTAL + '/Index.aspx'}});
      coursesHtml = await cr.text();
      if (semId) {
        const soup = new DOMParser().parseFromString(coursesHtml, 'text/html');
        const sel = soup.querySelector('select[name="ddlSem"]');
        if (sel) {
          const hiddenInputs = {};
          soup.querySelectorAll('input[type="hidden"]').forEach(i => { if(i.name) hiddenInputs[i.name] = i.value; });
          const onchange = sel.getAttribute('onchange') || '';
          const evtMatch = onchange.match(/__doPostBack\\('([^']+)'/);
          const evt = evtMatch ? evtMatch[1] : 'ddlSem';
          const cr2 = await fetch(PORTAL + '/rc/cr.aspx', {
            method: 'POST', credentials: 'include',
            headers: {'Content-Type': 'application/x-www-form-urlencoded', Referer: PORTAL + '/rc/cr.aspx'},
            body: encode({...hiddenInputs, __EVENTTARGET: evt, __EVENTARGUMENT: '', ddlSem: semId}),
          });
          coursesHtml = await cr2.text();
        }
      }
    } catch(e) { /* non-critical */ }

    reply({
      type: 'LOGIN_SUCCESS',
      attendanceHtml: finalAttHtml,
      coursesHtml,
      selectedSemester: semId || null,
    });

  } catch(e) {
    reply({type: 'LOGIN_ERROR', code: 'PORTAL_UNREACHABLE', message: e.message});
  }
}

// Listen for instructions from parent frame
window.addEventListener('message', (e) => {
  if (e.data && e.data.type === 'DO_LOGIN') {
    doLogin(e.data.rollNumber, e.data.password);
  }
});

// Signal ready
reply({type: 'HELPER_READY'});
</script>
</body>
</html>"""


@router.get("/portal-helper", response_class=HTMLResponse)
async def portal_helper():
    """Served over HTTP — browser can make HTTP portal requests from here."""
    return HTMLResponse(content=HELPER_HTML, headers={
        "Access-Control-Allow-Origin": "*",
        "X-Frame-Options": "ALLOWALL",
        "Content-Security-Policy": "frame-ancestors *",
    })
