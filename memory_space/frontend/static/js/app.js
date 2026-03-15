const pageType = document.body.dataset.pageType;
const pageScope = document.body.dataset.pageScope === 'public' ? 'public' : 'personal';
const pageMode = document.body.dataset.pageMode === 'readonly' ? 'readonly' : 'editable';
const publicApiBase = `/api/${pageType}/public`;
const personalApiBase = `/api/${pageType}/personal`;
const readApiBase = pageScope === 'public' ? publicApiBase : personalApiBase;
const writeApiBase = personalApiBase;
const routeScope = pageScope;
const fallbackDefaultLocale = 'zh-Hans';
const fallbackAppFontFamily = '"Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif';
const localeStorageKey = 'memory_space_locale';
const fontStorageKey = 'memory_space_custom_font_family';
const appVersion = window.__APP_VERSION__ || 'dev';
const themeStorageKey = 'memory_space_theme_mode';
const themePresetStoragePrefix = 'memory_space_theme_preset_';
const statusPollIntervalMs = 15000;

const fallbackColorConfig = {
  default_music: '#6d5efc',
  default_mind: '#18a999',
  allow_custom: true,
  forbidden_colors: ['#ffffff', '#fff'],
  presets: [
    { name: 'Indigo', value: '#6d5efc' },
    { name: 'Teal', value: '#18a999' },
  ],
};

const fallbackThemeConfig = {
  light: {
    solid: [
      {
        id: 'fallback-light-solid',
        name: 'Default Light',
        gradient: 'linear-gradient(180deg, #f8faff 0%, #f3f5fb 100%)',
        accent: '#4f46e5',
        accent_strong: '#4338ca',
        accent_soft: '#a5b4fc',
      },
    ],
    gradient: [],
  },
  dark: {
    solid: [
      {
        id: 'fallback-dark-solid',
        name: 'Default Dark',
        gradient: 'radial-gradient(circle at top, #1a2233 0%, #0f1420 58%)',
        accent: '#60a5fa',
        accent_strong: '#3b82f6',
        accent_soft: '#93c5fd',
      },
    ],
    gradient: [],
  },
};

const searchFieldOptions = pageType === 'music'
  ? [
      { key: 'title' },
      { key: 'artist' },
      { key: 'tags' },
      { key: 'short_desc' },
      { key: 'long_desc' },
      { key: 'links' },
      { key: 'memory_time' },
    ]
  : [
      { key: 'title' },
      { key: 'tags' },
      { key: 'short_desc' },
      { key: 'long_desc' },
      { key: 'memory_time' },
    ];

const defaultSearchFields = pageType === 'music' ? ['title', 'artist'] : ['title'];
const fontPresetCandidates = [
  { label: 'Microsoft YaHei', value: '"Microsoft YaHei"' },
  { label: 'Segoe UI', value: '"Segoe UI"' },
  { label: 'PingFang SC', value: '"PingFang SC"' },
  { label: 'Hiragino Sans GB', value: '"Hiragino Sans GB"' },
  { label: 'Roboto', value: '"Roboto"' },
  { label: 'Noto Sans', value: '"Noto Sans"' },
  { label: 'Noto Sans CJK SC', value: '"Noto Sans CJK SC"' },
  { label: 'Helvetica Neue', value: '"Helvetica Neue"' },
  { label: 'Arial', value: '"Arial"' },
  { label: 'Ubuntu', value: '"Ubuntu"' },
  { label: 'Cantarell', value: '"Cantarell"' },
  { label: 'Source Han Sans SC', value: '"Source Han Sans SC"' },
];

const state = {
  items: [],
  filteredItems: [],
  selectedId: null,
  mode: 'create',
  pendingDeleteId: null,
  linkOptions: [],
  colorConfig: { ...fallbackColorConfig },
  searchFields: new Set(defaultSearchFields),
  locale: fallbackDefaultLocale,
  supportedLocales: [fallbackDefaultLocale],
  defaultLocale: fallbackDefaultLocale,
  localeLabels: {},
  localeFlags: {},
  messages: {},
  appFontFamily: fallbackAppFontFamily,
  customFontFamily: '',
  fontOptions: [],
  fontSource: 'preset',
  fontSelectionEnabled: false,
  themeMode: 'system',
  themeConfig: { ...fallbackThemeConfig },
  themePresetByMode: { light: '', dark: '' },
  systemStatus: {
    latestVersion: '',
    versionMatched: null,
    serviceHealthy: null,
  },
  hiddenSpace: false,
  coverCandidatesCache: new Map(),
  coverResolvePromiseCache: new Map(),
  neteaseResolveCache: new Map(),
};
let currentMarkdownEditor = null;
let statusPollTimer = null;
let toolbarLayoutBound = false;
let themeSwitchTimer = null;
const colorSchemeMedia = window.matchMedia('(prefers-color-scheme: dark)');

const detailPanel = document.getElementById('detailPanel');
const detailInner = document.getElementById('detailInner');
const panelCloseBtn = document.getElementById('panelCloseBtn');
const memoryGrid = document.getElementById('memoryGrid');
const searchInput = document.getElementById('searchInput');
const addBtn = document.getElementById('addBtn');
const formModalOverlay = document.getElementById('formModalOverlay');
const deleteModalOverlay = document.getElementById('deleteModalOverlay');
const formModalTitle = document.getElementById('formModalTitle');
const memoryForm = document.getElementById('memoryForm');
const confirmDeleteBtn = document.getElementById('confirmDeleteBtn');
const toolbar = document.querySelector('.toolbar');
const pageTitleEl = document.getElementById('pageTitle');
const detailPlaceholderEl = document.getElementById('detailPlaceholder');
const deleteModalTitleEl = document.getElementById('deleteModalTitle');
const deleteModalTextEl = document.getElementById('deleteModalText');
const deleteCancelBtn = document.getElementById('deleteCancelBtn');

const escapeHtml = (value) => String(value ?? '')
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;')
  .replaceAll("'", '&#39;');

function t(key, fallback = '') {
  return state.messages[key] || fallback || key;
}

function localeLabel(locale) {
  return state.localeLabels[locale] || t(`lang.${locale}`, locale);
}

function localeFlag(locale) {
  return state.localeFlags[locale] || '🏳️';
}

function applyAppFontFamily(fontFamily) {
  const raw = (fontFamily || '').toString().trim();
  const fallback = '"Microsoft YaHei", sans-serif';
  if (!raw) {
    document.documentElement.style.setProperty('--app-font-family', fallbackAppFontFamily);
    return;
  }
  const lower = raw.toLowerCase();
  const normalized = lower.includes('microsoft yahei')
    ? `${raw}, sans-serif`
    : `${raw}, ${fallback}`;
  document.documentElement.style.setProperty('--app-font-family', normalized);
}

