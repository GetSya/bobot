const {
  isPastDateTime,
  formatDateShort,
  formatDateID,
  checkCapacityConflict,
  formatReservation,
  formatMenuItem,
  formatCartSummary,
  formatTable,
  generateReservationsCSV,
  generateActivitiesCSV,
  generateVisualStats,
  safeSendMessage,
  safeEditMessage,
  ensureMediaDirs,
  downloadAndSaveImage,
  safeSendPhoto
} = require('./utils');

const {
  makeProgressBar,
  persistentKeyboard,
  mainMenuInline,
  cancelProcessRow,
  backToMenuRow,
  dateChoiceKeyboard,
  timeChoiceKeyboard,
  areaChoiceKeyboard,
  peopleChoiceKeyboard,
  durationChoiceKeyboard,
  recurringChoiceKeyboard,
  noteChoiceKeyboard,
  confirmKeyboard,
  adminMenuInline,
  adminBlockedDatesKeyboard,
  adminReservationDetailActionKeyboard,
  adminSettingsKeyboard,
  editReservationFieldsKeyboard,
  ratingKeyboard,
  userMenuCategoriesKeyboard,
  userMenuItemCardKeyboard,
  userCartKeyboard,
  adminMenuManagementKeyboard,
  adminCategoryPickKeyboard,
  adminMenuListKeyboard,
  adminMenuItemEditOptionsKeyboard,
  adminTableManagementKeyboard,
  adminTablesListKeyboard,
  adminTableEditOptionsKeyboard,
  adminTableAreaPickKeyboard
} = require('./keyboards');

const sessions = {};
const userCarts = {};
let ownerChatId = null;

function getUserCart(chatId) {
  if (!userCarts[chatId]) userCarts[chatId] = [];
  return userCarts[chatId];
}

function addToCart(chatId, item) {
  const cart = getUserCart(chatId);
  const found = cart.find((ci) => ci.itemId === item.id);
  if (found) {
    found.qty += 1;
  } else {
    cart.push({ itemId: item.id, name: item.name, price: item.price, qty: 1 });
  }
}

function subFromCart(chatId, itemId) {
  const cart = getUserCart(chatId);
  const found = cart.find((ci) => ci.itemId === itemId);
  if (found) {
    found.qty -= 1;
    if (found.qty <= 0) {
      const idx = cart.findIndex((ci) => ci.itemId === itemId);
      cart.splice(idx, 1);
    }
  }
}

function delFromCart(chatId, itemId) {
  const cart = getUserCart(chatId);
  const idx = cart.findIndex((ci) => ci.itemId === itemId);
  if (idx !== -1) cart.splice(idx, 1);
}

function clearCart(chatId) {
  userCarts[chatId] = [];
}

function getCartTotals(chatId) {
  const cart = getUserCart(chatId);
  const count = cart.reduce((sum, i) => sum + i.qty, 0);
  const total = cart.reduce((sum, i) => sum + i.price * i.qty, 0);
  return { count, total, items: cart };
}

function getOwnerUsername() {
  return process.env.OWNER_USERNAME || 'sofunsyabi';
}

function isOwner(fromOrMsg) {
  const from = (fromOrMsg && fromOrMsg.from) ? fromOrMsg.from : fromOrMsg;
  const ownerName = getOwnerUsername().toLowerCase();
  return !!(from && from.username && from.username.toLowerCase() === ownerName);
}

function resetSession(chatId) {
  delete sessions[chatId];
}

async function sendMainMenu(bot, db, chatId, fromIsOwner, greet = false, fromName = '') {
  const settings = db.getSettings();
  const textHeader = greet
    ? `✦•┈๑⋅⋯ ⋯⋅๑┈•✦\nHalo ${fromName || 'Kak'}!\n\nSelamat datang di *${settings.shopName || 'Restoran'}*\n_${settings.description || ''}_\n╰┈➤ Alamat: ${settings.shopAddress || ''}\n────୨ৎ────\n🡻 Silakan pilih menu di bawah ini:`
    : `✦•┈๑⋅⋯ ⋯⋅๑┈•✦\n*${settings.shopName || 'Menu Utama'}*\n╰┈➤ Alamat: ${settings.shopAddress || ''}\n────୨ৎ────\n🡻 Silakan pilih menu:`;

  if (settings.logo && typeof settings.logo === 'string' && settings.logo.trim() !== '') {
    const sent = await safeSendPhoto(bot, chatId, settings.logo, {
      caption: textHeader,
      parse_mode: 'Markdown',
      ...mainMenuInline(fromIsOwner, settings)
    });
    if (sent) return;
  }

  await safeSendMessage(bot, chatId, textHeader, {
    parse_mode: 'Markdown',
    ...mainMenuInline(fromIsOwner, settings)
  });
}

async function handleTextMessage(bot, db, msg) {
  const chatId = msg.chat.id;
  const text = (msg.text || '').trim();
  const settings = db.getSettings();

  db.upsertUser(msg.from);
  if (isOwner(msg)) ownerChatId = chatId;

  if (msg.photo && msg.photo.length > 0 && isOwner(msg)) {
    const session = sessions[chatId];
    if (session) {
      try {
        const fileId = msg.photo[msg.photo.length - 1].file_id;
        const imgUrl = await bot.getFileLink(fileId);
        if (session.step === 'SET_LOGO') {
          const localPath = await downloadAndSaveImage(imgUrl, 'media/settings/logo.jpg');
          db.updateSettings({ logo: localPath });
          db.logActivity({ type: 'SETTING_UPDATE', actor: msg.from.username, description: `Logo toko diubah dan disimpan ke ${localPath}.` });
          resetSession(chatId);
          await safeSendMessage(bot, chatId, '°˖ `Logo toko berhasil diperbarui dan disimpan ke folder media/`!', persistentKeyboard());
          await sendMainMenu(bot, db, chatId, true);
          return;
        }
        if (session.step === 'ADD_MENU_IMAGE') {
          const tempId = session.data.id || `MENU-${Date.now().toString(36)}`;
          const relPath = `media/menu/${tempId}.jpg`;
          const localPath = await downloadAndSaveImage(imgUrl, relPath);
          session.data.image = localPath;
          const newItem = db.addMenuItem(session.data);
          db.logActivity({
            type: 'SETTING_UPDATE',
            actor: msg.from.username,
            description: `Menu makanan/minuman baru "${newItem.name}" ditambahkan dan disimpan ke ${localPath}.`
          });
          resetSession(chatId);
          await safeSendMessage(bot, chatId, `°˖➴ Menu *${newItem.name}* berhasil ditambahkan dan gambar disimpan ke folder \`media/\`!`, persistentKeyboard());
          await safeSendMessage(bot, chatId, formatMenuItem(newItem), {
            parse_mode: 'Markdown',
            ...adminMenuItemEditOptionsKeyboard(newItem.id)
          });
          return;
        }
        if (session.step.startsWith('EDIT_MENU_IMAGE_')) {
          const itemId = session.step.replace('EDIT_MENU_IMAGE_', '');
          const relPath = `media/menu/${itemId}.jpg`;
          const localPath = await downloadAndSaveImage(imgUrl, relPath);
          const updated = db.updateMenuItem(itemId, { image: localPath });
          resetSession(chatId);
          await safeSendMessage(bot, chatId, `°˖➴ Foto menu *${updated.name}* berhasil diperbarui dan disimpan ke folder \`media/\`!`, persistentKeyboard());
          await safeSendMessage(bot, chatId, formatMenuItem(updated), {
            parse_mode: 'Markdown',
            ...adminMenuItemEditOptionsKeyboard(updated.id)
          });
          return;
        }
      } catch (err) {
        await safeSendMessage(bot, chatId, `[!] Gagal memproses gambar: ${err.message}`);
        return;
      }
    }
  }

  if (msg.document && isOwner(msg)) {
    const session = sessions[chatId];
    if (session && session.step === 'WAITING_RESTORE_FILE') {
      try {
        const fileId = msg.document.file_id;
        const fileUrl = await bot.getFileLink(fileId);
        const fetch = (await import('node-fetch')).default || globalThis.fetch;
        const res = await fetch(fileUrl);
        const jsonText = await res.text();
        db.restoreDB(jsonText);
        resetSession(chatId);
        await safeSendMessage(bot, chatId, '°˖➴ Database berhasil dipulihkan (Restore Complete)!', persistentKeyboard());
        await sendMainMenu(bot, db, chatId, true);
        return;
      } catch (err) {
        await safeSendMessage(bot, chatId, `[!] Gagal memulihkan database: ${err.message}`);
        return;
      }
    }
  }

  if (text.startsWith('/')) {
    if (text === '/start') {
      resetSession(chatId);
      await safeSendMessage(bot, chatId, '🡻 Gunakan menu di bawah ini untuk navigasi cepat:', persistentKeyboard());
      await sendMainMenu(bot, db, chatId, isOwner(msg), true, msg.from.first_name);
      return;
    }
    if (text === '/menu') {
      resetSession(chatId);
      await sendMainMenu(bot, db, chatId, isOwner(msg));
      return;
    }
    if (text.startsWith('/cari')) {
      const parts = text.split(' ');
      const phoneQuery = parts.slice(1).join(' ').trim();
      if (!phoneQuery) {
        await safeSendMessage(bot, chatId, '✦•┈๑⋅⋯ ⋯⋅๑┈•✦\n*Pencarian Reservasi via Nomor HP*\n╰┈➤ Penggunaan: `/cari [nomor_hp]`\n╰┈➤ Contoh: `/cari 08123456789`', { parse_mode: 'Markdown' });
        return;
      }
      const results = db.getReservationsByPhone(phoneQuery);
      if (results.length === 0) {
        await safeSendMessage(bot, chatId, `Tidak ditemukan reservasi untuk nomor HP *${phoneQuery}*.`, { parse_mode: 'Markdown' });
        return;
      }
      let replyText = `✦•┈๑⋅⋯ ⋯⋅๑┈•✦\n*Hasil Pencarian Reservasi HP: ${phoneQuery}* (${results.length} ditemukan):\n────୨ৎ────\n\n`;
      results.forEach((r, idx) => {
        replyText += `${idx + 1}. ${formatReservation(r, { detailed: true, forAdmin: isOwner(msg) })}\n────୨ৎ────\n`;
      });
      await safeSendMessage(bot, chatId, replyText, { parse_mode: 'Markdown' });
      return;
    }
    if (text === '/admin') {
      if (!isOwner(msg)) {
        await safeSendMessage(bot, chatId, '[!] Maaf, Anda tidak memiliki akses ke panel ini.');
        return;
      }
      ownerChatId = chatId;
      resetSession(chatId);
      await safeSendMessage(bot, chatId, '✦•┈๑⋅⋯ ⋯⋅๑┈•✦\n*Panel Owner / Admin*\n🡻 Silakan pilih menu:', {
        parse_mode: 'Markdown',
        ...adminMenuInline()
      });
      return;
    }
    return;
  }

  if (text === '▶︎ Main Menu' || text === '[ Main Menu ]' || text === '🏠 Menu Utama') {
    resetSession(chatId);
    await sendMainMenu(bot, db, chatId, isOwner(msg));
    return;
  }

  const session = sessions[chatId];
  if (session) {
    await handleConversationStep(bot, db, msg, session);
    return;
  }

  await safeSendMessage(bot, chatId, '🡻 Silakan gunakan menu berikut untuk melanjutkan:', persistentKeyboard());
  await sendMainMenu(bot, db, chatId, isOwner(msg));
}

