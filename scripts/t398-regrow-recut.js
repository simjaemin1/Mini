#!/usr/bin/env node
// (@regress 없음 — 러너 밖 계측기)
// =============================================================================
// T398 ③ 자 — **영토 안에 다시 자란 나무를 개간이 다시 베나** (2026-09-26)
//
// ★PM 판정 ②(재민 거부권): *"영토 안 재생은 막지 않는다 — 벤 자리가 T122 대로 돌아오면 개간이 다시 벤다
//   (관측자 무관 · T378 이 그렇게 만들었다). 단 '다시 벤다'가 실제로 일어나는지는 재야 한다."*
//   ⇒ 이 자는 **재기만** 한다(술어 0 · 제품 무변). 답이 "안 벤다"면 그 사실이 발견이다(묘목도 베나는 재민 #74).
//
// ★무엇을 어떻게
//   0) 입력 — T378 게이트 판의 40일 DB(`T398_DB`). 영토 셀은 개간이 이미 다 벴다(그루터기 · 장부 행).
//   1) **돌아오는 날 표**(존 0 · 정본만) — 영토 셀의 그루터기마다 종(`Trees.speciesAt` — 청크가 쓰는 그 자리 함수)과
//      벤 날(장부)로 묘목·성목이 되는 날을 센다(`Trees.stageYearsOf` × T122 비율 `REGROW` × 한 해 `yearDaysOf`).
//      검문 날 셋도 여기서 유도한다(수를 안 적는다): ⓐ 첫 묘목 ⓑ 첫 성목 ⓒ 전부 성목.
//   2) 팔(새 프로세스) — 사본 DB 로 존을 그 프로세스 **안에** 띄운다(`test-ghost-tree` 문법 · `Zone.__testBind`) ·
//      게임일 2.5초(`VILLAGE_DAY_MS` — T378 자 그대로) · 관측자 0(가짜 플레이어는 지도 구석 — 시계 손잡이를 쥐려고만 있다).
//      재생 시계를 당긴다 — `__e2e_clock`(E2E_GIVE 게이트 · 이미 있는 테스트 손잡이 · 제품 한 글자도 무변).
//      검문마다: 영토 셀 전부를 **제품 창구**(`_t325TreesAtCell` · 활성 청크면 개체 · 아니면 장부+시계를 넘긴 색인)로
//      묘목·성목을 세고 → **econ 10일**(영토가 자라면 성장 개간이 돈다) → 처음 영토 셀을 다시 센다.
//      관측자 팔 — ⓑ 검문에서 가짜 플레이어를 **다시 자란 성목이 가장 많은 마을**에 세운다 → 서버가 **방송한**
//      개체(클라가 그리는 것)를 영토 안으로 세고 → 10일 → 다시 센다(무엇이든 그 나무를 빼면 `resource_removed` 가 온다).
//   3) **다시 띄운다**(새 프로세스 · 같은 DB) — 부팅 개간이 영토 전체를 다시 훑는 자리. 같은 시계로 다시 센다.
//   4) 장부(`harvested_seeds`) 행 수 · 같은 씨의 날이 바뀌었나(다시 벴다면 바뀌어야 한다 · `INSERT OR IGNORE` 면 DB 는 안 바뀐다).
//
// 쓰는 법:  T398_DB=/path/w40.db node scripts/t398-regrow-recut.js [out.json]
//   (내부) --arm <db> <checks.json> <out>  ·  --reboot <db> <clockDay> <out>
//
// ★★[T426 2026-09-26] **재부팅 게이트**(`--gate`) — "개간이 다시 벤다"를 참으로 만든 뒤 그것을 잰다.
//   ⓐ 재부팅은 **그날에 선다** — 시계를 `require` 가 돌아온 그 틱에(동기) 세운다. 부팅이 날을 몰라 미룬 일
//      (`setImmediate` — T426 부팅 개간 다시 훑기 · T122 옛 행 승격)이 그 시계를 본다. 종전 `--reboot` 는 부팅이
//      끝난 뒤 시계를 당겼다 = "156일에 서서 14,642일로 뛴 서버" — 재부팅이 아니었다(그래서 이 판에서 고쳤다).
//   ⓑ 검문 날마다(ⓐ 첫 묘목 · ⓑ 첫 성목 · ⓒ 전부 성목 — 정본에서 유도) **같은 입력 DB 의 사본**으로 팔을 띄운다:
//        베이스(`T426_BASE_ROOT` 워크트리) · 이 가지 두 번(같은 DB 를 다시 띄운다) · 돌연변이 두 번
//        (`T426_MUT_ROOT` = 이 가지 − 갱신 문법 · 장부 DB 만 `INSERT OR IGNORE`).
//      팔마다: 부팅 전 DB 를 믿으면 영토에 무엇이 서나(색인 · 존 0) → 부팅 → 다시 훑기 줄 → 제품 창구(메모리 장부)로
//      영토를 센다 → 부팅 뒤 DB 를 믿으면 무엇이 서나 → 장부 새 행·날 바뀐 행 → 영토 밖 씨 단위 대조(베이스 ↔ 가지).
//      ⚠영토 밖 **미끼**(픽스처) — 입력 DB 의 장부는 전부 영토 안이라 그대로면 밖 대조가 빈 대조다 ⇒ 영토에 붙은 밖 셀의
//        서 있는 씨 ≤400 개를 가장 이른 벤 날로 장부에 적어 둔다(나무꾼이 영토 가에서 벤 자리 흉내) — 다시 훑기가 그걸 건드리면 빨갛다.
//   ⓒ 관측자 0 ↔ 1 — `T426_OBS_DB`(관측자가 **한 번도 안 온** 판 · T378 게이트 1차 끝 `.pass1` — 부팅 개간이 적은 −1 행이
//      승격 전)로 ⓑ 날에 베이스·가지 × 관측자 0·1 네 팔(관측자는 부팅 직후 다시 선 그루가 가장 많은 마을에 선다).
//   ⓓ 게임일은 **제품 하루**(`T398_DAY_MS=product` — 팔 동안 econ 날이 안 넘어간다 = 성장 개간 0 · 재는 것은 부팅 하나).
//   쓰는 법: T398_DB=<40일 DB> T426_OBS_DB=<그 판 1차 끝> T426_BASE_ROOT=<베이스 워크트리> T426_MUT_ROOT=<돌연변이 워크트리> \
//            node scripts/t398-regrow-recut.js --gate [out.json]
//   (내부) --recut <db> <clockDay> <out> [관측자 JSON]  ·  서버 코드 자리는 `T398_ROOT`(없으면 이 레포)
// =============================================================================
'use strict';
const path = require('path');
const fs = require('fs');
const { spawnSync } = require('child_process');
const ROOT = path.join(__dirname, '..');
//   ★[T426] 잴 서버 코드의 자리 — 자는 **하나**다(베이스·돌연변이 워크트리를 같은 자로 잰다 · 사본 0)
const SROOT = process.env.T398_ROOT ? path.resolve(process.env.T398_ROOT) : ROOT;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const MODE = process.argv[2];
const ZID = 'hanbando';

