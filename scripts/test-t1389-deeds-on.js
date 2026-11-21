#!/usr/bin/env node
// @regress   ← 통합 러너가 이 표를 보고 자기 목록을 만든다(scripts/run-regress.sh · 표 없으면 안 돈다)
// @bait 4
// === scripts/test-t1389-deeds-on.js — 사유지 돌봄 켬 준비(★T1389): 값 같은 빠른 셈 · 틱 예산 잇기 · 복도 막힘 ㉡ · 부재 훑기 시각 · 계량기 뒤늦은 보냄 ==========
//
// ★지키는 것
//   ⓐ `claims.components`(정수 열쇠) · `splitsAt`(이웃 무리 번갈아 넓히기) = 종전 글자(문자열 열쇠 · 땅 전체 두 번) — 무작위 칸 집합 수천 개
//   ⓑ `deeds.advance` 빠른 길(정본 객체) = 종전 길(술어 함수) — 무작위 땅 40판(구멍 · 외딴 조각 · 집 없음)의 풀림 차례 · 시각이 같다
//   ⓒ 존 셈을 틱 예산으로 잘라 이어도(예약 · 부팅 길) 한 번에 셈한 것과 같다 — 남은 칸 · 빚 · 청크 저축
//   ⓓ 복도 막힘 — ㉠(끔 기본) 복도 청크만 바닥나면 기다린다(목 칸뿐 · 풀린 칸 0) · 셋째 안(★T1402 `T1402_SPLIT_OK=1` — ㉡ 거둠) 목이어도 한 칸씩 · 떨어진 먼 덩이 · 집 덩이는 그대로
//   ⓔ 부재 훑기(T45) — 하루 전에 나간 주인의 칸은 그대로(`active`) · 50일 전이면 `free` (종전 `last_seen | 0` 은 ms 시각을 32비트로 잘라 둘 다 `free`)
//   ⓕ 계량기 — 1초 안 두 번째 보냄은 버리지 않고 1초 끝에 보낸다(둘째 칸을 잡은 직후 패널이 새 N)
//   ⓗ 다시 선포(PM 덧붙임 Q12) — 빚 선 땅에서 내놓고 다시 · 풀린 내 칸 다시 선포가 다음 풀림을 한 시간 넘게 늦추지 않는다(선포 +PT 는 빚 · 바닥난 청크에 안 든다)
//   ⓖ 숫자 상한(S0 = 9) — 켬은 개인 사유지 숫자 상한 문구가 안 뜬다(12칸 다 선다) · 끔은 9칸에서 "한도 9"(종전 그대로)
//   ★미끼 넷(이 파일 안 · 사본은 `server/_t1389bait-*` · 판 끝에 지움): ① 정수 이웃 하나를 빼먹은 claims 사본 → ⓐ 빨강 · ② 부재 시각을 `| 0` 으로 되돌린 claims 사본 → ⓔ 빨강 ·
//     ③ 예산에서 멈출 때 셈 시각을 '지금'으로 건너뛰는 deeds 사본 → ⓒ 빨강 · ④ 선포 +PT 를 빚부터 갚는 길로 되돌린 존 사본 → ⓗ 빨강
// ★박힌 날짜 0 — 시각은 주입(존 `_t1332SetClock`) · 판의 0 = 지금에서 1,000일 뒤(부팅 벽시계 셈이 판을 안 건드린다).
//   node scripts/test-t1389-deeds-on.js   (아이 판 아홉 · 약 50초)
'use strict';
if (require.main === module) require('./lib-port').noCentral();
const path = require('path');
const fs = require('fs');
const { execFileSync } = require('child_process');
const ROOT = path.join(__dirname, '..');
const MODE = process.env.__T1389_MODE || '';
const DAYMS = 24 * 60 * 60 * 1000;
const put = (R, k, c, x) => { R[k] = !!c; if (x !== undefined) R[k + '#'] = String(x).slice(0, 220); };

