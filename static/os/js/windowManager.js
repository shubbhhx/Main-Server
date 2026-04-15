export class WindowManager {
  constructor({ windowLayer, template, taskbarApps }) {
    this.windowLayer = windowLayer;
    this.template = template;
    this.taskbarApps = taskbarApps;
    this.windows = new Map();
    this.zIndex = 12;
  }

  createTaskButton(appId, label, onActivate) {
    let button = this.taskbarApps.querySelector(`[data-task='${appId}']`);
    if (button) return button;

    button = document.createElement('button');
    button.className = 'task-btn';
    button.dataset.task = appId;
    button.textContent = label;
    button.addEventListener('click', onActivate);
    this.taskbarApps.appendChild(button);
    return button;
  }

  removeTaskButton(appId) {
    const button = this.taskbarApps.querySelector(`[data-task='${appId}']`);
    if (button) button.remove();
  }

  bringToFront(win) {
    this.zIndex += 1;
    win.style.zIndex = this.zIndex;
  }

  closeWindow(appId) {
    const entry = this.windows.get(appId);
    if (!entry) return;
    entry.node.remove();
    this.windows.delete(appId);
    this.removeTaskButton(appId);
    if (typeof entry.onClose === 'function') entry.onClose();
  }

  minimizeWindow(appId) {
    const entry = this.windows.get(appId);
    if (!entry) return;
    entry.node.classList.add('hidden');
  }

  restoreWindow(appId) {
    const entry = this.windows.get(appId);
    if (!entry) return;
    entry.node.classList.remove('hidden');
    this.bringToFront(entry.node);
  }

  makeDraggable(win) {
    const handle = win.querySelector('[data-drag-handle]');
    if (!handle) return;

    let pointerId = null;
    let startX = 0;
    let startY = 0;
    let baseLeft = 0;
    let baseTop = 0;

    handle.addEventListener('pointerdown', event => {
      pointerId = event.pointerId;
      handle.setPointerCapture(pointerId);
      this.bringToFront(win);
      startX = event.clientX;
      startY = event.clientY;
      baseLeft = parseFloat(win.style.left || '40');
      baseTop = parseFloat(win.style.top || '56');
      event.preventDefault();
    });

    handle.addEventListener('pointermove', event => {
      if (pointerId !== event.pointerId) return;
      const nextLeft = Math.max(8, baseLeft + event.clientX - startX);
      const nextTop = Math.max(8, baseTop + event.clientY - startY);
      win.style.left = `${nextLeft}px`;
      win.style.top = `${nextTop}px`;
    });

    handle.addEventListener('pointerup', event => {
      if (pointerId !== event.pointerId) return;
      try {
        handle.releasePointerCapture(pointerId);
      } catch (_) {
        // ignore
      }
      pointerId = null;
    });
  }

  open(appId, title, bodyHtml, options = {}) {
    const existing = this.windows.get(appId);
    if (existing) {
      existing.node.classList.remove('hidden');
      this.bringToFront(existing.node);
      return existing.node;
    }

    const node = this.template.content.firstElementChild.cloneNode(true);
    node.dataset.app = appId;
    node.classList.add('window');
    node.querySelector('.window-title').textContent = title;
    node.querySelector('.window-body').innerHTML = bodyHtml;
    node.style.left = `${48 + this.windows.size * 26}px`;
    node.style.top = `${58 + this.windows.size * 20}px`;
    node.style.width = options.width || 'min(1120px, calc(100vw - 28px))';
    node.style.height = options.height || 'min(720px, calc(100vh - 90px))';

    const closeButton = node.querySelector('.win-close') || node.querySelector("[data-action='close']");
    const minimizeButton = node.querySelector('.win-min') || node.querySelector("[data-action='minimize']");
    const maximizeButton = node.querySelector('.win-max') || node.querySelector("[data-action='maximize']");

    closeButton.addEventListener('click', () => this.closeWindow(appId));
    minimizeButton.addEventListener('click', () => this.minimizeWindow(appId));
    maximizeButton.addEventListener('click', () => node.classList.toggle('maximized'));
    node.addEventListener('mousedown', () => this.bringToFront(node));

    this.windowLayer.appendChild(node);
    this.makeDraggable(node);
    node.style.resize = 'both';
    node.style.overflow = 'hidden';
    this.bringToFront(node);

    this.windows.set(appId, { node, onClose: options.onClose || null });
    this.createTaskButton(appId, title, () => this.restoreWindow(appId));

    if (typeof options.onReady === 'function') options.onReady(node, this);
    return node;
  }
}
