const mineflayer = require('mineflayer');
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const { pathfinder, Movements, goals } = require('mineflayer-pathfinder');
const pvp = require('mineflayer-pvp').plugin;
const armorManager = require('mineflayer-armor-manager');
const autoeat = require('mineflayer-auto-eat').plugin;

// ==========================================
// 1. WEB SUNUCUSU (PANEL)
// ==========================================
const app = express();
const server = http.createServer(app);
const io = new Server(server);
const port = process.env.PORT || 3000;

let globalMode = {
    normalPvp: false,
    hackedPvp: false,
    killaura: false,
    targetName: null,
    friends: []
};

// --- WEB ARAYÜZÜ (TEK BOT İÇİN) ---
const WEB_UI = `
<!DOCTYPE html>
<html lang="tr">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Solo Terminatör Paneli</title>
    <style>
        body { font-family: 'Segoe UI', Tahoma, sans-serif; background-color: #0f0f0f; color: #fff; padding: 20px; }
        .container { max-width: 650px; margin: auto; background: #1c1c1c; padding: 20px; border-radius: 12px; box-shadow: 0 0 20px rgba(255,0,0,0.2); }
        h1 { text-align: center; color: #ff3b30; }
        .box { margin-bottom: 20px; padding: 15px; background: #2a2a2a; border-radius: 8px; border-left: 4px solid #555; }
        input[type="text"] { width: 100%; padding: 12px; margin-top: 5px; border-radius: 6px; border: 1px solid #444; background: #222; color: white; font-size: 16px; }
        button { width: 100%; padding: 12px; margin-top: 10px; border: none; border-radius: 6px; cursor: pointer; font-weight: bold; font-size: 16px; }
        .btn-attack { background: #ff3b30; color: white; }
        .btn-stop { background: #ffcc00; color: black; }
        .btn-toggle { background: #34c759; color: white; border-left: 5px solid #248a3d; }
        .btn-toggle.off { background: #444; color: #aaa; border-left: 5px solid #222; }
        .friend-tag { background: #007aff; padding: 5px 10px; border-radius: 15px; font-size: 14px; display: inline-block; margin: 5px 5px 0 0; }
    </style>
</head>
<body>
    <div class="container">
        <h1>🤖 BotKazim Kontrol Paneli 🤖</h1>
        
        <div class="box" style="border-left-color: #ff3b30;">
            <h3>🎯 Hedefe Kilitlen</h3>
            <input type="text" id="targetName" placeholder="Yok edilecek oyuncunun adını yaz...">
            <button class="btn-attack" onclick="attack()">Hedefe Saldır</button>
            <button class="btn-stop" onclick="stopBot()">Saldırıyı Durdur & Kasılmaya Dön</button>
        </div>

        <div class="box" style="border-left-color: #34c759;">
            <h3>⚡ Hile & Savaş Modları</h3>
            <button id="btnNormalPvp" class="btn-toggle off" onclick="toggleMode('normalPvp')">Normal PVP (Taktiksel): KAPALI</button>
            <button id="btnHackedPvp" class="btn-toggle off" onclick="toggleMode('hackedPvp')">Hız & Zıplama Hilesi: KAPALI</button>
            <button id="btnKillaura" class="btn-toggle off" onclick="toggleMode('killaura')">KillAura & Oto Savunma: KAPALI</button>
        </div>

        <div class="box" style="border-left-color: #007aff;">
            <h3>🛡️ Dost Listesi</h3>
            <input type="text" id="friendName" placeholder="Dostun adını yaz...">
            <button class="btn-toggle" style="background: #007aff;" onclick="addFriend()">Dost Ekle</button>
            <div id="friendsContainer"></div>
        </div>
    </div>

    <script src="/socket.io/socket.io.js"></script>
    <script>
        const socket = io();
        let friends = [];

        function attack() { socket.emit('action', { type: 'attack', target: document.getElementById('targetName').value }); }
        function stopBot() { socket.emit('action', { type: 'stop' }); }
        
        function addFriend() {
            const name = document.getElementById('friendName').value;
            if(name && !friends.includes(name)) {
                friends.push(name);
                document.getElementById('friendName').value = '';
                socket.emit('action', { type: 'update_friends', friends: friends });
                document.getElementById('friendsContainer').innerHTML = friends.map(f => \`<span class="friend-tag">\${f}</span>\`).join('');
            }
        }

        function toggleMode(mode) { socket.emit('action', { type: 'toggle', mode: mode }); }

        socket.on('state_update', (state) => {
            const updateBtn = (id, isActive, text) => {
                const btn = document.getElementById(id);
                btn.className = isActive ? 'btn-toggle' : 'btn-toggle off';
                btn.innerText = text + (isActive ? 'AÇIK' : 'KAPALI');
            };
            updateBtn('btnNormalPvp', state.normalPvp, 'Normal PVP (Taktiksel): ');
            updateBtn('btnHackedPvp', state.hackedPvp, 'Hız & Zıplama Hilesi: ');
            updateBtn('btnKillaura', state.killaura, 'KillAura & Oto Savunma: ');
        });
    </script>
</body>
</html>
`;

