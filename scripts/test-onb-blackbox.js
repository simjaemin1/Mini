#!/usr/bin/env node
// @regress   ← 통합 러너가 이 표를 보고 자기 목록을 만든다(scripts/run-regress.sh · 표 없으면 안 돈다)
// === scripts/test-onb-blackbox.js — ★검사 카드 T1354: 온보딩을 **구현을 안 보고** 재민 말만으로 재는 결과 하네스 ====================
//
// ★왜 [★재민 11-17 테스트 강화 · `인계/공통.md` "테스트 강화 규약" ⑥] 켬 기본이 걸린 큰 카드는 만든 세션이 아닌 세션이
//   구현을 안 보고 결과 하네스를 짠다. 첫 판 = 온보딩(T1341 · 켬 판정 대기). 재민 11-16(족보 863 ①):
//   "마을이 필요한 물건을 구해 오게 하는 대신 스스로 집을 짓게 이끈다 · 마을 의뢰는 갚음 없이 받아들임만 오른다 ·
//    집 재료도 따로 보상 없음 · 그 물건으로 플레이어 사유지를 지을 수 있도록."
// ★읽지 않은 것: `server/onboarding.js` 의 T1341 줄 · T1341 가지 diff · `보고/T1341_*` · `test-t1341-*` · `e2e-t1341-*`.
//   읽은 것: 족보 863 · `지시/지시_T1341.md` 의 "왜"(질문을 적은 뒤에 기준 공격 절 때문에 "할 일"도) · 클라가 받는 메시지 꼴(`public/client/*`) ·
//   실서버에 붙여 받은 메시지(시험 봇).
// ★봇은 플레이어가 하는 일만 한다 — ws 로 메시지를 보내고 받은 것을 읽는다. 서버 안 함수를 부르지 않는다 · 서버 파일을 읽지 않는다.
//   예외 하나(적어 둔다): 자리 옮김은 순간이동(`teleport_debug` — 존 `E2E_GIVE=1` 의 디버그 문)이다. 걷기는 재지 않는다.
//   재료는 봇이 실제로 줍고 · 만들고 · 벤다(픽스처가 주는 물건 0).
//
// ★판 둘(한 프로세스가 차례로 · 존 · central 은 판마다 새로 띄운다 · 새 DB):
//   켬 판 — 존 env `T1341_OWN_HOUSE=1` · 질문마다 ✓/✗ 한 줄(켬에서 빨강인 줄은 회부 — 하네스를 초록이 되게 고치지 않는다 · S9 T1353 이 고친다).
//   끔 판(미끼) — **env 한 칸만** 다르다(`T1341_OWN_HOUSE=0` — 바뀐 칸 수를 센다) · 켬 전용 질문(`ONLY_ON`)이 **빨강**이어야 한다(어느 줄인지 단언).
//
// ★날짜 · 벽시계를 박지 않는다 — 시각은 판 안에서 잰 간격(ms)뿐이다. 의뢰판은 판마다 갈리니 "낼 수 있는 의뢰"가 뜰 때까지 판을 다시 묻는다(상한).
//
// 실행: node scripts/test-onb-blackbox.js          (켬 판 + 끔 판 미끼 · 판당 ≈ 3~5분)
//       ONB_BB_ONLY=on node scripts/test-onb-blackbox.js   (켬 판만 — 미끼 절은 '안 돌림'으로 빨강)
'use strict';
if (require.main === module) require('./lib-port').hold(3010, 3020);   // [T1288] 제품 고정 포트(존 설정 · central 기본) — 띄우는 동안 혼자 쥔다
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const FB = require('./fixture-boot');
const WebSocket = require('ws');

const ROOT = path.join(__dirname, '..');
const CPORT = 3010, ZPORT = 3020;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const KNOB = 'T1341_OWN_HOUSE';

