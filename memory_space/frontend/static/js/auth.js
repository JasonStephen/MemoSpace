const authMode = document.body.dataset.authMode;
const form = document.getElementById('authForm');
const errorEl = document.getElementById('authError');
const settingsToggleBtn = document.getElementById('authSettingsToggleBtn');
const settingsPanel = document.getElementById('authSettingsPanel');

const appVersion = window.__APP_VERSION__ || 'dev';
const localeStorageKey = 'memory_space_locale';
const fontStorageKey = 'memory_space_custom_font_family';
const themeStorageKey = 'memory_space_theme_mode';
const themePresetStoragePrefix = 'memory_space_theme_preset_';
const fallbackDefaultLocale = 'en';
const fallbackAppFontFamily = '"Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif';
const colorSchemeMedia = window.matchMedia('(prefers-color-scheme: dark)');

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
  messages: {},
  locale: fallbackDefaultLocale,
  supportedLocales: [fallbackDefaultLocale],
  defaultLocale: fallbackDefaultLocale,
  localeLabels: {},
  localeFlags: {},
  appFontFamily: fallbackAppFontFamily,
  customFontFamily: '',
  fontOptions: [],
  fontSource: 'preset',
  fontSelectionEnabled: false,
  themeMode: 'system',
  themeConfig: { ...fallbackThemeConfig },
  themePresetByMode: { light: '', dark: '' },
};
let themeSwitchTimer = null;

const escapeHtml = (value) => String(value ?? '')
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;')
  .replaceAll("'", '&#39;');

function t(key, fallback = '') {
  return state.messages[key] || fallback || key;
}

function setError(message = '') {
  if (errorEl) errorEl.textContent = message;
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
    } catch {}
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
  return [...solid, ...gradient];
}

