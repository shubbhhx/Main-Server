const bootScreen = document.getElementById('boot-screen');
const lockScreen = document.getElementById('lock-screen');
const desktop = document.getElementById('desktop');
const bootProgress = document.getElementById('boot-progress');
const bootStatus = document.getElementById('boot-status');
const pinInput = document.getElementById('pin-input');
const unlockBtn = document.getElementById('unlock-btn');
const lockError = document.getElementById('lock-error');
const startBtn = document.getElementById('start-btn');
const startMenu = document.getElementById('start-menu');
const lockBtn = document.getElementById('lock-btn');
const taskbarApps = document.getElementById('taskbar-apps');
const windowLayer = document.getElementById('window-layer');
const taskbarClock = document.getElementById('taskbar-clock');
const lockTime = document.getElementById('lock-time');
const lockDate = document.getElementById('lock-date');

let osSettings = { pin: '6969', wallpaper: 'neon-grid', accent: '#00f5ff' };
let zCounter = 12;
const openWindows = new Map();

function setClock() {
  const now = new Date();
  const time = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const date = now.toLocaleDateString([], { weekday: 'long', month: 'short', day: 'numeric' });
  taskbarClock.textContent = time;
  lockTime.textContent = time;
  lockDate.textContent = date;
}

function applyWallpaper(name) {
  desktop.classList.remove('wallpaper-neon-grid', 'wallpaper-cosmic', 'wallpaper-dark-matrix');
  if (name === 'cosmic') desktop.classList.add('wallpaper-cosmic');
  else if (name === 'dark-matrix') desktop.classList.add('wallpaper-dark-matrix');
  else desktop.classList.add('wallpaper-neon-grid');
}

async function loadSettings() {
  try {
    const res = await fetch('/api/os/settings');
    if (res.ok) {
      osSettings = await res.json();
      applyWallpaper(osSettings.wallpaper || 'neon-grid');
    }
  } catch (_) {
    // Keep defaults if API is unavailable.
  }
}

async function runBootSequence() {
  const states = [
    'Initializing kernel modules...',
    'Mounting secure partitions...',
    'Launching desktop compositor...',
    'Authenticating user session...'
  ];

  for (let i = 0; i <= 100; i += 5) {
    bootProgress.style.width = `${i}%`;
    bootStatus.textContent = states[Math.min(states.length - 1, Math.floor(i / 30))];
    await new Promise(resolve => setTimeout(resolve, 60));
  }

  bootScreen.classList.add('hidden');
  lockScreen.classList.remove('hidden');
  pinInput.focus();
}

function unlockDesktop() {
  const entered = (pinInput.value || '').trim();
  const expected = String(osSettings.pin || '6969').trim();
  if (entered !== expected) {
    lockError.textContent = 'Incorrect PIN. Try again.';
    pinInput.select();
    return;
  }

  lockError.textContent = '';
  pinInput.value = '';
  lockScreen.classList.add('hidden');
  desktop.classList.remove('hidden');
}

function relaunchLockScreen() {
  desktop.classList.add('hidden');
  startMenu.classList.add('hidden');
  lockScreen.classList.remove('hidden');
  pinInput.focus();
}

function createTaskButton(appId, label) {
  let btn = taskbarApps.querySelector(`[data-task='${appId}']`);
  if (btn) return btn;

  btn = document.createElement('button');
  btn.className = 'task-btn';
  btn.dataset.task = appId;
  btn.textContent = label;
  btn.addEventListener('click', () => {
    const win = openWindows.get(appId);
    if (!win) return;
    if (win.classList.contains('hidden')) win.classList.remove('hidden');
    bringToFront(win);
  });
  taskbarApps.appendChild(btn);
  return btn;
}

function removeTaskButton(appId) {
  const btn = taskbarApps.querySelector(`[data-task='${appId}']`);
  if (btn) btn.remove();
}

function bringToFront(win) {
  zCounter += 1;
  win.style.zIndex = zCounter;
}

function makeWindowDraggable(win) {
  const handle = win.querySelector('[data-drag-handle]');
  let dragging = false;
  let startX = 0;
  let startY = 0;
  let baseLeft = 0;
  let baseTop = 0;

  handle.addEventListener('mousedown', e => {
    dragging = true;
    bringToFront(win);
    startX = e.clientX;
    startY = e.clientY;
    baseLeft = parseInt(win.style.left || '40', 10);
    baseTop = parseInt(win.style.top || '54', 10);
    e.preventDefault();
  });

  window.addEventListener('mousemove', e => {
    if (!dragging) return;
    const nextLeft = Math.max(4, baseLeft + e.clientX - startX);
    const nextTop = Math.max(4, baseTop + e.clientY - startY);
    win.style.left = `${nextLeft}px`;
    win.style.top = `${nextTop}px`;
  });

  window.addEventListener('mouseup', () => {
    dragging = false;
  });
}

