#!/usr/bin/env node
// @regress   ← 통합 러너가 이 표를 보고 자기 목록을 만든다(scripts/run-regress.sh · 표 없으면 안 돈다)
// @bait 6
// === scripts/test-deeds-blackbox.js — ★검사 카드 T1390: 사유지 돌봄 — 구현을 안 보고 결과만 묻는다 ====================
//
// ★왜 [카드 T1390 · 공통 "테스트 강화 규약" ⑥ · ⑦] 사유지 돌봄(`T1305_DEEDS`)을 켬 기본으로 올리려 한다. 구현 세션이 짠 하네스는 구현이 보는 것만 본다.
//   이 하네스는 **재민의 말에서만** 질문을 뽑아(아래 머리 표 · 글자 그대로) **플레이어 손**으로 묻는다 — 실제 존(central + zone)을 띄우고
//   게스트 ws 손이 보내는 메시지(`claim` · `unclaim` · `craft` · 순간이동 `teleport_debug` · 재료 `__e2e_give` — E2E_GIVE 판)와
//   손이 받는 메시지(`claim_added` · `claim_removed` · `deeds_meter` · `notice` · `inventory` · `welcome.claims`)만 읽는다. 서버 함수 · 서버 파일 글자를 읽지 않는다.
// ★시간: 실제 날짜로 줄어든다(재민 11-16) — ★[T1403 · 재민 11-20 판정 13 "서버가 꺼진 시간은 빚으로 안 센다"] 두 꼴로 민다:
//   · **켜진 채** 보름 · 한 달 — 존을 띄운 채 사유지 시계만 민다(`scripts/fixture-deeds-clock.js` 프리로드 · T1402 의 시계 넣는 길 `_t1332SetClock`).
//   · **꺼진 채** 보름 — 존을 내렸다가 같은 DB 로 벽시계를 민 채 다시 띄운다(`scripts/clock-shift.js` · `T1356_CLOCK_SHIFT_DAYS`) — 그 보름은 안 센다(Q17).
//   하네스에 날짜 · 벽시계 값을 박지 않는다(계량기의 `now` 는 서버가 준 것).
//
// ★재민의 말(기준의 뿌리 — 카드 T1390 글자 그대로)
//   11-13 "사유지는 마을과 아무 상관이 없다 — 마을 미가입자도 만들 수 있어야" · "마을 영토 안에는 그 마을에서 인정받은 사람만" ·
//         "선포할 때는 언제나 일정한 양의 돌과 나무" · "상한은 겉으로 무제한처럼 보이되 사실상 있게"
//   11-15 "저게 너무 숙제처럼 변하는 거 아냐?"
//   11-16 "보통 수십 칸이면 충분" · "욕심을 부릴수록 관리가 공격적으로 피곤해져야" · "현실 날짜로 보름 동안 안 들어와도 어느 정도는 유지돼야" ·
//         버티는 날 15일 × (40 ÷ 내 칸)²
//   11-19 점수 = 일한 시간(속임 이득 0) · "1셀 단위로 없어지게 하되 … 카운트다운을 처음부터 다시 세면 안 되는 거지" ·
//         "처음부터 24칸 가진 사람이 장기적으로 더 오래 살아남는 … 그 원리 좋거든"
//
// ★판 — ① 켬(존 env `T1305_DEEDS=1`): 판 ⓐ(시계 0) 선포 · 계량기 → 판 ⓑ(다시 띄움 · 시계 0) → 판 ⓑ'(꺼진 채 +15일 · Q17) → 판 ⓒ(켜진 채 +15일) → 판 ⓓ(켜진 채 +30일)
//        ② 미끼 — 끔(`T1305_DEEDS=0` · 바뀐 칸 하나): 켬에서만 뜻이 있는 질문이 빨강이어야 한다(Q4 · Q5 · Q6 · Q7 · Q8 · Q14 — 6줄)
//   손 아홉: A 24칸 · B 40칸 · C 70칸 · D 100칸 · E 70칸(다시 선포 공격) · F · G 16칸(일하는 손 둘) · H 땅 없음(영토 안 묻기 · 남의 땅 색 보기) ·
//            K 24칸(서버가 켜진 채 나가 있기)
//
// 실행: node scripts/test-deeds-blackbox.js [--arm on|off|both(기본)]
'use strict';
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const WebSocket = require('ws');
const FB = require('./fixture-boot');
const ROOT = path.join(__dirname, '..');
const argv = process.argv.slice(2);
const val = (f, d) => { const i = argv.indexOf(f); return i >= 0 ? argv[i + 1] : d; };
const ARM = val('--arm', 'both');
const KNOB = 'T1305_DEEDS';
const SHIFT = path.join(__dirname, 'clock-shift.js');
const DCLOCK = path.join(__dirname, 'fixture-deeds-clock.js');   // ★[T1403] 켜진 채 사유지 시계 밀기
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let pass = 0, fail = 0;
const ok = (c, m, d) => { if (c) pass++; else fail++; console.log(`  ${c ? '✓' : '✗'} ${m}${d !== undefined ? '  ' + d : ''}`); return !!c; };
const DAY = 86400000;
const Q = {
  Q1: '마을 미가입자도 빈 들에 사유지를 선포할 수 있다(11-13 "마을과 아무 상관이 없다")',
  Q2: '마을 영토 안에는 그 마을에서 인정받은 사람만 — 미가입자 · 가입만 한 사람은 거절되고 가방이 안 준다(11-13)',
  Q3: '선포할 때는 언제나 일정한 양의 돌과 나무 — 1칸째와 100칸째 값이 같다(11-13)',
  Q4: '상한은 겉으로 무제한처럼 — 100칸째 선포도 서고 거절 글에 칸 수 상한이 없다(11-13)',
  Q5: '상한은 사실상 있게 — 칸이 늘수록 안 돌보면 버티는 날이 준다(24 > 40 > 70 > 100 · 11-13)',
  Q6: '보통 수십 칸이면 충분 — 40칸이 안 돌보고 버티는 날이 보름 이상(11-16 15일 × (40 ÷ N)²)',
  Q7: '욕심을 부릴수록 공격적으로 피곤 — 칸이 두 배 반이면 버티는 날은 그 제곱만큼 준다(40 → 100 · 11-16)',
  Q8: '숙제처럼 변하지 않는다 — 40칸이 하루에 잃는 관리도가 일 10분 몫보다 작다(점수 = 일한 시간 · 11-15 · 11-19)',
  Q9: '현실 날짜로 보름 안 들어와도 어느 정도 유지 — 24칸은 다 · 40칸은 절반 넘게 남는다(11-16)',
  Q10: '1셀 단위로 없어진다 — 보름 뒤 70칸 · 100칸이 통째로 사라지지 않고 몇 칸만 줄었다(11-19)',
  Q11: '카운트다운을 처음부터 다시 세지 않는다 — 칸을 잃은 뒤 접속한 땅의 다음 풀림이 버티는 날 처음부터가 아니다 · 보름 더 뒤엔 더 줄었다(11-19)',
  Q12: '[기준 공격] 칸을 내놓고 바로 다시 선포해도 카운트다운이 처음부터 다시 서지 않는다(빚 털기 0 · 11-19)',
  Q13: '처음부터 24칸 가진 사람이 장기적으로 더 오래 — 30일 뒤 24칸 사람이 100칸 사람보다 칸이 적지 않다(11-19)',
  Q14: '점수 = 일한 시간(속임 이득 0) — 같은 시간 동안 일을 열 배 자주 해도 관리도가 더 오르지 않는다(11-19)',
  Q15: '서버를 내렸다 올려도(시계 그대로) 내 땅 · 버티는 날이 그대로다(현실 날짜 · 11-16)',
  Q16: '현실 날짜로 보름 안 들어와도 어느 정도 유지 — 서버가 켜진 채 몇 분 나가 있다 와도 내 땅이 내 땅이다(이웃이 지나가도 · 이웃이 그 칸을 못 잡는다 · 11-16)',
  Q17: '서버가 꺼진 채 보름이면 그 보름은 안 센다 — 다시 띄운 뒤 내 땅 칸 · 버티는 날 · 다음 풀림이 꺼지기 전 그대로(11-20 판정 13)',
};

