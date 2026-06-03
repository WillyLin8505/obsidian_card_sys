#!/usr/bin/env python3
"""
Card Box Note Management — 新機器一鍵安裝腳本
用法：從 repo 根目錄執行  python3 setup.py
"""

import os
import platform
import secrets
import shutil
import stat
import subprocess
import sys
import urllib.request
from pathlib import Path

ROOT = Path(__file__).parent.resolve()
LOCAL_SERVER = ROOT / "local-server"
LLAMA_SEARCH = ROOT / "llama-search"
VENV_DIR = LLAMA_SEARCH / ".venv-wsl"
CLOUDFLARED_BIN = LOCAL_SERVER / "bin" / "cloudflared"
ENV_FILE = LOCAL_SERVER / ".env"
ENV_EXAMPLE = LOCAL_SERVER / ".env.example"

# ── helpers ──────────────────────────────────────────────────────────────────

GREEN  = "\033[92m"
YELLOW = "\033[93m"
RED    = "\033[91m"
CYAN   = "\033[96m"
RESET  = "\033[0m"
BOLD   = "\033[1m"

def info(msg):  print(f"{GREEN}✔{RESET}  {msg}")
def warn(msg):  print(f"{YELLOW}⚠{RESET}  {msg}")
def error(msg): print(f"{RED}✘{RESET}  {msg}")
def step(msg):  print(f"\n{BOLD}{CYAN}▶ {msg}{RESET}")
def ask(prompt, default=""):
    hint = f" [{default}]" if default else ""
    val = input(f"  {prompt}{hint}: ").strip()
    return val or default

def run(cmd, cwd=None, check=True):
    result = subprocess.run(cmd, shell=True, cwd=cwd or ROOT, text=True,
                            capture_output=True)
    if check and result.returncode != 0:
        error(f"指令失敗: {cmd}")
        print(result.stderr[-2000:])
        sys.exit(1)
    return result

def check_cmd(name):
    if not shutil.which(name):
        error(f"找不到 {name}，請先安裝後再執行此腳本")
        sys.exit(1)

# ── steps ────────────────────────────────────────────────────────────────────

def check_prerequisites():
    step("檢查環境需求")
    for cmd in ("node", "npm", "python3", "git"):
        check_cmd(cmd)
        ver = run(f"{cmd} --version", check=False).stdout.strip().split("\n")[0]
        info(f"{cmd}: {ver}")
    if platform.system() != "Linux":
        warn("此腳本針對 Linux / WSL 設計，其他系統可能需要調整")


def npm_install():
    step("安裝 Node.js 套件")
    if (ROOT / "node_modules").exists():
        info("根目錄 node_modules 已存在，跳過")
    else:
        info("npm install（根目錄）…")
        run("npm install", cwd=ROOT)
        info("完成")

    if (LOCAL_SERVER / "node_modules").exists():
        info("local-server node_modules 已存在，跳過")
    else:
        info("npm install（local-server）…")
        run("npm install", cwd=LOCAL_SERVER)
        info("完成")


def setup_env():
    step("設定 local-server/.env")
    if ENV_FILE.exists():
        info(".env 已存在，跳過（若要重建請先刪除 local-server/.env）")
        return

    print(f"\n  從 {ENV_EXAMPLE.name} 產生 .env，請填入以下必要設定：")
    print(f"  （直接 Enter 可使用預設值；Token 欄位留空會自動產生隨機值）\n")

    claude_bin  = shutil.which("claude") or ask("Claude CLI 路徑", "/home/sssss/.local/bin/claude")
    vault_paths = ask("Obsidian Vault 路徑（多個用逗號分隔）", "/mnt/d/obsidian/Willy_2026")
    tailscale   = ask("Tailscale hostname（可空白，不確定就跳過）", "")
    asr         = ask("ASR 語音辨識供應商 funasr / groq / openai", "groq")
    claude_key  = ask("CLAUDE_API_KEY（sk-ant-…）", "")
    groq_key    = ask("GROQ_API_KEY（使用 Groq ASR 才需要）", "")
    openai_key  = ask("OPENAI_API_KEY（可空白）", "")
    nb_url      = ask("NotebookLM notebook URL（可空白）", "")

    def rand_token(n=40):
        return secrets.token_urlsafe(n)

    local_token   = rand_token()
    gateway_token = rand_token()
    ios_token     = rand_token()

    print(f"\n  {YELLOW}自動產生的 Token（請妥善保存）:{RESET}")
    print(f"    LOCAL_SERVER_TOKEN  = {local_token}")
    print(f"    APP_GATEWAY_TOKEN   = {gateway_token}")
    print(f"    IOS_SHARE_TOKEN     = {ios_token}")

    allowed_origins = (
        "http://localhost:5173,http://127.0.0.1:5173,"
        "http://localhost:5175,http://127.0.0.1:5175,"
        "http://localhost:3000,http://127.0.0.1:3000"
    )
    if tailscale:
        allowed_origins += f",https://{tailscale}"

    env_content = f"""\
CLAUDE_API_KEY={claude_key}
PORT=3001
HOST=0.0.0.0
LOCAL_SERVER_TOKEN={local_token}
NOTEBOOKLM_API_URL=http://127.0.0.1:3000
NOTEBOOKLM_NOTEBOOK_URL={nb_url}
OBSIDIAN_VAULT_PATHS={vault_paths}
ALLOWED_ORIGINS={allowed_origins}

# Full Card Box App → Cloudflare Tunnel
APP_GATEWAY_TOKEN={gateway_token}
APP_GATEWAY_HOST=127.0.0.1
APP_GATEWAY_PORT=3020
APP_GATEWAY_FRONTEND_ORIGIN=http://127.0.0.1:5175
APP_GATEWAY_INTERNAL_API_URL=http://127.0.0.1:3001

# Search server
AUTO_START_SEARCH_SERVER=true
SEARCH_SERVER_PYTHON=../llama-search/.venv-wsl/bin/python
SEARCH_SERVER_SCRIPT=../llama-search/search_server.py
SEARCH_SERVER_CWD=../llama-search

# ASR
ASR_PROVIDER={asr}
OPENAI_API_KEY={openai_key}
GROQ_API_KEY={groq_key}

# AI enrich
AI_ENRICH_BACKEND=claude
AI_ENRICH_DISABLE_HEURISTIC_FALLBACK=1
CLAUDE_BIN={claude_bin}

# iOS Share Sheet → Cloudflare Tunnel
IOS_SHARE_TOKEN={ios_token}
IOS_SHARE_GATEWAY_HOST=127.0.0.1
IOS_SHARE_GATEWAY_PORT=3010
IOS_SHARE_INTERNAL_API_URL=http://127.0.0.1:3001
IOS_SHARE_SOURCE_NOTE_DIR=Sources/inbox
IOS_SHARE_ANALYZE_TIMEOUT_MS=240000
IOS_SHARE_GATEWAY_TIMEOUT_MS=260000

# Auto-pull (optional)
PROJECT_DIR={ROOT}
"""
    ENV_FILE.write_text(env_content)
    info(f".env 已建立：{ENV_FILE}")