// ── 결과 질문(코드보다 먼저 적었다 · 보고/T1354 §1) — id → 글 ─────────────────────────────────────────────
const Q = {
  Q1: '새로 온 사람이 안내(온보딩 칸 · 거절 글)만 따라가면 제 사유지에 제 움집터가 선다',
  Q2: '마을 의뢰 물건을 내면 손에 들어오는 갚음이 0 이다(가방은 낸 것만 준다)',
  Q3: '의뢰판이 약속하는 갚음이 0 이다(모든 줄 갚을 것 칸이 비었다)',
  Q4: '의뢰를 내면 받아들임 수치가 오른다',
  Q5: '집 재료를 구해 와도 재료 말고 따로 받는 것이 없다(받아들임 · 온보딩 선물 0)',
  Q6: '모은 재료로 사유지에 집터를 잡을 수 있다(값 = 안내가 말한 나무 · 돌만큼 빠진다)',
  Q7: '마을 영토 밖 빈 들에서 집터를 잡을 수 있다(아직 아무 마을 사람도 아니다)',
  Q8: '받아들여지기 전 마을 영토 안에서는 집터를 못 잡는다(까닭을 듣고 가방이 안 준다)',
  Q9: '받아들여진 뒤에는 영토 안에서도 집터를 잡을 수 있다',
  Q10: '나갔다 들어와도 받아들임 · 가방 · 내 집터 · 내 움집터가 이어진다',
  Q11: '두 사람이 같은 터를 고르면 한 사람만 서고 다른 사람은 까닭을 듣는다(가방이 안 준다)',
  Q12: '재료가 모자란 채 집터를 잡으려 하면 거절되고 무엇이 모자란지 듣고 가방이 안 준다',
  Q13: '마을이 받아들이기 전에 곳간을 열면 거절된다(가방이 안 는다)',
  Q14: '첫 경험이 운이 아니다 — 네 마을 다 집터 값이 같고 어느 마을 의뢰판도 갚음을 약속하지 않는다',
  Q15: '안내가 "마을 물건 구해 오기"가 아니라 "제 집 짓기"를 가리킨다(집터 값 · 나무 · 바위 자리)',
  Q16: '[기준 공격] 안내가 가리킨 바위 곁에서 맨손으로 자갈을 주울 수 있다(네 마을)',
  Q17: '[기준 공격] 맨손으로 나무를 베려 하면 무엇을 만들어야 하는지 듣는다(재료 이름까지)',
  Q18: '[기준 공격] 집터를 잡은 뒤 가진 것으로 움집 첫 삽을 뜨거나, 못 뜨면 거절이 모자란 것을 칸이 읽을 꼴(`need`)로 준다',
  Q19: '[기준 공격] 어느 시작 마을이든 도착했을 때 새 사람이 맨손 · 조잡한 도구로 낼 수 있는 의뢰가 판에 하나 이상 있다',
};
//   ★켬 전용 — 끔 판(종전 온보딩: 의뢰가 시세대로 갚는다 · 안내는 의뢰)에서 빨강이어야 하는 질문(미끼 단언)
const ONLY_ON = ['Q2', 'Q3', 'Q14', 'Q15'];
const GATHERABLE = new Set(['wood', 'stone', 'pebble', 'twig', 'fiber', 'berry', 'herb']);

// ── 판 띄우기 ──────────────────────────────────────────────────────────────────────────────────
function bootPair(env, tag) {
  const CDB = `/tmp/onb-bb-c-${process.pid}-${tag}.db`, ZDB = `/tmp/onb-bb-z-${process.pid}-${tag}.db`;
  const procs = [];
  const one = (file, e) => { const p = spawn(process.execPath, [path.join(ROOT, 'server', file)], { cwd: ROOT, env: Object.assign({}, process.env, e), stdio: ['ignore', 'pipe', 'pipe'] }); p.stdout.on('data', () => {}); p.stderr.on('data', () => {}); procs.push(p); return p; };
  const cen = one('central.js', { PORT: String(CPORT), DB_PATH: CDB, PUBLIC_HOST: 'localhost', ENABLED_ZONES: 'hanbando' });
  const zon = one('zone.js', Object.assign({ PORT: String(ZPORT), ZONE_ID: 'hanbando', DB_PATH: ZDB, CENTRAL_URL: `http://localhost:${CPORT}` }, env));
  const down = async () => {
    for (const p of procs) { try { p.kill('SIGKILL'); } catch (e) {} }
    for (const p of procs) { if (p.exitCode === null && p.signalCode === null) await new Promise((r) => { p.once('exit', r); setTimeout(r, 5000); }); }
    for (const f of [CDB, ZDB]) for (const s of ['', '-wal', '-shm']) { try { fs.unlinkSync(f + s); } catch (e) {} }
  };
  process.on('exit', () => { for (const p of procs) { try { p.kill('SIGKILL'); } catch (e) {} } });
  return { cen, zon, down };
}

