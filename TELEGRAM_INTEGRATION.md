# Telegram Bot 整合說明

## ✅ 測試結果

**狀態**：成功！

我已成功透過 Telegram Bot API 發送測試訊息到您的 Telegram。

### 測試訊息內容
```
🧪 Manus API 測試訊息

✅ Webhook 串聯成功！
✅ Telegram Bot 運作正常！

📊 未實現損益 APP 已準備好整合 Telegram 通知功能。

🚀 測試時間：2026-01-03 21:40:00
💡 Bot: SaincoStock_bot
```

---

## 📋 您的 Telegram Bot 資訊

### Bot 基本資訊
- **Bot 名稱**：Manus交易助手
- **Bot Username**：@SaincoStock_bot
- **Bot Token**：`8257467510:AAGqX2f3SgW6oZQ2fDXCzHucJJqJwcLb0rg`
- **您的 Chat ID**：`8214660758`

### 安全提醒
⚠️ **Bot Token 是敏感資訊**，請妥善保管：
- 不要公開分享
- 不要提交到 GitHub（使用環境變數）
- 如果洩露，請立即在 BotFather 重新生成

---

## 🔗 API 連接測試

### 測試 1：取得 Bot 資訊
```bash
curl "https://api.telegram.org/bot8257467510:AAGqX2f3SgW6oZQ2fDXCzHucJJqJwcLb0rg/getMe"
```

**結果**：✅ 成功

### 測試 2：取得更新（Chat ID）
```bash
curl "https://api.telegram.org/bot8257467510:AAGqX2f3SgW6oZQ2fDXCzHucJJqJwcLb0rg/getUpdates"
```

**結果**：✅ 成功
- 偵測到您的訊息：「hello」
- 取得 Chat ID：`8214660758`

### 測試 3：發送訊息
```bash
curl -X POST "https://api.telegram.org/bot8257467510:AAGqX2f3SgW6oZQ2fDXCzHucJJqJwcLb0rg/sendMessage" \
  -H "Content-Type: application/json" \
  -d '{
    "chat_id": "8214660758",
    "text": "測試訊息"
  }'
```

**結果**：✅ 成功
- Message ID: 8
- 訊息已送達

---

## 🚀 整合到未實現損益 APP

### 方案 1：建立 Vercel Serverless Function（推薦）

類似 LINE 通知的架構，建立 `/api/send-telegram.js`：

