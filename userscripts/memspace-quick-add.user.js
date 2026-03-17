// ==UserScript==
// @name         MemoSpace Quick Add (Netease/Spotify)
// @namespace    memspace.local
// @version      0.3.13
// @description  Add current/playing Netease/Spotify track to MemoSpace personal music quickly.
// @match        https://music.163.com/*
// @match        https://open.spotify.com/*
// @grant        GM_xmlhttpRequest
// @connect      127.0.0.1
// @connect      localhost
// @noframes
// ==/UserScript==

(function () {
  'use strict';

  const API_BASE = 'http://127.0.0.1:8000';
  const POST_URL = `${API_BASE}/api/music/personal`;
  const PAGE_URL = `${API_BASE}/music/personal`;
  const BTN_ID = 'memspace-quick-add-btn';
  const MODAL_ID = 'memspace-quick-add-modal';
  const BTN_POS_KEY = 'memspace_quick_add_btn_pos_v1';
  let mountWatchStarted = false;
    const COLOR_OPTIONS = [
    '#7FB3D5', '#8ED1C6', '#F6B6C8', '#FFD166', '#87CEFA',
    '#A3D977', '#FF5C8A', '#FF9F1C', '#6B7A8F', '#3DDC97',
    '#E63946', '#48CAE4', '#6A4C93', '#6BAF45', '#B08968'
  ];

  const style = document.createElement('style');
  style.textContent = `
    #${MODAL_ID}, #${MODAL_ID} * { box-sizing: border-box; }
    #${BTN_ID} {
      position: fixed !important; right: 24px; bottom: 88px; z-index: 2147483647 !important;
      border: 1px solid rgba(255,255,255,.18); border-radius: 999px;
      background: linear-gradient(135deg, #0a3a56 0%, #0f6b52 100%);
      color: #e8f6ff; font-weight: 700; font-size: 13px; letter-spacing: .2px;
      padding: 10px 14px; cursor: grab; user-select:none;
      box-shadow: 0 10px 24px rgba(0,0,0,.35);
    }
    #${BTN_ID}.dragging { cursor: grabbing; }
    #${MODAL_ID} {
      position: fixed !important; inset: 0; z-index: 2147483647 !important; display:none;
      pointer-events: none;
      isolation: isolate;
    }
    #${MODAL_ID}.open { display:block; }
    #${MODAL_ID} .card {
      position:absolute !important; width:360px; max-width:calc(100vw - 24px);
      z-index: 2147483647 !important;
      border-radius: 18px; border: 1px solid rgba(255,255,255,.18);
      background: linear-gradient(180deg, #162644 0%, #12223d 100%);
      color:#eef5ff; padding:14px; box-shadow:0 18px 36px rgba(0,0,0,.45);
      font-family: "Segoe UI","PingFang SC","Microsoft YaHei",sans-serif;
      pointer-events:auto;
      opacity:0; transform: scale(0.88);
      transition: opacity .22s ease, transform .22s ease;
    }
    #${MODAL_ID} .card.animate-in { opacity:1; transform: scale(1); }
    #${MODAL_ID} .title { font-weight:700; margin: 0 0 10px; }
    #${MODAL_ID} label { display:block; font-size:12px; color:#b5c1d8; margin:8px 0 4px; }
    #${MODAL_ID} .track-summary { margin: 8px 0 10px; }
    #${MODAL_ID} .track-title {
      font-size: 24px; line-height: 1.08; font-weight: 800;
      letter-spacing: .2px; color:#f3f8ff; word-break: break-word;
      margin: 4px 0 8px;
    }
    #${MODAL_ID} .track-artist {
      font-size: 18px; line-height: 1.1; font-weight: 700;
      color:#dce9ff; word-break: break-word;
      margin: 0 0 8px;
    }
    #${MODAL_ID} .track-source {
      font-size: 14px; font-weight: 600; color:#c8d8f5;
      opacity:.95;
    }
    #${MODAL_ID} textarea, #${MODAL_ID} input, #${MODAL_ID} select {
      display:block; width:100%; max-width:100%;
      border-radius:10px; border:1px solid rgba(255,255,255,.16);
      background: rgba(9,18,34,.75); color:#eaf2ff; padding:8px 10px; outline:none;
    }
    #${MODAL_ID} textarea { min-height: 72px; resize: none; }
    #${MODAL_ID} .header-row {
      display:flex; align-items:center; justify-content:space-between;
      gap:10px; margin-bottom: 8px;
    }
    #${MODAL_ID} .header-row .title { margin: 0; }
    #${MODAL_ID} .source-toggle {
      width:52px; height:30px; border-radius:999px;
      border:1px solid rgba(255,255,255,.24);
      background: rgba(9,18,34,.88);
      position:relative; cursor:pointer;
      padding:0; flex:0 0 auto;
    }
    #${MODAL_ID} .source-toggle .knob {
      position:absolute; top:3px; left:3px;
      width:22px; height:22px; border-radius:50%;
      background:#dbe6ff; transition:left .2s ease;
    }
    #${MODAL_ID} .source-toggle.is-playing {
      background: linear-gradient(135deg,#2a7cf6 0%,#1abf89 100%);
    }
    #${MODAL_ID} .source-toggle.is-playing .knob { left:27px; }
    #${MODAL_ID} .color-grid {
      display:grid;
      grid-template-columns: repeat(8, minmax(0, 1fr));
      gap:8px;
      margin-bottom:10px;
    }
    #${MODAL_ID} .color-swatch {
      width:100%; aspect-ratio: 1 / 1;
      border-radius:10px; border:1px solid rgba(255,255,255,.2);
      cursor:pointer; padding:0;
      box-shadow: inset 0 0 0 1px rgba(0,0,0,.18);
    }
    #${MODAL_ID} .color-swatch.active {
      border:2px solid #ffffff;
      box-shadow: 0 0 0 2px rgba(99,102,241,.35);
    }
    #${MODAL_ID} .color-custom {
      display:grid; grid-template-columns: 52px 1fr auto; gap:10px;
      align-items:center;
      margin-bottom:10px;
    }
    #${MODAL_ID} .color-preview-box {
      width:52px; height:38px; border-radius:8px;
      border:1px solid rgba(255,255,255,.24);
      background:#6d5efc;
    }
    #${MODAL_ID} #ms-color-hex {
      text-transform: lowercase;
      letter-spacing:.4px;
    }
    #${MODAL_ID} #ms-color-picker-btn {
      padding:8px 12px;
      border-radius:10px;
    }
    #${MODAL_ID} #ms-color-strip {
      width:100%; height:14px; border-radius:999px;
      background:#6d5efc;
      border:1px solid rgba(255,255,255,.2);
      margin-bottom:8px;
    }
    #${MODAL_ID} #ms-long-desc { min-height: 96px; }
    #${MODAL_ID} .actions { margin-top: 12px; display:flex; gap:8px; justify-content:flex-end; }
    #${MODAL_ID} button {
      border:1px solid rgba(255,255,255,.18); border-radius:999px;
      background: rgba(18,33,57,.9); color:#eaf2ff; padding:7px 12px; cursor:pointer;
    }
    #${MODAL_ID} button.primary { background: linear-gradient(135deg,#2a7cf6 0%,#1abf89 100%); border:none; color:white; }
    #${MODAL_ID} .tip { font-size:12px; margin-top:8px; color:#9eb0cf; }
  `;
  document.head.appendChild(style);

  function cleanText(value) {
    return String(value || '').replace(/\s+/g, ' ').trim();
  }

  function splitArtists(value) {
    return cleanText(value).replace(/,\s*/g, '/');
  }

  function uniqueJoin(values) {
    const dedupe = new Set();
    const out = [];
    for (const value of values) {
      const t = cleanText(value);
      if (!t || dedupe.has(t)) continue;
      dedupe.add(t);
      out.push(t);
    }
    return out.join('/');
  }

  function normalizeNeteaseUrl(raw) {
    const m = String(raw || '').match(/(?:music\.163\.com\/(?:#\/)?song\?id=|music\.163\.com\/m\/song\?id=)(\d+)/i);
    if (m) return `https://music.163.com/song?id=${m[1]}`;
    return raw;
  }

  function normalizeSpotifyUrl(raw) {
    const m = String(raw || '').match(/open\.spotify\.com\/track\/([a-zA-Z0-9]+)/i);
    if (m) return `https://open.spotify.com/track/${m[1]}`;
    return raw;
  }

  function firstText(doc, selectors) {
    for (const sel of selectors) {
      const value = cleanText(doc.querySelector(sel)?.textContent || '');
      if (value) return value;
    }
    return '';
  }

  function firstAttr(doc, selectors, attr) {
    for (const sel of selectors) {
      const value = cleanText(doc.querySelector(sel)?.getAttribute(attr) || '');
      if (value) return value;
    }
    return '';
  }

  function getTopDocumentSafe() {
    try {
      if (window.top && window.top.document) return window.top.document;
    } catch (_) {}
    return null;
  }

  function getTopHrefSafe() {
    try {
      if (window.top && window.top.location) return String(window.top.location.href || '');
    } catch (_) {}
    return '';
  }

  function toAbsoluteUrl(raw, baseHref) {
    const value = cleanText(raw);
    if (!value) return '';
    try {
      return new URL(value, baseHref || window.location.href).toString();
    } catch (_) {
      return value;
    }
  }


  function normalizeHexColor(value, fallback = '#6d5efc') {
    const m = String(value || '').trim().toLowerCase().match(/^#?([0-9a-f]{6})$/i);
    if (!m) return fallback;
    return `#${m[1].toLowerCase()}`;
  }

  function isSpotifyTrackPage(url) {
    return /open\.spotify\.com\/track\//i.test(String(url || ''));
  }

  function isNeteaseSongPage(url) {
    return /music\.163\.com\/(?:#\/)?song\?id=|music\.163\.com\/m\/song\?id=/i.test(String(url || ''));
  }

  function parseJsonLdMusic(doc) {
    const scripts = Array.from(doc.querySelectorAll('script[type="application/ld+json"]'));
    for (const script of scripts) {
      const content = script.textContent || '';
      if (!content.trim()) continue;
      try {
        const payload = JSON.parse(content);
        const list = Array.isArray(payload) ? payload : [payload];
        for (const item of list) {
          if (!item || typeof item !== 'object') continue;
          const t = cleanText(item['@type'] || '');
          if (!/MusicRecording|Song|MusicGroup/i.test(t)) continue;
          const title = cleanText(item.name || '');
          let artist = '';
          const by = item.byArtist;
          if (Array.isArray(by)) {
            artist = by.map((a) => cleanText(a?.name || '')).filter(Boolean).join('/');
          } else if (by && typeof by === 'object') {
            artist = cleanText(by.name || '');
          } else if (typeof by === 'string') {
            artist = cleanText(by);
          }
          if (title || artist) return { title, artist };
        }
      } catch (_) {}
    }
    return { title: '', artist: '' };
  }

  function extractSpotifyCurrentTitle(doc) {
    return firstText(doc, [
      '[data-testid="entityTitle"] h1',
      'h1[data-encore-id="text"][dir="auto"]',
    ]);
  }

  function extractSpotifyCurrentArtists(doc) {
    const values = [];
    doc.querySelectorAll('[data-testid="track-artist-link-card-container"] a[href^="/artist/"]')
      .forEach((a) => values.push(a.textContent || ''));
    doc.querySelectorAll('[data-testid="creator-link"]')
      .forEach((a) => values.push(a.textContent || ''));
    return uniqueJoin(values);
  }

  function extractSpotifyPlayingTitle(doc) {
    return firstText(doc, [
      '[data-testid="context-item-info-title"] a',
      '[data-testid="context-item-link"]',
    ]);
  }

  function extractSpotifyPlayingArtists(doc) {
    const values = [];
    doc.querySelectorAll('[data-testid="context-item-info-artist"]')
      .forEach((a) => values.push(a.textContent || ''));
    return uniqueJoin(values);
  }

  function parseSpotifyCurrent(doc, href) {
    const ld = parseJsonLdMusic(doc);
    const ogTitle = cleanText(doc.querySelector('meta[property="og:title"]')?.content || '');
    const ogDesc = cleanText(doc.querySelector('meta[property="og:description"]')?.content || '');
    const ogImage = cleanText(doc.querySelector('meta[property="og:image"]')?.content || '');
    const by = ogDesc.match(/by\s+(.+)$/i);
    const descArtist = by ? splitArtists(by[1]) : '';

    const title = extractSpotifyCurrentTitle(doc) || ld.title || ogTitle || '';
    const artist = extractSpotifyCurrentArtists(doc) || ld.artist || descArtist || '';

    return {
      provider: 'spotify',
      url: normalizeSpotifyUrl(href),
      title,
      artist,
      icon_url: ogImage || '',
    };
  }

  function parseSpotifyPlaying(doc, href) {
    const title = extractSpotifyPlayingTitle(doc);
    const artist = extractSpotifyPlayingArtists(doc);
    const icon = firstAttr(doc, [
      '[data-testid="cover-art-image"] img',
      '[data-testid="cover-art-image"]',
      'img[alt][src*="i.scdn.co/image/"]',
    ], 'src');
    return {
      provider: 'spotify',
      url: normalizeSpotifyUrl(href),
      title,
      artist,
      icon_url: icon || '',
    };
  }

  function extractNeteaseTitle(doc) {
    return firstText(doc, [
      '.tit .f-ff2',
      '.tit em.f-ff2',
      '.m-songInfo-song-name',
      'h2.m-songInfo-song-name',
    ]);
  }

  function extractNeteasePlayingTitle(doc) {
    return firstText(doc, [
      '.j-flag.words a.name',
      '.m-playbar .words a.name',
      '.m-playbar .words .name',
      '.words a.name',
      '.f-thide.name',
    ]);
  }

  function extractNeteaseArtistFromDetail(doc) {
    const values = [];
    const push = (value) => {
      const t = cleanText(value);
      if (t) values.push(t);
    };
    const splitAndPush = (value) => cleanText(value).split('/').forEach(push);

    const singerRows = Array.from(doc.querySelectorAll('p.des.s-fc4, p.des, .m-info .des, .m-songInfo-des'))
      .filter((row) => /\u6b4c\s*\u624b\s*[:\uFF1A]/.test(cleanText(row.textContent || '')));

    for (const row of singerRows) {
      row.querySelectorAll('a[href*="/artist"]').forEach((a) => push(a.textContent));
      const titledSpan = row.querySelector('span[title]');
      if (titledSpan) splitAndPush(titledSpan.getAttribute('title') || '');
      const raw = cleanText(row.textContent || '').replace(/^\u6b4c\s*\u624b\s*[:\uFF1A]\s*/i, '');
      splitAndPush(raw);
    }

    const fallback = firstText(doc, [
      '.m-songInfo-artist',
      'h2.m-songInfo-artist',
      '.m-info .des a',
      '.m-songInfo-des a',
    ]);
    if (fallback) values.push(fallback);

    return uniqueJoin(values);
  }

  function extractNeteasePlayingArtists(doc) {
    const values = [];
    const push = (value) => {
      const t = cleanText(value);
      if (t) values.push(t);
    };
    const splitAndPush = (value) => cleanText(value).split('/').forEach(push);

    const playingWords = doc.querySelector('.j-flag.words');
    if (playingWords) {
      playingWords.querySelectorAll('.by a[href*="/artist"], a[href*="/artist"]').forEach((a) => push(a.textContent));
      const titleSpan = playingWords.querySelector('.by span[title], span.by span[title]');
      if (titleSpan) splitAndPush(titleSpan.getAttribute('title') || '');
      splitAndPush(cleanText(playingWords.querySelector('.by')?.textContent || ''));
    }
    return uniqueJoin(values);
  }

  function parseNeteaseCurrent(doc, href) {
    const title = extractNeteaseTitle(doc);
    const artist = extractNeteaseArtistFromDetail(doc);
    const icon =
      firstAttr(doc, ['.u-cover img[data-src]'], 'data-src') ||
      firstAttr(doc, ['.u-cover img[src]'], 'src') ||
      cleanText(doc.querySelector('meta[property="og:image"]')?.content || '');

    return {
      provider: 'netease_music',
      url: normalizeNeteaseUrl(href),
      title,
      artist,
      icon_url: icon || '',
    };
  }

  function parseNeteasePlaying(doc, href) {
    if (!doc) {
      return {
        provider: 'netease_music',
        url: normalizeNeteaseUrl(href),
        title: '',
        artist: '',
        icon_url: '',
      };
    }

    const title = extractNeteasePlayingTitle(doc);
    const artist = extractNeteasePlayingArtists(doc);
    const icon =
      firstAttr(doc, ['.m-playbar .head img[data-src]', '.play .head img[data-src]'], 'data-src') ||
      firstAttr(doc, ['.m-playbar .head img', '.play .head img'], 'src');

    const rawUrl = firstAttr(doc, [
      '.j-flag.words a.name[href*="/song"]',
      '.m-playbar .words a.name[href*="/song"]',
      '.words a.name[href*="/song"]',
    ], 'href');
    const absolute = toAbsoluteUrl(rawUrl, href);

    return {
      provider: 'netease_music',
      url: normalizeNeteaseUrl(absolute || href),
      title,
      artist,
      icon_url: icon || '',
    };
  }

  function mergeTrack(primary, secondary) {
    if (!secondary) return primary;
    return {
      provider: primary.provider || secondary.provider || '',
      url: primary.url || secondary.url || '',
      title: primary.title || secondary.title || '',
      artist: primary.artist || secondary.artist || '',
      icon_url: primary.icon_url || secondary.icon_url || '',
    };
  }

  function hasTrackInfo(track) {
    return !!(track && (cleanText(track.title) || cleanText(track.artist)));
  }

  function gmRequest(method, url, payload) {
    return new Promise((resolve, reject) => {
      GM_xmlhttpRequest({
        method,
        url,
        data: payload ? JSON.stringify(payload) : undefined,
        headers: payload ? { 'Content-Type': 'application/json' } : undefined,
        timeout: 12000,
        anonymous: false,
        withCredentials: true,
        onload: (resp) => resolve(resp),
        onerror: reject,
        ontimeout: () => reject(new Error('Request timeout')),
      });
    });
  }

  async function fetchHtmlDocument(url) {
    try {
      const resp = await gmRequest('GET', url);
      if (!resp || resp.status < 200 || resp.status >= 300 || !resp.responseText) return null;
      return new DOMParser().parseFromString(resp.responseText, 'text/html');
    } catch (_) {
      return null;
    }
  }

  function getNeteaseDetailDoc() {
    const iframe = document.querySelector('#g_iframe');
    return iframe?.contentDocument || null;
  }

  async function getTrackSources() {
    const href = window.location.href;
    const host = window.location.hostname;

    if (host.includes('spotify.com')) {
      let current = null;
      let playing = parseSpotifyPlaying(document, href);

      if (isSpotifyTrackPage(href)) {
        current = parseSpotifyCurrent(document, href);
        if (!hasTrackInfo(current)) {
          const htmlDoc = await fetchHtmlDocument(href);
          if (htmlDoc) current = mergeTrack(current, parseSpotifyCurrent(htmlDoc, href));
        }
      }

      return {
        current: hasTrackInfo(current) ? current : null,
        playing: hasTrackInfo(playing) ? playing : null,
      };
    }

    if (host.includes('music.163.com')) {
      const detailDoc = getNeteaseDetailDoc();
      const effectiveDetailDoc = detailDoc || document;
      const topDoc = getTopDocumentSafe();
      const topHref = getTopHrefSafe() || href;

      let current = null;
      let playing = parseNeteasePlaying(document, href);
      if (topDoc && topDoc !== document) {
        playing = mergeTrack(playing, parseNeteasePlaying(topDoc, topHref));
      }

      if (isNeteaseSongPage(href) || !!detailDoc) {
        current = parseNeteaseCurrent(effectiveDetailDoc, href);
        if (!hasTrackInfo(current)) {
          const htmlDoc = await fetchHtmlDocument(normalizeNeteaseUrl(href));
          if (htmlDoc) current = mergeTrack(current, parseNeteaseCurrent(htmlDoc, href));
        }
      }

      return {
        current: hasTrackInfo(current) ? current : null,
        playing: hasTrackInfo(playing) ? playing : null,
      };
    }

    return { current: null, playing: null };
  }

  function nowTimeString() {
    const d = new Date();
    const p = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}/${p(d.getMonth() + 1)}/${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
  }

  function positionModalNearButton(wrap) {
    const card = wrap.querySelector('.card');
    const btn = document.getElementById(BTN_ID);
    if (!card || !btn) return;

    const viewportW = window.innerWidth;
    const viewportH = window.innerHeight;
    const b = btn.getBoundingClientRect();
    const gap = 12;

    // measure size first
    card.style.left = '0px';
    card.style.top = '0px';
    card.style.right = 'auto';
    card.style.bottom = 'auto';

    const cardW = card.offsetWidth;
    const cardH = card.offsetHeight;

    const onLeft = b.left + b.width / 2 < viewportW / 2;
    const onTop = b.top + b.height / 2 < viewportH / 2;

    let left = onLeft ? b.left : b.right - cardW;
    let top = onTop ? b.bottom + gap : b.top - cardH - gap;

    left = Math.max(8, Math.min(viewportW - cardW - 8, left));
    top = Math.max(8, Math.min(viewportH - cardH - 8, top));

    card.style.left = `${left}px`;
    card.style.top = `${top}px`;
    card.style.transformOrigin = `${onLeft ? '0%' : '100%'} ${onTop ? '0%' : '100%'}`;

    requestAnimationFrame(() => {
      card.classList.add('animate-in');
    });
  }


  function saveModalPosition(card) {
    if (!card) return;
    const rect = card.getBoundingClientRect();
    const maxLeft = Math.max(1, window.innerWidth - card.offsetWidth - 16);
    const maxTop = Math.max(1, window.innerHeight - card.offsetHeight - 16);
    const left = Math.min(maxLeft, Math.max(0, rect.left - 8));
    const top = Math.min(maxTop, Math.max(0, rect.top - 8));
    card.dataset.xPct = String(Math.min(1, Math.max(0, left / maxLeft)));
    card.dataset.yPct = String(Math.min(1, Math.max(0, top / maxTop)));
  }

  function applyModalPosition(card) {
    if (!card) return;
    const xPct = Number(card.dataset.xPct);
    const yPct = Number(card.dataset.yPct);
    if (!Number.isFinite(xPct) || !Number.isFinite(yPct)) return;

    const maxLeft = Math.max(0, window.innerWidth - card.offsetWidth - 16);
    const maxTop = Math.max(0, window.innerHeight - card.offsetHeight - 16);
    const left = 8 + Math.min(maxLeft, Math.max(0, Math.round(maxLeft * xPct)));
    const top = 8 + Math.min(maxTop, Math.max(0, Math.round(maxTop * yPct)));

    card.style.left = `${left}px`;
    card.style.top = `${top}px`;
    card.style.right = 'auto';
    card.style.bottom = 'auto';
  }


  function enableModalDrag(wrap) {
    const card = wrap.querySelector('.card');
    const handle = wrap.querySelector('.header-row');
    if (!card || !handle) return;

    let dragging = false;
    let offsetX = 0;
    let offsetY = 0;

    handle.addEventListener('mousedown', (e) => {
      const target = e.target;
      if (target && target.closest && target.closest('button, input, textarea, select, a')) return;
      dragging = true;
      const rect = card.getBoundingClientRect();
      offsetX = e.clientX - rect.left;
      offsetY = e.clientY - rect.top;
      e.preventDefault();
    });

    window.addEventListener('mousemove', (e) => {
      if (!dragging) return;
      const maxLeft = Math.max(8, window.innerWidth - card.offsetWidth - 8);
      const maxTop = Math.max(8, window.innerHeight - card.offsetHeight - 8);
      const left = Math.min(maxLeft, Math.max(8, e.clientX - offsetX));
      const top = Math.min(maxTop, Math.max(8, e.clientY - offsetY));
      card.style.left = `${left}px`;
      card.style.top = `${top}px`;
      card.style.right = 'auto';
      card.style.bottom = 'auto';
      saveModalPosition(card);
    });

    window.addEventListener('mouseup', () => {
      if (!dragging) return;
      dragging = false;
      saveModalPosition(card);
    });

    window.addEventListener('resize', () => {
      applyModalPosition(card);
      saveModalPosition(card);
    });
  }

  function openModal(sources) {
    const old = document.getElementById(MODAL_ID);
    if (old) old.remove();

    const hasCurrent = !!sources.current;
    const hasPlaying = !!sources.playing;
    const defaultMode = hasCurrent ? 'current' : 'playing';

    if (!hasCurrent && !hasPlaying) {
      alert('No track info detected.');
      return;
    }

    const btn = document.getElementById(BTN_ID);
    if (btn) btn.style.visibility = 'hidden';

    const wrap = document.createElement('div');
    wrap.id = MODAL_ID;
    wrap.className = 'open';
    wrap.innerHTML = `
      <div class="card">
        <div class="header-row">
          <p class="title">Add To Music MemoSpace</p>
          <button id="ms-source-toggle" class="source-toggle" type="button" aria-label="Switch source" aria-checked="false" role="switch">
            <span class="knob"></span>
          </button>
        </div>
        <div class="track-summary">
          <div class="track-title" id="ms-title-text"></div>
          <div class="track-artist" id="ms-artist-text"></div>
          <div class="track-source" id="ms-source-text"></div>
        </div>
        <label>Card Color</label>
        <div class="color-grid" id="ms-color-grid"></div>
        <div class="color-custom">
          <div class="color-preview-box" id="ms-color-preview-box"></div>
          <input id="ms-color-hex" value="#6d5efc" maxlength="7" />
          <button id="ms-color-picker-btn" type="button">Pick</button>
          <input id="ms-color-picker" type="color" value="#6d5efc" style="display:none" />
        </div>
        <div id="ms-color-strip"></div>
        <label>Short Description</label><textarea id="ms-desc"></textarea>
        <label>Long Description</label><textarea id="ms-long-desc"></textarea>
        <label>Tags (comma)</label><input id="ms-tags" placeholder="piano, chill" />
        <div class="actions">
          <button id="ms-cancel">Cancel</button>
          <button id="ms-open">Open MemoSpace</button>
          <button class="primary" id="ms-submit">Add Now</button>
        </div>
        <div class="tip">You need to be logged in to personal at ${API_BASE}.</div>
      </div>
    `;
    document.body.appendChild(wrap);
    positionModalNearButton(wrap);
    const card = wrap.querySelector('.card');
    saveModalPosition(card);
    enableModalDrag(wrap);

    const sourceToggle = wrap.querySelector('#ms-source-toggle');
    const titleText = wrap.querySelector('#ms-title-text');
    const artistText = wrap.querySelector('#ms-artist-text');
    const sourceText = wrap.querySelector('#ms-source-text');

    const colorGrid = wrap.querySelector('#ms-color-grid');
    const colorHex = wrap.querySelector('#ms-color-hex');
    const colorPreviewBox = wrap.querySelector('#ms-color-preview-box');
    const colorStrip = wrap.querySelector('#ms-color-strip');
    const colorPicker = wrap.querySelector('#ms-color-picker');
    const colorPickerBtn = wrap.querySelector('#ms-color-picker-btn');
    let selectedColor = COLOR_OPTIONS[0];

    const renderPalette = () => {
      if (!colorGrid) return;
      colorGrid.innerHTML = COLOR_OPTIONS.map((hex) => {
        const active = hex === selectedColor ? ' active' : '';
        return `<button type="button" class="color-swatch${active}" data-color="${hex}" style="background:${hex}" title="${hex}"></button>`;
      }).join('');
    };

    const applySelectedColor = (value) => {
      selectedColor = normalizeHexColor(value, selectedColor);
      if (colorHex) colorHex.value = selectedColor;
      if (colorPreviewBox) colorPreviewBox.style.background = selectedColor;
      if (colorStrip) colorStrip.style.background = selectedColor;
      if (colorPicker) colorPicker.value = selectedColor;
      renderPalette();
    };

    renderPalette();
    applySelectedColor(selectedColor);

    colorGrid?.addEventListener('click', (e) => {
      const btn = e.target?.closest?.('.color-swatch');
      if (!btn) return;
      applySelectedColor(btn.dataset.color || selectedColor);
    });

    colorHex?.addEventListener('change', () => {
      applySelectedColor(colorHex.value || selectedColor);
    });

    colorPickerBtn?.addEventListener('click', () => {
      colorPicker?.click();
    });

    colorPicker?.addEventListener('input', () => {
      applySelectedColor(colorPicker.value || selectedColor);
    });

    let usePlaying = defaultMode === 'playing';
    let selectedTrack = usePlaying ? sources.playing : sources.current;

    const updateSelectedTrack = () => {
      selectedTrack = usePlaying ? sources.playing : sources.current;
      titleText.textContent = selectedTrack?.title || '(Unknown Title)';
      artistText.textContent = selectedTrack?.artist || '(Unknown Artist)';
      sourceText.textContent = usePlaying ? 'Now Playing Track' : 'Current Page Track';
      sourceToggle.classList.toggle('is-playing', usePlaying);
      sourceToggle.setAttribute('aria-checked', usePlaying ? 'true' : 'false');
      const cannotToggle = !sources.current || !sources.playing;
      sourceToggle.disabled = cannotToggle;
      sourceToggle.style.opacity = cannotToggle ? '0.6' : '1';
      sourceToggle.title = cannotToggle ? 'Only one source available' : (usePlaying ? 'Now Playing Track' : 'Current Page Track');
    };

    updateSelectedTrack();
    sourceToggle.addEventListener('click', () => {
      if (!sources.current || !sources.playing) return;
      usePlaying = !usePlaying;
      updateSelectedTrack();
    });

    const close = () => {
      wrap.remove();
      if (btn) btn.style.visibility = 'visible';
    };
    wrap.querySelector('#ms-cancel')?.addEventListener('click', close);
    wrap.querySelector('#ms-open')?.addEventListener('click', () => window.open(PAGE_URL, '_blank'));

    wrap.querySelector('#ms-submit')?.addEventListener('click', async () => {
      const title = cleanText(selectedTrack?.title || '');
      const artist = cleanText(selectedTrack?.artist || '');
      if (!title && !artist) {
        alert('Track info is empty. Try switching source.');
        return;
      }

      const shortDesc = wrap.querySelector('#ms-desc')?.value?.trim() || '';
      const longDesc = wrap.querySelector('#ms-long-desc')?.value?.trim() || '';
      const tags = (wrap.querySelector('#ms-tags')?.value || '')
        .split(',')
        .map((x) => x.trim())
        .filter(Boolean);

      const payload = {
        icon_url: selectedTrack?.icon_url || '',
        title,
        artist,
        memory_time: nowTimeString(),
        tags,
        color: selectedColor,
        short_desc: shortDesc,
        long_desc: longDesc,
        links: [{ provider: selectedTrack?.provider || '', url: selectedTrack?.url || window.location.href }],
      };

      try {
        const resp = await gmRequest('POST', POST_URL, payload);
        if (resp.status >= 200 && resp.status < 300) {
          alert('Added to MemoSpace.');
          close();
          return;
        }
        if (resp.status === 401) {
          alert('Not logged in to personal. Open MemoSpace and login first.');
          return;
        }
        alert(`Add failed (${resp.status})\n${resp.responseText || ''}`);
      } catch (err) {
        alert(`Request failed: ${String(err?.message || err)}`);
      }
    });
  }


  function loadButtonPosition() {
    try {
      const raw = localStorage.getItem(BTN_POS_KEY);
      if (!raw) return null;
      const obj = JSON.parse(raw);
      if (typeof obj?.xPct !== 'number' || typeof obj?.yPct !== 'number') return null;
      return {
        xPct: Math.min(1, Math.max(0, obj.xPct)),
        yPct: Math.min(1, Math.max(0, obj.yPct)),
      };
    } catch (_) {
      return null;
    }
  }

  function saveButtonPosition(btn, left, top) {
    try {
      const maxLeft = Math.max(1, window.innerWidth - btn.offsetWidth);
      const maxTop = Math.max(1, window.innerHeight - btn.offsetHeight);
      const xPct = Math.min(1, Math.max(0, left / maxLeft));
      const yPct = Math.min(1, Math.max(0, top / maxTop));
      localStorage.setItem(BTN_POS_KEY, JSON.stringify({ xPct, yPct }));
    } catch (_) {}
  }

  function applyButtonPosition(btn, pos) {
    if (!pos) return;
    const maxLeft = Math.max(0, window.innerWidth - btn.offsetWidth);
    const maxTop = Math.max(0, window.innerHeight - btn.offsetHeight);
    const left = Math.min(maxLeft, Math.max(0, Math.round(maxLeft * pos.xPct)));
    const top = Math.min(maxTop, Math.max(0, Math.round(maxTop * pos.yPct)));
    btn.style.left = `${left}px`;
    btn.style.top = `${top}px`;
    btn.style.right = 'auto';
    btn.style.bottom = 'auto';
  }

  function clampButtonToViewport(btn) {
    const rect = btn.getBoundingClientRect();
    const maxLeft = Math.max(0, window.innerWidth - btn.offsetWidth);
    const maxTop = Math.max(0, window.innerHeight - btn.offsetHeight);
    const left = Math.min(maxLeft, Math.max(0, rect.left));
    const top = Math.min(maxTop, Math.max(0, rect.top));
    btn.style.left = `${left}px`;
    btn.style.top = `${top}px`;
    btn.style.right = 'auto';
    btn.style.bottom = 'auto';
    saveButtonPosition(btn, left, top);
  }

  function enableButtonDrag(btn) {
    let dragging = false;
    let moved = false;
    let suppressClick = false;
    let offsetX = 0;
    let offsetY = 0;
    let startX = 0;
    let startY = 0;

    btn.addEventListener('mousedown', (e) => {
      if (e.button !== 0) return;
      dragging = true;
      moved = false;
      btn.classList.add('dragging');
      const rect = btn.getBoundingClientRect();
      offsetX = e.clientX - rect.left;
      offsetY = e.clientY - rect.top;
      startX = e.clientX;
      startY = e.clientY;
      e.preventDefault();
    });

    window.addEventListener('mousemove', (e) => {
      if (!dragging) return;
      if (!moved) {
        const dx = Math.abs(e.clientX - startX);
        const dy = Math.abs(e.clientY - startY);
        if (dx + dy > 4) moved = true;
      }
      const maxLeft = Math.max(0, window.innerWidth - btn.offsetWidth);
      const maxTop = Math.max(0, window.innerHeight - btn.offsetHeight);
      const left = Math.min(maxLeft, Math.max(0, e.clientX - offsetX));
      const top = Math.min(maxTop, Math.max(0, e.clientY - offsetY));
      btn.style.left = `${left}px`;
      btn.style.top = `${top}px`;
      btn.style.right = 'auto';
      btn.style.bottom = 'auto';
    });

    window.addEventListener('mouseup', () => {
      if (!dragging) return;
      dragging = false;
      btn.classList.remove('dragging');
      const rect = btn.getBoundingClientRect();
      saveButtonPosition(btn, rect.left, rect.top);
      if (moved) suppressClick = true;
    });

    btn.addEventListener('click', (e) => {
      if (!suppressClick) return;
      suppressClick = false;
      e.preventDefault();
      e.stopPropagation();
    }, true);

    window.addEventListener('resize', () => {
      const saved = loadButtonPosition();
      if (saved) {
        applyButtonPosition(btn, saved);
      }
      clampButtonToViewport(btn);
    });
  }

  function mountButton() {
    if (window.self !== window.top) return;
    if (document.getElementById(BTN_ID)) return;

    const btn = document.createElement('button');
    btn.id = BTN_ID;
    btn.textContent = '+ MemoSpace';

    document.body.appendChild(btn);

    const savedPos = loadButtonPosition();
    if (savedPos) {
      applyButtonPosition(btn, savedPos);
    }
    clampButtonToViewport(btn);
    enableButtonDrag(btn);

    btn.addEventListener('click', async () => {
      if (btn.classList.contains('dragging')) return;
      const sources = await getTrackSources();
      if (!sources.current && !sources.playing) {
        alert('Track page not detected and no now-playing track found.');
        return;
      }
      openModal(sources);
    });
  }

  function startMountWatch() {
    if (mountWatchStarted) return;
    mountWatchStarted = true;

    let retries = 0;
    const maxRetries = 30;

    const tryMount = () => {
      mountButton();
      return !!document.getElementById(BTN_ID);
    };

    const remountSoon = () => {
      setTimeout(tryMount, 50);
      setTimeout(tryMount, 200);
      setTimeout(tryMount, 800);
    };

    tryMount();
    setTimeout(tryMount, 300);
    setTimeout(tryMount, 800);
    setTimeout(tryMount, 1500);

    const timer = setInterval(() => {
      if (tryMount()) {
        clearInterval(timer);
        return;
      }
      retries += 1;
      if (retries >= maxRetries) clearInterval(timer);
    }, 1000);

    window.addEventListener('hashchange', () => setTimeout(tryMount, 120));
    window.addEventListener('popstate', () => setTimeout(tryMount, 120));

    // Recover after external-app prompt returns focus.
    window.addEventListener('focus', remountSoon);
    window.addEventListener('pageshow', remountSoon);
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) remountSoon();
    });

    const mo = new MutationObserver(() => {
      if (!document.getElementById(BTN_ID)) tryMount();
    });
    mo.observe(document.documentElement, { childList: true, subtree: true });
  }

  window.addEventListener('DOMContentLoaded', startMountWatch);
  window.addEventListener('load', startMountWatch);
})();
