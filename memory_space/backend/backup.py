from __future__ import annotations

import logging
import sqlite3
import threading
from datetime import datetime
from pathlib import Path

from db import DATA_DIR, DB_PATH

logger = logging.getLogger(__name__)

BACKUP_DIR = DATA_DIR / 'backups'
BACKUP_DIR.mkdir(exist_ok=True)


def _backup_filename() -> str:
    timestamp = datetime.now().strftime('%Y%m%d%H%M%S')
    return f'{timestamp}-{DB_PATH.stem}.bak'


def _list_backups() -> list[Path]:
    pattern = f'*-{DB_PATH.stem}.bak'
    return sorted(BACKUP_DIR.glob(pattern), key=lambda item: item.name, reverse=True)


def rotate_backups(max_backups: int) -> None:
    backups = _list_backups()
    for old_file in backups[max_backups:]:
        try:
            old_file.unlink(missing_ok=True)
        except OSError as exc:
            logger.warning('failed to remove old backup %s: %s', old_file, exc)


def create_db_backup(max_backups: int) -> Path | None:
    if not DB_PATH.exists():
        logger.warning('skip backup: database file not found at %s', DB_PATH)
        return None

    backup_path = BACKUP_DIR / _backup_filename()
    with sqlite3.connect(DB_PATH) as source_conn, sqlite3.connect(backup_path) as target_conn:
        source_conn.backup(target_conn)

    rotate_backups(max_backups=max_backups)
    return backup_path


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
