#!/usr/bin/env node
// @regress   ← 통합 러너가 이 표를 보고 자기 목록을 만든다(scripts/run-regress.sh · 표 없으면 안 돈다)
// === scripts/test-t1306-migrate-food.js — T1306: 이주도 받는 마을 곳간을 본다 · 소문으로 아는 만큼(`T1306_MIGRATE_FOOD` · T1297 켬 안) ======
//   진짜 서버 함수(`villages._t1147Pick` · `_t1306Record` · `_t1306Known` · `_t1306Pass`)를 존을 띄워 부른다 — 마을 행복 · 침상 · 곳간 · 들은 줄만 판 꾸밈으로 세운다.
//   ① 하루 한 줄(곳간 · 사람 수 · 오늘 날) · 같은 날 두 번이면 덮는다 · ② 소식이 아직 안 닿음(오늘 줄뿐) = 모른다 → 안 간다
//   ③ 들은 곳간이 넉넉 → 행복이 가장 높은 곳 · ④ 들은 곳간이 얇으면(지금 곳간이 넉넉해도) 건너뛴다 · ⑤ 들은 곳간이 넉넉하면(지금은 비었어도) 간다 — 아직 모른다
//   ⑥ 도달 일수보다 새 줄은 안 듣는다 · ⑦ 겨울 문턱(듣는 날의 출생 문 날 수 — 봄까지 남은 날) · ⑧ 모르는 마을 · 셈 칸
//   ⑨ 끔(T1306 끔 · T1297 켬) = 종전 줄 그대로(지금 곳간 · 3일치) · ⑩ T1297 끔이면 이주 문도 꺼진다
//   ★미끼 — `_t1306Pass` 사본에서 들은 줄 대신 지금 곳간을 읽게(모르는 곳간을 읽는 사본) → ④ 를 놓친다(빨강).
'use strict';
if (process.env.T474_CARAVAN_WALK === undefined) process.env.T474_CARAVAN_WALK = '0';   // test-t1147-emig-pick 과 같은 판(교역로 4일 이웃 표본)
const path = require('path');
const fs = require('fs');
const { execFileSync } = require('child_process');
const ROOT = path.join(__dirname, '..');
let pass = 0, fail = 0;
const ok = (c, m, x) => { c ? pass++ : fail++; console.log((c ? '  ✓ ' : '  ✗ ') + m + (x !== undefined ? '  ' + JSON.stringify(x) : '')); };