```javascript
// /api/send-telegram.js
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { message } = req.body;

    if (!message) {
      return res.status(400).json({ error: 'Message is required' });
    }

    const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
    const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;

    if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) {
      return res.status(500).json({ 
        error: 'Telegram credentials not configured'
      });
    }

    // 呼叫 Telegram Bot API
    const response = await fetch(
      `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: TELEGRAM_CHAT_ID,
          text: message,
          parse_mode: 'HTML' // 支援 HTML 格式
        })
      }
    );

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(`Telegram API error: ${JSON.stringify(errorData)}`);
    }

    return res.status(200).json({ 
      success: true,
      message: 'Telegram notification sent successfully'
    });

  } catch (error) {
    console.error('Telegram notification error:', error);
    return res.status(500).json({ 
      error: error.message
    });
  }
}
```

### 方案 2：前端直接呼叫（不推薦）

⚠️ **安全風險**：Bot Token 會暴露在前端代碼中

```javascript
const sendTelegramNotification = async (message) => {
  const BOT_TOKEN = '8257467510:AAGqX2f3SgW6oZQ2fDXCzHucJJqJwcLb0rg';
  const CHAT_ID = '8214660758';
  
  const response = await fetch(
    `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: CHAT_ID,
        text: message
      })
    }
  );
  
  return response.json();
};
```

---

## 📝 Vercel 環境變數設定

### 步驟 1：前往 Vercel 設定

1. [Vercel Dashboard](https://vercel.com/dashboard)
2. 選擇 `trade` 專案
3. Settings → Environment Variables

### 步驟 2：新增環境變數

**變數 1**：
- **Name**: `TELEGRAM_BOT_TOKEN`
- **Value**: `8257467510:AAGqX2f3SgW6oZQ2fDXCzHucJJqJwcLb0rg`
- **Environment**: Production, Preview, Development（全選）

**變數 2**：
- **Name**: `TELEGRAM_CHAT_ID`
- **Value**: `8214660758`
- **Environment**: Production, Preview, Development（全選）

### 步驟 3：重新部署

設定完成後，推送任何 commit 到 GitHub 觸發重新部署。

---

## 💡 功能建議

### 1. 每日報告
```
📊 未實現損益日報

📅 日期：2026-01-03
💰 總損益：-46,705 元
📈 總報酬率：-8.42%

個股明細：
━━━━━━━━━━━━━━━
📌 2330 台積電
💵 現價：158.32 元
💰 損益：-3,292 元 (-1.69%)

📌 1815
💵 現價：98.19 元
💰 損益：-4,461 元 (-4.62%)

📌 4989
💵 現價：60.11 元
💰 損益：-10,776 元 (-15.32%)

📌 2344
💵 現價：60.17 元
💰 損益：-12,870 元 (-18.32%)

📌 2408
💵 現價：60.17 元
💰 損益：-16,166 元 (-21.32%)
```

### 2. 高峰回落警示
```
⚠️ 高峰回落警示

📊 股票：2330 台積電
📈 最高損益：+15,678 元
📉 目前損益：+12,543 元
⬇️ 回落幅度：20.00%

💡 建議：考慮是否減碼或停利

🕐 時間：2026-01-03 14:30:00
```

### 3. 價格警示
```
🔔 價格警示

📊 股票：2330 台積電
🎯 目標價：160.00 元
💵 現價：160.50 元
✅ 已達標！

💡 建議：考慮獲利了結

🕐 時間：2026-01-03 14:30:00
```

### 4. 停損警示
```
🚨 停損警示

📊 股票：2330 台積電
🛑 停損價：150.00 元
💵 現價：149.50 元
❌ 已跌破停損價！

💡 建議：立即停損出場

🕐 時間：2026-01-03 14:30:00
```

---

## 🎨 Telegram 訊息格式

### HTML 格式（推薦）

```javascript
const message = `
<b>📊 未實現損益日報</b>

<b>💰 總損益：</b>-46,705 元
<b>📈 總報酬率：</b>-8.42%

<b>個股明細：</b>
━━━━━━━━━━━━━━━
<b>📌 2330 台積電</b>
💵 現價：158.32 元
💰 損益：<code>-3,292 元 (-1.69%)</code>
`;

// 發送時設定 parse_mode: 'HTML'
```

### Markdown 格式

```javascript
const message = `
*📊 未實現損益日報*

*💰 總損益：*-46,705 元
*📈 總報酬率：*-8.42%

*個股明細：*
━━━━━━━━━━━━━━━
*📌 2330 台積電*
💵 現價：158.32 元
💰 損益：\`-3,292 元 (-1.69%)\`
`;

// 發送時設定 parse_mode: 'Markdown'
```

### 純文字格式

```javascript
const message = `
📊 未實現損益日報

💰 總損益：-46,705 元
📈 總報酬率：-8.42%

個股明細：
━━━━━━━━━━━━━━━
📌 2330 台積電
💵 現價：158.32 元
💰 損益：-3,292 元 (-1.69%)
`;

// 不設定 parse_mode
```

---

## 🔔 Telegram vs LINE 比較

### Telegram 優勢
- ✅ **無訊息額度限制**（完全免費）
- ✅ **支援更豐富的格式**（HTML、Markdown）
- ✅ **可以編輯已發送的訊息**
- ✅ **支援 Inline Keyboard**（互動按鈕）
- ✅ **API 更簡單易用**

### LINE 優勢
- ✅ **台灣普及率高**
- ✅ **Flex Message 視覺效果更好**
- ✅ **企業形象較專業**

### 建議
**同時支援兩者**，讓使用者自由選擇：
- 在設定中新增「通知方式」選項
- 可選擇 LINE、Telegram 或兩者都要

---

## 📱 Telegram Bot 進階功能

### 1. Inline Keyboard（互動按鈕）

```javascript
{
  "chat_id": "8214660758",
  "text": "⚠️ 高峰回落 20%，是否減碼？",
  "reply_markup": {
    "inline_keyboard": [
      [
        {"text": "✅ 減碼 50%", "callback_data": "reduce_50"},
        {"text": "✅ 減碼 100%", "callback_data": "reduce_100"}
      ],
      [
        {"text": "❌ 繼續持有", "callback_data": "hold"}
      ]
    ]
  }
}
```

### 2. 編輯訊息

```javascript
// 更新已發送的訊息
fetch(`https://api.telegram.org/bot${BOT_TOKEN}/editMessageText`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    chat_id: CHAT_ID,
    message_id: 8, // 要編輯的訊息 ID
    text: '更新後的內容'
  })
});
```

### 3. 發送照片（圖表截圖）

```javascript
fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendPhoto`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    chat_id: CHAT_ID,
    photo: 'https://example.com/chart.png',
    caption: '📊 今日損益趨勢圖'
  })
});
```

### 4. 發送文件（匯出 CSV）

```javascript
fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendDocument`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    chat_id: CHAT_ID,
    document: 'https://example.com/report.csv',
    caption: '📄 持股明細報表'
  })
});
```

---

## ✅ 確認清單

- [x] Bot Token 已取得
- [x] Chat ID 已取得
- [x] API 連接測試成功
- [x] 測試訊息發送成功
- [ ] 建立 Vercel Serverless Function
- [ ] 設定 Vercel 環境變數
- [ ] 整合到 APP 前端
- [ ] 測試每日報告功能
- [ ] 測試高峰回落警示

---

## 📞 需要協助？

如果您想要：
1. **立即整合 Telegram 通知到 APP**
2. **同時支援 LINE 和 Telegram**
3. **新增互動按鈕功能**
4. **發送圖表截圖**

隨時告訴我，我會立即協助您實作！
