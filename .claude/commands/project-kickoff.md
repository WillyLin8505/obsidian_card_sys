---
name: project-kickoff
description: Initialize new project with CLAUDE.md, .knowledge/ structure, and company rules
disable-model-invocation: true
allowed-tools: Read, Write, Glob, Bash
---

# 專案初始化

PM 啟動新專案時使用，確保所有基礎結構就位。

## 使用方式
```
/project-kickoff <project-type> <project-name>
```

## 參數
- `$0`: 專案類型（web-app / api-service / mobile-app / library）
- `$ARGUMENTS`: 完整參數

## 執行步驟

1. **檢查現有結構**
   - 檢查 CLAUDE.md 是否已存在
   - 檢查 .knowledge/ 目錄是否已存在
   - 如已存在，提示確認是否覆蓋

2. **部署 CLAUDE.md**
   - 從對應模板生成（替換 {專案名稱} 佔位符）
   - 模板位置：AgentHub `knowledge/company/project-templates/{type}/CLAUDE.md.template`

3. **建立 .knowledge/ 結構**
   - 建立 `.knowledge/` 目錄
   - 複製 `architecture.md`（從模板目錄）
   - 建立空的 `project-overview.md`（標題 + 佔位符）
   - 建立空的 `postmortem-log.md`（標題 + 空表格）

4. **部署共用規則**
   - 複製 `company-rules.md` → `.knowledge/company-rules.md`
   - 複製 `team-workflow.md` → `.knowledge/team-workflow.md`

5. **輸出下一步 Checklist**
   ```
   ✅ 專案初始化完成

   下一步：
   - [ ] 填寫 CLAUDE.md 專案簡介佔位符
   - [ ] 填寫技術棧表格
   - [ ] 建立 proposal/ 目錄
   - [ ] 撰寫 Sprint 提案書（/sprint-proposal）
   ```
