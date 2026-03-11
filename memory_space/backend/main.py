from __future__ import annotations

import json
from pathlib import Path

import uvicorn
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from db import execute, fetch_all, fetch_one, init_db
from schemas import MindMemoryIn, MusicMemoryIn

BASE_DIR = Path(__file__).resolve().parent.parent
FRONTEND_DIR = BASE_DIR / 'frontend'
STATIC_DIR = FRONTEND_DIR / 'static'

app = FastAPI(title='Memory Space')
app.add_middleware(
    CORSMiddleware,
    allow_origins=['*'],
    allow_credentials=True,
    allow_methods=['*'],
    allow_headers=['*'],
)
app.mount('/static', StaticFiles(directory=STATIC_DIR), name='static')


@app.on_event('startup')
def startup_event() -> None:
    init_db()


@app.get('/')
def root() -> FileResponse:
    return FileResponse(FRONTEND_DIR / 'music.html')


@app.get('/music')
def music_page() -> FileResponse:
    return FileResponse(FRONTEND_DIR / 'music.html')


@app.get('/mind')
def mind_page() -> FileResponse:
    return FileResponse(FRONTEND_DIR / 'mind.html')


@app.get('/api/music')
def list_music() -> list[dict]:
    rows = fetch_all('SELECT * FROM music_memory ORDER BY COALESCE(memory_time, created_at) DESC, id DESC')
    for row in rows:
        row['tags'] = json.loads(row.pop('tags_json') or '[]')
        row['links'] = json.loads(row.pop('links_json') or '{}')
        row['type'] = 'music'
    return rows


@app.post('/api/music')
def create_music(payload: MusicMemoryIn) -> dict:
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
            json.dumps(payload.links, ensure_ascii=False),
        ),
    )
    return {'ok': True, 'id': new_id}


@app.put('/api/music/{item_id}')
def update_music(item_id: int, payload: MusicMemoryIn) -> dict:
    existing = fetch_one('SELECT id FROM music_memory WHERE id = ?', (item_id,))
    if not existing:
        raise HTTPException(status_code=404, detail='Music memory not found.')
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
            json.dumps(payload.links, ensure_ascii=False),
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


@app.get('/api/mind')
def list_mind() -> list[dict]:
    rows = fetch_all('SELECT * FROM cognition_memory ORDER BY COALESCE(memory_time, created_at) DESC, id DESC')
    for row in rows:
        row['tags'] = json.loads(row.pop('tags_json') or '[]')
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


if __name__ == '__main__':
    uvicorn.run('main:app', host='0.0.0.0', port=8000, reload=True)
