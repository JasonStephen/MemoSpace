from __future__ import annotations

import atexit
import mimetypes
import re
from pathlib import Path

import uvicorn
from fastapi import Depends, FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse, RedirectResponse
from fastapi.staticfiles import StaticFiles

from api.auth import router as auth_router
from api.personal.mind import router as personal_mind_router
from api.personal.music import router as personal_music_router
from api.public.mind import router as public_mind_router
from api.public.music import router as public_music_router
from auth import get_current_user_from_request, has_registered_account, require_auth_api
from backup import BackupScheduler
from config import (
    COLOR_CONFIG,
    LINK_OPTIONS,
    get_app_font_family,
    get_app_version,
    get_backup_interval_minutes,
    get_backup_max_count,
    get_default_locale,
    get_locale_flags,
    get_locale_labels,
    get_supported_locales,
    get_theme_config,
)
from db import init_db

BASE_DIR = Path(__file__).resolve().parent.parent
FRONTEND_DIR = BASE_DIR / 'frontend'
STATIC_DIR = FRONTEND_DIR / 'static'

mimetypes.add_type('image/svg+xml', '.svg')
mimetypes.add_type('image/svg+xml', '.svgz')

app = FastAPI(title='MemoSpace')
app.add_middleware(
    CORSMiddleware,
    allow_origins=['*'],
    allow_credentials=True,
    allow_methods=['*'],
    allow_headers=['*'],
)
app.mount('/static', StaticFiles(directory=STATIC_DIR), name='static')

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
    page_paths = {
        '/',
        '/music',
        '/mind',
        '/music/public',
        '/mind/public',
        '/music/personal',
        '/mind/personal',
        '/public/music',
        '/public/mind',
        '/personal/music',
        '/personal/mind',
        '/auth/login',
        '/auth/register',
    }
    if path in page_paths or path.startswith('/static/'):
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
    html = re.sub(r'(/static/css/auth\.css\?v=)[^"]+', rf'\g<1>{app_version}', html, count=1)
    html = re.sub(r'(/static/js/app\.js\?v=)[^"]+', rf'\g<1>{app_version}', html, count=1)
    html = re.sub(r'(/static/js/auth\.js\?v=)[^"]+', rf'\g<1>{app_version}', html, count=1)
    return HTMLResponse(content=html)


def ensure_personal_access(request: Request) -> RedirectResponse | None:
    current_user = get_current_user_from_request(request)
    if current_user:
        return None
    target = '/auth/login' if has_registered_account() else '/auth/register'
    return RedirectResponse(url=target, status_code=302)


@app.get('/')
def root(request: Request):
    redirect = ensure_personal_access(request)
    if redirect:
        return redirect
    return render_page('personal/music.html')


@app.get('/music')
def music_page_legacy(request: Request):
    redirect = ensure_personal_access(request)
    if redirect:
        return redirect
    return render_page('personal/music.html')


@app.get('/mind')
def mind_page_legacy(request: Request):
    redirect = ensure_personal_access(request)
    if redirect:
        return redirect
    return render_page('personal/mind.html')


@app.get('/music/public')
def public_music_page() -> HTMLResponse:
    return render_page('public/music.html')


@app.get('/mind/public')
def public_mind_page() -> HTMLResponse:
    return render_page('public/mind.html')


@app.get('/music/personal')
def personal_music_page(request: Request):
    redirect = ensure_personal_access(request)
    if redirect:
        return redirect
    return render_page('personal/music.html')


@app.get('/mind/personal')
def personal_mind_page(request: Request):
    redirect = ensure_personal_access(request)
    if redirect:
        return redirect
    return render_page('personal/mind.html')



@app.get('/public/music')
def public_music_page_legacy() -> RedirectResponse:
    return RedirectResponse(url='/music/public', status_code=302)


@app.get('/public/mind')
def public_mind_page_legacy() -> RedirectResponse:
    return RedirectResponse(url='/mind/public', status_code=302)


@app.get('/personal/music')
def personal_music_page_legacy() -> RedirectResponse:
    return RedirectResponse(url='/music/personal', status_code=302)


@app.get('/personal/mind')
def personal_mind_page_legacy() -> RedirectResponse:
    return RedirectResponse(url='/mind/personal', status_code=302)

@app.get('/auth/login')
def login_page(request: Request):
    if get_current_user_from_request(request):
        return RedirectResponse(url='/music/personal', status_code=302)
    if not has_registered_account():
        return RedirectResponse(url='/auth/register', status_code=302)
    return render_page('auth/login.html')


@app.get('/auth/register')
def register_page(request: Request):
    if get_current_user_from_request(request):
        return RedirectResponse(url='/music/personal', status_code=302)
    if has_registered_account():
        return RedirectResponse(url='/auth/login', status_code=302)
    return render_page('auth/register.html')


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


app.include_router(auth_router)
app.include_router(public_music_router)
app.include_router(public_mind_router)
app.include_router(personal_music_router, dependencies=[Depends(require_auth_api)])
app.include_router(personal_mind_router, dependencies=[Depends(require_auth_api)])


if __name__ == '__main__':
    uvicorn.run('main:app', host='0.0.0.0', port=8000, reload=True)
