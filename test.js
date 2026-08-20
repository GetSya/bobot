const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { DatabaseManager } = require('./db');
const { isPastDateTime, checkCapacityConflict, generateReservationsCSV } = require('./utils');

const TEST_DB = path.join(__dirname, 'test_db.json');

if (fs.existsSync(TEST_DB)) {
  fs.unlinkSync(TEST_DB);
}

const db = new DatabaseManager(TEST_DB);

const settings = db.getSettings();
assert.strictEqual(typeof settings.shopName, 'string');

db.updateSettings({ shopName: 'Resto Test' });
assert.strictEqual(db.getSettings().shopName, 'Resto Test');

const res = db.addReservation({
  userId: 123456,
  username: 'tester',
  name: 'Budi Test',
  phone: '081234567890',
  date: '31-12-2026',
  time: '18:00',
  durationHours: 2,
  area: 'Indoor',
  people: '4',
  note: 'Jendela'
});

assert.strictEqual(res.name, 'Budi Test');
assert.strictEqual(res.status, 'Pending');

const assigned = db.assignTable(res.id, 'T-01');
assert.strictEqual(assigned.tableId, 'T-01');

const isPast = isPastDateTime('01-01-2000', '10:00');
assert.strictEqual(isPast, true);

const conflictCheck = checkCapacityConflict(db, 'Indoor', '31-12-2026', '18:00', 2, 25);
assert.strictEqual(conflictCheck.conflict, true);

const csv = generateReservationsCSV(db.getReservations());
assert.ok(csv.includes('Budi Test'));

// Blockout Dates Test
db.addBlockedDate({ date: '25-12-2026', reason: 'Libur Natal' });
assert.ok(db.isDateBlocked('25-12-2026'));
assert.strictEqual(db.isDateBlocked('25-12-2026').reason, 'Libur Natal');
assert.strictEqual(db.isDateBlocked('26-12-2026'), null);

// Phone Search Test
const foundByPhone = db.getReservationsByPhone('081234567890');
assert.strictEqual(foundByPhone.length, 1);
assert.strictEqual(foundByPhone[0].id, res.id);

// Duplicate Booking Check Test
const dup = db.checkDuplicateUserBooking(123456, '31-12-2026', '19:00');
assert.ok(dup !== null);
assert.strictEqual(dup.id, res.id);

// Admin Notes Test
const updatedAdminNote = db.updateReservation(res.id, { adminNote: 'Pelanggan VIP' });
assert.strictEqual(updatedAdminNote.adminNote, 'Pelanggan VIP');

// Menu CRUD Tests
const newMenu = db.addMenuItem({
  name: 'Sate Ayam Madura',
  category: 'Makanan',
  price: 30000,
  description: 'Sate ayam dengan bumbu kacang gurih.',
  image: 'https://example.com/sate.jpg'
});
assert.strictEqual(newMenu.name, 'Sate Ayam Madura');
assert.strictEqual(newMenu.price, 30000);

const foodItems = db.getMenuItems('Makanan');
assert.ok(foodItems.some((m) => m.name === 'Sate Ayam Madura'));

const updatedMenu = db.updateMenuItem(newMenu.id, { price: 35000 });
assert.strictEqual(updatedMenu.price, 35000);

const deleted = db.deleteMenuItem(newMenu.id);
assert.strictEqual(deleted, true);
assert.strictEqual(db.getMenuItemById(newMenu.id), null);

if (fs.existsSync(TEST_DB)) {
  fs.unlinkSync(TEST_DB);
}

console.log('Semua Unit Test Berhasil (All tests passed)!');
