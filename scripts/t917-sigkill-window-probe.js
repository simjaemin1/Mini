#!/usr/bin/env node
// (@regress 없음 — 러너 밖 · T917 ② 탐침 · 실서버 아이 판 · central + 한반도 · 마을 켬)
// === scripts/t917-sigkill-window-probe.js — 존 SIGKILL 손실 창: 행동 뒤 몇 초에 죽으면 무엇이 남나 =============================
//
// 왜(T894 회부 2): 존이 SIGKILL(메모리 부족 · 호스트 재부팅 · docker kill)로 죽으면 마지막 저장 뒤 몸 칸을 잃는다.
//   결함인지는 창의 크기에 달렸다 — 이 탐침은 **재기만** 한다(고침 0 · 판정 0).
//
// 판마다(지연 하나 · 새 손님 하나):
//   ⓐ 마을 광장에 선다(존 래퍼가 `mainSquare` 만 마을 한가운데로 — e2e-nature 의 래퍼 문법 · 세계는 그대로)
//   ⓑ 지급(저장한다): 도끼 · 톱 · 통나무 · 물고기(kg 개체)
//   ⓒ 행동 셋 — 채집(가장 가까운 나무로 걸어가 벤다 · 쓰러질 때까지) · 제작(`craft_item plank` · 톱) · 거래(마을 거래소 · 물고기를 낸다)
//   ⓓ 산 몸 · 행 · 거래소 재고를 읽는다(죽기 직전 = "산 값")
//   ⓔ 지연 D 초(0 · 5 · 30 · 60 · 120 — 카드 표) 뒤 존 SIGKILL → 다시 띄움 → 같은 손님 토큰으로 다시 붙는다
//   ⓕ 다시 붙은 몸 · 행 · 거래소 재고 · 벤 나무가 다시 섰나 — "산 값" 과 칸마다 견준다
//
// 쓰는 법: node scripts/t917-sigkill-window-probe.js [지연들=0,5,30,60,120]
'use strict';
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const FB = require('./fixture-boot');
const WebSocket = require('ws');

const ROOT = path.join(__dirname, '..');
const CPORT = 3010, HPORT = 3020;
const DDIR = '/tmp/t917-probe';
const DELAYS = (process.argv[2] || '0,5,30,60,120').split(',').map(Number);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let C = null, Z = null, nLog = 0, SQ = null;
function boot(file, env, tag) {
  const p = spawn(process.execPath, [file], { cwd: ROOT, env: Object.assign({}, process.env, env), stdio: ['ignore', 'pipe', 'pipe'] });
  const lg = fs.createWriteStream(`${DDIR}/${tag}-${++nLog}.log`, { flags: 'w' }); p.stdout.pipe(lg); p.stderr.pipe(lg);
  return p;
}
process.on('exit', () => { for (const p of [C, Z]) { try { if (p) p.kill('SIGKILL'); } catch (e) {} } });
const WRAP = `${DDIR}/zone-wrap.js`;
const ZENV = () => ({ PORT: String(HPORT), ZONE_ID: 'hanbando', DB_PATH: `${DDIR}/w-han.db`, E2E_GIVE: '1', CENTRAL_URL: `http://localhost:${CPORT}`,
  ENABLE_VILLAGES: '1', VILLAGE_MAX: '2', ENABLE_BANDITS: '0', ENABLE_WILDLIFE: '0',   // 마을 둘(e2e-trade 와 같은 손잡이 · 같은 값 — 부팅을 짧게) · 하루 길이는 운영 그대로
  WRAP_ZONE_PATCH: SQ ? JSON.stringify({ mainSquare: { x: SQ.x, y: SQ.y, name: '탐침 광장' } }) : '{}' });
async function upC() { C = boot(path.join(ROOT, 'server', 'central.js'), { PORT: String(CPORT), DB_PATH: `${DDIR}/central.db`, PUBLIC_HOST: 'localhost', ENABLED_ZONES: 'hanbando' }, 'central');
  if (!(await FB.waitUp(C, /central server up on/, { name: 'central' })).ok) throw new Error('central 기동 실패'); }
