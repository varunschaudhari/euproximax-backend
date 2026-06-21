/**
 * CRM access helpers — resolve a user's role names and derive case-visibility
 * scope. Permission *enforcement* (CREATE/UPDATE/etc.) is driven by the ACL
 * permission map on the frontend; these helpers handle row-level case scoping
 * on the backend (who sees which cases).
 */
const UserRole = require('../models/UserRole');
const Role = require('../models/Role');

// CRM role names with firm-wide visibility (full-access). Includes the seeded
// 'super admin' (see scripts/seedCrmAcl.js), legacy 'owner', existing admin
// roles (superuser/admin) and "Higher Management".
const SEE_ALL_ROLES = ['super admin', 'owner', 'accounts', 'admin', 'superuser', 'Higher Management'];

/** Returns lowercase-normalised role names for a user. */
const getUserRoleNames = async (userId) => {
  const userRoles = await UserRole.find({ userId }).lean();
  if (!userRoles.length) return [];
  const roleIds = userRoles.map((ur) => ur.roleId);
  const roles = await Role.find({ _id: { $in: roleIds } }).lean();
  return roles.map((r) => r.rolename);
};

/**
 * Build a Mongoose filter limiting which cases a user may see.
 * - see-all roles: no restriction ({})
 * - pm: cases assigned to them as PM
 * - attorney: cases assigned to them as attorney
 * - anyone else with CASE read: assigned (PM or attorney) only
 */
const buildCaseScopeFilter = (roleNames, userId) => {
  const canSeeAll = roleNames.some((r) => SEE_ALL_ROLES.includes(r));
  if (canSeeAll) return {};

  const isPM = roleNames.includes('pm');
  const isAttorney = roleNames.includes('attorney');

  if (isPM && isAttorney) {
    return { $or: [{ assignedPM: userId }, { assignedAttorney: userId }] };
  }
  if (isPM) return { assignedPM: userId };
  if (isAttorney) return { assignedAttorney: userId };

  // Default: only cases where the user is assigned in any capacity.
  return { $or: [{ assignedPM: userId }, { assignedAttorney: userId }] };
};

module.exports = { SEE_ALL_ROLES, getUserRoleNames, buildCaseScopeFilter };