// ── 존 띄우기 ────────────────────────────────────────────────────────────────
const LP = require('./lib-port');
const base = LP.ports(4, 39500);
const CPORT = base, ZPORT = base + 2;
const RUN = `/tmp/t1390-bb-${process.pid}`;
fs.mkdirSync(RUN, { recursive: true }); require('./lib-tmp').own(RUN);   // ★[T1403 · lint ㉑] 제 /tmp 는 lib-tmp 에
const DFILE = path.join(RUN, 'deeds-clock');
let procs = [];
function boot(file, env, db) {
  const p = spawn(process.execPath, [path.join(ROOT, 'server', file)], { cwd: ROOT, env: Object.assign({}, process.env, env, { DB_PATH: db }), stdio: ['ignore', 'pipe', 'pipe'] });
  p.stdout.on('data', () => {}); p.stderr.on('data', () => {});
  procs.push(p); return p;
}
async function up(arm, shiftDays) {
  const env = { T1356_CLOCK_SHIFT_DAYS: String(shiftDays || 0), NODE_OPTIONS: `${process.env.NODE_OPTIONS || ''} --require ${SHIFT} --require ${DCLOCK}`.trim(), T1403_DEEDS_CLOCK_FILE: DFILE };
  const cen = boot('central.js', Object.assign({ PORT: String(CPORT), PUBLIC_HOST: 'localhost', ENABLED_ZONES: 'hanbando' }, env), path.join(RUN, `${arm}-c.db`));
  const zon = boot('zone.js', Object.assign({ PORT: String(ZPORT), ZONE_ID: 'hanbando', CENTRAL_URL: `http://localhost:${CPORT}`, ENABLE_VILLAGES: '1', ENABLE_BANDITS: '0', ENABLE_ROADS: '0',
    ENABLE_WILDLIFE: '0', VILLAGE_MAX: '4', E2E_GIVE: '1', [KNOB]: arm === 'on' ? '1' : '0' }, env), path.join(RUN, `${arm}-z.db`));
  const a = await FB.waitUp(cen, /central server up on/, { name: 'central' }), b = await FB.waitUp(zon, /zone server up on/, { name: 'zone', capMs: 400000 });
  zoneProc = zon;
  return a.ok && b.ok;
}
//   ★[T1403] 켜진 채 사유지 시계를 민다(존을 안 내린다) — 민 날을 파일에 쓰고 존에 SIGUSR2 · 존이 `<파일>.ack` 에 답한다
let zoneProc = null;
async function pushDeeds(days) {
  try { fs.rmSync(DFILE + '.ack', { force: true }); } catch (e) {}
  fs.writeFileSync(DFILE, String(days));
  try { zoneProc.kill('SIGUSR2'); } catch (e) { return false; }
  const ack = await waitFor(() => { try { return fs.readFileSync(DFILE + '.ack', 'utf8'); } catch (e) { return null; } }, 5000);
  return ack === String(days);
}
async function down() { for (const p of procs) { try { p.kill('SIGTERM'); } catch (e) {} } await sleep(1500); for (const p of procs) { try { p.kill('SIGKILL'); } catch (e) {} } procs = []; await sleep(500); }
process.on('exit', () => { for (const p of procs) { try { p.kill('SIGKILL'); } catch (e) {} } try { fs.rmSync(RUN, { recursive: true, force: true }); } catch (e) {} });

