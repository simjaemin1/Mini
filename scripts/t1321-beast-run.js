#!/usr/bin/env node
// (@regress 없음 — 러너 밖 · T1321 판 자 · 판 하나 = central + 한반도 + 닛폰 · 벽시계 · 마을 하루를 줄인 판)
// =============================================================================
// T1321 — 두 존 판: 짐승이 존을 넘는다(실체 몹 ⓐ · 길든 짐승 ⓒ) · 두 존 합 개체 수 · 캐러밴 넘음 · 몸 보존 · 재기동 판
//
//   run <표지> <씨> <마을하루ms> <날> <outdir> [restart]
//     존 둘 = 팔 켬(`T525_CROSS_ZONE` · `T952_XZ_STAY` · `T622_ZONE_FAUNA` · `T1139_XZ_LAZY` — T1292 판의 'on' 그대로) + `T1321_XZ_BEAST=1` · `T1321_XZ_KEEP=1` ·
//       `E2E_GIVE=1`(판 꾸밈 문 — 짐승 세우기 · 텔레포트) · 존 훅 = `t1292-xzone-live.js`(씨 · 하루 줄 · 캐러밴 몸 사건 줄 — 몸 보존 정본 셈).
//     판 꾸밈(재는 것이 아니라 재료): 이음매에서 사람이 넘을 수 있는 위도 y 를 찾고(텔레포트 → 동쪽으로 걷기 — 넘기 메시지가 오면 그 y),
//       그 y 둘레에 ① 관측 소켓(두 존 · 이음매 곁 — 청크가 켜져 있어야 몹이 걷는다) ② 봇 한 사람 + 길든 말 둘(고삐 = 봇) ③ 야생(한반도 사슴 10 · 멧돼지 4 ·
//       닛폰 아이벡스 10 · 사슴 4 — 이음매 안쪽 60~460px) ④ 한반도 호랑이 1(닛폰 '없음' — 경계에서 돌아선다) 을 세운다.
//     봇은 20초마다 이음매를 넘나든다(넘기 메시지의 토큰으로 받는 존에 붙는다 — 사람 넘기 규약 그대로) — 길든 말은 주인이 넘어간 자리로 걸어 따라 넘는다.
//     `/perf` 를 1초마다 두 존에서 읽어 짐승 문 줄(`t1321.trace`)을 모으고(열쇠 · 사건 · 존) 몹 수(존 몹 · 숨김 · 죽음 · 다시 낳음)를 표본으로 적는다.
//     restart = 마을 날 ≥ 날/2 에서: 닛폰을 SIGSTOP → 한반도 이음매 곁에 동쪽으로 곧장 걷는 사슴 하나(판 꾸밈) → 한반도 짐승 문이 답을 못 들어 숨긴 채(모름)인 것을 보면
//       한반도 SIGKILL → 닛폰 SIGCONT(묶였던 글을 받는다) → 한반도를 같은 DB 로 다시 띄운다 → 다시 민 글이 `dup` 으로 끝나는지.
//   analyze <outdir> <표지> — 넘은 짐승(갈래별) · 열쇠별 차례(숨김 → 들어옴 → 나감 · 드러냄) · 두 존 동시 보임 · 사라짐 · 두 존 합(조용한 표본마다 처음 수 − 죽음 + 다시 낳음) ·
//     캐러밴 넘음 · 몸 보존(`t1292-xzone-live.js analyze` 정본).
// =============================================================================
'use strict';
if (require.main === module) require('./lib-port').hold(3010, 3020, 3021);   // [T1288] 제품 고정 포트(존 설정 · central 기본) — 띄우는 동안 이 기계에서 혼자 쥔다(나란히 돌면 줄 선다 · `lib-port.hold`)
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const ROOT = path.join(__dirname, '..');
const HOOK = path.join(__dirname, 't1292-xzone-live.js');
const { ZONES } = require(path.join(ROOT, 'server/zone-config'));
const ZS = ['hanbando', 'nippon'];
const W = ZONES.hanbando.zoneWidth, COMMIT = require(path.join(ROOT, 'server/zone-config')).HANDOFF_COMMIT;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const say = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);
const rmdb = (f) => { for (const s of ['', '-wal', '-shm']) { try { fs.unlinkSync(f + s); } catch (e) {} } };

const [MODE, ...A] = process.argv.slice(2);
if (MODE === 'run') run(...A).catch((e) => { console.error(e); process.exit(1); });
else if (MODE === 'analyze') { console.log(JSON.stringify(analyze(A[0], A[1]), null, 1)); }
else if (MODE === 'offcheck') offcheck(...A).catch((e) => { console.error(e); process.exit(1); });
else { console.error('쓰는 법: run <표지> <씨> <마을하루ms> <날> <outdir> [restart] · analyze <outdir> <표지>'); process.exit(2); }

