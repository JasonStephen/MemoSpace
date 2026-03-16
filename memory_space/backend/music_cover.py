from __future__ import annotations

import html
import json
import logging
import re
from functools import lru_cache
from typing import Iterable
from urllib.error import HTTPError, URLError
from urllib.parse import parse_qs, quote, urlparse
from urllib.request import Request, urlopen

logger = logging.getLogger(__name__)

USER_AGENT = (
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) '
    'AppleWebKit/537.36 (KHTML, like Gecko) '
    'Chrome/122.0.0.0 Safari/537.36'
)
HTTP_TIMEOUT_SECONDS = 6
SPOTIFY_FETCH_PROFILES: list[tuple[str, dict[str, str]]] = [
    (
        'mobile_safari',
        {
            'User-Agent': (
                'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) '
                'AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 '
                'Mobile/15E148 Safari/604.1'
            ),
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.9',
        },
    ),
    (
        'postman_like',
        {
            'User-Agent': 'PostmanRuntime/7.42.0',
            'Accept': '*/*',
            'Accept-Language': 'en-US,en;q=0.9',
        },
    ),
    (
        'desktop_chrome',
        {
            'User-Agent': USER_AGENT,
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.9',
        },
    ),
]


def _http_get_text(url: str) -> str:
    req = Request(url=url, headers={'User-Agent': USER_AGENT})
    try:
        with urlopen(req, timeout=HTTP_TIMEOUT_SECONDS) as resp:
            charset = resp.headers.get_content_charset() or 'utf-8'
            return resp.read().decode(charset, errors='ignore')
    except (HTTPError, URLError, TimeoutError, ValueError):
        return ''


def _http_get_text_with_headers(url: str, headers: dict[str, str]) -> str:
    req = Request(url=url, headers=headers)
    try:
        with urlopen(req, timeout=HTTP_TIMEOUT_SECONDS) as resp:
            charset = resp.headers.get_content_charset() or 'utf-8'
            return resp.read().decode(charset, errors='ignore')
    except (HTTPError, URLError, TimeoutError, ValueError):
        return ''


def _extract_html_title(html_text: str) -> str:
    if not html_text:
        return ''
    match = re.search(r'<title[^>]*>(.*?)</title>', html_text, re.IGNORECASE | re.DOTALL)
    if not match:
        return ''
    return _normalize_spotify_text(_clean_html_text(match.group(1)))


def _is_spotify_shell_html(html_text: str) -> bool:
    title = _extract_html_title(html_text).lower()
    if not title:
        return True
    if title in {'spotify - web player', 'spotify – web player'}:
        return True
    return False


def _get_spotify_page_html(url: str) -> tuple[str, str]:
    best_html = ''
    best_profile = ''
    for profile_name, headers in SPOTIFY_FETCH_PROFILES:
        html_text = _http_get_text_with_headers(url, headers)
        if not html_text:
            continue
        if not best_html:
            best_html = html_text
            best_profile = profile_name
        if not _is_spotify_shell_html(html_text):
            return html_text, profile_name
    if best_html:
        return best_html, best_profile
    return _http_get_text(url), 'default'


def _resolve_final_url(url: str) -> str:
    req = Request(url=url, headers={'User-Agent': USER_AGENT})
    try:
        with urlopen(req, timeout=HTTP_TIMEOUT_SECONDS) as resp:
            return str(resp.geturl() or '').strip()
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
        if netloc == '163cn.tv' or netloc.endswith('.163cn.tv'):
            redirected = _resolve_final_url(text)
            if redirected:
                text = redirected.strip()
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


def parse_netease_content(raw_url: str) -> dict[str, str] | None:
    normalized = _normalize_netease_song_url(raw_url)
    if not normalized:
        return None

    try:
        url = urlparse(normalized)
        path = (url.path or '').strip('/')
        content_type = path.split('/')[0] if path else ''
        if content_type not in {'song', 'playlist', 'album'}:
            content_type = 'song'

        content_id = ''
        if url.query:
            query_map = parse_qs(url.query)
            content_id = str((query_map.get('id') or [''])[0]).strip()
        if not content_id:
            return None
        return {'type': content_type, 'id': content_id, 'url': normalized}
    except ValueError:
        return None


