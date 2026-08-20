const fs = require('fs');
const path = require('path');

const DB_FILE = path.join(__dirname, 'db.json');

class User {
  constructor(data) {
    this.id = Number(data.id);
    this.username = data.username || null;
    this.firstName = data.firstName || '';
    this.firstSeen = data.firstSeen || new Date().toISOString();
    this.lastSeen = data.lastSeen || new Date().toISOString();
    this.totalReservations = data.totalReservations || 0;
  }
}

class Reservation {
  constructor(data) {
    this.id = data.id;
    this.userId = Number(data.userId);
    this.username = data.username || null;
    this.name = data.name;
    this.phone = data.phone;
    this.date = data.date;
    this.time = data.time;
    this.durationHours = Number(data.durationHours || 2);
    this.area = data.area || 'Bebas';
    this.tableId = data.tableId || null;
    this.tableName = data.tableName || null;
    this.people = String(data.people);
    this.note = data.note || '';
    this.adminNote = data.adminNote || '';
    this.checkInTime = data.checkInTime || null;
    this.checkinAlertSent = Boolean(data.checkinAlertSent);
    this.preorder = data.preorder || '';
    this.status = data.status || 'Pending';
    this.isRecurring = Boolean(data.isRecurring);
    this.recurringPattern = data.recurringPattern || null;
    this.reminderSentH1 = Boolean(data.reminderSentH1);
    this.completionNotified = Boolean(data.completionNotified);
    this.createdAt = data.createdAt || new Date().toISOString();
    this.updatedAt = data.updatedAt || new Date().toISOString();
  }
}

class Activity {
  constructor(data) {
    this.id = data.id;
    this.type = data.type;
    this.reservationId = data.reservationId || null;
    this.userId = data.userId ? Number(data.userId) : null;
    this.actor = data.actor || null;
    this.description = data.description;
    this.timestamp = data.timestamp || new Date().toISOString();
  }
}

class Review {
  constructor(data) {
    this.id = data.id;
    this.reservationId = data.reservationId;
    this.userId = Number(data.userId);
    this.rating = Number(data.rating);
    this.feedback = data.feedback || '';
    this.createdAt = data.createdAt || new Date().toISOString();
  }
}

class MenuItem {
  constructor(data) {
    this.id = data.id || `MENU-${Date.now().toString(36)}`;
    this.name = data.name;
    this.category = data.category || 'Makanan';
    this.price = Number(data.price || 0);
    this.description = data.description || '';
    this.image = data.image || null;
    this.createdAt = data.createdAt || new Date().toISOString();
  }
}

class DatabaseManager {
  constructor(filePath = DB_FILE) {
    this.filePath = filePath;
    this.defaultDB = {
      settings: {
        botName: 'Bot Reservasi Restoran',
        description: 'Sistem Reservasi Meja Restoran & Cafe Modern',
        shopName: 'Le Gourmand Resto & Cafe',
        shopAddress: 'Jl. Sudirman No. 123, Jakarta Selatan',
        logo: 'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?w=500'
      },
      areas: [
        { id: 'Indoor', name: 'Indoor', capacity: 20 },
        { id: 'Outdoor', name: 'Outdoor', capacity: 15 },
        { id: 'VIP', name: 'VIP Room', capacity: 10 }
      ],
      tables: [
        { id: 'T-01', name: 'Meja 1 (Indoor)', area: 'Indoor', capacity: 4 },
        { id: 'T-02', name: 'Meja 2 (Indoor)', area: 'Indoor', capacity: 4 },
        { id: 'T-03', name: 'Meja 3 (Indoor Large)', area: 'Indoor', capacity: 6 },
        { id: 'T-04', name: 'Meja 4 (Outdoor Garden)', area: 'Outdoor', capacity: 4 },
        { id: 'T-05', name: 'Meja 5 (Outdoor Garden)', area: 'Outdoor', capacity: 4 },
        { id: 'V-01', name: 'Meja VIP Room 1', area: 'VIP', capacity: 10 }
      ],
      users: {},
      reservations: [],
      activities: [],
      reviews: [],
      blockedDates: [],
      menu: [
        {
          id: 'M-01',
          name: 'Nasi Goreng Spesial Le Gourmand',
          category: 'Makanan',
          price: 45000,
          description: 'Nasi goreng khas restoran dengan telur mata sapi, sate ayam, dan kerupuk.',
          image: 'https://images.unsplash.com/photo-1603133872878-684f208fb84b?w=500'
        },
        {
          id: 'M-02',
          name: 'Beef Steak Ribeye',
          category: 'Makanan',
          price: 120000,
          description: 'Daging sapi pilihan 200g dengan saus lada hitam dan kentang goreng.',
          image: 'https://images.unsplash.com/photo-1558030006-450675393462?w=500'
        },
        {
          id: 'D-01',
          name: 'Es Teh Manis Jumbo',
          category: 'Minuman',
          price: 10000,
          description: 'Teh melati segar dengan gula asli dan es batu.',
          image: 'https://images.unsplash.com/photo-1556679343-c7306c1976bc?w=500'
        },
        {
          id: 'D-02',
          name: 'Iced Avocado Coffee',
          category: 'Minuman',
          price: 35000,
          description: 'Perpaduan jus alpukat kental, espresso shot, dan es krim cokelat.',
          image: 'https://images.unsplash.com/photo-1517701604599-bb29b565090c?w=500'
        }
      ]
    };
    this.data = this.loadDB();
  }