function stripQuotes(value) {
  return (value || '').toString().trim().replace(/^["']|["']$/g, '');
}

function getPrimaryFontFromStack(stack) {
  const first = (stack || '').toString().split(',')[0] || '';
  return stripQuotes(first);
}

function isFontAvailable(fontName) {
  const family = stripQuotes(fontName);
  if (!family) return false;
  if (document.fonts && typeof document.fonts.check === 'function') {
    try {
      if (document.fonts.check(`16px "${family}"`)) return true;
    } catch {}
  }
  return false;
}

function normalizeCustomFontFamily(value) {
  return (value || '')
    .toString()
    .replace(/[\r\n]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function saveCustomFontFamily(value) {
  const normalized = normalizeCustomFontFamily(value);
  state.customFontFamily = normalized;
  if (normalized) {
    localStorage.setItem(fontStorageKey, normalized);
  } else {
    localStorage.removeItem(fontStorageKey);
  }
}

function applyEffectiveFontFamily() {
  const preferred = state.customFontFamily || state.appFontFamily;
  applyAppFontFamily(preferred);
}

async function rebuildFontOptions() {
  const options = [];
  const seen = new Set();
  const pushOption = (value, label) => {
    const key = stripQuotes(value).toLowerCase();
    if (!key || seen.has(key)) return;
    seen.add(key);
    options.push({ value, label });
  };

  const defaultPrimary = getPrimaryFontFromStack(state.appFontFamily);
  if (defaultPrimary) {
    pushOption(`"${defaultPrimary}"`, `${t('settings.font.defaultFromConfig', 'Default (from config)')}: ${defaultPrimary}`);
  }

  let localFontLoaded = false;
  if (typeof window.queryLocalFonts === 'function') {
    try {
      const localFonts = await window.queryLocalFonts();
      localFonts.forEach((font) => {
        const family = stripQuotes(font?.family || '');
        if (!family) return;
        pushOption(`"${family}"`, family);
      });
      localFontLoaded = options.length > 1;
    } catch (error) {
      console.warn('queryLocalFonts unavailable or denied:', error);
    }
  }

  fontPresetCandidates.forEach((item) => {
    const primary = getPrimaryFontFromStack(item.value);
    if (primary && (isFontAvailable(primary) || !localFontLoaded)) {
      pushOption(item.value, item.label);
    }
  });

  if (!options.length) {
    pushOption('"Microsoft YaHei"', 'Microsoft YaHei');
  }

  state.fontSource = localFontLoaded ? 'local' : 'preset';
  state.fontSelectionEnabled = localFontLoaded;
  state.fontOptions = options;
}

function normalizeThemeMode(raw) {
  const value = (raw || '').toString().trim();
  return ['light', 'dark', 'system'].includes(value) ? value : 'system';
}

function resolveThemeMode(mode) {
  if (mode === 'system') {
    return colorSchemeMedia.matches ? 'dark' : 'light';
  }
  return mode;
}

function getThemePresetStorageKey(mode) {
  return `${themePresetStoragePrefix}${mode}`;
}

function getThemePresetsForMode(mode) {
  const data = state.themeConfig?.[mode] || {};
  const solid = Array.isArray(data.solid) ? data.solid : [];
  const gradient = Array.isArray(data.gradient) ? data.gradient : [];
  return { solid, gradient, all: [...solid, ...gradient] };
}

function ensureThemePreset(mode, { preferStored = true } = {}) {
  const presets = getThemePresetsForMode(mode).all;
  if (!presets.length) return null;
  const stored = localStorage.getItem(getThemePresetStorageKey(mode)) || '';
  let currentId = preferStored
    ? (stored || state.themePresetByMode[mode])
    : (state.themePresetByMode[mode] || stored);
  if (!presets.some(item => item.id === currentId)) {
    currentId = presets[0].id;
  }
  state.themePresetByMode[mode] = currentId;
  return presets.find(item => item.id === currentId) || presets[0];
}

function applyThemePreset(mode, { persist = true, forcedPresetId = '', animate = true } = {}) {
  if (forcedPresetId) {
    state.themePresetByMode[mode] = forcedPresetId;
    if (persist) {
      localStorage.setItem(getThemePresetStorageKey(mode), forcedPresetId);
    }
  }
  const preset = ensureThemePreset(mode, { preferStored: !forcedPresetId });
  if (!preset) return;
  if (persist && !forcedPresetId) {
    localStorage.setItem(getThemePresetStorageKey(mode), preset.id);
  }
  console.debug('[theme] preset apply', {
    mode,
    presetId: preset.id,
    themeMode: state.themeMode,
    resolvedMode: resolveThemeMode(state.themeMode),
  });
  if (resolveThemeMode(state.themeMode) !== mode) return;
  if (animate) {
    startThemeSwitchTransition();
  }
  const root = document.documentElement;
  root.style.setProperty('--bg-gradient', preset.gradient);
  root.style.setProperty('--theme-accent', preset.accent);
  root.style.setProperty('--theme-accent-strong', preset.accent_strong || preset.accent);
  root.style.setProperty('--theme-accent-soft', preset.accent_soft || preset.accent);
  root.style.setProperty('--detail-panel-bg', `color-mix(in srgb, var(--panel) 84%, ${preset.accent_soft || preset.accent} 16%)`);
}

function updateThemeControlUI() {
  const buttons = document.querySelectorAll('.theme-option[data-theme-mode]');
  if (!buttons.length) return;
  buttons.forEach((button) => {
    const mode = button.getAttribute('data-theme-mode');
    const active = mode === state.themeMode;
    button.classList.toggle('active', active);
    button.setAttribute('aria-pressed', active ? 'true' : 'false');
  });
}

function startThemeSwitchTransition() {
  const root = document.documentElement;
  const previousGradient = getComputedStyle(root).getPropertyValue('--bg-gradient').trim();
  if (previousGradient) {
    root.style.setProperty('--prev-bg-gradient', previousGradient);
  }
  root.classList.add('theme-switching');
  if (themeSwitchTimer) {
    window.clearTimeout(themeSwitchTimer);
  }
  themeSwitchTimer = window.setTimeout(() => {
    root.classList.remove('theme-switching');
  }, 520);
}

function applyTheme(mode, { persist = true } = {}) {
  state.themeMode = normalizeThemeMode(mode);
  const resolved = resolveThemeMode(state.themeMode);
  const root = document.documentElement;
  startThemeSwitchTransition();
  root.setAttribute('data-theme', resolved);
  if (persist) {
    localStorage.setItem(themeStorageKey, state.themeMode);
  }
  applyThemePreset(resolved, { persist: false, animate: false });
  updateThemeControlUI();
}

function updateSystemStatusUI() {
  const versionText = document.getElementById('versionStatusText');
  const versionDot = document.getElementById('versionStatusDot');
  const healthText = document.getElementById('healthStatusText');
  const healthDot = document.getElementById('healthStatusDot');
  if (!versionText || !versionDot || !healthText || !healthDot) return;

  const latestVersion = state.systemStatus.latestVersion || appVersion;
  const versionLabel = t('status.version', '');
  const healthLabel = t('status.health', '');
  const versionStateText = state.systemStatus.versionMatched === null
    ? t('status.checking', '')
    : (state.systemStatus.versionMatched
      ? t('status.synced', '')
      : t('status.outdated', ''));
  const healthStateText = state.systemStatus.serviceHealthy === null
    ? t('status.checking', '')
    : (state.systemStatus.serviceHealthy
      ? t('status.normal', '')
      : t('status.abnormal', ''));

  versionText.textContent = `${versionLabel} ${latestVersion} · ${versionStateText}`;
  healthText.textContent = `${healthLabel} ${healthStateText}`;

  versionDot.className = `status-dot ${state.systemStatus.versionMatched === false ? 'bad' : (state.systemStatus.versionMatched === true ? 'good' : 'pending')}`;
  healthDot.className = `status-dot ${state.systemStatus.serviceHealthy === false ? 'bad' : (state.systemStatus.serviceHealthy === true ? 'good' : 'pending')}`;
}

async function loadSystemStatus() {
  try {
    const response = await fetch('/api/system/status', { cache: 'no-store' });
    if (!response.ok) {
      throw new Error(`status check failed: ${response.status}`);
    }
    const data = await response.json();
    const latestVersion = (data?.latest_version || '').toString().trim();
    state.systemStatus.latestVersion = latestVersion || appVersion;
    state.systemStatus.versionMatched = !!latestVersion && latestVersion === appVersion;
    state.systemStatus.serviceHealthy = data?.service_status === 'ok';
  } catch (error) {
    console.error(error);
    state.systemStatus.serviceHealthy = false;
    state.systemStatus.versionMatched = null;
  }
  updateSystemStatusUI();
}

function startSystemStatusPolling() {
  if (statusPollTimer) {
    window.clearInterval(statusPollTimer);
  }
  void loadSystemStatus();
  statusPollTimer = window.setInterval(() => {
    void loadSystemStatus();
  }, statusPollIntervalMs);
}

function initThemeMode() {
  const savedMode = normalizeThemeMode(localStorage.getItem(themeStorageKey));
  applyTheme(savedMode, { persist: false });
  localStorage.setItem(themeStorageKey, savedMode);

  const listener = () => {
    if (state.themeMode === 'system') {
      applyTheme('system', { persist: false });
    }
  };
  if (typeof colorSchemeMedia.addEventListener === 'function') {
    colorSchemeMedia.addEventListener('change', listener);
  } else if (typeof colorSchemeMedia.addListener === 'function') {
    colorSchemeMedia.addListener(listener);
  }
}

function textOrEmpty(value) {
  const text = (value ?? '').toString().trim();
  return text || t('common.empty', 'Empty');
}

function isEditableItem(item) {
  if (pageMode === 'readonly') return false;
  if (!item) return true;
  return (item.scope || 'personal') === 'personal';
}

function parseTags(input) {
  return input
    .split(',')
    .map(tag => tag.trim())
    .filter(Boolean);
}

function tagsToInput(tags) {
  return (tags || []).join(', ');
}

function getCurrentTimeInputValue() {
  const now = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${now.getFullYear()}/${pad(now.getMonth() + 1)}/${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}`;
}

function normaliseLinks(raw) {
  if (!raw) return [];
  if (Array.isArray(raw)) {
    return raw
      .map(entry => ({
        provider: (entry?.provider || '').toString().trim(),
        url: (entry?.url || '').toString().trim(),
      }))
      .filter(entry => entry.provider && entry.url);
  }
  if (typeof raw === 'object') {
    return Object.entries(raw)
      .map(([provider, url]) => ({
        provider: provider.toString().trim().toLowerCase().replaceAll(' ', '_'),
        url: (url || '').toString().trim(),
      }))
      .filter(entry => entry.provider && entry.url);
  }
  return [];
}

function dedupeCoverUrls(values) {
  const seen = new Set();
  const result = [];
  (values || []).forEach((value) => {
    const text = (value || '').toString().trim();
    if (!text || seen.has(text)) return;
    seen.add(text);
    result.push(text);
  });
  return result;
}

function coverLinksCacheKey(links) {
  return JSON.stringify(normaliseLinks(links || []));
}

async function resolveMusicCoverCandidates(links, preferredIconUrl = '') {
  const normalizedLinks = normaliseLinks(links);
  if (!normalizedLinks.length) {
    return dedupeCoverUrls([preferredIconUrl]);
  }

  const cacheKey = `${coverLinksCacheKey(normalizedLinks)}|${(preferredIconUrl || '').trim()}`;
  if (state.coverCandidatesCache.has(cacheKey)) {
    return state.coverCandidatesCache.get(cacheKey);
  }
  if (state.coverResolvePromiseCache.has(cacheKey)) {
    return state.coverResolvePromiseCache.get(cacheKey);
  }

  const pending = (async () => {
    try {
      const response = await fetch('/api/music/public/cover/resolve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          links: normalizedLinks,
          preferred_icon_url: (preferredIconUrl || '').toString().trim(),
        }),
      });
      if (!response.ok) {
        return dedupeCoverUrls([preferredIconUrl]);
      }
      const payload = await response.json();
      const candidates = dedupeCoverUrls(payload?.candidates || []);
      const finalCandidates = candidates.length ? candidates : dedupeCoverUrls([preferredIconUrl]);
      state.coverCandidatesCache.set(cacheKey, finalCandidates);
      return finalCandidates;
    } catch {
      return dedupeCoverUrls([preferredIconUrl]);
    } finally {
      state.coverResolvePromiseCache.delete(cacheKey);
    }
  })();

  state.coverResolvePromiseCache.set(cacheKey, pending);
  return pending;
}

function tryApplyNextCover(imgEl, candidates) {
  if (!imgEl) return false;
  const currentSrc = (imgEl.getAttribute('src') || '').trim();
  const urls = dedupeCoverUrls(candidates);
  if (!urls.length) return false;

  const currentIndex = Number(imgEl.dataset.coverCandidateIndex || '-1');
  const computedStart = currentIndex >= 0
    ? currentIndex + 1
    : Math.max(urls.findIndex(url => url === currentSrc) + 1, 0);

  for (let idx = computedStart; idx < urls.length; idx += 1) {
    const candidate = urls[idx];
    if (!candidate || candidate === currentSrc) continue;
    imgEl.dataset.coverCandidateIndex = String(idx);
    imgEl.src = candidate;
    return true;
  }

  return false;
}

function bindCoverFallback(imgEl, item, options = {}) {
  if (!imgEl || !item || imgEl.dataset.coverFallbackBound === '1') return;
  imgEl.dataset.coverFallbackBound = '1';
  imgEl.dataset.coverCandidateIndex = '-1';

  const hideOnFail = !!options.hideOnFail;
  const replaceWithEmpty = !!options.replaceWithEmpty;

  imgEl.addEventListener('error', () => {
    void (async () => {
      const candidates = await resolveMusicCoverCandidates(item.links, item.icon_url || '');
      if (tryApplyNextCover(imgEl, candidates)) return;

      if (hideOnFail) {
        imgEl.style.display = 'none';
        return;
      }
      if (replaceWithEmpty) {
        imgEl.outerHTML = `<div class="detail-avatar">${escapeHtml(t('common.empty', 'Empty'))}</div>`;
      }
    })();
  });

  const currentSrc = (imgEl.getAttribute('src') || '').trim();
  if (!currentSrc) {
    void (async () => {
      const candidates = await resolveMusicCoverCandidates(item.links, item.icon_url || '');
      if (!candidates.length) {
        if (hideOnFail) {
          imgEl.style.display = 'none';
          return;
        }
        if (replaceWithEmpty) {
          imgEl.outerHTML = `<div class="detail-avatar">${escapeHtml(t('common.empty', 'Empty'))}</div>`;
        }
        return;
      }
      imgEl.dataset.coverCandidateIndex = '0';
      imgEl.style.display = '';
      imgEl.src = candidates[0];
    })();
  }
}

function bindCardCoverFallbacks() {
  if (pageType !== 'music') return;
  memoryGrid.querySelectorAll('.card-avatar-img[data-item-id]').forEach((imgEl) => {
    const itemId = Number(imgEl.getAttribute('data-item-id') || '0');
    const item = state.items.find(entry => entry.id === itemId);
    if (!item) return;
    bindCoverFallback(imgEl, item, { hideOnFail: true });
  });
}

function bindDetailCoverFallback(item) {
  if (pageType !== 'music') return;
  const imgEl = detailInner.querySelector('.detail-avatar[data-item-id]');
  if (!imgEl) return;
  bindCoverFallback(imgEl, item, { replaceWithEmpty: true });
}

function getLinkOption(provider) {
  return state.linkOptions.find(item => item.provider === provider);
}

function getDefaultColor() {
  return pageType === 'music' ? state.colorConfig.default_music : state.colorConfig.default_mind;
}

function normaliseHexColor(raw) {
  const value = (raw || '').toString().trim().toLowerCase();
  if (!value.startsWith('#')) return '';
  if (/^#[0-9a-f]{3}$/i.test(value)) {
    return `#${value[1]}${value[1]}${value[2]}${value[2]}${value[3]}${value[3]}`.toLowerCase();
  }
  if (/^#[0-9a-f]{6}$/i.test(value)) {
    return value.toLowerCase();
  }
  return '';
}

function isForbiddenColor(value) {
  const normalized = normaliseHexColor(value);
  if (!normalized) return true;
  const forbidden = (state.colorConfig.forbidden_colors || []).map(item => normaliseHexColor(item));
  return forbidden.includes(normalized);
}

function itemSearchText(item) {
  const fields = state.searchFields.size ? state.searchFields : new Set(defaultSearchFields);
  const parts = [];
  if (fields.has('title')) parts.push(item.title || '');
  if (fields.has('artist')) parts.push(item.artist || '');
  if (fields.has('tags')) parts.push((item.tags || []).join(' '));
  if (fields.has('short_desc')) parts.push(item.short_desc || '');
  if (fields.has('long_desc')) parts.push(item.long_desc || '');
  if (fields.has('memory_time')) parts.push(item.memory_time || '');
  if (fields.has('links')) {
    parts.push((item.links || []).map(link => {
      const opt = getLinkOption(link.provider);
      return `${opt?.label || link.provider} ${link.url}`;
    }).join(' '));
  }
  return parts.join(' ').toLowerCase();
}

function renderEmptyState(message = t('common.empty', 'Empty')) {
  memoryGrid.innerHTML = `<div class="empty-state">${escapeHtml(message)}</div>`;
}

function renderCardTagSummary(tags) {
  const cleanTags = (tags || []).filter(Boolean);
  if (!cleanTags.length) return '';
  const shown = cleanTags.slice(0, 3);
  const hasMore = cleanTags.length > 3;
  return `
    <div class="card-tag-list">
      ${shown.map(tag => `<span class="card-tag-pill">#${escapeHtml(tag)}</span>`).join('')}
      ${hasMore ? '<span class="card-tag-more">...</span>' : ''}
    </div>
  `;
}

function renderCardLinkIcons(links) {
  if (pageType !== 'music') return '';
  const entries = normaliseLinks(links);
  if (!entries.length) return '';
  return `
    <div class="card-link-list">
      ${entries.map(link => {
    const option = getLinkOption(link.provider);
    const label = option?.label || link.provider;
    const icon = option?.icon || '';
    const iconHtml = icon
      ? `<img src="${escapeHtml(icon)}" alt="${escapeHtml(label)}" loading="lazy" />`
      : `<span>${escapeHtml(label.slice(0, 1).toUpperCase())}</span>`;
    return `<a class="link-icon-btn card-link-btn" href="${escapeHtml(link.url)}" title="${escapeHtml(label)}" target="_blank" rel="noreferrer" data-provider="${escapeHtml(link.provider)}" data-url="${escapeHtml(link.url)}">${iconHtml}</a>`;
  }).join('')}
    </div>
  `;
}

function renderCards() {
  if (!state.filteredItems.length) {
    const emptyMessage = searchInput.value.trim()
      ? t('common.noMatch', 'No matching items')
      : (state.hiddenSpace ? t('hidden.empty', 'Hidden space is empty.') : t('common.empty', 'Empty'));
    renderEmptyState(emptyMessage);
    return;
  }

  memoryGrid.innerHTML = state.filteredItems.map(item => {
    const isActive = item.id === state.selectedId;
    const avatar = pageType === 'music'
      ? `
        <div class="card-avatar-wrap">
          <div class="card-avatar card-avatar-fallback">&#9835;</div>
          <img
            class="card-avatar card-avatar-img"
            data-item-id="${item.id}"
            src="${escapeHtml(item.icon_url || '')}"
            alt="cover"
            loading="lazy"
            ${item.icon_url?.trim() ? '' : 'style="display:none"'}
          />
        </div>
      `
      : '';
    const subtitle = pageType === 'music'
      ? `<p class="card-subtitle">${escapeHtml(textOrEmpty(item.artist))}</p>`
      : '';

    const musicBody = pageType === 'music'
      ? `
        <div class="music-card-layout">
          <div class="card-head">${avatar}</div>
          <div class="music-card-content">
            <h3 class="card-title">${escapeHtml(textOrEmpty(item.title))}</h3>
            ${subtitle}
            <p class="card-desc">${escapeHtml(textOrEmpty(item.short_desc || item.long_desc))}</p>
            ${renderCardTagSummary(item.tags)}
          </div>
        </div>
      `
      : `
        <h3 class="card-title">${escapeHtml(textOrEmpty(item.title))}</h3>
        <p class="card-desc">${escapeHtml(textOrEmpty(item.short_desc || item.long_desc))}</p>
        ${renderCardTagSummary(item.tags)}
      `;

    return `
      <article class="card ${isActive ? 'active' : ''}" data-id="${item.id}" style="--card-accent:${escapeHtml(item.color || getDefaultColor())}">
        ${musicBody}
        <div class="card-footer">
          <div class="card-time">${escapeHtml(textOrEmpty(item.memory_time))}</div>
          ${renderCardLinkIcons(item.links)}
        </div>
      </article>
    `;
  }).join('');

  memoryGrid.querySelectorAll('.card').forEach(card => {
    card.addEventListener('click', () => {
      const id = Number(card.dataset.id);
      const item = state.items.find(entry => entry.id === id);
      if (!item) return;
      if (state.selectedId === id && detailPanel.getAttribute('aria-hidden') === 'false') {
        closeDetail();
        return;
      }
      state.selectedId = id;
      renderCards();
      openDetail(item);
    });
  });

  memoryGrid.querySelectorAll('.card-link-btn[data-provider][data-url]').forEach((anchor) => {
    const provider = anchor.getAttribute('data-provider');
    const rawUrl = anchor.getAttribute('data-url') || '';
    anchor.addEventListener('click', (event) => {
      event.stopPropagation();
      if (provider !== 'netease_music') return;
      event.preventDefault();
      void tryOpenNeteaseApp(rawUrl);
    });
  });

  bindCardCoverFallbacks();
}

function renderTagList(tags) {
  const cleanTags = (tags || []).filter(Boolean);
  if (!cleanTags.length) {
    return `<div class="tag-list"><span class="tag-pill">${escapeHtml(t('common.empty', 'Empty'))}</span></div>`;
  }
  return `<div class="tag-list">${cleanTags.map(tag => `<span class="tag-pill">#${escapeHtml(tag)}</span>`).join('')}</div>`;
}

function renderLinkList(links) {
  const entries = normaliseLinks(links);
  if (!entries.length) return '';
  const hasNeteaseLink = entries.some(link => link.provider === 'netease_music');
  return `
    <div class="link-list-wrap">
      <div class="link-list">${entries.map(link => {
    const option = getLinkOption(link.provider);
    const label = option?.label || link.provider;
    const icon = option?.icon || '';
    const iconHtml = icon
      ? `<img src="${escapeHtml(icon)}" alt="${escapeHtml(label)}" loading="lazy" />`
      : `<span>${escapeHtml(label.slice(0, 1).toUpperCase())}</span>`;
    return `<a class="link-icon-btn" href="${escapeHtml(link.url)}" title="${escapeHtml(label)}" target="_blank" rel="noreferrer" data-provider="${escapeHtml(link.provider)}" data-url="${escapeHtml(link.url)}">${iconHtml}</a>`;
  }).join('')}</div>
      ${hasNeteaseLink ? `
      <div class="link-launch-hint" id="linkLaunchHint" hidden>
        <a id="linkFallbackAnchor" target="_blank" rel="noreferrer">${escapeHtml(t('link.launchFallback', 'If not launched, click to open.'))}</a>
      </div>
      ` : ''}
    </div>
  `;
}

function parseSpotifyEmbedPath(rawUrl) {
  try {
    const url = new URL(rawUrl);
    const parts = url.pathname.split('/').filter(Boolean);
    const supportedTypes = new Set(['track', 'album', 'playlist', 'episode', 'show', 'artist']);
    const typeIndex = parts.findIndex(part => supportedTypes.has(part));
    if (typeIndex < 0 || !parts[typeIndex + 1]) return '';
    return `${parts[typeIndex]}/${parts[typeIndex + 1]}`;
  } catch {
    return '';
  }
}

function renderSpotifyEmbed(links) {
  if (pageType !== 'music') return '';
  const spotifyLink = normaliseLinks(links).find(link => link.provider === 'spotify');
  if (!spotifyLink) return '';
  const embedPath = parseSpotifyEmbedPath(spotifyLink.url);
  if (!embedPath) return '';
  const embedSrc = `https://open.spotify.com/embed/${embedPath}?utm_source=generator`;
  return `
    <div class="detail-spotify-embed">
      <iframe
        data-testid="embed-iframe"
        style="border-radius:12px"
        src="${escapeHtml(embedSrc)}"
        width="100%"
        height="152"
        frameborder="0"
        allowfullscreen
        allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
        loading="lazy"
      ></iframe>
    </div>
  `;
}

function parseNeteaseContent(rawUrl) {
  try {
    const url = new URL(rawUrl);
    const pickType = (value) => ['song', 'playlist', 'album'].includes(value) ? value : '';
    let type = '';
    let id = url.searchParams.get('id') || '';

    if (url.pathname.includes('/song')) type = 'song';
    if (url.pathname.includes('/playlist')) type = 'playlist';
    if (url.pathname.includes('/album')) type = 'album';

    if (url.hash) {
      const hashText = url.hash.replace(/^#\/?/, '');
      const queryStart = hashText.indexOf('?');
      const hashPath = queryStart >= 0 ? hashText.slice(0, queryStart) : hashText;
      const hashQuery = queryStart >= 0 ? hashText.slice(queryStart + 1) : '';
      const hashType = hashPath.split('/')[0] || '';
      if (!type) type = pickType(hashType);
      if (!id && hashQuery) {
        const params = new URLSearchParams(hashQuery);
        id = params.get('id') || '';
      }
    }

    if (!type) type = 'song';
    if (!id) return null;
    return { type, id };
  } catch {
    return null;
  }
}

function buildNeteaseAppUrl(webUrl) {
  const content = parseNeteaseContent(webUrl);
  if (!content) return 'orpheus://';
  return `orpheus://${content.type}/${content.id}`;
}

async function resolveNeteaseAppUrl(linkUrl) {
  const raw = (linkUrl || '').toString().trim();
  if (!raw) return 'orpheus://';
  if (state.neteaseResolveCache.has(raw)) {
    return state.neteaseResolveCache.get(raw) || 'orpheus://';
  }
  try {
    const response = await fetch('/api/music/public/netease/resolve', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: raw }),
    });
    if (response.ok) {
      const payload = await response.json();
      const appUrl = (payload?.app_url || '').toString().trim() || buildNeteaseAppUrl(raw);
      state.neteaseResolveCache.set(raw, appUrl);
      return appUrl;
    }
  } catch {}
  const fallback = buildNeteaseAppUrl(raw);
  state.neteaseResolveCache.set(raw, fallback);
  return fallback;
}

async function tryOpenNeteaseApp(linkUrl) {
  const appUrl = await resolveNeteaseAppUrl(linkUrl);
  const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent || '');

  if (isMobile) {
    window.location.href = appUrl;
    return;
  }

  const probe = document.createElement('iframe');
  probe.style.display = 'none';
  probe.src = appUrl;
  document.body.appendChild(probe);
  window.setTimeout(() => {
    probe.remove();
  }, 1200);
}