def resolve_netease_link(raw_url: str) -> dict[str, str]:
    parsed = parse_netease_content(raw_url)
    if not parsed:
        return {'canonical_url': '', 'app_url': 'orpheus://'}
    return {
        'canonical_url': parsed['url'],
        'app_url': f"orpheus://{parsed['type']}/{parsed['id']}",
    }


def _clean_html_text(text: str) -> str:
    value = re.sub(r'<[^>]+>', '', text or '')
    return html.unescape(value).strip()


def _normalize_artist_text(artist: str) -> str:
    text = (artist or '').strip()
    if not text:
        return ''
    return re.sub(r'\s*,\s*', '/', text)


def _normalize_spotify_text(text: str) -> str:
    value = html.unescape(text or '')
    if not value:
        return ''
    # Normalize dash variants that often appear in HTML titles.
    value = re.sub(r'[\u2010\u2011\u2012\u2013\u2014\u2015\u2212]', '-', value)
    # Normalize whitespace and non-breaking spaces.
    value = value.replace('\u00a0', ' ')
    value = re.sub(r'\s+', ' ', value).strip()
    return value


def _parse_spotify_text_metadata(raw_text: str) -> dict[str, str]:
    text = _normalize_spotify_text(raw_text)
    if not text:
        return {'title': '', 'artist': ''}

    # Example: "Beepa - song and lyrics by XXX | Spotify"
    match = re.search(r'^(.*?)\s*-\s*song(?:\s*(?:and|&)\s*lyrics)?\s+by\s*(.*?)\s*\|\s*spotify\s*$', text, re.IGNORECASE)
    if match:
        return {'title': match.group(1).strip(), 'artist': _normalize_artist_text(match.group(2))}

    # Example: "Listen to Beepa by XXX on Spotify."
    match = re.search(r'listen to\s+(.*?)\s+by\s+(.*?)\s+on\s+spotify', text, re.IGNORECASE)
    if match:
        return {'title': match.group(1).strip(), 'artist': _normalize_artist_text(match.group(2))}

    # Example: "Beepa, a song by XXX on Spotify"
    match = re.search(r'^(.*?),\s*a song by\s+(.*?)\s+on\s+spotify', text, re.IGNORECASE)
    if match:
        return {'title': match.group(1).strip(), 'artist': _normalize_artist_text(match.group(2))}

    # Example: "XXX · Song · YYYY"
    match = re.search(r'^(.*?)\s*·\s*song\s*·', text, re.IGNORECASE)
    if match:
        return {'title': '', 'artist': _normalize_artist_text(match.group(1))}

    return {'title': '', 'artist': ''}


def _parse_spotify_title_like_from_html(html_text: str) -> dict[str, str]:
    text = html.unescape(html_text or '')
    if not text:
        return {'title': '', 'artist': ''}
    candidates = re.findall(
        r'([^\n<>{}"\']{1,260}?\s*-\s*song and lyrics by\s*[^\n<>{}"\']{1,260}?\|\s*spotify)',
        text,
        re.IGNORECASE,
    )
    for candidate in candidates:
        parsed = _parse_spotify_text_metadata(candidate.strip())
        if parsed.get('title') and parsed.get('artist'):
            return {'title': parsed['title'], 'artist': parsed['artist']}
    return {'title': '', 'artist': ''}


def _extract_netease_artist_fallback(html_text: str) -> str:
    if not html_text:
        return ''

    # Common Netease metadata form:
    # <meta property="og:description" content="歌手：XXX。所属专辑：YYY。">
    desc_match = re.search(
        r'<meta\s+property="og:description"\s+content="([^"]+)"',
        html_text,
        re.IGNORECASE,
    )
    if desc_match:
        desc = html.unescape(desc_match.group(1).strip())
        # Chinese punctuation + English punctuation fallback.
        artist_match = re.search(r'歌手[：:]\s*([^。.;；]+)', desc)
        if artist_match:
            return _clean_html_text(artist_match.group(1))

    # Fallback from title-like text: "<song> - <artist>"
    title_match = re.search(r'<title[^>]*>(.*?)</title>', html_text, re.IGNORECASE | re.DOTALL)
    if title_match:
        title_text = _clean_html_text(title_match.group(1))
        split_match = re.search(r'^(.*?)\s*-\s*(.*?)\s*(?:-.*)?$', title_text)
        if split_match:
            return _clean_html_text(split_match.group(2))

    return ''


@lru_cache(maxsize=512)
def _resolve_netease_metadata(raw_url: str) -> dict[str, str]:
    parsed = parse_netease_content(raw_url)
    if not parsed:
        return {'title': '', 'artist': ''}

    song_id = parsed['id']
    page_url = f'https://music.163.com/m/song?id={song_id}'
    html_text = _http_get_text(page_url)
    if not html_text:
        html_text = _http_get_text(parsed['url'])
    if not html_text:
        return {'title': '', 'artist': ''}

    title = ''
    artist = ''
    name_match = re.search(
        r'class="m-songInfo-song-name"[^>]*>(.*?)</h2>',
        html_text,
        re.IGNORECASE | re.DOTALL,
    )
    artist_match = re.search(
        r'class="m-songInfo-artist"[^>]*>(.*?)</h2>',
        html_text,
        re.IGNORECASE | re.DOTALL,
    )
    if name_match:
        title = _clean_html_text(name_match.group(1))
    if artist_match:
        artist = _clean_html_text(artist_match.group(1))

    if not artist:
        artist = _extract_netease_artist_fallback(html_text)

    if not title:
        og_title = re.search(r'<meta\s+property="og:title"\s+content="([^"]+)"', html_text, re.IGNORECASE)
        if og_title:
            raw_title = html.unescape(og_title.group(1).strip())
            title = re.sub(r'\s*-\s*(?:网易云音乐|NetEase Cloud Music)\s*$', '', raw_title, flags=re.IGNORECASE)

    if not artist:
        logger.warning(
            'netease metadata artist missing: url=%s canonical=%s html_len=%s has_song_name=%s has_artist_class=%s',
            raw_url,
            parsed.get('url', ''),
            len(html_text or ''),
            bool(name_match),
            bool(artist_match),
        )
        debug_artist_block = re.search(
            r'class="m-songInfo-artist"[^>]*>(.*?)</h2>',
            html_text,
            re.IGNORECASE | re.DOTALL,
        )
        if debug_artist_block:
            logger.debug('netease artist raw block: %s', _clean_html_text(debug_artist_block.group(1))[:200])

    return {'title': title, 'artist': artist}


def _extract_spotify_track_id(track_url: str) -> str:
    try:
        parsed = urlparse(track_url)
        parts = [part for part in parsed.path.split('/') if part]
        for idx, part in enumerate(parts):
            if part == 'track' and idx + 1 < len(parts):
                return parts[idx + 1]
    except ValueError:
        return ''
    return ''


def _spotify_href_candidates(track_id: str) -> list[str]:
    if track_id:
        return [
            rf'href="/(?:intl-[^"/]+/)?track/{re.escape(track_id)}(?:\?[^"]*)?"',
            rf"href='/(?:intl-[^'/]+/)?track/{re.escape(track_id)}(?:\?[^']*)?'",
            rf'href="https://open\.spotify\.com/(?:intl-[^"/]+/)?track/{re.escape(track_id)}(?:\?[^"]*)?"',
            rf"href='https://open\.spotify\.com/(?:intl-[^'/]+/)?track/{re.escape(track_id)}(?:\?[^']*)?'",
        ]
    return [
        r'href="/(?:intl-[^"/]+/)?track/[^"/?]+(?:\?[^"]*)?"',
        r"href='/(?:intl-[^'/]+/)?track/[^'/?]+(?:\?[^']*)?'",
        r'href="https://open\.spotify\.com/(?:intl-[^"/]+/)?track/[^"/?]+(?:\?[^"]*)?"',
        r"href='https://open\.spotify\.com/(?:intl-[^'/]+/)?track/[^'/?]+(?:\?[^']*)?'",
    ]


