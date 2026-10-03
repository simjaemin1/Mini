#!/usr/bin/env node
// @regress   ← 통합 러너가 이 표를 보고 자기 목록을 만든다(scripts/run-regress.sh · 표 없으면 안 돈다)
// === scripts/test-regrow-block.js — 영토 셀과 다져진 길 둘레엔 나무가 돌아오지 않는다 (T566) ==================
//
// ★왜 [T566 · 재민 09-30 · 추신 · 추신2] 벤 자리는 T122 시계대로 돌아오고(묘목 ~10일 · 성목 ~24일) 개간이 그걸 **뒤에서** 베러 다녔다
//   (T378 부팅 전부 · T426 다시 벰 · T440 영토가 자란 날 영토 전체) ⇒ 영토가 멎은 마을은 다음 부팅까지 마을 안 숲(T440 회부 1).
//   이제 **술어 하나**(`zone.js regrowBlockedAt` = 영토 ∪ 다져진 길(등급 2)의 체비쇼프 2셀 안)가 막힌 셀의 벤 자리에 `'gone'` 을 낸다.
//
// ★이 자가 지키는 것(카드 ⑤ · 추신 · 추신2)
//   ⓑ 다져진 길 — 등급 1(흙길)에선 아무 일도 없다(종전) · 등급 2 로 오르는 **그 호출**에 그 셀의 나무·묘목·그루터기 0 ·
//      둘레 25셀의 서 있던 나무는 그대로 · 둘레 벤 자리는 그루터기도 없다(`'stump'` 0)·묘목 0 · 둘레 밖(3셀)은 종전대로 자란다 ·
//      등급 2 아래로 내려가면 풀린다 — 장부의 벤 날 = **풀린 날**(메모리·DB) ⇒ 그루터기부터 다시 잰다
//   ⓒ 막히지 않은 셀의 답은 **씨 단위로 같다** — 같은 장부를 술어 없이(`new Map`) 넘긴 생성과 JSON 통째 대조 ·
//      막힌 셀은 "장부의 나무 씨"만 빠진다(덤불·풀·군락 등 채집 실물은 무접촉 — 카드 ④)
//   ⓕ 숲 격자 틈 불변식 — 최소 간격(`FOREST_SP_MIN`)에서 이웃 트렁크 콜라이더 사이 틈 ≥ 몸 지름(0.5m) — 식 하나 · 값 판정 0
//   ⓐ ⓓ ⓔ [`T566_W40=<40일 DB>`] 40일 판(T378 게이트 판 · T440 자의 그 판)을 **부팅 없이** 첫 묘목·첫 성목 날로 당겨 econ n일씩:
//      영토 안 서 있는 것(성목·묘목 · 그리고 그루터기) **0** — 켬 팔 · 대조 = 끔 팔(`T566_REGROW_BLOCK=0` · 종전 수) ·
//      ⓓ 영토 안에 심은 묘목 — 개간(부팅과 같은 문)이 안 벤다 · 성목이 되는 날 성목 · ⓔ 영토가 자란 날 훑은 셀 = 그날 늘어난 셀(전체 아님)
//      · 그리고 같은 DB 를 **다시 띄워**(부팅 개간 · 시계는 부팅 틱에) 영토 안 서 있는 것 0 · 심은 나무가 산다
//   ⓐ′ ⓗ [`T538_DB=<서울 사본>`] 서울 사본을 띄워 막힌 셀(영토 · 다져진 길 셀) 안 서 있는 것 **0** · `roads` 표 등급별 셀 수(v≥1 · ≥8 · ≥28 —
//      표만 · `T1`·`T2`·`DK` 무접촉 · 값 판정은 재민) · 첫 부팅에 둘레(길만 막은 셀)에서 'gone' 이 되는 장부 묘목·성목 수(표만)
//   ⓘ 정적 — 답 넷이 같은 술어(시더 두 갈래 · 색인 · 되살림)·심은 것은 안 묻는다 · 손잡이 하나 · 새 수 0(T2 · 반경 2 · T122)
//
// ⚠입력 DB 둘이 없으면 그 절은 **[건너뜀]** 이라 적고 세지 않는다(통과로 세지 않는다 — 자명 통과 금지).
// ⚠존을 **이 프로세스 안에서** 띄운다(`test-recut` 문법 · `Zone.__testBind`) — 관측자 0(가짜 플레이어는 `players` 에 안 넣는다).
//   길은 켠다(`ENABLE_ROADS=1` · 새 DB) · 마을은 끈다(술어의 길 항만 잰다 — 영토 항은 ⓐ 의 자식이 잰다).
// 실행: node scripts/test-regrow-block.js
//       T566_W40=/tmp/t378-world-NNN.db T538_DB=/path/seoul.db node scripts/test-regrow-block.js
//   (내부) --w40 <db> <out.json> <on|off> [nocap]  ·  --reboot <db> <out.json> <clockDay> [심은 나무 JSON]  ·  --seoul <db> <out.json> <on|off>
//   ⓔ 의 팔(`nocap`)은 NPC 영토 상한(T538 · T559 ⓪)을 끈다 — 상한이 켜진 40일 판은 영토가 한 칸도 안 자란다(50/50 멎은 마을)
'use strict';
const path = require('path');
const fs = require('fs');
const ROOT = path.join(__dirname, '..');
const codeOnly = require('./code-only.js');   // ★[T171] 주석 제거기 정본(사본 0)
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let pass = 0, fail = 0;
const ok = (c, m, x) => { c ? pass++ : fail++; console.log((c ? '  ✓ ' : '  ✗ ') + m + (x !== undefined && x !== '' ? `  ${x}` : '')); };
const pre = (c, m, x) => { if (!c) { fail++; console.log('  ✗ [상황] ' + m + (x !== undefined ? `  ${x}` : '')); } else console.log('  · [상황] ' + m + (x !== undefined ? `  ${x}` : '')); };
const skip = (m) => console.log('  · [건너뜀] ' + m);
const MODE = process.argv[2];
const ZID = 'hanbando';

