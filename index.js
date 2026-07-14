const mineflayer = require('mineflayer');
const { pathfinder, Movements } = require('mineflayer-pathfinder');
const { plugin: pvp } = require('mineflayer-pvp');
const autoeat = require('mineflayer-auto-eat').plugin;
const armorManager = require('mineflayer-armor-manager');
const express = require('express');

const app = express();
app.use(express.json());

const sahibinOyunAdi = process.env.OWNER_MC_NAME;

// --- MİNECRAFT BOT BAĞLANTISI ---
const mcBot = mineflayer.createBot({
  host: process.env.MC_HOST,
  port: parseInt(process.env.MC_PORT) || 25565,
  username: process.env.MC_USER,
  version: process.env.MC_VERSION
});

mcBot.loadPlugin(pathfinder);
mcBot.loadPlugin(pvp);
mcBot.loadPlugin(autoeat);
mcBot.loadPlugin(armorManager);

// --- YAPAY ZEKA DURUM (STATE) DEĞİŞKENLERİ ---
let botDurumu = {
    cooldown: false,
    armor: false,
    propvp: false,
    speed: false
};

let spamSaldiriDongusu;
let aiHedef = null;

// --- BOT OYUNA GİRDİĞİNDE YAPILACAKLAR ---
mcBot.once('spawn', () => {
    const mcData = require('minecraft-data')(mcBot.version);
    
    // Yemek Ayarları
    mcBot.autoEat.options = { priority: 'foodPoints', startAt: 14, bannedFood: [] };
    
    // Köprü (Bridge) ve Blok Koyma Ayarları
    const defaultMove = new Movements(mcBot, mcData);
    defaultMove.canDig = false; // Gereksiz blok kırmasın
    defaultMove.allow1by1towers = true; // Kule yapabilsin
    // Envanterdeki toprak, taş gibi blokları köprü yapmak için kullanır
    defaultMove.scafoldingBlocks = [mcData.itemsByName['dirt'].id, mcData.itemsByName['cobblestone'].id, mcData.itemsByName['stone'].id];
    mcBot.pathfinder.setMovements(defaultMove);
    
    console.log("Yenilmez AI Aktif!");
});

// --- ÖZELLİK FONKSİYONLARI ---

// 1. Zırh Yönetimi
mcBot.on('playerCollect', (collector, itemDrop) => {
    if (botDurumu.armor && collector === mcBot.entity) {
        setTimeout(() => { mcBot.armorManager.equipAll(); }, 100);
    }
});

// 2. Pro PVP & Cooldown Hack Mantığı
mcBot.on('physicsTick', () => {
    // Otomatik kılıç seçimi
    if (botDurumu.propvp && mcBot.pvp.target) {
        const bestSword = mcBot.inventory.items().find(item => item.name.includes('sword') || item.name.includes('axe'));
        if (bestSword) mcBot.equip(bestSword, 'hand');
    }

    // Cooldown kapalıysa (0 bekleme ile spam)
    if (botDurumu.cooldown && aiHedef) {
        const mesafe = mcBot.entity.position.distanceTo(aiHedef.position);
        if (mesafe < 5) {
            mcBot.lookAt(aiHedef.position.offset(0, 1.6, 0), true);
            mcBot.attack(aiHedef); // Saniyede 20 tick vurmaya çalışır
        }
    }

    // Hız & Zıplama Hilesi Uygulaması
    if (botDurumu.speed) {
        mcBot.physics.sprintSpeed = 0.9; // Normalin 3 katı hız
        mcBot.physics.stepHeight = 2;    // Çitlerin veya 2 bloğun üstünden zıplamadan geçer
        mcBot.setControlState('jump', true); // Sürekli Bunny Hop
    } else {
        mcBot.physics.sprintSpeed = 0.3; // Varsayılana dön
        mcBot.physics.stepHeight = 0.6;
        mcBot.setControlState('jump', false);
    }
});

