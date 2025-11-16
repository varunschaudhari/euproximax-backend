const logger = require('../utils/logger');
const mongoose = require('mongoose');
const { Types } = mongoose;
const ObjectId = Types.ObjectId;

// Mongoose models
const Role = require('../models/Role');
const AclPermission = require('../models/AclPermission');
const UserRole = require('../models/UserRole');
const RoleHistory = require('../models/RoleHistory');
const User = require('../models/User');

try {
	({ createRoleHistory, createPermissionHistory, createUserRoleHistory } = require('../middleware/history'));
} catch (e) {
	logger.warn('ACL history middleware not found. History events will be skipped.');
}

module.exports.createRole = async (req, res, next) => {
	if (!req.body.rolename) {
		const errorObj = {
			message: 'MISSING_PARAMETERS - role name / channel',
			code: 1006,
			status: 403
		};
		logger.error(errorObj.message);
		return next(errorObj);
	}
	logger.info('create role, rolename = ' + req.body.rolename + ' by user = ' + (req.user?.name || 'unknown'));
	try {
		const role = await Role.create({ rolename: req.body.rolename });
		createRoleHistory(role, 'CREATE', req.user);
		logger.debug('Role created by user ' + (req.user?.name || 'unknown') + ' role name = ' + req.body.rolename);
		return res.json(role);
	} catch (err) {
		return next(err);
	}
};

module.exports.getRoles = async (req, res, next) => {
	const query = {};
	if (req.query.roleId) {
		query._id = new ObjectId(req.query.roleId);
	}
	let role;
	try {
		role = await Role.find(query).lean();
	} catch (err) {
		return next(err);
	}
	if (req.query.roleId) {
		logger.debug('Got role by user ' + (req.user?.name || 'unknown') + ' roleId = ' + req.query.roleId);
	} else {
		logger.debug('Got roles by user ' + (req.user?.name || 'unknown'));
	}
	return res.json(role);
};

module.exports.deleteRoleById = async (req, res, next) => {
	if (!req.query.roleId) {
		const errorObj = {
			message: 'MISSING_PARAMETERS - roleId',
			code: 1006,
			status: 403
		};
		logger.error(errorObj.message);
		return next(errorObj);
	}
	logger.info('Delete role = ' + req.query.roleId + ' by user = ' + (req.user?.name || 'unknown'));
	const query = { _id: new ObjectId(req.query.roleId) };
	let role;
	try {
		role = await Role.findById(query._id).lean();
	} catch (err) {
		return next(err);
	}
	if (role && (role.rolename === 'superuser' || role.rolename === 'admin')) {
		const errorObj = {
			message: 'UNAUTHORIZED - Cannot delete the role',
			code: 1006,
			status: 403
		};
		logger.error(errorObj.message);
		return next(errorObj);
	}
	try {
		await UserRole.deleteMany({ roleId: query._id });
		const roleDeleted = await Role.deleteOne({ _id: query._id });
		createRoleHistory(role, 'DELETE', req.user);
		logger.debug('Role deleted by user ' + (req.user?.name || 'unknown') + ' roleId = ' + req.query.roleId);
		return res.json(roleDeleted);
	} catch (err) {
		return next(err);
	}
};

// create permission(s)
module.exports.createPermission = async (req, res, next) => {
	if (!Array.isArray(req.body)) {
		const errorObj = {
			message: 'Request body should be an array ',
			code: 1006,
			status: 403
		};
		logger.error(errorObj.message);
		return next(errorObj);
	}
	let missingParameters = false;
	const query = { $or: [] };
	let insertPermissions = [];
	for (const obj of req.body) {
		if (!obj.roleId || !obj.type || !obj.action) {
			missingParameters = true;
			break;
		}
		const prepared = { roleId: new ObjectId(obj.roleId), type: String(obj.type), action: String(obj.action) };
		insertPermissions.push(prepared);
		query.$or.push({ roleId: prepared.roleId, type: prepared.type, action: prepared.action });
	}
	if (missingParameters) {
		const errorObj = {
			message: 'MISSING_PARAMETERS - role name / type / action ',
			code: 1006,
			status: 403
		};
		logger.error(errorObj.message);
		return next(errorObj);
	}
	logger.info('Creating Permission by user = ' + (req.user?.name || 'unknown'));
	try {
		if (query.$or.length) {
			const dupPermissions = await getPermissionDb(query);
			if (dupPermissions.length) {
				const newPermissions = [];
				insertPermissions.forEach((permission) => {
					let isDuplicate = false;
					for (const dupPermission of dupPermissions) {
						if (dupPermission.type === permission.type && dupPermission.action === permission.action) {
							isDuplicate = true;
							break;
						}
					}
					if (!isDuplicate) {
						newPermissions.push(permission);
					}
				});
				insertPermissions = newPermissions;
			}
		}
		if (!insertPermissions.length) {
			return res.json([]);
		}
		const result = await AclPermission.insertMany(insertPermissions, { ordered: false });
		const ids = result.map((doc) => doc._id);
		const permissions = await AclPermission.find({ _id: { $in: ids } }).lean();
		createPermissionHistory(permissions, 'CREATE', req.user);
		logger.debug('created acl permission by user ' + (req.user?.name || 'unknown'));
		return res.json(permissions);
	} catch (err) {
		return next(err);
	}
};

