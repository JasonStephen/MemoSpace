
const pageType = document.body.dataset.pageType;
const apiBase = pageType === 'music' ? '/api/music' : '/api/mind';

const state = {
  items: [],
  filteredItems: [],
  selectedId: null,
  mode: 'create',
  pendingDeleteId: null,
};

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

const escapeHtml = (value) => String(value ?? '')
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;')
  .replaceAll("'", '&#39;');

function textOrEmpty(value) {
  const text = (value ?? '').toString().trim();
  return text || '内容为空';
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
  if (!raw) return {};
  try {
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
    return Object.fromEntries(
      Object.entries(parsed || {}).filter(([key, value]) => key && String(value || '').trim())
    );
  } catch {
    return {};
  }
}

function itemSearchText(item) {
  const parts = [
    item.title,
    item.artist,
    item.short_desc,
    item.long_desc,
    (item.tags || []).join(' '),
    Object.keys(item.links || {}).join(' '),
  ];
  return parts.join(' ').toLowerCase();
}

function renderEmptyState(message = '内容为空') {
  memoryGrid.innerHTML = `<div class="empty-state">${escapeHtml(message)}</div>`;
}

function renderCards() {
  if (!state.filteredItems.length) {
    renderEmptyState(searchInput.value.trim() ? '没有匹配的内容' : '内容为空');
    return;
  }

  memoryGrid.innerHTML = state.filteredItems.map(item => {
    const isActive = item.id === state.selectedId;
    const subtitle = pageType === 'music'
      ? `<p class="card-subtitle">${escapeHtml(textOrEmpty(item.artist))}</p>`
      : '';
    return `
      <article class="card ${isActive ? 'active' : ''}" data-id="${item.id}" style="--card-accent:${escapeHtml(item.color || '#6d5efc')}">
        <h3 class="card-title">${escapeHtml(textOrEmpty(item.title))}</h3>
        ${subtitle}
        <p class="card-desc">${escapeHtml(textOrEmpty(item.short_desc || item.long_desc))}</p>
        <div class="card-time">${escapeHtml(textOrEmpty(item.memory_time))}</div>
      </article>
    `;
  }).join('');

  memoryGrid.querySelectorAll('.card').forEach(card => {
    card.addEventListener('click', () => {
      const id = Number(card.dataset.id);
      const item = state.items.find(entry => entry.id === id);
      if (!item) return;
      state.selectedId = id;
      renderCards();
      openDetail(item);
    });
  });
}

function renderTagList(tags) {
  const cleanTags = (tags || []).filter(Boolean);
  if (!cleanTags.length) {
    return '<div class="tag-list"><span class="tag-pill">内容为空</span></div>';
  }
  return `<div class="tag-list">${cleanTags.map(tag => `<span class="tag-pill">#${escapeHtml(tag)}</span>`).join('')}</div>`;
}

function renderLinkList(links) {
  const entries = Object.entries(normaliseLinks(links));
  if (!entries.length) return '';
  return `<div class="link-list">${entries.map(([platform, url]) => `
    <a class="link-chip" href="${escapeHtml(url)}" target="_blank" rel="noreferrer">${escapeHtml(platform)}</a>
  `).join('')}</div>`;
}

