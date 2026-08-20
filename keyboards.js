const { getAvailableSlots, formatDateShort } = require('./utils');

function makeProgressBar(step, total = 6) {
  const filled = Math.min(Math.max(step, 0), total);
  const percent = `[${'#'.repeat(filled)}${'-'.repeat(total - filled)}] Langkah ${step}/${total}`;
  return percent;
}

function persistentKeyboard() {
  return { reply_markup: { keyboard: [['▶︎ Main Menu']], resize_keyboard: true } };
}

function mainMenuInline(userRoleOrOwner, settings = null) {
  const rows = [
    [{ text: '▶︎ Buat Reservasi Baru', callback_data: 'menu_new' }],
    [{ text: '🛒𖦹˖°. Pre-Order Makanan/Minuman', callback_data: 'user_menu_browse' }],
    [
      { text: '▶︎ Reservasi Saya', callback_data: 'menu_mine' },
      { text: '▶︎ Ulangi Reservasi', callback_data: 'menu_repeat' }
    ],
    [
      { text: '▶︎ Ubah Detail Reservasi', callback_data: 'menu_edit' },
      { text: '▶︎ Batalkan Reservasi', callback_data: 'menu_cancel' }
    ],
    [
      { text: '▶︎ Rating / Feedback', callback_data: 'menu_rating' },
      { text: '▶︎ Riwayat Saya', callback_data: 'menu_history' }
    ],
    [{ text: '▶︎ Bantuan & Info Toko', callback_data: 'menu_help' }]
  ];

  const role = typeof userRoleOrOwner === 'string' ? userRoleOrOwner.toLowerCase() : (userRoleOrOwner ? 'owner' : 'user');

  if (role === 'owner' || role === 'admin') {
    rows.push([{ text: '▶︎ Panel Admin', callback_data: 'admin_menu' }]);
  } else if (role === 'kasir') {
    rows.push([{ text: '▶︎ Panel Kasir', callback_data: 'kasir_menu' }]);
  }

  return { reply_markup: { inline_keyboard: rows } };
}

function cancelProcessRow() {
  return [{ text: '▶︎ Batalkan Proses', callback_data: 'proc_cancel' }];
}

function backToMenuRow() {
  return [{ text: '🢁 Kembali ke Menu Utama', callback_data: 'menu_main' }];
}

function dateChoiceKeyboard() {
  const today = new Date();
  const tomorrow = new Date();
  tomorrow.setDate(today.getDate() + 1);
  const dayAfter = new Date();
  dayAfter.setDate(today.getDate() + 2);

  return {
    reply_markup: {
      inline_keyboard: [
        [{ text: `°˖➴ Hari Ini (${formatDateShort(today)})`, callback_data: 'date_today' }],
        [{ text: `°˖➴ Besok (${formatDateShort(tomorrow)})`, callback_data: 'date_tomorrow' }],
        [{ text: `°˖➴ Lusa (${formatDateShort(dayAfter)})`, callback_data: 'date_daylater' }],
        [{ text: '°˖➴ Ketik Manual (DD-MM-YYYY)', callback_data: 'date_custom' }],
        cancelProcessRow()
      ]
    }
  };
}

function timeChoiceKeyboard(db, dateStr, areaId = 'Bebas') {
  const slots = ['11:00', '12:00', '13:00', '18:00', '19:00', '20:00'];
  const rows = [];

  for (let i = 0; i < slots.length; i += 2) {
    const pair = slots.slice(i, i + 2).map((t) => {
      let slotsInfo = '';
      if (db && dateStr) {
        const avail = getAvailableSlots(db, areaId, dateStr, t);
        slotsInfo = ` (sisa ${avail})`;
      }
      return { text: `▶︎ ${t}${slotsInfo}`, callback_data: `time_${t}` };
    });
    rows.push(pair);
  }

  rows.push([{ text: '▶︎ Ketik Manual (HH:mm)', callback_data: 'time_custom' }]);
  rows.push(cancelProcessRow());
  return { reply_markup: { inline_keyboard: rows } };
}

