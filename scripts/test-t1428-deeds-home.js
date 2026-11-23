#!/usr/bin/env node
// @regress   ← 통합 러너가 이 표를 보고 자기 목록을 만든다(scripts/run-regress.sh · 표 없으면 안 돈다)
// @bait 3
// === scripts/test-t1428-deeds-home.js — 사유지 마무리(★T1428): 본거지 없음 = 한 덩이 · 본거지 잇기(빚 풀림 · 깨어날 자리) · 내놓은 움집 · 다 풀린 사람 ==========
//
// ★지키는 것(존 정본 경로 · 켬 `T1305_DEEDS=1` + `T1402_SPLIT_OK=1` · 아이 판 · 시계는 넣는 길)
//   ⓐ 본거지 없음(기본 'home') = 먼저 지은 집이 든 덩이 하나만 — 두 덩이에 집이 하나씩(왼 집을 먼저 지음) · 안 고름 → 왼 덩이 옆 됨 · 오른 덩이 옆 거절 ·
//      집 없는 새 사람(첫 칸 하나)의 둘째 칸은 된다
//   ⓑ 잇기 ① 빚 풀림의 "집" — 안 골랐으면 먼저 지은 집(왼) · 오른 집을 본거지로 고르면 그 집 · 본거지 집이 헐리면 다시 먼저 지은 집
//   ⓒ 잇기 ② 깨어날 자리 — 본거지를 고르면 개인 사유지 첫 자리가 본거지 집 · 깨어나는 칸 사다리가 그 집 문간 · 헐리면 종전 차례
//   ⓓ 내놓은 움집(첫 집터 `T1392_FIRST_LOT=1` 판) — 아홉 칸 + 간이 움집 → 아홉 칸을 다 내놓고(이사) 옛 자리에 첫 집터를 다시 → 선다(내 빈 집은 안 막는다) ·
//      남이 그 자리에 서면 "빈 집" 까닭으로 막힌다("마을 시설" 아님)
//   ⓔ 다 풀린 사람 — 시험 값(`T1343_D0` 아주 작게 — 9칸 버티는 날 0.2일 · 1칸 16일)으로 +60일 → 내 땅 0칸 → 첫 등록 길(아홉 칸)이 다시 열려 옛 자리에 선다
//   ★미끼 셋(이 파일 안 · 사본은 `server/_t1428bait-*` · 판 끝에 지움): ① 'home' 갈래를 뺀 존(본거지 없으면 종전 — 두 덩이 다) → ⓐ 빨강 ·
//     ② 빚 풀림의 집이 본거지를 안 보는 존 → ⓑ 빨강 · ③ 내 건물도 아홉 칸을 막는 존 → ⓓ 빨강
// ★박힌 날짜 0 — 사유지 시계 주입(`_t1332SetClock`) · "지금"에서 더하기만.
//   node scripts/test-t1428-deeds-home.js   (아이 판 열둘 · 약 1분)
'use strict';
if (require.main === module) require('./lib-port').noCentral();
const path = require('path');
const fs = require('fs');
const { execFileSync } = require('child_process');
const ROOT = path.join(__dirname, '..');
const MODE = process.env.__T1428_MODE || '';
const DAYMS = 24 * 3600000;
const put = (R, k, c, x) => { R[k] = !!c; if (x !== undefined) R[k + '#'] = String(x).slice(0, 260); };

