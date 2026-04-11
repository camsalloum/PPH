/**
 * emailService.js — Centralized email sending service
 *
 * Uses nodemailer with SMTP.  Configure via .env:
 *   SMTP_HOST, SMTP_PORT, SMTP_SECURE, SMTP_USER, SMTP_PASS, SMTP_FROM
 *
 * All send* functions are fire-and-forget by default (log errors, don't throw).
 */

const nodemailer = require('nodemailer');
const logger = require('../utils/logger');

// ── Transporter (created lazily on first use) ──────────────────────────────
let _transporter = null;
let _devMode = false;

async function getTransporter() {
  if (_transporter) return _transporter;

  // Dev mode: use Ethereal fake SMTP (emails are caught, never delivered)
  if (process.env.SMTP_DEV_MODE === 'true' || process.env.NODE_ENV === 'development') {
    try {
      const testAccount = await nodemailer.createTestAccount();
      _transporter = nodemailer.createTransport({
        host: 'smtp.ethereal.email',
        port: 587,
        secure: false,
        auth: { user: testAccount.user, pass: testAccount.pass },
      });
      _devMode = true;
      logger.info(`emailService: DEV MODE — Ethereal test account: ${testAccount.user}`);
      logger.info(`emailService: Emails will NOT be delivered. Preview URLs logged after each send.`);
      return _transporter;
    } catch (err) {
      logger.error('emailService: failed to create Ethereal account', err);
      return null;
    }
  }

  // Production: real SMTP
  const host = process.env.SMTP_HOST;
  const port = parseInt(process.env.SMTP_PORT || '587', 10);
  const secure = process.env.SMTP_SECURE === 'true';
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  if (!host || !user) {
    logger.warn('emailService: SMTP not configured (SMTP_HOST / SMTP_USER missing). Emails disabled.');
    return null;
  }

  _transporter = nodemailer.createTransport({
    host,
    port,
    secure,
    auth: { user, pass },
    tls: { rejectUnauthorized: false },
  });

  logger.info(`emailService: transporter ready → ${host}:${port} (secure=${secure})`);
  return _transporter;
}

const FROM = () => process.env.SMTP_FROM || process.env.SMTP_USER || 'noreply@propackhub.com';

// ── Generic send ───────────────────────────────────────────────────────────
async function sendEmail({ to, cc, subject, html, text }) {
  const transporter = await getTransporter();
  if (!transporter) {
    logger.warn(`emailService: skipped email to ${to} — no SMTP config`);
    return null;
  }
  try {
    const info = await transporter.sendMail({
      from: FROM(),
      to,
      cc: cc || undefined,
      subject,
      html,
      text: text || undefined,
    });
    logger.info(`emailService: sent "${subject}" → ${to} (messageId=${info.messageId})`);

    // In dev mode, log the Ethereal preview URL so you can view the email in browser
    if (_devMode) {
      const previewUrl = nodemailer.getTestMessageUrl(info);
      logger.info(`✉️  EMAIL PREVIEW: ${previewUrl}`);
      console.log(`\n✉️  EMAIL PREVIEW (open in browser):\n   ${previewUrl}\n`);
    }

    return info;
  } catch (err) {
    logger.error(`emailService: FAILED "${subject}" → ${to}`, err);
    return null;
  }
}

// ── QC Notification: samples sent to QC ────────────────────────────────────
/**
 * Send notification to QC Lab + QC Manager when samples from an inquiry
 * are marked "Sent to QC".
 *
 * @param {Object} opts
 * @param {Object} opts.inquiry     — inquiry row (inquiry_number, customer_name, ...)
 * @param {Array}  opts.samples     — array of sample rows being sent
 * @param {Array}  opts.attachments — all inquiry attachments (will filter by sample_id)
 * @param {string} opts.senderName  — name of the sales rep who triggered it
 * @param {string} opts.appUrl      — base app URL for links
 */
