#!/usr/bin/env node
// (@regress 없음 — 러너 밖 · T890 ① 탐침 · 한 존 실서버)
// === scripts/t890-takeover-probe.js — 같은 존 산 몸 승계(`_takeover`)가 **저장본보다 새로운 몸 칸**을 잃나 ==================
//
// 왜(T873 회부 2): `_takeover`(같은 신원으로 새 소켓이 붙었는데 옛 세션이 아직 이 존에 서 있다 — 클라 `ensurePrimaryConnection` 의 close→connect)는
//   사람 → 사람 칸 목록이 따로 있다(셋째 목록). 제작이력 · 어획 · 신체(추위 · 피로 · 부상 · 사기) · 최대 HP 가 그 목록에 없어 **저장본**(central 행)에서 온다.
//   마지막 저장 뒤 산 몸에서 바뀐 값이면 지금 잃나 — 이 탐침이 잰다.
//
// 차례(판마다 새 손님 하나):
//   ① 손님으로 붙는다(접속 저장 = 행 S0) · `__e2e_give`(도구 · 짐 — 저장한다 = 행 S0')
//   ② `__e2e_body`(저장 안 함 — 족보 ㊻ 픽스처)로 산 몸만 바꾼다: 숙련 · 제작이력 · 원석장부 · 이월 · 어획 · 신체 넷 · HP · 소속
//      ★상황 선행: 행(S0')이 그 값을 **안** 가졌나 — 가졌으면 이 판은 아무것도 재지 않는다
//   ③ 옛 소켓을 연 채 같은 손님 토큰으로 새 소켓 → 승계(`↻ 몸 승계` 로그) → `/bodydbg` 의 새 몸을 ② 의 산 몸과 견준다
//   ④ 새 소켓을 닫는다 → 행이 무엇을 적었나(잃은 값이 행까지 덮이나 = 영구 소실)
//
// 쓰는 법: node scripts/t890-takeover-probe.js [판 수=5]            ← 서버 기본(손잡이 env 그대로)
//          T890_TAKEOVER_BODY=0 node scripts/t890-takeover-probe.js  ← 끔(종전 글자)
'use strict';
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const FB = require('./fixture-boot');
const WebSocket = require('ws');

const ROOT = path.join(__dirname, '..');
const CPORT = 3010, HPORT = 3020;   // central `/zones` 가 존 설정 포트(3020)로 wsUrl 을 낸다 — 기본 포트 그대로
const DDIR = '/tmp/t890-probe';
const N = +(process.argv[2] || 5);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const procs = [];
function boot(file, env) {
  const p = spawn(process.execPath, [path.join(ROOT, 'server', file)], { cwd: ROOT, env: Object.assign({}, process.env, env), stdio: ['ignore', 'pipe', 'pipe'] });
  const lg = fs.createWriteStream(`${DDIR}/${env.ZONE_ID || 'central'}.log`, { flags: 'w' }); p.stdout.pipe(lg); p.stderr.pipe(lg);
  procs.push(p); return p;
}
process.on('exit', () => { for (const p of procs) { try { p.kill('SIGKILL'); } catch (e) {} } });
const jget = async (u) => (await (await fetch(u, { signal: AbortSignal.timeout(5000) })).json());
function open(url) {
  return new Promise((res, rej) => {
    const ws = new WebSocket(url); const st = { ws, welcome: null, kicked: false };
    ws.on('error', rej);
    ws.on('message', (raw) => { let m; try { m = JSON.parse(raw); } catch (e) { return; } if (m.type === 'welcome') { st.welcome = m; res(st); } if (m.type === 'kicked') st.kicked = true; });
  });
}
const pick0 = (o) => { const v = Object.values((o && o.bodies) || {}); return v[v.length - 1]; };
const rowOf = async (pid) => ((await jget(`http://localhost:${CPORT}/player/${encodeURIComponent(pid)}`)) || {}).player || null;
const rowBody = (row) => { try { return JSON.parse((row && row.tools_json) || 'null'); } catch (e) { return null; } };

// 산 몸에만 세울 값(저장 안 함) — 빈 칸({})이 아닌 값이어야 "같다"가 자명하지 않다
const LIVE = { craftSkill: { toolmaking: 7, mining: 3 }, craftLog: { carrier: { n: 1, q: 5 } }, oreLedger: { iron: 1.25 }, oreCarry: { iron: 0.05 },
               fishStats: { caught: 4, maxKg: 2.0, lostMaxKg: 1.5 }, member: { zone: 'hanbando', vid: 7, name: '검사마을', since: 33, wdDay: 33, wdUsed: 2 } };
const SOFT = { cold: 0.8, fatigue: 0.6, injury: 0.4, morale: 0.3 };
const HP = 42;
const LEDGER = ['craftSkill', 'craftLog', 'oreLedger', 'oreCarry', 'fishStats', 'member'];
const J = (x) => JSON.stringify(x === undefined ? null : x);
const softOf = (b) => (b && b.body) ? { cold: +(b.body.cold || 0), fatigue: +(b.body.fatigue || 0), injury: +(b.body.injury || 0), morale: +(b.body.morale || 0) } : null;
const near = (x, y, tol) => !!x && !!y && ['cold', 'fatigue', 'injury', 'morale'].every((k) => Math.abs(x[k] - y[k]) <= tol);
const TOL = 0.05;   // 1~2초 사이 틱이 신체 칸을 움직이는 몫(값 0~1) — `test-handoff-body` softNear 와 같은 뜻

