#!/usr/bin/env node
// (@regress 없음 — 러너 밖 · T1324 판 자 · 제품 무변)
// =============================================================================
// scripts/t1324-vclock-beast.js — **두 존 가상 시계 판**(T1320 발맞춤) + 짐승 넘기 판 꾸밈(T1321 자의 재료) — T1321 손잡이 켬 기본(T1324) 판
//
// ★왜 [T1324 할 일 1] T1321 손잡이(`T1321_XZ_KEEP` · `T1321_XZ_BEAST`)를 켬 기본으로 바꾼 판을 두 존 가상 시계(T1320 자)로 잰다 —
//   넘은 짐승 · 두 존 합(존 몹) 보존 · 캐러밴 넘음 · 둘 0 · 사라짐 0. T1320 러너(`t1320-xz-vclock.js`)는 몸 사건 줄(T1292 훅)과 사람 · 짐승 판 꾸밈이 없어
//   그대로는 짐승이 안 걷는다(존 몹은 청크가 켜진 자리에서만 걷는다 — T1321 회부 12). ⇒ 이 러너는
//   ⓐ 존 둘을 T745 가상 시계 + T1320 발맞춤(`t1320-lockstep.js`)으로 띄우고(가로대 셈 · 'go' 는 T1320 러너 글자 그대로 옮겼다 — 아래 `balanced` · `tryGo`)
//   ⓑ 존 훅 = T1292 훅(`t1292-xzone-live.js` — 하루 줄 · 캐러밴 몸 사건 줄 · 정본 셈 `fixture-xz-bodylog`)
//   ⓒ 판 꾸밈 = T1321 자(`t1321-beast-run.js run`)와 같은 재료 — 넘는 위도(지형 정본 길목) · 관측 소켓 둘 · 봇 한 사람 + 길든 말 둘 · 야생(사슴 · 멧돼지 ·
//      아이벡스) · 호랑이 하나(닛폰 '없음') · 봇은 마을 날 2 마다 이음매를 넘나든다(사람 넘기 규약 — 넘기 메시지의 토큰으로 받는 존에 붙는다).
//   ⓓ `/perf` 를 1초(벽시계)마다 두 존에서 읽어 짐승 문 줄 · 몹 수 표본을 `beast_<표지>.jsonl` 에 — T1321 자와 같은 꼴(분석 = 그 자의 `analyze`).
//      ★표본 · 꾸밈 줄의 `t` 는 **존 가상 시각**(`/perf` 의 `now` — T745 가 `Date.now` 를 가상 V 로 바꿨다) — 짐승 문 줄 `at` 과 같은 시계라야 두 존 합 창이 맞는다(`wall` = 벽시계).
//   손잡이: T1321 둘은 **안 준다**(켬 기본을 잰다) — 끔 판은 `--env T1321_XZ_BEAST=0,T1321_XZ_KEEP=0`.
//   팔 = T1292 판 'on'(`T525_CROSS_ZONE` · `T952_XZ_STAY` · `T622_ZONE_FAUNA` · `T1139_XZ_LAZY`) + `E2E_GIVE`(판 꾸밈 문).
//
//   run <outdir> <표지> <씨> [날=30] [하루ms=3000] [--q 500] [--env K=V,…] [--envz <존>:K=V,…] [--nobeast]
//   분석: 짐승 `node scripts/t1321-beast-run.js analyze <outdir> <표지>` · 캐러밴 · 몸 보존 `node scripts/t1292-xzone-live.js analyze <outdir> <표지>`
//   ⚠존 포트가 고정이라 두 판을 같이 못 돈다(T1320 과 같다) · e2e 와도 같이 못 돈다.
// =============================================================================
'use strict';
if (require.main === module) require('./lib-port').hold(3010, 3020, 3021);   // [T1288] 제품 고정 포트(존 설정 · central 기본) — 띄우는 동안 이 기계에서 혼자 쥔다(나란히 돌면 줄 선다 · `lib-port.hold`)
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const ROOT = path.join(__dirname, '..');
const [MODE, ...A] = process.argv.slice(2);
const opt = (k, d) => { const i = A.indexOf(k); return i >= 0 ? A[i + 1] : d; };
const pos = A.filter((x, i) => !x.startsWith('--') && !(i > 0 && A[i - 1].startsWith('--') && A[i - 1] !== '--nobeast'));
const say = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const rmdb = (f) => { for (const s of ['', '-wal', '-shm']) { try { fs.unlinkSync(f + s); } catch (e) {} } };