function areaChoiceKeyboard(db, dateStr = null) {
  const areas = db ? db.getAreas() : [
    { id: 'Indoor', name: 'Indoor', capacity: 20 },
    { id: 'Outdoor', name: 'Outdoor', capacity: 15 },
    { id: 'VIP', name: 'VIP Room', capacity: 10 }
  ];

  const rows = areas.map((a) => {
    let slotsInfo = '';
    if (dateStr) {
      const avail = getAvailableSlots(db, a.id, dateStr, '12:00');
      slotsInfo = ` (Sisa ~${avail})`;
    }
    return [{ text: `▶︎ ${a.name}${slotsInfo}`, callback_data: `area_${a.id}` }];
  });

  rows.push([{ text: '▶︎ Tanpa Preferensi Area', callback_data: 'area_Bebas' }]);
  rows.push(cancelProcessRow());

  return { reply_markup: { inline_keyboard: rows } };
}

function peopleChoiceKeyboard() {
  const rows = [];
  for (let i = 1; i <= 8; i += 4) {
    const row = [];
    for (let n = i; n < i + 4 && n <= 8; n++) {
      row.push({ text: `▶︎ ${n} Orang`, callback_data: `people_${n}` });
    }
    rows.push(row);
  }
  rows.push([{ text: '▶︎ Lainnya (>8 Orang)', callback_data: 'people_custom' }]);
  rows.push(cancelProcessRow());
  return { reply_markup: { inline_keyboard: rows } };
}

function durationChoiceKeyboard() {
  return {
    reply_markup: {
      inline_keyboard: [
        [
          { text: '▶︎ 1 Jam', callback_data: 'duration_1' },
          { text: '▶︎ 2 Jam (Standar)', callback_data: 'duration_2' }
        ],
        [
          { text: '▶︎ 3 Jam', callback_data: 'duration_3' },
          { text: '▶︎ 4 Jam', callback_data: 'duration_4' }
        ],
        cancelProcessRow()
      ]
    }
  };
}

function recurringChoiceKeyboard() {
  return {
    reply_markup: {
      inline_keyboard: [
        [{ text: '▶︎ Sekali Saja (Reservasi Biasa)', callback_data: 'recurring_none' }],
        [{ text: '▶︎ Mingguan (Setiap Hari yang Sama)', callback_data: 'recurring_weekly' }],
        cancelProcessRow()
      ]
    }
  };
}

function noteChoiceKeyboard() {
  return {
    reply_markup: {
      inline_keyboard: [
        [{ text: '▶︎ Tidak Ada Catatan', callback_data: 'note_skip' }],
        [{ text: '▶︎ Tulis Catatan Khusus', callback_data: 'note_custom' }],
        cancelProcessRow()
      ]
    }
  };
}

function confirmKeyboard() {
  return {
    reply_markup: {
      inline_keyboard: [
        [{ text: '▶︎ Konfirmasi & Kirim Reservasi', callback_data: 'confirm_save' }],
        [{ text: '▶︎ Ulangi Pengisian dari Awal', callback_data: 'confirm_restart' }],
        cancelProcessRow()
      ]
    }
  };
}

function adminMenuInline(userRoleOrOwner = 'admin') {
  const isOwnerUser = typeof userRoleOrOwner === 'string' ? userRoleOrOwner.toLowerCase() === 'owner' : Boolean(userRoleOrOwner);
  const rows = [
    [
      { text: '🛒𖦹˖°. Kelola Menu Restoran', callback_data: 'admin_menu_manage' },
      { text: '🪑 Kelola Meja Restoran', callback_data: 'admin_tables_manage' }
    ],
    [
      { text: '▶︎ Ubah Status Reservasi', callback_data: 'admin_manage' },
      { text: '▶︎ Tentukan Meja User', callback_data: 'admin_assigntable_list' }
    ],
    [
      { text: '▶︎ Statistik Visual', callback_data: 'admin_stats' },
      { text: '▶︎ Lihat Semua Reservasi', callback_data: 'admin_list' }
    ],
    [
      { text: '▶︎ Hari Libur (Blockouts)', callback_data: 'admin_blockouts' },
      { text: '▶︎ Broadcast Ke User', callback_data: 'admin_broadcast' }
    ],
    [
      { text: '▶︎ Setting Toko & Bot', callback_data: 'admin_settings' },
      { text: '▶︎ Backup / Restore DB', callback_data: 'admin_backuprestore' }
    ],
    [
      { text: '▶︎ Ekspor CSV', callback_data: 'admin_csv' },
      { text: '▶︎ Log Aktivitas', callback_data: 'admin_logs|0' }
    ],
    [
      { text: '▶︎ Data Pengguna', callback_data: 'admin_users|0' },
      { text: '▶︎ Hapus Reservasi', callback_data: 'admin_delete' }
    ]
  ];

  if (isOwnerUser) {
    rows.push([{ text: '👥 Kelola Role User (Admin & Kasir)', callback_data: 'admin_roles' }]);
  }

  rows.push([{ text: '🢁 Menu Utama', callback_data: 'menu_main' }]);
  return { reply_markup: { inline_keyboard: rows } };
}

