const fs = require('fs');
const path = require('path');
const Document = require('../models/Document');
const Case = require('../models/Case');
const { AppError } = require('../middleware/errorHandler');
const logger = require('../utils/logger');

const DOC_TYPES = [
  'intake_form', 'nda', 'prior_art_report', 'invention_disclosure',
  'prototype_photos', 'prototype_report', 'quotation', 'draft_v1',
  'draft_final', 'filing_receipt', 'application_copy', 'fer',
  'objection_response', 'grant_certificate', 'renewal_receipt',
  'invoice', 'vendor_brief', 'vendor_delivery', 'other'
];

/**
 * POST /api/v1/documents/upload  (multipart: file + caseId, type, isVisibleToClient)
 */
const uploadDocument = async (req, res, next) => {
  try {
    if (!req.file) return next(new AppError('No file uploaded', 400));

    const { caseId, type, isVisibleToClient } = req.body;
    const caseDoc = await Case.findById(caseId).select('_id');
    if (!caseDoc) {
      // Clean up the orphaned file.
      fs.unlink(req.file.path, () => {});
      return next(new AppError('Case not found', 404));
    }

    const url = `/uploads/documents/${req.file.filename}`;
    const document = await Document.create({
      caseId,
      uploadedBy: req.user._id,
      type: DOC_TYPES.includes(type) ? type : 'other',
      name: req.file.originalname,
      storagePath: req.file.path,
      url,
      fileSize: req.file.size,
      mimeType: req.file.mimetype,
      isVisibleToClient: isVisibleToClient === 'true' || isVisibleToClient === true
    });

    logger.info(`Document uploaded for case ${caseId} by ${req.user?.name || 'unknown'}`);
    res.status(201).json({ success: true, message: 'Document uploaded', data: document });
  } catch (error) {
    if (req.file) fs.unlink(req.file.path, () => {});
    next(error);
  }
};

/**
 * GET /api/v1/documents/case/:caseId
 */
const listByCase = async (req, res, next) => {
  try {
    const docs = await Document.find({ caseId: req.params.caseId })
      .sort({ uploadedAt: -1 })
      .populate('uploadedBy', 'name email');
    res.status(200).json({ success: true, message: 'Documents fetched', data: docs });
  } catch (error) {
    next(error);
  }
};

/**
 * PATCH /api/v1/documents/:id/visibility
 * Body: { isVisibleToClient }
 */
const toggleVisibility = async (req, res, next) => {
  try {
    const doc = await Document.findById(req.params.id);
    if (!doc) return next(new AppError('Document not found', 404));
    doc.isVisibleToClient =
      req.body.isVisibleToClient !== undefined ? Boolean(req.body.isVisibleToClient) : !doc.isVisibleToClient;
    await doc.save();
    res.status(200).json({ success: true, message: 'Visibility updated', data: doc });
  } catch (error) {
    next(error);
  }
};

/**
 * PATCH /api/v1/documents/:id/lock  — lock to read-only (cannot be deleted after).
 */
const lockDocument = async (req, res, next) => {
  try {
    const doc = await Document.findById(req.params.id);
    if (!doc) return next(new AppError('Document not found', 404));
    doc.isLockedReadOnly = true;
    await doc.save();
    res.status(200).json({ success: true, message: 'Document locked', data: doc });
  } catch (error) {
    next(error);
  }
};

/**
 * DELETE /api/v1/documents/:id  — only before locking.
 */
const deleteDocument = async (req, res, next) => {
  try {
    const doc = await Document.findById(req.params.id);
    if (!doc) return next(new AppError('Document not found', 404));
    if (doc.isLockedReadOnly) return next(new AppError('Locked documents cannot be deleted', 403));

    // Best-effort local file removal.
    const filePath = doc.storagePath || (doc.url ? path.join(__dirname, '..', doc.url) : null);
    if (filePath) fs.unlink(filePath, () => {});

    await doc.deleteOne();
    res.status(200).json({ success: true, message: 'Document deleted' });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/v1/documents/:id/download
 * Streams the file (auth-checked). For S3 this would return a signed URL.
 */
const downloadDocument = async (req, res, next) => {
  try {
    const doc = await Document.findById(req.params.id);
    if (!doc) return next(new AppError('Document not found', 404));

    // Future S3: return res.json({ url: signedUrl }).
    if (doc.s3Url && !doc.storagePath && !doc.url) {
      return res.status(200).json({ success: true, data: { url: doc.s3Url } });
    }

    const filePath = doc.storagePath || (doc.url ? path.join(__dirname, '..', doc.url) : null);
    if (!filePath || !fs.existsSync(filePath)) {
      return next(new AppError('File not found on server', 404));
    }
    return res.download(filePath, doc.name);
  } catch (error) {
    next(error);
  }
};

module.exports = { uploadDocument, listByCase, toggleVisibility, lockDocument, deleteDocument, downloadDocument };
