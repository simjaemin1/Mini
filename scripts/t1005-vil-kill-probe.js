#!/usr/bin/env node
// (@regress 없음 — 러너 밖 · T1005 ① 탐침 · 실서버 아이 판 · central + 한반도 · 마을 켬 — T917 run3 · T983 꼴)
// === scripts/t1005-vil-kill-probe.js — 사람 행동 → 하루 마감 전 존 SIGKILL: 마을 칸이 되돌아가나(생성 · 소멸) =====================
//
// 창(첫 인자) — 판마다 새 손님 하나 · 행동은 전부 **클라 메시지**(정본 문)로 한다:
//   meal  — 마을 광장에서 `__e2e_body`(허기 0 · 갈증 0 · hp 1 — E2E 픽스처) → 정본 극단 피해로 쓰러짐 → 구조 창(`DOWN_RESCUE_WINDOW_MS` 시간 손잡이만 줄임 ·
//           test-downed 와 같은 값) → 마을 이송 = `_villageMeal`(곳간 food 1) + `_noteRescueEvent`(사건 장부 줄). 사람 주기 저장(`SAVE_INTERVAL_MS`)을 한 번 기다린 뒤 죽인다.
//   fish  — 물가 광장에서 `fish_cast` → 입질(`fish_state bite`) → `fish_strike` → 손에 듦(`fish_catch`) × K. 어장 칸(`fish_cells`)은 그 자리에서 저장된다 —
//           마감에만 저장되는 것은 마을 econ `land.fishSustain`(어장 상한)이다.
//   hunt  — 야생 켬(`ENABLE_WILDLIFE=1`) · 광장에서 마을 사냥 밴드 안 야생 몹으로 `input` 조향 → `attack` 반복 → 잡음(`huntKillAt` → `_gameRich` −1).
//   house — `__e2e_give`(굴립주 · 서까래 · 이엉 = PSITE_COST) → `request_village_house`(후보 칸을 차례로 · 서버가 거절하면 다음) → 의뢰 성사.
//           사람 주기 저장을 한 번 기다린 뒤 죽인다(사람 쪽 선납 몫을 갈라 보려고 — 아래 `--now` 는 기다리지 않는다).
//   ⇒ 그 뒤 곧바로(마감 안 낀 판) 또는 세계 날이 바뀐 뒤(`close`) 존 SIGKILL → 다시 띄운다.
//
// ★관측(읽기만 · 세계에 0): 탐침이 만든 래퍼(`zone-wrap.js` · /tmp 안)가 `Zone.__testBind()` 로 마을 칸을 읽어 파일로 내준다(`ask` → `mem.json`).
//   자리 찾기(물가 선 칸 · 사냥 밴드 안 몹 · 집터 후보 칸)도 이 읽기로 한다 — **행동은 하나도 이 길로 안 한다**(전부 위 클라 메시지).
//   죽은 뒤에는 존 DB(`w-han.db`)의 마을 행(`econ_state`)을 직접 읽는다 = 다시 뜨면 읽힐 바로 그 값.
//
// 쓰는 법: node scripts/t1005-vil-kill-probe.js <meal|fish|hunt|house|trade|phouse|ev> <판 수> [close] [--now] [--raw] [--rot] [--term] [--restarts=K]
//   ★[T1023] 창 `phouse` = 완공된 의뢰 집 픽스처(존이 내려간 사이 `village_buildings` 'phouse' 행 하나 — 행동 아님) → 다시 뜨기만 `<판 수>` 번 · 뜰 때마다 그 사람 소유 벽 · 바닥 행 수
//   ★[T1023] `--term` = SIGTERM(종료 저장 문) · `--restarts=K` = 집터 창에서 행동 한 번 뒤 같은 신호로 K 번 다시 뜨기(뜰 때마다 의뢰 집터 행) · 손잡이 `T1023_PSITE_KEEP=0` = 끔
//   ev    — ★[T1025] 완공 · 굶음 사건 줄(`noteVillageBuilt` · `noteStarved`)을 **래퍼가 세운다**(관측 손 — 생활층 완공 · 기근 몸은 탐침 시간 안에 안 선다) → 같은 틱 끝 →
//           죽이고 행 곁 칸(`_t1025Ev`) · 다시 뜬 뒤 대기 줄(`t1025Pending`)을 본다. 구제 줄은 meal 창이 정본 문으로 세운다.
//   손잡이는 env 그대로(`T1005_VIL_SAVE=0` = 끔 · 종전 · ★[T1025] `T1025_EV_CORPSE=0` = 끔).
//   caravan — ★[T1034] 길 위 캐러밴(장부 `world.caravans` · 실체 몸) — 데우기(짧은 하루 · 캐러밴이 길에 설 때까지) → 운영 하루로 다시 → 몸이 선 뒤
//           `T1034_PROBE_WAIT` 초(기본 30) → 죽임 → 다시 띄워 T775 몸 세우기가 끝날 때까지 → 캐러밴마다 장부 칸 · 몸 칸 · 자리를 견준다.
//           `--block` = 재는 판에만 정본 시험 훅 `VILLAGE_CARAVAN_BLOCKTEST=1`(가상 장애물 1회 → `caravanBlockedResponse` → 재경로 · 지연 · villages.js 헤더 주석).
//   ★[T1025] `--rot` — 사냥 창에서 도살 없이 사체가 썩을 때까지(5분 + 청소 30초) 기다린 뒤 죽인다(부패 갈래 장부).
'use strict';
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const FB = require('./fixture-boot');
const WebSocket = require('ws');

