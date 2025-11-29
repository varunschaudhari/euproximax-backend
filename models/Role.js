const mongoose = require('mongoose');

const RoleSchema = new mongoose.Schema(
	{
		rolename: {
			type: String,
			required: true,
			trim: true,
			minlength: 2,
			maxlength: 64,
			unique: true
		}
	},
	{
		timestamps: { createdAt: 'createdAt', updatedAt: 'updatedAt' }
	}
);

module.exports = mongoose.models.Role || mongoose.model('Role', RoleSchema);


