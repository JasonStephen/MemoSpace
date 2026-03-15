from __future__ import annotations

import json
from urllib.parse import urlparse

from fastapi import APIRouter, HTTPException, Query

from config import LINK_OPTIONS
from db import execute, fetch_all, fetch_one
from schemas import HiddenStatusIn, MusicMemoryIn

router = APIRouter(prefix='/api/music/personal', tags=['personal-music'])

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


def _build_filter_clause(include_hidden: bool, hidden_only: bool) -> str:
    if hidden_only:
        return 'WHERE hidden = 1'
    if include_hidden:
        return ''
    return 'WHERE hidden = 0'


@router.get('')
def list_personal_music(
    include_hidden: bool = Query(default=False),
    hidden_only: bool = Query(default=False),
    include_public: bool = Query(default=True),
) -> list[dict]:
    # Shared data model: public and personal read from the same table.
    _ = include_public
    clause = _build_filter_clause(include_hidden, hidden_only)
    query = (
        'SELECT id, id AS source_id, icon_url, title, artist, memory_time, tags_json, color, '
        "short_desc, long_desc, links_json, hidden, created_at, updated_at, 'personal' AS scope "
        f'FROM personal_music_memory {clause} '
        "ORDER BY COALESCE(memory_time, created_at) DESC, id DESC"
    )

    rows = fetch_all(query)
    for row in rows:
        row['tags'] = json.loads(row.pop('tags_json') or '[]')
        row['links'] = normalise_link_entries(json.loads(row.pop('links_json') or '[]'))
        row['hidden'] = bool(row.get('hidden', 0))
        row['type'] = 'music'
    return rows


@router.post('')
def create_personal_music(payload: MusicMemoryIn) -> dict:
    links = normalise_link_entries([item.model_dump() for item in payload.links])
    validate_links_or_422(links)
    new_id = execute(
        """
        INSERT INTO personal_music_memory (
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


@router.put('/{item_id}')
def update_personal_music(item_id: int, payload: MusicMemoryIn) -> dict:
    existing = fetch_one('SELECT id FROM personal_music_memory WHERE id = ?', (item_id,))
    if not existing:
        raise HTTPException(status_code=404, detail='Music memory not found.')

    links = normalise_link_entries([item.model_dump() for item in payload.links])
    validate_links_or_422(links)
    execute(
        """
        UPDATE personal_music_memory
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


@router.delete('/{item_id}')
def delete_personal_music(item_id: int) -> dict:
    existing = fetch_one('SELECT id FROM personal_music_memory WHERE id = ?', (item_id,))
    if not existing:
        raise HTTPException(status_code=404, detail='Music memory not found.')
    execute('DELETE FROM personal_music_memory WHERE id = ?', (item_id,))
    return {'ok': True}


@router.put('/{item_id}/hidden')
def update_personal_music_hidden(item_id: int, payload: HiddenStatusIn) -> dict:
    existing = fetch_one('SELECT id FROM personal_music_memory WHERE id = ?', (item_id,))
    if not existing:
        raise HTTPException(status_code=404, detail='Music memory not found.')
    execute(
        """
        UPDATE personal_music_memory
        SET hidden = ?, updated_at = datetime('now')
        WHERE id = ?
        """,
        (1 if payload.hidden else 0, item_id),
    )
    return {'ok': True}
