#!/usr/bin/env node
// @regress
// @bait 3
// === scripts/test-t1493-road-box.js — 길은 보이는 구역만(T1493_ROAD_BOX · 칸 배열 T1448 켬 위에서) · 날 소켓(ws) 하네스 ==================
//
// ★무엇을 재나 — 지시 T1493 할 일 1 · 6(정해진 것 1 · 3 · 코너 케이스):
//   존(hanbando · 마을 · 짐승 · 도적 끔 · `T1448_ROAD_GRID=1`)을 띄우기 전에 존 DB 에 길을 **칸 행**으로 심는다(켬 부팅이 구역 행으로 옮긴다 — 옛 DB 첫 부팅 그대로):
//     ⓐ 고정 무늬 — 시험 자리 둘레 청크(청크 = 32칸 = 1,024 px)마다 칸 90여 개 · 등급 1(v 15) · 등급 2(v 60) — 문턱 8 · 28 에서 멀어
//        시험 동안(발걸음 +1 · 하루 0.995) 등급이 안 바뀐다 ⇒ 빈 틈 · 값 견줌의 **정답 = 심은 표**.
//     ⓑ 문턱 밑 줄 — v 7.95(등급 0 · welcome 에 없다). 몸이 한 칸씩 밟으면 8.95(등급 1)가 되어 그날 끝 `road_cells` 방송에 든다(Ⓓ).
//   소켓: F = 통째 소켓(`t1453full=1` — 종전 welcome · 방송 다) · B = 둘레 소켓(움직이는 몸) · O = 관측 소켓(이웃 존이 보는 꼴 · `viewport_update`).
//   Ⓐ 끔(T1448 켬 · T1493 끔 — 착지 뒤 지금 꼴) — welcome 길 = 심은 표 전부(칸 · 등급 하나도 안 빠짐 · 밖 0) · 청크를 넘어도 청크 몫 0 ·
//      그날 끝 방송 = B · F 같은 글자(제 줄 · 남의 줄 다)
//   Ⓑ 켬 welcome — B 의 길 = 들어간 자리(광장) 둘레 5 × 5 청크의 심은 칸 그대로(밖 0 · 등급 같음) · F 는 존 전체 · 바이트
//   Ⓒ 빈 틈 0 — 틱 쪽지마다: 그 몸(관측 소켓은 보는 자리) 화면 창(±1,540 px — 클라 `TILE_RENDER_RADIUS` 1,500 + 칸 하나)의 심은 칸이 다 들었다(등급까지) ·
//      둘레 5 × 5 청크가 다 왔다(창보다 넓은 설계 약속 — 한 틱 늦은 청크도 잡는다). 걸음: 청크 셋 넘어 걷기(32 px · 틱마다) ·
//      먼 순간 이동 · 청크 넷이 만나는 모서리 · 다시 접속(새 소켓 welcome) · 관측 소켓 걷기(청크 넷 넘기) ·
//      존 넘어옴(그 관측 소켓 승격 — 이웃 존이 넘길 몸을 `/handoff_prepare` 로 알리고 클라가 `promote_to_primary` · 실제 클라가 경계를 넘는 길:
//      승격 welcome 엔 길이 없다 — 클라는 관측 때 받은 길을 쥔다 ⇒ 승격 자리 둘레가 이미 다 있어야 하고, 그 뒤 둘레가 몸 자리를 따라야 한다)
//   Ⓓ 하루 방송 거르기 — B 는 제 둘레의 문턱 밑 줄을, F 는 B 둘레 밖 줄을 밟는다 → 그날 끝 방송: F 는 두 줄 다 · B 는 제가 받은 청크 칸만(밖 0 · 제 줄은 다) ·
//      그 뒤 B 가 F 줄 청크로 가면 그 청크를 그때 값(밟힌 등급 1)으로 통째 받는다
//   Ⓔ 값 같음 — 끝에 B 가 든 청크마다 칸 · 등급 = F(통째 welcome + 방송 다)
//   Ⓕ 미끼 셋(존 아이 프리로드가 컴파일 직전 글자를 바꾼다 — 파일 무변 · 바꾼 자리 1):
//      ① 청크 몫을 한 틱 늦게 보내는 사본(구역 넘을 때 길이 한 틱 빈다) → Ⓒ 빨강 · ② 청크 몫 등급이 통째와 다른 사본(등급 2 를 1 로) → Ⓑ · Ⓔ 빨강 ·
//      ③ 끔 welcome 에서 한 칸이 빠진 사본 → Ⓐ 빨강
// ★자명 통과 금지 — 견준 칸 > 0 · 넘은 청크 > 0 · 방송에 줄 칸이 실제로 들었다 · 미끼마다 빨강.
// 실행: node scripts/test-t1493-road-box.js   (존 기동 다섯 · 약 3분)
'use strict';
if (require.main === module) require('./lib-port').hold(3010, 3020);   // [T1288] 제품 고정 포트(central · hanbando)
const path = require('path');
const fs = require('fs');
const os = require('os');
const { spawn, spawnSync } = require('child_process');
const WebSocket = require('ws');
const FB = require('./fixture-boot');
const LB = require('./lib-bait');
const ROOT = path.join(__dirname, '..');
const { ZONES } = require(path.join(ROOT, 'server', 'zone-config'));
const Z = ZONES.hanbando, ZID = 'hanbando', CPORT = 3010, ZPORT = Z.port;
const ZSRC = fs.readFileSync(path.join(ROOT, 'server', 'zone.js'), 'utf8'), RSRC = fs.readFileSync(path.join(ROOT, 'server', 'roads.js'), 'utf8');
const CS = +((fs.readFileSync(path.join(ROOT, 'server', 'chunk.js'), 'utf8').match(/const CHUNK_SIZE = (\d+);/) || [])[1] || 0);   // 청크 px(정본 글자)
const CAR = +((ZSRC.match(/const CHUNK_ACTIVE_RADIUS = (\d+);/) || [])[1] || 0);   // 청크 구독 반지름 px(정본 글자)
const VR = +((fs.readFileSync(path.join(ROOT, 'public', 'client', '34-m-renderloop.js'), 'utf8').match(/const TILE_RENDER_RADIUS = (\d+);/) || [])[1] || 0) + 40;   // 화면 길 창(클라 정본 + 칸 하나 남짓)
const NC = CS / 32, RR = Math.ceil(CAR / CS);   // 청크 한 변 칸 수(32) · 둘레 청크 반지름(2)
const W = Math.ceil(Z.zoneWidth / 32), H = Math.ceil(Z.zoneHeight / 32);
const DAY_MS = 15000;   // 길의 하루(시험) — 문턱 밑 줄을 밟은 날 끝 방송을 15초 안에 본다
const TAG = `${process.pid}`;
const WD = fs.mkdtempSync(path.join(os.tmpdir(), 't1493-'));

