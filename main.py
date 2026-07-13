import os
import telebot
from mcrcon import MCRcon
from flask import Flask
import threading

# Render botu kapatmasın diye sahte web sunucusu (zorunlu)
app = Flask(__name__)
@app.route('/')
def ana_sayfa(): return "Bot 7/24 Aktif!"
def web_baslat(): app.run(host="0.0.0.0", port=int(os.environ.get("PORT", 8080)))
threading.Thread(target=web_baslat).start()

# Minecraft Botu Kodları
TOKEN = os.environ.get("TOKEN")
RCON_HOST = os.environ.get("RCON_HOST")
RCON_PASSWORD = os.environ.get("RCON_PASSWORD")
RCON_PORT = int(os.environ.get("RCON_PORT", 25575))

bot = telebot.TeleBot(TOKEN)

@bot.message_handler(commands=['mc'])
def mc_komut(message):
    komut = message.text.replace("/mc ", "")
    try:
        with MCRcon(RCON_HOST, RCON_PASSWORD, RCON_PORT) as mcr:
            cevap = mcr.command(komut)
        bot.reply_to(message, cevap if cevap else "Komut başarıyla gönderildi.")
    except:
        bot.reply_to(message, "Bağlantı hatası! Sunucu açık mı ve şifre doğru mu?")

bot.polling(none_stop=True)