function ensureThemePreset(mode) {
  const presets = getThemePresetsForMode(mode);
  if (!presets.length) return null;
  const stored = localStorage.getItem(getThemePresetStorageKey(mode)) || '';
  let currentId = state.themePresetByMode[mode] || stored;
  if (!presets.some(item => item.id === currentId)) {
    currentId = presets[0].id;
  }
  state.themePresetByMode[mode] = currentId;
  return presets.find(item => item.id === currentId) || presets[0];
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

function applyThemePreset(mode, { presetId = '', persist = false, animate = true } = {}) {
  if (presetId) {
    state.themePresetByMode[mode] = presetId;
  }
  const preset = ensureThemePreset(mode);
  if (!preset) return;
  if (animate && resolveThemeMode(state.themeMode) === mode) {
    startThemeSwitchTransition();
  }
  document.documentElement.style.setProperty('--bg-gradient', preset.gradient);
  document.documentElement.style.setProperty('--theme-accent', preset.accent);
  document.documentElement.style.setProperty('--theme-accent-strong', preset.accent_strong || preset.accent);
  document.documentElement.style.setProperty('--theme-accent-soft', preset.accent_soft || preset.accent);

  if (persist) {
    localStorage.setItem(getThemePresetStorageKey(mode), state.themePresetByMode[mode]);
  }
}

function applyTheme(mode, { persist = true, animate = true } = {}) {
  const nextMode = normalizeThemeMode(mode);
  const modeChanged = nextMode !== state.themeMode;
  state.themeMode = nextMode;
  const resolved = resolveThemeMode(state.themeMode);
  if (animate && modeChanged) {
    startThemeSwitchTransition();
  }
  document.documentElement.setAttribute('data-theme', resolved);
  if (persist) {
    localStorage.setItem(themeStorageKey, state.themeMode);
  }
  applyThemePreset(resolved, { persist: true, animate: false });
  updateSettingsThemeUI();
}

function updateSettingsThemeUI() {
  settingsPanel?.querySelectorAll('.theme-option[data-theme-mode]').forEach((button) => {
    const mode = button.getAttribute('data-theme-mode');
    const active = mode === state.themeMode;
    button.classList.toggle('active', active);
    button.setAttribute('aria-pressed', active ? 'true' : 'false');
  });

  const hint = document.getElementById('authThemeModeHint');
  if (hint) {
    const resolved = resolveThemeMode(state.themeMode);
    hint.textContent = `${t('auth.settings.themeCurrent', 'Current theme')}: ${t(`theme.${resolved}`, resolved)}`;
  }

  const host = document.getElementById('authThemePresetHost');
  if (!host) return;
  const resolvedMode = resolveThemeMode(state.themeMode);
  const presets = getThemePresetsForMode(resolvedMode);
  const activeId = state.themePresetByMode[resolvedMode];

  host.innerHTML = presets.map((preset) => `
    <button
      type="button"
      class="theme-preset-btn ${preset.id === activeId ? 'active' : ''}"
      data-theme-preset-mode="${escapeHtml(resolvedMode)}"
      data-theme-preset-id="${escapeHtml(preset.id)}"
      title="${escapeHtml(preset.name || preset.id)}"
      style="--preset-bg:${escapeHtml(preset.gradient)}"
    ></button>
  `).join('');

  host.querySelectorAll('.theme-preset-btn[data-theme-preset-id][data-theme-preset-mode]').forEach((button) => {
    button.addEventListener('click', () => {
      const mode = button.getAttribute('data-theme-preset-mode') || resolvedMode;
      const presetId = button.getAttribute('data-theme-preset-id') || '';
      applyThemePreset(mode, { presetId, persist: true });
      updateSettingsThemeUI();
    });
  });
}

function localeLabel(locale) {
  return state.localeLabels[locale] || locale;
}

function localeFlag(locale) {
  return state.localeFlags[locale] || '🌐';
}

function renderSettingsPanel() {
  if (!settingsPanel) return;

  settingsPanel.innerHTML = `
    <section class="auth-settings-section">
      <h3 class="auth-settings-title">${escapeHtml(t('settings.section.theme', 'Theme Mode'))}</h3>
      <div class="theme-wrap auth-theme-wrap">
        <button class="icon-btn theme-option" type="button" data-theme-mode="light" title="${escapeHtml(t('theme.light', 'Light Mode'))}" aria-label="${escapeHtml(t('theme.light', 'Light Mode'))}">☀</button>
        <button class="icon-btn theme-option" type="button" data-theme-mode="dark" title="${escapeHtml(t('theme.dark', 'Dark Mode'))}" aria-label="${escapeHtml(t('theme.dark', 'Dark Mode'))}">☾</button>
        <button class="icon-btn theme-option" type="button" data-theme-mode="system" title="${escapeHtml(t('theme.system', 'System'))}" aria-label="${escapeHtml(t('theme.system', 'System'))}">◐</button>
      </div>
      <p class="auth-theme-hint" id="authThemeModeHint"></p>
      <div class="auth-theme-presets" id="authThemePresetHost"></div>
    </section>

    <section class="auth-settings-section">
      <h3 class="auth-settings-title">${escapeHtml(t('settings.section.font', 'Font'))}</h3>
      <select class="auth-settings-select" id="authFontSelect" ${state.fontSelectionEnabled ? '' : 'disabled'}>
        <option value="">${escapeHtml(t('settings.font.useDefault', 'Use Default'))}</option>
        ${state.fontOptions.map((item) => `
          <option value="${escapeHtml(item.value)}" ${item.value === state.customFontFamily ? 'selected' : ''}>${escapeHtml(item.label)}</option>
        `).join('')}
      </select>
    </section>

    <section class="auth-settings-section">
      <h3 class="auth-settings-title">${escapeHtml(t('settings.section.language', 'Language'))}</h3>
      <select class="auth-settings-select" id="authLanguageSelect">
        ${state.supportedLocales.map((locale) => `
          <option value="${escapeHtml(locale)}" ${locale === state.locale ? 'selected' : ''}>${escapeHtml(`${localeFlag(locale)} ${localeLabel(locale)}`)}</option>
        `).join('')}
      </select>
    </section>
  `;

  settingsPanel.querySelectorAll('.theme-option[data-theme-mode]').forEach((button) => {
    button.addEventListener('click', () => {
      const mode = button.getAttribute('data-theme-mode') || 'system';
      applyTheme(mode);
    });
  });

  settingsPanel.querySelector('#authFontSelect')?.addEventListener('change', (event) => {
    saveCustomFontFamily(event.target?.value || '');
    applyEffectiveFontFamily();
  });

  settingsPanel.querySelector('#authLanguageSelect')?.addEventListener('change', async (event) => {
    await setLocale(event.target?.value || state.defaultLocale);
  });

  updateSettingsThemeUI();
}

function applyStaticTexts() {
  document.title = authMode === 'register'
    ? t('auth.register.documentTitle', 'MemoSpace Register')
    : t('auth.login.documentTitle', 'MemoSpace Login');

  const brandTitle = document.getElementById('authBrandTitle');
  const brandSubtitle = document.getElementById('authBrandSubtitle');
  const pageTitle = document.getElementById('authPageTitle');
  const pageHelp = document.getElementById('authPageHelp');
  const usernameLabel = document.getElementById('authUsernameLabel');
  const passwordLabel = document.getElementById('authPasswordLabel');
  const confirmPasswordLabel = document.getElementById('authConfirmPasswordLabel');
  const submitBtn = document.getElementById('authSubmitBtn');
  const publicLink = document.getElementById('authPublicLink');

  if (settingsToggleBtn) settingsToggleBtn.textContent = t('common.settings', 'Settings');
  if (brandTitle) brandTitle.textContent = t('auth.brand.title', 'MemoSpace');
  if (brandSubtitle) {
    brandSubtitle.textContent = authMode === 'register'
      ? t('auth.brand.subtitle.register', 'Create the one and only account for this device.')
      : t('auth.brand.subtitle.login', 'Sign in to access the personal space.');
  }
  if (pageTitle) {
    pageTitle.textContent = authMode === 'register'
      ? t('auth.page.register.title', 'Register Account')
      : t('auth.page.login.title', 'Sign In');
  }
  if (pageHelp) {
    pageHelp.textContent = authMode === 'register'
      ? t('auth.page.register.help', 'Create an account and sign in automatically.')
      : t('auth.page.login.help', 'Use your registered account credentials.');
  }
  if (usernameLabel) usernameLabel.textContent = t('auth.field.username', 'Username');
  if (passwordLabel) passwordLabel.textContent = t('auth.field.password', 'Password');
  if (confirmPasswordLabel) confirmPasswordLabel.textContent = t('auth.field.confirmPassword', 'Confirm Password');
  if (submitBtn) {
    submitBtn.textContent = authMode === 'register'
      ? t('auth.action.register', 'Register')
      : t('auth.action.login', 'Sign In');
  }
  if (publicLink) publicLink.textContent = t('auth.action.public', 'Public Space');
}

async function loadLocaleMessages(locale) {
  const selected = state.supportedLocales.includes(locale) ? locale : state.defaultLocale;
  const response = await fetch(`/static/locales/${selected}.json?v=${encodeURIComponent(appVersion)}`);
  if (!response.ok && selected !== 'en') {
    const fallback = await fetch(`/static/locales/en.json?v=${encodeURIComponent(appVersion)}`);
    if (!fallback.ok) {
      throw new Error('Locale file not found.');
    }
    return fallback.json();
  }
  if (!response.ok) throw new Error('Locale file not found.');
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
  document.documentElement.lang = state.locale;
  applyStaticTexts();
  renderSettingsPanel();
}

function parseThemeConfig(rawThemeConfig) {
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

  const lightTheme = rawThemeConfig?.light || {};
  const darkTheme = rawThemeConfig?.dark || {};
  const next = {
    light: {
      solid: normalizeThemePresetList(lightTheme.solid),
      gradient: normalizeThemePresetList(lightTheme.gradient),
    },
    dark: {
      solid: normalizeThemePresetList(darkTheme.solid),
      gradient: normalizeThemePresetList(darkTheme.gradient),
    },
  };

  if (!next.light.solid.length && !next.light.gradient.length) {
    next.light = { ...fallbackThemeConfig.light };
  }
  if (!next.dark.solid.length && !next.dark.gradient.length) {
    next.dark = { ...fallbackThemeConfig.dark };
  }
  return next;
}

async function initUiConfig() {
  try {
    const response = await fetch('/api/config/ui', { cache: 'no-store' });
    if (!response.ok) return;
    const data = await response.json();

    const appFontFamily = (data?.app_font_family || '').toString().trim();
    state.appFontFamily = appFontFamily || fallbackAppFontFamily;
    state.themeConfig = parseThemeConfig(data?.theme_config || {});

    const configuredLocales = Array.isArray(data?.i18n?.locales)
      ? data.i18n.locales.map((locale) => (locale || '').toString().trim()).filter(Boolean)
      : [];
    state.supportedLocales = configuredLocales.length ? [...new Set(configuredLocales)] : [fallbackDefaultLocale];

    const configuredDefault = (data?.i18n?.default_locale || '').toString().trim();
    state.defaultLocale = state.supportedLocales.includes(configuredDefault)
      ? configuredDefault
      : (state.supportedLocales.includes(fallbackDefaultLocale) ? fallbackDefaultLocale : state.supportedLocales[0]);

    const labels = data?.i18n?.labels && typeof data.i18n.labels === 'object' ? data.i18n.labels : {};
    const flags = data?.i18n?.flags && typeof data.i18n.flags === 'object' ? data.i18n.flags : {};
    state.localeLabels = labels;
    state.localeFlags = flags;
  } catch {}
}

function initSettingsPanelToggle() {
  if (!settingsToggleBtn || !settingsPanel) return;

  const closePanel = () => {
    settingsPanel.classList.remove('open');
    settingsToggleBtn.setAttribute('aria-expanded', 'false');
  };
  const openPanel = () => {
    settingsPanel.classList.add('open');
    settingsToggleBtn.setAttribute('aria-expanded', 'true');
  };

  settingsToggleBtn.addEventListener('click', (event) => {
    event.stopPropagation();
    if (!settingsPanel.classList.contains('open')) {
      openPanel();
    } else {
      closePanel();
    }
  });

  settingsPanel.addEventListener('click', (event) => {
    event.stopPropagation();
  });

  document.addEventListener('click', () => {
    closePanel();
  });

  window.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      closePanel();
    }
  });
}

