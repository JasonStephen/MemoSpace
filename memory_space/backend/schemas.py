from __future__ import annotations

from pydantic import BaseModel, Field


class LinkEntryIn(BaseModel):
    provider: str = ''
    url: str = ''


class MusicMemoryIn(BaseModel):
    icon_url: str = ''
    title: str = ''
    artist: str = ''
    memory_time: str = ''
    tags: list[str] = Field(default_factory=list)
    color: str = '#6d5efc'
    short_desc: str = ''
    long_desc: str = ''
    links: list[LinkEntryIn] = Field(default_factory=list)


class MindMemoryIn(BaseModel):
    title: str = ''
    memory_time: str = ''
    tags: list[str] = Field(default_factory=list)
    color: str = '#18a999'
    short_desc: str = ''
    long_desc: str = ''


class HiddenStatusIn(BaseModel):
    hidden: bool = False
