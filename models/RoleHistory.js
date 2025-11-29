const mongoose = require('mongoose');
const { Schema } = mongoose;

const RoleHistorySchema = new Schema(
	{
		roleId: { type: Schema.Types.ObjectId, ref: 'Role', required: true },
		action: { type: String, required: true, enum: ['CREATE', 'UPDATE', 'DELETE'] },
		userId: { type: Schema.Types.ObjectId, ref: 'User', required: true }
	},
	{
		timestamps: { createdAt: 'createdAt', updatedAt: 'updatedAt' }
	}
);

RoleHistorySchema.index({ roleId: 1, createdAt: -1 });

module.exports = mongoose.models.RoleHistory || mongoose.model('RoleHistory', RoleHistorySchema);


