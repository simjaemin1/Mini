#!/usr/bin/env node
// @regress   ← 통합 러너가 이 표를 보고 자기 목록을 만든다(scripts/run-regress.sh · 표 없으면 안 돈다)
// === scripts/test-village-only.js — 마을이 유일한 무리(T785 · 손잡이 `T785_VILLAGE_ONLY` 켬) =====================
//
// ★[재민 10-18 ⓑ · 카드 T785 ④] 잰다: 창설(켬) · 가입 · 촌장(사람 마을 칸 · NPC 마을 = 촌장 몸) · 곳간 문 · 소개 · 가입 문 · 전쟁 ·
//   **이행** · 재기동 · 다시 붙기 · **존 넘김**(2존 실핸드오프 — 몸 `member` 가 실려 간다) · **central 호출 0 셈**.
//   ★[T786 2026-10-18] **권한 자리 표본**(Ⓣ1–Ⓣ13 · 켬 판) — 술어 둘(마을 사람 · 촌장) · 길드 사유지 → 마을 땅(C1 · C5 · C9 · C11 · C12 · C14 · C18 · C20).
// ★어떻게 — central 과 존 사이에 **세는 문**(프록시)을 둔다. 존은(두 존 다) central 을 그 문으로만 본다(`CENTRAL_URL`).
//   하네스가 central 에 직접 치는 것(판 깔기 — 길드 만들기 · 행 읽기 · 존 표)은 그 문을 안 지나므로 셈에 안 든다.
// ★판 셋 — ① **끔**으로 옛 판을 깐다(길드 하나 · 길드 칸 셋(곳간 잠금 · 초대제 · 소개) · 그 길드 사람이 세운 마을 하나)
//   → ② **켬**으로 다시 띄워 이행을 잰다(central `GET /tribe/:id` 한 번 · 옛 칸 그대로) → 켬 판에서 가입 · 촌장 · 곳간 문 · 소개 ·
//   가입 문 · 전쟁 · 길드 문 닫힘 · 켬 창설(새 마을 = 처음부터 마을 칸) → ③ 켬으로 한 번 더 띄워 같은 값 · 이행 0 · 다시 붙어도 소속 그대로 ·
//   촌장이 동쪽 끝을 넘어 nippon 으로 갔다가(소속이 몸에 실려 간다 · 거기선 남의 존 마을) 돌아와도 촌장 그대로.
// ★재료는 `E2E_GIVE` 픽스처로만 준다(캐는 사슬은 이 하네스가 재는 것이 아니다) · 자리 찾기는 서버에게 묻는다(`village_start` 의 답).
//
// 실행: node scripts/test-village-only.js
'use strict';
const path = require('path');
const fs = require('fs');
const http = require('http');
const { spawn } = require('child_process');
const FB = require('./fixture-boot');
const WebSocket = require('ws');
const { DatabaseSync } = require('node:sqlite');

const ROOT = path.join(__dirname, '..');
// ⚠두 존은 **제 정본 포트**(zone-config hanbando 3020 · nippon 3021)여야 한다 — 존 넘김은 존→존 직통이다
//   (`/handoff_prepare` → 받는 존의 config 포트 · `/handoff_ack` → 보낸 존의 config 포트 · test-handoff-body 와 같은 판).
const CPORT = 3251, PPORT = 3252, ZPORT = 3020, NPORT = 3021;
const CDB = `/tmp/tvo-central-${process.pid}.db`, ZDB = `/tmp/tvo-zone-${process.pid}.db`, NDB = `/tmp/tvo-nip-${process.pid}.db`;
for (const f of [CDB, ZDB, NDB]) for (const s of ['', '-wal', '-shm']) { try { fs.unlinkSync(f + s); } catch (e) {} }
FB.mustBeFree([CPORT, PPORT, ZPORT, NPORT], 'test-village-only');

let pass = 0, fail = 0;
const ok = (c, m, extra) => { c ? pass++ : fail++; console.log((c ? '  ✓ ' : '  ✗ ') + m + (extra !== undefined ? `  ${extra}` : '')); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const procs = [];
FB.reapOnExit(procs);
function boot(name, file, env) {
  const p = spawn(process.execPath, [path.join(ROOT, 'server', file)], {
    cwd: ROOT, env: Object.assign({}, process.env, env), stdio: ['ignore', 'pipe', 'pipe'],
  });
  p._name = name;
  p.stdout.on('data', (b) => { const s = String(b); if (/up on|마을 시뮬 준비|\[T785\]/.test(s)) process.stdout.write(`  [${name}] ${s.trim().split('\n').filter((l) => /up on|마을 시뮬 준비|\[T785\]/.test(l)).join(' | ').slice(0, 220)}\n`); });
  p.stderr.on('data', () => {});
  procs.push(p);
  return p;
}
function stop(p) {
  return new Promise((res) => {
    if (!p || p.exitCode != null) return res(true);
    const to = setTimeout(() => { try { p.kill('SIGKILL'); } catch (e) {} }, 15000);
    p.once('exit', () => { clearTimeout(to); res(true); });
    try { p.kill('SIGTERM'); } catch (e) { clearTimeout(to); res(false); }
  });
}

// ── 세는 문 — 존 → central 요청을 판(phase)마다 적는다 ───────────────────────────────
let phase = 'boot1';
const calls = [];
const proxy = http.createServer((req, res) => {
  calls.push({ phase, m: req.method, u: req.url });
  const fwd = http.request({ host: 'localhost', port: CPORT, method: req.method, path: req.url, headers: req.headers }, (r2) => {
    res.writeHead(r2.statusCode, r2.headers);
    r2.pipe(res);
  });
  fwd.on('error', () => { try { res.writeHead(502); res.end('{}'); } catch (e) {} });
  req.pipe(fwd);
});
const tribeCalls = (ph) => calls.filter((c) => c.phase === ph && /^\/(tribe|tribes|tribe_intros|war|wars)(\/|$|\?)/.test(c.u));

const jget = async (u) => { try { const r = await fetch(u, { signal: AbortSignal.timeout(8000) }); return r.ok ? await r.json() : null; } catch (e) { return null; } };
const jpost = async (u, body) => {
  try { const r = await fetch(u, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }); return await r.json(); } catch (e) { return null; }
};
const CEN = `http://localhost:${CPORT}`, ZON = `http://localhost:${ZPORT}`, NIP = `http://localhost:${NPORT}`;

