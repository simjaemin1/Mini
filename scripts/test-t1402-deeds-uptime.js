#!/usr/bin/env node
// @regress   ← 통합 러너가 이 표를 보고 자기 목록을 만든다(scripts/run-regress.sh · 표 없으면 안 돈다)
// @bait 3
// === scripts/test-t1402-deeds-uptime.js — 사유지 판정 둘(★T1402 · 재민 11-20 판정 12 · 13): 서 있기는 0점 · 서버가 꺼진 시간은 안 센다 ==========
//
// ★지키는 것(존 정본 경로 · 켬 `T1305_DEEDS=1` · 아이 판)
//   ⓐ 서 있기 0점 — 내 땅덩이에 가만히 하루(머묾 재는 간격마다) 서 있어도 들어온 점수 0 · 손잡이 되돌림(`T1343_Q_IDLE=0.25`)이면 그 초당 점수(자명 통과 금지)
//   ⓑ 일한 점수는 그대로 — 보관함에 넣기 한 번(실제 `handlePlayerInput` · 짐이 바뀜) 뒤 머묾 초 동안 초당 Q_WORK
//   ⓒ 꺼진 시간 안 셈 — 존을 띄워 24칸을 걸고 내린 뒤, DB 를 "사흘 전에 꺼진 판"으로 옮겨(마지막 살아 있던 시각 · 청크 셈 시각 · 빚 셈 시각을 사흘 앞으로)
//      다시 띄우면 저축이 그대로다(사흘 몫이 안 빠진다) · 사유지 시계 물림 = 사흘 · 같은 DB 를 "사흘 동안 켜져 있던 판"(살아 있던 시각만 지금)으로 띄우면 사흘 몫이 빠진다
//   ⓓ 두 존이 따로 — 서울(사흘 꺼짐)과 도쿄(사흘 켜짐)에 같은 사람의 칸 · 서울 저축 그대로 · 도쿄는 사흘 × N 합(서울 칸 포함 — `deedOthers`) 속도로 빠진다
//   ★미끼 셋(이 파일 안 · 사본은 `server/_t1402bait-*` · 판 끝에 지움): ① 부팅 물림 줄을 지운 존 사본 → ⓒ 빨강 · ② 서 있기 기본을 0.25 로 되돌린 deeds 사본 → ⓐ 빨강 ·
//     ③ 머묾 재기를 벽시계로 되돌린 존 사본(사유지 시계와 섞임 — 일한 표시가 꺼진 만큼 어긋남) → ⓑ' 빨강
// ★박힌 날짜 0 · 벽시계는 "지금"에서 빼고 더하기만(판의 사흘 = 지금 − 3 × 하루).
//   node scripts/test-t1402-deeds-uptime.js   (아이 판 열한 · 약 1분)
'use strict';
if (require.main === module) require('./lib-port').noCentral();
const path = require('path');
const fs = require('fs');
const { execFileSync } = require('child_process');
const ROOT = path.join(__dirname, '..');
const MODE = process.env.__T1402_MODE || '';
const DAYMS = 24 * 60 * 60 * 1000;
const put = (R, k, c, x) => { R[k] = !!c; if (x !== undefined) R[k + '#'] = String(x).slice(0, 260); };

function bootZone() {
  Object.assign(process.env, { ENABLE_VILLAGES: '0', ENABLE_WILDLIFE: '0', ENABLE_BANDITS: '0', ENABLE_ROADS: '0', CLAIM_ABSENCE: '0', T1305_DEEDS: '1', T1402_CHEST_WORK: '1' });   // ★[T1402 덧붙임 둘] 이 판은 시계를 잰다 — 일 한 번을 보관함 넣기로 그대로 둔다(판정 27 은 보관함을 일에서 뺐다 · 되돌림 손잡이로 글자로 켠다)
  const _l = console.log, _w = console.warn, _e = console.error; console.log = () => {}; console.warn = () => {}; console.error = () => {};
  const Zone = require(process.env.__T1402_ZONE || path.join(ROOT, 'server', 'zone.js'));
  console.log = _l; console.warn = _w; console.error = _e;
  return Zone.__testBind();
}
function mkPlayer(H, name) {
  const msgs = []; const ws = { readyState: 1, send: (s) => { try { msgs.push(JSON.parse(s)); } catch (e) {} } };
  const p = { pid: 'p_' + name, playerId: 't1402_' + name, name, persistent: false, ws, msgs, x: 0, y: 0, vx: 0, vy: 0, floor: 0, hp: 100, maxHp: 100, hunger: 100, thirst: 100, inventory: { wood: 9999, stone: 9999 }, equipment: [], equipSlots: {}, craftSkill: {} };
  H.players.set(p.pid, p); return p;
}
const out = (R) => { console.log('@@T1402 ' + JSON.stringify(R)); };

