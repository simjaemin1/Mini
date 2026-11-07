#!/usr/bin/env node
// @regress   ← 통합 러너가 이 표를 보고 자기 목록을 만든다(scripts/run-regress.sh · 표 없으면 안 돈다)
// === scripts/test-t1166-npc-lot-persist.js — NPC 몸 손의 로트 곁 장부를 몸 영속에(`T1166_NPC_LOT_PERSIST` · T1166 · K30 · T1133 회부 2) ==========
//
// ★왜 [판정대기 문 17 ㄱ · 족보 727 · 신선도 캐논] NPC 로트는 몸 밖 `lots.js` `_mNpc`(WeakMap)라 다시 뜨면(몸 = 새 객체) 양(T747 `inventory`)만 남고
//   날짜를 잃었다 — 첫 맞추기가 손 전부를 "지금 얻은 것"으로 잡아(`Lots.stats().approx`) 그 손이 다시 싱싱해졌다.
// 판정 사본 0: 운영 함수 그대로(`villages.__p3Bind` — `_t747Pack` · `_t747Restore` · `_t1166Flush`(= zone 이 시계 뒤 부르는 `lotsClockSet`) · `lots.js`).
//   "다시 뜸" = **다른 프로세스**(모듈 새로 적재 · WeakMap 비어 있음 · 몸 = 새 객체 · 이틀 뒤).
//   ★운영 부팅 차례: 되살림(`_t747Restore` — `SimVillages.init` 안)이 존의 `Lots.setClock` **전**에 돈다(zone.js — init 줄이 위 · 시계 줄이 아래).
//     그래서 판 2 를 두 꼴로 돌린다 — `boot`(운영 차례: 시계 없이 되살림 → 시계 → `lotsClockSet`) · `pre`(시계 먼저 — 하네스 꼴).
// 지키는 것:
//   ⓪ 정적 — 손잡이 한 줄(`!== '0'`) · 몸 줄 `npcDump` · 되살림 `npcLoad` · zone 이 `Lots.setClock` 바로 다음 줄에서 `lotsClockSet` · `_t732Boot` 도 비움
//      · zone.js 에서 `SimVillages.init(` 줄이 `Lots.setClock(` 줄보다 위(부팅 차례 전제 — 바뀌면 이 하네스를 다시 볼 것)
//   ① ★켬(기본) · boot — 되살린 몸 손 로트 = 저장한 줄(순간 k · 양) · 맞추기 근사 0 · 노출 연속(저장 e 이상) · 남은 손(몸이 줄어든 자리) 로트도 첫 몸에
//   ② 켬 · pre — 같은 값(시계가 먼저여도)
//   ③ 끔(`=0` · 종전) — 손 전부가 "다시 뜬 그 순간" 로트 하나 · 근사 ≥ 1(날짜를 잃었다 — 카드가 적은 꼴)
//   ④ T1133 몸 짐 줄 — 켬 · boot 에서 짐 줄 · 원정 표식이 걸린다 · ★T1166 끔 · boot = 종전 꼴(시계 전이라 못 건다 — 운영에서 T1133 이 빈손이던 자리)
//   ⑤ 로트 없는 몸 — 켬 · 끔 몸 줄 글자 같다(칸 0) · 끔이면 로트 든 몸도 `_lots` 칸 0
//   ⑥ 크기 — 몸 하나 `_lots` 칸 바이트
'use strict';
const path = require('path');
const fs = require('fs');
const { execFileSync } = require('child_process');
const ROOT = path.join(__dirname, '..');
const SV = (p) => path.join(ROOT, 'server', p);

