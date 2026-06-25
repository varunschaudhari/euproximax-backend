/**
 * Notification dispatch layer.
 *
 * Central place that creates Notification records AND delivers them. Per the
 * "mixed integrations" decision: email goes out via the existing nodemailer
 * mailer; WhatsApp is a stub (WATI) that no-ops until configured; in-app is just
 * the stored record. Every send is logged as a Notification with sent/failed/
 * pending status so there's an auditable trail (spec §11).
 *
 * All helpers are best-effort and never throw to their callers — a failed
 * notification must not break a case transition or a payment.
 */
const Notification = require('../models/Notification');
const Client = require('../models/Client');
const User = require('../models/User');
const Case = require('../models/Case');
const Payment = require('../models/Payment');
const { sendMail } = require('./mailer');
const logger = require('./logger');
const config = require('./config');
const { CLIENT_LABELS, getDisplayLabel } = require('./crmStateMachine');

/** Convert our simple HTML notification body to WhatsApp-friendly plain text. */
const htmlToText = (html) =>
  String(html || '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

/**
 * WhatsApp sender via WATI session message (free-form text within an active
 * 24h customer session). No-ops cleanly when unconfigured or no phone.
 * Returns { skipped } when not attempted; throws on send failure so the
 * dispatcher records the notification as 'failed'.
 */
const sendWhatsApp = async (phone, body) => {
  if (!config.whatsapp.apiUrl || !config.whatsapp.apiToken || !phone) {
    return { skipped: true };
  }
  const cleanPhone = String(phone).replace(/[^0-9]/g, '');
  if (!cleanPhone) return { skipped: true };

  const base = config.whatsapp.apiUrl.replace(/\/$/, '');
  const text = htmlToText(body);
  const url = `${base}/api/v1/sendSessionMessage/${cleanPhone}?messageText=${encodeURIComponent(text)}`;

  const res = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${config.whatsapp.apiToken}`, Accept: 'application/json' }
  });
  let data = {};
  try {
    data = await res.json();
  } catch {
    // non-JSON response
  }
  if (!res.ok || data.result === false) {
    throw new Error(data?.info || data?.message || `WATI send failed (${res.status})`);
  }
  return { skipped: false };
};

/** Minimal branded HTML wrapper for emails. */
const wrapEmail = (subject, bodyHtml) => `
  <div style="font-family:Arial,Helvetica,sans-serif;max-width:560px;margin:auto;color:#1f2937">
    <h2 style="color:#111827;font-size:18px">${subject}</h2>
    <div style="font-size:14px;line-height:1.6">${bodyHtml}</div>
    <hr style="border:none;border-top:1px solid #e5e7eb;margin:20px 0"/>
    <p style="font-size:12px;color:#6b7280">This is an automated message from the Patent CRM.</p>
  </div>`;

/**
 * Dispatch one notification across the requested channels, recording each.
 * @returns {Promise<Array>} created Notification docs
 */
const dispatch = async ({
  caseId,
  recipientId,
  recipientType = 'client',
  to,
  phone,
  channels = ['email', 'in_app'],
  trigger,
  subject,
  body
}) => {
  const results = [];
  for (const channel of channels) {
    let status = 'pending';
    let errorMessage;
    let sentAt;
    try {
      if (channel === 'email') {
        if (!to) {
          status = 'failed';
          errorMessage = 'No recipient email';
        } else {
          await sendMail({ to, subject, html: wrapEmail(subject, body), text: body });
          status = 'sent';
          sentAt = new Date();
        }
      } else if (channel === 'whatsapp') {
        const r = await sendWhatsApp(phone, body);
        if (r.skipped) {
          status = 'pending'; // not configured / no phone — left for retry
        } else {
          status = 'sent';
          sentAt = new Date();
        }
      } else {
        // in_app
        status = 'sent';
        sentAt = new Date();
      }
    } catch (err) {
      status = 'failed';
      errorMessage = err.message;
      logger.error('Notification dispatch failed', { trigger, channel, error: err.message });
    }

    try {
      const notif = await Notification.create({
        caseId,
        recipientId,
        recipientType,
        channel,
        trigger,
        subject,
        body,
        status,
        sentAt,
        errorMessage
      });
      results.push(notif);
    } catch (err) {
      logger.error('Failed to persist notification', { trigger, channel, error: err.message });
    }
  }
  return results;
};

/** Resolve a Client (object or id) to one we can email. */
const resolveClient = async (clientId) => {
  if (!clientId) return null;
  if (typeof clientId === 'object' && clientId.email) return clientId;
  return Client.findById(clientId).lean();
};

/* ----------------------------- Triggers ----------------------------- */

/**
 * Client-facing notification on a case status change.
 * Uses friendly labels — never internal status strings.
 */
const notifyCaseStatusChange = async (caseDoc) => {
  try {
    const client = await resolveClient(caseDoc.clientId);
    if (!client?.email) return;
    const friendly = CLIENT_LABELS[caseDoc.status] || getDisplayLabel(caseDoc.status);
    const subject = `Update on your patent case ${caseDoc.caseNumber}`;
    const body = `Hi ${client.name || 'there'},<br/><br/>Your patent case <b>${caseDoc.caseNumber}</b> has a new update:<br/><br/><b>${friendly}</b><br/><br/>We'll keep you posted as it progresses.`;
    await dispatch({
      caseId: caseDoc._id,
      recipientType: 'client',
      to: client.email,
      phone: client.whatsapp || client.phone,
      channels: ['email', 'whatsapp'],
      trigger: 'status_change',
      subject,
      body
    });
  } catch (err) {
    logger.error('notifyCaseStatusChange failed', { error: err.message });
  }
};

