import fs from 'node:fs';
import path from 'node:path';

const dbPath = path.resolve('data/db.json');
const backupPath = path.resolve('data/db.json.bak');
if (!fs.existsSync(backupPath)) throw new Error('Create data/db.json.bak before running this repair.');

const db = JSON.parse(fs.readFileSync(dbPath, 'utf8'));
if (!Array.isArray(db.users)) throw new Error('Database users list is missing.');
const candidates = db.users.filter((user: any) => user.id === 'usr-super-admin-01' || user.role === 'super_admin');
const admin = candidates[candidates.length - 1];
if (!admin) throw new Error('Super Admin record was not found; no data was changed.');

admin.role = 'super_admin';
admin.twoFactorEnabled = false;
delete admin.twoFactorSecret;
delete admin.pendingTwoFactorSecret;
admin.mustSetup2FA = true;
admin.mustChangePassword = true;
db.users = db.users.filter((user: any) => user === admin || (user.id !== 'usr-super-admin-01' && user.role !== 'super_admin'));
if (!db.users.includes(admin)) db.users.push(admin);

fs.writeFileSync(dbPath, `${JSON.stringify(db, null, 2)}\n`, 'utf8');
console.log('Repaired Super Admin record; invalid 2FA secret removed and setup required.');
