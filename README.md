[English](./README.md) | [简体中文](./README.zh-CN.md)

# MemoSpace

## Overview
MemoSpace is a lightweight memory management app built with FastAPI, with two pages:
- `Music MemoSpace`: music memory management
- `Mind MemoSpace`: cognition/idea memory management

It supports multilingual UI, theme switching (Light/Dark/System), service status display, and version status display.

## Requirements
- Python 3.10+

## Setup & Run
Run the following commands inside `memory_space/`:

```bash
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
python backend/main.py
```

Then open:
- http://127.0.0.1:8000/music
- http://127.0.0.1:8000/mind

## Version Config
The app version is managed in `config.cfg`:

```cfg
[app]
version = demo 0.2.7
```

The displayed page version and the system status endpoint both read from this config.

## Project Structure
- `backend/`: API and data logic
- `frontend/`: pages and static assets
- `frontend/static/locales/`: localization files
- `config.cfg`: runtime configuration (e.g., version)
