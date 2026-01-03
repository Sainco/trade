import React, { useState, useEffect, useMemo } from 'react';
import { initializeApp } from "firebase/app";
import { getFirestore, doc, setDoc, onSnapshot } from "firebase/firestore";

// --- 1. Firebase 設定 ---
const firebaseConfig = {
  apiKey: "AIzaSyB2oHiKQVMU2rXoYI19LdgO8TTSw89bQSs",
  authDomain: "trade-sync-e41ce.firebaseapp.com",
  projectId: "trade-sync-e41ce",
  storageBucket: "trade-sync-e41ce.appspot.com",
  messagingSenderId: "819101665510",
  appId: "1:819101665510:web:e9f69f8239af1ec8b8d327"
};

const firebaseApp = initializeApp(firebaseConfig);
const db = getFirestore(firebaseApp);
const USER_DOC_ID = "sainco_trading_data";

// --- 2. 核心參數與升降單位 ---
const CONFIG = {
  FEE_RATE: 0.001425,
  TAX_RATE: 0.0015,
  MIN_FEE: 20,
  API_KEY: '725bd665-e2ca-4ae4-ba7b-fc8312ac158f'
};

const getTickSize = (p) => {
  if (p < 10) return 0.01; if (p < 50) return 0.05; if (p < 100) return 0.1;
  if (p < 500) return 0.5; if (p < 1000) return 1; return 5;
};

const App = () => {
  const [inputStr, setInputStr] = useState('');
  const [inventory, setInventory] = useState([]);
  const [settings, setSettings] = useState({ discount: 0.23, minFee: 20 });
  const [sortBy, setSortBy] = useState('TIME'); // 排序狀態
  const [selectedStockId, setSelectedStockId] = useState(null); // 用於最下方顯示圖表

  // --- 3. 雲端同步 ---
  useEffect(() => {
    const unsub = onSnapshot(doc(db, "users", USER_DOC_ID), (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.data();
        setInventory(data.stocks || []);
        if (data.settings) setSettings(data.settings);
      }
    });
    return () => unsub();
  }, []);

  const syncToCloud = (stocks, newSettings = settings) => {
    setDoc(doc(db, "users", USER_DOC_ID), { stocks, settings: newSettings });
  };

  // --- 4. 損益計算函數 ---
  const calculateData = (stock) => {
    const shares = stock.qty * 1000;
    const buyTotal = stock.buyPrice * shares;
    const currentTotal = (stock.currentPrice || stock.buyPrice) * shares;
    const buyFee = Math.max(settings.minFee, Math.floor(buyTotal * CONFIG.FEE_RATE * settings.discount));
    const totalCost = buyTotal + buyFee;
    const sellFee = Math.max(settings.minFee, Math.floor(currentTotal * CONFIG.FEE_RATE * settings.discount));
    const tax = Math.floor(currentTotal * CONFIG.TAX_RATE);
    const netProfit = currentTotal - sellFee - tax - totalCost;
    const returnRate = (netProfit / totalCost) * 100;
    const breakevenPrice = totalCost / (shares * (1 - CONFIG.FEE_RATE * settings.discount - CONFIG.TAX_RATE));
    let ticksToWin = 0; let tempPrice = stock.buyPrice;
    while (tempPrice < breakevenPrice) { tempPrice += getTickSize(tempPrice); ticksToWin++; }
    return { netProfit, returnRate, breakevenPrice, ticksToWin };
  };

  // --- 5. 排序邏輯 (修正 2330 永遠在最上面的問題) ---
  const sortedInventory = useMemo(() => {
    let list = [...inventory];
    switch (sortBy) {
      case 'PROFIT':
        return list.sort((a, b) => calculateData(b).netProfit - calculateData(a).netProfit);
      case 'RETURN':
        return list.sort((a, b) => calculateData(b).returnRate - calculateData(a).returnRate);
      case 'CODE':
        return list.sort((a, b) => a.code.localeCompare(b.code));
      case 'TIME':
      default:
        return list.sort((a, b) => b.id - a.id); // 新增在最上
    }
  }, [inventory, sortBy, settings]);

  // --- 6. 事件處理 ---
  const handleAddStock = (e) => {
    if (e.key === 'Enter' && inputStr.trim()) {
      const [code, buyPrice, qty] = inputStr.trim().split(/\s+/);
      if (code && buyPrice && qty) {
        const newStocks = [{ id: Date.now(), code, buyPrice: parseFloat(buyPrice), qty: parseFloat(qty), currentPrice: parseFloat(buyPrice), name: '' }, ...inventory];
        syncToCloud(newStocks);
        setInputStr('');
      }
    }
  };

  const totalNet = inventory.reduce((sum, s) => sum + calculateData(s).netProfit, 0);

  return (
    <div style={styles.container}>
      {/* 總看板：縮小高度 */}
      <div style={styles.summaryCard}>
        <div style={styles.summaryLabel}>今日實拿損益</div>
        <div style={{ ...styles.summaryValue, color: totalNet >= 0 ? '#ff4d4f' : '#52c41a' }}>
          {totalNet >= 0 ? '+' : ''}{Math.floor(totalNet).toLocaleString()}
        </div>
      </div>

      {/* 控制列：輸入框與排序 */}
      <div style={styles.controlRow}>
        <input style={styles.compactInput} placeholder="代號 買價 張數" value={inputStr} onChange={(e) => setInputStr(e.target.value)} onKeyDown={handleAddStock} />
        <select style={styles.select} value={sortBy} onChange={(e) => setSortBy(e.target.value)}>
          <option value="TIME">最新</option>
          <option value="PROFIT">損益</option>
          <option value="RETURN">報酬</option>
          <option value="CODE">代號</option>
        </select>
      </div>

      {/* 股票清單：極致緊湊版 */}
      <div style={styles.list}>
        {sortedInventory.map(stock => {
          const { netProfit, returnRate, breakevenPrice, ticksToWin } = calculateData(stock);
          const isProfit = netProfit >= 0;
          return (
            <div key={stock.id} style={{ ...styles.stockCard, borderLeft: `4px solid ${isProfit ? '#ff4d4f' : '#52c41a'}` }} onClick={() => setSelectedStockId(stock.id)}>
              <div style={styles.cardMain}>
                <div style={styles.infoCol}>
                  <div style={styles.stockTitle}>{stock.code} <small style={styles.stockName}>{stock.name}</small></div>
                  <div style={styles.stockSub}>{stock.qty}張 @ {stock.buyPrice}</div>
                </div>
                <div style={styles.profitCol}>
                  <div style={{ ...styles.netProfit, color: isProfit ? '#ff4d4f' : '#52c41a' }}>{Math.floor(netProfit).toLocaleString()}</div>
                  <div style={{ ...styles.percent, color: isProfit ? '#ff4d4f' : '#52c41a' }}>{returnRate.toFixed(2)}%</div>
                </div>
                <div style={styles.actionCol}>
                  <button onClick={(e) => { e.stopPropagation(); if (window.confirm('刪除?')) syncToCloud(inventory.filter(s => s.id !== stock.id)); }} style={styles.miniDelBtn}>×</button>
                </div>
              </div>
              <div style={styles.cardFooter}>
                <span>現價 {stock.currentPrice}</span>
                <span style={{ color: '#faad14' }}>保本 {breakevenPrice.toFixed(2)} ({ticksToWin}T)</span>
              </div>
            </div>
          );
        })}
      </div>

      {/* 圖表預留區：置於最下方，避免擋住清單 */}
      {selectedStockId && (
        <div style={styles.chartSection}>
          <div style={styles.chartHeader}>
            <span>個股趨勢 (ID: {selectedStockId})</span>
            <button onClick={() => setSelectedStockId(null)} style={styles.closeBtn}>關閉圖表</button>
          </div>
          <div style={styles.placeholderChart}>圖表顯示於此 (不佔用清單空間)</div>
        </div>
      )}
    </div>
  );
};

