#!/usr/bin/env node
// (@regress 없음 — 러너 밖 · T983 ② 탐침 · 실서버 아이 판 · central + 한반도 · 마을 켬 — T917 run3 꼴)
// === scripts/t983-granary-kill-probe.js — 거래 → 하루 마감 전 존 SIGKILL: 곳간이 되돌아가나(생성) =====================
//
// 판마다(새 손님 하나 · 마을 1 광장):
//   ⓐ 물고기 kg 개체 셋 지급(저장한다) → 거래소에서 물고기 1 → 곡식(재고가 실제로 준 것으로 성사를 센다)
//   ⓑ [마감 낀 판만] 세계 날(`/health` `day` · T890)이 바뀔 때까지 기다린다 — 그 사이 하루 마감이 곳간을 쓴다
//      [마감 안 낀 판] 곧바로 — 거래 시각 · 죽는 시각의 날이 같아야 한다(다르면 그 판은 "마감 안 낀 판"으로 안 센다)
//   ⓒ 존 SIGKILL → 다시 띄움 → 광장의 새 손님이 거래소 표로 곳간 재고를 읽고 · 거래한 손님이 다시 붙어 짐(행)을 읽는다
//   답: 곳간 재고가 거래 뒤 값 쪽이면 "남음" · 거래 전 값이면 "되돌아감" — 되돌아갔는데 사람이 받은 곡식을 가졌으면 **생성**
//
// 쓰는 법: node scripts/t983-granary-kill-probe.js <판 수> [close]      ← 손잡이는 env 그대로(`T983_GRANARY_SAVE=0` = 끔 · 종전)
'use strict';
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const FB = require('./fixture-boot');
const WebSocket = require('ws');

const ROOT = path.join(__dirname, '..');
const CPORT = 3010, HPORT = 3020;
const DDIR = '/tmp/t983-probe';
const N = +(process.argv[2] || 3);
const CLOSE = process.argv[3] === 'close';
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
  ENABLE_VILLAGES: '1', VILLAGE_MAX: '2', ENABLE_BANDITS: '0', ENABLE_WILDLIFE: '0',   // T917 탐침과 같은 손잡이 · 같은 값(마을 둘 · 하루 길이 운영 그대로)
  WRAP_ZONE_PATCH: SQ ? JSON.stringify({ mainSquare: { x: SQ.x, y: SQ.y, name: '탐침 광장' } }) : '{}' });
async function upC() { C = boot(path.join(ROOT, 'server', 'central.js'), { PORT: String(CPORT), DB_PATH: `${DDIR}/central.db`, PUBLIC_HOST: 'localhost', ENABLED_ZONES: 'hanbando' }, 'central');
  if (!(await FB.waitUp(C, /central server up on/, { name: 'central' })).ok) throw new Error('central 기동 실패'); }
async function upZ() { Z = boot(WRAP, ZENV(), 'zone'); if (!(await FB.waitUp(Z, /zone server up on/, { name: 'zone', capMs: 600000 })).ok) throw new Error('zone 기동 실패'); }
const downP = (p, sig) => new Promise((r) => { if (!p || p.exitCode !== null) return r(); p.once('exit', () => r()); try { p.kill(sig); } catch (e) { r(); } });
const jget = async (u) => (await (await fetch(u, { signal: AbortSignal.timeout(8000) })).json());
const dayNow = async () => { try { const h = await jget(`http://localhost:${HPORT}/health`); return h.day != null ? h.day : null; } catch (e) { return null; } };
function open(qs) {
  return new Promise((res, rej) => {
    const ws = new WebSocket(`ws://localhost:${HPORT}/?${qs}`); const st = { ws, welcome: null, notices: [], board: null };
    const t = setTimeout(() => rej(new Error('welcome timeout')), 30000);
    ws.on('error', (e) => { clearTimeout(t); rej(e); });
    ws.on('message', (raw) => { let m; try { m = JSON.parse(raw); } catch (e) { return; }
      if (m.type === 'welcome') { st.welcome = m; clearTimeout(t); res(st); }
      if (m.type === 'notice') st.notices.push(m.text);
      if (m.type === 'village_trade' && m.trade) st.board = m.trade; });
    st.hb = setInterval(() => { try { ws.send(JSON.stringify({ type: 'ping', t: Date.now() })); } catch (e) {} }, 3000);
  });
}
const send = (st, m) => { try { st.ws.send(JSON.stringify(m)); } catch (e) {} };
const close = (st) => new Promise((r) => { if (!st) return r(); clearInterval(st.hb); if (st.ws.readyState === 3) return r(); st.ws.once('close', r); try { st.ws.close(); } catch (e) { r(); } setTimeout(r, 2000); });
const rowOf = async (pid) => ((await jget(`http://localhost:${CPORT}/player/${encodeURIComponent(pid)}`)) || {}).player || null;
const rowInv = (row) => { if (!row) return null; let x = {}; try { x = JSON.parse(row.inventory_json || '{}'); } catch (e) {} return Object.assign({ wood: row.wood | 0, stone: row.stone | 0 }, x); };
const VID = 1;
async function stockRead(tag, res) {
  const g = await open(`username=&name=t983r${tag}&color=%23ffffff`); await sleep(800);
  send(g, { type: 'village_trade', vid: VID }); await sleep(900);
  const v = g.board ? ((g.board.rows || []).find((x) => x.res === res) || {}).stock : null;
  await close(g); return v;
}