function makeWindow(appId, title, bodyHtml, onReady) {
  if (openWindows.has(appId)) {
    const existing = openWindows.get(appId);
    existing.classList.remove('hidden');
    bringToFront(existing);
    return existing;
  }

  const tpl = document.getElementById('window-template');
  const win = tpl.content.firstElementChild.cloneNode(true);
  win.dataset.app = appId;
  win.querySelector('.window-title').textContent = title;
  win.querySelector('.window-body').innerHTML = bodyHtml;
  win.style.left = `${50 + openWindows.size * 28}px`;
  win.style.top = `${56 + openWindows.size * 20}px`;

  win.querySelector("[data-action='close']").addEventListener('click', () => {
    openWindows.delete(appId);
    removeTaskButton(appId);
    win.remove();
  });

  win.querySelector("[data-action='minimize']").addEventListener('click', () => {
    win.classList.add('hidden');
  });

  win.addEventListener('mousedown', () => bringToFront(win));

  windowLayer.appendChild(win);
  makeWindowDraggable(win);
  bringToFront(win);
  openWindows.set(appId, win);
  createTaskButton(appId, title);

  if (typeof onReady === 'function') onReady(win);
  return win;
}

function openFlixApp() {
  window.open('/flix', '_blank', 'noopener');
}

function openAdminApp() {
  window.open('/admin', '_blank', 'noopener');
}

function openVaultApp() {
  const body = `
    <h3>Vault Browser</h3>
    <p>Files loaded from server storage.</p>
    <div class='inline-row'>
      <button class='action-btn' id='load-photos'>Load Photos</button>
      <button class='action-btn' id='load-pdfs'>Load PDFs</button>
    </div>
    <h4>Output</h4>
    <ul class='file-list' id='vault-output'></ul>
  `;

  makeWindow('vault', 'Vault', body, win => {
    const output = win.querySelector('#vault-output');

    async function load(group) {
      output.innerHTML = '<li>Loading...</li>';
      try {
        const res = await fetch(`/api/os/files?group=${group}`);
        const data = await res.json();
        const list = group === 'photos' ? data.photos : data.pdfs;
        output.innerHTML = '';
        if (!list || !list.length) {
          output.innerHTML = '<li>No files found.</li>';
          return;
        }
        list.forEach(item => {
          const li = document.createElement('li');
          li.innerHTML = `<a href='${item.url}' target='_blank' rel='noopener'>${item.name}</a> (${Math.round(item.size / 1024)} KB)`;
          output.appendChild(li);
        });
      } catch (_) {
        output.innerHTML = '<li>Failed to load files.</li>';
      }
    }

    win.querySelector('#load-photos').addEventListener('click', () => load('photos'));
    win.querySelector('#load-pdfs').addEventListener('click', () => load('pdfs'));
  });
}

function openPdfApp() {
  const body = `
    <h3>PDF Tools</h3>
    <p>Preview your PDF vault and open each file quickly.</p>
    <button class='action-btn' id='pdf-refresh'>Refresh PDF List</button>
    <ul class='file-list' id='pdf-list'><li>Press refresh to load PDFs.</li></ul>
  `;

  makeWindow('pdf', 'PDF Tools', body, win => {
    const list = win.querySelector('#pdf-list');
    const refresh = async () => {
      list.innerHTML = '<li>Loading...</li>';
      try {
        const res = await fetch('/api/os/files?group=pdfs');
        const data = await res.json();
        list.innerHTML = '';
        if (!data.pdfs || !data.pdfs.length) {
          list.innerHTML = '<li>No PDFs available.</li>';
          return;
        }
        data.pdfs.forEach(file => {
          const li = document.createElement('li');
          li.innerHTML = `<a href='${file.url}' target='_blank' rel='noopener'>${file.name}</a>`;
          list.appendChild(li);
        });
      } catch (_) {
        list.innerHTML = '<li>Unable to fetch PDFs.</li>';
      }
    };

    win.querySelector('#pdf-refresh').addEventListener('click', refresh);
  });
}

