#!/usr/bin/env node
// @regress   ← 통합 러너가 이 표를 보고 자기 목록을 만든다(scripts/run-regress.sh · 표 없으면 안 돈다)
// @bait 3
// === scripts/test-t1392-first-lot.js — [T1392 · ★재민 11-19 판정 9] 첫 집터 3×3 · 값 4배 · 간이 움집 3×3 · 온보딩의 끝 = 간이 움집 완공 ====================
//
// ★재민이 정한 것(카드 글자 그대로 — 이 하네스의 수):
//   ① 첫 개인 사유지는 3×3 = 9칸 한 덩이로만 · ② 첫 등록 값 = 한 칸 값의 4배 = 나무 12 · 돌 8(`CLAIM_COST.personal` 에서 유도)
//   ③ 간이 움집 3×3(6×4 움집은 그대로 — 종류가 둘) · ④ 온보딩의 끝 = 간이 움집 완공(「지금 할 일」 칸이 완공까지 잇는다)
// ★판 — A 정본 표(서버 · 클라 파일 원문 · 프로세스 0) · B 실제 존 켬(`T1392_FIRST_LOT=1` · `T1341_OWN_HOUSE=1` · `T1305_DEEDS=1`) · C 실제 존 끔(`T1392_FIRST_LOT` 없음 = 종전 · 나머지 같음)
// ★미끼 셋(이 파일 안 · 바꾼 자리 정확히 1곳씩): ⓐ 간이 움집 기둥 수 2 → 4 사본(★[T1403] 재민 11-20 판정 15 — 가운데 둘) ⓑ 칸이 움집터 뒤를 잇지 않는 사본 ⓒ 끔 판(B 의 켬 전용 줄이 C 에서 빨강)
// ★날짜 · 벽시계 0.
// 실행: node scripts/test-t1392-first-lot.js [--skip-server]
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
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
sec('A1 간이 움집 공정 표 — 6×4 표에서 유도(기둥 = 가운데 둘 · 서까래 = 둘레 비 · 풀 · 이엉 = 넓이 비 · 올림)');
const HS = require(path.join(ROOT, 'server', 'hut-stages.js'));
const needOf = (H) => (H.SMALL_STAGES || []).map((s) => s.need);   // 옛 표(간이 움집 없음)에서도 줄이 선다(빨강으로)
const smallOk = (H) => {
  const n = needOf(H);
  return JSON.stringify(n) === JSON.stringify([{}, { pillar: 2 }, { rafter: 5, fiber: 3 }, { thatch: 3 }]) && H.SMALL_STAGES[0].tool === 'pickaxe'
    && typeof H.smallRaw === 'function' && JSON.stringify(H.smallRaw()) === JSON.stringify({ wood: 9, fiber: 15 });
};
ok(smallOk(HS), '간이 움집 = 기둥 2 · 서까래 5 · 풀 3 · 이엉 3 → 원자재 나무 9 · 풀 15', JSON.stringify([needOf(HS), HS.smallRaw && HS.smallRaw()]));
ok(JSON.stringify(HS.hutRaw()) === JSON.stringify({ wood: 22, fiber: 38 }) && HS.HUT_STAGES[1].need.pillar === 6, '6×4 움집 표 무변(통나무 22 · 풀 38 · 기둥 6)', JSON.stringify(HS.hutRaw()));
ok(HS.SMALL_PILLARS === HS.HUT_PILLARS_ATTESTED[0] && JSON.stringify(HS.SMALL_POSTS) === '[[-0.5,0],[0.5,0]]', '간이 움집 기둥 2 = 고증 첫 수(송국리형 기본꼴 가운데 2주) · 자리 = 가운데 칸 서 · 동 변', `${HS.SMALL_PILLARS} · ${JSON.stringify(HS.HUT_PILLARS_ATTESTED)}`);
ok((HS.SMALL_STAGES || []).map((s) => s.label).join(' / ') === '① 수혈 굴착(터파기) / ② 굴립주 기둥 세우기(기둥 2) / ③ 도리·서까래 골조(서까래 5·풀 3) / ④ 이엉 지붕 잇기(이엉 3)', '간이 움집 단계 글 = 6×4 글 꼴에 수만 갈아 끼움', (HS.SMALL_STAGES || []).map((s) => s.label).join(' / '));
{   // 미끼 ⓐ
  const src = rd('server/hut-stages.js'), L = 'const SMALL_PILLARS = HUT_PILLARS_ATTESTED[0];';
  const cnt = src.split(L).length - 1, bait = src.replace(L, 'const SMALL_PILLARS = 4;');
  const f = path.join(ROOT, 'server', `_t1392_bait_${process.pid}.js`); fs.writeFileSync(f, bait); tmp.push(f);
  const HB = require(f);
  ok(cnt === 1 && !smallOk(HB), '★미끼 ⓐ 바꾼 자리 1곳(간이 움집 기둥 2 → 4 — T1392 첫 후보) — 간이 움집 표 줄이 빨강', JSON.stringify(needOf(HB)[1]));
}

