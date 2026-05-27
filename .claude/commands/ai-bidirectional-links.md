---
name: ai-bidirectional-links
description: Design and implement bidirectional linking to replace folder-based note organization (SCAMPER-S strategy)
allowed-tools: Read, Write, Glob, Grep
---

# 雙向連結取代資料夾結構

SCAMPER-S（替代）策略實作：以雙向連結作為主要組織機制，取代傳統資料夾。

## 使用方式
```
/ai-bidirectional-links [analyze|design|validate]
```

## 參數
- `analyze`：分析現有資料模型，評估雙向連結相容性
- `design`：產出雙向連結資料結構設計文件
- `validate`：驗收既有設計稿中雙向連結 UI 是否完整

## 六頂思考帽快查

| 帽 | 關鍵考量 |
|----|---------|
| 白帽 | Zettelkasten 已驗證 30 年；[[wikilink]] 是業界標準語法 |
| 黑帽 | 資料夾習慣根深蒂固，需提供漸進式遷移路徑 |
| 綠帽 | 雙向連結 + 知識圖譜視覺化 = 核心差異化 |

## 執行步驟

### 1. 讀取現有資料模型

讀取 `.knowledge/data-model.md`，確認：
- 現有 Note / Card 資料結構
- 是否已有 `parent_id` 或資料夾欄位
- 索引與查詢效能現況

### 2. 分析影響範圍

```bash
grep -r "folder\|directory\|parent_id\|category" src/ --include="*.ts" -l
```

### 3. 設計雙向連結資料結構

產出結構需包含：

```typescript
// 連結實體
interface NoteLink {
  source_card_id: string   // 來源卡片
  target_card_id: string   // 目標卡片
  link_type: 'reference' | 'mention' | 'related'
  created_at: string
  context_snippet?: string // 連結前後文（搜尋用）
}

// 卡片需新增
interface Card {
  // ... 既有欄位
  outbound_links: NoteLink[]   // 此卡片引用的連結
  inbound_links: NoteLink[]    // 引用此卡片的連結（反向索引）
}
```

### 4. 遷移策略驗證

確認以下問題：
- [ ] 既有資料夾路徑能否轉換為標籤？
- [ ] 是否需要保留資料夾作為「可選層級」？
- [ ] 前端 [[wikilink]] 語法解析是否已規劃？

### 5. 產出設計文件

寫入 `.knowledge/data-model.md` 的「雙向連結」章節：
- ER Diagram（文字版）
- API 端點草案（`GET /cards/:id/links`、`POST /cards/:id/links`）
- 效能考量（反向索引更新策略）

## 驗收標準

- [ ] 資料結構設計文件已完成
- [ ] 遷移策略已評估（不破壞現有資料）
- [ ] 前端語法解析方案已確認
- [ ] 與 `.knowledge/api-design.md` 格式一致

## 注意事項

- 雙向連結是 MVP 核心，不得因工期縮減而降級為「單向連結」
- 刪除卡片時必須同步清除所有 inbound/outbound links（參考 postmortem-common.md 孤兒連結問題）
- 連結上限建議先設為每張卡片 500 條，避免圖譜渲染效能問題