function openDetail(item) {
  const avatarHtml = pageType === 'music'
    ? (item.icon_url?.trim()
      ? `<img class="detail-avatar" src="${escapeHtml(item.icon_url)}" alt="avatar" onerror="this.outerHTML='<div class=&quot;detail-avatar&quot;>内容为空</div>'" />`
      : `<div class="detail-avatar">内容为空</div>`)
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
      <button class="danger-btn" type="button" id="detailDeleteBtn">Del</button>
      <button class="secondary-btn" type="button" id="detailEditBtn">Edit</button>
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

function getFormHtml(item = null) {
  const data = item || {
    icon_url: '',
    title: '',
    artist: '',
    memory_time: getCurrentTimeInputValue(),
    tags: [],
    color: pageType === 'music' ? '#6d5efc' : '#18a999',
    short_desc: '',
    long_desc: '',
    links: {},
  };

  const musicExtra = pageType === 'music' ? `
    <div class="field">
      <label for="icon_url">Icon URL</label>
      <input id="icon_url" name="icon_url" type="text" value="${escapeHtml(data.icon_url || '')}" />
    </div>
    <div class="field">
      <label for="artist">Artists</label>
      <input id="artist" name="artist" type="text" value="${escapeHtml(data.artist || '')}" />
    </div>
    <div class="field full">
      <label for="links_json">外链 JSON</label>
      <textarea id="links_json" name="links_json" placeholder='{"Spotify":"https://...","网易云音乐":"https://..."}'>${escapeHtml(JSON.stringify(normaliseLinks(data.links), null, 2))}</textarea>
      <span class="hint-text">所有外链存放在单个 JSON 字段中。</span>
    </div>
  ` : '';

  return `
    <div class="field">
      <label for="title">Title</label>
      <input id="title" name="title" type="text" value="${escapeHtml(data.title || '')}" />
    </div>
    ${musicExtra}
    <div class="field">
      <label for="memory_time">时间日期</label>
      <input id="memory_time" name="memory_time" type="text" value="${escapeHtml(data.memory_time || getCurrentTimeInputValue())}" />
      <span class="hint-text">默认填入打开模态框时刻，可手动修改。</span>
    </div>
    <div class="field">
      <label for="color">卡片颜色</label>
      <input id="color" name="color" type="text" value="${escapeHtml(data.color || '')}" placeholder="#6d5efc" />
      <div class="color-preview" id="colorPreview" style="--preview-color:${escapeHtml(data.color || '#6d5efc')}"></div>
    </div>
    <div class="field full">
      <label for="tags">多标签</label>
      <input id="tags" name="tags" type="text" value="${escapeHtml(tagsToInput(data.tags))}" placeholder="tag1, tag2, tag3" />
    </div>
    <div class="field full">
      <label for="short_desc">短介绍</label>
      <textarea id="short_desc" name="short_desc">${escapeHtml(data.short_desc || '')}</textarea>
    </div>
    <div class="field full">
      <label for="long_desc">长介绍 [Markdown]</label>
      <textarea id="long_desc" name="long_desc">${escapeHtml(data.long_desc || '')}</textarea>
    </div>
    <div class="form-actions">
      <button class="secondary-btn" type="button" data-close-form>取消</button>
      <button class="primary-btn" type="submit">保存</button>
    </div>
  `;
}

function openFormModal(mode, item = null) {
  state.mode = mode;
  formModalTitle.textContent = mode === 'create' ? '新增' : '编辑';
  memoryForm.innerHTML = getFormHtml(item);
  formModalOverlay.classList.add('open');
  formModalOverlay.setAttribute('aria-hidden', 'false');

  memoryForm.querySelectorAll('[data-close-form]').forEach(btn => {
    btn.addEventListener('click', closeFormModal);
  });

  const colorInput = memoryForm.querySelector('#color');
  const colorPreview = memoryForm.querySelector('#colorPreview');
  if (colorInput && colorPreview) {
    colorInput.addEventListener('input', () => {
      colorPreview.style.setProperty('--preview-color', colorInput.value || '#6d5efc');
    });
  }

  memoryForm.onsubmit = async (event) => {
    event.preventDefault();
    const formData = new FormData(memoryForm);
    let links = {};
    if (pageType === 'music') {
      try {
        links = normaliseLinks(formData.get('links_json') || '{}');
      } catch {
        alert('外链 JSON 格式错误。');
        return;
      }
    }

    const payload = {
      title: (formData.get('title') || '').toString().trim(),
      memory_time: (formData.get('memory_time') || '').toString().trim(),
      tags: parseTags((formData.get('tags') || '').toString()),
      color: ((formData.get('color') || '').toString().trim() || (pageType === 'music' ? '#6d5efc' : '#18a999')),
      short_desc: (formData.get('short_desc') || '').toString().trim(),
      long_desc: (formData.get('long_desc') || '').toString().trim(),
    };

    if (pageType === 'music') {
      payload.icon_url = (formData.get('icon_url') || '').toString().trim();
      payload.artist = (formData.get('artist') || '').toString().trim();
      payload.links = links;
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
      alert('保存失败，请检查输入。');
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
    alert('删除失败。');
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
    if (window.innerWidth <= 960) {
      closeDetail();
    }
  }
});

loadItems();