if (MODE !== 'run') { console.error('쓰는 법: run <outdir> <표지> <씨> [날=30] [하루ms=3000] [--q 500] [--env K=V,…] [--nobeast]'); process.exit(2); }

(async () => {
  const [OUTD, TAG, SEEDS, DAYSS = '30', DMS = '3000'] = pos;
  const SEED = parseInt(SEEDS, 10), DAYS = parseInt(DAYSS, 10), DAY_MS = parseInt(DMS, 10), Q = parseInt(opt('--q', '500'), 10);
  const NOBEAST = A.includes('--nobeast');
  if (!OUTD || !TAG || !(SEED > 0) || !(DAYS > 0) || !(DAY_MS > 0)) { console.error('인자'); process.exit(2); }
  const EXTRA = {}; for (const kv of String(opt('--env', '')).split(',').filter(Boolean)) { const i = kv.indexOf('='); EXTRA[kv.slice(0, i)] = kv.slice(i + 1); }
  //   `--envz <존>:K=V,…` — 한 존에만(T1324 할 일 2 — 한쪽만 새 글자인 판: 그 존 `T1321_XZ_BEAST=0` = 종전 존처럼 짐승 `kind` 를 모른다(400))
  const EXTZ = {}; { const v = opt('--envz', ''); if (v) { const j = v.indexOf(':'); const z = v.slice(0, j); EXTZ[z] = {}; for (const kv of v.slice(j + 1).split(',').filter(Boolean)) { const i = kv.indexOf('='); EXTZ[z][kv.slice(0, i)] = kv.slice(i + 1); } } }
  fs.mkdirSync(OUTD, { recursive: true });
  const { ZONES, HANDOFF_COMMIT } = require(path.join(ROOT, 'server', 'zone-config'));
  const ZS = ['hanbando', 'nippon'], W = ZONES.hanbando.zoneWidth, CP = 3010;
  const PORTS = { [CP]: 'central' }; for (const z of Object.keys(ZONES)) if (ZONES[z] && ZONES[z].port) PORTS[ZONES[z].port] = z;
  const cdb = path.join(OUTD, `c_${TAG}.db`); rmdb(cdb);
  const c = spawn(process.execPath, [path.join(ROOT, 'server', 'central.js')], { cwd: ROOT, stdio: 'ignore',
    env: Object.assign({}, process.env, { PORT: String(CP), DB_PATH: cdb, PUBLIC_HOST: 'localhost', ENABLED_ZONES: ZS.join(',') }) });
  const Z = {};
  const pre = [path.join(__dirname, 't745-vclock.js'), path.join(__dirname, 't1320-lockstep.js'), path.join(__dirname, 't1292-xzone-live.js')];
  for (const z of ZS) {
    const o = Z[z] = { db: path.join(OUTD, `z_${TAG}_${z}.db`), rows: path.join(OUTD, `rows_${TAG}_${z}.jsonl`), evf: path.join(OUTD, `ev_${TAG}_${z}.jsonl`), log: path.join(OUTD, `z_${TAG}_${z}.log`), st: null, started: false, at: false };
    rmdb(o.db); for (const f of [o.rows, o.evf]) { try { fs.unlinkSync(f); } catch (e) {} }
    const env = Object.assign({}, process.env, { PORT: String(ZONES[z].port), ZONE_ID: z, CENTRAL_URL: `http://localhost:${CP}`, ENABLED_ZONES: ZS.join(','),
      DB_PATH: o.db, ENABLE_VILLAGES: '1', VILLAGE_DAY_MS: String(DAY_MS), T1292_HOOK: 'zone', T1292_SEED: String(SEED), T1292_ROWS: o.rows, T1292_EV: o.evf,
      T745_VCLOCK: '1', T577_SEED: String(SEED), T745_LOCKSTEP: '1', T1320_PORTS: JSON.stringify(PORTS), T662_GEO_CACHE_DIR: path.join(OUTD, `geo_${TAG}`),
      T525_CROSS_ZONE: '1', T952_XZ_STAY: '1', T622_ZONE_FAUNA: '1', T1139_XZ_LAZY: '1', E2E_GIVE: '1' }, EXTRA, EXTZ[z] || {});
    //   ★`T1139_XZ_LAZY` 켬(e2e · T1292 판과 같다 — 한 벌은 2km 안 쌍만 · 1분) — 늦게 파는 일꾼은 발맞춤 일꾼 셈 밖(`t1320-lockstep.js` ⓒ T1324 고침:
    //     그 일꾼은 `postMessage` 없이 포트 · 공유 버퍼로 동기 답만 해 셈이 영영 안 줄어 가로대가 0.5초에서 멎었다) · 걸음표 자리는 판마다 새로(`geo_<표지>` — 묵은 자물쇠 0).
    for (const k of ['T1321_XZ_BEAST', 'T1321_XZ_KEEP']) if (!(k in EXTRA) && !(EXTZ[z] && k in EXTZ[z])) delete env[k];   // ★켬 기본을 잰다(물려받은 손잡이 0)
    const logf = fs.openSync(o.log, 'w');
    o.p = spawn(process.execPath, pre.flatMap((f) => ['-r', f]).concat([path.join(ROOT, 'server', 'zone.js')]), { cwd: ROOT, stdio: ['ignore', logf, logf, 'ipc'], env });
    o.p.on('message', (m) => { if (!m || !m.zone) return; const q = Z[m.zone]; if (m.t === 'start') q.started = true; q.st = m; q.at = (m.t === 'at' || (m.t === 'upd' && q.at)); tryGo(); });
  }
  // ── 발맞춤(T1320 러너 `t1320-xz-vclock.js run` 글자 그대로) ───────────────────────
  let H = null, bars = 0;
  function balanced() {
    for (const a of ZS) { const ca = Z[a].st.cnt;
      if ((ca.reqSent.central || 0) !== (ca.resRecv.central || 0)) return false;
      for (const b of ZS) { if (a === b) continue; const cb = Z[b].st.cnt;
        if ((ca.reqSent[b] || 0) !== (cb.reqRecv[a] || 0)) return false;
        if ((cb.resSent[a] || 0) !== (ca.resRecv[b] || 0)) return false; } }
    return true;
  }
  function tryGo() {
    if (!ZS.every((z) => Z[z].started && Z[z].st && Z[z].at)) return;
    if (!balanced()) return;
    H = (H == null ? Math.max(...ZS.map((z) => Z[z].st.V)) : H) + Q; bars++;
    for (const z of ZS) { Z[z].at = false; try { Z[z].p.send({ t: 'go', H }); } catch (e) {} }
  }
  const t0 = Date.now();
  const STF = path.join(OUTD, `status_${TAG}.json`);   // 가로대 상태(멈춤을 볼 자리 — T1320 러너와 같은 칸)
  const stIv = setInterval(() => { try { fs.writeFileSync(STF, JSON.stringify({ wallS: Math.round((Date.now() - t0) / 1000), bars, H, zones: Object.fromEntries(ZS.map((z) => [z, { started: Z[z].started, at: Z[z].at, st: Z[z].st }])) }, null, 1)); } catch (e) {} }, 2000);
  const meta = { tag: TAG, seed: SEED, DAYS, DAY_MS, Q, vclock: true, env: EXTRA, envz: EXTZ, start: new Date().toISOString(), host: { cpus: require('os').cpus().length, node: process.version }, restart: null };
  const saveMeta = () => { try { fs.writeFileSync(path.join(OUTD, `meta_${TAG}.json`), JSON.stringify(meta, null, 1)); } catch (e) {} };
  saveMeta();
  const lastDay = (f) => { try { const L = fs.readFileSync(f, 'utf8').trim().split('\n'); return L.length && L[0] ? JSON.parse(L[L.length - 1]).day : -1; } catch (e) { return -1; } };
  const upOf = (z) => { try { return /zone server up on/.test(fs.readFileSync(Z[z].log, 'utf8')); } catch (e) { return false; } };
  const killAll = async () => { for (const z of ZS) { try { Z[z].p.kill('SIGINT'); } catch (e) {} } await sleep(3000); for (const z of ZS) { try { Z[z].p.kill('SIGKILL'); } catch (e) {} } try { c.kill('SIGKILL'); } catch (e) {} await sleep(300); };
  process.on('SIGTERM', async () => { await killAll(); process.exit(3); });
  const LIMIT = parseInt(opt('--limit', '7200'), 10) * 1000;
  while (!ZS.every(upOf) && Date.now() - t0 < 20 * 60000) { await sleep(1000); if (ZS.some((z) => Z[z].p.exitCode != null)) break; }
  if (!ZS.every(upOf)) { meta.err = 'boot'; saveMeta(); say(`[${TAG}] ⚠존 기동 실패`); await killAll(); process.exit(1); }
  meta.bootS = Math.round((Date.now() - t0) / 1000); say(`[${TAG}] 두 존 기동 ${meta.bootS}s`);
  //   ★걸음표 일꾼(한 벌)이 도는 동안은 가상 시계가 멎는다(발맞춤 `outW`) — 그 사이 봇 걸음(벽시계 기다림)은 헛돈다 ⇒ 가로대가 몇 번 돈 뒤(걸음표가 선 뒤) 꾸민다
  { const tW = Date.now(); while (bars < 4 && Date.now() - tW < 15 * 60000) { await sleep(500); if (ZS.some((z) => Z[z].p.exitCode != null)) break; } meta.geoWaitS = Math.round((Date.now() - tW) / 1000); }

  // ── 판 꾸밈 · 표본(T1321 자와 같은 재료 · 같은 줄 꼴) ─────────────────────────────
  const BF = path.join(OUTD, `beast_${TAG}.jsonl`); try { fs.unlinkSync(BF); } catch (e) {}
  const out = (o) => { try { fs.appendFileSync(BF, JSON.stringify(Object.assign({ t: Date.now() }, o)) + '\n'); } catch (e) {} };
  const perf = async (z) => { try { return await (await fetch(`http://localhost:${ZONES[z].port}/perf`, { signal: AbortSignal.timeout(60000) })).json(); } catch (e) { return null; } };
  const WebSocket = require('ws');
  const socks = [];
  const open = (url, onMsg) => new Promise((res) => {
    const ws = new WebSocket(url); const o = { ws, welcome: null, url };
    ws.on('message', (raw) => { let m; try { m = JSON.parse(raw); } catch (e) { return; } if (m.type === 'welcome' && !o.welcome) { o.welcome = m; res(o); } if (onMsg) onMsg(m, o); });
    ws.on('error', () => res(o)); ws.on('close', () => { o.closed = true; res(o); });
    socks.push(o); setTimeout(() => res(o), 60000);
  });
  const pinger = setInterval(() => { for (const o of socks) if (!o.closed && o.ws.readyState === 1) { try { o.ws.send(JSON.stringify({ type: 'ping', t: Date.now() })); } catch (e) {} } }, 2000);
  const wsUrl = (z) => `ws://localhost:${ZONES[z].port}`;
  const send = (o, m) => { try { o.ws.send(JSON.stringify(m)); } catch (e) {} };
  const bot = { zone: 'hanbando', o: null, handoff: null, pid: null, name: 't1324bot', crossN: 0, fail: 0 };
  const onBot = (m) => { if (m.type === 'handoff') bot.handoff = m; };
  let Y = null;
  const tele = async (x, y) => {
    let r = null; const h = (raw) => { let m; try { m = JSON.parse(raw); } catch (e) { return; } if (m.type === 'notice' && /텔레포트/.test(String(m.text))) r = /🌀|→/.test(String(m.text)) && !/할 수 없/.test(String(m.text)); };
    bot.o.ws.on('message', h); send(bot.o, { type: 'teleport_debug', x, y });
    for (let i = 0; i < 100 && r == null; i++) await sleep(100);
    bot.o.ws.off('message', h); return !!r;
  };
  const walkCross = async (dirX, msMax) => {   // 가상 시계 판 — 걸음은 가상 틱이라 벽시계 상한을 넉넉히
    bot.handoff = null; const t = Date.now();
    const iv = setInterval(() => send(bot.o, { type: 'input', vx: dirX, vy: 0 }), 33);
    while (!bot.handoff && Date.now() - t < msMax) await sleep(100);
    clearInterval(iv); send(bot.o, { type: 'input', vx: 0, vy: 0 });
    if (!bot.handoff) return false;
    const to = bot.handoff.targetZone, tok = bot.handoff.token;
    const nb = await open(`${wsUrl(to)}/?handoff_token=${encodeURIComponent(tok)}`, onBot);
    if (!nb.welcome) return false;
    bot.o = nb; bot.zone = to; bot.crossN++; bot.at = nb.welcome && nb.welcome.self ? { x: nb.welcome.self.x, y: nb.welcome.self.y } : null;
    out({ ev: 'botCross', to, n: bot.crossN, at: bot.at, day: lastDay(Z.hanbando.rows) });
    return true;
  };
  let setupOk = false;
  if (!NOBEAST) {
    bot.o = await open(`${wsUrl('hanbando')}/?username=&name=${bot.name}&color=%23ffffff`, onBot);
    bot.pid = bot.o.welcome && bot.o.welcome.playerId;
    say(`[${TAG}] 봇 ${bot.pid}`);
    const T = require(path.join(ROOT, 'server/terrain'));
    const free = (z, x, y) => { const px = Math.floor(x / 32) * 32 + 16, py = Math.floor(y / 32) * 32 + 16; return !(T.isRockCellLocal(z, px, py) || T.isWaterCellLocal(z, px, py)); };
    const lanes = []; let cur = null;
    for (let y = 16; y < ZONES.hanbando.zoneHeight; y += 32) {
      let okL = true; for (let x = W - 640; x < W + 640 && okL; x += 32) okL = x < W ? free('hanbando', x, y) : free('nippon', x - W, y);
      if (okL) { if (cur && cur.y1 === y - 32) cur.y1 = y; else { cur = { y0: y, y1: y }; lanes.push(cur); } }
    }
    const pick = lanes.find((r) => r.y0 <= 17840 && r.y1 >= 17840) || lanes.slice().sort((a, b) => (b.y1 - b.y0) - (a.y1 - a.y0))[0];
    const cands = (pick ? [Math.round((pick.y0 + pick.y1) / 2)] : []).concat(lanes.map((r) => Math.round((r.y0 + r.y1) / 2)));
    for (const y of cands.slice(0, 6)) {
      if (Y != null) break;
      if (!await tele(W - 120, y)) continue;
      if (await walkCross(1, 240000)) { Y = bot.at ? Math.round(bot.at.y) : y; break; }
    }
    if (Y == null) { meta.err = 'noY'; say(`[${TAG}] ⚠넘을 위도 못 찾음 — 짐승 꾸밈 없이 판만 돈다`); }
    else {
      meta.Y = Y; say(`[${TAG}] 넘을 위도 y=${Y} — 봇은 ${bot.zone}`);
      await tele(120, Y); await walkCross(-1, 240000);
      for (const [z, x] of [['hanbando', W - 300], ['nippon', 300]]) await open(`${wsUrl(z)}/?observer=1&vx=${x}&vy=${Y}`);
      await tele(W - 700, Y);
      send(bot.o, { type: '__e2e_beast', kind: 'horse', n: 2, r: 40, tame: true });
      send(bot.o, { type: '__e2e_beast', kind: 'deer', n: 10, r: 160, x: W - 300, y: Y });
      send(bot.o, { type: '__e2e_beast', kind: 'wild_boar', n: 4, r: 90, x: W - 200, y: Y + 120 });
      send(bot.o, { type: '__e2e_beast', kind: 'tiger', n: 1, r: 0, x: W - 150, y: Y - 60, vx: 60, vy: 0, ms: 12000 });
      await sleep(500);
      await tele(W - 120, Y); await walkCross(1, 240000);
      send(bot.o, { type: '__e2e_beast', kind: 'ibex', n: 10, r: 160, x: 300, y: Y });
      send(bot.o, { type: '__e2e_beast', kind: 'deer', n: 4, r: 90, x: 200, y: Y - 120 });
      { const P = await perf('hanbando'); out({ ev: 'setup', Y, bot: bot.pid, t: P && P.now ? P.now : Date.now(), wall: Date.now() }); }   // ★t = 존 가상 시각(짐승 문 줄 `at` 과 같은 시계 — 분석의 두 존 합 창)
      setupOk = true;
      say(`[${TAG}] 판 꾸밈 끝 — 봇 ${bot.zone} · 넘음 ${bot.crossN}`);
    }
  }
  saveMeta();
  // ── 판 ──────────────────────────────────────────────────────────────────────
  const seenTr = { hanbando: new Set(), nippon: new Set() };
  let lastCrossDay = lastDay(Z.hanbando.rows), dead = [], crossing = null;
  for (;;) {
    await sleep(250);   // 가상 시계 판은 날이 빨리 간다 — 표본을 촘촘히(봇 걸음은 따로 돈다 · 아래)
    dead = ZS.filter((z) => Z[z].p.exitCode != null);
    const dd = Object.fromEntries(ZS.map((z) => [z, lastDay(Z[z].rows)]));
    if (dead.length || ZS.every((z) => dd[z] >= DAYS) || Date.now() - t0 > LIMIT) break;
    if (!setupOk) continue;
    for (const z of ZS) {
      const P = await perf(z); if (!P || !P.t1321) continue;
      const Tq = P.t1321;
      for (const e of (Tq.trace || [])) { const k = `0|${e.k}|${e.key}|${e.at}`; if (seenTr[z].has(k)) continue; seenTr[z].add(k); out(Object.assign({ z, op: 'tr', boot: 0 }, e)); }
      out({ z, op: 'smp', boot: 0, t: P.now, wall: Date.now(), day: P.xzone ? P.xzone.day : null, mobs: Tq.mobs, byType: Tq.byType, band: Tq.band, tame: Tq.tame, gone: Tq.gone, hidden: (Tq.hidden || []).map((h) => ({ key: h.key, unsure: h.unsure, type: h.type, tame: h.tame })),
        stat: Tq.stat, st: Tq.st, drain: Tq.drain, xz: P.xzone ? { st: P.xzone.st, retry: P.xzone.retry, t1321: P.xzone.t1321 ? { pend: P.xzone.t1321.pend, restored: P.xzone.t1321.restored, unsureKeep: P.xzone.t1321.unsureKeep } : null } : null });
    }
    //   봇 — 한반도 마을 날 2 마다 이음매를 넘나든다(가상 시계 판 · 넘기 메시지가 올 때까지) · 표본 고리를 안 막게 따로 돈다(하나씩)
    if (!crossing && dd.hanbando >= 0 && dd.hanbando - lastCrossDay >= 2) {
      lastCrossDay = dd.hanbando;
      const east = bot.zone === 'hanbando';
      crossing = (async () => { if (!(await tele(east ? W - 120 : 120, Y) && await walkCross(east ? 1 : -1, 240000))) bot.fail++; })().catch(() => { bot.fail++; }).finally(() => { crossing = null; });
    }
  }
  if (crossing) await Promise.race([crossing, sleep(30000)]);
  clearInterval(pinger); clearInterval(stIv);
  Object.assign(meta, { end: new Date().toISOString(), wallS: Math.round((Date.now() - t0) / 1000), days: Object.fromEntries(ZS.map((z) => [z, lastDay(Z[z].rows)])), bars, H, dead, botCross: bot.crossN, botFail: bot.fail });
  meta.done = ZS.every((z) => meta.days[z] >= DAYS);
  saveMeta();
  say(`[${TAG}] 끝 · 날 ${JSON.stringify(meta.days)} · 가로대 ${bars} · 봇 넘음 ${bot.crossN}(못 넘음 ${bot.fail}) · 벽시계 ${meta.wallS}초${dead.length ? ' · ⚠죽은 존 ' + dead : ''}`);
  for (const o of socks) { try { o.ws.close(); } catch (e) {} }
  await killAll();
  const fin = {};
  for (const z of ZS) { try { const { DatabaseSync } = require('node:sqlite'); const db = new DatabaseSync(Z[z].db, { readOnly: true });
    fin[z] = { mobs: db.prepare('SELECT type AS t, COUNT(*) AS n FROM mobs GROUP BY type').all(), tame: db.prepare('SELECT COUNT(*) AS n FROM mobs WHERE tame_owner IS NOT NULL').get().n,
      pend: (() => { try { return db.prepare('SELECT COUNT(*) AS n FROM t1321_pend').get().n; } catch (e) { return null; } })(), seen: (() => { try { return db.prepare('SELECT COUNT(*) AS n FROM t1321_seen').get().n; } catch (e) { return null; } })() };
    db.close(); } catch (e) { fin[z] = { err: e.message }; } }
  fs.writeFileSync(path.join(OUTD, `final_${TAG}.json`), JSON.stringify(fin, null, 1));
  process.exit(meta.done ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });
