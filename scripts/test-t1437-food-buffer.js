#!/usr/bin/env node
// @regress   ← 통합 러너가 이 표를 보고 자기 목록을 만든다(scripts/run-regress.sh)
// @bait 3   ← [T1356] 미끼 판정 줄 수(파일 안 · `test-harness-lint` ⑲b 가 센다 — 미끼 하나에 판정 줄 하나)
// === scripts/test-t1437-food-buffer.js — 식량 여유분은 마을이 겪은 만큼(`T1419_FOOD_NEED=seen` · 끔 기본 · 재민 판정 37) ===
//
// ★지키는 것(존을 부팅하지 않는다 — econ 정본 함수 · 작은 세계(8마을 · 40날 · 정본 `tickWorldV2`) · 꾸민 마을의 400날 고리 · 날짜 · 벽시계 0 — 판 날만 센다):
//   ① 손잡이 — `'seen'` 이 켬(`T1437_SEEN`) · 없음 · `'SEEN'` · `'1'` = 끔 · `'harv'` = (가) 그대로(겪은 낙폭 0) · 재는 팔 `T1437_READS` 는 손잡이 끔이면 안 선다
//   ② 끔 = 종전 — 작은 세계 40날에 고리 칸(`_t1437`) 0 · 가뭄 날 안 받음 · (가) 판도 고리 0
//   ③ 새 마을 = 날씨 정본의 가장 긴 가뭄 — v2 `WEATHER_KINDS` 의 가뭄 `days` 끝(지금 14 — 이 파일은 그 수를 옮겨 적지 않는다) ·
//      켬 작은 세계 40날: 산 마을마다 고리 40칸 · 여유분 = 그 가뭄 날 · 버틸 날 = (가) + 그 날
//   ④ 자 — 꾸민 마을(사람 30) 400날 고리: 곳간 날치 길을 손으로 놓고(꼭대기 → 바닥 둘 · 곳간 0 에 못 먹은 날 열) ·
//      여유분 = 지난 365날 칸의 꼭대기 → 그 뒤 바닥 가장 깊은 차(이 파일이 따로 셈) · 못 먹은 몫이 바닥을 더 판다(곳간만 본 차보다 크다) ·
//      한 해 밖으로 나간 낙폭은 잊는다 · 버틸 날(seen) = 같은 마을 (가) + 여유분
//   ⑤ 빈 마을 = 고리 지움 · 다시 서면 새 마을(가뭄 날)
//   ⑥ 저장 · 되살림 — 서버 저장 줄(`serializeEcon` → `restoreEcon` — 운영 함수 · `__p3Bind`) · v8 통째(랩 저장본 꼴) 둘 다:
//      되살린 마을의 여유분 = 저장 앞 · 둘이 열 날 더 걸은 고리 = 같다
//   ⑦ 재는 팔(`T1437_READS=house,mine`) — 집 짓기 40 · 25 · 광부 길 6 · 18 이 버틸 날 ÷ 30 배로 · 끔 손잡이면 종전 수 ·
//      여유분 자리(`T1437_BUF_AT=ref` — 값의 기준만 + 여유분 · 문들은 (가)) · 카드 글자 자(`T1437_RULER=stock` — 못 먹은 몫을 안 센다)
//   ⑧ 글자 — 부르는 자리(틱 머리 · 끼니 줄 · (가) 몸통 · v2 가뭄 줄)가 다 한 곳씩
//   ⑨ 미끼 셋(이 파일 안 · 바꾼 자리가 정확히 1곳인지 센다 · 정본 파일 무변 — 한 줄만 바꾼 사본을 아이에 싣는다):
//      zero(낙폭을 0 으로 → ④ 빨강) · nodrought(새 마을에 가뭄 날 안 씀 → ③ 빨강) · nosave(저장 줄이 고리를 건너뜀 → ⑥ 빨강)
//
// 실행: node scripts/test-t1437-food-buffer.js
'use strict';
const path = require('path');
const fs = require('fs');
const v8 = require('v8');
const { spawnSync } = require('child_process');
const ROOT = path.join(__dirname, '..');
const ARM = process.env.T1437_HARNESS_ARM || '', MUT = process.env.T1437_MUTANT || '';
const V1F = 'sim/economy-sim.js', V2F = 'sim/economy-sim-v2.js', VSF = 'server/villages.js';
// 미끼 — 이름: [파일 · 바꿀 글자(그 파일에 정확히 1곳) · 새 글자 · 돌릴 팔]
const BAITS = {
  zero: [V1F, '    b = dd;\n  }\n  if (R) { R.b = b; R.bd = d0; }', '    b = 0;\n  }\n  if (R) { R.b = b; R.bd = d0; }', 'seen'],
  nodrought: [V1F, '  if (!R || R.h < Y) b = _t1437Dr || 0;', '  if (!R || R.h < Y) b = 0;', 'seen'],
  nosave: [VSF, "  '_forageActItems',   // ★[T475]", "  '_forageActItems', '_t1437',   // ★[T475]", 'seen'],
};
const KNOBS = ['T1419_FOOD_NEED', 'T1437_READS', 'T1437_BUF_AT', 'T1437_RULER', 'T1297_BIRTH_FOOD', 'T1306_BIRTH_GRADE', 'T1306_MIGRATE_FOOD', 'T1319_AUTUMN_LOOK', 'T1346_BIRTH_FLOW', 'T1243_FARM_ON', 'T1374_BIRTH_HARV', 'T1374_FAMINE_HARV', 'T570_CALENDAR', 'T726_ONE_TARGET', 'T728_RESTART_KEEP'];
const DH = 400;   // 꾸민 마을 고리 날 수(한 해 + 35)

