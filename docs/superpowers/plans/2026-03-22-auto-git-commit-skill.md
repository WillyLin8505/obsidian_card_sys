# Auto Git Commit Skill Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 每當 AI 修改程式碼後，自動執行 git commit 和 git push，透過 Claude Code 的 PostToolUse hook 機制實現真正的自動化。

**Architecture:** 採用雙層設計：(1) PostToolUse hook 腳本 — 在 Edit/Write/NotebookEdit 工具執行後自動觸發 git commit + push；(2) 一個 skill 文件 — 方便用戶了解此功能並手動調用。Hook 比 skill 更可靠，因為它不依賴 AI 是否記得執行。

**Tech Stack:** Bash shell script, Claude Code hooks (PostToolUse), JSON (settings.json), Git

---

## File Structure

| File | Action | Purpose |
|------|--------|---------|
| `~/.claude/hooks/auto-git-commit.sh` | Create | PostToolUse hook 腳本，解析 stdin JSON，執行 git commit + push |
| `~/.claude/settings.json` | Modify | 加入 PostToolUse hook，指向上述腳本 |
| `~/.claude/skills/auto-git-commit/SKILL.md` | Create | Skill 文件，讓 AI 在被調用時了解此功能 |

---

## Task 1: 建立 Hook 腳本

**Files:**
- Create: `~/.claude/hooks/auto-git-commit.sh`

- [ ] **Step 1: 確認依賴工具已安裝**

```bash
# 確認 python3 可用（用於 JSON 解析）
python3 -c "import json; print('OK')"
# 確認 git 可用
git --version
```

預期：兩個命令都正常輸出，無錯誤。

- [ ] **Step 2: 建立 hooks 目錄（若不存在）**

```bash
mkdir -p ~/.claude/hooks
```

- [ ] **Step 3: 建立 hook 腳本**

建立 `~/.claude/hooks/auto-git-commit.sh`，內容如下：

```bash
#!/bin/bash
# PostToolUse hook: auto git commit + push after AI edits files
#
# Claude Code sends JSON via stdin with this format:
# {
#   "session_id": "...",
#   "tool_name": "Edit",
#   "tool_input": { "file_path": "/abs/path/to/file", ... },
#   "tool_response": { ... }
# }

set -euo pipefail

# Read JSON from stdin (read once to avoid consuming stream twice)
INPUT=$(cat)

# Extract tool name
TOOL_NAME=$(echo "$INPUT" | python3 -c "import sys, json; d=json.load(sys.stdin); print(d.get('tool_name',''))" 2>/dev/null || echo "")

# Only act on file-editing tools
case "$TOOL_NAME" in
  Edit|Write|NotebookEdit)
    ;;
  *)
    exit 0
    ;;
esac

# Extract file path from tool input
FILE_PATH=$(echo "$INPUT" | python3 -c "
import sys, json
d = json.load(sys.stdin)
ti = d.get('tool_input', {})
# Edit tool uses 'file_path', Write uses 'file_path'
print(ti.get('file_path', ''))
" 2>/dev/null || echo "")

if [ -z "$FILE_PATH" ]; then
  exit 0
fi

# Find the git repo root for this file
GIT_ROOT=$(git -C "$(dirname "$FILE_PATH")" rev-parse --show-toplevel 2>/dev/null || echo "")

if [ -z "$GIT_ROOT" ]; then
  # Not in a git repo, skip silently
  exit 0
fi

# Stage all changes in the repo
git -C "$GIT_ROOT" add -A

# Check if there's anything to commit
if git -C "$GIT_ROOT" diff --cached --quiet; then
  exit 0
fi

# Build commit message with relative file path
REL_PATH=$(realpath --relative-to="$GIT_ROOT" "$FILE_PATH" 2>/dev/null || basename "$FILE_PATH")
TIMESTAMP=$(date '+%Y-%m-%d %H:%M:%S')
COMMIT_MSG="auto: AI edit ${REL_PATH} (${TIMESTAMP})"

# Commit
git -C "$GIT_ROOT" commit -m "$COMMIT_MSG"

# Push (best-effort, don't fail the hook if push fails)
git -C "$GIT_ROOT" push 2>&1 || echo "[auto-git] Push failed (will retry next time)" >&2

exit 0
```

- [ ] **Step 4: 給腳本執行權限**

```bash
chmod +x ~/.claude/hooks/auto-git-commit.sh
```

- [ ] **Step 5: 在真實 git repo 中完整測試**

```bash
# 建立測試 repo
mkdir -p /tmp/test-auto-git && cd /tmp/test-auto-git
git init && echo "hello" > file.txt && git add -A && git commit -m "init"

# 修改檔案後，模擬 hook
echo "world" >> /tmp/test-auto-git/file.txt
echo '{"tool_name":"Edit","tool_input":{"file_path":"/tmp/test-auto-git/file.txt"},"tool_response":{}}' \
  | ~/.claude/hooks/auto-git-commit.sh

# 驗證
git -C /tmp/test-auto-git log --oneline
```

預期輸出：最新一筆 commit 為 `auto: AI edit file.txt (2026-03-22 ...)`

---

## Task 2: 更新 settings.json，加入 PostToolUse Hook

**Files:**
- Modify: `~/.claude/settings.json`

- [ ] **Step 1: 讀取目前的 settings.json**

```bash
cat ~/.claude/settings.json
```

- [ ] **Step 2: 在 hooks 區塊中加入 PostToolUse hook**

