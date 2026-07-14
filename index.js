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

// Tüm botların ortak aklı (Global State)
let globalMode = {
    normalPvp: false,
    hackedPvp: false,
    killaura: false,
    targetName: null,
    friends: []
};

let activeBots = []; // Oyundaki botları tutacağımız liste
const NUM_BOTS = 1; // Kaç bot girecek? (Render çökerse bunu 5 yapın)

// --- WEB ARAYÜZÜ (HTML/CSS/JS) ---
const WEB_UI = `
<!DOCTYPE html>
<html lang="tr">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Bot Ordusu Kontrolü</title>
    <style>
        body { font-family: 'Segoe UI', Tahoma, sans-serif; background-color: #0f0f0f; color: #fff; padding: 20px; }
        .container { max-width: 650px; margin: auto; background: #1c1c1c; padding: 20px; border-radius: 12px; box-shadow: 0 0 20px rgba(255,0,0,0.2); }
        h1 { text-align: center; color: #ff3b30; }
        .box { margin-bottom: 20px; padding: 15px; background: #2a2a2a; border-radius: 8px; border-left: 4px solid #555; }
        input[type="text"] { width: 100%; padding: 12px; margin-top: 5px; border-radius: 6px; border: 1px solid #444; background: #222; color: white; box-sizing: border-box; font-size: 16px; }
        button { width: 100%; padding: 12px; margin-top: 10px; border: none; border-radius: 6px; cursor: pointer; font-weight: bold; font-size: 16px; transition: 0.2s; }
        button:active { transform: scale(0.98); }
        .btn-attack { background: #ff3b30; color: white; }
        .btn-stop { background: #ffcc00; color: black; }
        .btn-toggle { background: #34c759; color: white; border-left: 5px solid #248a3d; }
        .btn-toggle.off { background: #444; color: #aaa; border-left: 5px solid #222; }
        .friend-tag { background: #007aff; padding: 5px 10px; border-radius: 15px; font-size: 14px; display: inline-block; margin: 5px 5px 0 0; }
    </style>
</head>
<body>
    <div class="container">
        <h1>⚔️ 10'lu Bot Ordusu Paneli ⚔️</h1>
        
        <div class="box" style="border-left-color: #ff3b30;">
            <h3>🎯 Orduyu Hedefe Yönlendir</h3>
            <input type="text" id="targetName" placeholder="Hedefin oyundaki adını yaz...">
            <button class="btn-attack" onclick="attack()">Hedefe Saldır (Tüm Botlar)</button>
            <button class="btn-stop" onclick="stopAll()">Saldırıyı Durdur & Serbest Bırak</button>
        </div>

        <div class="box" style="border-left-color: #34c759;">
            <h3>⚡ Savaş Modları (Tümü Açılıp Kapanabilir)</h3>
            <button id="btnNormalPvp" class="btn-toggle off" onclick="toggleMode('normalPvp')">Normal PVP (Taktiksel Savaş): KAPALI</button>
            <button id="btnHackedPvp" class="btn-toggle off" onclick="toggleMode('hackedPvp')">Hileli PVP (Hız & Zıplama): KAPALI</button>
            <button id="btnKillaura" class="btn-toggle off" onclick="toggleMode('killaura')">KillAura & Mob Savunması: KAPALI</button>
        </div>

        <div class="box" style="border-left-color: #007aff;">
            <h3>🛡️ Dost Listesi (Asla Vurulmaz)</h3>
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
        function stopAll() { socket.emit('action', { type: 'stop' }); }
        
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
            updateBtn('btnHackedPvp', state.hackedPvp, 'Hileli PVP (Hız & Zıplama): ');
            updateBtn('btnKillaura', state.killaura, 'KillAura & Mob Savunması: ');
        });
    </script>
</body>
</html>
`;

app.get('/', (req, res) => res.send(WEB_UI));
server.listen(port, () => console.log(`Ordu Paneli ${port} portunda aktif!`));