// 꾸민 곳간 날치 길(날 1 ~ 400) — [날, 곳간 날치] · 그 사이는 곧은 줄 · 날 400 의 한 해 창 = 날 36 ~ 400
//   ⓐ 날 1 ~ 10: 45 → 60 → 날 10 ~ 30: 60 → 8(낙폭 52 — 그 꼭대기는 한 해 창 밖으로 나간다)
//   ⓑ 날 30 ~ 200: 8 → 40(창 안 꼭대기) → 날 200 ~ 240: 40 → 12
//   ⓒ 날 240 ~ 300: 12 → 25 → 날 300 ~ 320: 25 → 0 → 날 321 ~ 330: 곳간 0 · 날마다 하루치 0.8 못 먹음 → 날 331 곳간 0(바닥 = −8 · 곳간만 보면 0)
//   ⓓ 날 331 ~ 400: 0 → 30
//   ⇒ 창 안 낙폭 = 40 − (−8) = 48 · 곳간만 = 40 · 창 밖까지 = 60 − (−8) = 68(이 수들은 아래 `expect` 가 길에서 따로 센다)
const PATH = [[1, 45], [10, 60], [30, 8], [200, 40], [240, 12], [300, 25], [320, 0], [331, 0], [400, 30]];
const SHORT = { from: 321, to: 330, frac: 0.8 };
const fdAt = (d) => { for (let k = 1; k < PATH.length; k++) { const [a, x] = PATH[k - 1], [b, y] = PATH[k]; if (d <= b) return x + (y - x) * (d - a) / (b - a); } return PATH[PATH.length - 1][1]; };

