---
name: harness-audit
description: Periodic Harness health audit based on 7 design principles
disable-model-invocation: true
allowed-tools: Read, Glob, Grep, Bash
---

# Harness 健康審計

週期性檢查專案 Harness（CLAUDE.md + Hook + Skill + Knowledge）的健康狀態。

## 使用方式
```
/harness-audit
```

## 參數
無（操作當前專案）

## 檢查項目（七大原則）

### 原則 1: 上下文架構（給地圖不給百科全書）
- [ ] CLAUDE.md 行數 ≤ 100（超過 = 警告）
- [ ] CLAUDE.md 有文件索引且索引完整
- [ ] .knowledge/ 文件都在索引中登記

### 原則 2: 架構約束（用工具強制不靠 prompt）
- [ ] 掃描 CLAUDE.md 中的「禁止」「不得」等文字規則
- [ ] 檢查是否有對應 Hook 強制（.claude/settings.json）
- [ ] 未被 Hook 覆蓋的文字規則列出建議

### 原則 3: 知識層級（公司 vs 專案）
- [ ] .knowledge/company-rules.md 存在
- [ ] .knowledge/team-workflow.md 存在
- [ ] 專案級規範與公司級不衝突

### 原則 4: 技能即流程（Skill 覆蓋）
- [ ] .claude/skills/ 目錄存在
- [ ] 掃描已部署的 Skill 數量
- [ ] 列出未部署但可用的公司 Skill

### 原則 5: Hook 健康
- [ ] .claude/settings.json 存在且 JSON 合法
- [ ] Stop hook 存在
- [ ] PreToolUse hook 存在（forbidden-commands）
- [ ] Hook 腳本檔案存在且可執行

### 原則 6: 文件新鮮度
- [ ] .knowledge/ 下各文件最後修改日期
- [ ] 超過 30 天未更新的文件標記為「可能過時」

### 原則 7: 整體評分
- 每個原則 0-2 分（0=缺失, 1=部分, 2=完善）
- 總分 /14，≥10 = 健康，7-9 = 需改善，<7 = 警告

## 輸出格式

```
# Harness 健康審計報告

**專案**: {project-name}
**日期**: {today}
**總分**: {score}/14

## 評分明細
| 原則 | 分數 | 說明 |
|------|------|------|
| 1. 上下文架構 | {0-2} | {detail} |
| 2. 架構約束 | {0-2} | {detail} |
| 3. 知識層級 | {0-2} | {detail} |
| 4. 技能覆蓋 | {0-2} | {detail} |
| 5. Hook 健康 | {0-2} | {detail} |
| 6. 文件新鮮度 | {0-2} | {detail} |
| 7. 整體完整性 | {0-2} | {detail} |

## 行動項目
1. {highest priority action}
2. {second priority action}
...
```