async function notifyQCSamplesReceived({ inquiry, samples, attachments = [], senderName, appUrl }) {
  const qcLabEmail = process.env.QC_LAB_EMAIL;
  const qcManagerEmail = process.env.QC_MANAGER_EMAIL;

  if (!qcLabEmail && !qcManagerEmail) {
    logger.warn('emailService: QC_LAB_EMAIL / QC_MANAGER_EMAIL not set, skipping QC notification');
    return null;
  }

  const to = [qcLabEmail, qcManagerEmail].filter(Boolean).join(', ');

  const sampleRows = samples.map((s, i) => {
    const sampleAtts = attachments.filter(a => a.sample_id === s.id);
    const attList = sampleAtts.length > 0
      ? sampleAtts.map(a => `<li style="font-size:12px;color:#555;">${a.file_name} <em>(${a.attachment_type})</em></li>`).join('')
      : '<li style="font-size:12px;color:#999;">No documents attached</li>';

    return `
      <tr style="border-bottom:1px solid #eee;">
        <td style="padding:10px;font-weight:bold;color:#1890ff;">${s.sample_number}</td>
        <td style="padding:10px;">${s.product_group || '-'}</td>
        <td style="padding:10px;">${s.sample_type || 'physical'}</td>
        <td style="padding:10px;">${s.estimated_quantity ? Number(s.estimated_quantity).toLocaleString() + ' ' + (s.quantity_unit || 'Kgs') : '-'}</td>
        <td style="padding:10px;font-size:12px;">${s.description || '-'}</td>
        <td style="padding:10px;"><ul style="margin:0;padding-left:16px;">${attList}</ul></td>
      </tr>`;
  }).join('');

  const totalFiles = samples.reduce((sum, s) => sum + attachments.filter(a => a.sample_id === s.id).length, 0);

  const html = `
    <div style="font-family:Arial,Helvetica,sans-serif;max-width:700px;margin:auto;">
      <div style="background:#1890ff;color:#fff;padding:16px 24px;border-radius:8px 8px 0 0;">
        <h2 style="margin:0;font-size:20px;">🔬 New Sample Analysis Request</h2>
        <p style="margin:4px 0 0;font-size:13px;opacity:0.9;">ProPack Hub — Flexible Packaging Division</p>
      </div>

      <div style="padding:20px 24px;background:#fff;border:1px solid #e8e8e8;border-top:none;">
        <p style="margin:0 0 12px;">
          <strong>${senderName || 'Sales Rep'}</strong> has sent
          <strong>${samples.length} sample${samples.length !== 1 ? 's' : ''}</strong>
          for quality analysis.
        </p>

        <table style="width:100%;border-collapse:collapse;margin-bottom:16px;font-size:13px;">
          <tr style="background:#f5f5f5;">
            <td style="padding:8px;"><strong>Inquiry:</strong></td>
            <td style="padding:8px;">${inquiry.inquiry_number}</td>
            <td style="padding:8px;"><strong>Customer:</strong></td>
            <td style="padding:8px;" colspan="3">${inquiry.customer_name}${inquiry.customer_country ? ' (' + inquiry.customer_country + ')' : ''}</td>
          </tr>
          <tr style="background:#f5f5f5;">
            <td style="padding:8px;"><strong>Priority:</strong></td>
            <td style="padding:8px;text-transform:capitalize;">${inquiry.priority || 'normal'}</td>
            <td style="padding:8px;"><strong>Total Files:</strong></td>
            <td style="padding:8px;" colspan="3">${totalFiles} document${totalFiles !== 1 ? 's' : ''} attached</td>
          </tr>
        </table>

        <h3 style="color:#1890ff;border-bottom:2px solid #1890ff;padding-bottom:6px;margin:20px 0 10px;">
          Sample Details (${samples.length})
        </h3>
        <table style="width:100%;border-collapse:collapse;font-size:13px;">
          <thead>
            <tr style="background:#fafafa;border-bottom:2px solid #ddd;">
              <th style="padding:8px;text-align:left;">Sample #</th>
              <th style="padding:8px;text-align:left;">Product Group</th>
              <th style="padding:8px;text-align:left;">Type</th>
              <th style="padding:8px;text-align:left;">Quantity</th>
              <th style="padding:8px;text-align:left;">Description</th>
              <th style="padding:8px;text-align:left;">Documents</th>
            </tr>
          </thead>
          <tbody>
            ${sampleRows}
          </tbody>
        </table>

        ${inquiry.notes ? `
        <div style="margin-top:16px;padding:12px;background:#f9f9f9;border-radius:6px;border-left:4px solid #1890ff;">
          <strong style="font-size:12px;color:#555;">Notes:</strong>
          <p style="margin:4px 0 0;font-size:13px;">${inquiry.notes}</p>
        </div>` : ''}

        <div style="margin-top:20px;text-align:center;">
          <a href="${appUrl || ''}/crm/inquiries/${inquiry.id}"
             style="display:inline-block;background:#1890ff;color:#fff;padding:10px 28px;border-radius:6px;text-decoration:none;font-weight:bold;">
            View Inquiry in ProPack Hub
          </a>
        </div>
      </div>

      <div style="padding:12px 24px;background:#fafafa;border:1px solid #e8e8e8;border-top:none;border-radius:0 0 8px 8px;text-align:center;">
        <p style="margin:0;font-size:11px;color:#999;">
          This is an automated notification from ProPack Hub MES.
          Please do not reply to this email.
        </p>
      </div>
    </div>
  `;

  const subject = `[SAR] ${inquiry.inquiry_number} — ${samples.length} sample${samples.length !== 1 ? 's' : ''} sent for QC analysis — ${inquiry.customer_name}`;

  return sendEmail({ to, subject, html });
}