async function handleConversationStep(bot, db, msg, session) {
  const chatId = msg.chat.id;
  const text = (msg.text || '').trim();

  switch (session.step) {
    case 'NAME':
      if (text.length < 2) {
        await safeSendMessage(bot, chatId, '[!] Nama terlalu pendek. Silakan masukkan nama lengkap Anda:');
        return;
      }
      session.data.name = text;
      session.step = 'PHONE';
      await safeSendMessage(bot, chatId, `${makeProgressBar(1, 6)}\n\n╰┈➤ Masukkan *nomor HP* Anda (contoh: 08123456789):`, {
        parse_mode: 'Markdown',
        reply_markup: { inline_keyboard: [cancelProcessRow()] }
      });
      break;

    case 'PHONE':
      if (!/^[0-9+ -]{8,15}$/.test(text)) {
        await safeSendMessage(bot, chatId, '[!] Format nomor HP tidak valid. Masukkan angka nomor HP Anda:');
        return;
      }
      session.data.phone = text;
      session.step = 'DATE_CHOICE';
      await safeSendMessage(bot, chatId, `${makeProgressBar(2, 6)}\n\n🡻 Pilih atau ketik *tanggal reservasi*:`, {
        parse_mode: 'Markdown',
        ...dateChoiceKeyboard()
      });
      break;

    case 'DATE_CUSTOM':
      if (isPastDateTime(text, '23:59')) {
        await safeSendMessage(bot, chatId, '[!] Tanggal sudah berlalu! Masukkan tanggal hari ini atau masa mendatang (format: DD-MM-YYYY):');
        return;
      }
      const blockedCustom = db.isDateBlocked(text);
      if (blockedCustom) {
        await safeSendMessage(bot, chatId, `*Maaf, restoran tutup pada tanggal ${text}!*\n╰┈➤ Alasan: _${blockedCustom.reason}_\n\nSilakan masukkan tanggal reservasi lain (DD-MM-YYYY):`, { parse_mode: 'Markdown' });
        return;
      }
      session.data.date = text;
      session.step = 'TIME_CHOICE';
      await safeSendMessage(bot, chatId, `${makeProgressBar(3, 6)}\n\n🡻 Pilih *jam reservasi* (Tanggal: ${text}):`, {
        parse_mode: 'Markdown',
        ...timeChoiceKeyboard(db, text, session.data.area || 'Bebas')
      });
      break;

    case 'TIME_CUSTOM':
      if (isPastDateTime(session.data.date || formatDateShort(new Date()), text)) {
        await safeSendMessage(bot, chatId, '[!] Waktu sudah berlalu! Masukkan jam yang belum lewat (contoh: 19:30):');
        return;
      }
      session.data.time = text;
      session.step = 'DURATION_CHOICE';
      await safeSendMessage(bot, chatId, `${makeProgressBar(4, 6)}\n\n🡻 Pilih *durasi reservasi*:`, {
        parse_mode: 'Markdown',
        ...durationChoiceKeyboard()
      });
      break;

    case 'PEOPLE_CUSTOM':
      if (!/^[0-9]+$/.test(text) || parseInt(text, 10) < 1) {
        await safeSendMessage(bot, chatId, '[!] Masukkan jumlah orang dengan angka positif:');
        return;
      }
      session.data.people = text;
      session.step = 'RECURRING_CHOICE';
      await safeSendMessage(bot, chatId, `${makeProgressBar(6, 6)}\n\n🡻 Pilih tipe reservasi:`, {
        parse_mode: 'Markdown',
        ...recurringChoiceKeyboard()
      });
      break;

    case 'NOTE_CUSTOM':
      session.data.note = text;
      session.step = 'CONFIRM';
      await sendConfirmationSummary(bot, db, chatId, session);
      break;

    case 'ADD_BLOCKOUT_DATE':
      if (isPastDateTime(text, '23:59')) {
        await safeSendMessage(bot, chatId, '[!] Tanggal sudah berlalu. Masukkan tanggal libur mendatang (DD-MM-YYYY):');
        return;
      }
      session.data.blockDate = text;
      session.step = 'ADD_BLOCKOUT_REASON';
      await safeSendMessage(bot, chatId, `Tanggal libur yang dipilih: *${text}*\n\n╰┈➤ Ketik alasan libur / catatan (contoh: Acara Privat / Restoran Tutup):`, {
        parse_mode: 'Markdown',
        reply_markup: { inline_keyboard: [cancelProcessRow()] }
      });
      break;

    case 'ADD_BLOCKOUT_REASON':
      const bDate = session.data.blockDate;
      const bReason = text;
      db.addBlockedDate({ date: bDate, reason: bReason });
      db.logActivity({
        type: 'SETTING_UPDATE',
        actor: msg.from.username,
        description: `Hari libur baru ditambahkan oleh Admin: ${bDate} (${bReason}).`
      });
      resetSession(chatId);
      await safeSendMessage(bot, chatId, `°˖➴ Hari libur *${bDate}* berhasil ditambahkan!`, persistentKeyboard());
      await safeSendMessage(bot, chatId, '*Daftar Hari Libur (Blockout Dates)*:', {
        parse_mode: 'Markdown',
        ...adminBlockedDatesKeyboard(db.getBlockedDates())
      });
      break;

    case 'ADMIN_INPUT_NOTE':
      const rIdNote = session.reservationId;
      const updatedNote = db.updateReservation(rIdNote, { adminNote: text });
      db.logActivity({
        type: 'SETTING_UPDATE',
        reservationId: rIdNote,
        actor: msg.from.username,
        description: `Catatan internal admin diperbarui untuk reservasi ${rIdNote}.`
      });
      resetSession(chatId);
      await safeSendMessage(bot, chatId, `°˖➴ Catatan internal untuk *${rIdNote}* berhasil disimpan!\n\n${formatReservation(updatedNote, { detailed: true, forAdmin: true })}`, {
        parse_mode: 'Markdown',
        reply_markup: { inline_keyboard: [backToMenuRow()] }
      });
      break;

    case 'ADD_MENU_NAME':
      if (text.length < 2) {
        await safeSendMessage(bot, chatId, '[!] Nama menu terlalu pendek. Masukkan nama item valid:');
        return;
      }
      session.data.name = text;
      session.step = 'ADD_MENU_CATEGORY';
      await safeSendMessage(bot, chatId, `🡻 *Pilih Kategori Menu untuk "${text}" (2/5)*:`, {
        parse_mode: 'Markdown',
        ...adminCategoryPickKeyboard()
      });
      break;

    case 'ADD_MENU_PRICE':
      const priceNum = parseInt(text.replace(/[^0-9]/g, ''), 10);
      if (isNaN(priceNum) || priceNum <= 0) {
        await safeSendMessage(bot, chatId, '[!] Masukkan harga valid dengan angka (contoh: 25000):');
        return;
      }
      session.data.price = priceNum;
      session.step = 'ADD_MENU_DESC';
      await safeSendMessage(bot, chatId, `*Masukkan Deskripsi Item (4/5)*:\n╰┈➤ Ketik penjelasan singkat mengenai menu ini (atau ketik *-* untuk lewati):`, {
        parse_mode: 'Markdown',
        reply_markup: { inline_keyboard: [cancelProcessRow()] }
      });
      break;

    case 'ADD_MENU_DESC':
      session.data.description = text === '-' ? '' : text;
      session.step = 'ADD_MENU_IMAGE';
      await safeSendMessage(bot, chatId, `*Kirimkan Foto Item (5/5)*:\n╰┈➤ Silakan *kirim foto/gambar* ke chat ini, atau ketik *URL foto*, atau ketik *-* jika tanpa foto:`, {
        parse_mode: 'Markdown',
        reply_markup: { inline_keyboard: [cancelProcessRow()] }
      });
      break;

    case 'ADD_MENU_IMAGE':
      let imgUrl = text === '-' ? null : text;
      if (imgUrl && (imgUrl.startsWith('http://') || imgUrl.startsWith('https://'))) {
        const tempId = session.data.id || `MENU-${Date.now().toString(36)}`;
        imgUrl = await downloadAndSaveImage(imgUrl, `media/menu/${tempId}.jpg`);
      }
      session.data.image = imgUrl;
      const newItem = db.addMenuItem(session.data);
      db.logActivity({
        type: 'SETTING_UPDATE',
        actor: msg.from.username,
        description: `Menu makanan/minuman baru "${newItem.name}" ditambahkan oleh Admin.`
      });
      resetSession(chatId);
      await safeSendMessage(bot, chatId, `°˖➴ Menu *${newItem.name}* berhasil ditambahkan!`, persistentKeyboard());
      await safeSendMessage(bot, chatId, formatMenuItem(newItem), {
        parse_mode: 'Markdown',
        ...adminMenuItemEditOptionsKeyboard(newItem.id)
      });
      break;

    case 'EDIT_MENU_NAME':
      const editNameId = session.itemId;
      const updatedName = db.updateMenuItem(editNameId, { name: text });
      resetSession(chatId);
      await safeSendMessage(bot, chatId, `°˖➴ Nama menu berhasil diubah menjadi *${updatedName.name}*!`, persistentKeyboard());
      await safeSendMessage(bot, chatId, formatMenuItem(updatedName), {
        parse_mode: 'Markdown',
        ...adminMenuItemEditOptionsKeyboard(updatedName.id)
      });
      break;

    case 'EDIT_MENU_PRICE':
      const editPriceId = session.itemId;
      const newPrice = parseInt(text.replace(/[^0-9]/g, ''), 10);
      if (isNaN(newPrice) || newPrice <= 0) {
        await safeSendMessage(bot, chatId, '[!] Masukkan harga angka valid (contoh: 30000):');
        return;
      }
      const updatedPrice = db.updateMenuItem(editPriceId, { price: newPrice });
      resetSession(chatId);
      await safeSendMessage(bot, chatId, `°˖➴ Harga menu *${updatedPrice.name}* diubah menjadi *Rp ${updatedPrice.price.toLocaleString('id-ID')}*!`, persistentKeyboard());
      await safeSendMessage(bot, chatId, formatMenuItem(updatedPrice), {
        parse_mode: 'Markdown',
        ...adminMenuItemEditOptionsKeyboard(updatedPrice.id)
      });
      break;

    case 'EDIT_MENU_DESC':
      const editDescId = session.itemId;
      const updatedDesc = db.updateMenuItem(editDescId, { description: text === '-' ? '' : text });
      resetSession(chatId);
      await safeSendMessage(bot, chatId, `°˖➴ Deskripsi menu *${updatedDesc.name}* berhasil diperbarui!`, persistentKeyboard());
      await safeSendMessage(bot, chatId, formatMenuItem(updatedDesc), {
        parse_mode: 'Markdown',
        ...adminMenuItemEditOptionsKeyboard(updatedDesc.id)
      });
      break;

    case 'EDIT_MENU_IMAGE':
      const editImgId = session.itemId;
      let newImg = text === '-' ? null : text;
      if (newImg && (newImg.startsWith('http://') || newImg.startsWith('https://'))) {
        newImg = await downloadAndSaveImage(newImg, `media/menu/${editImgId}.jpg`);
      }
      const updatedImg = db.updateMenuItem(editImgId, { image: newImg });
      resetSession(chatId);
      await safeSendMessage(bot, chatId, `°˖➴ Gambar menu *${updatedImg.name}* berhasil diperbarui!`, persistentKeyboard());
      await safeSendMessage(bot, chatId, formatMenuItem(updatedImg), {
        parse_mode: 'Markdown',
        ...adminMenuItemEditOptionsKeyboard(updatedImg.id)
      });
      break;

    case 'ADD_TABLE_ID':
      if (text.length < 1) {
        await safeSendMessage(bot, chatId, '[!] ID Meja tidak boleh kosong. Masukkan kode/ID meja (contoh: T-06):');
        return;
      }
      const existingT = db.getTableById(text.toUpperCase());
      if (existingT) {
        await safeSendMessage(bot, chatId, `[!] Meja dengan ID *${text.toUpperCase()}* sudah ada. Gunakan ID lain:`, { parse_mode: 'Markdown' });
        return;
      }
      session.data.id = text.toUpperCase();
      session.step = 'ADD_TABLE_NAME';
      await safeSendMessage(bot, chatId, `ID Meja: *${session.data.id}*\n\n╰┈➤ Masukkan *nama / deskripsi meja* (contoh: Meja 6 (Indoor Garden)):`, {
        parse_mode: 'Markdown',
        reply_markup: { inline_keyboard: [cancelProcessRow()] }
      });
      break;

    case 'ADD_TABLE_NAME':
      if (text.length < 2) {
        await safeSendMessage(bot, chatId, '[!] Nama meja terlalu pendek. Masukkan nama yang jelas:');
        return;
      }
      session.data.name = text;
      session.step = 'ADD_TABLE_AREA';
      await safeSendMessage(bot, chatId, `Nama Meja: *${text}*\n\n🡻 Pilih *Area* untuk meja ini:`, {
        parse_mode: 'Markdown',
        ...adminTableAreaPickKeyboard('addtable_area')
      });
      break;

    case 'ADD_TABLE_CAPACITY':
      const cap = parseInt(text.replace(/[^0-9]/g, ''), 10);
      if (isNaN(cap) || cap <= 0) {
        await safeSendMessage(bot, chatId, '[!] Masukkan angka kapasitas yang valid (contoh: 4):');
        return;
      }
      session.data.capacity = cap;
      const newT = db.addTable(session.data);
      db.logActivity({
        type: 'SETTING_UPDATE',
        actor: msg.from.username,
        description: `Meja baru "${newT.name}" (${newT.id}) ditambahkan oleh Admin.`
      });
      resetSession(chatId);
      await safeSendMessage(bot, chatId, `°˖➴ Meja *${newT.name}* (${newT.id}) berhasil ditambahkan!`, persistentKeyboard());
      await safeSendMessage(bot, chatId, formatTable(newT), {
        parse_mode: 'Markdown',
        ...adminTableEditOptionsKeyboard(newT.id)
      });
      break;

    case 'EDIT_TABLE_NAME':
      const tNameId = session.tableId;
      const updatedTName = db.updateTable(tNameId, { name: text });
      db.logActivity({
        type: 'SETTING_UPDATE',
        actor: msg.from.username,
        description: `Nama meja ${tNameId} diubah menjadi "${text}".`
      });
      resetSession(chatId);
      await safeSendMessage(bot, chatId, `°˖➴ Nama meja *${tNameId}* diubah menjadi *${updatedTName.name}*!`, persistentKeyboard());
      await safeSendMessage(bot, chatId, formatTable(updatedTName), {
        parse_mode: 'Markdown',
        ...adminTableEditOptionsKeyboard(updatedTName.id)
      });
      break;

    case 'EDIT_TABLE_CAPACITY':
      const tCapId = session.tableId;
      const capVal = parseInt(text.replace(/[^0-9]/g, ''), 10);
      if (isNaN(capVal) || capVal <= 0) {
        await safeSendMessage(bot, chatId, '[!] Masukkan angka kapasitas valid (contoh: 6):');
        return;
      }
      const updatedTCap = db.updateTable(tCapId, { capacity: capVal });
      db.logActivity({
        type: 'SETTING_UPDATE',
        actor: msg.from.username,
        description: `Kapasitas meja ${tCapId} diubah menjadi ${capVal} orang.`
      });
      resetSession(chatId);
      await safeSendMessage(bot, chatId, `°˖➴ Kapasitas meja *${tCapId}* diubah menjadi *${updatedTCap.capacity} orang*!`, persistentKeyboard());
      await safeSendMessage(bot, chatId, formatTable(updatedTCap), {
        parse_mode: 'Markdown',
        ...adminTableEditOptionsKeyboard(updatedTCap.id)
      });
      break;

    case 'SET_BOTNAME':
    case 'SET_BOT_NAME':
      db.updateSettings({ botName: text });
      db.logActivity({ type: 'SETTING_UPDATE', actor: msg.from.username, description: `Nama bot diubah menjadi "${text}".` });
      resetSession(chatId);
      await safeSendMessage(bot, chatId, '°˖➴ Nama bot berhasil diperbarui!', persistentKeyboard());
      await sendMainMenu(bot, db, chatId, true);
      break;

    case 'SET_DESCRIPTION':
      db.updateSettings({ description: text });
      db.logActivity({ type: 'SETTING_UPDATE', actor: msg.from.username, description: `Deskripsi bot diubah.` });
      resetSession(chatId);
      await safeSendMessage(bot, chatId, '°˖➴ Deskripsi bot berhasil diperbarui!', persistentKeyboard());
      await sendMainMenu(bot, db, chatId, true);
      break;

    case 'SET_SHOPNAME':
    case 'SET_SHOP_NAME':
      db.updateSettings({ shopName: text });
      db.logActivity({ type: 'SETTING_UPDATE', actor: msg.from.username, description: `Nama toko diubah menjadi "${text}".` });
      resetSession(chatId);
      await safeSendMessage(bot, chatId, '°˖➴ Nama toko berhasil diperbarui!', persistentKeyboard());
      await sendMainMenu(bot, db, chatId, true);
      break;

    case 'SET_SHOPADDRESS':
    case 'SET_SHOP_ADDRESS':
      db.updateSettings({ shopAddress: text });
      db.logActivity({ type: 'SETTING_UPDATE', actor: msg.from.username, description: `Alamat toko diubah menjadi "${text}".` });
      resetSession(chatId);
      await safeSendMessage(bot, chatId, '°˖➴ Alamat toko berhasil diperbarui!', persistentKeyboard());
      await sendMainMenu(bot, db, chatId, true);
      break;

    case 'SET_LOGO':
      let logoUrl = text;
      if (logoUrl && (logoUrl.startsWith('http://') || logoUrl.startsWith('https://'))) {
        logoUrl = await downloadAndSaveImage(logoUrl, 'media/settings/logo.jpg');
      }
      db.updateSettings({ logo: logoUrl });
      db.logActivity({ type: 'SETTING_UPDATE', actor: msg.from.username, description: `Logo toko diubah.` });
      resetSession(chatId);
      await safeSendMessage(bot, chatId, '°˖➴ Logo toko berhasil diperbarui!', persistentKeyboard());
      await sendMainMenu(bot, db, chatId, true);
      break;

    case 'ADMIN_BROADCAST_TEXT':
      resetSession(chatId);
      const users = db.getAllUsers();
      let successCount = 0;
      await safeSendMessage(bot, chatId, `°˖➴ Mengirim broadcast ke ${users.length} pengguna...`);
      for (const u of users) {
        const sent = await safeSendMessage(bot, u.id, `✦•┈๑⋅⋯ ⋯⋅๑┈•✦\n*PESAN BROADCAST*\n────୨ৎ────\n\n${text}`, { parse_mode: 'Markdown' });
        if (sent) successCount++;
      }
      db.logActivity({ type: 'SETTING_UPDATE', actor: msg.from.username, description: `Broadcast terkirim ke ${successCount} user.` });
      await safeSendMessage(bot, chatId, `°˖➴ Broadcast selesai! Berhasil dikirim ke ${successCount} dari ${users.length} pengguna.`);
      break;

    case 'EDIT_DATE_CUSTOM':
      if (isPastDateTime(text, session.data.time || '12:00')) {
        await safeSendMessage(bot, chatId, '[!] Tanggal sudah berlalu. Ketik tanggal valid masa mendatang (DD-MM-YYYY):');
        return;
      }
      session.data.date = text;
      await finalizeEditField(bot, db, chatId, session);
      break;

    case 'EDIT_TIME_CUSTOM':
      if (isPastDateTime(session.data.date, text)) {
        await safeSendMessage(bot, chatId, '[!] Waktu sudah berlalu. Ketik jam valid:');
        return;
      }
      session.data.time = text;
      await finalizeEditField(bot, db, chatId, session);
      break;

    case 'EDIT_PEOPLE_CUSTOM':
      if (!/^[0-9]+$/.test(text) || parseInt(text, 10) < 1) {
        await safeSendMessage(bot, chatId, '[!] Masukkan jumlah orang valid (angka):');
        return;
      }
      session.data.people = text;
      await finalizeEditField(bot, db, chatId, session);
      break;

    case 'EDIT_NOTE_CUSTOM':
      session.data.note = text;
      await finalizeEditField(bot, db, chatId, session);
      break;

    case 'RATING_FEEDBACK_TEXT':
      const rId = session.reservationId;
      const stars = session.rating;
      db.addReview({
        reservationId: rId,
        userId: msg.from.id,
        rating: stars,
        feedback: text
      });
      db.logActivity({
        type: 'SETTING_UPDATE',
        reservationId: rId,
        userId: msg.from.id,
        actor: msg.from.username,
        description: `User memberikan rating ${stars} bintang untuk reservasi ${rId}.`
      });
      resetSession(chatId);
      await safeSendMessage(bot, chatId, `°˖➴ Terima kasih atas rating (${stars}/5) dan ulasan Anda!`, persistentKeyboard());
      await sendMainMenu(bot, db, chatId, isOwner(msg));
      break;

    default:
      resetSession(chatId);
      await sendMainMenu(bot, db, chatId, isOwner(msg));
  }
}

