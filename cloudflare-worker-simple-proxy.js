/**
 * Cloudflare Worker - Simple HTTP Proxy (No Session Management)
 * 
 * STRATEGY: Python backend manages all cookies. Worker is just a dumb proxy
 * that forwards requests with Cookie headers from Python to the portal.
 * 
 * How it works:
 * 1. Python sends Cookie header with stored cookies
 * 2. Worker forwards Cookie header to portal (no storage)
 * 3. Portal responds with data or Set-Cookie
 * 4. Worker forwards response back to Python (including Set-Cookie)
 * 5. Python extracts and stores cookies in database
 * 
 * Benefits:
 * - Simpler worker code (no session management)
 * - Python has full control over cookie lifecycle
 * - No worker restarts = no lost sessions
 * - Easier debugging (all state in Python/database)
 */

const PORTAL_BASE = 'http://111.93.16.209';

// CORS headers for Python backend
const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Cookie, X-Session-ID, X-Request-ID, Referer, User-Agent',
  'Access-Control-Expose-Headers': 'Set-Cookie',
  'Access-Control-Allow-Credentials': 'true',
};

export default {
  async fetch(request, env, ctx) {
    // Handle CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: CORS_HEADERS
      });
    }
    
    const url = new URL(request.url);
    
    // Health check endpoint
    if (url.pathname === '/health' || url.pathname === '/') {
      return new Response(JSON.stringify({
        status: 'ok',
        worker: 'cloudflare-simple-proxy',
        version: '1.0.0',
        timestamp: new Date().toISOString(),
        portal: PORTAL_BASE
      }), {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          ...CORS_HEADERS
        }
      });
    }
    
    // Build target URL (forward path and query to portal)
    const targetPath = url.pathname + url.search;
    const targetUrl = `${PORTAL_BASE}${targetPath}`;
    
    // Build request headers for portal
    const portalHeaders = new Headers();
    
    // Copy relevant headers from Python request
    const headersToForward = [
      'cookie',
      'content-type',
      'accept',
      'accept-language',
      'accept-encoding',
      'user-agent',
      'referer',
      'origin',
      'cache-control',
      'upgrade-insecure-requests'
    ];
    
    for (const header of headersToForward) {
      const value = request.headers.get(header);
      if (value) {
        portalHeaders.set(header, value);
      }
    }
    
    // Override Host to portal
    portalHeaders.set('Host', '111.93.16.209');
    
    // Fix Referer if it points to worker
    const referer = request.headers.get('Referer');
    if (referer && referer.includes('workers.dev')) {
      const refererPath = new URL(referer).pathname + new URL(referer).search;
      portalHeaders.set('Referer', `${PORTAL_BASE}${refererPath}`);
    }
    
    // Fix Origin if it points to worker
    const origin = request.headers.get('Origin');
    if (origin && origin.includes('workers.dev')) {
      portalHeaders.set('Origin', PORTAL_BASE);
    }
    
    try {
      // Forward request to portal (no cookie management, just forward)
      const portalResponse = await fetch(targetUrl, {
        method: request.method,
        headers: portalHeaders,
        body: request.method !== 'GET' && request.method !== 'HEAD' 
          ? await request.arrayBuffer() 
          : undefined,
        redirect: 'manual', // Let Python handle redirects
      });
      
      // Build response headers (forward everything including Set-Cookie)
      const responseHeaders = new Headers();
      
      // Copy all headers from portal response
      for (const [key, value] of portalResponse.headers.entries()) {
        // Don't modify any headers, just forward them
        responseHeaders.set(key, value);
      }
      
      // Add CORS headers for Python backend
      for (const [key, value] of Object.entries(CORS_HEADERS)) {
        responseHeaders.set(key, value);
      }
      
      // Handle Set-Cookie specially (use getSetCookie for multiple values)
      const setCookies = portalResponse.headers.getSetCookie?.() || [];
      if (setCookies.length > 0) {
        // Forward all Set-Cookie headers
        for (const cookie of setCookies) {
          responseHeaders.append('Set-Cookie', cookie);
        }
      }
      
      // Create response with same body and status
      const responseBody = await portalResponse.arrayBuffer();
      
      return new Response(responseBody, {
        status: portalResponse.status,
        statusText: portalResponse.statusText,
        headers: responseHeaders
      });
      
    } catch (error) {
      // Return error response
      return new Response(JSON.stringify({
        error: 'Worker proxy error',
        message: error.message,
        target: targetUrl,
        timestamp: new Date().toISOString()
      }), {
        status: 502,
        headers: {
          'Content-Type': 'application/json',
          ...CORS_HEADERS
        }
      });
    }
  },
};