def setup_python_venv():
    step("建立 llama-search Python 虛擬環境（.venv-wsl）")
    if (VENV_DIR / "bin" / "python").exists():
        info("venv 已存在，跳過（若要重建請先刪除 llama-search/.venv-wsl）")
        return

    info("建立 venv…")
    run(f"python3 -m venv {VENV_DIR}", cwd=LLAMA_SEARCH)

    pip = VENV_DIR / "bin" / "pip"
    info("pip install -r requirements.txt（首次載入 torch + BGE-M3 模型需要幾分鐘）…")
    run(f"{pip} install --upgrade pip", cwd=LLAMA_SEARCH)
    run(f"{pip} install -r requirements.txt", cwd=LLAMA_SEARCH)
    info("Python 環境安裝完成")


def download_cloudflared():
    step("下載 cloudflared binary")
    if CLOUDFLARED_BIN.exists():
        info("cloudflared 已存在，跳過")
        return

    arch = platform.machine()
    arch_map = {"x86_64": "amd64", "aarch64": "arm64", "armv7l": "arm"}
    cf_arch = arch_map.get(arch, "amd64")
    url = f"https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-{cf_arch}"

    info(f"下載 {url} …")
    CLOUDFLARED_BIN.parent.mkdir(parents=True, exist_ok=True)
    try:
        urllib.request.urlretrieve(url, CLOUDFLARED_BIN)
        CLOUDFLARED_BIN.chmod(CLOUDFLARED_BIN.stat().st_mode | stat.S_IEXEC | stat.S_IXGRP | stat.S_IXOTH)
        info(f"已儲存到 {CLOUDFLARED_BIN}")
    except Exception as e:
        warn(f"下載失敗（{e}），請手動下載後放到 local-server/bin/cloudflared")


def build_index():
    step("建立 llama-search 向量索引（可選）")
    storage = LLAMA_SEARCH / "storage"
    if storage.exists() and any(storage.iterdir()):
        info("storage/ 已存在，跳過 build_index")
        return

    python = VENV_DIR / "bin" / "python"
    yn = ask("是否現在建立向量索引？首次約需 5-15 分鐘（y/n）", "n")
    if yn.lower() != "y":
        warn("跳過。之後手動執行：cd llama-search && .venv-wsl/bin/python build_index.py")
        return

    info("執行 build_index.py …")
    run(f"{python} build_index.py", cwd=LLAMA_SEARCH)
    info("索引建立完成")


def summary():
    print(f"\n{'─'*55}")
    print(f"{BOLD}{GREEN}  安裝完成！{RESET}")
    print(f"{'─'*55}")
    print(f"  啟動全部服務：{BOLD}npm run dev:all{RESET}")
    print(f"  僅前端：       {BOLD}npm run dev{RESET}")
    print(f"  僅後端：       {BOLD}cd local-server && npm run dev{RESET}")
    print()
    print(f"  {YELLOW}注意：{RESET}首次啟動 llama-search 模型載入約 25 秒")
    if not ENV_FILE.exists():
        warn("local-server/.env 尚未建立，請手動建立後再啟動")
    print(f"{'─'*55}\n")


# ── main ─────────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    print(f"\n{BOLD}Card Box Note Management — 環境安裝腳本{RESET}")
    print(f"執行目錄：{ROOT}\n")

    check_prerequisites()
    npm_install()
    setup_env()
    setup_python_venv()
    download_cloudflared()
    build_index()
    summary()
