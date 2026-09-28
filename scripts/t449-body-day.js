#!/usr/bin/env node
// === scripts/t449-body-day.js — 결산 문 켬 실측: 관측 마을 하나 · 실제 날 · n일 곳간·인구 곡선 (T449 ②) =================
//
// ⚠**계측기다. 하네스가 아니다 — 러너에 넣지 마라**(`@regress` 없음). 제품 코드는 한 글자도 안 만진다.
//
// ★재는 것 — 같은 새 세계(새 DB · 같은 시딩)를 두 팔로 **나란히**(같은 벽시계) 띄운다:
//     off  종전 — 결산 문 끔(`T449_BODY_DAY` 미설정 · 늘 거짓)
//     on   켬   — `T449_BODY_DAY=1`
//   두 팔 모두 행위 넷(T100 밭 → 곳간 · T368 농부 · T312 어부 · T325 나무꾼 · T347 채집 — T410/T432 의 그 팔) ·
//   실제 날(`VILLAGE_DAY_MS` = 1,440,000 — 틱 자의 규약 ⓒ: 몸 행위는 실제 날로만 잰다) · 관측자 **하나**(두 팔 같은 마을 한가운데).
//   관측자 0 인 마을(나머지 50)은 **대조**다 — 두 팔이 같은 규칙을 탄다(T449 는 관측 마을만 가른다).
// ★읽는 창 — `scripts/t449-probe.js`(예비 적재 · 생활층 `state` 를 SIGUSR2 로 읽는다 · 동작 0).
//   조각(`T449_SAMPLE_S`)마다 관측 마을 한 줄 + 합 · 게임일이 바뀌면 마을 전부(곳간 전부 · 인구 · 식량등가 · 누계).
//
// 실행: node scripts/t449-body-day.js
//   T449_TMP(기본 /tmp/t449) · T449_DAYS(기본 30) · T449_SAMPLE_S(기본 120) · T449_PORT(기본 4400 — 팔마다 +100)
//   T449_OBS(관측 마을 이름 · 기본: 나무꾼+채집꾼이 가장 많은 마을) · T449_OUT(기본 <TMP>/body-day.json) · T449_ARMS(기본 "off,on")
//   T449_ACTS=0 이면 행위 팔을 끈 판(기본 세계 — 대조용)
//   T449_TPL=<존 DB> 이면 새 세계 대신 **그 틀**(T410·T432 의 그 틀 — 200일 · 50마을 · 몸 1,329)을 팔마다 복사해 띄운다
//     ⚠새 세계는 부팅 뒤 마을마다 8명 · 한 직업이라(나무꾼·채집꾼 0) 이 카드가 가르는 칸이 안 선다 — 틀로 잰다.
//   팔 `off2` = 끔 한 번 더(A/A — 같은 규칙 두 판의 차 = 벽시계 잡음 · 관측자 0 마을 "무변"의 자)
'use strict';
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const ROOT = path.join(__dirname, '..');
const TMP = process.env.T449_TMP || '/tmp/t449';
const DAYS = parseInt(process.env.T449_DAYS || '30', 10);
const SAMPLE_S = parseInt(process.env.T449_SAMPLE_S || '120', 10);
const PORT0 = parseInt(process.env.T449_PORT || '4400', 10);
const OUT = process.env.T449_OUT || `${TMP}/body-day.json`;
const ARMS = (process.env.T449_ARMS || 'off,on').split(',').filter(Boolean);
const REAL_DAY_MS = 1440000;   // = `zone-config.js` WORLD.dayLengthMs (T368·T410 의 그 수)
const ACTS = process.env.T449_ACTS === '0' ? {} : { T100_FIELD_YIELD: '1', T368_FARM_ACT: '1', T312_FISH_ACT: '1', T325_WOOD_ACT: '1', T347_FORAGE_ACT: '1' };
const ENV = { off: Object.assign({ T449_BODY_DAY: '' }, ACTS), on: Object.assign({ T449_BODY_DAY: '1' }, ACTS), off2: Object.assign({ T449_BODY_DAY: '' }, ACTS),
  //   ★[T491] 팔 둘 더 — `t491` = 일괄을 몸에서 유도(`T491_BATCH_FROM_BODY=1` · 결산 문 끔) · `both` = 둘 다 켬(관측 마을은 몸 · 나머지는 몸에서 유도한 일괄)
  //     `t491b` = `t491` 한 번 더(A/A)
  t491: Object.assign({ T449_BODY_DAY: '', T491_BATCH_FROM_BODY: '1' }, ACTS), t491b: Object.assign({ T449_BODY_DAY: '', T491_BATCH_FROM_BODY: '1' }, ACTS),
  both: Object.assign({ T449_BODY_DAY: '1', T491_BATCH_FROM_BODY: '1' }, ACTS),
  //   ★[T491 ② 되물음] 몸이 안 멈추면(`scripts/t491-whatif-probe.js` 로 띄울 때만 뜻이 있다) — `wa` 빈 셀 건너기 · `wb` + 곳간 사다리에서 목재도 내림
  wa: Object.assign({ T449_BODY_DAY: '', T491_WHATIF: 'a' }, ACTS), wb: Object.assign({ T449_BODY_DAY: '', T491_WHATIF: 'b' }, ACTS),
  //   ★[T491 ④ 대조] 나무꾼이 앓은 날(`scripts/t491-injure-probe.js` 로 띄울 때만 뜻이 있다 · 마을은 `T491_INJURE_VIL`) — 끔 · T449 켬 · T491 켬
  ioff: Object.assign({ T449_BODY_DAY: '' }, ACTS), ion: Object.assign({ T449_BODY_DAY: '1' }, ACTS), it491: Object.assign({ T449_BODY_DAY: '', T491_BATCH_FROM_BODY: '1' }, ACTS) };
