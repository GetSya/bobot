const fs = require('fs');
const path = require('path');

const MEDIA_DIR = path.join(__dirname, 'media');
const MEDIA_SETTINGS_DIR = path.join(MEDIA_DIR, 'settings');
const MEDIA_MENU_DIR = path.join(MEDIA_DIR, 'menu');

function ensureMediaDirs() {
  if (!fs.existsSync(MEDIA_DIR)) fs.mkdirSync(MEDIA_DIR, { recursive: true });
  if (!fs.existsSync(MEDIA_SETTINGS_DIR)) fs.mkdirSync(MEDIA_SETTINGS_DIR, { recursive: true });
  if (!fs.existsSync(MEDIA_MENU_DIR)) fs.mkdirSync(MEDIA_MENU_DIR, { recursive: true });
}

async function downloadAndSaveImage(imageUrl, relativeDestPath) {
  try {
    ensureMediaDirs();
    if (!imageUrl) return null;
    if (!imageUrl.startsWith('http://') && !imageUrl.startsWith('https://')) {
      const checkPath = path.isAbsolute(imageUrl) ? imageUrl : path.join(__dirname, imageUrl);
      if (fs.existsSync(checkPath)) return imageUrl;
    }
    const fetch = (await import('node-fetch')).default || globalThis.fetch;
    const res = await fetch(imageUrl);
    if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
    const arrayBuffer = await res.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const absolutePath = path.isAbsolute(relativeDestPath) ? relativeDestPath : path.join(__dirname, relativeDestPath);
    const dir = path.dirname(absolutePath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(absolutePath, buffer);
    return relativeDestPath;
  } catch (err) {
    console.error('Gagal mendownload/menyimpan gambar:', err.message);
    return imageUrl;
  }
}

function parseDate(dateStr) {
  if (!dateStr) return new Date();
  if (dateStr.includes('-')) {
    const parts = dateStr.split('-');
    if (parts.length === 3) {
      const day = parseInt(parts[0], 10);
      const month = parseInt(parts[1], 10) - 1;
      const year = parseInt(parts[2], 10);
      return new Date(year, month, day);
    }
  }
  const parsed = new Date(dateStr);
  if (!isNaN(parsed.getTime())) return parsed;
  return new Date();
}

function parseDateTime(dateStr, timeStr = '00:00') {
  const d = parseDate(dateStr);
  const [hours, minutes] = timeStr.split(':').map((s) => parseInt(s, 10) || 0);
  d.setHours(hours, minutes, 0, 0);
  return d;
}

function isPastDateTime(dateStr, timeStr = '00:00') {
  const target = parseDateTime(dateStr, timeStr);
  const now = new Date();
  return target.getTime() < now.getTime();
}

function formatDateShort(dateObj) {
  const d = dateObj.getDate().toString().padStart(2, '0');
  const m = (dateObj.getMonth() + 1).toString().padStart(2, '0');
  const y = dateObj.getFullYear();
  return `${d}-${m}-${y}`;
}

function formatDateID(dateObj) {
  return dateObj.toLocaleDateString('id-ID', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric'
  });
}

function getAvailableSlots(db, areaId, dateStr, timeStr, durationHours = 2) {
  const areas = db.getAreas();
  let totalCapacity = 20;
  if (areaId && areaId !== 'Bebas') {
    const foundArea = areas.find((a) => a.id.toLowerCase() === areaId.toLowerCase() || a.name.toLowerCase() === areaId.toLowerCase());
    if (foundArea) totalCapacity = foundArea.capacity;
  } else {
    totalCapacity = areas.reduce((sum, a) => sum + a.capacity, 0);
  }

  const targetStart = parseDateTime(dateStr, timeStr).getTime();
  const targetEnd = targetStart + durationHours * 3600000;

  const reservations = db.getReservations().filter((r) => {
    if (r.status === 'Dibatalkan' || r.status === 'Ditolak') return false;
    if (areaId && areaId !== 'Bebas' && r.area && r.area !== 'Bebas' && r.area.toLowerCase() !== areaId.toLowerCase()) {
      return false;
    }
    const rStart = parseDateTime(r.date, r.time).getTime();
    const rEnd = rStart + (r.durationHours || 2) * 3600000;
    return rStart < targetEnd && rEnd > targetStart;
  });

  const bookedPeople = reservations.reduce((sum, r) => sum + (parseInt(r.people, 10) || 1), 0);
  const remaining = totalCapacity - bookedPeople;
  return remaining > 0 ? remaining : 0;
}

