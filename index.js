const mineflayer = require('mineflayer');
const { pathfinder } = require('mineflayer-pathfinder');
const { plugin: pvp } = require('mineflayer-pvp');
const autoeat = require('mineflayer-auto-eat').plugin;
const express = require('express');

const app = express();
app.use(express.json());

const sahibinOyunAdi = process.env.OWNER_MC_NAME; // Senin nickin

// --- 1. MİNECRAFT BOT BAĞLANTISI VE SÜRÜM HATASI ÇÖZÜMÜ ---
const mcBot = mineflayer.createBot({
  host: process.env.MC_HOST,
  port: parseInt(process.env.MC_PORT) || 25565,
  username: process.env.MC_USER,
  version: process.env.MC_VERSION // Sürüm hatasını çözen altın vuruş
});

mcBot.loadPlugin(pathfinder);
mcBot.loadPlugin(pvp);
mcBot.loadPlugin(autoeat);

mcBot.once('spawn', () => {
    mcBot.autoEat.options = { priority: 'foodPoints', startAt: 14, bannedFood: [] };
    console.log("Bot oyuna girdi!");
});

// --- 2. HİLE (KILL-AURA / BUNNY HOP) SİSTEMİ ---
let hileModu = false;
let hileDongusu;

function hileKapat() {
    hileModu = false;
    clearInterval(hileDongusu);
    mcBot.setControlState('jump', false);
    mcBot.pvp.stop();
}

function hileBaslat() {
    hileModu = true;
    mcBot.setControlState('jump', true); // Sürekli zıplayarak kritik hasar vurur ve hızlanır
    
    hileDongusu = setInterval(() => {
        // En yakın oyuncuyu bul (Sahibini es geç)
        const dusman = mcBot.nearestEntity(e => e.type === 'player' && e.username !== sahibinOyunAdi);
        
        // Eğer düşman 5 blok kadar yakındaysa kılıcın bekleme süresini (cooldown) yoksayarak SPAMLA
        if (dusman && mcBot.entity.position.distanceTo(dusman.position) < 5) {
            mcBot.lookAt(dusman.position.offset(0, 1.6, 0), true);
            mcBot.attack(dusman); 
        }
    }, 100); // Saniyede tam 10 kere vurur (Anti-cheat yoksa mükemmel çalışır)
}

// --- 3. 2v1 OTOMATİK SAVUNMA ---
mcBot.on('entityHurt', (entity) => {
    if (entity === mcBot.entity && !hileModu) { 
        const enYakinDusman = mcBot.nearestEntity(e => e.type === 'player' && e.username !== sahibinOyunAdi);
        if (enYakinDusman) {
            mcBot.pvp.attack(enYakinDusman);
        }
    }
});

// --- 4. WEB KONTROL PANELİ (HTML & API) ---

// Arayüz sayfası
app.get('/', (req, res) => {
    res.send(`
        <!DOCTYPE html>
        <html lang="tr">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>MC Bot Kontrol</title>
            <style>
                body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background: #121212; color: #fff; text-align: center; padding: 50px; }
                .container { background: #1e1e1e; padding: 30px; border-radius: 10px; display: inline-block; box-shadow: 0 4px 15px rgba(0,0,0,0.5); }
                input { padding: 10px; font-size: 16px; width: 80%; margin-bottom: 20px; border-radius: 5px; border: none; outline: none; text-align: center;}
                button { padding: 12px 20px; font-size: 16px; margin: 5px; border: none; border-radius: 5px; cursor: pointer; transition: 0.2s; color: #fff;}
                .btn-savas { background: #d32f2f; } .btn-savas:hover { background: #b71c1c; }
                .btn-hile { background: #7b1fa2; } .btn-hile:hover { background: #4a148c; }
                .btn-dur { background: #388e3c; } .btn-dur:hover { background: #1b5e20; }
                #status { margin-top: 20px; font-weight: bold; color: #ffeb3b; }
            </style>
        </head>
        <body>
            <div class="container">
                <h2>🤖 Bot Yönetim Paneli</h2>
                <input type="text" id="hedefIsim" placeholder="Hedefin Oyundaki Adı">
                <br>
                <button class="btn-savas" onclick="komutGonder('savas')">⚔️ Savaş (Normal)</button>
                <button class="btn-hile" onclick="komutGonder('hile')">🚀 HİLE MODU (Zıpla & Spamla)</button>
                <button class="btn-dur" onclick="komutGonder('dur')">🛑 Dur</button>
                <div id="status">Bot hazır ve bekliyor.</div>
            </div>

            <script>
                function komutGonder(aksiyon) {
                    const isim = document.getElementById('hedefIsim').value;
                    fetch('/api/' + aksiyon, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ hedef: isim })
                    })
                    .then(res => res.json())
                    .then(data => { document.getElementById('status').innerText = data.mesaj; });
                }
            </script>
        </body>
        </html>
    `);
});

// API Uç Noktaları
app.post('/api/savas', (req, res) => {
    hileKapat(); // Hile varsa kapat, normale dön
    const hedefAdi = req.body.hedef;
    const hedef = mcBot.players[hedefAdi]?.entity;
    
    if (hedef) {
        mcBot.pvp.attack(hedef);
        res.json({ mesaj: `⚔️ Normal pvp modu aktif. Hedef: ${hedefAdi}` });
    } else {
        res.json({ mesaj: `❌ ${hedefAdi} bulunamadı veya çok uzak!` });
    }
});

app.post('/api/hile', (req, res) => {
    hileBaslat();
    res.json({ mesaj: `🚀 HİLE AKTİF! Etraftaki hedeflere zıplayarak seri vuruluyor!` });
});

app.post('/api/dur', (req, res) => {
    hileKapat();
    res.json({ mesaj: `🛑 Tüm eylemler durduruldu. Bot beklemede.` });
});

app.listen(process.env.PORT || 3000, () => console.log("Web paneli aktif!"));