function kasirMenuInline() {
  return {
    reply_markup: {
      inline_keyboard: [
        [
          { text: '▶︎ Ubah Status Reservasi', callback_data: 'admin_manage' },
          { text: '🪑 Tentukan Meja User', callback_data: 'admin_assigntable_list' }
        ],
        [
          { text: '📋 Lihat Semua Reservasi', callback_data: 'admin_list' },
          { text: '📊 Statistik Visual', callback_data: 'admin_stats' }
        ],
        [
          { text: '🪑 Lihat Status Meja Restoran', callback_data: 'kasir_tables_view' }
        ],
        [{ text: '🢁 Menu Utama', callback_data: 'menu_main' }]
      ]
    }
  };
}

function adminRolesKeyboard(db) {
  const admins = db.getUsersByRole('admin');
  const kasirs = db.getUsersByRole('kasir');
  const rows = [];

  rows.push([{ text: '➕ Tambah / Ubah Role User Baru', callback_data: 'admin_role_add' }]);

  if (admins.length > 0) {
    admins.forEach((u) => {
      const label = `⭐ Admin: ${u.username ? '@' + u.username : u.firstName || u.id}`;
      rows.push([{ text: label, callback_data: `admin_role_pick_${u.id}` }]);
    });
  }

  if (kasirs.length > 0) {
    kasirs.forEach((u) => {
      const label = `💵 Kasir: ${u.username ? '@' + u.username : u.firstName || u.id}`;
      rows.push([{ text: label, callback_data: `admin_role_pick_${u.id}` }]);
    });
  }

  rows.push([{ text: '🢁 Panel Owner', callback_data: 'admin_menu' }]);
  return { reply_markup: { inline_keyboard: rows } };
}

function roleSelectionKeyboard(userKey) {
  return {
    reply_markup: {
      inline_keyboard: [
        [
          { text: '⭐ Set Role ADMIN', callback_data: `role_set_${userKey}_admin` },
          { text: '💵 Set Role KASIR', callback_data: `role_set_${userKey}_kasir` }
        ],
        [
          { text: '👤 Hapus Role (Set User Normal)', callback_data: `role_set_${userKey}_user` }
        ],
        [{ text: '🢁 Kelola Role User', callback_data: 'admin_roles' }]
      ]
    }
  };
}

function adminBlockedDatesKeyboard(blockedDates = []) {
  const rows = [];
  blockedDates.forEach((b) => {
    rows.push([{ text: `▶︎ Hapus ${b.date} (${b.reason})`, callback_data: `delblock_${b.id}` }]);
  });
  rows.push([{ text: '▶︎ Tambah Hari Libur Baru', callback_data: 'addblock_start' }]);
  rows.push([{ text: '🢁 Panel Admin', callback_data: 'admin_menu' }]);
  return { reply_markup: { inline_keyboard: rows } };
}

function adminReservationDetailActionKeyboard(reservationId) {
  return {
    reply_markup: {
      inline_keyboard: [
        [
          { text: '▶︎ Catatan Admin', callback_data: `admnote_${reservationId}` },
          { text: '▶︎ Check-in Tamu', callback_data: `admcheckin_${reservationId}` }
        ],
        [
          { text: '▶︎ Lihat Timeline', callback_data: `admtimeline_${reservationId}` }
        ],
        [{ text: '🢁 Kembali ke Status', callback_data: 'admin_manage' }]
      ]
    }
  };
}

