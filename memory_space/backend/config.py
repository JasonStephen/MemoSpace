from __future__ import annotations

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
    {'name': 'Indigo', 'value': '#6d5efc'},
    {'name': 'Teal', 'value': '#18a999'},
    {'name': 'Coral', 'value': '#ff6f61'},
    {'name': 'Saffron', 'value': '#f4b400'},
    {'name': 'Ocean', 'value': '#1e88e5'},
    {'name': 'Forest', 'value': '#2e7d32'},
    {'name': 'Rose', 'value': '#e91e63'},
    {'name': 'Amber', 'value': '#ff8f00'},
    {'name': 'Slate', 'value': '#546e7a'},
    {'name': 'Mint', 'value': '#00b894'},
    {'name': 'Ruby', 'value': '#d63031'},
    {'name': 'Sky', 'value': '#00a8ff'},
    {'name': 'Violet', 'value': '#8e44ad'},
    {'name': 'Lime', 'value': '#7cb342'},
    {'name': 'Copper', 'value': '#b87333'},
]

COLOR_CONFIG: dict[str, object] = {
    'default_music': '#6d5efc',
    'default_mind': '#18a999',
    'allow_custom': True,
    'forbidden_colors': ['#ffffff', '#fff'],
    'presets': COLOR_PRESETS,
}
