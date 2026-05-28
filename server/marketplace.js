// 중앙 거래소 서버 (포트 3010)
// HTTP API:
//   POST /order      { player_id, side: 'sell'|'buy', item, amount, price_item, price_amount }
//   GET  /orders     활성 주문 목록
//   POST /cancel     { player_id, order_id }
//   GET  /health
//
// Escrow: sell 주문 시 player의 인벤토리에서 item을 차감 (DB 직접).
// 매칭: 새 주문이 들어오면 반대 side 주문과 match. 가격(price_item, price_amount) 동일하면 체결.
// 체결 시 양쪽 inventory에 결과 반영.
//
// 분산 락 없음 — 단일 프로세스 직렬 처리 (Node.js 이벤트 루프). 다중 인스턴스로 가려면 Redis 필요.

const http = require('http');
const db = require('./db');

const PORT = parseInt(process.env.PORT || '3010', 10);

// 메모리 주문서. DB 영속화는 추후 — 일단 프로세스 재시작 시 주문 초기화.
const orders = new Map(); // order_id -> { id, player_id, side, item, amount, price_item, price_amount, created_at }
let nextOrderId = 1;

function jsonResp(res, status, obj) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(obj));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', c => body += c);
    req.on('end', () => {
      try { resolve(body ? JSON.parse(body) : {}); }
      catch (e) { reject(e); }
    });
  });
}

function validateItem(s) { return s === 'wood' || s === 'stone'; }

// 한 주문을 매칭. 매칭되면 체결, 남으면 주문서에 보관.
function matchOrUpload(newOrder) {
  // 상대 side 주문 중 매칭 가능한 것 찾기 (FIFO)
  const oppositeSide = newOrder.side === 'sell' ? 'buy' : 'sell';
  let remaining = newOrder.amount;
  const matches = [];
  for (const o of orders.values()) {
    if (remaining <= 0) break;
    if (o.side !== oppositeSide) continue;
    if (o.item !== newOrder.item) continue;
    if (o.price_item !== newOrder.price_item) continue;
    if (o.price_amount !== newOrder.price_amount) continue;
    if (o.player_id === newOrder.player_id) continue; // 자기 주문은 매칭 안 함
    const matchAmount = Math.min(remaining, o.amount);
    matches.push({ counter: o, amount: matchAmount });
    remaining -= matchAmount;
  }

  // 매칭 체결
  for (const m of matches) {
    settle(newOrder, m.counter, m.amount);
    m.counter.amount -= m.amount;
    if (m.counter.amount <= 0) orders.delete(m.counter.id);
  }

  // 남은 만큼 주문서에 등록
  if (remaining > 0) {
    newOrder.amount = remaining;
    orders.set(newOrder.id, newOrder);
  }
  return { matched: newOrder.amount === 0 ? 'full' : (matches.length > 0 ? 'partial' : 'none'), remaining };
}

// sell 주문 1개 + buy 주문 1개 체결: seller에게 price, buyer에게 item.
// player_id로 DB에서 직접 인벤토리 update.
function settle(newOrder, counter, amount) {
  const sellOrder = newOrder.side === 'sell' ? newOrder : counter;
  const buyOrder  = newOrder.side === 'buy'  ? newOrder : counter;
  const item = sellOrder.item;
  const totalPrice = buyOrder.price_amount * amount;
  const priceItem = buyOrder.price_item;

  // sell 측 인벤토리는 sell 주문 등록 시 이미 차감됨(escrow). 여기선 sell에게 price만 지급.
  // buy 측은 buy 주문 등록 시 price 차감됨. 여기선 buy에게 item 지급.
  const seller = db.getPlayer(sellOrder.player_id);
  const buyer  = db.getPlayer(buyOrder.player_id);
  if (seller) {
    const inv = { wood: seller.wood, stone: seller.stone };
    inv[priceItem] = (inv[priceItem] || 0) + totalPrice;
    db.updateInventory(seller.player_id, inv.wood, inv.stone);
  }
  if (buyer) {
    const inv = { wood: buyer.wood, stone: buyer.stone };
    inv[item] = (inv[item] || 0) + amount;
    db.updateInventory(buyer.player_id, inv.wood, inv.stone);
  }
  console.log(`[market] 체결: ${sellOrder.player_id} → ${buyOrder.player_id} | ${item} ${amount}개 ↔ ${priceItem} ${totalPrice}`);
}