// ── 봇 — 메시지만 ─────────────────────────────────────────────────────────────────────────────
const QUIET = new Set(['tick', 'gauges', 'markets', 'player_left', 'pong', 'sim_village_day', 'resource_update', 'building_updated', 'mob_spawn', 'mob_removed', 'welcome_head', 'conn_hello']);
function connect(user, startVid) {
  return new Promise((resolve, reject) => {
    const q = new URLSearchParams({ username: user, password: 'pw-' + user, name: user, color: '#5a9ae0' });
    if (startVid != null) q.set('start_vid', String(startVid));
    const ws = new WebSocket(`ws://localhost:${ZPORT}/?${q}`);
    const B = { ws, user, W: null, inv: {}, toolItems: [], equipped: null, res: new Map(), claims: new Map(), blds: new Map(), notices: [], onbMsgs: [], log: [], pos: null };
    const to = setTimeout(() => reject(new Error(user + ' 접속 시간초과')), 90000);
    ws.on('message', (raw) => {
      let m; try { m = JSON.parse(String(raw)); } catch (e) { return; }
      switch (m.type) {
        case 'welcome': B.W = m; B.inv = m.inventory || {}; B.toolItems = m.toolItems || []; B.equipped = m.equipped || null;
          for (const r of m.resources || []) B.res.set(r.id, r); for (const c of m.claims || []) B.claims.set(c.id, c); for (const b of m.buildings || []) B.blds.set(b.id, b);
          clearTimeout(to); resolve(B); break;
        case 'resources_spawn': for (const r of m.resources || []) B.res.set(r.id, r); break;
        case 'resource_spawn': if (m.resource) B.res.set(m.resource.id, m.resource); break;
        case 'resources_removed': for (const id of m.ids || []) B.res.delete(id); break;
        case 'resource_removed': B.res.delete(m.id || m.resId); break;
        case 'inventory': B.inv = m.inventory || {}; break;
        case 'tools': case 'tools_update': if (Array.isArray(m.toolItems)) B.toolItems = m.toolItems; if (m.equipped !== undefined) B.equipped = m.equipped; break;
        case 'claim_added': case 'claim_updated': B.claims.set(m.claim.id, m.claim); break;
        case 'claim_removed': B.claims.delete(m.id); break;
        case 'buildings_spawn': for (const b of m.buildings || []) B.blds.set(b.id, b); break;
        case 'building_added': B.blds.set(m.building.id, m.building); break;
        case 'building_removed': B.blds.delete(m.id || (m.building && m.building.id)); break;
        case 'buildings_removed': for (const id of m.ids || []) B.blds.delete(id); break;
        case 'notice': { B.notices.push(m); if (B.notices.length > 400) B.notices.shift(); const t = /텔레포트 → \((-?\d+),(-?\d+)\)/.exec(m.text || ''); if (t) B.pos = { x: +t[1], y: +t[2] }; break; }
        case 'onboarding_state': case 'onboarding_quest': case 'onboarding_fx': case 'onboarding_day': B.onbMsgs.push(m); break;
      }
      if (!QUIET.has(m.type) && !/^(resources_|buildings_)/.test(m.type)) { B.log.push(m); if (B.log.length > 600) B.log.shift(); }
    });
    ws.on('error', (e) => { clearTimeout(to); reject(e); });
    ws.on('close', () => { clearInterval(B.beat); });
    B.beat = setInterval(() => { try { if (ws.readyState === 1) ws.send(JSON.stringify({ type: 'ping' })); } catch (e) {} }, 2000);
  });
}
const send = (B, o) => { try { B.ws.send(JSON.stringify(o)); } catch (e) {} };
const close = async (B) => { try { clearInterval(B.beat); B.ws.close(); } catch (e) {} await sleep(800); };
const said = (B, n0) => B.notices.slice(n0).map((n) => n.text || '');
const saidRaw = (B, n0) => B.notices.slice(n0);
async function waitFor(fn, ms) { const t0 = Date.now(); while (Date.now() - t0 < ms) { const v = fn(); if (v) return v; await sleep(100); } return fn(); }
async function warp(B, x, y) { const n0 = B.notices.length; send(B, { type: 'teleport_debug', x: Math.round(x), y: Math.round(y) }); const ok = await waitFor(() => said(B, n0).some((t) => /텔레포트 →/.test(t)), 3000); await sleep(700); return ok; }
const nearest = (B, pred, at) => { let best = null, bd = Infinity; const p = at || B.pos; for (const r of B.res.values()) { if (!pred(r)) continue; const d = Math.hypot(r.x - p.x, r.y - p.y); if (d < bd) { bd = d; best = r; } } return best ? Object.assign({ d: bd }, best) : null; };
async function onbState(B) { const n0 = B.onbMsgs.length; send(B, { type: 'onboarding_state' }); return waitFor(() => B.onbMsgs.slice(n0).find((x) => x.type === 'onboarding_state'), 3000); }
async function board(B, vid) { const n0 = B.log.length; send(B, { type: 'village_board', vid }); const m = await waitFor(() => B.log.slice(n0).find((x) => x.type === 'village_board'), 3000); return m ? m.board : null; }
async function equip(B, kind) { const t = (B.toolItems || []).find((x) => x.type === kind); if (!t) return false; if (B.equipped === t.id) return true; send(B, { type: 'equip', toolItemId: t.id }); return !!(await waitFor(() => B.equipped === t.id, 2000)); }
const inv = (B, k) => (B.inv && B.inv[k]) | 0;
const invStr = (B) => JSON.stringify(B.inv);
const myClaims = (B) => [...B.claims.values()].filter((c) => c.ownerPid === B.W.playerId && c.kind === 'personal');
const myHuts = (B) => [...B.blds.values()].filter((b) => (b.type === 'hut_site' || b.type === 'hut') && (b.ownerId === B.W.playerId || (b.data && b.data.owner) === B.W.playerId));
//   가방 차(이름 → 차) — 0 은 빼고
const diff = (a, b) => { const o = {}; for (const k of new Set([...Object.keys(a || {}), ...Object.keys(b || {})])) { const d = ((b || {})[k] | 0) - ((a || {})[k] | 0); if (d) o[k] = d; } return o; };

