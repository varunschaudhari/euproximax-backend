const Project = require('../models/Project');
const ContactMessage = require('../models/ContactMessage');
const User = require('../models/User');
const UserRole = require('../models/UserRole');
const Role = require('../models/Role');
const { AppError } = require('../middleware/errorHandler');
const logger = require('../utils/logger');
const { sendMail } = require('../utils/mailer');

const APPROVAL_PORTAL_URL = process.env.ADMIN_PORTAL_URL || 'https://admin.euproximax.com';

const createProject = async (req, res, next) => {
  try {
    const { enquiryId, projectName, quoteAmount, quoteDescription, services, notes } = req.body;
    const currentUser = req.user;

    // Validate enquiry exists and has scheduled call
    const enquiry = await ContactMessage.findById(enquiryId);
    if (!enquiry) {
      return next(new AppError('Enquiry not found', 404));
    }

    if (!enquiry.scheduledCall?.scheduledAt) {
      return next(new AppError('Cannot create project. Please schedule a call first.', 400));
    }

    if (!enquiry.assignedTo) {
      return next(new AppError('Cannot create project. Please assign a Project Manager first.', 400));
    }

    // Check if project already exists for this enquiry
    const existingProject = await Project.findOne({ enquiryId });
    if (existingProject) {
      return next(new AppError('A project already exists for this enquiry', 400));
    }

    const projectManager = await User.findById(enquiry.assignedTo);
    if (!projectManager || projectManager.isDeleted) {
      return next(new AppError('Project Manager not found', 404));
    }

    const project = await Project.create({
      projectName: projectName || `${enquiry.subject} - Project`,
      enquiryId: enquiry._id,
      clientName: enquiry.name,
      clientEmail: enquiry.email,
      clientPhone: enquiry.phone,
      projectManager: enquiry.assignedTo,
      projectManagerName: projectManager.name,
      status: 'Draft Quote',
      currentStage: 'Draft Quote',
      quote: {
        amount: quoteAmount || null,
        description: quoteDescription || null,
        draftDate: new Date(),
        draftBy: currentUser._id
      },
      services: services || [enquiry.subject],
      notes: notes || '',
      createdBy: currentUser._id
    });

    await project.populate('projectManager', 'name email designation');
    await project.populate('createdBy', 'name email');
    await project.populate('quote.draftBy', 'name email');

    logger.info(`Project created: ${project._id} for enquiry: ${enquiryId}`);

    res.status(201).json({
      success: true,
      message: 'Project created successfully',
      data: project
    });
  } catch (error) {
    logger.error('Create project error', {
      error: error.message,
      stack: error.stack
    });
    next(error instanceof AppError ? error : new AppError('Unable to create project', 500));
  }
};

const listProjects = async (req, res, next) => {
  try {
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const limit = Math.min(parseInt(req.query.limit, 10) || 20, 100);
    const searchTerm = typeof req.query.search === 'string' ? req.query.search.trim() : '';
    const status = req.query.status?.trim();
    const projectManagerId = req.query.projectManager?.trim();
    const skip = (page - 1) * limit;

    const filter = {};
    if (searchTerm) {
      const regex = new RegExp(searchTerm, 'i');
      filter.$or = [
        { projectName: regex },
        { clientName: regex },
        { clientEmail: regex }
      ];
    }
    if (status) {
      filter.status = status;
    }
    if (projectManagerId) {
      filter.projectManager = projectManagerId;
    }

    const [projects, total] = await Promise.all([
      Project.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate('projectManager', 'name email designation')
        .populate('enquiryId', 'subject status'),
      Project.countDocuments(filter)
    ]);

    res.status(200).json({
      success: true,
      message: 'Projects fetched successfully',
      data: {
        items: projects,
        page,
        limit,
        total,
        totalPages: Math.max(Math.ceil(total / limit), 1)
      }
    });
  } catch (error) {
    logger.error('List projects error', {
      error: error.message,
      stack: error.stack
    });
    next(error);
  }
};

const getProjectById = async (req, res, next) => {
  try {
    const { id } = req.params;
    const project = await Project.findById(id)
      .populate('projectManager', 'name email designation')
      .populate('enquiryId')
      .populate('createdBy', 'name email')
      .populate('quote.draftBy', 'name email')
      .populate('quote.assignedApprover', 'name email')
      .populate('quote.internalApprovedBy', 'name email')
      .populate('quote.sentBy', 'name email')
      .populate('onboarding.onboardingBy', 'name email')
      .populate('drafting.draftedBy', 'name email')
      .populate('filing.filedBy', 'name email')
      .populate('grant.grantedBy', 'name email')
      .populate('close.closedBy', 'name email');

    if (!project) {
      return next(new AppError('Project not found', 404));
    }

    res.status(200).json({
      success: true,
      message: 'Project fetched successfully',
      data: project
    });
  } catch (error) {
    logger.error('Get project by ID error', {
      error: error.message,
      stack: error.stack,
      projectId: req.params.id
    });
    next(error instanceof AppError ? error : new AppError('Unable to fetch project', 500));
  }
};