function readDb(DB) {
  const D = require(path.join(ROOT, 'node_modules', 'better-sqlite3'))(DB, { readonly: true });
  const vils = D.prepare('SELECT id, name, cx, cy FROM villages').all();
  const terr = D.prepare("SELECT village_id, cx, cy FROM village_buildings WHERE type = 'terr'").all();
  let led = [];
  try { led = D.prepare('SELECT seed_key, harvested_day FROM harvested_seeds').all(); } catch (e) {}
  D.close();
  return { vils, terr, ledger: new Map(led.map((r) => [r.seed_key, r.harvested_day])) };
}
const ledgerDiff = (a, b) => {   // 행이 늘었나 · 같은 씨의 날이 바뀌었나 · 빠졌나
  let added = 0, changed = 0, gone = 0;
  for (const [k, d] of b) { if (!a.has(k)) added++; else if (a.get(k) !== d) changed++; }
  for (const k of a.keys()) if (!b.has(k)) gone++;
  return { added, changed, gone };
};
const growCut = (lines) => { let n = 0, c = 0; for (const s of lines) { const m = /영토 \+(\d+)셀[^\n]*?개간 (\d+)그루/.exec(s); if (m) { n++; c += +m[2]; } } return { lines: n, cut: c }; };
const bootCut = (lines) => { let n = 0, c = 0; for (const s of lines) { const m = /영토 개간 — 나무 (\d+)그루/.exec(s); if (m) { n++; c += +m[1]; } } return { lines: n, cut: c }; };
//   ★[T426] 부팅 개간 다시 훑기 줄(제품 로그 한 줄 · 시계가 선 틱에 한 번) — 없으면 null(베이스 · 옛 코드)
const recutLine = (lines) => { for (const s of lines) { const m = /★\[T426\] 부팅 개간 다시 훑기 — 영토 (\d+)칸 · 서 있어 다시 벤 (\d+)그루\(게임일 (-?\d+)\)/.exec(s); if (m) return { cells: +m[1], cut: +m[2], day: +m[3] }; } return null; };
const promoteLine = (lines) => { for (const s of lines) { const m = /★\[T122\] 벤 날 없는 옛 행 (\d+)개를 게임일 (-?\d+)로 승격/.exec(s); if (m) return { n: +m[1], day: +m[2] }; } return null; };

// ── 존을 이 프로세스 안에 띄운다 ─────────────────────────────────────────────
//   `bootClock` — ★[T426] 주면 `require` 가 돌아온 **그 틱에** 시계를 세운다(부팅이 미룬 일이 그 날을 본다)
async function bootZone(DB, port, bootClock) {
  process.env.ZONE_ID = ZID;
  process.env.PORT = String(port);
  process.env.DB_PATH = DB;
  process.env.ENABLE_VILLAGES = '1'; process.env.ENABLE_WILDLIFE = '0';
  process.env.ENABLE_BANDITS = '0'; process.env.ENABLE_ROADS = '0';
  process.env.E2E_GIVE = '1';                                     // `__e2e_clock` 분기(테스트 전용 · 이미 있는 손잡이)
  //   T378 자 그대로(2.5초) · ★[T426] `product` 면 제품 하루(손잡이를 안 건드린다 — 팔 동안 econ 날이 안 넘어간다)
  if (process.env.T398_DAY_MS === 'product') delete process.env.VILLAGE_DAY_MS;
  else process.env.VILLAGE_DAY_MS = process.env.T398_DAY_MS || '2500';
  const log = [];
  const cap = (...a) => { log.push(a.map(String).join(' ')); };
  console.log = cap; console.warn = cap; console.error = cap;
  const msgs = [];
  const me = { pid: 'p_t398', playerId: 't398', name: 't398', persistent: false,
    ws: { readyState: 1, send: (t) => { try { msgs.push(JSON.parse(t)); } catch (e) {} } },
    x: 100, y: 100, vx: 0, vy: 0, floor: 0, hp: 100, maxHp: 100, hunger: 100, thirst: 100,
    inventory: {}, toolItems: [], equipment: [], equipSlots: {}, lots: {},
    isNpc: false, isDown: false, tribeId: null, lastSeen: Date.now() };
  const t0 = Date.now();
  const Zone = require(path.join(SROOT, 'server', 'zone.js'));
  const H = Zone.__testBind();
  if (Number.isFinite(bootClock)) H.handlePlayerInput(me, JSON.stringify({ type: '__e2e_clock', day: bootClock, night: false }));   // ★[T426] 동기 — 아래 await 앞
  for (let i = 0; i < 1200; i++) { let d = null; try { d = H.SimVillages.econDay(); } catch (e) {} if (d != null) break; await sleep(500); }
  //   ⚠가짜 플레이어는 **`players` 에 안 넣는다**(관측자 0 — 넣으면 그 자리 청크가 켜진다). 시계 손잡이는
  //     플레이어 객체를 직접 받으므로 그대로 된다. 관측자 팔만 넣고, 그동안 `lastSeen` 을 갱신한다
  //     (`STALE_WS_MS` 30초 — 안 그러면 좀비로 쫓겨난다 · 첫 판이 그렇게 방송 0건을 받았다).
  let _keep = null;
  const observe = (x, y) => {
    me.x = x; me.y = y; me.lastSeen = Date.now(); H.players.set(me.pid, me);
    if (!_keep) _keep = setInterval(() => { me.lastSeen = Date.now(); if (!H.players.has(me.pid)) H.players.set(me.pid, me); }, 2000);
  };
  const unobserve = () => { if (_keep) { clearInterval(_keep); _keep = null; } H.players.delete(me.pid); };
  const clock = (day) => H.handlePlayerInput(me, JSON.stringify({ type: '__e2e_clock', day, night: false }));
  return { H, me, msgs, clock, observe, unobserve, log, bootMs: Date.now() - t0 };
}
// 영토 셀 전부 — 제품 창구로 묘목·성목(활성 청크면 개체) · 색인+DB 장부로 그루터기
function countTerr(H, terr, day, dbLedger) {
  const CH = require(path.join(SROOT, 'server', 'chunk'));
  const { ZONES } = require(path.join(SROOT, 'server', 'zone-config'));
  const opt = { biome: ZONES[ZID].biome, chunkSize: CH.CHUNK_SIZE, harvestedSet: dbLedger, gameDay: day };
  const byVil = new Map();
  let tree = 0, sap = 0, stump = 0;
  const trees = [], saps = [];
  for (const t of terr) {
    let a = []; try { a = H._t325TreesAtCell(t.cx, t.cy) || []; } catch (e) {}
    let vt = 0, vs = 0;
    for (const e of a) { if (e.type === 'tree') { tree++; vt++; trees.push(e.seedKey || e.id); } else if (e.type === 'sapling') { sap++; vs++; saps.push(e.seedKey || e.id); } }
    let b = []; try { b = CH.resourcesAtCell(ZID, t.cx, t.cy, opt); } catch (e) {}
    let st = 0; for (const e of b) if (e.type === 'stump') { stump++; st++; }
    const r = byVil.get(t.village_id) || { tree: 0, sap: 0, stump: 0 };
    r.tree += vt; r.sap += vs; r.stump += st; byVil.set(t.village_id, r);
  }
  return { tree, sap, stump, byVil, trees, saps };
}
// ★[T426] 색인만으로(존 0) — "이 장부(DB)를 믿으면 영토에 무엇이 서나". 영토 셀에 놓인 씨 키도 모은다(영토 밖 대조용)
function countIdx(terr, ledger, day) {
  const CH = require(path.join(SROOT, 'server', 'chunk'));
  const { ZONES } = require(path.join(SROOT, 'server', 'zone-config'));
  const opt = { biome: ZONES[ZID].biome, chunkSize: CH.CHUNK_SIZE, harvestedSet: ledger, gameDay: day };
  let tree = 0, sap = 0, stump = 0;
  const byVil = new Map(), keys = new Set(), standing = [];
  for (const t of terr) {
    let a = []; try { a = CH.resourcesAtCell(ZID, t.cx, t.cy, opt); } catch (e) {}
    const r = byVil.get(t.village_id) || { tree: 0, sap: 0, stump: 0 };
    for (const e of a) {
      if (e.seedKey) keys.add(e.seedKey);
      if (e.type === 'tree') { tree++; r.tree++; standing.push(e.seedKey); }
      else if (e.type === 'sapling') { sap++; r.sap++; standing.push(e.seedKey); }
      else if (e.type === 'stump') { stump++; r.stump++; }
    }
    byVil.set(t.village_id, r);
  }
  return { tree, sap, stump, byVil, keys, standing };
}
async function waitEconDays(H, n) {
  const d0 = H.SimVillages.econDay();
  for (let i = 0; i < 4000; i++) { await sleep(500); if (H.SimVillages.econDay() >= d0 + n) break; }
  return { from: d0, to: H.SimVillages.econDay() };
}

