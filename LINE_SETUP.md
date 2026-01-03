# LINE 通知設定指南

## 問題說明

您的 APP 中的 LINE 通知功能無法在瀏覽器環境中直接運作，因為：

1. **MCP CLI 限制**：`manus-mcp-cli` 只能在 Manus 的伺服器環境中執行，無法在使用者的瀏覽器中運行
2. **安全性考量**：LINE Channel Access Token 不應該暴露在前端代碼中
3. **架構需求**：需要透過後端 API 來呼叫 LINE Messaging API

## 解決方案

我已經建立了 Vercel Serverless Function 來處理 LINE 通知，但需要您完成以下設定步驟。

---

## 📋 設定步驟

### 步驟 1：取得 LINE Channel Access Token

1. 前往 [LINE Developers Console](https://developers.line.biz/console/)
2. 登入您的 LINE 帳號
3. 選擇您的 **Provider**
4. 選擇您的 **Messaging API Channel**
5. 進入 **Messaging API** 分頁
6. 找到 **Channel access token (long-lived)**
7. 如果沒有 token，點擊 **Issue** 按鈕生成
8. 複製 token（格式類似：`xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx`）

### 步驟 2：在 Vercel 設定環境變數

1. 前往 [Vercel Dashboard](https://vercel.com/dashboard)
2. 選擇您的 `trade` 專案
3. 進入 **Settings** → **Environment Variables**
4. 新增變數：
   - **Name**: `LINE_CHANNEL_ACCESS_TOKEN`
   - **Value**: 您在步驟 1 複製的 token
   - **Environment**: Production, Preview, Development（全選）
5. 點擊 **Save**
6. 重新部署專案

### 步驟 3：測試 LINE 通知

1. 等待 Vercel 部署完成（約 2-3 分鐘）
2. 開啟您的 APP
3. 點擊「📱 LINE 報告」按鈕
4. 檢查是否收到 LINE 通知

---

## 🔍 為什麼之前測試成功？

您提到「連結測試的時候我確實有收到訊息」，這是因為：

- **在 Manus 環境中測試**：如果您是在 Manus 的對話中要求我發送 LINE 通知，我可以直接呼叫 MCP CLI
- **在瀏覽器中使用**：當您的 APP 部署到 Vercel 並在瀏覽器中開啟時，前端 JavaScript 無法呼叫 MCP CLI

這就是為什麼需要建立後端 API（Vercel Serverless Function）來橋接前端和 LINE Messaging API。

---

## 📁 已建立的檔案

### `/api/send-line.js`

這是 Vercel Serverless Function，負責：
1. 接收前端的 POST 請求
2. 讀取環境變數中的 LINE Channel Access Token
3. 呼叫 LINE Messaging API 發送廣播訊息
4. 回傳結果給前端

### 更新的 `src/App.js`

前端代碼已更新為呼叫 `/api/send-line` endpoint，而不是直接嘗試使用 MCP。

---

## ⚠️ 注意事項

### LINE 訊息額度

- **免費方案**：500 則/月（不是 200 則，LINE 已提升額度）
- **推播訊息**：每次點擊「LINE 報告」會消耗 1 則額度
- **廣播訊息**：發送給所有好友，如果有 10 個好友，消耗 10 則額度

### 高峰回落警示

APP 已內建高峰回落警示功能（10%/20%/30%），當損益從最高點回落時會自動發送 LINE 通知。為避免過度消耗額度：

- 每個警示閾值每小時最多發送一次
- 建議監控訊息額度使用情況

### 測試建議

1. **先測試手動報告**：點擊「LINE 報告」按鈕，確認基本功能正常
2. **再測試自動警示**：等待股價波動觸發高峰回落警示
3. **監控額度**：在 LINE Developers Console 查看訊息使用量

---

## 🛠️ 故障排除

### 錯誤：LINE_CHANNEL_ACCESS_TOKEN not configured

**原因**：環境變數未設定或未生效

**解決方法**：
1. 確認在 Vercel 設定了 `LINE_CHANNEL_ACCESS_TOKEN`
2. 確認選擇了所有環境（Production, Preview, Development）
3. 重新部署專案

### 錯誤：LINE API error

**原因**：Channel Access Token 無效或過期

**解決方法**：
1. 前往 LINE Developers Console
2. 重新生成 Channel Access Token
3. 更新 Vercel 環境變數
4. 重新部署

### 錯誤：Method not allowed

**原因**：API endpoint 被錯誤呼叫

**解決方法**：
- 確認前端代碼使用 POST 方法
- 清除瀏覽器快取並重新整理

---

## 🚀 進階選項

### 使用 Push Message 而非 Broadcast

如果您只想發送給特定使用者而非所有好友，可以修改 `/api/send-line.js`：

```javascript
// 改用 push message endpoint
const response = await fetch('https://api.line.me/v2/bot/message/push', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${LINE_CHANNEL_ACCESS_TOKEN}`
  },
  body: JSON.stringify({
    to: 'USER_ID_HERE', // 需要取得使用者的 LINE User ID
    messages: [
      {
        type: 'text',
        text: message
      }
    ]
  })
});
```

### 使用 Flex Message

如果想要更美觀的訊息格式，可以使用 LINE Flex Message：

```javascript
messages: [
  {
    type: 'flex',
    altText: '每日持股報告',
    contents: {
      type: 'bubble',
      header: {
        type: 'box',
        layout: 'vertical',
        contents: [
          {
            type: 'text',
            text: '📊 每日持股報告',
            weight: 'bold',
            size: 'xl'
          }
        ]
      },
      body: {
        type: 'box',
        layout: 'vertical',
        contents: [
          {
            type: 'text',
            text: message
          }
        ]
      }
    }
  }
]
```

---

## 📞 需要協助？

如果您在設定過程中遇到任何問題，請提供以下資訊：

1. 錯誤訊息截圖
2. Vercel 部署日誌
3. 瀏覽器 Console 錯誤訊息

我會立即協助您解決！