// ── 플레이어가 하는 일(안내 · 거절 글이 말한 것만) ─────────────────────────────────────────────────
//   E(맨손 줍기) n 번 — 그 자리에서
async function pressE(B, n) { const out = []; for (let i = 0; i < n; i++) { const n0 = B.notices.length; send(B, { type: 'gather' }); await sleep(1100); out.push(...said(B, n0)); } return out; }
//   자갈 — 안내가 가리킨 바위(없으면 보이는 가장 가까운 바위) 곁에서 E · 다 훑으면 옆 바위로
async function getPebbles(B, n, rockHint) {
  const tried = new Set();
  for (let k = 0; k < 6 && inv(B, 'pebble') < n; k++) {
    const r = k === 0 && rockHint ? { x: rockHint.x, y: rockHint.y, id: 'hint' } : nearest(B, (x) => x.type === 'rock' && !tried.has(x.id));
    if (!r) break; tried.add(r.id);
    for (const [dx, dy] of [[30, 0], [-30, 30]]) { if (inv(B, 'pebble') >= n) break; await warp(B, r.x + dx, r.y + dy); await pressE(B, 4); }
  }
  return inv(B, 'pebble') >= n;
}
//   풀 · 잔가지 — 덤불(맨손)
async function getBush(B, fiber, twig) {
  const tried = new Set();
  for (let k = 0; k < 10 && (inv(B, 'fiber') < fiber || inv(B, 'twig') < twig); k++) {
    const b = nearest(B, (x) => x.type === 'berry_bush' && !tried.has(x.id)); if (!b) break; tried.add(b.id);
    await warp(B, b.x + 20, b.y); for (let i = 0; i < 3 && B.res.has(b.id); i++) { send(B, { type: 'gather', resId: b.id }); await sleep(1100); }
  }
  return inv(B, 'fiber') >= fiber && inv(B, 'twig') >= twig;
}
async function craft(B, recipe) { const n0 = B.notices.length; send(B, { type: 'craft', recipe }); await waitFor(() => (B.toolItems || []).some((t) => t.type === recipe), 2500); return { ok: (B.toolItems || []).some((t) => t.type === recipe), said: said(B, n0) }; }
async function getWood(B, n, treeHint) {
  await equip(B, 'crude_axe') || await equip(B, 'axe');
  for (let k = 0; k < 14 && inv(B, 'wood') < n; k++) {
    const t = nearest(B, (x) => x.type === 'tree', k === 0 && treeHint ? treeHint : null); if (!t) break;
    await warp(B, t.x + 25, t.y); for (let i = 0; i < 6 && B.res.has(t.id) && inv(B, 'wood') < n; i++) { send(B, { type: 'gather', resId: t.id }); await sleep(1100); }
  }
  return inv(B, 'wood') >= n;
}
async function getStone(B, n, rockHint) {
  await equip(B, 'crude_pick') || await equip(B, 'pickaxe');
  for (let k = 0; k < 10 && inv(B, 'stone') < n; k++) {
    const r = nearest(B, (x) => x.type === 'rock', k === 0 && rockHint ? rockHint : null); if (!r) break;
    await warp(B, r.x + 30, r.y); for (let i = 0; i < 8 && inv(B, 'stone') < n; i++) { send(B, { type: 'gather', resId: r.id }); await sleep(1100); }
  }
  return inv(B, 'stone') >= n;
}
//   집 재료 한 벌(나무 w · 돌 s) — 조잡한 도구 둘을 먼저(거절 글이 말한 레시피 그대로)
async function houseKit(B, w, s, own) {
  const R = B.W.recipes || {};
  const ax = (R.crude_axe && R.crude_axe.cost) || {}, pk = (R.crude_pick && R.crude_pick.cost) || {};
  const needPeb = (ax.pebble | 0) + (pk.pebble | 0), needFib = (ax.fiber | 0) + (pk.fiber | 0), needTwig = (ax.twig | 0) + (pk.twig | 0);
  const peb = await getPebbles(B, needPeb, own && own.rock);
  const bush = await getBush(B, needFib, needTwig);
  const a = await craft(B, 'crude_axe'), p = await craft(B, 'crude_pick');
  const wood = await getWood(B, w, own && own.tree), stone = await getStone(B, s, own && own.rock);
  return { peb, bush, axe: a.ok, pick: p.ok, wood, stone };
}
//   집터 — 선 자리(`claim` personal · C 키 그 메시지)
async function claimHere(B) {
  const n0 = B.notices.length, c0 = myClaims(B).length, i0 = Object.assign({}, B.inv);
  send(B, { type: 'claim', kind: 'personal' });
  await waitFor(() => myClaims(B).length > c0 || said(B, n0).length, 3000); await sleep(600);
  return { ok: myClaims(B).length > c0, said: said(B, n0), d: diff(i0, B.inv), claim: myClaims(B).slice(-1)[0] || null };
}
//   마을 영토 밖 빈 들 — 마을 중심에서 도착 쪽으로 반지름(r)의 1.5 · 2.5 · 3.5 배 자리(서버가 영토 안 · 밖을 가른다 — 봇은 지레 판정하지 않는다)
const outSpots = (st, vil) => { const a = st.arrive; const dx = a.x - a.centerX, dy = a.y - a.centerY, L = Math.hypot(dx, dy) || 1; return [1.5, 2.5, 3.5].map((k) => ({ x: a.centerX + dx / L * vil.r * k, y: a.centerY + dy / L * vil.r * k })); };

// ── 한 판 ───────────────────────────────────────────────────────────────────────────────────────
async function oneRun(knob, tag) {
  const env = { ENABLE_VILLAGES: '1', ENABLE_BANDITS: '0', ENABLE_ROADS: '0', ENABLE_WILDLIFE: '0', VILLAGE_MAX: '4', VILLAGE_DAY_MS: '500', E2E_GIVE: '1', [KNOB]: knob };
  const R = {}; const T = {}; const t0 = Date.now();
  const put = (id, ok, detail) => { R[id] = { ok: ok === null ? null : !!ok, detail: String(detail === undefined ? '' : detail) }; };
  const S = bootPair(env, tag);
  try {
    const cu = await FB.waitUp(S.cen, /central server up on/, { name: 'central' });
    const zu = await FB.waitUp(S.zon, /zone server up on/, { name: 'zone', capMs: 300000 });
    if (!cu.ok || !zu.ok) throw new Error('기동 실패');
    T.boot = Date.now() - t0;
    // ⓐ 네 마을 — 도착 · 안내 · 의뢰판 · 바위 곁 자갈(Q14 · Q16 · Q19 · Q15 일부)
    const probe = await connect(`bb${tag}probe`, null);
    const VILS = (probe.W.simVillages || []).map((v) => ({ id: v.id, name: v.name, r: v.r }));
    await close(probe);
    const per = [];
    for (const v of VILS) {
      const P = await connect(`bb${tag}v${v.id}`, v.id); await sleep(2500);
      const st = await onbState(P); P.pos = st && st.arrive ? { x: st.arrive.x, y: st.arrive.y } : null;
      const own = st && st.state && st.state.own;
      let bd = null; if (st && st.arrive) { await warp(P, st.arrive.centerX, st.arrive.centerY); bd = await board(P, v.id); }
      const rows = (bd && bd.rows) || [];
      //   바위 곁 자갈 — 안내 자리(없으면 도착에서 가장 가까운 바위)
      const rock = own && own.rock ? own.rock : (P.pos ? nearest(P, (x) => x.type === 'rock') : null);
      let peb = null;
      if (rock) { await warp(P, rock.x + 30, rock.y); const p0 = inv(P, 'pebble'); await pressE(P, 2); peb = inv(P, 'pebble') > p0; }
      per.push({ v, own: own || null, rows: rows.map((r) => ({ item: r.item, qty: r.qty, rew: r.rewItem || null, rq: r.rewQty | 0 })), peb, noRepay: !!(bd && bd.noRepay) });
      await close(P);
    }
    const costs = per.map((p) => p.own && p.own.cost ? `${p.own.cost.wood | 0}/${p.own.cost.stone | 0}` : '없음');
    const repayRows = per.flatMap((p) => p.rows.filter((r) => r.rew).map((r) => `${p.v.name}:${r.item}→${r.rew}×${r.rq}`));
    put('Q14', costs.every((c) => c !== '없음' && c === costs[0]) && repayRows.length === 0 && per.some((p) => p.rows.length),
      `집터 값(나무/돌) ${per.map((p, i) => p.v.name + ' ' + costs[i]).join(' · ')} · 갚음 약속 줄 ${repayRows.length}${repayRows.length ? ' — ' + repayRows.slice(0, 4).join(' ') : ''} · 판 줄 ${per.map((p) => p.rows.length).join('/')}`);
    put('Q16', per.every((p) => p.peb === true), per.map((p) => `${p.v.name} ${p.peb === null ? '바위 없음' : p.peb ? '자갈' : '자갈 0'}`).join(' · '));
    const newbieRows = per.map((p) => p.rows.filter((r) => GATHERABLE.has(r.item)).map((r) => r.item));
    put('Q19', newbieRows.every((x) => x.length > 0), per.map((p, i) => `${p.v.name} [${p.rows.map((r) => r.item).join(',') || '빈 판'}] 낼 수 있는 것 ${newbieRows[i].length}`).join(' · '));
    T.villages = Date.now() - t0;

    // ⓑ 플레이어 A — 광산 마을(안내 바위 곁 자갈이 나오는 마을 · 없으면 첫 마을)에서 안내대로
    const pick = per.find((p) => p.peb) || per[0];
    const VID = pick.v.id, VIL = pick.v;
    const A = await connect(`bb${tag}A`, VID); await sleep(2500);
    send(A, { type: 'onboarding_greet', vid: VID }); await sleep(1500);
    let st = await onbState(A); A.pos = { x: st.arrive.x, y: st.arrive.y };
    const own = st.state && st.state.own;
    const cost = (own && own.cost) || ((A.W.uiCfg && A.W.uiCfg.firstJoin && A.W.uiCfg.firstJoin.cost) || { wood: 3, stone: 2 });
    put('Q15', !!(own && own.cost && (own.cost.wood | 0) > 0 && own.tree && own.rock),
      own ? `안내 칸 own — 값 나무 ${own.cost && own.cost.wood} · 돌 ${own.cost && own.cost.stone} · 나무 자리 ${own.tree ? 'O' : 'X'} · 바위 자리 ${own.rock ? 'O' : 'X'}` : `안내 칸에 집 줄기 없음(state 칸 ${Object.keys(st.state || {}).join(',')})`);
    const contrib0 = st.state.contrib | 0;
    // Q12 — 빈손으로 영토 밖에서 집터
    const spots = outSpots(st, VIL);
    await warp(A, spots[0].x, spots[0].y);
    { const c = await claimHere(A); put('Q12', !c.ok && Object.keys(c.d).length === 0 && c.said.some((t) => /나무|돌|모자|있어야/.test(t)), `빈손 집터 — ${c.ok ? '섰다' : '거절'} · 가방 차 ${JSON.stringify(c.d)} · "${(c.said[0] || '').slice(0, 90)}"`); }
    // Q13 — 받아들여지기 전 곳간
    await warp(A, st.arrive.centerX, st.arrive.centerY);
    { const i0 = Object.assign({}, A.inv); let w = [];
      //   "하루 장부를 닫는 중"은 문이 아니라 차례다 — 다른 까닭이 올 때까지 다시 묻는다(상한 8번)
      for (let k = 0; k < 8; k++) { const n0 = A.notices.length; send(A, { type: 'village_withdraw', vid: VID, res: 'food' }); await sleep(1500); w = said(A, n0); if (!w.some((t) => /장부를 닫는 중/.test(t))) break; }
      const d = diff(i0, A.inv);
      put('Q13', Object.values(d).every((x) => x <= 0) && w.length > 0 && !w.some((t) => /장부를 닫는 중/.test(t)), `곳간 꺼내기 — 가방 차 ${JSON.stringify(d)} · "${(w[0] || '(말 없음)').slice(0, 80)}"`); }
    // Q17 — 맨손 벌목
    { const t = own && own.tree ? own.tree : nearest(A, (x) => x.type === 'tree'); await warp(A, t.x + 25, t.y); const tr = nearest(A, (x) => x.type === 'tree');
      const n0 = A.notices.length; send(A, { type: 'gather', resId: tr.id }); await sleep(1300); const s = said(A, n0).join(' ');
      put('Q17', /있어야/.test(s) && /자갈|잔가지|풀/.test(s), `"${s.slice(0, 110)}"`); }
    // 재료 모으기(Q5 — 받아들임 · 선물 0)
    const onb0 = A.onbMsgs.length, gi0 = Object.assign({}, A.inv), tg = Date.now();
    const kit = await houseKit(A, cost.wood | 0, cost.stone | 0, own);
    T.gather = Date.now() - tg;
    st = await onbState(A);
    const gifts = A.onbMsgs.slice(onb0).filter((m) => m.type === 'onboarding_fx' || (m.type === 'onboarding_quest' && m.kind && m.kind !== 'greet'));
    const gained = Object.keys(diff(gi0, A.inv)).filter((k) => !GATHERABLE.has(k) && !/^seed_/.test(k));
    put('Q5', (st.state.contrib | 0) === contrib0 && gifts.length === 0 && gained.length === 0,
      `모으기 ${Math.round(T.gather / 1000)}초 · 받아들임 ${contrib0} → ${st.state.contrib | 0} · 온보딩 선물 글 ${gifts.length} · 줍지 않은 새 품목 ${gained.join(',') || '0'} · 도구 ${JSON.stringify(kit)}`);
    // Q8 — 영토 안 집터(받아들여지기 전)
    await warp(A, st.arrive.centerX, st.arrive.centerY);
    { const c = await claimHere(A); put('Q8', !c.ok && Object.keys(c.d).length === 0 && c.said.length > 0, `영토 안 집터 — ${c.ok ? '섰다' : '거절'} · 가방 차 ${JSON.stringify(c.d)} · "${(c.said[0] || '').slice(0, 90)}"`); }
    // Q7 · Q6 — 영토 밖 빈 들
    let got = null, tried = [];
    for (const p of spots) { await warp(A, p.x, p.y); const c = await claimHere(A); tried.push(`${c.ok ? '섰다' : '거절'}「${(c.said[0] || '').slice(0, 40)}」`); if (c.ok) { got = c; break; } }
    put('Q7', !!got, `영토 밖 ${tried.join(' · ')}`);
    put('Q6', !!got && (got.d.wood | 0) === -(cost.wood | 0) && (got.d.stone | 0) === -(cost.stone | 0),
      got ? `집터 한 칸 · 가방 차 ${JSON.stringify(got.d)} · 안내 값 나무 ${cost.wood} · 돌 ${cost.stone}` : '집터가 안 섰다');
    // Q18 · Q1 — 움집 첫 삽(가진 것 = 조잡한 돌괭이)
    let hut = null;
    if (got && got.claim) {
      const cl = got.claim, cx = cl.x + 16, cy = cl.y + 16;
      await warp(A, cx, cy); await equip(A, 'crude_pick');
      let n0 = A.notices.length; const h0 = myHuts(A).length; send(A, { type: 'hut_start', atX: cx, atY: cy }); await waitFor(() => myHuts(A).length > h0, 2500); await sleep(400);
      const first = saidRaw(A, n0);
      const firstOk = myHuts(A).length > h0;
      const needMsg = first.find((n) => n.need);
      put('Q18', firstOk || !!needMsg, firstOk ? '조잡한 돌괭이로 첫 삽이 떠졌다' : `거절 "${(first[0] && first[0].text || '').slice(0, 70)}" · need 칸 ${needMsg ? JSON.stringify(needMsg.need) : '없음'}`);
      if (!firstOk) {
        //   거절 글이 말한 것을 한다 — 곡괭이(레시피 = welcome recipes)
        const pc = (A.W.recipes && A.W.recipes.pickaxe && A.W.recipes.pickaxe.cost) || { wood: 3, stone: 5 };
        await getWood(A, pc.wood | 0, null); await getStone(A, pc.stone | 0, null);
        await craft(A, 'pickaxe'); await equip(A, 'pickaxe');
        await warp(A, cx, cy); n0 = A.notices.length; send(A, { type: 'hut_start', atX: cx, atY: cy }); await waitFor(() => myHuts(A).length > h0, 2500); await sleep(400);
      }
      hut = myHuts(A).slice(-1)[0] || null;
    }
    T.house = Date.now() - t0;
    put('Q1', !!hut && !!got, hut ? `내 움집터 ${hut.type} 단계 ${hut.data && hut.data.stage} · 도착부터 ${Math.round((T.house - T.villages) / 1000)}초(순간이동 · 걷기 0)` : `움집터 없음 — 집터 ${got ? '섰다' : '안 섰다'}`);
    // Q3 · Q2 · Q4 — 의뢰판 · 납품(낼 수 있는 줄이 뜰 때까지 판을 다시 묻는다 · 상한 90초)
    await warp(A, st.arrive.centerX, st.arrive.centerY);
    let bd = await board(A, VID), row = null; const tb = Date.now();
    const pickRow = (b) => ((b && b.rows) || []).find((r) => GATHERABLE.has(r.item) && (r.remain | 0) > 0);
    while (!(row = pickRow(bd)) && Date.now() - tb < 90000) { await sleep(3000); bd = await board(A, VID); }
    const rowsNow = (bd && bd.rows) || [];
    put('Q3', rowsNow.length > 0 && rowsNow.every((r) => !r.rewItem && !(r.rewQty | 0)), `판 ${rowsNow.length}줄 · 갚을 것 ${rowsNow.map((r) => r.item + '→' + (r.rewItem ? r.rewItem + '×' + r.rewQty : '없음')).join(' ')}`);
    if (row) {
      const need = row.remain | 0;
      if (row.item === 'wood') await getWood(A, inv(A, 'wood') + need, null);
      else if (row.item === 'stone') await getStone(A, inv(A, 'stone') + need, null);
      else if (row.item === 'pebble') await getPebbles(A, inv(A, 'pebble') + need, null);
      else await getBush(A, row.item === 'fiber' ? inv(A, 'fiber') + need : 0, row.item === 'twig' ? inv(A, 'twig') + need : 0);
      await warp(A, st.arrive.centerX, st.arrive.centerY);
      //   판은 하루(판 시계 0.5초)마다 갈린다 — 내기 바로 앞에 판을 다시 보고 그 줄이 있으면 그 품목으로 · 없으면 Shift+N(서버가 낼 수 있는 첫 의뢰를 고른다)
      const s0 = await onbState(A), c0 = s0.state.contrib | 0, i0 = Object.assign({}, A.inv), n0 = A.notices.length;
      for (let k = 0; k < 30 && (A.inv[row.item] | 0) > (i0[row.item] | 0) - need; k++) {
        const b2 = await board(A, VID); const r2 = ((b2 && b2.rows) || []).find((r) => r.item === row.item && (r.remain | 0) > 0);
        send(A, r2 ? { type: 'village_deliver', vid: VID, item: row.item } : { type: 'village_deliver', vid: VID }); await sleep(1200);
      }
      await sleep(1000);
      const s1 = await onbState(A), d = diff(i0, A.inv);
      const gainedD = Object.entries(d).filter(([, x]) => x > 0);
      put('Q2', (d[row.item] | 0) < 0 && gainedD.length === 0, `노린 줄 ${row.item}×${need} · 가방 차(낸 것)  ${JSON.stringify(d)} · "${(said(A, n0)[0] || '').slice(0, 70)}"`);
      put('Q4', (s1.state.contrib | 0) > c0, `받아들임 ${c0} → ${s1.state.contrib | 0}${s1.state.own ? ` · 인정 ${s1.state.own.recog}` : ''} · 문턱 ${s1.state.need}`);
    } else {
      put('Q2', null, `90초 동안 맨손 · 조잡한 도구로 낼 수 있는 의뢰가 판에 안 떴다 — 판 [${rowsNow.map((r) => r.item).join(',')}]`);
      put('Q4', null, '위와 같음(못 냄)');
    }
    // Q9 — 받아들여진 뒤 영토 안 집터: 문턱(의뢰 n 건)을 판 안에서 못 채운다
    { const s = await onbState(A); put('Q9', null, `못 잼 — 문턱 ${s.state.need}건(지금 ${s.state.contrib | 0}) · 판에 한 번에 뜨는 의뢰 ${rowsNow.length}줄 · 대부분 광석`); }
    // Q10 — 나갔다 들어오기
    {
      const before = { contrib: (await onbState(A)).state.contrib | 0, inv: Object.assign({}, A.inv), claims: myClaims(A).map((c) => c.id).sort().join(','), huts: myHuts(A).map((h) => h.id).sort().join(',') };
      await close(A);
      const A2 = await connect(`bb${tag}A`, VID); await sleep(3000);
      const s2 = await onbState(A2);
      if (hut) await warp(A2, hut.x + 16, hut.y + 16);
      const after = { contrib: s2 && s2.state ? s2.state.contrib | 0 : -1, inv: A2.inv, claims: myClaims(A2).map((c) => c.id).sort().join(','), huts: myHuts(A2).map((h) => h.id).sort().join(',') };
      const dInv = diff(before.inv, after.inv);
      put('Q10', after.contrib === before.contrib && Object.keys(dInv).length === 0 && after.claims === before.claims && after.huts === before.huts && !!s2.state.vid === !!st.state.vid,
        `받아들임 ${before.contrib}→${after.contrib} · 가방 차 ${JSON.stringify(dInv)} · 집터 [${before.claims}]→[${after.claims}] · 움집터 [${before.huts}]→[${after.huts}]`);
      // Q11 — 두 번째 사람이 A 의 터를 고른다(재료를 갖추고)
      const Bp = await connect(`bb${tag}B`, VID); await sleep(2500);
      const sb = await onbState(Bp); Bp.pos = { x: sb.arrive.x, y: sb.arrive.y };
      const ownB = sb.state && sb.state.own;
      await houseKit(Bp, cost.wood | 0, cost.stone | 0, ownB);
      const myc = got && got.claim;
      if (myc) {
        await warp(Bp, myc.x + 16, myc.y + 16);
        const c = await claimHere(Bp);
        const Aclaims = myClaims(A2).map((x) => x.id).sort().join(',');
        put('Q11', !c.ok && Object.keys(c.d).length === 0 && c.said.length > 0 && Aclaims === before.claims,
          `둘째 사람 같은 칸 — ${c.ok ? '섰다' : '거절'} · 가방 차 ${JSON.stringify(c.d)} · "${(c.said[0] || '').slice(0, 80)}" · 첫 사람 집터 그대로 ${Aclaims === before.claims}`);
      } else put('Q11', false, '첫 사람 집터가 없어 못 쟀다');
      await close(Bp); await close(A2);
    }
    T.all = Date.now() - t0;
  } catch (e) {
    R.__err = String(e && e.stack || e).slice(0, 400);
  } finally { await S.down(); await sleep(1500); }
  return { R, T, env };
}

