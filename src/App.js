import React, { useState, useEffect } from 'react';
import { initializeApp } from "firebase/app";
import { getFirestore, doc, setDoc, onSnapshot } from "firebase/firestore";

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
  const [sortBy, setSortBy] = useState('time'); // time, profit, code, return
  const [editingId, setEditingId] = useState(null);
  const [editValues, setEditValues] = useState({ buyPrice: '', qty: '' });
  const [showSettings, setShowSettings] = useState(false);

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
        }
      },
      (err) => {
        setIsLoading(false);
        setError('雲端同步失敗：' + err.message);
      }
    );
    return () => unsub();
  }, []);

  const syncToCloud = async (newStocks, newConfig = null) => {
    try {
      const dataToSync = { stocks: newStocks };
      if (newConfig) {
        dataToSync.config = newConfig;
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

  // --- 5. WebSocket 報價抓取 ---
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
          setInventory(prev => prev.map(s => {
            if (s.code === stock.code) {
              const { netProfit } = calculateData({ ...s, currentPrice: newPrice });
              const now = new Date().toISOString();
              
              // 更新最高/最低損益記錄
              let highPoint = s.highPoint || { profit: netProfit, time: now };
              let lowPoint = s.lowPoint || { profit: netProfit, time: now };
              
              if (netProfit > highPoint.profit) {
                highPoint = { profit: netProfit, time: now };
              }
              if (netProfit < lowPoint.profit) {
                lowPoint = { profit: netProfit, time: now };
              }
              
              return { ...s, currentPrice: newPrice, highPoint, lowPoint };
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
            lowPoint: { profit: 0, time: now }
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

  // 排序邏輯
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

  const totalNet = inventory.reduce((sum, s) => sum + calculateData(s).netProfit, 0);

  if (isLoading) {
    return (
      <div style={styles.container}>
        <div style={styles.loadingCard}>
          <div style={styles.spinner}></div>
          <div style={{ marginTop: '15px', color: '#888' }}>載入中...</div>
        </div>
      </div>
    );
  }

  return (
    <div style={styles.container}>
      {error && (
        <div style={styles.errorBanner}>
          ⚠️ {error}
          <button onClick={() => setError(null)} style={styles.closeError}>✕</button>
        </div>
      )}
      
      <div style={styles.summaryCard}>
        <div style={styles.summaryLabel}>今日總損益 (雲端同步中)</div>
        <div style={{ ...styles.summaryValue, color: totalNet >= 0 ? '#ff4d4f' : '#52c41a' }}>
          {totalNet >= 0 ? '+' : ''}{Math.floor(totalNet).toLocaleString()}
        </div>
      </div>

      <div style={styles.toolbar}>
        <input 
          style={styles.mainInput} 
          placeholder="快速輸入：股號 買價 張數" 
          value={inputStr} 
          onChange={(e) => setInputStr(e.target.value)} 
          onKeyDown={handleAddStock} 
        />
        <div style={styles.controls}>
          <select 
            value={sortBy} 
            onChange={(e) => setSortBy(e.target.value)}
            style={styles.sortSelect}
          >
            <option value="time">依時間排序</option>
            <option value="profit">依損益排序</option>
            <option value="return">依報酬率排序</option>
            <option value="code">依代碼排序</option>
          </select>
          <button onClick={() => setShowSettings(!showSettings)} style={styles.settingsBtn}>
            ⚙️ 設定
          </button>
        </div>
      </div>

      {showSettings && (
        <div style={styles.settingsPanel}>
          <h3 style={styles.settingsTitle}>手續費設定</h3>
          <div style={styles.settingRow}>
            <label>券商折數（折）：</label>
            <input 
              type="number" 
              step="0.01"
              value={config.DISCOUNT * 100}
              onChange={(e) => setConfig({ ...config, DISCOUNT: parseFloat(e.target.value) / 100 })}
              style={styles.settingInput}
            />
          </div>
          <div style={styles.settingRow}>
            <label>最低手續費（元）：</label>
            <input 
              type="number"
              value={config.MIN_FEE}
              onChange={(e) => setConfig({ ...config, MIN_FEE: parseInt(e.target.value) })}
              style={styles.settingInput}
            />
          </div>
          <div style={styles.settingButtons}>
            <button onClick={handleSaveSettings} style={styles.saveBtn}>儲存</button>
            <button onClick={() => setShowSettings(false)} style={styles.cancelBtn}>取消</button>
          </div>
        </div>
      )}

      <div style={styles.list}>
        {getSortedInventory().map(stock => {
          const { netProfit, returnRate, breakevenPrice, ticksToWin } = calculateData(stock);
          const isProfit = netProfit >= 0;
          const isEditing = editingId === stock.id;
          
          return (
            <div key={stock.id} style={{ ...styles.stockCard, borderLeft: `8px solid ${isProfit ? '#ff4d4f' : '#52c41a'}` }}>
              <div style={styles.cardHeader}>
                <div>
                  <div style={styles.stockTitle}>
                    {stock.code} {stock.name && <span style={styles.stockName}>{stock.name}</span>}
                  </div>
                  {isEditing ? (
                    <div style={styles.editRow}>
                      <input 
                        type="number" 
                        step="0.01"
                        value={editValues.buyPrice}
                        onChange={(e) => setEditValues({ ...editValues, buyPrice: e.target.value })}
                        style={styles.editInput}
                        placeholder="買價"
                      />
                      <input 
                        type="number"
                        value={editValues.qty}
                        onChange={(e) => setEditValues({ ...editValues, qty: e.target.value })}
                        style={styles.editInput}
                        placeholder="張數"
                      />
                    </div>
                  ) : (
                    <div style={styles.stockSub}>{stock.qty} 張 @ {stock.buyPrice.toFixed(2)}</div>
                  )}
                </div>
                <div style={styles.profitSection}>
                  <div style={{ ...styles.netProfit, color: isProfit ? '#ff4d4f' : '#52c41a' }}>
                    {Math.floor(netProfit).toLocaleString()}
                  </div>
                  <div style={{ ...styles.percent, color: isProfit ? '#ff4d4f' : '#52c41a' }}>
                    {returnRate.toFixed(2)}%
                  </div>
                </div>
              </div>
              
              {stock.highPoint && stock.lowPoint && (
                <div style={styles.extremePoints}>
                  <div style={styles.pointItem}>
                    <span style={styles.pointLabel}>📈 最高：</span>
                    <span style={{ color: '#ff4d4f' }}>
                      {Math.floor(stock.highPoint.profit).toLocaleString()}
                    </span>
                    <span style={styles.pointTime}>
                      {new Date(stock.highPoint.time).toLocaleString('zh-TW', { 
                        month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' 
                      })}
                    </span>
                  </div>
                  <div style={styles.pointItem}>
                    <span style={styles.pointLabel}>📉 最低：</span>
                    <span style={{ color: '#52c41a' }}>
                      {Math.floor(stock.lowPoint.profit).toLocaleString()}
                    </span>
                    <span style={styles.pointTime}>
                      {new Date(stock.lowPoint.time).toLocaleString('zh-TW', { 
                        month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' 
                      })}
                    </span>
                  </div>
                </div>
              )}
              
              <div style={styles.cardFooter}>
                <div style={styles.priceRow}>
                  現價: <span style={styles.livePrice}>{stock.currentPrice}</span>
                  <span style={styles.breakeven}>保本: {breakevenPrice.toFixed(2)} ({ticksToWin} ✍️)</span>
                </div>
                <div style={styles.actionButtons}>
                  {isEditing ? (
                    <>
                      <button onClick={() => handleSaveEdit(stock.id)} style={styles.saveEditBtn}>✓</button>
                      <button onClick={handleCancelEdit} style={styles.cancelEditBtn}>✕</button>
                    </>
                  ) : (
                    <>
                      <button onClick={() => handleEdit(stock)} style={styles.editBtn}>編輯</button>
                      <button onClick={() => handleDelete(stock.id)} style={styles.delBtn}>刪除</button>
                    </>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

const styles = {
  container: { padding: '20px', backgroundColor: '#000', minHeight: '100vh', fontFamily: 'sans-serif' },
  loadingCard: { 
    background: '#111', 
    padding: '50px', 
    borderRadius: '20px', 
    textAlign: 'center',
    marginTop: '50px'
  },
  spinner: {
    border: '4px solid #333',
    borderTop: '4px solid #00d8ff',
    borderRadius: '50%',
    width: '50px',
    height: '50px',
    animation: 'spin 1s linear infinite',
    margin: '0 auto'
  },
  errorBanner: {
    backgroundColor: '#ff4d4f',
    color: '#fff',
    padding: '15px',
    borderRadius: '10px',
    marginBottom: '20px',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center'
  },
  closeError: {
    background: 'none',
    border: 'none',
    color: '#fff',
    fontSize: '20px',
    cursor: 'pointer'
  },
  summaryCard: { 
    background: '#111', 
    padding: '25px', 
    borderRadius: '20px', 
    marginBottom: '20px', 
    textAlign: 'center' 
  },
  summaryLabel: { fontSize: '14px', color: '#888' },
  summaryValue: { fontSize: '42px', fontWeight: '900' },
  toolbar: { marginBottom: '20px' },
  mainInput: { 
    width: '100%', 
    padding: '18px', 
    marginBottom: '15px', 
    borderRadius: '12px', 
    border: 'none', 
    backgroundColor: '#222', 
    color: '#fff', 
    fontSize: '18px', 
    boxSizing: 'border-box' 
  },
  controls: { 
    display: 'flex', 
    gap: '10px', 
    justifyContent: 'space-between' 
  },
  sortSelect: {
    flex: 1,
    padding: '12px',
    borderRadius: '10px',
    border: 'none',
    backgroundColor: '#222',
    color: '#fff',
    fontSize: '16px'
  },
  settingsBtn: {
    padding: '12px 20px',
    borderRadius: '10px',
    border: 'none',
    backgroundColor: '#333',
    color: '#fff',
    cursor: 'pointer',
    fontSize: '16px'
  },
  settingsPanel: {
    backgroundColor: '#161616',
    padding: '20px',
    borderRadius: '15px',
    marginBottom: '20px'
  },
  settingsTitle: {
    color: '#fff',
    fontSize: '18px',
    marginBottom: '15px'
  },
  settingRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '15px',
    color: '#aaa'
  },
  settingInput: {
    padding: '8px',
    borderRadius: '8px',
    border: 'none',
    backgroundColor: '#222',
    color: '#fff',
    width: '100px',
    fontSize: '16px'
  },
  settingButtons: {
    display: 'flex',
    gap: '10px',
    marginTop: '20px'
  },
  saveBtn: {
    flex: 1,
    padding: '12px',
    borderRadius: '10px',
    border: 'none',
    backgroundColor: '#00d8ff',
    color: '#000',
    fontWeight: 'bold',
    cursor: 'pointer'
  },
  cancelBtn: {
    flex: 1,
    padding: '12px',
    borderRadius: '10px',
    border: 'none',
    backgroundColor: '#333',
    color: '#fff',
    cursor: 'pointer'
  },
  list: { display: 'flex', flexDirection: 'column', gap: '15px' },
  stockCard: { 
    backgroundColor: '#161616', 
    padding: '20px', 
    borderRadius: '15px' 
  },
  cardHeader: { display: 'flex', justifyContent: 'space-between' },
  stockTitle: { 
    fontSize: '22px', 
    fontWeight: 'bold', 
    color: '#fff',
    display: 'flex',
    alignItems: 'center',
    gap: '10px'
  },
  stockName: {
    fontSize: '16px',
    color: '#888',
    fontWeight: 'normal'
  },
  stockSub: { fontSize: '14px', color: '#666', marginTop: '5px' },
  editRow: {
    display: 'flex',
    gap: '10px',
    marginTop: '10px'
  },
  editInput: {
    padding: '8px',
    borderRadius: '8px',
    border: 'none',
    backgroundColor: '#222',
    color: '#fff',
    fontSize: '14px',
    width: '80px'
  },
  profitSection: { textAlign: 'right' },
  netProfit: { fontSize: '26px', fontWeight: 'bold' },
  percent: { fontSize: '20px', fontWeight: 'bold' },
  extremePoints: {
    marginTop: '15px',
    padding: '12px',
    backgroundColor: '#0d0d0d',
    borderRadius: '10px',
    display: 'flex',
    flexDirection: 'column',
    gap: '8px'
  },
  pointItem: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    fontSize: '13px'
  },
  pointLabel: {
    color: '#888',
    minWidth: '60px'
  },
  pointTime: {
    color: '#666',
    fontSize: '11px',
    marginLeft: 'auto'
  },
  cardFooter: { 
    marginTop: '15px', 
    paddingTop: '15px', 
    borderTop: '1px solid #333', 
    display: 'flex', 
    justifyContent: 'space-between', 
    alignItems: 'center' 
  },
  priceRow: { fontSize: '14px', color: '#aaa' },
  livePrice: { 
    color: '#00d8ff', 
    fontWeight: 'bold', 
    fontSize: '16px', 
    marginRight: '10px' 
  },
  breakeven: { color: '#faad14' },
  actionButtons: {
    display: 'flex',
    gap: '10px'
  },
  editBtn: {
    backgroundColor: '#333',
    color: '#00d8ff',
    border: 'none',
    padding: '6px 12px',
    borderRadius: '6px',
    cursor: 'pointer'
  },
  delBtn: { 
    backgroundColor: '#333', 
    color: '#ff4d4f', 
    border: 'none', 
    padding: '6px 12px', 
    borderRadius: '6px', 
    cursor: 'pointer' 
  },
  saveEditBtn: {
    backgroundColor: '#52c41a',
    color: '#fff',
    border: 'none',
    padding: '6px 12px',
    borderRadius: '6px',
    cursor: 'pointer',
    fontSize: '16px'
  },
  cancelEditBtn: {
    backgroundColor: '#ff4d4f',
    color: '#fff',
    border: 'none',
    padding: '6px 12px',
    borderRadius: '6px',
    cursor: 'pointer',
    fontSize: '16px'
  }
};

export default App;
