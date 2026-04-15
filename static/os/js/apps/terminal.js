function loadScript(src) {
  return new Promise((resolve, reject) => {
    const existing = [...document.scripts].find(script => script.src === src);
    if (existing) {
      resolve(existing);
      return;
    }
    const script = document.createElement('script');
    script.src = src;
    script.async = true;
    script.onload = () => resolve(script);
    script.onerror = () => reject(new Error(`Failed to load ${src}`));
    document.head.appendChild(script);
  });
}

async function loadXterm() {
  if (!window.Terminal) {
    await loadScript('https://cdnjs.cloudflare.com/ajax/libs/xterm/5.5.0/xterm.min.js');
  }
  return window.Terminal;
}

export async function openTerminalApp(context) {
  const { manager } = context;
  const body = `
    <div class="terminal-shell">
      <div class="terminal-toolbar">
        <div class="editor-panel-title">Live Shell</div>
        <div class="inline-row terminal-controls">
          <button type="button" class="action-btn" id="terminal-clear">Clear</button>
          <button type="button" class="action-btn" id="terminal-reconnect">Reconnect</button>
        </div>
      </div>
      <div id="terminal-container" class="terminal-container"></div>
      <div class="terminal-hint">Real shell bridge via WebSocket. Dangerous commands are filtered server-side.</div>
    </div>
  `;

  let socket = null;
  let terminal = null;
  let reconnectTimer = null;

  manager.open('terminal', 'Terminal', body, {
    onClose: () => {
      if (reconnectTimer) window.clearTimeout(reconnectTimer);
      reconnectTimer = null;
      if (socket) socket.close();
      socket = null;
      if (terminal) terminal.dispose();
      terminal = null;
    },
    onReady: async node => {
      const TerminalCtor = await loadXterm();
      const container = node.querySelector('#terminal-container');
      const clearBtn = node.querySelector('#terminal-clear');
      const reconnectBtn = node.querySelector('#terminal-reconnect');

      terminal = new TerminalCtor({
        convertEol: true,
        cursorBlink: true,
        fontFamily: 'Share Tech Mono, monospace',
        fontSize: 14,
        theme: {
          background: '#03070d',
          foreground: '#d8f5ff',
          cursor: '#00f5ff',
          selectionBackground: 'rgba(0,245,255,.25)',
          black: '#03070d',
          brightBlack: '#4b5d66',
          cyan: '#00f5ff',
          brightCyan: '#62ffff',
          magenta: '#ff006e',
          brightMagenta: '#ff5ea1',
        },
      });
      terminal.open(container);
      terminal.writeln('TOXIBH OS Terminal');
      terminal.writeln('Connecting...');

      const connect = () => {
        if (socket) {
          socket.close();
          socket = null;
        }

        const wsProtocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
        socket = new WebSocket(`${wsProtocol}//${location.host}/ws/terminal`);

        socket.onopen = () => {
          terminal.writeln('Connected to shell.');
        };

        socket.onmessage = event => {
          terminal.write(event.data);
        };

        socket.onclose = () => {
          terminal.writeln('\r\nConnection closed.');
        };

        socket.onerror = () => {
          terminal.writeln('\r\nConnection error.');
        };
      };

      connect();

      terminal.onData(data => {
        if (socket && socket.readyState === WebSocket.OPEN) {
          socket.send(data);
        }
      });

      clearBtn.addEventListener('click', () => terminal.clear());
      reconnectBtn.addEventListener('click', () => {
        terminal.writeln('\r\nReconnecting...');
        connect();
      });
    },
  });
}
