const MONACO_CDN = 'https://cdnjs.cloudflare.com/ajax/libs/monaco-editor/0.50.0/min/vs';

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

async function loadMonaco() {
  if (window.monaco) return window.monaco;
  await loadScript('https://cdnjs.cloudflare.com/ajax/libs/monaco-editor/0.50.0/min/vs/loader.min.js');
  await new Promise((resolve, reject) => {
    window.require.config({ paths: { vs: MONACO_CDN } });
    window.require(['vs/editor/editor.main'], () => resolve(), reject);
  });
  return window.monaco;
}

function renderTreeNode(item, onOpen, depth = 0) {
  const wrap = document.createElement('div');
  wrap.className = `file-node ${item.type}`;
  wrap.style.paddingLeft = `${8 + depth * 12}px`;

  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'file-node-button';
  button.textContent = item.type === 'folder' ? `▾ ${item.name}` : item.name;
  button.addEventListener('click', () => {
    if (item.type === 'file') onOpen(item);
    else fold.classList.toggle('hidden');
  });

  wrap.appendChild(button);
  const fold = document.createElement('div');
  fold.className = 'file-node-children';
  if (item.children && item.children.length) {
    item.children.forEach(child => fold.appendChild(renderTreeNode(child, onOpen, depth + 1)));
  }
  wrap.appendChild(fold);
  return wrap;
}

