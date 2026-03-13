from __future__ import annotations

import atexit
import json
import re
from pathlib import Path
from urllib.parse import urlparse

import uvicorn
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse
from fastapi.staticfiles import StaticFiles

from backup import BackupScheduler
from config import (
    COLOR_CONFIG,
    LINK_OPTIONS,
    get_app_font_family,
    get_default_locale,
    get_app_version,
    get_backup_interval_minutes,
    get_backup_max_count,
    get_locale_flags,
    get_locale_labels,
    get_supported_locales,
    get_theme_config,
)
from db import execute, fetch_all, fetch_one, init_db
from schemas import HiddenStatusIn, MindMemoryIn, MusicMemoryIn

BASE_DIR = Path(__file__).resolve().parent.parent
FRONTEND_DIR = BASE_DIR / 'frontend'
STATIC_DIR = FRONTEND_DIR / 'static'

app = FastAPI(title='MemoSpace')
app.add_middleware(
    CORSMiddleware,
    allow_origins=['*'],
    allow_credentials=True,
    allow_methods=['*'],
    allow_headers=['*'],
)
app.mount('/static', StaticFiles(directory=STATIC_DIR), name='static')

LINK_OPTION_MAP: dict[str, dict[str, object]] = {str(item['provider']): item for item in LINK_OPTIONS}
PROVIDER_ALIASES: dict[str, str] = {}
for option in LINK_OPTIONS:
    provider = str(option['provider'])
    label = str(option.get('label', '')).strip().lower()
    PROVIDER_ALIASES[provider.lower()] = provider
    if label:
        PROVIDER_ALIASES[label] = provider

PROVIDER_ALIASES.update(
    {
        'spotify': 'spotify',
        'youtube': 'youtube',
        'apple music': 'apple_music',
        'apple_music': 'apple_music',
        'netease music': 'netease_music',
        'netease_music': 'netease_music',
        'qq music': 'qq_music',
        'qq_music': 'qq_music',
    }
)

backup_scheduler: BackupScheduler | None = None
backup_shutdown_done = False


def shutdown_backup() -> None:
    global backup_shutdown_done
    if backup_shutdown_done:
        return
    backup_shutdown_done = True
    if not backup_scheduler:
        return
    backup_scheduler.stop()
    backup_scheduler.backup_now()


atexit.register(shutdown_backup)


@app.on_event('startup')
def startup_event() -> None:
    global backup_scheduler, backup_shutdown_done
    backup_shutdown_done = False
    init_db()
    backup_scheduler = BackupScheduler(
        interval_minutes=get_backup_interval_minutes(),
        max_backups=get_backup_max_count(),
    )
    backup_scheduler.backup_now()
    backup_scheduler.start()


@app.on_event('shutdown')
def shutdown_event() -> None:
    shutdown_backup()


@app.middleware('http')
async def disable_cache_for_pages_and_static(request, call_next):
    response = await call_next(request)
    path = request.url.path
    if path in {'/', '/music', '/mind'} or path.startswith('/static/'):
        response.headers['Cache-Control'] = 'no-store, no-cache, must-revalidate, max-age=0'
        response.headers['Pragma'] = 'no-cache'
        response.headers['Expires'] = '0'
    return response


def render_page(filename: str) -> HTMLResponse:
    app_version = get_app_version()
    html = (FRONTEND_DIR / filename).read_text(encoding='utf-8')
    html = re.sub(
        r'window\.__APP_VERSION__\s*=\s*"[^"]*"',
        f'window.__APP_VERSION__ = "{app_version}"',
        html,
        count=1,
    )
    html = re.sub(r'(/static/css/style\.css\?v=)[^"]+', rf'\g<1>{app_version}', html, count=1)
    html = re.sub(r'(/static/js/app\.js\?v=)[^"]+', rf'\g<1>{app_version}', html, count=1)
    return HTMLResponse(content=html)


@app.get('/')
def root() -> HTMLResponse:
    return render_page('music.html')


@app.get('/music')
def music_page() -> HTMLResponse:
    return render_page('music.html')


@app.get('/mind')
def mind_page() -> HTMLResponse:
    return render_page('mind.html')


@app.get('/api/config/link-options')
def list_link_options() -> dict[str, list[dict[str, object]]]:
    return {'items': LINK_OPTIONS}


@app.get('/api/config/ui')
def get_ui_config() -> dict[str, object]:
    return {
        'link_options': LINK_OPTIONS,
        'color_config': COLOR_CONFIG,
        'theme_config': get_theme_config(),
        'app_font_family': get_app_font_family(),
        'i18n': {
            'locales': get_supported_locales(),
            'default_locale': get_default_locale(),
            'labels': get_locale_labels(),
            'flags': get_locale_flags(),
        },
    }