if (process.argv[2] === '--child') {
  const mode = process.argv[3];
  const R = {};
  (async () => {
    const TMP = `/tmp/test-t1306-${process.pid}.db`;
    for (const f of [TMP, TMP + '-wal', TMP + '-shm']) { try { fs.unlinkSync(f); } catch (e) {} }
    Object.assign(process.env, { ZONE_ID: 'hanbando', PORT: String(require('./lib-port').port(44100 + (mode === 'on' ? 0 : mode === 'off' ? 1 : 2))), DB_PATH: TMP, ENABLE_VILLAGES: '1', ENABLE_WILDLIFE: '0', ENABLE_BANDITS: '0', LATENCY_MS: '0' });
    const _l = console.log, _w = console.warn, _e = console.error;
    console.log = () => {}; console.warn = () => {}; console.error = () => {};
    require(path.join(ROOT, 'server', 'zone.js'));
    const SV = require(path.join(ROOT, 'server', 'villages.js'));
    const V2 = require(path.join(ROOT, 'sim', 'economy-sim-v2.js'));
    const E1 = require(path.join(ROOT, 'sim', 'economy-sim.js'));
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    let vils = [];
    for (let i = 0; i < 600; i++) { await sleep(500); const cv = (SV.clientVillages && SV.clientVillages()) || []; vils = cv.map((c) => SV.villageByDbId(c.id)).filter((v) => v && v.econ && v.econ.npcs.length); if (vils.length >= 20) break; }
    console.log = _l; console.warn = _w; console.error = _e;
    R.vils = vils.length; R.on = SV._t1306On(); R.knob297 = E1.T1297_BIRTH_FOOD;
    if (vils.length < 20) return out();
    const W = vils[0].econ._world, M = W._distMatrix, ev = W.villages;
    const days = (a, b) => { const i = ev.indexOf(a.econ), j = ev.indexOf(b.econ); const d = (M && i >= 0 && j >= 0) ? M[i][j] : Math.hypot(a.ccx - b.ccx, a.ccy - b.ccy) * 2.5; return isFinite(d) ? V2.travelDaysForDistance(d) : Infinity; };
    let src = null, near = [];
    for (const v of vils) { const n = vils.filter((u) => u !== v && days(v, u) <= 4); if (n.length >= 3) { src = v; near = n; break; } }
    R.src = !!src;
    if (!src) return out();
    const setH = (v, h) => { v.econ.lastStats = Object.assign({}, v.econ.lastStats || {}, { happiness: h }); };
    const room = (v) => { v.econ.housing = v.econ.npcs.length + 10; v.econ._mapBeds = v.econ.npcs.length + 10; v.econ.storage.food = Math.max(v.econ.storage.food || 0, (v.econ.npcs.length + 1) * 3 + 50); };
    for (const v of vils) { setH(v, 0.1); room(v); }
    setH(src, 0.2);
    const [a, b, c] = near;
    setH(a, 0.5); setH(b, 0.7); setH(c, 0.6);
    const day = W.day | 0, name = (x) => (x ? x.name : null), P = () => name(SV._t1147Pick(src));
    R.names = { a: a.name, b: b.name, c: c.name };
    const need = (v, d) => (v.econ.npcs.length + 1) * E1.DAILY_FOOD_CONSUMPTION * E1.t1297NeedDays(d);
    const rich = (v, d) => need(v, d) * 1.5, thin = (v, d) => need(v, d) * 0.5;   // 판 꾸밈 — 문턱의 1.5배 · 0.5배
    if (mode === 'on') {
      SV._t1306Record(); SV._t1306Record();
      const ring = b.econ._t1306Fd || [], last = ring[ring.length - 1] || {};
      R.rec = { len: ring.length, d: last.d, day, fe: last.fe, feNow: E1.totalFoodEquivalent(b.econ), n: last.n, nNow: b.econ.npcs.length, all: vils.every((v) => Array.isArray(v.econ._t1306Fd) && v.econ._t1306Fd.length === 1) };
      const lag = (SV._t1306Known(src, b, day + 100) || {}).lag;   // 먼 날로 물으면 오늘 줄이 들린다 — 도달 일수만 꺼낸다
      R.lag = lag;
      R.unknownToday = SV._t1306Known(src, b, day) === null;      // ② 오늘 줄뿐 — 소식이 아직 안 닿았다
      const setRing = (v, rows) => { v.econ._t1306Fd = rows.map(([d, fe]) => ({ d, fe, n: v.econ.npcs.length })); };
      for (const v of near) setRing(v, [[day - lag, rich(v, day)]]);
      R.p3 = P();                                                   // ③ 모두 들은 곳간 넉넉 → b(0.7)
      setRing(b, [[day - lag, thin(b, day)]]);
      R.feNowB = E1.totalFoodEquivalent(b.econ); R.needB = need(b, day);
      R.p4 = P();                                                   // ④ b 들은 곳간 얇음(지금은 넉넉) → c(0.6)
      const keep = b.econ.storage; b.econ.storage = Object.assign({}, keep); for (const k of Object.keys(b.econ.storage)) b.econ.storage[k] = 0;
      setRing(b, [[day - lag, rich(b, day)]]);
      R.feNowB0 = E1.totalFoodEquivalent(b.econ);
      R.p5 = P();                                                   // ⑤ b 지금은 비었지만 들은 곳간은 넉넉 → b(아직 모른다)
      b.econ.storage = keep;
      setRing(b, [[day - lag, rich(b, day)], [day, thin(b, day)]]);
      R.p6 = P();                                                   // ⑥ 오늘 줄(얇음)은 아직 안 들린다 → b
      const wd = 276 + lag;                                         // ⑦ 겨울 들머리 날 276 줄을 듣는 날(출생 문 날 수 = 89)
      setRing(b, [[276, (b.econ.npcs.length + 1) * 60]]); R.w60 = SV._t1306Pass(src, b, wd);
      setRing(b, [[276, (b.econ.npcs.length + 1) * 100]]); R.w100 = SV._t1306Pass(src, b, wd); R.wNeed = E1.t1297NeedDays(wd);
      delete b.econ._t1306Fd;
      const s0 = Object.assign({}, SV.t1306Stat());
      R.p8 = P();                                                   // ⑧ b 소식 없음 → 모름 → c
      const s1 = SV.t1306Stat(); R.st = { seen: s1.seen - s0.seen, unknown: s1.unknown - s0.unknown, ok: s1.ok - s0.ok, thin: s1.thin - s0.thin };
      // ★미끼 — 진짜 `_t1306Pass` 글에서 들은 줄 대신 지금 곳간을 읽게 한 사본(④ 판)
      const VS = fs.readFileSync(path.join(ROOT, 'server', 'villages.js'), 'utf8');
      const i0 = VS.indexOf('function _t1306Pass('), i1 = VS.indexOf('\n}\n', i0) + 2;
      const body = VS.slice(i0, i1);
      R.baitLine = body.split('_t1306Known(fromVil, toVil, day)').length === 2;
      const baitSrc = body.replace('_t1306Known(fromVil, toVil, day)', '__omni(fromVil, toVil, day)');
      const bait = new Function('state', '_t1306Stat', '__omni', baitSrc + '\nreturn _t1306Pass;')({ econ: E1 }, { seen: 0, ok: 0, thin: 0, unknown: 0, lagSum: 0 },
        (f, t) => ({ d: day, fe: E1.totalFoodEquivalent(t.econ), n: t.econ.npcs.length, lag: 0 }));
      setRing(b, [[day - lag, thin(b, day)]]);
      R.realThin = SV._t1306Pass(src, b, day); R.baitThin = bait(src, b, day);
    } else {
      // ⑨ · ⑩ 끔 — 들은 줄이 얇아도 지금 곳간(3일치)으로 고른다
      b.econ._t1306Fd = [{ d: day - 1, fe: 0, n: b.econ.npcs.length }];
      R.pOffRich = P();
      const keep = b.econ.storage; b.econ.storage = Object.assign({}, keep); for (const k of Object.keys(b.econ.storage)) b.econ.storage[k] = 0;
      R.pOffEmpty = P(); b.econ.storage = keep;
      R.st = SV.t1306Stat();
    }
    out();
  })().catch((e) => { R.err = String(e && e.stack); out(); });
  function out() { console.log('@@T1306M ' + JSON.stringify(R)); process.exit(0); }
} else {
  const ch = (mode, env) => { try { const o = execFileSync(process.execPath, ['--experimental-sqlite', __filename, '--child', mode], { env: Object.assign({}, process.env, env), encoding: 'utf8', maxBuffer: 64 << 20 });
    const l = o.split('\n').find((x) => x.startsWith('@@T1306M ')); return l ? JSON.parse(l.slice(9)) : null; } catch (e) { return { err: String(e.message).slice(0, 300) }; } };
  console.log('=== T1306 이주 문(`T1306_MIGRATE_FOOD` · T1297 켬 안) — 소문으로 아는 받는 마을 곳간 ===');
  const ON = ch('on', { T1297_BIRTH_FOOD: '1', T1306_MIGRATE_FOOD: '1' });
  const OFF = ch('off', { T1297_BIRTH_FOOD: '1', T1306_MIGRATE_FOOD: '0' });
  const KN = ch('knob', { T1297_BIRTH_FOOD: '0', T1306_MIGRATE_FOOD: '1' });
  if (!ON || ON.err || !(ON.vils >= 20) || !ON.src) ok(false, '켬 판이 안 섰다', ON);
  else {
    const N = ON.names;
    ok(ON.on === true && ON.knob297 === true, '손잡이 — T1297 켬 안에서 `\'1\'` 만 켬');
    ok(ON.rec.len === 1 && ON.rec.d === ON.rec.day && ON.rec.fe === ON.rec.feNow && ON.rec.n === ON.rec.nNow && ON.rec.all, '① 하루 한 줄(오늘 날 · 곳간 식량 환산 · 사람 수) · 같은 날 두 번 적으면 덮는다 · 모든 마을', ON.rec);
    ok(ON.lag >= 1 && ON.unknownToday, `② 소식이 닿는 날 수(T7 도달 시각표) = ${ON.lag}날 — 오늘 줄뿐이면 아직 모른다`, { lag: ON.lag });
    ok(ON.p3 === N.b, '③ 들은 곳간이 모두 넉넉 → 행복이 가장 높은 곳(0.7)', { got: ON.p3, want: N.b });
    ok(ON.p4 === N.c && ON.feNowB >= ON.needB, '★④ 들은 곳간이 얇으면 건너뛴다 — 지금 곳간은 넉넉해도(떠나는 사람은 모른다) → 다음 0.6', { got: ON.p4, want: N.c, feNow: ON.feNowB, need: ON.needB });
    ok(ON.p5 === N.b && ON.feNowB0 === 0, '★⑤ 지금은 비었어도 들은 곳간이 넉넉하면 간다 — 비었다는 소식이 아직 안 닿았다', { got: ON.p5, want: N.b });
    ok(ON.p6 === N.b, '⑥ 도달 일수보다 새 줄(오늘 · 얇음)은 아직 안 들린다 → 들은 줄(넉넉)로 고른다', { got: ON.p6 });
    ok(ON.wNeed === 89 - ON.lag && ON.w60 === false && ON.w100 === true, `⑦ 겨울 — 날 276 줄을 듣는 날(276 + ${ON.lag})의 출생 문 날 수 ${ON.wNeed}일치(봄까지 남은 날 · 같은 자) — 60일치 막힘 · 100일치 통과`, { need: ON.wNeed, w60: ON.w60, w100: ON.w100 });
    ok(ON.p8 === N.c && ON.st.unknown >= 1 && ON.st.seen === ON.st.unknown + ON.st.ok + ON.st.thin, '⑧ 소식 없는 마을은 모른다 → 안 간다 · 셈 칸(본 = 모름 + 넉넉 + 얇음)', { got: ON.p8, st: ON.st });
    ok(ON.baitLine && ON.realThin === false && ON.baitThin === true, '★미끼 — 들은 줄 대신 지금 곳간을 읽는 사본은 ④ 의 얇다는 소식을 놓친다(빨강 · 사본 통과)', { real: ON.realThin, bait: ON.baitThin });
  }
  if (!OFF || OFF.err || !(OFF.vils >= 20)) ok(false, '끔 판이 안 섰다', OFF);
  else ok(OFF.on === false && OFF.pOffRich === OFF.names.b && OFF.pOffEmpty === OFF.names.c && OFF.st.seen === 0, '⑨ 끔(T1306 끔 · T1297 켬) = 종전 줄 — 들은 줄을 안 보고 지금 곳간(3일치)으로 고른다 · 셈 0', { rich: OFF.pOffRich, empty: OFF.pOffEmpty, st: OFF.st });
  if (!KN || KN.err || !(KN.vils >= 20)) ok(false, 'T1297 끔 판이 안 섰다', KN);
  else ok(KN.on === false && KN.knob297 === false && KN.st.seen === 0, '⑩ T1297 끔이면 이주 문도 꺼진다(`T1306_MIGRATE_FOOD=1` 이어도)', { on: KN.on, st: KN.st });
  console.log(`\n=== T1306 이주 문: 통과 ${pass} · 실패 ${fail} ===`);
  process.exit(fail ? 1 : 0);
}
