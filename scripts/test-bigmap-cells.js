#!/usr/bin/env node
// @regress   ← 통합 러너가 이 표를 보고 자기 목록을 만든다(scripts/run-regress.sh · 표 없으면 안 돈다)
// === scripts/test-bigmap-cells.js — 큰 지도 = 셀 술어의 그림 · 실시간 점 (T565) ==========================
//
// ★계약
//   ① 존 지도 `/bigmap.png` — 4×4셀 표본 · 크기 = ⌈셀/4⌉ · 버전 헤더(ETag) · 같은 ETag 면 304
//   ② ★지도 픽셀 = 셀 술어 — **모든 픽셀**이 그 표본 셀의 참(자 `t565-map-audit.js truth()` · 존을 안 거치고 Node 에서
//      terrain·해안 띠·다리를 이어 붙인 것)과 같다. 존이 자기 술어로 구운 그림과 자의 조립이 **교차 검사**된다.
//   ③ ★줌인 조각 = 셀 술어 · 그리고 **표본 셀에서 존 지도와 같은 답**(줌인/줌아웃 같은 답) — 닛폰 고개(한재)가
//      새벌 동쪽 산맥 띠를 뚫은 자리를 반드시 포함한다(재민이 본 그 자리)
//   ④ 조각 인자 — 꼴이 틀리면 400 · 존 밖이면 404
//   ⑤ `map_players` — 존 안 **사람**만(주민·유령 0) · 묻는 사람 자신은 빠진다 · 관측 소켓도 답을 받는다 · 0.5초 안 두 번 = 한 번
//   ⑥ 팔 끔(`T565_MAP_LIVE=0`) — 답은 `off:1` 하나(자리 0)
//   ⑦ 지은 다리(런타임) — 표본 셀이면 그 픽셀만 다리로 바뀌고, 표본 밖이면 그대로(`bigmap-bake` 모듈 · 존 무관)
//
// ★자명 통과 금지 — 대조가 빨개질 줄 아는지 **픽스처로 한 픽셀을 뒤집어** 본다 · 자리 목록이 비어서 통과하지 않게 남이 실제로 실린다.
//
// 실행: node scripts/test-bigmap-cells.js
//   central(3010) + 새벌(3020 · 팔 끔) + 닛폰(3021 · 팔 켬 · 레거시 마을 주민이 선다) — 마을 시뮬 끔(지형만 본다).
'use strict';
const path = require('path');
const fs = require('fs');
const net = require('net');
const { spawn } = require('child_process');
const FB = require('./fixture-boot');
const WebSocket = require('ws');
const { PNG } = require('pngjs');

const ROOT = path.join(__dirname, '..');
const BB = require(path.join(ROOT, 'server', 'bigmap-bake'));
const AUD = require('./t565-map-audit');
const zc = require(path.join(ROOT, 'server', 'zone-config'));
const CPORT = 3010, HPORT = zc.ZONES.hanbando.port, NPORT = zc.ZONES.nippon.port;
const DBS = [`/tmp/tbc-c-${process.pid}.db`, `/tmp/tbc-h-${process.pid}.db`, `/tmp/tbc-n-${process.pid}.db`];
const rmDbs = () => { for (const f of DBS) for (const s of ['', '-wal', '-shm']) { try { fs.unlinkSync(f + s); } catch (e) {} } };
rmDbs();