function bindExternalLinkHandlers() {
  const launchHint = detailInner.querySelector('#linkLaunchHint');
  const fallbackAnchor = detailInner.querySelector('#linkFallbackAnchor');
  detailInner.querySelectorAll('.link-icon-btn[data-provider][data-url]').forEach((anchor) => {
    const provider = anchor.getAttribute('data-provider');
    const rawUrl = anchor.getAttribute('data-url') || '';
    if (provider !== 'netease_music') return;
    anchor.addEventListener('click', (event) => {
      event.preventDefault();
      void tryOpenNeteaseApp(rawUrl);
      if (launchHint && fallbackAnchor) {
        fallbackAnchor.setAttribute('href', rawUrl);
        launchHint.hidden = false;
      }
    });
  });
}

function openDetail(item) {
  const avatarHtml = pageType === 'music'
    ? `<img class="detail-avatar" data-item-id="${item.id}" src="${escapeHtml(item.icon_url || '')}" alt="avatar" ${item.icon_url?.trim() ? '' : 'style="display:none"'} />`
    : '';
  const shortDesc = textOrEmpty(item.short_desc);
  const longDesc = textOrEmpty(item.long_desc);

  detailInner.innerHTML = `
    <div class="detail-header">
      ${avatarHtml}
      <div class="detail-meta">
        <h2 class="detail-title">${escapeHtml(textOrEmpty(item.title))}</h2>
        ${pageType === 'music' ? `<p class="detail-artist">${escapeHtml(textOrEmpty(item.artist))}</p>` : ''}
        <p class="detail-time">${escapeHtml(textOrEmpty(item.memory_time))}</p>
        ${renderTagList(item.tags)}
        ${pageType === 'music' ? renderLinkList(item.links) : ''}
      </div>
    </div>
    <p class="detail-short-desc">${escapeHtml(shortDesc)}</p>
    ${renderSpotifyEmbed(item.links)}
    <div class="detail-markdown">${marked.parse(longDesc)}</div>
    <div class="detail-actions">
      ${isEditableItem(item)
        ? `<button class="danger-btn" type="button" id="detailDeleteBtn">${escapeHtml(t('detail.del', 'Delete'))}</button>
      <button class="secondary-btn" type="button" id="detailEditBtn">${escapeHtml(t('detail.edit', 'Edit'))}</button>
      <button class="secondary-btn" type="button" id="detailHiddenBtn">${escapeHtml(item.hidden ? t('detail.unhide', 'Restore') : t('detail.hide', 'Hide'))}</button>`
        : ''}
    </div>
  `;

  const detailDeleteBtn = document.getElementById('detailDeleteBtn');
  const detailEditBtn = document.getElementById('detailEditBtn');
  const detailHiddenBtn = document.getElementById('detailHiddenBtn');
  detailDeleteBtn?.addEventListener('click', () => openDeleteModal(item.id));
  detailEditBtn?.addEventListener('click', () => openFormModal('edit', item));
  detailHiddenBtn?.addEventListener('click', async () => {
    await updateHiddenStatus(item.id, !item.hidden);
  });
  bindDetailCoverFallback(item);
  bindExternalLinkHandlers();

  document.body.classList.add('panel-open');
  detailPanel.setAttribute('aria-hidden', 'false');
}