// ── 아이 판 ────────────────────────────────────────────────────────────────────────────────
if (process.env.T1166_SUB) {
  const PH = process.env.T1166_SUB, MODE = process.env.T1166_MODE || 'pre';
  const IN = process.env.T1166_IN ? JSON.parse(fs.readFileSync(process.env.T1166_IN, 'utf8')) : null;
  const out = { ph: PH, mode: MODE };
  const _log = console.log; console.log = () => {}; console.warn = () => {}; console.error = () => {};
  try {
    const Lots = require(SV('lots.js')), GL = require(SV('granary-lots.js')), V = require(SV('villages.js'));
    const DAY = 1440000, MIN = DAY / 1440;
    let NOW = IN ? IN.now + 2 * DAY : 900 * DAY + 180 * MIN;   // 다시 뜸 — 이틀 뒤(멈춘 시간)
    const clock = () => Lots.setClock(() => NOW, DAY);
    const players = new Map();
    const A = { name: '갑촌', npcPids: [], econ: { name: '갑촌', npcs: [], counts: {}, storage: { food: 0 } } };
    const H = V.__p3Bind({ deps: { players, setHp: (p, hp) => { p.hp = hp; } }, world: { villages: [A.econ], day: Math.floor(NOW / DAY) }, villages: [A] });
    const mkS = (pid) => { const p = { pid, isNpc: true, hp: 100, inventory: {} }; players.set(pid, p); return p; };
    const lotsOf = (p) => { const L = Lots.all(p); const o = {}; for (const k of Object.keys(L)) if (L[k].length) o[k] = L[k].map((l) => [l.k, l.n]); return o; };
    const eOf = (p, item) => (Lots.all(p)[item] || []).map((l) => +l.e || 0);
    if (PH === 'save') {
      clock();
      out.on = Lots.momentOn();
      const s1 = mkS('s1'), s2 = mkS('s2'), s3 = mkS('s3'); A.npcPids = ['s1', 's2', 's3'];   // s2 = 손 빈 몸(대조) · s3 = 판 2 에서 사라질 몸(남은 손)
      const d0 = Math.floor(NOW / DAY), k1 = NOW;
      Lots.note(s1, 'food', 5, d0, 'carry'); NOW += DAY + 7 * 60 * MIN;
      const k2 = NOW;
      Lots.note(s1, 'food', 3, Math.floor(NOW / DAY), 'carry');
      Lots.note(s3, 'meat', 2, Math.floor(NOW / DAY), 'carry');
      NOW += 5 * 60 * MIN;
      s1.inventory.food = 8; s3.inventory.meat = 2;
      Lots.reconcile(s1, 'food', s1.inventory, Math.floor(NOW / DAY)); Lots.reconcile(s3, 'meat', s3.inventory, Math.floor(NOW / DAY));
      if (GL.ON) { GL.bagLoad(s1, { food: [{ k: k1, u: 2, f0: 1, e: 0, t: k1 / DAY, m: 1, w: 0 }] }); s1._warPackOf = 7; }   // 원정 짐 한 줄(T1133 — 운영 부팅 차례 대조)
      out.k = [k1, k2]; out.lots = lotsOf(s1); out.lots3 = lotsOf(s3); out.e = eOf(s1, 'food');
      out.approx = Lots.stats().approx;
      const P = H._t747Pack(A);
      out.rows = P; out.now = NOW;
      out.rowBytes = P.rows.map((r) => r ? Buffer.byteLength(JSON.stringify(r)) : 0);
      out.lotBytes = P.rows.map((r) => (r && r._lots) ? Buffer.byteLength(JSON.stringify({ _lots: r._lots })) : 0);
      out.st = H.t1166Stat();
    }
    if (PH === 'restore') {
      if (MODE === 'pre') clock();
      const s1 = mkS('s1'), s2 = mkS('s2'); A.npcPids = ['s1', 's2'];   // 다시 뜬 몸 — 새 객체 · 빈손 · 몸 하나 줄었다(s3 손은 첫 몸에)
      A.econ._t747Body = IN.rows;
      out.R = H._t747Restore();
      out.pendBefore = H.t1166Stat().pend;
      if (MODE === 'boot') { clock(); H._t1166Flush(); }   // zone: `Lots.setClock(...)` 다음 줄 `SimVillages.lotsClockSet()`
      out.pendAfter = H.t1166Stat().pend;
      out.lotsRaw = lotsOf(s1); out.eRaw = eOf(s1, 'food');
      const a0 = Lots.stats().approx;
      const day = Math.floor(NOW / DAY);
      Lots.reconcile(s1, 'food', s1.inventory, day); Lots.reconcile(s1, 'meat', s1.inventory, day);
      out.approx = Lots.stats().approx - a0;
      out.lots = lotsOf(s1); out.e = eOf(s1, 'food'); out.inv = s1.inventory; out.kNow = NOW;
      const B = GL.bagOf(s1); out.bag = B && B.food ? B.food.map((r) => [r.k, +(+r.u).toFixed(6)]) : null; out.packOf = s1._warPackOf == null ? null : s1._warPackOf;
      out.st = H.t1166Stat(); out.st33 = H.t1133Stat();
      out.bodyField = Object.prototype.hasOwnProperty.call(s1, 'lots');
    }
  } catch (e) { out.err = String((e && e.stack) || e).slice(0, 600); }
  _log(JSON.stringify(out));
  process.exit(0);
}