// ══ 팔 — 새 프로세스 ════════════════════════════════════════════════════════
if (MODE === '--arm') {
  (async () => {
    const DB = process.argv[3], CHECK = JSON.parse(fs.readFileSync(process.argv[4], 'utf8')), OUT = process.argv[5];
    const res = { checks: [] };
    const Z = await bootZone(DB, 39800 + (process.pid % 150));
    //   ★[T426] 부팅이 미룬 일(setImmediate · 다시 훑기)을 **제품처럼** 동기 부팅 바로 뒤에 흘려보낸다.
    //     안 그러면 아래 동기 세기(22.7만 칸)와 첫 검문의 시계 당기기가 그보다 먼저 돌아, 다시 훑기가 당긴 시계를 본다
    //     (첫 판이 그걸로 ⓐ 검문에 "런타임에 묘목 14 다시 벰"을 헛셌다 — 런타임 개간이 아니라 늦게 돈 부팅 개간이었다).
    await new Promise((r) => setImmediate(r));
    const { H } = Z;
    const E0 = H.gameDayNow();
    res.boot = { ms: Z.bootMs, econDay: E0, bootCut: bootCut(Z.log), recut: recutLine(Z.log), warned: Z.log.filter((s) => /색인을 못 물었다/.test(s)).slice(0, 3) };
    {
      const L = readDb(DB);
      const c = countTerr(H, L.terr, E0, L.ledger);
      res.day0 = { day: E0, tree: c.tree, sap: c.sap, stump: c.stump, ledger: L.ledger.size, terr: L.terr.length };
    }
    for (const ck of CHECK) {
      Z.clock(ck.day);
      const gd = H.gameDayNow();
      const L0 = readDb(DB);
      const logN = Z.log.length;
      const a = countTerr(H, L0.terr, ck.day, L0.ledger);
      const w = await waitEconDays(H, 10);
      const L1 = readDb(DB);
      //   ⚠10일 뒤엔 **처음 영토 셀만** 다시 센다(그 사이 늘어난 셀은 성장 개간이 새로 연 자리 — 대조군이 아니다)
      const b = countTerr(H, L0.terr, ck.day, L1.ledger);
      const g = growCut(Z.log.slice(logN));
      const bT = new Set(b.trees), bS = new Set(b.saps);
      res.checks.push({ tag: ck.tag, day: ck.day, clock: gd, terr: L0.terr.length, terrAfter: L1.terr.length,
        before: { tree: a.tree, sap: a.sap, stump: a.stump }, after: { tree: b.tree, sap: b.sap, stump: b.stump },
        treeGone: a.trees.filter((k) => !bT.has(k)).length, sapGone: a.saps.filter((k) => !bS.has(k)).length,
        econ: w, grow: g, ledger: { pre: L0.ledger.size, post: L1.ledger.size, diff: ledgerDiff(L0.ledger, L1.ledger) },
        topVil: [...a.byVil.entries()].map(([id, r]) => ({ id, name: (L0.vils.find((v) => v.id === id) || {}).name, ...r }))
          .sort((x, y) => (y.tree - x.tree) || (y.sap - x.sap)).slice(0, 5) });
    }
    // 관측자 팔 — ⓑ 검문 시계에서 성목이 가장 많은 마을에 선다
    {
      const ck = CHECK[1];
      Z.clock(ck.day);
      const L0 = readDb(DB);
      const top = res.checks[1].topVil[0];
      const v = L0.vils.find((x) => x.name === top.name);
      const own = new Set(L0.terr.filter((t) => t.village_id === v.id).map((t) => t.cx + ',' + t.cy));
      const m0 = Z.msgs.length;
      Z.observe(v.cx * 32 + 16, v.cy * 32 + 16);
      //   방송이 멎을 때까지(=켤 청크를 다 켰다 · T378 자 문법) — 정해진 초를 자지 않는다
      let last = Z.msgs.length, quietSince = Date.now(); const tq = Date.now();
      while (Date.now() - tq < 120000) { await sleep(1000); if (Z.msgs.length !== last) { last = Z.msgs.length; quietSince = Date.now(); } else if (Date.now() - quietSince > 5000 && Date.now() - tq > 8000) break; }
      const live = new Map();
      const scan = (from) => { for (const m of Z.msgs.slice(from)) {
        if (m.type === 'resources_spawn' || m.type === 'welcome') for (const r of (m.resources || [])) live.set(r.id, r);
        else if (m.type === 'resource_spawn' && m.resource) live.set(m.resource.id, m.resource);
        else if (m.type === 'resource_removed') live.delete(m.id);
        else if (m.type === 'resources_removed') for (const id of (m.ids || [])) live.delete(id);
      } };
      scan(m0);
      const inOwn = (r) => own.has(Math.floor(r.x / 32) + ',' + Math.floor(r.y / 32));
      const cnt = () => { let t = 0, s = 0, st = 0; for (const r of live.values()) if (inOwn(r)) { if (r.type === 'tree') t++; else if (r.type === 'sapling') s++; else if (r.type === 'stump') st++; } return { tree: t, sap: s, stump: st }; };
      const A = cnt();
      //   ★묘목·성목·그루터기 — 다시 자란 자리의 셋 다 본다(그루터기를 캐도 그 씨의 재생 시계가 메모리에서 다시 선다)
      const liveA = new Set([...live.values()].filter((r) => inOwn(r) && (r.type === 'tree' || r.type === 'sapling' || r.type === 'stump')).map((r) => r.id));
      const m1 = Z.msgs.length;
      const logN = Z.log.length;
      //   ★누가 뺐나 — 주민이 그 개체를 **겨눈 순간**을 받아 적는다(`npc.gatherTarget` · 옛 채집 갈래가 세우는 칸 · 읽기만)
      const aimedBy = new Map();
      const poll = setInterval(() => { for (const q of H.players.values()) { if (!q.isNpc || !q.gatherTarget || !liveA.has(q.gatherTarget)) continue;
        if (!aimedBy.has(q.gatherTarget)) aimedBy.set(q.gatherTarget, { npc: q.name, job: q.npcJob || null, act: q._lifeAct || null, beh: q.behavior || null }); } }, 250);
      const w = await waitEconDays(H, +(process.env.T398_OBS_DAYS || 10));
      clearInterval(poll);
      scan(m1);
      const B = cnt();
      const remIds = [];
      for (const m of Z.msgs.slice(m1)) {
        if (m.type === 'resource_removed' && liveA.has(m.id)) remIds.push(m.id);
        else if (m.type === 'resources_removed') for (const id of (m.ids || [])) if (liveA.has(id)) remIds.push(id);
      }
      //   빠진 개체의 씨 — 다시 띄운 뒤 그 씨가 무엇으로 서나(장부 메모리 날 ≠ DB 날이면 갈린다 · `INSERT OR IGNORE`)
      const byId = new Map(); for (const m of Z.msgs.slice(m0)) { const L = m.type === 'resources_spawn' ? (m.resources || []) : (m.type === 'resource_spawn' && m.resource ? [m.resource] : []); for (const r of L) byId.set(r.id, r); }
      const remKeys = remIds.map((id) => (byId.get(id) || {}).seedKey).filter(Boolean);
      const remTypes = {}; for (const id of remIds) { const t = (byId.get(id) || {}).type || '?'; remTypes[t] = (remTypes[t] || 0) + 1; }
      const who = {}; for (const id of remIds) { const a = aimedBy.get(id); const k = a ? `주민 겨눔(${a.job || '무직'}·${a.beh})` : '겨눈 주민 없음'; who[k] = (who[k] || 0) + 1; }
      res.observer = { village: v.name, day: ck.day, before: A, after: B, removed: remIds.length, removedTypes: remTypes, removedKeys: remKeys, who, aimed: aimedBy.size,
        econ: w, grow: growCut(Z.log.slice(logN)), msgs: Z.msgs.length - m0, kicked: Z.log.filter((s) => /좀비 player t398/.test(s)).length };
      //   ⚠관측자를 **그냥 빼면 청크가 안 꺼진다** — 사람·관측자가 0 이면 틱이 청크 갱신 **앞에서** 돌아간다
      //     (`zone.js` idle zone skip) ⇒ 그 마을 개체가 **켤 때의 단계로** 남는다(첫 판이 그걸로 묘목 452 를 헛셌다).
      //     ⇒ 지도 구석으로 옮겨 틱이 그 청크를 끄게 한 뒤 뺀다.
      Z.observe(100, 100);
      await sleep(6000);
      Z.unobserve();
      await sleep(2000);
    }
    const last = CHECK[CHECK.length - 1];
    Z.clock(last.day);
    const L = readDb(DB);
    const c = countTerr(H, L.terr, last.day, L.ledger);
    const kT = new Set(c.trees), kS = new Set(c.saps);
    const remAt = { tree: 0, sap: 0, other: 0 }; for (const k of (res.observer.removedKeys || [])) { if (kT.has(k)) remAt.tree++; else if (kS.has(k)) remAt.sap++; else remAt.other++; }
    res.end = { day: last.day, tree: c.tree, sap: c.sap, stump: c.stump, ledger: L.ledger.size, terr: L.terr.length, trees: c.trees, saps: c.saps, removedAt: remAt,
      terrCells: L.terr.map((t) => [t.village_id, t.cx, t.cy]) };
    await sleep(3000);                                            // 저장이 앉게(행 쓰기는 동기지만 한 번 더)
    fs.writeFileSync(OUT, JSON.stringify(res));
    process.exit(0);
  })().catch((e) => { try { fs.writeFileSync(process.argv[5], JSON.stringify({ err: String((e && e.stack) || e) })); } catch (x) {} process.exit(1); });
  return;
}