@app.get('/api/system/status')
def get_system_status() -> dict[str, object]:
    return {
        'latest_version': get_app_version(),
        'service_status': 'ok',
    }


def normalise_link_entries(raw_links: object) -> list[dict[str, str]]:
    def resolve_provider(provider: str) -> str:
        clean = provider.strip()
        if not clean:
            return ''
        return PROVIDER_ALIASES.get(clean.lower(), clean.lower().replace(' ', '_'))

    if isinstance(raw_links, list):
        cleaned: list[dict[str, str]] = []
        for entry in raw_links:
            if not isinstance(entry, dict):
                continue
            provider = resolve_provider(str(entry.get('provider', '')))
            url = str(entry.get('url', '')).strip()
            if provider and url:
                cleaned.append({'provider': provider, 'url': url})
        return cleaned

    if isinstance(raw_links, dict):
        # Backward compatibility: old records used {"Spotify":"https://..."} format.
        migrated: list[dict[str, str]] = []
        for key, value in raw_links.items():
            url = str(value or '').strip()
            provider = resolve_provider(str(key or ''))
            if provider and url:
                migrated.append({'provider': provider, 'url': url})
        return migrated
    return []


def is_allowed_domain(hostname: str, allowed_domains: list[str]) -> bool:
    return any(hostname == domain or hostname.endswith(f'.{domain}') for domain in allowed_domains)


def validate_links_or_422(links: list[dict[str, str]]) -> None:
    for item in links:
        provider = item['provider']
        url = item['url']
        link_option = LINK_OPTION_MAP.get(provider)
        if not link_option:
            raise HTTPException(status_code=422, detail=f'Unsupported link provider: {provider}')

        parsed = urlparse(url)
        if parsed.scheme not in {'http', 'https'} or not parsed.hostname:
            raise HTTPException(status_code=422, detail=f'Invalid URL for {provider}')

        allowed_domains = [str(domain).lower() for domain in link_option.get('domains', [])]
        if not is_allowed_domain(parsed.hostname.lower(), allowed_domains):
            raise HTTPException(status_code=422, detail=f'URL domain is not allowed for {provider}')


@app.get('/api/music')
def list_music(
    include_hidden: bool = Query(default=False),
    hidden_only: bool = Query(default=False),
) -> list[dict]:
    if hidden_only:
        query = 'SELECT * FROM music_memory WHERE hidden = 1 ORDER BY COALESCE(memory_time, created_at) DESC, id DESC'
    elif include_hidden:
        query = 'SELECT * FROM music_memory ORDER BY COALESCE(memory_time, created_at) DESC, id DESC'
    else:
        query = 'SELECT * FROM music_memory WHERE hidden = 0 ORDER BY COALESCE(memory_time, created_at) DESC, id DESC'
    rows = fetch_all(query)
    for row in rows:
        row['tags'] = json.loads(row.pop('tags_json') or '[]')
        row['links'] = normalise_link_entries(json.loads(row.pop('links_json') or '[]'))
        row['hidden'] = bool(row.get('hidden', 0))
        row['type'] = 'music'
    return rows


@app.post('/api/music')
def create_music(payload: MusicMemoryIn) -> dict:
    links = normalise_link_entries([item.model_dump() for item in payload.links])
    validate_links_or_422(links)
    new_id = execute(
        """
        INSERT INTO music_memory (
            icon_url, title, artist, memory_time, tags_json, color, short_desc, long_desc, links_json, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
        """,
        (
            payload.icon_url,
            payload.title,
            payload.artist,
            payload.memory_time,
            json.dumps(payload.tags, ensure_ascii=False),
            payload.color,
            payload.short_desc,
            payload.long_desc,
            json.dumps(links, ensure_ascii=False),
        ),
    )
    return {'ok': True, 'id': new_id}


@app.put('/api/music/{item_id}')
def update_music(item_id: int, payload: MusicMemoryIn) -> dict:
    existing = fetch_one('SELECT id FROM music_memory WHERE id = ?', (item_id,))
    if not existing:
        raise HTTPException(status_code=404, detail='Music memory not found.')
    links = normalise_link_entries([item.model_dump() for item in payload.links])
    validate_links_or_422(links)
    execute(
        """
        UPDATE music_memory
        SET icon_url = ?, title = ?, artist = ?, memory_time = ?, tags_json = ?,
            color = ?, short_desc = ?, long_desc = ?, links_json = ?, updated_at = datetime('now')
        WHERE id = ?
        """,
        (
            payload.icon_url,
            payload.title,
            payload.artist,
            payload.memory_time,
            json.dumps(payload.tags, ensure_ascii=False),
            payload.color,
            payload.short_desc,
            payload.long_desc,
            json.dumps(links, ensure_ascii=False),
            item_id,
        ),
    )
    return {'ok': True}