// ══ 자식 공용 — 존을 이 프로세스 안에 띄운다(`t398-regrow-recut` bootZone 문법) ═════════════════════════════
async function bootZone(DB, port, envExtra, bootClock) {
  Object.assign(process.env, { ZONE_ID: ZID, PORT: String(port), DB_PATH: DB, ENABLE_WILDLIFE: '0', ENABLE_BANDITS: '0', E2E_GIVE: '1' }, envExtra || {});
  const log = [];
  const cap = (...a) => { log.push(a.map(String).join(' ')); };
  console.log = cap; console.warn = cap; console.error = cap;
  const me = { pid: 'p_t566', playerId: 't566', name: 't566', persistent: false, ws: { readyState: 1, send: () => {} },
    x: 100, y: 100, vx: 0, vy: 0, floor: 0, hp: 100, maxHp: 100, hunger: 100, thirst: 100,
    inventory: {}, toolItems: [], equipment: [], equipSlots: {}, lots: {}, isNpc: false, isDown: false, tribeId: null, lastSeen: Date.now() };
  const t0 = Date.now();
  const Zone = require(path.join(ROOT, 'server', 'zone.js'));
  const H = Zone.__testBind();
  const clock = (day) => H.handlePlayerInput(me, JSON.stringify({ type: '__e2e_clock', day, night: false }));
  if (Number.isFinite(bootClock)) clock(bootClock);   // ★부팅 틱에 그날로 선다(부팅이 미룬 일이 그날을 본다 · T426 문법)
  if (process.env.ENABLE_VILLAGES === '1') {
    for (let i = 0; i < 2400; i++) { let d = null; try { d = H.SimVillages.econDay(); } catch (e) {} if (d != null) break; await sleep(250); }
  }
  await new Promise((r) => setImmediate(r));          // 부팅이 미룬 일(T426 다시 훑기 · 옛 행 승격)을 먼저
  return { H, me, clock, log, bootMs: Date.now() - t0 };
}
const CHM = () => require(path.join(ROOT, 'server', 'chunk.js'));
const terrCellsOf = (H) => {   // 메모리 영토(`_terrSet`) — 마을 → 셀 키 배열
  const S = H.SimVillages.__p3Bind({}).state;
  return (S.villages || []).map((v) => ({ id: v.dbId, name: v.name, cells: v._terrSet ? [...v._terrSet] : [] }));
};
//   영토 셀 전부 — 제품 창구(`_t325TreesAtCell` · 관측자 0 ⇒ 색인)로 성목·묘목 · 같은 판(`_idxAtCell`)으로 그루터기
function countStanding(H, cellsByVil, day) {
  let tree = 0, sap = 0, stump = 0, cells = 0;
  const byVil = new Map(); const seen = new Set();
  for (const v of cellsByVil) {
    const r = { tree: 0, sap: 0, stump: 0 };
    for (const k of v.cells) {
      if (seen.has(k)) continue; seen.add(k); cells++;
      const ci = k.indexOf(','), cx = +k.slice(0, ci), cy = +k.slice(ci + 1);
      let a = []; try { a = H._t325TreesAtCell(cx, cy) || []; } catch (e) {}
      for (const e of a) { if (e.plantedDay != null) continue; if (e.type === 'tree') { tree++; r.tree++; } else if (e.type === 'sapling') { sap++; r.sap++; } }
      let b = []; try { b = H._idxAtCell(cx, cy, false, day) || []; } catch (e) {}
      for (const e of b) if (e.type === 'stump') { stump++; r.stump++; }
    }
    byVil.set(v.id, r);
  }
  return { tree, sap, stump, cells, byVil };
}

// ══ ⓐⓓⓔ 자식 — 40일 판을 부팅 없이 두 창(첫 묘목 · 첫 성목) · econ n일씩 ═══════════════════════════════════
if (MODE === '--w40') {
  (async () => {
    const DB = process.argv[3], OUT = process.argv[4], ARM = process.argv[5], OPT = process.argv[6] || '';
    const N = +(process.env.T566_W40_DAYS || 10);
    //   `nocap` — NPC 영토 상한(T538 · T559 ⓪)을 끈 팔: 40일 판은 상한 때문에 영토가 **한 칸도** 안 자란다(50곳 전부 멎은 마을) ⇒
    //     영토가 자란 날의 훑기 비용(ⓔ)은 상한을 끈 팔에서만 잴 수 있다(제품 손잡이 그대로 · 이 팔은 재기만 한다)
    const envX = { ENABLE_VILLAGES: '1', ENABLE_ROADS: '0', VILLAGE_DAY_MS: '2500', T566_REGROW_BLOCK: ARM === 'off' ? '0' : '1' };
    if (OPT === 'nocap') envX.T538_TERR_CAP = '0';
    const Z = await bootZone(DB, 41000 + (process.pid % 300), envX);
    const { H } = Z;
    const out = { arm: ARM, opt: OPT, bootMs: Z.bootMs, econ0: H.SimVillages.econDay(), on: H._t566On, windows: [] };
    //   창 날 — 영토 셀의 장부 나무 씨가 묘목·성목이 되는 첫날(정본 유도 · 수를 안 적는다 — T398 projection 문법)
    const CH = CHM(), TR = require(path.join(ROOT, 'server', 'trees.js'));
    const YD = require(path.join(ROOT, 'server', 'events.js')).yearDaysOf();
    let sapDay = Infinity, fullDay = Infinity, terrLedger = 0;
    const T0 = terrCellsOf(H);
    for (const v of T0) for (const k of v.cells) {
      const ci = k.indexOf(','), cx = +k.slice(0, ci), cy = +k.slice(ci + 1);
      for (const e of (H._idxAtCell(cx, cy, true) || [])) {
        if (e.type !== 'tree' || !e.seedKey || !H.harvestedSeeds.has(e.seedKey)) continue;
        const cd = H.harvestedSeeds.get(e.seedKey); if (!(cd >= 0)) continue;
        terrLedger++;
        const g = TR.stageYearsOf(e.sp || null, CH.REGROW.TREE_STUMP_Y(), CH.REGROW.TREE_FULL_Y());
        sapDay = Math.min(sapDay, cd + Math.ceil(g[0] * YD)); fullDay = Math.min(fullDay, cd + Math.ceil(g[1] * YD));
      }
    }
    out.terrLedger = terrLedger; out.days = [sapDay, fullDay];
    //   ⓓ 심은 묘목 — 영토 셀 하나에(빈 칸 · 남의 땅 아님) · 부팅 개간과 **같은 문**(마을 영토 전체로 `clearTreesInCells`)을 지나도 서 있나
    let planted = null;
    if (ARM === 'on' && !OPT) {
      const v = T0.find((q) => q.cells.length > 200) || T0[0];
      for (const k of v.cells) {
        const ci = k.indexOf(','), cx = +k.slice(0, ci), cy = +k.slice(ci + 1);
        const px = cx * 32 + 16, py = cy * 32 + 16;
        if (H.isTerrainBlockedLocal(px, py)) continue;
        if ((H._idxAtCell(cx, cy, true) || []).length) continue;
        let busy = false; for (const rr of H.resources.values()) if (Math.floor(rr.x / 32) === cx && Math.floor(rr.y / 32) === cy) { busy = true; break; }
        for (const b of H.buildings.values()) if (Math.floor(b.x / 32) === cx && Math.floor(b.y / 32) === cy) { busy = true; break; }
        if (busy) continue;
        Z.me.x = px; Z.me.y = py; Z.me.inventory.acorn = 1;
        const t = H.tryPlantTree(Z.me, px, py, 'acorn');
        if (t) { planted = { id: t.id, dbId: t.dbId, cell: [cx, cy], vil: v.name, day: H.gameDayNow(), sp: t.sp || null }; break; }
      }
      if (planted) {
        await sleep(600);   // 쿼드트리는 틱이 다시 세운다(200ms 상한 · 종전 규칙) — 심은 묘목이 개간의 `near` 에 **보이게** 한 뒤 훑는다
        const n = H.clearTreesInCells(new Set(v.cells));
        planted.keepStat = H._t566Stat.plantedKeep;
        planted.sweptN = n;
        planted.afterSweep = H.resources.has(planted.id) && H.resourcesByDbId.has(planted.dbId);
      }
    }
    for (const day of [sapDay, fullDay]) {
      if (!Number.isFinite(day)) { out.windows.push({ day, err: '영토에 장부 나무 씨가 없다' }); continue; }
      Z.clock(day);
      const st0 = Object.assign({}, H._t566Stat);
      const A = terrCellsOf(H);
      const before = countStanding(H, A, day);
      const e0 = H.SimVillages.econDay();
      for (let i = 0; i < 4000; i++) { if (H.SimVillages.econDay() >= e0 + N) break; await sleep(250); }
      for (let i = 0; i < 400 && H.SimVillages.villagesBusy(); i++) await sleep(25);
      const B = terrCellsOf(H);
      const grewIds = new Set(B.filter((b) => { const a = A.find((q) => q.id === b.id); return a && b.cells.length > a.cells.length; }).map((b) => b.id));
      const after = countStanding(H, B, day);
      const afterOld = countStanding(H, A, day);   // 창 앞 영토(옛 셀)만 — 멎은 마을의 그 셀
      const still = { tree: 0, sap: 0, stump: 0, n: 0 }, grew = { tree: 0, sap: 0, stump: 0, n: 0 };
      for (const [id, r] of afterOld.byVil) { const g = grewIds.has(id) ? grew : still; g.n++; g.tree += r.tree; g.sap += r.sap; g.stump += r.stump; }
      const st1 = H._t566Stat;
      const d = {}; for (const k of Object.keys(st1)) d[k] = (st1[k] || 0) - (st0[k] || 0);
      out.windows.push({ day, econ: [e0, H.SimVillages.econDay()], before: { tree: before.tree, sap: before.sap, stump: before.stump, cells: before.cells },
        after: { tree: after.tree, sap: after.sap, stump: after.stump, cells: after.cells }, still, grew, grewN: grewIds.size, vils: B.length, stat: d });
    }
    if (planted) {
      //   심은 날부터 성목이 되는 날(정본 — `_shapeRegrown` 이 쓰는 그 함수) 이후로 시계를 당겨 정산한다
      const g = TR.stageYearsOf(planted.sp, CH.REGROW.TREE_STUMP_Y(), CH.REGROW.TREE_FULL_Y());
      const mDay = planted.day + Math.ceil((g[1] - g[0]) * YD) + 1;
      Z.clock(mDay);
      H._shapePlantedAll();
      const r = H.resources.get(planted.id);
      planted.matureDay = mDay; planted.type = r ? r.type : null; planted.alive = !!r && H.resourcesByDbId.has(planted.dbId);
    }
    out.planted = planted;
    out.stat = Object.assign({}, H._t566Stat);
    out.terrEnd = terrCellsOf(H).map((v) => [v.id, v.cells.length]);
    await sleep(1500);
    fs.writeFileSync(OUT, JSON.stringify(out));
    process.exit(0);
  })().catch((e) => { try { fs.writeFileSync(process.argv[4], JSON.stringify({ err: String((e && e.stack) || e) })); } catch (x) {} process.exit(1); });
  return;
}

