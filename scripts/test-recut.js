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
//   ⑥ ★[T440] 청크 한 판(`_idxAtCell` · ringCache) — 셀 답이 색인(`resourcesAtCell`)과 **개체 차례까지** 같다 ·
//      사건(벰 · 날 넘김 · 되살림 · 심음) 뒤에도 같다 — ★미끼: 사건마다 **답이 실제로 바뀌었나**를 먼저 본다
//      (판을 안 비우면 옛 답이 남아 빨갛다)
//   ⑦ ★[T440] 정적 — 셀 색인의 문 하나 · 청크 목록은 색인과 같은 함수 · 판이 낡는 사건 셋 · 영토가 자란 날 영토 전체
//   ⑧ ★[T440] 런타임 다시 훑기(자식 프로세스 · 마을 켬 · 새 세계) — 시계를 첫 묘목 날로 당기고 econ 날을 흘린다:
//      영토가 **자란** 마을은 옛 영토에 다시 선 그루를 그날 벤다(장부 날 = 그날) · ★미끼: **안 자란** 마을은 그대로 선다
//      ★[T450 ⓪] 창은 벽시계가 아니라 **영토 편입 사건**으로 자른다 — 하루 마감이 끝난 경계(`villagesBusy` 거짓)마다
//        마을의 영토(메모리 `_terrSet`)가 늘었나(= 그 마을에 `_terrGrow` 가 왔나)로 가른다 · 두 집합(다시 선 그루를 든
//        자란 마을 · 안 자란 마을)이 다 차지 않으면 econ 날을 하나씩 더(상한 400 · 카드) · 다시 선 그루가 다 베였으면
//        시계를 다음 재생 창으로 한 번 더 당긴다 · 끝까지 안 자란 마을이 0 이면 "창 안에서 전부 자란다"고 적고
//        전제를 **자란 날 앞/뒤**로 세운다(자란 날 전엔 다시 선 그루가 그대로 · 자란 날에 0)
//
// ⚠존을 **이 프로세스 안에서** 띄운다(`test-ghost-tree` 문법 · `Zone.__testBind`). 가짜 플레이어는 **`players` 에 안 넣는다**
//   (관측자 0 — 넣으면 그 자리 청크가 켜져 색인 대신 개체 갈래를 탄다). 시계 손잡이(`__e2e_clock`)는 객체를 직접 받는다.
// 실행: node scripts/test-recut.js        (내부: --grow <out.json> — ⑧ 의 자식)
'use strict';
const path = require('path');
const fs = require('fs');
const ROOT = path.join(__dirname, '..');
const codeOnly = require('./code-only.js');   // ★[T171] 주석 제거기 정본(사본 0)

let pass = 0, fail = 0;
const ok = (c, m, x) => { c ? pass++ : fail++; console.log((c ? '  ✓ ' : '  ✗ ') + m + (x !== undefined && x !== '' ? `  ${x}` : '')); };
const pre = (c, m, x) => { if (!c) { fail++; console.log('  ✗ [상황] ' + m + (x !== undefined ? `  ${x}` : '')); } else console.log('  · [상황] ' + m + (x !== undefined ? `  ${x}` : '')); };

if (process.argv[2] === '--grow') { growChild().then(() => process.exit(0), (e) => { try { fs.writeFileSync(process.argv[3], JSON.stringify({ err: String((e && e.stack) || e) })); } catch (x) {} process.exit(1); }); return; }