// ══ 다시 띄운 판 — 새 프로세스 ═════════════════════════════════════════════
if (MODE === '--reboot') {
  (async () => {
    const DB = process.argv[3], DAY = +process.argv[4], OUT = process.argv[5];
    const pre = readDb(DB);
    const dbTerr = pre.terr.length;   // ★[T426] 다시 띄울 때 DB 의 영토 행(팔이 끝에 센 셀보다 많을 수 있다 — 표에 같이 적는다)
    //   ⚠팔이 끝에 센 **그 영토 셀**로 센다(팔이 내려가기 직전 하루가 셀을 더했을 수 있다 — 그 셀은 대조군이 아니다)
    if (process.argv[6]) { try { pre.terr = JSON.parse(fs.readFileSync(process.argv[6], 'utf8')).map((a) => ({ village_id: a[0], cx: a[1], cy: a[2] })); } catch (e) {} }
    //   ★[T426] 그날에 선다 — 시계를 부팅 틱에(`bootZone` 셋째 인자) · 부팅이 미룬 일(setImmediate)을 한 번 흘려보낸 뒤 센다
    const Z = await bootZone(DB, 39960 + (process.pid % 30), DAY);
    await new Promise((r) => setImmediate(r));
    const boot = bootCut(Z.log);
    const recut = recutLine(Z.log);
    const warned = Z.log.filter((s) => /색인을 못 물었다/.test(s)).slice(0, 3);
    let d0 = null; try { d0 = Z.H.SimVillages.econDay(); } catch (e) {}
    Z.clock(DAY);
    const gd = Z.H.gameDayNow();
    const c = countTerr(Z.H, pre.terr, DAY, pre.ledger);
    const post = readDb(DB);
    fs.writeFileSync(OUT, JSON.stringify({ bootMs: Z.bootMs, boot, recut, dbTerr, countTerr: pre.terr.length, warned, econDay: d0, clock: gd, tree: c.tree, sap: c.sap, stump: c.stump,
      trees: c.trees, saps: c.saps, ledgerPre: pre.ledger.size, ledgerPost: post.ledger.size, ledgerDiff: ledgerDiff(pre.ledger, post.ledger) }));
    process.exit(0);
  })().catch((e) => { try { fs.writeFileSync(process.argv[5], JSON.stringify({ err: String((e && e.stack) || e) })); } catch (x) {} process.exit(1); });
  return;
}

// ══ ★[T426] 재부팅 게이트 팔 — 새 프로세스 · **그날에 선다** ═══════════════════════
//   부팅 전 DB 를 믿으면 무엇이 서나(색인) → 부팅(시계 = 그날) → 다시 훑기 줄 → 제품 창구(메모리)로 → 부팅 뒤 DB 로 →
//   장부 새 행 · 날 바뀐 행(영토 셀의 씨인가) → [관측자] 서버가 **방송한** 개체를 영토 안/밖으로
if (MODE === '--recut') {
  (async () => {
    const DB = process.argv[3], DAY = +process.argv[4], OUT = process.argv[5];
    const OBS = process.argv[6] ? JSON.parse(process.argv[6]) : null;   // { vid, name, px, py }
    const pre = readDb(DB);
    const preIdx = countIdx(pre.terr, pre.ledger, DAY);                 // = 부팅이 메모리에 올릴 그것
    const Z = await bootZone(DB, 40100 + (process.pid % 300), DAY);
    const tS = Date.now();
    await new Promise((r) => setImmediate(r));                           // 부팅이 미룬 일(다시 훑기 · 옛 행 승격)이 먼저 돈다
    const settleMs = Date.now() - tS;                                    // = 부팅 뒤 첫 틱 앞에 선 일의 벽시계(가지 = 다시 훑기 한 판)
    const out = { bootMs: Z.bootMs, settleMs, clock: Z.H.gameDayNow(), boot: bootCut(Z.log), recut: recutLine(Z.log), promote: promoteLine(Z.log),
      grow: growCut(Z.log), warned: Z.log.filter((s) => /색인을 못 물었다/.test(s)).length,
      pre: { tree: preIdx.tree, sap: preIdx.sap, stump: preIdx.stump, ledger: pre.ledger.size, terr: pre.terr.length, neg: [...pre.ledger.values()].filter((v) => !(v >= 0)).length } };
    try { out.econDay = Z.H.SimVillages.econDay(); } catch (e) {}
    const mem = countTerr(Z.H, pre.terr, DAY, pre.ledger);               // 제품 창구 — 메모리 장부 + 시계
    out.mem = { tree: mem.tree, sap: mem.sap };
    if (OBS) {
      const own = new Set(pre.terr.filter((t) => t.village_id === OBS.vid).map((t) => t.cx + ',' + t.cy));
      const all = new Set(pre.terr.map((t) => t.cx + ',' + t.cy));
      const m0 = Z.msgs.length;
      Z.observe(OBS.px, OBS.py);
      //   방송이 멎을 때까지(= 켤 청크를 다 켰다 · T378 자 문법) — 정해진 초를 자지 않는다
      let last = Z.msgs.length, quietSince = Date.now(); const tq = Date.now();
      while (Date.now() - tq < 120000) { await sleep(1000); if (Z.msgs.length !== last) { last = Z.msgs.length; quietSince = Date.now(); } else if (Date.now() - quietSince > 5000 && Date.now() - tq > 8000) break; }
      const live = new Map();
      for (const m of Z.msgs.slice(m0)) {
        if (m.type === 'resources_spawn' || m.type === 'welcome') for (const r of (m.resources || [])) live.set(r.id, r);
        else if (m.type === 'resource_spawn' && m.resource) live.set(m.resource.id, m.resource);
        else if (m.type === 'resource_removed') live.delete(m.id);
        else if (m.type === 'resources_removed') for (const id of (m.ids || [])) live.delete(id);
      }
      const o = { village: OBS.name, msgs: Z.msgs.length - m0, sec: Math.round((Date.now() - tq) / 1000), own: { tree: 0, sap: 0, stump: 0 }, outKeys: [] };
      for (const r of live.values()) {
        const k = Math.floor(r.x / 32) + ',' + Math.floor(r.y / 32);
        if (own.has(k)) { if (r.type === 'tree') o.own.tree++; else if (r.type === 'sapling') o.own.sap++; else if (r.type === 'stump') o.own.stump++; }
        else if (!all.has(k) && (r.type === 'tree' || r.type === 'sapling') && r.seedKey) o.outKeys.push(r.seedKey + '@' + r.type);
      }
      o.outKeys.sort();
      out.obs = o;
    }
    await sleep(1500);
    const post = readDb(DB);
    const postIdx = countIdx(pre.terr, post.ledger, DAY);
    out.post = { tree: postIdx.tree, sap: postIdx.sap, stump: postIdx.stump, ledger: post.ledger.size, neg: [...post.ledger.values()].filter((v) => !(v >= 0)).length };
    out.promote = promoteLine(Z.log);                                     // 옛 행(−1) 승격 — 언제 났나(부팅 틱 · 아니면 관측자가 청크를 켠 때)
    //   장부 행 — 새 행 · 날 바뀐 행 · 그 행이 **영토 셀의 씨**인가(아니면 영토 밖이 바뀐 것)
    const tk = preIdx.keys;
    const d = { added: 0, changed: 0, gone: 0, addedOut: 0, changedOut: 0, changedTo: {} };
    for (const [k, v] of post.ledger) {
      if (!pre.ledger.has(k)) { d.added++; if (!tk.has(k)) d.addedOut++; }
      else if (pre.ledger.get(k) !== v) { d.changed++; if (!tk.has(k)) d.changedOut++; d.changedTo[v] = (d.changedTo[v] || 0) + 1; }
    }
    for (const k of pre.ledger.keys()) if (!post.ledger.has(k)) d.gone++;
    out.ledger = d;
    //   부팅 전 DB 로 **다시 서 있던** 씨가 부팅 뒤 무엇인가 — 메모리로(제품 창구) · DB 로(다음 부팅이 올릴 것)
    const standPre = new Set(preIdx.standing);
    const memStand = new Set([...mem.trees, ...mem.saps]), dbStand = new Set(postIdx.standing);
    let memStill = 0, dbStill = 0; for (const k of standPre) { if (memStand.has(k)) memStill++; if (dbStand.has(k)) dbStill++; }
    out.stand = { pre: standPre.size, memStill, dbStill };
    out.dump = [...post.ledger.entries()];
    fs.writeFileSync(OUT, JSON.stringify(out));
    process.exit(0);
  })().catch((e) => { try { fs.writeFileSync(process.argv[5], JSON.stringify({ err: String((e && e.stack) || e) })); } catch (x) {} process.exit(1); });
  return;
}

