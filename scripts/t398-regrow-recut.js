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
// =============================================================================
'use strict';
const path = require('path');
const fs = require('fs');
const { spawnSync } = require('child_process');
const ROOT = path.join(__dirname, '..');
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

// ── 존을 이 프로세스 안에 띄운다 ─────────────────────────────────────────────
async function bootZone(DB, port) {
  process.env.ZONE_ID = ZID;
  process.env.PORT = String(port);
  process.env.DB_PATH = DB;
  process.env.ENABLE_VILLAGES = '1'; process.env.ENABLE_WILDLIFE = '0';
  process.env.ENABLE_BANDITS = '0'; process.env.ENABLE_ROADS = '0';
  process.env.E2E_GIVE = '1';                                     // `__e2e_clock` 분기(테스트 전용 · 이미 있는 손잡이)
  process.env.VILLAGE_DAY_MS = process.env.T398_DAY_MS || '2500';   // T378 자 그대로
  const log = [];
  const cap = (...a) => { log.push(a.map(String).join(' ')); };
  console.log = cap; console.warn = cap; console.error = cap;
  const t0 = Date.now();
  const Zone = require(path.join(ROOT, 'server', 'zone.js'));
  const H = Zone.__testBind();
  for (let i = 0; i < 1200; i++) { let d = null; try { d = H.SimVillages.econDay(); } catch (e) {} if (d != null) break; await sleep(500); }
  const msgs = [];
  const me = { pid: 'p_t398', playerId: 't398', name: 't398', persistent: false,
    ws: { readyState: 1, send: (t) => { try { msgs.push(JSON.parse(t)); } catch (e) {} } },
    x: 100, y: 100, vx: 0, vy: 0, floor: 0, hp: 100, maxHp: 100, hunger: 100, thirst: 100,
    inventory: {}, toolItems: [], equipment: [], equipSlots: {}, lots: {},
    isNpc: false, isDown: false, tribeId: null, lastSeen: Date.now() };
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
  const CH = require(path.join(ROOT, 'server', 'chunk'));
  const { ZONES } = require(path.join(ROOT, 'server', 'zone-config'));
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
    const { H } = Z;
    const E0 = H.gameDayNow();
    res.boot = { ms: Z.bootMs, econDay: E0, bootCut: bootCut(Z.log), warned: Z.log.filter((s) => /색인을 못 물었다/.test(s)).slice(0, 3) };
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
    //   ⚠팔이 끝에 센 **그 영토 셀**로 센다(팔이 내려가기 직전 하루가 셀을 더했을 수 있다 — 그 셀은 대조군이 아니다)
    if (process.argv[6]) { try { pre.terr = JSON.parse(fs.readFileSync(process.argv[6], 'utf8')).map((a) => ({ village_id: a[0], cx: a[1], cy: a[2] })); } catch (e) {} }
    const Z = await bootZone(DB, 39960 + (process.pid % 30));
    const boot = bootCut(Z.log);
    const warned = Z.log.filter((s) => /색인을 못 물었다/.test(s)).slice(0, 3);
    const d0 = Z.H.gameDayNow();
    Z.clock(DAY);
    const gd = Z.H.gameDayNow();
    const c = countTerr(Z.H, pre.terr, DAY, pre.ledger);
    const post = readDb(DB);
    fs.writeFileSync(OUT, JSON.stringify({ bootMs: Z.bootMs, boot, warned, econDay: d0, clock: gd, tree: c.tree, sap: c.sap, stump: c.stump,
      trees: c.trees, saps: c.saps, ledgerPre: pre.ledger.size, ledgerPost: post.ledger.size, ledgerDiff: ledgerDiff(pre.ledger, post.ledger) }));
    process.exit(0);
  })().catch((e) => { try { fs.writeFileSync(process.argv[5], JSON.stringify({ err: String((e && e.stack) || e) })); } catch (x) {} process.exit(1); });
  return;
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

  // ── 2) 팔 ──────────────────────────────────────────────────────────────────
  const CK = `/tmp/t398-checks-${process.pid}.json`, AO = `/tmp/t398-arm-${process.pid}.json`, RO = `/tmp/t398-reboot-${process.pid}.json`;
  fs.writeFileSync(CK, JSON.stringify(CHECK));
  say(`\n[자] 팔 — 존을 띄운다(새 프로세스 · 게임일 ${process.env.T398_DAY_MS || 2500}ms · 관측자 0)`);
  const t1 = Date.now();
  spawnSync(process.execPath, [__filename, '--arm', WORK, CK, AO], { cwd: ROOT, stdio: 'ignore', timeout: 1800000, env: process.env });
  let A = null; try { A = JSON.parse(fs.readFileSync(AO, 'utf8')); } catch (e) { A = { err: 'no json' }; }
  res.arm = A;
  if (A.err) { say(`★팔 실패 — ${String(A.err).slice(0, 400)}`); fs.writeFileSync(OUT, JSON.stringify(res, null, 1)); process.exit(1); }
  say(`[자] 팔 ${((Date.now() - t1) / 1000).toFixed(0)}초 · 기동 ${A.boot.ms}ms · econ 날 ${A.boot.econDay} · 부팅 개간 ${A.boot.bootCut.lines}곳 ${A.boot.bootCut.cut}그루 · 못 물었다 ${A.boot.warned.length}줄`);
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
  spawnSync(process.execPath, [__filename, '--reboot', WORK, String(lastDay), RO, TC], { cwd: ROOT, stdio: 'ignore', timeout: 1800000, env: process.env });
  try { fs.unlinkSync(TC); } catch (e) {}
  let B = null; try { B = JSON.parse(fs.readFileSync(RO, 'utf8')); } catch (e) { B = { err: 'no json' }; }
  res.reboot = B;
  if (B.err) say(`★다시 띄운 판 실패 — ${String(B.err).slice(0, 400)}`);
  else {
    const eT = new Set(B.trees), eS = new Set(B.saps);
    B.treeGone = A.end.trees.filter((k) => !eT.has(k)).length; B.sapGone = A.end.saps.filter((k) => !eS.has(k)).length;
    say(`=== ③ 다시 띄운 판 — 부팅 개간 ${B.boot.lines}곳 ${B.boot.cut}그루 · 못 물었다 ${B.warned.length}줄 · econ 날 ${B.econDay} ===`);
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
