from __future__ import annotations

import configparser
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent
CONFIG_FILE = BASE_DIR / 'config.cfg'
LOCALES_DIR = BASE_DIR / 'frontend' / 'static' / 'locales'
DEFAULT_APP_VERSION = 'dev'
DEFAULT_LOCALE = 'zh-Hans'
FALLBACK_LOCALES = ['zh-Hans', 'zh-Hant', 'en', 'ja', 'ko']
DEFAULT_BACKUP_INTERVAL_MINUTES = 30
DEFAULT_BACKUP_MAX_COUNT = 24


def _load_runtime_config() -> configparser.ConfigParser:
    parser = configparser.ConfigParser()
    parser.read(CONFIG_FILE, encoding='utf-8')
    return parser


def _scan_locale_files() -> list[str]:
    if not LOCALES_DIR.exists():
        return []
    found = [item.stem for item in LOCALES_DIR.glob('*.json') if item.is_file()]
    return sorted(set(found))


def _parse_csv_option(parser: configparser.ConfigParser, section: str, option: str) -> list[str]:
    if not parser.has_option(section, option):
        return []
    raw = parser.get(section, option, fallback='')
    if not raw:
        return []
    result: list[str] = []
    for token in raw.split(','):
        locale = token.strip()
        if locale and locale not in result:
            result.append(locale)
    return result


def _parse_locale_labels(parser: configparser.ConfigParser) -> dict[str, str]:
    if not parser.has_option('i18n', 'locale_labels'):
        return {}
    raw = parser.get('i18n', 'locale_labels', fallback='')
    if not raw:
        return {}
    labels: dict[str, str] = {}
    for token in raw.split(','):
        pair = token.strip()
        if not pair or ':' not in pair:
            continue
        locale, label = pair.split(':', 1)
        locale_key = locale.strip()
        label_text = label.strip()
        if locale_key and label_text:
            labels[locale_key] = label_text
    return labels


def _resolve_i18n_settings() -> tuple[list[str], str]:
    parser = _load_runtime_config()
    available = _scan_locale_files()
    if not available:
        available = FALLBACK_LOCALES[:]

    configured_default = parser.get('i18n', 'default_locale', fallback=DEFAULT_LOCALE).strip() or DEFAULT_LOCALE
    if configured_default in available:
        default_locale = configured_default
    elif DEFAULT_LOCALE in available:
        default_locale = DEFAULT_LOCALE
    else:
        default_locale = available[0]

    configured_locales = _parse_csv_option(parser, 'i18n', 'enabled_locales')
    if configured_locales:
        locales = [locale for locale in configured_locales if locale in available]
    else:
        locales = available[:]

    if default_locale not in locales:
        locales.insert(0, default_locale)

    unique_locales: list[str] = []
    for locale in locales:
        if locale not in unique_locales:
            unique_locales.append(locale)

    return unique_locales, default_locale


def _load_app_version() -> str:
    parser = _load_runtime_config()
    if parser.has_option('app', 'version'):
        return parser.get('app', 'version').strip() or DEFAULT_APP_VERSION
    if parser.has_option('DEFAULT', 'version'):
        return parser.get('DEFAULT', 'version').strip() or DEFAULT_APP_VERSION
    return DEFAULT_APP_VERSION


def get_app_version() -> str:
    return _load_app_version()


def get_supported_locales() -> list[str]:
    locales, _ = _resolve_i18n_settings()
    return locales


def get_default_locale() -> str:
    _, default_locale = _resolve_i18n_settings()
    return default_locale


def get_locale_labels() -> dict[str, str]:
    parser = _load_runtime_config()
    labels = _parse_locale_labels(parser)
    supported = set(get_supported_locales())
    return {locale: label for locale, label in labels.items() if locale in supported}


def _parse_int_option(
    parser: configparser.ConfigParser,
    section: str,
    option: str,
    fallback: int,
    *,
    min_value: int = 1,
) -> int:
    if not parser.has_option(section, option):
        return fallback
    try:
        value = parser.getint(section, option)
    except (TypeError, ValueError):
        return fallback
    return max(min_value, value)


def get_backup_interval_minutes() -> int:
    parser = _load_runtime_config()
    return _parse_int_option(
        parser,
        section='backup',
        option='interval_minutes',
        fallback=DEFAULT_BACKUP_INTERVAL_MINUTES,
        min_value=1,
    )


def get_backup_max_count() -> int:
    parser = _load_runtime_config()
    return _parse_int_option(
        parser,
        section='backup',
        option='max_backups',
        fallback=DEFAULT_BACKUP_MAX_COUNT,
        min_value=1,
    )


APP_VERSION = _load_app_version()

LINK_OPTIONS: list[dict[str, object]] = [
    {
        'provider': 'spotify',
        'label': 'Spotify',
        'domains': ['spotify.com', 'open.spotify.com'],
        'icon': 'https://cdn.simpleicons.org/spotify/1DB954',
    },
    {
        'provider': 'youtube',
        'label': 'YouTube',
        'domains': ['youtube.com', 'youtu.be', 'music.youtube.com'],
        'icon': 'https://cdn.simpleicons.org/youtube/FF0000',
    },
    {
        'provider': 'apple_music',
        'label': 'Apple Music',
        'domains': ['music.apple.com'],
        'icon': 'https://cdn.simpleicons.org/applemusic/FA57C1',
    },
    {
        'provider': 'netease_music',
        'label': 'NetEase Music',
        'domains': ['music.163.com'],
        'icon': 'https://cdn.simpleicons.org/neteasecloudmusic/D43C33',
    },
    {
        'provider': 'qq_music',
        'label': 'QQ Music',
        'domains': ['y.qq.com'],
        'icon': 'https://cdn.simpleicons.org/tencentqq/12B7F5',
    },
]

COLOR_PRESETS: list[dict[str, str]] = [
    {'name': 'Calm', 'value': '#7FB3D5'},
    {'name': 'Peace', 'value': '#8ED1C6'},
    {'name': 'Tender', 'value': '#F6B6C8'},
    {'name': 'Joy', 'value': '#FFD166'},
    {'name': 'Hope', 'value': '#87CEFA'},
    {'name': 'Healing', 'value': '#A3D977'},
    {'name': 'Romance', 'value': '#FF5C8A'},
    {'name': 'Warmth', 'value': '#FF9F1C'},
    {'name': 'Reflection', 'value': '#6B7A8F'},
    {'name': 'Freedom', 'value': '#3DDC97'},
    {'name': 'Passion', 'value': '#E63946'},
    {'name': 'Clarity', 'value': '#48CAE4'},
    {'name': 'Mystery', 'value': '#6A4C93'},
    {'name': 'Growth', 'value': '#6BAF45'},
    {'name': 'Nostalgia', 'value': '#B08968'},
]

COLOR_CONFIG: dict[str, object] = {
    'default_music': '#6d5efc',
    'default_mind': '#18a999',
    'allow_custom': True,
    'forbidden_colors': ['#ffffff', '#fff'],
    'presets': COLOR_PRESETS,
}
