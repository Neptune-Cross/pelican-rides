(() => {
  if (new URLSearchParams(location.search).has('embed')) return;
  const entries = [
    { id: 'coast', title: '海岸骑行' },
    { id: 'wander', title: '漫游记' },
    { id: 'wind', title: '破风骑行' }
  ];
  const index = entries.findIndex(entry => location.pathname.endsWith(`/${entry.id}.html`));
  if (index < 0) return;
  const current = entries[index];
  const previous = entries[(index + entries.length - 1) % entries.length];
  const next = entries[(index + 1) % entries.length];
  const root = document.documentElement;
  const originalPause = document.getElementById('pause');
  const originalSpeed = document.getElementById('speed');
  const originalTheme = document.getElementById('themeToggle');
  const header = document.createElement('header');
  header.className = 'viewer-header';
  header.innerHTML = `<a class="viewer-home" href="./index.html#collection"><span data-icon="layout-grid" aria-hidden="true"></span>鹈鹕合集</a><h1>${current.title}</h1><span class="viewer-number">0${index + 1} / 03</span>`;
  const footer = document.createElement('footer');
  footer.className = 'viewer-footer';
  footer.innerHTML = `<a class="viewer-switch" href="./${previous.id}.html" title="上一部：${previous.title}" aria-label="上一部：${previous.title}"><span data-icon="arrow-left" aria-hidden="true"></span><span>${previous.title}</span></a>
    <div class="viewer-controls"><button class="viewer-button" type="button" id="viewer-pause" aria-label="暂停动画" title="暂停动画"><span data-icon="pause" aria-hidden="true"></span></button><label class="viewer-speed"><input id="viewer-speed" type="range" min="0.5" max="2" step="0.1" value="1" aria-label="骑行速度"><output for="viewer-speed">1.0x</output></label>${originalTheme ? '<button class="viewer-button" type="button" id="viewer-theme"><span data-icon="moon" aria-hidden="true"></span></button>' : ''}</div>
    <a class="viewer-switch" href="./${next.id}.html" title="下一部：${next.title}" aria-label="下一部：${next.title}"><span>${next.title}</span><span data-icon="arrow-right" aria-hidden="true"></span></a>`;
  document.body.prepend(header);
  document.body.append(footer);
  root.setAttribute('data-viewer', current.id);
  const pauseButton = document.getElementById('viewer-pause');
  const speedInput = document.getElementById('viewer-speed');
  const themeButton = document.getElementById('viewer-theme');
  const motionPreference = matchMedia('(prefers-reduced-motion: reduce)');
  let userPaused = motionPreference.matches;
  function renderIcons() { window.renderPelicanIcons?.(header); window.renderPelicanIcons?.(footer); }
  function applyPlayback() {
    const paused = userPaused || document.hidden;
    root.toggleAttribute('data-paused', paused);
    if (originalPause && document.getElementById('scene').classList.contains('paused') !== paused) originalPause.click();
    pauseButton.setAttribute('aria-label', userPaused ? '播放动画' : '暂停动画');
    pauseButton.title = pauseButton.getAttribute('aria-label');
    pauseButton.setAttribute('aria-pressed', String(userPaused));
    pauseButton.querySelector('[data-icon]').dataset.icon = userPaused ? 'play' : 'pause';
    renderIcons();
  }
  function renderTheme() {
    if (!themeButton) return;
    const dark = root.getAttribute('data-theme') === 'dark';
    themeButton.setAttribute('aria-label', dark ? '切换到白昼' : '切换到夜间');
    themeButton.title = themeButton.getAttribute('aria-label');
    themeButton.querySelector('[data-icon]').dataset.icon = dark ? 'sun' : 'moon';
    renderIcons();
  }
  pauseButton.addEventListener('click', () => { userPaused = !userPaused; applyPlayback(); });
  document.addEventListener('visibilitychange', applyPlayback);
  motionPreference.addEventListener('change', event => { userPaused = event.matches; applyPlayback(); });
  speedInput.addEventListener('input', () => {
    const rate = Number(speedInput.value);
    footer.querySelector('output').textContent = `${rate.toFixed(1)}x`;
    if (originalSpeed) { originalSpeed.value = rate; originalSpeed.dispatchEvent(new Event('input')); }
    else document.getAnimations().forEach(animation => animation.updatePlaybackRate(rate));
  });
  themeButton?.addEventListener('click', () => { originalTheme.click(); renderTheme(); });
  renderTheme();
  applyPlayback();
})();
