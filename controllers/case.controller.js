const Case = require('../models/Case');
const Client = require('../models/Client');
const ContactMessage = require('../models/ContactMessage');
const Document = require('../models/Document');
const Deadline = require('../models/Deadline');
const Payment = require('../models/Payment');
const CaseNote = require('../models/CaseNote');
const { AppError } = require('../middleware/errorHandler');
const logger = require('../utils/logger');
const {
  isValidTransition,
  getAllowedTransitions,
  getPhaseForStatus,
  INITIAL_STATUS
} = require('../utils/crmStateMachine');
const { getUserRoleNames, buildCaseScopeFilter } = require('../utils/crmAccess');
const { checkStatusGate, STATUS_CHANGE_ROLES, GATE_OVERRIDE_ROLES } = require('../utils/crmGates');
const { notifyCaseStatusChange } = require('../utils/notify');
const { applyTransition } = require('../utils/caseWorkflow');
const { getNextAction } = require('../utils/caseNextAction');
const { getSla } = require('../utils/caseSla');

const CASE_PREFIX = process.env.CASE_PREFIX || 'PAT';

const POPULATE = [
  { path: 'clientId', select: 'name email phone whatsapp gstNumber' },
  { path: 'assignedPM', select: 'name email designation' },
  { path: 'assignedAttorney', select: 'name email designation' }
];

/** Generate the next case number for the current year, e.g. PAT-2026-001. */
const generateCaseNumber = async () => {
  const year = new Date().getFullYear();
  const prefix = `${CASE_PREFIX}-${year}-`;
  const last = await Case.findOne({ caseNumber: new RegExp(`^${prefix}`) })
    .sort({ caseNumber: -1 })
    .select('caseNumber')
    .lean();
  let seq = 1;
  if (last?.caseNumber) {
    const n = parseInt(last.caseNumber.slice(prefix.length), 10);
    if (!Number.isNaN(n)) seq = n + 1;
  }
  return `${prefix}${String(seq).padStart(3, '0')}`;
};

/**
 * POST /api/v1/cases
 * Create a case. Accepts an existing clientId OR inline client details
 * (clientName/email/phone) to create the Client on the fly.
 */
const createCase = async (req, res, next) => {
  try {
    const {
      clientId,
      clientName,
      email,
      phone,
      whatsapp,
      track,
      inventionTitle,
      inventionDomain,
      inventionSummary,
      jurisdiction,
      inventorIds
    } = req.body;

    if (!track || !['A', 'B'].includes(track)) {
      return next(new AppError('A valid track (A or B) is required', 400));
    }

    // Resolve or create the client.
    let client;
    if (clientId) {
      client = await Client.findById(clientId);
      if (!client) return next(new AppError('Client not found', 404));
    } else {
      if (!clientName || !email || !phone) {
        return next(new AppError('Provide clientId, or clientName + email + phone to create a client', 400));
      }
      client = await Client.create({
        name: clientName,
        email,
        phone,
        whatsapp: whatsapp || phone
      });
    }

    const caseNumber = await generateCaseNumber();

    const newCase = await Case.create({
      caseNumber,
      clientId: client._id,
      track,
      status: INITIAL_STATUS,
      phase: getPhaseForStatus(INITIAL_STATUS) || 1,
      inventionTitle,
      inventionDomain,
      inventionSummary,
      jurisdiction: Array.isArray(jurisdiction) ? jurisdiction : undefined,
      assignedPM: req.body.assignedPM || undefined,
      assignedAttorney: req.body.assignedAttorney || undefined,
      inventorIds: Array.isArray(inventorIds) && inventorIds.length > 0 ? inventorIds : undefined,
      statusHistory: [
        {
          status: INITIAL_STATUS,
          changedBy: req.user._id,
          changedAt: new Date(),
          note: 'Case created'
        }
      ]
    });

    await newCase.populate(POPULATE);
    logger.info(`CRM case created: ${newCase.caseNumber} by ${req.user?.name || 'unknown'}`);

    res.status(201).json({ success: true, message: 'Case created successfully', data: newCase });
  } catch (error) {
    if (error.code === 11000) {
      // Rare caseNumber collision under race — let the client retry.
      return next(new AppError('Case number collision, please retry', 409));
    }
    next(error);
  }
};

