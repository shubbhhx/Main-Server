═══════════════════════════════════════════════════════════
  TOXIBH ADMIN SYSTEM — FLASK + TERMUX SETUP GUIDE
  By Subham Jena
═══════════════════════════════════════════════════════════

FOLDER STRUCTURE:
─────────────────
toxibh-flask/
├── app.py                 ← Main Flask server
├── requirements.txt       ← Python packages
├── CHATBOT_TRIGGER.js     ← Paste into portfolio JS
├── data/                  ← JSON databases (auto-created)
│   ├── visitors.json
│   ├── messages.json
│   ├── notes.json
│   ├── passwords.json
│   └── files.json
├── static/                ← Uploaded files (auth-protected)
│   ├── photos/
│   └── pdfs/
└── templates/
    ├── index.html         ← YOUR PORTFOLIO FILE HERE
    └── admin.html         ← Admin panel (already made)

═══════════════════════════════════════════════════════════
  STEP 1 — INSTALL IN TERMUX
═══════════════════════════════════════════════════════════

pkg update && pkg upgrade -y
pkg install python python-pip -y

═══════════════════════════════════════════════════════════
  STEP 2 — COPY PROJECT FILES
═══════════════════════════════════════════════════════════

Copy the toxibh-flask folder to Termux:
  /data/data/com.termux/files/home/toxibh-flask/

Put your portfolio HTML as:
  templates/index.html

═══════════════════════════════════════════════════════════
  STEP 3 — INSTALL PYTHON PACKAGES
═══════════════════════════════════════════════════════════

cd ~/toxibh-flask
pip install -r requirements.txt

If Pillow fails on Termux:
  pkg install libjpeg-turbo libpng -y
  pip install pillow --no-binary pillow

═══════════════════════════════════════════════════════════
  STEP 4 — QBITTORRENT SETUP (TERMUX / OPPO A11K)
═══════════════════════════════════════════════════════════

Torrent streaming now uses qBittorrent WebUI instead of aria2.

Recommended flow in Termux:
  pkg update && pkg upgrade -y
  pkg install proot-distro -y
  proot-distro install ubuntu
  proot-distro login ubuntu
  apt update && apt install qbittorrent-nox -y
  mkdir -p ~/torrents
  qbittorrent-nox --webui-port=8090 --profile=/root/.config/qBittorrent

Set these env vars before running Flask (same machine):
  export QBITTORRENT_URL=http://127.0.0.1:8090
  export QBITTORRENT_USER=admin
  export QBITTORRENT_PASS=hello6969
  export QBITTORRENT_DOWNLOAD_DIR=~/torrents

If you still use old ARIA2_DIR env var, app.py keeps fallback compatibility,
but qBittorrent vars are preferred.

═══════════════════════════════════════════════════════════
  QUICK START — WINDOWS + TERMUX (SIDE BY SIDE)
═══════════════════════════════════════════════════════════

Windows PowerShell (Flask app):
  cd E:\Website\Main-Server
  .\.venv\Scripts\Activate.ps1
  $env:QBITTORRENT_URL="http://127.0.0.1:8090"
  $env:QBITTORRENT_USER="admin"
  $env:QBITTORRENT_PASS="hello6969"
  $env:QBITTORRENT_DOWNLOAD_DIR="C:\torrents"
  python app.py

Termux (qBittorrent service):
  pkg install proot-distro -y
  proot-distro login ubuntu
  qbittorrent-nox --webui-port=8090 --profile=/root/.config/qBittorrent

Open in browser:
  http://localhost:5000/movies/torrent

═══════════════════════════════════════════════════════════
  QUICK START — ALL IN TERMUX (NO WINDOWS)
═══════════════════════════════════════════════════════════

Run everything directly on phone (Oppo A11K):
  cd ~/toxibh-flask
  pkg update && pkg upgrade -y
  pkg install python python-pip proot-distro -y
  pip install -r requirements.txt

Start qBittorrent in Ubuntu userspace:
  proot-distro install ubuntu
  proot-distro login ubuntu
  apt update && apt install qbittorrent-nox -y
  mkdir -p ~/torrents
  qbittorrent-nox --webui-port=8090 --profile=/root/.config/qBittorrent

In another Termux tab, run Flask with env vars:
  cd ~/toxibh-flask
  export QBITTORRENT_URL=http://127.0.0.1:8090
  export QBITTORRENT_USER=admin
  export QBITTORRENT_PASS=hello6969
  export QBITTORRENT_DOWNLOAD_DIR=~/torrents
  python app.py

Open in browser:
  http://localhost:5000/movies/torrent

Optional: run both services in one tmux session:
  pkg install tmux -y
  tmux new -s toxibh
  # Pane 1: start qBittorrent
  proot-distro login ubuntu
  qbittorrent-nox --webui-port=8090 --profile=/root/.config/qBittorrent
  # Split pane: Ctrl+B then %
  # Pane 2: start Flask
  cd ~/toxibh-flask
  export QBITTORRENT_URL=http://127.0.0.1:8090
  export QBITTORRENT_USER=admin
  export QBITTORRENT_PASS=hello6969
  export QBITTORRENT_DOWNLOAD_DIR=~/torrents
  python app.py
  # Detach: Ctrl+B then D

═══════════════════════════════════════════════════════════
  STEP 5 — RUN THE SERVER
═══════════════════════════════════════════════════════════

python app.py

You'll see:
  🚀 TOXIBH FLASK SERVER
     Portfolio  :  http://localhost:5000
     Admin      :  http://localhost:5000/admin

═══════════════════════════════════════════════════════════
  STEP 6 — GET YOUR TERMUX IP FOR NETWORK ACCESS
═══════════════════════════════════════════════════════════

In a new Termux session run:
  ifconfig wlan0   OR   ip addr show wlan0

Look for: inet 192.168.X.XXX

Then from any device on same WiFi:
  http://192.168.X.XXX:8080         ← Portfolio
  http://192.168.X.XXX:8080/admin   ← Admin Panel
═══════════════════════════════════════════════════════════
  STEP 7 — EXPOSE TO INTERNET VIA NGROK (optional)
═══════════════════════════════════════════════════════════

Download ngrok for ARM:
  pkg install wget unzip -y
  wget https://bin.equinox.io/c/bNyj1mQVY4c/ngrok-v3-stable-linux-arm64.tgz
  tar xvzf ngrok-v3-stable-linux-arm64.tgz

Sign up free at ngrok.com, get auth token:
  ./ngrok config add-authtoken YOUR_TOKEN
  ./ngrok http 8080

You get a public URL like: https://abc123.ngrok-free.app
Use this as your portfolio URL!

═══════════════════════════════════════════════════════════
  TROUBLESHOOTING
═══════════════════════════════════════════════════════════

• "Address in use" error:
    lsof -i :5000
    kill -9 <PID>

• Pillow won't install:
    pip install --upgrade pip setuptools wheel
    pip install pillow --no-binary :all:

• Session not persisting:
    Make sure you have flask-session installed
    pip install flask-session

• Can't access from other devices:
    Make sure server runs on 0.0.0.0 not 127.0.0.1
    Check phone/laptop on same WiFi network

═══════════════════════════════════════════════════════════