def _resolve_spotify_anchor_metadata(html_text: str, href_candidates: list[str]) -> tuple[str, str, int, list[list[str]]]:
    title = ''
    artist = ''
    hit_count = 0
    samples: list[list[str]] = []
    title_pattern = (
        r'<span(?=[^>]*data-encore-id=["\']text["\'])'
        r'(?=[^>]*class=["\'][^"\']*encore-text-body-medium-bold[^"\']*["\'])[^>]*>(.*?)</span>'
    )
    artist_pattern = (
        r'<span(?=[^>]*data-encore-id=["\']text["\'])'
        r'(?=[^>]*class=["\'][^"\']*encore-text-marginal[^"\']*["\'])[^>]*>(.*?)</span>'
    )
    plain_text_pattern = r'<span[^>]*data-encore-id=["\']text["\'][^>]*>(.*?)</span>'

    for href_pattern in href_candidates:
        anchor_pattern = rf'<a[^>]*{href_pattern}[^>]*>(.*?)</a>'
        for anchor_inner in re.findall(anchor_pattern, html_text, re.IGNORECASE | re.DOTALL):
            hit_count += 1

            strong_title = ''
            strong_artist = ''
            strong_title_match = re.search(title_pattern, anchor_inner, re.IGNORECASE | re.DOTALL)
            strong_artist_match = re.search(artist_pattern, anchor_inner, re.IGNORECASE | re.DOTALL)
            if strong_title_match:
                strong_title = _clean_html_text(strong_title_match.group(1))
            if strong_artist_match:
                strong_artist = _clean_html_text(strong_artist_match.group(1))
            if strong_title and strong_artist:
                return strong_title, strong_artist, hit_count, samples

            spans = re.findall(plain_text_pattern, anchor_inner, re.IGNORECASE | re.DOTALL)
            texts = [_clean_html_text(item) for item in spans if _clean_html_text(item)]
            if texts and len(samples) < 5:
                samples.append(texts)

            # Generic fallback: only trust anchors that provide at least two text spans.
            if len(texts) >= 2:
                title = texts[0]
                artist = texts[1]
                if title and artist:
                    return title, artist, hit_count, samples

    return title, artist, hit_count, samples


