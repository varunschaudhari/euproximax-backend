/**
 * Diagnostic: print a user's roles and resolved ACL permissions.
 * Mirrors what GET /acl/user-permissions returns (and thus what the sidebar gates on).
 *
 * Usage: node scripts/checkUserPerms.js <email>
 *   e.g. node scripts/checkUserPerms.js varun@gmail.com
 */

require('dotenv').config();
const mongoose = require('mongoose');
const connectDB = require('../utils/db');
const User = require('../models/User');
const Role = require('../models/Role');
const UserRole = require('../models/UserRole');
const AclPermission = require('../models/AclPermission');

const email = (process.argv[2] || '').toLowerCase();

async function main() {
  if (!email) {
    console.error('Usage: node scripts/checkUserPerms.js <email>');
    process.exit(1);
  }
  await connectDB();

  const user = await User.findOne({ email }).lean();
  if (!user) {
    console.error(`❌ No user found with email: ${email}`);
    process.exit(1);
  }
  console.log(`\n👤 User: ${user.name} <${user.email}>  (_id: ${user._id})`);

  const uroles = await UserRole.find({ userId: user._id }).lean();
  if (!uroles.length) {
    console.error('❌ User has NO role assignments (UserRole). Sidebar will show nothing CRM.');
    await mongoose.connection.close();
    process.exit(0);
  }

  const roleIds = uroles.map((ur) => ur.roleId);
  const roles = await Role.find({ _id: { $in: roleIds } }).lean();
  console.log(`🧩 Roles: ${roles.map((r) => r.rolename).join(', ') || '(none resolvable)'}`);

  const perms = await AclPermission.find({ roleId: { $in: roleIds } }).lean();
  const byType = {};
  perms.forEach((p) => {
    byType[p.type] = byType[p.type] || [];
    if (!byType[p.type].includes(p.action)) byType[p.type].push(p.action);
  });

  console.log('\n🔐 Resolved permissions (type: actions):');
  Object.keys(byType).sort().forEach((t) => console.log(`   ${t}: ${byType[t].sort().join(', ')}`));

  const sidebar = [
    ['CASE', 'Patent CRM + Cases'],
    ['VENDOR', 'Vendors'],
    ['REPORT', 'Reports'],
    ['DEADLINE', 'Deadlines'],
    ['CONTACT', 'Enquiries'],
    ['USER', 'Users'],
    ['ROLES', 'Roles'],
  ];
  console.log('\n📋 Sidebar visibility (needs READ):');
  sidebar.forEach(([type, label]) => {
    const ok = (byType[type] || []).includes('READ');
    console.log(`   ${ok ? '✅' : '❌'} ${label}  (${type} READ)`);
  });

  await mongoose.connection.close();
  process.exit(0);
}

main().catch((err) => {
  console.error('Failed:', err);
  process.exit(1);
});