// ══ ⓐ 다시 띄운 판 — 같은 DB · 시계는 부팅 틱에(부팅 개간이 그날을 본다) ════════════════════════════════════
if (MODE === '--reboot') {
  (async () => {
    const DB = process.argv[3], OUT = process.argv[4], DAY = +process.argv[5];
    const PL = process.argv[6] ? JSON.parse(process.argv[6]) : null;
    const Z = await bootZone(DB, 41400 + (process.pid % 300), { ENABLE_VILLAGES: '1', ENABLE_ROADS: '0', VILLAGE_DAY_MS: '2500' }, DAY);
    const { H } = Z;
    Z.clock(DAY);
    const c = countStanding(H, terrCellsOf(H), DAY);
    let pl = null;
    if (PL) { let r = null; for (const q of H.resources.values()) if (q.dbId === PL.dbId) { r = q; break; } if (r) H._shapePlantedAll(); pl = r ? { type: r.type, alive: true } : { alive: false }; }
    fs.writeFileSync(OUT, JSON.stringify({ bootMs: Z.bootMs, day: DAY, tree: c.tree, sap: c.sap, stump: c.stump, cells: c.cells, planted: pl, stat: H._t566Stat,
      recut: Z.log.filter((s) => /★\[T426\] 부팅 개간 다시 훑기/.test(s)).length }));
    process.exit(0);
  })().catch((e) => { try { fs.writeFileSync(process.argv[4], JSON.stringify({ err: String((e && e.stack) || e) })); } catch (x) {} process.exit(1); });
  return;
}

// ══ ⓐ′ⓗ 자식 — 서울 사본을 띄운다(제품 하루 · 길 켬) ══════════════════════════════════════════════════════════
if (MODE === '--seoul') {
  (async () => {
    const DB = process.argv[3], OUT = process.argv[4], ARM = process.argv[5];
    const Z = await bootZone(DB, 41700 + (process.pid % 200), { ENABLE_VILLAGES: '1', ENABLE_ROADS: '1', T566_REGROW_BLOCK: ARM === 'off' ? '0' : '1' });
    const { H } = Z;
    //   시계가 선 첫 틱을 기다린다(풀린 길 · 옛 행 승격 — 부팅이 미룬 일)
    for (let i = 0; i < 400 && H._t566RelPend && H._t566RelPend.length; i++) await sleep(100);
    const day = H.gameDayNow();
    const T = terrCellsOf(H);
    const terr = countStanding(H, T, day);
    const W = Math.ceil(require(path.join(ROOT, 'server', 'zone-config.js')).ZONES[ZID].zoneWidth / 32);
    const S = H.Roads._S;
    const pavedCells = [...S.paved].map((k) => (k % W) + ',' + ((k / W) | 0));
    const paved = countStanding(H, [{ id: 'paved', cells: pavedCells }], day);
    //   ⓗ 등급별 셀 수 — 표 그대로(저장 v) · 오늘 감쇠(부팅이 잰 그 식) · 표의 마지막 날 감쇠
    const DK = 0.995;
    const t = Math.floor((Date.now() - S.epoch) / S.dayMs);
    let dmax = 0; for (const r of S.cells.values()) if (r.d > dmax) dmax = r.d;
    //   ⚠`S.cells` 는 부팅이 오늘로 감쇠해 버린 셀(v<1)을 이미 지웠을 수 있다 — 표 수는 DB 를 직접 읽는다(읽기만)
    const D = require(path.join(ROOT, 'node_modules', 'better-sqlite3'))(DB, { readonly: true });
    const rows = D.prepare('SELECT v, d FROM roads').all(); D.close();
    const lv = (at) => { let a = 0, b = 0, c = 0; for (const r of rows) { const v = (at !== null && at > r.d) ? r.v * Math.pow(DK, at - r.d) : r.v; if (v >= 1) a++; if (v >= 8) b++; if (v >= 28) c++; } return [a, b, c]; };
    let dmaxDb = 0; for (const r of rows) if (r.d > dmaxDb) dmaxDb = r.d;
    //   첫 부팅에 둘레(길만 막은 셀 — 영토도 다져진 길 셀도 아닌)에서 'gone' 이 되는 장부 나무 씨 — 단계별(표만)
    const blockedByRoadOnly = (cx, cy) => !H.SimVillages.villageOfCell(cx, cy) && !S.paved.has(cy * W + cx) && H.Roads.pavedNear(cx, cy, H._t566R);
    const gone = { stump: 0, sapling: 0, mature: 0, other: 0, cells: 0 };
    if (ARM === 'on') {
      const CH = CHM();
      const seenC = new Set();
      for (const k of S.paved) {
        const cx0 = k % W, cy0 = (k / W) | 0;
        for (let y = cy0 - 2; y <= cy0 + 2; y++) for (let x = cx0 - 2; x <= cx0 + 2; x++) {
          const ck = x * 65536 + y; if (seenC.has(ck)) continue; seenC.add(ck);
          if (x < 0 || y < 0 || !blockedByRoadOnly(x, y)) continue;
          gone.cells++;
          for (const e of (H._idxAtCell(x, y, true) || [])) {
            if (e.type !== 'tree' || !e.seedKey || !H.harvestedSeeds.has(e.seedKey)) continue;
            const cd = H.harvestedSeeds.get(e.seedKey);
            const s = (cd >= 0) ? CH.regrowStageOf('tree', day - cd, e.sp || null) : null;
            if (s === 'stump' || s === 'sapling' || s === 'mature') gone[s]++; else gone.other++;
          }
        }
      }
    }
    fs.writeFileSync(OUT, JSON.stringify({ arm: ARM, bootMs: Z.bootMs, day, vils: T.length,
      terr: { tree: terr.tree, sap: terr.sap, stump: terr.stump, cells: terr.cells },
      paved: { tree: paved.tree, sap: paved.sap, stump: paved.stump, cells: paved.cells },
      roads: { rows: rows.length, stored: lv(null), atDbLast: lv(dmaxDb), dbLast: dmaxDb, atBoot: lv(t), bootDay: t, pavedSet: S.paved.size, bootUnpaved: (S.bootUnpaved || []).length },
      gone, stat: H._t566Stat,
      bootLines: Z.log.filter((s) => /★\[T566\]|영토 개간|T426\] 부팅 개간 다시 훑기/.test(s)).slice(0, 8) }));
    process.exit(0);
  })().catch((e) => { try { fs.writeFileSync(process.argv[4], JSON.stringify({ err: String((e && e.stack) || e) })); } catch (x) {} process.exit(1); });
  return;
}