// ── 손(게스트 ws) ─────────────────────────────────────────────────────────────
function connect(user) {
  return new Promise((resolve, reject) => {
    const q = new URLSearchParams({ username: user, password: 'pw-' + user, name: user, color: '#5a9ae0' });
    const ws = new WebSocket(`ws://localhost:${ZPORT}/?${q}`);
    const P = { ws, user, inv: {}, notices: [], mine: new Map(), meter: null, meters: 0, W: null, states: [], closed: null };
    //   손이 하는 박동 — 화면 클라처럼 몇 초마다 `ping`(안 보내면 서버가 25초쯤에 소켓을 끊는다 — 1006 · 판 ⓐ 실측)
    const hb = setInterval(() => { try { if (ws.readyState === 1) ws.send(JSON.stringify({ type: 'ping', t: Date.now() })); } catch (e) {} }, 5000);
    ws.on('close', (c) => { clearInterval(hb); P.closed = c; });
    const to = setTimeout(() => reject(new Error('접속 시간초과 ' + user)), 90000);
    ws.on('message', (raw) => {
      let m; try { m = JSON.parse(String(raw)); } catch (e) { return; }
      if (m.type === 'welcome') {
        P.W = m; P.inv = m.inventory || {}; P.pid = m.playerId || m.pid;   // 사유지 레코드의 ownerPid 는 계정 쪽 id(playerId)
        for (const c of m.claims || []) if (c.ownerPid === P.pid && (c.kind || 'personal') === 'personal') P.mine.set(c.id, c);
        clearTimeout(to); resolve(P);
      } else if (m.type === 'inventory') P.inv = m.inventory || {};
      else if (m.type === 'notice') P.notices.push(String(m.text || ''));
      else if (m.type === 'deeds_meter') { P.meter = m; P.meters++; }
      else if (m.type === 'claim_added' && m.claim && m.claim.ownerPid === P.pid && (m.claim.kind || 'personal') === 'personal') P.mine.set(m.claim.id, m.claim);
      else if (m.type === 'claim_removed') P.mine.delete(m.id);
      else if (m.type === 'claim_state') { P.states.push({ id: m.id, state: m.state, at: Date.now() }); if (P.mine.has(m.id)) P.mine.get(m.id).state = m.state; }   // 화면: 내 땅 목록의 '풀림'(회색 '빈 자리')
    });
    ws.on('error', (e) => { clearTimeout(to); reject(e); });
  });
}
//   내 땅 = 내 개인 사유지 중 '풀림'(state 'free' — 화면 목록 "풀림" · 회색 칸)이 아닌 것
const own = (P) => [...P.mine.values()].filter((c) => c.state !== 'free');
const send = (P, o) => { try { P.ws.send(JSON.stringify(o)); } catch (e) {} };
async function waitFor(fn, ms) { const t0 = Date.now(); while (Date.now() - t0 < ms) { const v = fn(); if (v) return v; await sleep(60); } return fn(); }
async function warp(P, x, y) { const n0 = P.notices.length; send(P, { type: 'teleport_debug', x: Math.round(x), y: Math.round(y) }); await waitFor(() => P.notices.slice(n0).some((t) => /텔레포트 →/.test(t)), 3000); await sleep(150); }
async function give(P, items) { const n0 = P.notices.length; send(P, { type: '__e2e_give', items }); await waitFor(() => P.notices.length > n0, 3000); await sleep(200); }
async function claimHere(P) {
  const n0 = own(P).length, k0 = P.notices.length, i0 = Object.assign({}, P.inv);
  send(P, { type: 'claim', kind: 'personal' });
  await waitFor(() => own(P).length > n0 || P.notices.length > k0, 3000);
  await sleep(120);
  const ok1 = own(P).length > n0;
  const said = P.notices.slice(k0).filter((t) => !/텔레포트/.test(t)).join(' | ');
  const cost = {}; for (const k of new Set([...Object.keys(i0), ...Object.keys(P.inv)])) { const d = (P.inv[k] | 0) - (i0[k] | 0); if (d) cost[k] = d; }
  return { ok: ok1, said, cost };
}
//   땅 N 칸 — 상자(가로 W) 안을 뱀 꼴로 걸으며 한 칸씩 C(실패 칸은 건너뛴다 · 붙은 땅이 끊기지 않게 줄 끝에서 꺾는다)
async function claimN(P, x0, y0, N, W, maxMiss) {
  const SZ = 32, rows = Math.ceil(N / W) + 6, res = { costs: [], refused: [], firstSaid: '' };
  for (let j = 0; j < rows && own(P).length < N; j++) for (let ii = 0; ii < W && own(P).length < N; ii++) {
    if (maxMiss && res.refused.length >= maxMiss && !res.costs.length) return res;   // 끔 판 — 첫 칸부터 줄곧 거절이면 그만
    const i = j % 2 ? W - 1 - ii : ii;
    await warp(P, x0 + i * SZ + 16, y0 + j * SZ + 16);
    const r = await claimHere(P);
    if (r.ok) { res.costs.push(r.cost); if (!res.firstSaid) res.firstSaid = r.said; } else res.refused.push(r.said);
  }
  return res;
}
const meterNow = (M) => { if (!M) return null; const now = M.now; let m = 0, cap = 0, rDay = 0; for (const q of M.chunks || []) { m += Math.max(0, q.m - q.r * Math.max(0, now - q.t)); cap += q.cap; rDay += q.r * DAY; } return { m, cap, rDay, N: M.N, days: M.days, first: M.first, now, debt: M.debt, perDay: M.perDay }; };
async function relog(P) { try { P.ws.close(); } catch (e) {} await sleep(300); return connect(P.user); }
async function freshMeter(P) { const k = P.meters; await waitFor(() => P.meters > k || P.meter, 3000); return P.meter; }