function adminSettingsKeyboard() {
  return {
    reply_markup: {
      inline_keyboard: [
        [{ text: '▶︎ Ubah Nama Bot', callback_data: 'set_botName' }],
        [{ text: '▶︎ Ubah Deskripsi Bot', callback_data: 'set_description' }],
        [{ text: '▶︎ Ubah Nama Toko', callback_data: 'set_shopName' }],
        [{ text: '▶︎ Ubah Alamat Toko', callback_data: 'set_shopAddress' }],
        [{ text: '▶︎ Ubah Logo Toko (URL/Gambar)', callback_data: 'set_logo' }],
        [{ text: '🢁 Panel Admin', callback_data: 'admin_menu' }]
      ]
    }
  };
}

function editReservationFieldsKeyboard(reservationId) {
  return {
    reply_markup: {
      inline_keyboard: [
        [{ text: '▶︎ Ubah Tanggal & Jam', callback_data: `editfield_date_${reservationId}` }],
        [{ text: '▶︎ Ubah Jumlah Orang', callback_data: `editfield_people_${reservationId}` }],
        [{ text: '▶︎ Ubah Area / Meja', callback_data: `editfield_area_${reservationId}` }],
        [{ text: '▶︎ Ubah Catatan', callback_data: `editfield_note_${reservationId}` }],
        [{ text: '🢁 Batal', callback_data: 'menu_main' }]
      ]
    }
  };
}

function ratingKeyboard(reservationId) {
  return {
    reply_markup: {
      inline_keyboard: [
        [
          { text: '1 Star', callback_data: `rate_${reservationId}_1` },
          { text: '2 Stars', callback_data: `rate_${reservationId}_2` },
          { text: '3 Stars', callback_data: `rate_${reservationId}_3` },
          { text: '4 Stars', callback_data: `rate_${reservationId}_4` },
          { text: '5 Stars', callback_data: `rate_${reservationId}_5` }
        ],
        cancelProcessRow()
      ]
    }
  };
}

function userMenuCategoriesKeyboard(cartItemCount = 0, cartTotal = 0) {
  const rows = [
    [
      { text: '▶︎ Makanan', callback_data: 'user_menu_cat_Makanan' },
      { text: '▶︎ Minuman', callback_data: 'user_menu_cat_Minuman' }
    ]
  ];
  if (cartItemCount > 0) {
    rows.push([{ text: `🛒𖦹˖°. Lihat Keranjang (${cartItemCount} item - Rp ${cartTotal.toLocaleString('id-ID')})`, callback_data: 'user_cart_view' }]);
  }
  rows.push(backToMenuRow());
  return { reply_markup: { inline_keyboard: rows } };
}

function userMenuItemCardKeyboard(itemId, currentQty = 0) {
  const rows = [
    [{ text: `▶︎ Tambah Ke Pesanan ${currentQty > 0 ? `(${currentQty}x)` : ''}`, callback_data: `cart_add_${itemId}` }],
    [
      { text: '🛒𖦹˖°. Keranjang Saya', callback_data: 'user_cart_view' },
      { text: '🢁 Pilih Kategori Lain', callback_data: 'user_menu_browse' }
    ]
  ];
  return { reply_markup: { inline_keyboard: rows } };
}

function userCartKeyboard(cartItems = []) {
  const rows = [];
  cartItems.forEach((ci) => {
    rows.push([
      { text: `-1`, callback_data: `cart_sub_${ci.itemId}` },
      { text: `${ci.name} (${ci.qty}x)`, callback_data: 'noop' },
      { text: `+1`, callback_data: `cart_add_${ci.itemId}` },
      { text: `▶︎ Hapus`, callback_data: `cart_del_${ci.itemId}` }
    ]);
  });
  if (cartItems.length > 0) {
    rows.push([{ text: '▶︎ Simpan Pre-Order (Bayar di Kasir)', callback_data: 'cart_checkout' }]);
    rows.push([{ text: '▶︎ Kosongkan Keranjang', callback_data: 'cart_clear' }]);
  }
  rows.push([{ text: '▶︎ Tambah Menu Lain', callback_data: 'user_menu_browse' }]);
  rows.push(backToMenuRow());
  return { reply_markup: { inline_keyboard: rows } };
}

function adminMenuManagementKeyboard() {
  return {
    reply_markup: {
      inline_keyboard: [
        [{ text: '▶︎ Lihat Katalog Menu', callback_data: 'admin_menu_list' }],
        [{ text: '▶︎ Tambah Item Menu Baru', callback_data: 'admin_addmenu_start' }],
        [{ text: '🢁 Panel Admin', callback_data: 'admin_menu' }]
      ]
    }
  };
}