function closeDetail() {
  document.body.classList.remove('panel-open');
  detailPanel.setAttribute('aria-hidden', 'true');
  state.selectedId = null;
  renderCards();
}

function buildLinkProviderOptions(selectedProvider = '') {
  const selected = selectedProvider || state.linkOptions[0]?.provider || '';
  return state.linkOptions.map(item => `
    <option value="${escapeHtml(item.provider)}" ${item.provider === selected ? 'selected' : ''}>${escapeHtml(item.label)}</option>
  `).join('');
}

function buildLinkRowHtml(link = null) {
  const provider = link?.provider || state.linkOptions[0]?.provider || '';
  const url = link?.url || '';
  return `
    <div class="link-row">
      <select class="link-provider">${buildLinkProviderOptions(provider)}</select>
      <input class="link-url" type="url" placeholder="https://..." value="${escapeHtml(url)}" />
      <button class="icon-btn link-remove-btn" type="button" data-remove-link>&times;</button>
    </div>
  `;
}

function getColorFieldHtml(currentColor) {
  const presets = state.colorConfig.presets || [];
  const normalizedCurrent = normaliseHexColor(currentColor || getDefaultColor());
  const hasPreset = presets.some(item => normaliseHexColor(item.value) === normalizedCurrent);
  const firstPreset = normaliseHexColor(presets[0]?.value || getDefaultColor()) || getDefaultColor();
  const mode = hasPreset ? 'preset' : (state.colorConfig.allow_custom ? 'custom' : 'preset');
  const selectedPreset = hasPreset ? normalizedCurrent : firstPreset;
  const customHidden = mode === 'custom' ? '' : 'hidden';
  const customColor = normalizedCurrent || getDefaultColor();
  const getPresetLabel = (item) => {
    const rawName = (item?.name || '').toString().trim();
    const keySuffix = rawName.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
    if (!keySuffix) return rawName;
    return t(`color.preset.${keySuffix}`, rawName);
  };

  return `
    <div class="field">
      <label>${escapeHtml(t('form.cardColor', 'Card Color'))}</label>
      <div class="color-preset-grid">
        ${presets.map(item => {
          const value = normaliseHexColor(item.value);
          const active = mode === 'preset' && value === selectedPreset ? 'active' : '';
          const label = getPresetLabel(item);
          return `<button type="button" class="color-swatch-btn ${active}" data-preset-color="${escapeHtml(value)}" title="${escapeHtml(label)}" aria-label="${escapeHtml(label)}" style="--swatch-color:${escapeHtml(value)}"></button>`;
        }).join('')}
        ${state.colorConfig.allow_custom ? `<button type="button" class="color-custom-btn ${mode === 'custom' ? 'active' : ''}" id="customColorTrigger">${escapeHtml(t('common.custom', 'Custom'))}</button>` : ''}
      </div>
      <input type="hidden" id="color_mode" value="${escapeHtml(mode)}" />
      <input type="hidden" id="selected_preset_color" value="${escapeHtml(selectedPreset)}" />
      ${state.colorConfig.allow_custom ? `
      <div class="custom-color-wrap" id="customColorWrap" ${customHidden}>
        <input id="custom_color_picker" name="custom_color_picker" type="color" value="${escapeHtml(customColor)}" />
        <input id="custom_color_hex" name="custom_color_hex" type="text" value="${escapeHtml(customColor)}" placeholder="#RRGGBB or #RGB" />
      </div>
      ` : ''}
      <div class="color-preview" id="colorPreview" style="--preview-color:${escapeHtml(mode === 'custom' ? customColor : selectedPreset)}"></div>
    </div>
  `;
}

function getFormHtml(item = null) {
  const data = item || {
    icon_url: '',
    title: '',
    artist: '',
    memory_time: getCurrentTimeInputValue(),
    tags: [],
    color: getDefaultColor(),
    short_desc: '',
    long_desc: '',
    links: [],
  };

  const initialLinks = normaliseLinks(data.links);
  const linkRows = initialLinks.length
    ? initialLinks.map(link => buildLinkRowHtml(link)).join('')
    : buildLinkRowHtml();

  const musicExtra = pageType === 'music' ? `
    <div class="field">
      <label for="icon_url">
        ${escapeHtml(t('form.iconUrl', 'Cover URL'))}
        <span
          class="field-info"
          title="${escapeHtml(t('form.iconUrlInfo', 'Currently only Netease Music and Spotify support auto cover retrieval.'))}"
          aria-label="${escapeHtml(t('form.iconUrlInfo', 'Currently only Netease Music and Spotify support auto cover retrieval.'))}"
        >i</span>
      </label>
      <input id="icon_url" name="icon_url" type="text" value="${escapeHtml(data.icon_url || '')}" />
    </div>
    <div class="field">
      <label for="artist">${escapeHtml(t('form.artist', 'Artist'))}</label>
      <input id="artist" name="artist" type="text" value="${escapeHtml(data.artist || '')}" />
    </div>
    <div class="field full">
      <label>${escapeHtml(t('form.externalLinks', 'External Links'))}</label>
      <div class="link-editor" id="linkEditorRows">${linkRows}</div>
      <div class="form-inline-actions">
        <button class="secondary-btn" type="button" id="addLinkBtn">${escapeHtml(t('form.addLink', '+ Add Link'))}</button>
      </div>
      <span class="hint-text">${escapeHtml(t('form.linksHint', 'Each provider accepts configured domains only.'))}</span>
    </div>
  ` : '';

  return `
    <div class="field">
      <label for="title">${escapeHtml(t('form.title', 'Title'))}</label>
      <input id="title" name="title" type="text" value="${escapeHtml(data.title || '')}" />
    </div>
    ${musicExtra}
    <div class="field">
      <label for="memory_time">${escapeHtml(t('form.time', 'Time'))}</label>
      <input id="memory_time" name="memory_time" type="text" value="${escapeHtml(data.memory_time || getCurrentTimeInputValue())}" />
      <span class="hint-text">${escapeHtml(t('form.timeHint', 'Auto-filled at open time, editable.'))}</span>
    </div>
    ${getColorFieldHtml(data.color)}
    <div class="field full">
      <label for="tags">${escapeHtml(t('form.tags', 'Tags'))}</label>
      <input id="tags" name="tags" type="text" value="${escapeHtml(tagsToInput(data.tags))}" placeholder="${escapeHtml(t('form.tagsPlaceholder', 'tag1, tag2, tag3'))}" />
    </div>
    <div class="field full">
      <label for="short_desc">${escapeHtml(t('form.shortDesc', 'Short Description'))}</label>
      <textarea id="short_desc" name="short_desc">${escapeHtml(data.short_desc || '')}</textarea>
    </div>
    <div class="field full">
      <label for="long_desc">${escapeHtml(t('form.longDesc', 'Long Description [Markdown]'))}</label>
      <textarea id="long_desc" name="long_desc">${escapeHtml(data.long_desc || '')}</textarea>
      <div class="markdown-live-preview" id="markdownLivePreview"></div>
    </div>
    <div class="form-actions">
      <button class="secondary-btn" type="button" data-close-form>${escapeHtml(t('common.cancel', 'Cancel'))}</button>
      <button class="primary-btn" type="submit">${escapeHtml(t('common.save', 'Save'))}</button>
    </div>
  `;
}

