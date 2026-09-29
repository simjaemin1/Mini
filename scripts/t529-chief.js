#!/usr/bin/env node
// === scripts/t529-chief.js — 촌장이 온다: 도착 → 촌장 도착 시간표 [T529 ② · 2026-09-29] =======================
//
// ★묻는 것: 새 사람이 도착하면(쉼터 안 · T520) 촌장 몸이 **걸어와** 인사하는가 — 50곳 전수 · 낮/밤.
//   ⓐ 도착에서 인사(촌장 몸 260px 안)까지 몇 분 · ⓑ 곁(44px)까지 몇 분 · ⓒ 인사 뜸 n/50 · ⓓ 그 인사가 무엇을 말하나(빈 판이면?)
// ★판정은 한 줄도 여기서 짓지 않는다:
//   도착 자리 = 존이 실제로 앉힌 자리(`welcome.self`) · 인사 = 서버가 보낸 `onboarding_quest{kind:'greet'}` 그 자체(시각·`by`·줄) ·
//   촌장 걸음 = 존 `/lifedbg` 의 `t529` 줄(서버 시각 — 줄 선 때 `t0` · 걷기 시작 `wAt` · 인사 `gAt` · 곁 `bAt` · 끝 `end`).
//   손님은 **안 움직인다**(도착 자리에 선 채) — 걸어오는 건 촌장이다. 클라가 없으니 거리 문 인사(`onboarding_greet`)도 안 간다.
//   ⇒ 인사가 왔다면 그건 촌장 몸이 보낸 것이다(`by` 로 한 번 더 확인).
// ★낮/밤 = 세계 시계(`zone-config worldPhase`) 그대로 — `--phase day` 는 새벽 뒤(0.08), `--phase night` 는 해질녘 뒤(0.72)에 도착하게 기다린다.
// ★제품 코드 0 · 러너 밖 · 도구.
// 실행: node scripts/t529-chief.js [--phase day|night] [--cap-min 20] [--cport 3713 --zport 3723] [--env K=V …] [--out f.json]
'use strict';
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const FB = require('./fixture-boot');
const ZC = require('../server/zone-config');
const ROOT = path.join(__dirname, '..');
const argv = process.argv.slice(2);
const val = (f, d) => { const i = argv.indexOf(f); return i >= 0 ? argv[i + 1] : d; };
const PHASE = val('--phase', 'day');
const CAP_MIN = +val('--cap-min', '20');
const CPORT = +val('--cport', '3713'), ZPORT = +val('--zport', '3723');
const OUT = val('--out', `/tmp/t529-${PHASE}.json`);
const CDB = `/tmp/t529-central-${process.pid}.db`, ZDB = `/tmp/t529-zone-${process.pid}.db`;
// 기본 손잡이 = 이 카드의 켬 판(쉼터 안 도착 T520 + 촌장 걸음 T529). `--env K=V` 로 덮는다(예: `--env T529_CHIEF_WALKS=0` = 대조).
const ZENV = { T520_ARRIVE_INDOOR: '1', T529_CHIEF_WALKS: '1' };
argv.forEach((a, i) => { if (a === '--env' && argv[i + 1]) { const [k, ...v] = argv[i + 1].split('='); ZENV[k] = v.join('='); } });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const say = (...a) => console.log(...a);
const procs = [];
function boot(file, env) {
  const p = spawn(process.execPath, [path.join(ROOT, 'server', file)], { cwd: ROOT, env: Object.assign({}, process.env, env), stdio: ['ignore', 'pipe', 'pipe'] });
  p.stdout.on('data', () => {}); p.stderr.on('data', () => {});
  procs.push(p); return p;
}
process.on('exit', () => { for (const p of procs) { try { p.kill('SIGKILL'); } catch (e) {} } });
const jget = async (u) => { try { return await (await fetch(u)).json(); } catch (e) { return null; } };
const q = (xs, p) => { if (!xs.length) return null; const s = [...xs].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor(p * (s.length - 1) + 0.5))]; };
const mins = (ms) => (ms == null ? null : +(ms / 60000).toFixed(2));

