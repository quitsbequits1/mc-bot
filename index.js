const mineflayer = require('mineflayer');
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const { pathfinder, Movements, goals } = require('mineflayer-pathfinder');
const pvp = require('mineflayer-pvp').plugin;
const armorManager = require('mineflayer-armor-manager');
const autoeat = require('mineflayer-auto-eat').plugin;

// ==========================================
// 1. WEB SUNUCUSU VE CANLI PANEL
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

let bot = null;
let wanderInterval = null;

// Gelişmiş Mobil Uyumlu Web Arayüzü
const WEB_UI = `
<!DOCTYPE html>
<html lang="tr">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Solo Terminatör Kontrol Merkezi</title>
    <style>
        body { font-family: 'Segoe UI', Tahoma, sans-serif; background-color: #0c0c0e; color: #fff; padding: 15px; margin: 0; }
        .container { max-width: 600px; margin: 20px auto; background: #141416; padding: 20px; border-radius: 12px; box-shadow: 0 4px 20px rgba(255, 59, 48, 0.15); border: 1px solid #232326; }
        h1 { text-align: center; color: #ff3b30; margin-top: 0; font-size: 24px; text-shadow: 0 0 10px rgba(255,59,48,0.3); }
        .box { margin-bottom: 15px; padding: 15px; background: #1a1a1e; border-radius: 8px; border-left: 4px solid #3a3a40; }
        label { font-size: 12px; color: #8a8a93; font-weight: bold; text-transform: uppercase; }
        input[type="text"] { width: 100%; padding: 10px; margin: 5px 0 12px 0; border-radius: 6px; border: 1px solid #2c2c30; background: #0f0f11; color: white; font-size: 14px; box-sizing: border-box; }
        button { width: 100%; padding: 12px; margin-top: 8px; border: none; border-radius: 6px; cursor: pointer; font-weight: bold; font-size: 14px; transition: 0.2s; }
        button:active { transform: scale(0.98); }
        .btn-attack { background: #ff3b30; color: white; }
        .btn-stop { background: #ffcc00; color: black; }
        .btn-connect { background: #007aff; color: white; }
        .btn-disconnect { background: #5e5e66; color: white; }
        .btn-toggle { background: #34c759; color: white; border-left: 5px solid #248a3d; }
        .btn-toggle.off { background: #2c2c30; color: #8a8a93; border-left: 5px solid #1a1a1e; }
        .friend-tag { background: #007aff; padding: 4px 10px; border-radius: 12px; font-size: 12px; display: inline-block; margin: 5px 5px 0 0; font-weight: bold; }
        #logBox { background: #000; font-family: 'Courier New', Courier, monospace; padding: 10px; border-radius: 6px; height: 160px; overflow-y: auto; font-size: 12px; color: #00ff66; border: 1px solid #232326; line-height: 1.4; }
    </style>
</head>
<body>
    <div class="container">
        <h1>🤖 BOTKAZIM PANELİ 🤖</h1>
        
        <!-- BAĞLANTI AYARLARI -->
        <div class="box" style="border-left-color: #007aff;">
            <h3>🔌 Sunucu Bağlantı Ayarları</h3>
            <label>Sunucu IP (Host):</label>
            <input type="text" id="srvIp" value="mamitusta67.aternos.me">
            
            <label>Port (Aternos panelinden bakıp güncelleyin!):</label>
            <input type="text" id="srvPort" value="23479">
            
            <label>Bot Kullanıcı Adı:</label>
            <input type="text" id="botUsername" value="botkazim">
            
            <button class="btn-connect" onclick="connectBot()">Botu Oyuna Sok</button>
            <button class="btn-disconnect" onclick="disconnectBot()">Botu Oyundan Çıkar</button>
        </div>

        <!-- HEDEF KİLİTLENME -->
        <div class="box" style="border-left-color: #ff3b30;">
            <h3>🎯 Hedef Yok Etme</h3>
            <input type="text" id="targetName" placeholder="Saldırılacak oyuncunun adı...">
            <button class="btn-attack" onclick="attack()">Hedefe Saldır</button>
            <button class="btn-stop" onclick="stopBot()">Saldırıyı Durdur / Boşta Gez</button>
        </div>

        <!-- HİLELER -->
        <div class="box" style="border-left-color: #34c759;">
            <h3>⚡ Hile Modları</h3>
            <button id="btnNormalPvp" class="btn-toggle off" onclick="toggleMode('normalPvp')">Normal PVP (Taktiksel): KAPALI</button>
            <button id="btnHackedPvp" class="btn-toggle off" onclick="toggleMode('hackedPvp')">Hız & Zıplama Hilesi: KAPALI</button>
            <button id="btnKillaura" class="btn-toggle off" onclick="toggleMode('killaura')">KillAura (Mob & Oto Savunma): KAPALI</button>
        </div>

        <!-- DOST LİSTESİ -->
        <div class="box" style="border-left-color: #007aff;">
            <h3>🛡️ Dost Listesi (Asla Vurmaz)</h3>
            <input type="text" id="friendName" placeholder="Dostun adı...">
            <button class="btn-connect" onclick="addFriend()">Dost Ekle</button>
            <div id="friendsContainer"></div>
        </div>

        <!-- CANLI KONSOL -->
        <div class="box" style="border-left-color: #ff9500;">
            <h3>📋 Canlı Bot Günlüğü (Loglar)</h3>
            <div id="logBox">Sistem hazır. Bağlantı bekleniyor...</div>
        </div>
    </div>

    <script src="/socket.io/socket.io.js"></script>
    <script>
        const socket = io();
        let friends = [];

        function connectBot() {
            const host = document.getElementById('srvIp').value;
            const port = document.getElementById('srvPort').value;
            const username = document.getElementById('botUsername').value;
            socket.emit('connect_bot', { host, port, username });
        }

        function disconnectBot() { socket.emit('disconnect_bot'); }
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

        // Canlı Logları Ekrana Yazdır
        socket.on('bot_log', (msg) => {
            const logBox = document.getElementById('logBox');
            logBox.innerHTML += '<br/>' + msg;
            logBox.scrollTop = logBox.scrollHeight;
        });

        socket.on('state_update', (state) => {
            const updateBtn = (id, isActive, text) => {
                const btn = document.getElementById(id);
                btn.className = isActive ? 'btn-toggle' : 'btn-toggle off';
                btn.innerText = text + (isActive ? 'AÇIK' : 'KAPALI');
            };
            updateBtn('btnNormalPvp', state.normalPvp, 'Normal PVP (Taktiksel): ');
            updateBtn('btnHackedPvp', state.hackedPvp, 'Hız & Zıplama Hilesi: ');
            updateBtn('btnKillaura', state.killaura, 'KillAura (Mob & Oto Savunma): ');
        });
    </script>
</body>
</html>
`;