app.get('/', (req, res) => res.send(WEB_UI));
server.listen(port, () => console.log(`Web Paneli ${port} portunda aktif!`));

// ==========================================
// 2. TEK BOT (BOTKAZIM) SİSTEMİ
// ==========================================
let bot;
let wanderInterval;

function createBot() {
    console.log("Sunucuya bağlanma isteği gönderiliyor...");
    
    bot = mineflayer.createBot({
        host: 'mamitusta67.aternos.me',
        port: 23479,
        version: '1.20.4',
        username: 'botkazim'
    });

    bot.loadPlugin(pathfinder);
    bot.loadPlugin(pvp);
    bot.loadPlugin(armorManager);
    bot.loadPlugin(autoeat);

    let mcData;

    bot.once('spawn', () => {
        console.log("✅ Başarılı! BotKazım sunucuya girdi.");
        mcData = require('minecraft-data')(bot.version);

        bot.on('physicsTick', () => {
            // Hız Hilesi
            if (globalMode.hackedPvp) {
                bot.physics.sprintSpeed = 0.8;
                bot.physics.stepHeight = 1.5;
            } else {
                bot.physics.sprintSpeed = 0.3;
                bot.physics.stepHeight = 0.6;
            }

            // Killaura (Hedef yoksa yakındakilere vurur)
            if (globalMode.killaura && !globalMode.targetName) {
                const entity = bot.nearestEntity(e => 
                    (e.type === 'mob' || e.type === 'player') && 
                    e.position.distanceTo(bot.entity.position) < 4.5 &&
                    e.username !== bot.username &&
                    !globalMode.friends.includes(e.username)
                );

                if (entity && !bot.pvp.target) {
                    bot.pvp.attack(entity);
                }
            }
        });

        // Boşta Gezinme (Kasılma)
        wanderInterval = setInterval(() => {
            if (!globalMode.targetName && !bot.pvp.target) {
                const defaultMove = new Movements(bot, mcData);
                bot.pathfinder.setMovements(defaultMove);
                
                const x = bot.entity.position.x + (Math.random() * 20 - 10);
                const z = bot.entity.position.z + (Math.random() * 20 - 10);
                bot.pathfinder.setGoal(new goals.GoalNear(x, bot.entity.position.y, z, 1), true);
            }
        }, 8000);
    });

    // Otomatik Eşya Kuşanma
    bot.on('playerCollect', (collector) => {
        if (collector !== bot.entity) return;
        setTimeout(() => {
            bot.armorManager.equipAll();
            const bestWeapon = bot.inventory.items().filter(item => item.name.includes('sword') || item.name.includes('axe')).sort((a, b) => b.type - a.type)[0];
            if (bestWeapon) bot.equip(bestWeapon, 'hand');
        }, 500);
    });

    bot.on('health', () => {
        if (bot.food === 20) bot.autoEat.disable();
        else bot.autoEat.enable();
    });

    bot.on('entityHurt', (entity, attacker) => {
        if (entity === bot.entity && attacker && globalMode.killaura) {
            if (!globalMode.friends.includes(attacker.username)) {
                bot.pvp.attack(attacker);
            }
        }
    });

    // ==========================================
    // 3. HATA YAKALAMA (ÇÖZÜM İÇİN ÇOK ÖNEMLİ)
    // ==========================================
    bot.on('kicked', (reason) => {
        console.log(`❌ Sunucudan Atıldı! Neden: ${reason}`);
    });

    bot.on('error', (err) => {
        console.log(`❌ Minecraft Bağlantı Hatası: ${err.message}`);
    });

    bot.on('end', (reason) => {
        console.log(`🔌 Bağlantı koptu (${reason}). 10 saniye sonra tekrar deneniyor...`);
        clearInterval(wanderInterval);
        setTimeout(createBot, 10000);
    });
}

createBot();

// ==========================================
// 4. WEB PANELİ KOMUTLARI
// ==========================================
io.on('connection', (socket) => {
    socket.emit('state_update', globalMode);

    socket.on('action', (data) => {
        if (data.type === 'attack' && data.target) {
            globalMode.targetName = data.target;
            console.log(`Hedef alındı: ${data.target}`);
            if (bot && bot.players[data.target]) {
                bot.pvp.attack(bot.players[data.target].entity);
            }
        }
        else if (data.type === 'stop') {
            globalMode.targetName = null;
            if (bot) {
                bot.pvp.stop();
                bot.pathfinder.setGoal(null);
            }
            console.log('Bot durduruldu, kasılmaya döndü.');
        }
        else if (data.type === 'update_friends') {
            globalMode.friends = data.friends;
        }
        else if (data.type === 'toggle') {
            globalMode[data.mode] = !globalMode[data.mode];
            socket.emit('state_update', globalMode);
        }
    });
});
