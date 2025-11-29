const mongoose = require('mongoose');
const { Schema } = mongoose;

const UserRoleSchema = new Schema(
	{
		userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
		roleId: { type: Schema.Types.ObjectId, ref: 'Role', required: true }
	},
	{
		timestamps: { createdAt: 'createdAt', updatedAt: 'updatedAt' }
	}
);

// Prevent the same role being assigned to the same user multiple times
UserRoleSchema.index({ userId: 1, roleId: 1 }, { unique: true });

module.exports = mongoose.models.UserRole || mongoose.model('UserRole', UserRoleSchema);