const ROOT = path.join(__dirname, '..');
const WIN = process.argv[2];
const _WI = ['meal', 'fish', 'hunt', 'house', 'trade', 'phouse', 'ev', 'caravan'].indexOf(WIN);
const _OFF = process.env.T1005_VIL_SAVE === '0', _OFF23 = process.env.T1023_PSITE_KEEP === '0';
const _OFF25 = process.env.T1025_EV_CORPSE === '0';   // ★[T1025] 끔 판 — 포트 · 자리를 따로
const _SLOT = Math.max(0, Math.min(3, +process.env.T1034_PROBE_SLOT || 0));   // ★[T1034] 같은 창 · 같은 손잡이 판을 나란히(마감 낀 판 둘 — 포트 · 자리를 따로)
const _OFF34 = process.env.T1034_CARAVAN_KEEP === '0', BLOCK0 = process.argv.includes('--block') || process.argv.includes('--isolate');   // ★[T1034] 끔 판 · 가상 차단 판(포트를 따로)
const _PO = (_OFF ? 50 : 0) + (_OFF23 ? 25 : 0) + (_OFF25 ? 12 : 0) + (process.argv.includes('--term') ? 4 : 0) + (_OFF34 ? 2 : 0) + (BLOCK0 ? 1 : 0) + _SLOT * 8;   // 창 · 손잡이 · 신호마다 다른 포트 — 같이 돌릴 수 있게
const CPORT = 3110 + _WI * 100 + _PO, HPORT = 3120 + _WI * 100 + _PO;   // 창 · 손잡이마다 다른 포트 — 여덟을 같이 돌릴 수 있게
const N = +(process.argv[3] || 3);
const CLOSE = process.argv.includes('close');
const NOW = process.argv.includes('--now');
const RAW = process.argv.includes('--raw');   // 사냥 창 — 도살 없이(사체만 남은 채) 죽인다
const ROT = process.argv.includes('--rot');   // ★[T1025] 사냥 창 — 도살 없이 사체가 썩은 뒤 죽인다
const BLOCK = process.argv.includes('--block') ? '1' : (process.argv.includes('--isolate') ? '2' : '');   // ★[T1034] 캐러밴 창 — 재는 판에만 정본 시험 훅 1회(1 = 가상 차단 → 재경로 · 2 = 강제 고립 → 화물 보존 귀환)
let MEASURE = false;   // ★[T1034] 지금 띄우는 존이 재는 판인가(--block 훅은 그 판에만 · 다시 뜬 판엔 안 건다)
if (!['meal', 'fish', 'hunt', 'house', 'trade', 'phouse', 'ev', 'caravan'].includes(WIN)) { console.error('창: meal | fish | hunt | house | trade | phouse | ev | caravan'); process.exit(2); }
const SIG = process.argv.includes('--term') ? 'SIGTERM' : 'SIGKILL';   // ★[T1023] 죽이는 신호(SIGTERM = 종료 저장 문 · T728)
const RESTARTS = Math.max(1, +((process.argv.find((x) => x.startsWith('--restarts=')) || '=1').split('=')[1]) || 1);   // ★[T1023] 한 판 안 다시 뜨기 횟수(행동 한 번 뒤 같은 신호로 거듭)
const DDIR = `/tmp/t1005-probe-${WIN}-${_OFF ? 'off' : 'on'}${_OFF34 ? '-c0' : ''}${BLOCK ? '-block' + BLOCK : ''}${_OFF23 ? '-t1023off' : ''}${_OFF25 ? '-e0' : ''}${process.argv.includes('close') ? '-close' : ''}${SIG === 'SIGTERM' ? '-term' : ''}${RAW ? '-raw' : ''}${ROT ? '-rot' : ''}${_SLOT ? '-s' + _SLOT : ''}`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let C = null, Z = null, nLog = 0, SQ = null;
function boot(file, env, tag) {
  const p = spawn(process.execPath, [file], { cwd: ROOT, env: Object.assign({}, process.env, env), stdio: ['ignore', 'pipe', 'pipe'] });
  const lg = fs.createWriteStream(`${DDIR}/${tag}-${++nLog}.log`, { flags: 'w' }); p.stdout.pipe(lg); p.stderr.pipe(lg);
  return p;
}
process.on('exit', () => { for (const p of [C, Z]) { try { if (p) p.kill('SIGKILL'); } catch (e) {} } });
const WRAP = `${DDIR}/zone-wrap.js`;
const VID = 1;
const ZENV = () => ({ PORT: String(HPORT), ZONE_ID: 'hanbando', DB_PATH: `${DDIR}/w-han.db`, E2E_GIVE: '1', CENTRAL_URL: `http://localhost:${CPORT}`,
  ENABLE_VILLAGES: '1', VILLAGE_MAX: WIN === 'caravan' ? (process.env.T1034_PROBE_VMAX || '6') : '2', ENABLE_BANDITS: '0', ENABLE_WILDLIFE: WIN === 'hunt' ? '1' : '0',   // ★[T1034] 캐러밴 창은 마을 여섯(교역 쌍이 서게)
  ...(WIN === 'caravan' && BLOCK && MEASURE ? { VILLAGE_CARAVAN_BLOCKTEST: BLOCK } : {}),   // T917 · T983 탐침과 같은 손잡이(사냥 창만 야생 켬)
  ...(WIN === 'meal' ? { DOWN_RESCUE_WINDOW_MS: '3000' } : {}),   // 구조 창 시간만 줄인다(test-downed 와 같은 값 · 사슬은 그대로)
  PROBE_DIR: DDIR, PROBE_VID: String(VID),
  WRAP_ZONE_PATCH: SQ ? JSON.stringify({ mainSquare: { x: SQ.x, y: SQ.y, name: '탐침 광장' } }) : '{}' });
async function upC() { C = boot(path.join(ROOT, 'server', 'central.js'), { PORT: String(CPORT), DB_PATH: `${DDIR}/central.db`, PUBLIC_HOST: 'localhost', ENABLED_ZONES: 'hanbando' }, 'central');
  if (!(await FB.waitUp(C, /central server up on/, { name: 'central' })).ok) throw new Error('central 기동 실패'); }