/**
 * POST /api/v1/cases/from-enquiry
 * Convert an enquiry (ContactMessage) into a patent Case.
 * Body: { enquiryId, track, inventionTitle?, inventionDomain?, inventionSummary?, jurisdiction? }
 *
 * - Reuses an existing Client matched by the enquiry email, else creates one.
 * - Carries the enquiry's assigned PM onto the case.
 * - Defaults invention title/summary from the enquiry subject/message.
 * - Rejects if the enquiry already has a linked case (one case per enquiry).
 */
const createCaseFromEnquiry = async (req, res, next) => {
  try {
    const { enquiryId, track, inventionTitle, inventionDomain, inventionSummary, jurisdiction, inventorIds } = req.body;

    if (!track || !['A', 'B'].includes(track)) {
      return next(new AppError('A valid track (A or B) is required', 400));
    }

    const enquiry = await ContactMessage.findById(enquiryId);
    if (!enquiry) return next(new AppError('Enquiry not found', 404));
    if (enquiry.status === 'Closed') {
      return next(new AppError('Cannot convert a closed enquiry. Reopen it first.', 400));
    }

    const existing = await Case.findOne({ enquiryId: enquiry._id }).select('caseNumber');
    if (existing) {
      return next(new AppError(`Enquiry already converted to case ${existing.caseNumber}`, 409));
    }

    // Reuse or create the client from the enquiry contact details.
    let client = await Client.findOne({ email: enquiry.email.toLowerCase() });
    if (!client) {
      client = await Client.create({
        name: enquiry.name,
        email: enquiry.email,
        phone: enquiry.phone || 'N/A',
        whatsapp: enquiry.phone || undefined
      });
    }

    const caseNumber = await generateCaseNumber();

    const newCase = await Case.create({
      caseNumber,
      clientId: client._id,
      enquiryId: enquiry._id,
      track,
      status: INITIAL_STATUS,
      phase: getPhaseForStatus(INITIAL_STATUS) || 1,
      inventionTitle: inventionTitle || enquiry.subject,
      inventionDomain: inventionDomain || undefined,
      inventionSummary: inventionSummary || enquiry.message,
      jurisdiction: Array.isArray(jurisdiction) ? jurisdiction : undefined,
      assignedPM: enquiry.assignedTo || undefined,
      inventorIds: Array.isArray(inventorIds) && inventorIds.length > 0 ? inventorIds : undefined,
      statusHistory: [
        {
          status: INITIAL_STATUS,
          changedBy: req.user._id,
          changedAt: new Date(),
          note: `Created from enquiry ${enquiry._id}`
        }
      ]
    });

    // Move the enquiry forward so it's clearly in the pipeline.
    if (enquiry.status === 'New') {
      enquiry.status = 'In-Progress';
      await enquiry.save();
    }

    await newCase.populate(POPULATE);
    logger.info(
      `CRM case ${newCase.caseNumber} created from enquiry ${enquiry._id} by ${req.user?.name || 'unknown'}`
    );

    res.status(201).json({ success: true, message: 'Case created from enquiry', data: newCase });
  } catch (error) {
    if (error.code === 11000) {
      return next(new AppError('Case number collision, please retry', 409));
    }
    next(error);
  }
};

/**
 * POST /api/v1/cases/intake  (PUBLIC — website intake form, no auth)
 * Creates a Client + Case in INTAKE_RECEIVED and sends a welcome notification.
 */