module.exports.getPermissionByRoleId = async (req, res, next) => {
	if (!req.query.roleId) {
		const errorObj = {
			message: 'MISSING_PARAMETERS - role name',
			code: 1006,
			status: 403
		};
		logger.error(errorObj.message);
		return next(errorObj);
	}
	logger.info('Get Permission for role = ' + req.query.roleId + ' by user = ' + (req.user?.name || 'unknown'));
	const query = { roleId: new ObjectId(req.query.roleId) };
	try {
		const data = await AclPermission.find(query).lean();
		logger.debug('Got permission by id, by user ' + (req.user?.name || 'unknown') + ' roleId = ' + req.query.roleId);
		return res.json(data);
	} catch (err) {
		return next(err);
	}
};

module.exports.getAllPermission = async (req, res, next) => {
	logger.debug('Function - get all permission by id, by user ' + (req.user?.name || 'unknown'));
	const permissions = await AclPermission.distinct('type');
	return res.json(permissions);
};

module.exports.setUserRole = async (req, res, next) => {
	if (!req.body.roleIds || !req.body.userId) {
		const errorObj = {
			message: 'MISSING_PARAMETERS - role-name / user-name',
			code: 1006,
			status: 403
		};
		logger.error(errorObj.message);
		return next(errorObj);
	}
	logger.info('set user = ' + req.body.userId + ' for role = ' + req.body.roleIds + ' by user = ' + (req.user?.name || 'unknown'));
	const roleIds = req.body.roleIds.map((roleId) => new ObjectId(roleId));
	const userId = new ObjectId(req.body.userId);
	const userRoles = roleIds.map((roleId) => ({ roleId, userId }));
	let user;
	try {
		user = await User.findOne({ _id: userId, status: { $ne: 'DELETED' } }).lean();
	} catch (err) {
		return next(err);
	}
	try {
		const prvUserRoles = await UserRole.find({ userId }).lean();
		const existingRoleIds = prvUserRoles.map((ur) => new ObjectId(ur.roleId));
		let roles = [];
		if (existingRoleIds.length) {
			try {
				roles = await Role.find({ _id: { $in: existingRoleIds } }).lean();
			} catch (e) {
				logger.error(e);
			}
		}
		const roleNames = roles.map((r) => r.rolename);
		const userRoleData = await UserRole.insertMany(userRoles, { ordered: false });
		createUserRoleHistory(roleNames, userId, req.user);
		logger.debug('User was set to a role, by = ' + (req.user?.name || 'unknown') + ' roleId = ' + req.body.roleIds + ' userId = ' + req.body.userId);
		return res.json(userRoleData);
	} catch (err) {
		return next(err);
	}
};

module.exports.getAllUserOfRole = async (req, res, next) => {
	if (!req.query.roleId) {
		const errorObj = {
			message: 'MISSING_PARAMETERS : role-name',
			code: 1006,
			status: 403
		};
		logger.error(errorObj.message);
		return next(errorObj);
	}
	logger.info('Get all users for role = ' + req.query.roleId + ' by user = ' + (req.user?.name || 'unknown'));
	const aggregate = [
		{ $match: { roleId: new ObjectId(req.query.roleId) } },
		{
			$lookup: {
				from: 'users',
				localField: 'userId',
				foreignField: '_id',
				as: 'user'
			}
		},
		{ $unwind: { path: '$user' } },
		{ $addFields: { username: '$user.name' } },
		{ $project: { user: 0 } }
	];
	try {
		const data = await UserRole.aggregate(aggregate);
		return res.json(data);
	} catch (err) {
		return next(err);
	}
};