  loadDB() {
    try {
      if (!fs.existsSync(this.filePath)) {
        fs.writeFileSync(this.filePath, JSON.stringify(this.defaultDB, null, 2));
      }
      const raw = fs.readFileSync(this.filePath, 'utf-8');
      const parsed = JSON.parse(raw);
      return {
        settings: { ...this.defaultDB.settings, ...(parsed.settings || {}) },
        areas: parsed.areas || this.defaultDB.areas,
        tables: parsed.tables || this.defaultDB.tables,
        users: parsed.users || {},
        reservations: parsed.reservations || [],
        activities: parsed.activities || [],
        reviews: parsed.reviews || [],
        blockedDates: parsed.blockedDates || [],
        menu: parsed.menu || this.defaultDB.menu
      };
    } catch (err) {
      return JSON.parse(JSON.stringify(this.defaultDB));
    }
  }

  saveDB() {
    try {
      fs.writeFileSync(this.filePath, JSON.stringify(this.data, null, 2));
    } catch (err) {
      console.error(err);
    }
  }

  getSettings() {
    return this.data.settings;
  }

  updateSettings(patch) {
    this.data.settings = { ...this.data.settings, ...patch };
    this.saveDB();
    return this.data.settings;
  }

  getAreas() {
    return this.data.areas;
  }

  getTables() {
    return this.data.tables;
  }

  getTablesByArea(areaId) {
    if (!areaId || areaId === 'Bebas') return this.data.tables;
    return this.data.tables.filter((t) => t.area === areaId);
  }

  getTableById(id) {
    if (!this.data.tables) return null;
    return this.data.tables.find((t) => t.id === id) || null;
  }

  addTable(tableData) {
    if (!this.data.tables) this.data.tables = [];
    const id = tableData.id || `T-${String(this.data.tables.length + 1).padStart(2, '0')}`;
    const newTable = {
      id,
      name: tableData.name || `Meja ${id}`,
      area: tableData.area || 'Indoor',
      capacity: Number(tableData.capacity || 4)
    };
    this.data.tables.push(newTable);
    this.saveDB();
    return newTable;
  }

  updateTable(id, patch) {
    if (!this.data.tables) return null;
    const index = this.data.tables.findIndex((t) => t.id === id);
    if (index === -1) return null;
    if (patch.capacity !== undefined) patch.capacity = Number(patch.capacity);
    this.data.tables[index] = {
      ...this.data.tables[index],
      ...patch
    };
    this.saveDB();
    return this.data.tables[index];
  }