const publicIntake = async (req, res, next) => {
  try {
    const {
      clientName, email, phone, whatsapp, track,
      inventionTitle, inventionDomain, inventionSummary, jurisdiction
    } = req.body;

    if (!clientName || !email || !phone) {
      return next(new AppError('Name, email and phone are required', 400));
    }
    if (!['A', 'B'].includes(track)) {
      return next(new AppError('A valid track (A or B) is required', 400));
    }

    let client = await Client.findOne({ email: String(email).toLowerCase() });
    if (!client) {
      client = await Client.create({ name: clientName, email, phone, whatsapp: whatsapp || phone });
    }

    const caseNumber = await generateCaseNumber();
    const newCase = await Case.create({
      caseNumber,
      clientId: client._id,
      track,
      status: INITIAL_STATUS,
      phase: getPhaseForStatus(INITIAL_STATUS) || 1,
      inventionTitle,
      inventionDomain,
      inventionSummary,
      jurisdiction: Array.isArray(jurisdiction) ? jurisdiction : undefined,
      statusHistory: [{ status: INITIAL_STATUS, changedAt: new Date(), note: 'Submitted via website intake form' }]
    });

    await newCase.populate(POPULATE);
    notifyCaseStatusChange(newCase).catch(() => {});
    logger.info(`Public intake created case ${newCase.caseNumber}`);

    res.status(201).json({
      success: true,
      message: 'Your application has been received. Our team will be in touch shortly.',
      data: { caseNumber: newCase.caseNumber }
    });
  } catch (error) {
    if (error.code === 11000) return next(new AppError('Case number collision, please retry', 409));
    next(error);
  }
};

/**
 * GET /api/v1/cases
 * Role-filtered, paginated list.
 */