@app.delete('/api/music/{item_id}')
def delete_music(item_id: int) -> dict:
    existing = fetch_one('SELECT id FROM music_memory WHERE id = ?', (item_id,))
    if not existing:
        raise HTTPException(status_code=404, detail='Music memory not found.')
    execute('DELETE FROM music_memory WHERE id = ?', (item_id,))
    return {'ok': True}


@app.put('/api/music/{item_id}/hidden')
def update_music_hidden(item_id: int, payload: HiddenStatusIn) -> dict:
    existing = fetch_one('SELECT id FROM music_memory WHERE id = ?', (item_id,))
    if not existing:
        raise HTTPException(status_code=404, detail='Music memory not found.')
    execute(
        """
        UPDATE music_memory
        SET hidden = ?, updated_at = datetime('now')
        WHERE id = ?
        """,
        (1 if payload.hidden else 0, item_id),
    )
    return {'ok': True}


@app.get('/api/mind')
def list_mind(
    include_hidden: bool = Query(default=False),
    hidden_only: bool = Query(default=False),
) -> list[dict]:
    if hidden_only:
        query = 'SELECT * FROM cognition_memory WHERE hidden = 1 ORDER BY COALESCE(memory_time, created_at) DESC, id DESC'
    elif include_hidden:
        query = 'SELECT * FROM cognition_memory ORDER BY COALESCE(memory_time, created_at) DESC, id DESC'
    else:
        query = 'SELECT * FROM cognition_memory WHERE hidden = 0 ORDER BY COALESCE(memory_time, created_at) DESC, id DESC'
    rows = fetch_all(query)
    for row in rows:
        row['tags'] = json.loads(row.pop('tags_json') or '[]')
        row['hidden'] = bool(row.get('hidden', 0))
        row['type'] = 'mind'
    return rows


@app.post('/api/mind')
def create_mind(payload: MindMemoryIn) -> dict:
    new_id = execute(
        """
        INSERT INTO cognition_memory (
            title, memory_time, tags_json, color, short_desc, long_desc, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
        """,
        (
            payload.title,
            payload.memory_time,
            json.dumps(payload.tags, ensure_ascii=False),
            payload.color,
            payload.short_desc,
            payload.long_desc,
        ),
    )
    return {'ok': True, 'id': new_id}


@app.put('/api/mind/{item_id}')
def update_mind(item_id: int, payload: MindMemoryIn) -> dict:
    existing = fetch_one('SELECT id FROM cognition_memory WHERE id = ?', (item_id,))
    if not existing:
        raise HTTPException(status_code=404, detail='Cognitive memory not found.')
    execute(
        """
        UPDATE cognition_memory
        SET title = ?, memory_time = ?, tags_json = ?, color = ?, short_desc = ?,
            long_desc = ?, updated_at = datetime('now')
        WHERE id = ?
        """,
        (
            payload.title,
            payload.memory_time,
            json.dumps(payload.tags, ensure_ascii=False),
            payload.color,
            payload.short_desc,
            payload.long_desc,
            item_id,
        ),
    )
    return {'ok': True}


@app.delete('/api/mind/{item_id}')
def delete_mind(item_id: int) -> dict:
    existing = fetch_one('SELECT id FROM cognition_memory WHERE id = ?', (item_id,))
    if not existing:
        raise HTTPException(status_code=404, detail='Cognitive memory not found.')
    execute('DELETE FROM cognition_memory WHERE id = ?', (item_id,))
    return {'ok': True}


@app.put('/api/mind/{item_id}/hidden')
def update_mind_hidden(item_id: int, payload: HiddenStatusIn) -> dict:
    existing = fetch_one('SELECT id FROM cognition_memory WHERE id = ?', (item_id,))
    if not existing:
        raise HTTPException(status_code=404, detail='Cognitive memory not found.')
    execute(
        """
        UPDATE cognition_memory
        SET hidden = ?, updated_at = datetime('now')
        WHERE id = ?
        """,
        (1 if payload.hidden else 0, item_id),
    )
    return {'ok': True}


if __name__ == '__main__':
    uvicorn.run('main:app', host='0.0.0.0', port=8000, reload=True)
