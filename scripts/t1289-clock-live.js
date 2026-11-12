#!/usr/bin/env node
'use strict';
// (@regress 없음 — 러너 밖 · T1289 실클라 판 · 판 하나 = 존 · central · Chromium 하나 · 포트 3010/3020 — E2E 동시 실행 금지)
// === scripts/t1289-clock-live.js — 벽시계 실클라 판의 마감 틈 몫: 틈 빈도 · 틈에 장인 머묾이 바뀐 번 · 곳간 차 (T1289 · T1282 회부 1 · 2 · 2026-11-12) ==========
//
// ★왜 [T1282 회부 1 · 2] 라이브 서버는 벽시계다 — 마감(현지 자정 창 머리)을 연 틱의 드레인이 econ 머리(`world.day += 1`)까지 못 가면
//   (공유 예산 바닥) 그 틱부터 머리까지 "마감 틈"이 선다. 틈에는 앵커(`lastGameDay` · `_t731Anchor`)가 이미 새 날 · world.day 는 닫는 날이라
//   econ 날 시계가 축을 섞었다(T1282 앞: 그날 머리 · T1289 앞: `econDayToMs` 가 하루 늦은 경계). 장인 몸(`_t1196Step`)은 틈에도 돌고 곳간에 닿는다.
//   가상 시계 기준선은 마감이 한 드레인이라 틈을 못 본다 — 이 판이 잰다.
//
// ★판 둘(같은 env · 같은 시드 세계 · 판마다 새 DB):
//   after  — 이 가지(`server/villages.js` 그대로 · T1282 + T1289)
//   before — 존 아이가 `server/villages.js` 를 실을 때 `a6b7aba5d`(T1282 앞 · land1068) 글자를 싣는다(파일 무변 · `git show` 를 TMP 에 써서 그것을 컴파일 · 파일 이름은 그대로라 상대 require 는 같다)
//   env: ENABLE_VILLAGES=1 · VILLAGE_DAY_MS(기본 240000 = 4분 하루) · 그 밖 기본(T731 창 · T1182 몸 · T707 장 · T1196 장인 · T1258 장인 시계 켬).
//
// ★자(서버 쪽 · 셈만 · 세계 0): 존 아이에 이 파일을 `node -r` 로 미리 실어 `villages.js` 글자에 셈 문 넷을 끼운다(두 판 같은 자리 · 같은 글자):
//   ① `_openDayJobs` 머리 — 하루 마감 · 창 머리를 연 순간 닫는 날 Dc 를 적는다(마감 수)
//   ② `onGameTick` 끝 — 그 틱 끝에 틈(마감 · 창 · 경계 틱이고 world.day = Dc)이 남았으면 틈 틱 · 그 마감은 "틈 선 마감"
//   ③ `econDayToMs` 머리 — 틈에 부른 자리(부른 함수 이름 · 스택 한 줄)를 센다(전수 표 "틈에 불리나" 칸의 라이브 증인)
//   ④ `_t1196Step` 겉 — 틈에 부른 장인 걸음: 머묾 단계가 바뀐 번(인출 끝 · 제작 끝 · 저장 끝) · 곳간 움직임(그 걸음 앞뒤 곳간 칸 차 합) ·
//      그림자 견줌(그 걸음 앞 머묾이 종전 틈 시계 Dc × 하루 · 지금 틈 시계 (Dc + 1) × 하루로 끝나는지가 갈린 번 — 판과 무관한 같은 자)
//   클라(Chromium)는 마을 존에 들어가 판 내내 서 있다(존이 사람 있는 존으로 돈다 · 그림은 안 잰다).
//
// 쓰는 법: node scripts/t1289-clock-live.js --arm after|before [--obs 1500] [--day 240000] [--out 계측/T1289_2026-11-12/live_after_1.json]
if (process.env.T1289_LIVE && require.main !== module) {   // ── 미리 실림(존 아이) — 셈 문 넷(+ before 판 = 옛 글자)
  if (!require('worker_threads').isMainThread) return;   // 일꾼 스레드(길 · 걸음표)도 `-r` 을 물려받는다 — 셈은 존 본 스레드만(일꾼이 빈 셈으로 파일을 덮지 않게)
  const path = require('path'), fs = require('fs'), Module = require('module');
  const VFILE = path.join(__dirname, '..', 'server', 'villages.js');
  const OUT = process.env.T1289_OUT, SRCF = process.env.T1289_SRC || null;
  const G = { arm: process.env.T1289_LIVE, D: null, cur: null, closes: [], gapTicks: 0, edm: {}, edmAll: 0,
    art: { calls: 0, gapCalls: 0, trans: {}, take: 0, give: 0, gapTake: 0, gapGive: 0, gapOut: 0, gapIn: 0, shadow: 0, shadowBy: {}, shadowOut: 0, shadowIn: 0 }, gran: null, t0: Date.now() };
  const gap = (s) => !!((s.tickJobs || s._t731 || s._t1253Edge) && s.world && G.D != null && G.D === (s.world.day | 0));
  const stor = (e) => { const o = {}; if (e && e.storage) for (const k in e.storage) o[k] = +e.storage[k] || 0; return o; };
  const units = (a, b) => { let out = 0, inn = 0; for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) { const d = (b[k] || 0) - (a[k] || 0); if (d < 0) out -= d; else inn += d; } return [out, inn]; };
  const tSum = (t, k, f) => { let s = 0; if (t && t[k]) for (const x in t[k]) s += (+t[k][x] || 0) * (f == null ? 1 : f); return s; };
  global.__T1289 = {
    open(s, T) { if (T && !T.head) return; G.D = s.world ? (s.world.day | 0) : null; G.cur = { d: G.D, at: Date.now() - G.t0, gapTicks: 0, headMs: null, art: 0, artTrans: 0, shadow: 0 }; G.closes.push(G.cur); },
    tickEnd(s) {
      const c = G.cur; if (!c) return;
      if (gap(s)) { c.gapTicks++; G.gapTicks++; }
      else if (c.headMs == null && s.world && (s.world.day | 0) > c.d) c.headMs = Date.now() - G.t0 - c.at;
    },
    edm(s) {
      G.edmAll++;
      if (!gap(s)) return;
      const L = new Error().stack.split('\n'); let fn = '?';
      for (let i = 2; i < L.length; i++) { const m = L[i].match(/at (?:Object\.|new )?([\w$.]+) /); if (m && m[1] !== 'econDayToMs') { fn = m[1]; break; } }
      G.edm[fn] = (G.edm[fn] || 0) + 1;
    },
    art(s, vil, npc, job, raw, stat, dwOf) {
      G.art.calls++;
      const tk0 = stat.take, gv0 = stat.give;
      if (!gap(s)) { const r = raw(); G.art.take += stat.take - tk0; G.art.give += stat.give - gv0; return r; }
      G.art.gapCalls++; if (G.cur) G.cur.art++;
      const W0 = npc._t1196W ? Object.assign({}, npc._t1196W) : null, J0 = npc._t1196J, e = vil && vil.econ;
      const Q = e && e._t1196Q, t = (Q && J0 != null) ? Q.find((x) => x.id === J0) : null;
      //   그림자 — 이 걸음 앞 머묾(시각이 선 머묾)이 종전 틈 시계(Dc × 하루)와 지금 틈 시계((Dc + 1) × 하루)에서 끝나는지
      if (W0 && W0.at && (W0.ph === 'draw' || W0.ph === 'back' || W0.ph === 'work') && s.world) {
        const M = s.dayMs || 1, D = s.world.day | 0, dw = dwOf(W0.ph), a = (D * M - W0.at) >= dw, b = ((D + 1) * M - W0.at) >= dw;
        if (a !== b) { G.art.shadow++; G.art.shadowBy[W0.ph] = (G.art.shadowBy[W0.ph] || 0) + 1; if (G.cur) G.cur.shadow++;
          if (W0.ph === 'draw' && t) G.art.shadowOut += tSum(t, 'take'); if (W0.ph === 'back' && t) G.art.shadowIn += tSum(t, 'give', t.f); }
      }
      const s0 = stor(e), r = raw(), s1 = stor(e), [o, i] = units(s0, s1);
      G.art.take += stat.take - tk0; G.art.give += stat.give - gv0; G.art.gapTake += stat.take - tk0; G.art.gapGive += stat.give - gv0; G.art.gapOut += o; G.art.gapIn += i;
      const W1 = npc._t1196W;
      if (W0 && (!W1 || W1.ph !== W0.ph)) { const k = W0.ph + '>' + (W1 ? W1.ph : 'end'); G.art.trans[k] = (G.art.trans[k] || 0) + 1; if (G.cur) G.cur.artTrans++; }
      return r;
    },
    gran(s) { let tot = 0, n = 0; for (const v of (s.world && s.world.villages) || []) { n++; for (const k in (v.storage || {})) tot += +v.storage[k] || 0; } G.gran = { villages: n, units: +tot.toFixed(3), day: s.world ? s.world.day : null }; },
  };
  let lastS = null;
  const flush = () => { try { if (lastS) global.__T1289.gran(lastS); fs.writeFileSync(OUT, JSON.stringify(G)); } catch (e) {} };
  setInterval(flush, 5000).unref(); process.on('exit', flush); process.on('SIGTERM', () => { flush(); process.exit(0); });
  const INJ = [
    ['function onGameTick(now) {', 'function onGameTick(now) { const __r = __t1289OnGameTickRaw(now); global.__T1289.tickEnd(state); global.__t1289S = state; return __r; }\nfunction __t1289OnGameTickRaw(now) {'],
    ['function _openDayJobs(now, T) {', 'function _openDayJobs(now, T) { global.__T1289.open(state, T);'],
    ['function econDayToMs(econDay) {', 'function econDayToMs(econDay) { global.__T1289.edm(state);'],
    ['function _t1196Step(vil, npc, now0, job) {', 'function _t1196Step(vil, npc, now0, job) { return global.__T1289.art(state, vil, npc, job, () => __t1289ArtRaw(vil, npc, now0, job), _t1196Stat, (ph) => ph === \'draw\' ? G_DRAWW : ph === \'back\' ? G_STOREW : _t1196CraftMs(T1196_KIND[job])); }\nfunction __t1289ArtRaw(vil, npc, now0, job) {'],
  ];
  const old = Module._extensions['.js'];
  Module._extensions['.js'] = function (m, f) {
    if (f !== VFILE) return old(m, f);
    let src = fs.readFileSync(SRCF || f, 'utf8');
    for (const [a, b] of INJ) { const n = src.split(a).length - 1; if (n !== 1) { console.error(`[T1289 자] 자리 ${n}곳 — ${a} — 멈춤`); process.exit(3); } src = src.replace(a, b); }
    console.log(`[T1289 자] 판 ${G.arm} — 셈 문 ${INJ.length} 끼움${SRCF ? ' · 옛 글자 ' + path.basename(SRCF) : ''}`);
    m._compile(src, f);
  };
  setInterval(() => { if (global.__t1289S) lastS = global.__t1289S; }, 1000).unref();
  return;
}
const path = require('path'), fs = require('fs');
const { spawn, execFileSync } = require('child_process');
const FB = require('./fixture-boot');
const ROOT = path.join(__dirname, '..');
const A = process.argv.slice(2), opt = (k, d) => { const i = A.indexOf(k); return i >= 0 ? A[i + 1] : d; };
const ARM = opt('--arm', 'after'), OBS = +opt('--obs', 1500) * 1000, DAY = +opt('--day', 240000), OUT = opt('--out', null), BEFORE_REV = opt('--rev', 'a6b7aba5d');
const CPORT = 3010, ZPORT = 3020;
const TMP = fs.mkdtempSync(path.join(require('os').tmpdir(), 't1289-live-'));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const procs = [];
function boot(tag, args, env) {
  const p = spawn(process.execPath, args, { env: { ...process.env, ...env }, stdio: ['ignore', 'pipe', 'pipe'], cwd: ROOT });
  p._name = tag; p._out = '';
  const keep = (d) => { p._out += d.toString(); if (p._out.length > 400000) p._out = p._out.slice(-200000); };
  p.stdout.on('data', keep); p.stderr.on('data', keep);
  procs.push(p); return p;
}
async function killAll() {
  for (const p of procs) { try { fs.writeFileSync(path.join(TMP, `${p._name}.log`), p._out.slice(-100000)); } catch (e) {} try { p.kill('SIGTERM'); } catch (e) {} }
  await sleep(4000);
  for (const p of procs) { try { p.kill('SIGKILL'); } catch (e) {} }
  procs.length = 0; await sleep(1000);
}
(async () => {
  FB.reapOnExit(procs);
  FB.mustBeFree([CPORT, ZPORT], 't1289-clock-live');
  const env0 = {};
  if (ARM === 'before') { const src = execFileSync('git', ['show', `${BEFORE_REV}:server/villages.js`], { cwd: ROOT, maxBuffer: 1 << 28 }); const f = path.join(TMP, `villages-${BEFORE_REV}.js`); fs.writeFileSync(f, src); env0.T1289_SRC = f; }
  const stat = path.join(TMP, 'zone-stat.json');
  const dbc = path.join(TMP, 'c.db'), dbz = path.join(TMP, 'z.db');
  const t0 = Date.now();
  const central = boot('central', [path.join(ROOT, 'server', 'central.js')], { PORT: String(CPORT), DB_PATH: dbc, PUBLIC_HOST: 'localhost', ENABLED_ZONES: 'hanbando' });
  const upC = FB.waitUp(central, /central server up on/, { name: 'central' });
  const zone = boot('zone', ['-r', __filename, path.join(ROOT, 'server', 'zone.js')], { PORT: String(ZPORT), ZONE_ID: 'hanbando', CENTRAL_URL: `http://localhost:${CPORT}`, DB_PATH: dbz, ENABLE_VILLAGES: '1', VILLAGE_DAY_MS: String(DAY),
    T1289_LIVE: ARM, T1289_OUT: stat, ...env0 });
  const upZ = FB.waitUp(zone, /zone server up on/, { name: 'zone', capMs: 300000 });
  const uc = await upC, uz = await upZ;
  console.log(`판 ${ARM} · 하루 ${DAY}ms · 보기 ${OBS / 1000}초 — central ${uc.ok ? uc.ms + 'ms' : uc.why} · zone ${uz.ok ? uz.ms + 'ms' : uz.why} · 자 줄 ${/\[T1289 자\]/.test(zone._out)}`);
  if (!uc.ok || !uz.ok) { await killAll(); process.exit(2); }
  const { chromium } = require('playwright');
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 960, height: 600 } });
  let perr = 0; page.on('pageerror', () => perr++);
  await page.goto(`http://localhost:${CPORT}/`, { waitUntil: 'domcontentloaded' });
  await sleep(2500);
  const enter = await page.$('#enter'); if (enter) await enter.click();
  let inWorld = false;
  for (let i = 0; i < 120 && !inWorld; i++) { inWorld = await page.evaluate(() => !!(window.__getSrvAbs && window.__getSrvAbs())); if (!inWorld) await sleep(500); }
  console.log(`  월드 입장 ${inWorld} · ${((Date.now() - t0) / 1000) | 0}초`);
  const tObs = Date.now();
  while (Date.now() - tObs < OBS) {
    await sleep(30000);
    let g = null; try { g = JSON.parse(fs.readFileSync(stat, 'utf8')); } catch (e) {}
    if (g) console.log(`  ${((Date.now() - tObs) / 1000) | 0}초 — econDayToMs ${g.edmAll} · 곳간 ${g.gran ? g.gran.day : "—"}날 · 마감 ${g.closes.length} · 틈 선 마감 ${g.closes.filter((c) => c.gapTicks > 0).length} · 틈 틱 ${g.gapTicks} · 장인 틈 걸음 ${g.art.gapCalls} · 그림자 ${g.art.shadow}`);
  }
  try { await browser.close(); } catch (e) {}
  await killAll();
  let g = null; try { g = JSON.parse(fs.readFileSync(stat, 'utf8')); } catch (e) {}
  const dayLines = (fs.existsSync(path.join(TMP, 'zone.log')) ? fs.readFileSync(path.join(TMP, 'zone.log'), 'utf8') : '').match(/마을 econ day \d+:[^\n]*마감 \d+ms/g) || [];
  const R = { arm: ARM, dayMs: DAY, obsS: OBS / 1000, inWorld, pageErrors: perr, wallS: Math.round((Date.now() - t0) / 1000), rev: ARM === 'before' ? BEFORE_REV : 'HEAD', stat: g,
    closeMs: dayLines.map((l) => [+(l.match(/econ day (\d+)/)[1]), +(l.match(/마감 (\d+)ms/)[1])]) };
  if (g) {
    const C = g.closes, withGap = C.filter((c) => c.gapTicks > 0);
    R.sum = { closes: C.length, gapCloses: withGap.length, gapTicks: g.gapTicks, gapTicksMax: Math.max(0, ...C.map((c) => c.gapTicks)), headMsMax: Math.max(0, ...C.map((c) => c.headMs || 0)),
      artGapCalls: g.art.gapCalls, artGapTrans: Object.values(g.art.trans).reduce((s, x) => s + x, 0), artTrans: g.art.trans, artShadow: g.art.shadow, artShadowBy: g.art.shadowBy,
      gapTake: g.art.gapTake, gapGive: g.art.gapGive, gapUnitsOut: +g.art.gapOut.toFixed(4), gapUnitsIn: +g.art.gapIn.toFixed(4), shadowUnitsOut: +g.art.shadowOut.toFixed(4), shadowUnitsIn: +g.art.shadowIn.toFixed(4),
      take: g.art.take, give: g.art.give, edmGap: g.edm, granary: g.gran };
    console.log(`\nT1289-LIVE ${ARM} · 마감 ${C.length} · 틈 선 마감 ${withGap.length} · 틈 틱 ${g.gapTicks}(마감 하나 최대 ${R.sum.gapTicksMax}) · 장인 틈 걸음 ${g.art.gapCalls} · 틈에 머묾 바뀜 ${R.sum.artGapTrans} ${JSON.stringify(g.art.trans)} · 그림자 갈림 ${g.art.shadow} · 틈 곳간 −${R.sum.gapUnitsOut} +${R.sum.gapUnitsIn} · 틈 econDayToMs ${JSON.stringify(g.edm)} · 곳간 ${g.gran && g.gran.units}`);
  } else console.log('\nT1289-LIVE 자 파일 없음');
  if (OUT) { fs.mkdirSync(path.dirname(path.resolve(ROOT, OUT)), { recursive: true }); fs.writeFileSync(path.resolve(ROOT, OUT), JSON.stringify(R, null, 1)); }
  try { fs.rmSync(TMP, { recursive: true, force: true }); } catch (e) {}
  process.exit(0);
})().catch(async (e) => { console.error(e); await killAll(); try { fs.rmSync(TMP, { recursive: true, force: true }); } catch (x) {} process.exit(1); });
