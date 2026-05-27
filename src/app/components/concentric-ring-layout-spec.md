# 同心環佈局規格文件（已廢棄）

> 狀態：**廢棄** — 2026-05-17 決定改採左右樹狀佈局。
> 廢棄原因見底部「已知問題」。

---

## 整體架構

- 渲染器：`react-force-graph-2d`（Canvas 2D）
- 所有節點以 `fx`/`fy` 固定位置，force simulation 僅作為渲染容器
- 佈局在每次 `graphData` useMemo 觸發時完整重算

---

## 節點圓半徑

```
depth = 0（中心節點）: r = 7px
depth = d（其他節點）: r = max(3, 6 - d)
```

---

## 標籤規格

| 常數 | 值 | 說明 |
|------|----|------|
| `LABEL_MAX_CHARS` | 9 | 每行最多字符數，超過自動換行 |
| `LABEL_PAD_X` | 4 | 文字方塊左右內距（兩側合計） |
| `LABEL_PAD_Y` | 2 | 文字方塊上下內距（兩側合計） |
| `LABEL_NODE_MIN_GAP` | 6 | 節點圓邊緣到文字方塊邊緣最小距離（px） |
| `LABEL_COLLISION_PAD` | 10 | 相鄰標籤之間最小間距（px） |
| `FOCUSED_LABEL_COLLISION_PAD` | 6（= `LABEL_NODE_MIN_GAP`）| 聚焦子樹內標籤最小間距 |
| `LABEL_BORDER_WIDTH` | 1 | 文字方塊邊框寬度（px） |
| `LABEL_BLOCK_MIN_GAP` | 1 | obstacle 邊框外額外安全邊距 |

---

## 字體

```
中心節點：bold 9px sans-serif，行高 = 11px（fontSize + 2）
其他節點：7px sans-serif，行高 = 9px
```

---

## 標籤位置計算（`placeLabel`）

**方向**：從全局中心指向節點的反方向（inward = `-{x, y} / |{x, y}|`）
- 節點在圓心時方向為 `{0, 1}`

**標籤中心位置**：
```
projectedBoxHalf = |inward.x| * halfW + |inward.y| * halfH
labelCx = nx + inward.x * (r + LABEL_NODE_MIN_GAP + projectedBoxHalf)
labelCy = ny + inward.y * (r + LABEL_NODE_MIN_GAP + projectedBoxHalf)
```

**渲染時重算**：使用 `ctx.measureText()` 取得實際文字寬度，重新計算 `labelCx`，
確保節點圓邊緣到 pill 邊緣視覺距離精確為 `LABEL_NODE_MIN_GAP = 6px`。

---

## 環形佈局邏輯

### 深度 0（中心節點）

- 1 個中心節點 → 放在原點 `(0, 0)`
- 多個中心節點 → 半徑 = `min(17, nc × 22)`，均勻分布

### 深度 d ≥ 1（環搜尋演算法）

```
起始半徑 low = 前一層半徑 + 10
以 5px 步長向外擴展 → tryPlaceRingOnRadius(high)
成功後 → 二分搜尋縮小至最小可用半徑（18 次迭代）
失敗後 → placeRingFallback(max(high, minCircumRadius))

minCircumRadius = arcBudget / (2π)
arcBudget = Σ labelArcRequirement(node_i)
```

### `tryPlaceRingOnRadius` 迭代防碰撞

- 最多 240 次迭代
- 每次計算所有節點配對，發現重疊則對向推開 `min(0.035, sector × 0.08)` 弧度
- `useAnchorAttraction = true` 時：向偏好角度施加 0.035 係數吸引力

### `placeRingFallback` 累積弧分配

- 從 `-π/2` 開始，每個節點佔 `labelArcRequirement` 弧度空間
- 保證相鄰標籤滿足 `LABEL_COLLISION_PAD`

---

## `labelArcRequirement`（每節點所需弧長）

```
max(
  2 * (r + 5) + 10,
  min(textWidth, 72) + LABEL_COLLISION_PAD,
  textHeight + LABEL_COLLISION_PAD
)
```

---

## 偏好角度系統（`buildPreferredAngles`）

每層節點按「已放置相關節點的角度均值」排序，讓連結節點靠近同一側：

- `savedAngles`：記錄每次焦點點擊後的節點角度，防止佈局跳動
- `prevDepthRef`：深度變化時清空 `savedAngles`

---

## 焦點點擊佈局（`forceFocusedSubtreeSide`）

左鍵點擊節點時觸發，對每一層執行：

1. BFS 找出所有出鏈後代（`focusedSubtreeIds`），含點擊節點本身
2. **1D 角度力模擬**（最多 400 次迭代）：
   - 所有節點從 `focusAngle` 出發
   - Forward + Backward separation passes 推開相鄰重疊節點
   - 重力係數 0.4，將群集中心拉回 `focusAngle`
   - 收斂條件：`maxMove < 0.0001`
3. 以最終角度提交節點位置

---

## 顏色規格

```
CENTER_COLOR = '#34d399'
DEPTH_COLORS = ['#34d399', '#60a5fa', '#fbbf24', '#f87171', '#a78bfa']

非高亮節點圓：alpha 0.18
非高亮標籤：alpha 0.24
高亮連結：'#94a3b8'
非高亮連結：'rgba(148, 163, 184, 0.16)'
```

---

## BFS 遍歷規則

- 同時追蹤 outgoing（`outMap`）和 incoming（`inMap`）連結
- 每個節點最多被遍歷一次（depth 最小的路徑獲勝）
- 中心節點 depth = 0，其餘依 BFS 層數遞增

---

## 已知問題（廢棄原因）

1. **複雜度失控**：規格層次繁多（環搜尋 → 二分縮小 → 1D 力模擬 → savedAngles），任一環節的邊界情況都會引入新 bug
2. **焦點點擊不穩定**：`focusedSubtreeIds` BFS 加上 `forceFocusedSubtreeSide` 在不同圖結構下行為難以預測
3. **arc requirement vs 實際寬度不一致**：`placeLabel` 用估算寬度進行碰撞判斷，渲染時用 `ctx.measureText()` 實際寬度，兩者不同造成視覺位移
4. **savedAngles 記憶問題**：深度或中心節點變化時若未及時清空，節點出現在錯誤位置
5. **修復連鎖反應**：修一個規格假設往往破壞另一個，累計超過 15 次修復迭代，仍有殘留問題
6. **根源**：沒有在開發前建立完整規格，每次修復都是事後追加約束，造成系統越來越脆