app.get('/', (req, res) => res.send(WEB_UI));
server.listen(port, () => console.log(`Ordu Paneli ${port} portunda aktif!`));

// Web konsoluna ve terminale log gönderme fonksiyonu
function sendLog(msg) {
    const formattedMsg = `[${new Date().toLocaleTimeString()}] ${msg}`;
    console.log(formattedMsg);
    io.emit('bot_log', formattedMsg);
}

// ==========================================
// 2. BOT YÖNETİMİ
// ==========================================
function startBotInstance(host, port, username) {
    if (bot) {
        sendLog("⚠️ Aktif bot sonlandırılıyor...");
        bot.quit();
        clearInterval(wanderInterval);
    }

    sendLog(`🚀 ${username} botu ${host}:${port} adresine bağlanıyor...`);

    bot = mineflayer.createBot({
        host: host,
        port: parseInt(port),
        username: username,
        version: '1.20.4',
        auth: 'offline', // Korsan sunucular için zorunlu
        checkTimeoutInterval: 60000 // Sunucu laglıysa hemen düşmesin diye 60 sn tolerans
    });

    bot.loadPlugin(pathfinder);
    bot.loadPlugin(pvp);
    bot.loadPlugin(armorManager);
    bot.loadPlugin(autoeat);

    let mcData;

    bot.once('spawn', () => {
        sendLog(`✅ BAŞARILI! ${username} oyuna girdi!`);
        mcData = require('minecraft-data')(bot.version);

        // --- ÖLÜNCE ANINDA YENİDEN DOĞMA ---
        bot.on('death', () => {
            sendLog("💀 Bot öldü! Saniyeler içinde yeniden doğuluyor...");
            bot.respawn();
        });

        // --- HEDEF ÖLÜNCE SALDIRIYI OTOMATİK BİTİRME ---
        bot.on('entityDead', (entity) => {
            if (bot.pvp.target === entity) {
                sendLog("🎯 Hedef yok edildi! Kasılma moduna geri dönülüyor.");
                bot.pvp.stop();
                globalMode.targetName = null;
                io.emit('state_update', globalMode);
            }
        });

        // --- HİLE VE FİZİK DÖNGÜSÜ ---
        bot.on('physicsTick', () => {
            if (globalMode.hackedPvp) {
                bot.physics.sprintSpeed = 0.8; // Normalin 3 katı hız
                bot.physics.stepHeight = 1.5;  // Blokları zıplamadan aşar (Step Hack)
            } else {
                bot.physics.sprintSpeed = 0.3;
                bot.physics.stepHeight = 0.6;
            }

            // Killaura & Mob Koruması (Cooldown'a uyarak vurur, spam yapmaz)
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

        // --- OTOMATİK KASILMA (BOŞTA GEZİNME) ---
        wanderInterval = setInterval(() => {
            if (!globalMode.targetName && !bot.pvp.target) {
                const defaultMove = new Movements(bot, mcData);
                bot.pathfinder.setMovements(defaultMove);
                
                // 10 blok çapında rastgele bir yere yürü (Gerçekçi görünüm)
                const x = bot.entity.position.x + (Math.random() * 20 - 10);
                const z = bot.entity.position.z + (Math.random() * 20 - 10);
                bot.pathfinder.setGoal(new goals.GoalNear(x, bot.entity.position.y, z, 1), true);
            }
        }, 8000);
    });

    // --- OTOMATİK EN İYİ ZIRH VE KILIÇ KUŞANMA ---
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

    // Saldırıya uğrarsa KillAura ile karşılık ver
    bot.on('entityHurt', (entity, attacker) => {
        if (entity === bot.entity && attacker && globalMode.killaura) {
            if (!globalMode.friends.includes(attacker.username)) {
                bot.pvp.attack(attacker);
            }
        }
    });

    // --- HATA VE BAĞLANTI KOPMA RAPORLARI ---
    bot.on('kicked', (reason) => {
        sendLog(`❌ SUNUCUDAN ATILDI! Sebep: ${reason}`);
    });

    bot.on('error', (err) => {
        sendLog(`❌ HATA OLUŞTU: ${err.message}`);
    });

    bot.on('end', (reason) => {
        sendLog(`🔌 Sunucu bağlantısı kesildi (${reason}).`);
        clearInterval(wanderInterval);
    });
}

// ==========================================
// 3. SOCKET HABERLEŞMESİ
// ==========================================
io.on('connection', (socket) => {
    socket.emit('state_update', globalMode);

    // Panelden "Botu Oyuna Sok" butonuna basılınca
    socket.on('connect_bot', (data) => {
        startBotInstance(data.host, data.port, data.username);
    });

    // Panelden "Botu Oyundan Çıkar" butonuna basılınca
    socket.on('disconnect_bot', () => {
        if (bot) {
            sendLog("🔌 Bot sunucudan manuel olarak çıkarıldı.");
            bot.quit();
            clearInterval(wanderInterval);
            bot = null;
        } else {
            sendLog("⚠️ Oyunda zaten aktif bir bot yok.");
        }
    });

    socket.on('action', (data) => {
        if (!bot) {
            sendLog("❌ Önce botu oyuna sokmalısın!");
            return;
        }

        if (data.type === 'attack' && data.target) {
            globalMode.targetName = data.target;
            const targetPlayer = bot.players[data.target]?.entity;
            if (targetPlayer) {
                sendLog(`🎯 ${data.target} hedefine kilitlenildi. Saldırılıyor...`);
                bot.pvp.attack(targetPlayer);
            } else {
                sendLog(`⚠️ ${data.target} bulunamadı veya çok uzakta! Ama taranmaya devam ediliyor.`);
            }
        }
        else if (data.type === 'stop') {
            globalMode.targetName = null;
            bot.pvp.stop();
            bot.pathfinder.setGoal(null);
            sendLog('🛑 Saldırı durduruldu. Bot kasılmaya döndü.');
        }
        else if (data.type === 'update_friends') {
            globalMode.friends = data.friends;
            sendLog(`👥 Dost listesi güncellendi: [${data.friends.join(', ')}]`);
        }
        else if (data.type === 'toggle') {
            globalMode[data.mode] = !globalMode[data.mode];
            socket.emit('state_update', globalMode);
            sendLog(`⚙️ ${data.mode} modu güncellendi: ${globalMode[data.mode] ? 'AÇIK' : 'KAPALI'}`);
        }
    });
});