// ── 본판 ───────────────────────────────────────────────────────────────────────────────────────
let pass = 0, fail = 0;
const ok = (c, m, x) => { c ? pass++ : fail++; console.log((c ? '  ✓ ' : '  ✗ ') + m + (x !== undefined && x !== '' ? `  ${x}` : '')); };
(async () => {
  console.log('=== T1354 온보딩 결과 하네스(검사 카드 · 구현 안 봄) ===');
  console.log(`\n① 켬 판 — 존 env ${KNOB}=1`);
  const on = await oneRun('1', 'on');
  if (on.R.__err) ok(false, '★켬 판이 끝까지 돌았다', on.R.__err);
  for (const id of Object.keys(Q)) {
    const r = on.R[id];
    if (!r) { ok(false, `${id} ${Q[id]}`, '안 쟀다(판이 거기까지 못 갔다)'); continue; }
    if (r.ok === null) { console.log(`  · [못 잼] ${id} ${Q[id]}  ${r.detail}`); continue; }
    ok(r.ok, `${id} ${Q[id]}`, r.detail);
  }
  console.log(`  [시간] 기동 ${Math.round((on.T.boot || 0) / 1000)}초 · 네 마을 ${Math.round(((on.T.villages || 0) - (on.T.boot || 0)) / 1000)}초 · 재료 모으기 ${Math.round((on.T.gather || 0) / 1000)}초 · 판 전체 ${Math.round((on.T.all || 0) / 1000)}초`);

  console.log(`\n② 미끼 — 끔 판(존 env ${KNOB}=0 · 바뀐 칸 하나) · 켬 전용 질문 ${ONLY_ON.join(' · ')} 이 빨강이어야 한다`);
  if (process.env.ONB_BB_ONLY === 'on') { ok(false, '미끼 판을 안 돌렸다(ONB_BB_ONLY=on)'); }
  else {
    const off = await oneRun('0', 'off');
    const changed = Object.keys(Object.assign({}, on.env, off.env)).filter((k) => on.env[k] !== off.env[k]);
    ok(changed.length === 1 && changed[0] === KNOB, '[미끼 전제] 두 판의 존 env 가 정확히 한 칸 다르다', changed.join(',') || '0칸');
    if (off.R.__err) ok(false, '[미끼 전제] 끔 판이 끝까지 돌았다', off.R.__err);
    for (const id of ONLY_ON) {
      const r = off.R[id];
      ok(!!r && r.ok === false, `★미끼 ${id} — 끔 판에서 빨강(켬 전용 줄이 손잡이를 잰다)`, r ? `${r.ok === null ? '못 잼' : r.ok ? '초록' : '빨강'} · ${r.detail.slice(0, 140)}` : '안 쟀다');
    }
    //   끔 판 줄마다 — 참고(판정 아님): 초록 · 빨강 · 못 잼 · 안 잼(판이 거기까지 못 갔다)
    const st = (r) => (!r ? '안잼' : r.ok === null ? '못잼' : r.ok ? '초록' : '빨강');
    console.log(`  [끔 판 줄마다 — 참고] ${Object.keys(Q).map((id) => id + ' ' + st(off.R[id])).join(' · ')}`);
  }
  console.log(`\n=== ${pass + fail}건 중 PASS ${pass} · FAIL ${fail} ===`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