function checkCapacityConflict(db, areaId, dateStr, timeStr, durationHours, peopleCount, excludeId = null) {
  const areas = db.getAreas();
  let totalCapacity = 20;
  if (areaId && areaId !== 'Bebas') {
    const foundArea = areas.find((a) => a.id.toLowerCase() === areaId.toLowerCase() || a.name.toLowerCase() === areaId.toLowerCase());
    if (foundArea) totalCapacity = foundArea.capacity;
  } else {
    totalCapacity = areas.reduce((sum, a) => sum + a.capacity, 0);
  }

  const targetStart = parseDateTime(dateStr, timeStr).getTime();
  const targetEnd = targetStart + durationHours * 3600000;

  const reservations = db.getReservations().filter((r) => {
    if (excludeId && r.id === excludeId) return false;
    if (r.status === 'Dibatalkan' || r.status === 'Ditolak') return false;
    if (areaId && areaId !== 'Bebas' && r.area && r.area !== 'Bebas' && r.area.toLowerCase() !== areaId.toLowerCase()) {
      return false;
    }
    const rStart = parseDateTime(r.date, r.time).getTime();
    const rEnd = rStart + (r.durationHours || 2) * 3600000;
    return rStart < targetEnd && rEnd > targetStart;
  });

  const bookedPeople = reservations.reduce((sum, r) => sum + (parseInt(r.people, 10) || 1), 0);
  const available = totalCapacity - bookedPeople;
  const conflict = Number(peopleCount) > available;

  return {
    conflict,
    available,
    totalCapacity,
    bookedPeople
  };
}

function statusEmoji(status) {
  switch (status) {
    case 'Pending':
      return '[Pending]';
    case 'Dikonfirmasi':
      return '[Dikonfirmasi]';
    case 'Dibatalkan':
      return '[Dibatalkan]';
    case 'Ditolak':
      return '[Ditolak]';
    default:
      return '[Info]';
  }
}

function areaEmoji(area) {
  switch (area) {
    case 'Indoor':
      return '[Indoor]';
    case 'Outdoor':
      return '[Outdoor]';
    case 'VIP':
      return '[VIP]';
    default:
      return '[Area]';
  }
}

function activityEmoji(type) {
  return '°˖➴';
}

function formatReservation(r, { detailed = false, settings = null, forAdmin = false } = {}) {
  let text =
    `✦•┈๑⋅⋯ ⋯⋅๑┈•✦\n` +
    `*${r.id}* -- _${r.status}_\n` +
    `╰┈➤ Nama: ${r.name}\n` +
    `╰┈➤ Tanggal: ${r.date}, Jam: ${r.time} (${r.durationHours || 2} Jam)\n` +
    `╰┈➤ Area: ${r.area || 'Bebas'}\n` +
    `╰┈➤ Meja: ${r.tableName || (r.tableId ? r.tableId : 'Belum Ditentukan')}\n` +
    `╰┈➤ Jumlah: ${r.people} Orang`;

  if (r.isRecurring) {
    text += `\n°˖➴ Reservasi Berulang (${r.recurringPattern || 'Mingguan'})`;
  }

  if (r.preorder) {
    text += `\n🛒𖦹˖°. Pre-Order: ${r.preorder}`;
  }

  if (r.checkInTime) {
    text += `\n°˖➴ Check-in: ${new Date(r.checkInTime).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}`;
  }

  if (detailed) {
    text +=
      `\n╰┈➤ No HP: ${r.phone}\n` +
      `╰┈➤ Catatan User: ${r.note || '-'}\n` +
      `╰┈➤ User ID: ${r.userId}\n` +
      `╰┈➤ Username: ${r.username ? '@' + r.username : '-'}\n` +
      `╰┈➤ Waktu Dibuat: ${new Date(r.createdAt).toLocaleString('id-ID')}`;

    if (forAdmin) {
      text += `\n╰┈➤ Catatan Admin: ${r.adminNote || '_(belum ada)_'}`;
    }

    if (settings) {
      text += `\n\n────୨ৎ────\n*${settings.shopName}*\n╰┈➤ Alamat: ${settings.shopAddress}`;
    }
  }
  return text;
}

