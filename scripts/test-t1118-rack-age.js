#!/usr/bin/env node
// @regress   ← 통합 러너가 이 표를 보고 자기 목록을 만든다(scripts/run-regress.sh · 표 없으면 안 돈다)
// === scripts/test-t1118-rack-age.js — T1118: 시설 위 날도 늙는다(손잡이 `T1118_RACK_AGE` · 켬 기본 후보 · 판정대기 문 11 = ㄱ) ===
//
// ★PM 11-03 캐논(신선도 캐논 10-12 · 10-14 "아이템마다 신선도를 따로 · 곳간 포함"): 말리는 동안에도 로트 나이는 흐르고
//   (보존 가공은 신선도가 떨어지는 속도를 늦출 뿐 · 재민 10-15) · 건조대에서 내려도 그 나이를 이어받는다.
//   이 하네스는 **운영 함수 그대로**(`zone.doPreserve` · `doCraftCollect` · `_facilityRecipes` · `spoil` · `lots`)를 판마다 아이 프로세스로 돈다
//   (손잡이는 모듈 머리에서 읽는다 — 판마다 새 프로세스).
//   시간: 하루 2초(`VILLAGE_DAY_MS=2000`) · `SPOIL_Q10=1`(노출 = 흐른 날수 — test-preserve 와 같은 자) · 소요일은 종전 값(말리기 3일 = 6초).
//     기대값은 **부모가 따로 센다**(노출이 날수와 같다는 자의 뜻 하나로 — 제품의 `rackFresh` · `rackLand` 를 다시 부르지 않는다) ·
//     시각은 주문이 적은 순간(넣은 순간 · 시작 · 다 됨)과 받은 레코드의 정산 순간을 같은 자(`_t1118T` — 순간 로트면 소수 날 · 날 로트면 날)로 읽는다.
//
//  ⓐ 정적 — 손잡이 spoil.js 한 자리(`!== '0'`) · 받는 문은 보존 주문만 · 종전 두 길(T767 · 리셋 `Lots.note`) 글자 그대로 · 화면 줄 · 새 수 0
//  ⓑ 빈 건조대(기다림 0) — 켬: 받은 노출 = 넣은 신선도 자리 + 소요일(3) + 다 된 뒤 날 · 끔: 다 된 뒤 날만(소요일이 빠진다 = 정지 상자) · 개수 그대로
//  ⓒ 앞 주문 기다림 — 켬: 기다린 날은 원물 곡선(과실 보관 6일)으로 · 그다음 산출 곡선 · 끔: 기다림 · 소요일 다 빠진다
//  ⓓ 늦게 받기 — 다 된 뒤 하루 더 둔 것: 켬 · 끔 둘 다 그 하루를 센다(켬 − 끔 = 소요일뿐 · 두 번 세지 않는다)
//  ⓔ 화면 "나오면" — 켬: 지금 넣으면 다 되는 순간의 신선도(빈 시설 · 앞 주문 있는 시설 둘 다 받은 값과 같다) · 끔: 넣은 신선도(종전)
//  ⓕ T767 끔(리셋 갈래) — 켬: 가공이 시작되는 순간에 갓 만든 것(노출 0)에서 소요일만큼 · 끔: 다 된 순간 노출 0(종전)
//  ⓖ 되돌림 — `T1118_RACK_AGE=0` 이면 주문에 `rack` 칸이 없다(건물 저장 글자 종전)
//
// 실행: node scripts/test-t1118-rack-age.js
'use strict';
const path = require('path');
const fs = require('fs');
const { execFile } = require('child_process');
const ROOT = path.resolve(__dirname, '..');
const SV = (p) => path.join(ROOT, 'server', p);

