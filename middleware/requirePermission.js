/**
 * Server-side ACL enforcement. Matches the permission matrix (spec §3) using the
 * existing Role / UserRole / AclPermission tables — the same (type, action) pairs
 * the frontend reads via getUserPermissions.
 *
 * Full-access roles (super admin / owner / admin / superuser / Higher Management)
 * bypass the check. Everyone else must have the (type, action) permission granted
 * to one of their roles, else 403.
 *
 * Usage: router.post('/', requirePermission('PAYMENT', 'CREATE'), handler)
 */
const UserRole = require('../models/UserRole');
const AclPermission = require('../models/AclPermission');
const { getUserRoleNames, SEE_ALL_ROLES } = require('../utils/crmAccess');
const logger = require('../utils/logger');

const requirePermission = (type, action) => async (req, res, next) => {
  try {
    if (!req.user || !req.user._id) {
      return next({ message: 'UNAUTHORIZED', code: 1000, status: 401 });
    }

    const roleNames = await getUserRoleNames(req.user._id);
    if (roleNames.some((r) => SEE_ALL_ROLES.includes(r))) return next();

    const userRoles = await UserRole.find({ userId: req.user._id }).select('roleId').lean();
    const roleIds = userRoles.map((u) => u.roleId);
    if (roleIds.length) {
      const allowed = await AclPermission.exists({ roleId: { $in: roleIds }, type, action });
      if (allowed) return next();
    }

    logger.warn(`ACL denied: ${req.user.name || req.user._id} lacks ${action} ${type}`);
    return next({ message: `You do not have permission to ${action} ${type}`, code: 1003, status: 403 });
  } catch (err) {
    return next(err);
  }
};

module.exports = requirePermission;