function renderMarkdownLivePreview(rawMarkdown) {
  const preview = memoryForm.querySelector('#markdownLivePreview');
  if (!preview) return;
  const source = (rawMarkdown || '').toString().trim();
  preview.innerHTML = source ? marked.parse(source) : `<p class="md-preview-empty">${escapeHtml(t('form.livePreview', 'Live preview...'))}</p>`;
}

function getLongDescValue() {
  if (currentMarkdownEditor && typeof currentMarkdownEditor.value === 'function') {
    return currentMarkdownEditor.value().trim();
  }
  const plain = memoryForm.querySelector('#long_desc')?.value || '';
  return plain.toString().trim();
}

function setupMarkdownEditor() {
  if (currentMarkdownEditor && typeof currentMarkdownEditor.toTextArea === 'function') {
    currentMarkdownEditor.toTextArea();
    currentMarkdownEditor = null;
  }

  const longDescEl = memoryForm.querySelector('#long_desc');
  if (!longDescEl) return;

  const bindFallbackPreview = () => {
    renderMarkdownLivePreview(longDescEl.value);
    longDescEl.addEventListener('input', () => renderMarkdownLivePreview(longDescEl.value));
  };

  if (typeof window.EasyMDE !== 'function') {
    bindFallbackPreview();
    return;
  }

  currentMarkdownEditor = new window.EasyMDE({
    element: longDescEl,
    minHeight: '0px',
    spellChecker: false,
    status: false,
    autofocus: false,
    forceSync: true,
    autoDownloadFontAwesome: true,
    toolbar: [
      'bold',
      'italic',
      'strikethrough',
      '|',
      'heading-1',
      'heading-2',
      'heading-3',
      '|',
      'quote',
      'unordered-list',
      'ordered-list',
      '|',
      'link',
      'image',
      'table',
      '|',
      'code',
      'horizontal-rule',
      '|',
      'preview',
      'side-by-side',
      'fullscreen',
      '|',
      'guide',
    ],
    renderingConfig: {
      singleLineBreaks: false,
      codeSyntaxHighlighting: false,
    },
  });

  renderMarkdownLivePreview(currentMarkdownEditor.value());
  currentMarkdownEditor.codemirror.on('change', () => {
    renderMarkdownLivePreview(currentMarkdownEditor.value());
  });
}

function setupLinkEditor() {
  if (pageType !== 'music') return;
  const editorRows = memoryForm.querySelector('#linkEditorRows');
  const addLinkBtn = memoryForm.querySelector('#addLinkBtn');
  if (!editorRows || !addLinkBtn) return;

  const bindRemoveEvents = () => {
    editorRows.querySelectorAll('[data-remove-link]').forEach(button => {
      button.onclick = () => {
        const row = button.closest('.link-row');
        if (row) row.remove();
      };
    });
  };

  bindRemoveEvents();
  addLinkBtn.addEventListener('click', () => {
    editorRows.insertAdjacentHTML('beforeend', buildLinkRowHtml());
    bindRemoveEvents();
  });
}

function setupColorEditor() {
  const modeInput = memoryForm.querySelector('#color_mode');
  const selectedPresetInput = memoryForm.querySelector('#selected_preset_color');
  const swatchButtons = memoryForm.querySelectorAll('[data-preset-color]');
  const customTrigger = memoryForm.querySelector('#customColorTrigger');
  const customWrap = memoryForm.querySelector('#customColorWrap');
  const customPicker = memoryForm.querySelector('#custom_color_picker');
  const customHex = memoryForm.querySelector('#custom_color_hex');
  const colorPreview = memoryForm.querySelector('#colorPreview');

  if (!modeInput || !selectedPresetInput || !colorPreview) return;

  const updatePreview = (value) => {
    colorPreview.style.setProperty('--preview-color', value || getDefaultColor());
  };

  const setActiveSwatch = (value) => {
    swatchButtons.forEach(button => {
      button.classList.toggle('active', button.getAttribute('data-preset-color') === value && modeInput.value === 'preset');
    });
    if (customTrigger) {
      customTrigger.classList.toggle('active', modeInput.value === 'custom');
    }
  };

  const syncCustomFromHex = () => {
    if (!customHex || !customPicker) return;
    const normalized = normaliseHexColor(customHex.value);
    if (normalized) {
      customHex.value = normalized;
      customPicker.value = normalized;
      if (modeInput.value === 'custom') {
        updatePreview(normalized);
      }
    }
  };

  swatchButtons.forEach(button => {
    button.addEventListener('click', () => {
      const selected = normaliseHexColor(button.getAttribute('data-preset-color') || '') || getDefaultColor();
      modeInput.value = 'preset';
      selectedPresetInput.value = selected;
      if (customWrap) customWrap.hidden = true;
      setActiveSwatch(selected);
      updatePreview(selected);
    });
  });

  if (customTrigger) {
    customTrigger.addEventListener('click', () => {
      modeInput.value = 'custom';
      if (customWrap) customWrap.hidden = false;
      const normalized = normaliseHexColor(customHex?.value || customPicker?.value || getDefaultColor()) || getDefaultColor();
      updatePreview(normalized);
      setActiveSwatch(selectedPresetInput.value);
    });
  }

  if (customPicker) {
    customPicker.addEventListener('input', () => {
      if (!customHex) return;
      customHex.value = customPicker.value;
      if (modeInput.value === 'custom') {
        updatePreview(customPicker.value);
      }
    });
  }

  if (customHex) {
    customHex.addEventListener('input', syncCustomFromHex);
    customHex.addEventListener('blur', syncCustomFromHex);
  }

  setActiveSwatch(selectedPresetInput.value);
}

function collectFormLinks() {
  const rows = memoryForm.querySelectorAll('.link-row');
  const links = [];
  for (const row of rows) {
    const provider = row.querySelector('.link-provider')?.value?.trim() || '';
    const url = row.querySelector('.link-url')?.value?.trim() || '';
    if (!provider && !url) continue;
    if (!url) continue;
    links.push({ provider, url });
  }
  return links;
}

function collectFormColor() {
  const mode = memoryForm.querySelector('#color_mode')?.value || 'preset';
  const preset = memoryForm.querySelector('#selected_preset_color')?.value || '';
  if (mode !== 'custom') {
    return normaliseHexColor(preset) || getDefaultColor();
  }
  const customHex = memoryForm.querySelector('#custom_color_hex')?.value || '';
  const customPicker = memoryForm.querySelector('#custom_color_picker')?.value || '';
  return normaliseHexColor(customHex) || normaliseHexColor(customPicker) || getDefaultColor();
}

function openFormModal(mode, item = null) {
  if (!isEditableItem(item)) {
    return;
  }
  state.mode = mode;
  formModalTitle.textContent = mode === 'create' ? t('form.create', 'Add') : t('form.edit', 'Edit');
  memoryForm.innerHTML = getFormHtml(item);
  formModalOverlay.classList.add('open');
  formModalOverlay.setAttribute('aria-hidden', 'false');

  memoryForm.querySelectorAll('[data-close-form]').forEach(btn => {
    btn.addEventListener('click', closeFormModal);
  });

  setupLinkEditor();
  setupColorEditor();
  setupMarkdownEditor();

  memoryForm.onsubmit = async (event) => {
    event.preventDefault();
    const formData = new FormData(memoryForm);
    const selectedColor = collectFormColor();

    if (!selectedColor) {
      alert(t('form.colorInvalid', 'Invalid color value.'));
      return;
    }
    if (isForbiddenColor(selectedColor)) {
      alert(t('form.colorForbidden', 'White is not allowed.'));
      return;
    }

    const payload = {
      title: (formData.get('title') || '').toString().trim(),
      memory_time: (formData.get('memory_time') || '').toString().trim(),
      tags: parseTags((formData.get('tags') || '').toString()),
      color: selectedColor,
      short_desc: (formData.get('short_desc') || '').toString().trim(),
      long_desc: getLongDescValue(),
    };

    if (pageType === 'music') {
      payload.icon_url = (formData.get('icon_url') || '').toString().trim();
      payload.artist = (formData.get('artist') || '').toString().trim();
      payload.links = collectFormLinks();
    }

    const targetId = item?.id;
    const method = mode === 'create' ? 'POST' : 'PUT';
    const endpoint = mode === 'create' ? writeApiBase : `${writeApiBase}/${targetId}`;

    const response = await fetch(endpoint, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errorText = await response.text();
      alert(`${t('form.saveFailed', 'Save failed')}: ${errorText}`);
      return;
    }

    closeFormModal();
    await loadItems();

    if (mode === 'edit' && targetId) {
      const updated = state.items.find(entry => entry.id === targetId);
      if (updated) {
        state.selectedId = targetId;
        openDetail(updated);
      }
    }
  };
}

function closeFormModal() {
  if (currentMarkdownEditor && typeof currentMarkdownEditor.toTextArea === 'function') {
    currentMarkdownEditor.toTextArea();
    currentMarkdownEditor = null;
  }
  formModalOverlay.classList.remove('open');
  formModalOverlay.setAttribute('aria-hidden', 'true');
}

function openDeleteModal(id) {
  state.pendingDeleteId = id;
  deleteModalOverlay.classList.add('open');
  deleteModalOverlay.setAttribute('aria-hidden', 'false');
}

function closeDeleteModal() {
  deleteModalOverlay.classList.remove('open');
  deleteModalOverlay.setAttribute('aria-hidden', 'true');
  state.pendingDeleteId = null;
}

async function confirmDelete() {
  if (!state.pendingDeleteId) return;
  const selected = state.items.find(entry => entry.id === state.pendingDeleteId);
  if (!isEditableItem(selected)) {
    closeDeleteModal();
    return;
  }
  const response = await fetch(`${writeApiBase}/${state.pendingDeleteId}`, { method: 'DELETE' });
  if (!response.ok) {
    alert(t('form.deleteFailed', 'Delete failed.'));
    return;
  }

  const deletedId = state.pendingDeleteId;
  closeDeleteModal();
  await loadItems();
  if (state.selectedId === deletedId) {
    closeDetail();
  }
}

