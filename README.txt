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
  STEP 4 — RUN THE SERVER
═══════════════════════════════════════════════════════════

python app.py

You'll see:
  🚀 TOXIBH FLASK SERVER
     Portfolio  :  http://localhost:5000
     Admin      :  http://localhost:5000/admin

═══════════════════════════════════════════════════════════
  STEP 5 — GET YOUR TERMUX IP FOR NETWORK ACCESS
═══════════════════════════════════════════════════════════

In a new Termux session run:
  ifconfig wlan0   OR   ip addr show wlan0

Look for: inet 192.168.X.XXX

Then from any device on same WiFi:
  http://192.168.X.XXX:8080         ← Portfolio
  http://192.168.X.XXX:8080/admin   ← Admin Panel
═══════════════════════════════════════════════════════════
  STEP 6 — KEEP RUNNING IN BACKGROUND (tmux)
═══════════════════════════════════════════════════════════

pkg install tmux -y

Start a persistent session:
  tmux new -s toxibh
  cd ~/toxibh-flask && python app.py

Detach (keep running):  Ctrl+B  then  D
Reattach later:         tmux attach -t toxibh
Kill session:           tmux kill-session -t toxibh

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
