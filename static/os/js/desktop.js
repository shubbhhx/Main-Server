import { WindowManager } from './windowManager.js';
import { openCodeEditorApp } from './apps/codeEditor.js';
import { openTerminalApp } from './apps/terminal.js';

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
const desktopIcons = document.getElementById('desktop-icons');
const fullscreenBtn = document.getElementById('fullscreen-btn');
const desktopRoot = document.getElementById('os-root');

const manager = new WindowManager({
  windowLayer,
  template: document.getElementById('window-template'),
  taskbarApps,
});

const state = {
  settings: {
    pin: '0000',
    wallpaper: { mode: 'default', url: '/static/os/default-wallpaper.svg', name: 'default' },
    accent: '#00f5ff',
    bootSound: false,
  },
  wallpapers: [],
};

const appList = [
  { id: 'flix', label: 'Flix', icon: '🎬', type: 'external' },
  { id: 'vault', label: 'Vault', icon: '🗂', type: 'window' },
  { id: 'pdf', label: 'PDF Tools', icon: '📄', type: 'window' },
  { id: 'image', label: 'Image Editor', icon: '🖼', type: 'window' },
  { id: 'code', label: 'Code Runner', icon: '⌨', type: 'module' },
  { id: 'chat', label: 'Chat', icon: '💬', type: 'window' },
  { id: 'terminal', label: 'Terminal', icon: '🖥', type: 'module' },
  { id: 'admin', label: 'Admin Panel', icon: '🛡', type: 'external' },
  { id: 'settings', label: 'Settings', icon: '⚙', type: 'window' },
];

function setClock() {
  const now = new Date();
  const time = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const date = now.toLocaleDateString([], { weekday: 'long', month: 'short', day: 'numeric' });
  taskbarClock.textContent = time;
  lockTime.textContent = time;
  lockDate.textContent = date;
}

function normalizeWallpaper(wallpaper) {
  if (!wallpaper) {
    return { mode: 'default', url: '/static/os/default-wallpaper.svg', name: 'default' };
  }
  if (typeof wallpaper === 'string') {
    return { mode: 'preset', name: wallpaper, url: '/static/os/default-wallpaper.svg' };
  }
  return {
    mode: wallpaper.mode || 'custom',
    name: wallpaper.name || 'custom',
    url: wallpaper.url || '/static/os/default-wallpaper.svg',
  };
}

function applyWallpaper(wallpaper) {
  const next = normalizeWallpaper(wallpaper);
  desktop.classList.remove('wallpaper-cosmic', 'wallpaper-dark-matrix', 'wallpaper-default');
  desktop.style.backgroundImage = '';
  desktop.style.backgroundSize = '';
  desktop.style.backgroundPosition = '';

  if (next.mode === 'custom' || next.mode === 'default' || next.url) {
    desktop.style.backgroundImage = `linear-gradient(140deg, rgba(2,4,8,.18), rgba(2,4,8,.18)), url('${next.url}')`;
    desktop.style.backgroundSize = 'cover';
    desktop.style.backgroundPosition = 'center';
  } else if (next.name === 'cosmic') {
    desktop.classList.add('wallpaper-cosmic');
  } else if (next.name === 'dark-matrix') {
    desktop.classList.add('wallpaper-dark-matrix');
  } else {
    desktop.classList.add('wallpaper-default');
  }
}

async function loadSettings() {
  try {
    const response = await fetch('/api/os/settings');
    if (response.ok) {
      state.settings = await response.json();
      state.settings.wallpaper = normalizeWallpaper(state.settings.wallpaper);
      applyWallpaper(state.settings.wallpaper);
    }
    const wallpaperResponse = await fetch('/api/wallpaper/current');
    if (wallpaperResponse.ok) {
      const wallpaperData = await wallpaperResponse.json();
      if (wallpaperData.wallpaper) {
        state.settings.wallpaper = normalizeWallpaper(wallpaperData.wallpaper);
        applyWallpaper(state.settings.wallpaper);
      }
    }
  } catch (_) {
    applyWallpaper(state.settings.wallpaper);
  }
}

async function runBootSequence() {
  const states = [
    'Initializing kernel modules...',
    'Mounting secure partitions...',
    'Launching desktop compositor...',
    'Authenticating user session...',
  ];

  for (let i = 0; i <= 100; i += 4) {
    bootProgress.style.width = `${i}%`;
    bootStatus.textContent = states[Math.min(states.length - 1, Math.floor(i / 30))];
    await new Promise(resolve => setTimeout(resolve, 32));
  }

  bootScreen.classList.add('hidden');
  lockScreen.classList.remove('hidden');
  pinInput.focus();
}