const updateProject = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { projectName, status, currentStage, quote, payment, onboarding, services, notes } = req.body;
    const currentUser = req.user;

    const project = await Project.findById(id);
    if (!project) {
      return next(new AppError('Project not found', 404));
    }

    const previousStage = project.currentStage;
    const previousApproverId = project.quote?.assignedApprover ? project.quote.assignedApprover.toString() : null;
    let notifyApprover = false;
    let assignedApproverInfo = null;

    if (projectName) {
      project.projectName = projectName.trim();
    }

    if (status) {
      const allowedStatuses = ['Draft Quote', 'Internal Approval', 'Quote Sent', 'Client Approval', 'Payment', 'Onboarding', 'Drafting', 'Filing', 'Grant', 'Close', 'Completed', 'Cancelled'];
      if (!allowedStatuses.includes(status)) {
        return next(new AppError('Invalid status value', 400));
      }
      project.status = status;
    }

    if (currentStage) {
      const allowedStages = ['Draft Quote', 'Internal Approval', 'Quote Sent', 'Client Approval', 'Payment', 'Onboarding', 'Drafting', 'Filing', 'Grant', 'Close'];
      if (!allowedStages.includes(currentStage)) {
        return next(new AppError('Invalid stage value', 400));
      }
      project.currentStage = currentStage;
    }
    const stageJustMovedToInternal = previousStage !== 'Internal Approval' && project.currentStage === 'Internal Approval';
    const leavingInternalStage = previousStage === 'Internal Approval' && project.currentStage !== 'Internal Approval';
    const revertedFromInternalApproval = previousStage === 'Internal Approval' && project.currentStage === 'Draft Quote';

    // Update quote details
    if (quote) {
      if (quote.invoiceNumber !== undefined) project.quote.invoiceNumber = quote.invoiceNumber?.trim() || null;
      if (quote.clientName !== undefined) project.quote.clientName = quote.clientName?.trim() || null;
      if (quote.title !== undefined) project.quote.title = quote.title?.trim() || null;
      if (quote.serviceType !== undefined) project.quote.serviceType = quote.serviceType?.trim() || null;
      if (quote.lineItems !== undefined && Array.isArray(quote.lineItems)) {
        project.quote.lineItems = quote.lineItems.map(item => ({
          description: item.description?.trim() || '',
          quantity: item.quantity || 0,
          unitPrice: item.unitPrice || 0,
          currency: item.currency || 'INR',
          finalCost: item.finalCost || (item.quantity || 0) * (item.unitPrice || 0)
        }));
      }
      if (quote.amount !== undefined) project.quote.amount = quote.amount;
      if (quote.currency) project.quote.currency = quote.currency;
      if (quote.description !== undefined) project.quote.description = quote.description?.trim() || null;

      // Handle assigning approver for Internal Approval
      if (quote.assignedApprover !== undefined) {
        // Only allow assignment if not already approved
        if (project.quote.internalApprovalDate) {
          return next(new AppError('Cannot change approver. Quote already approved.', 400));
        }

        // Validate that the assigned user has Higher Management role
        if (quote.assignedApprover) {
          const assignedUser = await User.findById(quote.assignedApprover);
          if (!assignedUser || assignedUser.isDeleted) {
            return next(new AppError('Assigned approver not found', 404));
          }

          const assignedUserRoles = await UserRole.find({ userId: assignedUser._id }).lean();
          const assignedRoleIds = assignedUserRoles.map(ur => ur.roleId);
          const assignedRoles = await Role.find({ _id: { $in: assignedRoleIds } }).lean();
          const assignedRoleNames = assignedRoles.map(r => r.rolename);

          if (!assignedRoleNames.includes('Higher Management')) {
            return next(new AppError('Assigned user must have Higher Management role', 400));
          }

          project.quote.assignedApprover = assignedUser._id;
          project.quote.assignedApproverName = assignedUser.name;
          project.quote.assignedApproverAt = new Date();
          if (previousApproverId !== assignedUser._id.toString()) {
            notifyApprover = project.currentStage === 'Internal Approval';
            assignedApproverInfo = {
              name: assignedUser.name,
              email: assignedUser.email
            };
          }
        } else {
          // Unassign approver
          project.quote.assignedApprover = null;
          project.quote.assignedApproverName = null;
          project.quote.assignedApproverAt = null;
          notifyApprover = false;
          assignedApproverInfo = null;
        }
      }

      if (currentStage === 'Quote Sent' && !project.quote.sentDate) {
        project.quote.sentDate = new Date();
        project.quote.sentBy = currentUser._id;
      }
      if (quote.clientApproved !== undefined) {
        project.quote.clientApproved = quote.clientApproved;
        if (quote.clientApproved && !project.quote.clientApprovalDate) {
          project.quote.clientApprovalDate = new Date();
        }
      }
    }

    // Handle stage transitions for Internal Approval approvals (when leaving the stage)
    if (leavingInternalStage && !project.quote.internalApprovalDate) {
      if (!project.quote.assignedApprover) {
        return next(new AppError('Higher Management approver not assigned', 400));
      }

      if (project.quote.assignedApprover.toString() !== currentUser._id.toString()) {
        return next(new AppError('Only the assigned Higher Management approver can approve this quote', 403));
      }

      project.quote.internalApprovalDate = new Date();
      project.quote.internalApprovedBy = currentUser._id;
    }

    // If the project was sent back to Draft Quote from Internal Approval, require a fresh approval
    if (revertedFromInternalApproval) {
      project.quote.internalApprovalDate = null;
      project.quote.internalApprovedBy = null;
    }

    if (stageJustMovedToInternal) {
      if (!project.quote.assignedApprover) {
        return next(new AppError('Please assign a Higher Management approver before requesting Internal Approval', 400));
      }
    }

    // Update payment details
    if (payment) {
      if (payment.amount !== undefined) project.payment.amount = payment.amount;
      if (payment.currency) project.payment.currency = payment.currency;
      if (payment.status) {
        const allowedPaymentStatuses = ['Pending', 'Partial', 'Completed', 'Refunded'];
        if (!allowedPaymentStatuses.includes(payment.status)) {
          return next(new AppError('Invalid payment status', 400));
        }
        project.payment.status = payment.status;
      }
      if (payment.paymentDate) project.payment.paymentDate = new Date(payment.paymentDate);
      if (payment.paymentMethod !== undefined) project.payment.paymentMethod = payment.paymentMethod?.trim() || null;
      if (payment.transactionId !== undefined) project.payment.transactionId = payment.transactionId?.trim() || null;
      if (payment.notes !== undefined) project.payment.notes = payment.notes?.trim() || null;
    }

    // Update onboarding details
    if (onboarding) {
      if (onboarding.startDate) project.onboarding.startDate = new Date(onboarding.startDate);
      if (onboarding.completedDate) project.onboarding.completedDate = new Date(onboarding.completedDate);
      if (onboarding.onboardingBy) project.onboarding.onboardingBy = onboarding.onboardingBy;
      if (onboarding.notes !== undefined) project.onboarding.notes = onboarding.notes?.trim() || null;

      if (currentStage === 'Onboarding' && !project.onboarding.onboardingBy) {
        project.onboarding.onboardingBy = currentUser._id;
        if (!project.onboarding.startDate) {
          project.onboarding.startDate = new Date();
        }
      }
    }

    // Update drafting details
    if (req.body.drafting) {
      const drafting = req.body.drafting;
      if (drafting.startDate) project.drafting.startDate = new Date(drafting.startDate);
      if (drafting.completedDate) project.drafting.completedDate = new Date(drafting.completedDate);
      if (drafting.draftedBy) project.drafting.draftedBy = drafting.draftedBy;
      if (drafting.notes !== undefined) project.drafting.notes = drafting.notes?.trim() || null;

      if (currentStage === 'Drafting' && !project.drafting.draftedBy) {
        project.drafting.draftedBy = currentUser._id;
        if (!project.drafting.startDate) {
          project.drafting.startDate = new Date();
        }
      }
    }

    // Update filing details
    if (req.body.filing) {
      const filing = req.body.filing;
      if (filing.filingDate) project.filing.filingDate = new Date(filing.filingDate);
      if (filing.applicationNumber !== undefined) project.filing.applicationNumber = filing.applicationNumber?.trim() || null;
      if (filing.filedBy) project.filing.filedBy = filing.filedBy;
      if (filing.notes !== undefined) project.filing.notes = filing.notes?.trim() || null;

      if (currentStage === 'Filing' && !project.filing.filedBy) {
        project.filing.filedBy = currentUser._id;
        if (!project.filing.filingDate) {
          project.filing.filingDate = new Date();
        }
      }
    }

    // Update grant details
    if (req.body.grant) {
      const grant = req.body.grant;
      if (grant.grantDate) project.grant.grantDate = new Date(grant.grantDate);
      if (grant.grantNumber !== undefined) project.grant.grantNumber = grant.grantNumber?.trim() || null;
      if (grant.grantedBy) project.grant.grantedBy = grant.grantedBy;
      if (grant.notes !== undefined) project.grant.notes = grant.notes?.trim() || null;

      if (currentStage === 'Grant' && !project.grant.grantedBy) {
        project.grant.grantedBy = currentUser._id;
        if (!project.grant.grantDate) {
          project.grant.grantDate = new Date();
        }
      }
    }

    // Update close details
    if (req.body.close) {
      const close = req.body.close;
      if (close.closedDate) project.close.closedDate = new Date(close.closedDate);
      if (close.closedBy) project.close.closedBy = close.closedBy;
      if (close.remarks !== undefined) project.close.remarks = close.remarks?.trim() || null;

      if (currentStage === 'Close' && !project.close.closedBy) {
        project.close.closedBy = currentUser._id;
        if (!project.close.closedDate) {
          project.close.closedDate = new Date();
        }
      }
    }

    if (services) {
      project.services = Array.isArray(services) ? services : [services];
    }

    if (notes !== undefined) {
      project.notes = notes.trim();
    }

    await project.save();
    await project.populate('projectManager', 'name email designation');
    await project.populate('enquiryId');
    await project.populate('createdBy', 'name email');
    await project.populate('quote.draftBy', 'name email');
    await project.populate('quote.internalApprovedBy', 'name email');
    await project.populate('quote.sentBy', 'name email');
    await project.populate('onboarding.onboardingBy', 'name email');
    await project.populate('drafting.draftedBy', 'name email');
    await project.populate('filing.filedBy', 'name email');
    await project.populate('grant.grantedBy', 'name email');
    await project.populate('close.closedBy', 'name email');

    if (!notifyApprover && stageJustMovedToInternal && project.quote.assignedApprover) {
      try {
        const assignedUser = await User.findById(project.quote.assignedApprover).lean();
        if (assignedUser && !assignedUser.isDeleted) {
          assignedApproverInfo = {
            name: assignedUser.name,
            email: assignedUser.email
          };
          notifyApprover = Boolean(assignedApproverInfo.email);
        }
      } catch (err) {
        logger.error('Failed to load assigned approver for notification', {
          error: err.message,
          projectId: project._id
        });
      }
    }

    if (notifyApprover && assignedApproverInfo?.email) {
      const portalBaseUrl = APPROVAL_PORTAL_URL.endsWith('/')
        ? APPROVAL_PORTAL_URL.slice(0, -1)
        : APPROVAL_PORTAL_URL;
      const approvalLink = `${portalBaseUrl}/admin/projects/${project._id}`;
      try {
        await sendMail({
          to: assignedApproverInfo.email,
          subject: `Project Approval Needed: ${project.projectName}`,
          text: `Hi ${assignedApproverInfo.name || 'there'},\n\nYou have been assigned to approve the quote for the project "${project.projectName}".\n\nPlease review the project details at: ${approvalLink}\n\nThank you,\nEuProximaX`,
          html: `
            <p>Hi <strong>${assignedApproverInfo.name || 'there'}</strong>,</p>
            <p>You have been assigned to approve the quote for the project <strong>${project.projectName}</strong>.</p>
            <p>
              <a href="${approvalLink}" style="display:inline-block;padding:10px 16px;border-radius:8px;background-color:#4f46e5;color:#ffffff;text-decoration:none;font-weight:600;">
                Review Project →
              </a>
            </p>
            <p>Please log in to the admin portal to complete the approval.</p>
            <p style="margin-top:24px;">Regards,<br/>EuProximaX Team</p>
          `
        });
      } catch (mailError) {
        logger.error('Project approval notification failed', {
          error: mailError.message,
          projectId: project._id,
          email: assignedApproverInfo.email
        });
      }
    }

    res.status(200).json({
      success: true,
      message: 'Project updated successfully',
      data: project
    });
  } catch (error) {
    logger.error('Update project error', {
      error: error.message,
      stack: error.stack,
      projectId: req.params.id
    });
    next(error instanceof AppError ? error : new AppError('Unable to update project', 500));
  }
};

const deleteProject = async (req, res, next) => {
  try {
    const { id } = req.params;
    const project = await Project.findById(id);

    if (!project) {
      return next(new AppError('Project not found', 404));
    }

    await Project.findByIdAndDelete(id);
    logger.info(`Project deleted: ${id}`);

    res.status(200).json({
      success: true,
      message: 'Project deleted successfully'
    });
  } catch (error) {
    logger.error('Delete project error', {
      error: error.message,
      stack: error.stack,
      projectId: req.params.id
    });
    next(error instanceof AppError ? error : new AppError('Unable to delete project', 500));
  }
};

module.exports = {
  createProject,
  listProjects,
  getProjectById,
  updateProject,
  deleteProject
};