let pass = 0, fail = 0;
const say = (s) => console.log(s);
const ok = (c, m, d) => { if (c) pass++; else fail++; say(`  ${c ? '✓' : '✗'} ${m}${d !== undefined && d !== '' ? '  ' + d : ''}`); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const J = JSON.stringify;

// ── 심을 길 ─────────────────────────────────────────────────────────────────────────────────────
const SQ = Z.mainSquare;   // 손님 몸이 서는 자리(광장) — welcome 자리
const ckOf = (px, py) => [Math.floor(px / CS), Math.floor(py / CS)];
const [C0x, C0y] = ckOf(SQ.x, SQ.y);
//   설 수 있는 자리 = 서버 `teleport_debug` 가 받는 자리(물 · 바위 · 존 밖 아님) — T1446 합성 자의 정본 술어(`t1446-synth` · 존 지형 그대로)
const VB = (() => { const l = console.log; console.log = () => {}; try { return require('./t1446-synth').villageCenters(); } finally { console.log = l; } })();
const free = (x, y) => !VB.blocked(x, y);
const lineFree = (x0, y0, x1, y1) => { const n = Math.ceil(Math.hypot(x1 - x0, y1 - y0) / 8); for (let i = 0; i <= n; i++) if (!free(x0 + (x1 - x0) * i / n, y0 + (y1 - y0) * i / n)) return false; return true; };
function nearFree(gx, gy, pred) {   // 그 청크에서 가장 가까운(사각 고리) 조건 맞는 청크
  for (let r = 0; r < 16; r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) { if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue; if (pred(gx + dx, gy + dy)) return [gx + dx, gy + dy]; }
  return null;
}
const cfree = (gx, gy) => free(gx * CS + CS / 2, gy * CS + CS / 2);
//   걷기 — 광장에서 청크 셋 넘는 곧은 길(동 · 서 · 남 · 북 중 다 설 수 있는 첫 줄)
const WALK = (() => { for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) for (let o = 0; o <= 8 * 32; o += 32) for (const sg of [1, -1]) {
  const x0 = SQ.x + (dy ? sg * o : 0), y0 = SQ.y + (dx ? sg * o : 0), x1 = x0 + dx * 3.5 * CS, y1 = y0 + dy * 3.5 * CS;
  if (lineFree(x0, y0, x1, y1)) return { x0, y0, x1, y1 }; } return null; })();
//   시험 자리(청크) — 먼 순간 이동 둘 · 청크 넷 모서리(모서리 점 · 대각 ±40 px 설 수 있음) · F 줄(광장 둘레 밖) · 관측 걷기(청크 넷 동쪽)
const SPOT = {
  far1: nearFree(C0x + 12, C0y + 6, cfree), far2: nearFree(C0x - 9, C0y + 14, cfree),
  corner: nearFree(C0x + 12, C0y - 8, (gx, gy) => lineFree(gx * CS - 48, gy * CS - 48, gx * CS + 48, gy * CS + 48)),
  fline: nearFree(C0x - 7, C0y - 5, cfree),
  obs: nearFree(C0x + 4, C0y + 22, (gx, gy) => lineFree(gx * CS + CS / 2, gy * CS + CS / 2, gx * CS + CS / 2 + 4 * CS, gy * CS + CS / 2)),
};
function stripNear(gx, gy, avoid) {   // 문턱 밑 줄 — 그 청크 둘레에서 칸 41개가 다 설 수 있는 가로 줄
  for (let r = 0; r <= 3; r++) for (let ly = 0; ly < NC; ly++) for (const sx of [0, -1, 1, -2, 2]) {
    const cy = (gy + (r % 2 ? -1 : 1) * Math.ceil(r / 2)) * NC + ly, cx0 = (gx + sx) * NC - 4, cx1 = cx0 + 20;
    if (avoid && Math.abs(cy - avoid.cy) < 3) continue;
    let okR = true; for (let cx = cx0; cx <= cx1 && okR; cx++) okR = free(cx * 32 + 16, cy * 32 + 16);
    if (okR) return { cy, cx0, cx1 };
  }
  return null;
}
const STRIP_B = stripNear(C0x, C0y, null);                                   // B 줄 — 광장 둘레 안
const STRIP_F = SPOT.fline ? stripNear(SPOT.fline[0], SPOT.fline[1], null) : null;   // F 줄 — 광장 둘레 밖
const onStrip = (cx, cy) => [STRIP_B, STRIP_F].some((S) => S && cy === S.cy && cx >= S.cx0 && cx <= S.cx1);
const SPOTS_OK = !!(WALK && STRIP_B && STRIP_F && Object.values(SPOT).every(Boolean));
function seedChunks() {   // 심을 청크 모음(키 'cx_cy') — 자리마다 둘레
  const S = new Set(), add = (cx, cy, r) => { for (let dx = -r; dx <= r; dx++) for (let dy = -r; dy <= r; dy++) S.add(`${cx + dx}_${cy + dy}`); };
  if (!SPOTS_OK) return S;
  add(C0x, C0y, 6); for (const [x, y] of [[WALK.x1, WALK.y1]]) add(...ckOf(x, y), RR + 1);
  for (const k of ['far1', 'far2', 'corner', 'fline']) add(SPOT[k][0], SPOT[k][1], RR + 1);
  for (let i = 0; i <= 4; i++) add(SPOT.obs[0] + i, SPOT.obs[1], RR + 1);
  for (const st of [STRIP_B, STRIP_F]) for (let cx = st.cx0; cx <= st.cx1; cx += NC) add(...ckOf(cx * 32, st.cy * 32), 0);
  return S;
}
const TRUTH = new Map();   // 칸 키 'cx,cy' → 등급(고정 무늬만 — 줄은 따로)
const SEEDROWS = [];        // [k, v, d]
{
  for (const key of seedChunks()) {
    const [gx, gy] = key.split('_').map(Number);
    for (let ly = 0; ly < NC; ly++) for (let lx = 0; lx < NC; lx++) {
      const cx = gx * NC + lx, cy = gy * NC + ly;
      if (cx < 0 || cy < 0 || cx >= W || cy >= H || onStrip(cx, cy)) continue;
      if ((cx * 7 + cy * 13) % 11 !== 0) continue;
      const lv = (cx + cy) % 3 === 0 ? 2 : 1;
      TRUTH.set(cx + ',' + cy, lv); SEEDROWS.push([cy * W + cx, lv === 2 ? 60 : 15, 2147483647]);   // 날 = 부팅이 오늘로 죈다(t1453-seed 와 같은 꼴)
    }
  }
  for (const S of [STRIP_B, STRIP_F]) if (S) for (let cx = S.cx0; cx <= S.cx1; cx++) SEEDROWS.push([S.cy * W + cx, 7.95, 2147483647]);
}
function seedDb(db) {   // 제품 모듈(`zone-local-db` · 아이 프로세스 · DB_PATH · ZONE_ID)이 칸 행을 쓴다(표 글자 사본 0)
  const tmp = path.join(WD, 'seed.json'); fs.writeFileSync(tmp, J(SEEDROWS));
  const code = `const D = require(${J(path.join(ROOT, 'server', 'zone-local-db.js'))}); const R = JSON.parse(require('fs').readFileSync(${J(tmp)}, 'utf8'));
    D.db.exec('BEGIN'); for (const [k, v, d] of R) D.upsertRoadCell(${J(ZID)}, k, v, d); D.db.exec('COMMIT'); console.log(R.length);`;
  const r = spawnSync(process.execPath, ['-e', code], { env: { ...process.env, DB_PATH: db, ZONE_ID: ZID }, encoding: 'utf8' });
  return +String(r.stdout || '').trim().split('\n').pop() || 0;
}