function openImageEditorApp() {
  const body = `
    <h3>Image Editor</h3>
    <input type='file' class='image-input' id='img-input' accept='image/*'>
    <div class='inline-row'>
      <button class='action-btn' id='img-gray'>Grayscale</button>
      <button class='action-btn' id='img-invert'>Invert</button>
      <button class='action-btn' id='img-download'>Download</button>
    </div>
    <canvas id='img-canvas' style='margin-top:10px;max-width:100%;border:1px solid rgba(0,245,255,.2);'></canvas>
  `;

  makeWindow('image', 'Image Editor', body, win => {
    const input = win.querySelector('#img-input');
    const canvas = win.querySelector('#img-canvas');
    const ctx = canvas.getContext('2d');

    function applyPixelTransform(transformer) {
      if (!canvas.width || !canvas.height) return;
      const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const d = imgData.data;
      for (let i = 0; i < d.length; i += 4) {
        const r = d[i];
        const g = d[i + 1];
        const b = d[i + 2];
        const [nr, ng, nb] = transformer(r, g, b);
        d[i] = nr;
        d[i + 1] = ng;
        d[i + 2] = nb;
      }
      ctx.putImageData(imgData, 0, 0);
    }

    input.addEventListener('change', () => {
      const file = input.files && input.files[0];
      if (!file) return;
      const img = new Image();
      img.onload = () => {
        canvas.width = img.width;
        canvas.height = img.height;
        ctx.drawImage(img, 0, 0);
      };
      img.src = URL.createObjectURL(file);
    });

    win.querySelector('#img-gray').addEventListener('click', () => {
      applyPixelTransform((r, g, b) => {
        const v = Math.round((r + g + b) / 3);
        return [v, v, v];
      });
    });

    win.querySelector('#img-invert').addEventListener('click', () => {
      applyPixelTransform((r, g, b) => [255 - r, 255 - g, 255 - b]);
    });

    win.querySelector('#img-download').addEventListener('click', () => {
      if (!canvas.width || !canvas.height) return;
      const a = document.createElement('a');
      a.href = canvas.toDataURL('image/png');
      a.download = 'edited-image.png';
      a.click();
    });
  });
}

function openCodeRunnerApp() {
  const body = `
    <h3>Code Runner (Python)</h3>
    <textarea class='code-input' id='code-input'>print('TOXIBH OS is online')</textarea>
    <div class='inline-row'>
      <button class='action-btn' id='run-code'>Run</button>
      <button class='action-btn magenta' id='clear-code-output'>Clear Output</button>
    </div>
    <h4>Output</h4>
    <div class='code-output' id='code-output'></div>
  `;

  makeWindow('code', 'Code Runner', body, win => {
    const input = win.querySelector('#code-input');
    const output = win.querySelector('#code-output');

    win.querySelector('#run-code').addEventListener('click', async () => {
      output.textContent = 'Executing...';
      try {
        const res = await fetch('/api/os/code/execute', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ language: 'python', code: input.value })
        });
        const data = await res.json();
        const chunks = [];
        if (data.stdout) chunks.push(`STDOUT:\n${data.stdout}`);
        if (data.stderr) chunks.push(`STDERR:\n${data.stderr}`);
        if (data.error) chunks.push(`ERROR:\n${data.error}`);
        output.textContent = chunks.length ? chunks.join('\n\n') : `Exit code: ${data.exitCode ?? 'n/a'}`;
      } catch (_) {
        output.textContent = 'Execution failed.';
      }
    });

    win.querySelector('#clear-code-output').addEventListener('click', () => {
      output.textContent = '';
    });
  });
}

function openChatApp() {
  const body = `
    <h3>OS Chat</h3>
    <div class='chat-feed' id='chat-feed'></div>
    <div class='inline-row'>
      <input class='chat-input' id='chat-input' placeholder='Type a message...'>
      <button class='action-btn' id='chat-send'>Send</button>
    </div>
  `;

  makeWindow('chat', 'Chat', body, win => {
    const feed = win.querySelector('#chat-feed');
    const input = win.querySelector('#chat-input');

    function render(history) {
      feed.textContent = '';
      (history || []).forEach(row => {
        const div = document.createElement('div');
        div.textContent = `${row.role.toUpperCase()}: ${row.message}`;
        feed.appendChild(div);
      });
      feed.scrollTop = feed.scrollHeight;
    }

    async function loadHistory() {
      try {
        const res = await fetch('/api/os/chat');
        const history = await res.json();
        render(history);
      } catch (_) {
        feed.textContent = 'Unable to load chat history.';
      }
    }

    async function sendMessage() {
      const message = (input.value || '').trim();
      if (!message) return;
      input.value = '';
      try {
        const res = await fetch('/api/os/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ message })
        });
        const data = await res.json();
        render(data.history || []);
      } catch (_) {
        feed.textContent += '\nSYSTEM: Failed to send message.';
      }
    }

    win.querySelector('#chat-send').addEventListener('click', sendMessage);
    input.addEventListener('keydown', e => {
      if (e.key === 'Enter') sendMessage();
    });

    loadHistory();
  });
}