// ══ ★[T426] 재부팅 게이트 — 부르는 쪽 ═══════════════════════════════════════════
if (MODE === '--gate') {
  (async () => {
    const SRC = process.env.T398_DB, OUT = process.argv[3] || '/tmp/t426-gate.json';
    const BASE = process.env.T426_BASE_ROOT ? path.resolve(process.env.T426_BASE_ROOT) : '';
    const MUT = process.env.T426_MUT_ROOT ? path.resolve(process.env.T426_MUT_ROOT) : '';
    if (!SRC || !fs.existsSync(SRC) || !BASE || !MUT) { console.log('T398_DB=<40일 DB> T426_BASE_ROOT=<베이스> T426_MUT_ROOT=<돌연변이> 가 필요하다'); process.exit(2); }
    const say = (s) => process.stdout.write(s + '\n');
    const TMP = `/tmp/t426-gate-${process.pid}`;
    const cp = (from, to) => { for (const s of ['', '-wal', '-shm']) { try { fs.unlinkSync(to + s); } catch (e) {} try { fs.copyFileSync(from + s, to + s); } catch (e) {} } };
    const rm = (f) => { for (const s of ['', '-wal', '-shm']) { try { fs.unlinkSync(f + s); } catch (e) {} } };
    const PRIS = `${TMP}-src.db`;
    cp(SRC, PRIS);
    const res = { src: SRC, base: BASE, mut: MUT, branch: ROOT, at: new Date().toISOString(), clocks: [] };
    //   ── 영토 밖 미끼(픽스처) — 영토에 붙은 **밖** 셀(8이웃)에 서 있는 씨를 골라 장부에 가장 이른 벤 날로 적는다
    //      (나무꾼·채집이 영토 가에서 벤 자리 흉내). 입력 DB 의 장부는 전부 영토 안이라(40일 판 · 관측자 없는 1차) 그대로면
    //      "영토 밖 씨 단위 무변"이 **빈 대조**가 된다 — 다시 선 영토 밖 씨가 있어야 "다시 훑기가 밖을 안 건드린다"를 문다.
    const bait = (() => {
      const Database = require(path.join(ROOT, 'node_modules', 'better-sqlite3'));
      const CH = require(path.join(ROOT, 'server', 'chunk'));
      const { ZONES } = require(path.join(ROOT, 'server', 'zone-config'));
      const L = readDb(PRIS);
      const terr = new Set(L.terr.map((t) => t.cx + ',' + t.cy));
      let d0 = Infinity, dM = -Infinity; for (const v of L.ledger.values()) { if (v >= 0 && v < d0) d0 = v; if (v > dM) dM = v; }
      const opt = { biome: ZONES[ZID].biome, chunkSize: CH.CHUNK_SIZE, harvestedSet: L.ledger, gameDay: dM };
      const seen = new Set(), picks = [];
      for (const t of L.terr) for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
        const cx = t.cx + dx, cy = t.cy + dy, k = cx + ',' + cy;
        if (terr.has(k) || seen.has(k)) continue;
        seen.add(k);
        let a = []; try { a = CH.resourcesAtCell(ZID, cx, cy, opt); } catch (e) {}
        for (const e of a) if (e.type === 'tree' && e.seedKey && !L.ledger.has(e.seedKey)) picks.push({ key: e.seedKey, cx, cy });
      }
      const step = Math.max(1, Math.floor(picks.length / 400));
      const keys = picks.filter((_, i) => i % step === 0).slice(0, 400);
      const db = new Database(PRIS);
      const ins = db.prepare('INSERT INTO harvested_seeds (seed_key, harvested_at, harvested_day) VALUES (?, ?, ?)');
      for (const q of keys) ins.run(q.key, Date.now(), d0);
      db.close();
      return { day: d0, rim: seen.size, candidates: picks.length, keys };
    })();
    res.bait = { day: bait.day, rim: bait.rim, candidates: bait.candidates, n: bait.keys.length };
    say(`[자] 영토 밖 미끼 — 영토에 붙은 밖 셀 ${bait.rim}칸 · 서 있는 씨 ${bait.candidates} 중 ${bait.keys.length}개를 장부에 ${bait.day}일로(픽스처)`);
    const baitKeys = new Set(bait.keys.map((q) => q.key));
    //   미끼가 부팅 뒤 장부에서 어떤가(날 그대로 · 바뀜 · 빠짐) · 그 장부를 믿으면 그 날 몇 그루가 서 있나(색인)
    const baitOf = (dump, C) => {
      const M = new Map(dump || []);
      const r = { same: 0, changed: 0, gone: 0, standing: 0 };
      for (const k of baitKeys) { if (!M.has(k)) r.gone++; else if (M.get(k) === bait.day) r.same++; else r.changed++; }
      const CH = require(path.join(ROOT, 'server', 'chunk'));
      const { ZONES } = require(path.join(ROOT, 'server', 'zone-config'));
      const opt = { biome: ZONES[ZID].biome, chunkSize: CH.CHUNK_SIZE, harvestedSet: M, gameDay: C };
      const cells = new Map(); for (const q of bait.keys) cells.set(q.cx + ',' + q.cy, q);
      for (const q of cells.values()) { let a = []; try { a = CH.resourcesAtCell(ZID, q.cx, q.cy, opt); } catch (e) {} for (const e of a) if (baitKeys.has(e.seedKey) && (e.type === 'tree' || e.type === 'sapling')) r.standing++; }
      return r;
    };
    const { CHECK, L0 } = projection(PRIS, res, say);
    let armN = 0;
    const arm = (root, db, day, obs) => {
      const o = `${TMP}-arm-${++armN}.json`;
      const t = Date.now();
      spawnSync(process.execPath, [__filename, '--recut', db, String(day), o].concat(obs ? [JSON.stringify(obs)] : []),
        { cwd: root, stdio: 'ignore', timeout: 1800000, env: Object.assign({}, process.env, { T398_ROOT: root, T398_DAY_MS: 'product' }) });
      let r = null; try { r = JSON.parse(fs.readFileSync(o, 'utf8')); } catch (e) { r = { err: 'no json' }; }
      try { fs.unlinkSync(o); } catch (e) {}
      r.wallMs = Date.now() - t;
      return r;
    };
    //   장부 둘을 씨 단위로 — 영토 셀의 씨(`tk`) 안/밖으로 나눠 같은 행 · 날 다른 행 · 한쪽만
    const cmp = (a, b, tk) => {
      const A = new Map(a || []), B = new Map(b || []);
      const r = { out: { same: 0, diff: 0, onlyA: 0, onlyB: 0 }, in: { same: 0, diff: 0, onlyA: 0, onlyB: 0 } };
      for (const [k, v] of A) { const s = tk.has(k) ? r.in : r.out; if (!B.has(k)) s.onlyA++; else if (B.get(k) === v) s.same++; else s.diff++; }
      for (const k of B.keys()) if (!A.has(k)) (tk.has(k) ? r.in : r.out).onlyB++;
      return r;
    };
    const fmt = (x) => {
      if (!x || x.err) return `★실패 ${x && String(x.err).slice(0, 200)}`;
      const rc = x.recut ? `다시 훑기 ${x.recut.cut}그루(게임일 ${x.recut.day})` : '다시 훑기 줄 없음';
      return `${rc} · 부팅 전 DB 로 선 것 ${x.pre.tree + x.pre.sap}(성목 ${x.pre.tree}·묘목 ${x.pre.sap}) → 메모리로 ${x.mem.tree + x.mem.sap} · 부팅 뒤 DB 로 ${x.post.tree + x.post.sap}`
        + ` · 장부 새 행 ${x.ledger.added}(영토 밖 ${x.ledger.addedOut}) · 날 바뀐 행 ${x.ledger.changed}(영토 밖 ${x.ledger.changedOut})`
        + ` · 다시 서 있던 ${x.stand.pre}그루 → 메모리로 서 있음 ${x.stand.memStill} · DB 로 서 있음 ${x.stand.dbStill}`
        + ` · 승격 ${x.promote ? `${x.promote.n}행→${x.promote.day}` : 0} · 성장 개간 ${x.grow.lines}줄 · 기동 ${(x.bootMs / 1000).toFixed(0)}s`
        + (x.settleMs != null ? ` · 부팅 뒤 첫 틱 앞 ${(x.settleMs / 1000).toFixed(1)}s` : '');
    };
    say(`\n=== ★[T426] 재부팅 게이트 — 검문 날마다 같은 입력 DB 의 사본 · 시계를 부팅 틱에 · 제품 하루(팔 동안 econ 날 고정) ===`);
    for (const ck of CHECK) {
      const C = ck.day;
      const pre = countIdx(L0.terr, L0.ledger, C);
      const R = { tag: ck.tag, day: C, pre: { tree: pre.tree, sap: pre.sap, stump: pre.stump } };
      say(`\n${ck.tag} ${C}일 — 입력 DB 를 믿으면 영토에 다시 선 것: 성목 ${pre.tree} · 묘목 ${pre.sap} (그루터기 ${pre.stump})`);
      const W = (n) => `${TMP}-${n}.db`;
      cp(PRIS, W('base')); R.base = arm(BASE, W('base'), C); say(`  베이스            ${fmt(R.base)}`); rm(W('base'));
      cp(PRIS, W('br'));   R.br1 = arm(ROOT, W('br'), C);    say(`  가지 1            ${fmt(R.br1)}`);
      R.br2 = arm(ROOT, W('br'), C);                         say(`  가지 2(같은 DB)   ${fmt(R.br2)}`); rm(W('br'));
      cp(PRIS, W('mut'));  R.mut1 = arm(MUT, W('mut'), C);   say(`  돌연변이 1        ${fmt(R.mut1)}`);
      R.mut2 = arm(MUT, W('mut'), C);                        say(`  돌연변이 2(같은 DB) ${fmt(R.mut2)}`); rm(W('mut'));
      R.outside = cmp(R.base.dump, R.br1.dump, pre.keys);
      say(`  영토 밖 씨 단위(베이스 ↔ 가지 1 · 부팅 뒤 장부): 같은 행 ${R.outside.out.same} · 날 다른 행 ${R.outside.out.diff} · 한쪽만 ${R.outside.out.onlyA}/${R.outside.out.onlyB}`
        + `  ‖ 영토 안: 같은 행 ${R.outside.in.same} · 날 다른 행 ${R.outside.in.diff} · 한쪽만 ${R.outside.in.onlyA}/${R.outside.in.onlyB}`);
      R.bait = { base: baitOf(R.base.dump, C), br1: baitOf(R.br1.dump, C), br2: baitOf(R.br2.dump, C) };
      const bl = (x) => `날 그대로 ${x.same} · 바뀜 ${x.changed} · 빠짐 ${x.gone} · 그 장부로 서 있음 ${x.standing}`;
      say(`  영토 밖 미끼 ${bait.keys.length}개(장부 ${bait.day}일): 베이스 — ${bl(R.bait.base)}  ‖  가지 1 — ${bl(R.bait.br1)}  ‖  가지 2 — ${bl(R.bait.br2)}`);
      for (const k of ['base', 'br1', 'br2', 'mut1', 'mut2']) if (R[k]) delete R[k].dump;
      res.clocks.push(R);
      fs.writeFileSync(OUT, JSON.stringify(res, null, 1));
    }
    //   ── 관측자 0 ↔ 1 — ★관측자가 **한 번도 안 온** 판(40일 1차 끝 · 부팅 개간이 적은 −1 행이 승격 전)으로 잰다.
    //      입력 DB(2차가 관측자를 세운 판)에선 −1 행이 이미 승격돼 "관측자가 무엇을 바꾸나"가 빈 대조다.
    const OSRC = process.env.T426_OBS_DB;
    if (OSRC && fs.existsSync(OSRC)) {
      const OP = `${TMP}-obs-src.db`; cp(OSRC, OP);
      const C = CHECK[1].day;
      const LO = readDb(OP);
      const preO = countIdx(LO.terr, LO.ledger, C);
      const negO = [...LO.ledger.values()].filter((v) => !(v >= 0)).length;
      const top = [...preO.byVil.entries()].sort((x, y) => (y[1].tree + y[1].sap) - (x[1].tree + x[1].sap))[0];
      const v = LO.vils.find((q) => q.id === top[0]);
      const obs = { vid: v.id, name: v.name, px: v.cx * 32 + 16, py: v.cy * 32 + 16 };
      const O = { src: OSRC, day: C, village: v.name, pre: { tree: preO.tree, sap: preO.sap, neg: negO, ledger: LO.ledger.size } };
      say(`\n=== 관측자 0 ↔ 1 — 관측자가 한 번도 안 온 40일 판(${path.basename(OSRC)} · 장부 ${LO.ledger.size}행 중 −1 ${negO}행) · 시계 ${C}일 · 관측자 @${v.name}(부팅 직후 · 그 DB 로 다시 선 ${top[1].tree + top[1].sap}그루) ===`);
      const W = (n) => `${TMP}-o-${n}.db`;
      const lab = { base0: '베이스 · 관측자 0', base1: '베이스 · 관측자 1', br0: '가지 · 관측자 0', br1: '가지 · 관측자 1' };
      for (const [k, root, ob] of [['base0', BASE, null], ['base1', BASE, obs], ['br0', ROOT, null], ['br1', ROOT, obs]]) {
        cp(OP, W(k)); O[k] = arm(root, W(k), C, ob); rm(W(k));
        const x = O[k], o = x.obs;
        say(`  ${lab[k]}  ${fmt(x)} · 부팅 뒤 −1 행 ${x.post ? x.post.neg : '?'}`
          + (o ? ` · 방송 ${o.msgs}건 ${o.sec}s · 영토 안 받은 것: 성목 ${o.own.tree} · 묘목 ${o.own.sap} · 그루터기 ${o.own.stump}` : ''));
      }
      O.cmpBase = cmp(O.base0.dump, O.base1.dump, preO.keys);
      O.cmpBr = cmp(O.br0.dump, O.br1.dump, preO.keys);
      const ok = new Set((O.base1.obs || {}).outKeys || []), gk = new Set((O.br1.obs || {}).outKeys || []);
      let onlyB = 0, onlyG = 0; for (const k of ok) if (!gk.has(k)) onlyB++; for (const k of gk) if (!ok.has(k)) onlyG++;
      O.obsOut = { base: ok.size, branch: gk.size, onlyBase: onlyB, onlyBranch: onlyG };
      const line = (c) => `영토 안 같은 행 ${c.in.same} · 날 다른 행 ${c.in.diff} · 한쪽만 ${c.in.onlyA}/${c.in.onlyB} ‖ 영토 밖 같은 행 ${c.out.same} · 날 다른 행 ${c.out.diff} · 한쪽만 ${c.out.onlyA}/${c.out.onlyB}`;
      say(`  관측자 0 ↔ 1 · 베이스(부팅 뒤 장부): ${line(O.cmpBase)}`);
      say(`  관측자 0 ↔ 1 · 가지(부팅 뒤 장부):   ${line(O.cmpBr)}`);
      say(`  관측자가 받은 영토 밖 나무(씨 단위 · T378 ⓓ 문법): 베이스 ${O.obsOut.base} · 가지 ${O.obsOut.branch} · 베이스에만 ${O.obsOut.onlyBase} · 가지에만 ${O.obsOut.onlyBranch}`);
      for (const k of ['base0', 'base1', 'br0', 'br1']) { if (O[k]) { delete O[k].dump; if (O[k].obs) O[k].obs.outKeys = (O[k].obs.outKeys || []).length; } }
      res.observer = O;
      rm(OP);
      fs.writeFileSync(OUT, JSON.stringify(res, null, 1));
    }
    rm(PRIS);
    say(`\n표 → ${OUT}`);
    process.exit(0);
  })().catch((e) => { console.error('게이트 크래시:', e); process.exit(1); });
  return;
}