function applySearch() {
  const keyword = searchInput.value.trim().toLowerCase();
  state.filteredItems = keyword
    ? state.items.filter(item => itemSearchText(item).includes(keyword))
    : [...state.items];

  if (state.selectedId && !state.filteredItems.some(item => item.id === state.selectedId)) {
    closeDetail();
  }
  renderCards();
}

function renderSearchFilterControl() {
  const old = document.getElementById('searchFilterWrap');
  old?.remove();
  if (!toolbar) return;
  const wrap = document.createElement('div');
  wrap.className = 'search-filter-wrap';
  wrap.id = 'searchFilterWrap';
  wrap.innerHTML = `
    <button class="secondary-btn filter-btn" type="button" id="filterBtn">${escapeHtml(t('common.filter', 'Filter'))}</button>
    <div class="filter-popover" id="filterPopover" hidden>
      <div class="filter-title">${escapeHtml(t('common.searchIn', 'Search In'))}</div>
      ${searchFieldOptions.map(item => `
        <label class="filter-option">
          <input type="checkbox" value="${escapeHtml(item.key)}" ${state.searchFields.has(item.key) ? 'checked' : ''} />
          <span>${escapeHtml(t(`searchField.${item.key}`, item.key))}</span>
        </label>
      `).join('')}
    </div>
  `;
  const actionRow = document.getElementById('toolbarActionRow');
  if (actionRow) {
    actionRow.appendChild(wrap);
  } else {
    const switchBtn = document.getElementById('switchPageBtn');
    toolbar.insertBefore(wrap, switchBtn || addBtn);
  }

  const filterBtn = wrap.querySelector('#filterBtn');
  const popover = wrap.querySelector('#filterPopover');
  const checkboxNodes = wrap.querySelectorAll('input[type="checkbox"]');

  filterBtn.addEventListener('click', () => {
    popover.hidden = !popover.hidden;
  });

  checkboxNodes.forEach(node => {
    node.addEventListener('change', () => {
      const checked = Array.from(checkboxNodes)
        .filter(item => item.checked)
        .map(item => item.value);

      state.searchFields = new Set(checked.length ? checked : defaultSearchFields);
      if (!checked.length) {
        checkboxNodes.forEach(item => {
          item.checked = defaultSearchFields.includes(item.value);
        });
      }
      applySearch();
    });
  });

  document.addEventListener('click', (event) => {
    if (!wrap.contains(event.target)) {
      popover.hidden = true;
    }
  });

  arrangeToolbarLayout();
}

function ensureToolbarRow(id) {
  if (!toolbar) return null;
  let row = document.getElementById(id);
  if (!row) {
    row = document.createElement('div');
    row.id = id;
    row.className = 'toolbar-row';
  }
  toolbar.appendChild(row);
  return row;
}

async function updateHiddenStatus(itemId, hidden) {
  const selected = state.items.find(entry => entry.id === itemId);
  if (!isEditableItem(selected)) {
    return;
  }
  const response = await fetch(`${writeApiBase}/${itemId}/hidden`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ hidden }),
  });
  if (!response.ok) {
    alert(t('hidden.updateFailed', 'Failed to update hidden status.'));
    return;
  }
  closeDetail();
  await loadItems();
}

function getItemsEndpoint() {
  if (state.hiddenSpace && pageMode !== 'readonly') {
    return `${readApiBase}?hidden_only=1`;
  }
  return readApiBase;
}

async function toggleHiddenSpace() {
  state.hiddenSpace = !state.hiddenSpace;
  closeDetail();
  applyStaticTexts();
  renderToolbarControls();
  renderSearchFilterControl();
  await loadItems();
}

function arrangeToolbarLayout() {
  if (!toolbar) return;
  const statusRow = ensureToolbarRow('toolbarStatusRow');
  const actionRow = ensureToolbarRow('toolbarActionRow');
  const extraRow = ensureToolbarRow('toolbarExtraRow');
  if (!statusRow || !actionRow || !extraRow) return;

  const compact = window.matchMedia('(max-width: 1024px)').matches;
  toolbar.classList.toggle('compact-layout', compact);
  toolbar.classList.toggle('wide-layout', !compact);
  const searchBox = searchInput?.closest('.search-box') || toolbar.querySelector('.search-box');
  const filterWrap = document.getElementById('searchFilterWrap');
  const hiddenSpaceBtn = document.getElementById('hiddenSpaceBtn');
  const switchBtn = document.getElementById('switchPageBtn');
  const addButton = addBtn;
  const statusWrap = document.getElementById('statusWrap');
  const settingsWrap = document.getElementById('settingsWrap');

  [statusWrap, settingsWrap].forEach((node) => {
    if (node) statusRow.appendChild(node);
  });

  if (compact) {
    [searchBox, filterWrap, hiddenSpaceBtn, addButton].forEach((node) => {
      if (node) actionRow.appendChild(node);
    });
    if (switchBtn) {
      extraRow.appendChild(switchBtn);
      extraRow.hidden = false;
    } else {
      extraRow.hidden = true;
    }
  } else {
    [searchBox, filterWrap, hiddenSpaceBtn, switchBtn, addButton].forEach((node) => {
      if (node) actionRow.appendChild(node);
    });
    extraRow.hidden = true;
  }
}

function closeSettingsModal() {
  document.getElementById('settingsModalOverlay')?.classList.remove('open');
}

async function openSettingsModal() {
  const overlay = document.getElementById('settingsModalOverlay');
  const scrollTop = overlay?.querySelector('#settingsContent')?.scrollTop || 0;
  await rebuildFontOptions();
  renderSettingsModal({ open: true, scrollTop });
  updateThemeControlUI();
}

async function logoutAccount() {
  const response = await fetch('/api/auth/logout', { method: 'POST' });
  if (!response.ok) {
    throw new Error(t('settings.account.logoutFailed', 'Logout failed.'));
  }
  window.location.href = '/auth/login';
}

async function resolveAccountApiError(response, fallbackMessage) {
  let detail = '';
  try {
    const payload = await response.json();
    detail = typeof payload?.detail === 'string' ? payload.detail : '';
  } catch {}

  if (detail === 'Password confirmation failed.') {
    return t('settings.account.passwordConfirmFailed', 'Password confirmation failed.');
  }
  if (detail === 'Authentication required.') {
    return t('settings.account.authRequired', 'Authentication required.');
  }
  return detail || fallbackMessage;
}

async function unregisterAccount(confirmPassword) {
  const normalized = (confirmPassword || '').toString();
  if (!normalized.trim()) {
    throw new Error(t('settings.account.passwordRequired', 'Password is required.'));
  }
  const response = await fetch('/api/auth/unregister', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ confirm_password: normalized }),
  });
  if (!response.ok) {
    const msg = await resolveAccountApiError(
      response,
      t('settings.account.unregisterFailed', 'Account deletion failed.')
    );
    throw new Error(msg);
  }
  window.location.href = '/auth/register';
}

function closeUnregisterModal() {
  const overlay = document.getElementById('unregisterModalOverlay');
  if (!overlay) return;
  overlay.classList.remove('open');
  overlay.setAttribute('aria-hidden', 'true');
}

