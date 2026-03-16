from __future__ import annotations

import json

from fastapi import APIRouter, Body, Query

from db import fetch_all
from music_cover import resolve_cover_candidates, resolve_music_metadata, resolve_netease_link

router = APIRouter(prefix='/api/music/public', tags=['public-music'])


def normalise_link_entries(raw_links: object) -> list[dict[str, str]]:
    if isinstance(raw_links, list):
        cleaned: list[dict[str, str]] = []
        for entry in raw_links:
            if not isinstance(entry, dict):
                continue
            provider = str(entry.get('provider', '')).strip()
            url = str(entry.get('url', '')).strip()
            if provider and url:
                cleaned.append({'provider': provider, 'url': url})
        return cleaned

    if isinstance(raw_links, dict):
        migrated: list[dict[str, str]] = []
        for key, value in raw_links.items():
            provider = str(key or '').strip().lower().replace(' ', '_')
            url = str(value or '').strip()
            if provider and url:
                migrated.append({'provider': provider, 'url': url})
        return migrated
    return []


def _parse_icon_candidates(raw_icon_url: object) -> list[str]:
    text = str(raw_icon_url or '').strip()
    if not text:
        return []
    try:
        payload = json.loads(text)
    except json.JSONDecodeError:
        payload = None
    if isinstance(payload, list):
        result: list[str] = []
        seen: set[str] = set()
        for value in payload:
            url = str(value or '').strip()
            if not url or url in seen:
                continue
            seen.add(url)
            result.append(url)
        return result
    return [text]


@router.get('')
def list_public_music(
    include_hidden: bool = Query(default=False),
    hidden_only: bool = Query(default=False),
) -> list[dict]:
    if hidden_only:
        query = (
            'SELECT * FROM personal_music_memory '
            "WHERE hidden = 1 ORDER BY COALESCE(memory_time, created_at) DESC, id DESC"
        )
    elif include_hidden:
        query = 'SELECT * FROM personal_music_memory ORDER BY COALESCE(memory_time, created_at) DESC, id DESC'
    else:
        query = (
            'SELECT * FROM personal_music_memory '
            "WHERE hidden = 0 ORDER BY COALESCE(memory_time, created_at) DESC, id DESC"
        )
    rows = fetch_all(query)
    for row in rows:
        row['source_id'] = row['id']
        candidates = _parse_icon_candidates(row.get('icon_url'))
        row['icon_candidates'] = candidates
        row['icon_url'] = candidates[0] if candidates else ''
        row['tags'] = json.loads(row.pop('tags_json') or '[]')
        row['links'] = normalise_link_entries(json.loads(row.pop('links_json') or '[]'))
        row['hidden'] = bool(row.get('hidden', 0))
        row['type'] = 'music'
        row['scope'] = 'public'
    return rows


@router.post('/cover/resolve')
def resolve_music_cover(payload: dict | None = Body(default=None)) -> dict[str, object]:
    body = payload or {}
    links = normalise_link_entries(body.get('links'))
    preferred_icon_url = str(body.get('preferred_icon_url', '')).strip()
    candidates = resolve_cover_candidates(links, preferred_icon_url)
    return {
        'primary': candidates[0] if candidates else '',
        'candidates': candidates,
    }


@router.post('/metadata/resolve')
def resolve_music_meta(payload: dict | None = Body(default=None)) -> dict[str, object]:
    body = payload or {}
    links = normalise_link_entries(body.get('links'))
    return resolve_music_metadata(links)


@router.post('/netease/resolve')
def resolve_netease_short_link(payload: dict | None = Body(default=None)) -> dict[str, str]:
    body = payload or {}
    raw_url = str(body.get('url', '')).strip()
    return resolve_netease_link(raw_url)