// ── 1) 돌아오는 날 표 — 정본만(존 0) ────────────────────────────────────────
//   ★[T426] 게이트(`--gate`)도 이 표에서 검문 날을 받는다 — 함수 하나(사본 0)
function projection(WORK, res, say) {
  const TR = require(path.join(ROOT, 'server', 'trees.js'));
  const CH = require(path.join(ROOT, 'server', 'chunk.js'));
  const { ZONES } = require(path.join(ROOT, 'server', 'zone-config'));
  const YD = require(path.join(ROOT, 'server', 'events.js')).yearDaysOf();
  const sY0 = CH.REGROW.TREE_STUMP_Y(), fY0 = CH.REGROW.TREE_FULL_Y();
  const L0 = readDb(WORK);
  const opt = { biome: ZONES[ZID].biome, chunkSize: CH.CHUNK_SIZE, harvestedSet: L0.ledger, gameDay: Math.max(...[...L0.ledger.values()]) };
  const bySp = new Map();
  let stumps = 0, nonTree = 0;
  const ret = [];   // [묘목 되는 날, 성목 되는 날]
  for (const t of L0.terr) {
    let a = []; try { a = CH.resourcesAtCell(ZID, t.cx, t.cy, opt); } catch (e) {}
    for (const e of a) {
      if (e.type !== 'stump') continue;
      stumps++;
      const sp = TR.ON() ? TR.speciesAt(ZID, Math.floor(e.x / 32), Math.floor(e.y / 32)) : null;
      const g = sp ? TR.stageYearsOf(sp, sY0, fY0) : [sY0, fY0];
      const cd = L0.ledger.get(e.seedKey);
      const sapD = cd + Math.ceil(g[0] * YD), fullD = cd + Math.ceil(g[1] * YD);
      ret.push([sapD, fullD]);
      const r = bySp.get(sp || '(종 없음)') || { n: 0, sapY: g[0], fullY: g[1], sapD: [], fullD: [] };
      r.n++; r.sapD.push(sapD); r.fullD.push(fullD); bySp.set(sp || '(종 없음)', r);
    }
    for (const e of a) if (e.type === 'tree' || e.type === 'sapling') nonTree++;
  }
  const maxCut = Math.max(...[...L0.ledger.values()]);
  const minOf = (a) => a.reduce((x, y) => Math.min(x, y), Infinity), maxOf = (a) => a.reduce((x, y) => Math.max(x, y), -Infinity);
  const CHECK = [
    { tag: 'ⓐ 첫 묘목', day: minOf(ret.map((r) => r[0])) },
    { tag: 'ⓑ 첫 성목', day: minOf(ret.map((r) => r[1])) },
    { tag: 'ⓒ 전부 성목', day: maxOf(ret.map((r) => r[1])) },
  ];
  const at = (d) => { let s = 0, m = 0; for (const [a, b] of ret) { if (d >= b) m++; else if (d >= a) s++; } return { sap: s, tree: m, stump: ret.length - s - m }; };
  res.projection = { stumps, standingInTerr: nonTree, yearDays: YD, maxCut, species: [...bySp.entries()].map(([sp, r]) => ({ sp, n: r.n, sapY: r.sapY, fullY: r.fullY,
    sapFirst: minOf(r.sapD), sapLast: maxOf(r.sapD), fullFirst: minOf(r.fullD), fullLast: maxOf(r.fullD) })).sort((a, b) => a.sapFirst - b.sapFirst),
    checks: CHECK.map((c) => ({ ...c, ...at(c.day) })) };
  const realDays = (gd) => (gd * 24 / 60 / 24).toFixed(1);   // 제품 하루 = 24분(인계 §시간 · T378 §0-ⓖ 표와 같은 환산)
  say(`[자] 영토 ${L0.terr.length}셀 · 장부 ${L0.ledger.size}행(가장 늦은 벤 날 ${maxCut}) · 영토 안 그루터기 ${stumps} · 서 있는 나무 ${nonTree} · 한 해 ${YD}일`);
  say(`\n=== ① 돌아오는 날 — 종별(정본 · 존 0) ===`);
  say(`${'종'.padEnd(10)}${'그루터기'.padStart(8)}${'벤 뒤 묘목'.padStart(12)}${'벤 뒤 성목'.padStart(12)}${'(제품 실일)'.padStart(16)}${'첫 묘목 날'.padStart(12)}${'첫 성목 날'.padStart(12)}`);
  for (const s of res.projection.species) {
    const a = Math.ceil(s.sapY * YD), b = Math.ceil(s.fullY * YD);
    say(`${String(s.sp).padEnd(10)}${String(s.n).padStart(8)}${(a + '일').padStart(12)}${(b + '일').padStart(12)}${(realDays(a) + ' · ' + realDays(b) + '일').padStart(16)}${String(s.sapFirst).padStart(12)}${String(s.fullFirst).padStart(12)}`);
  }
  say(`검문 날 — ${res.projection.checks.map((c) => `${c.tag} ${c.day}일(예측 묘목 ${c.sap} · 성목 ${c.tree} · 그루터기 ${c.stump})`).join(' · ')}`);
  return { CHECK, L0 };
}

