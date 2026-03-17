// ==UserScript==
// @name         MemoSpace Quick Add (Netease/Spotify)
// @namespace    memspace.local
// @version      0.2.0
// @description  Add current Netease/Spotify track to MemoSpace personal music quickly.
// @match        https://music.163.com/*
// @match        https://open.spotify.com/track/*
// @grant        GM_xmlhttpRequest
// @connect      127.0.0.1
// @connect      localhost
// ==/UserScript==

(function () {
  'use strict';

  const API_BASE = 'http://127.0.0.1:8000';
  const POST_URL = `${API_BASE}/api/music/personal`;
  const PAGE_URL = `${API_BASE}/music/personal`;
  const BTN_ID = 'memspace-quick-add-btn';
  const MODAL_ID = 'memspace-quick-add-modal';

  const style = document.createElement('style');
  style.textContent = `
    #${MODAL_ID}, #${MODAL_ID} * { box-sizing: border-box; }
    #${BTN_ID} {
      position: fixed; right: 24px; bottom: 24px; z-index: 2147483646;
      border: 1px solid rgba(255,255,255,.18); border-radius: 999px;
      background: linear-gradient(135deg, #0a3a56 0%, #0f6b52 100%);
      color: #e8f6ff; font-weight: 700; font-size: 13px; letter-spacing: .2px;
      padding: 10px 14px; cursor: pointer; box-shadow: 0 10px 24px rgba(0,0,0,.35);
    }
    #${MODAL_ID} { position: fixed; inset: 0; z-index: 2147483647; display:none; }
    #${MODAL_ID}.open { display:block; }
    #${MODAL_ID} .mask { position:absolute; inset:0; background:rgba(0,0,0,.45); }
    #${MODAL_ID} .card {
      position:absolute; right:24px; bottom:74px; width:360px; max-width:calc(100vw - 24px);
      border-radius: 18px; border: 1px solid rgba(255,255,255,.18);
      background: linear-gradient(180deg, #162644 0%, #12223d 100%);
      color:#eef5ff; padding:14px; box-shadow:0 18px 36px rgba(0,0,0,.45);
      font-family: "Segoe UI","PingFang SC","Microsoft YaHei",sans-serif;
    }
    #${MODAL_ID} .title { font-weight:700; margin: 0 0 10px; }
    #${MODAL_ID} label { display:block; font-size:12px; color:#b5c1d8; margin:8px 0 4px; }
    #${MODAL_ID} input, #${MODAL_ID} textarea {
      display:block;
      width:100%; border-radius:10px; border:1px solid rgba(255,255,255,.16);
      background: rgba(9,18,34,.75); color:#eaf2ff; padding:8px 10px; outline:none;
      max-width:100%;
    }
    #${MODAL_ID} textarea { min-height: 72px; resize: vertical; }
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

  function extractSpotifyTitle(doc) {
    return firstText(doc, [
      '[data-testid="entityTitle"] h1',
      'h1[data-encore-id="text"][dir="auto"]',
      '[data-testid="context-item-info-title"] a',
      '[data-testid="context-item-link"]',
    ]);
  }

  function extractSpotifyArtists(doc) {
    const artistValues = [];

    // Full artist cards on track detail page.
    doc
      .querySelectorAll('[data-testid="track-artist-link-card-container"] a[href^="/artist/"]')
      .forEach((a) => artistValues.push(a.textContent || ''));

    // Sidebar / bottom now-playing blocks (can contain multiple artists).
    doc
      .querySelectorAll('[data-testid="context-item-info-artist"]')
      .forEach((a) => artistValues.push(a.textContent || ''));

    // Fallback: single creator link on header row.
    doc
      .querySelectorAll('[data-testid="creator-link"]')
      .forEach((a) => artistValues.push(a.textContent || ''));

    return uniqueJoin(artistValues);
  }

  function parseSpotifyFromDocument(doc, href) {
    const ld = parseJsonLdMusic(doc);
    const ogTitle = cleanText(doc.querySelector('meta[property="og:title"]')?.content || '');
    const ogDesc = cleanText(doc.querySelector('meta[property="og:description"]')?.content || '');
    const ogImage = cleanText(doc.querySelector('meta[property="og:image"]')?.content || '');

    const domTitle = extractSpotifyTitle(doc);
    const domArtists = extractSpotifyArtists(doc);

    const by = ogDesc.match(/by\s+(.+)$/i);
    const descArtist = by ? splitArtists(by[1]) : '';

    return {
      provider: 'spotify',
      url: normalizeSpotifyUrl(href),
      title: domTitle || ld.title || ogTitle || '',
      artist: domArtists || ld.artist || descArtist || '',
      icon_url: ogImage || '',
    };
  }


  function extractNeteaseTitle(doc) {
    return firstText(doc, [
      '.tit .f-ff2',
      '.tit em.f-ff2',
      '.m-songInfo-song-name',
      'h2.m-songInfo-song-name',
      '.j-flag.words a.name',
      '.f-thide.name',
      '.tit',
      '.f-ff2',
    ]);
  }

  function parseNeteaseFromDocument(doc, href) {
    const title = extractNeteaseTitle(doc);
    const artist = extractNeteaseArtist(doc);
    const icon =
      cleanText(doc.querySelector('.u-cover img[data-src]')?.getAttribute('data-src') || '') ||
      cleanText(doc.querySelector('.u-cover img[src]')?.getAttribute('src') || '') ||
      cleanText(doc.querySelector('meta[property="og:image"]')?.content || '');

    return {
      provider: 'netease_music',
      url: normalizeNeteaseUrl(href),
      title: title || '',
      artist: artist || '',
      icon_url: icon || '',
    };
  }

  function extractNeteaseArtist(doc) {
    const dedupe = new Set();
    const results = [];
    const push = (value) => {
      const text = cleanText(value);
      if (!text || dedupe.has(text)) return;
      dedupe.add(text);
      results.push(text);
    };

    const splitAndPushArtists = (value) => {
      cleanText(value)
        .split('/')
        .forEach(push);
    };

    // Song detail block:
    // <p class="des s-fc4">???<span><a ...>A</a> / <a ...>B</a></span></p>
    const singerRows = Array.from(doc.querySelectorAll('p.des.s-fc4, p.des, .m-info .des, .m-songInfo-des'))
      .filter((row) => /歌\s*手\s*[:：]/.test(cleanText(row.textContent || '')));
    for (const row of singerRows) {
      const links = Array.from(row.querySelectorAll('a[href*="/artist"]'));
      if (links.length) {
        links.forEach((a) => push(a.textContent));
      }
      const titledSpan = row.querySelector('span[title]');
      if (titledSpan) {
        splitAndPushArtists(titledSpan.getAttribute('title') || '');
      }
      const raw = cleanText(row.textContent || '').replace(/^歌\s*手\s*[:：]\s*/i, '');
      splitAndPushArtists(raw);
    }
    if (results.length) return results.join('/');

    // Netease player bar "currently playing" block.
    const playingWords = doc.querySelector('.j-flag.words');
    if (playingWords) {
      const links = Array.from(playingWords.querySelectorAll('.by a[href*="/artist"], a[href*="/artist"]'));
      if (links.length) {
        links.forEach((a) => push(a.textContent));
      }
      const titleSpan = playingWords.querySelector('.by span[title], span.by span[title]');
      if (titleSpan) {
        splitAndPushArtists(titleSpan.getAttribute('title') || '');
      }
      const byText = cleanText(playingWords.querySelector('.by')?.textContent || '');
      splitAndPushArtists(byText);
    }
    if (results.length) return results.join('/');

    const artistHeader = doc.querySelector('.m-songInfo-artist');
    if (artistHeader) {
      const links = Array.from(artistHeader.querySelectorAll('a'));
      if (links.length) {
        links.forEach((a) => push(a.textContent));
      } else {
        const raw = cleanText(artistHeader.textContent || '').replace(/^歌\s*手\s*[:：]?\s*/i, '');
        splitAndPushArtists(raw);
      }
      if (results.length) return results.join('/');
    }

    const legacyRows = Array.from(doc.querySelectorAll('.m-info .des, .m-info p, .m-info div'))
      .filter((row) => /^歌\s*手\s*[:：]/.test(cleanText(row.textContent || '')));
    for (const row of legacyRows) {
      const links = Array.from(row.querySelectorAll('a'));
      if (links.length) {
        links.forEach((a) => push(a.textContent));
      } else {
        const raw = cleanText(row.textContent || '').replace(/^歌\s*手\s*[:：]\s*/, '');
        splitAndPushArtists(raw);
      }
    }
    if (results.length) return results.join('/');

    return firstText(doc, [
      '.m-songInfo-artist',
      'h2.m-songInfo-artist',
      '.m-info .des a',
      '.m-songInfo-des a',
    ]);
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

  async function getTrackInfo() {
    const href = window.location.href;
    const host = window.location.hostname;

    if (host.includes('spotify.com')) {
      let track = parseSpotifyFromDocument(document, href);
      if (!track.title || !track.artist || !track.icon_url) {
        const htmlDoc = await fetchHtmlDocument(href);
        if (htmlDoc) track = mergeTrack(track, parseSpotifyFromDocument(htmlDoc, href));
      }
      return track;
    }

    if (host.includes('music.163.com')) {
      let track = parseNeteaseFromDocument(document, href);
      const iframe = document.querySelector('#g_iframe');
      const iframeDoc = iframe?.contentDocument || null;
      if (iframeDoc) track = mergeTrack(track, parseNeteaseFromDocument(iframeDoc, href));

      if (!track.title || !track.artist || !track.icon_url) {
        const htmlDoc = await fetchHtmlDocument(normalizeNeteaseUrl(href));
        if (htmlDoc) track = mergeTrack(track, parseNeteaseFromDocument(htmlDoc, href));
      }
      return track;
    }

    return null;
  }

  function nowTimeString() {
    const d = new Date();
    const p = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}/${p(d.getMonth() + 1)}/${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
  }

  function openModal(track) {
    const old = document.getElementById(MODAL_ID);
    if (old) old.remove();
    const wrap = document.createElement('div');
    wrap.id = MODAL_ID;
    wrap.className = 'open';
    wrap.innerHTML = `
      <div class="mask"></div>
      <div class="card">
        <p class="title">Add To Music MemoSpace</p>
        <label>Music Name</label><input id="ms-title" value="${escapeHtml(track.title || '')}" />
        <label>Artist</label><input id="ms-artist" value="${escapeHtml(track.artist || '')}" />
        <label>Short Description</label><textarea id="ms-desc"></textarea>
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

    const close = () => wrap.remove();
    wrap.querySelector('.mask')?.addEventListener('click', close);
    wrap.querySelector('#ms-cancel')?.addEventListener('click', close);
    wrap.querySelector('#ms-open')?.addEventListener('click', () => window.open(PAGE_URL, '_blank'));

    wrap.querySelector('#ms-submit')?.addEventListener('click', async () => {
      const title = wrap.querySelector('#ms-title')?.value?.trim() || '';
      const artist = wrap.querySelector('#ms-artist')?.value?.trim() || '';
      const shortDesc = wrap.querySelector('#ms-desc')?.value?.trim() || '';
      const tags = (wrap.querySelector('#ms-tags')?.value || '')
        .split(',')
        .map((x) => x.trim())
        .filter(Boolean);

      const payload = {
        icon_url: track.icon_url || '',
        title,
        artist,
        memory_time: nowTimeString(),
        tags,
        color: '#6d5efc',
        short_desc: shortDesc,
        long_desc: '',
        links: [{ provider: track.provider, url: track.url }],
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

  function escapeHtml(s) {
    return String(s || '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#39;');
  }

  function mountButton() {
    if (document.getElementById(BTN_ID)) return;
    const btn = document.createElement('button');
    btn.id = BTN_ID;
    btn.textContent = '+ MemoSpace';
    btn.addEventListener('click', async () => {
      const track = await getTrackInfo();
      if (!track || !track.url) {
        alert('Track page not detected.');
        return;
      }
      openModal(track);
    });
    document.body.appendChild(btn);
  }

  window.addEventListener('load', () => {
    setTimeout(mountButton, 600);
  });
})();