function openTerminalApp() {
  const body = `
    <h3>Terminal</h3>
    <div class='term-feed' id='term-feed'>TOXIBH OS Terminal\nType 'help' for commands.</div>
    <div class='inline-row'>
      <input class='term-input' id='term-input' placeholder='command'>
      <button class='action-btn' id='term-run'>Run</button>
    </div>
  `;

  makeWindow('terminal', 'Terminal', body, win => {
    const feed = win.querySelector('#term-feed');
    const input = win.querySelector('#term-input');

    function println(text) {
      feed.textContent += `\n${text}`;
      feed.scrollTop = feed.scrollHeight;
    }

    function runCommand() {
      const raw = (input.value || '').trim();
      if (!raw) return;
      input.value = '';
      println(`> ${raw}`);
      const cmd = raw.toLowerCase();

      if (cmd === 'help') {
        println('Commands: help, clear, date, ls, open flix, open admin, lock');
      } else if (cmd === 'clear') {
        feed.textContent = 'TOXIBH OS Terminal';
      } else if (cmd === 'date') {
        println(new Date().toString());
      } else if (cmd === 'ls') {
        println('apps: flix vault pdf image code chat terminal admin settings');
      } else if (cmd === 'open flix') {
        window.open('/flix', '_blank', 'noopener');
      } else if (cmd === 'open admin') {
        window.open('/admin', '_blank', 'noopener');
      } else if (cmd === 'lock') {
        relaunchLockScreen();
      } else {
        println('Unknown command');
      }
    }

    win.querySelector('#term-run').addEventListener('click', runCommand);
    input.addEventListener('keydown', e => {
      if (e.key === 'Enter') runCommand();
    });
  });
}

function openSettingsApp() {
  const body = `
    <h3>Settings</h3>
    <div class='panel-grid'>
      <div class='info-tile'>
        <h4>Security</h4>
        <label>PIN</label>
        <input class='settings-input' id='set-pin' type='password' maxlength='8' placeholder='4-8 digits'>
      </div>
      <div class='info-tile'>
        <h4>Wallpaper</h4>
        <select class='settings-select' id='set-wallpaper'>
          <option value='neon-grid'>Neon Grid</option>
          <option value='cosmic'>Cosmic</option>
          <option value='dark-matrix'>Dark Matrix</option>
        </select>
      </div>
    </div>
    <div class='inline-row'>
      <button class='action-btn' id='save-settings'>Save Settings</button>
    </div>
    <div id='settings-status'></div>
  `;

  makeWindow('settings', 'Settings', body, win => {
    const pin = win.querySelector('#set-pin');
    const wallpaper = win.querySelector('#set-wallpaper');
    const status = win.querySelector('#settings-status');

    pin.value = osSettings.pin || '6969';
    wallpaper.value = osSettings.wallpaper || 'neon-grid';

    win.querySelector('#save-settings').addEventListener('click', async () => {
      const payload = {
        pin: pin.value.trim(),
        wallpaper: wallpaper.value
      };

      if (!/^\d{4,8}$/.test(payload.pin)) {
        status.textContent = 'PIN must be 4 to 8 digits.';
        return;
      }

      try {
        const res = await fetch('/api/os/settings', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        const data = await res.json();
        if (!res.ok) {
          status.textContent = data.error || 'Unable to save settings.';
          return;
        }
        osSettings = data.settings;
        applyWallpaper(osSettings.wallpaper || 'neon-grid');
        status.textContent = 'Settings saved.';
      } catch (_) {
        status.textContent = 'Failed to save settings.';
      }
    });
  });
}

function openApp(appId) {
  startMenu.classList.add('hidden');

  if (appId === 'flix') return openFlixApp();
  if (appId === 'admin') return openAdminApp();
  if (appId === 'vault') return openVaultApp();
  if (appId === 'pdf') return openPdfApp();
  if (appId === 'image') return openImageEditorApp();
  if (appId === 'code') return openCodeRunnerApp();
  if (appId === 'chat') return openChatApp();
  if (appId === 'terminal') return openTerminalApp();
  if (appId === 'settings') return openSettingsApp();
}

function wireEvents() {
  unlockBtn.addEventListener('click', unlockDesktop);
  pinInput.addEventListener('keydown', e => {
    if (e.key === 'Enter') unlockDesktop();
  });

  startBtn.addEventListener('click', () => {
    startMenu.classList.toggle('hidden');
  });

  document.addEventListener('click', e => {
    if (!startMenu.contains(e.target) && e.target !== startBtn) {
      startMenu.classList.add('hidden');
    }
  });

  lockBtn.addEventListener('click', relaunchLockScreen);

  document.querySelectorAll('[data-app]').forEach(btn => {
    btn.addEventListener('dblclick', () => openApp(btn.dataset.app));
    btn.addEventListener('click', () => openApp(btn.dataset.app));
  });

  document.querySelectorAll('.start-item[data-app]').forEach(btn => {
    btn.addEventListener('click', () => openApp(btn.dataset.app));
  });
}

(async function init() {
  setClock();
  setInterval(setClock, 1000);
  wireEvents();
  await loadSettings();
  await runBootSequence();
})();