module.exports.deleteUserFromRoleById = async (req, res, next) => {
	if (!req.query.roleId || !req.query.userId) {
		const errorObj = {
			message: 'MISSING_PARAMETERS - role-name /user-name ',
			code: 1006,
			status: 403
		};
		logger.error(errorObj.message);
		return next(errorObj);
	}
	logger.info('Delete user = ' + req.query.userId + ' from role = ' + req.query.roleId + ' by user = ' + (req.user?.name || 'unknown'));
	const query = { roleId: new ObjectId(req.query.roleId), userId: new ObjectId(req.query.userId) };
	try {
		const prvUserRoles = await UserRole.find({ userId: new ObjectId(req.query.userId) }).lean();
		const roleIds = prvUserRoles.map((ur) => new ObjectId(ur.roleId));
		let roles = [];
		if (roleIds.length) {
			try {
				roles = await Role.find({ _id: { $in: roleIds } }).lean();
			} catch (e) {
				logger.error(e);
			}
		}
		const roleNames = roles.map((r) => r.rolename);
		const role = await UserRole.deleteMany(query);
		createUserRoleHistory(roleNames, query.userId, req.user);
		logger.debug('User deleted from role by user ' + (req.user?.name || 'unknown') + ' deleted userId = ' + req.query.userId + ' roleId = ' + req.query.roleId);
		return res.json(role);
	} catch (err) {
		return next(err);
	}
};

module.exports.getUserPermissions = async (req, res, next) => {
	const query = { userId: new ObjectId(req.user._id) };
	logger.info('Get User Permission by user = ' + (req.user?.name || 'unknown'));
	try {
		const uroles = await UserRole.find(query).lean();
		const roleIds = uroles.map((ur) => new ObjectId(ur.roleId));
		const data = await AclPermission.find({ roleId: { $in: roleIds } }).lean();
		logger.debug('Got User Permisions, By User = ' + (req.user?.name || 'unknown') + ' of user = ' + req.user._id);
		return res.json(data);
	} catch (err) {
		return next(err);
	}
};

module.exports.deletePermissionByRoleId = async (req, res, next) => {
	if (!Array.isArray(req.body)) {
		const errorObj = {
			message: 'Request body should be an array ',
			code: 1006,
			status: 403
		};
		logger.error(errorObj.message);
		return next(errorObj);
	}
	if (req.body && !req.body.length) {
		const errorObj = {
			message: 'Request body should not be empty',
			code: 1006,
			status: 403
		};
		logger.error(errorObj.message);
		return next(errorObj);
	}
	logger.info('delete  Permissions for role by user = ' + (req.user?.name || 'unknown'));
	const requestBody = req.body.map((permissionId) => new ObjectId(permissionId));
	try {
		await createPermissionHistory(requestBody, 'DELETE', req.user);
		const data = await AclPermission.deleteMany({ _id: { $in: requestBody } });
		logger.debug('Delete permission by roleId, by user ' + (req.user?.name || 'unknown'));
		return res.json(data);
	} catch (err) {
		return next(err);
	}
};

module.exports.updateRole = async (req, res, next) => {
	if (!req.body.roleId || !req.body.rolename) {
		const errorObj = {
			message: 'MISSING_PARAMETERS - roleId or rolename',
			code: 1006,
			status: 403
		};
		logger.error(errorObj.message);
		return next(errorObj);
	}
	logger.info('Update role = ' + req.body.roleId + ' by user = ' + (req.user?.name || 'unknown'));
	const query = { _id: new ObjectId(req.body.roleId), rolename: req.body.rolename };
	try {
		const data = await Role.findByIdAndUpdate(query._id, { $set: { rolename: query.rolename } }, { new: true });
		createRoleHistory(query, 'UPDATE', req.user);
		logger.debug('Role updated by user ' + (req.user?.name || 'unknown') + ' roleId = ' + req.body.roleId);
		return res.json(data);
	} catch (err) {
		return next(err);
	}
};

module.exports.getRoleHistory = async (req, res) => {
	if (!req.query.roleId) {
		logger.error('Role ID is Missing!');
		res.status(403);
		return res.json({ error: 'Role ID is Missing!' });
	}
	const match = {};
	if (req.query.roleId) {
		match.roleId = new ObjectId(req.query.roleId);
	}
	const historyAggregate = [
		{ $match: match },
		{ $lookup: { from: 'users', localField: 'userId', foreignField: '_id', as: 'user' } },
		{ $unwind: '$user' },
		{ $project: { createdAt: 1, action: 1, username: '$user.name', userId: '$user._id' } },
		{ $sort: { createdAt: -1 } }
	];
	let data;
	try {
		data = await RoleHistory.aggregate(historyAggregate);
	} catch (e) {
		logger.error(e);
		return res.json({ error: e });
	}
	logger.debug('Got role histoty, by user = ' + (req.user?.name || 'unknown'));
	return res.json(data);
};

async function getPermissionDb(query) {
	const data = await AclPermission.find(query).lean();
	logger.debug('Get permissions , length = ' + data.length);
	return data;
}


