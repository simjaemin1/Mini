#!/usr/bin/env node
// @regress   ← 통합 러너가 이 표를 보고 자기 목록을 만든다(scripts/run-regress.sh · 표 없으면 안 돈다)
// === scripts/test-recut.js — 개간이 다시 벤다 (T426 · PM #74) =================================
//
// ★왜 [T398 §1-1 → T426] 개간(`clearTreesInCells`)은 **한 번만** 벴다 — 색인 갈래가 장부 씨를 건너뛰고
//   (`harvestedSeeds.has → continue`) 성목만 봤다. 그래서 영토 안 그루터기가 T122 대로 돌아와 다시 서도
//   한 그루도 안 벴다. 그리고 DB 는 `INSERT OR IGNORE` 라 다시 벤 날이 **메모리에만** 적혔다(T378 §1-4).
//   PM 판정(#74): **서 있으면 벤다 — 묘목까지**(영토는 마을이 개간한 땅 · 술어 0).
// ★이 하네스가 지키는 것
//   ① 다시 선 **묘목**을 다시 벤다 — 장부 날이 **그날로** 간다(메모리 · DB 둘 다)
//   ② 다시 선 **성목**도 같다
//   ③ ★대조 — **그루터기**는 안 선 것이다: 다시 적지 않는다(DB 날 그대로 · 벤 수 0) ⇒ ①② 가 자명 통과가 아니다
//   ④ **심은 묘목**(DB 나무)도 벤다 — 종·단계 무관(PM 판정)
//   ⑤ 정적 — DB 가 갱신 문법이다 · 부팅 갈래는 시계가 선 뒤 **같은 문으로** 한 번 더 훑는다 · 벨 종류는 나무꾼과 한 집합
//
// ⚠존을 **이 프로세스 안에서** 띄운다(`test-ghost-tree` 문법 · `Zone.__testBind`). 가짜 플레이어는 **`players` 에 안 넣는다**
//   (관측자 0 — 넣으면 그 자리 청크가 켜져 색인 대신 개체 갈래를 탄다). 시계 손잡이(`__e2e_clock`)는 객체를 직접 받는다.
// 실행: node scripts/test-recut.js
'use strict';
const path = require('path');
const fs = require('fs');
const ROOT = path.join(__dirname, '..');
const codeOnly = require('./code-only.js');   // ★[T171] 주석 제거기 정본(사본 0)

let pass = 0, fail = 0;
const ok = (c, m, x) => { c ? pass++ : fail++; console.log((c ? '  ✓ ' : '  ✗ ') + m + (x !== undefined && x !== '' ? `  ${x}` : '')); };
const pre = (c, m, x) => { if (!c) { fail++; console.log('  ✗ [상황] ' + m + (x !== undefined ? `  ${x}` : '')); } else console.log('  · [상황] ' + m + (x !== undefined ? `  ${x}` : '')); };