const server = http.createServer(async (req, res) => {
  try {
    if (req.url === '/health' && req.method === 'GET') {
      return jsonResp(res, 200, { ok: true, orders: orders.size });
    }
    if (req.url === '/orders' && req.method === 'GET') {
      return jsonResp(res, 200, { orders: Array.from(orders.values()) });
    }
    if (req.url === '/order' && req.method === 'POST') {
      const data = await readBody(req);
      const playerId = data.player_id;
      if (!playerId || playerId.startsWith('anon_')) return jsonResp(res, 400, { error: '로그인 필요' });
      const side = data.side;
      if (side !== 'sell' && side !== 'buy') return jsonResp(res, 400, { error: 'side 잘못됨' });
      const item = data.item;
      if (!validateItem(item)) return jsonResp(res, 400, { error: 'item 잘못됨' });
      const amount = Math.max(1, +data.amount | 0);
      const priceItem = data.price_item;
      if (!validateItem(priceItem) || priceItem === item) return jsonResp(res, 400, { error: 'price_item 잘못됨' });
      const priceAmount = Math.max(1, +data.price_amount | 0);

      // Escrow: 주문 등록 시 미리 차감
      const p = db.getPlayer(playerId);
      if (!p) return jsonResp(res, 400, { error: '플레이어 없음' });
      if (side === 'sell') {
        if ((p[item] | 0) < amount) return jsonResp(res, 400, { error: `${item} 부족` });
        const inv = { wood: p.wood, stone: p.stone };
        inv[item] -= amount;
        db.updateInventory(playerId, inv.wood, inv.stone);
      } else {
        const totalCost = priceAmount * amount;
        if ((p[priceItem] | 0) < totalCost) return jsonResp(res, 400, { error: `${priceItem} 부족 (필요 ${totalCost})` });
        const inv = { wood: p.wood, stone: p.stone };
        inv[priceItem] -= totalCost;
        db.updateInventory(playerId, inv.wood, inv.stone);
      }

      const id = nextOrderId++;
      const newOrder = {
        id, player_id: playerId, side, item, amount,
        price_item: priceItem, price_amount: priceAmount,
        created_at: Date.now(),
      };
      const result = matchOrUpload(newOrder);
      return jsonResp(res, 200, { ok: true, order_id: id, matched: result.matched, remaining: result.remaining });
    }
    if (req.url === '/cancel' && req.method === 'POST') {
      const data = await readBody(req);
      const playerId = data.player_id;
      const orderId = +data.order_id | 0;
      const o = orders.get(orderId);
      if (!o) return jsonResp(res, 404, { error: '주문 없음' });
      if (o.player_id !== playerId) return jsonResp(res, 403, { error: '본인 주문 아님' });
      // 환불: escrow 돌려줌
      const p = db.getPlayer(playerId);
      if (p) {
        const inv = { wood: p.wood, stone: p.stone };
        if (o.side === 'sell') inv[o.item] += o.amount;
        else inv[o.price_item] += o.price_amount * o.amount;
        db.updateInventory(playerId, inv.wood, inv.stone);
      }
      orders.delete(orderId);
      return jsonResp(res, 200, { ok: true });
    }
    res.writeHead(404); res.end();
  } catch (e) {
    console.error('[market] error:', e);
    jsonResp(res, 500, { error: String(e.message || e) });
  }
});

server.listen(PORT, () => {
  console.log(`[market] 🏪 marketplace up on :${PORT}`);
});