// ── Send Quotation to Customer ─────────────────────────────────────────────
/**
 * Email a quotation PDF to the customer contact.
 * @param {Object} opts
 * @param {string} opts.to          — customer email
 * @param {string} opts.cc          — optional CC
 * @param {Object} opts.quotation   — quotation row
 * @param {Buffer} opts.pdfBuffer   — PDF attachment
 * @param {string} opts.senderName  — sales rep name
 */
async function sendQuotationEmail({ to, cc, quotation, pdfBuffer, senderName }) {
  if (!to) { logger.warn('emailService: no recipient for quotation email'); return null; }

  const html = `
    <div style="font-family:Arial,sans-serif;max-width:600px;margin:auto;">
      <div style="background:#1890ff;color:#fff;padding:16px 24px;border-radius:8px 8px 0 0;">
        <h2 style="margin:0;">Quotation ${quotation.quotation_number}</h2>
        <p style="margin:4px 0 0;font-size:13px;opacity:0.9;">ProPack Hub — Flexible Packaging</p>
      </div>
      <div style="padding:20px 24px;background:#fff;border:1px solid #e8e8e8;border-top:none;">
        <p>Dear Customer,</p>
        <p>Please find attached our quotation <strong>${quotation.quotation_number}</strong> for your inquiry.</p>
        <p>Total: <strong>${quotation.currency || 'AED'} ${parseFloat(quotation.total_price || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}</strong></p>
        ${quotation.valid_until ? `<p>Valid until: <strong>${new Date(quotation.valid_until).toLocaleDateString('en-GB')}</strong></p>` : ''}
        <p>Please do not hesitate to contact us for any questions.</p>
        <p>Best regards,<br/>${senderName || 'Sales Team'}</p>
      </div>
      <div style="padding:12px;background:#fafafa;border:1px solid #e8e8e8;border-top:none;border-radius:0 0 8px 8px;text-align:center;font-size:10px;color:#999;">
        ProPack Hub — Automated notification
      </div>
    </div>`;

  const transporter = await getTransporter();
  if (!transporter) { logger.warn('emailService: no SMTP for quotation email'); return null; }

  try {
    const info = await transporter.sendMail({
      from: FROM(),
      to,
      cc: cc || undefined,
      subject: `Quotation ${quotation.quotation_number} — ${quotation.customer_name || 'Customer'}`,
      html,
      attachments: pdfBuffer ? [{
        filename: `${quotation.quotation_number}.pdf`,
        content: pdfBuffer,
        contentType: 'application/pdf',
      }] : [],
    });
    logger.info(`emailService: quotation email sent → ${to} (${info.messageId})`);
    if (_devMode) console.log(`\n✉️  QUOTATION EMAIL PREVIEW: ${nodemailer.getTestMessageUrl(info)}\n`);
    return info;
  } catch (err) {
    logger.error(`emailService: quotation email FAILED → ${to}`, err);
    return null;
  }
}