// ══ 아이 판 — 한 손잡이 조합으로 장면 셋(ⓑ · ⓒ · ⓓ)을 같이 돈다(마지막 줄 = JSON) ═════════════════════
if (process.env.T1118_SUB === 'run') {
  process.env.ZONE_ID = 'hanbando';
  process.env.PORT = String(require('./lib-port').port(37100));
  process.env.DB_PATH = `/tmp/test-t1118-${process.pid}.db`;
  process.env.ENABLE_VILLAGES = '0'; process.env.ENABLE_WILDLIFE = '0';
  process.env.ENABLE_BANDITS = '0'; process.env.ENABLE_ROADS = '0';
  process.env.VILLAGE_DAY_MS = '2000';     // 하루 2초 — 말리기 3일 = 6초
  process.env.SPOIL_Q10 = '1';             // 노출 = 흐른 날수(기준온도 환경)
  const _log = console.log; console.log = () => {}; console.warn = () => {}; console.error = () => {};
  const out = { err: null };
  const sleep = (ms) => new Promise((r) => setTimeout(r, Math.max(0, ms)));
  (async () => {
    try {
      const Zone = require(SV('zone.js'));
      const H = Zone.__testBind();
      const Spoil = require(SV('spoil.js'));
      const Lots = require(SV('lots.js'));
      const Body = require(SV('body.js'));
      const MOM = Lots.momentOn();
      out.knob = { rack: !!Spoil.T1118_RACK, carry: !!Spoil.T767_CARRY, moment: MOM, dayMs: H._SEASON_DAY_MS };
      out.shelf = { fish: Spoil.shelfOf('fish'), berry: Spoil.shelfOf('berry'), dried_fish: Spoil.shelfOf('dried_fish'), dried_fruit: Spoil.shelfOf('dried_fruit') };
      let _n = 0;
      function mkPlayer(name) {
        const msgs = [];
        const ws = { readyState: 1, send: (s) => { try { msgs.push(JSON.parse(s)); } catch (e) {} } };
        const p = { pid: 'p_' + name, playerId: 'tr_' + name, name, persistent: false, ws,
          x: 6000 + 400 * (_n++), y: 6000, vx: 0, vy: 0, floor: 0, hp: 100, maxHp: 100, hunger: 0, thirst: 100,
          inventory: {}, equipment: [], equipSlots: {}, craftSkill: {}, dishes: [], lots: {} };
        p._msgs = msgs; Body.ensure(p); return p;
      }
      function mkRack(id, p) {
        const b = { id, dbId: null, type: 'drying_rack', ownerId: p.playerId, ownerName: p.playerId, x: p.x + 20, y: p.y, data: {} };
        H.buildings.set(b.id, b); return b;
      }
      const lastNote = (p) => (p._msgs.filter((m) => m.type === 'notice').map((m) => m.text).slice(-1)[0] || '');
      function giveFresh(p, item, n) {   // 갓 얻은 것 — 지금 순간(순간 로트) · 오늘(날 로트)
        Lots.note(p, item, n, H.zoneGameDay(), 'carry', MOM ? Lots.nowMs() : undefined);
        p.inventory[item] = Math.floor(Lots.sum(p, item) + 1e-6);
      }
      const recs = (p, item) => Lots.of(p, item).map((l) => ({ n: l.n, e: l.e, t: l.t, d: l.d, k: l.k != null ? l.k : null }));
      function jobOf(rack, p) { const q = (rack.data.queue || []).filter((j) => j.owner === p.playerId); return q.length ? q[q.length - 1] : null; }
      function jobView(j) {
        if (!j) return null;
        const put = (j.rack && Number.isFinite(+j.rack.put)) ? Math.min(+j.rack.put, +j.startAt) : null;
        return { kind: j.kind, items: j.items, hasRack: Object.prototype.hasOwnProperty.call(j, 'rack'), rack: j.rack || null, lotFresh: j.lotFresh || null,
          T: { put: put == null ? null : H._t1118T(put), start: H._t1118T(+j.startAt), done: H._t1118T(+j.doneAt) }, startAt: j.startAt, doneAt: j.doneAt };
      }
      const rowOf = (p, rack, id) => { const r = (H._facilityRecipes(p, 'dry', rack) || []).find((x) => x.id === id); return r ? { outFresh: r.outFresh == null ? null : r.outFresh, outStage: r.outStage || null, yieldPct: r.yieldPct } : null; };
      // ⓑ 빈 건조대 — 갓 잡은 생선 2
      const S_B = (async () => {
        const p = mkPlayer('b'), rack = mkRack('t1118b', p);
        giveFresh(p, 'fish', 2);
        const tv0 = H._t1118T(Date.now()), row = rowOf(p, rack, 'dry_fish'), tv1 = H._t1118T(Date.now());   // 화면을 본 순간의 띠(그새 생선이 늙는다 — 하루 2초)
        const fish0 = Lots.sum(p, 'fish');
        p._msgs.length = 0; H.doPreserve(p, 'dry_fish', 2);
        const j = jobOf(rack, p), jv = jobView(j), note = lastNote(p);
        if (j) { await sleep(j.doneAt - Date.now() + 60); H.doCraftCollect(p, rack.id); }
        return { row, tv: [tv0, tv1], jv, note, fish0, fishLeft: Lots.sum(p, 'fish'), dried: p.inventory.dried_fish || 0, lots: recs(p, 'dried_fish') };
      })();
      // ⓒ 앞 주문 기다림 — 생선 1(앞) · 과실 1(뒤 — 앞 주문이 끝날 때까지 원물로 기다린다)
      const S_C = (async () => {
        const p = mkPlayer('c'), rack = mkRack('t1118c', p);
        giveFresh(p, 'fish', 1); giveFresh(p, 'berry', 1);
        p._msgs.length = 0; H.doPreserve(p, 'dry_fish', 1);
        const jA = jobView(jobOf(rack, p));
        const row = rowOf(p, rack, 'dry_fruit');     // ⓔ 앞 주문이 있는 시설의 "나오면"
        p._msgs.length = 0; H.doPreserve(p, 'dry_fruit', 1);
        const jBraw = jobOf(rack, p), jB = jobView(jBraw);
        if (jBraw) { await sleep(jBraw.doneAt - Date.now() + 60); H.doCraftCollect(p, rack.id); }
        return { row, jA, jB, dried: p.inventory.dried_fruit || 0, fishDried: p.inventory.dried_fish || 0, lots: recs(p, 'dried_fruit') };
      })();
      // ⓓ 늦게 받기 — 다 된 뒤 하루(2초) 더 둔다
      const S_D = (async () => {
        const p = mkPlayer('d'), rack = mkRack('t1118d', p);
        giveFresh(p, 'fish', 1);
        p._msgs.length = 0; H.doPreserve(p, 'dry_fish', 1);
        const j = jobOf(rack, p), jv = jobView(j);
        if (j) { await sleep(j.doneAt - Date.now() + H._SEASON_DAY_MS + 60); H.doCraftCollect(p, rack.id); }
        return { jv, dried: p.inventory.dried_fish || 0, lots: recs(p, 'dried_fish') };
      })();
      [out.b, out.c, out.d] = await Promise.all([S_B, S_C, S_D]);
    } catch (e) { out.err = String((e && e.stack) || e).slice(0, 900); }
    try { fs.unlinkSync(process.env.DB_PATH); } catch (e) {}
    _log(JSON.stringify(out));
    process.exit(0);
  })();
  return;
}