let WARM = false;   // 사냥 창의 데우기 판만 — 하루를 줄여(VILLAGE_DAY_MS 테스트 전용 손잡이) 사냥터 밴드(`_gameRich` · 하루 마감이 짓는다)를 먼저 세운다. 재는 판은 운영 하루 그대로
async function upZ() { Z = boot(WRAP, Object.assign(ZENV(), WARM ? { VILLAGE_DAY_MS: '2000' } : {}), 'zone'); if (!(await FB.waitUp(Z, /zone server up on/, { name: 'zone', capMs: 600000 })).ok) throw new Error('zone 기동 실패'); }
const downP = (p, sig) => new Promise((r) => { if (!p || p.exitCode !== null) return r(); p.once('exit', () => r()); try { p.kill(sig); } catch (e) { r(); } });
const jget = async (u) => (await (await fetch(u, { signal: AbortSignal.timeout(8000) })).json());
const dayNow = async () => { try { const h = await jget(`http://localhost:${HPORT}/health`); return h.day != null ? h.day : null; } catch (e) { return null; } };
// 관측 — 래퍼에 묻고 답을 받는다(읽기만)
async function look(q) {
  try { fs.unlinkSync(`${DDIR}/mem.json`); } catch (e) {}
  fs.writeFileSync(`${DDIR}/ask`, JSON.stringify(q || {}));
  for (let i = 0; i < 100; i++) { await sleep(100); try { return JSON.parse(fs.readFileSync(`${DDIR}/mem.json`, 'utf8')); } catch (e) {} }
  return null;
}
// 죽은 뒤 — 존 DB 의 마을 행(다시 뜨면 읽힐 값) · 건물 행
function dbRead() {
  const db = new (require('node:sqlite').DatabaseSync)(`${DDIR}/w-han.db`);
  try {
    const row = db.prepare('SELECT econ_state FROM villages WHERE id = ?').get(VID);
    let e = null; try { e = JSON.parse(row.econ_state); } catch (er) {}
    const G = e && e._t728Game, S = e && e._t740Side, EV = e && e._t1025Ev;
    let gSum = null; if (G && Array.isArray(G.m)) { gSum = 0; for (let i = 1; i < G.m.length; i += 2) gSum += +G.m[i] || 0; }
    const huts = db.prepare("SELECT id, data FROM buildings WHERE type = 'hut_site'").all().filter((b) => { try { return JSON.parse(b.data).psite === 1; } catch (er) { return false; } });
    const psw = db.prepare("SELECT COUNT(*) AS n FROM village_buildings WHERE village_id = ? AND type = 'psitework'").get(VID).n;
    const ev = db.prepare("SELECT type, COUNT(*) AS n FROM village_events WHERE vid = ? GROUP BY type").all(VID);
    let pot = null; if (S && S._potSet && Array.isArray(S._potSet.$S)) pot = S._potSet.$S.length;
    return { food: e && e.storage ? +(+e.storage.food || 0).toFixed(6) : null, fishSustain: e && e.land ? e.land.fishSustain : null, fishBase: e && e.land ? e.land._fishBase : null,
      gameSum: gSum != null ? +gSum.toFixed(6) : null, psite: S && S.psite ? S.psite : null, potN: pot, hutSites: huts.length, hutIds: huts.map((b) => b.id), psitework: psw,
      rescueEv: (ev.find((x) => x.type === 'RESCUED') || {}).n || 0,
      t1025Ev: EV ? { r: (EV.r || []).length, b: (EV.b || []).length, s: EV.s | 0 } : null,   // ★[T1025] 행 곁 칸의 사건 대기 줄(구조 · 완공 · 굶음)
      evRows: Object.fromEntries(ev.map((x) => [x.type, x.n])),
      meta: (() => { try { const m = db.prepare('SELECT data, day FROM world_meta LIMIT 1').get(); if (!m) return null; const M = JSON.parse(m.data); return { day: m.day, cars: (M.caravans || []).map((c) => [c.id, c.state, c.arriveDay, c.returnArriveDay]), t1034: M.t1034 ? Object.keys(M.t1034.b || {}).length : null }; } catch (e) { return { err: e.message }; } })(),   // ★[T1034] 메타 행의 캐러밴(다시 뜨면 읽힐 장부)
      fishCells: db.prepare('SELECT COUNT(*) AS n, SUM(stock) AS s FROM fish_cells').get() };
  } finally { db.close(); }
}
function open(qs) {
  return new Promise((res, rej) => {
    const ws = new WebSocket(`ws://localhost:${HPORT}/?${qs}`); const st = { ws, welcome: null, notices: [], board: null, fish: [], catches: [], self: null, mobs: new Map(), removed: new Set() };
    const t = setTimeout(() => rej(new Error('welcome timeout')), 30000);
    ws.on('error', (e) => { clearTimeout(t); rej(e); });
    ws.on('message', (raw) => { let m; try { m = JSON.parse(raw); } catch (e) { return; }
      if (m.type === 'welcome') { st.welcome = m; clearTimeout(t); res(st); }
      if (m.type === 'notice') st.notices.push(m.text);
      if (m.type === 'village_trade' && m.trade) st.board = m.trade;
      if (m.type === 'fish_state') st.fish.push(m);
      if (m.type === 'fish_catch') st.catches.push(m);
      if (m.type === 'mob_removed') st.removed.add(m.mid);
      if (m.type === 'corpse_added' && m.corpse) st.corpses = (st.corpses || []).concat([m.corpse]);
      if (m.type === 'tick') {
        for (const e of (m.players || [])) if (st.welcome && e.pid === st.welcome.pid) st.self = Object.assign(st.self || {}, e);
        for (const e of (m.mobs || [])) st.mobs.set(e.mid, Object.assign(st.mobs.get(e.mid) || {}, e));
      } });
    st.hb = setInterval(() => { try { ws.send(JSON.stringify({ type: 'ping', t: Date.now() })); } catch (e) {} }, 3000);
  });
}
const send = (st, m) => { try { st.ws.send(JSON.stringify(m)); } catch (e) {} };
const close = (st) => new Promise((r) => { if (!st) return r(); clearInterval(st.hb); if (st.ws.readyState === 3) return r(); st.ws.once('close', r); try { st.ws.close(); } catch (e) { r(); } setTimeout(r, 2000); });
const rowOf = async (pid) => ((await jget(`http://localhost:${CPORT}/player/${encodeURIComponent(pid)}`)) || {}).player || null;
const rowInv = (row) => { if (!row) return null; let x = {}; try { x = JSON.parse(row.inventory_json || '{}'); } catch (e) {} return Object.assign({ wood: row.wood | 0, stone: row.stone | 0 }, x); };
async function stockRead(tag, res) {
  const g = await open(`username=&name=t1005r${tag}&color=%23ffffff`); await sleep(800);
  send(g, { type: 'village_trade', vid: VID }); await sleep(900);
  const v = g.board ? ((g.board.rows || []).find((x) => x.res === res) || {}).stock : null;
  await close(g); return v;
}
const SAVE_WAIT = (parseInt(process.env.SAVE_INTERVAL_MS || '', 10) || 30000) + 5000;   // 사람 주기 저장 간격(zone.js 기본) + 왕복 몫