// ── 띄우기 ──────────────────────────────────────────────────────────────────────────────────────
const procs = [];
function sp(file, env) { const p = spawn(process.execPath, (env._pre ? ['-r', env._pre] : []).concat([path.join(ROOT, 'server', file)]), { cwd: ROOT, env: Object.assign({}, process.env, env), stdio: ['ignore', 'pipe', 'pipe'] });
  p._o = ''; p.stdout.on('data', (b) => { if (p._o.length < 4e6) p._o += b; }); p.stderr.on('data', (b) => { if (p._o.length < 4e6) p._o += b; }); procs.push(p); return p; }
async function stopAll() { for (const p of procs) { try { p.kill('SIGKILL'); } catch (e) {} } procs.length = 0; await sleep(800); }
function baitPre(b) {   // b = { from, to } — server/zone.js · server/roads.js 글자를 컴파일 직전에 바꾼다(파일 무변)
  const f = path.join(WD, `bait-${Math.random().toString(36).slice(2, 7)}.cjs`);
  fs.writeFileSync(f, `'use strict';const M=require('module'),_c=M.prototype._compile,F=${J(b.from)},T=${J(b.to)},S=${J(path.join(ROOT, 'server', b.file))};
M.prototype._compile=function(c,fn){if(fn===S)c=c.replace(F,T);return _c.call(this,c,fn);};`);
  return f;
}
let SEEDED = 0;
async function boot(env, bait) {
  await stopAll();
  const D = path.join(WD, 'run-' + Math.random().toString(36).slice(2, 7)); fs.mkdirSync(D);
  SEEDED = seedDb(path.join(D, 'w.db'));
  const c = sp('central.js', { PORT: String(CPORT), DB_PATH: path.join(D, 'central.db'), PUBLIC_HOST: 'localhost', ENABLED_ZONES: ZID });
  const cu = await FB.waitUp(c, /central server up on/, { name: 'central' }); if (!cu.ok) return { ok: false, why: 'central ' + cu.why };
  const z = sp('zone.js', Object.assign({ PORT: String(ZPORT), ZONE_ID: ZID, DB_PATH: path.join(D, 'w.db'), CENTRAL_URL: `http://localhost:${CPORT}`, PUBLIC_HOST: 'localhost',
    ENABLE_VILLAGES: '0', ENABLE_WILDLIFE: '0', ENABLE_BANDITS: '0', VILLAGE_DAY_MS: String(DAY_MS), T1448_ROAD_GRID: '1',
    T990_ECON_DAY: '0',   // 마을 끈 존은 econ 날이 안 간다 — 길의 날을 벽시계(15초)로(T1001 되돌림 꼴 · 하루 방송을 시험 안에 본다)
    _pre: bait ? baitPre(bait) : '' }, env));
  const zu = await FB.waitUp(z, /zone server up on/, { name: ZID, capMs: 300000 });
  return { ok: zu.ok, why: zu.why, z };
}

// ── 날 소켓 ─────────────────────────────────────────────────────────────────────────────────────
//   받은 길 = 클라 `road_cells` 입구와 같은 뜻(등급 0 = 지움) · 틱마다 점검 함수(chk)를 부른다(받은 차례 그대로 — 쪽지 사이 틈을 본다)
function sock(q, opts) {
  const ws = new WebSocket(`ws://127.0.0.1:${ZPORT}/?${q}`, { perMessageDeflate: false });
  const S = { ws, roads: new Map(), pid: null, pos: null, wel: null, welBytes: 0, welRoadBytes: 0, rc: [], rcBytes: 0, ticks: 0, chk: null, notices: [], obs: !!(opts && opts.obs) };
  ws.on('message', (d) => {
    const str = String(d); let m; try { m = JSON.parse(str); } catch (e) { return; }
    if (m.type === 'welcome' && !S.wel) {
      S.wel = m; S.pid = m.pid || null; S.welBytes = Buffer.byteLength(str); S.welRoadBytes = m.roads ? Buffer.byteLength(J(m.roads)) : 2;
      if (Array.isArray(m.roads)) for (let i = 0; i < m.roads.length; i += 3) S.roads.set(m.roads[i] + ',' + m.roads[i + 1], m.roads[i + 2]);
      S.welRoads = new Map(S.roads);
    } else if (m.type === 'welcome' && m.promoted) {   // 관측 소켓 승격(존 넘어옴) — 같은 소켓 · 승격 welcome 엔 길이 없다(클라는 관측 때 받은 길을 그대로 쥔다 · `30-n-net` promoted 갈래)
      S.pid = m.pid || S.pid; S.obs = false; S.promoted = true; S.proRoads = 'roads' in m;
    } else if (m.type === 'road_cells') {
      S.rc.push(m.cells || []); S.rcBytes += Buffer.byteLength(str);
      const c = m.cells || []; for (let i = 0; i < c.length; i += 3) { const k = c[i] + ',' + c[i + 1]; if (c[i + 2]) S.roads.set(k, c[i + 2]); else S.roads.delete(k); }
    } else if (m.type === 'tick') {
      S.ticks++;
      if (!S.obs && S.pid != null && Array.isArray(m.players)) { const me = m.players.find((p) => p.pid === S.pid); if (me) S.pos = [me.x, me.y]; }
      if (S.chk) S.chk(S);
    } else if (m.type === 'notice') S.notices.push(String(m.text || ''));
  });
  ws.on('error', () => {});
  S.ready = (async () => { for (let k = 0; k < 400 && !(S.wel && (S.obs || S.pos)); k++) await sleep(50); return !!S.wel; })();
  S.send = (o) => { try { ws.send(J(o)); } catch (e) {} };
  S.close = () => { try { ws.close(); } catch (e) {} };
  return S;
}
const ringOf = (px, py) => { const [cx, cy] = ckOf(px, py), out = []; for (let dx = -RR; dx <= RR; dx++) for (let dy = -RR; dy <= RR; dy++) out.push([cx + dx, cy + dy]); return out; };
const truthIn = (gx, gy) => { const out = []; for (let ly = 0; ly < NC; ly++) for (let lx = 0; lx < NC; lx++) { const k = (gx * NC + lx) + ',' + (gy * NC + ly), lv = TRUTH.get(k); if (lv) out.push([k, lv]); } return out; };
// 빈 틈 자 — 그 자리 화면 창(±VR px) 심은 칸 · 둘레 5 × 5 청크 심은 칸이 다 들었나(등급까지)
function gapAt(S, px, py) {
  let win = 0, winMiss = 0, ring = 0, ringMiss = 0;
  for (const [gx, gy] of ringOf(px, py)) for (const [k, lv] of truthIn(gx, gy)) {
    const [cx, cy] = k.split(',').map(Number), inWin = Math.abs(cx * 32 + 16 - px) <= VR && Math.abs(cy * 32 + 16 - py) <= VR, got = S.roads.get(k) === lv;
    ring++; if (!got) ringMiss++;
    if (inWin) { win++; if (!got) winMiss++; }
  }
  return { win, winMiss, ring, ringMiss };
}
function watchGaps(S, posOf) {   // 틱마다 점검 — 빈 틈 난 틱 수 · 둘레 늦은 틱 수 · 견준 칸 · 넘은 청크
  const G = { ticks: 0, gapTicks: 0, ringLateTicks: 0, cells: 0, chunks: new Set(), first: null };
  S.chk = () => { const p = posOf(S); if (!p) return; const r = gapAt(S, p[0], p[1]); G.ticks++; G.cells += r.win; G.chunks.add(ckOf(p[0], p[1]).join('_'));
    if (r.winMiss) { G.gapTicks++; if (!G.first) G.first = `창 빈 칸 ${r.winMiss}/${r.win} @(${p[0] | 0},${p[1] | 0})`; }
    if (r.ringMiss) { G.ringLateTicks++; if (!G.first) G.first = `둘레 빈 칸 ${r.ringMiss}/${r.ring} @(${p[0] | 0},${p[1] | 0})`; } };
  return G;
}
function postJSON(p, body) {   // 존 HTTP 문(사설 주소 — 비밀 없는 시험 존은 루프백을 받는다 · `internal-door`)
  return new Promise((res) => { const d = J(body); const r = require('http').request({ host: '127.0.0.1', port: ZPORT, path: p, method: 'POST', headers: { 'content-type': 'application/json', 'content-length': Buffer.byteLength(d) } },
    (s) => { let b = ''; s.on('data', (c) => { b += c; }); s.on('end', () => res({ st: s.statusCode, b: b.slice(0, 200) })); }); r.on('error', (e) => res({ st: 0, b: String(e.message) })); r.end(d); });
}
async function tp(S, x, y) { S.send({ type: 'teleport_debug', x, y }); for (let k = 0; k < 60; k++) { await sleep(25); if (S.pos && Math.abs(S.pos[0] - x) < 1 && Math.abs(S.pos[1] - y) < 1) return true; } return false; }
async function walkTo(S, x1, y1, step) {   // 순간 이동 걸음(32 px · 틱 하나씩 — 서버가 매 틱 청크를 본다 · 밟기도 그 칸에)
  const [x0, y0] = S.pos || [x1, y1], n = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0) / (step || 32)));
  let okN = 0; for (let i = 1; i <= n; i++) { if (await tp(S, x0 + (x1 - x0) * i / n, y0 + (y1 - y0) * i / n)) okN++; await sleep(40); }
  return okN === n;
}
const cpx = (g) => g * CS + CS / 2;   // 청크 가운데 px
const chunkKeysHeld = (S) => { const s = new Set(); for (const k of S.roads.keys()) { const [cx, cy] = k.split(',').map(Number); s.add(`${(cx / NC) | 0}_${(cy / NC) | 0}`); } return s; };
const stripGot = (S, st) => { let n = 0; for (let cx = st.cx0; cx <= st.cx1; cx++) if (S.roads.get(cx + ',' + st.cy) === 1) n++; return n; };
async function waitDayCast(S, st, ms) { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (stripGot(S, st) > 0) return true; await sleep(200); } return false; }
//   밟기는 걸어야 선다(사람 몸의 길 도장은 이동 문 안 — 순간 이동은 안 밟는다) — 입력(`input` · 틱마다 한 걸음)으로 줄을 따라 걷는다 · 막히면(1.2초 제자리) 3칸 건너뛴다
async function walkInput(S, x1, y1, maxMs) {
  let seq = S.seq || 0, last = S.pos ? S.pos.slice() : [0, 0], moved = Date.now(); const t0 = Date.now();
  while (Date.now() - t0 < maxMs && S.pos) {
    const dx = x1 - S.pos[0], dy = y1 - S.pos[1], d = Math.hypot(dx, dy); if (d < 10) break;
    S.send({ type: 'input', seq: ++seq, vx: dx / d, vy: dy / d }); await sleep(33);
    if (Math.hypot(S.pos[0] - last[0], S.pos[1] - last[1]) > 2) { last = S.pos.slice(); moved = Date.now(); }
    else if (Date.now() - moved > 1200) { await tp(S, S.pos[0] + Math.sign(dx) * 96, y1); last = S.pos.slice(); moved = Date.now(); S.hops = (S.hops || 0) + 1; }
  }
  for (let i = 0; i < 6; i++) { S.send({ type: 'input', seq: ++seq, vx: 0, vy: 0 }); await sleep(33); }
  S.seq = seq; return !!S.pos && Math.hypot(x1 - S.pos[0], y1 - S.pos[1]) < 40;
}
async function stampStrip(S, st) { await tp(S, st.cx0 * 32 + 16, st.cy * 32 + 16); await sleep(150); return walkInput(S, st.cx1 * 32 + 16, st.cy * 32 + 16, 30000); }

