from __future__ import annotations

import json

from fastapi import APIRouter, HTTPException, Query

from db import execute, fetch_all, fetch_one
from schemas import HiddenStatusIn, MindMemoryIn

router = APIRouter(prefix='/api/personal/mind', tags=['personal-mind'])


def _build_filter_clause(include_hidden: bool, hidden_only: bool) -> str:
    if hidden_only:
        return 'WHERE hidden = 1'
    if include_hidden:
        return ''
    return 'WHERE hidden = 0'


@router.get('')
def list_personal_mind(
    include_hidden: bool = Query(default=False),
    hidden_only: bool = Query(default=False),
    include_public: bool = Query(default=True),
) -> list[dict]:
    # Shared data model: public and personal read from the same table.
    _ = include_public
    clause = _build_filter_clause(include_hidden, hidden_only)
    query = (
        'SELECT id, id AS source_id, title, memory_time, tags_json, color, short_desc, long_desc, hidden, '
        "created_at, updated_at, 'personal' AS scope "
        f'FROM personal_cognition_memory {clause} '
        "ORDER BY COALESCE(memory_time, created_at) DESC, id DESC"
    )

    rows = fetch_all(query)
    for row in rows:
        row['tags'] = json.loads(row.pop('tags_json') or '[]')
        row['hidden'] = bool(row.get('hidden', 0))
        row['type'] = 'mind'
    return rows


@router.post('')
def create_personal_mind(payload: MindMemoryIn) -> dict:
    new_id = execute(
        """
        INSERT INTO personal_cognition_memory (
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


@router.put('/{item_id}')
def update_personal_mind(item_id: int, payload: MindMemoryIn) -> dict:
    existing = fetch_one('SELECT id FROM personal_cognition_memory WHERE id = ?', (item_id,))
    if not existing:
        raise HTTPException(status_code=404, detail='Cognitive memory not found.')
    execute(
        """
        UPDATE personal_cognition_memory
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


@router.delete('/{item_id}')
def delete_personal_mind(item_id: int) -> dict:
    existing = fetch_one('SELECT id FROM personal_cognition_memory WHERE id = ?', (item_id,))
    if not existing:
        raise HTTPException(status_code=404, detail='Cognitive memory not found.')
    execute('DELETE FROM personal_cognition_memory WHERE id = ?', (item_id,))
    return {'ok': True}


@router.put('/{item_id}/hidden')
def update_personal_mind_hidden(item_id: int, payload: HiddenStatusIn) -> dict:
    existing = fetch_one('SELECT id FROM personal_cognition_memory WHERE id = ?', (item_id,))
    if not existing:
        raise HTTPException(status_code=404, detail='Cognitive memory not found.')
    execute(
        """
        UPDATE personal_cognition_memory
        SET hidden = ?, updated_at = datetime('now')
        WHERE id = ?
        """,
        (1 if payload.hidden else 0, item_id),
    )
    return {'ok': True}
