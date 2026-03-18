from __future__ import annotations

import os
import logging
import sqlite3
import threading
import time
from datetime import datetime
from pathlib import Path

from db import DATA_DIR, DB_PATH

logger = logging.getLogger(__name__)

BACKUP_DIR = DATA_DIR / 'backups'
BACKUP_DIR.mkdir(exist_ok=True)
BACKUP_LOCK_FILE = BACKUP_DIR / f'{DB_PATH.stem}.backup.lock'
BACKUP_LOCK_STALE_SECONDS = 2 * 60 * 60


def _backup_filename() -> str:
    timestamp = datetime.now().strftime('%Y%m%d%H%M%S')
    return f'{timestamp}-{DB_PATH.stem}.bak'


def _list_backups() -> list[Path]:
    pattern = f'*-{DB_PATH.stem}.bak'
    return sorted(BACKUP_DIR.glob(pattern), key=lambda item: item.name, reverse=True)


def _format_os_error(exc: OSError | None) -> str:
    if exc is None:
        return 'none'
    return (
        f'type={type(exc).__name__} '
        f'errno={getattr(exc, "errno", None)} '
        f'winerror={getattr(exc, "winerror", None)} '
        f'msg={exc}'
    )


def _remove_with_retry(
    path: Path,
    retries: int = 3,
    delay_seconds: float = 0.25,
) -> tuple[bool, OSError | None, int]:
    last_error: OSError | None = None
    for attempt in range(retries):
        try:
            path.unlink(missing_ok=True)
            return True, None, attempt + 1
        except OSError as exc:
            last_error = exc
            logger.debug(
                'backup remove retry %s/%s failed for %s: %s',
                attempt + 1,
                retries,
                path,
                exc,
            )
            if attempt >= retries - 1:
                break
            time.sleep(delay_seconds * (attempt + 1))
    if last_error is not None:
        logger.debug(
            'backup remove final failure for %s: %s',
            path,
            _format_os_error(last_error),
        )
    return False, last_error, retries


def _backup_file_debug_info(path: Path) -> str:
    exists = path.exists()
    if not exists:
        return f'exists={exists}'
    try:
        stat = path.stat()
        readonly = not bool(stat.st_mode & 0o200)
        return (
            f'exists={exists} size={stat.st_size} '
            f'mtime={int(stat.st_mtime)} readonly={readonly}'
        )
    except OSError as exc:
        return f'exists={exists} stat_error={type(exc).__name__}:{exc}'


def _backup_lock_debug_info() -> str:
    exists = BACKUP_LOCK_FILE.exists()
    if not exists:
        return f'lock_exists={exists}'
    try:
        stat = BACKUP_LOCK_FILE.stat()
    except OSError as exc:
        return f'lock_exists={exists} lock_stat_error={type(exc).__name__}:{exc}'
    try:
        content = BACKUP_LOCK_FILE.read_text(encoding='utf-8').strip()
        content = content or '<empty>'
    except OSError as exc:
        content = f'<read_error:{type(exc).__name__}:{exc}>'
    return (
        f'lock_exists={exists} lock_size={stat.st_size} '
        f'lock_mtime={int(stat.st_mtime)} lock_content="{content}"'
    )


def _try_acquire_backup_lock() -> tuple[int | None, bool]:
    if BACKUP_LOCK_FILE.exists():
        try:
            age_seconds = time.time() - BACKUP_LOCK_FILE.stat().st_mtime
            if age_seconds > BACKUP_LOCK_STALE_SECONDS:
                _remove_with_retry(BACKUP_LOCK_FILE, retries=2, delay_seconds=0.15)
        except OSError:
            pass

    flags = os.O_CREAT | os.O_EXCL | os.O_WRONLY
    try:
        fd = os.open(str(BACKUP_LOCK_FILE), flags)
    except FileExistsError:
        return None, False
    os.write(fd, f'pid={os.getpid()} time={int(time.time())}\n'.encode('utf-8'))
    return fd, True


def _release_backup_lock(fd: int | None) -> None:
    if fd is None:
        return
    try:
        os.close(fd)
    except OSError:
        pass
    _remove_with_retry(BACKUP_LOCK_FILE, retries=2, delay_seconds=0.1)


def rotate_backups(max_backups: int) -> None:
    keep = max(1, max_backups)
    backups = _list_backups()
    # Keep only the latest backups and remove all remaining old files.
    for old_file in backups[keep:]:
        removed, last_error, attempts = _remove_with_retry(old_file)
        if not removed:
            logger.warning(
                (
                    'failed to remove old backup %s: '
                    'pid=%s thread=%s keep=%s total_backups=%s '
                    'attempts=%s file_info=(%s) error=(%s) lock_info=(%s)'
                ),
                old_file,
                os.getpid(),
                threading.current_thread().name,
                keep,
                len(backups),
                attempts,
                _backup_file_debug_info(old_file),
                _format_os_error(last_error),
                _backup_lock_debug_info(),
            )


def create_db_backup(max_backups: int) -> Path | None:
    if not DB_PATH.exists():
        logger.warning('skip backup: database file not found at %s', DB_PATH)
        return None

    lock_fd, acquired = _try_acquire_backup_lock()
    if not acquired:
        logger.info('skip backup: another process is handling backup rotation')
        return None

    try:
        backup_path = BACKUP_DIR / _backup_filename()
        with sqlite3.connect(DB_PATH) as source_conn, sqlite3.connect(backup_path) as target_conn:
            source_conn.backup(target_conn)
        rotate_backups(max_backups=max_backups)
        return backup_path
    finally:
        _release_backup_lock(lock_fd)


class BackupScheduler:
    def __init__(self, interval_minutes: int, max_backups: int) -> None:
        self.interval_seconds = max(1, interval_minutes) * 60
        self.max_backups = max(1, max_backups)
        self._stop_event = threading.Event()
        self._thread: threading.Thread | None = None

    def start(self) -> None:
        if self._thread and self._thread.is_alive():
            return
        self._stop_event.clear()
        self._thread = threading.Thread(target=self._run, name='db-backup-scheduler', daemon=True)
        self._thread.start()

    def stop(self) -> None:
        self._stop_event.set()
        if self._thread and self._thread.is_alive():
            self._thread.join(timeout=2)

    def backup_now(self) -> Path | None:
        return create_db_backup(max_backups=self.max_backups)

    def _run(self) -> None:
        while not self._stop_event.wait(self.interval_seconds):
            try:
                backup_path = self.backup_now()
                if backup_path:
                    logger.info('database backup created: %s', backup_path)
            except Exception as exc:  # pragma: no cover - defensive logging path
                logger.exception('database backup failed: %s', exc)
