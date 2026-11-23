#!/usr/bin/env node
// @regress   ← 통합 러너가 이 표를 보고 자기 목록을 만든다(scripts/run-regress.sh · 표 없으면 안 돈다)
// @bait 3
// === scripts/test-t1403-small-hut.js — [T1403 덧붙임 · 재민 11-20 판정 24 · 25] 간이 움집 화덕 하나 · 다 풀린 사람의 아홉 칸 다시 잡기 ====================
//
// ★재민이 정한 것(카드 덧붙임 글자 그대로):
//   판정 24 "ㅇㅋ 가" — 간이 움집도 완공하면 화덕 하나(3×3 안 한 칸 — 기둥 줄 · 문 안 칸을 피해 · 값 따로 0 · 완공 전 불 0) ·
//     서버의 불(`isNearCampfire` 몸 데우기 · 요리 시설)은 6×4 화덕과 같은 술어 · 그림 = 지금 모닥불 그림(클라 표에 간이 행 한 줄)
//   판정 25 "가로 고" — 땅이 0칸이면 언제든 첫 등록(아홉 칸 · 12 · 8) · 아홉 칸 길도 풀린 제 칸은 "다시 잡는 칸"(한 칸 길과 같은 술어)
//     · 남이 이미 이어받은 칸은 종전대로 "남의 땅"
// ★판 — A 정본 표(서버 · 클라 원문 · 프로세스 0) · B 실제 존 켬(`T1392_FIRST_LOT=1` · `T1341_OWN_HOUSE=1` · `T1305_DEEDS=1` · 사유지 시계는
//   `fixture-deeds-clock.js` 로 존을 띄운 채 민다) · C 실제 존 끔(`T1392_FIRST_LOT` 없음 — 간이 움집 · 아홉 칸 길이 안 선다 = 종전)
// ★미끼 셋(이 파일 안 · 바꾼 자리 정확히 1곳씩): ⓐ 간이를 여전히 빼는 캐리어 사본 ⓑ 화덕 칸이 기둥 줄과 겹치는 사본 ⓒ 풀린 제 칸을 막는 옛 아홉 칸 사본(존 원문 한 곳)
// ★날짜 · 벽시계 0(사유지 시계는 "켜진 시간 시계 + 민 날" — 날짜를 안 박는다).
// 실행: node scripts/test-t1403-small-hut.js [--skip-server]
'use strict';
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const ROOT = path.resolve(__dirname, '..');
const rd = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
const SKIP_SERVER = process.argv.includes('--skip-server');
let pass = 0, fail = 0;
const ok = (c, m, x) => { c ? pass++ : fail++; console.log((c ? '  ✓ ' : '  ✗ ') + m + (x !== undefined && x !== '' ? `  ${x}` : '')); return !!c; };
const sec = (t) => console.log('\n' + t);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const tmp = [];
process.on('exit', () => { for (const f of tmp) { try { fs.rmSync(f, { recursive: true, force: true }); } catch (e) {} } });