function formatMenuItem(item) {
  return `*${item.name}*\n` +
    `╰┈➤ Kategori: _${item.category}_\n` +
    `╰┈➤ Harga: *Rp ${item.price.toLocaleString('id-ID')}*\n` +
    `╰┈➤ Deskripsi: _${item.description || 'Tidak ada deskripsi.'}_`;
}

function formatCartSummary(cartItems = []) {
  if (cartItems.length === 0) {
    return '🛒𖦹˖°. *Keranjang Pesanan Anda Masih Kosong.*';
  }
  let text = `🛒𖦹˖°. *Detail Pre-Order Makanan & Minuman*\n────୨ৎ────\n\n`;
  let total = 0;
  cartItems.forEach((ci, idx) => {
    const subtotal = ci.price * ci.qty;
    total += subtotal;
    text += `╰┈➤ ${idx + 1}. *${ci.name}*\n   ${ci.qty}x @ Rp ${ci.price.toLocaleString('id-ID')} = *Rp ${subtotal.toLocaleString('id-ID')}*\n`;
  });
  text += `\n────୨ৎ────\n╰┈➤ Total Estimasi: *Rp ${total.toLocaleString('id-ID')}*\n` +
    `╰┈➤ Catatan: Pembayaran dilakukan langsung di Kasir Restoran saat kedatangan.`;
  return text;
}

function generateReservationsCSV(reservations) {
  const headers = ['ID', 'User ID', 'Username', 'Nama', 'No HP', 'Tanggal', 'Jam', 'Durasi (Jam)', 'Area', 'Meja', 'Jumlah Orang', 'Catatan', 'Status', 'Berulang', 'Dibuat Pada'];
  const rows = reservations.map((r) => [
    r.id,
    r.userId,
    r.username || '',
    `"${(r.name || '').replace(/"/g, '""')}"`,
    `"${(r.phone || '').replace(/"/g, '""')}"`,
    r.date,
    r.time,
    r.durationHours || 2,
    r.area || 'Bebas',
    r.tableName || r.tableId || 'Belum Ditentukan',
    r.people,
    `"${(r.note || '').replace(/"/g, '""')}"`,
    r.status,
    r.isRecurring ? 'Ya' : 'Tidak',
    r.createdAt
  ]);
  return [headers.join(','), ...rows.map((row) => row.join(','))].join('\n');
}

function generateActivitiesCSV(activities) {
  const headers = ['ID', 'Tipe', 'ID Reservasi', 'User ID', 'Aktor', 'Deskripsi', 'Waktu'];
  const rows = activities.map((a) => [
    a.id,
    a.type,
    a.reservationId || '',
    a.userId || '',
    a.actor || '',
    `"${(a.description || '').replace(/"/g, '""')}"`,
    a.timestamp
  ]);
  return [headers.join(','), ...rows.map((row) => row.join(','))].join('\n');
}