// ── 아이 ① 셈만(claims · deeds — 정본 또는 사본) ──
if (MODE === 'pure') {
  process.env.T1305_DEEDS = '1';
  const C = require(process.env.__T1389_CLAIMS || path.join(ROOT, 'server', 'claims.js'));
  const D = require(process.env.__T1389_DEEDS || path.join(ROOT, 'server', 'deeds.js'));
  const R = {};
  try {
    // ⓐ 종전 글자(이 판이 그대로 옮겨 둔 T45 술어 — 견줄 잣대)
    const old = (set) => { const seen = new Set(); let n = 0; for (const k of set) { if (seen.has(k)) continue; n++; const st = [k]; seen.add(k); while (st.length) { const [cx, cy] = st.pop().split(',').map(Number); for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const nk = (cx + dx) + ',' + (cy + dy); if (set.has(nk) && !seen.has(nk)) { seen.add(nk); st.push(nk); } } } } return n; };
    let r = 7; const rr = () => { r = (r * 1103515245 + 12345) % 2147483648; return r / 2147483648; };
    let bad = 0, checks = 0, splits = 0, sets = 0;
    for (let t = 0; t < 1500; t++) {
      const W = 2 + Math.floor(rr() * 14), Hh = 2 + Math.floor(rr() * 14), p = 0.4 + rr() * 0.55, ox = Math.floor((rr() - 0.5) * 2e6), oy = Math.floor((rr() - 0.5) * 2e6), set = new Set();
      for (let y = 0; y < Hh; y++) for (let x = 0; x < W; x++) if (rr() < p) set.add((ox + x) + ',' + (oy + y));
      if (!set.size) continue; sets++;
      if (C.components(set) !== old(set)) bad++;
      for (const k of [...set].slice(0, 10)) { checks++; set.delete(k); const a = old(set); set.add(k); const want = a > old(set); const got = C.splitsAt(set, k); if (want) splits++; if (got !== want) bad++; }
    }
    put(R, 'a_same', bad === 0 && splits > 1000 && sets > 1000, `집합 ${sets} · 갈라짐 판정 ${checks}(갈라짐 ${splits}) · 다름 ${bad}`);
    // ⓑ 빠른 길 = 종전 길(풀림 차례 · 시각)
    const spiral = (n) => { const o = [], seen = new Set(); let x = 0, y = 0, dx = 1, dy = 0, run = 1, st = 0, tu = 0; while (o.length < n) { const k = x + ',' + y; if (!seen.has(k)) { seen.add(k); o.push([x, y]); } x += dx; y += dy; if (++st === run) { st = 0; [dx, dy] = [-dy, dx]; if (++tu % 2 === 0) run++; } } return o; };
    const lands = []; r = 12345;
    for (let t = 0; t < 40; t++) {
      const N = 10 + Math.floor(rr() * 300); let cells = spiral(N); if (t % 3 === 1) cells = cells.filter(() => rr() > 0.15);
      const fill = []; for (let i = 0; i < 400; i++) fill.push(rr());
      lands.push({ cells, home: t % 4 === 0 ? null : '0,0', others: t % 5, half: t % 2 === 1, fill });
    }
    const runAll = (G) => lands.map((L) => {
      const P = { chunks: [], cells: [], home: L.home, debt: 0, t: 0, others: L.others }, by = new Map();
      for (const [x, y] of L.cells) { const [cx, cy] = D.chunkOf(x, y), key = cx + ',' + cy; if (!by.has(key)) { const c = { key, n: 0, m: 0, t: 0 }; by.set(key, c); P.chunks.push(c); } by.get(key).n++; P.cells.push({ id: x + ',' + y, x, y, key }); }
      if (!P.home && P.cells.length) P.home = P.cells[0].x + ',' + P.cells[0].y;
      P.chunks.forEach((c, i) => { c.m = (L.half ? L.fill[i % 400] : 1) * D.capOf(c.n); });
      const ord = []; D.advance(P, 400 * DAYMS, G, (cell, at) => ord.push(cell.id + '@' + Math.round(at)));
      return ord.join(';');
    });
    const slow = runAll(C.components), fast = runAll(C), nFree = slow.reduce((a, s) => a + (s ? s.split(';').length : 0), 0);
    put(R, 'b_fast', slow.every((s, i) => s === fast[i]) && nFree > 3000, `땅 ${lands.length} · 풀린 칸 ${nFree} · 차례 · 시각 다른 땅 ${slow.filter((s, i) => s !== fast[i]).length}`);
    // ⓓ 복도 막힘 — 집 덩이 4×4 · 복도 12(y = 1) · 먼 덩이 4×4. 복도 청크만 반쯤 빈 채 떠남(나머지 가득)
    const corr = (give) => {
      const blob = (x0) => { const o = []; for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) o.push([x0 + x, y]); return o; };
      const path = []; for (let x = 4; x <= 15; x++) path.push([x, 1]);
      const P = { chunks: [], cells: [], home: '0,0', debt: 0, t: 0, others: 0 }, by = new Map(), pk = new Set(path.map(([x, y]) => x + ',' + y));
      for (const [x, y] of [...blob(0), ...path, ...blob(16)]) { const [cx, cy] = D.chunkOf(x, y), key = cx + ',' + cy; if (!by.has(key)) { const c = { key, n: 0, m: 0, t: 0, path: true }; by.set(key, c); P.chunks.push(c); } const c = by.get(key); c.n++; if (!pk.has(x + ',' + y)) c.path = false; P.cells.push({ id: x + ',' + y, x, y, key }); }
      for (const c of P.chunks) c.m = D.capOf(c.n);
      const N = P.cells.length, half = D.daysOf(N) / 2;
      D.advance(P, half * DAYMS, C, null, null, { splitOk: give });
      for (const c of P.chunks) if (!c.path) D.addPts(P, c, 1e12);
      const pathZero = half + D.daysOf(N) / 2;   // 복도 청크가 바닥나는 날(같은 N 이면)
      const hits = []; D.advance(P, (pathZero + 3) * DAYMS, C, (cell, at) => hits.push([cell.id, at / DAYMS]), null, { splitOk: give });
      return { left: P.cells.length, hits, home: P.cells.some((c) => c.id === '0,0'), blobLeft: P.cells.filter((c) => c.x < 4).length, far: P.cells.filter((c) => c.x >= 16).length };
    };
    const A = corr(false), B = corr(true);
    put(R, 'd_wait', A.hits.length === 0 && A.left === 44, `㉠ 복도만 바닥난 뒤 3일 — 풀린 칸 ${A.hits.length} · 남음 ${A.left}`);
    put(R, 'd_give', B.far === 16 && B.blobLeft === 16 && B.home && B.hits.length >= 2 && new Set(B.hits.map((h) => h[1].toFixed(6))).size === B.hits.length, `셋째 안(T1402 \`T1402_SPLIT_OK\`) 풀린 칸 ${B.hits.length}(먼 덩이 남음 ${B.far}/16 · 집 덩이 ${B.blobLeft}/16) · 한 순간에 최대 ${B.hits.length ? 1 + B.hits.length - new Set(B.hits.map((h) => h[1].toFixed(6))).size : 0}칸`);
  } catch (e) { R.err = String((e && e.stack) || e).slice(0, 400); }
  console.log('@@T1389 ' + JSON.stringify(R));
  process.exit(0);
}