async function fetchStatus() {
  const response = await fetch('/api/auth/status', { cache: 'no-store' });
  if (!response.ok) throw new Error('Failed to get auth status');
  return response.json();
}

async function initAuthPage() {
  const status = await fetchStatus();
  if (status.authenticated) {
    window.location.href = '/personal/music';
    return;
  }
  if (authMode === 'login' && !status.has_account) {
    window.location.href = '/auth/register';
    return;
  }
  if (authMode === 'register' && status.has_account) {
    window.location.href = '/auth/login';
  }
}

async function submitLogin(username, password) {
  const response = await fetch('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || 'Login failed.');
  }
}

async function submitRegister(username, password) {
  const response = await fetch('/api/auth/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || 'Register failed.');
  }
}

form?.addEventListener('submit', async (event) => {
  event.preventDefault();
  setError('');

  const formData = new FormData(form);
  const username = (formData.get('username') || '').toString().trim();
  const password = (formData.get('password') || '').toString();
  const confirmPassword = (formData.get('confirm_password') || '').toString();

  if (!username || !password) {
    setError(t('auth.error.credentialsRequired', 'Please enter username and password.'));
    return;
  }
  if (authMode === 'register' && password !== confirmPassword) {
    setError(t('auth.error.passwordMismatch', 'Passwords do not match.'));
    return;
  }

  try {
    if (authMode === 'register') {
      await submitRegister(username, password);
    } else {
      await submitLogin(username, password);
    }
    window.location.href = '/personal/music';
  } catch (error) {
    setError(error.message || t('auth.error.requestFailed', 'Request failed.'));
  }
});

async function init() {
  await initUiConfig();
  saveCustomFontFamily(localStorage.getItem(fontStorageKey) || '');
  await rebuildFontOptions();
  applyEffectiveFontFamily();

  const savedMode = normalizeThemeMode(localStorage.getItem(themeStorageKey));
  applyTheme(savedMode, { persist: false, animate: false });

  const preferredLocale = localStorage.getItem(localeStorageKey) || state.defaultLocale;
  await setLocale(preferredLocale);

  initSettingsPanelToggle();

  const handleSystemChange = () => {
    if (state.themeMode === 'system') {
      applyTheme('system', { persist: false, animate: false });
    }
  };
  if (typeof colorSchemeMedia.addEventListener === 'function') {
    colorSchemeMedia.addEventListener('change', handleSystemChange);
  } else if (typeof colorSchemeMedia.addListener === 'function') {
    colorSchemeMedia.addListener(handleSystemChange);
  }

  await initAuthPage();
}

init().catch((error) => {
  setError(error.message || t('auth.error.initFailed', 'Initialization failed.'));
});
