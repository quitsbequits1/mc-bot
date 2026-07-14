const mineflayer = require('mineflayer');
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const { pathfinder, Movements, goals } = require('mineflayer-pathfinder');
const pvp = require('mineflayer-pvp').plugin;
const armorManager = require('mineflayer-armor-manager');
const autoeat = require('mineflayer-auto-eat').plugin;

// ==========================================
// 1. WEB SUNUCUSU VE SOCKET.IO KURULUMU
// ==========================================
const app = express();
const server = http.createServer(app);
const io = new Server(server);
const port = process.env.PORT || 3000;

// Bot Durum Değişkenleri
let botMode = {
    hacks: false,
    survival: false,
    target: null,
    friends: []
};

// Web Arayüzü (HTML/CSS/JS)
const WEB_UI = `
<!DOCTYPE html>
<html lang="tr">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Bot Kontrol Paneli</title>
    <style>
        body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #121212; color: #ffffff; padding: 20px; }
        .container { max-width: 600px; margin: auto; background: #1e1e1e; padding: 20px; border-radius: 10px; box-shadow: 0 0 15px rgba(0,0,0,0.5); }
        h1 { text-align: center; color: #ff3b30; }
        .control-group { margin-bottom: 20px; padding: 15px; background: #2c2c2c; border-radius: 8px; }
        input[type="text"], select { width: 100%; padding: 10px; margin-top: 5px; border-radius: 5px; border: none; background: #333; color: white; box-sizing: border-box; }
        button { width: 100%; padding: 10px; margin-top: 10px; border: none; border-radius: 5px; cursor: pointer; font-weight: bold; }
        .btn-attack { background: #ff3b30; color: white; }
        .btn-stop { background: #ffcc00; color: black; }
        .btn-toggle { background: #34c759; color: white; }
        .btn-toggle.off { background: #555; }
        .friend-list { display: flex; flex-wrap: wrap; gap: 5px; margin-top: 10px; }
        .friend-tag { background: #007aff; padding: 5px 10px; border-radius: 15px; font-size: 12px; }
    </style>
</head>
<body>
    <div class="container">
        <h1>💀 Terminatör Bot Paneli</h1>
        
        <div class="control-group">
            <h3>🎯 Hedef Yok Etme</h3>
            <input type="text" id="targetName" placeholder="Yok edilecek oyuncunun adını yazın...">
            <button class="btn-attack" onclick="attack()">Hedefi Yok Et</button>
            <button class="btn-stop" onclick="stopBot()">Botu Durdur / Hedefi Bırak</button>
        </div>

        <div class="control-group">
            <h3>🛡️ Dost Listesi (Vurmayacak)</h3>
            <input type="text" id="friendName" placeholder="Dost ekle (Örn: senin_adin)...">
            <button class="btn-toggle" onclick="addFriend()">Dost Ekle</button>
            <div class="friend-list" id="friendsContainer"></div>
        </div>

        <div class="control-group">
            <h3>⚡ Hile Kontrolleri</h3>
            <button id="btnHacks" class="btn-toggle off" onclick="toggleHacks()">Hız & Zıplama Hilesi: KAPALI</button>
            <button id="btnSurvival" class="btn-toggle off" onclick="toggleSurvival()">Oto Gelişme & Zırh: KAPALI</button>
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
                updateFriendsUI();
                socket.emit('action', { type: 'update_friends', friends: friends });
            }
        }

        function updateFriendsUI() {
            document.getElementById('friendsContainer').innerHTML = friends.map(f => \`<span class="friend-tag">\${f}</span>\`).join('');
        }

        function toggleHacks() {
            socket.emit('action', { type: 'toggle_hacks' });
        }

        function toggleSurvival() {
            socket.emit('action', { type: 'toggle_survival' });
        }

        socket.on('state_update', (state) => {
            const btnHacks = document.getElementById('btnHacks');
            btnHacks.className = state.hacks ? 'btn-toggle' : 'btn-toggle off';
            btnHacks.innerText = 'Hız & Zıplama Hilesi: ' + (state.hacks ? 'AÇIK' : 'KAPALI');

            const btnSurvival = document.getElementById('btnSurvival');
            btnSurvival.className = state.survival ? 'btn-toggle' : 'btn-toggle off';
            btnSurvival.innerText = 'Oto Gelişme & Zırh: ' + (state.survival ? 'AÇIK' : 'KAPALI');
        });
    </script>
</body>
</html>
`;

