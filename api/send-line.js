// Vercel Serverless Function for LINE Notification
// 此檔案需要部署到 Vercel 才能運作

export default async function handler(req, res) {
  // 只允許 POST 請求
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { message } = req.body;

    if (!message) {
      return res.status(400).json({ error: 'Message is required' });
    }

    // 注意：Vercel Serverless Function 無法直接呼叫 manus-mcp-cli
    // 需要改用 LINE Messaging API 的 HTTP endpoint
    
    const LINE_CHANNEL_ACCESS_TOKEN = process.env.LINE_CHANNEL_ACCESS_TOKEN;
    
    if (!LINE_CHANNEL_ACCESS_TOKEN) {
      return res.status(500).json({ 
        error: 'LINE_CHANNEL_ACCESS_TOKEN not configured',
        hint: '請在 Vercel 環境變數中設定 LINE_CHANNEL_ACCESS_TOKEN'
      });
    }

    // 呼叫 LINE Messaging API broadcast endpoint
    const response = await fetch('https://api.line.me/v2/bot/message/broadcast', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${LINE_CHANNEL_ACCESS_TOKEN}`
      },
      body: JSON.stringify({
        messages: [
          {
            type: 'text',
            text: message
          }
        ]
      })
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(`LINE API error: ${JSON.stringify(errorData)}`);
    }

    return res.status(200).json({ 
      success: true,
      message: 'LINE notification sent successfully'
    });

  } catch (error) {
    console.error('LINE notification error:', error);
    return res.status(500).json({ 
      error: error.message,
      hint: '請確認 LINE Channel Access Token 是否正確設定'
    });
  }
}