// ── 판 ─────────────────────────────────────────────────────────────────────────────────────────
async function runOff(bait, opt) {   // Ⓐ 끔(T1448 켬 · T1493 끔) · opt.noCast = 하루 방송 갈래 건너뜀(미끼 ③)
  const R = { why: null };
  const bt = await boot({}, bait); if (!bt.ok) { R.why = bt.why; return R; }
  const B = sock('name=t1493b&color=%23aa5533'), F = sock('name=t1493f&color=%23aa5533&t1453full=1');
  await B.ready; await F.ready; await sleep(300);
  R.welN = B.wel && B.wel.roads ? B.wel.roads.length / 3 : 0; R.welBytes = B.welBytes; R.welRoadBytes = B.welRoadBytes;
  let miss = 0, wrong = 0, extra = 0; for (const [k, lv] of TRUTH) { const g = B.roads.get(k); if (g === undefined) miss++; else if (g !== lv) wrong++; }
  for (const k of B.roads.keys()) if (!TRUTH.has(k)) extra++;
  R.miss = miss; R.wrong = wrong; R.extra = extra; R.truth = TRUTH.size; R.seeded = SEEDED;
  const rc0 = B.rc.length; await tp(B, WALK.x0, WALK.y0); await walkTo(B, WALK.x1, WALK.y1, 64); R.walkCells = B.rc.slice(rc0).reduce((a, c) => a + c.length / 3, 0);
  if (opt && opt.noCast) { B.close(); F.close(); return R; }
  await stampStrip(B, STRIP_B); await stampStrip(F, STRIP_F);
  await sleep(DAY_MS + 4000);   // 밟기가 끝난 뒤 날 경계를 하나 넘긴다 — 밟은 칸이 다 그날 끝 방송에 든다
  R.castB = await waitDayCast(B, STRIP_F, DAY_MS + 5000); await sleep(500);
  R.bStripB = stripGot(B, STRIP_B); R.bStripF = stripGot(B, STRIP_F); R.fStripB = stripGot(F, STRIP_B); R.fStripF = stripGot(F, STRIP_F);
  R.castSame = J(B.rc.map((c) => c.length)) === J(F.rc.map((c) => c.length)) && B.rc.length > 0;
  B.close(); F.close(); return R;
}
async function runOn(bait, opt) {   // Ⓑ ~ Ⓔ 켬(T1448 · T1493) · opt.noCast = Ⓓ 건너뜀(미끼 ① ②)
  const R = { why: null };
  const bt = await boot({ T1493_ROAD_BOX: '1' }, bait); if (!bt.ok) { R.why = bt.why; return R; }
  R.log = (bt.z._o.match(/\[T1493\][^\n]*/g) || []).slice(0, 3);
  const F = sock('name=t1493f&color=%23aa5533&t1453full=1'); await F.ready;
  const B = sock('name=t1493b&color=%23aa5533'); await B.ready; await sleep(300);
  // Ⓑ welcome
  const ring0 = new Set(ringOf(SQ.x, SQ.y).map((g) => g.join('_')));
  let inN = 0, inMiss = 0, wrong = 0, out = 0;
  const welMap = new Map(); if (Array.isArray(B.wel.roads)) for (let i = 0; i < B.wel.roads.length; i += 3) welMap.set(B.wel.roads[i] + ',' + B.wel.roads[i + 1], B.wel.roads[i + 2]);
  inN = 0; for (const g of ring0) { const [gx, gy] = g.split('_').map(Number); for (const [k, lv] of truthIn(gx, gy)) { inN++; const x = welMap.get(k); if (x === undefined) inMiss++; else if (x !== lv) wrong++; } }
  for (const k of welMap.keys()) { const [cx, cy] = k.split(',').map(Number); if (!ring0.has(`${(cx / NC) | 0}_${(cy / NC) | 0}`)) out++; }
  R.wel = { inN, inMiss, wrong, out, n: welMap.size, bytes: B.welBytes, roadBytes: B.welRoadBytes, fBytes: F.welBytes, fRoadBytes: F.welRoadBytes, fN: F.wel.roads ? F.wel.roads.length / 3 : 0 };
  // Ⓒ 빈 틈 — 걷기(청크 셋 동쪽) · 먼 순간 이동 둘 · 모서리 · 다시 접속 · 관측 걷기
  const GB = watchGaps(B, (S) => S.pos);
  const walkOk = (await tp(B, WALK.x0, WALK.y0)) && (await walkTo(B, WALK.x1, WALK.y1, 32));
  const tpOk = [await tp(B, cpx(SPOT.far1[0]), cpx(SPOT.far1[1]))]; await sleep(400);
  tpOk.push(await tp(B, SPOT.corner[0] * CS, SPOT.corner[1] * CS)); await sleep(400);   // 청크 넷이 만나는 모서리(정확히 경계)
  await walkTo(B, SPOT.corner[0] * CS + 40, SPOT.corner[1] * CS + 40, 16); await walkTo(B, SPOT.corner[0] * CS - 40, SPOT.corner[1] * CS - 40, 16); await sleep(300);   // 모서리를 넘나든다
  tpOk.push(await tp(B, cpx(SPOT.far2[0]), cpx(SPOT.far2[1]))); await sleep(400);
  R.gapB = { ...GB, chunks: GB.chunks.size, walkOk, tpOk };
  // Ⓓ 하루 방송 거르기 — B 줄(광장 둘레) · F 줄(광장 둘레 밖 · B 가 아직 안 받은 청크)
  B.chk = null; await tp(B, SQ.x, SQ.y); await sleep(500);
  if (!(opt && opt.noCast)) {
  const heldBefore = chunkKeysHeld(B), fLineCk = `${(STRIP_F.cx0 / NC) | 0}_${(STRIP_F.cy / NC) | 0}`;
  R.fLineHeldBefore = heldBefore.has(fLineCk) || [...Array(STRIP_F.cx1 - STRIP_F.cx0 + 1).keys()].some((i) => heldBefore.has(`${((STRIP_F.cx0 + i) / NC) | 0}_${(STRIP_F.cy / NC) | 0}`));
  const rcB0 = B.rc.length;
  const stB = await stampStrip(B, STRIP_B), stF = await stampStrip(F, STRIP_F);
  await sleep(DAY_MS + 4000);   // 밟기가 끝난 뒤 날 경계를 하나 넘긴다 — 밟은 칸이 다 그날 끝 방송에 든다(F 가 낡지 않게)
  R.castF = await waitDayCast(F, STRIP_F, DAY_MS + 5000); await sleep(500);
  const heldNow = chunkKeysHeld(B); let outCells = 0, castCells = 0;
  for (const c of B.rc.slice(rcB0)) for (let i = 0; i < c.length; i += 3) { castCells++; if (!heldNow.has(`${(c[i] / NC) | 0}_${(c[i + 1] / NC) | 0}`)) outCells++; }
  R.cast = { stB, stF, bStripB: stripGot(B, STRIP_B), bStripF: stripGot(B, STRIP_F), fStripB: stripGot(F, STRIP_B), fStripF: stripGot(F, STRIP_F), castCells, outCells, n: STRIP_B.cx1 - STRIP_B.cx0 + 1 };
  //   F 줄 가운데로(둘레 5 × 5 가 줄을 다 덮는다) — 상자가 무거우면 순간 이동 쪽지가 늦게 선다: 몸이 그 자리에 서고 줄 청크 몫이 들 때까지(10초 안) 본 뒤 값을 견준다
  //   (값 견줌만 — 늦게 든 틈은 Ⓒ 가 틱마다 잰다 · 다 안 들면 그대로 빨강)
  const fx = (STRIP_F.cx0 + 10) * 32 + 16, fy = STRIP_F.cy * 32 + 16, fCk = new Set();
  for (let cx = STRIP_F.cx0; cx <= STRIP_F.cx1; cx++) fCk.add(`${(cx / NC) | 0}_${(STRIP_F.cy / NC) | 0}`);
  let tpF = await tp(B, fx, fy);
  for (let k = 0; k < 200; k++) {
    if (!tpF) tpF = !!B.pos && Math.abs(B.pos[0] - fx) < 1 && Math.abs(B.pos[1] - fy) < 1;
    const held = chunkKeysHeld(B); if (tpF && [...fCk].every((g) => held.has(g))) break;
    await sleep(50);
  }
  await sleep(200);
  R.cast.bStripFAfter = stripGot(B, STRIP_F); R.cast.tpF = tpF;
  }
  // 다시 접속 — 새 소켓(같은 이름 · 새 welcome)이 F 줄 자리에서 · 그 창 빈 틈
  await tp(B, cpx(SPOT.far1[0]), cpx(SPOT.far1[1])); await sleep(300);
  // Ⓔ 값 같음 — B 가 든 청크마다 칸 · 등급 = F
  { const held = chunkKeysHeld(B); let n = 0, diff = 0, first = null;
    const fBy = new Map(); for (const [k, lv] of F.roads) { const [cx, cy] = k.split(',').map(Number), g = `${(cx / NC) | 0}_${(cy / NC) | 0}`; if (held.has(g)) fBy.set(k, lv); }
    for (const [k, lv] of fBy) { n++; if (B.roads.get(k) !== lv) { diff++; if (!first) first = `${k} F ${lv} · B ${B.roads.get(k)}`; } }
    for (const [k, lv] of B.roads) if (!fBy.has(k)) { diff++; if (!first) first = `${k} B ${lv} · F 없음`; }
    R.same = { chunks: held.size, n, diff, first, bBytes: B.rcBytes + B.welRoadBytes, fBytes: F.rcBytes + F.welRoadBytes, bCells: B.roads.size, fCells: F.roads.size }; }
  B.close(); await sleep(400);
  const B2 = sock('name=t1493b&color=%23aa5533'); await B2.ready; await sleep(200);
  const G2 = watchGaps(B2, (S) => S.pos); await tp(B2, cpx(SPOT.far2[0]) + 300, cpx(SPOT.far2[1]) - 200); await sleep(400);
  R.gapRe = { ...G2, chunks: G2.chunks.size, welGap: B2.wel ? gapAt({ roads: B2.welRoads }, SQ.x, SQ.y) : null };
  // 관측 소켓 — 보는 자리 걷기(이웃 존이 내 존을 보는 꼴 · 청크 넷 넘기)
  const ox = cpx(SPOT.obs[0]), oy = cpx(SPOT.obs[1]);
  const O = sock(`observer=1&vx=${ox}&vy=${oy}`, { obs: true }); await O.ready; await sleep(300);
  const owel = O.wel ? gapAt({ roads: O.welRoads }, ox, oy) : null;
  //   보는 자리 = 서버가 받은 자리 — 보낸 뒤 틱 하나(60 ms) 지나서야 견준다(쪽지가 서버 손에 닿기 전 틱은 옛 자리 몫이다 — 몸 소켓은 틱 쪽지의 제 자리를 쓴다)
  let view = [ox, oy]; const GO = watchGaps(O, () => view);
  for (let i = 1; i <= 4 * NC; i++) { const v = [ox + i * 32, oy]; O.send({ type: 'viewport_update', x: v[0], y: v[1] }); setTimeout(() => { view = v; }, 60); await sleep(45); }
  await sleep(300);
  R.gapObs = { ...GO, chunks: GO.chunks.size, welGap: owel };
  // 존 넘어옴 — 관측 소켓 승격(실제 클라가 경계를 넘는 길: 이웃 존이 넘길 몸을 알리고(`/handoff_prepare`) · 클라가 그 관측 소켓에 `promote_to_primary`).
  //   승격 뒤 둘레는 몸 자리를 따라야 한다(보던 자리에 머물면 빈다) — 승격 자리 둘레 · 먼 순간 이동 둘 · 모서리 넘나들기(관측 소켓이 안 받은 청크들)
  O.chk = null;
  const tok = `t1493${TAG}${Math.random().toString(36).slice(2, 8)}`, at = view.slice();
  R.prep = await postJSON('/handoff_prepare', { token: tok, name: 't1493o', player_id: 'anon_t1493o', x: at[0], y: at[1], vx: 0, vy: 0 });
  O.send({ type: 'promote_to_primary', token: tok });
  for (let k = 0; k < 160 && !(O.promoted && O.pos); k++) await sleep(50);
  const proGap = O.pos ? gapAt(O, O.pos[0], O.pos[1]) : null;
  const GP = watchGaps(O, (S) => S.pos);
  let pOk = !!(O.promoted && O.pos);
  if (pOk) { pOk = await tp(O, cpx(SPOT.far1[0]), cpx(SPOT.far1[1])); await sleep(400); }
  if (pOk) { pOk = await tp(O, SPOT.corner[0] * CS, SPOT.corner[1] * CS); await sleep(400); }
  if (pOk) { await walkTo(O, SPOT.corner[0] * CS + 40, SPOT.corner[1] * CS + 40, 16); await walkTo(O, SPOT.corner[0] * CS - 40, SPOT.corner[1] * CS - 40, 16); pOk = await tp(O, cpx(SPOT.far2[0]), cpx(SPOT.far2[1])); await sleep(400); }
  R.gapPro = { ...GP, chunks: GP.chunks.size, promoted: !!O.promoted, proRoads: !!O.proRoads, pOk, proGap, prep: R.prep && R.prep.st };
  B2.close(); O.close(); F.close();
  return R;
}