// ── 아이 ③ 숫자 상한(S0 = 9) 문구 — 켬 · 끔 둘 다(부모가 `T1305_DEEDS` 를 준다) ──
if (MODE === 'cap') {
  Object.assign(process.env, { ZONE_ID: 'hanbando', ENABLE_VILLAGES: '0', ENABLE_WILDLIFE: '0', ENABLE_BANDITS: '0', ENABLE_ROADS: '0', CLAIM_ABSENCE: '0' });
  const _l = console.log, _w = console.warn, _e = console.error; console.log = () => {}; console.warn = () => {}; console.error = () => {};
  const Zone = require(path.join(ROOT, 'server', 'zone.js'));
  console.log = _l; console.warn = _w; console.error = _e;
  const H = Zone.__testBind(), SZ = H.BUILDING_SIZE, R = {};
  try {
    const msgs = [], ws = { readyState: 1, send: (s) => { try { msgs.push(JSON.parse(s)); } catch (e) {} } };
    const p = { pid: 'p_cap', playerId: 't1389_cap', name: 'cap', persistent: false, ws, x: 0, y: 0, vx: 0, vy: 0, floor: 0, hp: 100, maxHp: 100, hunger: 100, thirst: 100, inventory: { wood: 9999, stone: 9999 }, equipment: [], equipSlots: {}, craftSkill: {} };
    H.players.set(p.pid, p);
    //   끔은 영토 문(내 마을 땅 · 온보딩 빈터)이 숫자 상한보다 뒤라, 이어진 9칸을 먼저 놓아 두고(종전 상한까지 찬 사람) 세 칸을 더 청한다 · 켬은 12칸 다 청한다
    const seed = H.Deeds.ON ? 0 : 9;
    for (let i = 0; i < seed; i++) { const id = 't1389cap' + i; H.claims.set(id, { id, ownerPid: p.playerId, ownerName: p.name, x: (54000 + i) * SZ, y: 54000 * SZ, w: SZ, h: SZ, kind: 'personal', state: 'active' }); }
    for (let i = seed; i < 12; i++) { p.x = (54000 + i) * SZ + SZ / 2; p.y = 54000 * SZ + SZ / 2; H.tryClaim(p, 'personal'); }
    const live = [...H.claims.values()].filter((c) => c.ownerPid === p.playerId && c.kind === 'personal').length;
    const cap = msgs.filter((m) => m.type === 'notice' && /한도/.test(m.text || '')).map((m) => m.text);
    R.cap = { on: H.Deeds.ON, live, cap: cap.length, text: cap[0] || '' };
  } catch (e) { R.err = String((e && e.stack) || e).slice(0, 400); }
  console.log('@@T1389 ' + JSON.stringify(R));
  for (const f of [process.env.DB_PATH, process.env.DB_PATH + '-wal', process.env.DB_PATH + '-shm']) { try { fs.unlinkSync(f); } catch (e) {} }
  process.exit(0);
}

