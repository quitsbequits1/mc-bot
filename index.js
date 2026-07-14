const mineflayer = require('mineflayer');
const express = require('express');
const { pathfinder, Movements, goals } = require('mineflayer-pathfinder');
const pvp = require('mineflayer-pvp').plugin;
const armorManager = require('mineflayer-armor-manager');
const autoeat = require('mineflayer-auto-eat').plugin;

// ==========================================
// 1. RENDER İÇİN WEB SUNUCUSU (7/24 AÇIK TUTAR)
// ==========================================
const app = express();
const port = process.env.PORT || 3000;

app.get('/', (req, res) => {
    res.send('Bot Aktif ve Minecraft Sunucusunda Çalışıyor!');
});

app.listen(port, () => {
    console.log(`Render Web Servisi ${port} portunda dinleniyor. Servis kapanmayacak.`);
});

// ==========================================
// 2. BOT VE SUNUCU AYARLARI
// ==========================================
const botConfig = {
    host: 'mamitusta67.aternos.me',
    port: 23479,
    version: '1.20.4',
    username: 'botkazim'
};

// ==========================================
// 3. YAPAY ZEKA VE HİLE SİSTEMİ
// ==========================================
function createBot() {
    console.log('Sunucuya bağlanılıyor...');
    const bot = mineflayer.createBot(botConfig);

    // Eklentileri bota dahil ediyoruz
    bot.loadPlugin(pathfinder);
    bot.loadPlugin(pvp);
    bot.loadPlugin(armorManager);
    bot.loadPlugin(autoeat);

    bot.once('spawn', () => {
        console.log('Bot başarıyla oyuna girdi!');
        
        // Hareket yeteneklerini tanımla (Zıplama, yüzme, koşma)
        const mcData = require('minecraft-data')(bot.version);
        const defaultMove = new Movements(bot, mcData);
        defaultMove.allowSprinting = true; // Sürekli depar atar
        bot.pathfinder.setMovements(defaultMove);

        // --- KILLAURA HİLESİ (Saniyede 4 Vuruş) ---
        // Yaklaşan her oyuncu veya yaratığa kafasını anında çevirip vurur. Anti-cheat 0 olduğu için seri tıklar.
        setInterval(() => {
            const entity = bot.nearestEntity(e => 
                (e.type === 'mob' || e.type === 'player') && 
                e.position.distanceTo(bot.entity.position) < 4.5 && // 4.5 blok içindeki her şeye vur
                e.username !== bot.username // Kendine vurma
            );

            if (entity) {
                bot.lookAt(entity.position.offset(0, 1.5, 0), true); // Anında hedefe kilitlen
                bot.attack(entity); // Acımasızca vur
            }
        }, 250); // 250 milisaniyede bir (Seri tıklama)
    });

    // --- OTOMATİK YEMEK YEME (Hayatta Kalma) ---
    bot.on('health', () => {
        if (bot.food === 20) bot.autoEat.disable();
        else bot.autoEat.enable(); // Canı veya açlığı azalınca envanterdeki ilk yemeği anında yer
    });

    // --- SOHBET KOMUTLARI (Kontrol Sende) ---
    bot.on('chat', (username, message) => {
        if (username === bot.username) return;

        // Yanına çağırmak için sohbete "gel" yaz
        if (message === 'gel') {
            const target = bot.players[username]?.entity;
            if (target) {
                bot.chat('Geliyorum usta!');
                bot.pathfinder.setGoal(new goals.GoalFollow(target, 1), true);
            }
        }

        // Durdurmak için "dur" yaz
        if (message === 'dur') {
            bot.pathfinder.setGoal(null);
            bot.chat('Durakladım.');
        }
    });

    // --- OTOMATİK YENİDEN BAĞLANMA (Asla Düşmez) ---
    bot.on('end', (reason) => {
        console.log(`Bağlantı koptu: ${reason}. 10 saniye içinde yeniden bağlanılıyor...`);
        setTimeout(createBot, 10000); // Sunucu atarsa veya kapanırsa 10 sn sonra zorla geri girer.
    });

    bot.on('error', (err) => {
        console.log('Minecraft Hatası:', err);
    });
}

// Botu başlat
createBot();