function unlockDesktop() {
  const entered = (pinInput.value || '').trim();
  const expected = String(state.settings.pin || '0000').trim();
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

function toggleStartMenu() {
  startMenu.classList.toggle('hidden');
}

function setupTaskbar() {
  startBtn.addEventListener('click', toggleStartMenu);
  lockBtn.addEventListener('click', relaunchLockScreen);
  fullscreenBtn.addEventListener('click', async () => {
    if (!document.fullscreenElement) {
      await desktopRoot.requestFullscreen();
    } else {
      await document.exitFullscreen();
    }
  });

  document.addEventListener('click', event => {
    if (!startMenu.contains(event.target) && event.target !== startBtn) {
      startMenu.classList.add('hidden');
    }
  });
}

function renderDesktopIcons() {
  desktopIcons.innerHTML = '';
  appList.forEach(app => {
    const button = document.createElement('button');
    button.className = 'app-icon glass-panel';
    button.dataset.app = app.id;
    button.innerHTML = `<span>${app.icon}</span><small>${app.label}</small>`;
    button.addEventListener('click', () => openApp(app.id));
    button.addEventListener('dblclick', () => openApp(app.id));
    desktopIcons.appendChild(button);
  });
}

function renderStartMenu() {
  startMenu.innerHTML = `
    <div class="start-title">TOXIBH OS</div>
    ${appList.map(app => `<button class="start-item" data-app="${app.id}">${app.label}</button>`).join('')}
    <hr>
    <a class="start-item" href="/">Portfolio</a>
    <a class="start-item" href="/flix">Flix</a>
    <a class="start-item" href="/admin" target="_blank" rel="noopener">Admin</a>
    <button class="start-item danger" id="start-lock-btn">Lock</button>
  `;

  startMenu.querySelectorAll('.start-item[data-app]').forEach(button => {
    button.addEventListener('click', () => openApp(button.dataset.app));
  });
  startMenu.querySelector('#start-lock-btn').addEventListener('click', relaunchLockScreen);
}

function openFlixApp() {
  window.open('/flix', '_blank', 'noopener');
}

function openAdminApp() {
  window.open('/admin', '_blank', 'noopener');
}

async function openVaultApp() {
  const body = `
    <div class="panel-grid">
      <div class="info-tile">
        <h4>Vault Browser</h4>
        <p>Files loaded from server storage.</p>
        <div class="inline-row">
          <button class="action-btn" id="load-photos">Load Photos</button>
          <button class="action-btn" id="load-pdfs">Load PDFs</button>
        </div>
      </div>
      <div class="info-tile">
        <h4>Output</h4>
        <ul class="file-list" id="vault-output"></ul>
      </div>
    </div>
  `;

  manager.open('vault', 'Vault', body, {
    onReady: win => {
      const output = win.querySelector('#vault-output');
      async function load(group) {
        output.innerHTML = '<li>Loading...</li>';
        try {
          const response = await fetch(`/api/os/files?group=${group}`);
          const data = await response.json();
          const list = group === 'photos' ? data.photos : data.pdfs;
          output.innerHTML = '';
          if (!list || !list.length) {
            output.innerHTML = '<li>No files found.</li>';
            return;
          }
          list.forEach(item => {
            const li = document.createElement('li');
            li.innerHTML = `<a href="${item.url}" target="_blank" rel="noopener">${item.name}</a> (${Math.round(item.size / 1024)} KB)`;
            output.appendChild(li);
          });
        } catch (_) {
          output.innerHTML = '<li>Failed to load files.</li>';
        }
      }
      win.querySelector('#load-photos').addEventListener('click', () => load('photos'));
      win.querySelector('#load-pdfs').addEventListener('click', () => load('pdfs'));
    },
  });
}

async function openPdfApp() {
  const body = `
    <h3>PDF Tools</h3>
    <p>Preview your PDF vault and open each file quickly.</p>
    <button class="action-btn" id="pdf-refresh">Refresh PDF List</button>
    <ul class="file-list" id="pdf-list"><li>Press refresh to load PDFs.</li></ul>
  `;

  manager.open('pdf', 'PDF Tools', body, {
    onReady: win => {
      const list = win.querySelector('#pdf-list');
      const refresh = async () => {
        list.innerHTML = '<li>Loading...</li>';
        try {
          const response = await fetch('/api/os/files?group=pdfs');
          const data = await response.json();
          list.innerHTML = '';
          if (!data.pdfs || !data.pdfs.length) {
            list.innerHTML = '<li>No PDFs available.</li>';
            return;
          }
          data.pdfs.forEach(file => {
            const li = document.createElement('li');
            li.innerHTML = `<a href="${file.url}" target="_blank" rel="noopener">${file.name}</a>`;
            list.appendChild(li);
          });
        } catch (_) {
          list.innerHTML = '<li>Unable to fetch PDFs.</li>';
        }
      };
      win.querySelector('#pdf-refresh').addEventListener('click', refresh);
      refresh();
    },
  });
}

function openImageEditorApp() {
  const body = `
    <h3>Image Editor</h3>
    <input type="file" class="image-input" id="img-input" accept="image/*">
    <div class="inline-row">
      <button class="action-btn" id="img-gray">Grayscale</button>
      <button class="action-btn" id="img-invert">Invert</button>
      <button class="action-btn" id="img-download">Download</button>
    </div>
    <canvas id="img-canvas" class="editor-canvas"></canvas>
  `;

  manager.open('image', 'Image Editor', body, {
    onReady: win => {
      const input = win.querySelector('#img-input');
      const canvas = win.querySelector('#img-canvas');
      const ctx = canvas.getContext('2d');

      function applyPixelTransform(transformer) {
        if (!canvas.width || !canvas.height) return;
        const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const d = imgData.data;
        for (let i = 0; i < d.length; i += 4) {
          const [nr, ng, nb] = transformer(d[i], d[i + 1], d[i + 2]);
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
        const anchor = document.createElement('a');
        anchor.href = canvas.toDataURL('image/png');
        anchor.download = 'edited-image.png';
        anchor.click();
      });
    },
  });
}

async function openChatApp() {
  const body = `
    <h3>OS Chat</h3>
    <div class="chat-feed" id="chat-feed"></div>
    <div class="inline-row">
      <input class="chat-input" id="chat-input" placeholder="Type a message...">
      <button class="action-btn" id="chat-send">Send</button>
    </div>
  `;

  manager.open('chat', 'Chat', body, {
    onReady: win => {
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
          const response = await fetch('/api/os/chat');
          const history = await response.json();
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
          const response = await fetch('/api/os/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ message }),
          });
          const data = await response.json();
          render(data.history || []);
        } catch (_) {
          feed.textContent += '\nSYSTEM: Failed to send message.';
        }
      }

      win.querySelector('#chat-send').addEventListener('click', sendMessage);
      input.addEventListener('keydown', event => {
        if (event.key === 'Enter') sendMessage();
      });
      loadHistory();
    },
  });
}

