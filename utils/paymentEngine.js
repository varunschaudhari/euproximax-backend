/**
 * Payment overdue engine (spec §9). Daily sweep that:
 *  - flips past-due invoices to `overdue`,
 *  - sends escalating client reminders at 3/7/14/30 days past due (deduped),
 *  - auto-places the case on hold at 30 days and alerts PM + owner.
 * Idempotent — reminders are deduped via Payment.remindersSent[].type.
 */
const Payment = require('../models/Payment');
const Case = require('../models/Case');
const logger = require('./logger');
const { notifyPaymentOverdue, notifyCaseHold } = require('./notify');

const DAY_MS = 24 * 60 * 60 * 1000;
const TRIGGERS = [3, 7, 14, 30];

const runPaymentOverdueSweep = async () => {
  const summary = { checked: 0, reminded: 0, held: 0 };
  const now = Date.now();
  const overdue = await Payment.find({
    status: { $in: ['invoice_sent', 'overdue'] },
    dueDate: { $lt: new Date(now) }
  });

  for (const payment of overdue) {
    summary.checked += 1;
    const daysPast = Math.floor((now - new Date(payment.dueDate).getTime()) / DAY_MS);

    if (payment.status !== 'overdue') payment.status = 'overdue';

    // Highest trigger reached and not yet sent.
    const due = TRIGGERS.filter((t) => daysPast >= t);
    const sentTypes = new Set((payment.remindersSent || []).map((r) => r.type));
    const toSend = due.filter((t) => !sentTypes.has(`${t}d`));

    if (toSend.length) {
      const highest = Math.max(...toSend);
      payment.remindersSent = payment.remindersSent || [];
      toSend.forEach((t) => payment.remindersSent.push({ sentAt: new Date(), type: `${t}d` }));
      await payment.save();
      await notifyPaymentOverdue(payment, daysPast);
      summary.reminded += 1;

      // Auto-hold the case at the 30-day mark.
      if (highest === 30) {
        const caseDoc = await Case.findById(payment.caseId);
        if (caseDoc && !caseDoc.isOnHold) {
          caseDoc.isOnHold = true;
          caseDoc.holdReason = 'Payment overdue 30 days';
          await caseDoc.save();
          await notifyCaseHold(caseDoc, caseDoc.holdReason);
          summary.held += 1;
        }
      }
    } else {
      await payment.save(); // persist status flip even if no new reminder
    }
  }

  logger.info(`Payment overdue sweep: checked ${summary.checked}, reminded ${summary.reminded}, held ${summary.held}`);
  return summary;
};

module.exports = { runPaymentOverdueSweep };