// ── 아이 판 ────────────────────────────────────────────────────────────────────────────
if (ARM) {
  for (const k of KNOBS) delete process.env[k];
  if (ARM === 'seen' || ARM === 'harv') process.env.T1419_FOOD_NEED = ARM;
  else if (ARM.startsWith('k:')) process.env.T1419_FOOD_NEED = ARM.slice(2);
  else if (ARM === 'reads') { process.env.T1419_FOOD_NEED = 'seen'; process.env.T1437_READS = 'house,mine'; }
  else if (ARM === 'readsOff') process.env.T1437_READS = 'house,mine';
  else if (ARM === 'bufat') { process.env.T1419_FOOD_NEED = 'seen'; process.env.T1437_BUF_AT = 'ref'; }
  else if (ARM === 'ruler') { process.env.T1419_FOOD_NEED = 'seen'; process.env.T1437_RULER = 'stock'; }
  process.env.ENABLE_VILLAGES = '0';
  const out = { arm: ARM, mut: MUT || null, loadErr: null, knob: null, seen: null, reads: null, dr: null, table: null, world: null, syn: null, save: null };
  if (MUT) {   // 미끼 — 정본 파일을 읽어 한 자리만 바꾼 사본으로 싣는다(파일 무변 · 자리 수는 어미가 이미 셌다)
    const M = require('module'), old = M._extensions['.js'], B = BAITS[MUT];
    if (!B) out.loadErr = 'bait unknown ' + MUT;
    else M._extensions['.js'] = function (m, f) {
      if (f !== path.join(ROOT, B[0])) return old(m, f);
      const x = fs.readFileSync(f, 'utf8');
      if (x.split(B[1]).length !== 2) throw new Error('bait site count ' + MUT);
      m._compile(x.replace(B[1], B[2]), f);
    };
  }
  let E = null, V2 = null;
  const quiet = (f) => { const l = console.log, w = console.warn; console.log = () => {}; console.warn = () => {}; try { return f(); } finally { console.log = l; console.warn = w; } };
  try { quiet(() => { E = require(path.join(ROOT, V1F)); V2 = require(path.join(ROOT, V2F)); }); }
  catch (e) { out.loadErr = String((e && e.message) || e).slice(0, 300); }
  const r6 = (x) => (x == null || !isFinite(x)) ? null : Math.round(x * 1e6) / 1e6;
  if (E && V2) {
    out.knob = E.T1419_FOOD_NEED; out.seen = E.T1437_SEEN; out.reads = E.T1437_READS; out.dr = E.t1437DroughtDays();
    out.table = (V2.WEATHER_KINDS || []).filter((k) => String(k.name).indexOf('가뭄') >= 0).map((k) => k.days);
  }
  if (E && V2 && !ARM.startsWith('k:') && ARM !== 'readsOff') {
    // 작은 세계 — 8 마을 · 40날(정본 틱 그대로)
    try {
      quiet(() => {
        if (E.setSeed) E.setSeed(1);
        const w = V2.createWorldV2({ seed: 1020, villageCount: 8, picker: 'rational', infoRange: 5000, raidPer100: 0 });
        for (let d = 0; d < 40; d++) V2.tickWorldV2(w);
        const live = w.villages.filter((v) => (v.npcs || []).length > 0);
        out.world = { live: live.length, pop: live.reduce((a, v) => a + v.npcs.length, 0), keyed: w.villages.filter((v) => '_t1437' in v).length,
          rings: live.map((v) => v._t1437 ? v._t1437.h : null), bufs: live.map((v) => v._t1437 ? v._t1437.b : null),
          need: live.map((v) => v._t1419N ? r6(v._t1419N.d) : null), day: w.day, stat: E.t1419Stat() };
      });
    } catch (e) { out.world = { err: String((e && e.stack) || e).slice(0, 300) }; }
    // 꾸민 마을 — 사람 30 · 400날 고리(위 PATH)
    const S = out.syn = {};
    try {
      quiet(() => {
        const N = 30, C = N * E.DAILY_FOOD_CONSUMPTION;
        const mk = () => {
          if (E.setSeed) E.setSeed(1);
          const v = E.createVillage({ fertility: 1.0, water: 0.5, stone: 0.5, ore: 0, wood: 0.5, game: 0.5, arable: 1, size: 70, initialPop: N, name: 'T1437S' });
          v.counts = { farmer: 10 }; v.surplusEMA = { food: 0 }; v._importEMA = 0;
          for (const k of Object.keys(v.storage)) if (typeof v.storage[k] === 'number') v.storage[k] = 0;
          return v;
        };
        const walk = (v, a, b) => {   // 날 a ~ b 고리 걷기(틱 머리 칸 → 끼니 줄 모자람) — 정본 함수 둘만
          for (let d = a; d <= b; d++) {
            v._world = { day: d };
            v.storage.food = fdAt(d) * C;
            E.t1437Day(v, d);
            if (d >= SHORT.from && d <= SHORT.to) E.t1437Short(v, SHORT.frac * C);
          }
        };
        const v = mk();
        walk(v, 1, 30); S.b30 = r6(E.t1437Buf(v, 30)); S.h30 = v._t1437.h;
        walk(v, 31, DH);
        S.h = v._t1437.h; S.buf = r6(E.t1437Buf(v, DH));
        S.need = r6(E.foodNeedDays(v, DH));   // 이 팔의 버틸 날(seen = (가) + 여유분 · harv = (가))
        S.u = r6(v._t1437.u);
        S.repeat = r6(E.t1437Buf(v, DH));   // 같은 날 다시 — 같은 값(고리 무변)
        S.dayTwice = (() => { const x = v._t1437.x.slice(), i = v._t1437.i; E.t1437Day(v, DH); return v._t1437.i === i && v._t1437.x.every((y, k) => y === x[k]); })();
        // 빈 마을 → 지움 → 다시 섬
        const e = mk(); walk(e, 1, 50); const keep = e.npcs; e.npcs = []; E.t1437Day(e, 51); S.emptied = e._t1437; e.npcs = keep; E.t1437Day(e, 52); S.refound = { h: e._t1437 && e._t1437.h, b: r6(E.t1437Buf(e, 52)) };
        // 저장 · 되살림 — 서버 저장 줄 · v8 통째
        if (ARM === 'seen') {
          const sv = mk(); walk(sv, 1, 380);
          const b0 = r6(E.t1437Buf(sv, 380));
          let V = null; try { V = require(path.join(ROOT, VSF)); } catch (err) { S.saveErr = String(err && err.message || err).slice(0, 200); }
          const H = V && V.__p3Bind ? V.__p3Bind({ byEcon: new Map(), byDbId: new Map(), villages: [], zoneId: 't1437' }) : null;
          const json = H ? H.serializeEcon(sv) : null;
          const rs = json ? H.restoreEcon(json, E) : null;
          const rb = rs ? r6(E.t1437Buf(rs, 380)) : null;   // 되살린 마을을 저장 앞 날(380)에 바로 묻는다(아래 걷기 앞)
          const v8c = v8.deserialize(v8.serialize(Object.assign({}, sv, { _world: null })));
          const cont = (x) => { walk(x, 381, 390); return { b: r6(E.t1437Buf(x, 390)), x: (x._t1437 && x._t1437.x.slice()) || null, u: x._t1437 ? r6(x._t1437.u) : null }; };
          const base = cont(sv);
          const a = rs ? cont(rs) : null, c = cont(v8c);
          out.save = { b0, inJson: !!(json && json.indexOf('"_t1437"') >= 0), restoredB: rb,
            base: base.b, json: a && a.b, v8: c.b, jsonSame: !!(a && a.x && base.x && a.x.every((y, k) => y === base.x[k]) && a.u === base.u),
            v8Same: !!(c.x && base.x && c.x.every((y, k) => y === base.x[k]) && c.u === base.u) };
        }
        // 재는 팔 — 여유분 자리(`T1437_BUF_AT=ref`) · 카드 글자 자(`T1437_RULER=stock`)
        if (ARM === 'bufat') {
          const g = mk(); walk(g, 1, 30); g._world = { day: 30 };
          S.bufat = { ref: r6(E.t1419Days(g, 30, 30, 'ref')), famine: r6(E.t1419Days(g, 30, 30, 'famine')), depart: r6(E.t1419Days(g, 30, 30, 'depart')), b: r6(E.t1437Buf(g, 30)) };
        }
        if (ARM === 'ruler') S.ruler = { u: r6(v._t1437.u), buf: S.buf };
        // 재는 팔 — 집 짓기 · 광부 길 수
        if (ARM === 'reads' || ARM === 'seen') {
          const g = mk(); walk(g, 1, 20); g._world = { day: 20 };
          const nd = E.foodNeedDays(g, 20);
          S.read = { nd: r6(nd), h40: r6(E.t1437Read(g, 40, 'house')), h25: r6(E.t1437Read(g, 25, 'house')), m6: r6(E.t1437Read(g, 6, 'mine')), m18: r6(E.t1437Read(g, 18, 'mine')) };
        }
      });
    } catch (e) { S.err = String((e && e.stack) || e).slice(0, 400); }
  }
  console.log('@@T1437 ' + JSON.stringify(out));
  process.exit(0);
}

