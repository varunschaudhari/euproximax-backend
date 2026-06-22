/**
 * SLA / aging helper — flags cases that have sat in their current status longer
 * than the expected duration for that phase (spec §5 phase durations). Phases 7
 * (government monitoring) and 9 (renewal) are long-running and excluded.
 */
const { getPhaseForStatus } = require('./crmStateMachine');

const DAY_MS = 24 * 60 * 60 * 1000;

// Expected working days per phase before a case is considered stalled.
const EXPECTED_DAYS_BY_PHASE = {
  1: 3, // Intake & triage
  2: 21, // Prior art / prototype
  3: 14, // NDA & disclosure
  4: 7, // Strategy & quote
  5: 42, // Drafting
  6: 10, // Filing
  8: 5 // Grant
};

/** Days since the case last changed status (falls back to updatedAt). */
const daysInStatus = (caseDoc) => {
  const history = caseDoc.statusHistory || [];
  const last = history.length ? history[history.length - 1].changedAt : caseDoc.updatedAt;
  if (!last) return 0;
  return Math.floor((Date.now() - new Date(last).getTime()) / DAY_MS);
};

/**
 * @returns {{ daysInStatus:number, expectedDays:(number|null), isStalled:boolean }}
 */
const getSla = (caseDoc) => {
  const phase = getPhaseForStatus(caseDoc.status);
  const expected = EXPECTED_DAYS_BY_PHASE[phase] ?? null;
  const inStatus = daysInStatus(caseDoc);
  const isStalled =
    !caseDoc.isClosed && expected != null && inStatus > expected;
  return { daysInStatus: inStatus, expectedDays: expected, isStalled };
};

module.exports = { getSla, EXPECTED_DAYS_BY_PHASE };
