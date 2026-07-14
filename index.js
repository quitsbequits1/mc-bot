const mineflayer = require('mineflayer');
const { pathfinder } = require('mineflayer-pathfinder');
// HATA BURADA DÜZELTİLDİ: Kütüphanenin doğru çağrılma şekli
const { plugin: pvp } = require('mineflayer-pvp'); 
// Yeni eklenen otomatik yemek eklentisi
const autoeat = require('mineflayer-auto-eat').plugin;
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

// Eklentileri Yükleme (Sırası Önemlidir)
mcBot.loadPlugin(pathfinder);
mcBot.loadPlugin(pvp);
mcBot.loadPlugin(autoeat);

// --- 4. OTOMATİK YEMEK AYARLARI ---
mcBot.once('spawn', () => {
    // Bot doğduğunda yemek yeme sistemini yapılandırır
    mcBot.autoEat.options = {
        priority: 'foodPoints', // En çok doyuranı önce yer
        startAt: 14,            // Açlık barı 14'e (7 but) düşünce yemeye başlar
        bannedFood: []          // Çürük et, zehirli patates vb. yedirmek istemezsen isimlerini buraya yazabilirsin
    };
});

// --- 5. GELİŞMİŞ PVP MANTIĞI (2v1 Desteği) ---
mcBot.on('entityHurt', (entity) => {
    if (entity === mcBot.entity) { // Hasar alan bot ise
        // Sahibine asla vurmaz, etrafındaki en yakın düşmana döner
        const enYakinDusman = mcBot.nearestEntity(e => e.type === 'player' && e.username !== sahibinOyunAdi);
        if (enYakinDusman) {
            mcBot.pvp.attack(enYakinDusman);
        }
    }
});

// --- 6. TELEGRAM KOMUTLARI ---

// Belirli bir kişiye saldırmak için (Örn: /saldir Steve)
bot.command('saldir', (ctx) => {
  const argumanlar = ctx.message.text.split(' ');
  if (argumanlar.length > 1) {
    const hedefAdi = argumanlar[1];
    const hedef = mcBot.players[hedefAdi]?.entity;
    
    if (hedef) {
        mcBot.pvp.attack(hedef);
        ctx.reply(`Hedef kilitlendi: ${hedefAdi}. Saldırı başlatıldı!`);
    } else {
        ctx.reply("Oyuncu bulunamadı veya bota çok uzak.");
    }
  } else {
    ctx.reply("Kullanım: /saldir <oyuncu_adi>");
  }
});

// Etraftaki en yakın kişiye direkt dalmak için (Örn: /pvp)
bot.command('pvp', (ctx) => {
    const enYakinDusman = mcBot.nearestEntity(e => e.type === 'player' && e.username !== sahibinOyunAdi);
    if (enYakinDusman) {
        mcBot.pvp.attack(enYakinDusman);
        ctx.reply(`Radardaki en yakın hedefe dalıyorum: ${enYakinDusman.username} ⚔️`);
    } else {
        ctx.reply("Etrafta saldırılacak kimse yok, herkes güvende.");
    }
});

// Botu durdurmak ve sakinleştirmek için (Örn: /yeter)
bot.command('yeter', (ctx) => {
    mcBot.pvp.stop();
    ctx.reply("Saldırı modundan çıkıldı. Bot beklemeye geçti. 🛑");
});

// Mevcut durum kontrolü
bot.command('durum', (ctx) => {
    ctx.reply(`Sağlık: ${Math.round(mcBot.health)}/20 | Açlık: ${Math.round(mcBot.food)}/20`);
});

bot.launch();