async function upZ() { Z = boot(WRAP, ZENV(), 'zone'); if (!(await FB.waitUp(Z, /zone server up on/, { name: 'zone', capMs: 600000 })).ok) throw new Error('zone 기동 실패'); }
const downP = (p, sig) => new Promise((r) => { if (!p || p.exitCode !== null) return r(); p.once('exit', () => r()); try { p.kill(sig); } catch (e) { r(); } });
const jget = async (u) => (await (await fetch(u, { signal: AbortSignal.timeout(8000) })).json());
function open(qs) {
  return new Promise((res, rej) => {
    const ws = new WebSocket(`ws://localhost:${HPORT}/?${qs}`); const st = { ws, welcome: null, notices: [], board: null, removed: new Set() };
    const t = setTimeout(() => rej(new Error('welcome timeout')), 30000);
    ws.on('error', (e) => { clearTimeout(t); rej(e); });
    ws.on('message', (raw) => { let m; try { m = JSON.parse(raw); } catch (e) { return; }
      if (m.type === 'welcome') { st.welcome = m; clearTimeout(t); res(st); }
      if (m.type === 'notice') st.notices.push(m.text);
      if (m.type === 'village_trade' && m.trade) st.board = m.trade;
      if (m.type === 'resource_removed') st.removed.add(m.id); });
    st.seq = 0; st.hb = setInterval(() => { try { ws.send(JSON.stringify({ type: 'ping', t: Date.now() })); } catch (e) {} }, 3000);
  });
}
const send = (st, m) => { try { st.ws.send(JSON.stringify(m)); } catch (e) {} };
const close = (st) => new Promise((r) => { if (!st) return r(); clearInterval(st.hb); if (st.ws.readyState === 3) return r(); st.ws.once('close', r); try { st.ws.close(); } catch (e) { r(); } setTimeout(r, 2000); });
const bodyOf = async (name) => { const o = await jget(`http://localhost:${HPORT}/bodydbg?name=${encodeURIComponent(name)}`); return (o.bodies || {})[name] || null; };
const rowOf = async (pid) => ((await jget(`http://localhost:${CPORT}/player/${encodeURIComponent(pid)}`)) || {}).player || null;
const rowInv = (row) => { if (!row) return null; let x = {}; try { x = JSON.parse(row.inventory_json || '{}'); } catch (e) {} return Object.assign({ wood: row.wood | 0, stone: row.stone | 0 }, x); };
const rowBody = (row) => { try { return JSON.parse((row && row.tools_json) || 'null'); } catch (e) { return null; } };
const dayNow = async () => { try { const h = await jget(`http://localhost:${HPORT}/health`); return h.day != null ? h.day : null; } catch (e) { return null; } };   // ★[T890] `/health` 의 세계 날
const J = (x) => JSON.stringify(x === undefined ? null : x);
// 로트는 내구 칸(d · k · n · m · w)만 견준다 — `e · t` 는 정산마다 흐른 시간만큼 자란다(`test-handoff-body` T778 과 같은 잣대)
const lotsDur = (L) => J(L == null ? null : Object.fromEntries(Object.entries(L).map(([k, a]) => [k, (Array.isArray(a) ? a : []).map((r) => (r && typeof r === 'object') ? { d: r.d, k: r.k, n: r.n, m: r.m, w: r.w } : r)])));

