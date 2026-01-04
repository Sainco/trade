// Render Webhook Server for Scheduled Reports
// 定時報告服務（每日收盤後自動發送）

const express = require('express');
const fetch = require('node-fetch');
const admin = require('firebase-admin');

const app = express();
app.use(express.json());

// Firebase Admin SDK 初始化
const serviceAccount = {
  type: "service_account",
  project_id: "trade-sync-e41ce",
  private_key_id: process.env.FIREBASE_PRIVATE_KEY_ID,
  private_key: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
  client_email: process.env.FIREBASE_CLIENT_EMAIL,
  client_id: process.env.FIREBASE_CLIENT_ID,
  auth_uri: "https://accounts.google.com/o/oauth2/auth",
  token_uri: "https://oauth2.googleapis.com/token",
  auth_provider_x509_cert_url: "https://www.googleapis.com/oauth2/v1/certs",
  client_x509_cert_url: process.env.FIREBASE_CERT_URL
};

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

// Telegram Bot 設定
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '8257467510:AAG6Sz3nVEgOzmWfOi2s1Ogl8uLT0JVo51Q';
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID || '8214660758';

// 發送 Telegram 訊息
async function sendTelegramMessage(message) {
  try {
    const response = await fetch(
      `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: TELEGRAM_CHAT_ID,
          text: message,
          parse_mode: 'HTML'
        })
      }
    );
    
    const data = await response.json();
    return data.ok;
  } catch (error) {
    console.error('Telegram 發送失敗:', error);
    return false;
  }
}

// 計算損益數據
function calculateProfit(stock, config) {
  const shares = stock.qty * 1000;
  const buyTotal = stock.buyPrice * shares;
  const currentTotal = stock.currentPrice * shares;
  const buyFee = Math.max(config.MIN_FEE, Math.floor(buyTotal * config.FEE_RATE * config.DISCOUNT));
  const totalCost = buyTotal + buyFee;
  const sellFee = Math.max(config.MIN_FEE, Math.floor(currentTotal * config.FEE_RATE * config.DISCOUNT));
  const tax = Math.floor(currentTotal * config.TAX_RATE);
  const netProfit = currentTotal - sellFee - tax - totalCost;
  const returnRate = (netProfit / totalCost) * 100;
  
  let changePercent = 0;
  if (stock.previousClose) {
    changePercent = ((stock.currentPrice - stock.previousClose) / stock.previousClose) * 100;
  }
  
  return { netProfit, returnRate, changePercent };
}

// 每日收盤報告
app.post('/daily-report', async (req, res) => {
  try {
    console.log('開始生成每日報告...');
    
    // 從 Firebase 取得資料
    const docRef = db.collection('users').doc('sainco_trading_data');
    const doc = await docRef.get();
    
    if (!doc.exists) {
      return res.status(404).json({ error: '找不到資料' });
    }
    
    const data = doc.data();
    const inventory = data.stocks || [];
    const config = data.config || {
      FEE_RATE: 0.001425,
      DISCOUNT: 0.23,
      TAX_RATE: 0.0015,
      MIN_FEE: 20
    };
    
    if (inventory.length === 0) {
      return res.json({ message: '目前無持股，無需發送報告' });
    }
    
    // 計算總損益
    let totalNet = 0;
    let profitStocks = 0;
    let lossStocks = 0;
    const stockDetails = [];
    
    inventory.forEach(stock => {
      const { netProfit, returnRate, changePercent } = calculateProfit(stock, config);
      totalNet += netProfit;
      
      if (netProfit > 0) profitStocks++;
      else if (netProfit < 0) lossStocks++;
      
      const changeStr = changePercent !== 0 
        ? ` (今日${changePercent >= 0 ? '+' : ''}${changePercent.toFixed(2)}%)` 
        : '';
      const profitColor = netProfit >= 0 ? '🔴' : '🟢';
      
      stockDetails.push(
        `${profitColor} <code>${stock.code} ${stock.name || ''}</code>: ${netProfit >= 0 ? '+' : ''}${Math.floor(netProfit).toLocaleString()} (${returnRate.toFixed(2)}%)${changeStr}`
      );
    });
    
    // 生成報告訊息
    const message = `<b>📊 每日收盤報告</b>

<b>💰 總損益：</b>${totalNet >= 0 ? '+' : ''}${Math.floor(totalNet).toLocaleString()} 元

<b>📈 獲利股票：</b>${profitStocks} 檔
<b>📉 虧損股票：</b>${lossStocks} 檔

<b>持股明細：</b>
${stockDetails.join('\n')}

<i>📅 報告時間：${new Date().toLocaleString('zh-TW', { timeZone: 'Asia/Taipei' })}</i>`;
    
    // 發送到 Telegram
    const success = await sendTelegramMessage(message);
    
    if (success) {
      console.log('每日報告發送成功');
      res.json({ 
        success: true, 
        message: '每日報告已發送',
        totalProfit: totalNet,
        stockCount: inventory.length
      });
    } else {
      throw new Error('Telegram 發送失敗');
    }
    
  } catch (error) {
    console.error('生成報告失敗:', error);
    res.status(500).json({ error: error.message });
  }
});

// 週報
app.post('/weekly-report', async (req, res) => {
  try {
    console.log('開始生成週報...');
    
    const docRef = db.collection('users').doc('sainco_trading_data');
    const doc = await docRef.get();
    
    if (!doc.exists) {
      return res.status(404).json({ error: '找不到資料' });
    }
    
    const data = doc.data();
    const inventory = data.stocks || [];
    const config = data.config || {
      FEE_RATE: 0.001425,
      DISCOUNT: 0.23,
      TAX_RATE: 0.0015,
      MIN_FEE: 20
    };
    
    if (inventory.length === 0) {
      return res.json({ message: '目前無持股，無需發送週報' });
    }
    
    // 計算總損益和統計
    let totalNet = 0;
    let totalInvestment = 0;
    const stockDetails = [];
    
    inventory.forEach(stock => {
      const { netProfit, returnRate } = calculateProfit(stock, config);
      const shares = stock.qty * 1000;
      const buyTotal = stock.buyPrice * shares;
      const buyFee = Math.max(config.MIN_FEE, Math.floor(buyTotal * config.FEE_RATE * config.DISCOUNT));
      const investment = buyTotal + buyFee;
      
      totalNet += netProfit;
      totalInvestment += investment;
      
      const profitColor = netProfit >= 0 ? '🔴' : '🟢';
      stockDetails.push(
        `${profitColor} <code>${stock.code}</code>: ${netProfit >= 0 ? '+' : ''}${Math.floor(netProfit).toLocaleString()} (${returnRate.toFixed(2)}%)`
      );
    });
    
    const totalReturnRate = (totalNet / totalInvestment) * 100;
    
    // 找出最佳和最差表現
    const sortedByProfit = [...inventory].map(stock => ({
      ...stock,
      profit: calculateProfit(stock, config).netProfit,
      returnRate: calculateProfit(stock, config).returnRate
    })).sort((a, b) => b.profit - a.profit);
    
    const bestStock = sortedByProfit[0];
    const worstStock = sortedByProfit[sortedByProfit.length - 1];
    
    const message = `<b>📊 本週投資總結</b>

<b>💰 總損益：</b>${totalNet >= 0 ? '+' : ''}${Math.floor(totalNet).toLocaleString()} 元
<b>📊 總報酬率：</b>${totalReturnRate >= 0 ? '+' : ''}${totalReturnRate.toFixed(2)}%
<b>💵 總投入：</b>${Math.floor(totalInvestment).toLocaleString()} 元

<b>🏆 最佳表現：</b>
<code>${bestStock.code} ${bestStock.name || ''}</code>
損益：${bestStock.profit >= 0 ? '+' : ''}${Math.floor(bestStock.profit).toLocaleString()} (${bestStock.returnRate.toFixed(2)}%)

<b>📉 最差表現：</b>
<code>${worstStock.code} ${worstStock.name || ''}</code>
損益：${worstStock.profit >= 0 ? '+' : ''}${Math.floor(worstStock.profit).toLocaleString()} (${worstStock.returnRate.toFixed(2)}%)

<b>持股明細：</b>
${stockDetails.join('\n')}

<i>📅 報告時間：${new Date().toLocaleString('zh-TW', { timeZone: 'Asia/Taipei' })}</i>`;
    
    const success = await sendTelegramMessage(message);
    
    if (success) {
      console.log('週報發送成功');
      res.json({ 
        success: true, 
        message: '週報已發送',
        totalProfit: totalNet,
        totalReturnRate: totalReturnRate
      });
    } else {
      throw new Error('Telegram 發送失敗');
    }
    
  } catch (error) {
    console.error('生成週報失敗:', error);
    res.status(500).json({ error: error.message });
  }
});

// 健康檢查
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// 測試端點
app.get('/test', async (req, res) => {
  const testMessage = `🧪 <b>Render Webhook 測試</b>

✅ 伺服器運作正常
📅 時間：${new Date().toLocaleString('zh-TW', { timeZone: 'Asia/Taipei' })}`;
  
  const success = await sendTelegramMessage(testMessage);
  res.json({ success, message: success ? '測試訊息已發送' : '發送失敗' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Webhook server running on port ${PORT}`);
  console.log(`Health check: http://localhost:${PORT}/health`);
  console.log(`Test endpoint: http://localhost:${PORT}/test`);
});
