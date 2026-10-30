#!/usr/bin/env node
// (@regress 없음 — 러너 밖 · T989 자 · 제품 무변)
// === scripts/t989-window.js — 몸 연속 칸의 SIGKILL 창: 마지막 저장 뒤 잃는 몫 · 줄일 길의 값(저장 횟수) ===
//   node scripts/t989-window.js [장면마다 초=120] [--json <파일>]
//   존을 이 프로세스 안에서 띄운다(`Zone.__testBind` · `test-ghost-tree` 문법 · 마을 · 야생 · 도적 · 길 끔).
//   central 저장 문(`central-client.updatePlayer`)을 **받아 적는 귀**로 바꾼다(그 순간 몸을 같이 적는다 · HTTP 0 · 늘 `{ ok: true }`).
//   한 사람(등록 계정 꼴 `acc_t989` — `canPersist` 참)이 장면 넷을 산다 — 걷기 · 달리기(스태미나가 끊길 때까지 달리고 걷기) · 서 있기 · 겨울 밤 서 있기.
//   0.1초마다 몸을 적고, 그 순간 SIGKILL 이면 잃는 몫 = 지금 몸 − 마지막 저장의 몸(칸마다)을 센다(최대 · 중앙).
//   줄일 길은 같은 몸 줄 위에서 **저장이 언제 났을지**만 다시 셈한다(규칙 셋 — 아래) — 세계는 안 바뀐다(몸 줄은 실제 줄 그대로).
//     · 종전(재기): 실제로 받은 저장 그대로 — 셈판 "종전(셈)"이 이것과 같아야 셈이 맞다(자명 통과 금지).
//     · A 청크 넘을 때: 사람이 서 있는 청크(`chunk.js CHUNK_SIZE` 한 변)가 바뀐 틱에 저장 — 세계가 이미 쓰는 칸(활성화 · 비활성화 단위) · 새 수 0
//     · B 몸 단계가 바뀔 때: `body.stages`(축마다 1~3단계 · 히스테리시스 포함 · 사람이 보는 그 단계)가 바뀐 틱에 저장 · 새 수 0
//     · C 자리만 10초: 짐승 저장 간격(`saveDirtyMobs` 10초 — 이미 있는 "움직이는 몸의 저장 간격")으로 자리 칸만 — 비교용(새 수는 아니지만 다른 몸의 수를 빌린다)
'use strict';
const path = require('path');
const fs = require('fs');
const ROOT = path.join(__dirname, '..');
const SEC = +(process.argv[2] || 120);
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const JOUT = arg('--json', null);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const TMP = `/tmp/t989-${process.pid}.db`;
  for (const f of [TMP, TMP + '-wal', TMP + '-shm']) { try { fs.unlinkSync(f); } catch (e) {} }
  process.on('exit', () => { for (const f of [TMP, TMP + '-wal', TMP + '-shm']) { try { fs.unlinkSync(f); } catch (e) {} } });
  Object.assign(process.env, { ZONE_ID: 'hanbando', PORT: String(39800 + (process.pid % 150)), DB_PATH: TMP, ENABLE_VILLAGES: '0', ENABLE_WILDLIFE: '0', ENABLE_BANDITS: '0', ENABLE_ROADS: '0', E2E_GIVE: '1' });
  const CC = require(path.join(ROOT, 'server', 'central-client.js'));
  const saves = [];
  let me = null;
  CC.updatePlayer = async (id, patch) => { if (me && id === me.playerId) saves.push({ t: Date.now(), x: patch.last_x, y: patch.last_y, s: snap(me) }); return { ok: true }; };
  const _l = console.log; console.log = () => {}; console.warn = () => {}; console.error = () => {};
  const Zone = require(path.join(ROOT, 'server', 'zone.js'));
  const H = Zone.__testBind();
  const CH = require(path.join(ROOT, 'server', 'chunk.js'));
  const CS = (H.chunkManager && H.chunkManager.chunkSize) || 1024;
  me = { pid: 'p_t989', playerId: 'acc_t989', name: 't989', persistent: true,
    ws: { readyState: 1, send: () => {} }, x: 30000, y: 60000, vx: 0, vy: 0, floor: 0, hp: 100, maxHp: 100, hunger: 100, thirst: 100,
    inventory: {}, toolItems: [], equipment: [], equipSlots: {}, lots: {}, isNpc: false, isDown: false, tribeId: null, lastSeen: Date.now() };
  H.players.set(me.pid, me);
  function snap(p) { const b = p.body || {}; return { x: p.x, y: p.y, hunger: p.hunger, thirst: p.thirst, hp: p.hp, cold: b.cold || 0, fatigue: b.fatigue || 0, wet: b.wet || 0, morale: b.morale || 0, injury: b.injury || 0, stam: b.stam == null ? 1 : b.stam, stages: JSON.stringify(b.stages || {}) }; }
  let _seq = 0;
  const input = (vx, vy, sprint) => { try { for (let i = 0; i < 3; i++) H.handlePlayerInput(me, JSON.stringify({ type: 'input', seq: ++_seq, vx, vy, sprint: !!sprint })); } catch (e) {} };   // 0.1초 = 틱 셋 — 틱마다 입력 하나(클라 고정 스텝과 같은 꼴)
  const clock = (day, night) => { try { H.handlePlayerInput(me, JSON.stringify({ type: '__e2e_clock', day, night })); } catch (e) {} };
  // 걸을 수 있는 긴 줄을 고른다 — 동쪽으로 SEC × 달리기 속도만큼 막힘 없는 출발점(세계에 묻는다)
  const need = SEC * 64 * 2.5 + 200;
  const freeRun = (x0, y0) => { for (let k = 0; k < need; k += 32) if (H.isTerrainBlockedLocal(x0 + k, y0)) return false; return true; };
  let start = null;
  for (let dy = 0; dy < 40000 && !start; dy += 640) for (const [x0, y0] of [[30000, 60000 + dy], [20000, 40000 + dy], [50000, 30000 + dy]]) if (freeRun(x0, y0)) { start = { x: x0, y: y0 }; break; }
  const rows = [];   // [장면, t, snap]
  const scenes = [
    { name: '걷기', setup: () => {}, drive: () => input(1, 0, false) },
    { name: '달리기', setup: () => {}, drive: () => { const b = me.body || {}; input(1, 0, !(b.stamLock) && (b.stam == null || b.stam > 0.05)); } },
    { name: '서 있기', setup: () => {}, drive: () => input(0, 0, false) },
    { name: '겨울 밤 서 있기', setup: () => clock(330, true), drive: () => input(0, 0, false) },
  ];
  const out = { sec: SEC, start, chunk: CS, scenes: {} };
  for (const sc of scenes) {
    me.x = start.x; me.y = start.y; me.vx = 0; me.vy = 0; me.hunger = 100; me.thirst = 100; me.hp = 100; me.body = null;
    me._nextSaveAt = 0; me._savedX = undefined; me._savedY = undefined; me._savedBody = undefined;
    sc.setup();
    saves.length = 0;
    const t0 = Date.now(), R = [];
    while (Date.now() - t0 < SEC * 1000) {
      sc.drive();
      await sleep(100);
      R.push([Date.now(), snap(me)]);
    }
    input(0, 0, false); await sleep(300);
    out.scenes[sc.name] = { rows: R, saves: saves.slice() };
  }
  // ── 셈 ──
  const FIELDS = ['pos', 'hunger', 'thirst', 'hp', 'cold', 'fatigue', 'wet', 'stam'];
  const diff = (a, b) => ({ pos: Math.hypot(a.x - b.x, a.y - b.y) / 32, hunger: Math.abs(a.hunger - b.hunger), thirst: Math.abs(a.thirst - b.thirst), hp: Math.abs(a.hp - b.hp),
    cold: Math.abs(a.cold - b.cold), fatigue: Math.abs(a.fatigue - b.fatigue), wet: Math.abs(a.wet - b.wet), stam: Math.abs(a.stam - b.stam) });
  const ck = (s) => Math.floor(s.x / CS) + ',' + Math.floor(s.y / CS);
  const rule = (R, real, kind) => {   // 저장이 났을 틱 목록(그때의 몸) — 첫 저장 시각은 실제 첫 저장(흩음)을 그대로 쓴다
    const pts = [];
    if (kind === 'real') { for (const s of real) pts.push([s.t, s.s]); return pts; }
    const per = []; let first = real.length ? real[0].t : R[0][0];
    // 종전(셈): 첫 저장부터 30초마다(움직였거나 몸이 바뀐 때만 — 서 있기 · 몸 그대로면 건너뜀 · 근사: 실제 줄의 그 시각들)
    for (const s of real) per.push(s.t);
    let last = null, lastCk = null, lastSt = null, lastPos = null, nextC = R[0][0] + 10000;
    let ri = 0;
    for (const [t, s] of R) {
      while (ri < per.length && per[ri] <= t) { pts.push([per[ri], s]); last = s; ri++; lastCk = ck(s); lastSt = s.stages; }
      if (kind === 'A' && lastCk != null && ck(s) !== lastCk) { pts.push([t, s]); lastCk = ck(s); }
      if (kind === 'B' && lastSt != null && s.stages !== lastSt) { pts.push([t, s]); lastSt = s.stages; }
      if (kind === 'C' && last && t >= nextC) { pts.push([t, Object.assign({}, last, { x: s.x, y: s.y })]); nextC = t + 10000; }
    }
    return pts.sort((a, b) => a[0] - b[0]);
  };
  const loss = (R, pts) => {   // 틱마다 마지막 저장 뒤 잃는 몫(저장 전 틱은 뺀다 — 접속 저장이 그 자리를 덮는다)
    const L = Object.fromEntries(FIELDS.map((f) => [f, []]));
    let k = -1;
    for (const [t, s] of R) {
      while (k + 1 < pts.length && pts[k + 1][0] <= t) k++;
      if (k < 0) continue;
      const d = diff(s, pts[k][1]); for (const f of FIELDS) L[f].push(d[f]);
    }
    const st = (a) => { if (!a.length) return [0, 0]; const b = a.slice().sort((x, y) => x - y); return [b[b.length - 1], b[Math.floor(b.length / 2)]]; };
    return Object.fromEntries(FIELDS.map((f) => [f, st(L[f])]));
  };
  const fmt = (v, f) => (f === 'pos' ? v.toFixed(1) + 'm' : (['hunger', 'thirst', 'hp'].includes(f) ? v.toFixed(2) : (v * 100).toFixed(1) + '%p'));
  out.table = {};
  _l(`\n=== 몸 연속 칸 SIGKILL 창 — 장면마다 ${SEC}초 · 청크 한 변 ${CS}px(${CS / 32}m) · 출발 ${start && start.x},${start && start.y} ===`);
  _l('| 장면 | 저장 규칙 | 저장 수(분당) | 자리 m 최대 · 중앙 | 허기 | 갈증 | HP | 추위 | 피로 | 젖음 | 스태미나 |');
  _l('|---|---|---:|---|---|---|---|---|---|---|---|');
  for (const [nm, S] of Object.entries(out.scenes)) {
    out.table[nm] = {};
    for (const kind of ['real', 'A', 'B', 'C']) {
      const pts = rule(S.rows, S.saves, kind);
      const L = loss(S.rows, pts);
      out.table[nm][kind] = { saves: pts.length, perMin: +(pts.length / (SEC / 60)).toFixed(2), loss: L };
      const lbl = { real: '종전(재기)', A: 'A 청크 넘을 때 + 종전', B: 'B 몸 단계 바뀔 때 + 종전', C: 'C 자리만 10초 + 종전' }[kind];
      _l(`| ${nm} | ${lbl} | ${pts.length} (${(pts.length / (SEC / 60)).toFixed(1)}) | ${FIELDS.map((f) => `${fmt(L[f][0], f)} · ${fmt(L[f][1], f)}`).join(' | ')} |`);
    }
    const r0 = S.rows[0][1], r1 = S.rows[S.rows.length - 1][1];
    out.table[nm].span = { dist: Math.hypot(r1.x - r0.x, r1.y - r0.y) / 32, hunger: r0.hunger - r1.hunger, thirst: r0.thirst - r1.thirst, cold: r1.cold - r0.cold };
    _l(`|  | (장면 전체 변화) | | ${out.table[nm].span.dist.toFixed(1)}m | ${out.table[nm].span.hunger.toFixed(2)} | ${out.table[nm].span.thirst.toFixed(2)} | | ${(out.table[nm].span.cold * 100).toFixed(1)}%p | | | |`);
  }
  if (JOUT) { const o = JSON.parse(JSON.stringify(out)); for (const S of Object.values(o.scenes)) { S.rows = S.rows.length; S.saves = S.saves.map((s) => s.t); } fs.writeFileSync(JOUT, JSON.stringify(o)); }
  process.exit(0);
})();