// ── 아이 ② 존(정본 경로 · 켬) ──
if (MODE === 'zone') {
  Object.assign(process.env, { ZONE_ID: 'hanbando', ENABLE_VILLAGES: '0', ENABLE_WILDLIFE: '0', ENABLE_BANDITS: '0', ENABLE_ROADS: '0', CLAIM_ABSENCE: '1', T1305_DEEDS: '1', T1305_CARE_S: '1' });
  const _l = console.log, _w = console.warn, _e = console.error; console.log = () => {}; console.warn = () => {}; console.error = () => {};
  const Zone = require(process.env.__T1389_ZONE || path.join(ROOT, 'server', 'zone.js'));
  console.log = _l; console.warn = _w; console.error = _e;
  const H = Zone.__testBind();
  const { claims, players, BUILDING_SIZE: SZ } = H, D = H.Deeds, DM = D.CFG.DAY_MS;
  const T0 = +process.env.__T1389_T0; let T = T0; H._t1332SetClock(() => T);
  const R = {};
  const mk = (name) => { const msgs = []; const ws = { readyState: 1, send: (s) => { try { msgs.push(JSON.parse(s)); } catch (e) {} } }; const p = { pid: 'p_' + name, playerId: 't1389_' + name, name, persistent: false, ws, msgs, x: 0, y: 0, vx: 0, vy: 0, floor: 0, hp: 100, maxHp: 100, hunger: 100, thirst: 100, inventory: { wood: 9999, stone: 9999 }, equipment: [], equipSlots: {}, craftSkill: {} }; players.set(p.pid, p); return p; };
  const claimAt = (p, cx, cy) => { p.x = cx * SZ + SZ / 2; p.y = cy * SZ + SZ / 2; H.tryClaim(p, 'personal'); };
  const live = (pid) => [...claims.values()].filter((c) => c.ownerPid === pid && c.kind === 'personal' && (c.state || 'active') !== 'free').map((c) => Math.floor(c.x / SZ) + ',' + Math.floor(c.y / SZ)).sort();
  (async () => {
    try {
      // ⓒ 틱 예산으로 잘라 이은 셈 = 한 번에 셈한 셈 — 같은 땅 둘(20×20 · 400칸) · 30일 안 들어옴
      const mkLand = (name, X0) => { const p = mk(name); for (let y = 0; y < 20; y++) for (let x = 0; x < 20; x++) claimAt(p, X0 + x, 50000 + y); players.delete(p.pid); return p.playerId; };
      const a = mkLand('once', 50000), b = mkLand('slice', 51000);
      T = T0 + 30 * DM;
      H._t1343Advance(a, T);
      let parts = 0; for (let k = 0; k < 4000; k++) { const r = H._t1343Advance(b, T, true, { budgetMs: 1e-9 }); parts++; if (r.done) break; }
      H._t1389Pending.clear();
      const sa = live(a).map((k) => k.split(',').map(Number)).map(([x, y]) => (x - 50000) + ',' + (y - 50000)), sb = live(b).map((k) => k.split(',').map(Number)).map(([x, y]) => (x - 51000) + ',' + (y - 50000));
      const da = (H.deedDebt.get(a) || {}).debt, db2 = (H.deedDebt.get(b) || {}).debt;
      const ra = [...H.deedChunks.values()].filter((r) => r.pid === a).map((r) => [r.cx - D.chunkOf(50000, 0)[0], r.cy, +r.m.toFixed(6)]).sort().join(';');
      const rb = [...H.deedChunks.values()].filter((r) => r.pid === b).map((r) => [r.cx - D.chunkOf(51000, 0)[0], r.cy, +r.m.toFixed(6)]).sort().join(';');
      put(R, 'c_slice', parts >= 3 && sa.length > 0 && sa.length < 400 && JSON.stringify(sa.sort()) === JSON.stringify(sb.sort()) && Math.abs(da - db2) < 1e-6 && ra === rb, `한 번 ${sa.length}칸 · 빚 ${(+da).toFixed(3)} / ${parts}토막 ${sb.length}칸 · 빚 ${(+db2).toFixed(3)} · 청크 줄 ${ra === rb ? '같음' : '다름'}`);
      // ⓗ 다시 선포가 빚 · 빚 시계를 안 건드린다(PM 덧붙임 Q12) — 30칸(6 × 5) · 27일 안 들어와 바닥 · 빚이 도는 땅에서
      {
        const q = mk('q12'), X0 = 55000, Y0 = 55000;
        for (let y = 0; y < 5; y++) for (let x = 0; x < 6; x++) claimAt(q, X0 + x, Y0 + y);
        players.delete(q.pid); T = T0 + 30 * DM + 27 * DM;   // ⓒ 뒤 시각에서 이어(셈 시각은 거꾸로 안 간다) · D(30) = 26.7일 → 모든 청크 바닥 · 빚이 돈다 · 첫 풀림(27.6일) 앞
        const fc = () => { const st = H._t1343Advance(q.playerId, T, true); return Deeds_first(st.P); };
        const Deeds_first = (P) => D.forecast(P, T, H.Claims).first;
        const f0 = fc(); players.set(q.pid, q);
        // ⓐ 집에서 먼 쪽 끝 칸 하나를 내놓고 그 자리를 다시 선포
        const far = [...claims.values()].find((c) => c.ownerPid === q.playerId && (c.state || 'active') !== 'free' && Math.floor(c.x / SZ) === X0 + 5 && Math.floor(c.y / SZ) === Y0 + 4);
        q.x = far.x + SZ / 2; q.y = far.y + SZ / 2; H.tryUnclaim(q, far.id); claimAt(q, X0 + 5, Y0 + 4);
        const f1 = fc();
        // ⓑ 빚으로 풀린 내 칸을 다시 선포 — 빚이 한 칸 몫 차도록 시계를 흘려 한 칸 풀리게 한 뒤
        T = Math.max(T, f1) + 1000; H._t1343Advance(q.playerId, T, true);
        const freed = [...claims.values()].find((c) => c.ownerPid === q.playerId && c.state === 'free');
        const f2a = fc(); if (freed) { q.x = freed.x + SZ / 2; q.y = freed.y + SZ / 2; H.tryClaim(q, 'personal'); }
        const f2 = fc(), back = !!freed && (claims.get(freed.id) || {}).state !== 'free';
        players.delete(q.pid);
        const hr = (a, b) => ((b - a) / 3600000).toFixed(2);
        put(R, 'h_reclaim', Number.isFinite(f0) && f0 > T0 && f1 - f0 < 3600000 && back && f2 - f2a < 3600000, `ⓐ 내놓고 다시 선포: 다음 풀림 ${hr(f0, f1)}시간 늦춤 · ⓑ 풀린 칸 다시 선포(${back ? '됨' : '안 됨'}): ${hr(f2a, f2)}시간 늦춤(한 시간 안이어야)`);
      }
      // ⓔ 부재 훑기 — central 을 이 판이 대신 답한다(하루 전 · 50일 전)
      const central = require(path.join(ROOT, 'server', 'central-client.js'));
      const now = Date.now(); T = now;
      const q1 = mk('away1'), q2 = mk('away50'); claimAt(q1, 52000, 52000); claimAt(q2, 52100, 52000); players.delete(q1.pid); players.delete(q2.pid);
      central.getPlayer = async (id) => ({ player_id: id, last_seen: id === q1.playerId ? now - DM : now - 50 * DM, tribe_id: null, tools_json: '{}' });
      await H.Claims.scanAbsence();
      const s1 = [...claims.values()].find((c) => c.ownerPid === q1.playerId).state || 'active', s2 = [...claims.values()].find((c) => c.ownerPid === q2.playerId).state || 'active';
      put(R, 'e_absence', s1 === 'active' && s2 === 'free', `하루 전 나감 ${s1} · 50일 전 ${s2}`);
      // ⓕ 계량기 — 1초 안 두 번째 보냄은 1초 끝에
      const m = mk('meter'); T = now; claimAt(m, 53000, 53000);
      m.msgs.length = 0; claimAt(m, 53001, 53000);
      const nowN = () => { const x = m.msgs.filter((q) => q.type === 'deeds_meter').pop(); return x ? x.N : null; };
      const n0 = nowN(), w0 = Date.now(); while (nowN() !== 2 && Date.now() - w0 < 5000) await new Promise((r) => setTimeout(r, 100)); const n1 = nowN(), waited = Date.now() - w0;   // 1초 끝 + 바쁜 판 여유(버려졌으면 끝내 안 온다)
      put(R, 'f_trail', n1 === 2, `둘째 칸 직후 계량기 N ${n0} → ${waited} ms 뒤 ${n1}`);
    } catch (e) { R.err = String((e && e.stack) || e).slice(0, 400); }
    console.log('@@T1389 ' + JSON.stringify(R));
    for (const f of [process.env.DB_PATH, process.env.DB_PATH + '-wal', process.env.DB_PATH + '-shm']) { try { fs.unlinkSync(f); } catch (e) {} }
    process.exit(0);
  })();
} else if (!MODE) {
  // ── 부모 ──
  let pass = 0, fail = 0;
  const ok = (c, m, x) => { c ? pass++ : fail++; console.log((c ? '  ✓ ' : '  ✗ ') + m + (x !== undefined && x !== '' ? `  ${x}` : '')); };
  const T0 = Math.floor(Date.now() / DAYMS) * DAYMS + 1000 * DAYMS;
  const run = (mode, env) => {
    let out = '';
    try { out = execFileSync(process.execPath, [__filename], { env: Object.assign({}, process.env, { __T1389_MODE: mode, __T1389_T0: String(T0), DB_PATH: `/tmp/test-t1389-${process.pid}-${Math.random().toString(36).slice(2, 8)}.db`, PORT: String(require('./lib-port').port(37700)) }, env || {}), encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 300000, maxBuffer: 16 * 1024 * 1024 }); }
    catch (e) { out = String((e && e.stdout) || ''); }
    const m = /@@T1389 (\{.*\})/.exec(out); return m ? JSON.parse(m[1]) : null;
  };
  const show = (R, k, msg) => ok(!!R && R[k] === true, msg, R ? (R[k + '#'] || R.err || '') : '아이 판 없음');
  console.log('\n=== T1389 사유지 돌봄 켬 준비 — 빠른 셈 · 틱 예산 · 복도 막힘 · 부재 훑기 · 계량기 ===');
  const RP = run('pure');
  show(RP, 'a_same', 'ⓐ 정수 열쇠 덩이 세기 · 이웃 무리 갈라짐 판정 = 종전 글자(무작위 집합 1,500 · 칸 빼기 판정 만 넘게)');
  show(RP, 'b_fast', 'ⓑ 셈 빠른 길(claims 정본 객체) = 종전 길(술어 함수) — 무작위 땅 40판 풀림 차례 · 시각');
  show(RP, 'd_wait', 'ⓓ ㉠(끔 기본) 복도 청크만 바닥나면 목 칸뿐이라 기다린다(풀린 칸 0)');
  show(RP, 'd_give', 'ⓓ 셋째 안(★T1402 판정 20 `T1402_SPLIT_OK`) — 복도 칸이 목이어도 한 칸씩 풀리고 먼 덩이 · 집 덩이 16칸 그대로(㉡ `T1389_NECK_GIVE` 는 거뒀다)');
  const RZ = run('zone');
  show(RZ, 'c_slice', 'ⓒ 존 셈을 틱 예산으로 잘라 이어도(400칸 · 30일) 한 번에 셈한 것과 같다 — 남은 칸 · 빚 · 청크 저축');
  show(RZ, 'h_reclaim', 'ⓗ 다시 선포가 빚 · 빚 시계를 안 건드린다(Q12) — 빚 선 30칸에서 내놓고 다시 · 풀린 칸 다시 → 다음 풀림이 한 시간 넘게 안 늦춰진다');
  show(RZ, 'e_absence', 'ⓔ 부재 훑기 — 하루 전 나간 주인 칸은 그대로 · 50일 전이면 free(ms 시각을 그대로 뺀다)');
  show(RZ, 'f_trail', 'ⓕ 계량기 — 1초 안 두 번째 보냄은 1초 끝에 보낸다(둘째 칸 직후 N = 2)');
  {
    const on = run('cap', { T1305_DEEDS: '1' }), off = run('cap', { T1305_DEEDS: '0' }), a = on && on.cap, b = off && off.cap;
    ok(!!a && !!b && a.on === true && a.live === 12 && a.cap === 0 && b.on === false && b.live === 9 && b.cap === 3 && /한도 9/.test(b.text), 'ⓖ 숫자 상한(S0 = 9) — 켬: 12칸 다 서고 "한도" 문구 0 · 끔: 9칸에서 멈추고 "한도 9" 그대로',
      a && b ? `켬 ${a.live}칸 · 한도 문구 ${a.cap} / 끔 ${b.live}칸 · 한도 문구 ${b.cap}(${b.text})` : String((on && on.err) || (off && off.err) || '아이 판 없음'));
  }
  // ★미끼 셋 — 사본은 server/ 에(상대 require 그대로) · 판 끝에 지운다
  const rd = (f) => fs.readFileSync(path.join(ROOT, 'server', f), 'utf8');
  const CS = rd('claims.js'), DS = rd('deeds.js'), ZS = rd('zone.js');
  const tmp = (tag, ext) => path.join(ROOT, 'server', `_t1389bait-${tag}-${process.pid}${ext || ''}.js`);
  const withFiles = (files, fn) => { try { for (const [f, s] of files) fs.writeFileSync(f, s); return fn(); } finally { for (const [f] of files) { try { fs.unlinkSync(f); } catch (e) {} } } };
  {
    const from = '      for (const nk of [c + _IK, c - _IK, c + 1, c - 1]) if (S.has(nk) && !seen.has(nk)) { seen.add(nk); st.push(nk); }';
    const n = CS.split(from).length - 1, f = tmp('nb');
    const RB = withFiles([[f, CS.split(from).join('      for (const nk of [c + _IK, c - _IK, c + 1]) if (S.has(nk) && !seen.has(nk)) { seen.add(nk); st.push(nk); }')]], () => run('pure', { __T1389_CLAIMS: f }));
    ok(n === 1 && !!RB && RB.a_same === false && RB.d_wait === true, '★미끼 ① — 정수 이웃 하나(y − 1)를 빼먹은 claims 사본 → ⓐ 빨강(ⓓ ㉠ 은 초록)', `바꾼 자리 ${n} · a_same=${RB && RB.a_same} d_wait=${RB && RB.d_wait}`);
  }
  {
    const from = '      const want = stageFor(c, now - Number(row.last_seen));';
    const n = CS.split(from).length - 1, fc = tmp('abs'), fz = tmp('abs', '-zone');
    const RB = withFiles([[fc, CS.split(from).join('      const want = stageFor(c, now - (row.last_seen | 0));')], [fz, ZS.split("require('./claims')").join(`require('./${path.basename(fc, '.js')}')`)]], () => run('zone', { __T1389_ZONE: fz }));
    ok(n === 1 && !!RB && RB.e_absence === false && RB.f_trail === true, '★미끼 ② — 부재 시각을 `| 0` 으로 되돌린 claims 사본 → ⓔ 빨강(ⓕ 는 초록)', `바꾼 자리 ${n} · e_absence=${RB && RB.e_absence} f_trail=${RB && RB.f_trail} · ${RB ? (RB['e_absence#'] || RB.err || '') : ''}`);
  }
  {
    const from = "    if (budget && it > 1 && Date.now() - t0 > budget) { done = false; break; }";
    const n = DS.split(from).length - 1, fd = tmp('jump'), fz = tmp('jump', '-zone');
    const RB = withFiles([[fd, DS.split(from).join("    if (budget && it > 1 && Date.now() - t0 > budget) { done = false; T = now; break; }")], [fz, ZS.split("require('./deeds')").join(`require('./${path.basename(fd, '.js')}')`)]], () => run('zone', { __T1389_ZONE: fz }));
    ok(n === 1 && !!RB && RB.c_slice === false && RB.e_absence === true, '★미끼 ③ — 예산에서 멈출 때 셈 시각을 지금으로 건너뛰는 deeds 사본 → ⓒ 빨강(ⓔ 는 초록)', `바꾼 자리 ${n} · c_slice=${RB && RB.c_slice} e_absence=${RB && RB.e_absence} · ${RB ? (RB['c_slice#'] || RB.err || '') : ''}`);
  }
  {
    const from = "  if (why === 'claim') Deeds.addClaim(P, w, pts == null ? Deeds.CFG.PT : pts);";
    const n = ZS.split(from).length - 1, fz = tmp('claim', '-zone');
    const RB = withFiles([[fz, ZS.split(from).join("  if (why === 'claim') Deeds.addPts(P, w, pts == null ? Deeds.CFG.PT : pts);")]], () => run('zone', { __T1389_ZONE: fz }));
    ok(n === 1 && !!RB && RB.h_reclaim === false && RB.e_absence === true, '★미끼 ④ — 선포의 +PT 를 일한 점수 길(빚부터)로 되돌린 존 사본 → ⓗ 빨강(ⓔ 는 초록)', `바꾼 자리 ${n} · h_reclaim=${RB && RB.h_reclaim} e_absence=${RB && RB.e_absence} · ${RB ? (RB['h_reclaim#'] || RB.err || '') : ''}`);
  }
  console.log(`\n=== T1389 사유지 켬 준비: ${pass} 통과 / ${fail} 실패 ===`);
  process.exit(fail ? 1 : 0);
}