在 `~/.claude/settings.json` 的 `hooks` 物件中，加入 `PostToolUse` 配置：

```json
{
  "hooks": {
    "SessionStart": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "/home/willylin/.local/bin/ccbot hook",
            "timeout": 5
          }
        ]
      }
    ],
    "PostToolUse": [
      {
        "matcher": "Edit|Write|NotebookEdit",
        "hooks": [
          {
            "type": "command",
            "command": "/home/willylin/.claude/hooks/auto-git-commit.sh",
            "timeout": 30
          }
        ]
      }
    ]
  },
  "enabledPlugins": {
    "everything-claude-code@everything-claude-code": true,
    "claude-hud@claude-hud": true,
    "superpowers@claude-plugins-official": true
  },
  "extraKnownMarketplaces": {
    "everything-claude-code": {
      "source": {
        "source": "github",
        "repo": "affaan-m/everything-claude-code"
      }
    },
    "claude-hud": {
      "source": {
        "source": "github",
        "repo": "jarrodwatts/claude-hud"
      }
    }
  }
}
```

> **注意：** `matcher` 欄位用 regex 或 pipe-separated 字串來匹配 tool 名稱。

- [ ] **Step 3: 驗證 JSON 格式正確**

```bash
python3 -m json.tool ~/.claude/settings.json > /dev/null && echo "JSON valid"
```

預期：`JSON valid`

- [ ] **Step 4: 提交設定變更**

```bash
# settings.json 通常不在 project repo 中，此步驟視情況而定
echo "settings.json updated - hook configured"
```

---

## Task 3: 建立 Skill 文件

**Files:**
- Create: `~/.claude/skills/auto-git-commit/SKILL.md`

- [ ] **Step 1: 建立 skill 目錄**

```bash
mkdir -p ~/.claude/skills/auto-git-commit
```

- [ ] **Step 2: 建立 SKILL.md**

建立 `~/.claude/skills/auto-git-commit/SKILL.md`，內容如下：

```markdown
---
name: auto-git-commit
description: 每當 AI 修改程式碼後自動 git commit 並 push。此功能透過 PostToolUse hook 自動執行，本 skill 提供說明與手動觸發。
---

# Auto Git Commit

## 功能說明

此設定透過 Claude Code 的 **PostToolUse hook** 實現：每當 AI 使用 `Edit`、`Write`、或 `NotebookEdit` 工具修改檔案後，系統自動執行：

1. `git add -A` — 暫存所有變更
2. `git commit -m "auto: AI edit <file> (<timestamp>)"` — 建立 commit
3. `git push` — 推送到遠端（失敗時不中斷流程）

## Hook 位置

- Script: `~/.claude/hooks/auto-git-commit.sh`
- 設定: `~/.claude/settings.json` → `hooks.PostToolUse`

## 前提條件

- 專案目錄必須是 git repository（已執行 `git init`）
- 若需要 push，必須已設定遠端 (`git remote add origin <url>`) 並有推送權限
- 若 repository 為私有，需已設定 SSH key 或 credential

## 注意事項

- **每次檔案編輯都會產生一個 commit** — 這讓歷史非常細粒度
- 若不想 auto-push（只 commit），可移除 hook 腳本中的 `git push` 行
- 若要暫時停用，在 settings.json 中移除或注解掉 PostToolUse hook
- Push 失敗不會造成 hook 錯誤，只會輸出警告訊息

## 手動觸發

若 hook 未運行，可手動在任何 git repo 目錄執行：

```bash
git add -A && git commit -m "auto: manual commit" && git push
```
```

- [ ] **Step 3: 驗證 skill 文件存在**

```bash
ls ~/.claude/skills/auto-git-commit/SKILL.md && echo "Skill file created"
```

---

## Task 4: 端對端測試

- [ ] **Step 1: 在一個有遠端的 git repo 中測試**

在 Card Box Note Management 專案（或任何有設定好遠端的 git repo）中，請 AI 編輯任何一個檔案。

- [ ] **Step 2: 確認 hook 被觸發**

```bash
# 在專案目錄中查看最新 log
git log --oneline -5
```

預期：最新 commit 為 `auto: AI edit <filename> (<timestamp>)`

- [ ] **Step 3: 確認 push 成功（若有設定遠端）**

```bash
git status
# 預期：Your branch is up to date with 'origin/<branch>'
```

- [ ] **Step 4: 若專案沒有 git init，初始化**

```bash
cd "/mnt/c/Users/sssss/OneDrive/personal_desk_file/Desktop/vibe_coding_project/Card Box Note Management"
git init
git add -A && git commit -m "feat: initial commit"

# 若要啟用 auto-push，需設定遠端（用你的實際 repo URL 取代）
# git remote add origin git@github.com:<username>/<repo>.git
# git push -u origin main
```

> **Note:** Push 步驟需先在 GitHub/GitLab 建立空白 repo，並設定好 SSH key 或 HTTPS credential。若只需要 auto-commit（不 push），不設定遠端即可 — hook 腳本遇到 push 失敗時只會印警告，不會中斷流程。

---

## 重要提醒

1. **此 hook 是全域設定** — 所有 Claude Code 工作階段中、所有 git repo 都會觸發
2. **Push 需要認證** — 確保 SSH key 或 git credential 已設定好
3. **非 git 目錄不受影響** — Hook 腳本會先檢查是否在 git repo 中，不是的話靜默退出
4. **commit message 可客製化** — 修改 hook 腳本中的 `COMMIT_MSG` 變數