async function trip(k) {
  const Z = (await jget(`http://localhost:${CPORT}/zones`)).zones; const han = Z.hanbando;
  const a = await open(`${han.wsUrl}/?username=&name=tk${k}&color=%23ffffff`);
  const tok = a.welcome.guestToken, pid = a.welcome.playerId;
  a.ws.send(JSON.stringify({ type: '__e2e_give', items: { pillar: 3 }, tools: ['axe', 'pickaxe'], equip: [{ type: 'carrier', lvl: 5 }], quiet: true }));
  await sleep(900);
  a.ws.send(JSON.stringify(Object.assign({ type: '__e2e_body', hp: HP, quiet: true }, SOFT, LIVE)));
  await sleep(700);
  const live = pick0(await jget(`http://localhost:${HPORT}/bodydbg`));
  const row0 = rowBody(await rowOf(pid));
  // 상황 선행 — 행이 산 몸의 값을 아직 안 가졌다(가졌으면 이 판은 아무것도 재지 않는다)
  const stale = LEDGER.filter((f) => J((row0 || {})[f]) !== J(live[f]));
  const softStale = !near(softOf(row0), softOf(live), TOL);
  const hpStale = !(row0 && row0.vital && row0.vital.hp === live.vital.hp);
  const b = await open(`${han.wsUrl}/?username=&name=tk${k}&color=%23ffffff&guest_token=${encodeURIComponent(tok)}`);
  await sleep(900);
  const after = pick0(await jget(`http://localhost:${HPORT}/bodydbg`));
  const nPeople = Object.keys((await jget(`http://localhost:${HPORT}/bodydbg`)).bodies || {}).length;
  try { b.ws.close(); } catch (e) {}
  try { a.ws.close(); } catch (e) {}
  await sleep(1500);
  const row1 = rowBody(await rowOf(pid));
  const lost = LEDGER.filter((f) => J(after[f]) !== J(live[f]));
  const rowLost = LEDGER.filter((f) => J((row1 || {})[f]) !== J(live[f]));
  return {
    k, kicked: a.kicked, samePid: b.welcome.playerId === pid, nPeople, stale, softStale, hpStale,
    tools: J((after.toolItems || []).map((t) => t.type).sort()) === J((live.toolItems || []).map((t) => t.type).sort()),
    lost, softKept: near(softOf(after), softOf(live), TOL), soft: { live: softOf(live), after: softOf(after), row0: softOf(row0) },
    hp: { live: live.vital.hp, after: after.vital && after.vital.hp, row0: row0 && row0.vital && row0.vital.hp },
    rowLost, rowSoftKept: near(softOf(row1), softOf(live), TOL),
  };
}

(async () => {
  fs.rmSync(DDIR, { recursive: true, force: true }); fs.mkdirSync(DDIR, { recursive: true });
  const c = boot('central.js', { PORT: String(CPORT), DB_PATH: `${DDIR}/central.db`, PUBLIC_HOST: 'localhost', ENABLED_ZONES: 'hanbando' });
  if (!(await FB.waitUp(c, /central server up on/, { name: 'central' })).ok) { console.log('central 기동 실패'); process.exit(2); }
  const z = boot('zone.js', { PORT: String(HPORT), ZONE_ID: 'hanbando', DB_PATH: `${DDIR}/w-han.db`, E2E_GIVE: '1', CENTRAL_URL: `http://localhost:${CPORT}`,
    ENABLE_VILLAGES: '0', ENABLE_WILDLIFE: '0', ENABLE_BANDITS: '0', ENABLE_ROADS: '0' });
  if (!(await FB.waitUp(z, /zone server up on/, { name: 'zone', capMs: 300000 })).ok) { console.log('zone 기동 실패'); process.exit(2); }
  console.log(`[T890 탐침] T890_TAKEOVER_BODY=${process.env.T890_TAKEOVER_BODY === undefined ? '(기본)' : process.env.T890_TAKEOVER_BODY} · 판 ${N}`);
  const R = [];
  for (let k = 0; k < N; k++) { const r = await trip(k); R.push(r); console.log(JSON.stringify(r)); }
  const log = fs.readFileSync(`${DDIR}/hanbando.log`, 'utf8');
  //   ★재는 판 = 상황 선행이 선 판(행이 산 몸의 값을 아직 안 가졌다)만 — 그 사이 주기 저장이 끼면 그 판은 아무것도 안 잰다(세지 않는다 · 따로 적는다)
  const M = R.filter((r) => r.stale.length === LEDGER.length && r.softStale && r.hpStale);
  const sum = {
    재는판: M.length, 재는판_장부잃음: M.filter((r) => r.lost.length).length, 재는판_신체이어짐: M.filter((r) => r.softKept).length, 재는판_행영구소실: M.filter((r) => r.rowLost.length || !r.rowSoftKept).length,
    판: R.length, 승계로그: (log.match(/↻ 몸 승계/g) || []).length, 옛소켓kicked: R.filter((r) => r.kicked).length, 같은pid: R.filter((r) => r.samePid).length, 한사람: R.filter((r) => r.nPeople === 1).length,
    행이낡았다: R.filter((r) => r.stale.length === LEDGER.length && r.softStale && r.hpStale).length,
    도구이어짐: R.filter((r) => r.tools).length, 장부칸잃음판: R.filter((r) => r.lost.length).length, 잃은칸: [...new Set(R.flatMap((r) => r.lost))],
    신체이어짐: R.filter((r) => r.softKept).length, HP이어짐: R.filter((r) => r.hp.after !== r.hp.row0 && r.hp.after >= r.hp.live).length,   // HP 는 1초 남짓에 회복으로 오른다 — 저장본 값(100)으로 안 돌아가고 산 값 위면 이어졌다
    행영구소실판: R.filter((r) => r.rowLost.length || !r.rowSoftKept).length, 행잃은칸: [...new Set(R.flatMap((r) => r.rowLost))],
  };
  console.log('[T890 탐침 합] ' + JSON.stringify(sum));
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
