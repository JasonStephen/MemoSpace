from __future__ import annotations

import json

from fastapi import APIRouter, Query

from db import fetch_all

router = APIRouter(prefix='/api/public/mind', tags=['public-mind'])


@router.get('')
def list_public_mind(
    include_hidden: bool = Query(default=False),
    hidden_only: bool = Query(default=False),
) -> list[dict]:
    if hidden_only:
        query = (
            'SELECT * FROM personal_cognition_memory '
            "WHERE hidden = 1 ORDER BY COALESCE(memory_time, created_at) DESC, id DESC"
        )
    elif include_hidden:
        query = 'SELECT * FROM personal_cognition_memory ORDER BY COALESCE(memory_time, created_at) DESC, id DESC'
    else:
        query = (
            'SELECT * FROM personal_cognition_memory '
            "WHERE hidden = 0 ORDER BY COALESCE(memory_time, created_at) DESC, id DESC"
        )
    rows = fetch_all(query)
    for row in rows:
        row['source_id'] = row['id']
        row['tags'] = json.loads(row.pop('tags_json') or '[]')
        row['hidden'] = bool(row.get('hidden', 0))
        row['type'] = 'mind'
        row['scope'] = 'public'
    return rows