// `token` 이 있으면 핸드오프 도착(`?handoff_token=` · nippon) — 없으면 계정 접속(hanbando).
function connect(username, token) {
  return new Promise((resolve, reject) => {
    const q = new URLSearchParams({ username, password: 'pw-' + username, name: username, color: '#5a9ae0' });
    const ws = new WebSocket(token ? `ws://localhost:${NPORT}/?handoff_token=${encodeURIComponent(token)}` : `ws://localhost:${ZPORT}/?${q}`);
    const C = { ws, username, pid: null, playerId: null, notices: [], kinds: [], msgs: [], pos: null, closed: false };
    const to = setTimeout(() => reject(new Error(`${username} 접속 시간초과`)), 60000);
    ws.on('message', (raw) => {
      let m = null; try { m = JSON.parse(String(raw)); } catch (e) { return; }
      if (m.type === 'welcome') { C.pid = m.pid; C.playerId = m.playerId; clearTimeout(to); resolve(C); }
      else if (m.type === 'notice') { C.notices.push(String(m.text || '')); C.kinds.push(String(m.kind || '')); }
      else if (m.type === 'tick') { const me = (m.players || []).find((p) => p.pid === C.pid); if (me) C.pos = { x: me.x, y: me.y }; }
      if (m.type !== 'tick') { C.msgs.push(m); if (C.msgs.length > 600) C.msgs.splice(0, 300); }
    });
    ws.on('error', (e) => { clearTimeout(to); reject(e); });
    ws.on('close', () => { C.closed = true; });
    C.beat = setInterval(() => { try { if (ws.readyState === 1) ws.send(JSON.stringify({ type: 'ping' })); } catch (e) {} }, 2000);
  });
}
const snd = (C, o) => { try { C.ws.send(JSON.stringify(o)); } catch (e) {} };
const chat = (C, text) => snd(C, { type: 'chat', text });
const close = async (C) => { try { clearInterval(C.beat); C.ws.close(); } catch (e) {} await sleep(300); };
const lastN = (C, n) => JSON.stringify(C.notices.slice(-(n || 1)));
async function sayWait(C, text, re, ms) {
  C.notices.length = 0; C.kinds.length = 0;
  chat(C, text);
  const t0 = Date.now();
  while (Date.now() - t0 < (ms || 5000)) { if (C.notices.some((t) => re.test(t))) return true; await sleep(100); }
  return false;
}
const bodyOf = async (name, at) => { const d = await jget(`${at || ZON}/bodydbg?name=${encodeURIComponent(name)}`); return d && d.bodies ? d.bodies[name] : null; };
const kin = async () => jget(`${ZON}/guilddbg`);   // 켬 = 마을 칸(길드 = 마을 · 새 문 0)
const kinOf = async (vid) => { const d = await kin(); return (d && Array.isArray(d.villages)) ? d.villages.find((v) => (v.vid | 0) === (vid | 0)) || null : null; };
function hallData(vid) {
  let db = null;
  try {
    db = new DatabaseSync(ZDB, { readOnly: true });
    const r = db.prepare("SELECT data FROM village_buildings WHERE village_id = ? AND type = 'hall'").get(vid | 0);
    return r && r.data ? JSON.parse(r.data) : null;
  } catch (e) { return { err: e.message }; } finally { try { if (db) db.close(); } catch (e) {} }
}

let zone = null;
async function bootZone(on) {
  zone = boot(on ? 'zone(켬)' : 'zone(끔)', 'zone.js', {
    PORT: String(ZPORT), ZONE_ID: 'hanbando', DB_PATH: ZDB, CENTRAL_URL: `http://localhost:${PPORT}`,
    ENABLE_VILLAGES: '1', VILLAGE_MAX: '1', VILLAGE_DAY_MS: '2000',
    VILLAGE_FOUND_COST: '0.1', PVILLAGE_GAP: '10', PVILLAGE_MAX: '3',
    E2E_GIVE: '1', ENABLE_BANDITS: '0', ENABLE_ROADS: '0', ENABLE_WILDLIFE: '0',
    T785_VILLAGE_ONLY: on ? '1' : '0',
  });
  const up = await FB.waitUp(zone, /zone server up on/, { name: 'zone', capMs: 900000 });
  if (!up.ok) return false;
  for (let i = 0; i < 300; i++) { const j = await jget(`${ZON}/startinfo`); if (j && j.ok && j.villages && j.villages.length) return true; await sleep(1000); }
  return false;
}
// 이웃 존(존 넘김 도착지) — 켬 · 마을 0(가볍게) · `/bodydbg` 를 보려고 `E2E_GIVE`(지급은 안 한다).
let nipZ = null;
async function bootNippon() {
  nipZ = boot('nippon(켬)', 'zone.js', {
    PORT: String(NPORT), ZONE_ID: 'nippon', DB_PATH: NDB, CENTRAL_URL: `http://localhost:${PPORT}`,
    ENABLE_VILLAGES: '0', E2E_GIVE: '1', ENABLE_BANDITS: '0', ENABLE_ROADS: '0', ENABLE_WILDLIFE: '0',
    T785_VILLAGE_ONLY: '1',
  });
  const up = await FB.waitUp(nipZ, /zone server up on/, { name: 'nippon', capMs: 900000 });
  return !!up.ok;
}

// ── 건립 — 자리는 서버에게 묻는다(`village_start` 의 답 · 사유지 4칸 = 회관 발자국 2×2) ─────────────
const CELL = 32;
async function warpCell(C, X, Y) {
  C.notices.length = 0;
  snd(C, { type: 'teleport_debug', x: X * CELL + 16, y: Y * CELL + 16 });
  for (let i = 0; i < 20; i++) { await sleep(100); if (C.notices.some((t) => /텔레포트 →/.test(t))) return true; }
  return false;
}
async function found(C, base, centers) {
  snd(C, { type: '__e2e_give', items: { stone: 400, wood: 400 }, tools: ['pickaxe', 'pickaxe', 'pickaxe'] }); await sleep(900);
  const far = (X, Y, n) => centers.every((v) => Math.hypot(X - v.cx, Y - v.cy) >= n);
  let SITE = null, why = '';
  outer:
  for (const R of [60, 75, 95, 120, 150]) {
    for (const [ux, uy] of [[1, 0], [0, 1], [-1, 0], [0, -1], [1, 1], [-1, 1], [1, -1], [-1, -1]]) {
      const X = base.cx + Math.round(ux * R), Y = base.cy + Math.round(uy * R);
      if (X < 8 || Y < 8 || !far(X, Y, 58)) continue;
      if (!(await warpCell(C, X, Y))) { why = `워프 실패 (${X},${Y})`; continue; }
      C.notices.length = 0;
      snd(C, { type: 'village_start', atX: X * CELL + 16, atY: Y * CELL + 16 }); await sleep(700);
      const w = C.notices.slice(-3).join(' | ') || '(답 없음)';
      if (/사유지/.test(w)) { SITE = { X, Y }; break outer; }
      why = w;
    }
  }
  if (!SITE) return { why: `자리 못 찾음 — ${why}` };
  let got = 0;
  for (const [dx, dy] of [[0, 0], [1, 0], [0, 1], [1, 1]]) {
    if (!(await warpCell(C, SITE.X + dx, SITE.Y + dy))) continue;
    C.notices.length = 0;
    snd(C, { type: 'claim', kind: 'temporary' }); await sleep(600);
    if (C.notices.some((t) => /사유지 설치/.test(t))) got++;
  }
  if (got < 4) return { SITE, why: `임시 사유지 ${got}/4 · ${lastN(C, 1)}` };
  await warpCell(C, SITE.X, SITE.Y);
  C.msgs.length = 0;
  snd(C, { type: 'village_start', atX: SITE.X * CELL + 16, atY: SITE.Y * CELL + 16 }); await sleep(1500);
  let site = null;
  for (let k = 0; k < 12 && !site; k++) {
    const m = C.msgs.slice().reverse().find((x) => x.type === 'building_added' && x.building && x.building.type === 'village_site');
    if (m) site = m.building; else await sleep(700);
  }
  if (!site) return { SITE, why: `착공 실패 · ${lastN(C, 2)}` };
  let hall = null;
  for (let k = 0; k < 12 && !hall; k++) {
    C.msgs.length = 0;
    snd(C, { type: 'village_advance', buildingId: site.id }); await sleep(1500);
    const hm = C.msgs.slice().reverse().find((x) => x.type === 'building_added' && x.building && x.building.type === 'village_hall');
    if (hm) hall = hm.building;
  }
  if (!hall) return { SITE, why: `건립 실패 · ${lastN(C, 2)}` };
  return { SITE, hall };
}

