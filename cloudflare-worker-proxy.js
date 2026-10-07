/**
 * Cloudflare Worker - Session-Managing Portal Proxy
 * 
 * STRATEGY: Instead of trying to pass cookies to/from Python (doesn't work
 * cross-domain), we maintain the portal session INSIDE the worker using
 * a custom session ID that the client sends.
 * 
 * How it works:
 * 1. Client sends X-Session-ID header with each request
 * 2. Worker maps that ID to portal cookies (stored in memory)
 * 3. Worker uses those cookies when talking to portal
 * 4. Portal's Set-Cookie responses are captured and stored for that session
 * 
 * Deploy to all 10 workers.
 */

const PORTAL_BASE = 'http://111.93.16.209';

// In-memory session storage (portal cookies keyed by client session ID)
// Note: This resets when worker restarts, but that's fine since sessions
// are short-lived (single login flow per request)
const sessionStore = new Map();

// Clean up old sessions after 10 minutes
const SESSION_TTL_MS = 10 * 60 * 1000;

function cleanupOldSessions() {
  const now = Date.now();
  for (const [sessionId, data] of sessionStore.entries()) {
    if (now - data.lastUsed > SESSION_TTL_MS) {
      sessionStore.delete(sessionId);
    }
  }
}

function parseCookies(cookieHeader) {
  if (!cookieHeader) return {};
  const cookies = {};
  cookieHeader.split(';').forEach(cookie => {
    const [name, value] = cookie.trim().split('=');
    if (name && value) {
      cookies[name] = value;
    }
  });
  return cookies;
}

function serializeCookies(cookiesObj) {
  return Object.entries(cookiesObj)
    .map(([name, value]) => `${name}=${value}`)
    .join('; ');
}

function updateSessionCookies(sessionId, setCookieHeaders) {
  if (!sessionId) return;
  
  const sessionData = sessionStore.get(sessionId) || { cookies: {}, lastUsed: Date.now() };
  
  // Parse Set-Cookie headers and update stored cookies
  setCookieHeaders.forEach(header => {
    const match = header.match(/^([^=]+)=([^;]+)/);
    if (match) {
      const [, name, value] = match;
      sessionData.cookies[name] = value;
    }
  });
  
  sessionData.lastUsed = Date.now();
  sessionStore.set(sessionId, sessionData);
}

export default {
  async fetch(request) {
    // Clean up old sessions periodically
    if (Math.random() < 0.01) {
      cleanupOldSessions();
    }
    
    const url = new URL(request.url);
    const targetPath = url.pathname + url.search;
    const targetUrl = `${PORTAL_BASE}${targetPath}`;
    
    // Get session ID from client header
    const sessionId = request.headers.get('X-Session-ID') || request.headers.get('X-Request-ID');
    
    // Build request headers
    const requestHeaders = new Headers();
    
    // Copy most headers from client
    for (const [key, value] of request.headers.entries()) {
      if (!key.toLowerCase().startsWith('x-session') && 
          !key.toLowerCase().startsWith('x-request') &&
          key.toLowerCase() !== 'host' &&
          key.toLowerCase() !== 'origin' &&
          key.toLowerCase() !== 'referer') {
        requestHeaders.set(key, value);
      }
    }
    
    // Set portal-specific headers
    requestHeaders.set('Host', '111.93.16.209');
    
    // Fix referer to point to portal
    const referer = request.headers.get('Referer');
    if (referer && referer.includes('workers.dev')) {
      const refererPath = new URL(referer).pathname + new URL(referer).search;
      requestHeaders.set('Referer', `${PORTAL_BASE}${refererPath}`);
    } else if (referer) {
      requestHeaders.set('Referer', referer);
    }
    
    // Fix origin
    const origin = request.headers.get('Origin');
    if (origin && origin.includes('workers.dev')) {
      requestHeaders.set('Origin', PORTAL_BASE);
    } else if (origin) {
      requestHeaders.set('Origin', origin);
    }
    
    // Add stored cookies for this session (if any)
    if (sessionId) {
      const sessionData = sessionStore.get(sessionId);
      if (sessionData && Object.keys(sessionData.cookies).length > 0) {
        const cookieHeader = serializeCookies(sessionData.cookies);
        requestHeaders.set('Cookie', cookieHeader);
      }
    }
    
    try {
      // Make request to portal
      const response = await fetch(targetUrl, {
        method: request.method,
        headers: requestHeaders,
        body: request.method !== 'GET' && request.method !== 'HEAD' 
          ? await request.arrayBuffer() 
          : undefined,
        redirect: 'manual',
      });
      
      // Capture Set-Cookie headers from portal
      const setCookieHeaders = response.headers.getSetCookie?.() || [];
      
      // Update session storage with new cookies
      if (sessionId && setCookieHeaders.length > 0) {
        updateSessionCookies(sessionId, setCookieHeaders);
      }
      
      // Build response (don't send Set-Cookie to client, we manage it server-side)
      const responseHeaders = new Headers();
      for (const [key, value] of response.headers.entries()) {
        if (key.toLowerCase() !== 'set-cookie') {
          responseHeaders.set(key, value);
        }
      }
      
      // Add CORS if needed
      responseHeaders.set('Access-Control-Allow-Origin', request.headers.get('Origin') || '*');
      responseHeaders.set('Access-Control-Allow-Credentials', 'true');
      responseHeaders.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
      responseHeaders.set('Access-Control-Allow-Headers', 'Content-Type, X-Session-ID, X-Request-ID');
      
      // Handle OPTIONS preflight
      if (request.method === 'OPTIONS') {
        return new Response(null, {
          status: 204,
          headers: responseHeaders,
        });
      }
      
      return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers: responseHeaders,
      });
      
    } catch (error) {
      console.error('Portal proxy error:', error);
      
      return new Response(
        JSON.stringify({
          error: 'Portal proxy failed',
          message: error.message,
          target: targetUrl,
        }),
        {
          status: 502,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
          },
        }
      );
    }
  },
};
