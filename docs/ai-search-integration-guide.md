# AI 智能搜尋整合指南

## 概述

此功能允許用戶透過 Web UI 向遠程 Obsidian 知識庫提問，系統會通過 Tailscale SSH 連接到 Windows 機器的 WSL，使用 QMD 進行語義搜尋，並由 Claude AI 生成答案。

## 系統架構

```
用戶 → Web UI → Backend API → (Tailscale SSH) → Windows → WSL → QMD → Obsidian Vault
                                                                           ↓
用戶 ← Web UI ← Backend API ← 格式化答案 ← Claude AI ← 搜尋結果
```

## 前端實現（已完成）

### 已創建的組件

1. **AISearchPanel** (`/src/app/components/AISearchPanel.tsx`)
   - 問題輸入框
   - 連接狀態指示器
   - AI 回答顯示
   - 來源片段展示（含相似度分數）
   - 元數據顯示

2. **AllFiles 頁面整合** (`/src/app/pages/AllFiles.tsx`)
   - AI 搜尋面板切換按鈕
   - 搜尋處理邏輯
   - 狀態管理

### API 客戶端（已完成）

位於 `/src/app/utils/api.ts`：

```typescript
api.aiSearch.search({ question: string })
```

## 後端實現（需要您完成）

### 已創建的後端文件

1. **AI Search Router** (`/supabase/functions/server/ai-search.tsx`)
   - `POST /ai-search` - 提交問題並存儲結果
   - `GET /ai-search` - 獲取搜尋歷史
   - `GET /ai-search/:id` - 獲取特定搜尋結果
   - `DELETE /ai-search/:id` - 刪除搜尋結果

### 需要您實現的部分

在 `/supabase/functions/server/ai-search.tsx` 的 `POST /` 端點中，您需要：

```typescript
app.post('/', async (c) => {
  try {
    const body = await c.req.json();
    const { question } = body;

    // 🔧 TODO: 實現您的 Tailscale SSH + QMD + Claude 流程
    
    // 1. 通過 Tailscale SSH 連接到遠程機器
    // 2. 執行 QMD 搜索命令
    // 3. 獲取搜索結果
    // 4. 調用 Claude API 生成答案
    // 5. 返回結構化結果
    
    const answer = "..."; // Claude 生成的答案
    const chunks = [...]; // QMD 搜索結果
    const searchTime = 0; // 搜索耗時
    
    // 存儲結果到數據庫
    const searchResult = {
      question,
      answer,
      chunks,
      connection_status: 'connected',
      search_time: searchTime,
      metadata: {
        model: 'claude-3-5-sonnet',
        tokensUsed: 1200,
      },
      created_at: new Date().toISOString(),
    };

    const { data, error } = await supabase
      .from('ai_search_results')
      .insert([searchResult])
      .select()
      .single();

    if (error) {
      return c.json({ success: false, error: error.message }, 500);
    }

    return c.json({ success: true, result: data });
  } catch (error: any) {
    return c.json({ success: false, error: error.message }, 500);
  }
});
```

### 實現建議

#### 1. SSH 連接（使用 Deno）

```typescript
// 使用 Deno 的 SSH 庫
import { Client } from "https://deno.land/x/ssh2@v1.0.0/mod.ts";

const ssh = new Client();
ssh.on('ready', () => {
  ssh.exec('wsl qmd search "query"', (err, stream) => {
    // 處理結果
  });
});

ssh.connect({
  host: 'tailscale-machine-ip',
  port: 22,
  username: 'your-username',
  privateKey: Deno.env.get('SSH_PRIVATE_KEY'),
});
```

#### 2. QMD 命令執行

假設您的 QMD 在 WSL 中已經配置好：

```bash
wsl qmd search "user question" --vault /path/to/obsidian/vault --format json
```

#### 3. Claude API 調用

```typescript
const anthropic = new Anthropic({
  apiKey: Deno.env.get('ANTHROPIC_API_KEY'),
});

const message = await anthropic.messages.create({
  model: 'claude-3-5-sonnet-20241022',
  max_tokens: 1024,
  messages: [{
    role: 'user',
    content: `根據以下筆記片段回答問題：\n\n${chunks}\n\n問題：${question}`
  }]
});
```

### 環境變數

需要在 Supabase 中設置以下環境變數：

```bash
ANTHROPIC_API_KEY=your-claude-api-key
SSH_PRIVATE_KEY=your-ssh-private-key
TAILSCALE_HOST=your-tailscale-machine-ip
SSH_USERNAME=your-username
OBSIDIAN_VAULT_PATH=/path/to/vault
```

## 數據結構

### 請求格式

```typescript
{
  question: string;
}
```

### 響應格式

```typescript
{
  success: boolean;
  result?: {
    id: string;
    question: string;
    answer: string;
    chunks: Array<{
      content: string;
      notePath: string;
      similarity: number;
      metadata?: {
        title?: string;
        tags?: string[];
        created?: string;
      };
    }>;
    connectionStatus: 'connected' | 'disconnected' | 'searching';
    searchTime: number;
    createdAt: string;
    metadata?: {
      model?: string;
      tokensUsed?: number;
    };
  };
  error?: string;
}
```

## 使用流程

1. 用戶在「所有檔案」頁面點擊「使用 AI 智能搜尋」按鈕
2. 展開 AI 搜尋面板
3. 輸入問題並提交
4. 前端顯示「正在搜尋中...」狀態
5. 後端執行：
   - 連接 Tailscale SSH
   - 執行 QMD 搜索
   - 調用 Claude 生成答案
   - 存儲結果到 Supabase
6. 前端顯示：
   - AI 回答（Markdown 渲染）
   - 來源片段（含相似度）
   - 元數據（模型、Token、耗時）

## 測試

目前前端使用模擬數據進行測試。要啟用真實 API：

在 `/src/app/pages/AllFiles.tsx` 中取消註釋：

```typescript
// const response = await api.aiSearch.search({ question });
```

並刪除模擬邏輯。

## 故障排除

### 連接問題

- 確認 Tailscale 連接正常
- 檢查 SSH 認證配置
- 確認防火牆設置

### QMD 問題

- 確認 QMD 已在 WSL 中正確安裝
- 檢查 Obsidian vault 路徑
- 測試 QMD 命令是否正常運行

### Claude API 問題

- 確認 API key 有效
- 檢查 Token 配額
- 確認網絡連接

## 下一步

1. ✅ 創建數據庫表（見 `ai-search-database-schema.md`）
2. 🔧 實現後端 SSH + QMD + Claude 整合
3. 🔧 設置環境變數
4. 🧪 測試端到端流程
5. 📊 （可選）添加搜尋歷史管理功能