// ── 창마다 행동 ─────────────────────────────────────────────────────────────
async function actMeal(a) {
  const m0 = await look({});
  send(a, { type: '__e2e_body', hunger: 0, thirst: 0, hp: 1, quiet: true });
  let down = false, moved = false;
  for (let i = 0; i < 600 && !moved; i++) { await sleep(500);
    if (a.self && a.self.isDown) down = true;
    if (a.notices.some((t) => /쉼터로 옮겨진다|곳간이 비었다/.test(t))) moved = true; }
  const m1 = await look({});
  return { ok: moved, down, m0, m1, act: { food0: m0 && m0.food, food1: m1 && m1.food, note: (a.notices.filter((t) => /쉼터|곳간/.test(t)).slice(-1)[0] || '').slice(0, 60) } };
}
async function actFish(a, K) {
  const m0 = await look({});
  let got = 0, casts = 0;
  for (let c = 0; c < 40 && got < K; c++) {
    casts++; const n0 = a.fish.length, k0 = a.catches.length;
    send(a, { type: 'fish_cast' });
    let bite = null;
    for (let i = 0; i < 400 && !bite; i++) { await sleep(50); for (let j = n0; j < a.fish.length; j++) if (a.fish[j].state === 'bite') bite = a.fish[j]; if (a.fish.slice(n0).some((f) => f.state === 'idle')) break; }
    if (!bite) continue;
    send(a, { type: 'fish_strike' });
    for (let i = 0; i < 300 && a.catches.length === k0; i++) { await sleep(50); if (a.fish.slice(n0).some((f) => f.state === 'idle') && a.catches.length === k0 && i > 4) break; }
    if (a.catches.length > k0) got++;
    await sleep(300);
  }
  const m1 = await look({});
  return { ok: got > 0, m0, m1, act: { casts, got, kg: a.catches.map((x) => x.kg), fish0: m0 && m0.fishSustain, fish1: m1 && m1.fishSustain } };
}
async function actHunt(a) {
  //   ★자리만 관측 손으로 옮긴다 — 들짐승은 사람이 다가가면 달아나 조향(input)으로는 닿지 못했다(시도 넷 · 300초씩 · 때림 0 — 보고 §2).
  //     잡기는 클라 'attack' → `tryAttack` → `huntKillAt` 정본 문 그대로. 표적은 한 대에 죽는 몹(hp ≤ 맨손 10)만 — 맞고 달아나면 다음 번 자리를 다시 옮겨야 해서.
  const m0 = await look({ mobs: true });
  const T0 = Date.now(); let kills = 0, hits = 0, places = 0, kid = null;
  while (Date.now() - T0 < 240000 && kills < 1) {
    const L = await look({ mobs: true });
    const c = ((L && L.mobs) || []).filter((m) => m.hp <= 10 && !a.removed.has(m.mid));
    if (!c.length) { await sleep(2000); continue; }
    const P = await look({ place: { pid: a.welcome.pid, mid: c[0].mid } }); places++;
    if (!P || !P.placed) { await sleep(500); continue; }
    await sleep(120);
    const n0 = a.notices.length;
    send(a, { type: 'attack', aimX: 1, aimY: 0 }); hits++;
    await sleep(700);
    if (a.notices.slice(n0).some((t) => /사냥 — 사체/.test(t))) { kills++; kid = c[0].mid; }
  }
  //   도살(정본 `butcher` · 사람 짐에 고기 · 그 자리 사람 저장) — `--raw` 면 안 한다(사체는 메모리 전용이라 죽으면 사라진다 — 보고 §2)
  let butch = null;
  if (kills && ROT) {   // ★[T1025] 썩을 때까지(5분 + 청소 간격 30초 + 몫) — 도살 없이
    const mR0 = await look({}); await sleep(5 * 60 * 1000 + 40000); const mR1 = await look({});
    butch = `썩음 — 장부 ${mR0 && mR0.gameSum} → ${mR1 && mR1.gameSum} · 셈 ${JSON.stringify(mR1 && mR1.corpse)}`;
  } else if (kills && !RAW) {
    const cp = (a.corpses || []).slice(-1)[0]; const n1 = a.notices.length;
    if (cp) { send(a, { type: 'butcher', cid: cp.cid }); await sleep(1500); butch = (a.notices.slice(n1).find((t) => /도살/.test(t)) || '').slice(0, 60); }
  }
  const m1 = await look({});
  return { ok: kills > 0, m0: Object.assign({}, m0, { mobs: undefined, nMobs: m0 && m0.mobs ? m0.mobs.length : 0 }), m1, act: { kills, hits, places, mid: kid, butch, sec: Math.round((Date.now() - T0) / 1000), game0: m0 && m0.gameSum, game1: m1 && m1.gameSum } };
}
async function actHouse(a) {
  const m0 = await look({ house: true });
  send(a, { type: '__e2e_give', items: { pillar: 6, rafter: 8, thatch: 8 }, quiet: true }); await sleep(1200);
  let done = null, tries = 0;
  for (const c of ((m0 && m0.houseCand) || [])) {
    tries++; const n0 = a.notices.length;
    send(a, { type: 'request_village_house', atX: c.x, atY: c.y }); await sleep(250);
    const t = a.notices.slice(n0).join(' | ');
    if (/집 짓기를 의뢰했다/.test(t)) { done = c; break; }
    if (tries >= 400) break;
  }
  await sleep(500);
  const m1 = await look({});
  return { ok: !!done, m0: Object.assign({}, m0, { houseCand: undefined }), m1, act: { tries, at: done, psite: m1 && m1.psite, hut0: m0 && m0.hutSites, hut1: m1 && m1.hutSites } };
}

async function actEv(a) {   // ★[T1025] 완공 · 굶음 줄 하나씩 — 래퍼가 세운다(관측 손 · 위 머리말)
  const m0 = await look({});
  const L = await look({ note: true });
  await sleep(1500);   // 같은 틱 끝(T1005 표) · 넉넉히
  const m1 = await look({});
  return { ok: !!(L && L.noted), m0, m1, act: { noted: L && L.noted, pend0: m0 && m0.pend, pend1: m1 && m1.pend } };
}
async function actCaravan(a) {   // ★[T1034] 행동 없음 — 몸이 선 길 위 캐러밴을 기다려 본다(--block 이면 그 사이 정본 가상 차단 1회)
  const W = +(process.env.T1034_PROBE_WAIT || 30) * 1000, t0 = Date.now();
  let m0 = null;
  for (let i = 0; i < 120; i++) { m0 = await look({ car: true }); if (m0 && m0.car && m0.car.cars.some((c) => c.body)) break; await sleep(1000); }
  await sleep(W);
  //   --isolate = 고립 훅(가는 길 25% 넘은 첫 몸)이 실제로 걸릴 때까지(10분 안) · 그 뒤 3초(켬 = 틱 끝 메타 행 · 끔 = 같은 벽시계) — 안 걸린 판은 고립 창을 못 잰다
  if (BLOCK === '2') { for (let i = 0; i < 600; i++) { const L = await look({ car: true }); if (L && L.car && L.car.cars.some((c) => c.st === 'inbound' && c.ab && c.body)) break; await sleep(1000); } await sleep(3000); }
  const m1 = await look({ car: true });
  const n = m1 && m1.car ? m1.car.cars.filter((c) => c.body).length : 0;
  return { ok: n > 0, m0, m1, act: { iso: m1 && m1.car ? m1.car.cars.filter((c) => c.st === 'inbound' && c.ab).map((c) => c.id) : null, bodies: n, cars: m1 && m1.car ? m1.car.cars.length : 0, waitSec: Math.round((Date.now() - t0) / 1000) } };
}
async function actTrade(a) {   // T983 문(거래소) — 회부 2 창(곳간 행 → 사람 저장) 재기용 · 행동은 T983 탐침 그대로
  const m0 = await look({});
  send(a, { type: '__e2e_give', kgs: { fish: [1.7, 1.2, 0.9] }, quiet: true }); await sleep(1200);
  send(a, { type: 'village_trade', vid: VID }); await sleep(900);
  const b0 = a.board; let deal = null;
  if (b0 && Array.isArray(b0.rows)) for (const r of b0.rows.filter((r) => r.res !== 'fish' && r.stock > 1)) {
    const before = a.board; send(a, { type: 'village_trade_exec', vid: VID, give: 'fish', take: r.res, qty: 1 }); await sleep(900);
    if (a.board !== before) { deal = { take: r.res, stock0: r.stock }; break; } }
  const m1 = await look({});
  return { ok: !!deal, m0, m1, act: deal };
}
// 회부 2 — 행동 뒤 첫 마을 행 순간 저장(v)과 그 사람의 저장 HTTP(p)가 돌아온 시각의 틈(ms)
function gapOf(tm, pid, tAct) {
  if (!tm) return null;
  const V = tm.filter((x) => x.k === 'v' && x.t1 >= tAct);
  const v = V[0] || null, p = v ? tm.filter((x) => x.k === 'p' && x.pid === pid && x.t0 >= v.t0 - 100)[0] || null : null;   // 그 쓰기와 같은 틱(낚시 — 사람이 먼저 보낸다) 또는 뒤의 첫 사람 저장
  if (!v || !p) return { v: !!v, p: !!p, pAfterVms: null };
  return { fn: v.fn, vMs: +(v.t1 - v.t0).toFixed(3), pRttMs: +(p.t1 - p.t0).toFixed(3), first: v.t1 <= p.t1 ? '마을' : '사람', gapMs: +Math.abs(p.t1 - v.t1).toFixed(3), sendAfterV: +(p.t0 - v.t1).toFixed(3) };
}