sec('A2 「지금 할 일」 칸 — 터를 판 뒤 기둥 → 서까래 → 이엉 → 올리기를 한 걸음씩(클라 70-lobby.js 원문)');
function loadClient(srcOverride) {
  const ctx = { console, Math, JSON, Map, Set, Array, Object, String, Number, isFinite, document: { getElementById: () => null, createElement: () => ({}) },
    uiCfg: {}, window: {}, conns: new Map(), primaryZoneId: 'hanbando', myPlayerId: 'u1', myUsername: 'u1', sendPrimary: () => {} };
  vm.createContext(ctx);
  const jo = /function vvJosa\([\s\S]*?\n}\n/.exec(rd('public/client/52-v-village-view.js'));
  if (jo) vm.runInContext(jo[0], ctx);
  vm.runInContext(srcOverride || rd('public/client/70-lobby.js'), ctx, { filename: 'public/client/70-lobby.js' });
  return ctx;
}
//   서버 표를 welcome 꼴로(zone `_t1392Cfg` 와 같은 모양 — 하네스가 표를 다시 짜지 않고 정본 표를 옮긴다)
const FLCFG = { side: 3, cost: { wood: 12, stone: 8 },
  stages: { small: (HS.SMALL_STAGES || []).map((s) => ({ need: s.need, tool: s.tool || null, label: s.label })), big: HS.HUT_STAGES.map((s) => ({ need: s.need, tool: s.tool || null, label: s.label })) },
  recipes: Object.fromEntries(Object.entries(HS.HUT_RECIPES).map(([k, r]) => [k, { from: r.from, to: r.to, tool: r.requiresTool || null }])) };
const OWN = { cost: { wood: 12, stone: 8 }, need: 12, recog: false, tree: { x: 100, y: 100 }, rock: { x: 200, y: 200 }, reed: { x: 300, y: 300 } };
const ST = { vid: 1, contrib: 0, need: 12, lotOk: false, own: OWN };
const I0 = (o) => Object.assign({ state: ST, off: { x: 0, y: 0 }, me: { x: 0, y: 0 }, itemKo: (k) => ({ pillar: '기둥', rafter: '서까래', thatch: '이엉', fiber: '풀', wood: '나무', axe: '도끼' }[k] || k),
  inv: { wood: 0, stone: 0 }, bag: {}, tools: [], firstLot: FLCFG, myLot9: null, mySite: null, myHut: false, myClaim: null, myHome: false, toolCfg: null, recipes: null }, o);