(async () => {
  const c = boot('central.js', { PORT: String(CPORT), DB_PATH: CDB, PUBLIC_HOST: 'localhost', ENABLED_ZONES: 'hanbando' });
  const cu = FB.waitUp(c, /central server up on/, { name: 'central' });
  const z = boot('zone.js', { PORT: String(ZPORT), ZONE_ID: 'hanbando', DB_PATH: ZDB, CENTRAL_URL: `http://localhost:${CPORT}`,
    ENABLE_BANDITS: '0', ENABLE_WILDLIFE: '0', ...ZENV });
  const zu = FB.waitUp(z, /zone server up on/, { name: 'zone', capMs: 400000 });
  if (!(await cu).ok || !(await zu).ok) { say('기동 실패'); process.exit(1); }
  const bootAt = Date.now();
  let rows = [], prev = -1;
  for (let i = 0; i < 90; i++) {
    const j = await jget(`http://localhost:${ZPORT}/startinfo`);
    rows = ((j && j.villages) || []).filter((v) => v.arrive && Number.isFinite(v.arrive.x));
    if (rows.length && rows.length === prev) break;
    prev = rows.length; await sleep(4000);
  }
  // 쉼터 — 백필을 **지금** 돌린다(존 관측창의 그 문 `scan=1` · 60초 간격 백필과 같은 함수)
  for (let k = 0; k < 3; k++) { await jget(`http://localhost:${ZPORT}/shelterdbg?scan=1`); await sleep(1500); }
  const sd = await jget(`http://localhost:${ZPORT}/shelterdbg`);
  say(`도착 자리 ${rows.length}곳 · 쉼터 ${sd ? sd.withShelter : '?'}곳 · 손잡이 ${JSON.stringify(ZENV)}`);
  // 낮밤 맞추기 — 세계 시계 정본
  const W = ZC.WORLD, target = PHASE === 'night' ? W.dayPhaseRatio + 0.02 : 0.08;
  { const ph = ZC.worldPhase(Date.now()); let wait = ((target - ph + 1) % 1) * W.dayLengthMs; if (wait > W.dayLengthMs - 1000) wait = 0;
    if (PHASE === 'day' && ph >= 0.08 && ph <= 0.45) wait = 0;   // 이미 한낮 앞쪽이면 기다리지 않는다(촌장이 깨어 있고 해가 남았다)
    say(`낮밤 맞추기 — phase ${ph.toFixed(3)} → ${target.toFixed(3)} · ${(wait / 60000).toFixed(1)}분`); await sleep(wait); }
  const WS = require('ws');
  const G = new Map();   // vid → 손님 기록
  const socks = [];
  // 다섯씩 들인다 — 50명을 한 번에 들이면 입장이 20초를 넘겨 몇이 떨어진다(1차 실측 43/50).
  const join = (v) => new Promise((res) => {
    const qs = new URLSearchParams({ name: `t529${v.vid}`, color: '#777777', start_vid: String(v.vid) });
    const ws = new WS(`ws://localhost:${ZPORT}/?${qs}`);
    const g = { vid: v.vid, name: v.name, kind: v.arrive.kind, joinAt: Date.now(), x: null, y: null, pid: null, greet: null, legacy: null };
    G.set(v.vid, g); socks.push(ws);
    const to = setTimeout(() => res(), 20000);
    ws.on('message', (raw) => { let m; try { m = JSON.parse(String(raw)); } catch (e) { return; }
      if (m.type === 'welcome' && m.self) { g.x = m.self.x; g.y = m.self.y; g.pid = m.pid; g.welAt = Date.now(); clearTimeout(to); res(); }
      if (m.type === 'onboarding_quest' && m.kind === 'greet') {
        const rec = { at: Date.now(), by: m.by != null ? m.by : null, lines: m.lines || [], quest: m.quest ? { item: m.quest.item, remain: m.quest.remain } : null };
        if (g.wantLegacy && !g.legacy) g.legacy = rec; else if (!g.greet) g.greet = rec;
      } });
    ws.on('error', () => { clearTimeout(to); res(); });
  });
  // 손님은 서 있기만 한다 — 그래도 30초마다 존이 "좀비"를 친다(`STALE_WS_MS`) ⇒ 클라처럼 핑을 보낸다(1차 실측: 25명이 줄에서 'gone')
  const pinger = setInterval(() => { for (const ws of socks) { try { if (ws.readyState === 1) ws.send(JSON.stringify({ type: 'ping', t: Date.now() })); } catch (e) {} } }, 8000);
  for (let i = 0; i < rows.length; i += 5) await Promise.all(rows.slice(i, i + 5).map(join));
  const phase0 = ZC.worldPhase(Date.now());
  say(`손님 ${[...G.values()].filter((g) => g.pid != null).length}명 입장 · phase ${phase0.toFixed(3)} · 상한 ${CAP_MIN}분`);
  // 관측 — `/lifedbg` 의 촌장 줄
  const t0 = Date.now();
  let dbg = null;
  const TR = {};
  const logsOf = (d) => { const out = new Map(); for (const v of ((d && d.villages) || [])) if (v.t529) for (const e of v.t529) out.set(e.pid, Object.assign({ vid: v.id != null ? v.id : null, vname: v.name }, e)); return out; };
  while (Date.now() - t0 < CAP_MIN * 60000) {
    await sleep(+val('--poll-ms', '10000'));
    dbg = await jget(`http://localhost:${ZPORT}/lifedbg`);
    const L = logsOf(dbg);
    for (const e of L.values()) if (e.now) (TR[e.pid] || (TR[e.pid] = [])).push(Object.assign({ t: +((Date.now() - t0) / 1000).toFixed(0), ph: +ZC.worldPhase(Date.now()).toFixed(3) }, e.now));   // 열린 줄의 촌장 자취(`/lifedbg` t529.now)
    const open = [...G.values()].filter((g) => { const e = L.get(g.pid); return e && !e.end; }).length;
    const got = [...G.values()].filter((g) => g.greet).length;
    say(`  +${((Date.now() - t0) / 60000).toFixed(1)}분 · phase ${ZC.worldPhase(Date.now()).toFixed(3)} · 줄 ${L.size} · 아직 ${open} · 인사 ${got}`);
    if (L.size && !open) break;
  }
  const L = logsOf(dbg);
  // 촌장이 없던 곳(줄에 못 선 곳)은 종전 인사 문으로 물어 **무엇을 말했을지**를 적는다(③ 빈 판 표 · 거리 문 그대로 — 서버가 답한다)
  for (const g of G.values()) if (!g.greet && g.pid != null) { g.wantLegacy = true; }
  for (const [i, g] of [...G.values()].entries()) if (g.wantLegacy) { try { socks[i].send(JSON.stringify({ type: 'onboarding_greet', vid: g.vid })); } catch (e) {} }
  await sleep(3000);
  clearInterval(pinger);
  for (const ws of socks) { try { ws.close(); } catch (e) {} }
  for (const p of procs) { try { p.kill('SIGKILL'); } catch (e) {} }
  // ── 표 ──
  const table = [...G.values()].map((g) => {
    const e = L.get(g.pid) || null;
    return { vid: g.vid, name: g.name, kind: g.kind, pid: g.pid, chief: e ? e.chief : null, d0: e ? e.d0 : null,
      walkMin: e && e.wAt ? mins(e.wAt - e.t0) : null, greetMin: e && e.gAt ? mins(e.gAt - e.t0) : null, greetD: e ? e.gD : null,
      besideMin: e && e.bAt ? mins(e.bAt - e.t0) : null, end: e ? (e.end || 'open') : 'no-chief',
      greetBy: g.greet ? g.greet.by : null, byIsChief: !!(g.greet && e && g.greet.by === e.chief),
      lines: (g.greet || g.legacy || {}).lines || [], quest: (g.greet || g.legacy || {}).quest || null, via: g.greet ? 'chief' : (g.legacy ? 'legacy' : null) };
  });
  const asked = table.filter((t) => t.end !== 'no-chief');
  const gm = asked.map((t) => t.greetMin).filter((x) => x != null), bm = asked.map((t) => t.besideMin).filter((x) => x != null);
  const empty = table.filter((t) => t.lines.length && !t.quest);
  const sum = { phase: PHASE, phaseAtJoin: +phase0.toFixed(3), n: table.length, asked: asked.length, noChief: table.length - asked.length,
    greeted: table.filter((t) => t.via === 'chief').length, byIsChief: table.filter((t) => t.byIsChief).length,
    greetP50: q(gm, 0.5), greetP90: q(gm, 0.9), greetMax: gm.length ? Math.max(...gm) : null,
    besideP50: q(bm, 0.5), besideP90: q(bm, 0.9), besideMax: bm.length ? Math.max(...bm) : null,
    ends: asked.reduce((o, t) => { o[t.end] = (o[t.end] || 0) + 1; return o; }, {}),
    d0P50: q(asked.map((t) => t.d0).filter((x) => x != null), 0.5), d0Max: Math.max(0, ...asked.map((t) => t.d0 || 0)),
    emptyBoard: empty.length, emptyLines: [...new Set(empty.map((t) => t.lines.slice(1).join(' / ')))] };
  fs.writeFileSync(OUT, JSON.stringify({ at: new Date().toISOString(), bootAt, env: ZENV, sum, table, trace: TR }, null, 1));
  say(JSON.stringify(sum));
  for (const f of [CDB, ZDB, CDB + '-wal', ZDB + '-wal', CDB + '-shm', ZDB + '-shm']) { try { fs.unlinkSync(f); } catch (e) {} }
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