async function run(LABEL, SEEDS, DMS, DAYSS, OUTD, OPT) {
  const SEED = parseInt(SEEDS, 10), DAY_MS = parseInt(DMS, 10), DAYS = parseInt(DAYSS, 10), RESTART = /restart/.test(OPT || ''), DRAIN = /drain/.test(OPT || '');
  if (!(SEED > 0) || !(DAY_MS > 0) || !(DAYS > 0) || !OUTD) { console.error('인자'); process.exit(2); }
  fs.mkdirSync(OUTD, { recursive: true });
  const tag = LABEL, CP = 3010;
  const WebSocket = require('ws');
  const cdb = path.join(OUTD, `c_${tag}.db`); rmdb(cdb);
  const c = spawn(process.execPath, [path.join(ROOT, 'server/central.js')], { cwd: ROOT, stdio: 'ignore',
    env: Object.assign({}, process.env, { PORT: String(CP), DB_PATH: cdb, PUBLIC_HOST: 'localhost', ENABLED_ZONES: ZS.join(',') }) });
  const Z = {};
  const envOf = (z) => {
    const env = Object.assign({}, process.env, { PORT: String(ZONES[z].port), ZONE_ID: z, CENTRAL_URL: `http://localhost:${CP}`, ENABLED_ZONES: ZS.join(','),
      DB_PATH: Z[z].db, ENABLE_VILLAGES: '1', VILLAGE_DAY_MS: String(DAY_MS), T1292_HOOK: 'zone', T1292_SEED: String(SEED), T1292_ROWS: Z[z].rows, T1292_EV: Z[z].evf,
      T662_GEO_CACHE_DIR: path.join(OUTD, `geo_${tag}`),
      T525_CROSS_ZONE: '1', T952_XZ_STAY: '1', T622_ZONE_FAUNA: '1', T1139_XZ_LAZY: '1', T1321_XZ_BEAST: '1', T1321_XZ_KEEP: '1', E2E_GIVE: '1' });
    return env;
  };
  const startZone = (z, n) => {
    const logf = fs.openSync(path.join(OUTD, `z_${tag}_${z}${n ? '_' + n : ''}.log`), 'w');
    Z[z].p = spawn(process.execPath, ['-r', HOOK, path.join(ROOT, 'server/zone.js')], { cwd: ROOT, stdio: ['ignore', logf, logf], env: envOf(z) });
    Z[z].logPath = path.join(OUTD, `z_${tag}_${z}${n ? '_' + n : ''}.log`);
  };
  for (const z of ZS) {
    Z[z] = { db: path.join(OUTD, `z_${tag}_${z}.db`), rows: path.join(OUTD, `rows_${tag}_${z}.jsonl`), evf: path.join(OUTD, `ev_${tag}_${z}.jsonl`) };
    rmdb(Z[z].db); for (const f of [Z[z].rows, Z[z].evf]) { try { fs.unlinkSync(f); } catch (e) {} }
    startZone(z, 0);
  }
  const BF = path.join(OUTD, `beast_${tag}.jsonl`); try { fs.unlinkSync(BF); } catch (e) {}
  const out = (o) => { try { fs.appendFileSync(BF, JSON.stringify(Object.assign({ t: Date.now() }, o)) + '\n'); } catch (e) {} };
  const meta = { tag, seed: SEED, DAY_MS, DAYS, restart: RESTART, start: new Date().toISOString(), host: { cpus: require('os').cpus().length, node: process.version } };
  const saveMeta = () => fs.writeFileSync(path.join(OUTD, `meta_${tag}.json`), JSON.stringify(meta, null, 1));
  saveMeta();
  const killAll = async () => { for (const z of ZS) { try { Z[z].p.kill('SIGCONT'); } catch (e) {} try { Z[z].p.kill('SIGINT'); } catch (e) {} } await sleep(4000); for (const z of ZS) { try { Z[z].p.kill('SIGKILL'); } catch (e) {} } try { c.kill('SIGKILL'); } catch (e) {} await sleep(500); };
  process.on('SIGTERM', async () => { await killAll(); process.exit(3); });
  const upOf = (z) => { try { return /zone server up on/.test(fs.readFileSync(Z[z].logPath, 'utf8')); } catch (e) { return false; } };
  const t0 = Date.now();
  while (!ZS.every(upOf) && Date.now() - t0 < 20 * 60000) { await sleep(2000); if (ZS.some((z) => Z[z].p.exitCode != null)) break; }
  if (!ZS.every(upOf)) { say(`[${tag}] ⚠존 기동 실패`); meta.err = 'boot'; saveMeta(); await killAll(); process.exit(1); }
  meta.bootS = Math.round((Date.now() - t0) / 1000); say(`[${tag}] 두 존 기동 ${meta.bootS}s`);
  const perf = async (z) => { try { return await (await fetch(`http://localhost:${ZONES[z].port}/perf`, { signal: AbortSignal.timeout(8000) })).json(); } catch (e) { return null; } };
  const postDoor = async (z, body) => { try { return await (await fetch(`http://localhost:${ZONES[z].port}/handoff_prepare`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(8000) })).json(); } catch (e) { return { err: e.message }; } };

  // ── 소켓 ──────────────────────────────────────────────────────────────────
  const socks = [];
  const open = (url, onMsg) => new Promise((res) => {
    const ws = new WebSocket(url); const o = { ws, welcome: null, url };
    ws.on('message', (raw) => { let m; try { m = JSON.parse(raw); } catch (e) { return; } if (m.type === 'welcome' && !o.welcome) { o.welcome = m; res(o); } if (onMsg) onMsg(m, o); });
    ws.on('error', () => res(o)); ws.on('close', () => { o.closed = true; res(o); });
    socks.push(o); setTimeout(() => res(o), 15000);
  });
  const pinger = setInterval(() => { for (const o of socks) if (!o.closed && o.ws.readyState === 1) { try { o.ws.send(JSON.stringify({ type: 'ping', t: Date.now() })); } catch (e) {} } }, 2000);
  const wsUrl = (z) => `ws://localhost:${ZONES[z].port}`;
  // 봇 — 사람 넘기 규약(넘기 메시지 → 받는 존에 토큰으로 붙는다)
  const bot = { zone: 'hanbando', o: null, handoff: null, pid: null, name: 't1321bot', crossN: 0 };
  const onBot = (m) => { if (m.type === 'handoff') bot.handoff = m; };
  bot.o = await open(`${wsUrl('hanbando')}/?username=&name=${bot.name}&color=%23ffffff`, onBot);
  bot.pid = bot.o.welcome && bot.o.welcome.playerId; bot.guest = bot.o.welcome && (bot.o.welcome.guestToken || bot.o.welcome.guest_token || null);
  say(`[${tag}] 봇 ${bot.pid}`);
  const send = (o, m) => { try { o.ws.send(JSON.stringify(m)); } catch (e) {} };
  // 이음매에서 넘을 수 있는 위도 찾기 — 텔레포트(동쪽 끝 − 400) → 동쪽으로 걷기 → 넘기 메시지
  let Y = null;
  const tele = async (x, y) => {   // 텔레포트 — 알림으로 됐나(바위 · 물 위면 거절)
    let r = null; const h = (raw) => { let m; try { m = JSON.parse(raw); } catch (e) { return; } if (m.type === 'notice' && /텔레포트/.test(String(m.text))) r = /🌀|→/.test(String(m.text)) && !/할 수 없/.test(String(m.text)); };
    bot.o.ws.on('message', h); send(bot.o, { type: 'teleport_debug', x, y });
    for (let i = 0; i < 30 && r == null; i++) await sleep(100);
    bot.o.ws.off('message', h); return !!r;
  };
  const walkCross = async (dirX, msMax) => {
    bot.handoff = null; const t = Date.now();
    const iv = setInterval(() => send(bot.o, { type: 'input', vx: dirX, vy: 0 }), 33);
    while (!bot.handoff && Date.now() - t < msMax) await sleep(100);
    clearInterval(iv);
    if (!bot.handoff) return false;
    const to = bot.handoff.targetZone, tok = bot.handoff.token;
    const nb = await open(`${wsUrl(to)}/?handoff_token=${encodeURIComponent(tok)}`, onBot);
    if (!nb.welcome) return false;
    bot.o = nb; bot.zone = to; bot.crossN++; bot.at = nb.welcome && nb.welcome.self ? { x: nb.welcome.self.x, y: nb.welcome.self.y } : null; out({ ev: 'botCross', to, n: bot.crossN, at: bot.at });
    return true;
  };
  //   이음매 길목 — 지형 정본(`terrain.js` 두 존 술어)으로 이음매 양쪽 640px 이 곧게 트인 위도 줄(판 꾸밈 · 읽기만) · 그중 17,840 을 품은 줄(없으면 가장 넓은 줄)의 가운데
  const T = require(path.join(ROOT, 'server/terrain'));
  const free = (z, x, y) => { const px = Math.floor(x / 32) * 32 + 16, py = Math.floor(y / 32) * 32 + 16; return !(T.isRockCellLocal(z, px, py) || T.isWaterCellLocal(z, px, py)); };
  const lanes = []; let cur = null;
  for (let y = 16; y < ZONES.hanbando.zoneHeight; y += 32) {
    let okL = true; for (let x = W - 640; x < W + 640 && okL; x += 32) okL = x < W ? free('hanbando', x, y) : free('nippon', x - W, y);
    if (okL) { if (cur && cur.y1 === y - 32) cur.y1 = y; else { cur = { y0: y, y1: y }; lanes.push(cur); } }
  }
  meta.lanes = lanes.map((r) => [r.y0, r.y1]);
  const pick = lanes.find((r) => r.y0 <= 17840 && r.y1 >= 17840) || lanes.slice().sort((a, b) => (b.y1 - b.y0) - (a.y1 - a.y0))[0];
  const cands = pick ? [Math.round((pick.y0 + pick.y1) / 2)] : [];
  for (const y of cands.concat(lanes.map((r) => Math.round((r.y0 + r.y1) / 2)))) {
    if (Y != null) break;
    if (!await tele(W - 280, y)) continue;
    if (await walkCross(1, 20000)) { Y = bot.at ? Math.round(bot.at.y) : y; break; }
  }
  if (Y == null) { say(`[${tag}] ⚠넘을 위도 못 찾음`); meta.err = 'noY'; saveMeta(); await killAll(); process.exit(1); }
  meta.Y = Y; saveMeta(); say(`[${tag}] 넘을 위도 y=${Y} — 봇은 닛폰`);
  // 되돌아와 판 꾸밈(한반도 쪽)
  await tele(280, Y);
  await walkCross(-1, 20000);
  say(`[${tag}] 봇 ${bot.zone}`);
  // 관측 소켓 — 두 존 이음매 곁(청크 켜기)
  for (const [z, x] of [['hanbando', W - 300], ['nippon', 300]]) await open(`${wsUrl(z)}/?observer=1&vx=${x}&vy=${Y}`);
  // 판 꾸밈 — 짐승
  await tele(W - 700, Y);
  //   야생은 넘는 길목(봇이 넘은 위도) 둘레에 — 바위 · 물 칸은 세우기 문이 건너뛴다
  send(bot.o, { type: '__e2e_beast', kind: 'horse', n: 2, r: 40, tame: true });
  send(bot.o, { type: '__e2e_beast', kind: 'deer', n: 10, r: 160, x: W - 300, y: Y });
  send(bot.o, { type: '__e2e_beast', kind: 'wild_boar', n: 4, r: 90, x: W - 200, y: Y + 120 });
  send(bot.o, { type: '__e2e_beast', kind: 'tiger', n: 1, r: 0, x: W - 150, y: Y - 60, vx: 60, vy: 0, ms: 12000 });
  await sleep(500);
  // 닛폰 쪽 — 봇이 넘어가서 세운다
  await tele(W - 280, Y);
  await walkCross(1, 20000);
  send(bot.o, { type: '__e2e_beast', kind: 'ibex', n: 10, r: 160, x: 300, y: Y });
  send(bot.o, { type: '__e2e_beast', kind: 'deer', n: 4, r: 90, x: 200, y: Y - 120 });
  out({ ev: 'setup', Y, bot: bot.pid });
  // ── 판 ──────────────────────────────────────────────────────────────────
  const seenTr = { hanbando: new Set(), nippon: new Set() };
  let lastBotCross = Date.now(), restarted = false, restartSt = null, boots = { hanbando: 0, nippon: 0 };
  const LIM = Date.now() + (DAYS + 10) * DAY_MS * 4 + 30 * 60000;
  const dayOf = (z) => { try { const L = fs.readFileSync(Z[z].rows, 'utf8').trim().split('\n'); return L.length && L[0] ? JSON.parse(L[L.length - 1]).day : -1; } catch (e) { return -1; } };
  let d0 = null;
  while (Date.now() < LIM) {
    await sleep(1000);
    if (ZS.some((z) => Z[z].p.exitCode != null && !(restartSt && restartSt.z === z && !restartSt.up))) { say(`[${tag}] ⚠존이 죽었다`); meta.err = 'died'; break; }
    // 표본
    for (const z of ZS) {
      if (restartSt && restartSt.z === z && !restartSt.up) continue;
      const P = await perf(z); if (!P || !P.t1321) continue;
      const T = P.t1321;
      for (const e of (T.trace || [])) { const k = `${boots[z]}|${e.k}|${e.key}|${e.at}`; if (seenTr[z].has(k)) continue; seenTr[z].add(k); out(Object.assign({ z, op: 'tr', boot: boots[z] }, e)); }
      out({ z, op: 'smp', boot: boots[z], day: P.xzone ? P.xzone.day : null, mobs: T.mobs, byType: T.byType, band: T.band, tame: T.tame, gone: T.gone, hidden: (T.hidden || []).map((h) => ({ key: h.key, unsure: h.unsure, type: h.type, tame: h.tame })),
        stat: T.stat, st: T.st, drain: T.drain, xz: P.xzone ? { st: P.xzone.st, retry: P.xzone.retry, t1321: P.xzone.t1321 ? { pend: P.xzone.t1321.pend, restored: P.xzone.t1321.restored, unsureKeep: P.xzone.t1321.unsureKeep } : null } : null });
    }
    // 봇 — 20초마다 넘나든다
    if (Date.now() - lastBotCross > 20000 && !(restartSt && !restartSt.done)) {
      lastBotCross = Date.now();
      const east = bot.zone === 'hanbando';
      await tele(east ? W - 400 : 400, Y);
      await walkCross(east ? 1 : -1, 20000);
    }
    const dd = Object.fromEntries(ZS.map((z) => [z, dayOf(z)]));
    if (d0 == null && dd.hanbando >= 0) d0 = dd;
    // 재기동 판
    if (RESTART && !restarted && dd.hanbando >= Math.floor(DAYS / 2)) {
      restarted = true; restartSt = { z: 'hanbando', at: Date.now(), day: dd.hanbando, up: true, done: false };
      say(`[${tag}] 재기동 판 — 닛폰 SIGSTOP · 한반도 곧장 걷는 사슴`);
      Z.nippon.p.kill('SIGSTOP'); out({ ev: 'stop', z: 'nippon' });
      const helper = await open(`${wsUrl('hanbando')}/?username=&name=t1321help&color=%23ffffff`);
      send(helper, { type: 'teleport_debug', x: W - 800, y: Y }); await sleep(300);
      send(helper, { type: '__e2e_beast', kind: 'deer', n: 1, r: 0, x: W - 40, y: Y, vx: 54, vy: 0, ms: 20000 });
      let hid = null; const tS = Date.now();
      while (Date.now() - tS < 40000) {
        await sleep(500);
        const P = await perf('hanbando');
        const h = P && P.t1321 && (P.t1321.hidden || []).find((q) => q.unsure);
        const xp = P && P.xzone && P.xzone.t1321 && (P.xzone.t1321.pend || []).find((q) => q.unsure);
        if (h || xp) { hid = { beast: h || null, caravan: xp || null }; break; }
      }
      restartSt.hidden = hid; out({ ev: 'killAt', hid });
      say(`[${tag}] 한반도 숨김(모름) ${JSON.stringify(hid)} — SIGKILL`);
      await sleep(1500);   // T1034 표 · 짐승 숨김 줄은 그 자리에서 DB 에 — 메타 행 끝 틱 몫
      restartSt.up = false;
      Z.hanbando.p.kill('SIGKILL'); out({ ev: 'kill', z: 'hanbando' });
      await sleep(1000);
      Z.nippon.p.kill('SIGCONT'); out({ ev: 'cont', z: 'nippon' });
      await sleep(3000);
      boots.hanbando++;
      startZone('hanbando', boots.hanbando);
      const tU = Date.now();
      while (!upOf('hanbando') && Date.now() - tU < 15 * 60000) await sleep(2000);
      restartSt.up = upOf('hanbando'); restartSt.upS = Math.round((Date.now() - tU) / 1000); out({ ev: 'up', z: 'hanbando', s: restartSt.upS });
      say(`[${tag}] 한반도 다시 뜸 ${restartSt.upS}s`);
      await open(`${wsUrl('hanbando')}/?observer=1&vx=${W - 300}&vy=${Y}`);
      if (bot.zone === 'hanbando') { bot.o = await open(`${wsUrl('hanbando')}/?username=&name=${bot.name}&color=%23ffffff${bot.guest ? '&guest_token=' + encodeURIComponent(bot.guest) : ''}`, onBot); }
      restartSt.done = true; meta.restart = restartSt; saveMeta();
    }
    // 비우기 판 — 날 3/4 에서 두 존에 안 문 명령(`kind: 'drain'` · on) · 그 뒤 매 표본 상태
    if (DRAIN && !meta.drainAt && dd.hanbando >= Math.floor(DAYS * 3 / 4) && !(restartSt && !restartSt.done)) {
      meta.drainAt = { day: dd, t: Date.now() };
      for (const z of ZS) { const r = await postDoor(z, { kind: 'drain', on: true }); out({ ev: 'drainOn', z, r }); }
      say(`[${tag}] 비우기 켬 — 날 ${JSON.stringify(dd)}`);
    }
    if (DRAIN && meta.drainAt) for (const z of ZS) { const r = await postDoor(z, { kind: 'drain' }); out({ z, op: 'drain', day: dd[z], r }); if (r && r.done && !(meta.drainDone || {})[z]) { meta.drainDone = Object.assign(meta.drainDone || {}, { [z]: { day: dd[z], s: Math.round((Date.now() - meta.drainAt.t) / 1000) } }); say(`[${tag}] ${z} 비움 끝 — 날 ${dd[z]}`); } }
    //   재기동 판은 다시 뜬 뒤 90초는 더 본다(다시 뜬 존 날은 벽시계 날로 뛴다 — T728 "멈춘 동안은 따라잡지 않는다" · 다시 민 글이 끝나는 것을 본다)
    if (ZS.every((z) => dd[z] >= DAYS) && !(restartSt && (!restartSt.done || Date.now() - restartSt.at < 90000))) break;
  }
  clearInterval(pinger);
  meta.end = new Date().toISOString(); meta.wallS = Math.round((Date.now() - t0) / 1000); meta.days = Object.fromEntries(ZS.map((z) => [z, dayOf(z)])); meta.d0 = d0;
  meta.done = ZS.every((z) => meta.days[z] >= DAYS); meta.botCross = bot.crossN;
  saveMeta();
  say(`[${tag}] 끝 · 날 ${JSON.stringify(meta.days)} · 봇 넘음 ${bot.crossN} · 벽시계 ${meta.wallS}s`);
  for (const o of socks) { try { o.ws.close(); } catch (e) {} }
  await killAll();
  // 끝 DB — 존 몹 행(종 · 주인)
  const fin = {};
  for (const z of ZS) { try { const { DatabaseSync } = require('node:sqlite'); const db = new DatabaseSync(Z[z].db, { readOnly: true });
    fin[z] = { mobs: db.prepare('SELECT type AS t, COUNT(*) AS n FROM mobs GROUP BY type').all(), tame: db.prepare('SELECT COUNT(*) AS n FROM mobs WHERE tame_owner IS NOT NULL').get().n,
      pend: (() => { try { return db.prepare('SELECT COUNT(*) AS n FROM t1321_pend').get().n; } catch (e) { return null; } })(), seen: (() => { try { return db.prepare('SELECT COUNT(*) AS n FROM t1321_seen').get().n; } catch (e) { return null; } })() };
    db.close(); } catch (e) { fin[z] = { err: e.message }; } }
  fs.writeFileSync(path.join(OUTD, `final_${tag}.json`), JSON.stringify(fin, null, 1));
  process.exit(0);
}

// ── 분석 ─────────────────────────────────────────────────────────────────────
function analyze(dir, tag) {
  const read = (f) => { try { return fs.readFileSync(f, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l)); } catch (e) { return []; } };
  const L = read(path.join(dir, `beast_${tag}.jsonl`));
  const meta = (() => { try { return JSON.parse(fs.readFileSync(path.join(dir, `meta_${tag}.json`), 'utf8')); } catch (e) { return {}; } })();
  const tr = L.filter((e) => e.op === 'tr');
  // 열쇠별 차례 — 보낸 존 'hide' · 'bootHide' → 받는 존 'in' · 'dupIn' → 보낸 존 'out'(dup?) · 'unhide'
  const K = new Map();
  const g = (k) => { let o = K.get(k); if (!o) { o = { key: k, hide: null, in: [], out: null, unhide: null, dupIn: 0, boot: 0, keep: 0, type: null, tame: false, from: null, to: null }; K.set(k, o); } return o; };
  for (const e of tr) {
    const o = g(e.key);
    if (e.k === 'hide') { o.hide = e.at; o.type = e.type; o.tame = !!e.tame; o.from = e.z; o.to = e.to; }
    else if (e.k === 'bootHide') o.boot++;
    else if (e.k === 'in') { o.in.push({ z: e.z, at: e.at, tame: !!e.tame, type: e.type }); if (!o.type) o.type = e.type; if (e.tame) o.tame = true; }
    else if (e.k === 'dupIn') o.dupIn++;
    else if (e.k === 'out') { o.out = { at: e.at, dup: !!e.dup }; }
    else if (e.k === 'unhide') o.unhide = { at: e.at, why: e.why };
    else if (e.k === 'keep') o.keep++;
  }
  const keys = [...K.values()];
  const crossed = keys.filter((o) => o.in.length >= 1);
  const by = { wild: 0, tame: 0 }, byType = {}, dir2 = {};
  for (const o of crossed) { by[o.tame ? 'tame' : 'wild']++; byType[o.type] = (byType[o.type] || 0) + 1; const d = `${o.from || '?'}→${o.in[0].z}`; dir2[d] = (dir2[d] || 0) + 1; }
  const twoIn = keys.filter((o) => o.in.length > 1).length;                       // 받는 존이 같은 열쇠로 둘을 세움(둘)
  const inAndUnhide = keys.filter((o) => o.in.length >= 1 && o.unhide).length;    // 받았는데 보낸 존이 드러냄(둘)
  const outNoIn = keys.filter((o) => o.out && o.in.length === 0 && !o.out.dup).length;   // 보낸 존이 지웠는데 받은 줄 없음(사라짐 — 줄을 못 모은 판 제외는 아래 표본)
  const hung = keys.filter((o) => (o.hide || o.boot) && !o.out && !o.unhide).length;    // 끝까지 안 끝남(판 끝 숨김)
  const unhideWhy = {}; for (const o of keys) if (o.unhide) unhideWhy[o.unhide.why] = (unhideWhy[o.unhide.why] || 0) + 1;
  // 두 존 합 — 표본 짝(두 존이 1.5초 안 · 둘 다 숨김 0)에서: 존 몹 + 0 = 처음 − 죽음 + 다시 낳음(존마다 셈은 부팅마다 0 에서 — 부팅별로 더한다)
  const smp = L.filter((e) => e.op === 'smp');
  const lastStat = {};   // `${z}|${boot}` → 마지막 stat
  for (const s of smp) lastStat[`${s.z}|${s.boot}`] = s.stat;
  const cum = (z, boot, stat) => { let d = 0, b = 0; for (const k in lastStat) { const [zz, bb] = k.split('|'); if (zz !== z) continue; if (+bb < boot) { d += lastStat[k].died; b += lastStat[k].born; } } return { died: d + stat.died, born: b + stat.born }; };
  const pairs = [];
  const byZ = { hanbando: smp.filter((s) => s.z === 'hanbando'), nippon: smp.filter((s) => s.z === 'nippon') };
  let j = 0;
  //   두 표본 사이(± 0.5초)에 짐승 문 사건이 난 짝은 뺀다(한 존은 넘기기 전 · 다른 존은 받은 뒤를 읽으면 한 몸이 두 번 · 0 번 세인다 — 표본 시각 차 몫)
  const evT = tr.map((e) => e.at).sort((x, y) => x - y);
  const evIn = (t0, t1) => { let lo = 0, hi = evT.length; while (lo < hi) { const m = (lo + hi) >> 1; if (evT[m] < t0) lo = m + 1; else hi = m; } return lo < evT.length && evT[lo] <= t1; };
  let quiet = 0;
  for (const a of byZ.hanbando) {
    while (j < byZ.nippon.length - 1 && byZ.nippon[j + 1].t <= a.t + 1500) j++;
    const b = byZ.nippon[j]; if (!b || Math.abs(b.t - a.t) > 1500) continue;
    if ((a.hidden || []).length || (b.hidden || []).length) continue;
    if (evIn(Math.min(a.t, b.t) - 2500, Math.max(a.t, b.t) + 500)) { quiet++; continue; }
    const ca = cum('hanbando', a.boot, a.stat), cb = cum('nippon', b.boot, b.stat);
    pairs.push({ t: a.t, n: a.mobs + b.mobs, died: ca.died + cb.died, born: ca.born + cb.born, setup: null });
  }
  // 처음 수 = 판 꾸밈 뒤 첫 짝(그 뒤 꾸밈 — 재기동 판 사슴 하나 — 은 더한다)
  const killAt = L.find((e) => e.ev === 'killAt'), stopAt = L.find((e) => e.ev === 'stop');
  let base = null, extra = 0, bad = 0, worst = 0, n = 0;
  const setupT = (L.find((e) => e.ev === 'setup') || {}).t || 0;
  for (const p of pairs) {
    if (p.t < setupT + 3000) continue;
    const add = (stopAt && p.t > stopAt.t + 2000) ? 1 : 0;
    if (base == null) { base = p.n + p.died - p.born; continue; }
    const want = base + add - p.died + p.born, d = p.n - want;
    n++; if (d !== 0) { bad++; if (Math.abs(d) > Math.abs(worst)) worst = d; }
  }
  return {
    tag, meta: { seed: meta.seed, days: meta.days, Y: meta.Y, botCross: meta.botCross, restart: meta.restart || null, wallS: meta.wallS },
    beasts: { keys: keys.length, crossed: crossed.length, by, byType, dir: dir2, dupAnswered: keys.filter((o) => o.out && o.out.dup).length, dupIn: keys.reduce((a, o) => a + o.dupIn, 0),
      unhide: keys.filter((o) => o.unhide).length, unhideWhy, keepN: keys.reduce((a, o) => a + o.keep, 0), bootHide: keys.filter((o) => o.boot).length },
    canon: { twoIn, inAndUnhide, outNoIn, hung },
    sum: { pairs: n, base, mismatch: bad, worst, skippedNearEvent: quiet },
  };
}