// ══ 본판 — 이 프로세스 안에 새 세계(마을 끔 · 길 켬) ═════════════════════════════════════════════════════════
(async () => {
  console.log('\n=== 영토 셀과 다져진 길 둘레엔 나무가 돌아오지 않는다 — 재생 술어 하나 (T566) ===\n');
  const TMP = `/tmp/test-regrow-block-${process.pid}.db`;
  const rmDb = (f) => { for (const x of ['', '-wal', '-shm']) { try { fs.unlinkSync(f + x); } catch (e) {} } };
  rmDb(TMP); process.on('exit', () => rmDb(TMP));
  Object.assign(process.env, { ZONE_ID: ZID, PORT: String(40800 + (process.pid % 150)), DB_PATH: TMP,
    ENABLE_VILLAGES: '0', ENABLE_WILDLIFE: '0', ENABLE_BANDITS: '0', ENABLE_ROADS: '1', E2E_GIVE: '1' });
  delete process.env.T566_REGROW_BLOCK;   // 제품 기본(켬)으로 잰다
  const _l = console.log, _w = console.warn, _e = console.error;
  console.log = () => {}; console.warn = () => {}; console.error = () => {};
  const Zone = require(path.join(ROOT, 'server', 'zone.js'));
  const _mute = (f) => (...a) => { if (typeof a[0] === 'string' && /^\[hanbando\]|^\s{4,}biome=/.test(a[0])) return; f(...a); };
  console.log = _mute(_l); console.warn = _mute(_w); console.error = _mute(_e);
  const H = Zone.__testBind();
  const me = { pid: 'p_rb', playerId: 'tr_rb', name: 'rb', persistent: false, ws: { readyState: 1, send: () => {} }, x: 0, y: 0, vx: 0, vy: 0, floor: 0,
    hp: 100, maxHp: 100, hunger: 100, thirst: 100, inventory: {}, toolItems: [], equipment: [], equipSlots: {}, lots: {}, isNpc: false, isDown: false, tribeId: null, lastSeen: Date.now() };
  const clock = (day) => H.handlePlayerInput(me, JSON.stringify({ type: '__e2e_clock', day, night: false }));
  const CH = CHM();
  const TR = require(path.join(ROOT, 'server', 'trees.js'));
  const YD = require(path.join(ROOT, 'server', 'events.js')).yearDaysOf();
  const Zc = require(path.join(ROOT, 'server', 'zone-config.js')).ZONES[ZID];
  const R = H.Roads, S = R._S;
  const W = S.cellsW;
  pre(H._t566On === true && H._t566R === 2 && S.ready, `손잡이 기본 켬 · 둘레 체비쇼프 ${H._t566R} · 길 준비 ${S.ready}`);
  const raw = (x, y) => (H._idxAtCell(x, y, true) || []);
  const rawTrees = (x, y) => raw(x, y).filter((e) => e.type === 'tree' && e.isSeed && e.seedKey);
  const idx = (x, y, d) => (H._idxAtCell(x, y, false, d) || []);
  const stand = (x, y) => (H._t325TreesAtCell(x, y) || []).filter((e) => e.isSeed);   // 제품 창구(관측자 0 ⇒ 색인)
  const dbDay = (k) => { const r = H.db.getAllHarvestedSeeds().find((q) => q.seed_key === k); return r ? r.harvested_day : null; };
  const stageDays = (e) => { const g = TR.stageYearsOf(e.sp || null, CH.REGROW.TREE_STUMP_Y(), CH.REGROW.TREE_FULL_Y()); return { sap: Math.ceil(g[0] * YD), full: Math.ceil(g[1] * YD) }; };

  // ── 자리 — 숲 한복판: 길 셀 P(나무 한 그루) · 둘레 25셀에 나무 한 그루씩 선 셀 ≥ 4 · 둘레 밖(체비쇼프 3) 대조 셀 C3 ──────
  //   세계에 물어서 고른다(수를 안 적는다 · 족보 73)
  const cpc = CH.CHUNK_SIZE / 32;
  const nC = Math.min(Math.floor(Zc.zoneWidth / CH.CHUNK_SIZE), Math.floor(Zc.zoneHeight / CH.CHUNK_SIZE));
  let P = null, RING = null, C3 = null;
  for (let k = 1; k < nC && !P; k++) {
    for (let cy = k * cpc + 4; cy < (k + 1) * cpc - 4 && !P; cy++) for (let cx = k * cpc + 4; cx < (k + 1) * cpc - 4 && !P; cx++) {
      if (rawTrees(cx, cy).length !== 1) continue;
      const ring = [];
      for (let y = cy - 2; y <= cy + 2; y++) for (let x = cx - 2; x <= cx + 2; x++) if ((x !== cx || y !== cy) && rawTrees(x, y).length === 1) ring.push([x, y]);
      if (ring.length < 4) continue;
      let c3 = null; for (let x = cx - 3; x <= cx + 3 && !c3; x++) if (rawTrees(x, cy - 3).length === 1) c3 = [x, cy - 3];
      if (!c3) continue;
      P = [cx, cy]; RING = ring; C3 = c3;
    }
  }
  pre(!!P, '자리 — 길 셀 하나(나무 한 그루) · 둘레에 나무 선 셀 ≥ 4 · 둘레 밖 대조 셀', P ? `P ${P} · 둘레 나무 셀 ${RING.length} · C3 ${C3}` : '없다');
  if (!P) { console.log(`\n=== 결과: ${pass} PASS / ${fail} FAIL ===\n`); process.exit(1); }
  const [px, py] = P, kP = py * W + px;
  const R1 = RING[0], R2 = RING[1];
  const keyOfRaw = (c) => rawTrees(c[0], c[1])[0].seedKey;
  const eR1 = rawTrees(R1[0], R1[1])[0], eR2 = rawTrees(R2[0], R2[1])[0], eC3 = rawTrees(C3[0], C3[1])[0], eP = rawTrees(px, py)[0];

  // ── 장부 무대 — R2 는 오래전에 베어 다 자랐다(장부 성목) · R1·C3 는 길이 오르는 날 벤다(그루터기) ─────────
  const D0 = 1000;
  clock(D0);
  H._t325CutTreeAt(R2[0], R2[1]);
  const D1 = D0 + stageDays(eR2).full + 1;
  clock(D1);
  pre(stand(R2[0], R2[1]).some((e) => e.seedKey === eR2.seedKey && e.type === 'tree') && H.harvestedSeeds.get(eR2.seedKey) === D0,
    `R2 — ${D0}일에 벤 자리가 ${D1}일엔 다시 다 자랐다(장부 씨 · T122 성목)`);
  H._t325CutTreeAt(R1[0], R1[1]); H._t325CutTreeAt(C3[0], C3[1]);
  pre(idx(R1[0], R1[1], D1).some((e) => e.type === 'stump') && idx(C3[0], C3[1], D1).some((e) => e.type === 'stump'), `R1·C3 — ${D1}일에 벴다(그루터기)`);
  //   둘레 밖(체비쇼프 3~6) 나무를 더 벤다 — 반은 D0(다 자란다) · 반은 D1(그루터기) ⇒ ⓒ 의 "술어 밖" 대조가 장부 씨를 여러 단계로 든다
  const outCut = [];
  for (let y = py - 6; y <= py + 6; y++) for (let x = px - 6; x <= px + 6; x++) {
    const dch = Math.max(Math.abs(x - px), Math.abs(y - py));
    if (dch < 3 || (x === C3[0] && y === C3[1]) || !rawTrees(x, y).length) continue;
    outCut.push([x, y]);
  }
  clock(D0); for (let i = 0; i < outCut.length; i += 2) H._t325CutTreeAt(outCut[i][0], outCut[i][1]);
  clock(D1); for (let i = 1; i < outCut.length; i += 2) H._t325CutTreeAt(outCut[i][0], outCut[i][1]);
  pre(outCut.length >= 10, `둘레 밖 나무 ${outCut.length}그루를 벴다(${D0}일 반 · ${D1}일 반) — ⓒ 대조용`);
  const ringStanding = () => { const s = new Set(); for (let y = py - 2; y <= py + 2; y++) for (let x = px - 2; x <= px + 2; x++) if (x !== px || y !== py) for (const e of stand(x, y)) s.add(e.seedKey + ':' + e.type); return s; };
  const ringStumps = (d) => { let n = 0, s = 0; for (let y = py - 2; y <= py + 2; y++) for (let x = px - 2; x <= px + 2; x++) for (const e of idx(x, y, d)) { if (e.type === 'stump') n++; else if (e.type === 'sapling') s++; } return { stump: n, sap: s }; };
  const before = ringStanding();

  // ── ⓑ 흙길(등급 1) — 종전 그대로 ────────────────────────────────────────────────────────────
  console.log('\nⓑ·ⓖ 다져진 길 — 오르는 그 호출 · 둘레 · 풀림');
  let lv = 0; for (let i = 0; i < 27; i++) lv = R.stampCell(px, py);
  ok(lv === 1 && !S.paved.has(kP) && !H.regrowBlockedAt(R1[0], R1[1]) && idx(R1[0], R1[1], D1).some((e) => e.type === 'stump') && stand(px, py).length === 1,
    '★ⓑ 흙길(등급 1)은 **종전 그대로** — 술어 거짓 · 둘레 벤 자리는 그루터기 · 길 셀 나무도 그대로', `등급 ${lv} · v ${S.cells.get(kP) && S.cells.get(kP).v}`);
  const st0 = Object.assign({}, H._t566Stat);
  lv = R.stampCell(px, py);
  // ── ⓖ 오르는 그 호출 ──
  const pIdx = idx(px, py, D1);
  ok(lv === 2 && S.paved.has(kP) && pIdx.length === 0 && stand(px, py).length === 0 && H.harvestedSeeds.get(eP.seedKey) === D1,
    '★★ⓖ 등급 2 로 오르는 **그 호출**에 그 셀의 나무·묘목·그루터기 0 — 안 벤 씨는 장부에 그날로(답 \'gone\')', `등급 ${lv} · 색인 ${pIdx.map((e) => e.type).join(',') || '0'} · 장부 ${H.harvestedSeeds.get(eP.seedKey)}`);
  ok(dbDay(eP.seedKey) === D1, '★ⓖ 장부는 DB 에도 그날로(문 하나 `_markHarvested`)', `${dbDay(eP.seedKey)}`);
  const after = ringStanding();
  const lost = [...before].filter((x) => !after.has(x)), added = [...after].filter((x) => !before.has(x));
  ok(before.size >= 3 && lost.length === 0 && added.length === 0,
    '★★ⓖ 둘레 25셀의 **서 있던 나무는 그대로**(안 벤 나무 · 다 자란 장부 성목 R2 까지)', `${before.size}그루 → ${after.size} · 빠짐 ${lost.length} · 생김 ${added.length}`);
  ok(!H.harvestedSeeds.has(eR2.seedKey) && after.has(eR2.seedKey + ':tree'),
    '★ⓖ 다 자란 장부 성목(R2)은 그날 장부에서 지운다(T341 되살림 문 그대로) — 그래야 막힌 동안에도 서 있다', `장부 ${H.harvestedSeeds.has(eR2.seedKey) ? '남음' : '지움'}`);
  const rs1 = ringStumps(D1);
  ok(rs1.stump === 0 && rs1.sap === 0 && !idx(R1[0], R1[1], D1).length && H.harvestedSeeds.get(eR1.seedKey) === D1,
    '★★ⓑ 둘레 벤 자리는 **그루터기도 없다**(\'stump\' 0 · 묘목 0) — 장부 씨는 그대로(벤 날 그대로)', `그루터기 ${rs1.stump} · 묘목 ${rs1.sap} · R1 장부 ${H.harvestedSeeds.get(eR1.seedKey)}`);
  const sd = H._t566Stat;
  ok(sd.paved - st0.paved === 1 && sd.ringNew - st0.ringNew === 24 && sd.ringKeep - st0.ringKeep >= 1 && sd.t426Skip === 0,
    '★ⓖ 계수 — 오름 1번 · 새로 막힌 둘레 24셀 · 장부 성목 지움 ≥1 · T426 갈래 0', `오름 ${sd.paved - st0.paved} · 둘레 ${sd.ringNew - st0.ringNew} · 지움 ${sd.ringKeep - st0.ringKeep} · 내림 ${sd.ringDrop - st0.ringDrop} · T426 ${sd.t426Skip}`);
  //   되살림 문 — 막힌 셀의 씨는 되살리지 않는다(장부 그대로) · 대조: 둘레 밖 C3 는 되살린다
  ok(H._t341Unharvest(eR1.seedKey) === 0 && H.harvestedSeeds.has(eR1.seedKey), '★ⓑ 되살림(`_t341Unharvest`)도 같은 술어 — 막힌 셀의 장부는 안 지운다');
  // ── 날이 간다 — 둘레 벤 자리는 묘목·성목이 안 된다 · 둘레 밖(C3)은 종전대로 ──
  const D2 = D1 + stageDays(eR1).sap, D3 = D1 + Math.max(stageDays(eR1).full, stageDays(eC3).sap) + 1;
  clock(D2);
  const c3s = idx(C3[0], C3[1], D2).map((e) => e.type), c3want = CH.regrowStageOf('tree', D2 - D1, eC3.sp || null);
  ok(!idx(R1[0], R1[1], D2).length && ringStumps(D2).sap === 0 && c3s.includes(c3want),
    `★★ⓑ ${D2}일(R1 묘목 날) — 둘레 벤 자리 묘목 0 · 둘레 밖 C3 는 종전대로 ${c3want}`, `R1 ${idx(R1[0], R1[1], D2).map((e) => e.type).join(',') || '없음'} · C3 ${c3s.join(',')}`);
  clock(D3);
  ok(!idx(R1[0], R1[1], D3).length && ringStumps(D3).stump === 0, `★ⓑ ${D3}일(R1 성목 날 뒤) — 그래도 0(재생이 막혔다 · 그루터기도 없다)`);

  // ── ⓒ 막히지 않은 셀의 답은 씨 단위로 같다 — 같은 장부를 술어 없이(`new Map`) 넘긴 생성과 대조 ─────────────
  console.log('\nⓒ 술어 밖은 씨 단위로 같다');
  {
    const plain = new Map(H.harvestedSeeds);   // 같은 장부 · 술어 없음(= 끔과 같은 답)
    const J = (a) => JSON.stringify(a);
    const qx0 = Math.floor(px / cpc) - 1, qy0 = Math.floor(py / cpc) - 1;
    let cellsSame = 0, cellsBlocked = 0, bad = 0, badBlocked = 0, ents = 0, droppedTree = 0, droppedOther = 0, nonTree = 0, ledOut = 0;
    const byCell = (list) => { const m = new Map(); for (const e of list) { const c = Math.floor(e.x / 32) + ',' + Math.floor(e.y / 32); const a = m.get(c); if (a) a.push(e); else m.set(c, [e]); } return m; };
    for (let qy = qy0; qy <= qy0 + 2; qy++) for (let qx = qx0; qx <= qx0 + 2; qx++) {
      if (qx < 0 || qy < 0) continue;
      const A = byCell(CH.generateChunkResources(ZID, Zc.biome, qx, qy, CH.CHUNK_SIZE, H.harvestedSeeds, D3));
      const B = byCell(CH.generateChunkResources(ZID, Zc.biome, qx, qy, CH.CHUNK_SIZE, plain, D3));
      for (const [c, b] of B) {
        const a = A.get(c) || []; ents += b.length;
        for (const e of b) if (e.type !== 'tree' && e.type !== 'sapling' && e.type !== 'stump') nonTree++;
        const ci = c.indexOf(','), cx = +c.slice(0, ci), cy = +c.slice(ci + 1);
        if (!H.regrowBlockedAt(cx, cy)) { cellsSame++; for (const e of b) if (e.regrown) ledOut++; if (J(a) !== J(b)) bad++; continue; }
        cellsBlocked++;
        //   막힌 셀 — 술어가 뺀 것은 "장부의 나무 씨"뿐이어야 한다(그 밖은 차례까지 같다)
        const keep = b.filter((e) => !(H.harvestedSeeds.has(e.seedKey) && (e.type === 'tree' || e.type === 'sapling' || e.type === 'stump')));
        for (const e of b) if (!keep.includes(e)) { if (e.type === 'tree' || e.type === 'sapling' || e.type === 'stump') droppedTree++; else droppedOther++; }
        if (J(a) !== J(keep)) badBlocked++;
      }
      for (const c of A.keys()) if (!B.has(c)) bad++;
    }
    ok(cellsSame > 500 && ents > 1000 && ledOut >= 10 && bad === 0, '★★ⓒ 술어가 안 막은 셀 — 술어 없는 생성과 **JSON 통째 같다**(장부 씨 단위 · 차례까지)', `${cellsSame}칸 · 어긋남 ${bad} · 개체 ${ents} · 그중 다시 자라는 장부 씨 ${ledOut}`);
    ok(cellsBlocked >= 2 && badBlocked === 0 && droppedTree >= 2 && droppedOther === 0,
      '★★ⓒ 막힌 셀 — 빠진 것은 **장부의 나무 씨**뿐(덤불·풀·군락 무접촉 · 카드 ④) · 남은 것은 차례까지 같다', `${cellsBlocked}칸 · 빠진 나무 씨 ${droppedTree} · 빠진 그 밖 ${droppedOther} · 어긋남 ${badBlocked} · (대조 군 채집 개체 ${nonTree})`);
  }

  // ── ⓑⓖ 풀림 — 다져진 길이 감쇠로 등급 2 아래 → 그 셀과 둘레가 풀린다(벤 날 = 풀린 날) ─────────────
  {
    const st1 = Object.assign({}, H._t566Stat);
    const rP = S.cells.get(kP);
    const tNow = Math.floor((Date.now() - S.epoch) / S.dayMs);
    rP.d = tNow - 60;                                   // 60일 묵은 길(28 × 0.995^60 ≈ 20.7 < T2) — 감쇠식은 `roads.js` 그대로
    S.lastDay = -1; R.onGameTick(Date.now());           // 하루 경계(`_rebuildCoarse` — 내림을 재는 그 자리)
    const rel = H._t566Stat;
    ok(!S.paved.has(kP) && !H.regrowBlockedAt(R1[0], R1[1]) && rel.unpaved - st1.unpaved === 1 && rel.released - st1.released === 25,
      '★★ⓖ 등급 2 아래로 내려가면 **풀린다** — 그 셀과 둘레 25셀', `내림 ${rel.unpaved - st1.unpaved} · 풀린 셀 ${rel.released - st1.released} · 장부 씨 ${rel.relSeeds - st1.relSeeds}`);
    ok(H.harvestedSeeds.get(eR1.seedKey) === D3 && dbDay(eR1.seedKey) === D3 && H.harvestedSeeds.get(eP.seedKey) === D3,
      '★★ⓑ 풀린 셀의 장부 벤 날 = **풀린 날**(메모리·DB) — 길 셀(P)과 둘레(R1) 둘 다', `R1 ${D1} → ${H.harvestedSeeds.get(eR1.seedKey)}(DB ${dbDay(eR1.seedKey)}) · P → ${H.harvestedSeeds.get(eP.seedKey)}`);
    const r1Now = idx(R1[0], R1[1], D3).map((e) => e.type);
    ok(r1Now.includes('stump') && !r1Now.includes('tree'),
      `★★ⓑ 풀린 날(${D3}일)엔 **그루터기부터** — 벤 날을 안 바꿨으면 이미 성목이다(미끼: ${CH.regrowStageOf('tree', D3 - D1, eR1.sp || null)})`, r1Now.join(','));
    const D4 = D3 + stageDays(eR1).sap;
    clock(D4);
    ok(idx(R1[0], R1[1], D4).some((e) => e.type === 'sapling') && stand(R1[0], R1[1]).some((e) => e.type === 'sapling'),
      `★ⓑ 풀린 날부터 묘목 날(${D4}일) — 재생 재개(T122 시계 · 제품 창구도 묘목)`);
  }

  // ── ⓕ 숲 격자 틈 불변식 — 식 하나(값 판정 0 · 밀도 손잡이를 누가 조여도 이 줄이 먼저 빨개진다) ─────────────
  console.log('\nⓕ 숲 격자 틈 — 최소 간격에서 몸 하나가 지난다');
  {
    const CS = codeOnly(fs.readFileSync(path.join(ROOT, 'server', 'chunk.js'), 'utf8'));
    const ZS = codeOnly(fs.readFileSync(path.join(ROOT, 'server', 'zone.js'), 'utf8'));
    const num = (src, name) => { const m = new RegExp(`(?:const|,)\\s*${name}\\s*=\\s*(\\d+(?:\\.\\d+)?)`).exec(src); return m ? +m[1] : NaN; };
    const SPMIN = num(CS, 'FOREST_SP_MIN'), PLANT_R = num(ZS, 'PLANT_R'), TRUNK = num(ZS, 'TRUNK_COLLIDER_MAX'), BODY_R = num(ZS, 'PLAYER_BODY_R');
    const CELL_PX = 32;                                  // 1셀 = 1m(캐논 §16 · 셀 크기 정본 = 32px)
    const gap = (sp) => sp - 2 * Math.max(PLANT_R, TRUNK);
    const body = Math.max(2 * BODY_R, 0.5 * CELL_PX);
    pre([SPMIN, PLANT_R, TRUNK, BODY_R].every(Number.isFinite) && CH.forestSpacing(1e9) === SPMIN,
      `정본에서 읽은 수 — FOREST_SP_MIN ${SPMIN} · PLANT_R ${PLANT_R} · 줄기 콜라이더 상한 ${TRUNK} · 몸 반지름 ${BODY_R} · forestSpacing(최대 밀도) ${CH.forestSpacing(1e9)}`);
    ok(gap(SPMIN) >= body, '★★ⓕ 숲 격자 최소 간격에서 이웃 줄기 콜라이더 사이 틈 ≥ 몸 지름(0.5m) — `SP_MIN − 2·max(PLANT_R, 줄기 상한) ≥ max(2·몸 반지름, 0.5m)`',
      `${SPMIN} − 2·${Math.max(PLANT_R, TRUNK)} = ${gap(SPMIN)}px ≥ ${body}px`);
    ok(!(gap(30) >= body), '★ⓕ 미끼 — 간격을 30px 로 조이면 같은 식이 **빨갛다**(자명 통과 아님)', `30 − 2·${Math.max(PLANT_R, TRUNK)} = ${gap(30)}px < ${body}px`);
    //   (표만) 지터 — 격자점마다 칸 안에서 흔들려(`j1·SP`) 실제 이웃 거리는 SP 보다 가까울 수 있다 · 그 몫을 잰다(판정 0)
    let pairs = 0, tight = 0, minD = Infinity;
    const list = CH.generateChunkResources(ZID, Zc.biome, Math.floor(px / cpc), Math.floor(py / cpc), CH.CHUNK_SIZE, new Map(), 0).filter((e) => e.type === 'tree' && /_ft/.test(e.seedKey));
    for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) {
      const d = Math.hypot(list[i].x - list[j].x, list[i].y - list[j].y);
      if (d > 2 * SPMIN) continue;
      pairs++; if (d < minD) minD = d;
      if (d - Math.min(TRUNK, list[i].r || TRUNK) - Math.min(TRUNK, list[j].r || TRUNK) < 2 * BODY_R) tight++;
    }
    console.log(`  · [표] 이 숲 청크 격자 나무 ${list.length} · 이웃쌍(${2 * SPMIN}px 안) ${pairs} · 몸(${2 * BODY_R}px)이 못 지나는 쌍 ${tight}(${pairs ? (100 * tight / pairs).toFixed(1) : 0}%) · 가장 가까운 줄기 ${minD.toFixed(1)}px — 지터 몫(판정 0)`);
  }

  // ── ⓘ 정적 — 답 넷 · 같은 술어 · 손잡이 하나 · 새 수 0 ─────────────────────────────────────────────
  console.log('\nⓘ 정적 — 답 넷이 같은 술어');
  {
    const CS = codeOnly(fs.readFileSync(path.join(ROOT, 'server', 'chunk.js'), 'utf8'));
    const ZS = codeOnly(fs.readFileSync(path.join(ROOT, 'server', 'zone.js'), 'utf8'));
    const RS = codeOnly(fs.readFileSync(path.join(ROOT, 'server', 'roads.js'), 'utf8'));
    const VS = codeOnly(fs.readFileSync(path.join(ROOT, 'server', 'villages.js'), 'utf8'));
    const body = (src, name) => { const i = src.indexOf(`function ${name}(`); if (i < 0) return ''; const j = src.indexOf('\nfunction ', i + 10); return src.slice(i, j < 0 ? undefined : j); };
    const gen = body(CS, 'generateChunkResources');
    ok((gen.match(/_treeStage\(seedKey/g) || []).length === 2 && /harvestedSet\.regrowGate/.test(gen)
       && (gen.match(/_stage\(seedKey, G\.type, null\)|_stage\(seedKey, kind, null\)|_stage\(seedKey, type, null\)/g) || []).length === 4,
      '★ⓘ 시더 — 나무 두 갈래(흩뿌림 · 숲 격자)만 술어를 묻는다 · 덤불·풀·군락 세 갈래는 종전 `_stage` 그대로(무접촉)');
    ok(/if \(_T566_ON\) harvestedSeeds\.regrowGate = /.test(ZS) && /regrowBlockedAt\(c\.cx, c\.cy\)/.test(body(ZS, '_t341Unharvest'))
       && !/regrowBlockedAt/.test(body(ZS, '_shapeRegrown')) && /_idxAtCell/.test(body(ZS, '_actEntitiesAtCell')),
      '★ⓘ 답 넷 — 시더(장부가 들고 가는 술어) · 색인(같은 생성기) · 되살림(막힌 셀 0) · 심은 것(`_shapeRegrown` — **안 묻는다** · 카드 ④)');
    const rb = body(ZS, 'regrowBlockedAt');
    ok(/SimVillages\.villageOfCell/.test(rb) && /Roads\.pavedNear\(cx \| 0, cy \| 0, _T566_R\)/.test(rb) && /const _T566_R = 2;/.test(ZS)
       && /const T1 = 8, T2 = 28, VMAX = 120, DK = 0\.995;/.test(RS) && /lv === 2 && !S\.paved\.has\(k\)/.test(body(RS, 'stampCell')),
      '★ⓘ 술어 = 영토(`villageOfCell` 정본) ∪ 다져진 길(`T2`=28 그대로 · 오름은 `stampCell` 그 호출) 둘레 2 — 새 수 0');
    ok(/const _T566_ON = process\.env\.T566_REGROW_BLOCK !== '0';/.test(ZS) && /state\.deps\.clearTreesInCells\(own, added\)/.test(body(VS, '_terrGrow')),
      '★ⓘ 손잡이 하나(`T566_REGROW_BLOCK` · 기본 켬 · `=0` 종전) · 영토가 자란 날 늘어난 셀을 같이 넘긴다');
  }

  // ══ 자식들 — 입력 DB 가 있을 때만 ═══════════════════════════════════════════════════════════════════
  const { spawnSync } = require('child_process');
  const cpDb = (from, to) => { rmDb(to); for (const x of ['', '-wal', '-shm']) { try { fs.copyFileSync(from + x, to + x); } catch (e) {} } };
  const child = (args, ms) => {
    const o = `/tmp/test-regrow-block-o-${process.pid}-${Math.random().toString(36).slice(2)}.json`;
    const t = Date.now();
    const env = Object.assign({}, process.env); delete env.T566_REGROW_BLOCK;
    spawnSync(process.execPath, [__filename].concat(args.slice(0, 1), [args[1], o], args.slice(2)), { cwd: ROOT, stdio: 'ignore', timeout: ms, env });
    let r = null; try { r = JSON.parse(fs.readFileSync(o, 'utf8')); } catch (e) { r = { err: 'no json (시간 초과?)' }; }
    try { fs.unlinkSync(o); } catch (e) {}
    r.wallS = Math.round((Date.now() - t) / 1000); return r;
  };

  console.log('\nⓐⓓⓔ 40일 판 — 부팅 없이 첫 묘목·첫 성목 날 · econ n일씩');
  const W40 = process.env.T566_W40 || '';
  if (!W40 || !fs.existsSync(W40)) skip('`T566_W40=<40일 DB>`(T378 게이트 판) 가 없다 — ⓐⓓⓔ 를 안 잰다');
  else {
    const dOn = `/tmp/test-regrow-block-w40on-${process.pid}.db`, dOff = `/tmp/test-regrow-block-w40off-${process.pid}.db`, dNc = `/tmp/test-regrow-block-w40nc-${process.pid}.db`;
    cpDb(W40, dOn); cpDb(W40, dOff); cpDb(W40, dNc);
    const ON = child(['--w40', dOn, 'on'], 1800000), OFF = child(['--w40', dOff, 'off'], 1800000);
    const NC = child(['--w40', dNc, 'on', 'nocap'], 1800000);   // ⓔ — 영토가 자라는 팔(상한 끔)
    rmDb(dNc);
    pre(!ON.err && !OFF.err && ON.windows && OFF.windows, `자식 둘 — 켬 ${ON.wallS}초 · 끔 ${OFF.wallS}초 · 영토 장부 나무 씨 ${ON.terrLedger} · 창 ${(ON.days || []).join('·')}일`, ON.err || OFF.err || '');
    if (ON.windows && OFF.windows) {
      for (let i = 0; i < ON.windows.length; i++) {
        const a = ON.windows[i], b = OFF.windows[i];
        if (a.err || b.err) { pre(false, `창 ${i}`, a.err || b.err); continue; }
        const nOn = (w) => w.tree + w.sap + w.stump;
        pre(nOn(b.before) + nOn(b.after) > 0, `(대조 · 끔) ${b.day}일 — 영토 안 다시 선 것: 창 앞 성목 ${b.before.tree}·묘목 ${b.before.sap}·그루터기 ${b.before.stump} → econ ${b.econ.join('→')} 뒤 ${b.after.tree}·${b.after.sap}·${b.after.stump} · 멎은 마을 ${b.still.n}곳(${b.still.tree + b.still.sap}그루) · 자란 마을 ${b.grewN}`);
        ok(nOn(a.before) === 0 && nOn(a.after) === 0 && a.still.tree + a.still.sap + a.still.stump === 0,
          `★★ⓐ ${a.day}일 — 영토 안 서 있는 것 **0**(성목·묘목·그루터기 · 창 앞/econ ${a.econ.join('→')} 뒤 · 멎은 마을 ${a.still.n}곳 포함)`,
          `켬 ${a.before.tree}/${a.before.sap}/${a.before.stump} → ${a.after.tree}/${a.after.sap}/${a.after.stump} · 영토 ${a.after.cells}칸 · 끔이면 ${b.before.tree + b.before.sap} → ${b.after.tree + b.after.sap}`);
      }
      const s = ON.stat || {};
      ok(s.t426Skip === 0, '★ⓐ T426 다시 벰 갈래 — 막힌 셀에서 0(술어가 막아 올 일이 없다 · 다음 카드에서 걷는다)', `건너뜀 ${s.t426Skip} · 부팅 다시 훑기 적지 않은 셀 ${s.recutSkip}`);
      //   ⓔ — 영토가 자라는 팔(NPC 영토 상한 끔 · 같은 입력 DB)
      const sn = NC.stat || {};
      pre(!NC.err && sn.growCalls > 0, `ⓔ 팔(상한 끔) — ${NC.wallS}초 · 영토가 자란 날 ${sn.growCalls}번`, NC.err ? String(NC.err).slice(0, 200) : '');
      ok(sn.growCalls > 0 && sn.growNew > 0 && sn.growNew * 10 < sn.growOwn && sn.t426Skip === 0,
        '★★ⓔ 영토가 자란 날 훑은 셀 = **그날 늘어난 셀**(전체 아님)', `${sn.growCalls}번 · 늘어난 ${sn.growNew}칸만 훑음 · (그날 그 마을 영토 합 ${sn.growOwn}칸 — T440 이면 그만큼 · ${sn.growOwn ? (sn.growOwn / Math.max(1, sn.growNew)).toFixed(0) : '?'}배)`);
      if (NC.windows) for (const a of NC.windows) if (!a.err) {
        ok(a.before.tree + a.before.sap + a.before.stump === 0 && a.after.tree + a.after.sap + a.after.stump === 0,
          `★ⓐ(자라는 팔) ${a.day}일 — 영토 안 서 있는 것 0 · 자란 마을 ${a.grewN}곳 · 영토 ${a.before.cells} → ${a.after.cells}칸`, `${a.before.tree}/${a.before.sap}/${a.before.stump} → ${a.after.tree}/${a.after.sap}/${a.after.stump}`);
      }
      const pl = ON.planted;
      ok(!!pl && pl.afterSweep && pl.keepStat >= 1 && pl.type === 'tree' && pl.alive,
        '★★ⓓ 영토 안에 심은 묘목 — 개간(부팅과 같은 문)이 안 벤다 · 성목 날에 **성목**(심은 것은 재생이 아니다 · 카드 ④)', pl ? `${pl.vil} ${pl.cell} · 개간이 보고 비켰다 ${pl.keepStat} · 개간 뒤 ${pl.afterSweep ? '서 있다' : '없다'} · ${pl.matureDay}일 ${pl.type}` : '못 심었다');
      //   같은 DB 를 **다시 띄운다**(부팅 개간 · 시계는 부팅 틱에) — 영토 안 서 있는 것 0 · 심은 나무가 산다
      const day = (ON.windows[ON.windows.length - 1] || {}).day;
      if (Number.isFinite(day)) {
        const RB = child(['--reboot', dOn, String(day)].concat(pl ? [JSON.stringify(pl)] : []), 1200000);
        ok(!RB.err && RB.tree + RB.sap + RB.stump === 0 && (!pl || (RB.planted && RB.planted.alive)),
          '★★ⓐ 같은 DB 를 다시 띄워도 영토 안 서 있는 것 0 · 심은 나무가 산다(부팅 개간이 안 벤다)', RB.err ? String(RB.err).slice(0, 200)
            : `${RB.tree}/${RB.sap}/${RB.stump} · ${RB.cells}칸 · 부팅 ${Math.round(RB.bootMs / 1000)}초 · 심은 나무 ${RB.planted ? RB.planted.type : '—'} · 다시 훑기 줄 ${RB.recut}`);
      }
    }
    rmDb(dOn); rmDb(dOff);
  }

  console.log('\nⓐ′ⓗ 서울 사본 — 부팅 뒤 막힌 셀 · 길 등급 표');
  const SEOUL = process.env.T538_DB || '';
  if (!SEOUL || !fs.existsSync(SEOUL)) skip('`T538_DB=<서울 사본>` 이 없다 — ⓐ′ⓗ 를 안 잰다');
  else {
    const dS = `/tmp/test-regrow-block-seoul-${process.pid}.db`;
    cpDb(SEOUL, dS);
    const SO = child(['--seoul', dS, 'on'], 2400000);
    rmDb(dS);
    pre(!SO.err, `서울 사본 부팅 — ${SO.wallS}초(부팅 ${SO.bootMs ? Math.round(SO.bootMs / 1000) : '?'}초) · 마을 ${SO.vils}`, SO.err ? String(SO.err).slice(0, 300) : (SO.bootLines || []).join(' | ').slice(0, 300));
    if (!SO.err) {
      ok(SO.terr.tree + SO.terr.sap + SO.terr.stump === 0 && SO.paved.tree + SO.paved.sap + SO.paved.stump === 0,
        '★★ⓐ′ 서울 사본 부팅 뒤 막힌 셀 안 서 있는 것 **0** — 영토 · 다져진 길 셀(성목·묘목·그루터기)',
        `영토 ${SO.terr.cells}칸 ${SO.terr.tree}/${SO.terr.sap}/${SO.terr.stump} · 다져진 길 ${SO.paved.cells}칸 ${SO.paved.tree}/${SO.paved.sap}/${SO.paved.stump}`);
      const r = SO.roads;
      console.log(`  · [표 ⓗ] 서울 사본 \`roads\` 표 ${r.rows}행 — 등급별 셀 수(v≥1 밟힘 · ≥8 흙길 · ≥28 다져진 길): 표의 마지막 날(${r.dbLast}) ${r.atDbLast.join(' / ')} · 저장 v 그대로 ${r.stored.join(' / ')} · 오늘 부팅(${r.bootDay}) ${r.atBoot.join(' / ')} · 다져진 길 집합 ${r.pavedSet} · 꺼진 사이 풀린 셀 ${r.bootUnpaved}`);
      const g = SO.gone;
      console.log(`  · [표] 첫 부팅 — 길만 막은 둘레 ${g.cells}칸의 장부 나무 씨가 'gone' 이 된다: 그루터기 ${g.stump} · 묘목 ${g.sapling} · 성목 ${g.mature}(다 자라 서 있던 것 — 오름 사건이 아니라 부팅이라 가리지 않는다 · 회부)`);
      ok(SO.stat && SO.stat.t426Skip === 0, '★ⓐ′ 서울 사본 — T426 다시 벰 갈래 0', `${SO.stat && SO.stat.t426Skip}`);
    }
  }

  console.log(`\n=== 결과: ${pass} PASS / ${fail} FAIL ===\n`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('하네스 크래시:', e); process.exit(1); });