(async () => {
  console.log('\n=== 개간이 다시 벤다 — 서 있으면 벤다(묘목까지) (T426) ===\n');
  const TMP = `/tmp/test-recut-${process.pid}.db`;
  for (const f of [TMP, TMP + '-wal', TMP + '-shm']) { try { fs.unlinkSync(f); } catch (e) {} }
  process.on('exit', () => { for (const f of [TMP, TMP + '-wal', TMP + '-shm']) { try { fs.unlinkSync(f); } catch (e) {} } });
  process.env.ZONE_ID = 'hanbando';
  process.env.PORT = String(39100 + (process.pid % 200));
  process.env.DB_PATH = TMP;
  process.env.ENABLE_VILLAGES = '0'; process.env.ENABLE_WILDLIFE = '0';
  process.env.ENABLE_BANDITS = '0'; process.env.ENABLE_ROADS = '0';
  process.env.E2E_GIVE = '1';                        // `__e2e_clock` 분기(테스트 전용 · 이미 있는 손잡이)
  const _l = console.log, _w = console.warn, _e = console.error;
  console.log = () => {}; console.warn = () => {}; console.error = () => {};
  const Zone = require(path.join(ROOT, 'server', 'zone.js'));
  const _mute = (f) => (...a) => { if (typeof a[0] === 'string' && /^\[hanbando\]|^\s{4,}biome=/.test(a[0])) return; f(...a); };
  console.log = _mute(_l); console.warn = _mute(_w); console.error = _mute(_e);
  const H = Zone.__testBind();
  const me = { pid: 'p_recut', playerId: 'tr_recut', name: 'recut', persistent: false,
    ws: { readyState: 1, send: () => {} }, x: 0, y: 0, vx: 0, vy: 0, floor: 0, hp: 100, maxHp: 100, hunger: 100, thirst: 100,
    inventory: {}, toolItems: [], equipment: [], equipSlots: {}, lots: {}, isNpc: false, isDown: false, tribeId: null, lastSeen: Date.now() };
  const clock = (day) => H.handlePlayerInput(me, JSON.stringify({ type: '__e2e_clock', day, night: false }));
  const dbDay = (k) => { const r = H.db.getAllHarvestedSeeds().find((x) => x.seed_key === k); return r ? r.harvested_day : null; };
  const standing = (cell) => (H._t325TreesAtCell(cell[0], cell[1]) || []).filter((e) => e.isSeed);   // 제품 창구(관측자 0 ⇒ 색인)

  // ── 자리 — 존 안 숲 청크에서 씨 나무가 선 셀을 **세계에 물어서** 고른다(족보 73 · 수를 안 적는다) ─────────
  const CH = require(path.join(ROOT, 'server', 'chunk.js'));
  const TR = require(path.join(ROOT, 'server', 'trees.js'));
  const YD = require(path.join(ROOT, 'server', 'events.js')).yearDaysOf();
  const Z = require(path.join(ROOT, 'server', 'zone-config.js')).ZONES.hanbando;
  const cells = [];
  const nC = Math.min(Math.floor(Z.zoneWidth / CH.CHUNK_SIZE), Math.floor(Z.zoneHeight / CH.CHUNK_SIZE));
  for (let k = 0; k < nC && cells.length < 3; k++) {
    const rows = CH.generateChunkResources('hanbando', Z.biome, k, k, CH.CHUNK_SIZE, new Set(), 0) || [];
    for (const r of rows) {
      if (r.type !== 'tree' || !r.isSeed || !r.seedKey) continue;
      const c = [Math.floor(r.x / 32), Math.floor(r.y / 32)];
      if (cells.some((q) => q[0] === c[0] && q[1] === c[1])) continue;
      const here = CH.resourcesAtCell('hanbando', c[0], c[1], { biome: Z.biome, chunkSize: CH.CHUNK_SIZE });
      if (here.filter((e) => e.type === 'tree').length !== 1) continue;   // 한 셀에 한 그루 — 셈이 흔들리지 않게
      cells.push(c);
      if (cells.length >= 3) break;
    }
  }
  pre(cells.length === 3, '존 안 숲 셀 셋(각각 씨 나무 한 그루)', cells.map((c) => c.join(',')).join(' · '));
  if (cells.length < 3) { console.log(`\n=== 결과: ${pass} PASS / ${fail} FAIL ===\n`); process.exit(1); }
  const keyOf = (c) => c[0] + ',' + c[1];
  const seedOf = (c) => (CH.resourcesAtCell('hanbando', c[0], c[1], { biome: Z.biome, chunkSize: CH.CHUNK_SIZE }).find((e) => e.type === 'tree') || {});
  const stageDays = (c) => { const e = seedOf(c); const sp = TR.speciesAt('hanbando', Math.floor(e.x / 32), Math.floor(e.y / 32));
    const g = TR.stageYearsOf(sp, CH.REGROW.TREE_STUMP_Y(), CH.REGROW.TREE_FULL_Y()); return { sp, sap: Math.ceil(g[0] * YD), full: Math.ceil(g[1] * YD) }; };

  // ── 처음 벤다 — 셋 다 같은 날 ─────────────────────────────────────────────
  const D0 = 1000;
  clock(D0);
  pre(H.gameDayNow() === D0, `시계 ${H.gameDayNow()}`);
  const n0 = H.clearTreesInCells(new Set(cells.map(keyOf)));
  pre(n0 === 3 && cells.every((c) => dbDay(seedOf(c).seedKey) === D0), `처음 개간 — 세 그루 · 장부 날 ${D0}(DB)`, `${n0}그루`);

  // ── ① 다시 선 묘목을 다시 벤다 ─────────────────────────────────────────────
  {
    const c = cells[0], s = stageDays(c), k = seedOf(c).seedKey;
    const D1 = D0 + s.sap;                                   // 그루터기 → 묘목이 되는 첫날(정본에서 유도)
    clock(D1);
    const st = standing(c);
    pre(st.length === 1 && st[0].type === 'sapling', `① 묘목이 섰다 — 종 ${s.sp} · 벤 뒤 ${s.sap}일(T122)`, st.map((e) => e.type).join(','));
    const n = H.clearTreesInCells(new Set([keyOf(c)]));
    ok(n === 1, '★★① 다시 선 **묘목**을 다시 벤다(장부 씨라도 서 있으면)', `${n}그루`);
    ok(standing(c).length === 0, '★① 벤 뒤 그 셀엔 서 있는 것이 없다(그루터기로 돌아갔다)');
    ok(dbDay(k) === D1, '★★① DB 장부 날이 **그날**로 갔다(`INSERT OR IGNORE` 였으면 옛 날 그대로)', `${D0} → ${dbDay(k)}`);
  }
  // ── ② 다시 선 성목도 같다 ──────────────────────────────────────────────────
  {
    const c = cells[1], s = stageDays(c), k = seedOf(c).seedKey;
    const D2 = D0 + s.full;                                  // 성목이 되는 첫날
    clock(D2);
    const st = standing(c);
    pre(st.length === 1 && st[0].type === 'tree', `② 성목이 섰다 — 종 ${s.sp} · 벤 뒤 ${s.full}일`, st.map((e) => e.type).join(','));
    const n = H.clearTreesInCells(new Set([keyOf(c)]));
    ok(n === 1 && standing(c).length === 0 && dbDay(k) === D2, '★★② 다시 선 **성목**도 다시 벤다 · 장부 날이 그날로', `${n}그루 · DB ${dbDay(k)}`);
  }
  // ── ③ 대조 — 그루터기는 안 선 것이다 ───────────────────────────────────────
  {
    const c = cells[2], k = seedOf(c).seedKey;
    clock(D0 + 1);
    pre(standing(c).length === 0, '③ 그 셀은 아직 그루터기다(벤 다음날)');
    const n = H.clearTreesInCells(new Set([keyOf(c)]));
    ok(n === 0 && dbDay(k) === D0, '★★③ 대조 — **그루터기**는 다시 적지 않는다(벤 수 0 · DB 날 그대로) ⇒ ①② 는 "늘 적는다"가 아니다', `${n}그루 · DB ${dbDay(k)}`);
  }
  // ── ④ 심은 묘목(DB 나무)도 벤다 ────────────────────────────────────────────
  {
    const c = cells[2];
    me.x = c[0] * 32 + 16; me.y = c[1] * 32 + 16 + 64;
    me.inventory.acorn = 1;
    let t = null;
    for (let dy = 2; dy < 40 && !t; dy++) {
      const px = c[0] * 32 + 16, py = (c[1] + dy) * 32 + 16;
      if (H.isTerrainBlockedLocal(px, py)) continue;
      let busy = false; for (const rr of H.resources.values()) if (Math.floor(rr.x / 32) === c[0] && Math.floor(rr.y / 32) === c[1] + dy) { busy = true; break; }
      if (busy || CH.resourcesAtCell('hanbando', c[0], c[1] + dy, { biome: Z.biome, chunkSize: CH.CHUNK_SIZE }).length) continue;
      me.x = px; me.y = py; me.inventory.acorn = 1;
      t = H.tryPlantTree(me, px, py, 'acorn');
    }
    pre(!!(t && t.type === 'sapling' && t.dbId), '④ 묘목을 심었다(DB 나무)', t ? `#${t.dbId} @${Math.floor(t.x / 32)},${Math.floor(t.y / 32)}` : '못 심었다');
    if (t) {
      const n = H.clearTreesInCells(new Set([Math.floor(t.x / 32) + ',' + Math.floor(t.y / 32)]));
      ok(n === 1 && !H.resources.has(t.id) && !H.db.getResources().some((r) => r.id === t.dbId),
        '★④ **심은 묘목**도 벤다 — 종·단계 무관(PM #74) · 세계·DB 에서 빠졌다', `${n}그루`);
    }
  }
  // ── ⑤ 정적 — 문법·문 하나·집합 하나 ──────────────────────────────────────
  {
    const DBS = codeOnly(fs.readFileSync(path.join(ROOT, 'server', 'zone-local-db.js'), 'utf8'));
    ok(/INSERT INTO harvested_seeds \(seed_key, harvested_at, harvested_day\) VALUES \(\?, \?, \?\) ON CONFLICT\(seed_key\) DO UPDATE SET harvested_at = excluded\.harvested_at, harvested_day = excluded\.harvested_day/.test(DBS)
       && !/INSERT OR IGNORE INTO harvested_seeds/.test(DBS),
      '★★⑤ 장부 DB 는 **갱신 문법**이다(마지막으로 벤 날 · 이 파일의 `ON CONFLICT … DO UPDATE` 그 꼴)');
    const ZS = codeOnly(fs.readFileSync(path.join(ROOT, 'server', 'zone.js'), 'utf8'));
    const body = (name) => { const i = ZS.indexOf(`function ${name}(`); if (i < 0) return ''; const j = ZS.indexOf('\nfunction ', i + 10); return ZS.slice(i, j < 0 ? undefined : j); };
    const clr = body('clearTreesInCells'), boot = body('_recutBootOnce');
    ok(/const _T378_TREE = _T325_TYPES;/.test(ZS), '★⑤ 벨 종류 = 나무꾼이 보는 **그 집합**(`_T325_TYPES` · 서 있는 나무 — 사본 0)');
    ok(!/harvestedSeeds\.has\(/.test(clr), '★⑤ 개간이 장부를 보고 **건너뛰지 않는다**(서 있나는 색인 단계가 답한다)');
    ok(/if \(!Number\.isFinite\(_gd\)\) \{/.test(clr) && /setImmediate\(_recutBootOnce\)/.test(clr),
      '★★⑤ 부팅 갈래(날 모름)는 그 셀을 적어 두고 **시계가 선 뒤 한 번 더** 훑는다');
    ok(/_promoteHarvestOnce\(\);/.test(boot) && /clearTreesInCells\(cells\)/.test(boot),
      '★⑤ 그 한 번은 **같은 문**(`clearTreesInCells`)이다 · 옛 행(−1) 승격이 먼저(방금 벤 그루는 그루터기로 선다)');
    ok((ZS.match(/db\.insertHarvestedSeed\(/g) || []).length === 1 && /function _markHarvested\([\s\S]*?db\.insertHarvestedSeed\(/.test(ZS),
      '★⑤ 장부를 DB 에 적는 자리는 **문 하나**(`_markHarvested`)');
  }

  console.log(`\n=== 결과: ${pass} PASS / ${fail} FAIL ===\n`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('하네스 크래시:', e); process.exit(1); });
