// Vercel Serverless Function for Telegram Notification
// 處理前端發送的 Telegram 通知請求

export default async function handler(req, res) {
  // 只允許 POST 請求
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { message, parse_mode = 'HTML' } = req.body;

    if (!message) {
      return res.status(400).json({ error: 'Message is required' });
    }

    // 從環境變數讀取 Telegram 憑證
    const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
    const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;

    if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) {
      return res.status(500).json({ 
        error: 'Telegram credentials not configured',
        hint: '請在 Vercel 環境變數中設定 TELEGRAM_BOT_TOKEN 和 TELEGRAM_CHAT_ID'
      });
    }

    // 呼叫 Telegram Bot API sendMessage endpoint
    const response = await fetch(
      `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          chat_id: TELEGRAM_CHAT_ID,
          text: message,
          parse_mode: parse_mode // 支援 HTML 或 Markdown 格式
        })
      }
    );

    const data = await response.json();

    if (!response.ok) {
      throw new Error(`Telegram API error: ${JSON.stringify(data)}`);
    }

    return res.status(200).json({ 
      success: true,
      message: 'Telegram notification sent successfully',
      message_id: data.result.message_id
    });

  } catch (error) {
    console.error('Telegram notification error:', error);
    return res.status(500).json({ 
      error: error.message,
      hint: '請確認 Telegram Bot Token 和 Chat ID 是否正確設定'
    });
  }
}