function generateVisualStats(db) {
  const reservations = db.getReservations();
  const total = reservations.length;
  const pending = reservations.filter((r) => r.status === 'Pending').length;
  const confirmed = reservations.filter((r) => r.status === 'Dikonfirmasi').length;
  const cancelled = reservations.filter((r) => r.status === 'Dibatalkan').length;
  const rejected = reservations.filter((r) => r.status === 'Ditolak').length;

  function makeBar(val, max, length = 10) {
    if (max === 0) return '-'.repeat(length);
    const filled = Math.round((val / max) * length);
    return '#'.repeat(filled) + '-'.repeat(length - filled);
  }

  const maxVal = Math.max(pending, confirmed, cancelled, rejected, 1);

  const text =
    `✦•┈๑⋅⋯ ⋯⋅๑┈•✦\n` +
    `*Grafik Statistik Reservasi*\n` +
    `────୨ৎ────\n\n` +
    `╰┈➤ Total Reservasi: *${total}*\n\n` +
    `╰┈➤ Pending      [${makeBar(pending, maxVal)}] ${pending}\n` +
    `╰┈➤ Dikonfirmasi [${makeBar(confirmed, maxVal)}] ${confirmed}\n` +
    `╰┈➤ Dibatalkan   [${makeBar(cancelled, maxVal)}] ${cancelled}\n` +
    `╰┈➤ Ditolak      [${makeBar(rejected, maxVal)}] ${rejected}\n\n` +
    `────୨ৎ────\n` +
    `╰┈➤ Total User: *${db.getAllUsers().length}*\n` +
    `╰┈➤ Total Rating/Feedback: *${db.getReviews().length}*`;

  return text;
}

async function safeSendMessage(bot, chatId, text, options = {}) {
  try {
    return await bot.sendMessage(chatId, text, options);
  } catch (err) {
    console.error(`[SEND ERROR] chatId=${chatId}:`, err.message);
    return null;
  }
}

async function safeEditMessage(bot, chatId, messageId, text, options = {}) {
  try {
    return await bot.editMessageText(text, { chat_id: chatId, message_id: messageId, ...options });
  } catch (err) {
    console.error(`[EDIT ERROR] chatId=${chatId}:`, err.message);
    return await safeSendMessage(bot, chatId, text, options);
  }
}

function formatTable(t) {
  return (
    `🪑 *Detail Meja: ${t.name}*\n` +
    `────୨ৎ────\n` +
    `╰┈➤ ID Meja: *${t.id}*\n` +
    `╰┈➤ Nama Meja: *${t.name}*\n` +
    `╰┈➤ Area: *${t.area}*\n` +
    `╰┈➤ Kapasitas: *${t.capacity} Orang*`
  );
}

async function safeSendPhoto(bot, chatId, photoPathOrUrl, options = {}) {
  try {
    if (!photoPathOrUrl) return false;
    let photoSource = photoPathOrUrl;
    if (typeof photoPathOrUrl === 'string' && !photoPathOrUrl.startsWith('http://') && !photoPathOrUrl.startsWith('https://')) {
      const absPath = path.isAbsolute(photoPathOrUrl) ? photoPathOrUrl : path.join(__dirname, photoPathOrUrl);
      if (fs.existsSync(absPath)) {
        photoSource = absPath;
      }
    }
    await bot.sendPhoto(chatId, photoSource, options);
    return true;
  } catch (err) {
    console.error(`[SEND PHOTO ERROR] chatId=${chatId}:`, err.message);
    return false;
  }
}

module.exports = {
  ensureMediaDirs,
  downloadAndSaveImage,
  safeSendPhoto,
  parseDate,
  parseDateTime,
  isPastDateTime,
  formatDateShort,
  formatDateID,
  getAvailableSlots,
  checkCapacityConflict,
  statusEmoji,
  areaEmoji,
  activityEmoji,
  formatReservation,
  formatMenuItem,
  formatCartSummary,
  formatTable,
  generateReservationsCSV,
  generateActivitiesCSV,
  generateVisualStats,
  safeSendMessage,
  safeEditMessage
};
