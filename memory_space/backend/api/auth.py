from __future__ import annotations

from fastapi import APIRouter, HTTPException, Request, Response

from auth import (
    SESSION_COOKIE_NAME,
    authenticate_user,
    create_session,
    create_single_account,
    delete_session,
    delete_user_and_sessions,
    get_current_user_from_request,
    get_registered_user,
    has_registered_account,
    verify_password,
)
from schemas import LoginIn, RegisterIn, UnregisterIn

router = APIRouter(prefix='/api/auth', tags=['auth'])


def _set_session_cookie(response: Response, token: str) -> None:
    response.set_cookie(
        key=SESSION_COOKIE_NAME,
        value=token,
        httponly=True,
        samesite='lax',
        secure=False,
        path='/',
    )


def _clear_session_cookie(response: Response) -> None:
    response.delete_cookie(key=SESSION_COOKIE_NAME, path='/')


@router.get('/status')
def auth_status(request: Request) -> dict[str, object]:
    user = get_current_user_from_request(request)
    return {
        'authenticated': user is not None,
        'has_account': has_registered_account(),
        'username': user.username if user else '',
    }


@router.post('/register')
def register(payload: RegisterIn, response: Response) -> dict[str, object]:
    created = create_single_account(payload.username, payload.password)
    token = create_session(int(created['id']))
    _set_session_cookie(response, token)
    return {'ok': True, 'username': created['username']}


@router.post('/login')
def login(payload: LoginIn, response: Response) -> dict[str, object]:
    user = authenticate_user(payload.username, payload.password)
    token = create_session(user.id)
    _set_session_cookie(response, token)
    return {'ok': True, 'username': user.username}


@router.post('/logout')
def logout(request: Request, response: Response) -> dict[str, object]:
    token = request.cookies.get(SESSION_COOKIE_NAME, '').strip()
    if token:
        delete_session(token)
    _clear_session_cookie(response)
    return {'ok': True}


@router.post('/unregister')
def unregister(payload: UnregisterIn, request: Request, response: Response) -> dict[str, object]:
    current_user = get_current_user_from_request(request)
    if not current_user:
        raise HTTPException(status_code=401, detail='Authentication required.')

    registered = get_registered_user()
    if not registered:
        raise HTTPException(status_code=404, detail='Account not found.')

    if not verify_password(payload.confirm_password, str(registered['password_hash'])):
        raise HTTPException(status_code=401, detail='Password confirmation failed.')

    delete_user_and_sessions(int(current_user.id))
    _clear_session_cookie(response)
    return {'ok': True}
