# LINE 通知問題修復說明

## 🔍 問題診斷

### 症狀
- APP 顯示錯誤：「LINE 傳送失敗：LINE_CHANNEL_ACCESS_TOKEN not configured」
- 即使在 Vercel 已經設定了 `LINE_CHANNEL_ACCESS_TOKEN` 環境變數

### 根本原因
**Vercel 環境變數的生效時機**：
- 環境變數的修改不會自動套用到已部署的應用程式
- 必須在設定環境變數後**重新部署**才會生效

### 時間線分析
根據您的截圖：
- **7 小時前**：最後一次部署（當時還沒有設定環境變數）
- **17 分鐘前**：新增 `LINE_CHANNEL_ACCESS_TOKEN` 環境變數
- **結果**：舊的部署無法讀取新的環境變數

---

## ✅ 解決方案

### 已執行的修復步驟

1. **測試 LINE API**：
   - 透過 Manus 成功發送測試訊息
   - 確認 LINE Channel Access Token 有效
   - 確認 LINE Messaging API 連線正常

2. **觸發重新部署**：
   - 建立空的 Git commit
   - 推送到 GitHub
   - Vercel 自動偵測並開始重新部署

### 部署狀態

- **Commit**: `chore: 觸發 Vercel 重新部署以套用 LINE_CHANNEL_ACCESS_TOKEN 環境變數`
- **狀態**: 已推送至 GitHub
- **預計完成時間**: 2-3 分鐘

---

## 📱 測試步驟

### 等待部署完成