@lru_cache(maxsize=512)
def _resolve_spotify_metadata(track_url: str) -> dict[str, str]:
    if not track_url:
        return {'title': '', 'artist': ''}

    title = ''
    artist = ''

    html_text, _ = _get_spotify_page_html(track_url)
    if html_text:
        doc_title_match = re.search(r'<title[^>]*>(.*?)</title>', html_text, re.IGNORECASE | re.DOTALL)
        if doc_title_match:
            parsed = _parse_spotify_text_metadata(_clean_html_text(doc_title_match.group(1)))
            if parsed.get('title') and parsed.get('artist'):
                return {'title': parsed['title'], 'artist': parsed['artist']}
        parsed_from_html = _parse_spotify_title_like_from_html(html_text)
        if parsed_from_html.get('title') and parsed_from_html.get('artist'):
            return {'title': parsed_from_html['title'], 'artist': parsed_from_html['artist']}

        # First priority: parse the same structure user provided:
        # <a href="/track/{id}"><span data-encore-id="text">name</span><span data-encore-id="text">artist</span></a>
        track_id = _extract_spotify_track_id(track_url)
        href_candidates = _spotify_href_candidates(track_id)
        dom_title, dom_artist, _, _ = _resolve_spotify_anchor_metadata(html_text, href_candidates)
        if dom_title and dom_artist:
            return {'title': dom_title, 'artist': dom_artist}

        # Secondary: structured data fallback.
        if not artist:
            for json_text in re.findall(
                r'<script[^>]*type=["\']application/ld\+json["\'][^>]*>(.*?)</script>',
                html_text,
                re.IGNORECASE | re.DOTALL,
            ):
                try:
                    payload = json.loads(html.unescape(json_text.strip()))
                except json.JSONDecodeError:
                    continue
                candidates = payload if isinstance(payload, list) else [payload]
                for item in candidates:
                    if not isinstance(item, dict):
                        continue
                    if not title:
                        title = str(item.get('name', '')).strip()
                    if not artist:
                        by_artist = item.get('byArtist')
                        if isinstance(by_artist, dict):
                            artist = _normalize_artist_text(str(by_artist.get('name', '')).strip())
                        elif isinstance(by_artist, list):
                            names = [str(entry.get('name', '')).strip() for entry in by_artist if isinstance(entry, dict)]
                            artist = _normalize_artist_text(', '.join([name for name in names if name]))
                    if title and artist:
                        return {'title': title, 'artist': artist}

        title_match = re.search(r'<meta\s+property="og:title"\s+content="([^"]+)"', html_text, re.IGNORECASE)
        artist_match = re.search(r'<meta\s+name="music:musician"\s+content="([^"]+)"', html_text, re.IGNORECASE)
        desc_match = re.search(r'<meta\s+property="og:description"\s+content="([^"]+)"', html_text, re.IGNORECASE)
        tw_desc_match = re.search(r'<meta\s+name="twitter:description"\s+content="([^"]+)"', html_text, re.IGNORECASE)
        if not title and title_match:
            title = html.unescape(title_match.group(1).strip())
        if not artist and artist_match:
            artist = _normalize_artist_text(html.unescape(artist_match.group(1).strip()))
        if not title or not artist:
            desc_sources = []
            if title_match:
                desc_sources.append(html.unescape(title_match.group(1).strip()))
            if desc_match:
                desc_sources.append(html.unescape(desc_match.group(1).strip()))
            if tw_desc_match:
                desc_sources.append(html.unescape(tw_desc_match.group(1).strip()))
            for source_text in desc_sources:
                parsed = _parse_spotify_text_metadata(source_text)
                if not title and parsed.get('title'):
                    title = parsed['title']
                if not artist and parsed.get('artist'):
                    artist = parsed['artist']
                if title and artist:
                    return {'title': title, 'artist': artist}

    # Final fallback: oEmbed.
    if not title or not artist:
        encoded = quote(track_url, safe='')
        oembed_url = f'https://open.spotify.com/oembed?url={encoded}'
        text = _http_get_text(oembed_url)
        if text:
            try:
                payload = json.loads(text)
                if not title:
                    title = str(payload.get('title', '')).strip()
                if not artist:
                    artist = _normalize_artist_text(str(payload.get('author_name', '')).strip())
            except json.JSONDecodeError:
                pass

    return {'title': title, 'artist': artist}


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


def resolve_music_metadata(links: Iterable[dict[str, str]]) -> dict[str, str]:
    for link in links:
        provider = _normalized_provider(str(link.get('provider', '')))
        url = str(link.get('url', '')).strip()
        if not url:
            continue

        metadata = {'title': '', 'artist': ''}
        if provider == 'netease_music':
            metadata = _resolve_netease_metadata(url)
        elif provider == 'spotify':
            metadata = _resolve_spotify_metadata(url)

        title = str(metadata.get('title', '')).strip()
        artist = str(metadata.get('artist', '')).strip()
        if title or artist:
            return {'title': title, 'artist': artist}

    return {'title': '', 'artist': ''}



