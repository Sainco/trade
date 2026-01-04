# Render Webhook 定時報告設定指南

## 📋 概述

Render Webhook 服務用於定時自動發送報告到 Telegram，無需開啟 APP 也能收到每日收盤報告和週報。

---

## 🎯 功能特色

### 1. 每日收盤報告
- **觸發時間**：每日收盤後（可自訂）
- **內容**：總損益、獲利/虧損股票數、持股明細、今日漲跌幅
- **發送方式**：自動推送到 Telegram

### 2. 週報
- **觸發時間**：每週五收盤後（可自訂）
- **內容**：週總損益、總報酬率、最佳/最差表現、持股明細
- **發送方式**：自動推送到 Telegram

### 3. 健康檢查
- **端點**：`/health`
- **用途**：確認服務運作正常

---

## 🚀 部署到 Render

### 步驟 1：準備 Firebase Admin SDK 憑證

1. 前往 [Firebase Console](https://console.firebase.google.com/)
2. 選擇您的專案（trade-sync-e41ce）
3. 點擊左側「專案設定」（齒輪圖示）
4. 選擇「服務帳戶」分頁
5. 點擊「產生新的私密金鑰」
6. 下載 JSON 檔案

JSON 檔案內容範例：
```json
{
  "type": "service_account",
  "project_id": "trade-sync-e41ce",
  "private_key_id": "...",
  "private_key": "-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n",
  "client_email": "...",
  "client_id": "...",
  "auth_uri": "https://accounts.google.com/o/oauth2/auth",
  "token_uri": "https://oauth2.googleapis.com/token",
  "auth_provider_x509_cert_url": "https://www.googleapis.com/oauth2/v1/certs",
  "client_x509_cert_url": "..."
}
```

### 步驟 2：在 Render 建立新服務

1. 前往 [Render Dashboard](https://dashboard.render.com/)
2. 點擊「New +」→「Web Service」
3. 連接您的 GitHub 帳號
4. 選擇 `Sainco/trade` 儲存庫
5. 設定如下：
   - **Name**: `trade-webhook-server`
   - **Region**: Singapore（或離您最近的區域）
   - **Branch**: `main`
   - **Root Directory**: `webhook-server`
   - **Runtime**: Node
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
   - **Plan**: Free

### 步驟 3：設定環境變數

在 Render 的環境變數設定中新增以下變數：

| 變數名稱 | 變數值 | 說明 |
|---------|--------|------|
| `TELEGRAM_BOT_TOKEN` | `8257467510:AAG6Sz3nVEgOzmWfOi2s1Ogl8uLT0JVo51Q` | Telegram Bot Token |
| `TELEGRAM_CHAT_ID` | `8214660758` | 您的 Telegram Chat ID |
| `FIREBASE_PRIVATE_KEY_ID` | 從 JSON 檔案複製 | Firebase 私鑰 ID |
| `FIREBASE_PRIVATE_KEY` | 從 JSON 檔案複製（完整內容） | Firebase 私鑰 |
| `FIREBASE_CLIENT_EMAIL` | 從 JSON 檔案複製 | Firebase 客戶端 Email |
| `FIREBASE_CLIENT_ID` | 從 JSON 檔案複製 | Firebase 客戶端 ID |
| `FIREBASE_CERT_URL` | 從 JSON 檔案複製 `client_x509_cert_url` | Firebase 憑證 URL |

**重要**：
- `FIREBASE_PRIVATE_KEY` 必須包含完整的私鑰，包括 `-----BEGIN PRIVATE KEY-----` 和 `-----END PRIVATE KEY-----`
- 換行符號會自動處理，直接複製貼上即可

### 步驟 4：部署

1. 點擊「Create Web Service」
2. 等待部署完成（約 2-3 分鐘）
3. 部署成功後會顯示服務 URL，例如：`https://trade-webhook-server.onrender.com`

### 步驟 5：測試服務

#### 測試 1：健康檢查
```bash
curl https://trade-webhook-server.onrender.com/health
```

預期回應：
```json
{
  "status": "ok",
  "timestamp": "2026-01-03T13:40:00.000Z"
}
```

#### 測試 2：發送測試訊息
```bash
curl https://trade-webhook-server.onrender.com/test
```

預期回應：
```json
{
  "success": true,
  "message": "測試訊息已發送"
}
```

您應該會在 Telegram 收到測試訊息。

#### 測試 3：每日報告
```bash
curl -X POST https://trade-webhook-server.onrender.com/daily-report
```

預期回應：
```json
{
  "success": true,
  "message": "每日報告已發送",
  "totalProfit": -46705,
  "stockCount": 5
}
```

您應該會在 Telegram 收到每日報告。

---

## ⏰ 設定定時任務

### 使用 Render Cron Jobs（推薦）

Render 提供免費的 Cron Jobs 功能，可以定時觸發 Webhook。

#### 步驟 1：建立 Cron Job

1. 在 Render Dashboard 點擊「New +」→「Cron Job」
2. 設定如下：
   - **Name**: `daily-report-cron`
   - **Command**: `curl -X POST https://trade-webhook-server.onrender.com/daily-report`
   - **Schedule**: `0 14 * * 1-5`（週一到週五下午 2 點，台股收盤後）
   - **Region**: Singapore

#### 步驟 2：建立週報 Cron Job

1. 再次點擊「New +」→「Cron Job」
2. 設定如下：
   - **Name**: `weekly-report-cron`
   - **Command**: `curl -X POST https://trade-webhook-server.onrender.com/weekly-report`
   - **Schedule**: `0 15 * * 5`（每週五下午 3 點）
   - **Region**: Singapore

### Cron 表達式說明

| 表達式 | 說明 | 範例 |
|--------|------|------|
| `0 14 * * 1-5` | 週一到週五 14:00 | 每日收盤報告 |
| `0 15 * * 5` | 每週五 15:00 | 週報 |
| `0 9 * * 1-5` | 週一到週五 09:00 | 盤前報告 |
| `0 12 * * *` | 每天 12:00 | 午盤報告 |

**時區說明**：
- Render 使用 UTC 時區
- 台灣時間（UTC+8）需要減 8 小時
- 例如：台灣 14:00 = UTC 06:00

### 使用外部 Cron 服務（替代方案）

如果不想使用 Render Cron Jobs，可以使用以下免費服務：

#### 1. cron-job.org
1. 前往 [cron-job.org](https://cron-job.org/)
2. 註冊帳號
3. 建立新的 Cron Job
4. URL: `https://trade-webhook-server.onrender.com/daily-report`
5. Method: POST
6. Schedule: 選擇「每日」，時間設為 14:00（台灣時間）

#### 2. EasyCron
1. 前往 [EasyCron](https://www.easycron.com/)
2. 註冊帳號
3. 建立新的 Cron Job
4. URL: `https://trade-webhook-server.onrender.com/daily-report`
5. Cron Expression: `0 14 * * 1-5`

---

## 📊 API 端點說明

### POST /daily-report

**功能**：生成並發送每日收盤報告

**請求**：
```bash
curl -X POST https://trade-webhook-server.onrender.com/daily-report
```

**回應**：
```json
{
  "success": true,
  "message": "每日報告已發送",
  "totalProfit": -46705,
  "stockCount": 5
}
```

**Telegram 訊息範例**：
```
📊 每日收盤報告

💰 總損益：-46,705 元

📈 獲利股票：0 檔
📉 虧損股票：5 檔

持股明細：
🟢 2330 台積電: -3,292 (-1.69%) (今日+2.45%)
🟢 1815: -4,461 (-4.62%)
🟢 4989: -10,776 (-15.32%)
🟢 2344: -12,870 (-18.32%)
🟢 2408: -16,166 (-21.32%)

📅 報告時間：2026/1/3 下午2:00:00
```

### POST /weekly-report

**功能**：生成並發送週報

**請求**：
```bash
curl -X POST https://trade-webhook-server.onrender.com/weekly-report
```

**回應**：
```json
{
  "success": true,
  "message": "週報已發送",
  "totalProfit": -46705,
  "totalReturnRate": -8.52
}
```

**Telegram 訊息範例**：
```
📊 本週投資總結

💰 總損益：-46,705 元
📊 總報酬率：-8.52%
💵 總投入：548,000 元

🏆 最佳表現：
2330 台積電
損益：-3,292 (-1.69%)

📉 最差表現：
2408
損益：-16,166 (-21.32%)

持股明細：
🟢 2330: -3,292 (-1.69%)
🟢 1815: -4,461 (-4.62%)
🟢 4989: -10,776 (-15.32%)
🟢 2344: -12,870 (-18.32%)
🟢 2408: -16,166 (-21.32%)

📅 報告時間：2026/1/3 下午3:00:00
```

### GET /health

**功能**：健康檢查

**請求**：
```bash
curl https://trade-webhook-server.onrender.com/health
```

**回應**：
```json
{
  "status": "ok",
  "timestamp": "2026-01-03T13:40:00.000Z"
}
```

### GET /test

**功能**：發送測試訊息到 Telegram

**請求**：
```bash
curl https://trade-webhook-server.onrender.com/test
```

**回應**：
```json
{
  "success": true,
  "message": "測試訊息已發送"
}
```

---

## 🔍 故障排除

### 問題 1：部署失敗

**錯誤訊息**：「Build failed」

**可能原因**：
- Node.js 版本不相容
- 依賴套件安裝失敗

**解決方法**：
1. 檢查 Render 部署日誌
2. 確認 `package.json` 中的 `engines` 設定
3. 確認所有依賴套件都已列在 `dependencies` 中

### 問題 2：Firebase 連線失敗

**錯誤訊息**：「Firebase Admin SDK initialization failed」

**可能原因**：
- Firebase 環境變數未設定或錯誤
- 私鑰格式不正確

**解決方法**：
1. 確認所有 Firebase 環境變數都已設定
2. 確認 `FIREBASE_PRIVATE_KEY` 包含完整的私鑰
3. 確認私鑰中的換行符號正確（`\n`）
4. 重新下載 Firebase Admin SDK JSON 檔案

### 問題 3：Telegram 發送失敗

**錯誤訊息**：「Telegram 發送失敗」

**可能原因**：
- Bot Token 錯誤
- Chat ID 錯誤
- 網路連線問題

**解決方法**：
1. 確認 `TELEGRAM_BOT_TOKEN` 正確
2. 確認 `TELEGRAM_CHAT_ID` 正確
3. 測試 Bot Token：`curl https://api.telegram.org/bot<TOKEN>/getMe`
4. 確認已與 Bot 開始對話（發送 `/start`）

### 問題 4：Cron Job 未執行

**可能原因**：
- Cron 表達式錯誤
- Render 服務休眠（免費方案）
- 時區設定錯誤

**解決方法**：
1. 檢查 Cron 表達式是否正確
2. 確認 Render 服務狀態為「Running」
3. 確認時區計算正確（UTC vs 台灣時間）
4. 手動觸發測試：`curl -X POST <webhook-url>/daily-report`

### 問題 5：服務休眠

**現象**：首次請求需要等待 30-60 秒

**原因**：Render 免費方案會在 15 分鐘無活動後休眠

**解決方法**：
1. 升級到付費方案（$7/月）
2. 使用外部服務定期 ping `/health` 端點保持喚醒
3. 接受冷啟動延遲（定時報告不受影響）

---

## 💡 進階設定

### 自訂報告時間

編輯 `webhook-server/index.js`，修改報告內容和格式。

### 新增更多報告類型

在 `index.js` 中新增新的端點：

```javascript
app.post('/custom-report', async (req, res) => {
  // 自訂報告邏輯
});
```

### 整合其他通知管道

除了 Telegram，也可以整合：
- LINE Notify
- Email
- Discord
- Slack

---

## 📊 環境變數總覽

| 變數名稱 | 必要性 | 說明 |
|---------|--------|------|
| `TELEGRAM_BOT_TOKEN` | 必要 | Telegram Bot 認證 Token |
| `TELEGRAM_CHAT_ID` | 必要 | Telegram 訊息接收者 ID |
| `FIREBASE_PRIVATE_KEY_ID` | 必要 | Firebase Admin SDK 私鑰 ID |
| `FIREBASE_PRIVATE_KEY` | 必要 | Firebase Admin SDK 私鑰 |
| `FIREBASE_CLIENT_EMAIL` | 必要 | Firebase Admin SDK 客戶端 Email |
| `FIREBASE_CLIENT_ID` | 必要 | Firebase Admin SDK 客戶端 ID |
| `FIREBASE_CERT_URL` | 必要 | Firebase Admin SDK 憑證 URL |
| `PORT` | 選用 | 伺服器埠號（Render 自動設定） |

---

## 🎯 檢查清單

部署完成後，請確認以下項目：

- [ ] Render 服務部署成功
- [ ] 所有環境變數都已設定
- [ ] `/health` 端點回應正常
- [ ] `/test` 端點發送測試訊息成功
- [ ] Telegram 收到測試訊息
- [ ] `/daily-report` 端點發送報告成功
- [ ] Telegram 收到每日報告
- [ ] Cron Job 已設定
- [ ] Cron Job 執行時間正確（考慮時區）

---

## 📞 需要協助？

如果您在部署過程中遇到任何問題：

1. 檢查 Render 部署日誌
2. 檢查 Runtime Logs
3. 測試各個端點
4. 提供錯誤訊息截圖

我會立即協助您診斷和解決問題！

---

## 🎉 完成！

恭喜！您的 Render Webhook 定時報告系統已經設定完成。

### 功能總結

✅ 每日收盤後自動發送報告到 Telegram
✅ 每週五發送週報
✅ 無需開啟 APP 也能收到報告
✅ 完全免費（Render 免費方案）

### 下一步

您可以：
1. 自訂報告內容和格式
2. 新增更多報告類型（月報、季報）
3. 整合其他通知管道
4. 升級到付費方案避免服務休眠

隨時告訴我您的需求，我會立即協助您！🚀