export async function openCodeEditorApp(context) {
  const { manager } = context;
  const body = `
    <div class="editor-shell">
      <aside class="editor-sidebar glass-panel">
        <div class="editor-panel-title">Files</div>
        <div id="file-tree" class="file-tree"></div>
        <div class="inline-row editor-actions">
          <button type="button" class="action-btn" id="new-file-btn">New File</button>
          <button type="button" class="action-btn" id="new-folder-btn">New Folder</button>
        </div>
      </aside>
      <section class="editor-main glass-panel">
        <div class="editor-toolbar">
          <div class="editor-tabs" id="editor-tabs"></div>
          <div class="editor-controls">
            <select id="editor-language" class="settings-select compact-select">
              <option value="python">Python</option>
              <option value="javascript">JavaScript</option>
              <option value="c">C</option>
              <option value="cpp">C++</option>
              <option value="java">Java</option>
              <option value="html">HTML</option>
              <option value="css">CSS</option>
            </select>
            <button type="button" class="action-btn" id="save-file-btn">Save</button>
            <button type="button" class="action-btn" id="run-file-btn">Run</button>
          </div>
        </div>
        <div id="editor-container" class="editor-container"></div>
        <div class="editor-bottom">
          <div class="editor-output-wrap">
            <div class="editor-panel-title">Run Output</div>
            <pre id="editor-output" class="editor-output"></pre>
          </div>
          <div class="editor-preview-wrap">
            <div class="editor-panel-title">Preview</div>
            <iframe id="editor-preview" class="editor-preview" title="HTML preview"></iframe>
          </div>
        </div>
      </section>
    </div>
  `;

  manager.open('code', 'Code Runner', body, {
    onReady: async node => {
      const monaco = await loadMonaco();
      const treeRoot = node.querySelector('#file-tree');
      const tabsRoot = node.querySelector('#editor-tabs');
      const editorOutput = node.querySelector('#editor-output');
      const editorPreview = node.querySelector('#editor-preview');
      const languageSelect = node.querySelector('#editor-language');
      const saveBtn = node.querySelector('#save-file-btn');
      const runBtn = node.querySelector('#run-file-btn');
      const newFileBtn = node.querySelector('#new-file-btn');
      const newFolderBtn = node.querySelector('#new-folder-btn');
      const container = node.querySelector('#editor-container');

      const editor = monaco.editor.create(container, {
        value: "print('TOXIBH OS is online')",
        language: 'python',
        theme: 'vs-dark',
        automaticLayout: true,
        minimap: { enabled: false },
        fontSize: 15,
        fontFamily: 'Share Tech Mono, monospace',
        scrollBeyondLastLine: false,
      });

      const state = {
        files: [],
        openTabs: [],
        activePath: null,
      };

      function inferLanguage(path) {
        const lower = (path || '').toLowerCase();
        if (lower.endsWith('.py')) return 'python';
        if (lower.endsWith('.js')) return 'javascript';
        if (lower.endsWith('.c')) return 'c';
        if (lower.endsWith('.cpp') || lower.endsWith('.cc') || lower.endsWith('.cxx')) return 'cpp';
        if (lower.endsWith('.java')) return 'java';
        if (lower.endsWith('.html') || lower.endsWith('.htm')) return 'html';
        if (lower.endsWith('.css')) return 'css';
        return 'plaintext';
      }

      function renderTabs() {
        tabsRoot.innerHTML = '';
        state.openTabs.forEach(tab => {
          const tabButton = document.createElement('button');
          tabButton.type = 'button';
          tabButton.className = `editor-tab ${state.activePath === tab.path ? 'active' : ''}`;
          tabButton.textContent = tab.name;
          tabButton.addEventListener('click', () => openTab(tab));
          tabsRoot.appendChild(tabButton);
        });
      }

      function openTab(tab) {
        state.activePath = tab.path;
        editor.setValue(tab.content);
        const inferred = inferLanguage(tab.path);
        monaco.editor.setModelLanguage(editor.getModel(), inferred === 'plaintext' ? 'python' : inferred);
        languageSelect.value = inferred === 'plaintext' ? 'python' : inferred;
        renderTabs();
      }

      async function refreshTree() {
        treeRoot.innerHTML = '<div class="file-node">Loading...</div>';
        const response = await fetch('/api/files');
        const data = await response.json();
        state.files = data.tree || [];
        treeRoot.innerHTML = '';
        if (!state.files.length) {
          treeRoot.innerHTML = '<div class="file-node">No project files yet.</div>';
          return;
        }
        state.files.forEach(item => {
          treeRoot.appendChild(renderTreeNode(item, async file => {
            const res = await fetch(`/api/files/open?path=${encodeURIComponent(file.path)}`);
            const fileData = await res.json();
            const existing = state.openTabs.find(tab => tab.path === file.path);
            const tab = existing || { path: file.path, name: file.name, content: fileData.content || '' };
            tab.content = fileData.content || '';
            if (!existing) state.openTabs.push(tab);
            openTab(tab);
            renderTabs();
          }));
        });
      }

      function updatePreview() {
        const language = languageSelect.value;
        if (language === 'html') {
          editorPreview.srcdoc = editor.getValue();
          editorPreview.classList.remove('hidden');
        } else {
          editorPreview.srcdoc = '<!doctype html><html><body style="font-family:sans-serif;padding:16px;color:#111;">Run HTML files to preview them here.</body></html>';
          editorPreview.classList.remove('hidden');
        }
      }

      editor.onDidChangeModelContent(() => {
        updatePreview();
      });

      saveBtn.addEventListener('click', async () => {
        if (!state.activePath) {
          editorOutput.textContent = 'Open a file first.';
          return;
        }
        const payload = { path: state.activePath, content: editor.getValue() };
        const response = await fetch('/api/files/save', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        const data = await response.json();
        editorOutput.textContent = response.ok ? `Saved ${data.path}` : (data.error || 'Save failed');
      });

      runBtn.addEventListener('click', async () => {
        editorOutput.textContent = 'Running...';
        const response = await fetch('/api/code/run', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ language: languageSelect.value, code: editor.getValue() }),
        });
        const data = await response.json();
        if ((languageSelect.value === 'html' || languageSelect.value === 'css') && data.htmlPreviewContent) {
          editorPreview.srcdoc = data.htmlPreviewContent;
        }
        const chunks = [];
        if (data.stdout) chunks.push(`STDOUT:\n${data.stdout}`);
        if (data.stderr) chunks.push(`STDERR:\n${data.stderr}`);
        if (data.error) chunks.push(`ERROR:\n${data.error}`);
        editorOutput.textContent = chunks.length ? chunks.join('\n\n') : `Exit code: ${data.exitCode ?? 'n/a'}`;
      });

      newFileBtn.addEventListener('click', async () => {
        const path = window.prompt('New file path relative to project root');
        if (!path) return;
        await fetch('/api/files/create', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ path }),
        });
        await refreshTree();
      });

      newFolderBtn.addEventListener('click', async () => {
        const path = window.prompt('New folder path relative to project root');
        if (!path) return;
        await fetch('/api/files/create', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ path, isFolder: true }),
        });
        await refreshTree();
      });

      languageSelect.addEventListener('change', () => {
        monaco.editor.setModelLanguage(editor.getModel(), languageSelect.value === 'cpp' ? 'cpp' : languageSelect.value);
        updatePreview();
      });

      await refreshTree();
      updatePreview();
    },
  });
}
