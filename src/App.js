import React, { useState, useEffect } from 'react';
import { initializeApp } from "firebase/app";
import { getFirestore, doc, setDoc, onSnapshot } from "firebase/firestore";

// --- 1. Firebase 設定 (已根據您的截圖更新) ---
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
const USER_DOC_ID = "sainco_trading_data"; // 您的專屬雲端識別碼

// --- 2. 核心參數設定 ---
const CONFIG = {
  FEE_RATE: 0.001425,
  DISCOUNT: 0.23,     // 華南永昌 23 折
  TAX_RATE: 0.0015,   // 現沖稅金減半
  MIN_FEE: 20,
  API_KEY: '725bd665-e2ca-4ae4-ba7b-fc8312ac158f' // 您的 Fugle API Key
};

// 台股升降單位
const getTickSize = (p) => {
  if (p < 10) return 0.01; if (p < 50) return 0.05; if (p < 100) return 0.1;
  if (p < 500) return 0.5; if (p < 1000) return 1; return 5;
};

const App = () => {
  const [inputStr, setInputStr] = useState('');
  const [inventory, setInventory] = useState([]);

  // --- 3. 雲端同步邏輯 ---
  useEffect(() => {
    // 從雲端即時抓取資料
    const unsub = onSnapshot(doc(db, "users", USER_DOC_ID), (snapshot) => {
      if (snapshot.exists()) {
        setInventory(snapshot.data().stocks || []);
      }
    });
    return () => unsub();
  }, []);

  const syncToCloud = async (newStocks) => {
    try {
      await setDoc(doc(db, "users", USER_DOC_ID), { stocks: newStocks });
    } catch (e) { console.error("同步失敗", e); }
  };

  // --- 4. WebSocket 報價抓取 ---
  useEffect(() => {
    if (inventory.length === 0) return;
    const connections = inventory.map(stock => {
      const ws = new WebSocket(`wss://api.fugle.tw/marketdata/v1.0/stock/intraday/quote?symbolId=${stock.code}&apiToken=${CONFIG.API_KEY}`);
      ws.onmessage = (e) => {
        const data = JSON.parse(e.data);
        if (data.event === 'data' && data.data.quote.lastPrice) {
          setInventory(prev => prev.map(s => s.code === stock.code ? { ...s, currentPrice: data.data.quote.lastPrice } : s));
        }
      };
      return ws;
    });
    return () => connections.forEach(ws => ws.close());
  }, [inventory.length]);

  const calculateData = (stock) => {
    const shares = stock.qty * 1000;
    const buyTotal = stock.buyPrice * shares;
    const currentTotal = stock.currentPrice * shares;
    const buyFee = Math.max(CONFIG.MIN_FEE, Math.floor(buyTotal * CONFIG.FEE_RATE * CONFIG.DISCOUNT));
    const totalCost = buyTotal + buyFee;
    const sellFee = Math.max(CONFIG.MIN_FEE, Math.floor(currentTotal * CONFIG.FEE_RATE * CONFIG.DISCOUNT));
    const tax = Math.floor(currentTotal * CONFIG.TAX_RATE);
    const netProfit = currentTotal - sellFee - tax - totalCost;
    const returnRate = (netProfit / totalCost) * 100;
    const breakevenPrice = totalCost / (shares * (1 - CONFIG.FEE_RATE * CONFIG.DISCOUNT - CONFIG.TAX_RATE));
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
          newStocks[idx] = { ...old, buyPrice: ((old.buyPrice * old.qty) + (p * q)) / newQty, qty: newQty };
        } else {
          newStocks = [{ id: Date.now(), code, buyPrice: p, qty: q, currentPrice: p, name: '' }, ...inventory];
        }
        syncToCloud(newStocks);
        setInputStr('');
      }
    }
  };

  const totalNet = inventory.reduce((sum, s) => sum + calculateData(s).netProfit, 0);

  return (
    <div style={styles.container}>
      <div style={styles.summaryCard}>
        <div style={styles.summaryLabel}>今日總損益 (雲端同步中)</div>
        <div style={{ ...styles.summaryValue, color: totalNet >= 0 ? '#ff4d4f' : '#52c41a' }}>
          {totalNet >= 0 ? '+' : ''}{Math.floor(totalNet).toLocaleString()}
        </div>
      </div>
      <input style={styles.mainInput} placeholder="快速輸入：股號 買價 張數" value={inputStr} onChange={(e) => setInputStr(e.target.value)} onKeyDown={handleAddStock} />
      <div style={styles.list}>
        {inventory.map(stock => {
          const { netProfit, returnRate, breakevenPrice, ticksToWin } = calculateData(stock);
          const isProfit = netProfit >= 0;
          return (
            <div key={stock.id} style={{ ...styles.stockCard, borderLeft: `8px solid ${isProfit ? '#ff4d4f' : '#52c41a'}` }}>
              <div style={styles.cardHeader}>
                <div><div style={styles.stockTitle}>{stock.code}</div><div style={styles.stockSub}>{stock.qty} 張 @ {stock.buyPrice.toFixed(2)}</div></div>
                <div style={styles.profitSection}>
                  <div style={{ ...styles.netProfit, color: isProfit ? '#ff4d4f' : '#52c41a' }}>{Math.floor(netProfit).toLocaleString()}</div>
                  <div style={{ ...styles.percent, color: isProfit ? '#ff4d4f' : '#52c41a' }}>{returnRate.toFixed(2)}%</div>
                </div>
              </div>
              <div style={styles.cardFooter}>
                <div style={styles.priceRow}>現價: <span style={styles.livePrice}>{stock.currentPrice}</span><span style={styles.breakeven}>保本: {breakevenPrice.toFixed(2)} ({ticksToWin} ✍️)</span></div>
                <button onClick={() => handleDelete(stock.id)} style={styles.delBtn}>刪除</button>
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
  summaryCard: { background: '#111', padding: '25px', borderRadius: '20px', marginBottom: '20px', textAlign: 'center' },
  summaryLabel: { fontSize: '14px', color: '#888' },
  summaryValue: { fontSize: '42px', fontWeight: '900' },
  mainInput: { width: '100%', padding: '18px', marginBottom: '25px', borderRadius: '12px', border: 'none', backgroundColor: '#222', color: '#fff', fontSize: '18px', boxSizing: 'border-box' },
  list: { display: 'flex', flexDirection: 'column', gap: '15px' },
  stockCard: { backgroundColor: '#161616', padding: '20px', borderRadius: '15px' },
  cardHeader: { display: 'flex', justifyContent: 'space-between' },
  stockTitle: { fontSize: '22px', fontWeight: 'bold', color: '#fff' },
  stockSub: { fontSize: '14px', color: '#666' },
  profitSection: { textAlign: 'right' },
  netProfit: { fontSize: '26px', fontWeight: 'bold' },
  percent: { fontSize: '20px', fontWeight: 'bold' },
  cardFooter: { marginTop: '15px', paddingTop: '15px', borderTop: '1px solid #333', display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  priceRow: { fontSize: '14px', color: '#aaa' },
  livePrice: { color: '#00d8ff', fontWeight: 'bold', fontSize: '16px', marginRight: '10px' },
  breakeven: { color: '#faad14' },
  delBtn: { backgroundColor: '#333', color: '#ff4d4f', border: 'none', padding: '6px 12px', borderRadius: '6px', cursor: 'pointer' }
};

export default App;