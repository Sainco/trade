# Vercel 環境變數設定指南

## 📋 需要設定的環境變數

### 1. LINE Channel Access Token
- **變數名稱**: `LINE_CHANNEL_ACCESS_TOKEN`
- **變數值**: 您的 LINE Channel Access Token
- **用途**: 發送 LINE 通知

### 2. Telegram Bot Token
- **變數名稱**: `TELEGRAM_BOT_TOKEN`
- **變數值**: `8257467510:AAGqX2f3SgW6oZQ2fDXCzHucJJqJwcLb0rg`
- **用途**: 發送 Telegram 通知

### 3. Telegram Chat ID
- **變數名稱**: `TELEGRAM_CHAT_ID`
- **變數值**: `8214660758`
- **用途**: 指定 Telegram 訊息接收者

---

## 🚀 設定步驟

### 步驟 1：前往 Vercel Dashboard

1. 開啟瀏覽器，前往 [Vercel Dashboard](https://vercel.com/dashboard)
2. 登入您的 Vercel 帳號
3. 在專案列表中找到並點擊 **trade** 專案

### 步驟 2：進入環境變數設定頁面

1. 點擊頂部導航列的 **Settings**（設定）
2. 在左側選單中點擊 **Environment Variables**（環境變數）

### 步驟 3：新增 TELEGRAM_BOT_TOKEN

1. 在「Key」欄位輸入：`TELEGRAM_BOT_TOKEN`
2. 在「Value」欄位輸入：`8257467510:AAGqX2f3SgW6oZQ2fDXCzHucJJqJwcLb0rg`
3. 在「Environments」區域，勾選：
   - ✅ Production
   - ✅ Preview
   - ✅ Development
4. 點擊 **Save**（儲存）

### 步驟 4：新增 TELEGRAM_CHAT_ID

1. 在「Key」欄位輸入：`TELEGRAM_CHAT_ID`
2. 在「Value」欄位輸入：`8214660758`
3. 在「Environments」區域，勾選：
   - ✅ Production
   - ✅ Preview
   - ✅ Development
4. 點擊 **Save**（儲存）

### 步驟 5：確認 LINE_CHANNEL_ACCESS_TOKEN

1. 檢查是否已經存在 `LINE_CHANNEL_ACCESS_TOKEN` 環境變數
2. 如果已存在且有值，無需修改
3. 如果不存在，請參考 `LINE_SETUP.md` 完成設定

### 步驟 6：觸發重新部署

**重要**：環境變數修改後必須重新部署才會生效。

**方法 A：自動部署（推薦）**
- Vercel 已自動偵測到 GitHub 的新 commit
- 等待 2-3 分鐘讓部署完成

**方法 B：手動部署**
1. 在 Vercel Dashboard 中，點擊 **Deployments**
2. 找到最新的部署
3. 點擊右側的「...」選單
4. 選擇 **Redeploy**

---

## ✅ 驗證設定

### 步驟 1：等待部署完成

1. 在 Vercel Dashboard → Deployments
2. 等待最新部署的狀態變為 **Ready**（綠色勾勾）
3. 預計需要 2-3 分鐘

### 步驟 2：開啟 APP

1. 前往您的 APP：https://trade-iota-nine.vercel.app
2. 強制重新整理（Ctrl+Shift+R 或 Cmd+Shift+R）

### 步驟 3：測試 Telegram 通知

1. 點擊右上角的「📱 LINE 報告」按鈕
2. 應該會看到提示：「報告已發送到 LINE 和 Telegram！」
3. 檢查您的 Telegram（@SaincoStock_bot）是否收到訊息

### 步驟 4：測試高峰回落警示

1. 保持 APP 開啟
2. 等待股價波動
3. 當損益從最高點回落 10%/20%/30% 時，會自動發送警示到 LINE 和 Telegram

---

## 📱 預期的 Telegram 訊息格式

### 每日報告

```
📊 每日持股報告

💰 總損益：-46,705 元

📈 獲利股票：0 檔
📉 虧損股票：5 檔

持股明細：
🟢 2330 台積電: -3,292 (-1.69%) (今日+2.45%)
🟢 1815: -4,461 (-4.62%)
🟢 4989: -10,776 (-15.32%)
🟢 2344: -12,870 (-18.32%)
🟢 2408: -16,166 (-21.32%)
```

**特色**：
- 使用 HTML 格式
- 粗體標題
- 股票代碼使用等寬字體（`<code>`）
- 獲利用紅色圓圈 🔴，虧損用綠色圓圈 🟢

### 高峰回落警示

```
⚠️ 高峰回落警示

📊 股票：2330 台積電
📈 最高損益：+15,678 元
📉 目前損益：+12,543 元
⬇️ 回落幅度：20.00%

💡 建議：考慮是否減碼或停利
```

---

## 🔍 故障排除

### 問題 1：Telegram 通知失敗

**錯誤訊息**：「Telegram 通知發送失敗：Telegram credentials not configured」

**原因**：環境變數未設定或未生效

**解決方法**：
1. 確認在 Vercel 已設定 `TELEGRAM_BOT_TOKEN` 和 `TELEGRAM_CHAT_ID`
2. 確認「Environments」勾選了 Production
3. 重新部署專案
4. 等待部署完成後再測試

### 問題 2：Telegram API error

**錯誤訊息**：「Telegram API error: {"ok":false,"error_code":401}」

**原因**：Bot Token 無效或錯誤

**解決方法**：
1. 檢查 Token 是否完整複製（包含冒號前後）
2. 確認 Token 格式：`數字:英數字串`
3. 如果 Token 錯誤，在 Vercel 更新後重新部署

### 問題 3：收不到訊息

**可能原因**：
- Chat ID 錯誤
- 尚未與 Bot 開始對話
- Bot 被封鎖

**解決方法**：
1. 在 Telegram 搜尋 `@SaincoStock_bot`
2. 點擊「Start」或發送 `/start`
3. 確認 Chat ID 正確：`8214660758`
4. 確認沒有封鎖 Bot

### 問題 4：LINE 和 Telegram 都失敗

**可能原因**：
- 網路連線問題
- Vercel Serverless Function 錯誤

**解決方法**：
1. 檢查網路連線
2. 查看 Vercel Runtime Logs：
   - Vercel Dashboard → Deployments → 最新部署
   - 點擊「Runtime Logs」
   - 查看錯誤訊息
3. 查看瀏覽器 Console（F12）的錯誤訊息

---

## 🎯 環境變數檢查清單

設定完成後，請確認以下項目：

- [ ] `TELEGRAM_BOT_TOKEN` 已新增
- [ ] `TELEGRAM_CHAT_ID` 已新增
- [ ] `LINE_CHANNEL_ACCESS_TOKEN` 已存在（如果要使用 LINE）
- [ ] 所有環境變數的「Environments」都勾選了 Production
- [ ] 已觸發重新部署
- [ ] 部署狀態顯示「Ready」
- [ ] APP 已強制重新整理
- [ ] 測試訊息發送成功
- [ ] Telegram 收到測試訊息

---

## 📊 環境變數總覽

| 變數名稱 | 變數值 | 用途 | 必要性 |
|---------|--------|------|--------|
| `TELEGRAM_BOT_TOKEN` | `8257467510:AAGqX2f3SgW6oZQ2fDXCzHucJJqJwcLb0rg` | Telegram Bot 認證 | 必要 |
| `TELEGRAM_CHAT_ID` | `8214660758` | Telegram 訊息接收者 | 必要 |
| `LINE_CHANNEL_ACCESS_TOKEN` | 您的 LINE Token | LINE 通知認證 | 選用* |

*註：如果不使用 LINE 通知，可以不設定此變數，但會在點擊「LINE 報告」時顯示錯誤。

---

## 🔐 安全性提醒

### 保護您的 Token

1. **不要公開分享**：
   - 不要將 Token 貼到公開論壇或社群媒體
   - 不要截圖包含 Token 的畫面並分享

2. **不要提交到 GitHub**：
   - Token 應該只存在 Vercel 環境變數中
   - 不要寫在代碼或設定檔中

3. **定期更換**：
   - 建議每 3-6 個月更換一次 Token
   - 如果懷疑 Token 洩露，立即重新生成

### 重新生成 Token

如果需要重新生成 Telegram Bot Token：

1. 在 Telegram 搜尋 `@BotFather`
2. 發送 `/mybots`
3. 選擇您的 Bot（SaincoStock_bot）
4. 選擇「API Token」
5. 選擇「Revoke current token」
6. 複製新的 Token
7. 在 Vercel 更新環境變數
8. 重新部署

---

## 📞 需要協助？

如果您在設定過程中遇到任何問題：

1. **檢查 Vercel 部署日誌**
2. **檢查瀏覽器 Console 錯誤**
3. **確認所有步驟都已完成**
4. **提供錯誤訊息截圖**

我會立即協助您診斷和解決問題！

---

## 🎉 設定完成後

恭喜！您的 APP 現在已經整合了 Telegram 通知功能。

### 功能清單

✅ 每日報告同時發送到 LINE 和 Telegram
✅ 高峰回落警示自動推送到兩個平台
✅ Telegram 訊息使用 HTML 格式，更美觀易讀
✅ 完全免費，無訊息額度限制

### 下一步

您可以：
1. 測試高峰回落警示功能
2. 自訂警示閾值（目前為 10%/20%/30%）
3. 新增更多通知功能（價格警示、停損警示等）
4. 整合 Render Webhook 實現定時報告

隨時告訴我您的需求，我會立即協助您！🚀