// --- WEB ARAYÜZÜ (GELİŞMİŞ KONTROL PANELİ) ---
app.get('/', (req, res) => {
    res.send(`
        <!DOCTYPE html>
        <html lang="tr">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>AI GOD - Kontrol Paneli</title>
            <style>
                body { font-family: 'Courier New', Courier, monospace; background: #050505; color: #0f0; text-align: center; padding: 30px; margin:0;}
                .container { background: #111; padding: 25px; border-radius: 8px; display: inline-block; box-shadow: 0 0 20px #0f0; max-width: 600px;}
                h2 { color: #fff; text-shadow: 0 0 10px #0f0; font-size: 24px;}
                input { padding: 12px; font-size: 16px; width: 70%; margin-bottom: 20px; border-radius: 4px; border: 1px solid #0f0; background: #000; color:#0f0; text-align: center; font-weight:bold;}
                .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 20px;}
                button { padding: 15px; font-size: 15px; border: 2px solid; border-radius: 5px; cursor: pointer; transition: 0.3s; font-weight: bold; background: #222;}
                .btn-off { color: #ff3333; border-color: #ff3333; }
                .btn-on { background: #ff3333; color: #fff; border-color: #ff3333; box-shadow: 0 0 10px #ff3333;}
                .btn-on.green { background: #00e676; border-color: #00e676; box-shadow: 0 0 10px #00e676; color:#000;}
                .action-btn { background: #1976d2; color: #fff; border:none; width: 100%; box-shadow: 0 0 10px #1976d2;}
                .stop-btn { background: #d32f2f; color: #fff; border:none; width: 100%; box-shadow: 0 0 10px #d32f2f;}
                #status { margin-top: 20px; font-weight: bold; color: #fff; font-size: 18px;}
            </style>
        </head>
        <body>
            <div class="container">
                <h2>🤖 YENİLMEZ AI KONTROLÜ</h2>
                <input type="text" id="hedefIsim" placeholder="Hedefin Oyundaki Adı">
                
                <div class="grid">
                    <button id="btn-cooldown" class="btn-off" onclick="toggle('cooldown')" title="(Açılırsa vuruşlar arası beklemez, saniyede 20 kere hedefe kılıç savurur. Anti-Cheat yoksa anında eritir.)">⚡ Cooldown Hilesi</button>
                    
                    <button id="btn-armor" class="btn-off" onclick="toggle('armor')" title="(Açılırsa envanterindeki en güçlü zırhı otomatik hesaplar ve anında üstüne giyer.)">🛡️ Oto Zırh</button>
                    
                    <button id="btn-propvp" class="btn-off" onclick="toggle('propvp')" title="(Açılırsa hedefe blok koyarak/köprü yaparak gider, en iyi kılıcı eline alır ve ölümüne savaşır.)">⚔️ Usta PVP Modu</button>
                    
                    <button id="btn-speed" class="btn-off" onclick="toggle('speed')" title="(Açılırsa botun hareket hızı 3 katına çıkar, tavşan gibi zıplar ve 2 blok yüksekliğindeki duvarlardan tırmanır.)">🌪️ Hız & Fizik Hilesi</button>
                </div>

                <div class="grid">
                    <button class="action-btn" onclick="hedefeDal()" title="(Yazdığın isme tüm açık özelliklerle saldırır)">🎯 HEDEFE DAL</button>
                    <button class="stop-btn" onclick="durdur()" title="(Saldırıyı keser, botu sakinleştirir)">🛑 DURDUR</button>
                </div>

                <div id="status">Sistem Hazır. Emrinizi Bekliyor.</div>
            </div>

            <script>
                // Arayüz butonlarını güncelleyen fonksiyon
                function updateBtn(id, isActive, isGreen = false) {
                    const btn = document.getElementById(id);
                    if(isActive) {
                        btn.className = isGreen ? 'btn-on green' : 'btn-on';
                    } else {
                        btn.className = 'btn-off';
                    }
                }

                function toggle(ozellik) {
                    fetch('/api/toggle', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ ozellik: ozellik })
                    }).then(res => res.json()).then(data => {
                        updateBtn('btn-' + ozellik, data.durum, ozellik === 'armor' || ozellik === 'propvp');
                        document.getElementById('status').innerText = data.mesaj;
                    });
                }

                function hedefeDal() {
                    const isim = document.getElementById('hedefIsim').value;
                    fetch('/api/dal', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ hedef: isim })
                    }).then(res => res.json()).then(data => { document.getElementById('status').innerText = data.mesaj; });
                }

                function durdur() {
                    fetch('/api/dur', { method: 'POST' }).then(res => res.json())
                    .then(data => { document.getElementById('status').innerText = data.mesaj; });
                }
            </script>
        </body>
        </html>
    `);
});

// --- API UÇ NOKTALARI (Butonların Arka Plan İşlemleri) ---
app.post('/api/toggle', (req, res) => {
    const ozellik = req.body.ozellik;
    botDurumu[ozellik] = !botDurumu[ozellik]; // Durumu tersine çevir (Aç/Kapat)
    
    // Eğer zırh modunu yeni açtıysa anında giyinsin
    if (ozellik === 'armor' && botDurumu.armor) {
        mcBot.armorManager.equipAll();
    }
    
    res.json({ durum: botDurumu[ozellik], mesaj: \`[\${ozellik.toUpperCase()}] modu \${botDurumu[ozellik] ? 'AKTİF EDİLDİ 🟢' : 'KAPATILDI 🔴'}\` });
});

app.post('/api/dal', (req, res) => {
    const hedefAdi = req.body.hedef;
    aiHedef = mcBot.players[hedefAdi]?.entity;
    
    if (aiHedef) {
        if (botDurumu.propvp) {
            mcBot.pvp.attack(aiHedef); // Köprü kurma ve pathfinder aktif
        }
        res.json({ mesaj: \`🔥 \${hedefAdi} HEDEF ALINDI! YOK EDİLİYOR!\` });
    } else {
        res.json({ mesaj: \`❌ \${hedefAdi} etrafta yok veya çok uzak!\` });
    }
});

app.post('/api/dur', (req, res) => {
    mcBot.pvp.stop();
    aiHedef = null;
    res.json({ mesaj: \`🛑 Eylemler durduruldu.\` });
});

app.listen(process.env.PORT || 3000, () => console.log("AI Paneli Aktif!"));
