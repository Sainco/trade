import React, { useState, useEffect } from 'react';

// 核心參數設定
const CONFIG = {
  FEE_RATE: 0.001425,
  DISCOUNT: 0.23,     // 華南 23 折
  TAX_RATE: 0.0015,   // 現沖稅
  MIN_FEE: 20,
  API_KEY: '725bd665-e2ca-4ae4-ba7b-fc8312ac158f' // 您提供的 FUGLE API
};

// 台股升降單位 (Tick Size)
const getTickSize = (price) => {
  if (price < 10) return 0.01;
  if (price < 50) return 0.05;
  if (price < 100) return 0.1;
  if (price < 500) return 0.5;
  if (price < 1000) return 1;
  return 5;
};

const App = () => {
  const [inputStr, setInputStr] = useState('');
  // 初始讀取 LocalStorage
  const [inventory, setInventory] = useState(() => {
    const saved = localStorage.getItem('trading_inventory');
    return saved ? JSON.parse(saved) : [];
  });

  // 當 inventory 變動時，自動存入 LocalStorage
  useEffect(() => {
    localStorage.setItem('trading_inventory', JSON.stringify(inventory));
  }, [inventory]);

  // WebSocket 與 初始價格/名稱抓取
  useEffect(() => {
    if (inventory.length === 0) return;

    inventory.forEach(async (stock) => {
      // 如果還沒有中文名，抓取一次 Snapshot
      if (!stock.name) {
        try {
          const res = await fetch(`https://api.fugle.tw/marketdata/v1.0/stock/intraday/quote/${stock.code}?apiToken=${CONFIG.API_KEY}`);
          const json = await res.json();
          if (json.quote) {
            setInventory(prev => prev.map(s => 
              s.code === stock.code ? { ...s, name: json.quote.nameZh, currentPrice: json.quote.lastPrice || s.currentPrice } : s
            ));
          }
        } catch (e) { console.error("抓取股名失敗", e); }
      }
    });

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
    
    let ticksToWin = 0;
    let tempPrice = stock.buyPrice;
    while (tempPrice < breakevenPrice) {
      tempPrice += getTickSize(tempPrice);
      ticksToWin++;
    }
    return { netProfit, returnRate, breakevenPrice, ticksToWin };
  };

  const handleDelete = (id) => {
    if (window.confirm("確定要刪除此筆部位嗎？")) {
      setInventory(inventory.filter(s => s.id !== id));
    }
  };

  const handleAddStock = (e) => {
    if (e.key === 'Enter' && inputStr.trim()) {
      const [code, buyPrice, qty] = inputStr.trim().split(/\s+/);
      if (code && buyPrice && qty) {
        const p = parseFloat(buyPrice);
        const q = parseFloat(qty);
        setInventory(prev => {
          const idx = prev.findIndex(s => s.code === code);
          if (idx > -1) {
            const updated = [...prev];
            const old = updated[idx];
            const newQty = old.qty + q;
            updated[idx] = { ...old, buyPrice: ((old.buyPrice * old.qty) + (p * q)) / newQty, qty: newQty };
            return updated;
          }
          return [{ id: Date.now(), code, buyPrice: p, qty: q, currentPrice: p, name: '' }, ...prev];
        });
        setInputStr('');
      }
    }
  };

  const totalNet = inventory.reduce((sum, s) => sum + calculateData(s).netProfit, 0);

  return (
    <div style={styles.container}>
      <div style={styles.summaryCard}>
        <div style={styles.summaryLabel}>今日實拿總損益 (含日退)</div>
        <div style={{ ...styles.summaryValue, color: totalNet >= 0 ? '#ff4d4f' : '#52c41a' }}>
          {totalNet >= 0 ? '+' : ''}{Math.floor(totalNet).toLocaleString()}
        </div>
      </div>

      <input
        style={styles.mainInput}
        placeholder="快速輸入：股號 買價 張數 (Enter)"
        value={inputStr} onChange={(e) => setInputStr(e.target.value)} onKeyDown={handleAddStock}
      />

      <div style={styles.list}>
        {inventory.map(stock => {
          const { netProfit, returnRate, breakevenPrice, ticksToWin } = calculateData(stock);
          const isProfit = netProfit >= 0;

          return (
            <div key={stock.id} style={{ ...styles.stockCard, borderLeft: `8px solid ${isProfit ? '#ff4d4f' : '#52c41a'}` }}>
              <div style={styles.cardHeader}>
                <div>
                  <div style={styles.stockTitle}>{stock.code} {stock.name || '載入中...'}</div>
                  <div style={styles.stockSub}>{stock.qty} 張 @ {stock.buyPrice.toFixed(2)}</div>
                </div>
                <div style={styles.profitSection}>
                  <div style={{ ...styles.netProfit, color: isProfit ? '#ff4d4f' : '#52c41a' }}>
                    {isProfit ? '+' : ''}{Math.floor(netProfit).toLocaleString()}
                  </div>
                  <div style={{ ...styles.percent, color: isProfit ? '#ff4d4f' : '#52c41a' }}>
                    {returnRate.toFixed(2)}%
                  </div>
                </div>
              </div>

              <div style={styles.cardFooter}>
                <div style={styles.priceRow}>
                  現價: <span style={styles.livePrice}>{stock.currentPrice.toFixed(2)}</span>
                  <span style={styles.breakeven}>保本: {breakevenPrice.toFixed(2)} ({ticksToWin} ✍️ Ticks)</span>
                </div>
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
  container: { padding: '20px', backgroundColor: '#000', minHeight: '100vh', fontFamily: '"PingFang TC", sans-serif' },
  summaryCard: { background: '#111', padding: '25px', borderRadius: '20px', marginBottom: '20px', textAlign: 'center', border: '1px solid #333' },
  summaryLabel: { fontSize: '14px', color: '#888', marginBottom: '5px' },
  summaryValue: { fontSize: '42px', fontWeight: '900' },
  mainInput: { width: '100%', padding: '18px', marginBottom: '25px', borderRadius: '12px', border: 'none', backgroundColor: '#222', color: '#fff', fontSize: '18px', boxSizing: 'border-box' },
  list: { display: 'flex', flexDirection: 'column', gap: '15px' },
  stockCard: { backgroundColor: '#161616', padding: '20px', borderRadius: '15px' },
  cardHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' },
  stockTitle: { fontSize: '22px', fontWeight: 'bold', color: '#fff' },
  stockSub: { fontSize: '14px', color: '#666', marginTop: '4px' },
  profitSection: { textAlign: 'right' },
  netProfit: { fontSize: '26px', fontWeight: 'bold' },
  percent: { fontSize: '20px', fontWeight: 'bold', marginTop: '2px' },
  cardFooter: { marginTop: '15px', paddingTop: '15px', borderTop: '1px solid #333', display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  priceRow: { fontSize: '14px', color: '#aaa' },
  livePrice: { color: '#00d8ff', fontWeight: 'bold', fontSize: '16px', marginRight: '10px' },
  breakeven: { color: '#faad14' },
  delBtn: { backgroundColor: '#333', color: '#ff4d4f', border: 'none', padding: '6px 12px', borderRadius: '6px', cursor: 'pointer', fontSize: '13px' }
};

export default App;