let K = 0;
async function trip() {
  const k = ++K, nm = `t983_${k}`;
  const a = await open(`username=&name=${nm}&color=%23ffffff`);
  const pid = a.welcome.playerId, tok = a.welcome.guestToken;
  send(a, { type: '__e2e_give', kgs: { fish: [1.7, 1.2, 0.9] }, quiet: true }); await sleep(1200);
  send(a, { type: 'village_trade', vid: VID }); await sleep(900);
  const b0 = a.board; let deal = null;
  if (b0 && Array.isArray(b0.rows)) {
    for (const r of b0.rows.filter((r) => r.res !== 'fish' && r.stock > 1)) {
      const before = a.board;
      send(a, { type: 'village_trade_exec', vid: VID, give: 'fish', take: r.res, qty: 1 }); await sleep(900);
      if (a.board !== before) { deal = { take: r.res, stock0: r.stock, stock1: ((a.board.rows || []).find((x) => x.res === r.res) || {}).stock }; break; }
    }
  }
  if (!deal) { await close(a); return { k, err: '거래 성사 0 — ' + (a.notices.slice(-1)[0] || '').slice(0, 60) }; }
  const dayT = await dayNow(); const tT = Date.now();
  const invLive = rowInv(await rowOf(pid));
  let P = null; try { P = (await jget(`http://localhost:${HPORT}/perf`)).econTick; } catch (e) {}
  if (CLOSE) { for (let i = 0; i < 900 && (await dayNow()) === dayT; i++) await sleep(2000); await sleep(8000); }   // 날이 바뀐 뒤 · 마감 저장 줄(틱당 한 마을)이 다 돌 몫
  const dayK = await dayNow();
  await downP(Z, 'SIGKILL'); Z = null; await close(a);
  const killMs = Date.now() - tT;
  await sleep(1000); await upZ(); await sleep(3000);
  const stockA = await stockRead(k, deal.take);
  const b = await open(`username=&name=${nm}&color=%23ffffff&guest_token=${encodeURIComponent(tok)}`); await sleep(1000);
  const invA = rowInv(await rowOf(pid)); await close(b);
  const kept = stockA != null ? Math.abs(stockA - deal.stock1) < Math.abs(stockA - deal.stock0) : null;
  const got = (invA && invA[deal.take]) || 0;
  return { k, close: CLOSE, deal, stockA, kept, dayT, dayK, closed: dayK !== dayT, killMs, invLive, invA, personKept: (invLive && invLive[deal.take]) === got,
    created: kept === false && got > 0 ? got : 0, t983: P && P.t983 ? P.t983 : null };
}

(async () => {
  fs.rmSync(DDIR, { recursive: true, force: true }); fs.mkdirSync(DDIR, { recursive: true });
  fs.writeFileSync(WRAP, `const path=require('path');const cfg=require(${JSON.stringify(path.join(ROOT, 'server', 'zone-config'))});
Object.assign(cfg.ZONES.hanbando,JSON.parse(process.env.WRAP_ZONE_PATCH||'{}'));
require(${JSON.stringify(path.join(ROOT, 'server', 'zone.js'))});`);
  await upC(); await upZ(); await sleep(2000);
  const db = new (require('node:sqlite').DatabaseSync)(`${DDIR}/w-han.db`);
  const v = db.prepare('SELECT id, name, cx, cy FROM villages WHERE id = ?').get(VID); db.close();
  SQ = { x: v.cx * 32 + 16, y: v.cy * 32 + 16 };
  await downP(Z, 'SIGTERM'); Z = null; await upZ(); await sleep(3000);
  console.log(`[T983 탐침] T983_GRANARY_SAVE=${process.env.T983_GRANARY_SAVE === undefined ? '(기본)' : process.env.T983_GRANARY_SAVE} · 판 ${N} · ${CLOSE ? '마감 낀 판' : '마감 안 낀 판'} · 마을 ${v.name}`);
  const R = [];
  for (let i = 0; i < N; i++) { let r; try { r = await trip(); } catch (e) { r = { err: e.message }; if (!Z) await upZ().catch(() => {}); } R.push(r); console.log(JSON.stringify(r)); }
  fs.writeFileSync(`${DDIR}/result.json`, JSON.stringify(R, null, 1));
  const M = R.filter((r) => !r.err && r.closed === CLOSE);
  console.log(`[T983 합] 재는 판 ${M.length}/${R.length} · 곳간 남음 ${M.filter((r) => r.kept).length} · 되돌아감 ${M.filter((r) => r.kept === false).length} · 생성(되돌아간 판에서 사람이 가진 받은 몫) ${M.reduce((s, r) => s + r.created, 0)} · 사람 짐 남음 ${M.filter((r) => r.personKept).length}`);
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