app.get('/', (req, res) => res.send(WEB_UI));
server.listen(port, () => console.log(`Web Paneli ${port} portunda açıldı!`));

// ==========================================
// 2. BOT BAŞLATMA VE HİLE SİSTEMİ
// ==========================================
function createBot() {
    const bot = mineflayer.createBot({
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
        console.log('Bot oyuna girdi!');
        mcData = require('minecraft-data')(bot.version);
        
        // Anti-Fall Damage & Hız Hilesi Döngüsü (Fizik Manipülasyonu)
        bot.on('physicsTick', () => {
            if (botMode.hacks) {
                // Hız hilesi: Normalden 3 kat hızlı koşar
                bot.physics.sprintSpeed = 0.8; 
                // Otomatik blok atlama (Zıplamadan merdiven çıkar gibi 1.5 blok çıkar)
                bot.physics.stepHeight = 1.5; 
            } else {
                bot.physics.sprintSpeed = 0.3; // Varsayılan
                bot.physics.stepHeight = 0.6; // Varsayılan
            }

            // Killaura (Eğer hedef verilmemişse etrafı temizle)
            if (botMode.survival && !botMode.target) {
                const entity = bot.nearestEntity(e => 
                    (e.type === 'mob' || e.type === 'player') && 
                    e.position.distanceTo(bot.entity.position) < 4.5 &&
                    e.username !== bot.username &&
                    !botMode.friends.includes(e.username) // DOSTLARA VURMA
                );

                if (entity) {
                    bot.lookAt(entity.position.offset(0, 1.5, 0));
                    bot.attack(entity);
                }
            }
        });
    });

    // Otomatik En İyi Eşyayı Kuşanma (Kılıç & Zırh)
    bot.on('playerCollect', (collector, itemDrop) => {
        if (collector !== bot.entity) return;
        if (!botMode.survival) return;

        setTimeout(() => {
            // Zırhları otomatik giy
            bot.armorManager.equipAll();
            
            // Eline en iyi kılıcı veya baltayı al
            const bestWeapon = bot.inventory.items().filter(item => item.name.includes('sword') || item.name.includes('axe')).sort((a, b) => b.type - a.type)[0];
            if (bestWeapon) bot.equip(bestWeapon, 'hand');
        }, 500);
    });

    bot.on('health', () => {
        if (botMode.survival) {
            if (bot.food === 20) bot.autoEat.disable();
            else bot.autoEat.enable();
        }
    });

    // ==========================================
    // 3. WEB PANELİNDEN GELEN KOMUTLARI DİNLEME
    // ==========================================
    io.on('connection', (socket) => {
        socket.emit('state_update', botMode);

        socket.on('action', (data) => {
            if (data.type === 'attack' && data.target) {
                botMode.target = data.target;
                const targetPlayer = bot.players[data.target]?.entity;
                if (targetPlayer) {
                    bot.chat(`Hedef kilitlendi: ${data.target}. Yok ediliyor...`);
                    const defaultMove = new Movements(bot, mcData);
                    defaultMove.allowSprinting = true;
                    bot.pathfinder.setMovements(defaultMove);
                    
                    // Sonsuz Target (Hedefi sürekli takip et ve vur)
                    bot.pvp.attack(targetPlayer);
                } else {
                    bot.chat('Hedef haritada bulunamadı veya çok uzakta.');
                }
            }
            else if (data.type === 'stop') {
                botMode.target = null;
                bot.pvp.stop();
                bot.pathfinder.setGoal(null);
                bot.chat('Saldırı durduruldu. Beklemedeyim.');
            }
            else if (data.type === 'update_friends') {
                botMode.friends = data.friends;
                console.log('Dostlar güncellendi:', botMode.friends);
            }
            else if (data.type === 'toggle_hacks') {
                botMode.hacks = !botMode.hacks;
                socket.emit('state_update', botMode);
            }
            else if (data.type === 'toggle_survival') {
                botMode.survival = !botMode.survival;
                if(botMode.survival) {
                    bot.armorManager.equipAll(); // Açılır açılmaz zırh giy
                }
                socket.emit('state_update', botMode);
            }
        });
    });

    // Bağlantı koparsa zorla geri bağlan (Asla pes etme)
    bot.on('end', () => {
        console.log('Bağlantı koptu, 10 saniye içinde yeniden giriliyor...');
        setTimeout(createBot, 10000);
    });
}

createBot();