let K = 0;
async function trip() {
  const k = ++K, nm = `t1005${WIN}_${k}`;
  const a = await open(`username=&name=${nm}&color=%23ffffff`); await sleep(1500);
  const pid = a.welcome.playerId, tok = a.welcome.guestToken;
  const h0 = ((await look({ timing: true })) || {}).hr;   // 행동 앞 시각(래퍼 시계)
  let r;
  if (WIN === 'meal') r = await actMeal(a);
  else if (WIN === 'fish') r = await actFish(a, 3);
  else if (WIN === 'hunt') r = await actHunt(a);
  else if (WIN === 'trade') r = await actTrade(a);
  else if (WIN === 'ev') r = await actEv(a);
  else if (WIN === 'caravan') r = await actCaravan(a);
  else r = await actHouse(a);
  if (!r.ok) { await close(a); return { k, err: `행동 성사 0 — ${(a.notices.slice(-1)[0] || '').slice(0, 80)}`, act: r.act }; }
  const dayT = await dayNow(); const tT = Date.now();
  if ((WIN === 'meal' || WIN === 'house') && !NOW && !CLOSE) await sleep(SAVE_WAIT);   // 사람 쪽이 한 번 저장된 뒤(운영 하루 24분이면 거의 언제나 그렇다)
  const invLive = rowInv(await rowOf(pid)); const rowLive = await rowOf(pid);
  let P = null; try { P = (await jget(`http://localhost:${HPORT}/perf`)).econTick; } catch (e) {}
  let memK = await look({ timing: true, car: WIN === 'caravan' });   // ★[T1034] 캐러밴 창은 장부 · 몸도
  const gap = memK && h0 != null ? gapOf(memK.tm, pid, h0) : null;
  if (CLOSE) {   // 날이 바뀐 뒤(`/health` = 창 머리) · ★T731 현지 자정 창 — 마을마다 제 자정에 닫힌다(동 → 서 · 수십 초 퍼짐) ⇒ 창 꼬리(econ 날 줄)가 찍힐 때까지 · 마감 저장 줄이 다 돌 몫
    const zlog = `${DDIR}/zone-${nLog}.log`, nDay = () => { try { return (fs.readFileSync(zlog, 'utf8').match(/마을 econ day \d+:/g) || []).length; } catch (e) { return 0; } };
    const n0 = nDay();
    for (let i = 0; i < 900 && (await dayNow()) === dayT; i++) await sleep(2000);
    for (let i = 0; i < 300 && nDay() === n0; i++) await sleep(2000);
    await sleep(+(process.env.T1034_PROBE_AFTER || 8) * 1000);   // ★[T1034] 마감 꼬리 뒤 몇 초에 죽이나(캐러밴 머묾 창 = 1게임시간 · 운영 하루 60초)
    if (WIN === 'caravan') memK = await look({ timing: true, car: true });   // ★[T1034] 죽기 직전(마감 뒤) 장부 · 몸
  }
  const dayK = await dayNow();
  await downP(Z, SIG); Z = null; await close(a);
  const killMs = Date.now() - tT;
  const dbK = dbRead();
  await sleep(1000); MEASURE = false; await upZ(); await sleep(3000);
  if (WIN === 'caravan') { for (let i = 0; i < 240; i++) { const L = await look({ car: true }); if (L && L.car && L.car.t775 && L.car.t775.done) break; await sleep(1000); } }   // ★[T1034] T775 몸 세우기가 끝날 때까지
  const memA = await look(WIN === 'caravan' ? { car: true } : {}); const dbA = dbRead();
  const foodA = WIN === 'meal' ? await stockRead(k, 'food') : null;
  const b = await open(`username=&name=${nm}&color=%23ffffff&guest_token=${encodeURIComponent(tok)}`); await sleep(1000);
  const rowA = await rowOf(pid); const invA = rowInv(rowA); await close(b);
  const out = { k, close: CLOSE, dayT, dayK, closed: dayK !== dayT, killMs, act: r.act, before: r.m0 && pick(r.m0), live: pick(memK), dbK, after: pick(memA), dbA: { hutSites: dbA.hutSites, hutIds: dbA.hutIds, psitework: dbA.psitework },
    t983: P && P.t983 ? P.t983 : null, t1005: P && P.t1005 ? P.t1005 : null, gap };
  if (WIN === 'meal') {
    out.foodA = foodA;
    out.hunger = { live: rowLive && rowLive.hunger, after: rowA && rowA.hunger };
    // 생성 = 곳간이 되돌아간 몫(사람은 먹은 채 저장됐다) — 행 food 가 먹기 전 값이면 1 끼
    out.kept = dbK.food != null && r.m1 ? Math.abs(dbK.food - r.m1.food) < Math.abs(dbK.food - r.m0.food) : null;
    out.created = out.kept === false ? +(r.m0.food - r.m1.food).toFixed(6) : 0;
    out.rescueEvLost = dbK.rescueEv === 0 && !(dbK.t1025Ev && dbK.t1025Ev.r > 0);   // ★[T1025] 장부 행에도 · 곁 칸에도 없다
    out.t1025 = { rowEv: dbK.t1025Ev, pendLive: memK && memK.pend, pendAfter: memA && memA.pend, evRowsAfter: dbA.evRows };
  } else if (WIN === 'fish') {
    out.kept = memK ? (dbK.fishSustain != null && Math.abs(dbK.fishSustain - memK.fishSustain) < 1e-6) : null;
    out.capLost = dbK.fishSustain == null;   // 행에 상한 칸이 아예 없다(첫 매김이 낚시였던 판 — 다시 뜨면 상한 미적용 · `refreshFishSustain` 머리)
    out.capExcess = memK ? +((dbK.fishSustain != null ? dbK.fishSustain : dbK.fishBase) - memK.fishSustain).toFixed(6) : null;   // 다시 뜬 상한(없으면 기준 MSY) − 죽기 전 상한(어장 칸은 바로 저장 → 마감까지 상한만 옛 값)
    out.afterExcess = memA && memK ? +(memA.fishSustain - memK.fishSustain).toFixed(6) : null;
  } else if (WIN === 'hunt') {
    out.meat = { live: invLive && (invLive.meat_game || 0), after: invA && (invA.meat_game || 0) };
    out.kept = dbK.gameSum != null && memK ? Math.abs(dbK.gameSum - memK.gameSum) < 1e-6 : null;
    out.created = dbK.gameSum != null && memK ? +(dbK.gameSum - memK.gameSum).toFixed(6) : null;   // 되살아난 개체(행 − 죽기 전)
    //   ★[T1025] 잃음 = 장부에서 빠진 마릿수(잡기 앞 메모리 − 죽은 순간 행) − 고기가 된 마릿수(사람 행에 고기가 남았다 · 썩은 판은 0 — 빠지는 게 옳다)
    const _real = (out.meat.after > 0 ? 1 : 0) + (ROT ? 1 : 0);
    out.lostGame = dbK.gameSum != null && r.m0 && r.m0.gameSum != null ? +((r.m0.gameSum - dbK.gameSum) - _real).toFixed(6) : null;
    out.corpse = memK && memK.corpse;
  } else if (WIN === 'trade') {
    out.kept = dbK.food != null && r.act && r.act.take === 'food' ? dbK.food < r.m0.food : null;
  } else if (WIN === 'caravan') {   // ★[T1034] 캐러밴마다 — 죽기 전(memK) ↔ 다시 뜬 뒤(memA)
    const K = (memK && memK.car && memK.car.cars) || [], A = new Map(((memA && memA.car && memA.car.cars) || []).map((c) => [c.id, c]));
    const gapMs = (memA && memA.car && memK && memK.car) ? memA.car.at - memK.car.at : null;
    const rows = [];
    for (const k of K) {
      if (!k.body) continue;
      const a2 = A.get(k.id), kb = k.body, ab = a2 && a2.body;
      const exp = kb.T && memK.car.dayMs ? kb.T.ppd / memK.car.dayMs * (gapMs || 0) : null;   // 장부 속도(하루 px)로 그 사이 갈 몫
      rows.push({ id: k.id, gone: !a2, noBody: !!a2 && !ab, sched: a2 ? (a2.arr !== k.arr || a2.ret !== k.ret || a2.st !== k.st || a2.ab !== k.ab) : null,
        k: { st: k.st, arr: k.arr, ret: k.ret, amt: k.amt, ph: kb.phase, dd: kb.dd, L: kb.T && +kb.T.L.toFixed(1), len: kb.T && +kb.T.len.toFixed(1), stall: kb.T && kb.T.stall, x: kb.x, y: kb.y, linger: kb.linger },
        a: a2 ? { st: a2.st, arr: a2.arr, ret: a2.ret, amt: a2.amt, ph: ab && ab.phase, dd: ab && ab.dd, L: ab && ab.T && +ab.T.L.toFixed(1), len: ab && ab.T && +ab.T.len.toFixed(1), x: ab && ab.x, y: ab && ab.y, linger: ab && ab.linger } : null,
        lgDrift: (ab && kb.linger != null && ab.linger != null) ? ab.linger - kb.linger : null,   // 머묾 끝 시각이 다시 뜬 뒤 밀렸나(ms)
        moved: (ab && kb.x != null && ab.x != null) ? +Math.hypot(ab.x - kb.x, ab.y - kb.y).toFixed(1) : null, expMove: exp != null ? +exp.toFixed(1) : null,
        ddLost: ab ? (kb.dd | 0) - (ab.dd | 0) : null, phase: ab ? ab.phase !== kb.phase : null });
    }
    const bad = (r) => r.gone || r.noBody || r.sched || r.phase || r.ddLost || (r.lgDrift != null && Math.abs(r.lgDrift) > 1000) || !(r.moved != null && r.moved <= (r.expMove || 0) + 64);
    out.statK = memK && memK.car && memK.car.stat; out.statA = memA && memA.car && memA.car.stat;   // ★[T1034] 켬 판 셈(끔 = 손잡이만)
    out.cars = rows; out.gapMs = gapMs; out.metaK = dbK.meta;
    out.created = 0; out.lostN = rows.filter(bad).length;
    out.kept = rows.length > 0 && out.lostN === 0;
  } else if (WIN === 'ev') {   // ★[T1025] 행 곁 칸 · 다시 뜬 뒤 대기 줄
    out.t1025 = { rowEv: dbK.t1025Ev, pendLive: memK && memK.pend, pendAfter: memA && memA.pend };
    out.kept = !!(memA && memA.pend && memK && memK.pend && memA.pend.b === memK.pend.b && memA.pend.s === memK.pend.s);
    out.created = 0;
  } else {
    out.invLive = invLive && { pillar: invLive.pillar || 0, rafter: invLive.rafter || 0, thatch: invLive.thatch || 0 };
    out.invA = invA && { pillar: invA.pillar || 0, rafter: invA.rafter || 0, thatch: invA.thatch || 0 };
    out.kept = !!(dbK.psite && memK && memK.psite && dbK.psite.cx === memK.psite.cx && dbK.psite.cy === memK.psite.cy);
    out.created = dbA.hutSites - dbK.hutSites;   // 다시 뜬 뒤 의뢰 집터 건물 행 − 죽은 순간(같은 자리 둘째 집터 = 생성)
    out.boKept = !!(memA && memA.psite && memK && memK.psite && memA.psite.bo === memK.psite.bo);
    //   ★[T1023] 같은 신호로 더 다시 뜨기 — 뜰 때마다 의뢰 집터 행 수 · 붙든 건물 번호
    out.restarts = [{ n: 1, huts: dbA.hutIds, bo: memA && memA.psite ? memA.psite.bo : null }];
    for (let i = 2; i <= RESTARTS; i++) {
      await sleep(1500); await downP(Z, SIG); Z = null; await sleep(1000); await upZ(); await sleep(3000);
      const mi = await look({}), di = dbRead(); out.restarts.push({ n: i, huts: di.hutIds, bo: mi && mi.psite ? mi.psite.bo : null });
    }
    out.extraRows = out.restarts[out.restarts.length - 1].huts.length - dbK.hutSites;   // 마지막 뜬 뒤 의뢰 집터 행 − 의뢰 순간(겹쳐 선 행)
  }
  return out;
}
function pick(m) { if (!m) return null; const o = {}; for (const k of ['food', 'fishSustain', 'fishBase', 'gameSum', 'gameN', 'psite', 'potN', 'hutSites', 'day', 'pend', 'corpse']) if (m[k] !== undefined) o[k] = m[k]; return o; }