async function sendConfirmationSummary(bot, db, chatId, session, messageId = null) {
  const d = session.data;
  const settings = db.getSettings();
  const text =
    `✦•┈๑⋅⋯ ⋯⋅๑┈•✦\n` +
    `*Ringkasan Reservasi Anda:*\n` +
    `────୨ৎ────\n` +
    `╰┈➤ Nama: ${d.name}\n` +
    `╰┈➤ No HP: ${d.phone}\n` +
    `╰┈➤ Tanggal: ${d.date}\n` +
    `╰┈➤ Jam: ${d.time} (${d.durationHours || 2} Jam)\n` +
    `╰┈➤ Area: ${d.area || 'Bebas'}\n` +
    `╰┈➤ Jumlah Orang: ${d.people}\n` +
    `╰┈➤ Pola: ${d.isRecurring ? 'Berulang Mingguan' : 'Sekali Saja'}\n` +
    `╰┈➤ Catatan: ${d.note || '-'}\n\n` +
    `────୨ৎ────\n` +
    `*${settings.shopName}*\n╰┈➤ Alamat: ${settings.shopAddress}\n\n` +
    `Apakah data di atas sudah benar?`;

  if (messageId) {
    await safeEditMessage(bot, chatId, messageId, text, { parse_mode: 'Markdown', ...confirmKeyboard() });
  } else {
    await safeSendMessage(bot, chatId, text, { parse_mode: 'Markdown', ...confirmKeyboard() });
  }
}

