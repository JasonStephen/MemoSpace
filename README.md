<p align="center">
  <img
    src="./memory_space/frontend/static/img/Icon.svg"
    alt="MemoSpace Logo"
    width="76"
    style="background:#ffffff;border-radius:14px;padding:8px;"
  />
</p>

<p align="center">
  <a href="./README.md">English</a> | <a href="./README.zh-CN.md">简体中文</a>
</p>

# MemoSpace

A lightweight memory space app built with FastAPI, focused on two core pages:

- `Music MemoSpace` for music memories
- `Mind MemoSpace` for thoughts and idea memories

## Features

- Multi-language UI
- Theme mode: `Light / Dark / System`
- Theme presets and smooth theme transitions
- Font setting in web UI (local system fonts with fallback)
- Service health + version sync status
- Hidden space for cards
- Config-driven runtime behavior (`config.cfg`)

## Tech Stack

- Backend: `FastAPI`
- Frontend: `HTML + CSS + Vanilla JavaScript`
- Data: `SQLite`

## Quick Start

Run inside `memory_space/`:

```bash
python -m venv .venv
.venv\Scripts\activate
# macOS/Linux: source .venv/bin/activate
pip install -r requirements.txt
python backend/main.py
```

Open in browser:

- `http://127.0.0.1:8000/music`
- `http://127.0.0.1:8000/mind`

## Configuration

Main runtime config is in [`memory_space/config.cfg`](./memory_space/config.cfg):

```cfg
[app]
version = demo 0.5.0
custom_font_family = "Microsoft YaHei"
```

## Project Structure

- `memory_space/backend/`: API and business logic
- `memory_space/frontend/`: pages and static assets
- `memory_space/frontend/static/locales/`: localization files
- `memory_space/frontend/static/img/`: images and logo assets
- `memory_space/config.cfg`: runtime configuration

## License

No license specified yet.