// ── 끈 판 — 판 끝 DB 사본으로 팔을 끄고(T525 끔) 다시 띄워 예외를 센다: drain = '1'(안전망 켬 `T1321_XZ_DRAIN=1`) · '0'(증인 — 종전) ──────────
async function offcheck(OUTD, tag, DR, SECS) {
  const CP = 3010, secs = parseInt(SECS || '60', 10);
  const sub = path.join(OUTD, `off_${tag}_${DR}`); fs.mkdirSync(sub, { recursive: true });
  for (const z of ZS) for (const sfx of ['', '-wal', '-shm']) { const f = path.join(OUTD, `z_${tag}_${z}.db${sfx}`); if (fs.existsSync(f)) fs.copyFileSync(f, path.join(sub, `z_${z}.db${sfx}`)); }
  const cdb = path.join(sub, 'c.db'); rmdb(cdb);
  const c = spawn(process.execPath, [path.join(ROOT, 'server/central.js')], { cwd: ROOT, stdio: 'ignore', env: Object.assign({}, process.env, { PORT: String(CP), DB_PATH: cdb, PUBLIC_HOST: 'localhost', ENABLED_ZONES: ZS.join(',') }) });
  const meta = JSON.parse(fs.readFileSync(path.join(OUTD, `meta_${tag}.json`), 'utf8'));
  const P = {};
  for (const z of ZS) {
    const env = Object.assign({}, process.env, { PORT: String(ZONES[z].port), ZONE_ID: z, CENTRAL_URL: `http://localhost:${CP}`, ENABLED_ZONES: ZS.join(','), DB_PATH: path.join(sub, `z_${z}.db`),
      ENABLE_VILLAGES: '1', VILLAGE_DAY_MS: String(meta.DAY_MS), T1292_HOOK: 'zone', T1292_SEED: String(meta.seed), T1292_ROWS: path.join(sub, `rows_${z}.jsonl`), T1292_EV: path.join(sub, `ev_${z}.jsonl`),
      T622_ZONE_FAUNA: '1', T1321_XZ_DRAIN: DR === '1' ? '1' : '' });
    for (const k of ['T525_CROSS_ZONE', 'T952_XZ_STAY', 'T1139_XZ_LAZY', 'T1321_XZ_BEAST', 'T1321_XZ_KEEP', 'E2E_GIVE']) delete env[k];
    const logf = fs.openSync(path.join(sub, `z_${z}.log`), 'w');
    P[z] = spawn(process.execPath, ['-r', HOOK, path.join(ROOT, 'server/zone.js')], { cwd: ROOT, stdio: ['ignore', logf, logf], env });
  }
  await sleep(secs * 1000);
  for (const z of ZS) { try { P[z].kill('SIGINT'); } catch (e) {} } await sleep(4000); for (const z of ZS) { try { P[z].kill('SIGKILL'); } catch (e) {} } try { c.kill('SIGKILL'); } catch (e) {}
  const res = {};
  for (const z of ZS) {
    const L = fs.readFileSync(path.join(sub, `z_${z}.log`), 'utf8');
    const rows = (() => { try { return fs.readFileSync(path.join(sub, `rows_${z}.jsonl`), 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l)); } catch (e) { return []; } })();
    const m728 = /\[T728\] 재기동 영속 — [^\n]*/.exec(L);
    let M = null; try { const { DatabaseSync } = require('node:sqlite'); const db = new DatabaseSync(path.join(sub, `z_${z}.db`), { readOnly: true }); const r = db.prepare('SELECT data FROM world_meta WHERE zone = ?').get(z); M = r ? JSON.parse(r.data) : null; db.close(); } catch (e) {}
    res[z] = { zoneErr: (L.match(/reading 'zone'/g) || []).length, typeErr: (L.match(/TypeError/g) || []).length, t728: m728 ? m728[0].slice(0, 200) : null,
      days: rows.length ? [rows[0].day, rows[rows.length - 1].day] : null, foreignLeft: M ? (M.caravans || []).filter((q) => q._xzHome).length : null, homeOut: M ? (M.caravans || []).filter((q) => q.state === 'xzone').length : null };
  }
  fs.writeFileSync(path.join(OUTD, `offcheck_${tag}_${DR}.json`), JSON.stringify(res, null, 1));
  console.log(JSON.stringify(res));
  process.exit(0);
}