async function handleCallbackQuery(bot, db, query) {
  const chatId = query.message.chat.id;
  const messageId = query.message.message_id;
  const data = query.data;

  db.upsertUser(query.from);
  if (isOwner(query)) ownerChatId = chatId;

  if (data === 'menu_main') {
    resetSession(chatId);
    await bot.answerCallbackQuery(query.id);
    await sendMainMenu(bot, db, chatId, isOwner(query));
    return;
  }

  if (data === 'noop') {
    await bot.answerCallbackQuery(query.id);
    return;
  }

  if (data === 'proc_cancel') {
    resetSession(chatId);
    await bot.answerCallbackQuery(query.id, { text: 'Proses dibatalkan.' });
    await safeEditMessage(bot, chatId, messageId, '▶︎ Proses dibatalkan.', {
      reply_markup: { inline_keyboard: [backToMenuRow()] }
    });
    return;
  }

  if (data === 'menu_help') {
    await bot.answerCallbackQuery(query.id);
    const settings = db.getSettings();
    const helpText =
      `✦•┈๑⋅⋯ ⋯⋅๑┈•✦\n` +
      `*${settings.shopName}*\n` +
      `_${settings.description}_\n` +
      `╰┈➤ Alamat: ${settings.shopAddress}\n` +
      `────୨ৎ────\n\n` +
      `*Bantuan & Fitur Bot*\n\n` +
      `╰┈➤ *Buat Reservasi* -- Buat reservasi baru.\n` +
      `╰┈➤ *Ulangi Reservasi* -- Reservasi cepat berdasarkan data terakhir.\n` +
      `╰┈➤ *Reservasi Saya* -- Lihat status reservasi & detail meja.\n` +
      `╰┈➤ *Ubah Detail* -- Ubah jadwal, jumlah orang, area, atau catatan.\n` +
      `╰┈➤ *Rating* -- Beri ulasan setelah reservasi selesai.\n` +
      `╰┈➤ *Batalkan* -- Batalkan reservasi aktif.`;
    await safeEditMessage(bot, chatId, messageId, helpText, {
      parse_mode: 'Markdown',
      reply_markup: { inline_keyboard: [backToMenuRow()] }
    });
    return;
  }

  if (data === 'menu_history') {
    await bot.answerCallbackQuery(query.id);
    const logs = db.getActivities().filter((a) => a.userId === query.from.id).slice(-10).reverse();
    if (logs.length === 0) {
      await safeEditMessage(bot, chatId, messageId, 'Belum ada riwayat aktivitas untuk akun Anda.', {
        reply_markup: { inline_keyboard: [backToMenuRow()] }
      });
      return;
    }
    const text =
      `✦•┈๑⋅⋯ ⋯⋅๑┈•✦\n*Riwayat Aktivitas Anda*\n────୨ৎ────\n\n` +
      logs.map((a) => `╰┈➤ Waktu: ${new Date(a.timestamp).toLocaleString('id-ID')}\n   ${a.description}`).join('\n\n');
    await safeEditMessage(bot, chatId, messageId, text, {
      parse_mode: 'Markdown',
      reply_markup: { inline_keyboard: [backToMenuRow()] }
    });
    return;
  }

  if (data === 'menu_new') {
    sessions[chatId] = { step: 'NAME', data: { durationHours: 2 } };
    await bot.answerCallbackQuery(query.id);
    await safeEditMessage(bot, chatId, messageId, `${makeProgressBar(0, 6)}\n\n*Buat Reservasi Baru*\n\n╰┈➤ Masukkan *nama lengkap* Anda:`, {
      parse_mode: 'Markdown',
      reply_markup: { inline_keyboard: [cancelProcessRow()] }
    });
    return;
  }

  if (data === 'menu_repeat') {
    await bot.answerCallbackQuery(query.id);
    const userRes = db.getUserReservations(query.from.id);
    if (userRes.length === 0) {
      await safeEditMessage(bot, chatId, messageId, 'Anda belum pernah membuat reservasi sebelumnya.', {
        reply_markup: { inline_keyboard: [backToMenuRow()] }
      });
      return;
    }
    const lastRes = userRes[userRes.length - 1];
    sessions[chatId] = {
      step: 'CONFIRM',
      data: {
        name: lastRes.name,
        phone: lastRes.phone,
        date: formatDateShort(new Date(Date.now() + 86400000)),
        time: lastRes.time,
        durationHours: lastRes.durationHours || 2,
        area: lastRes.area,
        people: lastRes.people,
        note: lastRes.note,
        isRecurring: false
      }
    };
    await sendConfirmationSummary(bot, db, chatId, sessions[chatId], messageId);
    return;
  }

  if (data.startsWith('date_')) {
    const choice = data.replace('date_', '');
    const session = sessions[chatId];
    if (!session) return await bot.answerCallbackQuery(query.id, { text: 'Sesi berakhir, silakan ulang.' });

    if (choice === 'custom') {
      session.step = 'DATE_CUSTOM';
      await bot.answerCallbackQuery(query.id);
      await safeEditMessage(bot, chatId, messageId, `${makeProgressBar(2, 6)}\n\n╰┈➤ Ketik *tanggal* yang diinginkan (Format: DD-MM-YYYY):`, {
        parse_mode: 'Markdown',
        reply_markup: { inline_keyboard: [cancelProcessRow()] }
      });
      return;
    }

    const today = new Date();
    let chosenDate = new Date();
    if (choice === 'tomorrow') chosenDate.setDate(today.getDate() + 1);
    if (choice === 'daylater') chosenDate.setDate(today.getDate() + 2);
    const formatted = formatDateShort(chosenDate);

    const dateBlocked = db.isDateBlocked(formatted);
    if (dateBlocked) {
      await bot.answerCallbackQuery(query.id, { text: 'Restoran tutup pada tanggal ini!', show_alert: true });
      await safeEditMessage(bot, chatId, messageId, `*Maaf, restoran tutup pada tanggal ${formatted}!*\n╰┈➤ Alasan: _${dateBlocked.reason}_\n\n🡻 Silakan pilih tanggal lain:`, {
        parse_mode: 'Markdown',
        ...dateChoiceKeyboard()
      });
      return;
    }

    session.data.date = formatted;
    session.step = 'TIME_CHOICE';
    await bot.answerCallbackQuery(query.id);
    await safeEditMessage(bot, chatId, messageId, `${makeProgressBar(3, 6)}\n\n🡻 Pilih *jam reservasi* (Tanggal: ${formatted}):`, {
      parse_mode: 'Markdown',
      ...timeChoiceKeyboard(db, formatted, session.data.area || 'Bebas')
    });
    return;
  }

  if (data.startsWith('time_')) {
    const choice = data.replace('time_', '');
    const session = sessions[chatId];
    if (!session) return await bot.answerCallbackQuery(query.id, { text: 'Sesi berakhir, silakan ulang.' });

    if (choice === 'custom') {
      session.step = 'TIME_CUSTOM';
      await bot.answerCallbackQuery(query.id);
      await safeEditMessage(bot, chatId, messageId, `${makeProgressBar(3, 6)}\n\n╰┈➤ Ketik *jam* yang diinginkan (contoh: 19:30):`, {
        parse_mode: 'Markdown',
        reply_markup: { inline_keyboard: [cancelProcessRow()] }
      });
      return;
    }

    if (isPastDateTime(session.data.date || formatDateShort(new Date()), choice)) {
      return await bot.answerCallbackQuery(query.id, { text: 'Waktu sudah berlalu, pilih jam lain!', show_alert: true });
    }

    const dup = db.checkDuplicateUserBooking(query.from.id, session.data.date, choice);
    if (dup) {
      await safeSendMessage(bot, chatId, `°˖➴ *Peringatan Reservasi Ganda*\n\nAnda sudah memiliki reservasi (*${dup.id}*) pada tanggal *${dup.date}* jam *${dup.time}*.\nMohon pastikan Anda tidak membuat reservasi ganda.`, { parse_mode: 'Markdown' });
    }

    session.data.time = choice;
    session.step = 'DURATION_CHOICE';
    await bot.answerCallbackQuery(query.id);
    await safeEditMessage(bot, chatId, messageId, `${makeProgressBar(4, 6)}\n\n🡻 Pilih *durasi reservasi*:`, {
      parse_mode: 'Markdown',
      ...durationChoiceKeyboard()
    });
    return;
  }

  if (data.startsWith('duration_')) {
    const choice = parseInt(data.replace('duration_', ''), 10);
    const session = sessions[chatId];
    if (!session) return await bot.answerCallbackQuery(query.id, { text: 'Sesi berakhir.' });

    session.data.durationHours = choice;
    session.step = 'AREA_CHOICE';
    await bot.answerCallbackQuery(query.id);
    await safeEditMessage(bot, chatId, messageId, `${makeProgressBar(5, 6)}\n\n🡻 Pilih *area meja*:`, {
      parse_mode: 'Markdown',
      ...areaChoiceKeyboard(db, session.data.date)
    });
    return;
  }

  if (data.startsWith('area_')) {
    const choice = data.replace('area_', '');
    const session = sessions[chatId];
    if (!session) return await bot.answerCallbackQuery(query.id, { text: 'Sesi berakhir.' });

    session.data.area = choice;
    session.step = 'PEOPLE_CHOICE';
    await bot.answerCallbackQuery(query.id);
    await safeEditMessage(bot, chatId, messageId, `${makeProgressBar(5, 6)}\n\n🡻 Pilih *jumlah orang*:`, {
      parse_mode: 'Markdown',
      ...peopleChoiceKeyboard()
    });
    return;
  }

  if (data.startsWith('people_')) {
    const choice = data.replace('people_', '');
    const session = sessions[chatId];
    if (!session) return await bot.answerCallbackQuery(query.id, { text: 'Sesi berakhir.' });

    if (choice === 'custom') {
      session.step = 'PEOPLE_CUSTOM';
      await bot.answerCallbackQuery(query.id);
      await safeEditMessage(bot, chatId, messageId, `${makeProgressBar(5, 6)}\n\n╰┈➤ Ketik *jumlah orang* (angka):`, {
        parse_mode: 'Markdown',
        reply_markup: { inline_keyboard: [cancelProcessRow()] }
      });
      return;
    }

    const check = checkCapacityConflict(db, session.data.area, session.data.date, session.data.time, session.data.durationHours || 2, choice);
    if (check.conflict) {
      await bot.answerCallbackQuery(query.id, {
        text: `[!] Kapasitas area ${session.data.area} tidak mencukupi (sisa slot: ${check.available} orang).`,
        show_alert: true
      });
    }

    session.data.people = choice;
    session.step = 'RECURRING_CHOICE';
    await bot.answerCallbackQuery(query.id);
    await safeEditMessage(bot, chatId, messageId, `${makeProgressBar(6, 6)}\n\n🡻 Pilih *tipe reservasi*:`, {
      parse_mode: 'Markdown',
      ...recurringChoiceKeyboard()
    });
    return;
  }

  if (data.startsWith('recurring_')) {
    const choice = data.replace('recurring_', '');
    const session = sessions[chatId];
    if (!session) return await bot.answerCallbackQuery(query.id, { text: 'Sesi berakhir.' });

    session.data.isRecurring = choice === 'weekly';
    session.data.recurringPattern = choice === 'weekly' ? 'Mingguan' : null;

    session.step = 'NOTE_CHOICE';
    await bot.answerCallbackQuery(query.id);
    await safeEditMessage(bot, chatId, messageId, 'Ingin menambahkan *catatan khusus*?', {
      parse_mode: 'Markdown',
      ...noteChoiceKeyboard()
    });
    return;
  }

  if (data === 'note_skip' || data === 'note_custom') {
    const session = sessions[chatId];
    if (!session) return await bot.answerCallbackQuery(query.id, { text: 'Sesi berakhir.' });

    if (data === 'note_custom') {
      session.step = 'NOTE_CUSTOM';
      await bot.answerCallbackQuery(query.id);
      await safeEditMessage(bot, chatId, messageId, '╰┈➤ Ketik *catatan khusus* Anda:', {
        parse_mode: 'Markdown',
        reply_markup: { inline_keyboard: [cancelProcessRow()] }
      });
      return;
    }

    session.data.note = '';
    session.step = 'CONFIRM';
    await bot.answerCallbackQuery(query.id);
    await sendConfirmationSummary(bot, db, chatId, session, messageId);
    return;
  }

  if (data === 'confirm_save') {
    const session = sessions[chatId];
    if (!session) return await bot.answerCallbackQuery(query.id, { text: 'Sesi berakhir.' });

    const newRes = db.addReservation({
      userId: query.from.id,
      username: query.from.username,
      name: session.data.name,
      phone: session.data.phone,
      date: session.data.date,
      time: session.data.time,
      durationHours: session.data.durationHours || 2,
      area: session.data.area || 'Bebas',
      people: session.data.people,
      note: session.data.note || '',
      status: 'Pending',
      isRecurring: session.data.isRecurring,
      recurringPattern: session.data.recurringPattern
    });

    db.logActivity({
      type: 'RESERVASI_BARU',
      reservationId: newRes.id,
      userId: query.from.id,
      actor: query.from.username || String(query.from.id),
      description: `Reservasi baru ${newRes.id} dibuat oleh ${newRes.name} untuk ${newRes.date}, ${newRes.time}.`
    });

    resetSession(chatId);
    await bot.answerCallbackQuery(query.id, { text: 'Reservasi terkirim!' });

    const settings = db.getSettings();
    await safeEditMessage(bot, chatId, messageId, `°˖➴ *Reservasi Berhasil Dibuat!*\n\n${formatReservation(newRes, { detailed: true, settings })}\n\nMohon tunggu konfirmasi admin. Notifikasi akan dikirim saat status berubah.`, {
      parse_mode: 'Markdown',
      reply_markup: { inline_keyboard: [backToMenuRow()] }
    });

    if (ownerChatId) {
      await safeSendMessage(bot, ownerChatId, `✦•┈๑⋅⋯ ⋯⋅๑┈•✦\n*RESERVASI BARU MASUK!*\n────୨ৎ────\n\n${formatReservation(newRes, { detailed: true })}`, {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [
              { text: '▶︎ Konfirmasi', callback_data: `stset|${newRes.id}|Dikonfirmasi` },
              { text: '▶︎ Tentukan Meja', callback_data: `admin_assigntable_pick|${newRes.id}` }
            ],
            [{ text: '▶︎ Tolak', callback_data: `stset|${newRes.id}|Ditolak` }]
          ]
        }
      });
    }
    return;
  }

  if (data === 'menu_mine') {
    await bot.answerCallbackQuery(query.id);
    const list = db.getUserReservations(query.from.id);
    if (list.length === 0) {
      await safeEditMessage(bot, chatId, messageId, 'Anda belum memiliki reservasi.', {
        reply_markup: { inline_keyboard: [[{ text: '▶︎ Buat Reservasi Baru', callback_data: 'menu_new' }], backToMenuRow()] }
      });
      return;
    }
    const settings = db.getSettings();
    const text = list.map((r) => formatReservation(r, { detailed: true, settings })).join('\n\n────୨ৎ────\n\n');
    await safeEditMessage(bot, chatId, messageId, `✦•┈๑⋅⋯ ⋯⋅๑┈•✦\n*Daftar Reservasi Anda:*\n────୨ৎ────\n\n${text}`, {
      parse_mode: 'Markdown',
      reply_markup: { inline_keyboard: [backToMenuRow()] }
    });
    return;
  }

  if (data === 'menu_edit') {
    await bot.answerCallbackQuery(query.id);
    const active = db.getUserReservations(query.from.id).filter((r) => r.status !== 'Dibatalkan');
    if (active.length === 0) {
      await safeEditMessage(bot, chatId, messageId, 'Anda tidak memiliki reservasi aktif untuk diubah.', {
        reply_markup: { inline_keyboard: [backToMenuRow()] }
      });
      return;
    }
    const buttons = active.map((r) => [
      { text: `▶︎ ${r.id} -- ${r.date}, ${r.time}`, callback_data: `editselect_${r.id}` }
    ]);
    buttons.push(backToMenuRow());
    await safeEditMessage(bot, chatId, messageId, '🡻 Pilih reservasi yang ingin diubah:', {
      reply_markup: { inline_keyboard: buttons }
    });
    return;
  }

  if (data.startsWith('editselect_')) {
    const id = data.replace('editselect_', '');
    await bot.answerCallbackQuery(query.id);
    await safeEditMessage(bot, chatId, messageId, `🡻 Pilih bidang data yang ingin diubah untuk *${id}*:`, {
      parse_mode: 'Markdown',
      ...editReservationFieldsKeyboard(id)
    });
    return;
  }

  if (data.startsWith('editfield_')) {
    const parts = data.split('_');
    const field = parts[1];
    const id = parts[2];
    const res = db.getReservationById(id);
    if (!res) return await bot.answerCallbackQuery(query.id, { text: 'Reservasi tidak ditemukan.' });

    sessions[chatId] = { step: `EDIT_${field.toUpperCase()}_CUSTOM`, reservationId: id, data: { ...res } };
    await bot.answerCallbackQuery(query.id);

    if (field === 'date') {
      await safeEditMessage(bot, chatId, messageId, `╰┈➤ Masukkan *tanggal baru* (DD-MM-YYYY):`, {
        reply_markup: { inline_keyboard: [cancelProcessRow()] }
      });
    } else if (field === 'people') {
      await safeEditMessage(bot, chatId, messageId, `╰┈➤ Masukkan *jumlah orang baru*:`, {
        reply_markup: { inline_keyboard: [cancelProcessRow()] }
      });
    } else if (field === 'note') {
      await safeEditMessage(bot, chatId, messageId, `╰┈➤ Masukkan *catatan baru*:`, {
        reply_markup: { inline_keyboard: [cancelProcessRow()] }
      });
    } else if (field === 'area') {
      session.step = 'EDIT_AREA_PICK';
      await safeEditMessage(bot, chatId, messageId, `🡻 Pilih *area baru*:`, {
        ...areaChoiceKeyboard(db)
      });
    }
    return;
  }

  if (data === 'menu_cancel') {
    await bot.answerCallbackQuery(query.id);
    const active = db.getUserReservations(query.from.id).filter((r) => r.status !== 'Dibatalkan');
    if (active.length === 0) {
      await safeEditMessage(bot, chatId, messageId, 'Anda tidak memiliki reservasi aktif untuk dibatalkan.', {
        reply_markup: { inline_keyboard: [backToMenuRow()] }
      });
      return;
    }
    const buttons = active.map((r) => [
      { text: `▶︎ Batalkan ${r.id} (${r.date})`, callback_data: `cancelconfirm_${r.id}` }
    ]);
    buttons.push(backToMenuRow());
    await safeEditMessage(bot, chatId, messageId, '🡻 Pilih reservasi yang ingin dibatalkan:', {
      reply_markup: { inline_keyboard: buttons }
    });
    return;
  }

  if (data.startsWith('cancelconfirm_')) {
    const id = data.replace('cancelconfirm_', '');
    const updated = db.updateReservation(id, { status: 'Dibatalkan' });
    if (updated) {
      db.logActivity({
        type: 'BATAL_USER',
        reservationId: id,
        userId: query.from.id,
        actor: query.from.username,
        description: `Reservasi ${id} dibatalkan oleh user.`
      });
      await bot.answerCallbackQuery(query.id, { text: 'Reservasi dibatalkan.' });
      await safeEditMessage(bot, chatId, messageId, `°˖➴ Reservasi *${id}* telah dibatalkan.`, {
        parse_mode: 'Markdown',
        reply_markup: { inline_keyboard: [backToMenuRow()] }
      });
      if (ownerChatId) {
        await safeSendMessage(bot, ownerChatId, `°˖➴ User membatalkan reservasi *${id}*.`);
      }
    }
    return;
  }

  if (data === 'menu_rating') {
    await bot.answerCallbackQuery(query.id);
    const conf = db.getUserReservations(query.from.id).filter((r) => r.status === 'Dikonfirmasi');
    if (conf.length === 0) {
      await safeEditMessage(bot, chatId, messageId, 'Anda belum memiliki reservasi terkonfirmasi yang dapat diberi rating.', {
        reply_markup: { inline_keyboard: [backToMenuRow()] }
      });
      return;
    }
    const buttons = conf.map((r) => [
      { text: `▶︎ Rating ${r.id} (${r.date})`, callback_data: `ratepick_${r.id}` }
    ]);
    buttons.push(backToMenuRow());
    await safeEditMessage(bot, chatId, messageId, '🡻 Pilih reservasi untuk diberi rating:', {
      reply_markup: { inline_keyboard: buttons }
    });
    return;
  }

  if (data.startsWith('ratepick_')) {
    const id = data.replace('ratepick_', '');
    await bot.answerCallbackQuery(query.id);
    await safeEditMessage(bot, chatId, messageId, `🡻 Silakan beri rating 1-5 bintang untuk reservasi *${id}*:`, {
      parse_mode: 'Markdown',
      ...ratingKeyboard(id)
    });
    return;
  }

  if (data.startsWith('rate_')) {
    const parts = data.split('_');
    const rId = parts[1];
    const stars = parseInt(parts[2], 10);
    sessions[chatId] = { step: 'RATING_FEEDBACK_TEXT', reservationId: rId, rating: stars };
    await bot.answerCallbackQuery(query.id);
    await safeEditMessage(bot, chatId, messageId, `Anda memilih *${stars} Bintang*.\n\n╰┈➤ Ketik pesan ulasan / feedback Anda:`, {
      parse_mode: 'Markdown',
      reply_markup: { inline_keyboard: [cancelProcessRow()] }
    });
    return;
  }

  if (data === 'user_menu_browse') {
    await bot.answerCallbackQuery(query.id);
    const cart = getCartTotals(chatId);
    await safeEditMessage(bot, chatId, messageId, '🛒𖦹˖°. *Katalog Menu Restoran & Pre-Order*\n────Queue────\n\n🡻 Silakan pilih kategori makanan atau minuman di bawah ini untuk melihat daftar menu dan menambahkannya ke pesanan:', {
      parse_mode: 'Markdown',
      ...userMenuCategoriesKeyboard(cart.count, cart.total)
    });
    return;
  }

  if (data.startsWith('user_menu_cat_')) {
    const category = data.replace('user_menu_cat_', '');
    await bot.answerCallbackQuery(query.id);
    const items = db.getMenuItems(category);
    if (items.length === 0) {
      await safeEditMessage(bot, chatId, messageId, `Belum ada menu untuk kategori *${category}*.`, {
        parse_mode: 'Markdown',
        reply_markup: { inline_keyboard: [backToMenuRow()] }
      });
      return;
    }

    const cart = getUserCart(chatId);
    let catalogText = `🛒𖦹˖°. *Katalog Menu Kategori: ${category}*\n────୨ৎ────\n🡻 Tekan tombol di bawah untuk menambah ke pesanan:\n\n`;
    const buttons = [];
    items.forEach((item, idx) => {
      const foundInCart = cart.find((ci) => ci.itemId === item.id);
      const qty = foundInCart ? foundInCart.qty : 0;
      catalogText += `${idx + 1}. *${item.name}* -- Rp ${item.price.toLocaleString('id-ID')}\n   _${item.description || 'Tidak ada deskripsi'}_ ${qty > 0 ? `*(Pesan: ${qty}x)*` : ''}\n\n`;
      buttons.push([{ text: `▶︎ Pesan: ${item.name} ${qty > 0 ? `(${qty}x)` : ''}`, callback_data: `cart_add_${item.id}` }]);
    });

    const cartTotals = getCartTotals(chatId);
    if (cartTotals.count > 0) {
      buttons.push([{ text: `🛒𖦹˖°. Lihat Keranjang (${cartTotals.count} item - Rp ${cartTotals.total.toLocaleString('id-ID')})`, callback_data: 'user_cart_view' }]);
    }
    buttons.push([{ text: '🢁 Pilih Kategori Lain', callback_data: 'user_menu_browse' }, { text: '🢁 Menu Utama', callback_data: 'menu_main' }]);

    await safeEditMessage(bot, chatId, messageId, catalogText, {
      parse_mode: 'Markdown',
      reply_markup: { inline_keyboard: buttons }
    });
    return;
  }

  if (data.startsWith('cart_add_')) {
    const itemId = data.replace('cart_add_', '');
    const item = db.getMenuItemById(itemId);
    if (!item) return await bot.answerCallbackQuery(query.id, { text: 'Item tidak ditemukan.' });
    addToCart(chatId, item);
    const cart = getCartTotals(chatId);
    await bot.answerCallbackQuery(query.id, { text: `°˖➴ ${item.name} ditambahkan! (Total: ${cart.count} item)` });

    if (item.category) {
      const items = db.getMenuItems(item.category);
      let catalogText = `🛒𖦹˖°. *Katalog Menu Kategori: ${item.category}*\n────୨ৎ────\n🡻 Tekan tombol di bawah untuk menambah ke pesanan:\n\n`;
      const buttons = [];
      const currentCart = getUserCart(chatId);
      items.forEach((it, idx) => {
        const foundInCart = currentCart.find((ci) => ci.itemId === it.id);
        const qty = foundInCart ? foundInCart.qty : 0;
        catalogText += `${idx + 1}. *${it.name}* -- Rp ${it.price.toLocaleString('id-ID')}\n   _${it.description || 'Tidak ada deskripsi'}_ ${qty > 0 ? `*(Pesan: ${qty}x)*` : ''}\n\n`;
        buttons.push([{ text: `▶︎ Pesan: ${it.name} ${qty > 0 ? `(${qty}x)` : ''}`, callback_data: `cart_add_${it.id}` }]);
      });
      if (cart.count > 0) {
        buttons.push([{ text: `🛒𖦹˖°. Lihat Keranjang (${cart.count} item - Rp ${cart.total.toLocaleString('id-ID')})`, callback_data: 'user_cart_view' }]);
      }
      buttons.push([{ text: '🢁 Pilih Kategori Lain', callback_data: 'user_menu_browse' }, { text: '🢁 Menu Utama', callback_data: 'menu_main' }]);

      await safeEditMessage(bot, chatId, messageId, catalogText, {
        parse_mode: 'Markdown',
        reply_markup: { inline_keyboard: buttons }
      });
    }
    return;
  }

  if (data.startsWith('cart_sub_')) {
    const itemId = data.replace('cart_sub_', '');
    subFromCart(chatId, itemId);
    await bot.answerCallbackQuery(query.id, { text: 'Jumlah dikurangi.' });
    const cart = getCartTotals(chatId);
    await safeEditMessage(bot, chatId, messageId, formatCartSummary(cart.items), {
      parse_mode: 'Markdown',
      ...userCartKeyboard(cart.items)
    });
    return;
  }

  if (data.startsWith('cart_del_')) {
    const itemId = data.replace('cart_del_', '');
    delFromCart(chatId, itemId);
    await bot.answerCallbackQuery(query.id, { text: 'Item dihapus dari keranjang.' });
    const cart = getCartTotals(chatId);
    await safeEditMessage(bot, chatId, messageId, formatCartSummary(cart.items), {
      parse_mode: 'Markdown',
      ...userCartKeyboard(cart.items)
    });
    return;
  }

  if (data === 'cart_clear') {
    clearCart(chatId);
    await bot.answerCallbackQuery(query.id, { text: 'Keranjang dikosongkan.' });
    await safeEditMessage(bot, chatId, messageId, formatCartSummary([]), {
      parse_mode: 'Markdown',
      ...userCartKeyboard([])
    });
    return;
  }

  if (data === 'user_cart_view') {
    await bot.answerCallbackQuery(query.id);
    const cart = getCartTotals(chatId);
    await safeEditMessage(bot, chatId, messageId, formatCartSummary(cart.items), {
      parse_mode: 'Markdown',
      ...userCartKeyboard(cart.items)
    });
    return;
  }

  if (data === 'cart_checkout') {
    const cart = getCartTotals(chatId);
    if (cart.items.length === 0) {
      return await bot.answerCallbackQuery(query.id, { text: 'Keranjang Anda kosong!', show_alert: true });
    }
    const orderTextSummary = cart.items.map((i) => `${i.name} (${i.qty}x)`).join(', ');
    const userRes = db.getUserReservations(query.from.id).filter((r) => r.status !== 'Dibatalkan');
    if (userRes.length > 0) {
      const lastRes = userRes[userRes.length - 1];
      db.updateReservation(lastRes.id, { preorder: orderTextSummary });
    }
    await bot.answerCallbackQuery(query.id, { text: 'Pre-order berhasil disimpan!' });
    await safeEditMessage(bot, chatId, messageId, `°˖➴ *Pre-Order Berhasil Disimpan!*\n\n${formatCartSummary(cart.items)}\n\n╰┈➤ Catatan: Pembayaran dilakukan langsung di Kasir Restoran saat kedatangan.`, {
      parse_mode: 'Markdown',
      reply_markup: { inline_keyboard: [backToMenuRow()] }
    });
    clearCart(chatId);
    return;
  }

  if (isOwner(query)) {
    await handleAdminCallbacks(bot, db, query, data, chatId, messageId);
  }
}