(async () => {
  console.log('\n=== 개간이 다시 벤다 — 서 있으면 벤다(묘목까지) (T426) · 청크 한 판 · 영토가 자란 날 (T440) ===\n');
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
  // ── ⑥ ★[T440] 청크 한 판 — 셀 답 = 색인(개체 차례까지) · 사건 뒤에도 ──────────────────
  ok(typeof H._idxAtCell === 'function', '★⑥ 셀 색인의 문(`_idxAtCell` · 청크 한 판)이 있다(없으면 아래 ⑥ 을 건너뛴다 — T440 전 코드)');
  if (typeof H._idxAtCell === 'function') {
    const J = (a) => JSON.stringify(a);
    const ref = (x, y, day, raw) => CH.resourcesAtCell('hanbando', x, y, raw ? { biome: Z.biome, chunkSize: CH.CHUNK_SIZE }
      : { biome: Z.biome, chunkSize: CH.CHUNK_SIZE, harvestedSet: H.harvestedSeeds, gameDay: day });
    const day = H.gameDayNow();
    //   셀 — 세 자리의 청크 전부 + 그 둘레 한 줄(넘친 이웃이 섞이는 자리)
    const cpc = CH.CHUNK_SIZE / 32;
    let n = 0, bad = 0, badRaw = 0, ents = 0, pick = null;
    for (const c of cells) {
      const qx = Math.floor(c[0] / cpc), qy = Math.floor(c[1] / cpc);
      for (let y = qy * cpc - 1; y <= (qy + 1) * cpc; y++) for (let x = qx * cpc - 1; x <= (qx + 1) * cpc; x++) {
        if (x < 0 || y < 0) continue;
        n++;
        const R = ref(x, y, day, false); ents += R.length;
        if (J(H._idxAtCell(x, y, false, day)) !== J(R)) bad++;
        if (J(H._idxAtCell(x, y, true)) !== J(ref(x, y, 0, true))) badRaw++;
        if (!pick && R.length === 1 && R[0].type === 'tree' && R[0].isSeed && !H.harvestedSeeds.has(R[0].seedKey)) pick = [x, y];
      }
    }
    ok(n > 3000 && ents > 0 && bad === 0 && badRaw === 0,
      '★★⑥ 청크 판의 셀 답 = 색인(`resourcesAtCell`) — **개체 차례까지**(JSON 통째 · 장부·원시 둘 다)', `${n}칸 · 개체 ${ents} · 어긋남 ${bad} · 원시 ${badRaw}`);
    pre(!!pick, '⑥ 사건 자리 — 안 벤 씨 성목 한 그루가 선 셀', pick ? pick.join(',') : '없다');
    if (pick) {
      const [x, y] = pick, k = ref(x, y, day, false)[0].seedKey;
      //   ⓐ 벰 — 나무꾼 문(`_t325CutTreeAt` → `_markHarvested` → 판은 그 셀만 새로)
      const b0 = J(ref(x, y, day, false));
      H._t325CutTreeAt(x, y);
      const a0 = J(ref(x, y, day, false));
      ok(b0 !== a0 && J(H._idxAtCell(x, y, false, day)) === a0,
        '★★⑥ⓐ 벤 뒤 — 답이 **바뀌었고**(성목 → 그루터기) 판도 그 답이다(미끼: 판을 안 비우면 옛 성목이 남는다)',
        `${ref(x, y, day, false).map((e) => e.type).join(',')}`);
      //   ⓑ 날 넘김 — 벤 그루가 묘목이 되는 날(정본 유도) — 날이 판의 열쇠다
      const sd = stageDays([x, y]), d2 = day + sd.sap;
      clock(d2);
      const a1 = J(ref(x, y, d2, false));
      ok(a1 !== a0 && J(H._idxAtCell(x, y, false, d2)) === a1,
        `★★⑥ⓑ 날을 넘기면(벤 뒤 ${sd.sap}일 · ${sd.sp} 묘목) 답이 바뀌고 판도 그 답이다(재생 단계)`, `${ref(x, y, d2, false).map((e) => e.type).join(',')}`);
      //   ⓒ 되살림 — T341 문(키만 온다 → 그 씨를 낳은 청크 판을 버린다)
      H._t341Unharvest(k);
      const a2 = J(ref(x, y, d2, false));
      ok(a2 !== a1 && J(H._idxAtCell(x, y, false, d2)) === a2,
        '★⑥ⓒ 되살리면(`_t341Unharvest`) 답이 바뀌고(묘목 → 성목) 판도 그 답이다', `${ref(x, y, d2, false).map((e) => e.type).join(',')}`);
      //   ⓓ 심음 — 색인은 그대로(심은 나무는 DB 개체) · 제품 문(`_t325TreesAtCell`)은 심은 묘목을 낸다(쿼드트리 갈래)
      let t = null, pc = null;
      for (let dy = 2; dy < 60 && !t; dy++) {
        const cx2 = x, cy2 = y + dy, px = cx2 * 32 + 16, py = cy2 * 32 + 16;
        if (H.isTerrainBlockedLocal(px, py)) continue;
        if (ref(cx2, cy2, d2, true).length) continue;
        let busy = false; for (const rr of H.resources.values()) if (Math.floor(rr.x / 32) === cx2 && Math.floor(rr.y / 32) === cy2) { busy = true; break; }
        if (busy) continue;
        const i0 = J(H._idxAtCell(cx2, cy2, false, d2));
        me.x = px; me.y = py; me.inventory.acorn = 1;
        t = H.tryPlantTree(me, px, py, 'acorn');
        if (t) pc = { cx2, cy2, i0 };
      }
      pre(!!t, '⑥ⓓ 빈 셀에 묘목을 심었다(DB 나무)', t ? `#${t.dbId}` : '못 심었다');
      if (t) {
        await new Promise((r) => setTimeout(r, 450));   // 쿼드트리는 틱이 다시 세운다(5Hz 상한 — 종전 규칙)
        const prod = H._t325TreesAtCell(pc.cx2, pc.cy2);
        ok(J(H._idxAtCell(pc.cx2, pc.cy2, false, d2)) === pc.i0 && prod.length === 1 && prod[0].id === t.id,
          '★⑥ⓓ 심음은 판을 안 바꾼다(색인 그대로) · 제품 문은 **심은 묘목**을 낸다(쿼드트리 갈래가 먼저 본다)', prod.map((e) => `${e.type}#${e.dbId || e.id}`).join(','));
      }
    }
  }
  // ── ⑦ ★[T440] 정적 — 문 하나 · 같은 목록 · 판이 낡는 사건 · 영토 전체 ──────────────────
  {
    const ZS = codeOnly(fs.readFileSync(path.join(ROOT, 'server', 'zone.js'), 'utf8'));
    const CS = codeOnly(fs.readFileSync(path.join(ROOT, 'server', 'chunk.js'), 'utf8'));
    const VS = codeOnly(fs.readFileSync(path.join(ROOT, 'server', 'villages.js'), 'utf8'));
    const bodyIn = (src, name) => { const i = src.indexOf(`function ${name}(`); if (i < 0) return ''; const j = src.indexOf('\nfunction ', i + 10); return src.slice(i, j < 0 ? undefined : j); };
    const act = bodyIn(ZS, '_actEntitiesAtCell'), clr = bodyIn(ZS, 'clearTreesInCells'), idx = bodyIn(ZS, '_idxAtCell');
    const mark = bodyIn(ZS, '_markHarvested'), unh = bodyIn(ZS, '_t341Unharvest'), prom = bodyIn(ZS, '_promoteHarvestOnce');
    const rac = bodyIn(CS, 'resourcesAtCell'), tg = bodyIn(VS, '_terrGrow');
    ok(/_idxAtCell\(/.test(act) && /_idxAtCell\(cx, cy, false, _gd\)/.test(clr) && !/resourcesAtCell\(/.test(act + clr),
      '★⑦ 셀 색인의 문은 **하나**(`_idxAtCell`) — 나무꾼·채집(`_actEntitiesAtCell`)과 개간(`clearTreesInCells`)이 같은 판을 본다');
    ok(/cellChunksOf\(cellX, cellY, chunkManager\.chunkSize\)/.test(idx) && /cellChunksOf\(cellX, cellY, cs\)/.test(rac),
      '★⑦ 셀에 닿는 청크 목록은 색인과 **같은 함수**(`chunk.js cellChunksOf`) — 차례까지 같다(사본 0)');
    ok(/_ringBump\(seedKey, x, y\)/.test(mark) && /_ringBump\(seedKey\)/.test(unh) && /_ringCache\.clear\(\)/.test(prom),
      '★⑦ 판이 낡는 사건 셋 — 벰(`_markHarvested`) · 되살림(`_t341Unharvest`) · 옛 행 승격(`_promoteHarvestOnce`)이 판을 새로 한다');
    ok(/state\.deps\.clearTreesInCells\(own\)/.test(tg) && !/clearTreesInCells\(added\)/.test(tg),
      '★⑦ 영토가 자란 날(`_terrGrow`) — 그 마을 영토 **전체**를 같은 문으로 훑는다(새 셀만이 아니다)');
  }
  // ── ⑧ ★[T440] 런타임 다시 훑기 — 자식 프로세스(마을 켬 · 새 세계) ─────────────────────
  //   ★[T450 ⓪] 창 = 영토 편입 사건(하루 마감 경계마다 마을 영토가 늘었나) — 벽시계에 안 묶인다(자식 주석)
  {
    const OUTG = `/tmp/test-recut-grow-${process.pid}.json`;
    try { fs.unlinkSync(OUTG); } catch (e) {}
    const { spawnSync } = require('child_process');
    const t0 = Date.now();
    spawnSync(process.execPath, [__filename, '--grow', OUTG], { cwd: ROOT, stdio: 'ignore', timeout: 600000, env: process.env });
    let G = null; try { G = JSON.parse(fs.readFileSync(OUTG, 'utf8')); } catch (e) { G = { err: 'no json' }; }
    try { fs.unlinkSync(OUTG); } catch (e) {}
    //   자식은 하루마다 중간 결과를 적는다 — 끝을 못 봤으면(시간 초과) 그 줄까지를 말한다
    pre(!G.err && G.done, `⑧ 자식 — 새 세계 · 마을 ${G.vils || 0} · 첫 창 시계 ${G.day0} · 하루 마감 ${G.steps || 0}번(econ ${G.econ ? G.econ.join('→') : '?'}) · 시계 당김 ${G.pulls || 0}번 · ${((Date.now() - t0) / 1000).toFixed(0)}초`
      + (G.done ? '' : ' · ★끝을 못 봤다(상한 · 시간 초과)'), G.err ? String(G.err).slice(0, 200) : '');
    if (!G.err && G.rows) {
      const gS = G.rows.filter((r) => r.grew && r.before > 0), sS = G.rows.filter((r) => !r.grew && r.before > 0);
      const allGrow = sS.length === 0;
      pre(gS.length > 0, '⑧ (전제) 다시 선 그루를 든 채 영토가 **자란** 마을-날이 있다(비면 이 절은 자명하다)',
        `자란 ${gS.length} · 안 자란 ${sS.length}(마을-날 · 다시 선 그루를 든 것만)` + (allGrow ? ' · ★이 세계는 창 안에서 전부 자란다 — 전제를 자란 날 앞/뒤로' : ''));
      const gB = gS.reduce((a, r) => a + r.before, 0), gA = gS.reduce((a, r) => a + r.after, 0), gDay = gS.reduce((a, r) => a + r.dayNow, 0);
      ok(gS.length > 0 && gA === 0 && gDay === gB,
        '★★⑧ 영토가 **자란** 마을 — 옛 영토에 다시 선 그루를 그날 **다 벤다** · 장부 날 = 그날', `${gS.length}마을-날 · 다시 선 ${gB} → ${gA} · 장부 날 그날 ${gDay}/${gB}`);
      if (!allGrow) {
        const sB = sS.reduce((a, r) => a + r.before, 0), sA = sS.reduce((a, r) => a + r.after, 0), sDay = sS.reduce((a, r) => a + r.dayNow, 0);
        ok(sA === sB && sDay === 0,
          '★★⑧ 미끼 — 영토가 **안 자란** 마을은 그대로 선다(주기는 영토가 자란 날이다 · 날마다 훑지 않는다)', `${sS.length}마을-날 · 다시 선 ${sB} → ${sA} · 장부 날 바뀜 ${sDay}`);
      } else {
        //   카드 문법(T450 ⓪): 안 자란 마을이 끝내 0 이면 같은 마을의 **자란 날 앞**(그날 마감 전 경계 — 시계를 당긴 것만으로는
        //     안 베였다)과 **뒤**(0)를 견준다 · ⚠이 판은 날마다 훑는 돌연변이를 못 가른다(안 자란 마을-날이 없다)
        ok(gB > 0 && gA === 0,
          '★★⑧ 미끼(자란 날 앞/뒤) — 자란 날 **앞** 경계엔 다시 선 그루가 그대로 섰고(시계만으로는 안 베인다) 자란 날에 0', `앞 ${gB} · 뒤 ${gA} ⚠날마다 훑기를 못 가른다`);
      }
    }
  }

  console.log(`\n=== 결과: ${pass} PASS / ${fail} FAIL ===\n`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('하네스 크래시:', e); process.exit(1); });

// ══ ⑧ 의 자식 — 새 세계를 띄우고(마을 켬 · 하루 2.5초) 시계를 당긴 창에서 econ 날을 **하루 마감씩** 흘린다 ═══════
//   ★[T450 ⓪] 창을 **영토 편입 사건**으로 자른다(종전 T440 판은 벽시계 두 창 — 부하에 따라 창 B 가 아직 모든 마을이
//     자라는 날에 떨어져 "안 자란 마을 0"이 났다 · PM 판 23/2).
//     ⓐ 경계 = 하루 마감이 **끝난** 순간(`econDay` 가 넘어가고 `villagesBusy()` 가 거짓) — 그 사이 모든 마을의 하루 조각
//        (`terr` 포함)이 돌았다. 벽시계로 끊지 않는다(조각은 예산만큼 여러 프레임에 걸쳐 돈다).
//     ⓑ 자랐나 = 그 경계 사이에 마을 영토(메모리 `_terrSet`)가 늘었나 = 그 마을에 `_terrGrow` 가 왔나(늘면 같은 호출이 훑는다).
//     ⓒ 센다 = 그 마을 **옛 영토**(경계 앞 영토)의 셀 가운데 끝 경계에서 **남의 영토가 아닌** 셀(겹친 셀은 자란 이웃이 벤다 —
//        T440 §0-ⓑ) · 다시 선 그루(제품 창구 `_t325TreesAtCell` · 관측자 0 ⇒ 색인) · 장부 날(DB).
//     ⓓ 두 집합(다시 선 그루를 든 자란 마을-날 · 안 자란 마을-날)이 다 찰 때까지 하루씩 더(상한 400일 · 카드) ·
//        다시 선 그루가 다 베였으면 시계를 다음 재생 창(T440 과 같은 세 해 · 벤 포도·개암·버들이 다시 선다)으로 한 번 더 당긴다.
//     ⓔ 하루마다 중간 결과를 적는다(부모가 시간 초과로 끊어도 그 줄까지 말한다).
async function growChild() {
  const OUT = process.argv[3];
  const TMPG = `/tmp/test-recut-g-${process.pid}.db`;
  const rm = () => { for (const f of [TMPG, TMPG + '-wal', TMPG + '-shm']) { try { fs.unlinkSync(f); } catch (e) {} } };
  rm(); process.on('exit', rm);
  Object.assign(process.env, { ZONE_ID: 'hanbando', PORT: String(39600 + (process.pid % 300)), DB_PATH: TMPG,
    ENABLE_VILLAGES: '1', ENABLE_WILDLIFE: '0', ENABLE_BANDITS: '0', ENABLE_ROADS: '0', E2E_GIVE: '1', VILLAGE_DAY_MS: '2500' });
  console.log = () => {}; console.warn = () => {}; console.error = () => {};
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const Zone = require(path.join(ROOT, 'server', 'zone.js'));
  const H = Zone.__testBind();
  await new Promise((r) => setImmediate(r));   // 부팅이 미룬 일(T426 다시 훑기 · 옛 행 승격)을 먼저
  for (let i = 0; i < 600; i++) { let d = null; try { d = H.SimVillages.econDay(); } catch (e) {} if (d != null) break; await sleep(500); }
  const me = { pid: 'p_grow', ws: { readyState: 1, send: () => {} }, x: 0, y: 0, isNpc: false };
  const clock = (day) => H.handlePlayerInput(me, JSON.stringify({ type: '__e2e_clock', day, night: false }));
  const CH = require(path.join(ROOT, 'server', 'chunk.js'));
  const TR = require(path.join(ROOT, 'server', 'trees.js'));
  const YD = require(path.join(ROOT, 'server', 'events.js')).yearDaysOf();
  const Zc = require(path.join(ROOT, 'server', 'zone-config.js')).ZONES.hanbando;
  const Database = require(path.join(ROOT, 'node_modules', 'better-sqlite3'));
  const readDb = () => { const D = new Database(TMPG, { readonly: true });
    const v = D.prepare('SELECT id, name FROM villages').all();
    const t = D.prepare("SELECT village_id, cx, cy FROM village_buildings WHERE type = 'terr'").all();
    const l = new Map(D.prepare('SELECT seed_key, harvested_day FROM harvested_seeds').all().map((r) => [r.seed_key, r.harvested_day]));
    D.close(); return { v, t, l }; };
  const SV = H.SimVillages;
  //   하루 마감 경계 — econ 날이 넘어가고 그날 조각이 다 돌았다(벽시계가 아니라 마감이 끝난 사건)
  const closedDay = async () => { const ed = SV.econDay(); while (SV.econDay() === ed) await sleep(50); while (SV.villagesBusy()) await sleep(20); };
  await sleep(1200);
  while (SV.villagesBusy()) await sleep(20);
  const L = readDb();
  const vils = L.v.map((v) => ({ id: v.id, name: v.name, V: SV.villageByDbId(v.id) })).filter((x) => x.V && x.V._terrSet);
  //   첫 창 시계 — 영토의 벤 씨 가운데 가장 먼저 묘목이 되는 날 + 한 해(정본 유도 · 벤 날 + 종의 그루터기 해 × 한 해 · T440 그대로)
  let C = Infinity;
  for (const r of L.t) for (const e of CH.resourcesAtCell('hanbando', r.cx, r.cy, { biome: Zc.biome, chunkSize: CH.CHUNK_SIZE })) {
    if (e.type !== 'tree' || !L.l.has(e.seedKey)) continue;
    const cd = L.l.get(e.seedKey); if (!(cd >= 0)) continue;
    const sp = TR.ON() ? TR.speciesAt('hanbando', Math.floor(e.x / 32), Math.floor(e.y / 32)) : null;
    const g = sp ? TR.stageYearsOf(sp, CH.REGROW.TREE_STUMP_Y(), CH.REGROW.TREE_FULL_Y()) : [CH.REGROW.TREE_STUMP_Y(), CH.REGROW.TREE_FULL_Y()];
    C = Math.min(C, cd + Math.ceil(g[0] * YD));
  }
  if (!Number.isFinite(C)) throw new Error('영토에 벤 씨가 없다 — 창을 세울 수 없다');
  //   경계 한 판 — 마을마다 영토(메모리) 크기와 옛 영토 셀(복사본)
  const snap = () => vils.map((x) => ({ id: x.id, name: x.name, size: x.V._terrSet.size, cells: [...x.V._terrSet] }));
  //   셀 목록의 다시 선 그루 — [씨, 셀] 쌍(제품 창구 · 관측자 0 ⇒ 색인)
  const standing = (cells) => { const out = []; for (const k of cells) { const i = k.indexOf(','); for (const e of (H._t325TreesAtCell(+k.slice(0, i), +k.slice(i + 1)) || [])) if (e.isSeed && e.seedKey) out.push([e.seedKey, k]); } return out; };
  const CAP = 400;   // 카드(T450 ⓪): 상한은 있는 400일 픽스처 — 보통 열흘 안에 끝난다
  let day = C + YD; clock(day);
  const out = { vils: vils.length, day0: day, steps: 0, pulls: 1, econ: [SV.econDay(), SV.econDay()], rows: [], done: false };
  const flush = () => { try { fs.writeFileSync(OUT, JSON.stringify(out)); } catch (e) {} };
  let s0 = snap();
  let gN = 0, sN = 0;
  while (out.steps < CAP) {
    //   경계 앞 — 마을마다 옛 영토의 다시 선 그루
    const before = s0.map((q) => standing(q.cells));
    if (!before.some((b) => b.length)) { day += 3 * YD; clock(day); out.pulls++; continue; }   // 다 베였다 — 다음 재생 창(T440 창 B 와 같은 세 해)
    await closedDay(); out.steps++;
    const s1 = snap();
    //   끝 경계에서 둘 이상이 가진 셀 — 자란 이웃의 훑기가 벨 수 있다 ⇒ 센 데서 뺀다(양쪽 다)
    const owners = new Map(); for (const q of s1) for (const k of q.cells) owners.set(k, (owners.get(k) || 0) + 1);
    const L1 = readDb();
    for (let i = 0; i < s0.length; i++) {
      const b = before[i].filter(([, c]) => owners.get(c) === 1);
      if (!b.length) continue;
      const grew = s1[i].size > s0[i].size;   // 그 마을에 `_terrGrow` 가 왔다(영토가 늘면 같은 호출이 훑는다)
      const now = new Set(standing([...new Set(b.map(([, c]) => c))]).map(([k]) => k));
      let after = 0, dayNow = 0; for (const [k] of b) { if (now.has(k)) after++; if (L1.l.get(k) === day) dayNow++; }
      out.rows.push({ id: s0[i].id, name: s0[i].name, step: out.steps, grew, before: b.length, after, dayNow });
      if (grew) gN++; else sN++;
    }
    out.econ[1] = SV.econDay();
    s0 = s1;
    flush();
    if (gN && sN) break;   // 두 집합이 다 찼다
  }
  out.done = true;
  flush();
}