function adminCategoryPickKeyboard() {
  return {
    reply_markup: {
      inline_keyboard: [
        [
          { text: '▶︎ Makanan', callback_data: 'addmenucat_Makanan' },
          { text: '▶︎ Minuman', callback_data: 'addmenucat_Minuman' }
        ],
        cancelProcessRow()
      ]
    }
  };
}

function adminMenuListKeyboard(menuList = []) {
  const rows = [];
  menuList.forEach((m) => {
    rows.push([{ text: `▶︎ ${m.category}: ${m.name} - Rp ${m.price.toLocaleString('id-ID')}`, callback_data: `admin_menu_pick_${m.id}` }]);
  });
  rows.push([{ text: '▶︎ Tambah Menu Baru', callback_data: 'admin_addmenu_start' }]);
  rows.push([{ text: '🢁 Kelola Menu', callback_data: 'admin_menu_manage' }]);
  return { reply_markup: { inline_keyboard: rows } };
}

function adminMenuItemEditOptionsKeyboard(itemId) {
  return {
    reply_markup: {
      inline_keyboard: [
        [
          { text: '▶︎ Edit Nama', callback_data: `editmenu_name_${itemId}` },
          { text: '▶︎ Edit Kategori', callback_data: `editmenu_cat_${itemId}` }
        ],
        [
          { text: '▶︎ Edit Harga', callback_data: `editmenu_price_${itemId}` },
          { text: '▶︎ Edit Deskripsi', callback_data: `editmenu_desc_${itemId}` }
        ],
        [
          { text: '▶︎ Edit Foto', callback_data: `editmenu_img_${itemId}` }
        ],
        [
          { text: '▶︎ Hapus Item Menu', callback_data: `editmenu_del_${itemId}` }
        ],
        [{ text: '🢁 Kelola Menu', callback_data: 'admin_menu_manage' }]
      ]
    }
  };
}

function adminTableManagementKeyboard() {
  return {
    reply_markup: {
      inline_keyboard: [
        [{ text: '🪑 Lihat & Kelola Daftar Meja', callback_data: 'admin_tables_list' }],
        [{ text: '➕ Tambah Meja Baru', callback_data: 'admin_addtable_start' }],
        [{ text: '🢁 Panel Admin', callback_data: 'admin_menu' }]
      ]
    }
  };
}

function adminTablesListKeyboard(tablesList = []) {
  const rows = [];
  tablesList.forEach((t) => {
    rows.push([{ text: `🪑 ${t.id} - ${t.name} (${t.area}, Cap: ${t.capacity})`, callback_data: `admin_table_pick_${t.id}` }]);
  });
  rows.push([{ text: '➕ Tambah Meja Baru', callback_data: 'admin_addtable_start' }]);
  rows.push([{ text: '🢁 Kelola Meja', callback_data: 'admin_tables_manage' }]);
  return { reply_markup: { inline_keyboard: rows } };
}

function adminTableEditOptionsKeyboard(tableId) {
  return {
    reply_markup: {
      inline_keyboard: [
        [
          { text: '✏️ Edit Nama', callback_data: `edittable_name_${tableId}` },
          { text: '🏷️ Edit Area', callback_data: `edittable_area_${tableId}` }
        ],
        [
          { text: '👥 Edit Kapasitas', callback_data: `edittable_cap_${tableId}` }
        ],
        [
          { text: '🗑️ Hapus Meja', callback_data: `edittable_del_${tableId}` }
        ],
        [{ text: '🢁 Daftar Meja', callback_data: 'admin_tables_list' }]
      ]
    }
  };
}

function adminTableAreaPickKeyboard(actionPrefix = 'addtable_area') {
  return {
    reply_markup: {
      inline_keyboard: [
        [
          { text: 'Indoor', callback_data: `${actionPrefix}_Indoor` },
          { text: 'Outdoor', callback_data: `${actionPrefix}_Outdoor` },
          { text: 'VIP Room', callback_data: `${actionPrefix}_VIP` }
        ],
        cancelProcessRow()
      ]
    }
  };
}

module.exports = {
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
  adminTableAreaPickKeyboard,
  kasirMenuInline,
  adminRolesKeyboard,
  roleSelectionKeyboard
};