// ── Send PI to Customer ────────────────────────────────────────────────────
async function sendPIEmail({ to, cc, pi, pdfBuffer, senderName }) {
  if (!to) { logger.warn('emailService: no recipient for PI email'); return null; }

  const html = `
    <div style="font-family:Arial,sans-serif;max-width:600px;margin:auto;">
      <div style="background:#722ed1;color:#fff;padding:16px 24px;border-radius:8px 8px 0 0;">
        <h2 style="margin:0;">Proforma Invoice ${pi.pi_number}</h2>
        <p style="margin:4px 0 0;font-size:13px;opacity:0.9;">ProPack Hub — Flexible Packaging</p>
      </div>
      <div style="padding:20px 24px;background:#fff;border:1px solid #e8e8e8;border-top:none;">
        <p>Dear Customer,</p>
        <p>Please find attached our Proforma Invoice <strong>${pi.pi_number}</strong>.</p>
        <p>Total: <strong>${pi.currency || 'AED'} ${parseFloat(pi.total_price || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}</strong></p>
        <p>Please proceed with the purchase order at your earliest convenience.</p>
        <p>Best regards,<br/>${senderName || 'Sales Team'}</p>
      </div>
      <div style="padding:12px;background:#fafafa;border:1px solid #e8e8e8;border-top:none;border-radius:0 0 8px 8px;text-align:center;font-size:10px;color:#999;">
        ProPack Hub — Automated notification
      </div>
    </div>`;

  const transporter = await getTransporter();
  if (!transporter) { logger.warn('emailService: no SMTP for PI email'); return null; }

  try {
    const info = await transporter.sendMail({
      from: FROM(),
      to,
      cc: cc || undefined,
      subject: `Proforma Invoice ${pi.pi_number} — ${pi.customer_name || 'Customer'}`,
      html,
      attachments: pdfBuffer ? [{
        filename: `${pi.pi_number}.pdf`,
        content: pdfBuffer,
        contentType: 'application/pdf',
      }] : [],
    });
    logger.info(`emailService: PI email sent → ${to} (${info.messageId})`);
    if (_devMode) console.log(`\n✉️  PI EMAIL PREVIEW: ${nodemailer.getTestMessageUrl(info)}\n`);
    return info;
  } catch (err) {
    logger.error(`emailService: PI email FAILED → ${to}`, err);
    return null;
  }
}

// ── Generic Critical Event Email ────────────────────────────────────────────
/**
 * Send an internal notification email for critical pipeline events.
 * Works for CSE approvals, PO received, dispatch ready, SLA breaches, etc.
 *
 * @param {Object} opts
 * @param {string|string[]} opts.to     — recipient email(s)
 * @param {string}  opts.eventType      — e.g. 'cse_approved', 'po_received', 'sla_breach'
 * @param {string}  opts.title          — email heading
 * @param {string}  opts.body           — HTML body content (paragraphs)
 * @param {string}  [opts.ctaLabel]     — button text
 * @param {string}  [opts.ctaUrl]       — button link
 * @param {string}  [opts.color]        — header color (default #1890ff)
 */
async function sendCriticalEventEmail({ to, eventType, title, body, ctaLabel, ctaUrl, color }) {
  if (!to) return null;
  const recipients = Array.isArray(to) ? to.filter(Boolean).join(', ') : to;
  if (!recipients) return null;

  const bgColor = color || '#1890ff';
  const html = `
    <div style="font-family:Arial,Helvetica,sans-serif;max-width:600px;margin:auto;">
      <div style="background:${bgColor};color:#fff;padding:16px 24px;border-radius:8px 8px 0 0;">
        <h2 style="margin:0;font-size:18px;">${title}</h2>
        <p style="margin:4px 0 0;font-size:12px;opacity:0.9;">ProPack Hub — MES Notification</p>
      </div>
      <div style="padding:20px 24px;background:#fff;border:1px solid #e8e8e8;border-top:none;">
        ${body}
        ${ctaLabel && ctaUrl ? `
        <div style="margin-top:20px;text-align:center;">
          <a href="${ctaUrl}" style="display:inline-block;background:${bgColor};color:#fff;padding:10px 24px;border-radius:6px;text-decoration:none;font-weight:bold;">
            ${ctaLabel}
          </a>
        </div>` : ''}
      </div>
      <div style="padding:12px;background:#fafafa;border:1px solid #e8e8e8;border-top:none;border-radius:0 0 8px 8px;text-align:center;font-size:10px;color:#999;">
        ProPack Hub — Automated notification • Do not reply
      </div>
    </div>`;

  const subject = `[PPH] ${title}`;
  return sendEmail({ to: recipients, subject, html });
}

module.exports = {
  sendEmail,
  sendCriticalEventEmail,
  notifyQCSamplesReceived,
  sendQuotationEmail,
  sendPIEmail,
};
