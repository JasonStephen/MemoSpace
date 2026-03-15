from __future__ import annotations

import html
import json
import re
from functools import lru_cache
from typing import Iterable
from urllib.error import HTTPError, URLError
from urllib.parse import quote, urlparse
from urllib.request import Request, urlopen

USER_AGENT = (
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) '
    'AppleWebKit/537.36 (KHTML, like Gecko) '
    'Chrome/122.0.0.0 Safari/537.36'
)
HTTP_TIMEOUT_SECONDS = 6


def _http_get_text(url: str) -> str:
    req = Request(url=url, headers={'User-Agent': USER_AGENT})
    try:
        with urlopen(req, timeout=HTTP_TIMEOUT_SECONDS) as resp:
            charset = resp.headers.get_content_charset() or 'utf-8'
            return resp.read().decode(charset, errors='ignore')
    except (HTTPError, URLError, TimeoutError, ValueError):
        return ''


@lru_cache(maxsize=512)
def _resolve_spotify_cover(track_url: str) -> str:
    if not track_url:
        return ''
    encoded = quote(track_url, safe='')
    oembed_url = f'https://open.spotify.com/oembed?url={encoded}'
    text = _http_get_text(oembed_url)
    if text:
        try:
            payload = json.loads(text)
            cover = str(payload.get('thumbnail_url', '')).strip()
            if cover:
                return cover
        except json.JSONDecodeError:
            pass

    html_text = _http_get_text(track_url)
    if not html_text:
        return ''
    match = re.search(r'<meta\s+property="og:image"\s+content="([^"]+)"', html_text, re.IGNORECASE)
    if match:
        return html.unescape(match.group(1).strip())
    return ''


def _normalize_netease_song_url(raw_url: str) -> str:
    text = (raw_url or '').strip()
    if not text:
        return ''

    parsed = urlparse(text)
    netloc = (parsed.netloc or '').lower()
    if 'music.163.com' not in netloc:
        return text

    path = parsed.path or '/song'
    query = parsed.query

    fragment = (parsed.fragment or '').strip()
    if fragment:
        fragment = fragment.lstrip('/')
        if '?' in fragment:
            frag_path, frag_query = fragment.split('?', 1)
        else:
            frag_path, frag_query = fragment, ''
        if frag_path:
            path = '/' + frag_path.lstrip('/')
        if frag_query:
            query = frag_query

    if not path:
        path = '/song'

    if query:
        return f'https://music.163.com{path}?{query}'
    return f'https://music.163.com{path}'


@lru_cache(maxsize=512)
def _resolve_netease_cover(raw_url: str) -> str:
    page_url = _normalize_netease_song_url(raw_url)
    if not page_url:
        return ''

    html_text = _http_get_text(page_url)
    if not html_text:
        return ''

    # Prefer the lazy-load source (`data-src`) from the cover block.
    match = re.search(
        r'<div[^>]*class="[^"]*u-cover[^\"]*"[^>]*>.*?<img[^>]*data-src="([^"]+)"',
        html_text,
        re.IGNORECASE | re.DOTALL,
    )
    if match:
        return html.unescape(match.group(1).strip())

    fallback = re.search(r'<meta\s+property="og:image"\s+content="([^"]+)"', html_text, re.IGNORECASE)
    if fallback:
        return html.unescape(fallback.group(1).strip())

    return ''


def _normalized_provider(provider: str) -> str:
    value = (provider or '').strip().lower().replace(' ', '_')
    aliases = {
        'netease': 'netease_music',
        'netease_music': 'netease_music',
        'wangyiyun': 'netease_music',
        'spotify': 'spotify',
    }
    return aliases.get(value, value)


def _append_candidate(candidates: list[str], seen: set[str], url: str) -> None:
    value = (url or '').strip()
    if not value or value in seen:
        return
    candidates.append(value)
    seen.add(value)


def resolve_cover_candidates(links: Iterable[dict[str, str]], preferred_icon_url: str = '') -> list[str]:
    candidates: list[str] = []
    seen: set[str] = set()
    _append_candidate(candidates, seen, preferred_icon_url)

    for link in links:
        provider = _normalized_provider(str(link.get('provider', '')))
        url = str(link.get('url', '')).strip()
        if not url:
            continue

        cover = ''
        if provider == 'spotify':
            cover = _resolve_spotify_cover(url)
        elif provider == 'netease_music':
            cover = _resolve_netease_cover(url)

        _append_candidate(candidates, seen, cover)

    return candidates