(async () => {
  fs.rmSync(DDIR, { recursive: true, force: true }); fs.mkdirSync(DDIR, { recursive: true });
  fs.writeFileSync(WRAP, `'use strict';const path=require('path');const fs=require('fs');const cfg=require(${JSON.stringify(path.join(ROOT, 'server', 'zone-config'))});
Object.assign(cfg.ZONES.hanbando,JSON.parse(process.env.WRAP_ZONE_PATCH||'{}'));
// ── 시각 재기만(회부 2 · 값 0) — 사람 저장 HTTP(central.updatePlayer)의 보낸 · 돌아온 시각 · 마을 행 순간 저장(t983Save · t1005Save · t1005Flush)의 끝 시각 ──
const TM=[]; const hr=()=>Number(process.hrtime.bigint())/1e6;
const CC=require(${JSON.stringify(path.join(ROOT, 'server', 'central-client'))}); const _up=CC.updatePlayer;
CC.updatePlayer=function(pid,patch){ const t0=hr(); const pr=_up.apply(this,arguments); Promise.resolve(pr).then(()=>{TM.push({k:'p',pid,t0,t1:hr()});},()=>{TM.push({k:'pf',pid,t0,t1:hr()});}); if(TM.length>400) TM.splice(0,200); return pr; };
const VM=require(${JSON.stringify(path.join(ROOT, 'server', 'villages.js'))});
for(const fn of ['t983Save','t1005Save','t1005Flush']){ const f=VM[fn]; if(typeof f!=='function') continue; VM[fn]=function(){ const t0=hr(); const r=f.apply(this,arguments); if(r) TM.push({k:'v',fn,t0,t1:hr()}); return r; }; }
const Zm=require(${JSON.stringify(path.join(ROOT, 'server', 'zone.js'))});
// ── 관측만(읽기 · 세계에 0) — 탐침이 'ask' 를 두면 마을 칸을 읽어 'mem.json' 으로 ──
const D=process.env.PROBE_DIR, VID=+process.env.PROBE_VID; let H=null;
function look(q){ H=H||Zm.__testBind(); const V=H.SimVillages; const vil=V.villageByDbId(VID); if(!vil||!vil.econ) return {nov:true};
  const e=vil.econ, L=e.land||{}; let gs=0,gn=0; if(vil._gameRich) for(const g of vil._gameRich.values()){gs+=g;gn++;}
  let huts=0; for(const b of H.buildings.values()) if(b.type==='hut_site'&&b.data&&b.data.psite===1) huts++;
  const o={day:V.dayInfo?undefined:undefined, food:+(+((e.storage||{}).food)||0).toFixed(6), fishSustain:L.fishSustain, fishBase:L._fishBase, gameSum:+gs.toFixed(6), gameN:gn,
    psite:vil._psite?{cx:vil._psite.cx,cy:vil._psite.cy,stage:vil._psite.stage,bo:vil._psite.bo?vil._psite.bo.dbId:null}:null, potN:vil._potSet?vil._potSet.size:null, hutSites:huts, ccx:vil.ccx, ccy:vil.ccy,
    pend:V.t1025Pending?V.t1025Pending(VID):null, corpse:H.t1025Corpse?Object.assign({},H.t1025Corpse):null};
  if(q.car){ o.car=V.t1034Peek?V.t1034Peek():null; if(o.car){ o.car.at=Date.now(); o.car.dayMs=+process.env.VILLAGE_DAY_MS||1440000; o.car.stat=V.t1034Stat?V.t1034Stat():null; } }   // ★[T1034] 캐러밴 장부 · 몸(읽기만)
  if(q.note){ V.noteVillageBuilt(vil,'house'); V.noteStarved(vil); o.noted=true; }   // ★[T1025] ev 창 — 관측 손(완공 · 굶음 줄을 세운다 · 머리말)
  if(q.spot){ const R=H.Fishing.CFG.REACH_PX, out=[]; for(let r=1;r<=70&&out.length<1;r++) for(let dy=-r;dy<=r;dy++) for(let dx=-r;dx<=r;dx++){ if(Math.max(Math.abs(dx),Math.abs(dy))!==r) continue;
      const px=(vil.ccx+dx)*32+16, py=(vil.ccy+dy)*32+16; if(H.isWaterTileLocal(px,py)||H.isTerrainBlockedLocal(px,py)) continue;
      let w=null; for(let yy=-R;yy<=R&&!w;yy+=32) for(let xx=-R;xx<=R;xx+=32){ if(xx*xx+yy*yy>R*R) continue; if(H.isWaterTileLocal(px+xx,py+yy)){ w={x:px+xx,y:py+yy}; break; } }
      if(w && V.waterVillageAt(w.x,w.y)===vil && (L.fishSustain!=null||L._fishBase!=null)) out.push({x:px,y:py,r}); }
    o.spot=out[0]||null; }
  if(q.mobs){ o.mobs=[]; for(const m of H.mobs.values()){ if(!m.isWild||m.hp<=0) continue; const k=V._gameKey(vil,V._cellOfPx(m.x),V._cellOfPx(m.y)); if(k===null) continue; if(!(vil._gameRich.get(k)>0)) continue; o.mobs.push({mid:m.mid,type:m.type,x:m.x,y:m.y,hp:m.hp}); } }
  if(q.timing){ o.tm=TM.slice(); o.hr=hr(); }
  if(q.place){ const p=H.players.get(q.place.pid), m=H.mobs.get(q.place.mid); if(p&&m){ p.x=m.x-30; p.y=m.y; p.vx=0; p.vy=0; if(p.inputQueue) p.inputQueue.length=0; o.placed={x:p.x,y:p.y,mx:m.x,my:m.y}; } else o.placed=null; }   // ★탐침 전용 — 사람 자리만 몹 곁으로(사냥 창 · 보고에 적는다) · 잡기는 클라 'attack' 정본 문
  if(q.house){ o.houseCand=[]; const ts=vil._terrSet?[...vil._terrSet]:[]; const sq=JSON.parse(process.env.WRAP_ZONE_PATCH||'{}').mainSquare;
    for(const k of ts){ const [x,y]=k.split(',').map(Number); if(x%2||y%2) continue; const px=x*32+16, py=y*32+16; if(sq&&Math.hypot(px-sq.x,py-sq.y)>395) continue; const d=Math.hypot(x-vil.ccx,y-vil.ccy); if(d<17) continue; o.houseCand.push({x:px,y:py,d}); }
    o.houseCand.sort((a,b)=>a.d-b.d); }
  return o; }
setInterval(()=>{ const a=D+'/ask'; if(!fs.existsSync(a)) return; let q={}; try{q=JSON.parse(fs.readFileSync(a,'utf8'));}catch(e){} try{fs.unlinkSync(a);}catch(e){}
  let o; try{o=look(q);}catch(e){o={err:e.message};} fs.writeFileSync(D+'/mem.tmp',JSON.stringify(o)); fs.renameSync(D+'/mem.tmp',D+'/mem.json'); },100).unref();`);
  await upC(); await upZ(); await sleep(2000);
  const db = new (require('node:sqlite').DatabaseSync)(`${DDIR}/w-han.db`);
  const v = db.prepare('SELECT id, name, cx, cy FROM villages WHERE id = ?').get(VID); db.close();
  SQ = { x: v.cx * 32 + 16, y: v.cy * 32 + 16 };
  if (WIN === 'fish') { const L = await look({ spot: true }); if (!L || !L.spot) throw new Error('물가 선 칸 없음(마을 1 · 어장 상한 있는 물)'); SQ = { x: L.spot.x, y: L.spot.y }; }
  if (WIN === 'house') { const hx = +(process.env.T1005_PROBE_HX || 20); SQ = { x: (v.cx + hx) * 32 + 16, y: v.cy * 32 + 16 }; }   // 회관 마당(r<HALL_CLEAR) 밖 · 의뢰 사거리(400px) 안 후보가 있게(판마다 세계가 달라 자리가 막히면 `T1005_PROBE_HX` 로 옆 칸)
  if (WIN === 'caravan') {   // ★[T1034] 데우기 — 짧은 하루로 캐러밴이 길에 설 때까지 → SIGTERM(종료 저장 · 메타 행) → 운영 하루로 다시(재는 판)
    await downP(Z, 'SIGTERM'); Z = null; WARM = true; await upZ(); const tw = Date.now(); let L = null;
    const _arr = process.env.T1034_PROBE_ARRIVE === '1';   // 다음 마감에 도착하는 가는 캐러밴이 설 때까지(마감 낀 판 · 머묾 창을 잰다)
    for (let i = 0; i < 600; i++) { await sleep(_arr ? 500 : 2000); L = await look({ car: true }); if (!L || !L.car) continue;
      if (_arr ? L.car.cars.some((c) => c.st === 'outbound' && c.arr === L.car.day + 1) : L.car.cars.filter((c) => c.st === 'outbound' || c.st === 'inbound').length >= 2) break; }
    console.log(`[T1034 탐침] 캐러밴 데우기 ${Math.round((Date.now() - tw) / 1000)}초 · 길 위 ${L && L.car ? L.car.cars.length : 0}대 · 날 ${L && L.car ? L.car.day : '—'}`);
    WARM = false;
  }
  if (WIN === 'hunt') {   // 데우기 — 사냥터 밴드 · 밴드 안 야생 몹이 설 때까지(짧은 하루) → SIGTERM(종료 저장 · T728 곁 칸 `_t728Game`) → 운영 하루로 다시
    await downP(Z, 'SIGTERM'); Z = null; WARM = true; await upZ(); const tw = Date.now(); let L = null;
    for (let i = 0; i < 300; i++) { await sleep(2000); L = await look({ mobs: true }); if (L && L.gameN > 0) break; }   // 밴드만(야생 몹 그림자는 사람이 있어야 선다 — 재는 판에서 찾는다)
    console.log(`[T1005 탐침] 사냥 데우기 ${Math.round((Date.now() - tw) / 1000)}초 · 밴드 셀 ${L && L.gameN} · 밴드 안 야생 몹 ${L && L.mobs ? L.mobs.length : 0}`);
    WARM = false;
    //   광장 = 밴드 안 야생 몹 곁 — 몹 그림자는 사람이 있어야 서므로 정찰 손님 하나로 본다(회관 마당은 건물에 막혀 걸어 나가지 못했다)
    await downP(Z, 'SIGTERM'); Z = null; await upZ(); await sleep(2000);
    const sc = await open(`username=&name=t1005scout&color=%23ffffff`); let M = [];
    for (let i = 0; i < 30 && !M.length; i++) { await sleep(1000); const L2 = await look({ mobs: true }); M = (L2 && L2.mobs) || []; }
    await close(sc);
    if (M.length) { M.sort((p, q) => Math.hypot(p.x - SQ.x, p.y - SQ.y) - Math.hypot(q.x - SQ.x, q.y - SQ.y)); SQ = { x: Math.round(M[0].x), y: Math.round(M[0].y) }; }
    console.log(`[T1005 탐침] 사냥 광장 = 밴드 안 몹 ${M.length} 중 회관에서 가장 가까운 것(${M[0] ? M[0].type : '—'}) 자리 ${SQ.x},${SQ.y}`);
  }
  if (WIN === 'phouse') {   // ★[T1023 ③] 완공된 의뢰 집(`phouse`) — 부팅이 벽 · 바닥을 사람 소유로 다시 세운다(부팅 지우기 `npc_%` 를 안 탄다)
    //   ★픽스처(행동 아님 · 보고에 적는다): 존이 내려간 사이 `_lifeCompleteHouse` 가 쓰는 그 행(`village_buildings` type 'phouse' · data.owner)을 하나 넣는다.
    //     완공까지 크루가 며칠 지어야 해서 클라로는 못 닿는다. 그 뒤로는 다시 뜨기만 한다(신호 `SIG`) — 뜰 때마다 그 사람 소유 벽 · 바닥 행을 센다.
    await downP(Z, 'SIGTERM'); Z = null;
    const OW = 'guest_t1023_phouse', db2 = new (require('node:sqlite').DatabaseSync)(`${DDIR}/w-han.db`);
    db2.prepare("INSERT INTO village_buildings (village_id, type, cx, cy, floors, data, created_at) VALUES (?, 'phouse', ?, ?, 1, ?, ?)").run(VID, v.cx + 30, v.cy + 30, JSON.stringify({ owner: OW }), Date.now()); db2.close();
    const cnt = () => { const d = new (require('node:sqlite').DatabaseSync)(`${DDIR}/w-han.db`); try { return d.prepare("SELECT type, COUNT(*) AS n FROM buildings WHERE owner_id = ? GROUP BY type ORDER BY type").all(OW).map((r) => `${r.type} ${r.n}`).join(' · ') || '0'; } finally { d.close(); } };
    console.log(`[T1023 탐침 · phouse] 신호 ${SIG} · 의뢰 집 행 하나(픽스처 · 마을 ${v.name} · 칸 ${v.cx + 30},${v.cy + 30} · 주인 ${OW})`);
    for (let i = 1; i <= N; i++) { await upZ(); await sleep(3000); console.log(JSON.stringify({ boot: i, rows: cnt() })); await downP(Z, SIG); Z = null; await sleep(1000); }
    process.exit(0);
  }
  await downP(Z, 'SIGTERM'); Z = null; MEASURE = true; await upZ(); await sleep(3000);
  console.log(`[T1005 탐침] 창 ${WIN} · T1025_EV_CORPSE=${process.env.T1025_EV_CORPSE === undefined ? '(기본)' : process.env.T1025_EV_CORPSE} · T1005_VIL_SAVE=${process.env.T1005_VIL_SAVE === undefined ? '(기본)' : process.env.T1005_VIL_SAVE} · 판 ${N} · ${CLOSE ? '마감 낀 판' : '마감 안 낀 판'}${NOW ? ' · 사람 저장 안 기다림' : ''} · 마을 ${v.name} · 광장 ${SQ.x},${SQ.y}`);
  const R = [];
  for (let i = 0; i < N; i++) { let r; try { r = await trip(); } catch (e) { r = { err: e.message }; if (!Z) await upZ().catch(() => {}); } R.push(r); console.log(JSON.stringify(r)); }
  fs.writeFileSync(`${DDIR}/result.json`, JSON.stringify(R, null, 1));
  const M = R.filter((r) => !r.err && r.closed === CLOSE);
  const sum = (f) => +M.reduce((s, r) => s + (+r[f] || 0), 0).toFixed(6);
  console.log(`[T1005 합] 창 ${WIN} · 재는 판 ${M.length}/${R.length} · 남음 ${M.filter((r) => r.kept).length} · 되돌아감 ${M.filter((r) => r.kept === false).length}`
    + (WIN === 'fish' ? ` · 상한 초과(행 − 죽기 전) 합 ${sum('capExcess')}` : ` · 생성 합 ${sum('created')}`)
    + (WIN === 'meal' ? ` · 사건 줄 잃음 ${M.filter((r) => r.rescueEvLost).length}/${M.length}` : '')
    + (WIN === 'hunt' ? ` · 사냥감 잃음 합 ${sum('lostGame')}` : ''));
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