(async () => {
  say('\n=== T1493 — 길은 보이는 구역만(T1493_ROAD_BOX · T1448 켬 위에서) · 날 소켓 ===');
  say(`  자: 청크 ${CS} px(${NC}칸) · 둘레 반지름 ${RR}청크(구독 ${CAR} px) · 화면 길 창 ±${VR} px · 심은 칸 ${TRUTH.size.toLocaleString()} + 문턱 밑 줄 ${2 * (STRIP_B.cx1 - STRIP_B.cx0 + 1)}`);
  ok(CS === 1024 && RR === 2 && VR > 1000, '[전제] 자의 수는 정본 글자에서(청크 · 구독 반지름 · 화면 창)', `${CS} · ${RR} · ${VR}`);
  ok(SPOTS_OK, '[전제] 시험 자리를 다 골랐다(설 수 있는 걷기 길 · 순간 이동 · 모서리 · 줄 둘 · 관측 길 — 존 지형 정본 술어)', J({ walk: !!WALK, spots: SPOT, sB: STRIP_B, sF: STRIP_F }));
  // ⓢ 글자 — 손잡이 한 줄 · 길 술어 · 방송 갈래 · 끔 바이트
  ok(/const T1493_ROAD_BOX = process\.env\.T1493_ROAD_BOX === '1' && !!Roads\.T1448;/.test(ZSRC)
    && (ZSRC.match(/roads: _t1493RoadsOn\(url\) \? _t1453WelRoads\(/g) || []).length === 2 && !/roads: _t1453On\(url\)/.test(ZSRC)
    && /broadcast: T1493_ROAD_BOX \? _t1493Cast : broadcast,/.test(ZSRC) && /if \(T1453_VIEW_SEND \|\| T1493_ROAD_BOX\) _t1453ViewTick\(\);/.test(ZSRC),
  'ⓢ 손잡이 한 줄(T1448 켬 위에서만) · welcome 길 두 자리 · 하루 방송 갈래 · 틱 훅 — 끔이면 종전 글자 그대로 탄다');
  ok(/function clientRoadsBox\(gx0, gy0, gx1, gy1\) \{[^]*?return clientRoadsIn\(gx0 \* 32, gy0 \* 32, \(gx1 - gx0 \+ 1\) \* 32, \(gy1 - gy0 \+ 1\) \* 32, \[\]\);/.test(RSRC),
    'ⓢ 상자 길 몸통 하나 — `clientRoadsBox`(T1448) = `clientRoadsIn`(T1453 · 같은 식 · 같은 차례) · 사본 0');

  try {
    // Ⓐ 끔
    say('\nⒶ 끔(T1448 켬 · T1493 끔) — welcome 길 = 존 전체 · 청크 몫 0 · 방송 모두에게 같은 글자');
    const A = await runOff(null);
    ok(!A.why && A.seeded === SEEDROWS.length && A.truth > 20000, '[전제] 존 기동 · 칸 행 심음(켬 부팅이 구역 행으로 옮긴다)', `심은 행 ${A.seeded} · 정답 칸 ${A.truth}${A.why ? ' · ' + A.why : ''}`);
    ok(!A.why && A.miss === 0 && A.wrong === 0 && A.extra === 0 && A.welN === A.truth, 'Ⓐ ★welcome 길 = 심은 표 전부(빠짐 0 · 등급 다름 0 · 밖 0)', `welcome ${A.welN} 칸 · ${(A.welRoadBytes / 1024).toFixed(0)} KB · 빠짐 ${A.miss} · 다름 ${A.wrong} · 밖 ${A.extra}`);
    ok(!A.why && A.walkCells === 0, 'Ⓐ 청크를 넘어 걸어도 청크 몫 0(끔은 둘레 보내기를 안 탄다)', `${A.walkCells} 칸`);
    ok(!A.why && A.castB && A.castSame && A.bStripB > 0 && A.bStripF > 0 && A.bStripF === A.fStripF && A.bStripB === A.fStripB,
      'Ⓐ 그날 끝 방송 = 모두에게 같은 글자(B 도 남의 줄 칸까지 받는다 — 종전)', `B 줄 ${A.bStripB} · F 줄 ${A.bStripF}(F ${A.fStripB} · ${A.fStripF})`);

    // Ⓑ ~ Ⓔ 켬
    say('\nⒷ ~ Ⓔ 켬(T1448 · T1493) — 둘레만 · 빈 틈 0 · 하루 방송 거르기 · 값 같음');
    const O = await runOn(null);
    ok(!O.why, '[전제] 켬 존 기동', O.why || (O.log || []).join(' · '));
    const w = O.wel || {};
    ok(!O.why && w.inN > 1000 && w.inMiss === 0 && w.wrong === 0 && w.out === 0 && w.n === w.inN, 'Ⓑ ★welcome 길 = 광장 둘레 5 × 5 청크 심은 칸 그대로(빠짐 0 · 등급 다름 0 · 둘레 밖 0)',
      `B ${w.n} 칸 · ${((w.roadBytes || 0) / 1024).toFixed(0)} KB(welcome ${((w.bytes || 0) / 1024).toFixed(0)} KB) ↔ F 통째 ${w.fN} 칸 · ${((w.fRoadBytes || 0) / 1024).toFixed(0)} KB · 빠짐 ${w.inMiss} · 다름 ${w.wrong} · 밖 ${w.out}`);
    const g = O.gapB || {};
    ok(!O.why && g.walkOk && (g.tpOk || []).every(Boolean) && g.ticks > 50 && g.chunks >= 6 && g.cells > 10000, '[전제] 걷기 · 순간 이동이 실제로 일었다(틱 · 넘은 청크 · 견준 칸)',
      `틱 ${g.ticks} · 청크 ${g.chunks} · 견준 칸 ${g.cells}`);
    ok(!O.why && g.gapTicks === 0 && g.ringLateTicks === 0, 'Ⓒ ★빈 틈 0 — 청크 셋 넘어 걷기 · 먼 순간 이동 둘 · 청크 넷 모서리(넘나들기): 틱마다 화면 창 · 둘레 5 × 5 가 다 들었다',
      `창 빈 틱 ${g.gapTicks} · 둘레 늦은 틱 ${g.ringLateTicks}${g.first ? ' · 처음 ' + g.first : ''}`);
    const re = O.gapRe || {};
    ok(!O.why && re.ticks > 5 && re.welGap && re.welGap.ring > 1000 && re.welGap.ringMiss === 0 && re.gapTicks === 0 && re.ringLateTicks === 0, 'Ⓒ ★다시 접속 — 새 소켓 welcome 이 둘레를 다 싣고 · 순간 이동까지 빈 틈 0',
      `welcome 둘레 ${re.welGap && re.welGap.ring} 칸 빠짐 ${re.welGap && re.welGap.ringMiss} · 틱 ${re.ticks} · 창 빈 틱 ${re.gapTicks} · 둘레 늦은 틱 ${re.ringLateTicks}${re.first ? ' · ' + re.first : ''}`);
    const go = O.gapObs || {};
    ok(!O.why && go.ticks > 50 && go.chunks >= 4 && go.welGap && go.welGap.ringMiss === 0 && go.gapTicks === 0 && go.ringLateTicks === 0, 'Ⓒ ★관측 소켓(이웃 존이 보는 꼴) — welcome 둘레 · 보는 자리로 청크 넷 넘기 빈 틈 0',
      `welcome 둘레 ${go.welGap && go.welGap.ring} 칸 빠짐 ${go.welGap && go.welGap.ringMiss} · 틱 ${go.ticks} · 청크 ${go.chunks} · 창 빈 틱 ${go.gapTicks} · 둘레 늦은 틱 ${go.ringLateTicks}${go.first ? ' · ' + go.first : ''}`);
    const gp = O.gapPro || {};
    ok(!O.why && gp.prep === 200 && gp.promoted && !gp.proRoads && gp.pOk && gp.proGap && gp.proGap.ring > 1000 && gp.proGap.ringMiss === 0 && gp.ticks > 20 && gp.chunks >= 3 && gp.gapTicks === 0 && gp.ringLateTicks === 0,
      'Ⓒ ★존 넘어옴 — 관측 소켓 승격(`promote_to_primary` · 실제 클라가 경계를 넘는 길): 승격 자리 둘레가 이미 다 있고 · 그 뒤 둘레가 몸을 따른다(먼 순간 이동 둘 · 모서리) 빈 틈 0',
      `넘길 몸 알림 ${gp.prep} · 승격 ${gp.promoted} · 승격 welcome 길 칸 ${gp.proRoads ? '있음' : '없음'} · 승격 자리 둘레 ${gp.proGap && gp.proGap.ring}칸 빠짐 ${gp.proGap && gp.proGap.ringMiss} · 틱 ${gp.ticks} · 청크 ${gp.chunks} · 창 빈 틱 ${gp.gapTicks} · 둘레 늦은 틱 ${gp.ringLateTicks}${gp.first ? ' · ' + gp.first : ''}`);
    const c = O.cast || {};
    ok(!O.why && c.stB && c.stF && O.castF && c.fStripB > 0 && c.fStripF > 0 && !O.fLineHeldBefore, '[전제] 두 줄을 실제로 밟았고 그날 끝 방송에 들었다(F 가 두 줄 다 받음) · F 줄 청크는 B 가 안 받은 청크',
      `F: B 줄 ${c.fStripB}/${c.n} · F 줄 ${c.fStripF} · F 줄 청크 B 받음 ${O.fLineHeldBefore}`);
    ok(!O.why && c.bStripB === c.fStripB && c.bStripF === 0 && c.outCells === 0 && c.castCells >= c.bStripB, 'Ⓓ ★하루 방송 거르기 — B 는 제 청크 칸만(제 줄 다 · 남의 줄 0 · 밖 0)',
      `B: 제 줄 ${c.bStripB}/${c.n} · 남의 줄 ${c.bStripF} · 받은 방송 칸 ${c.castCells} · 밖 ${c.outCells}`);
    ok(!O.why && c.tpF && c.fStripF > 0 && c.bStripFAfter === c.fStripF, 'Ⓓ ★그 청크로 가면 그때 값으로 통째 — B 가 F 줄을 F 와 같이(밟힌 등급 1) 받는다', `${c.bStripFAfter} / F ${c.fStripF} · 순간 이동 ${c.tpF}`);
    const s = O.same || {};
    ok(!O.why && s.chunks > 50 && s.n > 5000 && s.diff === 0, 'Ⓔ ★값 같음 — B 가 든 청크마다 칸 · 등급 = F(통째 + 방송)', `청크 ${s.chunks} · 칸 ${s.n} · 다름 ${s.diff}${s.first ? ' · ' + s.first : ''}`);
    say(`  · (기록) 받은 길 바이트 — B(둘레 · 거른 방송) ${(s.bBytes / 1024).toFixed(0)} KB(청크 ${s.chunks}) · F(통째 · 다 받은 방송) ${(s.fBytes / 1024).toFixed(0)} KB · 든 칸 B ${s.bCells} · F ${s.fCells}`);

    // Ⓕ 미끼
    say('\nⒻ 미끼 셋(존 아이 프리로드 — 파일 무변 · 바꾼 자리 1)');
    { const from = '  if (roads.length) send(ws, { type: \'road_cells\', cells: roads });', to = '  if (roads.length) setTimeout(() => send(ws, { type: \'road_cells\', cells: roads }), 90);';
      const n = LB.count(ZSRC, from), r = await runOn({ file: 'zone.js', from, to }, { noCast: true }), g1 = r.gapB || {};
      ok(n === 1 && !r.why && (g1.gapTicks > 0 || g1.ringLateTicks > 0), '미끼 ① 청크 몫을 한 틱 늦게 보내는 사본(구역 넘을 때 길이 빈다) → Ⓒ 빨강', `바꾼 자리 ${n} · 창 빈 틱 ${g1.gapTicks} · 둘레 늦은 틱 ${g1.ringLateTicks}${r.why ? ' · ' + r.why : ''}`); }
    { const from = '    if (lv) out.push(cx, cy, lv);\n  }\n  return out;', to = '    if (lv) out.push(cx, cy, lv === 2 ? 1 : lv);\n  }\n  return out;';
      const n = LB.count(RSRC, from), r = await runOn({ file: 'roads.js', from, to }, { noCast: true }), w2 = r.wel || {}, s2 = r.same || {};
      ok(n === 1 && !r.why && w2.wrong > 0 && s2.diff > 0, '미끼 ② 청크 몫 등급이 통째와 다른 사본(등급 2 → 1) → Ⓑ · Ⓔ 빨강', `바꾼 자리 ${n} · welcome 다름 ${w2.wrong} · 값 다름 ${s2.diff}${r.why ? ' · ' + r.why : ''}`); }
    { const from = '    roads: _t1493RoadsOn(url) ? _t1453WelRoads(ws, player.x, player.y) : Roads.clientRoads(),', to = '    roads: _t1493RoadsOn(url) ? _t1453WelRoads(ws, player.x, player.y) : Roads.clientRoads().slice(3),';
      const n = LB.count(ZSRC, from), r = await runOff({ file: 'zone.js', from, to }, { noCast: true });
      ok(n === 1 && !r.why && (r.miss > 0 || r.welN !== r.truth), '미끼 ③ 끔 welcome 에서 한 칸이 빠진 사본 → Ⓐ 빨강', `바꾼 자리 ${n} · 빠짐 ${r.miss} · welcome ${r.welN}/${r.truth}${r.why ? ' · ' + r.why : ''}`); }
  } finally { await stopAll(); try { fs.rmSync(WD, { recursive: true, force: true }); } catch (e) {} }
  say(`\n=== T1493: ${pass + fail}건 중 PASS ${pass} · FAIL ${fail} ===`);
  process.exit(fail ? 1 : 0);
})().catch(async (e) => { console.error(e); await stopAll(); process.exit(1); });