// ── 아이 ① 서 있기 · 일한 점수(존 정본 · 시계 주입) ──
if (MODE === 'score') {
  const H = bootZone(), D = H.Deeds, F = D.CFG, SZ = H.BUILDING_SIZE, R = {};
  try {
    let T = Date.now(); H._t1332SetClock(() => T);
    const p = mkPlayer(H, 'stand'), X = 57000, Y = 57000;
    for (let y = 0; y < 3; y++) for (let x = 0; x < 3; x++) { p.x = (X + x) * SZ + SZ / 2; p.y = (Y + y) * SZ + SZ / 2; H.tryClaim(p, 'personal'); }
    let got = 0; const _a = D.addPts; D.addPts = function (P, ch, pts) { got += Math.max(0, +pts || 0); return _a.apply(this, arguments); };
    // ⓐ 집 칸에 하루(머묾 재는 간격 = 머묾의 4분의 1 · 존 타이머와 같은 간격)
    p.x = (X + 1) * SZ + SZ / 2; p.y = (Y + 1) * SZ + SZ / 2; delete p._t1332Dw; delete p._t1343Work;
    const step = Math.max(1000, F.DWELL_MS / 4); got = 0;
    for (let t = 0; t <= DAYMS; t += step) { T += step; H._t1332Dwell(p, T); }
    put(R, 'a_idle', true, `Q_IDLE ${F.Q_IDLE} · 하루 서 있기 점수 ${got.toFixed(2)}`); R.idleQ = F.Q_IDLE; R.idlePts = got;
    // ⓑ 일 — 내 상자에 나무 하나 넣기(실제 메시지 길 · 짐이 바뀜) 뒤 머묾 초 동안
    const bid = 'b_t1402chest';
    H.buildings.set(bid, { id: bid, type: 'chest', x: p.x + 8, y: p.y, ownerId: p.playerId, ownerName: p.name, data: {}, dbId: 0 });
    got = 0; delete p._t1332Dw;
    H._t1332Dwell(p, T);   // 머묾 시작
    H.handlePlayerInput(p, JSON.stringify({ type: 'chest_put', buildingId: bid, item: 'wood', amount: 1 }));
    for (let t = 0; t < F.DWELL_MS * 2; t += step) { T += step; H._t1332Dwell(p, T); }
    R.workPts = got; R.workWant = F.DWELL_MS / 1000 * F.Q_WORK;
  } catch (e) { R.err = String((e && e.stack) || e).slice(0, 400); }
  out(R); process.exit(0);
}

// ── 아이 ② 일한 표시와 머묾 재기가 같은 시계인가(실제 존 타이머 길 · 시계 주입 없음 · 꺼진 시간이 있는 DB) ──
if (MODE === 'workclock') {
  const H = bootZone(), D = H.Deeds, F = D.CFG, SZ = H.BUILDING_SIZE, R = {};
  try {
    const p = mkPlayer(H, 'wc'), X = 57100, Y = 57000;
    p.x = X * SZ + SZ / 2; p.y = Y * SZ + SZ / 2; H.tryClaim(p, 'personal');
    const bid = 'b_t1402wc'; H.buildings.set(bid, { id: bid, type: 'chest', x: p.x + 8, y: p.y, ownerId: p.playerId, ownerName: p.name, data: {}, dbId: 0 });
    let got = 0; const _a = D.addPts; D.addPts = function (P, ch, pts) { got += Math.max(0, +pts || 0); return _a.apply(this, arguments); };
    let t0 = 0;
    setTimeout(() => { H.handlePlayerInput(p, JSON.stringify({ type: 'chest_put', buildingId: bid, item: 'wood', amount: 1 })); t0 = Date.now(); wait(); }, 1500);   // 존 머묾 타이머가 한 번 잰 뒤
    function wait() {
      if (Date.now() - t0 < F.DWELL_MS + 1500) return setTimeout(wait, 200);
      put(R, 'b2_workclock', got > 0, `꺼진 시간 물림 ${(H._t1402Stat().off / DAYMS).toFixed(2)}일 · 넣기 뒤 ${((Date.now() - t0) / 1000).toFixed(1)}초 존 타이머가 준 일한 점수 ${got.toFixed(2)}`);
      out(R); process.exit(0);
    }
  } catch (e) { R.err = String((e && e.stack) || e).slice(0, 400); out(R); process.exit(0); }
}