//   ★[T491] 들여다보기 창 — 기본은 T449 의 그 창 · `T449_PROBE=scripts/t491-probe.js` 면 몸의 하루까지(그 창이 T449 창을 같이 싣는다)
const PROBE = process.env.T449_PROBE || 'scripts/t449-probe.js';
const TPL = process.env.T449_TPL || '';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const say = (...a) => console.log(`[${new Date().toISOString().slice(11, 19)}]`, ...a);
const rmdb = (f) => { for (const s of ['', '-wal', '-shm']) { try { fs.unlinkSync(f + s); } catch (e) {} } };
const cpdb = (a, b) => { rmdb(b); for (const s of ['', '-wal', '-shm']) { try { fs.copyFileSync(a + s, b + s); } catch (e) {} } };
fs.mkdirSync(TMP, { recursive: true });
if (TPL && !fs.existsSync(TPL)) { console.error('틀이 없다 —', TPL); process.exit(3); }

function boot(tag, env, i) {
  const SECRET = 't449-' + tag, CP = PORT0 + i * 100, ZP = CP + 10;
  const cdb = `${TMP}/c-${tag}.db`, zdb = `${TMP}/z-${tag}.db`; rmdb(cdb); if (TPL) cpdb(TPL, zdb); else rmdb(zdb);
  const logf = fs.openSync(`${TMP}/${tag}.log`, 'w');
  const c = spawn(process.execPath, [path.join(ROOT, 'server/central.js')], { cwd: ROOT, stdio: 'ignore',
    env: Object.assign({}, process.env, { PORT: String(CP), DB_PATH: cdb, PUBLIC_HOST: 'localhost', ENABLED_ZONES: 'hanbando', CENTRAL_SECRET: SECRET }) });
  const probeOut = `${TMP}/${tag}.probe.json`;
  const z = spawn(process.execPath, ['-r', path.join(ROOT, PROBE), path.join(ROOT, 'server/zone.js')], { cwd: ROOT, stdio: ['ignore', logf, logf],
    env: Object.assign({}, process.env, { PORT: String(ZP), ZONE_ID: 'hanbando', CENTRAL_HOST: 'localhost', CENTRAL_PORT: String(CP), CENTRAL_SECRET: SECRET,
      DB_PATH: zdb, ENABLE_VILLAGES: '1', VILLAGE_DAY_MS: String(REAL_DAY_MS), VILLAGE_WAR_LOG: '0', T449_PROBE_OUT: probeOut,
      T491_PROBE_OUT: `${TMP}/${tag}.body.json`, T491_TRACE_OUT: `${TMP}/${tag}.trace.jsonl` }, env) });
  const getj = async (p) => { try { const r = await fetch(`http://localhost:${ZP}${p}`, { headers: { 'x-zone-secret': SECRET }, signal: AbortSignal.timeout(20000) }); return await r.json(); } catch (e) { return null; } };
  const health = async () => { try { return (await fetch(`http://localhost:${ZP}/health`, { signal: AbortSignal.timeout(5000) })).ok; } catch (e) { return false; } };
  let ws = null, pinger = null;
  const observe = (ax, ay) => {
    const WS = require(path.join(ROOT, 'node_modules', 'ws'));
    ws = new WS(`ws://localhost:${ZP}/?observer=1`); ws.on('error', () => {}); ws.on('message', () => {});
    const look = () => { try { ws.send(JSON.stringify({ type: 'viewport_update', x: ax, y: ay, w: 2000, h: 2000 })); } catch (e) {} };
    ws.on('open', look); pinger = setInterval(look, 5000);
  };
  const probe = async () => {
    try { fs.unlinkSync(probeOut); } catch (e) {}
    try { process.kill(z.pid, 'SIGUSR2'); } catch (e) { return null; }
    for (let k = 0; k < 150; k++) { await sleep(100); try { const j = JSON.parse(fs.readFileSync(probeOut, 'utf8')); return j; } catch (e) {} }
    return null;
  };
  const alive = () => { try { process.kill(z.pid, 0); return true; } catch (e) { return false; } };
  const kill = async () => { clearInterval(pinger); try { ws && ws.close(); } catch (e) {} try { z.kill('SIGINT'); } catch (e) {} await sleep(3000);
    try { z.kill('SIGKILL'); } catch (e) {} try { c.kill('SIGKILL'); } catch (e) {} await sleep(300); };
  const perf = async () => { const p = await getj('/perf?reset=1'); const t = p && p.tick && p.tick.ms; return t ? { p50: t.p50, p95: t.p95, n: t.n, cut: p.walk ? p.walk.cutTicks : null } : null; };   // 틱 값(팔 사이 벽시계가 같았나 — 읽기만)
  return { tag, z, c, getj, health, observe, probe, alive, kill, perf };
}
const tot = (rows, skip) => { const o = { pop: 0, fe: 0, wood: 0, houses: 0, woodBody: 0, forageBody: 0, seen: 0 };
  for (const r of rows) { if (r.n === skip) continue; o.pop += r.pop || 0; o.fe += r.fe || 0; o.wood += r.wood || 0; o.houses += r.houses || 0;
    if (r.t449) { o.woodBody += r.t449.woodBody || 0; o.forageBody += r.t449.forageBody || 0; o.seen += r.t449.seen || 0; } }
  o.fe = +o.fe.toFixed(2); o.wood = +o.wood.toFixed(2); return o; };

