[English](./README.md) | [简体中文](./README.zh-CN.md)

# MemoSpace 记忆空间

## 项目简介
MemoSpace 是一个基于 FastAPI 的轻量记忆管理应用，包含两个页面：
- `Music MemoSpace`：音乐记忆管理
- `Mind MemoSpace`：认知/想法记忆管理

支持多语言界面、主题切换（白天/黑夜/跟随系统）、服务状态展示与版本状态展示。

## 环境要求
- Python 3.10+

## 安装与运行
在 `memory_space/` 目录下执行：

```bash
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
python backend/main.py
```

启动后访问：
- http://127.0.0.1:8000/music
- http://127.0.0.1:8000/mind

## 版本配置
项目版本号由配置文件 `config.cfg` 管理：

```cfg
[app]
version = demo 0.2.7
```

当前页面展示的版本与系统状态接口都会读取该配置。

## 主要目录
- `backend/`：后端接口与数据逻辑
- `frontend/`：页面与静态资源
- `frontend/static/locales/`：多语言文案
- `config.cfg`：项目运行配置（如版本号）