// ══ 부모 판 ═══════════════════════════════════════════════════════════════════════════════
let pass = 0, fail = 0;
const ok = (c, m, x) => { c ? pass++ : fail++; console.log((c ? '  ✓ ' : '  ✗ ') + m + (x !== undefined && x !== '' ? `  ${x}` : '')); };
const pre = (c, m, x) => { if (!c) { fail++; console.log('  ✗ [상황] ' + m + (x !== undefined ? `  ${x}` : '')); } else console.log('  · [상황] ' + m + (x !== undefined ? `  ${x}` : '')); };
const near = (a, b, tol) => Number.isFinite(+a) && Number.isFinite(+b) && Math.abs((+a) - (+b)) <= (tol == null ? 2e-5 : tol);
const KNOBS = ['T1118_RACK_AGE', 'T767_PRESERVE_CARRY', 'T732_MOMENT_LOT', 'SPOIL_Q10', 'VILLAGE_DAY_MS', 'PRESERVE_DAYS_DRY', 'PRESERVE_DAYS_SMOKE', 'PRESERVE_DAYS_PICKLE'];
function child(env) {
  return new Promise((res) => {
    const e = Object.assign({}, process.env, { T1118_SUB: 'run' });
    for (const k of KNOBS) delete e[k];
    Object.assign(e, env);
    execFile(process.execPath, [__filename], { cwd: ROOT, env: e, encoding: 'utf8', timeout: 300000, maxBuffer: 64 << 20 }, (err, txt) => {
      const last = String(txt || '').trim().split('\n').filter(Boolean).pop();
      try { res(JSON.parse(last)); } catch (x) { res({ err: (err && String(err)) || 'no json', knob: null }); }
    });
  });
}
const clamp01 = (x) => Math.max(0, Math.min(1, x));
// 부모가 따로 세는 기대 노출(노출 = 날수 · 곡선 = 1 − 노출 ÷ 보관일) — 받은 레코드 `L` 하나 · 넣은 레코드 신선도 `f` · 주문 시각 `T`
function expectE(r, jv, L, f, inItem, outItem) {
  const S = r.shelf, T = jv.T;
  if (!r.knob.carry) {   // T767 끔 — 리셋(넣은 신선도와 무관)
    return r.knob.rack ? (L.t - T.start) : (L.t - T.done);
  }
  if (!r.knob.rack) return (1 - f) * S[outItem] + (L.t - T.done);
  const put = T.put == null ? T.start : T.put;
  const fStart = clamp01(1 - ((1 - f) * S[inItem] + (T.start - put)) / S[inItem]);
  return (1 - fStart) * S[outItem] + (L.t - T.start);
}
const fOf = (S, item, e) => clamp01(1 - e / S[item]);