// ── 판 ───────────────────────────────────────────────────────────────────────
const ROW = {};   // 질문 → 켬 결과(미끼 판에 넘긴다)
async function runOn() {
  console.log(`\n① 켬 판 — 존 env ${KNOB}=1`);
  if (!(await up('on', 0))) { ok(false, '켬 판 존 기동'); return; }
  const H = await connect('bbH');
  const home = { x: H.W.self.homeX, y: H.W.self.homeY };
  const vil = (H.W.simVillages || [])[0];
  // Q2 — 땅 없는 손 H: 미가입자로 영토 안 · 가입(/소속) 뒤 영토 안
  await give(H, { wood: 50, stone: 50 });
  //   ★[T1501] 첫 집터 3×3(T1392 · T1428 `8cad948b9` 부터 돌봄과 같이 켬 기본)은 아홉 칸 막힘을 영토 문보다 먼저 본다 — 마을 시설 곁(종전 +2칸)에선
  //     "아홉 칸(3×3)" 거절이 먼저 나와 영토 문까지 안 간다. 영토 안에서 아홉 칸이 빈 자리를 찾아 그 자리에서 묻는다(거절 · 가방 차 0 단언은 그대로).
  const LOT = /아홉 칸\(3×3\)을 한 번에/;
  let h1 = null, spot = null, tried = [];
  //     중심 곁 6칸 안은 마을 시설이 촘촘해(첫 판 18/18 막힘) 영토(반경 ~30칸) 안쪽 고리 8 · 11 · 14 · 18칸 여덟 방향까지 넓힌다.
  const RING = [[2, 2], [3, 3], [4, 0], [0, 4], [-4, 0], [0, -4]];
  for (const r of [8, 11, 14, 18]) for (const [ux, uy] of [[1, 0], [0, 1], [-1, 0], [0, -1], [1, 1], [-1, 1], [1, -1], [-1, -1]]) RING.push([ux * r, uy * r]);
  for (const [dx, dy] of RING) {
    const x = vil.cx * 32 + 16 + dx * 32, y = vil.cy * 32 + 16 + dy * 32;
    await warp(H, x, y); const r = await claimHere(H); tried.push(r);
    if (r.ok || !LOT.test(r.said)) { h1 = r; spot = { x, y }; break; }
  }
  if (!h1) h1 = tried[tried.length - 1];
  const triedCost = tried.filter((r) => Object.keys(r.cost).length).length;
  await warp(H, vil.cx * 32 + 16 + 64, vil.cy * 32 + 16 + 64);   // ★[T1501] 가입은 종전 자리(마을 곁 +2칸)에서 — 먼 자리에선 "마을에서 너무 멉니다"
  const k1 = H.notices.length; send(H, { type: 'chat', text: '/소속' }); await sleep(1200);
  const joined = H.notices.slice(k1).join(' | ');   // 가입 말("…부탁을 n건 더 채우면 구성원으로 인정됩니다")
  if (spot) await warp(H, spot.x, spot.y);
  const h2 = await claimHere(H);
  ok(!!spot && !h1.ok && !h2.ok && /구성원으로 인정/.test(joined) && !triedCost && !Object.keys(h2.cost).length && /인정|구성원|영토/.test(h1.said) && /인정|구성원|영토/.test(h2.said), Q.Q2,
    `자리 ${spot ? tried.length + '번째' : '못 찾음(' + tried.map((r) => ((r.said.match(/잡습니다\. (.*?)입니다/) || [])[1] || r.said.slice(0, 20))).slice(-3).join(' / ') + ')'} · 미가입 "${h1.said.slice(0, 40)}" · 가입 "${joined.slice(-40)}" · 가입 뒤 "${h2.said.slice(0, 40)}" · 가방 차 ${JSON.stringify([h1.cost, h2.cost])}`);
  // Q16 — 손 K: 24칸을 잡고 **나간다**(서버는 켠 채). 이웃 H 가 K 땅을 지나가고(몇 칸 밟고 선다) 다른 손들이 땅을 넓히는 동안 H 가 K 땅의 색(claim_state)을 본다
  let K = await connect('bbK'); await give(K, { wood: 100, stone: 100 });
  await claimN(K, Math.floor(home.x / 32) * 32 - 40 * 32, Math.floor(home.y / 32) * 32 + 6 * 32, 24, 6);
  const kIds = new Set(own(K).map((c) => c.id)), kN = kIds.size, kCells = own(K).slice();
  try { K.ws.close(); } catch (e) {}
  const tK = Date.now();
  await sleep(2000);
  for (const c of kCells.filter((_, i) => i % 6 === 0)) { await warp(H, c.x + 16, c.y + 16); await sleep(1500); }   // 이웃이 지나간다
  //   [기준 공격] 자리 비운 사이 이웃이 내 칸을 잡는다 — H(땅 없음 · 첫 칸은 어디든)가 K 의 마지막 칸 위에서 C
  const kLast = kCells[kCells.length - 1]; await warp(H, kLast.x + 16, kLast.y + 16); await sleep(1500);
  const steal = await claimHere(H);
  await warp(H, home.x, home.y);
  // 땅 넓히기 — 손마다 떨어진 상자(빈 들 · 도착 집 곁에서 16칸 간격)
  const plan = [['bbA', 24, 6], ['bbB', 40, 8], ['bbC', 70, 10], ['bbD', 100, 12], ['bbE', 70, 10], ['bbF', 16, 4], ['bbG', 16, 4]];
  const P = {}, got = {};
  let k = 0;
  for (const [u, N, W] of plan) {
    const p = await connect(u);
    await give(p, { wood: 3 * N + 30, stone: 2 * N + 30 });
    const ox = home.x + ((k % 4) - 1.5) * 16 * 32, oy = home.y + (Math.floor(k / 4) * 16 + 6) * 32;
    got[u] = await claimN(p, Math.floor(ox / 32) * 32, Math.floor(oy / 32) * 32, N, W);
    P[u] = p; k++;
  }
  const n = (u) => own(P[u]).length;
  console.log(`    땅: ${plan.map(([u, N]) => `${u.slice(2)} ${n(u)}/${N}`).join(' · ')}`);
  const tally = (arr) => { const t = {}; for (const x of arr) { const kk = String(x).replace(/\d+/g, '#').slice(0, 44) || '(말 없음)'; t[kk] = (t[kk] || 0) + 1; } return JSON.stringify(t); };
  console.log(`    거절 글(건너뛴 칸 — 물 · 길 · 남의 땅 등): ${plan.map(([u]) => `${u.slice(2)} ${got[u].refused.length}`).join(' · ')} — D ${tally(got.bbD.refused)}`);
  //   계량기는 다시 접속해 새로 받은 것으로 읽는다(선포 사이에 온 것은 한 칸 늦을 수 있다)
  for (const u of Object.keys(P)) { P[u] = await relog(P[u]); await freshMeter(P[u]); }
  //   ★[T1501] 첫 선포는 첫 집터 아홉 칸(3×3 · T1392 — T1428 `8cad948b9` 부터 돌봄과 같이 켬 기본) — 알림 글이 "사유지 아홉 칸(3×3)을 두었습니다" 다.
  ok(n('bbA') >= 1 && /사유지(?: 아홉 칸\(3×3\))?을 두었습니다/.test(got.bbA.firstSaid), Q.Q1, `첫 칸 "${got.bbA.firstSaid.slice(0, 60)}"`);
  //   ★[T1501] 첫 선포(아홉 칸 한 묶음 값 — T1392 설계)는 칸 값이 아니다 — "1칸째와 100칸째 값이 같다"는 둘째 선포부터 견준다(한 칸씩 넓히는 값).
  const cs0 = got.bbD.costs.map((c) => JSON.stringify(c)), first = cs0[0], cs = /아홉 칸\(3×3\)/.test(got.bbD.firstSaid || '') ? cs0.slice(1) : cs0;
  const same = cs.length > 1 && cs.every((c) => c === cs[0]);
  ok(same && /wood|stone/.test(cs[0] || ''), Q.Q3, `넓힌 ${cs.length}칸 · 첫 집터(3×3) ${first} · 넓힌 첫 칸 ${cs[0]} · 마지막 칸 ${cs[cs.length - 1]}`);
  const capWords = got.bbD.refused.filter((t) => /상한|슬롯|\/\s*9|더 둘 수 없|최대/.test(t));
  ok(n('bbD') === 100 && !capWords.length, Q.Q4, `D ${n('bbD')}칸 · 거절 ${got.bbD.refused.length}(상한 말 ${capWords.length})`);
  const M = {}; for (const u of Object.keys(P)) M[u] = meterNow(P[u].meter);
  const dd = ['bbA', 'bbB', 'bbC', 'bbD'].map((u) => M[u] && M[u].days);
  ROW.Q5 = ok(dd.every((x) => Number.isFinite(x)) && dd[0] > dd[1] && dd[1] > dd[2] && dd[2] > dd[3], Q.Q5, `버티는 날 24 ${dd[0]} · 40 ${dd[1]} · 70 ${dd[2]} · 100 ${dd[3]}`);
  ROW.Q6 = ok(M.bbB && M.bbB.N === 40 && M.bbB.days >= 15, Q.Q6, `40칸 ${M.bbB && M.bbB.days}일`);
  const ratio = M.bbB && M.bbD ? M.bbB.days / M.bbD.days : NaN;
  ROW.Q7 = ok(ratio >= Math.pow(100 / 40, 2) * 0.9, Q.Q7, `40칸 ÷ 100칸 버티는 날 = ${Number.isFinite(ratio) ? ratio.toFixed(2) : '?'} (넓이 비의 제곱 6.25 · 정비례면 2.5)`);
  ROW.Q8 = ok(M.bbB && M.bbB.rDay > 0 && M.bbB.rDay <= 600, Q.Q8, `40칸 하루 잃는 관리도 ${M.bbB ? Math.round(M.bbB.rDay) : '?'}점 · 일 10분 = 600점(초당 1점)`);
  // Q16 — K 가 나간 지 8분 넘게(서버는 켠 채) — 다시 들어오면 내 땅이 그대로여야(보름도 버티는 땅이 몇 분에 '빈 자리'가 되면 빨강)
  while (Date.now() - tK < 8 * 60000) await sleep(5000);
  K = await connect('bbK'); await freshMeter(K);
  const kSeen = {}; for (const e of H.states) if (kIds.has(e.id) && !(e.state in kSeen)) kSeen[e.state] = ((e.at - tK) / 60000).toFixed(1) + '분';
  ok(own(K).length === kN && kN === 24 && !steal.ok, Q.Q16, `나간 뒤 ${((Date.now() - tK) / 60000).toFixed(1)}분 · 내 땅 ${kN} → ${own(K).length}칸 · 계량기 N ${K.meter && K.meter.N} · 이웃이 본 색 ${JSON.stringify(kSeen)} · 이웃이 내 칸 잡기 ${steal.ok ? '섰다' : '거절'}${steal.said ? ' "' + steal.said.slice(0, 40) + '"' : ''}`);
  try { K.ws.close(); } catch (e) {}
  // Q15 — 다시 띄우기(시계 그대로)
  const before = Object.fromEntries(Object.keys(P).map((u) => [u, { n: n(u), days: M[u] && M[u].days, N: M[u] && M[u].N }]));
  for (const u of Object.keys(P)) { try { P[u].ws.close(); } catch (e) {} } try { H.ws.close(); } catch (e) {}
  await down();
  if (!(await up('on', 0))) { ok(false, '켬 판 다시 기동'); return; }
  for (const u of Object.keys(P)) { P[u] = await connect(u); await freshMeter(P[u]); }
  const keep = Object.keys(P).every((u) => n(u) === before[u].n && P[u].meter && P[u].meter.N === before[u].N && Math.abs(P[u].meter.days - before[u].days) <= 0.01 * before[u].days);
  ok(keep, Q.Q15, Object.keys(P).map((u) => `${u.slice(2)} ${before[u].n}칸 ${before[u].days}일→${n(u)}칸 ${P[u].meter && P[u].meter.days}일`).join(' · '));
  // Q17 — ★[T1403 · 판정 13] 꺼진 채 보름(존을 내리고 벽시계를 보름 민 채 다시 띄움) — 그 보름은 안 센다
  const nextOf0 = (MM) => (MM && MM.first > MM.now ? MM.first - MM.now : NaN);
  const snap = () => Object.fromEntries(Object.keys(P).map((u) => { const mm = meterNow(P[u].meter); return [u, { n: n(u), N: mm && mm.N, days: mm && mm.days, next: nextOf0(mm) }]; }));
  const pre = snap();
  for (const u of Object.keys(P)) { try { P[u].ws.close(); } catch (e) {} }
  await down();
  if (!(await up('on', 15))) { ok(false, '켬 판 꺼진 채 +15일 기동'); return; }
  for (const u of Object.keys(P)) { P[u] = await connect(u); await freshMeter(P[u]); }
  const off15 = snap();
  const h0 = (x) => (Number.isFinite(x) ? (x / 3600000).toFixed(1) + '시간' : '?');
  //   다음 풀림 — 꺼진 보름이 셈에 들면 수백 시간이 빠진다 · 켜진 몇 분(다시 띄우는 사이)은 1시간 안
  const offKeep = Object.keys(P).every((u) => off15[u].n === pre[u].n && off15[u].N === pre[u].N && Math.abs(off15[u].days - pre[u].days) <= 0.01 * pre[u].days
    && (!Number.isFinite(pre[u].next) || (Number.isFinite(off15[u].next) && Math.abs(off15[u].next - pre[u].next) <= 3600000)));
  ok(offKeep, Q.Q17, ['bbA', 'bbB', 'bbC', 'bbD'].map((u) => `${u.slice(2)} ${pre[u].n}칸 다음 ${h0(pre[u].next)} → ${off15[u].n}칸 다음 ${h0(off15[u].next)}`).join(' · '));
  // Q14 — 일하는 손 둘(F 3초마다 한 번 · G 0.3초마다 한 번 · 같은 45초) — 먼저 시계를 밀어 관리도가 덜 찬 땅에서
  //   ★[T1403] 켜진 채 +15일 — 존을 안 내리고 사유지 시계만 민다(그 보름은 센다)
  if (!(await pushDeeds(15))) { ok(false, '켬 판 켜진 채 +15일 시계 밀기'); return; }
  for (const u of Object.keys(P)) { P[u] = await relog(P[u]); await freshMeter(P[u]); }
  const M15 = {}; for (const u of Object.keys(P)) M15[u] = meterNow(P[u].meter);
  const n15 = Object.fromEntries(Object.keys(P).map((u) => [u, n(u)]));
  console.log(`    켜진 채 +15일: ${Object.keys(P).map((u) => `${u.slice(2)} ${n15[u]}칸`).join(' · ')}`);
  ok(n15.bbA === 24 && n15.bbB > 20, Q.Q9, `24칸 → ${n15.bbA} · 40칸 → ${n15.bbB}`);
  ok(n15.bbC >= 1 && n15.bbC < 70 && n15.bbD >= 1 && n15.bbD < 100, Q.Q10, `70칸 → ${n15.bbC} · 100칸 → ${n15.bbD}`);
  const nextOf = (MM) => (MM && MM.first > MM.now ? MM.first - MM.now : NaN);   // 계량기 `first` — 다음 칸이 풀리는 때(서버 시계)
  const nextC = nextOf(M15.bbC) / DAY;
  const fullD = 15 * Math.pow(40 / Math.max(1, n15.bbC), 2);
  // Q12 — E(빚이 선 땅): ⓐ 아직 내 땅인 칸 하나를 내놓고 그 자리 다시 선포 ⓑ 풀린(회색) 내 칸 하나를 다시 선포
  //   두 꼴 다 다음 풀림이 "그 넓이 버티는 날 처음부터"로 돌아가면 빨강(1시간 넘게 늦춰지면 빨강)
  const re = async (E, cell, how) => {
    const e0 = nextOf(meterNow(E.meter));
    if (how === 'drop') { send(E, { type: 'unclaim', claimId: cell.id }); await waitFor(() => !E.mine.has(cell.id), 3000); await sleep(300); }
    await give(E, { wood: 10, stone: 10 });
    await warp(E, cell.x + 16, cell.y + 16);
    const r = await claimHere(E);
    E = await relog(E); await freshMeter(E);
    return { E, e0, e1: nextOf(meterNow(E.meter)), said: r.said, took: r.ok, cost: r.cost };
  };
  const h = (x) => (Number.isFinite(x) ? (x / 3600000).toFixed(1) + '시간' : '?');
  const actE = own(P.bbE), freeE = [...P.bbE.mine.values()].filter((c) => c.state === 'free');
  const rA = actE.length ? await re(P.bbE, actE[actE.length - 1], 'drop') : null; if (rA) P.bbE = rA.E;
  const rB = freeE.length ? await re(P.bbE, freeE[0], 'free') : null; if (rB) P.bbE = rB.E;
  const fair = (r) => !r || !r.took || (Number.isFinite(r.e0) && Number.isFinite(r.e1) && r.e1 <= r.e0 + 3600000);
  ok(!!rA && rA.took && fair(rA) && fair(rB), Q.Q12,
    `ⓐ 내놓고 다시: ${rA ? `${h(rA.e0)} → ${h(rA.e1)}(${rA.took ? '섰다' : '거절'})` : '칸 없음'} · ⓑ 풀린 칸 다시: ${rB ? `${h(rB.e0)} → ${h(rB.e1)}(${rB.took ? '섰다' : '거절 "' + rB.said.slice(0, 40) + '"'})` : '풀린 칸 없음'}`);
  // Q14 — 일 두 꼴
  const work = async (p, gapMs, ms) => {
    //   재료는 손이 받은 만들기 표(welcome.recipes — 화면의 만들기 칸과 같은 것)에서 읽는다
    const R = p.W.recipes, rc = Array.isArray(R) ? R.find((x) => x && (x.id === 'crude_axe' || x.key === 'crude_axe')) : R && R.crude_axe;
    const need = (rc && (rc.inputs || rc.cost || rc.ingredients || rc.req)) || {};
    const items = {}; for (const [kk, v] of Object.entries(need)) items[kk] = (Number(v) || 1) * 200;
    await give(p, Object.keys(items).length ? items : { pebble: 400, twig: 200, fiber: 400 });
    const c0 = own(p)[0]; await warp(p, c0.x + 16, c0.y + 16);
    const t0 = Date.now(); let k2 = 0;
    while (Date.now() - t0 < ms) { send(p, { type: 'craft', recipe: 'crude_axe' }); k2++; await sleep(gapMs); }
    return k2;
  };
  const F0 = meterNow(P.bbF.meter), G0 = meterNow(P.bbG.meter);
  const [kF, kG] = await Promise.all([work(P.bbF, 3000, 45000), work(P.bbG, 300, 45000)]);
  await sleep(1500);
  P.bbF = await relog(P.bbF); P.bbG = await relog(P.bbG); await freshMeter(P.bbF); await freshMeter(P.bbG);
  const F1 = meterNow(P.bbF.meter), G1 = meterNow(P.bbG.meter);
  const dF = F1 && F0 ? F1.m - F0.m + F0.rDay * (F1.now - F0.now) / DAY : NaN, dG = G1 && G0 ? G1.m - G0.m + G0.rDay * (G1.now - G0.now) / DAY : NaN;
  ROW.Q14 = ok(dF > 20 && dG > 20 && Math.abs(dG - dF) <= 0.2 * dF, Q.Q14, `3초마다 ${kF}번 → +${Number.isFinite(dF) ? dF.toFixed(0) : '?'}점 · 0.3초마다 ${kG}번 → +${Number.isFinite(dG) ? dG.toFixed(0) : '?'}점`);
  // 켜진 채 +30일(★[T1403] 존을 안 내리고 사유지 시계만 — 처음에서 30일)
  if (!(await pushDeeds(30))) { ok(false, '켬 판 켜진 채 +30일 시계 밀기'); return; }
  for (const u of ['bbA', 'bbC', 'bbD']) { P[u] = await relog(P[u]); await freshMeter(P[u]); }
  const n30 = { A: n('bbA'), C: n('bbC'), D: n('bbD') };
  ok(Number.isFinite(nextC) && nextC < fullD * 0.5 && n30.C < n15.bbC && n30.C >= 1, Q.Q11,
    `켜진 채 +15일 70칸 땅(${n15.bbC}칸) 다음 풀림 ${Number.isFinite(nextC) ? (nextC * 24).toFixed(1) : '?'}시간(그 넓이 버티는 날 ${fullD.toFixed(1)}일) · 켜진 채 +30일 ${n30.C}칸`);
  ok(n30.A >= n30.D && n30.A >= 1, Q.Q13, `켜진 채 +30일 — 처음 24칸 사람 ${n30.A}칸 · 처음 100칸 사람 ${n30.D}칸`);
  for (const u of Object.keys(P)) { try { P[u].ws.close(); } catch (e) {} }
  await down();
}
async function runOff() {
  console.log(`\n② 미끼 — 끔 판(존 env ${KNOB}=0 · 바뀐 칸 하나) · 켬에서만 뜻이 있는 질문 Q4 · Q5 · Q6 · Q7 · Q8 · Q14 가 빨강이어야 한다`);
  if (!(await up('off', 0))) { ok(false, '끔 판 존 기동'); return; }
  const P0 = await connect('obD'); const home = { x: P0.W.self.homeX, y: P0.W.self.homeY };
  await give(P0, { wood: 400, stone: 300 });
  const g = await claimN(P0, Math.floor(home.x / 32) * 32 - 160, Math.floor(home.y / 32) * 32 + 192, 100, 10, 12);
  const PB = await connect('obB'); await give(PB, { wood: 200, stone: 200 });
  await claimN(PB, Math.floor(home.x / 32) * 32 + 352, Math.floor(home.y / 32) * 32 + 192, 40, 8, 12);
  const MB = meterNow(PB.meter), MD = meterNow(P0.meter);
  const red = {
    Q4: !(own(P0).length === 100),
    Q5: !(MB && MD && Number.isFinite(MB.days) && MB.days > MD.days),
    Q6: !(MB && MB.N === 40 && MB.days >= 15),
    Q7: !(MB && MD && MB.days / MD.days >= 5.6),
    Q8: !(MB && MB.rDay > 0 && MB.rDay <= 600),
    Q14: !(MB && MB.cap > 0),   // 끔 판엔 관리도가 없다 — 일한 시간을 셀 칸이 없다
  };
  const why = (q) => (red[q] ? '빨강' : `초록(손잡이를 안 잰다 — 땅 ${own(P0).length}칸 · 계량기 ${MB ? 'O' : '없음'})`);
  ok(red.Q4, `★미끼 Q4 — 바꾼 자리 하나(존 env ${KNOB}=0)에서 100칸째가 안 선다(빨강)`, why('Q4'));
  ok(red.Q5, `★미끼 Q5 — 바꾼 자리 하나(존 env ${KNOB}=0)에서 버티는 날 비교가 안 선다(빨강)`, why('Q5'));
  ok(red.Q6, `★미끼 Q6 — 바꾼 자리 하나(존 env ${KNOB}=0)에서 40칸 보름이 안 선다(빨강)`, why('Q6'));
  ok(red.Q7, `★미끼 Q7 — 바꾼 자리 하나(존 env ${KNOB}=0)에서 넓이 제곱 비가 안 선다(빨강)`, why('Q7'));
  ok(red.Q8, `★미끼 Q8 — 바꾼 자리 하나(존 env ${KNOB}=0)에서 하루 잃는 관리도가 안 선다(빨강)`, why('Q8'));
  ok(red.Q14, `★미끼 Q14 — 바꾼 자리 하나(존 env ${KNOB}=0)에서 일한 시간 관리도가 안 선다(빨강)`, why('Q14'));
  console.log(`    [끔 판] D 땅 ${own(P0).length}칸 · 거절 ${g.refused.length}(첫 거절 "${(g.refused[0] || '').slice(0, 50)}") · 계량기 ${MB ? JSON.stringify({ N: MB.N, days: MB.days }) : '없음'}`);
  try { P0.ws.close(); PB.ws.close(); } catch (e) {}
  await down();
}
(async () => {
  console.log('=== T1390 사유지 돌봄 결과 하네스(검사 카드 · 구현 안 봄) ===');
  const t0 = Date.now();
  try {
    if (ARM === 'on' || ARM === 'both') await runOn();
    if (ARM === 'off' || ARM === 'both') await runOff();
  } catch (e) { ok(false, '판 예외: ' + (e && e.stack || e)); await down(); }
  console.log(`  [시간] 판 전체 ${Math.round((Date.now() - t0) / 1000)}초`);
  console.log(`\n=== ${pass + fail}건 중 PASS ${pass} · FAIL ${fail} ===`);
  process.exit(fail ? 1 : 0);
})();