  deleteTable(id) {
    if (!this.data.tables) return false;
    const index = this.data.tables.findIndex((t) => t.id === id);
    if (index === -1) return false;
    this.data.tables.splice(index, 1);
    this.saveDB();
    return true;
  }


  upsertUser(from) {
    if (!from) return;
    const key = String(from.id);
    const now = new Date().toISOString();
    if (!this.data.users[key]) {
      this.data.users[key] = new User({
        id: from.id,
        username: from.username || null,
        firstName: from.first_name || '',
        firstSeen: now,
        lastSeen: now,
        totalReservations: 0
      });
    } else {
      this.data.users[key].username = from.username || this.data.users[key].username;
      this.data.users[key].firstName = from.first_name || this.data.users[key].firstName;
      this.data.users[key].lastSeen = now;
    }
    this.saveDB();
    return this.data.users[key];
  }

  getUser(userId) {
    return this.data.users[String(userId)] || null;
  }

  getAllUsers() {
    return Object.values(this.data.users);
  }

  logActivity({ type, reservationId = null, userId = null, actor = null, description }) {
    const nextId = this.data.activities.length > 0 ? this.data.activities[this.data.activities.length - 1].id + 1 : 1;
    const act = new Activity({
      id: nextId,
      type,
      reservationId,
      userId,
      actor,
      description,
      timestamp: new Date().toISOString()
    });
    this.data.activities.push(act);
    this.saveDB();
    return act;
  }

  getActivities() {
    return this.data.activities;
  }

  generateReservationId() {
    let id;
    do {
      const random = Math.floor(1000 + Math.random() * 9000);
      id = `RSV-${random}`;
    } while (this.data.reservations.some((r) => r.id === id));
    return id;
  }

  addReservation(reservationData) {
    if (!reservationData.id) {
      reservationData.id = this.generateReservationId();
    }
    const r = new Reservation(reservationData);
    this.data.reservations.push(r);
    const userKey = String(r.userId);
    if (this.data.users[userKey]) {
      this.data.users[userKey].totalReservations += 1;
    }
    this.saveDB();
    return r;
  }

  getReservations() {
    return this.data.reservations.map((r) => new Reservation(r));
  }

  getReservationById(id) {
    const raw = this.data.reservations.find((r) => r.id === id);
    return raw ? new Reservation(raw) : null;
  }

  getUserReservations(userId) {
    return this.data.reservations.filter((r) => r.userId === Number(userId)).map((r) => new Reservation(r));
  }

  updateReservation(id, patch) {
    const index = this.data.reservations.findIndex((r) => r.id === id);
    if (index === -1) return null;
    this.data.reservations[index] = {
      ...this.data.reservations[index],
      ...patch,
      updatedAt: new Date().toISOString()
    };
    this.saveDB();
    return new Reservation(this.data.reservations[index]);
  }

  assignTable(reservationId, tableId) {
    const table = this.data.tables.find((t) => t.id === tableId);
    if (!table) return null;
    return this.updateReservation(reservationId, {
      tableId: table.id,
      tableName: table.name,
      area: table.area
    });
  }

  deleteReservation(id) {
    const index = this.data.reservations.findIndex((r) => r.id === id);
    if (index === -1) return null;
    const removed = this.data.reservations.splice(index, 1)[0];
    this.saveDB();
    return new Reservation(removed);
  }

  addReview(reviewData) {
    const nextId = this.data.reviews.length > 0 ? this.data.reviews[this.data.reviews.length - 1].id + 1 : 1;
    const rev = new Review({
      id: nextId,
      ...reviewData
    });
    this.data.reviews.push(rev);
    this.saveDB();
    return rev;
  }

  getReviews() {
    return this.data.reviews;
  }

  backupDB() {
    return JSON.stringify(this.data, null, 2);
  }

