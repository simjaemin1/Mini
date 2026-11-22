#!/usr/bin/env node
// @regress   ← 통합 러너가 이 표를 보고 자기 목록을 만든다(scripts/run-regress.sh · 표 없으면 안 돈다)
// @bait 5
// === scripts/test-t1402-deeds-split.js — 땅은 갈라져도 된다 · 본거지 · 뜸(★T1402 덧붙임 · 재민 11-20 판정 20 · 21 · 22 · 23) ==========
//
// ★지키는 것(존 정본 경로 · 켬 `T1305_DEEDS=1` + `T1402_SPLIT_OK=1` · 아이 판 · 사유지 시계 · 뜸 시계는 넣는 길)
//   땅 = 집 덩이 4×4(간이 움집 A) · 복도 4칸(한 땅덩이 · 그 청크엔 복도만) · 먼 덩이 4×4(간이 움집 B) · 땅 밖에 반쯤 걸친 내 움집 하나
//   ① 본거지 고름 — 집 A 를 고르면 몸 칸 `deeds.h` 에 그 집 · 알림
//   ② 땅 밖 집 거절 — 발자국이 다 내 땅이 아닌 집은 본거지로 못 고른다
//   ③ 뜸 — 고른 뒤 하루 안에 다른 집으로 바꾸면 거절("하루에 한 번") · 25시간 뒤엔 바뀐다(⑥)
//   ④ 풀림이 땅을 가른다(14일) — 복도 청크만 바닥나면 복도 칸이 목이어도 먼 칸부터 한 칸씩(한 순간 한 칸) · 먼 덩이 16칸 · 집 덩이 16칸 그대로 · 주인에게 "갈라졌습니다"
//   ⑤ 떨어진 조각엔 못 붙인다 — 먼 덩이 옆 새 칸 거절("본거지와 이어져야") · 집 덩이 옆은 된다
//   ⑥ 본거지를 B 로 옮기면(뜸 뒤) 먼 덩이 옆이 되고 집 덩이 옆이 거절된다
//   ⑦ 손으로 내놓기도 갈라져도 된다 — 목 칸은 먼저 확인 한 줄(`unclaim_confirm` · 땅 그대로) · 확인을 붙이면 내놓아지고 "갈라졌습니다"
//   ⑧ 재시작 뒤 그대로 — 몸(`serializeBody`)에 실린 본거지로 같은 DB 를 다시 띄우면 본거지 · 넓히기 문이 그대로(집 청크가 아직 안 켜진 판 — 집 행은 DB 에서 읽는다)
//   ★미끼 다섯(이 파일 안 · 사본은 `server/_t1402sbait-*` · 판 끝에 지움): ① 고른 본거지를 안 보는 존(★T1428 기본 = 먼저 지은 집의 덩이) → ⑥ 빨강 ·
//     ② 뜸 0 존 → ③ 빨강 · ③ 풀림에 갈라짐 판정이 남은 deeds → ④ 빨강 · ④ 떨어진 조각에 이어 붙는 존 → ⑤ 빨강 · ⑤ 켬인데 내놓기 거절이 남은 존 → ⑦ 빨강
// ★박힌 날짜 0 — 시계는 주입(사유지 `_t1332SetClock` · 뜸 `_t1402SetWall`) · "지금"에서 더하기만.
//   node scripts/test-t1402-deeds-split.js   (아이 판 열둘 · 약 1분)
'use strict';
if (require.main === module) require('./lib-port').noCentral();
const path = require('path');
const fs = require('fs');
const { execFileSync } = require('child_process');
const ROOT = path.join(__dirname, '..');
const MODE = process.env.__T1402S_MODE || '';
const HOUR = 3600000, DAYMS = 24 * HOUR;
const put = (R, k, c, x) => { R[k] = !!c; if (x !== undefined) R[k + '#'] = String(x).slice(0, 260); };