let pass = 0, fail = 0;
const ok = (c, m, extra) => { c ? pass++ : fail++; console.log((c ? '  ✓ ' : '  ✗ ') + m + (extra !== undefined && extra !== '' ? `  ${extra}` : '')); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const procs = [];
process.on('exit', () => { for (const p of procs) { try { p.kill('SIGKILL'); } catch (e) {} } rmDbs(); });
function portFree(port) {
  return new Promise((res) => { const s = net.createServer(); s.once('error', () => res(false)); s.once('listening', () => s.close(() => res(true))); s.listen(port, '127.0.0.1'); });
}
function boot(name, file, env) {
  const p = spawn(process.execPath, [path.join(ROOT, 'server', file)], { cwd: ROOT, env: Object.assign({}, process.env, env), stdio: ['ignore', 'pipe', 'pipe'] });
  p._name = name; p._log = '';
  p.stdout.on('data', (b) => { p._log = (p._log + String(b)).slice(-20000); });
  p.stderr.on('data', (b) => { p._log = (p._log + String(b)).slice(-20000); });
  procs.push(p); return p;
}
function zoneEnv(id, port, db, extra) {
  return Object.assign({ PORT: String(port), ZONE_ID: id, DB_PATH: db, CENTRAL_HOST: 'localhost', CENTRAL_PORT: String(CPORT), CENTRAL_URL: `http://localhost:${CPORT}`,
    ENABLE_BANDITS: '0', ENABLE_ROADS: '0', ENABLE_WILDLIFE: '0', ENABLE_VILLAGES: '0' }, extra || {});
}
async function getPng(url, headers) {
  const r = await fetch(url, { headers: headers || {}, signal: AbortSignal.timeout(20000) });
  const out = { status: r.status, ver: r.headers.get('x-bigmap-ver'), step: +r.headers.get('x-bigmap-step') || 0, etag: r.headers.get('etag'),
    cors: r.headers.get('access-control-allow-origin'), cells: r.headers.get('x-bigmap-cells') };
  if (r.status === 200) { const b = Buffer.from(await r.arrayBuffer()); out.bytes = b.length; out.png = PNG.sync.read(b); } else { await r.arrayBuffer().catch(() => {}); }
  return out;
}
async function waitBaked(base) {
  for (let i = 0; i < 180; i++) { const r = await getPng(`${base}/bigmap.png`); if (r.status === 200) return r; await sleep(1000); }
  return null;
}
function connectWs(port, qs) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://localhost:${port}/?${qs}`);
    const st = { ws, welcome: null, msgs: [] };
    const t = setTimeout(() => reject(new Error('welcome timeout')), 30000);
    ws.on('message', (raw) => {
      let m; try { m = JSON.parse(String(raw)); } catch (e) { return; }
      if (m.type === 'map_players') st.msgs.push(m);
      if ((m.type === 'welcome' || m.type === 'observer_welcome' || m.type === 'observer_snapshot') && !st.welcome) { st.welcome = m; clearTimeout(t); resolve(st); }
    });
    ws.on('open', () => { if (/observer=1/.test(qs)) setTimeout(() => { if (!st.welcome) { st.welcome = { type: 'open' }; clearTimeout(t); resolve(st); } }, 1500); });
    ws.on('error', (e) => { clearTimeout(t); reject(e); });
  });
}
async function ask(st, waitMs) {
  const n0 = st.msgs.length;
  st.ws.send(JSON.stringify({ type: 'map_players' }));
  for (let i = 0; i < (waitMs || 3000) / 50 && st.msgs.length === n0; i++) await sleep(50);
  return st.msgs.length > n0 ? st.msgs[st.msgs.length - 1] : null;
}
// 존 지도 한 장을 자의 참과 대조 — 뒤집을 픽셀(`flip`)을 주면 그 한 픽셀을 일부러 틀리게 읽는다(자명 통과 금지)
function auditZoneMap(zid, png, flip) {
  const T = AUD.truth(zid);
  const pal = BB.palette(T.Z.groundColor);
  const cls = AUD.readBaked(png, pal);
  if (flip != null) cls[flip] = cls[flip] === BB.K.rock ? BB.K.plain : BB.K.rock;
  const bw = Math.ceil(T.W / BB.STEP), bh = Math.ceil(T.H / BB.STEP);
  let bad = 0, unk = 0, n = 0; const cnt = new Array(BB.CLS.length).fill(0);
  for (let by = 0; by < bh; by++) for (let bx = 0; bx < bw; bx++) {
    const k = cls[by * bw + bx]; n++;
    if (k < 0) { unk++; continue; }
    cnt[k]++;
    if (k !== T.at(BB.sampleCell(bx, BB.STEP, T.W), BB.sampleCell(by, BB.STEP, T.H))) bad++;
  }
  return { n, bad, unk, cnt, bw, bh, cls, T, pal };
}

