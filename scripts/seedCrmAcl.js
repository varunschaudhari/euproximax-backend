/**
 * Seed Patent CRM roles and ACL permissions.
 *
 * Creates the five CRM roles (super admin, attorney, pm, accounts, client) if missing
 * and grants each role its permission set for the CRM resource types, matching
 * the permission matrix in patent-crm-technical-spec.md §3.
 *
 * Frontend gating uses these (type, action) pairs via getUserPermissions.
 * Resource types: CASE, CRM_CLIENT, PAYMENT, VENDOR, DOCUMENT, DEADLINE,
 * NOTIFICATION, REPORT.
 *
 * Run with: node scripts/seedCrmAcl.js
 */

require('dotenv').config();
const mongoose = require('mongoose');
const connectDB = require('../utils/db');
const Role = require('../models/Role');
const AclPermission = require('../models/AclPermission');

const CRM_ROLES = ['super admin', 'attorney', 'pm', 'accounts', 'client'];

// action sets
const ALL = ['CREATE', 'READ', 'UPDATE', 'DELETE'];
const RU = ['READ', 'UPDATE'];
const R = ['READ'];
const CRU = ['CREATE', 'READ', 'UPDATE'];

// type -> role -> actions
const MATRIX = {
  'super admin': {
    // Full CRM access
    CASE: ALL, CRM_CLIENT: ALL, PAYMENT: ALL, VENDOR: ALL,
    DOCUMENT: ALL, DEADLINE: ALL, NOTIFICATION: ALL, REPORT: R,
    // Platform administration + content modules
    USER: ALL, ROLES: ALL, CONTACT: ALL, BLOG: ALL, VIDEO: ALL,
    EVENT: ALL, PARTNER: ALL, CHATBOT: ALL, CONSULTATION: ALL
  },
  attorney: {
    CASE: RU, CRM_CLIENT: R, DOCUMENT: CRU, DEADLINE: RU, NOTIFICATION: R
  },
  pm: {
    CASE: CRU, CRM_CLIENT: CRU, VENDOR: ALL, DOCUMENT: CRU,
    DEADLINE: CRU, NOTIFICATION: R, CONTACT: RU
  },
  accounts: {
    CASE: R, CRM_CLIENT: R, PAYMENT: ALL, VENDOR: RU, REPORT: R, NOTIFICATION: R
  },
  client: {
    // portal-only; CASE/DOCUMENT/PAYMENT read of own records (enforced server-side)
    CASE: R, DOCUMENT: R, PAYMENT: R
  }
};

async function seed() {
  await connectDB();

  for (const rolename of CRM_ROLES) {
    let role = await Role.findOne({ rolename });
    if (!role) {
      role = await Role.create({ rolename });
      console.log(`Created role: ${rolename}`);
    } else {
      console.log(`Role exists: ${rolename}`);
    }

    const perms = MATRIX[rolename] || {};
    const ops = [];
    for (const [type, actions] of Object.entries(perms)) {
      for (const action of actions) {
        ops.push({
          updateOne: {
            filter: { roleId: role._id, type, action },
            update: { $setOnInsert: { roleId: role._id, type, action } },
            upsert: true
          }
        });
      }
    }
    if (ops.length) {
      const res = await AclPermission.bulkWrite(ops);
      console.log(`  ${rolename}: ${ops.length} permissions ensured (${res.upsertedCount} new)`);
    }
  }

  console.log('\nCRM ACL seed complete.');
  await mongoose.connection.close();
  process.exit(0);
}

seed().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