const K = (k) => ({ k });
const site = (stage, near) => ({ id: 'b9', stage, small: true, x: 500, y: 500, near: !!near });
function chain(C) {
  const P = (o) => C.onbOwnPlan(I0(o), ST, K);
  return {
    noLand: P({ inv: { wood: 12, stone: 8 } }),
    lotOut: P({ myLot9: { x: 64, y: 64, inside: false } }),
    lotIn: P({ myLot9: { x: 64, y: 64, inside: true } }),
    s1noWood: P({ mySite: site(1, false), tools: [{ type: 'axe', d: 10 }], bag: {} }),
    s1craft: P({ mySite: site(1, false), tools: [{ type: 'axe', d: 10 }], bag: { wood: 3 } }),
    s1ready: P({ mySite: site(1, true), tools: [{ type: 'axe', d: 10 }], bag: { pillar: 2 } }),
    s2fiber: P({ mySite: site(2, false), tools: [{ type: 'axe', d: 10 }], bag: { rafter: 5 } }),
    s3thatch: P({ mySite: site(3, false), bag: { fiber: 4 } }),
    done: P({ myHut: true, mySite: null }),
  };
}
const chainOk = (r) => r.noLand && r.noLand.stage === 'claim' && /둘레 아홉 칸/.test(JSON.stringify(r.noLand.guide)) && /나무 12개와 돌 8개/.test(JSON.stringify(r.noLand.guide))
  && r.lotOut && r.lotOut.stage === 'build' && r.lotOut.target && r.lotIn && r.lotIn.btn === 'small_hut'
  && r.s1noWood && r.s1noWood.stage === 'gather' && r.s1noWood.noun === '나무' && r.s1noWood.target && r.s1noWood.target.x === 100 && JSON.stringify(r.s1noWood.want) === '{"wood":6}'
  && r.s1craft && r.s1craft.stage === 'craft' && r.s1craft.step && r.s1craft.step.what === 'pillar'
  && r.s1ready && r.s1ready.stage === 'site' && r.s1ready.btn === 'hut'
  && r.s2fiber && r.s2fiber.stage === 'gather' && r.s2fiber.noun === '갈대' && r.s2fiber.target && r.s2fiber.target.x === 300
  && r.s3thatch && r.s3thatch.stage === 'craft' && r.s3thatch.step.what === 'thatch'
  && r.done === null;
let CH = null;
try {
  CH = chain(loadClient());
  ok(chainOk(CH), '★칸 사다리 — 집터 아홉 칸(12 · 8) → 집터 가운데로 → 간이 움집 단추 → 나무 → 기둥 만들기 → 올리기 단추 → 갈대 → 이엉 만들기 → 완공이면 칸 끝(null)',
    JSON.stringify(Object.fromEntries(Object.entries(CH).map(([k, v]) => [k, v ? `${v.stage}:${v.item}${v.btn ? '+' + v.btn : ''}` : null]))));
  ok(!!CH.s1ready && /기둥 2\/2/.test(JSON.stringify(CH.s1ready.guide)), '올리기 칸 글 = 서버 표의 수(기둥 2/2)', CH.s1ready && JSON.stringify(CH.s1ready.guide).slice(0, 90));
} catch (e) { ok(false, 'A2 예외: ' + (e && e.stack || e)); }
{   // 끔(welcome 에 firstLot 칸 없음) — 종전 칸: 터를 팠으면 칸이 내려선다(null) · 터 값 글은 종전
  const C = loadClient();
  const p0 = C.onbOwnPlan(I0({ firstLot: null, myHome: true, mySite: site(1, true) }), ST, K);
  const p1 = C.onbOwnPlan(I0({ firstLot: null, inv: { wood: 12, stone: 8 } }), ST, K);
  ok(p0 === null && p1 && p1.stage === 'claim' && !/아홉 칸/.test(JSON.stringify(p1.guide)), '끔 칸 = 종전(움집터가 서면 칸이 내려선다 · 집터 글에 아홉 칸 0)', JSON.stringify([p0, p1 && p1.item]));
}
{   // 미끼 ⓑ
  const src = rd('public/client/70-lobby.js'), L = '    if (I.mySite) return onbHutPlan(I, s, K, FL, O);';
  const cnt = src.split(L).length - 1;
  let r = null; try { r = chain(loadClient(src.replace(L, '    if (I.mySite) return null;'))); } catch (e) { r = null; }
  ok(cnt === 1 && r && !chainOk(r), '★미끼 ⓑ 바꾼 자리 1곳(움집터 뒤 칸 → null) — 칸 사다리 줄이 빨강', r ? `s1ready=${JSON.stringify(r.s1ready)}` : '예외');
}

sec('A3 봇 손(`lib-onb-guide.guideAct`) — 칸이 더 말하는 넷을 한 수로');
{
  const { guideAct } = require('./lib-onb-guide');
  const g = CH ? [guideAct(CH.lotIn), guideAct(CH.s1ready), guideAct(CH.s1craft), guideAct(CH.s2fiber), guideAct(CH.s1noWood)] : [];
  ok(g.length === 5 && g[0].do === 'small_hut' && g[1].do === 'hut_adv' && g[2].do === 'craft_item' && g[2].what === 'pillar' && g[3].do === 'reed' && g[3].item === 'fiber'
    && g[4].do === 'gather' && g[4].res === 'tree' && JSON.stringify(g[4].want) === '{"wood":6}', '간이 움집 단추 · 올리기 단추 · 중간재 제작 · 갈대 · 나무(칸이 말한 수)', JSON.stringify(g));
}