/**
 * Client-facing payment notification.
 * @param {string} kind - 'invoice' | 'received'
 */
const notifyPaymentEvent = async (payment, kind) => {
  try {
    const [client, caseDoc] = await Promise.all([
      resolveClient(payment.clientId),
      Case.findById(payment.caseId).select('caseNumber').lean()
    ]);
    if (!client?.email) return;
    const caseNumber = caseDoc?.caseNumber || '';
    const label = payment.milestoneLabel || payment.type;
    const amount = `${payment.currency || 'INR'} ${payment.totalAmount ?? payment.amount}`;

    let subject;
    let body;
    if (kind === 'invoice') {
      subject = `Invoice ${payment.invoiceNumber || ''} — ${label} (${caseNumber})`;
      body = `Hi ${client.name || 'there'},<br/><br/>An invoice for <b>${label}</b> on case <b>${caseNumber}</b> is ready.<br/>Amount due: <b>${amount}</b>${payment.dueDate ? `<br/>Due date: ${new Date(payment.dueDate).toLocaleDateString()}` : ''}<br/><br/>Please log in to your portal to pay.`;
    } else {
      subject = `Payment received — ${label} (${caseNumber})`;
      body = `Hi ${client.name || 'there'},<br/><br/>We've received your payment of <b>${amount}</b> for <b>${label}</b> on case <b>${caseNumber}</b>. Thank you!`;
    }

    await dispatch({
      caseId: payment.caseId,
      recipientType: 'client',
      to: client.email,
      phone: client.whatsapp || client.phone,
      channels: ['email', 'whatsapp'],
      trigger: kind === 'invoice' ? 'payment_invoice' : 'payment_received',
      subject,
      body
    });
  } catch (err) {
    logger.error('notifyPaymentEvent failed', { error: err.message });
  }
};

/**
 * Internal reminder to the deadline owner (email + in-app).
 * @param {Object} deadline - populated with caseId (caseNumber)
 * @param {number} daysLeft
 * @param {boolean} missed
 */
