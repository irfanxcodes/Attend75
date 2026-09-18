/**
 * Browser-side portal scraper — currently disabled.
 * The GitHub Actions fallback in auth_service handles server-side scraping.
 * This module is kept as a placeholder for future browser-side implementation.
 */

export async function portalLoginViaFrame() {
  throw Object.assign(
    new Error('Browser scraper not available'),
    { portalCode: 'PORTAL_UNREACHABLE' }
  )
}
