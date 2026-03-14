from __future__ import annotations

import hashlib
import hmac
import secrets
from dataclasses import dataclass

from fastapi import HTTPException, Request, status

from db import execute, fetch_one

SESSION_COOKIE_NAME = 'memspace_session'


@dataclass
class AuthUser:
    id: int
    username: str


def _hash_password(password: str, salt_hex: str) -> str:
    salt = bytes.fromhex(salt_hex)
    digest = hashlib.pbkdf2_hmac('sha256', password.encode('utf-8'), salt, 200_000)
    return digest.hex()


def make_password_hash(password: str) -> str:
    salt_hex = secrets.token_hex(16)
    return f'{salt_hex}${_hash_password(password, salt_hex)}'


def verify_password(password: str, stored_hash: str) -> bool:
    if '$' not in stored_hash:
        return False
    salt_hex, digest_hex = stored_hash.split('$', 1)
    try:
        expected = _hash_password(password, salt_hex)
    except ValueError:
        return False
    return hmac.compare_digest(expected, digest_hex)


def has_registered_account() -> bool:
    row = fetch_one('SELECT id FROM app_user LIMIT 1')
    return row is not None


def get_registered_user() -> dict | None:
    return fetch_one('SELECT id, username, password_hash FROM app_user LIMIT 1')


def create_single_account(username: str, password: str) -> dict:
    existing = get_registered_user()
    if existing:
        raise HTTPException(status_code=409, detail='Account already exists.')

    if not username.strip() or not password:
        raise HTTPException(status_code=422, detail='Username and password are required.')

    user_id = execute(
        'INSERT INTO app_user (username, password_hash, updated_at) VALUES (?, ?, datetime(\'now\'))',
        (username.strip(), make_password_hash(password)),
    )
    return {'id': user_id, 'username': username.strip()}


def authenticate_user(username: str, password: str) -> AuthUser:
    user = get_registered_user()
    if not user:
        raise HTTPException(status_code=404, detail='No account exists. Please register first.')

    if user['username'] != username.strip() or not verify_password(password, user['password_hash']):
        raise HTTPException(status_code=401, detail='Invalid username or password.')

    return AuthUser(id=int(user['id']), username=str(user['username']))


def create_session(user_id: int) -> str:
    token = secrets.token_urlsafe(48)
    execute(
        'INSERT INTO user_session (token, user_id, created_at) VALUES (?, ?, datetime(\'now\'))',
        (token, user_id),
    )
    return token


def delete_session(token: str) -> None:
    execute('DELETE FROM user_session WHERE token = ?', (token,))


def delete_user_and_sessions(user_id: int) -> None:
    execute('DELETE FROM user_session WHERE user_id = ?', (user_id,))
    execute('DELETE FROM app_user WHERE id = ?', (user_id,))


def get_current_user_from_request(request: Request) -> AuthUser | None:
    token = request.cookies.get(SESSION_COOKIE_NAME, '').strip()
    if not token:
        return None

    row = fetch_one(
        """
        SELECT u.id, u.username
        FROM user_session s
        JOIN app_user u ON u.id = s.user_id
        WHERE s.token = ?
        """,
        (token,),
    )
    if not row:
        return None

    return AuthUser(id=int(row['id']), username=str(row['username']))


def require_auth_api(request: Request) -> AuthUser:
    user = get_current_user_from_request(request)
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail='Authentication required.')
    return user