// --- 7. UI 樣式優化 (針對手機版一屏四檔) ---
const styles = {
  container: { padding: '10px', backgroundColor: '#000', minHeight: '100vh', fontFamily: 'sans-serif', color: '#fff' },
  summaryCard: { background: '#111', padding: '15px', borderRadius: '12px', marginBottom: '10px', textAlign: 'center', border: '1px solid #222' },
  summaryLabel: { fontSize: '12px', color: '#888' },
  summaryValue: { fontSize: '32px', fontWeight: '900' },
  controlRow: { display: 'flex', gap: '8px', marginBottom: '10px' },
  compactInput: { flex: 1, padding: '10px', borderRadius: '6px', border: 'none', backgroundColor: '#222', color: '#fff', fontSize: '14px' },
  select: { backgroundColor: '#222', color: '#fff', border: 'none', borderRadius: '6px', padding: '0 8px' },
  list: { display: 'flex', flexDirection: 'column', gap: '6px' },
  stockCard: { backgroundColor: '#111', padding: '10px', borderRadius: '8px', cursor: 'pointer' },
  cardMain: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  infoCol: { flex: 2 },
  profitCol: { flex: 2, textAlign: 'right', paddingRight: '15px' },
  actionCol: { flex: 0.5, textAlign: 'right' },
  stockTitle: { fontSize: '16px', fontWeight: 'bold' },
  stockName: { fontSize: '12px', color: '#666', fontWeight: 'normal' },
  stockSub: { fontSize: '11px', color: '#555' },
  netProfit: { fontSize: '18px', fontWeight: 'bold' },
  percent: { fontSize: '14px', fontWeight: 'bold' },
  cardFooter: { marginTop: '5px', paddingTop: '5px', borderTop: '1px solid #222', display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: '#888' },
  miniDelBtn: { background: 'none', border: 'none', color: '#444', fontSize: '20px', padding: '0 5px' },
  chartSection: { marginTop: '20px', padding: '15px', backgroundColor: '#111', borderRadius: '12px', borderTop: '2px solid #00d8ff' },
  chartHeader: { display: 'flex', justifyContent: 'space-between', marginBottom: '10px', fontSize: '13px' },
  closeBtn: { background: '#333', color: '#fff', border: 'none', padding: '4px 8px', borderRadius: '4px', fontSize: '11px' },
  placeholderChart: { height: '150px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#444', border: '1px dashed #333' }
};

export default App;