async function handleAdminCallbacks(bot, db, query, data, chatId, messageId) {
  if (data === 'admin_menu') {
    await bot.answerCallbackQuery(query.id);
    await safeEditMessage(bot, chatId, messageId, '✦•┈๑⋅⋯ ⋯⋅๑┈•✦\n*Panel Owner / Admin*\n🡻 Silakan pilih menu:', {
      parse_mode: 'Markdown',
      ...adminMenuInline()
    });
    return;
  }

  if (data === 'admin_stats') {
    await bot.answerCallbackQuery(query.id);
    const statsText = generateVisualStats(db);
    await safeEditMessage(bot, chatId, messageId, statsText, {
      parse_mode: 'Markdown',
      reply_markup: { inline_keyboard: [[{ text: '🢁 Kembali ke Panel', callback_data: 'admin_menu' }]] }
    });
    return;
  }

  if (data === 'admin_assigntable_list') {
    await bot.answerCallbackQuery(query.id);
    const list = db.getReservations().filter((r) => r.status !== 'Dibatalkan');
    if (list.length === 0) {
      await safeEditMessage(bot, chatId, messageId, 'Tidak ada reservasi aktif untuk ditentukan mejanya.', {
        reply_markup: { inline_keyboard: [[{ text: '🢁 Kembali', callback_data: 'admin_menu' }]] }
      });
      return;
    }
    const buttons = list.map((r) => [
      { text: `▶︎ ${r.id} -- ${r.name} (${r.tableName || 'Belum ada meja'})`, callback_data: `admin_assigntable_pick|${r.id}` }
    ]);
    buttons.push([{ text: '🢁 Kembali', callback_data: 'admin_menu' }]);
    await safeEditMessage(bot, chatId, messageId, '🡻 Pilih reservasi yang ingin ditentukan mejanya oleh Admin:', {
      reply_markup: { inline_keyboard: buttons }
    });
    return;
  }

  if (data.startsWith('admin_assigntable_pick|')) {
    const id = data.split('|')[1];
    const res = db.getReservationById(id);
    if (!res) return await bot.answerCallbackQuery(query.id, { text: 'Reservasi tidak ditemukan.' });

    const tables = db.getTablesByArea(res.area);
    const buttons = tables.map((t) => [
      { text: `▶︎ ${t.name} (Kap: ${t.capacity})`, callback_data: `admin_assigntable_set|${id}|${t.id}` }
    ]);
    buttons.push([{ text: '🢁 Kembali', callback_data: 'admin_assigntable_list' }]);
    await bot.answerCallbackQuery(query.id);
    await safeEditMessage(bot, chatId, messageId, `🡻 Tentukan meja untuk *${id}* (${res.name}, Area: ${res.area}):`, {
      parse_mode: 'Markdown',
      reply_markup: { inline_keyboard: buttons }
    });
    return;
  }

  if (data.startsWith('admin_assigntable_set|')) {
    const [, id, tableId] = data.split('|');
    const updated = db.assignTable(id, tableId);
    if (updated) {
      db.logActivity({
        type: 'PENETAPAN_MEJA',
        reservationId: id,
        userId: updated.userId,
        actor: query.from.username,
        description: `Admin menentukan meja ${updated.tableName} untuk reservasi ${id}.`
      });
      await bot.answerCallbackQuery(query.id, { text: `Meja ${updated.tableName} ditetapkan!` });
      await safeEditMessage(bot, chatId, messageId, `°˖➴ Meja untuk reservasi *${id}* berhasil diubah menjadi *${updated.tableName}*.`, {
        parse_mode: 'Markdown',
        reply_markup: { inline_keyboard: [[{ text: '🢁 Kembali', callback_data: 'admin_assigntable_list' }]] }
      });
      await safeSendMessage(bot, updated.userId, `°˖➴ Admin telah menentukan meja Anda untuk reservasi *${id}*:\nMeja: *${updated.tableName}*`, { parse_mode: 'Markdown' });
    }
    return;
  }

  if (data === 'admin_settings') {
    await bot.answerCallbackQuery(query.id);
    const s = db.getSettings();
    const text =
      `✦•┈๑⋅⋯ ⋯⋅๑┈•✦\n` +
      `*Setting Toko & Bot*\n` +
      `────发电─────\n` +
      `╰┈➤ Nama Bot: ${s.botName}\n` +
      `╰┈➤ Deskripsi: ${s.description}\n` +
      `╰┈➤ Nama Toko: ${s.shopName}\n` +
      `╰┈➤ Alamat: ${s.shopAddress}\n` +
      `╰┈➤ Logo: ${s.logo || '-'}`;
    await safeEditMessage(bot, chatId, messageId, text, {
      parse_mode: 'Markdown',
      ...adminSettingsKeyboard()
    });
    return;
  }

  if (data.startsWith('set_')) {
    const field = data.replace('set_', '');
    sessions[chatId] = { step: `SET_${field.toUpperCase()}` };
    await bot.answerCallbackQuery(query.id);
    await safeEditMessage(bot, chatId, messageId, `╰┈➤ Ketik nilai baru untuk *${field}*:`, {
      parse_mode: 'Markdown',
      reply_markup: { inline_keyboard: [cancelProcessRow()] }
    });
    return;
  }

  if (data === 'admin_broadcast') {
    sessions[chatId] = { step: 'ADMIN_BROADCAST_TEXT' };
    await bot.answerCallbackQuery(query.id);
    await safeEditMessage(bot, chatId, messageId, '╰┈➤ Ketik pesan broadcast yang ingin dikirim ke semua pengguna terdaftar:', {
      parse_mode: 'Markdown',
      reply_markup: { inline_keyboard: [cancelProcessRow()] }
    });
    return;
  }

  if (data === 'admin_csv') {
    await bot.answerCallbackQuery(query.id);
    const csvRes = generateReservationsCSV(db.getReservations());
    const csvAct = generateActivitiesCSV(db.getActivities());
    await bot.sendDocument(chatId, Buffer.from(csvRes), {}, { filename: 'reservasi.csv', contentType: 'text/csv' });
    await bot.sendDocument(chatId, Buffer.from(csvAct), {}, { filename: 'log_aktivitas.csv', contentType: 'text/csv' });
    return;
  }

  if (data === 'admin_backuprestore') {
    await bot.answerCallbackQuery(query.id);
    await safeEditMessage(bot, chatId, messageId, '✦•┈๑⋅⋯ ⋯⋅๑┈•✦\n*Backup & Restore Database*\n────୨ৎ────\n\n🡻 Pilih aksi di bawah:', {
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [
          [{ text: '▶︎ Download Backup db.json', callback_data: 'admin_backup_download' }],
          [{ text: '▶︎ Restore Database (Unggah db.json)', callback_data: 'admin_restore_upload' }],
          [{ text: '🢁 Kembali', callback_data: 'admin_menu' }]
        ]
      }
    });
    return;
  }

  if (data === 'admin_backup_download') {
    await bot.answerCallbackQuery(query.id);
    const jsonStr = db.backupDB();
    await bot.sendDocument(chatId, Buffer.from(jsonStr), {}, { filename: 'db.json', contentType: 'application/json' });
    return;
  }

  if (data === 'admin_restore_upload') {
    sessions[chatId] = { step: 'WAITING_RESTORE_FILE' };
    await bot.answerCallbackQuery(query.id);
    await safeEditMessage(bot, chatId, messageId, '╰┈➤ Silakan kirim/unggah file `db.json` ke chat ini untuk memulihkan data.', {
      parse_mode: 'Markdown',
      reply_markup: { inline_keyboard: [cancelProcessRow()] }
    });
    return;
  }

  if (data === 'admin_tables_manage') {
    await bot.answerCallbackQuery(query.id);
    const tables = db.getTables();
    const areas = db.getAreas();
    const areaBreakdown = areas.map((a) => {
      const count = tables.filter((t) => t.area === a.id).length;
      return `   ╰┈➤ *${a.name}*: ${count} meja`;
    }).join('\n');

    const summaryText =
      `🪑 *Fitur Manajemen Meja Restoran*\n` +
      `────发电─────\n\n` +
      `╰┈➤ *Total Meja saat ini*: *${tables.length} meja*\n\n` +
      `*Rincian Area:*\n${areaBreakdown}\n\n` +
      `🡻 Silakan pilih menu di bawah ini:`;

    await safeEditMessage(bot, chatId, messageId, summaryText, {
      parse_mode: 'Markdown',
      ...adminTableManagementKeyboard()
    });
    return;
  }

  if (data === 'admin_tables_list') {
    await bot.answerCallbackQuery(query.id);
    const tablesList = db.getTables();
    if (tablesList.length === 0) {
      await safeEditMessage(bot, chatId, messageId, 'Belum ada meja terdaftar dalam database.', {
        reply_markup: { inline_keyboard: [[{ text: '➕ Tambah Meja Baru', callback_data: 'admin_addtable_start' }], backToMenuRow()] }
      });
      return;
    }
    await safeEditMessage(bot, chatId, messageId, `🪑 *Daftar Meja Restoran* (Total: ${tablesList.length}):\n╰┈➤ Klik meja untuk melihat detail, edit atribut, atau menghapus:`, {
      parse_mode: 'Markdown',
      ...adminTablesListKeyboard(tablesList)
    });
    return;
  }

  if (data === 'admin_addtable_start') {
    sessions[chatId] = { step: 'ADD_TABLE_ID', data: {} };
    await bot.answerCallbackQuery(query.id);
    await safeEditMessage(bot, chatId, messageId, '*Tambah Meja Baru (Langkah 1/4)*\n\n╰┈➤ Masukkan *ID / Kode Meja* (contoh: `T-06` atau `V-02`):', {
      parse_mode: 'Markdown',
      reply_markup: { inline_keyboard: [cancelProcessRow()] }
    });
    return;
  }

  if (data.startsWith('addtable_area_')) {
    const area = data.replace('addtable_area_', '');
    const session = sessions[chatId];
    if (!session) return await bot.answerCallbackQuery(query.id, { text: 'Sesi berakhir.' });
    session.data.area = area;
    session.step = 'ADD_TABLE_CAPACITY';
    await bot.answerCallbackQuery(query.id);
    await safeEditMessage(bot, chatId, messageId, `*Masukkan Kapasitas Meja (Langkah 4/4)*:\nMeja: *${session.data.name}* (${area})\n\n╰┈➤ Ketik jumlah maksimal orang yang muat di meja ini (contoh: 4):`, {
      parse_mode: 'Markdown',
      reply_markup: { inline_keyboard: [cancelProcessRow()] }
    });
    return;
  }

  if (data.startsWith('admin_table_pick_')) {
    const tableId = data.replace('admin_table_pick_', '');
    const table = db.getTableById(tableId);
    if (!table) return await bot.answerCallbackQuery(query.id, { text: 'Meja tidak ditemukan.' });
    await bot.answerCallbackQuery(query.id);
    await safeEditMessage(bot, chatId, messageId, `${formatTable(table)}\n\n🡻 Pilih atribut yang ingin diubah:`, {
      parse_mode: 'Markdown',
      ...adminTableEditOptionsKeyboard(table.id)
    });
    return;
  }

  if (data.startsWith('edittable_name_')) {
    const tableId = data.replace('edittable_name_', '');
    const table = db.getTableById(tableId);
    sessions[chatId] = { step: 'EDIT_TABLE_NAME', tableId };
    await bot.answerCallbackQuery(query.id);
    await safeEditMessage(bot, chatId, messageId, `╰┈➤ Masukkan *nama / deskripsi baru* untuk meja *${table.id}* (Nama saat ini: ${table.name}):`, {
      parse_mode: 'Markdown',
      reply_markup: { inline_keyboard: [cancelProcessRow()] }
    });
    return;
  }

  if (data.startsWith('edittable_area_')) {
    const tableId = data.replace('edittable_area_', '');
    const table = db.getTableById(tableId);
    await bot.answerCallbackQuery(query.id);
    await safeEditMessage(bot, chatId, messageId, `🡻 Pilih *Area Baru* untuk meja *${table.id}* (${table.name}):`, {
      parse_mode: 'Markdown',
      ...adminTableAreaPickKeyboard(`settablearea_${tableId}`)
    });
    return;
  }

  if (data.startsWith('settablearea_')) {
    const parts = data.split('_');
    const tableId = parts[1];
    const newArea = parts[2];
    const updated = db.updateTable(tableId, { area: newArea });
    db.logActivity({
      type: 'SETTING_UPDATE',
      actor: query.from.username,
      description: `Area meja ${tableId} diubah menjadi ${newArea}.`
    });
    await bot.answerCallbackQuery(query.id, { text: `Area diubah ke ${newArea}!` });
    await safeEditMessage(bot, chatId, messageId, `°˖➴ Area meja *${tableId}* diubah menjadi *${newArea}*!\n\n${formatTable(updated)}`, {
      parse_mode: 'Markdown',
      ...adminTableEditOptionsKeyboard(updated.id)
    });
    return;
  }

  if (data.startsWith('edittable_cap_')) {
    const tableId = data.replace('edittable_cap_', '');
    const table = db.getTableById(tableId);
    sessions[chatId] = { step: 'EDIT_TABLE_CAPACITY', tableId };
    await bot.answerCallbackQuery(query.id);
    await safeEditMessage(bot, chatId, messageId, `╰┈➤ Masukkan *kapasitas baru (orang)* untuk meja *${table.id}* (Kapasitas saat ini: ${table.capacity} orang):`, {
      parse_mode: 'Markdown',
      reply_markup: { inline_keyboard: [cancelProcessRow()] }
    });
    return;
  }

  if (data.startsWith('edittable_del_')) {
    const tableId = data.replace('edittable_del_', '');
    const table = db.getTableById(tableId);
    if (table) {
      db.deleteTable(tableId);
      db.logActivity({
        type: 'SETTING_UPDATE',
        actor: query.from.username,
        description: `Meja "${table.name}" (${tableId}) dihapus oleh Admin.`
      });
      await bot.answerCallbackQuery(query.id, { text: `Meja ${tableId} dihapus!` });
      await safeEditMessage(bot, chatId, messageId, `°˖➴ Meja *${table.name}* (${tableId}) telah dihapus dari sistem.`, {
        parse_mode: 'Markdown',
        ...adminTableManagementKeyboard()
      });
    }
    return;
  }

  if (data === 'admin_menu_manage') {
    await bot.answerCallbackQuery(query.id);
    await safeEditMessage(bot, chatId, messageId, '🛒𖦹˖°. *Kelola Menu Restoran (Makanan & Minuman)*\n────୨ৎ────\n\n🡻 Silakan pilih opsi di bawah:', {
      parse_mode: 'Markdown',
      ...adminMenuManagementKeyboard()
    });
    return;
  }

  if (data === 'admin_menu_list') {
    await bot.answerCallbackQuery(query.id);
    const menuList = db.getMenuItems();
    if (menuList.length === 0) {
      await safeEditMessage(bot, chatId, messageId, 'Belum ada item menu.', {
        reply_markup: { inline_keyboard: [[{ text: '▶︎ Tambah Menu Baru', callback_data: 'admin_addmenu_start' }], backToMenuRow()] }
      });
      return;
    }
    await safeEditMessage(bot, chatId, messageId, '🛒𖦹˖°. *Daftar Menu Restoran:*\n╰┈➤ Klik item untuk mengedit atribut atau menghapusnya:', {
      parse_mode: 'Markdown',
      ...adminMenuListKeyboard(menuList)
    });
    return;
  }

  if (data === 'admin_addmenu_start') {
    sessions[chatId] = { step: 'ADD_MENU_NAME', data: {} };
    await bot.answerCallbackQuery(query.id);
    await safeEditMessage(bot, chatId, messageId, '*Tambah Menu Baru (Langkah 1/5)*\n\n╰┈➤ Masukkan *nama item makanan / minuman*:', {
      parse_mode: 'Markdown',
      reply_markup: { inline_keyboard: [cancelProcessRow()] }
    });
    return;
  }

  if (data.startsWith('addmenucat_')) {
    const category = data.replace('addmenucat_', '');
    const session = sessions[chatId];
    if (!session) return await bot.answerCallbackQuery(query.id, { text: 'Sesi berakhir.' });
    session.data.category = category;
    session.step = 'ADD_MENU_PRICE';
    await bot.answerCallbackQuery(query.id);
    await safeEditMessage(bot, chatId, messageId, `*Masukkan Harga Item (Langkah 3/5)*:\nItem: *${session.data.name}* (${category})\n\n╰┈➤ Ketik nominal angka harga (contoh: 25000):`, {
      parse_mode: 'Markdown',
      reply_markup: { inline_keyboard: [cancelProcessRow()] }
    });
    return;
  }

  if (data.startsWith('admin_menu_pick_')) {
    const itemId = data.replace('admin_menu_pick_', '');
    const item = db.getMenuItemById(itemId);
    if (!item) return await bot.answerCallbackQuery(query.id, { text: 'Menu tidak ditemukan.' });
    await bot.answerCallbackQuery(query.id);
    if (item.image && typeof item.image === 'string' && item.image.trim() !== '') {
      const sent = await safeSendPhoto(bot, chatId, item.image, {
        caption: `🛒𖦹˖°. *Kelola Menu Atribut:*\n────୨ৎ────\n\n${formatMenuItem(item)}`,
        parse_mode: 'Markdown',
        ...adminMenuItemEditOptionsKeyboard(item.id)
      });
      if (sent) return;
    }
    await safeEditMessage(bot, chatId, messageId, `🛒𖦹˖°. *Kelola Menu Atribut:*\n────୨ৎ────\n\n${formatMenuItem(item)}`, {
      parse_mode: 'Markdown',
      ...adminMenuItemEditOptionsKeyboard(item.id)
    });
    return;
  }

  if (data.startsWith('editmenu_name_')) {
    const itemId = data.replace('editmenu_name_', '');
    const item = db.getMenuItemById(itemId);
    sessions[chatId] = { step: 'EDIT_MENU_NAME', itemId };
    await bot.answerCallbackQuery(query.id);
    await safeEditMessage(bot, chatId, messageId, `╰┈➤ Masukkan *nama baru* untuk *${item.name}*:`, {
      parse_mode: 'Markdown',
      reply_markup: { inline_keyboard: [cancelProcessRow()] }
    });
    return;
  }

  if (data.startsWith('editmenu_cat_')) {
    const itemId = data.replace('editmenu_cat_', '');
    const item = db.getMenuItemById(itemId);
    await bot.answerCallbackQuery(query.id);
    await safeEditMessage(bot, chatId, messageId, `🡻 Pilih *kategori baru* untuk *${item.name}*:`, {
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [
          [
            { text: '▶︎ Makanan', callback_data: `setmenucat_${itemId}_Makanan` },
            { text: '▶︎ Minuman', callback_data: `setmenucat_${itemId}_Minuman` }
          ],
          cancelProcessRow()
        ]
      }
    });
    return;
  }

  if (data.startsWith('setmenucat_')) {
    const parts = data.split('_');
    const itemId = parts[1];
    const newCat = parts[2];
    const updated = db.updateMenuItem(itemId, { category: newCat });
    await bot.answerCallbackQuery(query.id, { text: `Kategori diubah ke ${newCat}!` });
    await safeEditMessage(bot, chatId, messageId, `°˖➴ Kategori *${updated.name}* diubah menjadi *${newCat}*!`, {
      parse_mode: 'Markdown',
      ...adminMenuItemEditOptionsKeyboard(updated.id)
    });
    return;
  }

  if (data.startsWith('editmenu_price_')) {
    const itemId = data.replace('editmenu_price_', '');
    const item = db.getMenuItemById(itemId);
    sessions[chatId] = { step: 'EDIT_MENU_PRICE', itemId };
    await bot.answerCallbackQuery(query.id);
    await safeEditMessage(bot, chatId, messageId, `╰┈➤ Masukkan *harga baru* untuk *${item.name}* (contoh: 35000):`, {
      parse_mode: 'Markdown',
      reply_markup: { inline_keyboard: [cancelProcessRow()] }
    });
    return;
  }

  if (data.startsWith('editmenu_desc_')) {
    const itemId = data.replace('editmenu_desc_', '');
    const item = db.getMenuItemById(itemId);
    sessions[chatId] = { step: 'EDIT_MENU_DESC', itemId };
    await bot.answerCallbackQuery(query.id);
    await safeEditMessage(bot, chatId, messageId, `╰┈➤ Masukkan *deskripsi baru* untuk *${item.name}*:`, {
      parse_mode: 'Markdown',
      reply_markup: { inline_keyboard: [cancelProcessRow()] }
    });
    return;
  }

  if (data.startsWith('editmenu_img_')) {
    const itemId = data.replace('editmenu_img_', '');
    const item = db.getMenuItemById(itemId);
    sessions[chatId] = { step: `EDIT_MENU_IMAGE_${itemId}`, itemId };
    await bot.answerCallbackQuery(query.id);
    await safeEditMessage(bot, chatId, messageId, `╰┈➤ Kirimkan *foto baru* ke chat ini atau ketik *URL gambar baru* untuk *${item.name}*:`, {
      parse_mode: 'Markdown',
      reply_markup: { inline_keyboard: [cancelProcessRow()] }
    });
    return;
  }

  if (data.startsWith('editmenu_del_')) {
    const itemId = data.replace('editmenu_del_', '');
    const item = db.getMenuItemById(itemId);
    if (item) {
      db.deleteMenuItem(itemId);
      db.logActivity({
        type: 'SETTING_UPDATE',
        actor: query.from.username,
        description: `Menu makanan/minuman "${item.name}" dihapus oleh Admin.`
      });
      await bot.answerCallbackQuery(query.id, { text: 'Item menu dihapus!' });
      await safeEditMessage(bot, chatId, messageId, `°˖➴ Item menu *${item.name}* telah dihapus!`, {
        parse_mode: 'Markdown',
        ...adminMenuManagementKeyboard()
      });
    }
    return;
  }

  if (data === 'admin_blockouts') {
    await bot.answerCallbackQuery(query.id);
    await safeEditMessage(bot, chatId, messageId, '✦•┈๑⋅⋯ ⋯⋅๑┈•✦\n*Daftar Hari Libur (Blockout Dates)*:\n╰┈➤ Restoran akan otomatis menolak reservasi pada tanggal-tanggal ini.', {
      parse_mode: 'Markdown',
      ...adminBlockedDatesKeyboard(db.getBlockedDates())
    });
    return;
  }

  if (data === 'addblock_start') {
    sessions[chatId] = { step: 'ADD_BLOCKOUT_DATE', data: {} };
    await bot.answerCallbackQuery(query.id);
    await safeEditMessage(bot, chatId, messageId, '╰┈➤ Ketik *tanggal libur* (Format: DD-MM-YYYY):', {
      parse_mode: 'Markdown',
      reply_markup: { inline_keyboard: [cancelProcessRow()] }
    });
    return;
  }

  if (data.startsWith('delblock_')) {
    const blockId = data.replace('delblock_', '');
    db.deleteBlockedDate(blockId);
    db.logActivity({
      type: 'SETTING_UPDATE',
      actor: query.from.username,
      description: `Hari libur ${blockId} dihapus oleh Admin.`
    });
    await bot.answerCallbackQuery(query.id, { text: 'Hari libur dihapus!' });
    await safeEditMessage(bot, chatId, messageId, '✦•┈๑⋅⋯ ⋯⋅๑┈•✦\n*Daftar Hari Libur (Blockout Dates)*:', {
      parse_mode: 'Markdown',
      ...adminBlockedDatesKeyboard(db.getBlockedDates())
    });
    return;
  }

  if (data.startsWith('admnote_')) {
    const id = data.replace('admnote_', '');
    sessions[chatId] = { step: 'ADMIN_INPUT_NOTE', reservationId: id };
    await bot.answerCallbackQuery(query.id);
    await safeEditMessage(bot, chatId, messageId, `╰┈➤ Ketik *Catatan Internal Admin* untuk reservasi *${id}*:\n_(Hanya bisa dilihat oleh staf/admin)_`, {
      parse_mode: 'Markdown',
      reply_markup: { inline_keyboard: [cancelProcessRow()] }
    });
    return;
  }

  if (data.startsWith('admcheckin_')) {
    const id = data.replace('admcheckin_', '');
    const updated = db.updateReservation(id, { checkInTime: new Date().toISOString() });
    db.logActivity({
      type: 'UBAH_STATUS',
      reservationId: id,
      actor: query.from.username,
      description: `Tamu reservasi ${id} telah check-in.`
    });
    await bot.answerCallbackQuery(query.id, { text: 'Tamu telah check-in!' });
    await safeEditMessage(bot, chatId, messageId, `°˖➴ Tamu untuk reservasi *${id}* berhasil di-check-in!\n\n${formatReservation(updated, { detailed: true, forAdmin: true })}`, {
      parse_mode: 'Markdown',
      ...adminReservationDetailActionKeyboard(id)
    });
    return;
  }

  if (data.startsWith('admtimeline_')) {
    const id = data.replace('admtimeline_', '');
    const logs = db.getActivitiesByReservation(id);
    await bot.answerCallbackQuery(query.id);
    if (logs.length === 0) {
      await safeEditMessage(bot, chatId, messageId, `Tidak ada log aktivitas khusus untuk reservasi *${id}*.`, {
        parse_mode: 'Markdown',
        reply_markup: { inline_keyboard: [[{ text: '🢁 Kembali', callback_data: 'admin_manage' }]] }
      });
      return;
    }
    const timelineText = `✦•┈๑⋅⋯ ⋯⋅๑┈•✦\n*Timeline Aktivitas Reservasi ${id}:*\n────发电─────\n\n` + logs.map((a) => `╰┈➤ Waktu: ${new Date(a.timestamp).toLocaleString('id-ID')}\n   [${a.type}] ${a.description} (oleh: ${a.actor || 'System'})`).join('\n\n');
    await safeEditMessage(bot, chatId, messageId, timelineText, {
      parse_mode: 'Markdown',
      reply_markup: { inline_keyboard: [[{ text: '🢁 Kembali', callback_data: 'admin_manage' }]] }
    });
    return;
  }

  if (data === 'admin_manage') {
    await bot.answerCallbackQuery(query.id);
    const list = db.getReservations().filter((r) => r.status !== 'Dibatalkan');
    if (list.length === 0) {
      await safeEditMessage(bot, chatId, messageId, 'Belum ada reservasi aktif.', {
        reply_markup: { inline_keyboard: [[{ text: '🢁 Kembali', callback_data: 'admin_menu' }]] }
      });
      return;
    }
    const buttons = list.map((r) => [
      { text: `▶︎ ${r.id} -- ${r.name} (${r.status})`, callback_data: `stpick_${r.id}` }
    ]);
    buttons.push([{ text: '🢁 Kembali', callback_data: 'admin_menu' }]);
    await safeEditMessage(bot, chatId, messageId, '🡻 Pilih reservasi yang ingin diubah statusnya:', {
      reply_markup: { inline_keyboard: buttons }
    });
    return;
  }

  if (data.startsWith('stpick_')) {
    const id = data.replace('stpick_', '');
    const res = db.getReservationById(id);
    await bot.answerCallbackQuery(query.id);
    const text = `✦•┈๑⋅⋯ ⋯⋅๑┈•✦\n*Detail & Kelola Reservasi ${id}:*\n────୨ৎ────\n\n${formatReservation(res, { detailed: true, forAdmin: true })}`;
    await safeEditMessage(bot, chatId, messageId, text, {
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [
          [
            { text: '▶︎ Dikonfirmasi', callback_data: `stset|${id}|Dikonfirmasi` },
            { text: '▶︎ Pending', callback_data: `stset|${id}|Pending` }
          ],
          [
            { text: '▶︎ Ditolak', callback_data: `stset|${id}|Ditolak` },
            { text: '▶︎ Dibatalkan', callback_data: `stset|${id}|Dibatalkan` }
          ],
          [
            { text: '▶︎ Catatan Admin', callback_data: `admnote_${id}` },
            { text: '▶︎ Check-in Tamu', callback_data: `admcheckin_${id}` }
          ],
          [
            { text: '▶︎ Lihat Timeline', callback_data: `admtimeline_${id}` }
          ],
          [{ text: '🢁 Kembali', callback_data: 'admin_manage' }]
        ]
      }
    });
    return;
  }

  if (data.startsWith('stset|')) {
    const [, id, newStatus] = data.split('|');
    const res = db.getReservationById(id);
    if (!res) return await bot.answerCallbackQuery(query.id, { text: 'Reservasi tidak ditemukan.' });

    const oldStatus = res.status;
    db.updateReservation(id, { status: newStatus });
    db.logActivity({
      type: 'UBAH_STATUS',
      reservationId: id,
      userId: res.userId,
      actor: query.from.username,
      description: `Status reservasi ${id} diubah dari "${oldStatus}" menjadi "${newStatus}".`
    });

    await bot.answerCallbackQuery(query.id, { text: `Status diubah: ${newStatus}` });
    await safeEditMessage(bot, chatId, messageId, `°˖➴ Status reservasi *${id}* diubah menjadi *${newStatus}*.`, {
      parse_mode: 'Markdown',
      reply_markup: { inline_keyboard: [[{ text: '🢁 Kembali', callback_data: 'admin_menu' }]] }
    });

    await safeSendMessage(bot, res.userId, `°˖➴ Status reservasi Anda *${id}* diubah menjadi *${newStatus}*.`, { parse_mode: 'Markdown' });
    return;
  }

  if (data.startsWith('admin_list')) {
    await bot.answerCallbackQuery(query.id);
    const parts = data.split('|');
    const page = parseInt(parts[1] || '0', 10);
    const list = db.getReservations();
    if (list.length === 0) {
      await safeEditMessage(bot, chatId, messageId, '*Belum ada reservasi dalam database.*', {
        parse_mode: 'Markdown',
        reply_markup: { inline_keyboard: [[{ text: '🢁 Kembali ke Panel Admin', callback_data: 'admin_menu' }]] }
      });
      return;
    }
    const perPage = 3;
    const totalPages = Math.ceil(list.length / perPage);
    const currentPage = Math.min(Math.max(page, 0), totalPages - 1);
    const startIdx = currentPage * perPage;
    const pageItems = list.slice(startIdx, startIdx + perPage);

    const settings = db.getSettings();
    let text = `✦•┈๑⋅⋯ ⋯⋅๑┈•✦\n*Daftar Semua Reservasi Restoran* (Total: ${list.length} | Halaman ${currentPage + 1}/${totalPages}):\n────୨ৎ────\n\n`;
    text += pageItems.map((r) => formatReservation(r, { detailed: true, settings, forAdmin: true })).join('\n\n────୨ৎ────\n\n');

    const navButtons = [];
    if (currentPage > 0) {
      navButtons.push({ text: '🢁 Sebelumnya', callback_data: `admin_list|${currentPage - 1}` });
    }
    navButtons.push({ text: `Page ${currentPage + 1}/${totalPages}`, callback_data: 'noop' });
    if (currentPage < totalPages - 1) {
      navButtons.push({ text: 'Berikutnya 🡻', callback_data: `admin_list|${currentPage + 1}` });
    }

    const rows = [];
    if (navButtons.length > 1) rows.push(navButtons);
    rows.push([{ text: '🢁 Kembali ke Panel Admin', callback_data: 'admin_menu' }]);

    await safeEditMessage(bot, chatId, messageId, text, {
      parse_mode: 'Markdown',
      reply_markup: { inline_keyboard: rows }
    });
    return;
  }

  if (data.startsWith('admin_logs')) {
    await bot.answerCallbackQuery(query.id);
    const parts = data.split('|');
    const page = parseInt(parts[1] || '0', 10);
    const logs = db.getActivities().slice().reverse();
    if (logs.length === 0) {
      await safeEditMessage(bot, chatId, messageId, '*Belum ada log aktivitas.*', {
        parse_mode: 'Markdown',
        reply_markup: { inline_keyboard: [[{ text: '🢁 Kembali ke Panel Admin', callback_data: 'admin_menu' }]] }
      });
      return;
    }
    const perPage = 5;
    const totalPages = Math.ceil(logs.length / perPage);
    const currentPage = Math.min(Math.max(page, 0), totalPages - 1);
    const pageLogs = logs.slice(currentPage * perPage, (currentPage + 1) * perPage);

    let text = `✦•┈๑⋅⋯ ⋯⋅๑┈•✦\n*Log Aktivitas Sistem* (Total: ${logs.length} | Halaman ${currentPage + 1}/${totalPages}):\n────୨ৎ────\n\n`;
    text += pageLogs.map((a) => `╰┈➤ Waktu: ${new Date(a.timestamp).toLocaleString('id-ID')}\n   [${a.type}] ${a.description} (oleh: ${a.actor || 'System'})`).join('\n\n');

    const navButtons = [];
    if (currentPage > 0) navButtons.push({ text: '🢁 Prev', callback_data: `admin_logs|${currentPage - 1}` });
    navButtons.push({ text: `Page ${currentPage + 1}/${totalPages}`, callback_data: 'noop' });
    if (currentPage < totalPages - 1) navButtons.push({ text: 'Next 🡻', callback_data: `admin_logs|${currentPage + 1}` });

    const rows = [];
    if (navButtons.length > 1) rows.push(navButtons);
    rows.push([{ text: '🢁 Kembali ke Panel Admin', callback_data: 'admin_menu' }]);

    await safeEditMessage(bot, chatId, messageId, text, {
      parse_mode: 'Markdown',
      reply_markup: { inline_keyboard: rows }
    });
    return;
  }

  if (data.startsWith('admin_users')) {
    await bot.answerCallbackQuery(query.id);
    const parts = data.split('|');
    const page = parseInt(parts[1] || '0', 10);
    const users = db.getAllUsers();
    if (users.length === 0) {
      await safeEditMessage(bot, chatId, messageId, '*Belum ada data pengguna terdaftar.*', {
        parse_mode: 'Markdown',
        reply_markup: { inline_keyboard: [[{ text: '🢁 Kembali ke Panel Admin', callback_data: 'admin_menu' }]] }
      });
      return;
    }
    const perPage = 5;
    const totalPages = Math.ceil(users.length / perPage);
    const currentPage = Math.min(Math.max(page, 0), totalPages - 1);
    const pageUsers = users.slice(currentPage * perPage, (currentPage + 1) * perPage);

    let text = `✦•┈๑⋅⋯ ⋯⋅๑┈•✦\n*Daftar Pengguna Terdaftar* (Total: ${users.length} | Halaman ${currentPage + 1}/${totalPages}):\n────୨ৎ────\n\n`;
    text += pageUsers.map((u, i) => `${currentPage * perPage + i + 1}. *${u.firstName || 'User'}* (${u.username ? '@' + u.username : 'ID: ' + u.id})\n   ╰┈➤ Total Reservasi: ${u.totalReservations || 0} | Terakhir: ${new Date(u.lastSeen).toLocaleDateString('id-ID')}`).join('\n\n');

    const navButtons = [];
    if (currentPage > 0) navButtons.push({ text: '🢁 Prev', callback_data: `admin_users|${currentPage - 1}` });
    navButtons.push({ text: `Page ${currentPage + 1}/${totalPages}`, callback_data: 'noop' });
    if (currentPage < totalPages - 1) navButtons.push({ text: 'Next 🡻', callback_data: `admin_users|${currentPage + 1}` });

    const rows = [];
    if (navButtons.length > 1) rows.push(navButtons);
    rows.push([{ text: '🢁 Kembali ke Panel Admin', callback_data: 'admin_menu' }]);

    await safeEditMessage(bot, chatId, messageId, text, {
      parse_mode: 'Markdown',
      reply_markup: { inline_keyboard: rows }
    });
    return;
  }

  if (data === 'admin_delete') {
    await bot.answerCallbackQuery(query.id);
    const list = db.getReservations();
    if (list.length === 0) {
      await safeEditMessage(bot, chatId, messageId, '*Tidak ada reservasi untuk dihapus.*', {
        parse_mode: 'Markdown',
        reply_markup: { inline_keyboard: [[{ text: '🢁 Kembali', callback_data: 'admin_menu' }]] }
      });
      return;
    }
    const buttons = list.map((r) => [
      { text: `▶︎ Hapus ${r.id} (${r.name})`, callback_data: `admin_delconfirm_${r.id}` }
    ]);
    buttons.push([{ text: '🢁 Kembali', callback_data: 'admin_menu' }]);
    await safeEditMessage(bot, chatId, messageId, '🡻 *Pilih reservasi yang ingin dihapus permanen oleh Admin:*', {
      parse_mode: 'Markdown',
      reply_markup: { inline_keyboard: buttons }
    });
    return;
  }

  if (data.startsWith('admin_delconfirm_')) {
    const id = data.replace('admin_delconfirm_', '');
    const deleted = db.deleteReservation(id);
    if (deleted) {
      db.logActivity({
        type: 'HAPUS_RESERVASI',
        reservationId: id,
        actor: query.from.username,
        description: `Reservasi ${id} dihapus permanen oleh Admin.`
      });
      await bot.answerCallbackQuery(query.id, { text: `Reservasi ${id} dihapus!` });
      await safeEditMessage(bot, chatId, messageId, `°˖➴ Reservasi *${id}* (${deleted.name}) telah dihapus permanen.`, {
        parse_mode: 'Markdown',
        reply_markup: { inline_keyboard: [[{ text: '🢁 Kembali ke Panel Admin', callback_data: 'admin_menu' }]] }
      });
    }
    return;
  }
}

async function finalizeEditField(bot, db, chatId, session) {
  const resId = session.reservationId;
  const updated = db.updateReservation(resId, session.data);
  resetSession(chatId);

  if (updated) {
    db.logActivity({
      type: 'UBAH_JADWAL',
      reservationId: resId,
      userId: updated.userId,
      actor: updated.username,
      description: `Detail reservasi ${resId} diperbarui.`
    });
    await safeSendMessage(bot, chatId, `°˖➴ Reservasi *${resId}* berhasil diperbarui!\n\n${formatReservation(updated, { detailed: true, settings: db.getSettings() })}`, {
      parse_mode: 'Markdown',
      reply_markup: { inline_keyboard: [backToMenuRow()] }
    });
  }
}

function getOwnerChatId() {
  return ownerChatId;
}

module.exports = {
  sessions,
  handleTextMessage,
  handleCallbackQuery,
  sendMainMenu,
  getOwnerChatId
};