if (MODE) {
  Object.assign(process.env, { ZONE_ID: 'hanbando', ENABLE_VILLAGES: '0', ENABLE_WILDLIFE: '0', ENABLE_BANDITS: '0', ENABLE_ROADS: '0', CLAIM_ABSENCE: '0', T1305_DEEDS: '1', T1402_SPLIT_OK: '1' });
  if (MODE === 'lot' || MODE === 'gone') process.env.T1392_FIRST_LOT = '1';
  if (MODE === 'gone') process.env.T1343_D0 = '0.0000001';   // 시험 값 — 9칸 버티는 날 0.2일 · 1칸 16일(바닥)(실제 식은 1칸 24,000일 · 보고 §4)
  const _l = console.log, _w = console.warn, _e = console.error; console.log = () => {}; console.warn = () => {}; console.error = () => {};
  const H = require(process.env.__T1428_ZONE || path.join(ROOT, 'server', 'zone.js')).__testBind();
  console.log = _l; console.warn = _w; console.error = _e;
  const SZ = H.BUILDING_SIZE, R = {};
  let T = +process.env.__T1428_T0; H._t1332SetClock(() => T);
  let n = 0;
  const mk = (name) => { const msgs = []; const p = { pid: 'p_h' + n, playerId: 't1428_' + name, name, persistent: false, lastSeen: Date.now() + 864e5, ws: { readyState: 1, send: (s) => { try { msgs.push(JSON.parse(s)); } catch (e) {} } }, msgs,
    x: 0, y: 0, vx: 0, vy: 0, floor: 0, hp: 100, maxHp: 100, hunger: 100, thirst: 100, inventory: { wood: 9999, stone: 9999 }, toolItems: [], equipment: [], equipSlots: {}, craftSkill: {} }; n++; H.players.set(p.pid, p); H._t1305Day(p, T); return p; };
  const live = (p) => [...H.claims.values()].filter((c) => c.ownerPid === p.playerId && c.kind === 'personal' && (c.state || 'active') !== 'free').length;
  const last = (p) => (p.msgs.filter((m) => m.type === 'notice').map((m) => m.text).pop() || '');
  const claim = (p, x, y) => { const b = live(p); p.msgs.length = 0; p.x = x * SZ + SZ / 2; p.y = y * SZ + SZ / 2; H.tryClaim(p, 'personal'); return { ok: live(p) > b, n: live(p) - b, note: last(p) }; };
  let cid = 0;   // 판 차림 — 넓히기 문을 안 지나게 칸 행을 바로 놓는다(재는 것은 그 뒤의 손)
  const put1 = (p, x, y) => { const id = 'c_h' + (cid++); H.claims.set(id, { id, ownerPid: p.playerId, ownerName: p.name, x: x * SZ, y: y * SZ, w: SZ, h: SZ, kind: 'personal', state: 'active' }); return id; };
  const rect = (p, X, Y, w, h) => { for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) put1(p, X + x, Y + y); };
  const hut = (p, cx, cy) => {   // 간이 움집 한 채(집 행 + 바닥 아홉 — 겉모양 표지 `hut` 를 싣는 완공 꼴)
    const tag = [cx, cy, cx + 2, cy + 2];
    for (let y = cy; y <= cy + 2; y++) for (let x = cx; x <= cx + 2; x++) H._liveBuildRow('floor', x * SZ + SZ / 2, y * SZ + SZ / 2, { floor: 0, hut: tag, small: 1 }, p.playerId, '간이 움집', null);
    return H._liveBuildRow('hut', (cx + 1.5) * SZ, (cy + 1.5) * SZ, { owner: p.playerId, floor: 0, small: 1 }, p.playerId, '간이 움집', null);
  };
  const cellsOf = (p) => [...H.claims.values()].filter((c) => c.ownerPid === p.playerId && c.kind === 'personal' && (c.state || 'active') !== 'free').map((c) => ({ x: Math.floor(c.x / SZ), y: Math.floor(c.y / SZ), c }));
  try {
    if (MODE === 'main') {
      // ⓐ · ⓑ · ⓒ — 두 덩이(왼 3×3 · 오른 3×3 · 사이 한 칸 비움) · 왼 집 A 먼저 · 오른 집 B 나중
      const X = 66000, Y = 66000, p = mk('two');
      rect(p, X, Y, 3, 3); rect(p, X + 4, Y, 3, 3);
      const A = hut(p, X, Y), B = hut(p, X + 4, Y);
      const a1 = claim(p, X, Y + 3), a2 = claim(p, X + 4, Y + 3);
      const q = mk('fresh'); put1(q, X + 20, Y); const a3 = claim(q, X + 21, Y);
      put(R, 'a_one', a1.ok && !a2.ok && a3.ok, `왼 덩이(먼저 지은 집) 옆 ${a1.ok ? '됨' : '거절 ' + a1.note} · 오른 덩이 옆 ${a2.ok ? '됨' : '거절(' + a2.note.slice(0, 24) + '…)'} · 집 없는 새 사람 둘째 칸 ${a3.ok ? '됨' : '거절 ' + a3.note}`);
      const k = (b) => Math.floor(b.x / SZ) + ',' + Math.floor(b.y / SZ);
      const h0 = H._t1386Home(p.playerId, cellsOf(p));
      p.msgs.length = 0; H.handlePlayerInput(p, JSON.stringify({ type: 'deeds_home', buildingId: B.id }));
      const h1 = H._t1386Home(p.playerId, cellsOf(p));
      // ⓒ 깨어날 자리
      const o1 = H.listRespawnOptions(p).filter((o) => o.kind === 'personal'), w1 = o1[0] ? H.wakeCellOf(o1[0]) : null;
      // 본거지 집이 헐린다
      H.buildings.delete(B.id); try { H.db.deleteBuilding(B.dbId); } catch (e) {}
      const h2 = H._t1386Home(p.playerId, cellsOf(p)), o2 = H.listRespawnOptions(p).filter((o) => o.kind === 'personal');
      put(R, 'b_debt', h0 === k(A) && h1 === k(B) && h2 === k(A), `빚 풀림의 집 — 안 고름 ${h0 === k(A) ? 'A' : h0} · B 고름 ${h1 === k(B) ? 'B' : h1} · B 헐림 ${h2 === k(A) ? 'A' : h2}`);
      put(R, 'c_wake', !!o1[0] && o1[0].home === 1 && Math.abs(o1[0].x - B.x) < 1 && w1 && w1.cellKind !== undefined && Math.hypot(w1.x - B.x, w1.y - B.y) < SZ * 4 && !(o2[0] && o2[0].home),
        `본거지 고름 — 개인 첫 자리 ${o1[0] ? (o1[0].home ? '본거지 집' : '다른 칸') : '-'} · 깨어나는 칸 ${w1 ? w1.cellKind : '-'}(집에서 ${w1 ? Math.round(Math.hypot(w1.x - B.x, w1.y - B.y)) : '-'}px) · 헐린 뒤 첫 자리 ${o2[0] ? (o2[0].home ? '본거지' : '종전 칸') : '-'}`);
    } else if (MODE === 'lot') {
      // ⓓ 내놓은 움집 — 첫 집터(아홉 칸) · 간이 움집 · 다 내놓고 · 다시
      const X = 67000, Y = 67000, p = mk('mover');
      const c1 = claim(p, X + 1, Y + 1);
      const H1 = hut(p, X, Y);
      for (const c of [...H.claims.values()].filter((q) => q.ownerPid === p.playerId)) H.handlePlayerInput(p, JSON.stringify({ type: 'unclaim', claimId: c.id, split: 1 }));
      const gone = live(p), vac = H._t1428Vacant(H1);
      const o = mk('other'); const c2 = claim(o, X + 1, Y + 1);
      const c3 = claim(p, X + 1, Y + 1), back = !H._t1428Vacant(H1);
      put(R, 'd_lot', c1.n === 9 && gone === 0 && vac && !c2.ok && /빈 집/.test(c2.note) && !/마을 시설/.test(c2.note) && c3.n === 9 && back,
        `첫 집터 ${c1.n}칸 · 다 내놓음 → ${gone}칸 · 빈 집 ${vac ? '○' : '✗'} · 남이 그 자리 ${c2.ok ? '섬' : '막힘(' + c2.note.slice(0, 40) + ')'} · 옛 주인이 다시 ${c3.n}칸 · 다시 제 집 ${back ? '○' : '✗'}`);
    } else if (MODE === 'gone') {
      // ⓔ 다 풀린 사람(시험 값) — 첫 집터 아홉 칸 · 안 들어오고 +15일 → 0칸 → 첫 등록 길
      const X = 68000, Y = 68000, p = mk('gone');
      const c1 = claim(p, X + 1, Y + 1);
      H.players.delete(p.pid);
      T += 60 * DAYMS; H._t1343Advance(p.playerId, T);   // 시험 값에서도 1칸 버티는 날은 16일(식의 바닥) — 60일
      const left = live(p), first = H._t1392IsFirst(p.playerId);
      H.players.set(p.pid, p); H._t1305Day(p, T);
      const c2 = claim(p, X + 1, Y + 1);
      put(R, 'e_gone', c1.n === 9 && left === 0 && first && c2.n === 9, `첫 집터 ${c1.n}칸 → +60일 ${left}칸 · 첫 등록 길 ${first ? '열림' : '닫힘'} · 옛 자리에 다시 ${c2.n}칸(${c2.note.slice(0, 40)})`);
    }
  } catch (e) { R.err = String((e && e.stack) || e).slice(0, 400); }
  console.log('@@T1428 ' + JSON.stringify(R));
  for (const f of [process.env.DB_PATH, process.env.DB_PATH + '-wal', process.env.DB_PATH + '-shm']) { try { fs.unlinkSync(f); } catch (e) {} }
  process.exit(0);
} else {
  let pass = 0, fail = 0;
  const ok = (c, m, x) => { c ? pass++ : fail++; console.log((c ? '  ✓ ' : '  ✗ ') + m + (x !== undefined && x !== '' ? `  ${x}` : '')); };
  const T0 = Math.floor(Date.now() / DAYMS) * DAYMS + 1000 * DAYMS;
  const run = (mode, env) => {
    let out = '';
    try { out = execFileSync(process.execPath, [__filename], { env: Object.assign({}, process.env, { __T1428_MODE: mode, __T1428_T0: String(T0), DB_PATH: require('./lib-tmp').file('t1428_' + mode, '.db'), PORT: String(require('./lib-port').port(37800)) }, env || {}), encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 300000, maxBuffer: 16 * 1024 * 1024 }); }
    catch (e) { out = String((e && e.stdout) || ''); }
    const m = /@@T1428 (\{.*\})/.exec(out); return m ? JSON.parse(m[1]) : {};
  };
  const show = (R, k, msg) => ok(R[k] === true, msg, R[k + '#'] || R.err || '아이 판 없음');
  console.log('\n=== T1428 사유지 마무리 — 본거지 없음 한 덩이 · 잇기 · 내놓은 움집 · 다 풀린 사람 ===');
  const RM = run('main'), RL = run('lot'), RG = run('gone');
  show(RM, 'a_one', 'ⓐ 본거지 없음 = 먼저 지은 집이 든 덩이 하나만(다른 덩이 옆 거절) · 집 없는 새 사람 둘째 칸은 된다');
  show(RM, 'b_debt', 'ⓑ 빚 풀림의 "집" — 안 고름 = 먼저 지은 집 · 본거지를 고르면 그 집 · 헐리면 다시 먼저 지은 집');
  show(RM, 'c_wake', 'ⓒ 깨어날 자리 — 본거지 집이 개인 첫 자리 · 그 집 문간에서 깬다 · 헐리면 종전 차례');
  show(RL, 'd_lot', 'ⓓ 내놓은 움집 — 이사한 사람은 옛 자리에 첫 집터를 다시 세운다(내 빈 집은 안 막는다) · 남에겐 "빈 집"으로 막힌다 · 다시 잡으면 다시 제 집');
  show(RG, 'e_gone', 'ⓔ 다 풀린 사람(시험 값 · +60일) — 내 땅 0칸 → 첫 등록 길이 열려 옛 자리에 아홉 칸');
  const ZS = fs.readFileSync(path.join(ROOT, 'server', 'zone.js'), 'utf8');
  const tmp = (tag) => path.join(ROOT, 'server', `_t1428bait-${tag}-${process.pid}.js`);
  const bait = (tag, from, to, mode) => {
    const k = ZS.split(from).length - 1, f = tmp(tag);
    let RB = {}; try { fs.writeFileSync(f, ZS.split(from).join(to)); RB = run(mode, { __T1428_ZONE: f }); } finally { try { fs.unlinkSync(f); } catch (e) {} }
    return { k, RB };
  };
  { const { k, RB } = bait('two', "    if (T1402_NOHOME === 'home') {", "    if (false) {", 'main');
    ok(k === 1 && RB.a_one === false, "★미끼 ① — 'home' 갈래를 뺀 존(본거지 없으면 종전 · 두 덩이 다) → ⓐ 빨강", `바꾼 자리 ${k} · a_one=${RB.a_one} · ${RB['a_one#'] || RB.err || ''}`); }
  { const { k, RB } = bait('debt', "  if (T1402_SPLIT) { const hm = _t1428HomeOf(pid); if (hm) {", "  if (false) { const hm = _t1428HomeOf(pid); if (hm) {", 'main');
    ok(k === 1 && RB.b_debt === false, '★미끼 ② — 빚 풀림의 집이 본거지를 안 보는 존 → ⓑ 빨강', `바꾼 자리 ${k} · b_debt=${RB.b_debt} · ${RB['b_debt#'] || RB.err || ''}`); }
  { const { k, RB } = bait('own', "        if (String(b.ownerId) === String(pid)) continue;\n", "", 'lot');
    ok(k === 1 && RB.d_lot === false, '★미끼 ③ — 내 건물(내놓은 내 움집)도 아홉 칸을 막는 존 → ⓓ 빨강', `바꾼 자리 ${k} · d_lot=${RB.d_lot} · ${RB['d_lot#'] || RB.err || ''}`); }
  console.log(`\n=== T1428 사유지 마무리: ${pass} 통과 / ${fail} 실패 ===`);
  process.exit(fail ? 1 : 0);
}