// 걷기 — 입력 하나 = 한 걸음(틱당 흡수 · 30Hz · MOVE_SPEED 64px/초). 길에 건물이 있으면 막히므로 축 둘로 나눠 걷는다(가로 먼저 · 막히면 세로 먼저).
//   남은 거리는 서버가 "Npx 떨어짐" 알림으로 말해 준다 — 그 알림이 48px 밖이면 다음 나무로 간다.
async function stepN(st, ux, uy, n) { for (let i = 0; i < n; i++) { send(st, { type: 'input', seq: ++st.seq, vx: ux, vy: uy }); await sleep(1000 / 30); } send(st, { type: 'input', seq: ++st.seq, vx: 0, vy: 0 }); await sleep(300); }
async function walkAxis(st, dx, dy, yFirst) {
  const legs = yFirst ? [[0, dy], [dx, 0]] : [[dx, 0], [0, dy]];
  for (const [lx, ly] of legs) { const d = Math.abs(lx) + Math.abs(ly); if (d < 4) continue; await stepN(st, Math.sign(lx), Math.sign(ly), Math.ceil(d / (64 / 30))); }
}
const distSaid = (st) => { const t = st.notices.slice().reverse().find((x) => /px 떨어짐/.test(x)); return t ? +t.match(/(\d+)px/)[1] : null; };
async function trip(D) {
  const nm = `t917_${D}`;
  const a = await open(`username=&name=${nm}&color=%23ffffff`);
  const pid = a.welcome.playerId, tok = a.welcome.guestToken;
  const name = ((await rowOf(pid)) || {}).name;
  const row00 = await rowOf(pid); const at = { x: row00.last_x, y: row00.last_y };
  send(a, { type: '__e2e_give', items: { wood: 4 }, tools: ['axe', 'saw'], kgs: { fish: [1.7, 1.2, 0.9] }, quiet: true });
  await sleep(1200);
  const B0 = await bodyOf(name);
  const axe = (B0.toolItems || []).find((t) => t.type === 'axe'); if (axe) send(a, { type: 'equip', toolItemId: axe.id });
  await sleep(500);
  const out = { D, pid, at, act: {} };
  // ── 거래: 마을 거래소 — 물고기를 내고 재고가 있는 품목 하나를 받는다 ──
  const vid = 1;
  out.t = { trade: Date.now() }; out.dayAtTrade = await dayNow();
  send(a, { type: 'village_trade', vid }); await sleep(900);
  const board0 = a.board; let deal = null;
  if (board0 && Array.isArray(board0.rows)) {
    for (const r of board0.rows.filter((r) => r.res !== 'fish' && r.stock > 1)) {
      const b4 = a.board;
      send(a, { type: 'village_trade_exec', vid, give: 'fish', take: r.res, qty: 1 }); await sleep(900);
      if (a.board !== b4) { deal = { take: r.res, stock0: r.stock, stock1: ((a.board.rows || []).find((x) => x.res === r.res) || {}).stock }; break; }
    }
  }
  out.t.craft = Date.now();
  out.act.trade = deal || { fail: (a.notices.slice(-1)[0] || '').slice(0, 60), rows: board0 ? (board0.rows || []).length : null };
  // ── 제작: 판자(톱 · 통나무 1 → 판자 2) ─────────────────────
  send(a, { type: 'craft_item', recipe: 'plank' }); await sleep(800);
  out.act.craft = { notice: a.notices.filter((t) => /판자|완료|필요/.test(t)).slice(-1)[0] || null };
  // ── 채집: 가장 가까운 나무(마지막 — 걸어서 광장을 떠난다 · 거래소 문 260px 은 앞에서 썼다) ─────────────────────────────────
  const trees = (a.welcome.resources || []).filter((r) => r.type === 'tree').map((r) => ({ id: r.id, x: r.x, y: r.y, d: Math.hypot(r.x - at.x, r.y - at.y) })).sort((p, q) => p.d - q.d);
  let T = null, gathered = false, tried = [];
  for (const cand of trees.slice(0, 6)) {
    // 지금 자리에서 그 나무까지 — 첫 나무는 광장에서, 다음 나무는 되돌아오지 않고 서버가 말한 거리로 겨눈다
    for (const yFirst of [false, true, false, true]) {
      const n0 = a.notices.length;
      send(a, { type: 'gather', resId: cand.id }); await sleep(500);
      const said = distSaid({ notices: a.notices.slice(n0) });
      if (said === null && a.notices.length > n0) break;   // 거리 알림이 없다 = 닿았다
      const here = { x: cand.x - (cand.x - at.x) * (said || cand.d) / cand.d, y: cand.y - (cand.y - at.y) * (said || cand.d) / cand.d };
      await walkAxis(a, cand.x - here.x, cand.y - here.y, yFirst);
    }
    for (let i = 0; i < 120 && !a.removed.has(cand.id); i++) { send(a, { type: 'gather', resId: cand.id }); await sleep(350); }
    tried.push({ id: cand.id, d: Math.round(cand.d), said: distSaid(a) });
    if (a.removed.has(cand.id)) { T = cand; gathered = true; break; }
  }
  if (!T) T = trees[0] || null;
  out.act.gather = { tree: T ? T.id : null, dist0: T ? Math.round(T.d) : null, felled: gathered, tried, lastNotice: a.notices.filter((t) => /떨어짐|캤|나무|통나무|베/.test(t)).slice(-2) };
  out.t.gatherEnd = Date.now();
  // ── ⓓ 산 값 ─────────────────────────────────────────────
  const live = await bodyOf(name), rowL = await rowOf(pid);
  const liveInv = rowInv(rowL);   // 행동마다 저장했다 — 산 짐 = 그 순간 행(산 짐을 보는 창은 없다 · 아래 "행 = 산 몸" 칸이 그걸 잰다)
  out.live = { inv: liveInv, axeD: ((live.toolItems || []).find((t) => t.type === 'axe') || {}).d, sawD: ((live.toolItems || []).find((t) => t.type === 'saw') || {}).d,
    craftSkill: live.craftSkill, craftLog: live.craftLog, hp: live.vital.hp, body: live.body, lots: live.lots, kg: live.kgLedger };
  out.rowEqLive = { tools: J(rowBody(rowL).toolItems) === J(live.toolItems), craftSkill: J(rowBody(rowL).craftSkill) === J(live.craftSkill), lots: lotsDur(rowBody(rowL).lots) === lotsDur(live.lots), kg: J(rowBody(rowL).kgLedger) === J(live.kgLedger) };
  out.liveHunger = rowL.hunger; out.liveXY = { x: rowL.last_x, y: rowL.last_y };
  const treeOf = async () => { if (!T) return null; const o = await new Promise((res) => { const w = new WebSocket(`ws://localhost:${HPORT}/?observer=1`);
    const t = setTimeout(() => { try { w.close(); } catch (e) {} res(null); }, 15000);
    w.on('message', (raw) => { let m; try { m = JSON.parse(raw); } catch (e) { return; } if (m.type === 'welcome') { clearTimeout(t); try { w.close(); } catch (e) {} res(m); } }); w.on('error', () => res(null)); });
    const r = o && (o.resources || []).find((x) => x.id === T.id); return r ? (r.type + (r.sp ? ':' + r.sp : '') + (r.hp != null ? ' hp' + r.hp : '')) : '없음'; };
  out.treeLive = await treeOf();
  // ── ⓔ 지연 뒤 SIGKILL ───────────────────────────────────
  const tAct = Date.now();
  await sleep(D * 1000);
  const rowK = await rowOf(pid), liveK = await bodyOf(name);
  out.dayAtKill = await dayNow();
  out.atKill = { ms: Date.now() - tAct, tradeToKillMs: Date.now() - out.t.trade, craftToKillMs: Date.now() - out.t.craft, rowHunger: rowK.hunger, liveHungerSoft: liveK && liveK.body ? +(liveK.body.cold || 0).toFixed(3) : null, rowXY: { x: rowK.last_x, y: rowK.last_y }, rowSeen: rowK.last_seen || null };
  await downP(Z, 'SIGKILL'); Z = null; await close(a);
  await sleep(1000); await upZ(); await sleep(3000);
  // ── ⓕ 다시 붙는다 ───────────────────────────────────────
  const b = await open(`username=&name=${nm}&color=%23ffffff&guest_token=${encodeURIComponent(tok)}`); await sleep(1200);
  const after = await bodyOf(name), rowA = await rowOf(pid);
  // 거래소 재고는 광장(마을 문 안)에 선 **새 손님**이 읽는다 — 다시 붙은 이 사람은 걸어 나간 자리(행)에 선다
  const g = await open(`username=&name=t917r${D}&color=%23ffffff`); await sleep(800);
  send(g, { type: 'village_trade', vid }); await sleep(900);
  const stockA = deal && g.board ? ((g.board.rows || []).find((x) => x.res === deal.take) || {}).stock : null;
  await close(g);
  const treeBack = await treeOf();
  out.after = { inv: rowInv(rowA), axeD: ((after.toolItems || []).find((t) => t.type === 'axe') || {}).d, sawD: ((after.toolItems || []).find((t) => t.type === 'saw') || {}).d,
    craftSkill: after.craftSkill, craftLog: after.craftLog, hp: after.vital.hp, lotsSame: lotsDur(after.lots) === lotsDur(live.lots), kgSame: J(after.kgLedger) === J(live.kgLedger),
    hunger: rowA.hunger, stock: stockA, treeBack, xy: { x: rowA.last_x, y: rowA.last_y } };
  out.same = { inv: J(out.after.inv) === J(liveInv), axe: out.after.axeD === out.live.axeD, saw: out.after.sawD === out.live.sawD,
    craftSkill: J(after.craftSkill) === J(live.craftSkill), craftLog: J(after.craftLog) === J(live.craftLog), lots: out.after.lotsSame, kg: out.after.kgSame,
    stock: deal && stockA != null ? Math.abs(stockA - deal.stock1) < Math.abs(stockA - deal.stock0) : null,   // 다시 뜬 재고가 거래 뒤 값 쪽이면 남음(그 사이 econ 하루가 재고를 조금 움직인다 — 값은 표에 그대로)
    tree: T && gathered ? !/^tree/.test(String(treeBack)) : null };   // 벤 나무가 다시 나무로 서면 잃음(그루터기 · 없음 = 벤 것이 남았다)
  await close(b); await sleep(500);
  return out;
}

