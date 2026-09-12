(() => {
  const works = ['coast', 'wander', 'wind'];
  const names = { coast: '海岸骑行', wander: '漫游记', wind: '破风骑行' };
  const storageKey = 'pelican-rides:favorites';
  const toast = document.querySelector('.toast');
  let saved = new Set();
  let activeFilter = 'all';
  let toastTimer;
  try {
    const stored = JSON.parse(localStorage.getItem(storageKey) || '[]');
    if (Array.isArray(stored)) saved = new Set(stored.filter(id => works.includes(id)));
  } catch { /* 本地存储受限时，收藏仍可在当前页面使用。 */ }
  function announce(message) {
    clearTimeout(toastTimer);
    toast.textContent = message;
    toast.classList.add('visible');
    toastTimer = setTimeout(() => toast.classList.remove('visible'), 2500);
  }
  function render() {
    document.getElementById('saved-count').textContent = saved.size;
    document.querySelectorAll('[data-save]').forEach(button => {
      const id = button.dataset.save;
      button.setAttribute('aria-pressed', String(saved.has(id)));
      button.setAttribute('aria-label', `${saved.has(id) ? '取消收藏' : '收藏'}${names[id]}`);
      button.title = button.getAttribute('aria-label');
    });
    document.querySelectorAll('[data-filter]').forEach(button => {
      const active = button.dataset.filter === activeFilter;
      button.classList.toggle('active', active);
      button.setAttribute('aria-pressed', String(active));
    });
    document.querySelectorAll('[data-work]').forEach(work => {
      work.hidden = activeFilter === 'saved' && !saved.has(work.dataset.work);
    });
    document.querySelector('.empty-state').hidden = activeFilter !== 'saved' || saved.size > 0;
  }
  document.querySelectorAll('[data-save]').forEach(button => {
    button.hidden = false;
    button.addEventListener('click', () => {
      const id = button.dataset.save;
      saved.has(id) ? saved.delete(id) : saved.add(id);
      let persisted = true;
      try { localStorage.setItem(storageKey, JSON.stringify([...saved])); } catch { persisted = false; }
      render();
      if (activeFilter === 'saved' && !saved.has(id)) document.querySelector('[data-filter="saved"]').focus();
      announce(persisted ? `${saved.has(id) ? '已收藏' : '已取消收藏'}《${names[id]}》` : '浏览器限制存储，收藏仅在本次页面有效');
    });
  });
  document.querySelector('.filters').hidden = false;
  document.querySelectorAll('[data-filter]').forEach(button => {
    button.addEventListener('click', () => { activeFilter = button.dataset.filter; render(); });
  });
  document.querySelector('[data-show-all]').addEventListener('click', () => {
    activeFilter = 'all'; render();
    document.querySelector('[data-filter="all"]').focus();
  });
  document.querySelectorAll('[data-random]').forEach(link => {
    link.addEventListener('click', () => { link.href = `./${works[Math.floor(Math.random() * works.length)]}.html`; });
  });
  window.addEventListener('storage', event => {
    if (event.key !== storageKey && event.key !== null) return;
    try {
      const value = JSON.parse(event.newValue || '[]');
      saved = new Set(Array.isArray(value) ? value.filter(id => works.includes(id)) : []);
      render();
    } catch { /* 忽略其它标签页中无效的存储值。 */ }
  });
  render();
})();