// ── B · C. 실제 존 ────────────────────────────────────────────────────────────
async function serverArm(on) {
  const WebSocket = require('ws');
  const FB = require('./fixture-boot');
  const LP = require('./lib-port');
  const base = LP.ports(4, on ? 39700 : 39710), CP = base, ZP = base + 2;
  const RUN = fs.mkdtempSync(`/tmp/t1392-${on ? 'on' : 'off'}-`); tmp.push(RUN); require('./lib-tmp').own(RUN);   // [PM land1086 · lint ㉑] lib-tmp — 판 끝(빨강 · 상한 포함)에 지운다
  const procs = [];
  //   두 판 다 사유지 돌봄 켬(`T1305_DEEDS=1` — 개인 칸 숫자 상한 0 · 끈 돌봄 판은 첫 집터가 슬롯 9 를 다 쓴다 — 보고 T1392 회부) · 바뀐 칸은 `T1392_FIRST_LOT` 하나
  const env = Object.assign({}, process.env, { T1341_OWN_HOUSE: '1', T1305_DEEDS: '1' }); delete env.T1392_FIRST_LOT; if (on) env.T1392_FIRST_LOT = '1';
  const boot = (file, e, db) => { const p = spawn(process.execPath, [path.join(ROOT, 'server', file)], { cwd: ROOT, env: Object.assign({}, env, e, { DB_PATH: db }), stdio: ['ignore', 'pipe', 'pipe'] }); p.stdout.on('data', () => {}); p.stderr.on('data', () => {}); procs.push(p); return p; };
  const down = async () => { for (const p of procs) { try { p.kill('SIGTERM'); } catch (e) {} } await sleep(800); for (const p of procs) { try { p.kill('SIGKILL'); } catch (e) {} } };
  const out = {};
  try {
    const cen = boot('central.js', { PORT: String(CP), PUBLIC_HOST: 'localhost', ENABLED_ZONES: 'hanbando' }, path.join(RUN, 'c.db'));
    const zon = boot('zone.js', { PORT: String(ZP), ZONE_ID: 'hanbando', CENTRAL_URL: `http://localhost:${CP}`, ENABLE_VILLAGES: '1', ENABLE_BANDITS: '0', ENABLE_ROADS: '0', ENABLE_WILDLIFE: '0', VILLAGE_MAX: '4', E2E_GIVE: '1' }, path.join(RUN, 'z.db'));
    const a = await FB.waitUp(cen, /central server up on/, { name: 'central' }), b = await FB.waitUp(zon, /zone server up on/, { name: 'zone', capMs: 400000 });
    if (!a.ok || !b.ok) { out.boot = false; return out; }
    out.boot = true;
    const connect = (user) => new Promise((resolve, reject) => {
      const q = new URLSearchParams({ username: user, password: 'pw-' + user, name: user, color: '#5a9ae0' });
      const ws = new WebSocket(`ws://localhost:${ZP}/?${q}`);
      const P = { ws, inv: {}, notices: [], mine: new Map(), blds: new Map(), prev: [], own: null, W: null };
      const hb = setInterval(() => { try { if (ws.readyState === 1) ws.send(JSON.stringify({ type: 'ping', t: 0 })); } catch (e) {} }, 5000);
      const to = setTimeout(() => reject(new Error('접속 시간초과')), 90000);
      ws.on('close', () => clearInterval(hb));
      ws.on('message', (raw) => {
        let m; try { m = JSON.parse(String(raw)); } catch (e) { return; }
        if (m.type === 'welcome') { P.W = m; P.inv = m.inventory || {}; P.pid = m.playerId || m.pid; clearTimeout(to); resolve(P); }
        else if (m.type === 'inventory') P.inv = m.inventory || {};
        else if (m.type === 'notice') P.notices.push(m);
        else if (m.type === 'lot_preview') P.prev.push(m);
        else if (m.type === 'onboarding_state' && m.state) P.own = m.state.own || null;
        else if (m.type === 'claim_added' && m.claim && m.claim.ownerPid === P.pid) P.mine.set(m.claim.id, m.claim);
        else if (m.type === 'claim_removed') P.mine.delete(m.id);
        else if (m.type === 'building_added' && m.building) P.blds.set(m.building.id, m.building);
        else if (m.type === 'buildings_spawn') for (const bb of m.buildings || []) P.blds.set(bb.id, bb);
        else if (m.type === 'building_removed') P.blds.delete(m.id);
      });
      ws.on('error', (e) => { clearTimeout(to); reject(e); });
    });
    const send = (P, o) => { try { P.ws.send(JSON.stringify(o)); } catch (e) {} };
    const waitFor = async (fn, ms) => { for (let t = 0; t < ms; t += 60) { const v = fn(); if (v) return v; await sleep(60); } return fn(); };
    const warp = async (P, x, y) => { const n0 = P.notices.length; send(P, { type: 'teleport_debug', x: Math.round(x), y: Math.round(y) }); await waitFor(() => P.notices.slice(n0).some((t) => /텔레포트/.test(t.text)), 3000); await sleep(150); };
    const give = async (P, items, tools) => { const n0 = P.notices.length; send(P, { type: '__e2e_give', items, tools }); await waitFor(() => P.notices.length > n0, 3000); await sleep(150); };
    const act = async (P, msg, until, ms) => { const k = P.notices.length, i0 = Object.assign({}, P.inv); send(P, msg); await waitFor(() => (until && until()) || P.notices.length > k, ms || 3000); await sleep(250);
      const d = {}; for (const kk of new Set([...Object.keys(i0), ...Object.keys(P.inv)])) { const v = (P.inv[kk] | 0) - (i0[kk] | 0); if (v) d[kk] = v; }
      return { said: P.notices.slice(k).map((n) => n.text).join(' | '), last: P.notices[P.notices.length - 1], d }; };
    const X = await connect('lotX'), Y = await connect('lotY');
    const S = 32, home = { x: X.W.self.homeX, y: X.W.self.homeY };
    const c0 = { x: Math.floor(home.x / S) - 24, y: Math.floor(home.y / S) + 8 };   // 빈 들(도착 집 곁 · T1390 판이 24칸을 잡은 자리)
    const at = (cx, cy) => ({ x: cx * S + S / 2, y: cy * S + S / 2 });
    // 미리보기 · 첫 C
    await give(X, { wood: 40, stone: 40 }, ['pickaxe', 'axe']);
    await warp(X, at(c0.x, c0.y).x, at(c0.x, c0.y).y);
    send(X, { type: 'lot_probe' }); await waitFor(() => X.prev.length, 1500); out.prev0 = X.prev[X.prev.length - 1] || null;
    send(X, { type: 'onboarding_state' }); await waitFor(() => X.own, 2000); out.own = X.own;
    const r1 = await act(X, { type: 'claim', kind: 'personal' }, () => X.mine.size > 0);
    await sleep(300);
    const cells = [...X.mine.values()].map((c) => [Math.floor(c.x / S) - c0.x, Math.floor(c.y / S) - c0.y]).sort((p, q) => p[1] - q[1] || p[0] - q[0]);
    out.first = { n: X.mine.size, cells, d: r1.d, said: r1.said };
    // 막힌 자리 — Y 가 X 집터 동쪽 둘째 칸에 서면 서쪽 세 칸이 남의 땅
    await give(Y, { wood: 40, stone: 40 });
    await warp(Y, at(c0.x + 2, c0.y).x, at(c0.x + 2, c0.y).y);
    send(Y, { type: 'lot_probe' }); await waitFor(() => Y.prev.length, 1500); out.prevY = Y.prev[Y.prev.length - 1] || null;
    const ry = await act(Y, { type: 'claim', kind: 'personal' });
    out.blocked = { n: Y.mine.size, d: ry.d, said: ry.said, need: ry.last && ry.last.need };
    // 둘째 C — X 가 집터 동쪽 바로 바깥(붙은 칸)
    await warp(X, at(c0.x + 2, c0.y).x, at(c0.x + 2, c0.y).y);
    const r2 = await act(X, { type: 'claim', kind: 'personal' }, () => X.mine.size > 9);
    out.second = { n: X.mine.size, d: r2.d, said: r2.said };
    // 간이 움집 — 집터 밖(3칸 떨어진 곳) → 거절 · 집터 가운데 → 터
    await warp(X, at(c0.x + 5, c0.y).x, at(c0.x + 5, c0.y).y);
    const h0 = await act(X, { type: 'hut_start', kind: 'small', atX: at(c0.x + 5, c0.y).x, atY: at(c0.x + 5, c0.y).y });
    const mine = (b) => b.type === 'hut_site' && !(b.data && b.data.owner === 'npc');   // [PM land1087] 마을이 짓는 새 움집터(`owner: 'npc'`)가 시야에 들면 그것을 집던 흔들림(CI 긴 판 18/4) — 사람 것만 센다
    out.hutOut = { said: h0.said, sites: [...X.blds.values()].filter(mine).length };
    await warp(X, at(c0.x, c0.y).x, at(c0.x, c0.y).y);
    const h1 = await act(X, { type: 'hut_start', kind: 'small', atX: at(c0.x, c0.y).x, atY: at(c0.x, c0.y).y }, () => [...X.blds.values()].some(mine));
    const st = [...X.blds.values()].find(mine);
    out.site = st ? { data: st.data, said: h1.said, d: h1.d } : { said: h1.said };
    // 단계 — 모자라면 거절 · 표 수만큼 정확히 든다
    if (st) {
      await give(X, { pillar: 1 });
      const a1 = await act(X, { type: 'hut_advance', buildingId: st.id });
      await give(X, { pillar: 1, rafter: 5, fiber: 3, thatch: 3 });
      const a2 = await act(X, { type: 'hut_advance', buildingId: st.id }, () => ((X.blds.get(st.id) || {}).data || {}).stage === 2);
      const a3 = await act(X, { type: 'hut_advance', buildingId: st.id }, () => ((X.blds.get(st.id) || {}).data || {}).stage === 3);
      const a4 = await act(X, { type: 'hut_advance', buildingId: st.id }, () => !X.blds.has(st.id));
      out.adv = { short: a1.said, d2: a2.d, d3: a3.d, d4: a4.d, done: a4.said };
      const B = [...X.blds.values()].filter((b) => b.data && Array.isArray(b.data.hut) && b.data.hut[0] === st.data.x0 && b.data.hut[1] === st.data.y0);
      const walls = B.filter((b) => b.type === 'wall'), floors = B.filter((b) => b.type === 'floor');
      const sw = walls.filter((b) => b.data.side === 'N' && Math.floor(b.y / S) === st.data.y1 + 1).map((b) => Math.floor(b.x / S) - st.data.x0).sort();
      const hut = [...X.blds.values()].find((b) => b.type === 'hut' && Math.abs(b.x - st.x) < 4 && Math.abs(b.y - st.y) < 4);
      const mineSet = new Set([...X.mine.values()].map((c) => `${Math.floor(c.x / S)},${Math.floor(c.y / S)}`));
      out.hut = { walls: walls.length, floors: floors.length, south: sw, hut: !!hut, posts: hut && hut.data ? hut.data.posts : null, small: B.every((b) => b.data.small === 1) && !!(hut && hut.data && hut.data.small),
        inLot: floors.every((f) => mineSet.has(`${Math.floor(f.x / S)},${Math.floor(f.y / S)}`)), rect: [st.data.x0 - c0.x, st.data.y0 - c0.y, st.data.x1 - c0.x, st.data.y1 - c0.y] };
    }
    try { X.ws.close(); Y.ws.close(); } catch (e) {}
  } catch (e) { out.err = String(e && e.stack || e); }
  finally { await down(); }
  return out;
}
(async () => {
  if (!SKIP_SERVER) {
    sec('B 실제 존 켬(`T1392_FIRST_LOT=1` · `T1341_OWN_HOUSE=1` · `T1305_DEEDS=1`) — 손이 보내는 메시지로');
    const B = await serverArm(true);
    if (!B.boot) ok(false, '켬 존 기동', B.err);
    else {
      const nine = JSON.stringify([[-1, -1], [0, -1], [1, -1], [-1, 0], [0, 0], [1, 0], [-1, 1], [0, 1], [1, 1]]);
      ok(B.prev0 && B.prev0.first === true && B.prev0.cells.length === 0 && B.prev0.cost && B.prev0.cost.wood === 12 && B.prev0.cost.stone === 8, '미리보기 — 첫 등록 · 막힌 칸 0 · 값 12 · 8', JSON.stringify(B.prev0));
      ok(B.first.n === 9 && JSON.stringify(B.first.cells) === nine && B.first.d.wood === -12 && B.first.d.stone === -8 && /내 땅 9칸/.test(B.first.said), '★첫 C = 선 칸 가운데 아홉 칸(3×3) · 나무 12 · 돌 8 · 돌봄 N = 9', JSON.stringify(B.first));
      ok(B.own && B.own.cost && B.own.cost.wood === 12 && B.own.cost.stone === 8 && ('reed' in B.own), '제 집 줄기 칸 집터 값 = 12 · 8(서버 표) · 갈대 자리 칸', JSON.stringify(B.own));
      ok(B.prevY && B.prevY.cells.length === 3 && B.prevY.cells.every((c) => c[0] === -1 && c[2] === 'claim'), '미리보기 — 남의 땅에 걸린 칸 셋(서쪽 줄)', JSON.stringify(B.prevY && B.prevY.cells));
      ok(B.blocked.n === 0 && !Object.keys(B.blocked.d).length && /북서 · 서 · 남서 칸은 남의 땅/.test(B.blocked.said) && B.blocked.need && B.blocked.need.lot && B.blocked.need.lot.length === 3, '★한 칸이라도 막히면 통째로 거절 · 가방 그대로 · 막힌 쪽 한 줄 · need.lot', JSON.stringify(B.blocked));
      ok(B.second.n === 10 && B.second.d.wood === -3 && B.second.d.stone === -2, '★둘째 C = 한 칸 · 한 칸 값(3 · 2)', JSON.stringify(B.second));
      ok(B.hutOut.sites === 0 && /내 땅 아홉 칸/.test(B.hutOut.said), '간이 움집은 내 땅 밖에 안 선다', B.hutOut.said);
      ok(B.site.data && B.site.data.small === 1 && B.site.data.x1 - B.site.data.x0 === 2 && B.site.data.y1 - B.site.data.y0 === 2 && /기둥 2/.test(B.site.said), '★간이 움집 터 = 집터 아홉 칸 그 자리(3×3) · 다음 = 기둥 2', JSON.stringify(B.site));
      ok(B.adv && /기둥 1\/2/.test(B.adv.short) && B.adv.d2.pillar === -2 && B.adv.d3.rafter === -5 && B.adv.d3.fiber === -3 && B.adv.d4.thatch === -3 && /간이 움집이 다 지어졌습니다/.test(B.adv.done),
        '★단계마다 표의 수만큼(기둥 2 · 서까래 5 · 풀 3 · 이엉 3) · 모자라면 거절', JSON.stringify(B.adv));
      ok(B.hut && B.hut.walls === 11 && B.hut.floors === 9 && JSON.stringify(B.hut.south) === '[0,2]' && B.hut.hut && B.hut.small && B.hut.inLot && JSON.stringify(B.hut.rect) === '[-1,-1,1,1]' && JSON.stringify(B.hut.posts) === '[[-16,0],[16,0]]',
        '★완공 = 벽 11(남벽 문 가운데 1칸) · 바닥 9(다 내 땅) · 움집 행 · `small` 표지 · 가운데 기둥 둘 자리(T1403)', JSON.stringify(B.hut));
      if (B.err) ok(false, '켬 판 예외', B.err);
      sec('C 실제 존 끔(`T1392_FIRST_LOT` 없음) — 종전 · ★미끼 ⓒ 켬 전용 줄이 빨강');
      const C = await serverArm(false);
      if (!C.boot) ok(false, '끔 존 기동', C.err);
      else {
        const onRow = C.first.n === 9 && C.first.d.wood === -12;
        ok(C.first.n === 1 && C.first.d.wood === -3 && C.first.d.stone === -2 && !C.prev0 && C.own && C.own.cost && C.own.cost.wood === 3 && !('reed' in C.own), '끔 = 종전(첫 C 한 칸 · 3 · 2 · 미리보기 0 · 갈대 칸 0)', JSON.stringify([C.first, C.prev0, C.own && C.own.cost]));
        ok(!onRow, '★미끼 ⓒ 바꾼 자리 1곳(존 env `T1392_FIRST_LOT` 없음) — 켬 판의 "첫 C = 아홉 칸" 줄이 빨강', JSON.stringify(C.first));
        if (C.err) ok(false, '끔 판 예외', C.err);
      }
    }
  }
  console.log(`\n=== ${pass + fail}건 중 PASS ${pass} · FAIL ${fail} ===`);
  process.exit(fail ? 1 : 0);
})();