1. 前往 [Vercel Dashboard](https://vercel.com/dashboard)
2. 選擇您的 `trade` 專案
3. 等待部署狀態變為「Ready」（綠色勾勾）
4. 預計需要 2-3 分鐘

### 測試 LINE 通知

1. **重新整理 APP**：
   - 開啟您的 APP：https://trade-iota-nine.vercel.app
   - 按 Ctrl+Shift+R（Windows）或 Cmd+Shift+R（Mac）強制重新整理

2. **測試手動報告**：
   - 點擊右上角的「📱 LINE 報告」按鈕
   - 應該會看到成功訊息（不再顯示錯誤）
   - 檢查 LINE 是否收到訊息

3. **測試自動警示**：
   - 保持 APP 開啟
   - 等待股價波動
   - 當損益從最高點回落 10%/20%/30% 時會自動發送 LINE 通知

---

## 🎯 預期結果

### 成功指標

1. **不再顯示錯誤**：
   - 點擊「LINE 報告」後不會出現紅色錯誤橫幅
   - 或顯示「LINE 通知發送成功」訊息

2. **收到 LINE 訊息**：
   - 格式：
     ```
     📊 每日持股報告

     總損益：-46,705 元
     總報酬率：-8.42%

     個股明細：
     2330 台積電
     損益：-3,292 元 (-1.69%)

     1815
     損益：-4,461 元 (-4.62%)

     4989
     損益：-10,776 元 (-15.32%)

     2344
     損益：-12,870 元 (-18.32%)

     2408
     損益：-16,166 元 (-21.32%)
     ```

3. **高峰回落警示正常**：
   - 當損益回落時會收到類似訊息：
     ```
     ⚠️ 高峰回落警示

     📊 股票：2330 台積電
     📈 最高損益：+15,678 元
     📉 目前損益：+12,543 元
     ⬇️ 回落幅度：20.00%

     💡 建議：考慮是否減碼或停利
     ```

---

## 🔧 故障排除

### 如果部署完成後仍然失敗

#### 檢查 1：確認環境變數正確
1. 前往 Vercel → Settings → Environment Variables
2. 確認 `LINE_CHANNEL_ACCESS_TOKEN` 存在且有值
3. 確認「Environments」勾選了 Production

#### 檢查 2：確認 Token 有效
1. 前往 [LINE Developers Console](https://developers.line.biz/console/)
2. 檢查 Channel Access Token 是否過期
3. 如果過期，重新生成並更新 Vercel 環境變數

#### 檢查 3：查看 Vercel 部署日誌
1. Vercel Dashboard → Deployments → 最新部署
2. 點擊「Runtime Logs」
3. 查看是否有錯誤訊息

#### 檢查 4：查看瀏覽器 Console
1. 在 APP 中按 F12 開啟開發者工具
2. 切換到「Console」分頁
3. 點擊「LINE 報告」按鈕
4. 查看是否有錯誤訊息

### 常見錯誤訊息

#### 錯誤：LINE API error: {"message":"Invalid reply token"}
**原因**：使用了 reply token 而非 broadcast
**解決**：這個錯誤不應該出現，因為我們使用的是 broadcast API

#### 錯誤：LINE API error: {"message":"The request body has 1 error(s)"}
**原因**：訊息格式錯誤
**解決**：檢查 `/api/send-line.js` 的訊息格式

#### 錯誤：Network request failed
**原因**：網路連線問題或 CORS 問題
**解決**：
- 檢查網路連線
- 確認 Vercel Serverless Function 正常運作

---

## 📊 技術細節

### Vercel 環境變數的運作方式

**設定時機**：
- 環境變數在**建置時**（Build Time）和**執行時**（Runtime）都可用
- Serverless Functions 在每次呼叫時讀取環境變數

**生效時機**：
- 修改環境變數後，**只有新的部署**才會使用新值
- 已經部署的版本仍然使用舊值（或沒有值）

**最佳實踐**：
1. 先設定環境變數
2. 再部署應用程式
3. 或在設定後立即重新部署

### LINE Messaging API 架構

**前端 → 後端 → LINE**：
```
React App (瀏覽器)
  ↓ POST /api/send-line
Vercel Serverless Function
  ↓ 讀取 process.env.LINE_CHANNEL_ACCESS_TOKEN
  ↓ POST https://api.line.me/v2/bot/message/broadcast
LINE Messaging API
  ↓ 發送訊息
使用者的 LINE
```

**為什麼需要後端**：
1. 瀏覽器無法直接呼叫 MCP CLI
2. Channel Access Token 不應暴露在前端
3. 需要伺服器環境來執行 API 呼叫

---

## 🎓 學習要點

### Vercel 環境變數管理

**重要概念**：
- 環境變數是在部署時注入的
- 修改後必須重新部署
- 可以針對不同環境（Production/Preview/Development）設定不同值

**觸發部署的方法**：
1. 推送新的 commit 到 GitHub
2. 在 Vercel Dashboard 手動點擊「Redeploy」
3. 使用 Vercel CLI：`vercel --prod`

### LINE Messaging API 配額

**免費方案限制**：
- **500 則/月**（不是 200 則）
- 計算方式：訊息數 × 接收者數
- 例如：發送 1 則訊息給 10 個好友 = 消耗 10 則額度

**監控使用量**：
1. LINE Developers Console
2. Messaging API → Usage
3. 查看當月已使用額度

**節省額度的建議**：
- 使用 Push Message 而非 Broadcast（只發給特定使用者）
- 設定警示頻率限制（已實作：每小時最多 1 次）
- 合併多個通知為單一訊息

---

## ✅ 確認清單

部署完成後，請確認以下項目：

- [ ] Vercel 部署狀態顯示「Ready」
- [ ] APP 重新整理後不再顯示「LINE_CHANNEL_ACCESS_TOKEN not configured」錯誤
- [ ] 點擊「LINE 報告」按鈕後收到 LINE 訊息
- [ ] LINE 訊息內容正確（包含總損益和個股明細）
- [ ] 高峰回落警示功能正常（需要等待股價波動）

---

## 📞 需要協助？

如果完成上述步驟後仍然無法正常運作，請提供以下資訊：

1. **Vercel 部署日誌**：
   - Vercel Dashboard → Deployments → 最新部署 → Runtime Logs
   - 截圖或複製錯誤訊息

2. **瀏覽器 Console 錯誤**：
   - 按 F12 → Console 分頁
   - 點擊「LINE 報告」後的錯誤訊息

3. **LINE Developers Console 狀態**：
   - Channel Access Token 是否有效
   - 訊息使用量是否已達上限

我會立即協助您診斷和解決問題！