(async () => {
  console.log('\n=== 마을이 유일한 무리 — T785 (창설 · 가입 · 촌장 · 곳간 문 · 소개 · 이행 · 재기동 · 존 넘김 · central 0) ===\n');
  const central = boot('central', 'central.js', { PORT: String(CPORT), DB_PATH: CDB, PUBLIC_HOST: 'localhost', ENABLED_ZONES: 'hanbando,nippon' });
  const _cu = FB.waitUp(central, /central server up on/, { name: 'central' });
  await new Promise((r) => proxy.listen(PPORT, r));
  ok((await _cu).ok, '⓪ central 기동 · 세는 문 :' + PPORT);

  // ══ ① 끔 — 옛 판을 깐다 ══════════════════════════════════════════════════════════════
  phase = 'boot1';
  ok(await bootZone(false), '⓪ 존 기동(끔)');
  phase = 'off';
  const si0 = await jget(`${ZON}/startinfo`);
  const centers = (si0 && si0.villages || []).map((v) => ({ vid: v.vid, cx: v.cx, cy: v.cy }));
  let A = await connect('kinA');
  for (let i = 0; i < 50 && !A.pos; i++) await sleep(100);
  ok(!!(A.playerId && A.pos), '⓪ A 접속(끔)', `${A.playerId} @ ${A.pos && Math.round(A.pos.x)},${A.pos && Math.round(A.pos.y)}`);
  const cr = await jpost(`${CEN}/tribe/create`, { player_id: A.playerId, name: '물레' });
  const TID = cr && cr.tribe_id;
  ok(!!TID, '① 끔 — 길드를 하나 세웠다(옛 길 · 하네스가 central 에 직접)', JSON.stringify(cr));
  A.notices.length = 0;
  snd(A, { type: 'tribe_set', tribeId: TID, tribeName: '물레' }); await sleep(800);
  ok(A.notices.some((t) => /물레 마을 사람이 되었습니다/.test(t)), '①a 끔 — 존이 길드를 몸에 얹었다(`tribe_set` 종전 그대로)', lastN(A));
  ok(await sayWait(A, '/곳간 잠금', /곳간은 촌장만 열 수 있습니다/), '①b 끔 — `/곳간 잠금` 은 한 줄 안내(★[T809 · T779] 곳간 잠금은 걷었다 · central 무접촉)', lastN(A));
  ok(await sayWait(A, '/마을 초대제', /부름을 받아야/), '①c 끔 — 길드장이 문을 걸었다(central 칸)', lastN(A));
  ok(await sayWait(A, '/소개 물레방아 곁에 산다', /소개를 적었습니다/), '①d 끔 — 길드장이 소개를 적었다(central 칸)', lastN(A));
  const tr0 = await jget(`${CEN}/tribe/${TID}`);
  const t0 = tr0 && tr0.tribe;
  ok(!!t0 && (t0.granary_open | 0) === 1 && t0.join_mode === 'invite' && t0.intro === '물레방아 곁에 산다',
    '①e 끔 — central tribe 칸 셋(곳간 문은 안 만졌으니 1 그대로 · 초대제 · 소개)', JSON.stringify(t0 && { g: t0.granary_open, j: t0.join_mode, i: t0.intro }));
  const base = { cx: Math.floor(A.pos.x / CELL), cy: Math.floor(A.pos.y / CELL) };
  const F = await found(A, base, centers);
  ok(!!F.hall, '①f 끔 — 길드장이 마을을 세웠다(회관 완공)', F.hall ? `회관 ${F.hall.id} @ ${F.SITE.X},${F.SITE.Y}` : F.why);
  let VID = null;
  for (let k = 0; k < 30 && VID == null; k++) {
    const d = await jget(`${ZON}/welcomedbg`);
    const rows = (d && Array.isArray(d.villages)) ? d.villages : [];
    const mine = rows.filter((r) => !centers.some((c) => (c.vid | 0) === (r.vid | 0)));
    if (mine.length) VID = mine[mine.length - 1].vid | 0; else await sleep(1000);
  }
  ok(VID != null, '①g 끔 — 새 마을의 vid', VID);
  const hd1 = VID != null ? hallData(VID) : null;
  ok(!!hd1 && hd1.tribeId === TID && hd1.founder === A.playerId && !('t785' in hd1) && !('chief' in hd1),
    '①h ★끔 — 회관 행 = 종전 그대로(길드 실음 · T785 칸 0 — main 바이트)', JSON.stringify(hd1 && Object.keys(hd1)));
  const fb1 = await bodyOf('kinA');
  ok(!!(fb1 && fb1.member && (fb1.member.vid | 0) === (VID | 0)), '①i 끔 — 세운 사람은 제 마을 사람(T197 창설 = 소속)', JSON.stringify(fb1 && fb1.member));
  await close(A); await sleep(1500);
  await stop(zone);

  // ══ ② 켬 — 이행 ═════════════════════════════════════════════════════════════════════
  phase = 'boot2';
  ok(await bootZone(true), '⓪ 존 기동(켬) — 같은 DB');
  let K = null;
  for (let k = 0; k < 60; k++) { K = await kinOf(VID); if (K && K.t785) break; await sleep(1000); }
  ok(!!K && K.t785 && !K.pending, '② 켬 — 이행이 끝났다(표지 `t785`)', JSON.stringify(K));
  ok(!!K && K.chief === A.playerId, '②a ★촌장 = 창설자(마을 칸)', K && K.chief);
  ok(!!K && K.granaryOpen === true && K.joinMode === 'invite' && K.intro === '물레방아 곁에 산다',
    '②b ★★central tribe 칸 셋이 마을 칸으로 옮겨졌다(곳간 문 1 → 열림 · 초대제 · 소개 — 곳간 문 칸은 옮겨만 두고 꺼내기는 안 읽는다 · T779)', JSON.stringify(K && { g: K.granaryOpen, j: K.joinMode, i: K.intro }));
  ok(!!K && (K.tribe0 | 0) === (TID | 0) && K.tribeIdRuntime == null, '②c 옛 길드 id 는 이행 원천으로만(런타임 `_tribeId` = null)', JSON.stringify(K && { t0: K.tribe0, rt: K.tribeIdRuntime }));
  const hd2 = hallData(VID);
  ok(!!hd2 && hd2.tribeId === TID && hd2.t785 === true && hd2.chief === A.playerId && hd2.granaryOpen === true && hd2.joinMode === 'invite',
    '②d ★옛 칸은 지우지 않았다 — 회관 행에 `tribeId` 그대로 + 마을 칸', JSON.stringify(hd2 && Object.keys(hd2)));
  const b2 = tribeCalls('boot2');
  ok(b2.length === 1 && b2[0].m === 'GET' && b2[0].u === `/tribe/${TID}`, '②e ★이행이 central 을 **한 번** 물었다(GET /tribe/:id · 그 밖의 tribe·war 0)', JSON.stringify(b2.map((c) => `${c.m} ${c.u}`)));
  const kd2 = await kin();
  ok(!!kd2 && kd2.migrate && (kd2.migrate.calls | 0) === 1, '②f 이행 셈 — 물은 수 1', JSON.stringify(kd2 && kd2.migrate));

  // ══ 켬 판 — 가입 · 곳간 문 · 촌장 · 소개 · 가입 문 · 전쟁 ══════════════════════════════════
  phase = 'on';
  A = await connect('kinA');
  const B = await connect('kinB');
  const Cc = await connect('kinC');
  await sleep(1500);
  const ab = await bodyOf('kinA');
  ok(!!(ab && ab.member && (ab.member.vid | 0) === (VID | 0)), '③ 켬 — 다시 붙어도 A 는 그 마을 사람(몸 `member` · 도착 길)', JSON.stringify(ab && ab.member));
  ok(await sayWait(Cc, '/수락', /부른 마을이 없습니다/), '③a 부름이 없으면 `/수락` 은 아무것도 안 한다', lastN(Cc));
  B.notices.length = 0;
  ok(await sayWait(A, '/초대 kinB', /불렀습니다/), '③b 마을 사람이 부른다(`/초대`)', lastN(A));
  await sleep(500);
  ok(B.notices.some((t) => /당신을 부릅니다/.test(t)), '③c ★불린 사람에게 말이 간다(종전 부름 문장 그대로)', lastN(B));
  ok(await sayWait(B, '/수락', /에 들었습니다/), '③d ★`/수락` 한 마디로 마을에 든다', lastN(B));
  const bb = await bodyOf('kinB');
  ok(!!(bb && bb.member && (bb.member.vid | 0) === (VID | 0)), '③e ★소속의 정본(몸 `member`)이 바뀌었다', JSON.stringify(bb && bb.member));
  ok(await sayWait(Cc, '/초대 kinA', /마을 사람이 아닙니다/), '③f 마을 사람이 아니면 못 부른다', lastN(Cc));
  // 곳간 문 — 이행으로 잠긴 채다
  const hx = F.hall ? Math.round(F.hall.x) : 0, hy = F.hall ? Math.round(F.hall.y) : 0;
  snd(A, { type: 'teleport_debug', x: hx + 40, y: hy + 40 }); snd(B, { type: 'teleport_debug', x: hx + 40, y: hy + 40 }); await sleep(800);
  snd(A, { type: '__e2e_give', items: { food: 300 } }); await sleep(500);
  snd(A, { type: 'village_deposit', buildingId: F.hall && F.hall.id, want: { food: 300 } }); await sleep(1200);
  B.notices.length = 0;
  snd(B, { type: 'village_withdraw', vid: VID, res: 'food', qty: 1 }); await sleep(1200);
  //   ★[T809 · T779] 꺼내기 = 촌장 한 사람(곳간 잠금 문은 걷었다) — 마을 사람(촌장 아님)은 막히고 촌장은 꺼낸다(촌장 = 마을 칸 · T786 ②).
  ok(B.notices.some((t) => /곳간은 촌장만 열 수 있습니다/.test(t)), '④ ★꺼내기 = 촌장 — 마을 사람(촌장 아님)은 못 꺼낸다', lastN(B, 2));
  ok(await sayWait(A, '/곳간 열기', /곳간은 촌장만 열 수 있습니다/), '④a `/곳간 열기` 는 한 줄 안내(잠금 문 없음 · central 무접촉)', lastN(A));
  A.notices.length = 0;
  snd(A, { type: 'village_withdraw', vid: VID, res: 'food', qty: 1 }); await sleep(1200);
  ok(A.notices.length > 0 && !A.notices.some((t) => /촌장만/.test(t)), '④b 촌장(마을 칸)은 꺼낸다 — 촌장 문은 비킨다(다음 막음이 답한다)', lastN(A, 2));
  // 촌장
  ok(await sayWait(A, '/촌장', /촌장 — kinA/), '⑤ `/촌장` — 지금 촌장', lastN(A));
  ok(await sayWait(B, '/촌장 kinA', /촌장만/), '⑤a 촌장이 아니면 못 넘긴다', lastN(B));
  ok(await sayWait(A, '/촌장 kinC', /우리 마을 사람이 아닙니다/), '⑤b 마을 사람에게만 넘긴다', lastN(A));
  ok(await sayWait(A, '/촌장 kinB', /넘겼습니다/), '⑤c ★촌장 넘기기(승계 문 하나)', lastN(A));
  await sleep(300);
  ok(B.notices.some((t) => /이제 .*의 촌장이 되었습니다/.test(t)), '⑤d 받은 사람이 안다', lastN(B));
  const K5 = await kinOf(VID);
  ok(!!K5 && K5.chief === B.playerId, '⑤e ★마을 칸의 촌장 = B', K5 && K5.chief);
  ok(await sayWait(A, '/곳간 잠금', /촌장만/), '⑤f 넘긴 사람은 이제 곳간 문을 못 만진다', lastN(A));
  B.notices.length = 0;
  snd(B, { type: 'village_withdraw', vid: VID, res: 'food', qty: 1 }); await sleep(1200);
  ok(B.notices.length > 0 && !B.notices.some((t) => /촌장만/.test(t)), '⑤g 새 촌장이 꺼낸다(넘겨받은 촌장 = 마을 칸)', lastN(B, 2));
  ok(await sayWait(B, '/탈퇴', /먼저 자리를 넘겨야/), '⑤h ★촌장 자리는 비우지 않는다(넘기고 떠난다)', lastN(B));
  ok(await sayWait(A, '/추방 kinB', /촌장은 내보낼 수 없습니다/), '⑤i 촌장은 내보내지 못한다', lastN(A));
  // 소개 · 가입 문
  ok(await sayWait(A, '/소개 남이 쓴 줄', /촌장만/), '⑥ 촌장이 아니면 소개를 못 쓴다', lastN(A));
  ok(await sayWait(B, '/소개   새   물레  소리  ', /소개를 적었습니다/), '⑥a 촌장이 소개를 쓴다', lastN(B));
  ok(await sayWait(B, '/마을 공개', /아무나 들 수 있습니다/), '⑥b 촌장이 가입 문을 연다', lastN(B));
  const K6 = await kinOf(VID);
  ok(!!K6 && K6.intro === '새 물레 소리' && K6.joinMode === 'open' && K6.granaryOpen === true,
    '⑥c ★마을 칸 — 소개(공백 접기 · 다듬기) · 가입 문 열림 · 곳간 문 칸 그대로(안 읽는다)', JSON.stringify(K6 && { i: K6.intro, j: K6.joinMode, g: K6.granaryOpen }));
  //   ★[T787] 말 — 명령 이름 `/마을`(보기 · 가입 문) · 옛 `/길드` 는 한 줄 안내만(칸을 안 바꾼다 — 자명 통과 금지: 잠근 뒤 옛 명령으로 열어 본다)
  ok(await sayWait(B, '/마을', /촌장 .* · 아무나 듦 · "새 물레 소리"/), '⑥d ★[T787] `/마을` — 내 마을 한 줄(촌장 · 가입 문 · 소개)', lastN(B));
  ok(await sayWait(B, '/마을 초대제', /부름을 받아야/), '⑥e ★[T787] `/마을 초대제` — 촌장이 문을 건다', lastN(B));
  ok(await sayWait(B, '/길드 공개', /길드는 이제 마을입니다/), '⑥f ★[T787] 옛 명령 `/길드 공개` = 한 줄 안내', lastN(B));
  const K6b = await kinOf(VID);
  ok(!!K6b && K6b.joinMode === 'invite', '⑥g ★옛 명령은 칸을 **안 바꿨다**(초대제 그대로)', K6b && K6b.joinMode);
  ok(await sayWait(B, '/마을 공개', /아무나 들 수 있습니다/), '⑥h 다시 연다(아래 절의 전제 그대로)', lastN(B));
  // 전쟁 — 열쇠 = 마을 id
  const kd6 = await kin();
  const npc = (kd6 && kd6.villages || []).find((v) => !v.player);
  ok(!!npc, '⑦ 상대 마을(NPC) — 이 땅에 있다', npc && `${npc.vid} ${npc.name}`);
  ok(!!npc && npc.chiefNpc === true && !!npc.chief, '⑦0 ★NPC 마을 촌장 = 촌장 몸(T529 · 회관 행에 따로 안 적는다)', npc && JSON.stringify({ chief: npc.chief, npc: npc.chiefNpc }));
  if (npc) {
    ok(await sayWait(A, `/전쟁 ${npc.name}`, /촌장만/), '⑦a 촌장이 아니면 전쟁을 못 건다', lastN(A));
    ok(await sayWait(B, `/전쟁 ${npc.name}`, /전쟁을 걸었습니다/), '⑦b ★촌장이 마을 사이 전쟁을 건다', lastN(B));
    const kw = await kin();
    const me7 = kw.villages.find((v) => (v.vid | 0) === (VID | 0)), them7 = kw.villages.find((v) => (v.vid | 0) === (npc.vid | 0));
    ok(!!me7 && !!them7 && me7.wars.includes(npc.vid) && them7.wars.includes(VID), '⑦c ★전쟁 열쇠 = 마을 id(두 마을 칸 양쪽)', JSON.stringify({ me: me7 && me7.wars, them: them7 && them7.wars }));
    ok(await sayWait(B, `/전쟁 ${npc.name}`, /이미 싸우고/), '⑦d 두 번 걸리지 않는다', lastN(B));
    ok(await sayWait(B, `/종전 ${npc.name}`, /전쟁이 끝났습니다/), '⑦e 촌장이 끝낸다', lastN(B));
    const ke = await kinOf(VID);
    ok(!!ke && ke.wars.length === 0, '⑦f 끝나면 칸이 빈다', JSON.stringify(ke && ke.wars));
    ok(await sayWait(B, `/전쟁 ${npc.name}`, /전쟁을 걸었습니다/), '⑦g 다시 건다(재기동 뒤 같은 값을 보려고)', lastN(B));
  }
  B.msgs.length = 0;
  snd(B, { type: 'central_call', door: 'war/declare', defender_guild_id: TID | 0 }); await sleep(1000);
  const wr = B.msgs.find((m) => m.type === 'central_result' && m.door === 'war/declare');
  ok(!!wr && wr.ok === false && /마을 사이/.test(String(wr.data && wr.data.error || '')), '⑦h 길드 id 전쟁 문은 닫혔다(두 id 공간을 안 섞는다)', JSON.stringify(wr && wr.data));
  Cc.notices.length = 0;
  snd(Cc, { type: 'tribe_set', tribeId: TID, tribeName: '물레' }); await sleep(1200);
  ok(!Cc.notices.some((t) => /물레 마을 사람이 되었습니다/.test(t)), '⑧ ★`tribe_set` 을 안 받는다(클라가 알리는 길드를 몸에 안 적는다)', lastN(Cc));
  // 켬 창설 — 새 마을은 처음부터 마을 칸(촌장 = 세운 사람 · 표지) · 길드를 안 싣는다 · central 무접촉(아래 ⑨ 가 센다)
  for (let i = 0; i < 30 && !Cc.pos; i++) await sleep(100);
  const baseC = Cc.pos ? { cx: Math.floor(Cc.pos.x / CELL), cy: Math.floor(Cc.pos.y / CELL) } : base;
  const FC = await found(Cc, baseC, centers.concat(F.SITE ? [{ vid: VID, cx: F.SITE.X, cy: F.SITE.Y }] : []));
  ok(!!FC.hall, '⑧a 켬 — C 가 마을을 세웠다(회관 완공)', FC.hall ? `회관 ${FC.hall.id} @ ${FC.SITE.X},${FC.SITE.Y}` : FC.why);
  let VIDC = null;
  for (let k = 0; k < 30 && VIDC == null && FC.hall; k++) {
    const d = await jget(`${ZON}/welcomedbg`);
    const rows = (d && Array.isArray(d.villages)) ? d.villages : [];
    const mine = rows.filter((r) => !centers.some((c) => (c.vid | 0) === (r.vid | 0)) && (r.vid | 0) !== (VID | 0));
    if (mine.length) VIDC = mine[mine.length - 1].vid | 0; else await sleep(1000);
  }
  const hdC = VIDC != null ? hallData(VIDC) : null;
  ok(!!hdC && hdC.chief === Cc.playerId && hdC.t785 === true && hdC.tribeId == null && hdC.founder === Cc.playerId,
    '⑧b ★켬 창설 — 회관 행에 처음부터 마을 칸(촌장 = 세운 사람 · 표지 `t785`) · 길드 안 실음', JSON.stringify(hdC && { vid: VIDC, chief: hdC.chief, t785: hdC.t785, tribeId: hdC.tribeId }));
  const KC = VIDC != null ? await kinOf(VIDC) : null;
  ok(!!KC && KC.chief === Cc.playerId && !KC.pending && KC.granaryOpen === true && KC.joinMode === 'open' && KC.intro === '',
    '⑧c 켬 창설 — 마을 칸 기본(곳간 열림 · 문 열림 · 소개 빈칸) · 이행 대기 아님', JSON.stringify(KC && { c: KC.chief, p: KC.pending, g: KC.granaryOpen, j: KC.joinMode }));
  const cb = await bodyOf('kinC');
  ok(!!(cb && cb.member && VIDC != null && (cb.member.vid | 0) === (VIDC | 0)), '⑧d 켬 창설 — 세운 사람은 제 마을 사람(몸 `member`)', JSON.stringify(cb && cb.member));
  ok(await sayWait(Cc, '/촌장', /촌장 — kinC/), '⑧e 켬 창설 — `/촌장` 이 세운 사람을 안다', lastN(Cc));

  // ══ T786 — 권한 자리 표본(술어 둘: **마을 사람** = 몸 `member` · **촌장** = 마을 칸 · 길드 사유지 → **마을 땅**) ═══════════
  //   지금 A = VID 마을 사람(촌장 아님) · B = VID 촌장 · C = VIDC 촌장(VID 엔 남). 자리 번호 = T777 C 표(보고 T786 §1).
  ok(await sayWait(A, '/추방 kinC', /촌장만/), 'Ⓣ1 [C5] 내보내기는 **촌장**만(마을 사람이어도 촌장이 아니면 못 한다)', lastN(A));
  const hid = F.hall && F.hall.id;
  A.notices.length = 0; snd(A, { type: 'village_welcome', buildingId: hid, on: true }); await sleep(900);
  ok(A.notices.some((t) => /촌장만/.test(t)), 'Ⓣ2 [C1] 이방인 받기 스위치는 **촌장**만', lastN(A));
  B.notices.length = 0; snd(B, { type: 'village_welcome', buildingId: hid, on: true }); await sleep(900);
  ok(B.notices.some((t) => /이방인을 받/.test(t)), 'Ⓣ3 [C1] 촌장은 켠다(그 다음 문은 종전 그대로)', lastN(B));
  snd(B, { type: 'village_welcome', buildingId: hid, on: false }); await sleep(600);
  A.msgs.length = 0; snd(A, { type: 'village_inventory', buildingId: hid }); await sleep(900);
  ok(A.msgs.some((m) => m.type === 'village_inventory'), 'Ⓣ4 [C1] 회관 열람 = **마을 사람**(촌장 아닌 A 도 본다)');
  snd(Cc, { type: 'teleport_debug', x: hx + 40, y: hy + 40 }); await sleep(800);
  Cc.notices.length = 0; Cc.msgs.length = 0; snd(Cc, { type: 'village_inventory', buildingId: hid }); await sleep(900);
  ok(!Cc.msgs.some((m) => m.type === 'village_inventory') && Cc.notices.some((t) => /볼 수 없습니다/.test(t)), 'Ⓣ5 [C1] 남의 마을 사람은 못 본다', lastN(Cc));
  B.msgs.length = 0; Cc.msgs.length = 0;
  chat(A, '/t 물레 소식'); await sleep(1200);
  const tB = B.msgs.find((m) => m.type === 'chat' && m.text === '물레 소식'), tC = Cc.msgs.find((m) => m.type === 'chat' && m.text === '물레 소식');
  ok(!!tB && !!tB.tribe, 'Ⓣ6 [C20] 무리 채팅 `/t` = **같은 마을 사람**에게 간다(이름표 = 마을 이름)', JSON.stringify(tB && { tribe: tB.tribe }));
  ok(!tC, 'Ⓣ7 [C20] 남의 마을 사람에겐 안 간다');
  A.notices.length = 0; snd(A, { type: 'claim', kind: 'guild' }); await sleep(800);
  ok(A.notices.some((t) => /마을 땅은 그 마을의 영토라/.test(t)), 'Ⓣ8 [C11] 길드 사유지 문은 닫혔다(마을 땅 = 그 마을 영토)', lastN(A));
  A.notices.length = 0; snd(A, { type: 'build_guild_granary', atX: hx + 80, atY: hy + 80 }); await sleep(900);
  ok(A.notices.some((t) => /곳간은 마을의 것입니다/.test(t)), 'Ⓣ9 [C9] 길드 곳간 문은 닫혔다(→ 마을 곳간)', lastN(A));
  //   C12 — 첫 셀(인접 예외 ⓐ · 땅 0칸)인 새 사람 D 로 잰다(A · C 는 회관 터 4칸이 있어 T45 인접 문이 먼저 답한다)
  const D = await connect('kinD');
  snd(D, { type: '__e2e_give', items: { stone: 50, wood: 50 } }); await sleep(500);
  snd(D, { type: 'teleport_debug', x: hx + 40, y: hy + 40 }); await sleep(800);
  D.notices.length = 0; snd(D, { type: 'claim', kind: 'personal' }); await sleep(900);
  ok(D.notices.some((t) => /내 마을 땅 안에만/.test(t)), 'Ⓣ10 [C12] 개인 사유지는 **내 마을 땅** 안에만(마을 사람이 아니면 남의 마을 땅에 못 놓는다)', lastN(D, 2));
  await close(D);
  //   C14 — 옛 길드 보관 줄(`guild:`)은 켬에서 길드 우선권이 아니다(새로는 안 생긴다) · 끔 = 종전 그대로(같은 줄 · 같은 사람)
  const _tk = (on) => { try { return JSON.parse(require('child_process').execFileSync(process.execPath, ['-e',
    `const C=require(${JSON.stringify(path.join(ROOT, 'server', 'claims.js'))});console.log(JSON.stringify(C.takeableBy({playerId:'x',tribeId:7},{kind:'personal',ownerPid:'y',state:'pref',heldBy:'guild:7'})))`],
    { env: Object.assign({}, process.env, { T785_VILLAGE_ONLY: on ? '1' : '0' }), encoding: 'utf8' }).trim().split('\n').pop()); } catch (e) { return { err: e.message.slice(0, 120) }; } };
  const tk1 = _tk(true), tk0 = _tk(false);
  ok(tk1.ok === false && /옛 보관 줄은 이제 없습니다/.test(tk1.why) && tk0.ok === true, 'Ⓣ11 [C14] 옛 길드 보관 줄 — 켬 = 우선권 없음 · 끔 = 같은 길드 우선권(종전)', JSON.stringify({ on: tk1, off: tk0 }));
  //   C18 — 이방인 받기 활동 셈("촌장이 N일째 안 온다")이 묻는 사람 = **촌장**(승계된 B) · 창설자 A 가 아니다
  phase = 'scan';
  await jget(`${ZON}/welcomedbg?scan=1`); await sleep(500);
  //   ★[T971] **묻는 것(GET)만 센다** — 활동 셈이 central 에 하는 일은 `getPlayer` = `GET /player/:id` 다. `POST /player/:id` 는 존의 **저장**(`updatePlayer` · 주기 저장 30초 · 행동 뒤 저장)인데
  //   이 창(보내고 1.5초)에 접속 중인 사람의 저장이 들어오면 '묻는 사람'으로 잘못 셌다(20판 중 1판 · `["kinB","kinC","kinA"]` · 나머지 19판 `["kinB","kinC"]`). 판정문 · 문턱 무변 — 셈에서 저장을 뺄 뿐이다.
  const sc = calls.filter((c) => c.phase === 'scan' && c.m === 'GET' && /^\/player\//.test(c.u)).map((c) => decodeURIComponent(c.u.split('?')[0].slice(8)));
  ok(sc.includes(String(B.playerId)) && !sc.includes(String(A.playerId)), 'Ⓣ12 [C18] 활동 셈이 묻는 사람 = 지금 촌장(B) · 창설자(A) 아님', JSON.stringify(sc));
  ok(tribeCalls('scan').length === 0, 'Ⓣ13 [C18] 그 셈도 central tribe·war 0', JSON.stringify(tribeCalls('scan').map((c) => c.u)));
  phase = 'on';

  const on1 = tribeCalls('on');
  ok(on1.length === 0, '⑨ ★★켬 판 내내 central `/tribe…` · `/war…` 호출 0', `${on1.length} — ${JSON.stringify(on1.slice(0, 5).map((c) => `${c.m} ${c.u}`))} · central 전체 ${calls.filter((c) => c.phase === 'on').length}건`);
  await close(A); await close(B); await close(Cc); await sleep(2000);
  await stop(zone);

  // ══ ③ 켬 — 재기동 같은 값 · 이행 0 · 다시 붙기 ═══════════════════════════════════════════
  phase = 'boot3';
  const _nipUp = bootNippon();   // 이웃 존(존 넘김 도착지)도 같이 띄운다 — 띄우는 그 틱에 듣는다
  ok(await bootZone(true), '⓪ 존 기동(켬 · 두 번째)');
  ok(await _nipUp, '⓪ 이웃 존 nippon 기동(켬 · 마을 0 — 존 넘김 도착지)');
  await sleep(3000);
  const K3 = await kinOf(VID);
  ok(!!K3 && K3.chief === B.playerId && K3.granaryOpen === true && K3.joinMode === 'open' && K3.intro === '새 물레 소리' && K3.t785,
    '⑩ ★재기동 — 마을 칸 같은 값(촌장 B · 곳간 문 칸 · 문 열림 · 소개)', JSON.stringify(K3 && { c: K3.chief, g: K3.granaryOpen, j: K3.joinMode, i: K3.intro }));
  if (npc) {
    const N3 = await kinOf(npc.vid);
    ok(!!K3 && K3.wars.includes(npc.vid) && !!N3 && N3.wars.includes(VID), '⑩a 재기동 — 전쟁도 그대로(두 마을 칸 양쪽)', JSON.stringify({ me: K3 && K3.wars, them: N3 && N3.wars }));
  }
  if (VIDC != null) {
    const KC3 = await kinOf(VIDC);
    ok(!!KC3 && KC3.chief === Cc.playerId && KC3.t785 && !KC3.pending, '⑩d 재기동 — 켬에서 선 마을도 같은 칸(촌장 C · 표지)', JSON.stringify(KC3 && { c: KC3.chief, t: KC3.t785, p: KC3.pending }));
  }
  const kd3 = await kin();
  ok(!!kd3 && kd3.migrate && (kd3.migrate.calls | 0) === 0, '⑩b ★다시 옮기지 않는다(표지 · 물은 수 0)', JSON.stringify(kd3 && kd3.migrate));
  ok(tribeCalls('boot3').length === 0, '⑩c 두 번째 켬 부팅(두 존) — central tribe·war 0', JSON.stringify(tribeCalls('boot3').map((c) => c.u)));
  phase = 'on2';
  const B2 = await connect('kinB');
  await sleep(1500);
  const bb3 = await bodyOf('kinB');
  ok(!!(bb3 && bb3.member && (bb3.member.vid | 0) === (VID | 0)), '⑪ ★재기동 뒤 다시 붙어도 B 는 그 마을 사람(몸이 소속을 싣는다)', JSON.stringify(bb3 && bb3.member));
  ok(await sayWait(B2, '/촌장', /촌장 — kinB/), '⑪a 촌장 칸이 사람을 안다', lastN(B2));
  ok(tribeCalls('on2').length === 0, '⑪b 다시 붙기 — central tribe·war 0', JSON.stringify(tribeCalls('on2').map((c) => c.u)));

  // ══ 존 넘김 — 촌장이 동쪽 끝을 넘어 nippon 으로 · 소속이 몸에 실려 간다 · 돌아와도 촌장 ═══════════════════
  phase = 'hand';
  const ZT = await jget(`${CEN}/zones`);
  const HW = (ZT && ZT.zones && ZT.zones.hanbando) ? ZT.zones.hanbando.zoneWidth : null;
  let hoff = null;
  for (let i = 0; i < 40 && !hoff && HW; i++) {
    B2.notices.length = 0;
    snd(B2, { type: 'teleport_debug', x: HW - 400, y: 2048 + ((3 + i) % 60) * 2048 });
    let tp = null;
    for (let k = 0; k < 30 && tp == null; k++) { await sleep(100); const t = B2.notices.find((s) => /텔레포트|물/.test(s)); if (t) tp = /텔레포트/.test(t); }
    if (!tp) continue;
    const walk = setInterval(() => snd(B2, { type: 'input', vx: 1, vy: 0 }), 33);
    for (let k = 0; k < 32 && !hoff; k++) { await sleep(500); hoff = B2.msgs.find((m) => m.type === 'handoff') || null; }
    clearInterval(walk);
  }
  ok(!!(hoff && hoff.token && hoff.targetZone === 'nippon'), '⑫ ★[상황] 촌장이 실제로 동쪽 경계를 넘었다(handoff → nippon — 아니면 아래는 아무것도 안 잰다)', hoff ? hoff.targetZone : `폭 ${HW}`);
  if (hoff && hoff.token) {
    await close(B2);
    const BN = await connect('kinB', hoff.token);
    await sleep(1200);
    const bn = await bodyOf('kinB', NIP);
    ok(!!(bn && bb3 && JSON.stringify(bn.member) === JSON.stringify(bb3.member)), '⑫a ★★소속이 몸에 실려 존을 넘었다(nippon 의 몸 `member` = 넘기 전 그대로)', JSON.stringify(bn && bn.member));
    ok(await sayWait(BN, '/촌장', /이 지역 마을 사람이 아닙니다/), '⑫b 남의 존에선 그 마을 문이 안 열린다(마을은 존 것 · 소속은 몸 것)', lastN(BN));
    await sleep(1500);   // 도착 존이 몸을 central 에 적을 시간
    await close(BN); await sleep(1500);
    const B3 = await connect('kinB');
    await sleep(1500);
    const bb4 = await bodyOf('kinB');
    ok(!!(bb4 && bb3 && JSON.stringify(bb4.member) === JSON.stringify(bb3.member)), '⑫c ★돌아와도 소속 그대로(nippon 이 적은 몸 → hanbando 접속)', JSON.stringify(bb4 && bb4.member));
    ok(await sayWait(B3, '/촌장', /촌장 — kinB/), '⑫d ★돌아온 촌장은 여전히 촌장(마을 칸이 사람을 안다)', lastN(B3));
    ok(await sayWait(B3, '/마을 초대제', /부름을 받아야/), '⑫e 돌아온 촌장이 촌장 문(가입 문)을 만진다', lastN(B3));
    await close(B3);
  } else await close(B2);
  ok(tribeCalls('hand').length === 0, '⑫f ★존 넘김 내내(두 존) central tribe·war 0', JSON.stringify(tribeCalls('hand').map((c) => c.u)));

  // ═══ ⑬ ★★[T787] 말 — 사람이 읽는 글에 "길드 · 길드장 · 길드원 · 리더"가 없다(길드 = 마을 · 호칭 "마을" · 우두머리 "촌장") ═══
  //   세는 법(소스 · 판정 0): 주석은 `code-only` 정본으로 덮고, 남은 줄 가운데 그 낱말이 있는 줄 = 문자열 · 틀 · 정규식 리터럴뿐이다(식별자에 한글 0).
  //   빼는 줄 — 운영 로그(`console.*` · 사람 화면이 아니다) · SQL 주석(템플릿 안 `--`) · 옛 명령 한 줄 안내("길드는 이제 마을이다") · 옛 명령 이름 `'/길드'` 를 알아보는 줄.
  {
    const codeOnly = require('./code-only.js');
    const WORD = /길드|리더/;
    const EXEMPT = (ln) => /console\.(log|warn|error)/.test(ln) || /^\s*--/.test(ln) || /길드는 이제 마을입니다/.test(ln) || /'\/길드'/.test(ln);   // 마지막 = 옛 명령 이름을 알아보는 자리(안내로 받는다)
    const scan = (src, isHtml) => {
      const body = isHtml ? String(src).replace(/<!--[\s\S]*?-->/g, (m) => m.replace(/[^\n]/g, ' ')).replace(/<script[\s\S]*?<\/script>/g, (m) => m.replace(/[^\n]/g, ' ')) : codeOnly(src);
      const hits = [];
      body.split('\n').forEach((ln, i) => { if (WORD.test(ln) && !EXEMPT(ln)) hits.push(`${i + 1}: ${ln.trim().slice(0, 90)}`); });
      return hits;
    };
    const files = [];
    for (const d of ['server', path.join('public', 'client')]) for (const f of fs.readdirSync(path.join(ROOT, d))) if (/\.js$/.test(f)) files.push(path.join(d, f));
    files.push(path.join('public', 'index.html'));
    const all = [];
    for (const f of files) { const h = scan(fs.readFileSync(path.join(ROOT, f), 'utf8'), /\.html$/.test(f)); for (const x of h) all.push(`${f}:${x}`); }
    ok(files.length > 20 && all.length === 0, `⑬ ★[T787] 사람이 읽는 글(서버 ${files.filter((f) => f.startsWith('server')).length} · 클라 ${files.length - files.filter((f) => f.startsWith('server')).length} 파일)에 "길드 · 리더" 0줄`, JSON.stringify(all.slice(0, 6)));
    //   자명 통과 금지 — 같은 세는 법이 미끼를 **문다**(주석 속 미끼는 안 문다)
    const bait = scan("// 길드 주석은 세지 않는다\nsend(ws, { type: 'notice', text: '길드 곳간이 섰다' });\n", false);
    ok(bait.length === 1 && /길드 곳간이 섰다/.test(bait[0]), '⑬a 자명 통과 금지 — 문자열 속 "길드"는 물고 주석 속은 안 문다', JSON.stringify(bait));
    //   ⑭ 클라 무리 패널 = 마을 패널(켬 · `uiCfg.villageOnly`) — 그 갈래는 central 길드 문 · `/tribes` · `/wars/active` 를 안 부른다
    const pan = fs.readFileSync(path.join(ROOT, 'public', 'client', '50-i-panel.js'), 'utf8');
    const i0 = pan.indexOf('if (uiCfg && uiCfg.villageOnly) {'), i1 = i0 >= 0 ? pan.indexOf('\n    if (myTribeId) {', i0) : -1;
    const vb = (i0 >= 0 && i1 > i0) ? pan.slice(i0, i1) : '';
    ok(!!vb && /return;\s*\}\s*$/.test(vb) && !/__centralCall|fetch\(|tribe_set/.test(vb) && /\/마을/.test(vb),
      '⑭ ★[T787] 켬 — 클라 무리 패널은 **마을 패널**(채팅 문 안내 · `/마을` 단추) · central 길드 문 · 명부 · 전쟁 목록 0', vb ? `${vb.length}자` : '갈래 없음');
    const zsrc = fs.readFileSync(path.join(ROOT, 'server', 'zone.js'), 'utf8');
    ok(/\.\.\.\(VillageKin\.ON \? \{ villageOnly: true \} : \{\}\)/.test(zsrc), '⑭a 서버가 켬일 때만 `uiCfg.villageOnly` 를 싣는다(끔 = 칸 없음 = 옛 패널)');
  }

  // 회부용 — 켬 판에서도 존이 central 에 묻는 문(마을 일 밖 · 이름만 · id 는 :n 으로 접는다)
  const doors = (ph) => [...new Set(calls.filter((c) => ph.includes(c.phase)).map((c) => `${c.m} ${String(c.u).split('?')[0].replace(/\/\d+(?=\/|$)/g, '/:n').replace(/\/kin[A-Z](?=\/|$)/g, '/:이름')}`))].sort();
  console.log(`\n  central 요청(판별) — ${['boot1', 'off', 'boot2', 'on', 'boot3', 'on2', 'hand'].map((ph) => `${ph} ${calls.filter((c) => c.phase === ph).length}(tribe·war ${tribeCalls(ph).length})`).join(' · ')}`);
  console.log(`  켬 판에서 존이 central 에 묻는 문(마을 일 밖) — ${JSON.stringify(doors(['boot2', 'on', 'boot3', 'on2', 'hand']))}`);
  console.log(`\n=== 결과: ${pass} 통과 · ${fail} 실패 ===`);
  try { proxy.close(); } catch (e) {}
  for (const p of procs) await stop(p);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('하네스 예외:', e); process.exit(2); });
