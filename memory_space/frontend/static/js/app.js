const pageType = document.body.dataset.pageType;
const apiBase = pageType === 'music' ? '/api/music' : '/api/mind';
const supportedLocales = ['zh-CN', 'zh-TW', 'en'];
const defaultLocale = 'zh-CN';
const localeStorageKey = 'memory_space_locale';

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

const state = {
  items: [],
  filteredItems: [],
  selectedId: null,
  mode: 'create',
  pendingDeleteId: null,
  linkOptions: [],
  colorConfig: { ...fallbackColorConfig },
  searchFields: new Set(defaultSearchFields),
  locale: defaultLocale,
  messages: {},
};
let currentMarkdownEditor = null;

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

function textOrEmpty(value) {
  const text = (value ?? '').toString().trim();
  return text || t('common.empty', 'Empty');
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

function renderCards() {
  if (!state.filteredItems.length) {
    renderEmptyState(searchInput.value.trim() ? t('common.noMatch', 'No matching items') : t('common.empty', 'Empty'));
    return;
  }

  memoryGrid.innerHTML = state.filteredItems.map(item => {
    const isActive = item.id === state.selectedId;
    const avatar = pageType === 'music'
      ? `
        <div class="card-avatar-wrap">
          <div class="card-avatar card-avatar-fallback">♪</div>
          ${item.icon_url?.trim()
            ? `<img class="card-avatar card-avatar-img" src="${escapeHtml(item.icon_url)}" alt="cover" loading="lazy" onerror="this.style.display='none'" />`
            : ''}
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
        <div class="card-time">${escapeHtml(textOrEmpty(item.memory_time))}</div>
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
  return `<div class="link-list">${entries.map(link => {
    const option = getLinkOption(link.provider);
    const label = option?.label || link.provider;
    const icon = option?.icon || '';
    const iconHtml = icon
      ? `<img src="${escapeHtml(icon)}" alt="${escapeHtml(label)}" loading="lazy" />`
      : `<span>${escapeHtml(label.slice(0, 1).toUpperCase())}</span>`;
    return `<a class="link-icon-btn" href="${escapeHtml(link.url)}" title="${escapeHtml(label)}" target="_blank" rel="noreferrer">${iconHtml}</a>`;
  }).join('')}</div>`;
}

function openDetail(item) {
  const avatarHtml = pageType === 'music'
    ? (item.icon_url?.trim()
      ? `<img class="detail-avatar" src="${escapeHtml(item.icon_url)}" alt="avatar" onerror="this.outerHTML='<div class=&quot;detail-avatar&quot;>${escapeHtml(t('common.empty', 'Empty'))}</div>'" />`
      : `<div class="detail-avatar">${escapeHtml(t('common.empty', 'Empty'))}</div>`)
    : '';

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
    <div class="detail-markdown">${marked.parse(textOrEmpty(item.long_desc || item.short_desc))}</div>
    <div class="detail-actions">
      <button class="danger-btn" type="button" id="detailDeleteBtn">${escapeHtml(t('detail.del', 'Delete'))}</button>
      <button class="secondary-btn" type="button" id="detailEditBtn">${escapeHtml(t('detail.edit', 'Edit'))}</button>
    </div>
  `;

  document.getElementById('detailDeleteBtn').addEventListener('click', () => openDeleteModal(item.id));
  document.getElementById('detailEditBtn').addEventListener('click', () => openFormModal('edit', item));

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
  const mode = 'preset';
  const selectedPreset = hasPreset ? normalizedCurrent : firstPreset;
  const customHidden = mode === 'custom' ? '' : 'hidden';
  const customColor = normalizedCurrent || getDefaultColor();

  return `
    <div class="field">
      <label>${escapeHtml(t('form.cardColor', 'Card Color'))}</label>
      <div class="color-preset-grid">
        ${presets.map(item => {
          const value = normaliseHexColor(item.value);
          const active = mode === 'preset' && value === selectedPreset ? 'active' : '';
          return `<button type="button" class="color-swatch-btn ${active}" data-preset-color="${escapeHtml(value)}" title="${escapeHtml(item.name)}" style="--swatch-color:${escapeHtml(value)}"></button>`;
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
      <div class="color-preview" id="colorPreview" style="--preview-color:${escapeHtml(selectedPreset)}"></div>
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
      <label for="icon_url">${escapeHtml(t('form.iconUrl', 'Cover URL'))}</label>
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
    const endpoint = mode === 'create' ? apiBase : `${apiBase}/${targetId}`;

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
  const response = await fetch(`${apiBase}/${state.pendingDeleteId}`, { method: 'DELETE' });
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
  const switchBtn = document.getElementById('switchPageBtn');
  toolbar.insertBefore(wrap, switchBtn || addBtn);

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
}

function renderToolbarControls() {
  if (!toolbar || !addBtn) return;
  document.getElementById('switchPageBtn')?.remove();
  document.getElementById('langWrap')?.remove();

  const switchBtn = document.createElement('button');
  switchBtn.type = 'button';
  switchBtn.className = 'secondary-btn nav-btn';
  switchBtn.id = 'switchPageBtn';
  switchBtn.textContent = pageType === 'music'
    ? t('common.switchToMind', 'Go Mind')
    : t('common.switchToMusic', 'Go Music');
  switchBtn.addEventListener('click', () => {
    window.location.href = pageType === 'music' ? '/mind' : '/music';
  });
  toolbar.insertBefore(switchBtn, addBtn);

  const langWrap = document.createElement('div');
  langWrap.className = 'lang-wrap';
  langWrap.id = 'langWrap';
  langWrap.innerHTML = `
    <button class="secondary-btn lang-btn" type="button" id="langBtn">${escapeHtml(t(`lang.${state.locale}`, state.locale))}</button>
    <div class="lang-menu" id="langMenu" hidden>
      ${supportedLocales.map(locale => `
        <button type="button" class="lang-option ${locale === state.locale ? 'active' : ''}" data-locale="${escapeHtml(locale)}">${escapeHtml(t(`lang.${locale}`, locale))}</button>
      `).join('')}
    </div>
  `;
  addBtn.insertAdjacentElement('afterend', langWrap);

  const langBtn = langWrap.querySelector('#langBtn');
  const langMenu = langWrap.querySelector('#langMenu');
  langBtn.addEventListener('click', () => {
    langMenu.hidden = !langMenu.hidden;
  });

  langWrap.querySelectorAll('.lang-option').forEach(btn => {
    btn.addEventListener('click', async () => {
      const locale = btn.getAttribute('data-locale');
      langMenu.hidden = true;
      await setLocale(locale);
    });
  });

  document.addEventListener('click', (event) => {
    if (!langWrap.contains(event.target)) {
      langMenu.hidden = true;
    }
  });
}

function applyStaticTexts() {
  const titleKey = pageType === 'music' ? 'page.music.title' : 'page.mind.title';
  const title = t(titleKey, pageType === 'music' ? 'Music Memory Space' : 'Mind Memory Space');
  document.title = title;
  document.documentElement.lang = state.locale;
  if (pageTitleEl) pageTitleEl.textContent = title;
  searchInput.placeholder = t('common.search', 'Search');
  addBtn.textContent = t('common.add', 'Add');
  panelCloseBtn.textContent = t('common.close', 'Close');
  if (deleteModalTitleEl) deleteModalTitleEl.textContent = t('common.deleteTitle', 'Confirm Delete');
  if (deleteModalTextEl) deleteModalTextEl.textContent = t('common.deleteText', 'Deletion is irreversible. Continue?');
  if (deleteCancelBtn) deleteCancelBtn.textContent = t('common.cancel', 'Cancel');
  if (confirmDeleteBtn) confirmDeleteBtn.textContent = t('common.delete', 'Delete');
  if (detailPlaceholderEl && !state.selectedId) {
    detailPlaceholderEl.textContent = t('common.selectCard', 'Select a card to view details.');
  }
}

async function loadLocaleMessages(locale) {
  const selected = supportedLocales.includes(locale) ? locale : defaultLocale;
  const response = await fetch(`/static/locales/${selected}.json`);
  if (!response.ok) {
    throw new Error(`Locale file not found: ${selected}`);
  }
  return response.json();
}

async function setLocale(locale) {
  try {
    state.messages = await loadLocaleMessages(locale);
    state.locale = locale;
  } catch {
    state.messages = await loadLocaleMessages(defaultLocale);
    state.locale = defaultLocale;
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
  state.linkOptions = Array.isArray(data?.link_options) ? data.link_options : [];
  const loadedColorConfig = data?.color_config || {};
  state.colorConfig = {
    ...fallbackColorConfig,
    ...loadedColorConfig,
    presets: Array.isArray(loadedColorConfig?.presets) && loadedColorConfig.presets.length
      ? loadedColorConfig.presets
      : fallbackColorConfig.presets,
  };
}

async function loadItems() {
  const response = await fetch(apiBase);
  const data = await response.json();
  state.items = data.map(item => ({
    ...item,
    tags: Array.isArray(item.tags) ? item.tags : [],
    links: normaliseLinks(item.links),
  }));
  applySearch();
}

searchInput.addEventListener('input', applySearch);
addBtn.addEventListener('click', () => openFormModal('create'));
panelCloseBtn.addEventListener('click', closeDetail);
confirmDeleteBtn.addEventListener('click', confirmDelete);

document.querySelectorAll('[data-close-delete]').forEach(btn => {
  btn.addEventListener('click', closeDeleteModal);
});

document.querySelectorAll('[data-close-form]').forEach(btn => {
  btn.addEventListener('click', closeFormModal);
});

formModalOverlay.addEventListener('click', (event) => {
  if (event.target === formModalOverlay) closeFormModal();
});

deleteModalOverlay.addEventListener('click', (event) => {
  if (event.target === deleteModalOverlay) closeDeleteModal();
});

window.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') {
    closeFormModal();
    closeDeleteModal();
    closeDetail();
  }
});

async function init() {
  await loadUiConfig();
  const preferredLocale = localStorage.getItem(localeStorageKey) || defaultLocale;
  await setLocale(preferredLocale);
  await loadItems();
}

init().catch((err) => {
  console.error(err);
  alert(t('form.initFailed', 'Initialization failed.'));
});