(async () => {
  console.log('\n=== T1118 시설 위 날도 늙는다 — 기다림 = 원물 곡선 · 가공 = 산출 곡선 · 내려도 그 나이 ===');
  // ⓐ 정적
  console.log('\n[ⓐ] 정적 — 손잡이 · 받는 문 · 종전 두 길 · 화면 줄 · 새 수 0');
  {
    const z = fs.readFileSync(SV('zone.js'), 'utf8'), s = fs.readFileSync(SV('spoil.js'), 'utf8');
    const code = (src) => src.split('\n').map((l) => l.replace(/\/\/.*$/, '')).join('\n');
    const fn = (src, name) => { const C = code(src); const i = C.indexOf('function ' + name + '('); if (i < 0) return ''; let d = 0; for (let k = C.indexOf('{', i); k < C.length; k++) { if (C[k] === '{') d++; else if (C[k] === '}') { d--; if (!d) return C.slice(i, k + 1); } } return ''; };
    ok((s.match(/process\.env\.T1118_RACK_AGE/g) || []).length === 1 && /const T1118_RACK = process\.env\.T1118_RACK_AGE !== '0';/.test(s) && !/process\.env\.T1118_RACK_AGE/.test(z),
      "ⓐ 손잡이 spoil.js 한 자리 `!== '0'`(켬 기본 후보 · 되돌림 `=0`) · zone 은 `Spoil.T1118_RACK` 만 읽는다");
    const on = fn(z, '_t1118On');
    ok(/j\.kind === 'preserve'/.test(on) && /Spoil\.T1118_RACK/.test(on) && /Number\.isFinite\(\+j\.startAt\)/.test(on),
      'ⓐ 받는 문은 **보존 주문만**(`kind \'preserve\'` — 요리 · 자염 · 도구 주문 무변) · 시작 순간이 적힌 주문만', on.replace(/\s+/g, ' ').slice(0, 140));
    const col = fn(z, 'doCraftCollect');
    const i1118 = col.indexOf('if (_t1118On(j)) { _t1118Land('), i767 = col.indexOf('if (j.lotFresh && Array.isArray(j.lotFresh[k]) && j.lotFresh[k].length) { _t767Land(player, k, j.lotFresh[k], _d, _kDone); continue; }'), inote = col.indexOf("Lots.note(player, k, n, _d, 'carry', _kDone);");
    ok(i1118 > 0 && i767 > i1118 && inote > i767,
      'ⓐ 받는 문 — 켬 줄 한 줄이 앞에 · 종전 두 길(T767 `_t767Land` · 리셋 `Lots.note`) 글자 그대로 뒤에(끄면 종전 그대로)', `${i1118} < ${i767} < ${inote}`);
    ok(/if \(Spoil\.T767_CARRY\) _pvJob\.lotFresh = \{ \[r\.out\]: Spoil\.carryOf\(r\.from, got\.ages, today\) \};\n  if \(Spoil\.T1118_RACK\) _pvJob\.rack = \{ from: r\.from, put: Date\.now\(\) \};/.test(code(z).replace(/[ \t]+\n/g, '\n')),
      'ⓐ 거는 문 — 주문에 넣은 순간 · 원물 품목(`rack`)은 켬에서만(T767 줄 글자 그대로 다음 한 줄)');
    ok(/if \(Spoil\.T767_CARRY && have > 0\) \{ const o1 = Spoil\.peekOffer\(r\.from, Lots\.of\(player, r\.from\), 1, today\); _pvRow\.outFresh = o1\.fresh; _pvRow\.outStage = Spoil\.stageOf\(o1\.fresh\); \}/.test(z)
      && /if \(Spoil\.T1118_RACK && _pvRow\.outFresh != null\) \{ _pvRow\.outFresh = _t1118Peek\(id, r, _pvRow\.outFresh, b\);/.test(z) && /_facilityRecipes\(player, near\.kind, near\.b\)/.test(z),
      'ⓐ 화면 "나오면" — T767 줄 글자 그대로 + 켬 한 줄(그 시설의 대기열을 본다 · `sendFacility` 가 시설을 넘긴다)');
    const added = [fn(s, 'rackFresh'), fn(s, 'rackLand'), fn(z, '_t1118T'), on, fn(z, '_t1118Land'), fn(z, '_t1118Peek')].join('\n');
    const nums = (added.match(/(?<![\w.])\d+(?:\.\d+)?(?![\w.])/g) || []).filter((x) => x !== '0' && x !== '1');
    ok(added.length > 400 && nums.length === 0, 'ⓐ 새 수 0 — 더한 함수 여섯에 0 · 1 뿐(곡선 · 보관일 · 자리 · 소요일은 정본 값을 부른다)', `${added.length}자 · 수 ${nums.join(',') || '없음'}`);
  }

  const RUNS = {};
  const COMBOS = {
    on_mom: {}, on_day: { T732_MOMENT_LOT: '0' }, off_mom: { T1118_RACK_AGE: '0' }, off_day: { T1118_RACK_AGE: '0', T732_MOMENT_LOT: '0' },
    rst_on: { T767_PRESERVE_CARRY: '0' }, rst_off: { T767_PRESERVE_CARRY: '0', T1118_RACK_AGE: '0' },
  };
  const got = await Promise.all(Object.entries(COMBOS).map(([k, env]) => child(env).then((r) => [k, r])));
  for (const [k, r] of got) RUNS[k] = r;
  for (const [k, r] of Object.entries(RUNS)) pre(!r.err && r.knob, `아이 판 ${k} 이 끝까지 돌았다`, r.err ? String(r.err).split('\n')[0].slice(0, 160) : JSON.stringify(r.knob));
  const K = (k) => RUNS[k].knob || {};
  pre(K('on_mom').rack && K('on_mom').carry && K('on_mom').moment && K('on_day').rack && !K('on_day').moment && !K('off_mom').rack && K('off_mom').moment
    && !K('off_day').rack && !K('off_day').moment && K('rst_on').rack && !K('rst_on').carry && !K('rst_off').rack && !K('rst_off').carry && K('on_mom').dayMs === 2000,
    '여섯 판의 손잡이가 뜻한 대로 섰다(켬 · 끔 × 순간 · 날 · 리셋 둘) · 하루 2초');
  const S = RUNS.on_mom.shelf || {};
  pre(S.fish > 0 && S.berry > S.fish && S.dried_fish > S.berry && S.dried_fruit > S.berry, '보관일 — 생선 < 과실 < 건어물 · 말린 과실(보존식이 느리다)', JSON.stringify(S));

  // ⓑ 빈 건조대
  for (const [nm, key] of [['켬·순간', 'on_mom'], ['켬·날', 'on_day'], ['끔·순간', 'off_mom'], ['끔·날', 'off_day']]) {
    const r = RUNS[key]; if (r.err || !r.b) continue;
    const b = r.b, jv = b.jv;
    console.log(`\n[ⓑ] 빈 건조대 — ${nm}`);
    pre(jv && jv.kind === 'preserve' && jv.lotFresh && Array.isArray(jv.lotFresh.dried_fish) && near(jv.T.done - jv.T.start, 3, 0.02),
      '주문 = 보존 · 넣은 신선도가 실렸다 · 소요일 3(하루 2초 × 3)', jv ? `시작 → 다 됨 ${(jv.T.done - jv.T.start).toFixed(4)}날` : '주문 없음');
    ok(b.dried === 2 && b.fish0 === 2 && b.fishLeft === 0, `ⓑ ${nm} — 개수 그대로(생선 2 → 건어물 2)`, `${b.fish0} → ${b.dried}`);
    const L = b.lots[0], f = jv.lotFresh.dried_fish[0].f, base = (1 - f) * r.shelf.dried_fish;
    const want = expectE(r, jv, L, f, 'fish', 'dried_fish');
    ok(b.lots.length === 1 && near(L.e, want), `★ⓑ ${nm} — 받은 노출 = 기대(부모가 센 값)`, `받은 ${L && L.e} · 기대 ${want.toFixed(6)}`);
    const extra = L.e - base - (L.t - jv.T.done);   // 다 된 뒤 날을 뺀 나머지 = 시설 위에서 센 날
    if (r.knob.rack) ok(near(extra, jv.T.done - jv.T.start, 2e-5) && extra > 2.9,
      `★★ⓑ ${nm} — **소요일이 나이에 든다**(시설 위 날 ${extra.toFixed(4)} = 소요일 ${(jv.T.done - jv.T.start).toFixed(4)} · 건어물 f ${(-extra / r.shelf.dried_fish).toFixed(4)})`);
    else ok(near(extra, 0, 2e-5), `★ⓑ ${nm} — 끔(종전): 시설 위 날 0 — 소요일이 빠진다(정지 상자)`, extra.toFixed(6));
    // ⓔ 화면 — 빈 시설: 켬 = 다 되는 순간의 신선도(받은 값에서 다 된 뒤 날을 뺀 것) · 끔 = 넣은 신선도.
    //   화면을 본 순간(`tv` 띠)과 넣은 순간 사이에 생선이 늙는다(하루 2초 · 보관 2.5일) — 빈 시설은 넣는 순간이 곧 시작이라 그 몫(Δ날 ÷ 생선 보관일)만큼 화면이 높다.
    const fDone = fOf(r.shelf, 'dried_fish', L.e - (L.t - jv.T.done)), tp = jv.T.put == null ? jv.T.start : jv.T.put;
    const lo = (tp - b.tv[1]) / r.shelf.fish - 1e-4, hi = (tp - b.tv[0]) / r.shelf.fish + 1e-4;
    const dv = b.row ? b.row.outFresh - (r.knob.rack ? fDone : f) : NaN;
    if (r.knob.rack) ok(dv >= lo && dv <= hi, `★ⓔ ${nm} — 화면 "나오면" = 다 되는 순간의 신선도(받은 값과 같은 식 · 본 순간 → 넣은 순간 생선 몫만 다르다)`, `화면 ${b.row && b.row.outFresh} · 받은 ${fDone.toFixed(6)} · 차 ${dv.toFixed(6)} ∈ [${lo.toFixed(6)}, ${hi.toFixed(6)}]`);
    else ok(dv >= lo && dv <= hi, `ⓔ ${nm} — 끔: 화면 "나오면" = 넣은 신선도(종전 · 본 순간 → 넣은 순간 생선 몫만 다르다)`, `화면 ${b.row && b.row.outFresh} · 넣은 ${f} · 차 ${dv.toFixed(6)} ∈ [${lo.toFixed(6)}, ${hi.toFixed(6)}]`);
    if (r.knob.rack) ok(jv.hasRack && jv.rack && jv.rack.from === 'fish' && jv.T.put <= jv.T.start + 1e-9, `ⓑ ${nm} — 주문에 넣은 순간 · 원물 품목이 실렸다`, JSON.stringify(jv.rack));
    else ok(!jv.hasRack, `★ⓖ ${nm} — 되돌림(\`=0\`): 주문에 \`rack\` 칸이 없다(건물 저장 글자 종전)`, String(jv.hasRack));
    if (key === 'on_mom' || key === 'off_mom') ok(b.lots.every((l) => l.k != null && l.d === Math.floor(l.k / r.knob.dayMs)), `ⓑ ${nm} — 얻은 순간 \`k\` · 날 \`d\` = 다 된 순간(화면 "N일 전" · 차례 무변)`, b.lots.map((l) => l.d).join(','));
  }

  // ⓒ 앞 주문 기다림 — 과실(뒤 주문)
  for (const [nm, key] of [['켬·순간', 'on_mom'], ['켬·날', 'on_day'], ['끔·순간', 'off_mom'], ['끔·날', 'off_day']]) {
    const r = RUNS[key]; if (r.err || !r.c) continue;
    const c = r.c, jB = c.jB;
    console.log(`\n[ⓒ] 앞 주문 기다림 — ${nm}`);
    pre(jB && c.jA && near(jB.T.start, c.jA.T.done, 1e-6) && (jB.T.start - (jB.T.put == null ? jB.T.start : jB.T.put)) > (r.knob.rack ? 2.5 : -1),
      '뒤 주문은 앞 주문이 끝난 뒤 시작한다(시설은 하나씩 — `Facility.enqueue`)', jB ? `기다림 ${jB.T.put == null ? '(넣은 순간 칸 없음)' : (jB.T.start - jB.T.put).toFixed(4) + '날'}` : '');
    ok(c.dried === 1 && c.fishDried === 1, `ⓒ ${nm} — 개수 그대로(앞 생선 1 · 뒤 과실 1 둘 다 받았다)`, `${c.fishDried} · ${c.dried}`);
    const L = c.lots[0], f = jB.lotFresh.dried_fruit[0].f;
    const want = expectE(r, jB, L, f, 'berry', 'dried_fruit');
    ok(c.lots.length === 1 && near(L.e, want), `★ⓒ ${nm} — 받은 노출 = 기대`, `받은 ${L && L.e} · 기대 ${want.toFixed(6)}`);
    const fDone = fOf(r.shelf, 'dried_fruit', L.e - (L.t - jB.T.done));
    if (r.knob.rack) {
      const wait = jB.T.start - jB.T.put, fStart = clamp01(1 - ((1 - f) * r.shelf.berry + wait) / r.shelf.berry);
      const eAlt = (1 - f) * r.shelf.dried_fruit + (L.t - jB.T.put);   // 기다린 날도 산출 곡선(말린 과실)이었다면
      ok(fStart < 0.6 && fStart > 0.3 && L.e - eAlt > 10,
        `★★ⓒ ${nm} — 기다린 ${wait.toFixed(3)}날은 **원물 곡선**(과실 ${r.shelf.berry}일)으로 — 가공 시작 신선도 ${f.toFixed(4)} → ${fStart.toFixed(4)}`,
        `다 됨 ${fDone.toFixed(4)} · 기다림도 산출 곡선이었다면 노출 ${eAlt.toFixed(3)}(받은 ${L.e})`);
      ok(c.row && near(c.row.outFresh, fDone, 1e-4), `★ⓔ ${nm} — 앞 주문이 있는 시설의 "나오면" = 기다림 + 소요일 뒤 신선도(받은 값과 같다)`, `화면 ${c.row && c.row.outFresh} · 받은 ${fDone.toFixed(6)}`);
    } else {
      ok(near(fDone, f, 2e-5), `★ⓒ ${nm} — 끔(종전): 기다림 · 소요일이 다 빠진다(다 된 순간 신선도 = 넣은 신선도 ${f})`, fDone.toFixed(6));
      ok(c.row && near(c.row.outFresh, f, 1e-4), `ⓔ ${nm} — 끔: 화면 "나오면" = 넣은 신선도(종전)`, String(c.row && c.row.outFresh));
    }
  }

  // ⓓ 늦게 받기
  {
    console.log('\n[ⓓ] 늦게 받기 — 다 된 뒤 하루 더');
    for (const [nm, key] of [['켬·순간', 'on_mom'], ['끔·순간', 'off_mom']]) {
      const r = RUNS[key]; if (r.err || !r.d) continue;
      const d = r.d, jv = d.jv, L = d.lots[0], f = jv.lotFresh.dried_fish[0].f;
      const late = L.t - jv.T.done, want = expectE(r, jv, L, f, 'fish', 'dried_fish');
      ok(d.dried === 1 && late > 0.95 && near(L.e, want), `★ⓓ ${nm} — 다 된 뒤 ${late.toFixed(3)}날도 센다 · 받은 노출 = 기대`, `받은 ${L.e} · 기대 ${want.toFixed(6)}`);
    }
    const a = RUNS.on_mom.d, o = RUNS.off_mom.d;
    if (a && o) {
      const ea = a.lots[0].e - (1 - a.jv.lotFresh.dried_fish[0].f) * RUNS.on_mom.shelf.dried_fish - (a.lots[0].t - a.jv.T.done);
      const eo = o.lots[0].e - (1 - o.jv.lotFresh.dried_fish[0].f) * RUNS.off_mom.shelf.dried_fish - (o.lots[0].t - o.jv.T.done);
      ok(near(ea, a.jv.T.done - a.jv.T.start, 2e-5) && near(eo, 0, 2e-5), '★ⓓ 켬 − 끔 = 소요일뿐 — 다 된 뒤 날은 둘 다 한 번만 센다(두 번 세지 않는다)', `켬 ${ea.toFixed(4)} · 끔 ${eo.toFixed(4)}`);
    }
  }

  // ⓕ T767 끔(리셋 갈래)
  {
    console.log('\n[ⓕ] T767 끔 — 리셋 갈래');
    for (const [nm, key] of [['켬', 'rst_on'], ['끔', 'rst_off']]) {
      const r = RUNS[key]; if (r.err || !r.b) continue;
      const b = r.b, jv = b.jv, L = b.lots[0];
      const want = expectE(r, jv, L, 1, 'fish', 'dried_fish');
      ok(b.dried >= 1 && !jv.lotFresh && b.lots.length === 1 && near(L.e, want), `★ⓕ ${nm} — 받은 노출 = 기대(${r.knob.rack ? '가공이 시작되는 순간에 갓 만든 것 + 소요일' : '다 된 순간 갓 만든 것 — 종전'})`, `받은 ${L && L.e} · 기대 ${want.toFixed(6)} · 개수 ${b.dried}`);
      if (r.knob.rack) ok(near(L.e - (L.t - jv.T.done), jv.T.done - jv.T.start, 2e-5), `ⓕ ${nm} — 리셋도 가공 날은 센다(다 되는 순간 f ${fOf(r.shelf, 'dried_fish', L.e - (L.t - jv.T.done)).toFixed(4)})`);
    }
  }

  console.log(`\n=== 결과: ${pass} PASS / ${fail} FAIL ===`);
  process.exit(fail ? 1 : 0);
})();
