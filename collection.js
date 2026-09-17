(() => {
  'use strict';

  const DB_NAME = 'pelican-rides';
  const DB_VERSION = 1;
  const STORE_NAME = 'uploads';
  const FAVORITES_KEY = 'pelican-rides:favorites';
  const MAX_FILE_SIZE = 20 * 1024 * 1024;
  const staticWorks = [...document.querySelectorAll('[data-work]')];
  const staticCount = staticWorks.length;
  const names = Object.fromEntries(staticWorks.map(work => [work.dataset.work, work.querySelector('h3').textContent]));
  const uploads = new Map();
  const grid = document.querySelector('.works-grid');
  const toast = document.querySelector('.toast');
  const importDialog = document.getElementById('import-dialog');
  const viewerDialog = document.getElementById('upload-viewer');
  const fileInput = document.getElementById('html-upload');
  const dropZone = document.querySelector('[data-drop-zone]');
  const importProgress = document.getElementById('import-progress');
  const uploadFrame = document.getElementById('upload-frame');
  const uploadViewerTitle = document.getElementById('upload-viewer-title');
  const playbackButton = document.querySelector('[data-toggle-upload]');
  let activeFilter = 'all';
  let currentUploadId = null;
  let uploadPaused = false;
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

  async function contentId(html) {
    if (crypto.subtle) {
      const bytes = new TextEncoder().encode(html);
      const digest = await crypto.subtle.digest('SHA-256', bytes);
      return `local-${[...new Uint8Array(digest)].slice(0, 10).map(byte => byte.toString(16).padStart(2, '0')).join('')}`;
    }
    return `local-${simpleHash(html)}`;
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

  function rebuildUploadCards() {
    document.querySelectorAll('[data-uploaded="true"]').forEach(card => card.remove());
    const ordered = [...uploads.values()].sort((left, right) => left.fileModified - right.fileModified || left.importedAt - right.importedAt);
    ordered.forEach((upload, index) => {
      names[upload.id] = upload.title;
      grid.append(createUploadCard(upload, staticCount + index + 1));
    });
    window.renderPelicanIcons?.(grid);
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
    const uploadedCount = uploads.size;
    const total = staticCount + uploadedCount;
    document.getElementById('all-count').textContent = total;
    document.getElementById('uploaded-count').textContent = uploadedCount;
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
      const visible = activeFilter === 'all' || (activeFilter === 'saved' && saved.has(work.dataset.work)) || (activeFilter === 'uploaded' && work.dataset.uploaded === 'true');
      work.hidden = !visible;
      if (visible) visibleCount += 1;
    });
    const empty = document.querySelector('.empty-state');
    empty.hidden = visibleCount > 0;
    if (!empty.hidden) {
      const uploadedEmpty = activeFilter === 'uploaded';
      document.getElementById('empty-title').textContent = uploadedEmpty ? '还没有上传的作品' : '还没有收藏的旅程';
      const action = document.querySelector('[data-empty-action]');
      action.firstChild.textContent = uploadedEmpty ? '导入第一部作品' : '看看全部作品';
      action.dataset.action = uploadedEmpty ? 'import' : 'all';
    }
  }

  function setImportMessage(message, isError = false) {
    importProgress.textContent = message;
    importProgress.classList.toggle('is-error', isError);
  }

  function openImportDialog() {
    setImportMessage('');
    importDialog.showModal();
  }

  async function importFiles(fileList) {
    const files = [...fileList];
    if (!files.length) return;
    let completed = 0;
    setImportMessage(`正在读取 ${files.length} 个文件...`);
    for (const file of files) {
      try {
        if (!/\.html?$/i.test(file.name)) throw new Error(`${file.name} 不是 HTML 文件`);
        if (file.size > MAX_FILE_SIZE) throw new Error(`${file.name} 超过 20 MB`);
        const html = await file.text();
        if (!html.trim()) throw new Error(`${file.name} 是空文件`);
        const id = await contentId(html);
        const existing = uploads.get(id);
        const upload = {
          id,
          title: extractTitle(html, file.name),
          filename: file.name,
          html,
          size: file.size,
          fileModified: file.lastModified || Date.now(),
          importedAt: existing?.importedAt || Date.now()
        };
        await storeUpload(upload);
        uploads.set(id, upload);
        completed += 1;
        setImportMessage(`已处理 ${completed} / ${files.length}：${upload.title}`);
      } catch (error) {
        setImportMessage(error.message || '导入失败', true);
        announce(error.message || '导入失败');
      }
    }
    fileInput.value = '';
    if (!completed) return;
    rebuildUploadCards();
    activeFilter = 'uploaded';
    render();
    importDialog.close();
    document.getElementById('collection').scrollIntoView({ behavior: 'smooth', block: 'start' });
    announce(`已加入 ${completed} 部本地作品`);
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
      rebuildUploadCards();
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

  document.addEventListener('click', event => {
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
      if (emptyAction.dataset.action === 'import') openImportDialog();
      else { activeFilter = 'all'; render(); document.querySelector('[data-filter="all"]').focus(); }
    }
  });

  document.querySelectorAll('[data-open-import]').forEach(button => button.addEventListener('click', openImportDialog));
  document.querySelector('[data-close-import]').addEventListener('click', () => importDialog.close());
  fileInput.addEventListener('change', () => importFiles(fileInput.files));
  ['dragenter', 'dragover'].forEach(type => dropZone.addEventListener(type, event => {
    event.preventDefault();
    dropZone.classList.add('is-dragging');
  }));
  ['dragleave', 'drop'].forEach(type => dropZone.addEventListener(type, event => {
    event.preventDefault();
    dropZone.classList.remove('is-dragging');
  }));
  dropZone.addEventListener('drop', event => importFiles(event.dataTransfer.files));
  importDialog.addEventListener('click', event => { if (event.target === importDialog) importDialog.close(); });

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
      const ids = [...staticWorks.map(work => work.dataset.work), ...uploads.keys()];
      const id = ids[Math.floor(Math.random() * ids.length)];
      if (uploads.has(id)) {
        event.preventDefault();
        openUpload(id);
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
  render();
  readUploads().then(records => {
    records.forEach(upload => uploads.set(upload.id, upload));
    rebuildUploadCards();
    render();
  }).catch(error => {
    document.querySelectorAll('[data-open-import]').forEach(button => button.disabled = true);
    announce(error.message || '无法加载本地作品库');
  });
})();