(async () => {
  const B = ARMS.map((a, i) => boot(a, ENV[a] || {}, i));
  say(`부팅 — 팔 ${ARMS.join(' · ')} · 실제 날 ${REAL_DAY_MS}ms · 행위 ${Object.keys(ACTS).length ? Object.keys(ACTS).join('·') : '끔'} · ${DAYS}일 · 조각 ${SAMPLE_S}초 · 세계 ${TPL ? '틀 ' + path.basename(TPL) : '새 DB'}`);
  const t0 = Date.now();
  for (const b of B) { while (!(await b.health())) { if (Date.now() - t0 > 600000) { say(`${b.tag} 부팅 실패`); process.exit(1); } await sleep(2000); } }
  //   시딩이 끝날 때까지(마을이 영토를 가질 때까지)
  let L = null;
  for (;;) { L = await B[0].getj('/lifedbg'); const n = L && L.villages ? L.villages.filter((v) => v.terr > 0).length : 0; if (n >= 10) break; if (Date.now() - t0 > 900000) { say('시딩 대기 초과'); process.exit(1); } await sleep(3000); }
  say(`부팅 ${((Date.now() - t0) / 1000).toFixed(0)}초 — 마을 ${L.villages.length}`);
  //   ★부팅 직후엔 econ 이 직업을 아직 안 나눴다(모두 기본 직업) ⇒ **첫 하루 경계**를 넘긴 뒤 고른다(자의 규약 ⓐ — 셈도 그 뒤부터)
  { const p0 = await B[0].probe(); const d0 = p0 ? p0.day : null;
    for (;;) { await sleep(30000); const p = await B[0].probe(); if (p && p.day !== d0) break; if (Date.now() - t0 > 3600000) { say('첫 경계 대기 초과'); process.exit(1); } }
    await sleep(20000); L = await B[0].getj('/lifedbg');
    say(`첫 경계 지남(게임일 ${d0} → 다음) — 직업을 보고 관측 마을을 고른다`); }
  //   관측 마을 — 첫 경계 뒤 **행위가 살아 있는** 칸의 나무꾼 + 채집꾼이 가장 많은 마을(동률이면 어부 · 이름 순) · 팔마다 같은 세계라 같은 마을이다(확인한다)
  //     "살아 있는" = 그 절이 켜졌고(`woodActOn`·`forageActOn` — 프로브의 `wd.on`·`fd.on`) 벨 나무·딸 군락 셀이 있다(`cells` > 0).
  //     ⚠왜 — 틀 세계에서 T347 을 켠 **첫 경계의 일괄이 군락을 N = 0 까지 딴다**(49마을 178그루) · 로지스틱 재생은 0 에서 안 돈다(`actRegrowPerDay`)
  //       ⇒ 그날 뒤 채집 절이 켜진 마을은 10 뿐이다. 절이 죽은 마을을 보면 결산 문이 가를 칸이 **없다**(첫 판 · 어촌2 — 보고 §2).
  //   ⚠부팅 직후 몸의 직업 칸(`jobs`)은 아직 기본값이다 — econ 이 정한 직업 수(`econCounts`)로 센다
  let pick = null;
  if (process.env.T449_OBS) pick = L.villages.find((v) => v.name === process.env.T449_OBS) || null;
  const ec = (v, j) => (v.econCounts && v.econCounts[j]) || 0;
  const P0 = await B[0].probe(); const rowOf = new Map(((P0 && P0.rows) || []).map((x) => [x.n, x]));
  //     ⚠프로브의 `cells` 는 그날 절 **머리**의 셈(딴 뒤가 아니다) — 그날 일괄이 딴 수(`pick`·`cut`)를 빼야 남은 셀이다(첫 판은 이것을 놓쳐 죽은 마을을 골랐다)
  const live = (v) => { const x = rowOf.get(v.name); if (!x) return { w: 0, f: 0 };
    return { w: (x.wd && x.wd.on && x.wd.cells > (x.wd.cut || 0)) ? ec(v, 'lumberjack') : 0, f: (x.fd && x.fd.on && x.fd.cells > (x.fd.pick || 0)) ? ec(v, 'forager') : 0 }; };
  const sc = (v) => { const q = live(v); return q.w + q.f; };
  const cand = [...L.villages].filter((v) => v.terr > 0).sort((a, b) => sc(b) - sc(a) || (ec(b, 'fisher') - ec(a, 'fisher')) || (ec(b, 'farmer') - ec(a, 'farmer')) || (a.name < b.name ? -1 : 1));
  say(`후보(살아 있는 절의 나무꾼+채집꾼 econ 수) ${cand.slice(0, 6).map((v) => { const q = live(v); return `${v.name} ${q.w}+${q.f}(econ ${ec(v, 'lumberjack')}+${ec(v, 'forager')}) 어 ${ec(v, 'fisher')} 농 ${ec(v, 'farmer')} 인 ${v.pop}`; }).join(' · ')}`);
  if (!pick) pick = cand[0];
  for (const b of B.slice(1)) { const L2 = await b.getj('/lifedbg'); const v2 = L2 && L2.villages && L2.villages.find((v) => v.name === pick.name);
    if (!v2 || v2.ccx !== pick.ccx || v2.ccy !== pick.ccy) say(`⚠${b.tag}: 관측 마을이 다르다(${v2 ? v2.ccx + ',' + v2.ccy : '없음'})`); }
  const ax = pick.ccx * 32 + 16, ay = pick.ccy * 32 + 16;
  for (const b of B) b.observe(ax, ay);
  say(`관측 마을 ${pick.name} @(${pick.ccx},${pick.ccy}) · 몸 직업 ${JSON.stringify(pick.jobs)} · econ 직업 ${JSON.stringify(pick.econCounts)} · 관측자 팔마다 같은 점`);
  const res = { at: new Date().toISOString(), days: DAYS, sampleS: SAMPLE_S, dayMs: REAL_DAY_MS, acts: ACTS, tpl: TPL || null, obs: { name: pick.name, ccx: pick.ccx, ccy: pick.ccy, jobs: pick.jobs, econCounts: pick.econCounts || null, pop: pick.pop }, arms: {} };
  for (const b of B) res.arms[b.tag] = { env: ENV[b.tag], days: [], samples: [] };
  const lastDay = {}; const nDays = {};
  //   ★셈의 영점 — 관측자를 세운 지금(첫 경계 뒤 그날)의 마을 전부를 한 줄로 적고, 그날부터 경계를 ${DAYS}번 센다
  for (const b of B) { const p = await b.probe(); lastDay[b.tag] = p ? p.day : null; nDays[b.tag] = 0; if (p && p.rows) res.arms[b.tag].days.push({ t: p.t, day: p.day, rows: p.rows, zero: 1 }); }
  say(`시작 게임일 ${JSON.stringify(lastDay)} — 이날부터 경계 ${DAYS}번을 센다`);
  const save = () => { try { fs.writeFileSync(OUT + '.tmp', JSON.stringify(res)); fs.renameSync(OUT + '.tmp', OUT); } catch (e) {} };
  const started = {}; for (const b of B) started[b.tag] = true;
  for (;;) {
    await sleep(SAMPLE_S * 1000);
    let done = true;
    for (const b of B) {
      if (!b.alive()) { say(`⚠${b.tag} 존이 죽었다`); continue; }
      const p = await b.probe(); if (!p || !p.rows) { say(`⚠${b.tag} 창 실패 ${p && p.err}`); done = false; continue; }
      const o = p.rows.find((r) => r.n === pick.name) || null;
      const A = res.arms[b.tag];
      A.samples.push({ t: p.t, day: p.day, o, tot: tot(p.rows, pick.name), perf: await b.perf() });
      if (p.day !== lastDay[b.tag]) {
        if (started[b.tag]) nDays[b.tag]++;
        started[b.tag] = true;
        lastDay[b.tag] = p.day;
        A.days.push({ t: p.t, day: p.day, rows: p.rows });
        const T = o && o.t449;
        say(`${b.tag} 게임일 ${p.day} (${nDays[b.tag]}/${DAYS}) · 관측 ${pick.name} 인구 ${o && o.pop} · 식량등가 ${o && o.fe} · 목재 ${o && o.wood} · 집 ${o && o.houses} · 나무 몸/일괄 손 ${o && o.wd ? o.wd.walked + '/' + o.wd.cut : '-'} · 채집 ${o && o.fd ? o.fd.walked + '/' + o.fd.pick : '-'} · 결산 문 ${T ? JSON.stringify(T) : '-'} │ 나머지 ${JSON.stringify(tot(p.rows, pick.name))}`);
      }
      if (nDays[b.tag] < DAYS) done = false;
    }
    save();
    if (done) break;
  }
  say('끝 — 끈다');
  for (const b of B) await b.kill();
  save();
  say(`→ ${OUT}`);
})().catch((e) => { console.error(e); process.exit(1); });
