/**
 * Shared OpsHUB Email Template Generator
 * Provides a uniform, responsive, branded HTML email template for all automated dispatches.
 */

export function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function getBaseUrl(req) {
  if (req && req.headers) {
    const proto = req.headers['x-forwarded-proto'] || 'https';
    const host = req.headers['x-forwarded-host'] || req.headers.host;
    if (host) return `${proto}://${host}`;
  }
  return process.env.APP_BASE_URL || (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : 'https://operations-hub-iota.vercel.app');
}

/**
 * Wraps email content into the standardized OpsHUB email layout.
 *
 * @param {Object} options
 * @param {string} options.headerTitle Main heading in gradient banner
 * @param {string} [options.headerSubtitle] Sub-heading in banner (defaults to 'PSA KALINGA • OpsHUB')
 * @param {'teal'|'emerald'|'rose'|'indigo'|string} [options.theme='teal'] Theme preset or hex color for gradient
 * @param {string} options.bodyHtml HTML string to display inside the card body
 * @param {string} [options.footerNote] Extra text in footer before disclaimer
 * @returns {string} Fully structured HTML email string
 */
export function renderEmailLayout({
  headerTitle,
  headerSubtitle = 'PSA KALINGA &bull; OpsHUB',
  theme = 'teal',
  bodyHtml = '',
  footerNote = ''
}) {
  let themeColor = '#0f766e'; // default teal
  if (theme === 'emerald') themeColor = '#059669';
  else if (theme === 'rose') themeColor = '#e11d48';
  else if (theme === 'indigo') themeColor = '#4f46e5';
  else if (theme && theme.startsWith('#')) themeColor = theme;

  return `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 600px; margin: 0 auto; background-color: #ffffff; border: 1px solid #e2e8f0; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05);">
      <!-- Brand Header Banner -->
      <div style="background: linear-gradient(135deg, ${themeColor} 0%, #0f172a 100%); padding: 24px; color: #ffffff;">
        <div style="font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 1px; color: rgba(255, 255, 255, 0.85); margin-bottom: 4px;">
          ${headerSubtitle}
        </div>
        <h2 style="margin: 0; font-size: 20px; font-weight: 700; color: #ffffff; line-height: 1.3;">
          ${escapeHtml(headerTitle)}
        </h2>
      </div>

      <!-- Main Email Body -->
      <div style="padding: 24px; color: #334155; line-height: 1.6; font-size: 14px;">
        ${bodyHtml}
      </div>

      <!-- Standardized Footer -->
      <div style="border-top: 1px solid #e2e8f0; padding: 16px 24px; background-color: #f8fafc; font-size: 12px; color: #64748b; line-height: 1.5;">
        ${footerNote ? `<p style="margin: 0 0 6px 0; color: #475569;">${footerNote}</p>` : ''}
        <p style="margin: 0;"><strong>Please do not reply to this email.</strong> This is an automated notification from OpsHUB.</p>
      </div>
    </div>
  `.trim();
}
