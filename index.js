const TelegramBot = require('node-telegram-bot-api');
const cron = require('node-cron');
const { DatabaseManager } = require('./db');
const { handleTextMessage, handleCallbackQuery, getOwnerChatId } = require('./handlers');
const { parseDateTime, formatDateShort, safeSendMessage } = require('./utils');

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '8438650784:AAFhP2frfQU3NRlLL4zr4oj53mhNw2Hn3u8';

const db = new DatabaseManager();
const bot = new TelegramBot(TELEGRAM_BOT_TOKEN, { polling: true });

bot.on('message', (msg) => {
  handleTextMessage(bot, db, msg).catch((err) => console.error(err));
});

bot.on('callback_query', (query) => {
  handleCallbackQuery(bot, db, query).catch((err) => console.error(err));
});

cron.schedule('0 * * * *', async () => {
  try {
    const reservations = db.getReservations();
    const now = new Date();
    const tomorrow = new Date(now.getTime() + 86400000);
    const tomorrowShort = formatDateShort(tomorrow);
    const settings = db.getSettings();

    for (const r of reservations) {
      if (r.status === 'Dikonfirmasi' && !r.reminderSentH1 && r.date === tomorrowShort) {
        const sent = await safeSendMessage(
          bot,
          r.userId,
          `✦•┈๑⋅⋯ ⋯⋅๑┈•✦\n*PENGINGAT RESERVASI H-1*\n────୨ৎ────\n\nReservasi *${r.id}* Anda di *${settings.shopName}* dijadwalkan besok tanggal *${r.date}* pukul *${r.time}* (${r.area || 'Meja Restoran'}).\n\n╰┈➤ Alamat: ${settings.shopAddress}\nSampai jumpa besok!`,
          { parse_mode: 'Markdown' }
        );
        if (sent) {
          db.updateReservation(r.id, { reminderSentH1: true });
        }
      }
    }
  } catch (err) {
    console.error(err);
  }
});

cron.schedule('*/2 * * * *', async () => {
  try {
    const reservations = db.getReservations();
    const nowTime = Date.now();
    const adminChatId = getOwnerChatId() || process.env.ADMIN_CHAT_ID;

    for (const r of reservations) {
      if (r.status === 'Dikonfirmasi' && r.checkInTime && !r.checkinAlertSent) {
        const checkInMs = new Date(r.checkInTime).getTime();
        const durationMs = (r.durationHours || 2) * 3600000;
        const expiryMs = checkInMs + durationMs;
        const alertTriggerMs = expiryMs - 15 * 60000;

        if (nowTime >= alertTriggerMs) {
          if (adminChatId) {
            await safeSendMessage(
              bot,
              adminChatId,
              `✦•┈๑⋅⋯ ⋯⋅๑┈•✦\n*PENGINGAT SISA WAKTU MEJA (15 MENIT LAGI)*\n────୨ৎ────\n\n` +
              `╰┈➤ Meja: *${r.id}* (${r.name} - ${r.tableName || r.area || 'Meja'})\n` +
              `╰┈➤ Durasi: *${r.durationHours || 2} Jam*\n` +
              `╰┈➤ Check-in: *${new Date(r.checkInTime).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}*\n\n` +
              `╰┈➤ Waktu pemakaian meja akan berakhir dalam 15 menit. Silakan persiapkan tagihan atau konfirmasi perpanjangan ke pelanggan.`,
              { parse_mode: 'Markdown' }
            );
          }
          db.updateReservation(r.id, { checkinAlertSent: true });
        }
      }
    }
  } catch (err) {
    console.error(err);
  }
});

cron.schedule('*/5 * * * *', async () => {
  try {
    const reservations = db.getReservations();
    const nowTime = Date.now();
    const settings = db.getSettings();

    for (const r of reservations) {
      if (r.status === 'Dikonfirmasi' && !r.completionNotified) {
        const startMs = parseDateTime(r.date, r.time).getTime();
        const endMs = startMs + (r.durationHours || 2) * 3600000;

        if (nowTime >= endMs) {
          const sent = await safeSendMessage(
            bot,
            r.userId,
            `✦•┈๑⋅⋯ ⋯⋅๑┈•✦\n*Terima kasih telah mengunjungi ${settings.shopName}!*\n────୨ৎ────\n\nReservasi *${r.id}* Anda telah selesai. Kami sangat menghargai masukan Anda.\n🡻 Silakan tekan tombol di bawah untuk memberikan Rating / Feedback.`,
            {
              parse_mode: 'Markdown',
              reply_markup: {
                inline_keyboard: [[{ text: '▶︎ Beri Rating & Feedback', callback_data: `ratepick_${r.id}` }]]
              }
            }
          );
          if (sent) {
            db.updateReservation(r.id, { completionNotified: true });
          }
        }
      }
    }
  } catch (err) {
    console.error(err);
  }
});

bot.on('polling_error', (err) => {
  console.error(err.message);
});

process.on('uncaughtException', (err) => {
  console.error(err);
});

console.log('Bot Reservasi Restoran Telegram Berhasil Berjalan...');
