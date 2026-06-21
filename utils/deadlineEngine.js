/**
 * Deadline engine — escalating reminders + auto-created statutory deadlines.
 *
 * Reminders are delivered as in-app Notification records for now (email/WhatsApp
 * will plug in once the notification module is wired, spec §11/§14). The sweep is
 * idempotent — reminders are de-duplicated per escalation point, so it is safe to
 * run multiple times a day. Scheduling is dependency-free (setInterval), so no
 * node-cron/Bull install is required.
 */
const Deadline = require('../models/Deadline');
const logger = require('../utils/logger');
const { notifyDeadline } = require('./notify');
const { runPaymentOverdueSweep } = require('./paymentEngine');

const DAY_MS = 24 * 60 * 60 * 1000;

// Days-before-deadline at which to escalate (spec §14).
const ESCALATION_POINTS = [60, 45, 30, 14, 7, 3, 0];

const daysUntil = (date) => Math.ceil((new Date(date).getTime() - Date.now()) / DAY_MS);

const addMonths = (date, months) => {
  const d = new Date(date);
  d.setMonth(d.getMonth() + months);
  return d;
};

/** Escalation tier for a given days-left value (0 normal → 2 admin). */
const escalationLevelFor = (daysLeft) => {
  if (daysLeft <= 3) return 2;
  if (daysLeft <= 30) return 1;
  return 0;
};

/**
 * Run one sweep: fire due reminders, escalate, and mark missed deadlines.
 * Returns a small summary for logging/tests.
 */
const runDeadlineSweep = async () => {
  const summary = { checked: 0, reminded: 0, missed: 0 };
  const deadlines = await Deadline.find({ status: 'active' }).populate('caseId', 'caseNumber');

  for (const deadline of deadlines) {
    summary.checked += 1;
    const daysLeft = daysUntil(deadline.statutoryDeadline);

    // Mark missed once past due.
    if (daysLeft < 0) {
      deadline.status = 'missed';
      await deadline.save();
      summary.missed += 1;
      await notifyDeadline(deadline, daysLeft, true);
      continue;
    }

    if (ESCALATION_POINTS.includes(daysLeft)) {
      const already = (deadline.reminders || []).some((r) => r.daysBeforeDeadline === daysLeft);
      if (!already) {
        deadline.reminders.push({
          daysBeforeDeadline: daysLeft,
          sentAt: new Date(),
          sentTo: deadline.ownerId ? [deadline.ownerId] : []
        });
        deadline.escalationLevel = Math.max(deadline.escalationLevel || 0, escalationLevelFor(daysLeft));
        await deadline.save();
        await notifyDeadline(deadline, daysLeft, false);
        summary.reminded += 1;
      }
    }
  }

  logger.info(
    `Deadline sweep: checked ${summary.checked}, reminded ${summary.reminded}, missed ${summary.missed}`
  );
  return summary;
};

let schedulerHandle = null;

/**
 * Start the daily scheduler. Runs once shortly after boot, then every 6 hours.
 * The sweep is idempotent so repeated same-day runs cause no duplicate reminders.
 */
const runAllSweeps = async () => {
  await runDeadlineSweep().catch((err) => logger.error('Deadline sweep error', { error: err.message }));
  await runPaymentOverdueSweep().catch((err) => logger.error('Payment sweep error', { error: err.message }));
};

const startDeadlineScheduler = () => {
  if (schedulerHandle) return;
  // Initial run a few seconds after boot.
  setTimeout(() => { runAllSweeps(); }, 10 * 1000);
  // Recurring safety net (idempotent, so multiple same-day runs are safe).
  schedulerHandle = setInterval(() => { runAllSweeps(); }, 6 * 60 * 60 * 1000);
  logger.info('CRM scheduler started (deadline + payment sweeps every 6h)');
};

/* ----------------- Auto-created statutory deadlines ----------------- */

/**
 * On filing acknowledgement, create the RFE deadline (India: 48 months from
 * filing/priority). No-op if no filing date is available or already created.
 */
const createFilingDeadlines = async (caseDoc, userId) => {
  try {
    const baseDate = caseDoc.filingDate || caseDoc.priorityDate;
    if (!baseDate) return;
    const jurisdictions = caseDoc.jurisdiction || [];
    if (jurisdictions.length === 0 || jurisdictions.includes('india')) {
      const exists = await Deadline.findOne({ caseId: caseDoc._id, type: 'rfe_filing' });
      if (!exists) {
        const statutory = addMonths(baseDate, 48);
        await Deadline.create({
          caseId: caseDoc._id,
          type: 'rfe_filing',
          label: 'Request for Examination (India) — 48 months from filing',
          statutoryDeadline: statutory,
          internalDeadline: addMonths(baseDate, 46),
          ownerId: caseDoc.assignedAttorney || userId,
          status: 'active'
        });
        logger.info(`Auto-created RFE deadline for case ${caseDoc.caseNumber}`);
      }
    }
  } catch (err) {
    logger.error('Failed to auto-create filing deadlines', { error: err.message });
  }
};

/**
 * On FER received, create the FER-response deadline (India: 6 months from the
 * FER date — defaults to today if not provided).
 */
const createFerResponseDeadline = async (caseDoc, userId, ferDate) => {
  try {
    const base = ferDate ? new Date(ferDate) : new Date();
    const statutory = addMonths(base, 6);
    // Allow multiple FER cycles — only skip if an active one already exists.
    const exists = await Deadline.findOne({ caseId: caseDoc._id, type: 'fer_response', status: 'active' });
    if (exists) return;
    await Deadline.create({
      caseId: caseDoc._id,
      type: 'fer_response',
      label: 'FER response — 6 months from FER',
      statutoryDeadline: statutory,
      internalDeadline: addMonths(base, 5),
      ownerId: caseDoc.assignedAttorney || userId,
      status: 'active'
    });
    logger.info(`Auto-created FER-response deadline for case ${caseDoc.caseNumber}`);
  } catch (err) {
    logger.error('Failed to auto-create FER deadline', { error: err.message });
  }
};

/**
 * On a patent becoming active, generate the full annual renewal schedule
 * (each filing anniversary for 20 years from filing). Idempotent per year.
 */
const createRenewalSchedule = async (caseDoc, userId) => {
  try {
    if (!caseDoc.filingDate) return;
    const filing = new Date(caseDoc.filingDate);
    const now = new Date();
    const ops = [];
    for (let yr = 1; yr <= 20; yr += 1) {
      const due = new Date(filing);
      due.setFullYear(filing.getFullYear() + yr);
      if (due < now) continue; // skip past anniversaries
      ops.push(due);
    }
    for (const due of ops) {
      const exists = await Deadline.findOne({ caseId: caseDoc._id, type: 'renewal', statutoryDeadline: due });
      if (exists) continue;
      await Deadline.create({
        caseId: caseDoc._id,
        type: 'renewal',
        label: `Annual renewal due ${due.getFullYear()}`,
        statutoryDeadline: due,
        internalDeadline: new Date(due.getTime() - 60 * DAY_MS),
        ownerId: caseDoc.assignedPM || userId,
        status: 'active'
      });
    }
    logger.info(`Auto-created renewal schedule (${ops.length} entries) for case ${caseDoc.caseNumber}`);
  } catch (err) {
    logger.error('Failed to auto-create renewal schedule', { error: err.message });
  }
};

module.exports = {
  ESCALATION_POINTS,
  daysUntil,
  runDeadlineSweep,
  startDeadlineScheduler,
  createFilingDeadlines,
  createFerResponseDeadline,
  createRenewalSchedule
};
