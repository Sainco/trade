import React, { useState, useEffect } from 'react';
import { initializeApp } from "firebase/app";
import { getFirestore, doc, setDoc, onSnapshot } from "firebase/firestore";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

// --- 1. Firebase 設定 ---
const firebaseConfig = {
  apiKey: "AIzaSyB2oHiKQVMU2rXoYI19LdgO8TTSw89bQSs",
  authDomain: "trade-sync-e41ce.firebaseapp.com",
  projectId: "trade-sync-e41ce",
  storageBucket: "trade-sync-e41ce.appspot.com",
  messagingSenderId: "819101665510",
  appId: "1:819101665510:web:e9f69f8239af1ec8b8d327",
  measurementId: "G-3NGZSGS57L"
};

const firebaseApp = initializeApp(firebaseConfig);
const db = getFirestore(firebaseApp);
const USER_DOC_ID = "sainco_trading_data";

// --- 2. 核心參數設定 ---
const DEFAULT_CONFIG = {
  FEE_RATE: 0.001425,
  DISCOUNT: 0.23,
  TAX_RATE: 0.0015,
  MIN_FEE: 20,
  API_KEY: '725bd665-e2ca-4ae4-ba7b-fc8312ac158f'
};

// 台股升降單位
const getTickSize = (p) => {
  if (p < 10) return 0.01; if (p < 50) return 0.05; if (p < 100) return 0.1;
  if (p < 500) return 0.5; if (p < 1000) return 1; return 5;
};

