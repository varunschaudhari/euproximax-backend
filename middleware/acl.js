const mongoose = require('mongoose');
const { ObjectId } = mongoose.Types;
const logger = require('../utils/logger');

/**
 * ACL (Access Control List) Middleware
 * Verifies user permissions based on roles and route-level permissions
 * 
 * Note: This middleware requires UserRole and AclPermission models to be created.
 * 
 * @param {Array} routeLvl - Array of permission objects to check
 * @returns {Function} Express middleware function
 * 
 * @example
 * // In routes file:
 * const verifyAcl = require('../middleware/acl');
 * router.get('/protected-route', verifyAcl([{ permission: 'read' }]), controller.method);
 */
const verifyAcl = (routeLvl) => {
  return async (req, res, next) => {
    // Check the required permission versus user permissions
    const requiredPermissions = JSON.parse(JSON.stringify(routeLvl));

    const query = {};
    query.userId = new ObjectId(req.user._id);

    const userRoles = [];
    let data;

    try {
      // TODO: Replace with your actual UserRole model
      // Example: const UserRole = require('../models/UserRole');
      // data = await UserRole.find(query);
      // data.forEach((role) => {
      //   userRoles.push(role.roleId.toString());
      // });
      
      // Placeholder - you need to create UserRole model
      logger.warn('ACL: UserRole model not implemented. Please create models/UserRole.js');
      // For now, skip ACL check if models don't exist
      return next();
    } catch (err) {
      logger.error('ACL: Error fetching user roles:', err);
      return next(err);
    }

    try {
      // TODO: Replace with your actual AclPermission model
      // Example: const AclPermission = require('../models/AclPermission');
      // data = await AclPermission.find({ $or: requiredPermissions });
      
      // Placeholder - you need to create AclPermission model
      logger.warn('ACL: AclPermission model not implemented. Please create models/AclPermission.js');
      // For now, skip ACL check if models don't exist
      return next();
    } catch (err) {
      logger.error('ACL: Error fetching ACL permissions:', err);
      return next(err);
    }

    let returnObj = [];
    returnObj = data;
    const returnedRoleId = [];

    if (returnObj.length) {
      returnObj.forEach((role) => {
        returnedRoleId.push(role.roleId.toString());
      });
    }

    if (!(userRoles.length && userRoles.some((val) => returnedRoleId.includes(val)))) {
      const errObj = {
        message: 'UNAUTHORIZED',
        code: 1000,
        status: 401
      };
      return next(errObj);
    }

    return next();
  };
};

module.exports = verifyAcl;