if (MODE) {
  Object.assign(process.env, { ZONE_ID: 'hanbando', ENABLE_VILLAGES: '0', ENABLE_WILDLIFE: '0', ENABLE_BANDITS: '0', ENABLE_ROADS: '0', CLAIM_ABSENCE: '0', T1305_DEEDS: '1', T1402_SPLIT_OK: '1' });
  const _l = console.log, _w = console.warn, _e = console.error; console.log = () => {}; console.warn = () => {}; console.error = () => {};
  const H = require(process.env.__T1402S_ZONE || path.join(ROOT, 'server', 'zone.js')).__testBind();
  console.log = _l; console.warn = _w; console.error = _e;
  const D = H.Deeds, SZ = H.BUILDING_SIZE, R = {};
  const X0 = 62000, Y0 = 62000;   // 4 의 배수 — 청크 4×4 경계에 맞춘다(복도 청크엔 복도 칸만)
  let T = +process.env.__T1402S_T0, W = T; H._t1332SetClock(() => T); H._t1402SetWall(() => W);
  const msgs = [], p = { pid: 'p_s', playerId: 't1402s', name: 'split', persistent: false, lastSeen: Date.now() + 864e5, ws: { readyState: 1, send: (s) => { try { msgs.push(JSON.parse(s)); } catch (e) {} } },
    x: 0, y: 0, vx: 0, vy: 0, floor: 0, hp: 100, maxHp: 100, hunger: 100, thirst: 100, inventory: { wood: 9999, stone: 9999 }, toolItems: [], equipment: [], equipSlots: {}, craftSkill: {} };
  const notes = () => msgs.filter((m) => m.type === 'notice').map((m) => m.text);
  const last = () => notes().slice(-1)[0] || '';
  const at = (x, y) => { p.x = x * SZ + SZ / 2; p.y = y * SZ + SZ / 2; };
  const live = () => { const s = new Set(); for (const c of H.claims.values()) if (c.ownerPid === p.playerId && c.kind === 'personal' && (c.state || 'active') !== 'free') s.add(Math.floor(c.x / SZ) + ',' + Math.floor(c.y / SZ)); return s; };
  const claim = (x, y) => { const b = live().size; msgs.length = 0; at(x, y); H.tryClaim(p, 'personal'); return { ok: live().size === b + 1, note: last() }; };
  const hutAt = (cx, cy) => H._liveBuildRow('hut', (cx + 1.5) * SZ, (cy + 1.5) * SZ, { owner: p.playerId, floor: 0, small: 1 }, p.playerId, '간이 움집', null);
  const setHome = (b) => { msgs.length = 0; H.handlePlayerInput(p, JSON.stringify({ type: 'deeds_home', buildingId: b.id })); return last(); };
  try {
    if (MODE === 'main') {
      H.players.set(p.pid, p); H._t1305Day(p, T);
      const blob = (x0) => { for (const y of [1, 0, 2, 3]) for (let x = 0; x < 4; x++) claim(X0 + x0 + x, Y0 + y); };   // 복도 줄(y = 1)부터 — 먼 덩이가 변으로 이어지게
      blob(0); for (let x = 4; x <= 7; x++) claim(X0 + x, Y0 + 1); blob(8);
      const A = hutAt(X0, Y0), B = hutAt(X0 + 8, Y0), O = hutAt(X0 + 11, Y0 + 4);   // O = 땅 밖에 반쯤 걸친 집
      // ① ② ③
      const n1 = setHome(A), h1 = Deeds_h();
      function Deeds_h() { const d = D.bodyOf(p); return d && d.h ? Object.assign({}, d.h) : null; }
      put(R, 'p1_pick', live().size === 36 && h1 && (h1.b | 0) === (A.dbId | 0) && /본거지로 삼았습니다/.test(n1), `36칸 · 본거지 ${h1 ? h1.b : '-'}(A ${A.dbId}) · ${n1}`);
      W += HOUR; const n2 = setHome(O), h2 = Deeds_h();
      put(R, 'p2_out', (h2.b | 0) === (A.dbId | 0) && /다 내 땅 안에/.test(n2), n2);
      const n3 = setHome(B), h3 = Deeds_h();
      put(R, 'p3_cool', (h3.b | 0) === (A.dbId | 0) && /하루에 한 번/.test(n3), n3);
      // ④ 복도 청크만 바닥 · 나머지 가득 · 14일
      const ccx = (X0 + 4) / 4;
      for (const r of H.deedChunks.values()) if (r.pid === p.playerId) { r.t = T; r.m = (r.cx === ccx) ? 0 : D.capOf(16); }
      H._t1343Advance(p.playerId, T, true);
      msgs.length = 0;
      const hits = []; const _s = H.Claims.setState; H.Claims.setState = function (id, c, st, hb, when) { if (st === 'free' && c.ownerPid === p.playerId) hits.push([Math.floor(c.x / SZ) - X0, when]); return _s.apply(this, arguments); };
      T += 14 * DAYMS; H._t1343Advance(p.playerId, T); H.Claims.setState = _s;   // 복도 넷 · N 36 — 첫 칸 4.6일 · 둘째 10.8일(집 · 먼 덩이 청크는 18.5일까지 가득 쪽)
      const L = live(), far = [...L].filter((k) => +k.split(',')[0] >= X0 + 8).length, home = [...L].filter((k) => +k.split(',')[0] < X0 + 4).length;
      const split = notes().some((t) => /갈라졌습니다/.test(t)), times = new Set(hits.map((h) => h[1]));
      put(R, 'p4_free', hits.length >= 2 && times.size === hits.length && hits[0][0] === 7 && far === 16 && home === 16 && split && H._t1402Pieces(p.playerId) >= 2,
        `풀린 칸 ${hits.map((h) => '+' + h[0]).join(' · ')}(한 순간 한 칸 ${times.size === hits.length ? '○' : '✗'}) · 먼 덩이 ${far}/16 · 집 덩이 ${home}/16 · 덩이 ${H._t1402Pieces(p.playerId)} · 알림 ${split ? '○' : '✗'}`);
      // ⑤
      const f1 = claim(X0 + 12, Y0), h5 = claim(X0, Y0 + 4);
      put(R, 'p5_grow', !f1.ok && /본거지와 이어져야/.test(f1.note) && h5.ok, `먼 덩이 옆 ${f1.ok ? '됨' : '거절'}(${f1.note.slice(0, 30)}) · 집 덩이 옆 ${h5.ok ? '됨' : '거절 ' + h5.note}`);
      // ⑥ 뜸 뒤 B
      W += 25 * HOUR; const n6 = setHome(B), h6 = Deeds_h();
      const f6 = claim(X0 + 12, Y0 + 1), g6 = claim(X0 + 1, Y0 + 4);
      put(R, 'p6_move', (h6.b | 0) === (B.dbId | 0) && f6.ok && !g6.ok, `${n6.slice(0, 24)} · 먼 덩이 옆 ${f6.ok ? '됨' : '거절 ' + f6.note} · 집 덩이 옆 ${g6.ok ? '됨' : '거절'}`);
      // ⑦ 손으로 내놓기 — 남은 복도의 목 칸(집 덩이 쪽 첫 칸 X0+4 — 빼면 남은 복도가 떨어진다)
      const L7 = live(); const corr = [4, 5, 6].filter((dx) => L7.has((X0 + dx) + ',' + (Y0 + 1)));
      const nk = corr.length >= 2 ? corr[0] : null;
      const cid = nk == null ? null : [...H.claims.values()].find((c) => c.ownerPid === p.playerId && Math.floor(c.x / SZ) === X0 + nk && Math.floor(c.y / SZ) === Y0 + 1).id;
      msgs.length = 0; if (cid) H.handlePlayerInput(p, JSON.stringify({ type: 'unclaim', claimId: cid }));
      const ask = msgs.find((m) => m.type === 'unclaim_confirm'), still = H.claims.has(cid);
      msgs.length = 0; if (cid) H.handlePlayerInput(p, JSON.stringify({ type: 'unclaim', claimId: cid, split: 1 }));
      const gone = !H.claims.has(cid), sp7 = notes().some((t) => /갈라졌습니다/.test(t));
      put(R, 'p7_unclaim', !!cid && !!ask && still && gone && sp7, `목 칸 +${nk} · 확인 한 줄 ${ask ? '○' : '✗'}(${ask ? ask.text.slice(0, 26) : notes().join('|').slice(0, 60)}) · 그 사이 땅 ${still ? '그대로' : '바뀜'} · 확인 뒤 ${gone ? '내놓음' : '그대로'} · 알림 ${sp7 ? '○' : '✗'}`);
      // ⑧ 몸
      const body = JSON.parse(JSON.stringify(H.serializeBody(p)));
      R.body = body.deeds || null; R.B = B.dbId;
      put(R, 'p8_body', !!(body.deeds && body.deeds.h && (body.deeds.h.b | 0) === (B.dbId | 0)), JSON.stringify(body.deeds && body.deeds.h));
      try { H.db.db.close(); } catch (e) {}
    } else if (MODE === 'restart') {
      const dz = JSON.parse(process.env.__T1402S_BODY || 'null'), Bid = +process.env.__T1402S_B;
      p.deeds = dz; H.players.set(p.pid, p);
      const hm = H._t1402Home(p);
      const f = claim(X0 + 12, Y0 + 2), g = claim(X0 + 2, Y0 + 4);
      put(R, 'p8_restart', !!hm && (hm.b.dbId | 0) === Bid && f.ok && !g.ok, `다시 띄운 존 — 본거지 ${hm ? hm.b.dbId : '없음'}(B ${Bid}) · 먼 덩이 옆 ${f.ok ? '됨' : '거절 ' + f.note} · 집 덩이 옆 ${g.ok ? '됨' : '거절'}`);
    }
  } catch (e) { R.err = String((e && e.stack) || e).slice(0, 400); }
  console.log('@@T1402S ' + JSON.stringify(R));
  if (MODE === 'restart') for (const f of [process.env.DB_PATH, process.env.DB_PATH + '-wal', process.env.DB_PATH + '-shm']) { try { fs.unlinkSync(f); } catch (e) {} }
  process.exit(0);
} else {
  let pass = 0, fail = 0;
  const ok = (c, m, x) => { c ? pass++ : fail++; console.log((c ? '  ✓ ' : '  ✗ ') + m + (x !== undefined && x !== '' ? `  ${x}` : '')); };
  const T0 = Math.floor(Date.now() / DAYMS) * DAYMS + 1000 * DAYMS;
  const run = (mode, env, db) => {
    let out = '';
    try { out = execFileSync(process.execPath, [__filename], { env: Object.assign({}, process.env, { __T1402S_MODE: mode, __T1402S_T0: String(T0), DB_PATH: db, PORT: String(require('./lib-port').port(37780)) }, env || {}), encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 300000, maxBuffer: 16 * 1024 * 1024 }); }
    catch (e) { out = String((e && e.stdout) || ''); }
    const m = /@@T1402S (\{.*\})/.exec(out); return m ? JSON.parse(m[1]) : null;
  };
  const both = (env) => {
    const db = require('./lib-tmp').file('t1402s', '.db');
    const RM = run('main', env, db);
    const RR = RM && RM.body ? run('restart', Object.assign({ __T1402S_BODY: JSON.stringify(RM.body), __T1402S_B: String(RM.B) }, env || {}), db) : null;
    for (const f of [db, db + '-wal', db + '-shm']) { try { fs.unlinkSync(f); } catch (e) {} }
    return Object.assign({}, RM || {}, RR || {});
  };
  const show = (R, k, msg) => ok(!!R && R[k] === true, msg, R ? (R[k + '#'] || R.err || '') : '아이 판 없음');
  console.log('\n=== T1402 땅은 갈라져도 된다 · 본거지 · 뜸 ===');
  const R = both();
  show(R, 'p1_pick', '① 본거지 고름 — 내 땅 위 내 집(간이 움집 A)을 고르면 몸 칸에 그 집');
  show(R, 'p2_out', '② 땅 밖에 걸친 집은 본거지로 못 고른다');
  show(R, 'p3_cool', '③ 뜸 — 고른 뒤 하루 안에 다른 집으로 바꾸면 거절');
  show(R, 'p4_free', '④ 풀림이 땅을 가른다 — 복도 칸이 목이어도 먼 칸부터 한 칸씩 · 먼 덩이 · 집 덩이 그대로 · 주인에게 알림');
  show(R, 'p5_grow', '⑤ 떨어진 조각엔 못 붙인다(본거지와 이어져야) · 본거지 조각 옆은 된다');
  show(R, 'p6_move', '⑥ 뜸 뒤 본거지를 B 로 옮기면 먼 덩이 옆이 되고 집 덩이 옆이 거절된다');
  show(R, 'p7_unclaim', '⑦ 손으로 내놓기도 갈라져도 된다 — 확인 한 줄 뒤 내놓아지고 알림');
  show(R, 'p8_body', '⑧ 본거지는 몸(`serializeBody` · `deeds.h`)에 실린다');
  show(R, 'p8_restart', '⑧ 재시작 뒤 그대로 — 같은 DB 로 다시 띄운 존이 몸의 본거지로 넓히기 문을 그대로 쓴다');
  // ★미끼 다섯
  const rd = (f) => fs.readFileSync(path.join(ROOT, 'server', f), 'utf8');
  const ZS = rd('zone.js'), DS = rd('deeds.js');
  const tmp = (tag) => path.join(ROOT, 'server', `_t1402sbait-${tag}-${process.pid}.js`);
  const bait = (tag, file, from, to) => {
    const src = file === 'deeds' ? DS : ZS, k = src.split(from).length - 1, f = tmp(tag), fz = tmp(tag + '-zone');
    let RB = null;
    try {
      fs.writeFileSync(f, src.split(from).join(to));
      if (file === 'deeds') fs.writeFileSync(fz, ZS.split("require('./deeds')").join(`require('./${path.basename(f, '.js')}')`));
      RB = both({ __T1402S_ZONE: file === 'deeds' ? fz : f });
    } finally { for (const q of [f, fz]) { try { fs.unlinkSync(q); } catch (e) {} } }
    return { k, RB: RB || {} };
  };
  { const { k, RB } = bait('auto', 'zone', "function _t1402HomeRec(player) { const d = Deeds.bodyOf(player); return d && d.h && typeof d.h === 'object' ? d.h : null; }", 'function _t1402HomeRec(player) { return null; }');
    ok(k === 1 && RB.p6_move === false, '★미끼 ① — 고른 본거지를 안 보는 존(★T1428 본거지 없음 기본 = 먼저 지은 집 A 의 덩이) → ⑥ 빨강(B 로 옮겨도 먼 덩이 옆이 안 된다)', `바꾼 자리 ${k} · p6_move=${RB.p6_move} · ${RB['p6_move#'] || RB.err || ''}`); }
  { const { k, RB } = bait('cool', 'zone', '  if (h && Number.isFinite(+h.at) && now - h.at < T1402_HOME_COOL_MS) {', '  if (false) {');
    ok(k === 1 && RB.p3_cool === false, '★미끼 ② — 뜸 0 존 → ③ 빨강', `바꾼 자리 ${k} · p3_cool=${RB.p3_cool} · ${RB['p3_cool#'] || RB.err || ''}`); }
  { const { k, RB } = bait('neck', 'deeds', '    if (P._splitOk || deg <= 1 || !G.splitsInt(P._S, k)) return c;', '    if (deg <= 1 || !G.splitsInt(P._S, k)) return c;');
    ok(k === 1 && RB.p4_free === false, '★미끼 ③ — 풀림에 갈라짐 판정이 남은 deeds(목 칸을 건너뜀) → ④ 빨강', `바꾼 자리 ${k} · p4_free=${RB.p4_free} · ${RB['p4_free#'] || RB.err || ''}`); }
  { const { k, RB } = bait('attach', 'zone', '    if (T1402_SPLIT && !adj.first) {', '    if (false) {');
    ok(k === 1 && RB.p5_grow === false, '★미끼 ④ — 떨어진 조각에 이어 붙는 존 → ⑤ 빨강', `바꾼 자리 ${k} · p5_grow=${RB.p5_grow} · ${RB['p5_grow#'] || RB.err || ''}`); }
  { const { k, RB } = bait('refuse', 'zone', '  if (sp.splits && !_t1402Sp) {', '  if (sp.splits) {');
    ok(k === 1 && RB.p7_unclaim === false, '★미끼 ⑤ — 켬인데 손으로 내놓기 거절이 남은 존 → ⑦ 빨강', `바꾼 자리 ${k} · p7_unclaim=${RB.p7_unclaim} · ${RB['p7_unclaim#'] || RB.err || ''}`); }
  console.log(`\n=== T1402 땅 갈라짐 · 본거지: ${pass} 통과 / ${fail} 실패 ===`);
  process.exit(fail ? 1 : 0);
}
