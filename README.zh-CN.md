<p align="center">
  <img
    src="./memory_space/frontend/static/img/MemoSpace 1920_500_TD.jpg"
    alt="MemoSpace Logo"
    width=auto
    style="border-radius:16px"
  />
</p>

<p align="center">
  <a href="./README.md">English</a> | <a href="./README.zh-CN.md">简体中文</a>
</p>

# MemoSpace 记忆空间

一个基于 FastAPI 的轻量化记忆管理应用，核心包含两个页面：

- `Music MemoSpace`：音乐记忆管理
- `Mind MemoSpace`：想法与认知记忆管理

## 功能特性

- 多语言界面
- 主题模式：`浅色 / 深色 / 跟随系统`
- 主题预设与平滑主题切换
- 网页内字体设置（本机字体 + 回退机制）
- 服务健康状态与版本同步状态
- 卡片隐藏空间
- 运行时配置集中在 `config.cfg`

## 技术栈

- 后端：`FastAPI`
- 前端：`HTML + CSS + Vanilla JavaScript`
- 数据：`SQLite`

## 快速开始

在 `memory_space/` 目录执行：

```bash
python -m venv .venv
.venv\Scripts\activate
# macOS/Linux: source .venv/bin/activate
pip install -r requirements.txt
python backend/main.py
```

启动后访问：

- `http://127.0.0.1:8000/music`
- `http://127.0.0.1:8000/mind`

## 配置说明

主要运行配置位于 [`memory_space/config.cfg`](./memory_space/config.cfg)：

```cfg
[app]
version = demo 0.5.0
custom_font_family = "Microsoft YaHei"
```

## 项目结构

- `memory_space/backend/`：接口与业务逻辑
- `memory_space/frontend/`：页面与静态资源
- `memory_space/frontend/static/locales/`：本地化文案
- `memory_space/frontend/static/img/`：图片与 Logo 资源
- `memory_space/config.cfg`：运行时配置

## License

当前尚未指定正式许可证。