async function openSettingsApp() {
  const body = `
    <h3>Settings</h3>
    <div class="panel-grid">
      <div class="info-tile">
        <h4>Security</h4>
        <label>PIN</label>
        <input class="settings-input" id="set-pin" type="password" maxlength="8" placeholder="0000">
      </div>
      <div class="info-tile">
        <h4>Wallpaper</h4>
        <select class="settings-select" id="set-wallpaper">
          <option value="default">Default</option>
          <option value="cosmic">Cosmic</option>
          <option value="dark-matrix">Dark Matrix</option>
        </select>
        <input class="settings-input" id="wallpaper-upload" type="file" accept="image/*">
        <div class="wallpaper-preview-wrap">
          <img id="wallpaper-preview" class="wallpaper-preview" alt="Wallpaper preview">
        </div>
        <div class="inline-row">
          <button class="action-btn" id="upload-wallpaper-btn">Upload</button>
          <button class="action-btn" id="apply-wallpaper-btn">Apply</button>
        </div>
        <small id="wallpaper-status" class="settings-status"></small>
      </div>
    </div>
    <div class="inline-row">
      <button class="action-btn" id="save-settings">Save Settings</button>
      <button class="action-btn magenta" id="reset-wallpaper">Reset Wallpaper</button>
    </div>
    <div id="settings-status"></div>
  `;

  manager.open('settings', 'Settings', body, {
    onReady: async win => {
      const pin = win.querySelector('#set-pin');
      const wallpaperSelect = win.querySelector('#set-wallpaper');
      const wallpaperUpload = win.querySelector('#wallpaper-upload');
      const wallpaperPreview = win.querySelector('#wallpaper-preview');
      const wallpaperStatus = win.querySelector('#wallpaper-status');
      const status = win.querySelector('#settings-status');

      pin.value = state.settings.pin || '0000';
      wallpaperSelect.value = state.settings.wallpaper?.name || 'default';
      wallpaperPreview.src = state.settings.wallpaper?.url || '/static/os/default-wallpaper.svg';

      wallpaperUpload.addEventListener('change', () => {
        const file = wallpaperUpload.files && wallpaperUpload.files[0];
        if (!file) return;
        wallpaperPreview.src = URL.createObjectURL(file);
        wallpaperStatus.textContent = 'Preview ready. Apply to set this wallpaper.';
      });

      win.querySelector('#save-settings').addEventListener('click', async () => {
        const payload = {
          pin: pin.value.trim(),
          wallpaper: { mode: wallpaperSelect.value === 'default' ? 'default' : 'preset', name: wallpaperSelect.value, url: state.settings.wallpaper?.url || '/static/os/default-wallpaper.svg' },
        };

        if (!/^\d{4,8}$/.test(payload.pin)) {
          status.textContent = 'PIN must be 4 to 8 digits.';
          return;
        }

        const response = await fetch('/api/os/settings', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        const data = await response.json();
        if (!response.ok) {
          status.textContent = data.error || 'Unable to save settings.';
          return;
        }
        state.settings = data.settings;
        applyWallpaper(state.settings.wallpaper);
        status.textContent = 'Settings saved.';
      });

      win.querySelector('#upload-wallpaper-btn').addEventListener('click', async () => {
        const file = wallpaperUpload.files && wallpaperUpload.files[0];
        if (!file) {
          wallpaperStatus.textContent = 'Choose an image first.';
          return;
        }
        const form = new FormData();
        form.append('wallpaper', file);
        const response = await fetch('/api/wallpaper/upload', { method: 'POST', body: form });
        const data = await response.json();
        if (!response.ok) {
          wallpaperStatus.textContent = data.error || 'Upload failed.';
          return;
        }
        state.wallpapers.push(data.wallpaper);
        wallpaperSelect.value = 'default';
        wallpaperPreview.src = data.wallpaper.url;
        wallpaperStatus.textContent = 'Wallpaper uploaded.';
      });

      win.querySelector('#apply-wallpaper-btn').addEventListener('click', async () => {
        const selectedFile = wallpaperUpload.files && wallpaperUpload.files[0];
        if (selectedFile) {
          const form = new FormData();
          form.append('wallpaper', selectedFile);
          const uploadResponse = await fetch('/api/wallpaper/upload', { method: 'POST', body: form });
          const uploadData = await uploadResponse.json();
          if (!uploadResponse.ok) {
            wallpaperStatus.textContent = uploadData.error || 'Upload failed.';
            return;
          }
          const setResponse = await fetch('/api/wallpaper/set', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(uploadData.wallpaper),
          });
          const setData = await setResponse.json();
          if (!setResponse.ok) {
            wallpaperStatus.textContent = setData.error || 'Unable to apply wallpaper.';
            return;
          }
          state.settings.wallpaper = normalizeWallpaper(setData.wallpaper);
          applyWallpaper(state.settings.wallpaper);
          wallpaperStatus.textContent = 'Wallpaper applied.';
          return;
        }

        const preset = wallpaperSelect.value;
        const wallpaper = preset === 'default'
          ? { mode: 'default', name: 'default', url: '/static/os/default-wallpaper.svg' }
          : { mode: 'preset', name: preset, url: '/static/os/default-wallpaper.svg' };
        const response = await fetch('/api/wallpaper/set', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(wallpaper),
        });
        const data = await response.json();
        if (!response.ok) {
          wallpaperStatus.textContent = data.error || 'Unable to apply wallpaper.';
          return;
        }
        state.settings.wallpaper = normalizeWallpaper(data.wallpaper);
        applyWallpaper(state.settings.wallpaper);
        wallpaperStatus.textContent = 'Wallpaper applied.';
      });

      win.querySelector('#reset-wallpaper').addEventListener('click', async () => {
        const wallpaper = { mode: 'default', name: 'default', url: '/static/os/default-wallpaper.svg' };
        const response = await fetch('/api/wallpaper/set', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(wallpaper),
        });
        const data = await response.json();
        if (response.ok) {
          state.settings.wallpaper = normalizeWallpaper(data.wallpaper);
          applyWallpaper(state.settings.wallpaper);
          wallpaperStatus.textContent = 'Wallpaper reset.';
        }
      });
    },
  });
}

function openApp(appId) {
  startMenu.classList.add('hidden');
  if (appId === 'flix') return openFlixApp();
  if (appId === 'admin') return openAdminApp();
  if (appId === 'vault') return openVaultApp();
  if (appId === 'pdf') return openPdfApp();
  if (appId === 'image') return openImageEditorApp();
  if (appId === 'code') return openCodeEditorApp({ manager, state });
  if (appId === 'chat') return openChatApp();
  if (appId === 'terminal') return openTerminalApp({ manager, state });
  if (appId === 'settings') return openSettingsApp();
  return null;
}

function wireEvents() {
  unlockBtn.addEventListener('click', unlockDesktop);
  pinInput.addEventListener('keydown', event => {
    if (event.key === 'Enter') unlockDesktop();
  });

  desktopIcons.addEventListener('click', event => {
    const button = event.target.closest('[data-app]');
    if (!button) return;
    openApp(button.dataset.app);
  });

  renderStartMenu();
  setupTaskbar();
}

(async function init() {
  setClock();
  setInterval(setClock, 1000);
  wireEvents();
  await loadSettings();
  renderDesktopIcons();
  await runBootSequence();
})();
