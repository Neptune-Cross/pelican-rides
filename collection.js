(() => {
  'use strict';

  const DB_NAME = 'pelican-rides';
  const DB_VERSION = 1;
  const STORE_NAME = 'uploads';
  const FAVORITES_KEY = 'pelican-rides:favorites';
  const MAX_FILE_SIZE = 20 * 1024 * 1024;
  const GITHUB_OWNER = 'Neptune-Cross';
  const GITHUB_REPO = 'pelican-rides';
  const GITHUB_BRANCH = 'main';
  const GITHUB_API_VERSION = '2026-03-10';
  const MANIFEST_PATH = 'uploads/manifest.json';
  const PAGES_ROOT = 'https://neptune-cross.github.io/pelican-rides/';
  const staticWorks = [...document.querySelectorAll('[data-work]')];
  const staticCount = staticWorks.length;
  const names = Object.fromEntries(staticWorks.map(work => [work.dataset.work, work.querySelector('h3').textContent]));
  const uploads = new Map();
  const publicWorks = new Map();
  const grid = document.querySelector('.works-grid');
  const toast = document.querySelector('.toast');
  const importDialog = document.getElementById('import-dialog');
  const viewerDialog = document.getElementById('upload-viewer');
  const fileInput = document.getElementById('html-upload');
  const dropZone = document.querySelector('[data-drop-zone]');
  const importList = document.getElementById('import-list');
  const importProgress = document.getElementById('import-progress');
  const confirmImportButton = document.querySelector('[data-confirm-import]');
  const githubAuth = document.getElementById('github-auth');
  const githubTokenInput = document.getElementById('github-token');
  const importModeCopy = document.getElementById('import-mode-copy');
  const storageNoteText = document.getElementById('storage-note-text');
  const uploadFrame = document.getElementById('upload-frame');
  const uploadViewerTitle = document.getElementById('upload-viewer-title');
  const playbackButton = document.querySelector('[data-toggle-upload]');
  let activeFilter = 'all';
  let importMode = 'public';
  let currentUploadId = null;
  let uploadPaused = false;
  let pendingImports = [];
  let toastTimer;
  let saved = new Set();

  try {
    const stored = JSON.parse(localStorage.getItem(FAVORITES_KEY) || '[]');
    if (Array.isArray(stored)) saved = new Set(stored.filter(id => typeof id === 'string'));
  } catch { /* 本地存储受限时，收藏仍可在当前页面使用。 */ }

  function announce(message) {
    clearTimeout(toastTimer);
    toast.textContent = message;
    toast.classList.add('visible');
    toastTimer = setTimeout(() => toast.classList.remove('visible'), 2600);
  }

  function escapeHtml(value) {
    return String(value).replace(/[&<>"]/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[character]);
  }

  function formatDate(timestamp) {
    const date = new Date(timestamp);
    const pad = value => String(value).padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
  }

  function openDatabase() {
    return new Promise((resolve, reject) => {
      if (!('indexedDB' in window)) {
        reject(new Error('当前浏览器不支持本地作品库'));
        return;
      }
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        if (!request.result.objectStoreNames.contains(STORE_NAME)) {
          request.result.createObjectStore(STORE_NAME, { keyPath: 'id' });
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error('无法打开本地作品库'));
    });
  }

  async function readUploads() {
    const database = await openDatabase();
    return new Promise((resolve, reject) => {
      const transaction = database.transaction(STORE_NAME, 'readonly');
      const request = transaction.objectStore(STORE_NAME).getAll();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error('无法读取本地作品'));
      transaction.oncomplete = () => database.close();
    });
  }

  async function storeUpload(upload) {
    const database = await openDatabase();
    return new Promise((resolve, reject) => {
      const transaction = database.transaction(STORE_NAME, 'readwrite');
      transaction.objectStore(STORE_NAME).put(upload);
      transaction.oncomplete = () => { database.close(); resolve(); };
      transaction.onerror = () => { database.close(); reject(transaction.error || new Error('作品保存失败')); };
    });
  }

  async function removeStoredUpload(id) {
    const database = await openDatabase();
    return new Promise((resolve, reject) => {
      const transaction = database.transaction(STORE_NAME, 'readwrite');
      transaction.objectStore(STORE_NAME).delete(id);
      transaction.oncomplete = () => { database.close(); resolve(); };
      transaction.onerror = () => { database.close(); reject(transaction.error || new Error('作品删除失败')); };
    });
  }

  function simpleHash(text) {
    let hash = 2166136261;
    for (let index = 0; index < text.length; index += 1) {
      hash ^= text.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0).toString(16).padStart(8, '0');
  }

  async function contentHash(html) {
    if (crypto.subtle) {
      const bytes = new TextEncoder().encode(html);
      const digest = await crypto.subtle.digest('SHA-256', bytes);
      return [...new Uint8Array(digest)].slice(0, 10).map(byte => byte.toString(16).padStart(2, '0')).join('');
    }
    return simpleHash(html);
  }

  async function contentId(html) {
    return `local-${await contentHash(html)}`;
  }

  function slugify(title) {
    const value = title.normalize('NFKC')
      .replace(/[<>:"/\\|?*\u0000-\u001f#%]/g, '-')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^[.\-]+|[.\-]+$/g, '')
      .toLowerCase();
    return [...(value || 'pelican-work')].slice(0, 72).join('');
  }

  function encodePath(path) {
    return path.split('/').map(encodeURIComponent).join('/');
  }

  function encodeBase64(text) {
    const bytes = new TextEncoder().encode(text);
    let binary = '';
    for (let offset = 0; offset < bytes.length; offset += 0x8000) {
      binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
    }
    return btoa(binary);
  }

  function decodeBase64(value) {
    const binary = atob(value.replace(/\s/g, ''));
    const bytes = Uint8Array.from(binary, character => character.charCodeAt(0));
    return new TextDecoder().decode(bytes);
  }

  async function githubRequest(endpoint, token, options = {}) {
    const response = await fetch(`https://api.github.com${endpoint}`, {
      ...options,
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${token}`,
        'X-GitHub-Api-Version': GITHUB_API_VERSION,
        ...options.headers
      }
    });
    if (response.ok) return response.status === 204 ? null : response.json();
    let detail = '';
    try { detail = (await response.json()).message || ''; } catch { /* 使用状态码错误信息。 */ }
    const messages = {
      401: 'Token 无效或已过期',
      403: 'Token 未选择 pelican-rides，或 Contents 不是 Read and write',
      404: '找不到仓库，请确认 Repository access 已选择 pelican-rides',
      409: '仓库内容刚被更新，请重新发布',
      422: 'GitHub 拒绝了文件内容或路径'
    };
    throw new Error(messages[response.status] || detail || `GitHub 请求失败（${response.status}）`);
  }

  async function readRepositoryFile(path, token, allowMissing = false) {
    try {
      return await githubRequest(`/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${encodePath(path)}?ref=${encodeURIComponent(GITHUB_BRANCH)}`, token);
    } catch (error) {
      if (allowMissing && error.message.startsWith('找不到仓库')) return null;
      throw error;
    }
  }

  async function writeRepositoryFile(path, content, message, token, sha) {
    const body = { message, content: encodeBase64(content), branch: GITHUB_BRANCH };
    if (sha) body.sha = sha;
    return githubRequest(`/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${encodePath(path)}`, token, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
  }

  function extractTitle(html, filename) {
    const documentCopy = new DOMParser().parseFromString(html, 'text/html');
    const detected = documentCopy.querySelector('title')?.textContent || documentCopy.querySelector('h1')?.textContent;
    const fallback = filename.replace(/\.html?$/i, '');
    return (detected || fallback || '未命名鹈鹕作品').replace(/\s+/g, ' ').trim().slice(0, 120);
  }

  function bridgeHtml(html) {
    const bridge = `<script>(()=>{const root=document.documentElement;function setPaused(paused){root.toggleAttribute('data-pelican-paused',paused);let style=document.getElementById('pelican-upload-playback');if(!style){style=document.createElement('style');style.id='pelican-upload-playback';style.textContent='html[data-pelican-paused] *,html[data-pelican-paused] *::before,html[data-pelican-paused] *::after{animation-play-state:paused!important}';document.head.append(style)}document.getAnimations?.().forEach(animation=>paused?animation.pause():animation.play())}addEventListener('message',event=>{if(event.data?.type==='pelican-playback')setPaused(Boolean(event.data.paused))})})();<\/script>`;
    return `${html}\n${bridge}`;
  }

  function createUploadCard(upload, position) {
    const article = document.createElement('article');
    article.className = 'work work-test work-uploaded';
    article.dataset.work = upload.id;
    article.dataset.uploaded = 'true';
    const title = escapeHtml(upload.title);
    const filename = escapeHtml(upload.filename);
    const date = formatDate(upload.fileModified);
    article.innerHTML = `
      <div class="work-cover">
        <iframe class="upload-preview" title="${title}预览" sandbox="" loading="lazy"></iframe>
        <button class="upload-open-cover" type="button" data-open-upload="${upload.id}" aria-label="观看${title}">观看${title}</button>
        <span class="cover-enter"><span data-icon="play" aria-hidden="true"></span></span>
        <span class="work-label"><span data-icon="file-up" aria-hidden="true"></span>本地上传</span>
        <button type="button" class="save-button" data-save="${upload.id}" aria-label="收藏${title}" aria-pressed="false" title="收藏${title}"><span data-icon="heart" aria-hidden="true"></span></button>
      </div>
      <div class="work-meta"><span>${String(position).padStart(2, '0')} / LOCAL HTML</span><span class="category-dot coast-dot"></span><span>${filename}</span></div>
      <button class="work-title" type="button" data-open-upload="${upload.id}"><h3>${title}</h3><span data-icon="arrow-up-right" aria-hidden="true"></span></button>
      <p class="work-description">保存在此浏览器中的单文件 HTML 作品。</p>
      <div class="work-footer"><span>文件时间 · ${date}</span><button class="remove-upload" type="button" data-remove-upload="${upload.id}"><span data-icon="trash-2" aria-hidden="true"></span>删除</button></div>`;
    article.querySelector('iframe').srcdoc = upload.html;
    return article;
  }

  function createPublicCard(work, position) {
    const article = document.createElement('article');
    article.className = 'work work-test work-published';
    article.dataset.work = work.id;
    article.dataset.public = 'true';
    const title = escapeHtml(work.title);
    const path = escapeHtml(work.path);
    const url = `${PAGES_ROOT}${work.path.split('/').map(encodeURIComponent).join('/')}`;
    article.innerHTML = `
      <div class="work-cover">
        <iframe class="upload-preview" title="${title}预览" sandbox="" loading="lazy" src="./${path}"></iframe>
        <a class="published-open-cover" href="./${path}" aria-label="打开${title}"></a>
        <span class="cover-enter"><span data-icon="play" aria-hidden="true"></span></span>
        <span class="work-label"><span data-icon="file-up" aria-hidden="true"></span>公开作品</span>
        <button type="button" class="save-button" data-save="${work.id}" aria-label="收藏${title}" aria-pressed="false" title="收藏${title}"><span data-icon="heart" aria-hidden="true"></span></button>
      </div>
      <div class="work-meta"><span>${String(position).padStart(2, '0')} / PUBLIC HTML</span><span class="category-dot wander-dot"></span><span>独立公开网址</span></div>
      <a class="work-title" href="./${path}"><h3>${title}</h3><span data-icon="arrow-up-right" aria-hidden="true"></span></a>
      <p class="work-description">已发布到 GitHub Pages，任何人都可以访问。</p>
      <div class="work-footer"><span>发布时间 · ${formatDate(Date.parse(work.publishedAt))}</span><button class="copy-link" type="button" data-copy-url="${escapeHtml(url)}"><span data-icon="copy" aria-hidden="true"></span>复制链接</button></div>`;
    return article;
  }

  function rebuildDynamicCards() {
    document.querySelectorAll('[data-uploaded="true"], [data-public="true"]').forEach(card => card.remove());
    const published = [...publicWorks.values()].sort((left, right) => Date.parse(left.publishedAt) - Date.parse(right.publishedAt));
    published.forEach((work, index) => {
      names[work.id] = work.title;
      grid.append(createPublicCard(work, staticCount + index + 1));
    });
    const local = [...uploads.values()].sort((left, right) => left.fileModified - right.fileModified || left.importedAt - right.importedAt);
    local.forEach((upload, index) => {
      names[upload.id] = upload.title;
      grid.append(createUploadCard(upload, staticCount + published.length + index + 1));
    });
    window.renderPelicanIcons?.(grid);
  }

  async function loadPublicWorks() {
    try {
      const response = await fetch(`./${MANIFEST_PATH}?v=${Date.now()}`, { cache: 'no-store' });
      if (!response.ok) return;
      const manifest = normalizeManifest(await response.json());
      publicWorks.clear();
      manifest.forEach(work => publicWorks.set(work.id, work));
      rebuildDynamicCards();
      render();
    } catch { /* 本地文件模式或网络暂时不可用时，只显示内置及本机作品。 */ }
  }

  function persistFavorites() {
    try {
      localStorage.setItem(FAVORITES_KEY, JSON.stringify([...saved]));
      return true;
    } catch {
      return false;
    }
  }

  function render() {
    const allWorks = [...document.querySelectorAll('[data-work]')];
    const total = staticCount + publicWorks.size + uploads.size;
    document.getElementById('all-count').textContent = total;
    document.getElementById('saved-count').textContent = [...saved].filter(id => names[id]).length;
    document.querySelector('.work-count').textContent = String(total).padStart(2, '0');
    document.querySelector('.caption-index').textContent = `01 / ${String(total).padStart(2, '0')}`;
    document.querySelectorAll('[data-save]').forEach(button => {
      const id = button.dataset.save;
      const isSaved = saved.has(id);
      button.hidden = false;
      button.setAttribute('aria-pressed', String(isSaved));
      button.setAttribute('aria-label', `${isSaved ? '取消收藏' : '收藏'}${names[id]}`);
      button.title = button.getAttribute('aria-label');
    });
    document.querySelectorAll('[data-filter]').forEach(button => {
      const active = button.dataset.filter === activeFilter;
      button.classList.toggle('active', active);
      button.setAttribute('aria-pressed', String(active));
    });
    let visibleCount = 0;
    allWorks.forEach(work => {
      const visible = activeFilter === 'all' || (activeFilter === 'saved' && saved.has(work.dataset.work));
      work.hidden = !visible;
      if (visible) visibleCount += 1;
    });
    const empty = document.querySelector('.empty-state');
    empty.hidden = visibleCount > 0;
    if (!empty.hidden) {
      document.getElementById('empty-title').textContent = '还没有收藏的旅程';
      const action = document.querySelector('[data-empty-action]');
      action.firstChild.textContent = '看看全部作品';
    }
  }

  function setImportMessage(message, isError = false) {
    importProgress.textContent = message;
    importProgress.classList.toggle('is-error', isError);
  }

  function updateConfirmState() {
    const missingName = pendingImports.some(item => !item.title.trim());
    const missingToken = importMode === 'public' && !githubTokenInput.value.trim();
    confirmImportButton.disabled = pendingImports.length === 0 || missingName || missingToken;
  }

  function setImportMode(mode) {
    importMode = mode === 'local' ? 'local' : 'public';
    document.querySelectorAll('[data-import-mode]').forEach(button => {
      const active = button.dataset.importMode === importMode;
      button.classList.toggle('active', active);
      button.setAttribute('aria-pressed', String(active));
    });
    const isPublic = importMode === 'public';
    githubAuth.hidden = !isPublic;
    importModeCopy.textContent = isPublic ? '发布后会生成独立网址，任何人都可以访问和分享。' : '作品只保存在当前浏览器，适合临时预览。';
    storageNoteText.textContent = isPublic ? '作品将提交到 GitHub，并在 Pages 发布后生成公开网址。' : '作品仅保存在当前浏览器，不会上传到服务器或同步到其他设备。';
    confirmImportButton.textContent = isPublic ? '公开发布' : '加入全部作品';
    setImportMessage(pendingImports.length ? (isPublic ? '确认名称和 Token 后即可公开发布。' : '确认名称后会并入全部作品。') : '');
    updateConfirmState();
  }

  function clearPendingImports() {
    pendingImports = [];
    importList.replaceChildren();
    importList.hidden = true;
    fileInput.value = '';
    updateConfirmState();
  }

  function renderPendingImports() {
    importList.replaceChildren();
    importList.hidden = pendingImports.length === 0;
    pendingImports.forEach((item, index) => {
      const row = document.createElement('div');
      row.className = 'import-item';
      const fileDetails = document.createElement('div');
      fileDetails.className = 'import-file';
      const filename = document.createElement('strong');
      filename.textContent = item.file.name;
      filename.title = item.file.name;
      const metadata = document.createElement('span');
      metadata.textContent = `${formatDate(item.file.lastModified || Date.now())} · ${(item.file.size / 1024).toFixed(1)} KB`;
      fileDetails.append(filename, metadata);
      const label = document.createElement('label');
      label.className = 'import-name';
      label.textContent = '作品名称';
      const input = document.createElement('input');
      input.type = 'text';
      input.maxLength = 120;
      input.value = item.title;
      input.dataset.uploadName = String(index);
      input.setAttribute('aria-label', `${item.file.name}的作品名称`);
      input.addEventListener('input', () => {
        item.title = input.value.slice(0, 120);
        updateConfirmState();
      });
      label.append(input);
      row.append(fileDetails, label);
      importList.append(row);
    });
    updateConfirmState();
  }

  function openImportDialog() {
    clearPendingImports();
    githubTokenInput.value = '';
    setImportMode('public');
    setImportMessage('');
    importDialog.showModal();
  }

  async function stageFiles(fileList) {
    const files = [...fileList];
    if (!files.length) return;
    clearPendingImports();
    setImportMessage(`正在读取 ${files.length} 个文件...`);
    for (const file of files) {
      try {
        if (!/\.html?$/i.test(file.name)) throw new Error(`${file.name} 不是 HTML 文件`);
        if (file.size > MAX_FILE_SIZE) throw new Error(`${file.name} 超过 20 MB`);
        const html = await file.text();
        if (!html.trim()) throw new Error(`${file.name} 是空文件`);
        pendingImports.push({ file, html, title: extractTitle(html, file.name) });
      } catch (error) {
        announce(error.message || '导入失败');
      }
    }
    fileInput.value = '';
    renderPendingImports();
    setImportMessage(pendingImports.length ? (importMode === 'public' ? '名称可以修改；填写 Token 后即可公开发布。' : '名称可以修改；确认后会加入全部作品。') : '没有可导入的 HTML 文件', pendingImports.length === 0);
    importList.querySelector('input')?.focus();
  }

  async function saveLocalImports() {
    if (!pendingImports.length || pendingImports.some(item => !item.title.trim())) return;
    const items = pendingImports.map(item => ({ ...item, title: item.title.trim() }));
    confirmImportButton.disabled = true;
    let completed = 0;
    setImportMessage(`正在加入 ${items.length} 部作品...`);
    for (const item of items) {
      try {
        const id = await contentId(item.html);
        const existing = uploads.get(id);
        const upload = {
          id,
          title: item.title.trim(),
          filename: item.file.name,
          html: item.html,
          size: item.file.size,
          fileModified: item.file.lastModified || Date.now(),
          importedAt: existing?.importedAt || Date.now()
        };
        await storeUpload(upload);
        uploads.set(id, upload);
        completed += 1;
      } catch (error) {
        announce(error.message || '导入失败');
      }
    }
    if (!completed) {
      confirmImportButton.disabled = false;
      setImportMessage('作品加入失败，请重试。', true);
      return;
    }
    rebuildDynamicCards();
    activeFilter = 'all';
    render();
    importDialog.close();
    document.getElementById('collection').scrollIntoView({ behavior: 'smooth', block: 'start' });
    announce(`已将 ${completed} 部作品加入全部作品`);
  }

  function normalizeManifest(value) {
    if (!Array.isArray(value)) return [];
    return value.filter(work => work && typeof work.id === 'string' && typeof work.title === 'string' && typeof work.path === 'string' && /^uploads\/[^/]+\.html$/i.test(work.path));
  }

  async function waitForPages(path) {
    if (location.protocol === 'file:') return true;
    const url = `${PAGES_ROOT}${path.split('/').map(encodeURIComponent).join('/')}`;
    for (let attempt = 0; attempt < 18; attempt += 1) {
      try {
        const response = await fetch(`${url}?published=${Date.now()}`, { cache: 'no-store' });
        if (response.ok) return true;
      } catch { /* Pages 部署期间继续等待。 */ }
      await new Promise(resolve => setTimeout(resolve, 5000));
    }
    return false;
  }

  async function publishImports() {
    const token = githubTokenInput.value.trim();
    if (!token || !pendingImports.length || pendingImports.some(item => !item.title.trim())) return;
    const items = pendingImports.map(item => ({ ...item, title: item.title.trim() }));
    confirmImportButton.disabled = true;
    try {
      setImportMessage('正在验证权限并读取公开作品清单...');
      const manifestFile = await readRepositoryFile(MANIFEST_PATH, token, true);
      let manifest = [];
      if (manifestFile?.content) {
        try { manifest = normalizeManifest(JSON.parse(decodeBase64(manifestFile.content))); }
        catch { throw new Error('公开作品清单格式错误，已停止发布'); }
      }
      const publishedNow = [];
      for (let index = 0; index < items.length; index += 1) {
        const item = items[index];
        const hash = await contentHash(item.html);
        const id = `public-${hash}`;
        const previous = manifest.find(work => work.id === id);
        const path = previous?.path || `uploads/${slugify(item.title)}-${hash.slice(0, 8)}.html`;
        setImportMessage(`正在提交 ${index + 1} / ${items.length}：${item.title}`);
        const repositoryFile = await readRepositoryFile(path, token, true);
        await writeRepositoryFile(path, item.html, `发布鹈鹕作品：${item.title}`, token, repositoryFile?.sha);
        const record = {
          id,
          title: item.title.trim(),
          path,
          sourceFilename: item.file.name,
          size: item.file.size,
          fileModified: item.file.lastModified || Date.now(),
          publishedAt: previous?.publishedAt || new Date().toISOString()
        };
        const existingIndex = manifest.findIndex(work => work.id === id);
        if (existingIndex >= 0) manifest[existingIndex] = record;
        else manifest.push(record);
        publishedNow.push(record);
      }
      setImportMessage('正在更新合集清单...');
      await writeRepositoryFile(MANIFEST_PATH, `${JSON.stringify(manifest, null, 2)}\n`, `更新鹈鹕公开合集（${publishedNow.length} 部）`, token, manifestFile?.sha);
      publicWorks.clear();
      manifest.forEach(work => publicWorks.set(work.id, work));
      rebuildDynamicCards();
      activeFilter = 'all';
      render();
      githubTokenInput.value = '';
      setImportMessage('文件已提交，正在等待 GitHub Pages 生成公开网址...');
      const ready = await waitForPages(publishedNow[publishedNow.length - 1].path);
      importDialog.close();
      document.getElementById('collection').scrollIntoView({ behavior: 'smooth', block: 'start' });
      announce(ready ? `已公开发布 ${publishedNow.length} 部作品，可复制独立链接` : '已提交到 GitHub，Pages 正在发布，请稍后打开链接');
    } catch (error) {
      githubTokenInput.value = '';
      setImportMessage(error.message || '公开发布失败', true);
      updateConfirmState();
    }
  }

  function confirmPendingImports() {
    return importMode === 'public' ? publishImports() : saveLocalImports();
  }

  function renderPlaybackButton() {
    const label = uploadPaused ? '播放动画' : '暂停动画';
    playbackButton.setAttribute('aria-label', label);
    playbackButton.title = label;
    playbackButton.setAttribute('aria-pressed', String(uploadPaused));
    playbackButton.querySelector('[data-icon]').dataset.icon = uploadPaused ? 'play' : 'pause';
    window.renderPelicanIcons?.(playbackButton);
  }

  function sendPlaybackState() {
    uploadFrame.contentWindow?.postMessage({ type: 'pelican-playback', paused: uploadPaused }, '*');
  }

  function openUpload(id) {
    const upload = uploads.get(id);
    if (!upload) return;
    currentUploadId = id;
    uploadPaused = matchMedia('(prefers-reduced-motion: reduce)').matches;
    uploadViewerTitle.textContent = upload.title;
    uploadFrame.title = upload.title;
    uploadFrame.srcdoc = bridgeHtml(upload.html);
    renderPlaybackButton();
    viewerDialog.showModal();
  }

  function closeUploadViewer() {
    if (viewerDialog.open) viewerDialog.close();
    uploadFrame.removeAttribute('srcdoc');
    uploadFrame.src = 'about:blank';
    currentUploadId = null;
  }

  async function deleteUpload(id) {
    const upload = uploads.get(id);
    if (!upload || !confirm(`确定从当前浏览器删除《${upload.title}》吗？`)) return;
    try {
      await removeStoredUpload(id);
      uploads.delete(id);
      delete names[id];
      saved.delete(id);
      persistFavorites();
      if (currentUploadId === id) closeUploadViewer();
      rebuildDynamicCards();
      render();
      announce(`已删除《${upload.title}》`);
    } catch (error) {
      announce(error.message || '删除失败');
    }
  }

  function downloadCurrentUpload() {
    const upload = uploads.get(currentUploadId);
    if (!upload) return;
    const url = URL.createObjectURL(new Blob([upload.html], { type: 'text/html;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = upload.filename;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  async function copyPublicLink(url) {
    try {
      await navigator.clipboard.writeText(url);
      announce('独立网址已复制');
    } catch {
      const input = document.createElement('textarea');
      input.value = url;
      input.setAttribute('readonly', '');
      input.style.position = 'fixed';
      input.style.opacity = '0';
      document.body.append(input);
      input.select();
      document.execCommand('copy');
      input.remove();
      announce('独立网址已复制');
    }
  }

  document.addEventListener('click', event => {
    const copyButton = event.target.closest('[data-copy-url]');
    if (copyButton) {
      copyPublicLink(copyButton.dataset.copyUrl);
      return;
    }
    const saveButton = event.target.closest('[data-save]');
    if (saveButton) {
      const id = saveButton.dataset.save;
      saved.has(id) ? saved.delete(id) : saved.add(id);
      const persisted = persistFavorites();
      render();
      if (activeFilter === 'saved' && !saved.has(id)) document.querySelector('[data-filter="saved"]').focus();
      announce(persisted ? `${saved.has(id) ? '已收藏' : '已取消收藏'}《${names[id]}》` : '浏览器限制存储，收藏仅在本次页面有效');
      return;
    }
    const filterButton = event.target.closest('[data-filter]');
    if (filterButton) {
      activeFilter = filterButton.dataset.filter;
      render();
      return;
    }
    const openButton = event.target.closest('[data-open-upload]');
    if (openButton) {
      openUpload(openButton.dataset.openUpload);
      return;
    }
    const removeButton = event.target.closest('[data-remove-upload]');
    if (removeButton) {
      deleteUpload(removeButton.dataset.removeUpload);
      return;
    }
    const emptyAction = event.target.closest('[data-empty-action]');
    if (emptyAction) {
      activeFilter = 'all';
      render();
      document.querySelector('[data-filter="all"]').focus();
    }
  });

  document.querySelectorAll('[data-open-import]').forEach(button => button.addEventListener('click', openImportDialog));
  document.querySelectorAll('[data-close-import]').forEach(button => button.addEventListener('click', () => importDialog.close()));
  document.querySelectorAll('[data-import-mode]').forEach(button => button.addEventListener('click', () => setImportMode(button.dataset.importMode)));
  githubTokenInput.addEventListener('input', updateConfirmState);
  confirmImportButton.addEventListener('click', confirmPendingImports);
  fileInput.addEventListener('change', () => stageFiles(fileInput.files));
  ['dragenter', 'dragover'].forEach(type => dropZone.addEventListener(type, event => {
    event.preventDefault();
    dropZone.classList.add('is-dragging');
  }));
  ['dragleave', 'drop'].forEach(type => dropZone.addEventListener(type, event => {
    event.preventDefault();
    dropZone.classList.remove('is-dragging');
  }));
  dropZone.addEventListener('drop', event => stageFiles(event.dataTransfer.files));
  importDialog.addEventListener('click', event => { if (event.target === importDialog) importDialog.close(); });
  importDialog.addEventListener('close', () => {
    githubTokenInput.value = '';
    clearPendingImports();
  });

  document.querySelector('[data-close-viewer]').addEventListener('click', closeUploadViewer);
  document.querySelector('[data-restart-upload]').addEventListener('click', () => {
    const upload = uploads.get(currentUploadId);
    if (!upload) return;
    uploadPaused = false;
    uploadFrame.srcdoc = bridgeHtml(upload.html);
    renderPlaybackButton();
  });
  playbackButton.addEventListener('click', () => {
    uploadPaused = !uploadPaused;
    renderPlaybackButton();
    sendPlaybackState();
  });
  document.querySelector('[data-download-upload]').addEventListener('click', downloadCurrentUpload);
  document.querySelector('[data-delete-upload]').addEventListener('click', () => deleteUpload(currentUploadId));
  uploadFrame.addEventListener('load', sendPlaybackState);
  viewerDialog.addEventListener('cancel', event => { event.preventDefault(); closeUploadViewer(); });

  document.querySelectorAll('[data-random]').forEach(link => {
    link.addEventListener('click', event => {
      const ids = [...staticWorks.map(work => work.dataset.work), ...publicWorks.keys(), ...uploads.keys()];
      const id = ids[Math.floor(Math.random() * ids.length)];
      if (uploads.has(id)) {
        event.preventDefault();
        openUpload(id);
      } else if (publicWorks.has(id)) {
        link.href = `./${publicWorks.get(id).path}`;
      } else {
        link.href = `./${id}.html`;
      }
    });
  });

  window.addEventListener('storage', event => {
    if (event.key !== FAVORITES_KEY && event.key !== null) return;
    try {
      const value = JSON.parse(event.newValue || '[]');
      saved = new Set(Array.isArray(value) ? value.filter(id => typeof id === 'string') : []);
      render();
    } catch { /* 忽略其它标签页中无效的存储值。 */ }
  });

  document.querySelector('.filters').hidden = false;
  setImportMode('public');
  render();
  loadPublicWorks();
  readUploads().then(records => {
    records.forEach(upload => uploads.set(upload.id, upload));
    rebuildDynamicCards();
    render();
  }).catch(error => {
    announce(error.message || '无法加载本地作品库');
  });
})();