// ── 부모 ──────────────────────────────────────────────────────────────────────────────────
let pass = 0, fail = 0;
const ok = (c, m, d) => { c ? pass++ : fail++; console.log((c ? '  ✓ ' : '  ✗ ') + m + (d !== undefined && d !== '' ? `  ${d}` : '')); };
const KNOBS = ['T1166_NPC_LOT_PERSIST', 'T1133_BAG_PERSIST', 'T732_MOMENT_LOT', 'T747_BODY_KEEP', 'T1166_SUB', 'T1166_IN', 'T1166_MODE'];
const BASE = (() => { const e = Object.assign({}, process.env); for (const k of KNOBS) delete e[k]; return e; })();
const TMP = fs.mkdtempSync(path.join(require('os').tmpdir(), 't1166-'));
let nTmp = 0;
function sub(ph, knob, inObj, mode) {
  const env = Object.assign({}, BASE, { T1166_SUB: ph, T1166_MODE: mode || 'pre' });
  if (knob != null) env.T1166_NPC_LOT_PERSIST = knob;
  if (inObj) { const f = path.join(TMP, `in-${nTmp++}.json`); fs.writeFileSync(f, JSON.stringify(inObj)); env.T1166_IN = f; }
  try { return JSON.parse(execFileSync(process.execPath, [__filename], { env, stdio: 'pipe', maxBuffer: 64 << 20 }).toString().trim().split('\n').pop()); }
  catch (e) { return { err: String((e && e.message) || e).slice(0, 400) }; }
}
const J = JSON.stringify;
console.log('\n=== NPC 몸 손의 로트 곁 장부를 몸 영속에 — T1166_NPC_LOT_PERSIST ===');
{
  const Vs = fs.readFileSync(SV('villages.js'), 'utf8'), Zs = fs.readFileSync(SV('zone.js'), 'utf8'), Ls = fs.readFileSync(SV('lots.js'), 'utf8');
  const zl = Zs.split('\n');
  const iInit = zl.findIndex((l) => /^SimVillages\.init\(/.test(l)), iClk = zl.findIndex((l) => /^if \(T732_MOMENT\) Lots\.setClock\(/.test(l));
  ok(/const T1166_LOT = process\.env\.T1166_NPC_LOT_PERSIST !== '0';/.test(Vs) && (Vs.match(/process\.env\.T1166_NPC_LOT_PERSIST/g) || []).length === 1
    && /const lt = _L \? _L\.npcDump\(b\) : null; if \(lt\) \{ o\._lots = lt;/.test(Vs) && /_t1166LotLoad\(b, S\._lots, false\)/.test(Vs)
    && /_t732BootWait = false;\n  _t1166Flush\(\);/.test(Vs) && /function npcDump\(p, look\)/.test(Ls) && /function npcLoad\(p, saved\)/.test(Ls),
    "⓪ 손잡이 한 줄(`!== '0'`) · 몸 줄 `npcDump` · 되살림 `npcLoad` · `_t732Boot` 도 비움");
  ok(iInit >= 0 && iClk > iInit && /SimVillages\.lotsClockSet\(\)/.test(zl[iClk + 1] || ''),
    '⓪ 부팅 차례 — zone.js `SimVillages.init(` 줄 < `Lots.setClock(` 줄 · 바로 다음 줄이 `lotsClockSet()`', `init ${iInit + 1} · 시계 ${iClk + 1}`);
}
const S1 = sub('save', null), S0 = sub('save', '0');
const pre = !S1.err && !S0.err && S1.on === true && (S1.lots.food || []).length === 2 && (S1.lots3.meat || []).length === 1;
ok(pre, '[상황] 판 1 — NPC 손 로트 두 순간(food) · 사라질 몸 손 로트(meat)', S1.err || S0.err || J(S1.lots));
if (pre) {
  const B1 = sub('restore', null, S1, 'boot'), P1 = sub('restore', null, S1, 'pre'), B0 = sub('restore', '0', S0, 'boot');
  ok(!B1.err && !P1.err && !B0.err, '[상황] 판 2 — 다시 뜬 프로세스에서 되살림 · 맞추기가 돌았다', B1.err || P1.err || B0.err || '');
  const want = J(S1.lots.food);
  ok(B1.pendBefore === 3 && B1.pendAfter === 0 && B1.st.deferred === 2 && B1.st.bagDeferred === 1 && J(B1.lots.food) === want && B1.approx === 0 && B1.inv.food === 8 && !B1.bodyField,
    '★① 켬 · boot(운영 차례) — 시계 전엔 쥐고(3 = 몸 로트 · 남은 손 로트 · 몸 짐) 시계 뒤 건다 · 손 로트 = 저장한 줄(순간 · 양) · 근사 0 · 몸 필드 0', J({ pend: [B1.pendBefore, B1.pendAfter], lots: B1.lots.food, approx: B1.approx }));
  ok(B1.e.length === 2 && B1.e.every((e, i) => e >= S1.e[i] - 1e-9) && B1.e[0] > S1.e[0],
    '★① 켬 — 노출이 이어진다(저장 e 이상 · 다시 뜬 뒤 정산에서 는다 — 싱싱해지지 않는다)', `저장 ${J(S1.e)} → 되살린 뒤 ${J(B1.e)}`);
  ok(J(B1.lots.meat) === J(S1.lots3.meat) && B1.inv.meat === 2 && B1.st.spill === 1,
    '★① 켬 — 남은 손(몸이 줄어든 자리) 로트도 첫 몸에(날짜째 · 소멸 0)', J({ meat: B1.lots.meat, inv: B1.inv }));
  ok(P1.pendBefore === 0 && J(P1.lots) === J(B1.lots) && P1.approx === 0,
    '② 켬 · pre(시계 먼저) — 바로 걸고 같은 값', J(P1.lots));
  const k0 = (B0.lots.food || []).map((x) => x[0]);
  ok(J(B0.lotsRaw) === '{}' && B0.approx >= 1 && k0.length === 1 && k0[0] === B0.kNow && (B0.lots.food || [])[0][1] === 8,
    '③ 끔(`=0` · 종전) — 손 8 전부가 "다시 뜬 그 순간" 로트 하나 · 근사 ≥ 1(날짜를 잃었다 — 카드가 적은 꼴)', J({ lots: B0.lots.food, approx: B0.approx, kNow: B0.kNow }));
  if (S1.rows.rows[0] && S1.rows.rows[0]._bag) {
    ok(J(B1.bag) === J([[S1.k[0], 2]]) && B1.packOf === 7 && P1.packOf === 7 && B0.bag === null && B0.packOf === null,
      '④ T1133 몸 짐 — 켬 · boot 에서 짐 줄 · 원정 표식이 걸린다 · T1166 끔 · boot 는 종전(시계 전이라 못 건다 — 운영에서 T1133 이 빈손이던 자리)', J({ on: [B1.bag, B1.packOf], off: [B0.bag, B0.packOf] }));
  } else ok(false, '④ T1133 몸 짐 — 판 1 몸 줄에 `_bag` 이 없다(GL.ON?)', J(S1.rows.rows[0]));
  const r1 = S1.rows.rows, r0 = S0.rows.rows;
  ok(J(r1[1]) === J(r0[1]) && !('_lots' in (r1[1] || {})) && !('_lots' in (r0[0] || {})) && !('_lots' in (r0[2] || {})),
    '⑤ 로트 없는 몸 — 켬 · 끔 몸 줄 글자 같다(칸 0) · 끔이면 로트 든 몸도 `_lots` 칸 0', J({ on: r1[1], off: r0[1] }));
  ok(S1.lotBytes[0] > 0 && S1.rowBytes[0] - S0.rowBytes[0] === S1.lotBytes[0] - 1,
    '⑥ 크기 — 로트 든 몸 하나 몸 줄 증가 바이트 = `_lots` 칸', `몸 줄 ${S0.rowBytes[0]} → ${S1.rowBytes[0]} B · 로트 칸 ${S1.lotBytes[0]} B(레코드 2) · 고기 몸 ${S1.lotBytes[2]} B(레코드 1)`);
}
fs.rmSync(TMP, { recursive: true, force: true });
console.log(`\n=== PASS ${pass} / FAIL ${fail} ===`);
process.exit(fail ? 1 : 0);