const listCases = async (req, res, next) => {
  try {
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 20, 1), 100);
    const skip = (page - 1) * limit;

    const roleNames = await getUserRoleNames(req.user._id);
    const scope = buildCaseScopeFilter(roleNames, req.user._id);

    const filter = { ...scope };
    if (req.query.status) filter.status = req.query.status;
    if (req.query.track) filter.track = req.query.track;
    if (req.query.phase) filter.phase = parseInt(req.query.phase, 10);
    if (req.query.assignedPM) filter.assignedPM = req.query.assignedPM;
    if (req.query.assignedAttorney) filter.assignedAttorney = req.query.assignedAttorney;
    if (req.query.onHold === 'true') filter.isOnHold = true;

    // Collect the $and clauses we need to AND together (scope $or, search, "mine").
    const andClauses = [];
    if (filter.$or) {
      andClauses.push({ $or: filter.$or });
      delete filter.$or;
    }

    // Quick tab: "My cases" — assigned to the current user as PM or attorney.
    if (req.query.mine === 'true') {
      andClauses.push({
        $or: [{ assignedPM: req.user._id }, { assignedAttorney: req.user._id }]
      });
    }

    if (req.query.search) {
      const regex = new RegExp(req.query.search.trim(), 'i');
      andClauses.push({
        $or: [{ caseNumber: regex }, { inventionTitle: regex }, { inventionDomain: regex }]
      });
    }

    // Quick tab: "Due soon" — only cases with an active deadline within N days.
    const dueWithin = parseInt(req.query.dueWithin, 10);
    if (Number.isFinite(dueWithin) && dueWithin > 0) {
      const cutoff = new Date(Date.now() + dueWithin * 24 * 60 * 60 * 1000);
      const dueCaseIds = await Deadline.find({
        status: 'active',
        statutoryDeadline: { $lte: cutoff }
      }).distinct('caseId');
      filter._id = { $in: dueCaseIds };
    }

    if (andClauses.length) filter.$and = andClauses;

    const [items, total] = await Promise.all([
      Case.find(filter).sort({ updatedAt: -1 }).skip(skip).limit(limit).populate(POPULATE).lean(),
      Case.countDocuments(filter)
    ]);

    // Attach each case's nearest active deadline (for the urgency column) in one query.
    const caseIds = items.map((c) => c._id);
    if (caseIds.length) {
      const deadlines = await Deadline.find({
        caseId: { $in: caseIds },
        status: 'active'
      })
        .select('caseId label type statutoryDeadline')
        .sort({ statutoryDeadline: 1 })
        .lean();
      const nearestByCase = {};
      for (const d of deadlines) {
        const key = String(d.caseId);
        if (!nearestByCase[key]) nearestByCase[key] = d; // first = soonest (sorted asc)
      }
      for (const c of items) {
        const d = nearestByCase[String(c._id)];
        c.nextDeadline = d
          ? { label: d.label, type: d.type, statutoryDeadline: d.statutoryDeadline }
          : null;
        c.nextAction = getNextAction(c.status, c.track);
        c.sla = getSla(c);
      }
    }

    res.status(200).json({
      success: true,
      message: 'Cases fetched successfully',
      data: { items, page, limit, total, totalPages: Math.max(Math.ceil(total / limit), 1) }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/v1/cases/:id
 * Includes `allowedTransitions` for the current status.
 */
const getCaseById = async (req, res, next) => {
  try {
    const caseDoc = await Case.findById(req.params.id)
      .populate(POPULATE)
      .populate('statusHistory.changedBy', 'name email')
      .populate('strategyLockedBy', 'name email');

    if (!caseDoc) return next(new AppError('Case not found', 404));

    const data = caseDoc.toObject();
    data.allowedTransitions = getAllowedTransitions(caseDoc.status, caseDoc.track);
    data.nextAction = getNextAction(caseDoc.status, caseDoc.track);

    res.status(200).json({ success: true, message: 'Case fetched successfully', data });
  } catch (error) {
    next(error);
  }
};

/**
 * PATCH /api/v1/cases/:id/status
 * Validated against the state machine. Body: { newStatus, note }.
 */
const updateStatus = async (req, res, next) => {
  try {
    const { newStatus, note } = req.body;
    if (!newStatus) return next(new AppError('newStatus is required', 400));

    const caseDoc = await Case.findById(req.params.id);
    if (!caseDoc) return next(new AppError('Case not found', 404));

    if (caseDoc.isClosed) {
      return next(new AppError('Case is closed — status cannot be changed', 400));
    }

    // Role enforcement (spec §3): only owner/attorney/pm-type roles change status.
    const roleNames = await getUserRoleNames(req.user._id);
    if (!roleNames.some((r) => STATUS_CHANGE_ROLES.includes(r))) {
      return next(new AppError('Your role is not permitted to change case status', 403));
    }
    const canOverride = roleNames.some((r) => GATE_OVERRIDE_ROLES.includes(r));
    const override = req.body.override === true && canOverride;

    // Track-aware sequence validation.
    if (!isValidTransition(caseDoc.status, newStatus, caseDoc.track)) {
      return next(
        new AppError(`Invalid transition from ${caseDoc.status} to ${newStatus} (track ${caseDoc.track})`, 400)
      );
    }

    // Business gates (payment / filing data) — bypassable only by an owner override.
    if (!override) {
      const gate = await checkStatusGate(caseDoc, newStatus);
      if (!gate.ok) return next(new AppError(gate.message, 403));
    }

    const finalNote = override ? `${note || ''}${note ? ' ' : ''}[gate overridden]`.trim() : (note || '');
    const result = await applyTransition(caseDoc, newStatus, { userId: req.user._id, note: finalNote });
    if (!result.ok) return next(new AppError(result.error, 400));

    await caseDoc.populate(POPULATE);
    logger.info(`Case ${caseDoc.caseNumber} -> ${newStatus} by ${req.user?.name || 'unknown'}`);

    const data = caseDoc.toObject();
    data.allowedTransitions = getAllowedTransitions(caseDoc.status, caseDoc.track);

    res.status(200).json({ success: true, message: 'Status updated', data });
  } catch (error) {
    next(error);
  }
};

/**
 * PATCH /api/v1/cases/:id
 * Edit invention + filing/grant details (Phases 6 & 8). Does NOT change status.
 */
const updateCaseDetails = async (req, res, next) => {
  try {
    const caseDoc = await Case.findById(req.params.id);
    if (!caseDoc) return next(new AppError('Case not found', 404));

    const stringFields = [
      'inventionTitle', 'inventionDomain', 'inventionSummary',
      'applicationNumber', 'patentNumber', 'journalIssueNumber'
    ];
    stringFields.forEach((f) => {
      if (req.body[f] !== undefined) caseDoc[f] = req.body[f];
    });

    const dateFields = ['filingDate', 'priorityDate', 'publicationDate', 'grantDate', 'validUntil'];
    dateFields.forEach((f) => {
      if (req.body[f] !== undefined) caseDoc[f] = req.body[f] ? new Date(req.body[f]) : undefined;
    });

    if (req.body.filingType !== undefined) caseDoc.filingType = req.body.filingType || undefined;
    if (req.body.jurisdiction !== undefined && Array.isArray(req.body.jurisdiction)) {
      caseDoc.jurisdiction = req.body.jurisdiction;
    }

    // Auto-derive 20-year expiry from filing date if not explicitly set.
    if (req.body.filingDate && !req.body.validUntil) {
      const v = new Date(req.body.filingDate);
      v.setFullYear(v.getFullYear() + 20);
      caseDoc.validUntil = v;
    }

    await caseDoc.save();
    await caseDoc.populate(POPULATE);
    res.status(200).json({ success: true, message: 'Case details updated', data: caseDoc });
  } catch (error) {
    next(error);
  }
};

/**
 * PATCH /api/v1/cases/:id/assign
 * Body: { assignedPM, assignedAttorney } — either or both.
 */
const assignCase = async (req, res, next) => {
  try {
    const { assignedPM, assignedAttorney } = req.body;
    const caseDoc = await Case.findById(req.params.id);
    if (!caseDoc) return next(new AppError('Case not found', 404));

    if (assignedPM !== undefined) caseDoc.assignedPM = assignedPM || null;
    if (assignedAttorney !== undefined) caseDoc.assignedAttorney = assignedAttorney || null;

    await caseDoc.save();
    await caseDoc.populate(POPULATE);

    res.status(200).json({ success: true, message: 'Case assignments updated', data: caseDoc });
  } catch (error) {
    next(error);
  }
};

/**
 * PATCH /api/v1/cases/:id/hold
 * Body: { isOnHold, holdReason }
 */
const holdCase = async (req, res, next) => {
  try {
    const caseDoc = await Case.findById(req.params.id);
    if (!caseDoc) return next(new AppError('Case not found', 404));
    const onHold = Boolean(req.body.isOnHold);
    caseDoc.isOnHold = onHold;
    caseDoc.holdReason = onHold ? (req.body.holdReason || 'Placed on hold') : undefined;
    await caseDoc.save();
    await caseDoc.populate(POPULATE);
    res.status(200).json({ success: true, message: onHold ? 'Case placed on hold' : 'Hold lifted', data: caseDoc });
  } catch (error) {
    next(error);
  }
};

/**
 * PATCH /api/v1/cases/:id/strategy
 * Lock the filing strategy (Phase 4). Body: { filingType, jurisdiction }.
 * Once locked, changing it again requires owner override (re-lock allowed by owner).
 */
const lockStrategy = async (req, res, next) => {
  try {
    const caseDoc = await Case.findById(req.params.id);
    if (!caseDoc) return next(new AppError('Case not found', 404));

    if (caseDoc.strategyLockedAt && !req.body.override) {
      return next(new AppError('Strategy already locked — owner override required to change', 403));
    }

    if (req.body.filingType) caseDoc.filingType = req.body.filingType;
    if (Array.isArray(req.body.jurisdiction)) caseDoc.jurisdiction = req.body.jurisdiction;
    caseDoc.strategyLockedAt = new Date();
    caseDoc.strategyLockedBy = req.user._id;
    await caseDoc.save();
    await caseDoc.populate(POPULATE);

    res.status(200).json({ success: true, message: 'Strategy locked', data: caseDoc });
  } catch (error) {
    next(error);
  }
};

/**
 * PATCH /api/v1/cases/:id/track
 * Track can only change before prior art is confirmed (spec §4).
 */
const changeTrack = async (req, res, next) => {
  try {
    const { track } = req.body;
    if (!['A', 'B'].includes(track)) return next(new AppError('track must be A or B', 400));

    const caseDoc = await Case.findById(req.params.id);
    if (!caseDoc) return next(new AppError('Case not found', 404));

    // Once prior art search is done (phase > 2 or already confirmed), block.
    const lockedStatuses = ['PRIOR_ART_CONFIRMED'];
    if ((caseDoc.phase && caseDoc.phase > 2) || lockedStatuses.includes(caseDoc.status)) {
      return next(
        new AppError('Track cannot be changed after Prior Art Search — create a new case', 400)
      );
    }

    caseDoc.track = track;
    await caseDoc.save();
    await caseDoc.populate(POPULATE);

    res.status(200).json({ success: true, message: 'Track updated', data: caseDoc });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/v1/cases/:id/timeline
 */
const getTimeline = async (req, res, next) => {
  try {
    const caseDoc = await Case.findById(req.params.id)
      .select('caseNumber status statusHistory')
      .populate('statusHistory.changedBy', 'name email');
    if (!caseDoc) return next(new AppError('Case not found', 404));

    res.status(200).json({
      success: true,
      message: 'Timeline fetched',
      data: { caseNumber: caseDoc.caseNumber, status: caseDoc.status, history: caseDoc.statusHistory }
    });
  } catch (error) {
    next(error);
  }
};

/* ----------------------------- Notes (B5) ----------------------------- */

/**
 * GET /api/v1/cases/:id/notes — internal staff comment thread (newest first).
 */
const listNotes = async (req, res, next) => {
  try {
    const notes = await CaseNote.find({ caseId: req.params.id })
      .sort({ createdAt: -1 })
      .populate('authorId', 'name email')
      .lean();
    res.status(200).json({ success: true, message: 'Notes fetched', data: notes });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/v1/cases/:id/notes — add an internal note. Body: { body }.
 */
const createNote = async (req, res, next) => {
  try {
    const body = (req.body.body || '').trim();
    if (!body) return next(new AppError('Note body is required', 400));

    const caseDoc = await Case.findById(req.params.id).select('_id');
    if (!caseDoc) return next(new AppError('Case not found', 404));

    const note = await CaseNote.create({
      caseId: req.params.id,
      authorId: req.user._id,
      body
    });
    await note.populate('authorId', 'name email');
    res.status(201).json({ success: true, message: 'Note added', data: note });
  } catch (error) {
    next(error);
  }
};

/**
 * DELETE /api/v1/cases/:id/notes/:noteId — author-only delete.
 */
const deleteNote = async (req, res, next) => {
  try {
    const note = await CaseNote.findOne({ _id: req.params.noteId, caseId: req.params.id });
    if (!note) return next(new AppError('Note not found', 404));
    if (String(note.authorId) !== String(req.user._id)) {
      return next(new AppError('You can only delete your own notes', 403));
    }
    await note.deleteOne();
    res.status(200).json({ success: true, message: 'Note deleted' });
  } catch (error) {
    next(error);
  }
};

/* --------------------------- Activity timeline (B6) --------------------------- */

/**
 * GET /api/v1/cases/:id/activity
 * Unified, chronologically-merged feed of everything that happened on a case:
 * status changes, payments, documents, deadlines, and internal notes.
 */
const getActivity = async (req, res, next) => {
  try {
    const caseId = req.params.id;
    const caseDoc = await Case.findById(caseId)
      .select('caseNumber statusHistory')
      .populate('statusHistory.changedBy', 'name email')
      .lean();
    if (!caseDoc) return next(new AppError('Case not found', 404));

    const [payments, documents, deadlines, notes] = await Promise.all([
      Payment.find({ caseId }).select('milestoneLabel type status totalAmount currency createdAt paidAt invoicedAt').lean(),
      Document.find({ caseId }).select('name type uploadedAt uploadedBy').populate('uploadedBy', 'name email').lean(),
      Deadline.find({ caseId }).select('label type statutoryDeadline status createdAt completedAt').lean(),
      CaseNote.find({ caseId }).populate('authorId', 'name email').lean()
    ]);

    const events = [];

    for (const h of caseDoc.statusHistory || []) {
      events.push({
        kind: 'status',
        at: h.changedAt,
        actor: h.changedBy || null,
        title: `Status → ${h.status}`,
        detail: h.note || ''
      });
    }
    for (const p of payments) {
      events.push({
        kind: 'payment',
        at: p.paidAt || p.invoicedAt || p.createdAt,
        actor: null,
        title: `Payment ${p.status}: ${p.milestoneLabel || p.type}`,
        detail: p.totalAmount != null ? `${p.currency || 'INR'} ${p.totalAmount}` : ''
      });
    }
    for (const d of documents) {
      events.push({
        kind: 'document',
        at: d.uploadedAt,
        actor: d.uploadedBy || null,
        title: `Document uploaded: ${d.name}`,
        detail: d.type || ''
      });
    }
    for (const dl of deadlines) {
      events.push({
        kind: 'deadline',
        at: dl.completedAt || dl.createdAt,
        actor: null,
        title: `Deadline ${dl.status}: ${dl.label}`,
        detail: dl.statutoryDeadline ? `due ${new Date(dl.statutoryDeadline).toISOString().slice(0, 10)}` : ''
      });
    }
    for (const n of notes) {
      events.push({
        kind: 'note',
        at: n.createdAt,
        actor: n.authorId || null,
        title: 'Note added',
        detail: n.body
      });
    }

    events.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());

    res.status(200).json({
      success: true,
      message: 'Activity fetched',
      data: { caseNumber: caseDoc.caseNumber, events }
    });
  } catch (error) {
    next(error);
  }
};

/* ----------------------- Filing readiness checklist ----------------------- */

const DEFAULT_FILING_CHECKLIST = [
  { key: 'applicant_details', label: 'Applicant name(s) & details confirmed' },
  { key: 'inventor_details', label: 'Inventor name(s) & details confirmed' },
  { key: 'jurisdiction', label: 'Jurisdiction(s) confirmed' },
  { key: 'forms', label: 'Government forms prepared' },
  { key: 'specification', label: 'Final specification attached' },
  { key: 'classification', label: 'IPC / CPC classification assigned' }
];

/**
 * GET /api/v1/cases/:id/checklist — filing readiness checklist (seeds defaults
 * once the case has reached the filing phase).
 */
const getChecklist = async (req, res, next) => {
  try {
    const caseDoc = await Case.findById(req.params.id);
    if (!caseDoc) return next(new AppError('Case not found', 404));

    if ((!caseDoc.filingChecklist || caseDoc.filingChecklist.length === 0) && caseDoc.phase >= 6) {
      caseDoc.filingChecklist = DEFAULT_FILING_CHECKLIST.map((i) => ({ ...i, done: false }));
      await caseDoc.save();
    }
    res.status(200).json({ success: true, message: 'Checklist', data: caseDoc.filingChecklist || [] });
  } catch (error) {
    next(error);
  }
};

/**
 * PATCH /api/v1/cases/:id/checklist — toggle one item. Body: { key, done }.
 */
const updateChecklistItem = async (req, res, next) => {
  try {
    const { key, done } = req.body;
    const caseDoc = await Case.findById(req.params.id);
    if (!caseDoc) return next(new AppError('Case not found', 404));

    const item = (caseDoc.filingChecklist || []).find((i) => i.key === key);
    if (!item) return next(new AppError('Checklist item not found', 404));

    item.done = Boolean(done);
    item.doneAt = item.done ? new Date() : undefined;
    item.doneBy = item.done ? req.user._id : undefined;
    await caseDoc.save();
    res.status(200).json({ success: true, message: 'Checklist updated', data: caseDoc.filingChecklist });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/v1/cases/attention — cases that need attention (role-scoped): stalled,
 * on hold, with an overdue deadline, or with an overdue payment. Each with reasons.
 */
const attentionList = async (req, res, next) => {
  try {
    const roleNames = await getUserRoleNames(req.user._id);
    const scope = buildCaseScopeFilter(roleNames, req.user._id);
    const now = new Date();

    const cases = await Case.find({ ...scope, isClosed: { $ne: true } })
      .sort({ updatedAt: -1 })
      .limit(300)
      .populate(POPULATE)
      .lean();
    const caseIds = cases.map((c) => c._id);

    const [overdueDl, overduePay] = await Promise.all([
      Deadline.find({ caseId: { $in: caseIds }, status: 'active', statutoryDeadline: { $lt: now } }).distinct('caseId'),
      Payment.find({ caseId: { $in: caseIds }, status: { $in: ['invoice_sent', 'overdue'] }, dueDate: { $lt: now } }).distinct('caseId')
    ]);
    const dlSet = new Set(overdueDl.map(String));
    const paySet = new Set(overduePay.map(String));

    const items = [];
    for (const c of cases) {
      const sla = getSla(c);
      const reasons = [];
      if (c.isOnHold) reasons.push('On hold');
      if (sla.isStalled) reasons.push(`Stalled ${sla.daysInStatus}d in stage`);
      if (dlSet.has(String(c._id))) reasons.push('Overdue deadline');
      if (paySet.has(String(c._id))) reasons.push('Overdue payment');
      if (reasons.length) {
        c.sla = sla;
        c.attentionReasons = reasons;
        c.nextAction = getNextAction(c.status, c.track);
        items.push(c);
      }
    }

    res.status(200).json({ success: true, message: 'Cases needing attention', data: { items, total: items.length } });
  } catch (error) {
    next(error);
  }
};

/* ----------------------------- Co-inventors Management ----------------------------- */

/**
 * PATCH /api/v1/cases/:id/inventors — add or remove co-inventors from a case.
 * Body: { inventorIds: [userId1, userId2, ...] } (replaces current list)
 */
const manageInventors = async (req, res, next) => {
  try {
    const { inventorIds } = req.body;
    if (!Array.isArray(inventorIds)) {
      return next(new AppError('inventorIds must be an array of user IDs', 400));
    }

    const caseDoc = await Case.findById(req.params.id);
    if (!caseDoc) return next(new AppError('Case not found', 404));

    // Validate all inventor IDs exist
    const User = require('../models/User');
    const inventors = await User.find({ _id: { $in: inventorIds } }).lean();
    if (inventors.length !== inventorIds.length) {
      return next(new AppError('One or more inventor IDs are invalid', 400));
    }

    caseDoc.inventorIds = inventorIds;
    await caseDoc.save();

    await caseDoc.populate('inventorIds', 'name email');
    logger.info(`Co-inventors updated for case ${caseDoc.caseNumber}: ${inventorIds.length} inventor(s)`);

    res.status(200).json({
      success: true,
      message: 'Co-inventors updated successfully',
      data: { caseNumber: caseDoc.caseNumber, inventorIds: caseDoc.inventorIds }
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  createCase,
  createCaseFromEnquiry,
  publicIntake,
  listCases,
  attentionList,
  getCaseById,
  updateCaseDetails,
  updateStatus,
  assignCase,
  holdCase,
  lockStrategy,
  changeTrack,
  getChecklist,
  updateChecklistItem,
  getTimeline,
  listNotes,
  createNote,
  deleteNote,
  getActivity,
  manageInventors
};