// ══ 부르는 쪽 ════════════════════════════════════════════════════════════════
(async () => {
  const SRC = process.env.T398_DB;
  const OUT = process.argv[2] || '/tmp/t398-regrow.json';
  if (!SRC || !fs.existsSync(SRC)) { console.log('T398_DB=<40일 DB> 가 필요하다'); process.exit(2); }
  const WORK = `/tmp/t398-regrow-${process.pid}.db`;
  for (const s of ['', '-wal', '-shm']) { try { fs.unlinkSync(WORK + s); } catch (e) {} try { fs.copyFileSync(SRC + s, WORK + s); } catch (e) {} }
  const res = { src: SRC, at: new Date().toISOString() };
  const say = (s) => process.stdout.write(s + '\n');

  // ── 1) 돌아오는 날 표 — 정본만(존 0) ────────────────────────────────────────
  const { CHECK } = projection(WORK, res, say);

  // ── 2) 팔 ──────────────────────────────────────────────────────────────────
  const CK = `/tmp/t398-checks-${process.pid}.json`, AO = `/tmp/t398-arm-${process.pid}.json`, RO = `/tmp/t398-reboot-${process.pid}.json`;
  fs.writeFileSync(CK, JSON.stringify(CHECK));
  say(`\n[자] 팔 — 존을 띄운다(새 프로세스 · 게임일 ${process.env.T398_DAY_MS || 2500}ms · 관측자 0)`);
  const t1 = Date.now();
  spawnSync(process.execPath, [__filename, '--arm', WORK, CK, AO], { cwd: SROOT, stdio: 'ignore', timeout: 1800000, env: process.env });
  let A = null; try { A = JSON.parse(fs.readFileSync(AO, 'utf8')); } catch (e) { A = { err: 'no json' }; }
  res.arm = A;
  if (A.err) { say(`★팔 실패 — ${String(A.err).slice(0, 400)}`); fs.writeFileSync(OUT, JSON.stringify(res, null, 1)); process.exit(1); }
  say(`[자] 팔 ${((Date.now() - t1) / 1000).toFixed(0)}초 · 기동 ${A.boot.ms}ms · econ 날 ${A.boot.econDay} · 부팅 개간 ${A.boot.bootCut.lines}곳 ${A.boot.bootCut.cut}그루 · ★[T426] 다시 훑기 ${A.boot.recut ? `${A.boot.recut.cut}그루(게임일 ${A.boot.recut.day})` : '줄 없음'} · 못 물었다 ${A.boot.warned.length}줄`);
  say(`\n=== ② 시계를 당긴 팔 — 영토 안(처음 영토 셀 · 제품 창구) ===`);
  say(`시계 그대로(${A.day0.day}일): 성목 ${A.day0.tree} · 묘목 ${A.day0.sap} · 그루터기 ${A.day0.stump}`);
  for (const c of A.checks) {
    say(`${c.tag} 시계 ${c.clock}일: 성목 ${c.before.tree} · 묘목 ${c.before.sap} · 그루터기 ${c.before.stump}  →  econ ${c.econ.from}→${c.econ.to}일 뒤: 성목 ${c.after.tree} · 묘목 ${c.after.sap} · 그루터기 ${c.after.stump}`);
    say(`   사라진 성목 ${c.treeGone} · 묘목 ${c.sapGone} · 그 사이 성장 개간 ${c.grow.lines}줄 ${c.grow.cut}그루(새 편입 셀) · 영토 ${c.terr}→${c.terrAfter}셀 · 장부 새 행 ${c.ledger.diff.added} · 날 바뀐 행 ${c.ledger.diff.changed}`);
    say(`   많이 돌아온 마을: ${c.topVil.map((v) => `${v.name} 성목 ${v.tree}·묘목 ${v.sap}`).join(' · ')}`);
  }
  const O = A.observer;
  say(`관측자 @${O.village}(시계 ${O.day}일 · 방송 ${O.msgs}건 · 쫓겨남 ${O.kicked}): 영토 안 성목 ${O.before.tree} · 묘목 ${O.before.sap} · 그루터기 ${O.before.stump}  →  econ ${O.econ.from}→${O.econ.to}일 뒤: 성목 ${O.after.tree} · 묘목 ${O.after.sap} · 그루터기 ${O.after.stump}`);
  say(`   영토 안에서 빠진 개체(resource_removed) ${O.removed} — ${JSON.stringify(O.removedTypes)} · 누가: ${JSON.stringify(O.who)} · 주민이 겨눈 영토 안 개체 ${O.aimed} · 성장 개간 ${O.grow.lines}줄 ${O.grow.cut}그루(새 편입 셀)`);
  say(`   끝 시계 ${A.end.day}일에 그 씨가 서는 꼴(메모리 장부) — 성목 ${A.end.removedAt.tree} · 묘목 ${A.end.removedAt.sap} · 그 밖 ${A.end.removedAt.other}`);

  // ── 3) 다시 띄운다 ─────────────────────────────────────────────────────────
  const lastDay = CHECK[CHECK.length - 1].day;
  say(`\n[자] 다시 띄운다(새 프로세스 · 같은 DB · 시계 ${lastDay}일)`);
  const TC = `/tmp/t398-terr-${process.pid}.json`;
  fs.writeFileSync(TC, JSON.stringify(A.end.terrCells || []));
  spawnSync(process.execPath, [__filename, '--reboot', WORK, String(lastDay), RO, TC], { cwd: SROOT, stdio: 'ignore', timeout: 1800000, env: process.env });
  try { fs.unlinkSync(TC); } catch (e) {}
  let B = null; try { B = JSON.parse(fs.readFileSync(RO, 'utf8')); } catch (e) { B = { err: 'no json' }; }
  res.reboot = B;
  if (B.err) say(`★다시 띄운 판 실패 — ${String(B.err).slice(0, 400)}`);
  else {
    const eT = new Set(B.trees), eS = new Set(B.saps);
    B.treeGone = A.end.trees.filter((k) => !eT.has(k)).length; B.sapGone = A.end.saps.filter((k) => !eS.has(k)).length;
    say(`=== ③ 다시 띄운 판(시계 ${lastDay}일에 선다) — 부팅 개간 ${B.boot.lines}곳 ${B.boot.cut}그루 · ★[T426] 다시 훑기 ${B.recut ? `${B.recut.cells}칸 · 다시 벤 ${B.recut.cut}그루(게임일 ${B.recut.day})` : '줄 없음(옛 코드)'} · 못 물었다 ${B.warned.length}줄 · econ 날 ${B.econDay} · DB 영토 행 ${B.dbTerr}(센 셀 ${B.countTerr}) ===`);
    say(`시계 ${B.clock}일: 성목 ${A.end.tree} → ${B.tree} · 묘목 ${A.end.sap} → ${B.sap} · 그루터기 ${A.end.stump} → ${B.stump} · 사라진 성목 ${B.treeGone} · 묘목 ${B.sapGone}`);
    say(`장부 ${B.ledgerPre} → ${B.ledgerPost}(새 행 ${B.ledgerDiff.added} · 날 바뀐 행 ${B.ledgerDiff.changed} · 빠진 행 ${B.ledgerDiff.gone})`);
    const rk = A.observer.removedKeys || [];
    const bT = new Set(B.trees), bS = new Set(B.saps);
    const rb = { tree: 0, sap: 0, other: 0 }; for (const k of rk) { if (bT.has(k)) rb.tree++; else if (bS.has(k)) rb.sap++; else rb.other++; }
    B.removedAt = rb;
    say(`관측자 팔에서 빠진 ${rk.length}그루의 씨 — 다시 띄운 뒤(DB 장부): 성목 ${rb.tree} · 묘목 ${rb.sap} · 그 밖 ${rb.other}  (띄우기 전 메모리: 성목 ${A.end.removedAt.tree} · 묘목 ${A.end.removedAt.sap} · 그 밖 ${A.end.removedAt.other})`);
  }
  delete res.arm.end.terrCells;
  fs.writeFileSync(OUT, JSON.stringify(res, null, 1));
  say(`\n표 → ${OUT}`);
  for (const f of [CK, AO, RO]) { try { fs.unlinkSync(f); } catch (e) {} }
  if (!process.env.T398_KEEP) for (const s of ['', '-wal', '-shm']) { try { fs.unlinkSync(WORK + s); } catch (e) {} }
  else say(`DB 남김 → ${WORK}`);
  process.exit(0);
})().catch((e) => { console.error('자 크래시:', e); process.exit(1); });
