const express = require('express');
const router = express.Router();
const aclController = require('../controllers/acl.controller');

// Roles
router.post('/roles', aclController.createRole);
router.get('/roles', aclController.getRoles);
router.delete('/roles', aclController.deleteRoleById);
router.put('/roles', aclController.updateRole);
router.get('/roles/history', aclController.getRoleHistory);

// Permissions
router.post('/permissions', aclController.createPermission);
router.get('/permissions', aclController.getAllPermission);
router.get('/permissions/by-role', aclController.getPermissionByRoleId);
router.delete('/permissions', aclController.deletePermissionByRoleId);

// User ↔ Role
router.post('/user-roles', aclController.setUserRole);
router.get('/user-roles', aclController.getAllUserOfRole);
router.delete('/user-roles', aclController.deleteUserFromRoleById);

module.exports = router;