(async () => {
  console.log('\n=== 큰 지도 = 셀 술어의 그림 · 실시간 점 (T565) ===');
  const busy = [];
  for (const p of [CPORT, HPORT, NPORT]) if (!(await portFree(p))) busy.push(p);
  ok(busy.length === 0, '⓪ 포트가 비어 있다(앞 판의 서버를 재지 않는다)', busy.length ? `쥔 포트 ${busy.join(',')}` : `${CPORT}/${HPORT}/${NPORT}`);
  if (busy.length) { console.log(`\n=== ${pass + fail}건 중 PASS ${pass} · FAIL ${fail} ===\n`); process.exit(1); }
  const cp = boot('central', 'central.js', { PORT: String(CPORT), DB_PATH: DBS[0], PUBLIC_HOST: 'localhost', ENABLED_ZONES: 'hanbando,nippon' });
  const cUp = await FB.waitUp(cp, /central server up on/, { name: 'central' });
  ok(cUp.ok, 'central 기동', cUp.why);
  const hp = boot('hanbando', 'zone.js', zoneEnv('hanbando', HPORT, DBS[1], { T565_MAP_LIVE: '0' }));
  const np = boot('nippon', 'zone.js', zoneEnv('nippon', NPORT, DBS[2]));
  const [hUp, nUp] = await Promise.all([FB.waitUp(hp, /zone server up on/, { name: 'hanbando' }), FB.waitUp(np, /zone server up on/, { name: 'nippon' })]);
  ok(hUp.ok && nUp.ok, '존 둘 기동(새벌 팔 끔 · 닛폰 팔 켬)', `${hUp.why} · ${nUp.why}`);
  if (!cUp.ok || !hUp.ok || !nUp.ok) { console.log(`\n=== ${pass + fail}건 중 PASS ${pass} · FAIL ${fail} ===\n`); process.exit(1); }
  const HB = `http://localhost:${HPORT}`, NB = `http://localhost:${NPORT}`;

  // ── ① 존 지도 ──────────────────────────────────────────────────────────
  console.log('\n① 존 지도 /bigmap.png');
  const H = await waitBaked(HB), N = await waitBaked(NB);
  ok(!!H && !!N, '두 존이 지도를 구웠다(굽는 동안은 503 · 배경에서 한 번)', H && N ? `새벌 ${(H.bytes / 1024).toFixed(1)}KB · 닛폰 ${(N.bytes / 1024).toFixed(1)}KB` : '');
  if (!H || !N) { console.log(`\n=== ${pass + fail}건 중 PASS ${pass} · FAIL ${fail} ===\n`); process.exit(1); }
  const bakeLine = (hp._log.match(/큰 지도 굽기 — [^\n]*/) || [''])[0];
  console.log(`    (새벌 ${bakeLine})`);
  const hW = Math.ceil(zc.ZONES.hanbando.zoneWidth / 32), hH = Math.ceil(zc.ZONES.hanbando.zoneHeight / 32);
  ok(H.png.width === Math.ceil(hW / 4) && H.png.height === Math.ceil(hH / 4) && H.step === 4 && H.cells === `${hW}x${hH}`,
     '크기 = ⌈셀/4⌉ · 표본 4 · 셀 수 헤더', `${H.png.width}×${H.png.height} · step ${H.step} · ${H.cells}`);
  ok(!!H.ver && H.etag === `"${H.ver}"` && H.cors === '*', '버전 = ETag · CORS *', `${H.ver}`);
  const H304 = await getPng(`${HB}/bigmap.png`, { 'If-None-Match': H.etag });
  ok(H304.status === 304, '같은 ETag 면 304(다시 안 보낸다)', `${H304.status}`);

  // ── ② 지도 픽셀 = 셀 술어 ───────────────────────────────────────────────
  console.log('\n② 지도 픽셀 = 셀 술어(모든 픽셀 · 자의 참과 교차)');
  const aH = auditZoneMap('hanbando', H.png), aN = auditZoneMap('nippon', N.png);
  ok(aH.n > 500000 && aH.cnt[BB.K.rock] > 10000 && aH.cnt[BB.K.water] > 10000 && aH.cnt[BB.K.bridge] > 0 && aH.cnt[BB.K.ore] > 1000,
     '전제: 새벌 그림에 바위·물·다리·광맥이 실제로 있다(빈 그림이면 아래가 자명 통과다)', BB.CLS.map((c, i) => `${c} ${aH.cnt[i]}`).join(' · '));
  ok(aH.bad === 0 && aH.unk === 0, '★★새벌 — 지도 픽셀 ↔ 표본 셀 불일치 0', `${aH.n.toLocaleString()}픽셀 · 불일치 ${aH.bad} · 팔레트 밖 ${aH.unk}`);
  ok(aN.bad === 0 && aN.unk === 0 && aN.n > 300000, '★★닛폰 — 불일치 0', `${aN.n.toLocaleString()}픽셀 · 불일치 ${aN.bad} · 팔레트 밖 ${aN.unk}`);
  const flipped = auditZoneMap('hanbando', H.png, 1234);
  ok(flipped.bad === 1, '★자명 통과 금지 — 한 픽셀을 뒤집으면 대조가 정확히 1 을 센다', `${flipped.bad}`);

  // ── ③ 줌인 조각 ────────────────────────────────────────────────────────
  console.log('\n③ 줌인 조각(1셀 = 1픽셀) — 셀 술어 · 표본 셀에서 존 지도와 같은 답');
  //   한재 = 닛폰 고개(pos −216, 60000 · 반경 1850)가 새벌 동쪽 끝(x ≈ 69,800)의 산맥 띠를 뚫은 자리 — 재민이 줌인한 그 자리
  const T = aH.T;
  const hanjae = { cx: Math.floor(69800 / 32), cy: Math.floor(60000 / 32) };
  const bridgeCell = (() => { const b = zc.ZONES.hanbando.bridges || []; return b.length ? { cx: b[0], cy: b[1] } : null; })();
  const want = [[Math.floor(hanjae.cx / 64), Math.floor(hanjae.cy / 64)], [Math.floor(hanjae.cx / 64), Math.floor((hanjae.cy - 60) / 64)]];
  if (bridgeCell) want.push([Math.floor(bridgeCell.cx / 64), Math.floor(bridgeCell.cy / 64)]);
  {   // 바위가 가장 많은 조각 셋(존 지도에서 센다) + 아무 데나 셋
    const rk = new Map();
    for (let by = 0; by < aH.bh; by++) for (let bx = 0; bx < aH.bw; bx++) if (aH.cls[by * aH.bw + bx] === BB.K.rock) { const k = Math.floor(bx / 16) + ',' + Math.floor(by / 16); rk.set(k, (rk.get(k) || 0) + 1); }
    for (const [k] of [...rk.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3)) want.push(k.split(',').map(Number));
    for (let i = 0; i < 3; i++) want.push([(i * 7 + 3) % Math.ceil(T.W / 64), (i * 13 + 5) % Math.ceil(T.H / 64)]);
  }
  let tb = 0, tn = 0, same = 0, sameN = 0, vOk = 0, rockN = 0, passLand = 0, bridgeN = 0;
  for (const [TX, TY] of want) {
    const r = await getPng(`${HB}/bigmap.png?tile=${TX},${TY}`);
    if (r.status !== 200) { tb++; continue; }
    if (r.ver === H.ver) vOk++;
    const tc = AUD.readBaked(r.png, aH.pal);
    for (let y = 0; y < r.png.height; y++) for (let x = 0; x < r.png.width; x++) {
      const cx = TX * 64 + x, cy = TY * 64 + y, k = tc[y * r.png.width + x];
      tn++; if (k !== T.at(cx, cy)) tb++;
      if (k === BB.K.rock) rockN++;
      if (k === BB.K.bridge) bridgeN++;
      if (Math.hypot(cx * 32 + 16 - 69800, cy * 32 + 16 - 60000) < 1500 && k !== BB.K.rock && k !== BB.K.water) passLand++;
      const bx = Math.floor(cx / 4), by = Math.floor(cy / 4);
      if (BB.sampleCell(bx, 4, T.W) === cx && BB.sampleCell(by, 4, T.H) === cy) { sameN++; if (aH.cls[by * aH.bw + bx] === k) same++; }
    }
  }
  ok(tn > 20000 && rockN > 2000 && passLand > 1000 && (!bridgeCell || bridgeN > 0),
     '전제: 조각에 산맥 바위 · 한재 고개의 뭍 · 다리가 실제로 실렸다', `셀 ${tn.toLocaleString()} · 바위 ${rockN} · 고개 뭍 ${passLand} · 다리 ${bridgeN}`);
  ok(tb === 0, '★★조각 ↔ 셀 술어 불일치 0', `${tn.toLocaleString()}셀 · 불일치 ${tb}`);
  ok(sameN > 1000 && same === sameN, '★★줌인/줌아웃 같은 답 — 표본 셀에서 조각 = 존 지도', `${same}/${sameN}`);
  ok(vOk === want.length, '조각의 버전 = 존 지도 버전', `${vOk}/${want.length}`);
  // 종전 지도(벡터)는 이 고개를 막힌 띠로 그렸다 — 그림이 뭍이라고 말하는지(= 셀과 같은지) 한 번 더
  {
    const bx = Math.floor(hanjae.cx / 4), by = Math.floor(hanjae.cy / 4);
    const k = aH.cls[by * aH.bw + bx];
    ok(k !== BB.K.rock && T.at(BB.sampleCell(bx, 4, T.W), BB.sampleCell(by, 4, T.H)) === k, '한재 한가운데 — 지도 픽셀은 바위가 아니고 셀과 같다', `${BB.CLS[k]}`);
  }

  // ── ④ 조각 인자 ────────────────────────────────────────────────────────
  console.log('\n④ 조각 인자');
  const bad1 = await getPng(`${HB}/bigmap.png?tile=abc`), bad2 = await getPng(`${HB}/bigmap.png?tile=9999,9999`);
  ok(bad1.status === 400 && bad2.status === 404, '꼴이 틀리면 400 · 존 밖이면 404', `${bad1.status} · ${bad2.status}`);

  // ── ⑤ map_players ─────────────────────────────────────────────────────
  console.log('\n⑤ map_players(닛폰 · 팔 켬) — 존 안 사람 전부 · 주민 0 · 나 0');
  const A = await connectWs(NPORT, 'name=a');
  const B = await connectWs(NPORT, 'name=b');
  const pidA = A.welcome.pid || (A.welcome.self && A.welcome.self.pid), pidB = B.welcome.pid || (B.welcome.self && B.welcome.self.pid);
  await sleep(800);
  const health = await (await fetch(`${NB}/health`)).json();
  const npcN = (health.players || 0) - (health.humans || 0);
  const rA = await ask(A);
  ok(!!rA && rA.zone === 'nippon' && Array.isArray(rA.players), '답이 온다(존 · 자리 목록)', rA ? `${rA.players.length}명` : '무응답');
  const pidsA = rA ? rA.players.map((p) => p.pid) : [];
  ok(!!pidA && !!pidB && pidsA.includes(pidB) && !pidsA.includes(pidA), '★남(B)은 실리고 나(A)는 빠진다', `A ${pidA} · B ${pidB} · 실린 ${pidsA.join(',')}`);
  ok(npcN > 0, '전제: 이 존엔 주민이 실제로 선다(0이면 아래가 자명 통과다)', `존 몸 ${health.players} · 사람 ${health.humans} · 주민 ${npcN}`);
  ok(rA && rA.players.length === (health.humans || 0) - 1, '★주민은 안 실린다 — 실린 수 = 사람 − 나', `${rA ? rA.players.length : '?'} = ${health.humans} − 1`);
  const pB = rA && rA.players.find((p) => p.pid === pidB);
  const bSelf = B.welcome && B.welcome.self;
  ok(pB && bSelf && Math.abs(pB.x - bSelf.x) < 200 && Math.abs(pB.y - bSelf.y) < 200 && Number.isInteger(pB.x) && typeof pB.name === 'string' && pB.name.length > 0,
     '자리 = B 의 존-로컬 좌표(정수) · 이름', pB ? `${pB.name} (${pB.x},${pB.y}) · B welcome (${bSelf && Math.round(bSelf.x)},${bSelf && Math.round(bSelf.y)})` : '');
  const rA2 = await ask(A, 400);
  ok(rA2 === null, '0.5초 안에 다시 물으면 답하지 않는다(1초에 한 번)', rA2 ? '또 답했다' : '무응답');
  await sleep(600);
  const O = await connectWs(NPORT, 'observer=1');
  const rO = await ask(O);
  const pidsO = rO ? rO.players.map((p) => p.pid).sort().join(',') : '';
  ok(rO && pidsO === [pidA, pidB].sort().join(','), '관측 소켓(이웃 존에서 보는 눈)도 이 존 사람 전부를 받는다', pidsO || '무응답');

  // ── ⑥ 팔 끔 ─────────────────────────────────────────────────────────────
  console.log('\n⑥ T565_MAP_LIVE=0(새벌)');
  const C = await connectWs(HPORT, 'name=c');
  const D = await connectWs(HPORT, 'name=d');
  await sleep(300);
  const rC = await ask(C);
  ok(rC && rC.off === 1 && !rC.players, '★끈 팔 = `off:1` 하나(자리 0)', rC ? JSON.stringify(rC).slice(0, 80) : '무응답');
  for (const st of [A, B, O, C, D]) { try { st.ws.close(); } catch (e) {} }

  // ── ⑦ 지은 다리(모듈) ──────────────────────────────────────────────────
  console.log('\n⑦ 지은 다리 — 표본 셀만 다시 묻는다(모듈)');
  {
    const W = 40, Hh = 24, br = new Set();
    const q = { rock: () => false, water: (x, y) => Math.floor(y / 32) >= 10 && Math.floor(y / 32) < 14, bridge: (x, y) => br.has(Math.floor(x / 32) + ',' + Math.floor(y / 32)),
                ore: () => null, stone: () => 1, forest: () => 1 };
    const b = BB.makeZoneBake(q, W, Hh, 4);
    while (b.bakeRow()) {}
    const before = Array.from(b.idx);
    br.add('6,10'); br.add('7,10');   // (6,10) = 표본 셀(4·1+2, 4·2+2) · (7,10) = 표본 밖
    const n = b.repaint([6, 10, 7, 10]);
    const p = b.pixelOf(6, 10);
    const changed = before.reduce((a, v, i) => a + (v !== b.idx[i] ? 1 : 0), 0);
    ok(p >= 0 && b.idx[p] === BB.K.bridge && n === 1 && changed === 1 && b.pixelOf(7, 10) === -1, '표본 셀의 다리는 그 픽셀 하나만 바꾸고, 표본 밖은 그대로', `바뀐 픽셀 ${changed} · repaint ${n}`);
    const tile = BB.bakeTile(q, W, Hh, 0, 0, 64);
    ok(tile && tile.idx[10 * tile.w + 7] === BB.K.bridge && tile.idx[10 * tile.w + 6] === BB.K.bridge, '조각(1셀 = 1픽셀)엔 둘 다 다리', '');
  }

  // ── ⑧ 지은 다리(존 안 · 실제 함수) ────────────────────────────────────────
  console.log('\n⑧ 지은 다리(존 · `addBridgeCells` 실제 함수) — 표본 셀이면 버전이 새로 나고 그 픽셀이 다리가 된다');
  {
    // 새벌의 표본 셀 중 물(다리·바위 아님)이고 오른쪽 이웃도 물인 첫 칸 — 참(자)에서 고른다
    let pick = null;
    for (let by = 0; by < aH.bh && !pick; by++) for (let bx = 0; bx < aH.bw && !pick; bx++) {
      const cx = BB.sampleCell(bx, 4, T.W), cy = BB.sampleCell(by, 4, T.H);
      if (T.at(cx, cy) === BB.K.water && T.at(cx + 1, cy) === BB.K.water) pick = { cx, cy };
    }
    const port = 3690 + (process.pid % 50);
    const code = `const _l=console.log; console.log=()=>{}; console.warn=()=>{}; console.error=()=>{};
const Z=require(${JSON.stringify(path.join(ROOT, 'server', 'zone.js'))}); const H=Z.__testBind();
const out=(o)=>{ process.stdout.write(String.fromCharCode(10)+'T565OUT'+JSON.stringify(o)+String.fromCharCode(10)); process.exit(0); };
let t0=Date.now(); const wait=(f,ms,k)=>{ const t=setInterval(()=>{ if(f()){ clearInterval(t); k(true);} else if(Date.now()-t0>ms){ clearInterval(t); k(false);} },100); };
wait(()=>!!H.bigmapStat().ver, 90000, (ok0)=>{ const s0=H.bigmapStat(); const c0=H.bigmapClassAt(${pick ? pick.cx : 0},${pick ? pick.cy : 0});
  const n=H.addBridgeCells([${pick ? pick.cx : 0},${pick ? pick.cy : 0},${pick ? pick.cx + 1 : 0},${pick ? pick.cy : 0}]);
  const midPng=H.bigmapStat().bytes;
  t0=Date.now(); wait(()=>H.bigmapStat().ver && H.bigmapStat().ver!==s0.ver, 10000, (ok1)=>{ const s1=H.bigmapStat();
    out({ok0,ok1,v0:s0.ver,v1:s1.ver,c0,c1:H.bigmapClassAt(${pick ? pick.cx : 0},${pick ? pick.cy : 0}),side:H.bigmapClassAt(${pick ? pick.cx + 1 : 0},${pick ? pick.cy : 0}),n,midPng,rep:s1.repainted}); }); });`;
    const env = Object.assign({}, process.env, zoneEnv('hanbando', port, `/tmp/tbc-i-${process.pid}.db`));
    const r = require('child_process').spawnSync(process.execPath, ['-e', code], { cwd: ROOT, env, encoding: 'utf8', timeout: 150000 });
    for (const sfx of ['', '-wal', '-shm']) { try { fs.unlinkSync(`/tmp/tbc-i-${process.pid}.db` + sfx); } catch (e) {} }
    const m = /T565OUT(\{.*\})/.exec(r.stdout || '');
    const o = m ? JSON.parse(m[1]) : null;
    ok(!!pick && o && o.ok0 && o.c0 === BB.K.water && o.n === 2, '전제: 존이 다 구웠고 고른 표본 셀은 물이다 · 다리 둘을 더했다', pick ? `(${pick.cx},${pick.cy}) · ${o ? JSON.stringify(o) : (r.stderr || '').slice(-200)}` : '물 표본 셀 없음');
    ok(o && o.midPng === 0, '★싸는 동안은 옛 그림을 안 낸다(내려 둔다 — `bridges_add` 를 본 클라가 옛 버전을 다시 받지 않게)', o ? `그 순간 PNG ${o.midPng}B` : '');
    ok(o && o.ok1 && o.v1 !== o.v0 && o.c1 === BB.K.bridge && o.side === null && o.rep === 1, '★★버전이 새로 나고 그 픽셀만 다리가 됐다 · 표본 밖 이웃은 지도 픽셀이 없다', o ? `${o.v0} → ${o.v1} · ${BB.CLS[o.c0]} → ${BB.CLS[o.c1]} · 다시 칠한 픽셀 ${o.rep}` : '');
  }

  console.log(`\n=== ${pass + fail}건 중 PASS ${pass} · FAIL ${fail} ===\n`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('하네스 예외:', e && e.stack || e); process.exit(1); });