function openUnregisterModal() {
  let overlay = document.getElementById('unregisterModalOverlay');
  if (overlay) {
    overlay.classList.add('open');
    overlay.setAttribute('aria-hidden', 'false');
    overlay.querySelector('#unregisterPasswordInput')?.focus();
    return;
  }

  overlay = document.createElement('div');
  overlay.className = 'modal-overlay open';
  overlay.id = 'unregisterModalOverlay';
  overlay.setAttribute('aria-hidden', 'false');
  overlay.innerHTML = `
    <div class="modal-card confirm-modal">
      <div class="modal-header">
        <div class="page-title-wrap">
          <img class="site-logo" src="/static/img/Icon.svg" alt="Logo" loading="lazy" onerror="this.style.display='none'" />
          <h2>${escapeHtml(t('settings.account.unregisterConfirmTitle', 'Are you sure you want to unregister?'))}</h2>
        </div>
        <button class="icon-btn" type="button" id="closeUnregisterModalBtn" aria-label="${escapeHtml(t('common.close', 'Close'))}">&times;</button>
      </div>
      <p class="confirm-text">${escapeHtml(t('settings.account.unregisterConfirmDesc', 'Please enter your password to verify.'))}</p>
      <div class="memory-form" style="grid-template-columns:1fr;padding-top:10px;">
        <div class="field full" style="margin:0;">
          <label for="unregisterPasswordInput">${escapeHtml(t('settings.account.passwordLabel', 'Password'))}</label>
          <input id="unregisterPasswordInput" type="password" placeholder="${escapeHtml(t('settings.account.passwordPlaceholder', 'Enter your password'))}" autocomplete="current-password" />
        </div>
      </div>
      <div class="modal-actions">
        <button class="secondary-btn" type="button" id="cancelUnregisterModalBtn">${escapeHtml(t('common.cancel', 'Cancel'))}</button>
        <button class="danger-btn" type="button" id="confirmUnregisterModalBtn">${escapeHtml(t('settings.account.confirmBtn', 'Confirm'))}</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);

  const closeBtn = overlay.querySelector('#closeUnregisterModalBtn');
  const cancelBtn = overlay.querySelector('#cancelUnregisterModalBtn');
  const confirmBtn = overlay.querySelector('#confirmUnregisterModalBtn');
  const passwordInput = overlay.querySelector('#unregisterPasswordInput');

  const submitUnregister = async () => {
    try {
      await unregisterAccount(passwordInput?.value || '');
    } catch (error) {
      alert(error.message || t('settings.account.unregisterFailed', 'Account deletion failed.'));
    }
  };

  closeBtn?.addEventListener('click', closeUnregisterModal);
  cancelBtn?.addEventListener('click', closeUnregisterModal);
  confirmBtn?.addEventListener('click', submitUnregister);
  passwordInput?.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      void submitUnregister();
    }
  });
  overlay.addEventListener('click', (event) => {
    if (event.target === overlay) {
      closeUnregisterModal();
    }
  });
  passwordInput?.focus();
}

function renderThemePresetGroup(mode, groupKey, titleKey, fallbackTitle) {
  const groups = getThemePresetsForMode(mode);
  const groupItems = groupKey === 'solid' ? groups.solid : groups.gradient;
  if (!groupItems.length) return '';
  const activeId = state.themePresetByMode[mode];
  return `
    <div class="settings-theme-group">
      <h4>${escapeHtml(t(titleKey, fallbackTitle))}</h4>
      <div class="theme-preset-grid">
        ${groupItems.map((preset) => `
          <button
            type="button"
            class="theme-preset-btn ${preset.id === activeId ? 'active' : ''}"
            data-theme-preset-mode="${escapeHtml(mode)}"
            data-theme-preset-id="${escapeHtml(preset.id)}"
            title="${escapeHtml(preset.name || preset.id)}"
            style="--preset-bg:${escapeHtml(preset.gradient)}"
          ></button>
        `).join('')}
      </div>
    </div>
  `;
}

function refreshSettingsThemeSection(overlay) {
  if (!overlay) return;
  const resolvedMode = resolveThemeMode(state.themeMode);
  const hint = overlay.querySelector('#settingsThemeModeHint');
  if (hint) {
    hint.textContent = `${t('settings.theme.currentMode', 'Current mode preset list')}: ${t(`theme.${resolvedMode}`, resolvedMode)}`;
  }
  const host = overlay.querySelector('#settingsThemePresetHost');
  if (host) {
    host.innerHTML = `
      ${renderThemePresetGroup(resolvedMode, 'solid', 'settings.theme.solid', 'Solid Presets')}
      ${renderThemePresetGroup(resolvedMode, 'gradient', 'settings.theme.gradient', 'Gradient Presets')}
    `;
    host.querySelectorAll('.theme-preset-btn[data-theme-preset-id][data-theme-preset-mode]').forEach((button) => {
      button.addEventListener('click', () => {
        const mode = button.getAttribute('data-theme-preset-mode');
        const presetId = button.getAttribute('data-theme-preset-id');
        if (!mode || !presetId) return;
        console.debug('[theme] preset click', { mode, presetId });
        applyThemePreset(mode, { persist: true, forcedPresetId: presetId });
        refreshSettingsThemeSection(overlay);
      });
    });
  }
  updateThemeControlUI();
}

function renderSettingsModal(options = {}) {
  const { open = false, scrollTop = 0 } = options;
  const existing = document.getElementById('settingsModalOverlay');
  if (existing) existing.remove();
  const resolvedMode = resolveThemeMode(state.themeMode);
  ensureThemePreset('light');
  ensureThemePreset('dark');

  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.id = 'settingsModalOverlay';
  overlay.innerHTML = `
    <div class="modal-card settings-modal">
      <div class="modal-header">
        <h2>${escapeHtml(t('settings.title', 'Settings'))}</h2>
        <button class="icon-btn" type="button" id="closeSettingsBtn" aria-label="${escapeHtml(t('common.close', 'Close'))}">&times;</button>
      </div>
      <div class="settings-layout">
        <aside class="settings-nav">
          <button type="button" class="settings-nav-btn" data-settings-target="settingsThemeSection">${escapeHtml(t('settings.nav.theme', 'Theme'))}</button>
          <button type="button" class="settings-nav-btn" data-settings-target="settingsFontSection">${escapeHtml(t('settings.nav.font', 'Font'))}</button>
          <button type="button" class="settings-nav-btn" data-settings-target="settingsLanguageSection">${escapeHtml(t('settings.nav.language', 'Language'))}</button>
          ${pageScope === 'personal' ? `<button type="button" class="settings-nav-btn" data-settings-target="settingsAccountSection">${escapeHtml(t('settings.nav.account', 'Account'))}</button>` : ''}
        </aside>
        <div class="settings-content" id="settingsContent">
          <section class="settings-section" id="settingsThemeSection">
            <h3>${escapeHtml(t('settings.section.theme', 'Theme Mode'))}</h3>
            <div class="theme-wrap settings-theme-wrap">
              <button class="icon-btn theme-option" type="button" data-theme-mode="light" title="${escapeHtml(t('theme.light', 'Light Mode'))}" aria-label="${escapeHtml(t('theme.light', 'Light Mode'))}">
                &#9728;
              </button>
              <button class="icon-btn theme-option" type="button" data-theme-mode="dark" title="${escapeHtml(t('theme.dark', 'Dark Mode'))}" aria-label="${escapeHtml(t('theme.dark', 'Dark Mode'))}">
                &#9790;
              </button>
              <button class="icon-btn theme-option" type="button" data-theme-mode="system" title="${escapeHtml(t('theme.system', 'System'))}" aria-label="${escapeHtml(t('theme.system', 'System'))}">
                &#9680;
              </button>
            </div>
            <p class="settings-theme-mode-hint" id="settingsThemeModeHint">${escapeHtml(t('settings.theme.currentMode', 'Current mode preset list'))}: ${escapeHtml(t(`theme.${resolvedMode}`, resolvedMode))}</p>
            <div id="settingsThemePresetHost">
              ${renderThemePresetGroup(resolvedMode, 'solid', 'settings.theme.solid', 'Solid Presets')}
              ${renderThemePresetGroup(resolvedMode, 'gradient', 'settings.theme.gradient', 'Gradient Presets')}
            </div>
          </section>
          <section class="settings-section" id="settingsFontSection">
            <h3>${escapeHtml(t('settings.section.font', 'Font'))}</h3>
            <p class="settings-font-help">${escapeHtml(t('settings.font.help', 'Select a local system font. If unavailable, it falls back to Microsoft YaHei.'))}</p>
            <p class="settings-font-help">${escapeHtml(t('settings.font.source', 'Font list source'))}: ${escapeHtml(state.fontSource === 'local' ? t('settings.font.source.local', 'Local fonts') : t('settings.font.source.preset', 'Preset compatibility list'))}</p>
            <div class="settings-font-controls">
              <select class="settings-font-select" id="settingsFontSelect" ${state.fontSelectionEnabled ? '' : 'disabled'}>
                <option value="">${escapeHtml(t('settings.font.useDefault', 'Use Default'))}</option>
                ${
                  state.customFontFamily && !state.fontOptions.some(item => item.value === state.customFontFamily)
                    ? `<option value="${escapeHtml(state.customFontFamily)}" selected>${escapeHtml(`${t('settings.font.customSaved', 'Saved custom')}: ${stripQuotes(state.customFontFamily)}`)}</option>`
                    : ''
                }
                ${state.fontOptions.map((item) => `
                  <option value="${escapeHtml(item.value)}" ${item.value === state.customFontFamily ? 'selected' : ''}>
                    ${escapeHtml(item.label)}
                  </option>
                `).join('')}
              </select>
            </div>
            ${
              state.fontSelectionEnabled
                ? ''
                : `<p class="settings-font-help">${escapeHtml(t('settings.font.disabledHint', 'Local font access is unavailable in this browser, so font selection is disabled.'))}</p>`
            }
            <p class="settings-font-current" id="settingsFontCurrent">
              ${escapeHtml(t('settings.font.current', 'Current'))}: ${escapeHtml(state.customFontFamily || state.appFontFamily)}
            </p>
          </section>
          <section class="settings-section" id="settingsLanguageSection">
            <h3>${escapeHtml(t('settings.section.language', 'Language'))}</h3>
            <select class="settings-language-select" id="settingsLanguageSelect">
              ${state.supportedLocales.map((locale) => `
                <option value="${escapeHtml(locale)}" ${locale === state.locale ? 'selected' : ''}>${escapeHtml(`${localeFlag(locale)} ${localeLabel(locale)}`)}</option>
              `).join('')}
            </select>
          </section>
          ${
            pageScope === 'personal'
              ? `<section class="settings-section" id="settingsAccountSection">
            <h3>${escapeHtml(t('settings.section.account', 'Account'))}</h3>
            <p class="settings-font-help">${escapeHtml(t('settings.account.hint', 'Logout or unregister your account. Unregister requires password confirmation and does not delete memory data.'))}</p>
            <div class="modal-actions" style="justify-content:flex-start;">
              <button class="secondary-btn" type="button" id="logoutAccountBtn">${escapeHtml(t('settings.account.logout', 'Logout'))}</button>
              <button class="danger-btn" type="button" id="unregisterAccountBtn">${escapeHtml(t('settings.account.unregister', 'Unregister Account'))}</button>
            </div>
          </section>`
              : ''
          }
        </div>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);
  if (open) {
    overlay.classList.add('open');
  }

  overlay.querySelector('#closeSettingsBtn')?.addEventListener('click', closeSettingsModal);
  overlay.querySelectorAll('.theme-option[data-theme-mode]').forEach((button) => {
    button.addEventListener('click', () => {
      const mode = button.getAttribute('data-theme-mode') || 'system';
      applyTheme(mode);
      refreshSettingsThemeSection(overlay);
    });
  });

  overlay.querySelector('#settingsLanguageSelect')?.addEventListener('change', async (event) => {
    const locale = event.target?.value;
    await setLocale(locale);
  });

  const fontSelect = overlay.querySelector('#settingsFontSelect');
  const fontCurrent = overlay.querySelector('#settingsFontCurrent');
  const refreshFontCurrent = () => {
    if (!fontCurrent) return;
    fontCurrent.textContent = `${t('settings.font.current', 'Current')}: ${state.customFontFamily || state.appFontFamily}`;
  };
  const applyCustomFontFromSelect = () => {
    if (!fontSelect) return;
    saveCustomFontFamily(fontSelect.value);
    applyEffectiveFontFamily();
    refreshFontCurrent();
  };
  if (state.fontSelectionEnabled) {
    fontSelect?.addEventListener('change', applyCustomFontFromSelect);
  }

  overlay.querySelector('#logoutAccountBtn')?.addEventListener('click', async () => {
    try {
      await logoutAccount();
    } catch (error) {
      alert(error.message || t('settings.account.logoutFailed', 'Logout failed.'));
    }
  });
  overlay.querySelector('#unregisterAccountBtn')?.addEventListener('click', async () => {
    try {
      openUnregisterModal();
    } catch (error) {
      alert(error.message || t('settings.account.unregisterFailed', 'Account deletion failed.'));
    }
  });

  overlay.querySelectorAll('.settings-nav-btn[data-settings-target]').forEach((button) => {
    button.addEventListener('click', () => {
      const targetId = button.getAttribute('data-settings-target');
      const target = overlay.querySelector(`#${targetId}`);
      if (target) {
        target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    });
  });

  refreshSettingsThemeSection(overlay);
  if (open) {
    const content = overlay.querySelector('#settingsContent');
    if (content) {
      window.requestAnimationFrame(() => {
        content.scrollTop = scrollTop;
      });
    }
  }
}

function bindToolbarLayout() {
  if (toolbarLayoutBound) return;
  toolbarLayoutBound = true;
  window.addEventListener('resize', arrangeToolbarLayout);
}

