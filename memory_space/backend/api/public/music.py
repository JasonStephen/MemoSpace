from __future__ import annotations

import json

from fastapi import APIRouter, Query

from db import fetch_all

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
        row['tags'] = json.loads(row.pop('tags_json') or '[]')
        row['links'] = normalise_link_entries(json.loads(row.pop('links_json') or '[]'))
        row['hidden'] = bool(row.get('hidden', 0))
        row['type'] = 'music'
        row['scope'] = 'public'
    return rows