// ── 아이 ③ 걸기(DB 에 남긴다) · ④ 다시 띄워 읽기 ──
if (MODE === 'claim' || MODE === 'read') {
  const H = bootZone(), D = H.Deeds, SZ = H.BUILDING_SIZE, R = {};
  try {
    const pid = 't1402_land';
    if (MODE === 'claim') {
      const p = mkPlayer(H, 'land'), X = +process.env.__T1402_X || 56000, Y = 56000;
      for (let y = 0; y < 4; y++) for (let x = 0; x < 6; x++) { p.x = (X + x) * SZ + SZ / 2; p.y = (Y + y) * SZ + SZ / 2; H.tryClaim(p, 'personal'); }
      H.players.delete(p.pid);
      const others = +process.env.__T1402_OTHERS || 0;
      if (others) { H.deedOthers.set(pid, others); if (H.db.saveDeedOwner) H.db.saveDeedOwner(pid, others); }
      H._t1343Advance(pid, H._t1402Uptime());
      H._t1402Save(Date.now());   // 곱게 내린 판(종료 flush 와 같은 줄)
    }
    R.stat = H._t1402Stat();
    R.rows = [...H.deedChunks.values()].filter((r) => r.pid === pid).map((r) => ({ cx: r.cx, cy: r.cy, m: r.m, t: r.t })).sort((a, b) => a.cx - b.cx || a.cy - b.cy);
    R.live = [...H.claims.values()].filter((c) => c.ownerPid === pid && (c.state || 'active') !== 'free').length;
    R.others = H.deedOthers.get(pid) | 0;
    R.rate = R.rows.map((r) => { const n = [...H.claims.values()].filter((c) => c.ownerPid === pid && D.chunkOf(Math.floor(c.x / SZ), Math.floor(c.y / SZ)).join(',') === r.cx + ',' + r.cy).length; return D.rateOf(n, R.live + R.others); });
  } catch (e) { R.err = String((e && e.stack) || e).slice(0, 400); }
  out(R); process.exit(0);
}