function renderToolbarControls() {
  if (!toolbar || !addBtn) return;
  const searchBoxEl = searchInput?.closest('.search-box');
  if (searchBoxEl && searchBoxEl.parentElement !== toolbar) {
    toolbar.appendChild(searchBoxEl);
  }
  if (addBtn.parentElement !== toolbar) {
    toolbar.appendChild(addBtn);
  }

  const existingSettings = document.getElementById('settingsModalOverlay');
  const settingsWasOpen = !!existingSettings?.classList.contains('open');
  const settingsScrollTop = existingSettings?.querySelector('#settingsContent')?.scrollTop || 0;

  document.getElementById('toolbarStatusRow')?.remove();
  document.getElementById('toolbarActionRow')?.remove();
  document.getElementById('toolbarExtraRow')?.remove();
  document.getElementById('statusWrap')?.remove();
  document.getElementById('settingsWrap')?.remove();
  document.getElementById('switchPageBtn')?.remove();
  document.getElementById('hiddenSpaceBtn')?.remove();

  const switchBtn = document.createElement('button');
  switchBtn.type = 'button';
  switchBtn.className = 'secondary-btn nav-btn';
  switchBtn.id = 'switchPageBtn';
  switchBtn.textContent = pageType === 'music'
    ? t('common.switchToMind', 'Go Mind')
    : t('common.switchToMusic', 'Go Music');
  switchBtn.addEventListener('click', () => {
    window.location.href = pageType === 'music' ? `/mind/${routeScope}` : `/music/${routeScope}`;
  });
  toolbar.appendChild(switchBtn);

  if (pageMode !== 'readonly') {
    const hiddenSpaceBtn = document.createElement('button');
    hiddenSpaceBtn.type = 'button';
    hiddenSpaceBtn.className = 'secondary-btn nav-btn';
    hiddenSpaceBtn.id = 'hiddenSpaceBtn';
    hiddenSpaceBtn.textContent = state.hiddenSpace
      ? t('hidden.exit', 'Exit Hidden Space')
      : t('hidden.enter', 'Hidden Space');
    hiddenSpaceBtn.addEventListener('click', () => {
      void toggleHiddenSpace();
    });
    toolbar.appendChild(hiddenSpaceBtn);
  }

  const statusWrap = document.createElement('div');
  statusWrap.className = 'status-wrap';
  statusWrap.id = 'statusWrap';
  statusWrap.innerHTML = `
    <div class="status-pill">
      <span class="status-dot pending" id="versionStatusDot"></span>
      <span id="versionStatusText">${escapeHtml(t('status.version', ''))} ${escapeHtml(appVersion)} · ${escapeHtml(t('status.checking', ''))}</span>
    </div>
    <div class="status-pill">
      <span class="status-dot pending" id="healthStatusDot"></span>
      <span id="healthStatusText">${escapeHtml(t('status.health', ''))} ${escapeHtml(t('status.checking', ''))}</span>
    </div>
  `;
  toolbar.appendChild(statusWrap);

  const settingsWrap = document.createElement('div');
  settingsWrap.className = 'settings-wrap';
  settingsWrap.id = 'settingsWrap';
  settingsWrap.innerHTML = `
    <button class="secondary-btn nav-btn" type="button" id="openSettingsBtn">${escapeHtml(t('common.settings', 'Settings'))}</button>
  `;
  toolbar.appendChild(settingsWrap);

  settingsWrap.querySelector('#openSettingsBtn')?.addEventListener('click', () => {
    void openSettingsModal();
  });

  renderSettingsModal({ open: settingsWasOpen, scrollTop: settingsScrollTop });

  updateThemeControlUI();
  updateSystemStatusUI();
  arrangeToolbarLayout();
  bindToolbarLayout();
}

function applyStaticTexts() {
  const titleKey = pageType === 'music' ? 'page.music.title' : 'page.mind.title';
  const title = t(titleKey, pageType === 'music' ? 'Music MemoSpace' : 'Mind MemoSpace');
  document.title = title;
  document.documentElement.lang = state.locale;
  if (pageTitleEl) pageTitleEl.textContent = title;
  searchInput.placeholder = t('common.search', 'Search');
  addBtn.textContent = t('common.add', 'Add');
  addBtn.style.display = pageMode === 'readonly' ? 'none' : '';
  panelCloseBtn.textContent = '☰';
  panelCloseBtn.title = t('common.close', 'Close');
  panelCloseBtn.setAttribute('aria-label', t('common.close', 'Close'));
  if (deleteModalTitleEl) deleteModalTitleEl.textContent = t('common.deleteTitle', 'Confirm Delete');
  if (deleteModalTextEl) deleteModalTextEl.textContent = t('common.deleteText', 'Deletion is irreversible. Continue?');
  if (deleteCancelBtn) deleteCancelBtn.textContent = t('common.cancel', 'Cancel');
  if (confirmDeleteBtn) confirmDeleteBtn.textContent = t('common.delete', 'Delete');
  if (detailPlaceholderEl && !state.selectedId) {
    detailPlaceholderEl.textContent = state.hiddenSpace
      ? t('hidden.selectCard', 'Select a hidden card to view details.')
      : t('common.selectCard', 'Select a card to view details.');
  }
}

async function loadLocaleMessages(locale) {
  const selected = state.supportedLocales.includes(locale) ? locale : state.defaultLocale;
  const response = await fetch(`/static/locales/${selected}.json?v=${encodeURIComponent(appVersion)}`);
  if (!response.ok) {
    throw new Error(`Locale file not found: ${selected}`);
  }
  return response.json();
}

async function setLocale(locale) {
  try {
    state.messages = await loadLocaleMessages(locale);
    state.locale = state.supportedLocales.includes(locale) ? locale : state.defaultLocale;
  } catch {
    state.messages = await loadLocaleMessages(state.defaultLocale);
    state.locale = state.defaultLocale;
  }

  localStorage.setItem(localeStorageKey, state.locale);
  applyStaticTexts();
  renderToolbarControls();
  renderSearchFilterControl();
  renderCards();

  if (state.selectedId) {
    const selected = state.items.find(item => item.id === state.selectedId);
    if (selected) openDetail(selected);
  }
}

async function loadUiConfig() {
  const response = await fetch('/api/config/ui');
  if (!response.ok) {
    throw new Error('Failed to load UI config.');
  }
  const data = await response.json();
  const appFontFamily = (data?.app_font_family || '').toString().trim();
  state.appFontFamily = appFontFamily || fallbackAppFontFamily;
  await rebuildFontOptions();
  applyEffectiveFontFamily();
  state.linkOptions = Array.isArray(data?.link_options) ? data.link_options : [];
  const loadedColorConfig = data?.color_config || {};
  state.colorConfig = {
    ...fallbackColorConfig,
    ...loadedColorConfig,
    presets: Array.isArray(loadedColorConfig?.presets) && loadedColorConfig.presets.length
      ? loadedColorConfig.presets
      : fallbackColorConfig.presets,
  };

  const normalizeThemePresetList = (items) => (Array.isArray(items) ? items : [])
    .map((item) => ({
      id: (item?.id || '').toString().trim(),
      name: (item?.name || '').toString().trim(),
      gradient: (item?.gradient || '').toString().trim(),
      accent: (item?.accent || '').toString().trim(),
      accent_strong: (item?.accent_strong || item?.accent || '').toString().trim(),
      accent_soft: (item?.accent_soft || item?.accent || '').toString().trim(),
    }))
    .filter((item) => item.id && item.gradient && item.accent);

  const rawThemeConfig = data?.theme_config || {};
  const lightTheme = rawThemeConfig?.light || {};
  const darkTheme = rawThemeConfig?.dark || {};
  state.themeConfig = {
    light: {
      solid: normalizeThemePresetList(lightTheme.solid),
      gradient: normalizeThemePresetList(lightTheme.gradient),
    },
    dark: {
      solid: normalizeThemePresetList(darkTheme.solid),
      gradient: normalizeThemePresetList(darkTheme.gradient),
    },
  };
  if (!state.themeConfig.light.solid.length && !state.themeConfig.light.gradient.length) {
    state.themeConfig.light = { ...fallbackThemeConfig.light };
  }
  if (!state.themeConfig.dark.solid.length && !state.themeConfig.dark.gradient.length) {
    state.themeConfig.dark = { ...fallbackThemeConfig.dark };
  }
  ensureThemePreset('light');
  ensureThemePreset('dark');
  const savedMode = normalizeThemeMode(localStorage.getItem(themeStorageKey));
  state.themeMode = savedMode;
  applyTheme(savedMode, { persist: false });

  const configuredLocales = Array.isArray(data?.i18n?.locales)
    ? data.i18n.locales
      .map((locale) => (locale || '').toString().trim())
      .filter(Boolean)
    : [];
  state.supportedLocales = configuredLocales.length ? [...new Set(configuredLocales)] : [fallbackDefaultLocale];

  const configuredDefault = (data?.i18n?.default_locale || '').toString().trim();
  state.defaultLocale = state.supportedLocales.includes(configuredDefault)
    ? configuredDefault
    : state.supportedLocales[0];

  const configuredLabels = data?.i18n?.labels && typeof data.i18n.labels === 'object'
    ? data.i18n.labels
    : {};
  const labels = {};
  state.supportedLocales.forEach((locale) => {
    const label = (configuredLabels[locale] || '').toString().trim();
    if (label) labels[locale] = label;
  });
  state.localeLabels = labels;
  const configuredFlags = data?.i18n?.flags && typeof data.i18n.flags === 'object'
    ? data.i18n.flags
    : {};
  const flags = {};
  state.supportedLocales.forEach((locale) => {
    const flag = (configuredFlags[locale] || '').toString().trim();
    if (flag) flags[locale] = flag;
  });
  state.localeFlags = flags;
}

async function loadItems() {
  const response = await fetch(getItemsEndpoint());
  const data = await response.json();
  state.items = data.map(item => ({
    ...item,
    scope: item.scope || pageScope,
    tags: Array.isArray(item.tags) ? item.tags : [],
    links: normaliseLinks(item.links),
    hidden: !!item.hidden,
  }));
  applySearch();
}

searchInput.addEventListener('input', applySearch);
addBtn.addEventListener('click', () => {
  if (pageMode === 'readonly') return;
  openFormModal('create');
});
panelCloseBtn.addEventListener('click', closeDetail);
confirmDeleteBtn.addEventListener('click', confirmDelete);

document.querySelectorAll('[data-close-delete]').forEach(btn => {
  btn.addEventListener('click', closeDeleteModal);
});

document.querySelectorAll('[data-close-form]').forEach(btn => {
  btn.addEventListener('click', closeFormModal);
});

deleteModalOverlay.addEventListener('click', (event) => {
  if (event.target === deleteModalOverlay) closeDeleteModal();
});

window.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') {
    closeFormModal();
    closeDeleteModal();
    closeSettingsModal();
    closeUnregisterModal();
    closeDetail();
  }
});

async function init() {
  initThemeMode();
  await loadUiConfig();
  saveCustomFontFamily(localStorage.getItem(fontStorageKey) || '');
  await rebuildFontOptions();
  applyEffectiveFontFamily();
  const preferredLocale = localStorage.getItem(localeStorageKey) || state.defaultLocale;
  await setLocale(preferredLocale);
  await loadItems();
  startSystemStatusPolling();
}

init().catch((err) => {
  console.error(err);
  alert(t('form.initFailed', 'Initialization failed.'));
});