// ── 어미 ────────────────────────────────────────────────────────────────────────────────
let pass = 0, fail = 0;
const ok = (c, m, d) => { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ ' + m + (d !== undefined ? '  ← ' + (typeof d === 'string' ? d : JSON.stringify(d)) : '')); } };
const J = (x) => JSON.stringify(x);
const child = (arm, mut) => {
  const env = Object.assign({}, process.env, { T1437_HARNESS_ARM: arm }); if (mut) env.T1437_MUTANT = mut; else delete env.T1437_MUTANT;
  const r = spawnSync(process.execPath, [__filename], { cwd: ROOT, env, encoding: 'utf8', maxBuffer: 64 << 20 });
  const line = String(r.stdout || '').split('\n').find((l) => l.startsWith('@@T1437 '));
  if (!line) return { loadErr: 'no output rc=' + r.status + ' ' + String(r.stderr || '').slice(-300) };
  return JSON.parse(line.slice(8));
};
const near = (a, b, e) => a != null && b != null && Math.abs(a - b) <= (e || 1e-6);
const SRC = { [V1F]: fs.readFileSync(path.join(ROOT, V1F), 'utf8'), [V2F]: fs.readFileSync(path.join(ROOT, V2F), 'utf8'), [VSF]: fs.readFileSync(path.join(ROOT, VSF), 'utf8') };
// 이 파일이 따로 세는 여유분 — 같은 길을 같은 1/1000 둥금으로(정본 함수를 안 부른다)
const expect = (() => {
  const xs = []; let u = 0;
  for (let d = 1; d <= DH; d++) { xs.push(Math.round((fdAt(d) - u) * 1000) / 1000); if (d >= SHORT.from && d <= SHORT.to) u += SHORT.frac; }
  const dd = (a) => { let pk = -Infinity, m = 0; for (const x of a) { if (x > pk) pk = x; else if (pk - x > m) m = pk - x; } return m; };
  const win = xs.slice(DH - 365);   // 날 36 ~ 400(달력 0 날 = 1년 3월 1일 · 날 400 이 든 해 = 평년 365)
  const stock = []; for (let d = DH - 364; d <= DH; d++) stock.push(Math.round(fdAt(d) * 1000) / 1000);
  return { win: dd(win), all: dd(xs), stockOnly: dd(stock), u: SHORT.frac * (SHORT.to - SHORT.from + 1) };
})();

console.log('\n① 손잡이 — `\'seen\'` 이 켬');
const K = ['k:1', 'k:SEEN', 'k:true'].map((a) => child(a));
const A = { off: child('off'), harv: child('harv'), seen: child('seen'), reads: child('reads'), readsOff: child('readsOff'), bufat: child('bufat'), ruler: child('ruler') };
ok(A.seen.knob === 'seen' && A.seen.seen === true && A.harv.knob === 'harv' && A.harv.seen === false && A.off.knob === '' && A.off.seen === false && K.every((x) => x.knob === '' && x.seen === false),
  '① `seen` 만 켬 · 없음 · `1` · `SEEN` · `true` = 끔 · `harv` = (가) 그대로', J([A.off.knob, A.harv.knob, A.seen.knob, ...K.map((x) => x.knob)]));
ok(A.readsOff.reads && !A.readsOff.reads.house && !A.readsOff.reads.mine && A.reads.reads && A.reads.reads.house && A.reads.reads.mine, '① 재는 팔 `T1437_READS` — 손잡이 끔이면 안 선다 · 켬이면 house · mine', J({ off: A.readsOff.reads, on: A.reads.reads }));

console.log('\n② 끔 = 종전');
{
  const W = A.off.world || {}, H = A.harv.world || {};
  ok(!A.off.loadErr && W.live >= 6 && W.pop > 100 && !W.err, '② [전제] 끔 작은 세계 40날이 돌았다(산 마을 ≥ 6 — 0 이면 아래가 자명 통과다)', J({ err: A.off.loadErr || W.err, live: W.live, pop: W.pop }));
  ok(W.keyed === 0 && A.off.dr === null && W.stat && W.stat.calls === 0, '★② 끔 — 고리 칸 0 · 가뭄 날 안 받음 · 필요 날 함수 부름 0', J({ keyed: W.keyed, dr: A.off.dr, calls: W.stat && W.stat.calls }));
  ok(H.live >= 6 && H.keyed === 0 && A.harv.dr === null && H.stat && H.stat.calls > 0, '★② (가)(`harv`) — 고리 칸 0 · 가뭄 날 안 받음(여유분 0 = T1419 (가) 그대로)', J({ keyed: H.keyed, dr: A.harv.dr }));
}

console.log('\n③ 새 마을 = 날씨 정본의 가장 긴 가뭄');
{
  const T = A.seen.table || [], top = T.length ? Math.max(...T.map((d) => d[d.length - 1])) : null;
  ok(T.length >= 1 && top > 0 && A.seen.dr === top, `★③ 가뭄 날 = v2 \`WEATHER_KINDS\` 가뭄 \`days\` 끝(표에서 ${top} — 이 파일은 그 수를 안 적는다)`, J({ table: T, got: A.seen.dr }));
  const W = A.seen.world || {}, S = A.seen.syn || {};
  ok(!W.err && W.live >= 6 && W.keyed === W.live && W.rings.every((h) => h === 40), '③ 켬 작은 세계 40날 — 산 마을마다 고리 40칸(하루 한 칸)', J({ err: W.err, live: W.live, keyed: W.keyed, rings: W.rings }));
  ok(W.bufs && W.bufs.length === W.live && W.bufs.every((b) => b === top) && W.need.every((n) => n != null && n >= 1 + top), '★③ 한 해 안 된 마을 — 여유분 = 가뭄 날 · 버틸 날 ≥ 1 + 가뭄 날', J({ bufs: W.bufs, need: W.need }));
  ok(S.h30 === 30 && S.b30 === top, '③ 꾸민 마을 날 30(고리 30칸) — 여유분 = 가뭄 날(겪은 낙폭이 이미 15 여도 한 해 전엔 안 쓴다)', J({ h30: S.h30, b30: S.b30 }));
}

console.log('\n④ 자 — 지난 한 해 꼭대기 → 그 뒤 바닥(못 먹은 몫까지)');
{
  const S = A.seen.syn || {}, Hh = A.harv.syn || {};
  ok(!S.err && S.h === 366 && near(S.u, expect.u, 1e-9), '④ [전제] 꾸민 마을 400날 — 고리 366칸(가득) · 못 먹은 날치 누계 = 손으로 놓은 몫', J({ err: S.err, h: S.h, u: S.u, want: expect.u }));
  ok(near(S.buf, expect.win, 1e-9) && S.buf > 0, `★④ 여유분 = 이 파일이 따로 센 한 해 창 낙폭 ${expect.win}`, J({ got: S.buf, want: expect.win }));
  ok(S.buf > expect.stockOnly && near(S.buf - expect.stockOnly, expect.u, 1e-6), `★④ 못 먹은 몫이 바닥을 판다 — 곳간만 본 낙폭 ${expect.stockOnly} + 못 먹은 ${expect.u}`, J({ got: S.buf, stock: expect.stockOnly }));
  ok(expect.all > expect.win && S.buf < expect.all, `★④ 한 해 밖으로 나간 낙폭(${expect.all} — 날 30 → 60)은 잊는다`, J({ got: S.buf, all: expect.all }));
  ok(S.repeat === S.buf && S.dayTwice === true, '④ 같은 날 다시 물어도 같은 값 · 같은 날 칸을 두 번 넣지 않는다', J({ repeat: S.repeat, twice: S.dayTwice }));
  ok(Hh.need != null && S.need != null && near(S.need, Hh.need + S.buf, 1e-9), '★④ 버틸 날(seen) = 같은 마을 같은 날 (가)(harv) + 여유분', J({ seen: S.need, harv: Hh.need, buf: S.buf }));
}

console.log('\n⑤ 빈 마을 = 고리 지움 · 다시 서면 새 마을');
{
  const S = A.seen.syn || {};
  ok(S.emptied === null && S.refound && S.refound.h === 1 && S.refound.b === A.seen.dr, '★⑤ 사람 0 → 고리 null · 다시 선 첫날 고리 1칸 · 여유분 = 가뭄 날', J({ emptied: S.emptied, refound: S.refound }));
}

console.log('\n⑥ 저장 · 되살림 — 서버 저장 줄 · v8 통째');
{
  const P = A.seen.save || {};
  ok(P.b0 > 0 && P.b0 !== A.seen.dr, '⑥ [전제] 저장 앞 마을(380날)의 여유분이 겪은 값(가뭄 날 아님 — 같으면 아래가 자명 통과다)', J(P));
  ok(P.inJson && P.restoredB === P.b0, '★⑥ 서버 저장 줄(`serializeEcon`)에 고리가 실리고 되살린 마을의 여유분 = 저장 앞', J({ inJson: P.inJson, b0: P.b0, restored: P.restoredB, err: (A.seen.syn || {}).saveErr }));
  ok(P.jsonSame && P.v8Same && P.json === P.base && P.v8 === P.base, '★⑥ 되살린 둘(서버 · v8)이 열 날 더 걸은 고리 = 한 번에 걸은 고리', J(P));
}

console.log('\n⑦ 재는 팔 — 같은 자로 읽은 집 짓기 · 광부 길 수');
{
  const R = (A.reads.syn || {}).read || {}, Sx = (A.seen.syn || {}).read || {};
  ok(R.nd > 1 && near(R.h40, 40 * R.nd / 30) && near(R.h25, 25 * R.nd / 30) && near(R.m6, 6 * R.nd / 30) && near(R.m18, 18 * R.nd / 30), '★⑦ 켬(house,mine) — 40 · 25 · 6 · 18 × 버틸 날 ÷ 30', J(R));
  ok(Sx.h40 === 40 && Sx.h25 === 25 && Sx.m6 === 6 && Sx.m18 === 18, '⑦ 재는 팔 끔(seen 만) — 종전 수 그대로', J(Sx));
  const B = (A.bufat.syn || {}).bufat || {};
  ok(B.b > 0 && near(B.ref - B.famine, B.b) && near(B.depart, B.famine) && A.bufat.knob === 'seen', '★⑦ 여유분 자리(`T1437_BUF_AT=ref`) — 값의 기준만 (가) + 여유분 · 기근 문 · 출발 문 = (가)', J(B));
  const U = (A.ruler.syn || {}).ruler || {};
  ok(U.u === 0 && near(U.buf, expect.stockOnly, 1e-9), `★⑦ 카드 글자 자(\`T1437_RULER=stock\`) — 못 먹은 몫을 안 센다(누계 0 · 여유분 = 곳간만 본 낙폭 ${expect.stockOnly})`, J(U));
}

console.log('\n⑧ 글자 — 부르는 자리가 한 곳씩');
{
  const L = [
    [V1F, '  if (T1437_SEEN) t1437Day(v, day);', 1, '틱 머리 칸'], [V1F, '  if (T1437_SEEN) t1437Short(v, foodGap);', 1, '끼니 줄 모자람'],
    [V1F, '  const _b = T1437_SEEN ? t1437Buf(v, d0) : 0;', 1, '(가) 몸통 + 여유분'], [V1F, '  const d = Math.max(1, best / C) + _b;', 1, '(가) 몸통 + 여유분'],
    [V2F, 'if (v1.T1437_SEEN) v1.t1437Drought(WEATHER_KINDS);', 1, 'v2 가뭄 줄'],
  ];
  const bad = L.filter(([f, s, n]) => SRC[f].split(s).length - 1 !== n).map(([f, s, n, t]) => `${t}(${SRC[f].split(s).length - 1}/${n})`);
  ok(bad.length === 0, '★⑧ 틱 머리 · 끼니 줄 · (가) 몸통 · v2 가뭄 줄 — 한 곳씩', bad.join(' · '));
  const x = SRC[V1F], i0 = x.lastIndexOf('\n', x.indexOf('★★★[T1437')) + 1, i1 = x.indexOf('\n', x.indexOf('function t1437Read('));
  const sec = require('./code-only.js')(x.slice(i0, i1)), top = ((A.seen.table || []).map((d) => d[d.length - 1]));
  ok(i0 > 0 && i1 > i0 && sec.indexOf('t1437Drought') >= 0 && !top.some((t) => new RegExp('\\b' + t + '\\b').test(sec)), `⑧ v1 T1437 절(코드 · 주석 뺌)에 가뭄 날 글자(${top.join(' · ')}) 0 — 표에서 읽는다`);
}

console.log('\n⑨ 미끼 — 한 줄만 바꾼 사본');
{
  const cnt = (b) => SRC[BAITS[b][0]].split(BAITS[b][1]).length - 1;
  {
    const n = cnt('zero'), R = child(BAITS.zero[3], 'zero'), S = R.syn || {};
    ok(n === 1 && !S.err && S.h === 366 && !near(S.buf, expect.win, 1e-9), `★미끼 zero — 낙폭을 0 으로 돌려주는 사본 → ④ 여유분 빨강(바꾼 자리 ${n})`, J({ buf: S.buf, want: expect.win }));
  }
  {
    const n = cnt('nodrought'), R = child(BAITS.nodrought[3], 'nodrought'), W = R.world || {};
    ok(n === 1 && W.live >= 6 && !(W.bufs || []).every((b) => b === A.seen.dr), `★미끼 nodrought — 새 마을에 가뭄 날을 안 쓰는 사본 → ③ 빨강(바꾼 자리 ${n})`, J({ bufs: W.bufs }));
  }
  {
    const n = cnt('nosave'), R = child(BAITS.nosave[3], 'nosave'), P = R.save || {};
    ok(n === 1 && P.b0 > 0 && (!P.inJson || P.restoredB !== P.b0), `★미끼 nosave — 저장 줄이 고리를 건너뛰는 사본 → ⑥ 빨강(바꾼 자리 ${n})`, J(P));
  }
}

console.log(`\n결과: ${pass} 통과 / ${fail} 실패`);
process.exit(fail ? 1 : 0);