if (!MODE) {
  const { DatabaseSync } = require('node:sqlite');
  let pass = 0, fail = 0;
  const ok = (c, m, x) => { c ? pass++ : fail++; console.log((c ? '  ✓ ' : '  ✗ ') + m + (x !== undefined && x !== '' ? `  ${x}` : '')); };
  const run = (mode, env) => {
    let o = '';
    try { o = execFileSync(process.execPath, [__filename], { env: Object.assign({}, process.env, { __T1402_MODE: mode, DB_PATH: `/tmp/test-t1402-${process.pid}-${Math.random().toString(36).slice(2, 8)}.db`, PORT: String(require('./lib-port').port(37900)), ZONE_ID: 'hanbando' }, env || {}), encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 300000, maxBuffer: 16 * 1024 * 1024 }); }
    catch (e) { o = String((e && e.stdout) || ''); }
    const m = /@@T1402 (\{.*\})/.exec(o); return m ? JSON.parse(m[1]) : { err: '아이 판 없음' };
  };
  const rmDb = (f) => { for (const x of [f, f + '-wal', f + '-shm']) { try { fs.unlinkSync(x); } catch (e) {} } };
  // DB 를 "K 일 전 일"로 옮긴다 — 청크 셈 시각 · 빚 셈 시각 · (keepAlive 가 아니면) 마지막 살아 있던 시각
  const shift = (db, zone, K, keepAlive) => {
    const d = new DatabaseSync(db);
    d.prepare('UPDATE deed_chunks SET t = t - ?').run(K);
    try { d.prepare('UPDATE deed_owners SET dt = dt - ? WHERE dt IS NOT NULL').run(K); } catch (e) {}
    const row = d.prepare('SELECT data FROM world_meta WHERE zone = ?').get('deedclock:' + zone);
    const j = JSON.parse(row.data); j.alive = keepAlive ? Date.now() : j.alive - K;
    d.prepare('UPDATE world_meta SET data = ? WHERE zone = ?').run(JSON.stringify(j), 'deedclock:' + zone);
    d.close();
  };
  // ⓒ 한 판: 걸기 → K 일 옮김 → 다시 띄움 · 빠진 저축(청크마다) · 그 사흘 몫(기대)
  const offRun = (zoneFile, keepAlive, zone, others, X) => {
    const db = `/tmp/test-t1402-off-${process.pid}-${Math.random().toString(36).slice(2, 8)}.db`;
    const env = { DB_PATH: db, ZONE_ID: zone || 'hanbando', __T1402_OTHERS: String(others || 0), __T1402_X: String(X || 56000) };
    const A = run('claim', env); if (A.err) { rmDb(db); return { err: A.err }; }
    shift(db, zone || 'hanbando', 3 * DAYMS, keepAlive);
    const B = run('read', Object.assign({}, env, zoneFile ? { __T1402_ZONE: zoneFile } : {}));
    rmDb(db); if (B.err) return { err: B.err };
    const drop = A.rows.map((r, i) => r.m - ((B.rows[i] || {}).m)), want3 = A.rate.map((q, i) => Math.min(A.rows[i].m, q * 3 * DAYMS));
    return { A, B, drop, want3, offDays: B.stat.off / DAYMS };
  };
  console.log('\n=== T1402 사유지 판정 둘 — 서 있기 0점 · 서버가 꺼진 시간은 안 센다 ===');
  const S = run('score'), S25 = run('score', { T1343_Q_IDLE: '0.25' });
  ok(!S.err && S.idleQ === 0 && S.idlePts === 0 && !S25.err && S25.idlePts > 0.25 * DAYMS / 1000 * 0.9, 'ⓐ 서 있기 0점 — 내 땅덩이에 하루 서 있어도 들어온 점수 0(되돌림 손잡이 0.25 면 그 초당 점수 — 자명 통과 금지)',
    S.err || S25.err || `기본 ${S.idlePts.toFixed(2)}점 / 되돌림 ${S25.idlePts.toFixed(0)}점(하루)`);
  ok(!S.err && Math.abs(S.workPts - S.workWant) <= (S.workWant * 0.3), 'ⓑ 일한 점수는 그대로 — 보관함에 넣기 한 번(실제 메시지 · 짐이 바뀜) 뒤 머묾 초 동안 초당 Q_WORK',
    S.err || `${S.workPts.toFixed(2)}점(머묾 ${S.workWant.toFixed(0)}초 × 초당 1 언저리 · 재는 간격만큼 덜 셀 수 있다)`);
  const C = offRun(null, false), Con = offRun(null, true);
  ok(!C.err && !Con.err && Math.abs(C.offDays - 3) < 0.01 && C.drop.every((d) => Math.abs(d) < 0.5) && Con.drop.every((d, i) => Math.abs(d - Con.want3[i]) < 0.5) && Con.want3.some((x) => x > 50),
    'ⓒ 꺼진 사흘은 안 센다 — 24칸 걸고 사흘 꺼졌다 켜면 저축 그대로 · 같은 사흘 켜져 있던 판은 사흘 몫이 빠진다',
    C.err || Con.err || `꺼짐: 물림 ${C.offDays.toFixed(3)}일 · 빠진 저축 ${C.drop.map((d) => d.toFixed(2)).join(' / ')} | 켜짐: 빠진 저축 ${Con.drop.map((d) => d.toFixed(1)).join(' / ')}(기대 ${Con.want3.map((d) => d.toFixed(1)).join(' / ')})`);
  // ⓓ 두 존 — 서울 꺼짐 · 도쿄 켜짐 · 같은 사람(N 합 = 서울 24 + 도쿄 24)
  const Hb = offRun(null, false, 'hanbando', 24, 56000), Nb = offRun(null, true, 'nippon', 24, 56200);
  ok(!Hb.err && !Nb.err && Hb.drop.every((d) => Math.abs(d) < 0.5) && Nb.drop.every((d, i) => Math.abs(d - Nb.want3[i]) < 0.5) && Nb.A.others === 24 && Nb.want3.some((x) => x > 50),
    'ⓓ 두 존이 따로 — 서울(사흘 꺼짐) 저축 그대로 · 도쿄(사흘 켜짐)는 N 합 48(다른 존 24 포함) 속도로 사흘 몫',
    Hb.err || Nb.err || `서울 빠짐 ${Hb.drop.map((d) => d.toFixed(2)).join(' / ')} · 도쿄 빠짐 ${Nb.drop.map((d) => d.toFixed(1)).join(' / ')}(기대 ${Nb.want3.map((d) => d.toFixed(1)).join(' / ')} · 다른 존 ${Nb.A.others})`);
  const WC = (() => { const db = `/tmp/test-t1402-wc-${process.pid}.db`; const A = run('claim', { DB_PATH: db }); if (A.err) return { err: A.err }; shift(db, 'hanbando', 3 * DAYMS, false); const r = run('workclock', { DB_PATH: db, T1305_CARE_S: '2' }); rmDb(db); return r; })();
  ok(!WC.err && WC.b2_workclock === true, "ⓑ' 사흘 꺼졌던 존에서도 일한 표시와 머묾 재기가 같은 시계(존 타이머 길 그대로) — 넣기 뒤 일한 점수가 든다", WC.err || WC['b2_workclock#']);
  // ★미끼 셋 — 사본은 server/ 에(상대 require 그대로) · 판 끝에 지운다
  const rd = (f) => fs.readFileSync(path.join(ROOT, 'server', f), 'utf8');
  const ZS = rd('zone.js'), DS = rd('deeds.js');
  const tmp = (tag) => path.join(ROOT, 'server', `_t1402bait-${tag}-${process.pid}.js`);
  const withFiles = (files, fn) => { try { for (const [f, s] of files) fs.writeFileSync(f, s); return fn(); } finally { for (const [f] of files) { try { fs.unlinkSync(f); } catch (e) {} } } };
  {
    const from = '  _t1402Off = off + gap;   // ★부팅 물림 — 꺼져 있던 동안은 사유지 시계가 안 흐른다';
    const n = ZS.split(from).length - 1, fz = tmp('boot');
    const RB = withFiles([[fz, ZS.split(from).join('  _t1402Off = off;')]], () => offRun(fz, false));
    ok(n === 1 && !RB.err && RB.drop.some((d, i) => Math.abs(d - RB.want3[i]) < 0.5 && d > 50), '★미끼 ① — 부팅 물림 줄을 지운 존 사본 → ⓒ 빨강(꺼진 사흘 몫이 빠진다)', `바꾼 자리 ${n} · ${RB.err || '빠진 저축 ' + RB.drop.map((d) => d.toFixed(1)).join(' / ')}`);
  }
  {
    const from = "  Q_IDLE: Math.max(0, _num('T1343_Q_IDLE', 0)),";
    const n = DS.split(from).length - 1, fd = tmp('idle'), fz = tmp('idle-zone');
    const RB = withFiles([[fd, DS.split(from).join("  Q_IDLE: Math.max(0, _num('T1343_Q_IDLE', 0.25)),")], [fz, ZS.split("require('./deeds')").join(`require('./${path.basename(fd, '.js')}')`)]], () => run('score', { __T1402_ZONE: fz }));
    ok(n === 1 && !RB.err && RB.idlePts > 0, '★미끼 ② — 서 있기 기본을 0.25 로 되돌린 deeds 사본 → ⓐ 빨강', `바꾼 자리 ${n} · ${RB.err || '하루 서 있기 ' + RB.idlePts.toFixed(0) + '점'}`);
  }
  {
    const from = 'if (Deeds.ON) { const _t1332D = setInterval(() => { const _n = _t1332Clock();';
    const n = ZS.split(from).length - 1, fz = tmp('wall');
    const RB = withFiles([[fz, ZS.split(from).join('if (Deeds.ON) { const _t1332D = setInterval(() => { const _n = Date.now();')]], () => {
      const db = `/tmp/test-t1402-wcb-${process.pid}.db`; const A = run('claim', { DB_PATH: db }); if (A.err) return { err: A.err }; shift(db, 'hanbando', 3 * DAYMS, false); const r = run('workclock', { DB_PATH: db, __T1402_ZONE: fz, T1305_CARE_S: '2' }); rmDb(db); return r; });
    ok(n === 1 && !RB.err && RB.b2_workclock === false, "★미끼 ③ — 머묾 재기를 벽시계로 되돌린 존 사본 → ⓑ' 빨강(일한 표시는 사유지 시계 · 사흘 어긋나 일하는 중이 안 된다)", `바꾼 자리 ${n} · ${RB.err || RB['b2_workclock#']}`);
  }
  console.log(`\n=== T1402 사유지 판정 둘: ${pass} 통과 / ${fail} 실패 ===`);
  process.exit(fail ? 1 : 0);
}
