const mongoose = require('mongoose');
const { Schema } = mongoose;

const AclPermissionSchema = new Schema(
    {
        roleId: { type: Schema.Types.ObjectId, ref: 'Role', required: true },
        type: { type: String, required: true, trim: true }, // e.g., 'USER', 'ROLES', 'OPERATION'
        action: { type: String, required: true, trim: true } // e.g., 'CREATE', 'READ', 'UPDATE', 'DELETE'
    },
    {
        timestamps: { createdAt: 'createdAt', updatedAt: 'updatedAt' }
    }
);

// Prevent duplicate permissions per role
AclPermissionSchema.index({ roleId: 1, type: 1, action: 1 }, { unique: true });

module.exports = mongoose.models.AclPermission || mongoose.model('AclPermission', AclPermissionSchema);