const notifyDeadline = async (deadline, daysLeft, missed) => {
  try {
    const caseNumber = deadline.caseId?.caseNumber || 'case';
    const owner = deadline.ownerId ? await User.findById(deadline.ownerId).select('name email').lean() : null;
    const subject = missed
      ? `DEADLINE MISSED: ${deadline.label} (${caseNumber})`
      : `Deadline in ${daysLeft} day(s): ${deadline.label} (${caseNumber})`;
    const body = missed
      ? `The deadline <b>${deadline.label}</b> for case <b>${caseNumber}</b> has been missed. Immediate action required.`
      : `Reminder: <b>${deadline.label}</b> for case <b>${caseNumber}</b> is due in <b>${daysLeft} day(s)</b>.`;

    await dispatch({
      caseId: deadline.caseId?._id || deadline.caseId,
      recipientId: owner?._id,
      recipientType: 'internal',
      to: owner?.email,
      channels: owner?.email ? ['email', 'in_app'] : ['in_app'],
      trigger: missed ? 'deadline_missed' : 'deadline_reminder',
      subject,
      body
    });
  } catch (err) {
    logger.error('notifyDeadline failed', { error: err.message });
  }
};

/**
 * Client reminder for an overdue invoice.
 */
const notifyPaymentOverdue = async (payment, daysPast) => {
  try {
    const [client, caseDoc] = await Promise.all([
      resolveClient(payment.clientId),
      Case.findById(payment.caseId).select('caseNumber').lean()
    ]);
    if (!client?.email) return;
    const label = payment.milestoneLabel || payment.type;
    const amount = `${payment.currency || 'INR'} ${payment.totalAmount ?? payment.amount}`;
    await dispatch({
      caseId: payment.caseId,
      recipientType: 'client',
      to: client.email,
      phone: client.whatsapp || client.phone,
      channels: ['email', 'whatsapp'],
      trigger: 'payment_overdue',
      subject: `Payment overdue (${daysPast} days) — ${label} (${caseDoc?.caseNumber || ''})`,
      body: `Hi ${client.name || 'there'},<br/><br/>Our records show the invoice for <b>${label}</b> (${amount}) on case <b>${caseDoc?.caseNumber || ''}</b> is <b>${daysPast} days overdue</b>. Please pay at your earliest convenience to avoid delays to your case.`
    });
  } catch (err) {
    logger.error('notifyPaymentOverdue failed', { error: err.message });
  }
};

/**
 * Internal alert when a case is auto-placed on hold (PM + owner). PM gets email;
 * owners get an in-app record (recipientType internal).
 */
const notifyCaseHold = async (caseDoc, reason) => {
  try {
    const subject = `Case on hold: ${caseDoc.caseNumber}`;
    const body = `Case <b>${caseDoc.caseNumber}</b> has been placed on hold. Reason: ${reason}`;
    const pm = caseDoc.assignedPM ? await User.findById(caseDoc.assignedPM).select('email').lean() : null;
    await dispatch({
      caseId: caseDoc._id,
      recipientId: caseDoc.assignedPM || undefined,
      recipientType: 'internal',
      to: pm?.email,
      channels: pm?.email ? ['email', 'in_app'] : ['in_app'],
      trigger: 'case_on_hold',
      subject,
      body
    });
  } catch (err) {
    logger.error('notifyCaseHold failed', { error: err.message });
  }
};

/**
 * Reminder to a client who hasn't completed a pending action (sign NDA, approve
 * quote, review draft, etc.) after some days of inactivity.
 */
const notifyClientPendingAction = async (caseDoc, daysWaiting, actionPhrase) => {
  try {
    const client = await resolveClient(caseDoc.clientId);
    if (!client?.email) return;
    const subject = `Reminder: action needed on your patent case ${caseDoc.caseNumber}`;
    const body = `Hi ${client.name || 'there'},<br/><br/>Your patent case <b>${caseDoc.caseNumber}</b> is waiting on you to <b>${actionPhrase}</b>. It's been ${daysWaiting} day(s) — please log in to your portal to continue so we can keep things moving.`;
    await dispatch({
      caseId: caseDoc._id,
      recipientType: 'client',
      to: client.email,
      phone: client.whatsapp || client.phone,
      channels: ['email', 'whatsapp'],
      trigger: 'client_action_reminder',
      subject,
      body
    });
  } catch (err) {
    logger.error('notifyClientPendingAction failed', { error: err.message });
  }
};

module.exports = {
  dispatch,
  sendWhatsApp,
  notifyCaseStatusChange,
  notifyPaymentEvent,
  notifyPaymentOverdue,
  notifyCaseHold,
  notifyClientPendingAction,
  notifyDeadline
};