// ==========================================
// 2. BOT ÜRETİM FABRİKASI
// ==========================================
function createBot(botName) {
    const bot = mineflayer.createBot({
        host: 'mamitusta67.aternos.me',
        port: 23479,
        version: '1.20.4',
        username: botName
    });

    bot.loadPlugin(pathfinder);
    bot.loadPlugin(pvp);
    bot.loadPlugin(armorManager);
    bot.loadPlugin(autoeat);

    let mcData;
    let wanderInterval;

    bot.once('spawn', () => {
        console.log(`[+] ${botName} sunucuya katıldı ve emir bekliyor.`);
        mcData = require('minecraft-data')(bot.version);
        activeBots.push(bot);

        // --- BOT FİZİKLERİ VE HİLELİ PVP KONTROLÜ ---
        bot.on('physicsTick', () => {
            if (globalMode.hackedPvp) {
                bot.physics.sprintSpeed = 0.8; // Hızlı koşma
                bot.physics.stepHeight = 1.5;  // Zıplamadan blok çıkma
            } else {
                bot.physics.sprintSpeed = 0.3; // Varsayılan
                bot.physics.stepHeight = 0.6;
            }

            // KillAura (Otomatik Yakın Savunma - Cooldown uyumlu)
            if (globalMode.killaura && !globalMode.targetName) {
                const entity = bot.nearestEntity(e => 
                    (e.type === 'mob' || e.type === 'player') && 
                    e.position.distanceTo(bot.entity.position) < 4.5 &&
                    e.username !== bot.username &&
                    !globalMode.friends.includes(e.username)
                );

                if (entity) {
                    // bot.pvp.attack otomatik olarak bekleme süresini (cooldown) hesaplar.
                    if (!bot.pvp.target) {
                        bot.pvp.attack(entity);
                    }
                }
            }
        });

        // --- OTOMATİK KASILMA (BOŞTA KALINCA GEZİNME) ---
        // Bot hedefte değilken, gerçek bir oyuncu gibi rastgele gezinir ve etraftaki düşen eşyaları toplar.
        wanderInterval = setInterval(() => {
            if (!globalMode.targetName && !bot.pvp.target) {
                const defaultMove = new Movements(bot, mcData);
                bot.pathfinder.setMovements(defaultMove);
                
                // Rastgele bir yöne 5-10 blok yürü (Gerçekçi görünüm)
                const x = bot.entity.position.x + (Math.random() * 20 - 10);
                const z = bot.entity.position.z + (Math.random() * 20 - 10);
                const y = bot.entity.position.y;
                bot.pathfinder.setGoal(new goals.GoalNear(x, y, z, 1), true);
            }
        }, 8000); // 8 saniyede bir yeni yön seç
    });

    // --- OTOMATİK ZIRH VE SİLAH ---
    bot.on('playerCollect', (collector, itemDrop) => {
        if (collector !== bot.entity) return;
        setTimeout(() => {
            bot.armorManager.equipAll(); // Zırhı giy
            const bestWeapon = bot.inventory.items().filter(item => item.name.includes('sword') || item.name.includes('axe')).sort((a, b) => b.type - a.type)[0];
            if (bestWeapon) bot.equip(bestWeapon, 'hand'); // En iyi kılıcı eline al
        }, 500);
    });

    bot.on('health', () => {
        if (bot.food === 20) bot.autoEat.disable();
        else bot.autoEat.enable();
    });

    // --- MOB BİR BOTA VURURSA OTOMATİK CEVAP VERME ---
    bot.on('entityHurt', (entity, attacker) => {
        if (entity === bot.entity && attacker && globalMode.killaura) {
            // Sadece dost değilse karşılık ver
            if (!globalMode.friends.includes(attacker.username)) {
                bot.pvp.attack(attacker);
            }
        }
    });

    bot.on('end', () => {
        console.log(`[-] ${botName} sunucudan koptu. Tekrar deneniyor...`);
        clearInterval(wanderInterval);
        activeBots = activeBots.filter(b => b.username !== botName); // Listeden çıkar
        setTimeout(() => createBot(botName), 10000); // 10 saniye sonra yeniden sok
    });
}

// ==========================================
// 3. ORDUYU SIRA İLE OYUNA SOKMA
// ==========================================
// Sunucuyu çökertmemek için 10 botu 5'er saniye arayla oyuna sokarız.
for (let i = 1; i <= NUM_BOTS; i++) {
    setTimeout(() => {
        createBot(`botkazim${i}`);
    }, i * 5000);
}

// ==========================================
// 4. WEB PANELİNDEN ORDUYA EMİR VERME
// ==========================================
io.on('connection', (socket) => {
    socket.emit('state_update', globalMode);

    socket.on('action', (data) => {
        if (data.type === 'attack' && data.target) {
            globalMode.targetName = data.target;
            console.log(`ORDUYA EMİR VERİLDİ: ${data.target} YOK EDİLECEK!`);
            
            // Tüm botlara aynı anda hedefi saldırt
            activeBots.forEach(bot => {
                const targetPlayer = bot.players[data.target]?.entity;
                if (targetPlayer) {
                    bot.pvp.attack(targetPlayer); // Cooldown süresine uyarak vurur
                }
            });
        }
        else if (data.type === 'stop') {
            globalMode.targetName = null;
            activeBots.forEach(bot => {
                bot.pvp.stop();
                bot.pathfinder.setGoal(null);
            });
            console.log('Ordu geri çekildi, boşta geziniyorlar.');
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