const App = () => {
  const [inputStr, setInputStr] = useState('');
  const [inventory, setInventory] = useState([]);
  const [config, setConfig] = useState(DEFAULT_CONFIG);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [sortBy, setSortBy] = useState('time');
  const [editingId, setEditingId] = useState(null);
  const [editValues, setEditValues] = useState({ buyPrice: '', qty: '' });
  const [showSettings, setShowSettings] = useState(false);
  const [showTotalChart, setShowTotalChart] = useState(false);
  const [expandedCharts, setExpandedCharts] = useState({});
  const [totalHistory, setTotalHistory] = useState([]);
  const [showAIPanel, setShowAIPanel] = useState(false);
  const [aiAnalysis, setAiAnalysis] = useState('');
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  // --- 3. 雲端同步邏輯 ---
  useEffect(() => {
    const unsub = onSnapshot(
      doc(db, "users", USER_DOC_ID),
      (snapshot) => {
        setIsLoading(false);
        if (snapshot.exists()) {
          const data = snapshot.data();
          setInventory(data.stocks || []);
          if (data.config) {
            setConfig({ ...DEFAULT_CONFIG, ...data.config });
          }
          if (data.totalHistory) {
            setTotalHistory(data.totalHistory);
          }
        }
      },
      (err) => {
        setIsLoading(false);
        setError('雲端同步失敗：' + err.message);
      }
    );
    return () => unsub();
  }, []);

  const syncToCloud = async (newStocks, newConfig = null, newTotalHistory = null) => {
    try {
      const dataToSync = { stocks: newStocks };
      if (newConfig) {
        dataToSync.config = newConfig;
      }
      if (newTotalHistory) {
        dataToSync.totalHistory = newTotalHistory;
      }
      await setDoc(doc(db, "users", USER_DOC_ID), dataToSync, { merge: true });
      setError(null);
    } catch (e) {
      setError('同步失敗：' + e.message);
    }
  };

  // --- 4. 股票名稱查詢 ---
  useEffect(() => {
    inventory.forEach(async (stock) => {
      if (!stock.name || stock.name === '') {
        try {
          const response = await fetch(
            `https://api.fugle.tw/marketdata/v1.0/stock/intraday/meta?symbolId=${stock.code}&apiToken=${config.API_KEY}`
          );
          const data = await response.json();
          if (data.data && data.data.meta && data.data.meta.nameZhTw) {
            setInventory(prev => 
              prev.map(s => s.id === stock.id ? { ...s, name: data.data.meta.nameZhTw } : s)
            );
          }
        } catch (e) {
          console.error('查詢股票名稱失敗', e);
        }
      }
    });
  }, [inventory.length, config.API_KEY]);

  // --- 5. WebSocket 報價抓取 + 歷史記錄 ---
  useEffect(() => {
    if (inventory.length === 0) return;
    
    const connections = inventory.map(stock => {
      const ws = new WebSocket(
        `wss://api.fugle.tw/marketdata/v1.0/stock/intraday/quote?symbolId=${stock.code}&apiToken=${config.API_KEY}`
      );
      
      ws.onmessage = (e) => {
        const data = JSON.parse(e.data);
        if (data.event === 'data' && data.data.quote.lastPrice) {
          const newPrice = data.data.quote.lastPrice;
          const now = new Date().toISOString();
          
          setInventory(prev => prev.map(s => {
            if (s.code === stock.code) {
              const { netProfit } = calculateData({ ...s, currentPrice: newPrice });
              
              let highPoint = s.highPoint || { profit: netProfit, time: now };
              let lowPoint = s.lowPoint || { profit: netProfit, time: now };
              
              if (netProfit > highPoint.profit) {
                highPoint = { profit: netProfit, time: now };
              }
              if (netProfit < lowPoint.profit) {
                lowPoint = { profit: netProfit, time: now };
              }
              
              let history = s.history || [];
              const lastRecord = history[history.length - 1];
              const shouldRecord = !lastRecord || 
                (new Date(now) - new Date(lastRecord.time)) > 60000;
              
              if (shouldRecord) {
                history = [...history, { time: now, profit: netProfit, price: newPrice }];
                if (history.length > 100) {
                  history = history.slice(-100);
                }
              }
              
              return { ...s, currentPrice: newPrice, highPoint, lowPoint, history };
            }
            return s;
          }));
        }
      };
      
      ws.onerror = () => {
        setError(`股票 ${stock.code} 報價連線失敗`);
      };
      
      return ws;
    });
    
    return () => connections.forEach(ws => ws.close());
  }, [inventory.length, config.API_KEY]);

  // --- 6. 總損益歷史記錄 ---
  useEffect(() => {
    if (inventory.length === 0) return;
    
    const interval = setInterval(() => {
      const now = new Date().toISOString();
      const totalNet = inventory.reduce((sum, s) => sum + calculateData(s).netProfit, 0);
      
      const newHistory = [...totalHistory, { time: now, profit: totalNet }];
      const trimmedHistory = newHistory.length > 100 ? newHistory.slice(-100) : newHistory;
      
      setTotalHistory(trimmedHistory);
      syncToCloud(inventory, null, trimmedHistory);
    }, 60000);
    
    return () => clearInterval(interval);
  }, [inventory, totalHistory]);

  // --- 7. Gemini AI 分析 ---
  const analyzeWithGemini = async () => {
    setIsAnalyzing(true);
    setShowAIPanel(true);
    
    try {
      const totalNet = inventory.reduce((sum, s) => sum + calculateData(s).netProfit, 0);
      const stockSummary = inventory.map(s => {
        const { netProfit, returnRate } = calculateData(s);
        return `${s.code} ${s.name}: 損益 ${Math.floor(netProfit).toLocaleString()} (${returnRate.toFixed(2)}%)`;
      }).join('\n');
      
      const prompt = `你是一位專業的台股投資顧問。請分析以下持股狀況並提供建議：

總損益：${Math.floor(totalNet).toLocaleString()} 元

持股明細：
${stockSummary}

請提供：
1. 整體投資組合評估
2. 個股表現分析
3. 風險提示
4. 操作建議

請用繁體中文回答，語氣專業但易懂。`;

      const response = await fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent?key=' + process.env.REACT_APP_GEMINI_API_KEY, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }]
        })
      });
      
      const data = await response.json();
      if (data.candidates && data.candidates[0]) {
        setAiAnalysis(data.candidates[0].content.parts[0].text);
      } else {
        setAiAnalysis('AI 分析失敗，請稍後再試。');
      }
    } catch (e) {
      setAiAnalysis('AI 分析發生錯誤：' + e.message);
    }
    
    setIsAnalyzing(false);
  };

  // --- 8. LINE 通知功能 ---
  const sendLineNotification = async (message) => {
    try {
      // 使用 MCP LINE connector
      const result = await window.mcp?.callTool?.('line', 'broadcast_message', {
        message: { type: 'text', text: message }
      });
      
      if (result) {
        alert('LINE 通知已發送！');
      }
    } catch (e) {
      alert('LINE 通知發送失敗：' + e.message);
    }
  };

  const sendDailyReport = () => {
    const totalNet = inventory.reduce((sum, s) => sum + calculateData(s).netProfit, 0);
    const profitStocks = inventory.filter(s => calculateData(s).netProfit > 0).length;
    const lossStocks = inventory.filter(s => calculateData(s).netProfit < 0).length;
    
    const message = `📊 每日持股報告

💰 總損益：${totalNet >= 0 ? '+' : ''}${Math.floor(totalNet).toLocaleString()} 元

📈 獲利股票：${profitStocks} 檔
📉 虧損股票：${lossStocks} 檔

持股明細：
${inventory.map(s => {
  const { netProfit, returnRate } = calculateData(s);
  return `${s.code} ${s.name}: ${netProfit >= 0 ? '+' : ''}${Math.floor(netProfit).toLocaleString()} (${returnRate.toFixed(2)}%)`;
}).join('\n')}`;
    
    sendLineNotification(message);
  };

  const calculateData = (stock) => {
    const shares = stock.qty * 1000;
    const buyTotal = stock.buyPrice * shares;
    const currentTotal = stock.currentPrice * shares;
    const buyFee = Math.max(config.MIN_FEE, Math.floor(buyTotal * config.FEE_RATE * config.DISCOUNT));
    const totalCost = buyTotal + buyFee;
    const sellFee = Math.max(config.MIN_FEE, Math.floor(currentTotal * config.FEE_RATE * config.DISCOUNT));
    const tax = Math.floor(currentTotal * config.TAX_RATE);
    const netProfit = currentTotal - sellFee - tax - totalCost;
    const returnRate = (netProfit / totalCost) * 100;
    const breakevenPrice = totalCost / (shares * (1 - config.FEE_RATE * config.DISCOUNT - config.TAX_RATE));
    let ticksToWin = 0; let tempPrice = stock.buyPrice;
    while (tempPrice < breakevenPrice) { tempPrice += getTickSize(tempPrice); ticksToWin++; }
    return { netProfit, returnRate, breakevenPrice, ticksToWin };
  };

  const handleDelete = (id) => {
    if (window.confirm("確定刪除此部位？")) {
      const newStocks = inventory.filter(s => s.id !== id);
      syncToCloud(newStocks);
    }
  };

  const handleAddStock = (e) => {
    if (e.key === 'Enter' && inputStr.trim()) {
      const [code, buyPrice, qty] = inputStr.trim().split(/\s+/);
      if (code && buyPrice && qty) {
        const p = parseFloat(buyPrice); const q = parseFloat(qty);
        let newStocks = [...inventory];
        const idx = inventory.findIndex(s => s.code === code);
        if (idx > -1) {
          const old = inventory[idx]; const newQty = old.qty + q;
          newStocks[idx] = { 
            ...old, 
            buyPrice: ((old.buyPrice * old.qty) + (p * q)) / newQty, 
            qty: newQty 
          };
        } else {
          const now = new Date().toISOString();
          newStocks = [{ 
            id: Date.now(), 
            code, 
            buyPrice: p, 
            qty: q, 
            currentPrice: p, 
            name: '',
            highPoint: { profit: 0, time: now },
            lowPoint: { profit: 0, time: now },
            history: []
          }, ...inventory];
        }
        syncToCloud(newStocks);
        setInputStr('');
      }
    }
  };

  const handleEdit = (stock) => {
    setEditingId(stock.id);
    setEditValues({ buyPrice: stock.buyPrice.toString(), qty: stock.qty.toString() });
  };

  const handleSaveEdit = (id) => {
    const newStocks = inventory.map(s => {
      if (s.id === id) {
        return {
          ...s,
          buyPrice: parseFloat(editValues.buyPrice),
          qty: parseFloat(editValues.qty)
        };
      }
      return s;
    });
    syncToCloud(newStocks);
    setEditingId(null);
  };

  const handleCancelEdit = () => {
    setEditingId(null);
  };

  const handleSaveSettings = () => {
    syncToCloud(inventory, config);
    setShowSettings(false);
  };

  const toggleStockChart = (stockId) => {
    setExpandedCharts(prev => ({
      ...prev,
      [stockId]: !prev[stockId]
    }));
  };

  const getSortedInventory = () => {
    const sorted = [...inventory];
    switch (sortBy) {
      case 'profit':
        return sorted.sort((a, b) => calculateData(b).netProfit - calculateData(a).netProfit);
      case 'code':
        return sorted.sort((a, b) => a.code.localeCompare(b.code));
      case 'return':
        return sorted.sort((a, b) => calculateData(b).returnRate - calculateData(a).returnRate);
      default:
        return sorted;
    }
  };

  const formatChartTime = (timeStr) => {
    const date = new Date(timeStr);
    return date.toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit' });
  };

  const CustomTooltip = ({ active, payload }) => {
    if (active && payload && payload.length) {
      return (
        <div style={styles.tooltip}>
          <p style={styles.tooltipTime}>{new Date(payload[0].payload.time).toLocaleString('zh-TW')}</p>
          <p style={{ ...styles.tooltipValue, color: payload[0].value >= 0 ? '#ff4d4f' : '#52c41a' }}>
            損益: {payload[0].value >= 0 ? '+' : ''}{Math.floor(payload[0].value).toLocaleString()}
          </p>
          {payload[0].payload.price && (
            <p style={styles.tooltipPrice}>價格: {payload[0].payload.price}</p>
          )}
        </div>
      );
    }
    return null;
  };

  const totalNet = inventory.reduce((sum, s) => sum + calculateData(s).netProfit, 0);

  if (isLoading) {
    return (
      <div style={styles.container}>
        <div style={styles.loadingCard}>
          <div style={styles.spinner}></div>
          <div style={styles.loadingText}>載入中...</div>
        </div>
      </div>
    );
  }

  return (
    <div style={styles.container}>
      {error && (
        <div style={styles.errorBanner}>
          <span>⚠️ {error}</span>
          <button onClick={() => setError(null)} style={styles.closeError}>✕</button>
        </div>
      )}
      
      <div style={styles.summaryCard} onClick={() => setShowTotalChart(!showTotalChart)}>
        <div style={styles.summaryHeader}>
          <span style={styles.summaryIcon}>💰</span>
          <div>
            <div style={styles.summaryLabel}>今日總損益</div>
            <div style={styles.summarySubLabel}>點擊查看趨勢圖</div>
          </div>
        </div>
        <div style={{ ...styles.summaryValue, color: totalNet >= 0 ? '#ff4d4f' : '#52c41a' }}>
          {totalNet >= 0 ? '+' : ''}{Math.floor(totalNet).toLocaleString()}
        </div>
        <div style={styles.summaryStats}>
          <div style={styles.statItem}>
            <span style={styles.statIcon}>📈</span>
            <span style={styles.statLabel}>獲利</span>
            <span style={styles.statValue}>{inventory.filter(s => calculateData(s).netProfit > 0).length}</span>
          </div>
          <div style={styles.statDivider}></div>
          <div style={styles.statItem}>
            <span style={styles.statIcon}>📉</span>
            <span style={styles.statLabel}>虧損</span>
            <span style={styles.statValue}>{inventory.filter(s => calculateData(s).netProfit < 0).length}</span>
          </div>
          <div style={styles.statDivider}></div>
          <div style={styles.statItem}>
            <span style={styles.statIcon}>📊</span>
            <span style={styles.statLabel}>總計</span>
            <span style={styles.statValue}>{inventory.length}</span>
          </div>
        </div>
      </div>

      {showTotalChart && totalHistory.length > 0 && (
        <div style={styles.chartContainer}>
          <h3 style={styles.chartTitle}>📈 總損益趨勢圖</h3>
          <ResponsiveContainer width="100%" height={280}>
            <LineChart data={totalHistory}>
              <defs>
                <linearGradient id="colorProfit" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#00d8ff" stopOpacity={0.3}/>
                  <stop offset="95%" stopColor="#00d8ff" stopOpacity={0}/>
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#2a3f5f" opacity={0.3} />
              <XAxis 
                dataKey="time" 
                tickFormatter={formatChartTime}
                stroke="#6b7c93"
                style={{ fontSize: '13px', fontFamily: 'Roboto Mono, monospace' }}
              />
              <YAxis 
                stroke="#6b7c93"
                style={{ fontSize: '13px', fontFamily: 'Roboto Mono, monospace' }}
                tickFormatter={(value) => Math.floor(value).toLocaleString()}
              />
              <Tooltip content={<CustomTooltip />} />
              <Line 
                type="monotone" 
                dataKey="profit" 
                stroke="#00d8ff" 
                strokeWidth={3}
                dot={{ fill: '#00d8ff', r: 4 }}
                activeDot={{ r: 6 }}
                name="總損益"
                fill="url(#colorProfit)"
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      <div style={styles.toolbar}>
        <div style={styles.inputWrapper}>
          <span style={styles.inputIcon}>🔍</span>
          <input 
            style={styles.mainInput} 
            placeholder="輸入：股號 買價 張數（按 Enter）" 
            value={inputStr} 
            onChange={(e) => setInputStr(e.target.value)} 
            onKeyDown={handleAddStock} 
          />
        </div>
        
        <div style={styles.actionBar}>
          <select 
            value={sortBy} 
            onChange={(e) => setSortBy(e.target.value)}
            style={styles.sortSelect}
          >
            <option value="time">⏰ 依時間</option>
            <option value="profit">💰 依損益</option>
            <option value="return">📊 依報酬率</option>
            <option value="code">🔢 依代碼</option>
          </select>
          
          <button onClick={() => setShowSettings(!showSettings)} style={styles.actionBtn}>
            <span style={styles.btnIcon}>⚙️</span>
            <span style={styles.btnText}>設定</span>
          </button>
          
          <button onClick={analyzeWithGemini} style={{...styles.actionBtn, ...styles.aiBtn}}>
            <span style={styles.btnIcon}>🤖</span>
            <span style={styles.btnText}>AI 分析</span>
          </button>
          
          <button onClick={sendDailyReport} style={{...styles.actionBtn, ...styles.lineBtn}}>
            <span style={styles.btnIcon}>📱</span>
            <span style={styles.btnText}>LINE 報告</span>
          </button>
        </div>
      </div>

      {showSettings && (
        <div style={styles.settingsPanel}>
          <div style={styles.panelHeader}>
            <h3 style={styles.panelTitle}>⚙️ 手續費設定</h3>
            <button onClick={() => setShowSettings(false)} style={styles.panelClose}>✕</button>
          </div>
          <div style={styles.settingRow}>
            <label style={styles.settingLabel}>券商折數（折）</label>
            <input 
              type="number" 
              step="0.01"
              value={config.DISCOUNT * 100}
              onChange={(e) => setConfig({ ...config, DISCOUNT: parseFloat(e.target.value) / 100 })}
              style={styles.settingInput}
            />
          </div>
          <div style={styles.settingRow}>
            <label style={styles.settingLabel}>最低手續費（元）</label>
            <input 
              type="number"
              value={config.MIN_FEE}
              onChange={(e) => setConfig({ ...config, MIN_FEE: parseInt(e.target.value) })}
              style={styles.settingInput}
            />
          </div>
          <button onClick={handleSaveSettings} style={styles.saveBtn}>💾 儲存設定</button>
        </div>
      )}

      {showAIPanel && (
        <div style={styles.aiPanel}>
          <div style={styles.panelHeader}>
            <h3 style={styles.panelTitle}>🤖 AI 投資分析</h3>
            <button onClick={() => setShowAIPanel(false)} style={styles.panelClose}>✕</button>
          </div>
          {isAnalyzing ? (
            <div style={styles.aiLoading}>
              <div style={styles.spinner}></div>
              <p style={styles.aiLoadingText}>AI 正在分析您的投資組合...</p>
            </div>
          ) : (
            <div style={styles.aiContent}>
              {aiAnalysis.split('\n').map((line, i) => (
                <p key={i} style={styles.aiText}>{line}</p>
              ))}
            </div>
          )}
        </div>
      )}

      <div style={styles.list}>
        {getSortedInventory().map(stock => {
          const { netProfit, returnRate, breakevenPrice, ticksToWin } = calculateData(stock);
          const isProfit = netProfit >= 0;
          const isEditing = editingId === stock.id;
          const showChart = expandedCharts[stock.id];
          
          return (
            <div key={stock.id} style={{ 
              ...styles.stockCard, 
              borderLeft: `6px solid ${isProfit ? '#ff4d4f' : '#52c41a'}`,
              boxShadow: isProfit 
                ? '0 4px 12px rgba(255, 77, 79, 0.15)' 
                : '0 4px 12px rgba(82, 196, 90, 0.15)'
            }}>
              <div style={styles.cardHeader}>
                <div style={styles.stockInfo}>
                  <div style={styles.stockTitleRow}>
                    <span style={styles.stockCode}>{stock.code}</span>
                    {stock.name && <span style={styles.stockName}>{stock.name}</span>}
                  </div>
                  {isEditing ? (
                    <div style={styles.editRow}>
                      <div style={styles.editGroup}>
                        <label style={styles.editLabel}>買價</label>
                        <input 
                          type="number" 
                          step="0.01"
                          value={editValues.buyPrice}
                          onChange={(e) => setEditValues({ ...editValues, buyPrice: e.target.value })}
                          style={styles.editInput}
                        />
                      </div>
                      <div style={styles.editGroup}>
                        <label style={styles.editLabel}>張數</label>
                        <input 
                          type="number"
                          value={editValues.qty}
                          onChange={(e) => setEditValues({ ...editValues, qty: e.target.value })}
                          style={styles.editInput}
                        />
                      </div>
                    </div>
                  ) : (
                    <div style={styles.stockDetails}>
                      <span style={styles.detailItem}>📦 {stock.qty} 張</span>
                      <span style={styles.detailDivider}>•</span>
                      <span style={styles.detailItem}>💵 {stock.buyPrice.toFixed(2)}</span>
                    </div>
                  )}
                </div>
                <div style={styles.profitSection}>
                  <div style={{ ...styles.netProfit, color: isProfit ? '#ff4d4f' : '#52c41a' }}>
                    {netProfit >= 0 ? '+' : ''}{Math.floor(netProfit).toLocaleString()}
                  </div>
                  <div style={{ ...styles.percent, color: isProfit ? '#ff4d4f' : '#52c41a' }}>
                    {returnRate >= 0 ? '▲' : '▼'} {Math.abs(returnRate).toFixed(2)}%
                  </div>
                </div>
              </div>
              
              <div style={styles.priceInfo}>
                <div style={styles.priceItem}>
                  <span style={styles.priceLabel}>現價</span>
                  <span style={styles.currentPrice}>{stock.currentPrice}</span>
                </div>
                <div style={styles.priceItem}>
                  <span style={styles.priceLabel}>保本</span>
                  <span style={styles.breakevenPrice}>{breakevenPrice.toFixed(2)}</span>
                  <span style={styles.ticksBadge}>{ticksToWin} 跳</span>
                </div>
              </div>

              {stock.highPoint && stock.lowPoint && (
                <div style={styles.extremePoints}>
                  <div style={styles.pointItem}>
                    <span style={styles.pointIcon}>📈</span>
                    <div style={styles.pointContent}>
                      <span style={styles.pointLabel}>最高</span>
                      <span style={{ ...styles.pointValue, color: '#ff4d4f' }}>
                        {Math.floor(stock.highPoint.profit).toLocaleString()}
                      </span>
                    </div>
                    <span style={styles.pointTime}>
                      {new Date(stock.highPoint.time).toLocaleString('zh-TW', { 
                        month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' 
                      })}
                    </span>
                  </div>
                  <div style={styles.pointItem}>
                    <span style={styles.pointIcon}>📉</span>
                    <div style={styles.pointContent}>
                      <span style={styles.pointLabel}>最低</span>
                      <span style={{ ...styles.pointValue, color: '#52c41a' }}>
                        {Math.floor(stock.lowPoint.profit).toLocaleString()}
                      </span>
                    </div>
                    <span style={styles.pointTime}>
                      {new Date(stock.lowPoint.time).toLocaleString('zh-TW', { 
                        month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' 
                      })}
                    </span>
                  </div>
                </div>
              )}

              {showChart && stock.history && stock.history.length > 0 && (
                <div style={styles.stockChartContainer}>
                  <ResponsiveContainer width="100%" height={220}>
                    <LineChart data={stock.history}>
                      <defs>
                        <linearGradient id={`gradient-${stock.id}`} x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor={isProfit ? '#ff4d4f' : '#52c41a'} stopOpacity={0.3}/>
                          <stop offset="95%" stopColor={isProfit ? '#ff4d4f' : '#52c41a'} stopOpacity={0}/>
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="#2a3f5f" opacity={0.3} />
                      <XAxis 
                        dataKey="time" 
                        tickFormatter={formatChartTime}
                        stroke="#6b7c93"
                        style={{ fontSize: '11px', fontFamily: 'Roboto Mono, monospace' }}
                      />
                      <YAxis 
                        stroke="#6b7c93"
                        style={{ fontSize: '11px', fontFamily: 'Roboto Mono, monospace' }}
                        tickFormatter={(value) => Math.floor(value).toLocaleString()}
                      />
                      <Tooltip content={<CustomTooltip />} />
                      <Line 
                        type="monotone" 
                        dataKey="profit" 
                        stroke={isProfit ? '#ff4d4f' : '#52c41a'}
                        strokeWidth={3}
                        dot={{ fill: isProfit ? '#ff4d4f' : '#52c41a', r: 3 }}
                        activeDot={{ r: 5 }}
                        fill={`url(#gradient-${stock.id})`}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              )}
              
              <div style={styles.cardFooter}>
                {isEditing ? (
                  <div style={styles.editActions}>
                    <button onClick={() => handleSaveEdit(stock.id)} style={styles.saveEditBtn}>
                      <span style={styles.btnIcon}>✓</span>
                      <span>儲存</span>
                    </button>
                    <button onClick={handleCancelEdit} style={styles.cancelEditBtn}>
                      <span style={styles.btnIcon}>✕</span>
                      <span>取消</span>
                    </button>
                  </div>
                ) : (
                  <div style={styles.cardActions}>
                    <button onClick={() => toggleStockChart(stock.id)} style={styles.iconBtn}>
                      <span style={styles.iconBtnIcon}>{showChart ? '📊' : '📈'}</span>
                    </button>
                    <button onClick={() => handleEdit(stock)} style={styles.iconBtn}>
                      <span style={styles.iconBtnIcon}>✏️</span>
                    </button>
                    <button onClick={() => handleDelete(stock.id)} style={styles.deleteBtn}>
                      <span style={styles.iconBtnIcon}>🗑️</span>
                    </button>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

const styles = {
  container: { 
    padding: '16px', 
    backgroundColor: '#0f1419', 
    minHeight: '100vh', 
    fontFamily: "'Noto Sans TC', -apple-system, BlinkMacSystemFont, sans-serif",
    maxWidth: '100%',
    overflowX: 'hidden'
  },
  loadingCard: { 
    background: 'linear-gradient(135deg, #1a2332 0%, #2c3e50 100%)', 
    padding: '60px 20px', 
    borderRadius: '24px', 
    textAlign: 'center',
    marginTop: '60px',
    boxShadow: '0 8px 32px rgba(0, 0, 0, 0.3)'
  },
  spinner: {
    border: '4px solid #2a3f5f',
    borderTop: '4px solid #00d8ff',
    borderRadius: '50%',
    width: '56px',
    height: '56px',
    animation: 'spin 1s linear infinite',
    margin: '0 auto'
  },
  loadingText: {
    marginTop: '20px',
    color: '#8b9eb3',
    fontSize: '16px',
    fontWeight: '500'
  },
  errorBanner: {
    background: 'linear-gradient(135deg, #ff4d4f 0%, #d9363e 100%)',
    color: '#fff',
    padding: '16px 20px',
    borderRadius: '16px',
    marginBottom: '20px',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    fontSize: '15px',
    fontWeight: '500',
    boxShadow: '0 4px 16px rgba(255, 77, 79, 0.3)'
  },
  closeError: {
    background: 'rgba(255, 255, 255, 0.2)',
    border: 'none',
    color: '#fff',
    fontSize: '20px',
    cursor: 'pointer',
    width: '32px',
    height: '32px',
    borderRadius: '50%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    transition: 'all 0.3s ease'
  },
  summaryCard: { 
    background: 'linear-gradient(135deg, #1a2332 0%, #2c3e50 100%)', 
    padding: '28px 24px', 
    borderRadius: '24px', 
    marginBottom: '24px', 
    cursor: 'pointer',
    transition: 'all 0.3s ease',
    boxShadow: '0 8px 32px rgba(0, 0, 0, 0.3)',
    border: '1px solid rgba(255, 255, 255, 0.05)'
  },
  summaryHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: '16px',
    marginBottom: '20px'
  },
  summaryIcon: {
    fontSize: '42px',
    filter: 'drop-shadow(0 2px 8px rgba(0, 216, 255, 0.3))'
  },
  summaryLabel: { 
    fontSize: '16px', 
    color: '#8b9eb3',
    fontWeight: '500',
    marginBottom: '4px'
  },
  summarySubLabel: {
    fontSize: '13px',
    color: '#5a6c7d',
    fontWeight: '400'
  },
  summaryValue: { 
    fontSize: '52px', 
    fontWeight: '900',
    fontFamily: "'Roboto Mono', monospace",
    marginBottom: '24px',
    textShadow: '0 2px 12px rgba(0, 216, 255, 0.3)',
    letterSpacing: '-1px'
  },
  summaryStats: {
    display: 'flex',
    justifyContent: 'space-around',
    alignItems: 'center',
    padding: '16px 0',
    background: 'rgba(0, 0, 0, 0.2)',
    borderRadius: '16px'
  },
  statItem: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '8px'
  },
  statIcon: {
    fontSize: '24px'
  },
  statLabel: {
    fontSize: '12px',
    color: '#6b7c93',
    fontWeight: '500'
  },
  statValue: {
    fontSize: '20px',
    color: '#fff',
    fontWeight: '700',
    fontFamily: "'Roboto Mono', monospace"
  },
  statDivider: {
    width: '1px',
    height: '48px',
    background: 'rgba(255, 255, 255, 0.1)'
  },
  chartContainer: {
    background: 'linear-gradient(135deg, #1a2332 0%, #2c3e50 100%)',
    padding: '24px 20px',
    borderRadius: '24px',
    marginBottom: '24px',
    boxShadow: '0 8px 32px rgba(0, 0, 0, 0.3)',
    border: '1px solid rgba(255, 255, 255, 0.05)'
  },
  chartTitle: {
    color: '#fff',
    fontSize: '18px',
    fontWeight: '600',
    marginBottom: '20px',
    textAlign: 'center'
  },
  stockChartContainer: {
    marginTop: '20px',
    padding: '20px 16px',
    background: 'rgba(0, 0, 0, 0.3)',
    borderRadius: '16px',
    border: '1px solid rgba(255, 255, 255, 0.05)'
  },
  tooltip: {
    background: 'linear-gradient(135deg, #1a2332 0%, #2c3e50 100%)',
    border: '1px solid rgba(0, 216, 255, 0.3)',
    padding: '12px 16px',
    borderRadius: '12px',
    boxShadow: '0 4px 16px rgba(0, 0, 0, 0.4)'
  },
  tooltipTime: {
    color: '#8b9eb3',
    fontSize: '12px',
    margin: '0 0 8px 0',
    fontFamily: "'Roboto Mono', monospace"
  },
  tooltipValue: {
    fontSize: '16px',
    fontWeight: '700',
    margin: '0',
    fontFamily: "'Roboto Mono', monospace"
  },
  tooltipPrice: {
    color: '#00d8ff',
    fontSize: '14px',
    margin: '8px 0 0 0',
    fontFamily: "'Roboto Mono', monospace"
  },
  toolbar: { 
    marginBottom: '24px',
    display: 'flex',
    flexDirection: 'column',
    gap: '16px'
  },
  inputWrapper: {
    position: 'relative',
    width: '100%'
  },
  inputIcon: {
    position: 'absolute',
    left: '20px',
    top: '50%',
    transform: 'translateY(-50%)',
    fontSize: '20px',
    pointerEvents: 'none'
  },
  mainInput: { 
    width: '100%', 
    padding: '18px 20px 18px 56px', 
    borderRadius: '16px', 
    border: '2px solid #2a3f5f', 
    background: 'linear-gradient(135deg, #1a2332 0%, #2c3e50 100%)', 
    color: '#fff', 
    fontSize: '16px', 
    boxSizing: 'border-box',
    fontWeight: '500',
    transition: 'all 0.3s ease',
    boxShadow: '0 4px 16px rgba(0, 0, 0, 0.2)'
  },
  actionBar: {
    display: 'grid',
    gridTemplateColumns: '2fr 1fr 1fr 1fr',
    gap: '12px'
  },
  sortSelect: {
    padding: '14px 16px',
    borderRadius: '14px',
    border: '2px solid #2a3f5f',
    background: 'linear-gradient(135deg, #1a2332 0%, #2c3e50 100%)',
    color: '#fff',
    fontSize: '15px',
    fontWeight: '500',
    cursor: 'pointer',
    transition: 'all 0.3s ease',
    boxShadow: '0 4px 16px rgba(0, 0, 0, 0.2)'
  },
  actionBtn: {
    padding: '14px 16px',
    borderRadius: '14px',
    border: '2px solid #2a3f5f',
    background: 'linear-gradient(135deg, #1a2332 0%, #2c3e50 100%)',
    color: '#fff',
    cursor: 'pointer',
    fontSize: '15px',
    fontWeight: '600',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '8px',
    transition: 'all 0.3s ease',
    boxShadow: '0 4px 16px rgba(0, 0, 0, 0.2)'
  },
  aiBtn: {
    background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
    border: '2px solid #764ba2'
  },
  lineBtn: {
    background: 'linear-gradient(135deg, #06c755 0%, #00b900 100%)',
    border: '2px solid #00b900'
  },
  btnIcon: {
    fontSize: '18px'
  },
  btnText: {
    fontSize: '14px',
    fontWeight: '600'
  },
  settingsPanel: {
    background: 'linear-gradient(135deg, #1a2332 0%, #2c3e50 100%)',
    padding: '24px',
    borderRadius: '24px',
    marginBottom: '24px',
    boxShadow: '0 8px 32px rgba(0, 0, 0, 0.3)',
    border: '1px solid rgba(255, 255, 255, 0.05)'
  },
  aiPanel: {
    background: 'linear-gradient(135deg, #1a2332 0%, #2c3e50 100%)',
    padding: '24px',
    borderRadius: '24px',
    marginBottom: '24px',
    boxShadow: '0 8px 32px rgba(0, 0, 0, 0.3)',
    border: '1px solid rgba(0, 216, 255, 0.2)',
    maxHeight: '600px',
    overflowY: 'auto'
  },
  panelHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '20px'
  },
  panelTitle: {
    color: '#fff',
    fontSize: '20px',
    fontWeight: '600',
    margin: 0
  },
  panelClose: {
    background: 'rgba(255, 255, 255, 0.1)',
    border: 'none',
    color: '#fff',
    fontSize: '24px',
    cursor: 'pointer',
    width: '36px',
    height: '36px',
    borderRadius: '50%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    transition: 'all 0.3s ease'
  },
  settingRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '20px'
  },
  settingLabel: {
    color: '#8b9eb3',
    fontSize: '15px',
    fontWeight: '500'
  },
  settingInput: {
    padding: '12px 16px',
    borderRadius: '12px',
    border: '2px solid #2a3f5f',
    background: 'rgba(0, 0, 0, 0.3)',
    color: '#fff',
    width: '120px',
    fontSize: '16px',
    fontWeight: '600',
    fontFamily: "'Roboto Mono', monospace",
    textAlign: 'right'
  },
  saveBtn: {
    width: '100%',
    padding: '16px',
    borderRadius: '14px',
    border: 'none',
    background: 'linear-gradient(135deg, #00d8ff 0%, #0099cc 100%)',
    color: '#000',
    fontWeight: '700',
    fontSize: '16px',
    cursor: 'pointer',
    transition: 'all 0.3s ease',
    boxShadow: '0 4px 16px rgba(0, 216, 255, 0.3)'
  },
  aiLoading: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    padding: '40px 20px'
  },
  aiLoadingText: {
    marginTop: '20px',
    color: '#8b9eb3',
    fontSize: '15px',
    fontWeight: '500'
  },
  aiContent: {
    color: '#d4dce6',
    fontSize: '15px',
    lineHeight: '1.8',
    fontWeight: '400'
  },
  aiText: {
    marginBottom: '12px',
    color: '#d4dce6'
  },
  list: { 
    display: 'flex', 
    flexDirection: 'column', 
    gap: '16px',
    paddingBottom: '24px'
  },
  stockCard: { 
    background: 'linear-gradient(135deg, #1a2332 0%, #2c3e50 100%)', 
    padding: '24px 20px', 
    borderRadius: '20px',
    transition: 'all 0.3s ease',
    border: '1px solid rgba(255, 255, 255, 0.05)'
  },
  cardHeader: { 
    display: 'flex', 
    justifyContent: 'space-between',
    marginBottom: '20px'
  },
  stockInfo: {
    flex: 1
  },
  stockTitleRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    marginBottom: '12px'
  },
  stockCode: {
    fontSize: '24px',
    fontWeight: '700',
    color: '#fff',
    fontFamily: "'Roboto Mono', monospace"
  },
  stockName: {
    fontSize: '16px',
    color: '#8b9eb3',
    fontWeight: '500'
  },
  stockDetails: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    fontSize: '14px',
    color: '#6b7c93',
    fontWeight: '500'
  },
  detailItem: {
    display: 'flex',
    alignItems: 'center',
    gap: '4px'
  },
  detailDivider: {
    color: '#3a4a5f'
  },
  editRow: {
    display: 'flex',
    gap: '16px',
    marginTop: '12px'
  },
  editGroup: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px'
  },
  editLabel: {
    fontSize: '12px',
    color: '#6b7c93',
    fontWeight: '500'
  },
  editInput: {
    padding: '10px 14px',
    borderRadius: '10px',
    border: '2px solid #2a3f5f',
    background: 'rgba(0, 0, 0, 0.3)',
    color: '#fff',
    fontSize: '15px',
    fontWeight: '600',
    width: '100px',
    fontFamily: "'Roboto Mono', monospace"
  },
  profitSection: { 
    textAlign: 'right',
    display: 'flex',
    flexDirection: 'column',
    gap: '8px'
  },
  netProfit: { 
    fontSize: '28px', 
    fontWeight: '800',
    fontFamily: "'Roboto Mono', monospace",
    letterSpacing: '-0.5px'
  },
  percent: { 
    fontSize: '18px', 
    fontWeight: '700',
    fontFamily: "'Roboto Mono', monospace",
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: '4px'
  },
  priceInfo: {
    display: 'flex',
    justifyContent: 'space-between',
    padding: '16px',
    background: 'rgba(0, 0, 0, 0.2)',
    borderRadius: '14px',
    marginBottom: '16px'
  },
  priceItem: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px'
  },
  priceLabel: {
    fontSize: '12px',
    color: '#6b7c93',
    fontWeight: '500'
  },
  currentPrice: {
    fontSize: '20px',
    color: '#00d8ff',
    fontWeight: '700',
    fontFamily: "'Roboto Mono', monospace"
  },
  breakevenPrice: {
    fontSize: '18px',
    color: '#f0ad4e',
    fontWeight: '700',
    fontFamily: "'Roboto Mono', monospace"
  },
  ticksBadge: {
    fontSize: '12px',
    color: '#f0ad4e',
    background: 'rgba(240, 173, 78, 0.15)',
    padding: '4px 8px',
    borderRadius: '6px',
    fontWeight: '600',
    marginTop: '4px',
    display: 'inline-block'
  },
  extremePoints: {
    padding: '16px',
    background: 'rgba(0, 0, 0, 0.3)',
    borderRadius: '14px',
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
    marginBottom: '16px',
    border: '1px solid rgba(255, 255, 255, 0.05)'
  },
  pointItem: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px'
  },
  pointIcon: {
    fontSize: '24px'
  },
  pointContent: {
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
    flex: 1
  },
  pointLabel: {
    fontSize: '12px',
    color: '#6b7c93',
    fontWeight: '500'
  },
  pointValue: {
    fontSize: '16px',
    fontWeight: '700',
    fontFamily: "'Roboto Mono', monospace"
  },
  pointTime: {
    fontSize: '11px',
    color: '#5a6c7d',
    fontFamily: "'Roboto Mono', monospace",
    fontWeight: '500'
  },
  cardFooter: {
    paddingTop: '16px',
    borderTop: '1px solid rgba(255, 255, 255, 0.05)'
  },
  cardActions: {
    display: 'flex',
    gap: '12px',
    justifyContent: 'flex-end'
  },
  editActions: {
    display: 'flex',
    gap: '12px'
  },
  iconBtn: {
    background: 'rgba(255, 255, 255, 0.05)',
    border: '2px solid #2a3f5f',
    padding: '12px',
    borderRadius: '12px',
    cursor: 'pointer',
    transition: 'all 0.3s ease',
    minWidth: '48px',
    minHeight: '48px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center'
  },
  iconBtnIcon: {
    fontSize: '20px'
  },
  deleteBtn: {
    background: 'rgba(255, 77, 79, 0.1)',
    border: '2px solid rgba(255, 77, 79, 0.3)',
    padding: '12px',
    borderRadius: '12px',
    cursor: 'pointer',
    transition: 'all 0.3s ease',
    minWidth: '48px',
    minHeight: '48px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center'
  },
  saveEditBtn: {
    flex: 1,
    padding: '14px',
    borderRadius: '12px',
    border: 'none',
    background: 'linear-gradient(135deg, #52c41a 0%, #389e0d 100%)',
    color: '#fff',
    fontWeight: '700',
    fontSize: '15px',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '8px',
    transition: 'all 0.3s ease',
    boxShadow: '0 4px 16px rgba(82, 196, 26, 0.3)'
  },
  cancelEditBtn: {
    flex: 1,
    padding: '14px',
    borderRadius: '12px',
    border: 'none',
    background: 'linear-gradient(135deg, #ff4d4f 0%, #d9363e 100%)',
    color: '#fff',
    fontWeight: '700',
    fontSize: '15px',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '8px',
    transition: 'all 0.3s ease',
    boxShadow: '0 4px 16px rgba(255, 77, 79, 0.3)'
  }
};

export default App;