  restoreDB(jsonInput) {
    let parsed;
    if (typeof jsonInput === 'string') {
      parsed = JSON.parse(jsonInput);
    } else {
      parsed = jsonInput;
    }
    if (!parsed || typeof parsed !== 'object') {
      throw new Error('Data backup tidak valid.');
    }
    this.data = {
      settings: { ...this.defaultDB.settings, ...(parsed.settings || {}) },
      areas: parsed.areas || this.defaultDB.areas,
      tables: parsed.tables || this.defaultDB.tables,
      users: parsed.users || {},
      reservations: parsed.reservations || [],
      activities: parsed.activities || [],
      reviews: parsed.reviews || [],
      blockedDates: parsed.blockedDates || [],
      menu: parsed.menu || this.defaultDB.menu
    };
    this.saveDB();
    return true;
  }

  getBlockedDates() {
    return this.data.blockedDates || [];
  }

  addBlockedDate({ date, reason }) {
    if (!this.data.blockedDates) this.data.blockedDates = [];
    const id = `BLK-${Date.now().toString(36)}`;
    const newBlocked = { id, date, reason: reason || 'Restoran Tutup / Acara Privat', createdAt: new Date().toISOString() };
    this.data.blockedDates.push(newBlocked);
    this.saveDB();
    return newBlocked;
  }

  deleteBlockedDate(id) {
    if (!this.data.blockedDates) return false;
    const index = this.data.blockedDates.findIndex((b) => b.id === id);
    if (index === -1) return false;
    this.data.blockedDates.splice(index, 1);
    this.saveDB();
    return true;
  }

  isDateBlocked(dateStr) {
    if (!this.data.blockedDates) return null;
    const found = this.data.blockedDates.find((b) => b.date === dateStr);
    return found || null;
  }

  getReservationsByPhone(phone) {
    const clean = phone.replace(/[^0-9]/g, '');
    if (!clean) return [];
    return this.data.reservations
      .filter((r) => {
        const rClean = (r.phone || '').replace(/[^0-9]/g, '');
        return rClean && (rClean.includes(clean) || clean.includes(rClean));
      })
      .map((r) => new Reservation(r));
  }

  getActivitiesByReservation(reservationId) {
    return this.data.activities.filter((a) => a.reservationId === reservationId);
  }

  checkDuplicateUserBooking(userId, dateStr, timeStr) {
    const active = this.data.reservations.filter(
      (r) => r.userId === Number(userId) && (r.status === 'Pending' || r.status === 'Dikonfirmasi') && r.date === dateStr
    );
    if (active.length === 0) return null;

    const parseDateTime = require('./utils').parseDateTime;
    const targetMs = parseDateTime(dateStr, timeStr).getTime();
    for (const r of active) {
      const rMs = parseDateTime(r.date, r.time).getTime();
      const diffHours = Math.abs(targetMs - rMs) / 3600000;
      if (diffHours < 2) {
        return new Reservation(r);
      }
    }
    return null;
  }
  getMenuItems(category = null) {
    if (!this.data.menu) this.data.menu = this.defaultDB.menu;
    if (!category) return this.data.menu.map((m) => new MenuItem(m));
    return this.data.menu.filter((m) => m.category.toLowerCase() === category.toLowerCase()).map((m) => new MenuItem(m));
  }

  getMenuItemById(id) {
    if (!this.data.menu) return null;
    const raw = this.data.menu.find((m) => m.id === id);
    return raw ? new MenuItem(raw) : null;
  }

  addMenuItem(menuData) {
    if (!this.data.menu) this.data.menu = [];
    const item = new MenuItem(menuData);
    this.data.menu.push(item);
    this.saveDB();
    return item;
  }

  updateMenuItem(id, patch) {
    if (!this.data.menu) return null;
    const index = this.data.menu.findIndex((m) => m.id === id);
    if (index === -1) return null;
    this.data.menu[index] = {
      ...this.data.menu[index],
      ...patch
    };
    this.saveDB();
    return new MenuItem(this.data.menu[index]);
  }

  deleteMenuItem(id) {
    if (!this.data.menu) return false;
    const index = this.data.menu.findIndex((m) => m.id === id);
    if (index === -1) return false;
    this.data.menu.splice(index, 1);
    this.saveDB();
    return true;
  }
}

module.exports = {
  User,
  Reservation,
  Activity,
  Review,
  MenuItem,
  DatabaseManager,
  DB_FILE
};