(async () => {
  fs.rmSync(DDIR, { recursive: true, force: true }); fs.mkdirSync(DDIR, { recursive: true });
  fs.writeFileSync(WRAP, `const path=require('path');const cfg=require(${JSON.stringify(path.join(ROOT, 'server', 'zone-config'))});
Object.assign(cfg.ZONES.hanbando,JSON.parse(process.env.WRAP_ZONE_PATCH||'{}'));
require(${JSON.stringify(path.join(ROOT, 'server', 'zone.js'))});`);
  await upC(); await upZ();
  // 마을 1 의 한가운데 — 시딩이 정한 자리(존 DB · 손으로 안 적는다)를 읽고 그 자리로 광장을 옮겨 다시 띄운다
  await sleep(2000);
  const db = new (require('node:sqlite').DatabaseSync)(`${DDIR}/w-han.db`);
  const v = db.prepare('SELECT id, name, cx, cy FROM villages WHERE id = 1').get(); db.close();
  SQ = { x: v.cx * 32 + 16, y: v.cy * 32 + 16 };
  console.log(`[T917 탐침] 마을 ${v.id} ${v.name} 광장 (${SQ.x},${SQ.y}) · 지연 ${DELAYS.join(',')}초`);
  await downP(Z, 'SIGTERM'); Z = null; await upZ(); await sleep(3000);
  const R = [];
  for (const D of DELAYS) {
    let r; try { r = await trip(D); } catch (e) { r = { D, err: e.message }; if (!Z) await upZ().catch(() => {}); }
    R.push(r); console.log(JSON.stringify(r));
  }
  fs.writeFileSync(`${DDIR}/result.json`, JSON.stringify(R, null, 1));
  console.log('\n[T917 표] 지연초(채집 끝→죽음) · 거래→죽음초 · 날(거래→죽음) | 짐 | 도끼내구 | 톱내구 | 숙련 | 제작이력 | 로트 | kg | 거래소재고 | 벤나무 | 허기(산→다시) | 자리');
  for (const r of R) {
    if (r.err) { console.log(`[T917 표] ${r.D} | 오류 ${r.err}`); continue; }
    const s = r.same, m = (b) => (b === null ? '—' : b ? '남음' : '잃음');
    console.log(`[T917 표] ${r.D} · ${Math.round(r.atKill.tradeToKillMs / 1000)} · ${r.dayAtTrade}→${r.dayAtKill} | ${m(s.inv)} | ${m(s.axe)} | ${m(s.saw)} | ${m(s.craftSkill)} | ${m(s.craftLog)} | ${m(s.lots)} | ${m(s.kg)} | ${m(s.stock)}(${r.act.trade.stock0}→${r.act.trade.stock1}→${r.after.stock}) | ${m(s.tree)}(${r.treeLive}→${r.after.treeBack}) | ${r.liveHunger}→${r.after.hunger} | ${Math.round(r.liveXY.x)},${Math.round(r.liveXY.y)}→${Math.round(r.after.xy.x)},${Math.round(r.after.xy.y)}`);
  }
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