// ── A. 정본 표 ────────────────────────────────────────────────────────────────
const HS = require(path.join(ROOT, 'server', 'hut-stages.js'));
const HH = require(path.join(ROOT, 'server', 'hut-hearth.js'));
//   간이 움집 3×3 — 앵커 (x1, y1) 상대 칸: 가운데 (−1, −1) · 기둥 줄 = 가운데 줄 dy −1(기둥 자리 `SMALL_POSTS` 는 가운데 칸 서 · 동 변) · 문 안 칸 = 남쪽 줄 가운데 (−1, 0)
const placeOk = (H) => {
  const S = H.HEARTHS_SMALL || [];
  if (S.length !== 1) return false;
  const { dx, dy } = S[0];
  const inside = dx >= -2 && dx <= 0 && dy >= -2 && dy <= 0;
  const postRow = HS.SMALL_POSTS.some(([fx, fy]) => Math.abs(fy) < 0.5) && dy === -1;   // 기둥이 선 줄(가운데 줄)
  const doorIn = dx === -1 && dy === 0;
  return inside && !postRow && !doorIn;
};
const carrierOk = (H) => {   // 간이 움집 캐리어(발자국 남동단 바닥 한 칸 · `small`) → 화덕 하나 · 6×4 캐리어 → 둘(무변)
  const sm = { type: 'floor', x: 12 * 32 + 16, y: 12 * 32 + 16, data: { floor: 0, hut: [10, 10, 12, 12], small: 1 } };
  const big = { type: 'floor', x: 15 * 32 + 16, y: 13 * 32 + 16, data: { floor: 0, hut: [10, 10, 15, 13] } };
  return H.isCarrier(sm, 32) && H.isCarrier(big, 32) && H.hearthsOf(sm.data.hut, 32, true).length === 1 && H.hearthsOf(big.data.hut, 32).length === 2;
};
sec('A1 간이 움집 화덕 자리 — 3×3 안 · 기둥 줄 · 문 안 칸을 피함(남는 바닥 칸 = 9 − 문 안 1 − 화덕 1 = 7)');
ok(placeOk(HH), '화덕 하나 · 북쪽 줄 가운데(앵커 + (−1, −2)) — 기둥 둘 사이 줄 밖 · 문 안 칸 밖 · 문에서 두 기둥 사이로 곧장 닿는 맞은편', JSON.stringify(HH.HEARTHS_SMALL));
ok(carrierOk(HH), '캐리어 — 간이 움집 바닥 남동단 한 칸도 캐리어(화덕 하나) · 6×4 는 둘 그대로', '');
ok(JSON.stringify(HH.HEARTHS) === '[{"key":"yard","dx":-2,"dy":2},{"key":"in","dx":-2,"dy":-1}]', '6×4 화덕 자리 무변(마당 (−2, +2) · 실내 (−2, −1) — 바이트)', JSON.stringify(HH.HEARTHS));
{
  const c36 = rd('public/client/36-r2-building.js');
  const m = c36.match(/building\?\.data\?\.small && Array\.isArray\(building\.data\.hut\)\) \{\s*const _h = building\.data\.hut, _dx = Math\.floor\(building\.x \/ 32\) - _h\[2\], _dy = Math\.floor\(building\.y \/ 32\) - _h\[3\];\s*if \(_dx === (-?\d+) && _dy === (-?\d+)\) \{[\s\S]{0,400}?drawPropBody\('campfire'/);
  const I = (HH.HEARTHS_SMALL || [])[0] || {};
  ok(!!m && +m[1] === I.dx && +m[2] === I.dy, '클라 그림 — 간이 움집 바닥 그 칸에 모닥불 몸(`campfire`) · 자리 = 서버 표 그대로', m ? `${m[1]},${m[2]} ↔ ${I.dx},${I.dy}` : '글자 없음');
}
{   // 미끼 ⓐ · ⓑ — hut-hearth 사본
  const src = rd('server/hut-hearth.js');
  const La = "  const h = b && b.type === 'floor' && b.data && b.data.hut;";
  const Lb = "  { key: 'in', dx: -1, dy: -2 },      // 실내 화덕(북쪽 줄 가운데)";
  const ca = src.split(La).length - 1, cb = src.split(Lb).length - 1;
  const fa = path.join(ROOT, 'server', `_t1403h_bait_a_${process.pid}.js`), fb = path.join(ROOT, 'server', `_t1403h_bait_b_${process.pid}.js`);
  fs.writeFileSync(fa, src.replace(La, "  const h = b && b.type === 'floor' && b.data && !b.data.small && b.data.hut;")); tmp.push(fa);
  fs.writeFileSync(fb, src.replace(Lb, "  { key: 'in', dx: -1, dy: -1 },")); tmp.push(fb);
  const HA = require(fa), HB = require(fb);
  ok(ca === 1 && !carrierOk(HA), '★미끼 ⓐ 바꾼 자리 1곳(캐리어 줄 — 간이를 여전히 뺀다 · T1392 사본) — 캐리어 줄이 빨강', `${ca}곳`);
  ok(cb === 1 && !placeOk(HB), '★미끼 ⓑ 바꾼 자리 1곳(간이 화덕 칸 → 가운데 칸 · 기둥 줄과 겹침) — 자리 줄이 빨강', `${cb}곳 · ${JSON.stringify(HB.HEARTHS_SMALL)}`);
}
sec('A2 서버 불 — 6×4 화덕과 같은 술어(새 술어 0)');
{
  const z = rd('server/zone.js');
  ok(/HutHearth\.hearthsOf\(carrier\.data\.hut, BUILDING_SIZE, !!carrier\.data\.small\)/.test(z) && /T1066_VILLAGE_FIRE && HutHearth\.isCarrier\(b, BUILDING_SIZE\)\) for \(const e of _t1066Hearths\(b\)\)/.test(z),
    '화덕은 시설 목록(`_facilities`) 한 길 — 요리 창 · 몸 데우기(`isNearCampfire` → `_bldNear`)가 같은 목록', '');
  ok(/function _myFreeRetake\(pid, c, on\) \{ return !!on && c\.ownerPid === pid && \(c\.state \|\| 'active'\) === 'free'; \}/.test(z)
    && /_myFreeRetake\(player\.playerId, victim, _t1305P\) \? \{ ok: true, why: '풀린 내 땅을 다시 잡음' \}/.test(z) && /cs\.length === 1 && _myFreeRetake\(pid, c, Deeds\.ON\)/.test(z),
    '풀린 내 칸 — 한 칸 길과 아홉 칸 길이 같은 술어 하나(`_myFreeRetake` · 사본 0)', '');
}

// ── B · C. 실제 존 ────────────────────────────────────────────────────────────
async function serverArm(mode, zoneFile, slot) {   // mode: 'on' | 'off' | 'bait'
  const WebSocket = require('ws');
  const FB = require('./fixture-boot');
  const LP = require('./lib-port');
  const base = LP.ports(4, 39730 + slot * 10), CP = base, ZP = base + 2;
  const RUN = fs.mkdtempSync(`/tmp/t1403h-${mode}-`); tmp.push(RUN); require('./lib-tmp').own(RUN);
  const DFILE = path.join(RUN, 'deeds-clock');
  const procs = [];
  const env = Object.assign({}, process.env, { T1341_OWN_HOUSE: '1', T1305_DEEDS: '1', T1403_DEEDS_CLOCK_FILE: DFILE,
    NODE_OPTIONS: `${process.env.NODE_OPTIONS || ''} --require ${path.join(__dirname, 'fixture-deeds-clock.js')}`.trim() });
  env.T1392_FIRST_LOT = mode !== 'off' ? '1' : '0';   // ★[T1428] 끔 판은 글자로 끈다(-on 가지는 돌봄과 같이 켬 기본 후보)
  const boot = (file, e, db) => { const p = spawn(process.execPath, [path.join(ROOT, 'server', file)], { cwd: ROOT, env: Object.assign({}, env, e, { DB_PATH: db }), stdio: ['ignore', 'pipe', 'pipe'] }); p.stdout.on('data', () => {}); p.stderr.on('data', () => {}); procs.push(p); return p; };
  const down = async () => { for (const p of procs) { try { p.kill('SIGTERM'); } catch (e) {} } await sleep(800); for (const p of procs) { try { p.kill('SIGKILL'); } catch (e) {} } };
  const out = {};
  try {
    const cen = boot('central.js', { PORT: String(CP), PUBLIC_HOST: 'localhost', ENABLED_ZONES: 'hanbando' }, path.join(RUN, 'c.db'));
    const zon = boot(zoneFile, { PORT: String(ZP), ZONE_ID: 'hanbando', CENTRAL_URL: `http://localhost:${CP}`, ENABLE_VILLAGES: '1', ENABLE_BANDITS: '0', ENABLE_ROADS: '0', ENABLE_WILDLIFE: '0', VILLAGE_MAX: '4', E2E_GIVE: '1' }, path.join(RUN, 'z.db'));
    const a = await FB.waitUp(cen, /central server up on/, { name: 'central' }), b = await FB.waitUp(zon, /zone server up on/, { name: 'zone', capMs: 400000 });
    if (!a.ok || !b.ok) { out.boot = false; return out; }
    out.boot = true;
    const waitFor = async (fn, ms) => { for (let t = 0; t < ms; t += 60) { const v = fn(); if (v) return v; await sleep(60); } return fn(); };
    const pushDeeds = async (days) => {   // 존을 띄운 채 사유지 시계만 민다(`fixture-deeds-clock.js`)
      try { fs.rmSync(DFILE + '.ack', { force: true }); } catch (e) {}
      fs.writeFileSync(DFILE, String(days)); zon.kill('SIGUSR2');
      return (await waitFor(() => { try { return fs.readFileSync(DFILE + '.ack', 'utf8'); } catch (e) { return null; } }, 5000)) === String(days);
    };
    const connect = (user) => new Promise((resolve, reject) => {
      const q = new URLSearchParams({ username: user, password: 'pw-' + user, name: user, color: '#5a9ae0' });
      const ws = new WebSocket(`ws://localhost:${ZP}/?${q}`);
      const P = { ws, user, inv: {}, notices: [], mine: new Map(), all: new Map(), blds: new Map(), prev: [], fac: [], warm: [], W: null };
      const hb = setInterval(() => { try { if (ws.readyState === 1) ws.send(JSON.stringify({ type: 'ping', t: 0 })); } catch (e) {} }, 5000);
      const to = setTimeout(() => reject(new Error('접속 시간초과')), 90000);
      ws.on('close', () => clearInterval(hb));
      ws.on('message', (raw) => {
        let m; try { m = JSON.parse(String(raw)); } catch (e) { return; }
        const putC = (c) => { if (!c || (c.kind || 'personal') !== 'personal') return; P.all.set(c.id, c); if (c.ownerPid === P.pid) P.mine.set(c.id, c); else P.mine.delete(c.id); };
        if (m.type === 'welcome') { P.W = m; P.inv = m.inventory || {}; P.pid = m.playerId || m.pid; for (const c of m.claims || []) putC(c); clearTimeout(to); resolve(P); }
        else if (m.type === 'inventory') P.inv = m.inventory || {};
        else if (m.type === 'notice') P.notices.push(m);
        else if (m.type === 'lot_preview') P.prev.push(m);
        else if (m.type === 'facility') P.fac.push(m);
        else if (m.type === '__e2e_warm') P.warm.push(m.warm);
        else if (m.type === 'claim_added' || m.type === 'claim_updated') putC(m.claim);
        else if (m.type === 'claim_removed') { P.mine.delete(m.id); P.all.delete(m.id); }
        else if (m.type === 'claim_state') { const c = P.all.get(m.id); if (c) c.state = m.state; }
        else if (m.type === 'building_added' && m.building) P.blds.set(m.building.id, m.building);
        else if (m.type === 'buildings_spawn') for (const bb of m.buildings || []) P.blds.set(bb.id, bb);
        else if (m.type === 'building_removed') P.blds.delete(m.id);
      });
      ws.on('error', (e) => { clearTimeout(to); reject(e); });
    });
    const send = (P, o) => { try { P.ws.send(JSON.stringify(o)); } catch (e) {} };
    const warp = async (P, x, y) => { const n0 = P.notices.length; send(P, { type: 'teleport_debug', x: Math.round(x), y: Math.round(y) }); await waitFor(() => P.notices.slice(n0).some((t) => /텔레포트/.test(t.text)), 3000); await sleep(150); };
    const give = async (P, items, tools) => { const n0 = P.notices.length; send(P, { type: '__e2e_give', items, tools }); await waitFor(() => P.notices.length > n0, 3000); await sleep(150); };
    const act = async (P, msg, until, ms) => { const k = P.notices.length, i0 = Object.assign({}, P.inv); send(P, msg); await waitFor(() => (until && until()) || P.notices.length > k, ms || 3000); await sleep(250);
      const d = {}; for (const kk of new Set([...Object.keys(i0), ...Object.keys(P.inv)])) { const v = (P.inv[kk] | 0) - (i0[kk] | 0); if (v) d[kk] = v; }
      return { said: P.notices.slice(k).map((n) => n.text).join(' | '), d }; };
    const ask = async (P, type, arr) => { const k = P[arr].length; send(P, { type }); await waitFor(() => P[arr].length > k, 2000); return P[arr].length > k ? P[arr][P[arr].length - 1] : null; };
    const relog = async (P) => { try { P.ws.close(); } catch (e) {} await sleep(400); return connect(P.user); };
    const S = 32, at = (cx, cy) => ({ x: cx * S + S / 2, y: cy * S + S / 2 });
    const live = (P) => [...P.mine.values()].filter((c) => (c.state || 'active') !== 'free');
    const cellKey = (c) => `${Math.floor(c.x / S)},${Math.floor(c.y / S)}`;
    const dupCells = (P) => { const m = new Map(); for (const c of P.all.values()) { if ((c.state || 'active') === 'free' && c.ownerPid !== P.pid) continue; const k = cellKey(c); m.set(k, (m.get(k) || 0) + 1); } return [...m.values()].filter((n) => n > 1).length; };
    //   다 풀리게 — 사유지 시계를 존을 띄운 채 민 뒤 다시 접속(셈) · 그래도 남는 칸(땅을 안 가르는 규칙 — 집 칸 · 목 칸)은 손으로 내놓는다(이사 꼴 · 판정 25 "손으로 다 내놓은 사람")
    const freeAll = async (P, days) => {
      const okp = await pushDeeds(days); P = await relog(P); await sleep(1500); P = await relog(P); await sleep(500);
      const stuck = live(P).map((c) => `${Math.floor(c.x / S)},${Math.floor(c.y / S)}`).sort();
      for (const c of live(P)) { send(P, { type: 'unclaim', claimId: c.id }); await waitFor(() => !P.mine.has(c.id) || (P.mine.get(c.id).state || 'active') === 'free', 3000); }
      await sleep(300);
      return { P, info: { push: okp, freed: [...P.mine.values()].filter((c) => c.state === 'free').length, stuck, left: live(P).length } };
    };
    //   아홉 칸 (cx, cy) 안의 풀린 내 칸 id — 다시 잡으면 이 id 가 그대로 살아나야 한다(새 행 0)
    const freeIn = (P, cx, cy) => [...P.mine.values()].filter((c) => c.state === 'free' && Math.abs(Math.floor(c.x / S) - cx) <= 1 && Math.abs(Math.floor(c.y / S) - cy) <= 1).map((c) => c.id).sort();
    const probe = async (P) => { const k = P.prev.length; send(P, { type: 'lot_probe' }); await waitFor(() => P.prev.length > k, 1500); return P.prev[P.prev.length - 1] || null; };
    let X = await connect('shX');
    const home = { x: X.W.self.homeX, y: X.W.self.homeY };
    const c0 = { x: Math.floor(home.x / S) - 24, y: Math.floor(home.y / S) + 8 };   // 빈 들(T1392 판 그 자리)
    await give(X, { wood: 80, stone: 80 }, ['pickaxe', 'axe']);
    await warp(X, at(c0.x, c0.y).x, at(c0.x, c0.y).y);
    const r1 = await act(X, { type: 'claim', kind: 'personal' }, () => X.mine.size > 0);
    await sleep(300);
    out.first = { n: live(X).length, ids: [...X.mine.keys()].sort(), said: r1.said };
    if (mode === 'bait') {   // 미끼 — 풀린 제 칸을 막는 옛 사본: 다 풀린 뒤 옛 자리 그대로
      const F = await freeAll(X, 2000); X = F.P; out.free1 = F.info;
      const want = freeIn(X, c0.x, c0.y);
      await warp(X, at(c0.x, c0.y).x, at(c0.x, c0.y).y);
      const pv = await probe(X); const ra = await act(X, { type: 'claim', kind: 'personal' }, () => live(X).length >= 9); await sleep(300);
      out.a = { prevBad: pv && pv.cells ? pv.cells.length : null, n: live(X).length, again: want.length, same: want.every((id) => live(X).some((c) => c.id === id)), said: ra.said };
      return out;
    }
    // 간이 움집 — 화덕(완공 전 불 0 · 완공 뒤 그 칸 곁 불 · 요리 시설)
    const mine = (b) => b.type === 'hut_site' && !(b.data && b.data.owner === 'npc');
    const h1 = await act(X, { type: 'hut_start', kind: 'small', atX: at(c0.x, c0.y).x, atY: at(c0.x, c0.y).y }, () => [...X.blds.values()].some(mine));
    const st = [...X.blds.values()].find(mine);
    out.site = st ? { x0: st.data.x0, y0: st.data.y0, x1: st.data.x1, y1: st.data.y1 } : { said: h1.said };
    if (!st || mode === 'off') return out;
    const hc = at(st.data.x0 + 1, st.data.y0);   // 화덕 칸(앵커 (x1, y1) + (−1, −2))
    await warp(X, hc.x, hc.y);
    const f0 = await ask(X, 'facility_ask', 'fac'), w0 = await ask(X, '__e2e_warm', 'warm');
    out.before = { fac: f0 && f0.near ? { btype: f0.near.btype, hearth: f0.near.hearth || null } : null, warm: w0 };
    await give(X, { pillar: 2, rafter: 5, fiber: 3, thatch: 3 });
    for (let i = 0; i < 4 && X.blds.has(st.id); i++) await act(X, { type: 'hut_advance', buildingId: st.id }, () => !X.blds.has(st.id) || ((X.blds.get(st.id) || {}).data || {}).stage > i + 1);
    out.done = !X.blds.has(st.id);
    await warp(X, hc.x, hc.y);
    const f1 = await ask(X, 'facility_ask', 'fac'), w1 = await ask(X, '__e2e_warm', 'warm');
    await warp(X, at(st.data.x0 - 12, st.data.y0).x, at(st.data.x0 - 12, st.data.y0).y);
    const w2 = await ask(X, '__e2e_warm', 'warm');
    await warp(X, hc.x, hc.y);
    await give(X, { berry: 3 });
    const ck = await act(X, { type: 'cook', recipe: 'berry_jam' }, () => (X.inv.berry | 0) < 3);
    out.after = { fac: f1 && f1.near ? { btype: f1.near.btype, hearth: f1.near.hearth || null, mine: f1.near.mine } : null, warm: w1, far: w2, cookBerry: X.inv.berry | 0, cookSaid: ck.said };
    // 다시 잡기 — 움집 없는 사람 W(움집이 선 칸을 손으로 내놓으면 그 바닥 · 벽이 아홉 칸을 막는다 — 보고 회부 · 여기서는 땅만 본다)
    const c1 = { x: c0.x, y: c0.y + 6 };
    let W = await connect('shW');
    await give(W, { wood: 80, stone: 80 });
    await warp(W, at(c1.x, c1.y).x, at(c1.x, c1.y).y);
    await act(W, { type: 'claim', kind: 'personal' }, () => W.mine.size >= 9); await sleep(300);
    out.firstW = live(W).length;
    // ⓐ — 다 풀린 사람이 옛 자리 그대로
    { const F = await freeAll(W, 2000); W = F.P; out.free1 = F.info; }
    const wantA = freeIn(W, c1.x, c1.y);
    await warp(W, at(c1.x, c1.y).x, at(c1.x, c1.y).y);
    const pa = await probe(W); const ra = await act(W, { type: 'claim', kind: 'personal' }, () => live(W).length >= 9); await sleep(300);
    W = await relog(W); await sleep(300);
    out.a = { prevBad: pa && pa.cells ? pa.cells.length : null, n: live(W).length, again: wantA.length, same: wantA.length > 0 && wantA.every((id) => live(W).some((c) => c.id === id)), dup: dupCells(W), said: ra.said, d: ra.d,
    };
    // ⓑ — 다시 다 풀린 뒤 옛 자리와 반쯤 겹치게(동쪽으로 한 칸 — 여섯 칸 다시 · 세 칸 새로)
    { const F = await freeAll(W, 4000); W = F.P; out.free2 = F.info; }
    const wantB = freeIn(W, c1.x + 1, c1.y);
    await warp(W, at(c1.x + 1, c1.y).x, at(c1.x + 1, c1.y).y);
    const pb = await probe(W); const rb = await act(W, { type: 'claim', kind: 'personal' }, () => live(W).length >= 9); await sleep(300);
    W = await relog(W); await sleep(300);
    const L2 = live(W);
    out.b = { prevBad: pb && pb.cells ? pb.cells.length : null, n: L2.length, again: wantB.length, same: wantB.length > 0 && wantB.every((id) => L2.some((c) => c.id === id)), fresh: L2.filter((c) => !wantB.includes(c.id)).length, dup: dupCells(W), said: rb.said, d: rb.d };
    // ⓒ — 다시 다 풀린 뒤 옛 칸 하나(가운데)를 남(Z · 제 땅이 따로 있는 사람)이 먼저 이어받는다 → 옛 자리 아홉 칸은 "남의 땅"
    { const F = await freeAll(W, 6000); W = F.P; out.free3 = F.info; }
    const tgt = freeIn(W, c1.x, c1.y).map((id) => W.mine.get(id))[0];   // 남이 먼저 이어받을 옛 칸(옛 자리 아홉 칸 안의 풀린 내 칸 하나)
    let Z = await connect('shZ');
    await give(Z, { wood: 60, stone: 60 });
    await warp(Z, at(c1.x, c1.y + 14).x, at(c1.x, c1.y + 14).y);
    await act(Z, { type: 'claim', kind: 'personal' }, () => Z.mine.size >= 9); await sleep(300);
    if (tgt) await warp(Z, tgt.x + S / 2, tgt.y + S / 2);
    const rz = await act(Z, { type: 'claim', kind: 'personal' }); await sleep(300);
    out.zTake = { at: tgt ? `${Math.floor(tgt.x / S) - c1.x},${Math.floor(tgt.y / S) - c1.y}` : null, said: rz.said };
    W = await relog(W); await sleep(300);
    await warp(W, at(c1.x, c1.y).x, at(c1.x, c1.y).y);
    const pc = await probe(W); const rc = await act(W, { type: 'claim', kind: 'personal' }); await sleep(300);
    out.c = { prevBad: pc && pc.cells ? pc.cells.map((q) => q[2] || q.why || q).join(',') : null, n: live(W).length, said: rc.said, d: rc.d, dup: dupCells(W) };
  } catch (e) { out.err = String(e && e.stack || e); }
  finally { await down(); }
  return out;
}

(async () => {
  if (SKIP_SERVER) { console.log(`\n=== ${pass + fail}건 중 PASS ${pass} · FAIL ${fail} === (--skip-server)`); process.exit(fail ? 1 : 0); }
  sec('B 실제 존 켬 — 간이 움집 화덕 · 다 풀린 사람의 다시 잡기');
  const B = await serverArm('on', 'zone.js', 0);
  ok(B.boot, '켬 존 기동', B.err || '');
  if (B.boot) {
    console.log(`    판: ${JSON.stringify(B)}`.slice(0, 2400));
    ok(B.first && B.first.n === 9 && B.done, '첫 집터 아홉 칸 · 간이 움집 완공', JSON.stringify([B.first && B.first.n, B.done]));
    ok(B.before && B.before.fac === null && B.before.warm === false, '★완공 전 — 화덕 칸 곁에 불 0(요리 시설 없음 · 몸 안 데움)', JSON.stringify(B.before));
    ok(B.after && B.after.warm === true && B.after.far === false, '★완공 뒤 — 그 칸 곁 `isNearCampfire` 참 · 열두 칸 밖은 거짓', JSON.stringify(B.after && [B.after.warm, B.after.far]));
    ok(B.after && B.after.fac && B.after.fac.btype === 'campfire' && B.after.fac.hearth === 'in' && B.after.fac.mine === true && B.after.cookBerry < 3, '★완공 뒤 — 요리 시설로 잡힘(모닥불 · 실내 · 내 것) · 요리가 얹힌다(열매가 나감)', JSON.stringify(B.after && [B.after.fac, B.after.cookBerry, B.after.cookSaid.slice(0, 40)]));
    ok(B.firstW === 9 && B.free1 && B.free1.push && B.free1.left === 0 && B.free1.freed >= 1, '사유지 시계를 존을 띄운 채 밀면 칸이 풀린다 · 남는 칸은 손으로 내놓아 땅 0칸(돌아온 사람 = 첫 등록)', JSON.stringify(B.free1));
    ok(B.a && B.a.prevBad === 0 && B.a.n === 9 && B.a.same && B.a.dup === 0 && B.a.d.wood === -12 && B.a.d.stone === -8, '★ⓐ 옛 자리 그대로 — 미리보기 막힘 0 · 풀린 내 칸은 그 행 그대로 다시 잡음 · 나머지는 새로 · 합 아홉 · 겹침 0 · 값 12 · 8', JSON.stringify(B.a));
    ok(B.b && B.free2 && B.free2.left === 0 && B.b.prevBad === 0 && B.b.n === 9 && B.b.same && B.b.fresh === 9 - B.b.again && B.b.dup === 0 && B.b.d.wood === -12 && B.b.d.stone === -8, '★ⓑ 반쯤 겹치게(동쪽 한 칸) — 겹친 풀린 내 칸은 다시 · 나머지 새로 · 합 아홉 · 겹침 0 · 값 한 번(12 · 8)', JSON.stringify([B.free2, B.b]));
    ok(B.c && B.free3 && B.free3.left === 0 && /이어받/.test(B.zTake.said) && /남의 땅/.test(B.c.prevBad + ' ' + B.c.said) && B.c.n === 0 && !B.c.d.wood && B.c.dup === 0, '★ⓒ 옛 칸 하나를 남이 이어받은 뒤 — 그 칸은 "남의 땅"(종전) · 아홉 칸 거절 · 값 0', JSON.stringify([B.zTake, B.c]));
    sec('C 실제 존 끔(`T1392_FIRST_LOT` 없음) — 종전(첫 C 한 칸 · 간이 움집 없음 · 화덕 줄 무동작)');
    const C = await serverArm('off', 'zone.js', 1);
    ok(C.boot && C.first && C.first.n === 1 && C.site && C.site.x1 - C.site.x0 === 5 && C.site.y1 - C.site.y0 === 3, '끔 = 종전(첫 C 한 칸 · `small` 을 줘도 6×4 움집터 — 간이 움집 · 간이 화덕이 안 선다)', JSON.stringify([C.first && C.first.n, C.site]));
    sec('D 미끼 ⓒ — 풀린 제 칸을 막는 옛 아홉 칸 사본(존 원문 한 곳)');
    const z = rd('server/zone.js'), L = "      if (cs.length === 1 && _myFreeRetake(pid, c, Deeds.ON)) { retake = cid; break; }\n";
    const cnt = z.split(L).length - 1, f = `_t1403h_bait_zone_${process.pid}.js`;
    fs.writeFileSync(path.join(ROOT, 'server', f), z.replace(L, '')); tmp.push(path.join(ROOT, 'server', f));
    const D = await serverArm('bait', f, 2);
    const red = !(D.a && D.a.prevBad === 0 && D.a.n === 9 && D.a.same);
    ok(D.boot && D.free1 && D.free1.left === 0 && D.a && D.a.again > 0 && cnt === 1 && red, '★미끼 ⓒ 바꾼 자리 1곳(아홉 칸 길의 다시 잡기 한 줄을 뺀 사본) — ⓐ 줄이 빨강(풀린 내 땅으로 막힘)', `${cnt}곳 · ${JSON.stringify(D.a)}`);
  }
  console.log(`\n=== ${pass + fail}건 중 PASS ${pass} · FAIL ${fail} ===`);
  process.exit(fail ? 1 : 0);
})();
