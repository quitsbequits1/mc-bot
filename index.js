const mineflayer = require('mineflayer');
const { pathfinder } = require('mineflayer-pathfinder');
const { pvp } = require('mineflayer-pvp');
const { Telegraf } = require('telegraf');
const express = require('express');

// --- 1. RENDER UYKU MODU ENGELLEYİCİ ---
const app = express();
app.get('/', (req, res) => res.send('MC Bot Aktif ve Çalışıyor!'));
app.listen(process.env.PORT || 3000);

// --- 2. TELEGRAM BOT AYARLARI ---
const bot = new Telegraf(process.env.TELEGRAM_TOKEN);
const sahibinOyunAdi = process.env.OWNER_MC_NAME; // Botun sana vurmaması için

// --- 3. MİNECRAFT BOT BAĞLANTISI ---
const mcBot = mineflayer.createBot({
  host: process.env.MC_HOST,
  port: parseInt(process.env.MC_PORT) || 25565,
  username: process.env.MC_USER
});

mcBot.loadPlugin(pathfinder);
mcBot.loadPlugin(pvp);

// --- 4. GELİŞMİŞ PVP MANTIĞI (2v1 Desteği) ---
// Bot hasar aldığında anında etrafındaki en yakın düşmana döner (Sana vurmaz)
mcBot.on('entityHurt', (entity) => {
    if (entity === mcBot.entity) { // Hasar alan bot ise
        const enYakinDusman = mcBot.nearestEntity(e => e.type === 'player' && e.username !== sahibinOyunAdi);
        if (enYakinDusman) {
            mcBot.pvp.attack(enYakinDusman);
        }
    }
});

// --- 5. TELEGRAM KOMUTLARI ---
bot.start((ctx) => ctx.reply("Bot komutları:\n/saldir <oyuncu_adi>\n/dur\n/durum"));

bot.command('saldir', (ctx) => {
  const argumanlar = ctx.message.text.split(' ');
  if (argumanlar.length > 1) {
    const hedefAdi = argumanlar[1];
    const hedef = mcBot.players[hedefAdi]?.entity;
    
    if (hedef) {
        mcBot.pvp.attack(hedef);
        ctx.reply(`Hedef kilitlendi: ${hedefAdi}`);
    } else {
        ctx.reply("Oyuncu bulunamadı veya bota çok uzak.");
    }
  } else {
    ctx.reply("Kullanım: /saldir <oyuncu_adi>");
  }
});

bot.command('dur', (ctx) => {
    mcBot.pvp.stop();
    ctx.reply("Saldırı durduruldu, bot bekliyor.");
});

bot.command('durum', (ctx) => {
    ctx.reply(`Sağlık: ${Math.round(mcBot.health)} | Açlık: ${Math.round(mcBot.food)}`);
});

bot.launch();
