#!/usr/bin/env node
// @regress   ← 통합 러너가 이 표를 보고 자기 목록을 만든다(표 없으면 안 돈다)
// === scripts/test-t976-want-capped.js — 받을 양 견적의 wantCapped 는 상한 절삭이 놓은 그대로 [T976] ==========
//
// ★왜 [T976 · T965 회부 1] 받을 양 갈래 끝 줄 `out.wantCapped = false;`(T69)가 T835 상한 절삭이 놓은 `true` 를 곧바로 덮었다.
//   그 판은 마을이 지금 내줄 몫 전부(`cap`)가 낼 것 한 개 값에 못 미쳐 절삭이 낱개 0 을 낸 판이다(견적 `giveNeeded` · `takeAtNeeded` = null ·
//   실행은 "… 못 내준다 — 지금 내줄 수 있는 건 N까지다"로 거절). 견적이 `wantCapped = false` 라 클라 받을 양 축은 거래 줄을 비우고 단추만 끈다.
//   손잡이 하나 `T976_WANT_CAPPED`(켬 기본 · `=0` = 종전) — 켜면 끝 줄이 절삭이 `true` 를 놓은 판만 건너뛴다.
//
// 재는 것:
//   ① 술어 — `=== '0'` 만 끔(켬 기본) · 읽는 자리 = `server/trade.js` 하나 · 끔 탐침
//   ② 글자 — 끝 줄이 손잡이 갈래 하나 · `out.wantCapped = false` 는 그 줄 하나 · 절삭의 `true` 자리 그대로 · 클라가 그 칸을 읽어 경고를 그린다
//   ③ 판 — 0날 세계(시드 7 · 마을 5) · 낼 것 둘(아이템 여럿인 재화) × 받을 것 여섯 · 받을 양 1:
//      무거운 짐(낱개 하나 = 그 짝 `maxGive` + 2 단위 — 마을이 내줄 몫 전부보다 무겁다 · 세계 값과 무관하게 절삭 0) · 가벼운 짐(낱개 = 연속해 ÷ 4)
//      ⓐ 미끼(끔) — 절삭 0 판의 견적이 `wantCapped = false` · `giveNeeded = null`(빈 거래 줄)이다(자명 통과 금지)
//      ⓑ ★켬 — 절삭 0 판은 전부 `wantCapped = true` · 낱개 · 받을 양 칸은 그대로 null
//      ⓒ ★실행은 두 판 다 같은 말로 거절한다 — "… 못 내준다 — 지금 내줄 수 있는 건 N까지다" · N = 견적의 `cap`(화면 경고와 같은 수)
//      ⓓ 그 밖은 한 글자도 안 다르다 — 절삭 0 이 아닌 판(가벼운 짐 전부)의 견적 · 실행 = 끔 · 절삭 0 판도 `wantCapped` 칸 밖은 같다
//      ⓔ ★클라 — 거래 패널(`renderTradePanel` 글자 그대로)에 그 견적을 넣어 그린다: 끔 = 경고 · '내야 할' 줄 0 · 켬 = 경고 한 줄 · 단추는 둘 다 꺼짐
//
// 실행: node scripts/test-t976-want-capped.js   (존 안 띄움 · 아이 판 둘 · 약 1분)
'use strict';
// ★[T988 2026-10-28] 이 하네스는 T976 의 칸(`wantCapped`)과 그 칸이 부르는 종전 말을 잰다 — 말을 고친 `T988_TRADE_WORDS` 는 끈 판에서 돈다(되돌림 `=0` · 단언 무변).
//   켬 판의 말(절삭 0 판은 "… 한 개 값이 … 전부(N)보다 비싸다 — 이 마을은 지금 그 값을 못 치른다" 등)은 `test-t988-trade-words` 가 잰다.
process.env.T988_TRADE_WORDS = '0';
const path = require('path');
const fs = require('fs');
const { execFileSync } = require('child_process');
const ROOT = path.join(__dirname, '..');

if (process.env.T976_SUB === '1') {   // ── 아이 판: 0날 세계 · 판마다 곳간 · 인벤을 되돌린다 ──
  const _l = console.log; console.log = () => {};
  const SV = (f) => path.join(ROOT, 'server', f);
  const V = require(SV('villages.js')), Events = require(SV('events.js')), Trade = require(SV('trade.js'));
  const econV2 = require(path.join(ROOT, 'sim', 'economy-sim-v2'));
  const world = econV2.createWorldV2({ seed: 7, villageCount: 5, picker: 'rational', infoRange: 5000, raidPer100: 0.005 });
  const L = Events.createLedger({ econV2, vidOf: (v, i) => i, depositMap: V.playerVillageDepositMap() });
  L.prime(world);
  const D = L.deliverable;
  const GIVES = [...D.items.entries()].filter(([, its]) => its.length > 1).map(([r]) => r).slice(0, 2);
  const restore = (v, snap) => { const S = JSON.parse(snap); for (const k of Object.keys(v.storage)) if (!(k in S)) delete v.storage[k]; Object.assign(v.storage, S); };
  const rows = [];
  for (let vi = 0; vi < 5; vi++) for (const give of GIVES) for (const take of ['wood', 'stone', 'food', 'fish', 'salt', 'hide']) {
    if (take === give || !D.toEcon.get(take)) continue;
    const vil = { name: '랩마을' + vi, ccx: 100, ccy: 100, dbId: vi, econ: world.villages[vi] }, v = vil.econ;
    const its = D.items.get(give);
    const b = Trade.quote(L, econV2, vil, vi, give, take, 1, { want: 1, perItem: 1 });   // 짐 없는 견적 — 그 짝의 `maxGive` · `cap` · 연속해
    if (!(b && !b.err && b.cap >= 1 && b.giveNeededUnits > 0)) { rows.push({ vi, give, take, skip: b && b.err ? b.err : 'cap<1' }); continue; }
    for (const kind of ['heavy', 'light']) {
      const U = kind === 'heavy' ? b.maxGive + 2 : b.giveNeededUnits / 4;
      const unitsOf = (it, n) => n * U;
      const mkInv = () => { const o = {}; its.forEach((it, j) => { o[it] = j === 0 ? 2 : 30; }); return o; };
      const snap = JSON.stringify(v.storage), inv = mkInv();
      const q = Trade.quote(L, econV2, vil, vi, give, take, U, { want: 1, perItem: U, inventory: inv, unitsOf, giveCount: 1 });   // 호스트 `villageTradeQuote` 꼴
      const x = Trade.exchange({ ledger: L, econV2, vil, vid: vi, inventory: inv, giveRes: give, takeRes: take, giveQty: 0, want: 1, unitsOf, deposit: V.playerVillageDeposit });
      restore(v, snap);
      rows.push({ vi, give, take, kind, q, x: x.ok ? { ok: 1, give: x.give, take: x.take } : { ok: 0, err: x.err } });
    }
  }
  console.log = _l; console.log(JSON.stringify({ on: Trade.T976_ON, gives: GIVES, ko: Object.fromEntries(['wood', 'stone', 'food', 'fish', 'salt', 'hide', ...GIVES].map((r) => [r, Events.koRes(r)])), rows }));
  process.exit(0);
}

let pass = 0, fail = 0;
const ok = (c, m, x) => { c ? pass++ : fail++; console.log((c ? '  ✓ ' : '  ✗ ') + m + (x !== undefined ? `  ${x}` : '')); };
const T = fs.readFileSync(path.join(ROOT, 'server', 'trade.js'), 'utf8');
const codeOnly = require('./code-only.js');
const C = codeOnly(T);

console.log('\n=== 받을 양 견적의 wantCapped 는 상한 절삭이 놓은 그대로 (T976) ===');
console.log('\n① 술어 · 읽는 자리 · 끔 탐침');
{ const decl = T.match(/const T976_ON = !\(typeof process !== 'undefined' && process\.env && process\.env\.T976_WANT_CAPPED === '0'\);/g) || [];
  ok(decl.length === 1, "① 선언 하나 · `=== '0'` 만 끔(켬 기본)", `선언 ${decl.length}`);
  const files = []; const walk = (d) => { for (const f of fs.readdirSync(d)) { const p = path.join(d, f); const st = fs.statSync(p); if (st.isDirectory()) walk(p); else if (/\.js$/.test(f)) files.push(p); } };
  for (const d of ['server', 'sim', 'public']) walk(path.join(ROOT, d));
  const readers = files.filter((p) => codeOnly(fs.readFileSync(p, 'utf8')).includes('T976_WANT_CAPPED')).map((p) => path.relative(ROOT, p));
  ok(readers.length === 1 && readers[0] === path.join('server', 'trade.js'), '① 읽는 자리 = server/trade.js 하나', readers.join(','));
  const probe = (v) => { const e = Object.assign({}, process.env); delete e.T976_WANT_CAPPED; if (v != null) e.T976_WANT_CAPPED = v;
    return execFileSync(process.execPath, ['-e', `console.log(require(${JSON.stringify(path.join(ROOT, 'server', 'trade.js'))}).T976_ON)`], { env: e, encoding: 'utf8' }).trim().split('\n').pop(); };
  ok(probe(null) === 'true' && probe('0') === 'false' && probe('1') === 'true', '① ★끔 탐침 — env 없음 = 켬 · `=0` = 끔 · `=1` = 켬', `${probe(null)} · ${probe('0')} · ${probe('1')}`); }

console.log('\n② 글자 — 끝 줄 하나 · 절삭 자리 그대로 · 클라가 읽는다');
const P = fs.readFileSync(path.join(ROOT, 'public', 'client', '50-i-panel.js'), 'utf8');
const panelSrc = (P.match(/function renderTradePanel[^]*?\n  \}\n/) || [''])[0];
{ ok((C.match(/if \(!\(T976_ON && out\.wantCapped === true\)\) out\.wantCapped = false;/g) || []).length === 1, '② 받을 양 갈래 끝 줄 = 손잡이 갈래 하나');
  ok((C.match(/out\.wantCapped = false/g) || []).length === 1, '② `out.wantCapped = false` 는 그 줄 하나(맨 줄 사본 0)');
  //   ★[T988] 절삭 0 자리는 T988 이 그 판의 말(`why`) 한 줄을 그 안에 더했다 — 그 한 줄 말고는 같은 글자(세 칸 null · true)를 그대로 본다
  ok((C.match(/out\.wantCapped = true/g) || []).length === 2 && /if \(!\(tr\.n > 0\) \|\| !\(out\.takeAtNeeded > 0\)\) \{\s*(?:if \(T988_ON\) out\.why = _whyNot\([^;\n]*\);\s*)?out\.giveNeeded = null; out\.takeAtNeeded = null; out\.wantCapped = true;\s*\}/.test(C),
    '② `true` 를 놓는 자리 둘 그대로(받을 양 > 상한 · T835 절삭 낱개 0)');
  //   ★[T988] 경고 글자는 견적이 그 판의 말(`why`)을 실으면 그 말 · 없으면 T976 글자 그대로(`why ||` 한 겹만 허락)
  ok(panelSrc.length > 500 && /if \(trQuote\.wantCapped\) h \+= `<div class="tr-warn">(?:\$\{trQuote\.why \|\| `)?마을이 지금 내줄 수 있는 \$\{tk\}은\(는\) \$\{trQuote\.cap\}까지다(?:`\})?<\/div>`;/.test(panelSrc),
    '② 클라 받을 양 축이 그 칸을 읽어 경고를 그린다(`renderTradePanel` · 손잡이는 안 읽는다)', `${panelSrc.length}자`); }

const sub = (env) => JSON.parse(execFileSync(process.execPath, [__filename], { env: Object.assign({}, process.env, env, { T976_SUB: '1' }), stdio: 'pipe', maxBuffer: 64 << 20 }).toString().trim().split('\n').pop());
console.log('\n③ 판 — 0날 세계 · 받을 양 1 · 무거운 짐(낱개 하나 > 마을이 내줄 몫 전부) · 가벼운 짐');
{ const on = sub({ T976_WANT_CAPPED: '1' }), off = sub({ T976_WANT_CAPPED: '0' });
  const live = (R) => R.filter((r) => !r.skip);
  const tz = (r) => r.q && !r.q.err && r.q.wantTrimmed === true && r.q.giveNeeded == null;   // 절삭 0 판
  const onTz = live(on.rows).filter(tz), offTz = live(off.rows).filter(tz);
  ok(on.on === true && off.on === false && on.gives.length === 2 && on.rows.length === off.rows.length, '③ 전제 — 손잡이가 실제로 읽힌다 · 낼 것 둘 · 두 판 줄 수 같다', `${on.gives.join(' · ')} · ${on.rows.length} 줄`);
  ok(onTz.length >= 20 && onTz.every((r) => r.kind === 'heavy') && live(on.rows).filter((r) => r.kind === 'heavy').every(tz),
    '③ 전제 — 무거운 짐은 전부 절삭 0 판이다(넉넉하다 · 자명 통과 금지)', `${onTz.length} 판`);
  ok(live(on.rows).filter((r) => r.kind === 'light').length >= 20 && !live(on.rows).some((r) => r.kind === 'light' && tz(r)),
    '③ 전제 — 가벼운 짐은 절삭 0 판이 아니다(대조)', `${live(on.rows).filter((r) => r.kind === 'light').length} 판`);
  ok(offTz.length === onTz.length && offTz.every((r) => r.q.wantCapped === false), 'ⓐ 미끼(끔) — 절삭 0 판의 견적은 `wantCapped = false` · `giveNeeded = null`(덮어썼다)',
    `${offTz.length} 판 · 예 ${offTz[0] ? JSON.stringify({ v: offTz[0].vi, pair: offTz[0].give + '>' + offTz[0].take, cap: offTz[0].q.cap, maxGive: offTz[0].q.maxGive, wantCapped: offTz[0].q.wantCapped }) : '-'}`);
  ok(onTz.every((r) => r.q.wantCapped === true && r.q.takeAtNeeded == null), '★★ⓑ 켬 — 절삭 0 판은 전부 `wantCapped = true` · 낱개 · 받을 양 칸은 그대로 null', `${onTz.filter((r) => r.q.wantCapped === true).length}/${onTz.length}`);
  const refuse = (r, ko) => r.x.ok === 0 && r.x.err === `마을이 ${ko[r.take]} 1개를 못 내준다 — 지금 내줄 수 있는 건 ${r.q.cap}까지다`;
  ok(onTz.every((r) => refuse(r, on.ko)) && offTz.every((r) => refuse(r, off.ko)), '★ⓒ 실행은 두 판 다 같은 말로 거절한다 — N = 견적의 `cap`(화면 경고와 같은 수)',
    onTz[0] ? onTz[0].x.err : '-');
  const strip = (r) => { const q = Object.assign({}, r.q); delete q.wantCapped; return JSON.stringify([r.vi, r.give, r.take, r.kind, q, r.x]); };
  const same = on.rows.every((r, i) => (tz(r) ? strip(r) === strip(off.rows[i]) : JSON.stringify(r) === JSON.stringify(off.rows[i])));
  ok(same, 'ⓓ 그 밖은 한 글자도 안 다르다 — 절삭 0 이 아닌 판의 견적 · 실행 = 끔 · 절삭 0 판도 `wantCapped` 칸 밖은 같다');
  //   ⓔ 클라 — 패널 글자 그대로(자유 변수만 넣는다 · 수는 전부 서버 견적의 것)
  const draw = (R, r) => {
    const mk = new Function('myTrade', 'trGive', 'trTake', 'trQuote', 'trAxis', 'trWant', 'trQty', 'inventory', 'itemKo', 'myCarry', 'itemWeights', 'renderSide', 'document', 'window', panelSrc + '\nreturn renderTradePanel;');
    const myTrade = { name: '랩마을' + r.vi, numeraireKo: R.ko[r.give], spread: 0.1, member: null,
      rows: [{ res: r.give, ko: R.ko[r.give], num: 1, sell: 0, mine: 2, canGive: true, canTake: false }, { res: r.take, ko: R.ko[r.take], num: 1, sell: r.q.cap, mine: 0, canGive: false, canTake: true }] };
    const body = { innerHTML: '', querySelectorAll: () => [] };
    mk(myTrade, r.give, r.take, r.q, 'want', 1, 1, {}, (k) => k, null, null, () => {}, { getElementById: () => null }, {})(body);
    return body.innerHTML;
  };
  const r1 = onTz[0], r0 = offTz.find((r) => r.vi === r1.vi && r.give === r1.give && r.take === r1.take && r.kind === r1.kind);
  const hOn = draw(on, r1), hOff = draw(off, r0);
  const warn = `<div class="tr-warn">마을이 지금 내줄 수 있는 ${on.ko[r1.take]}은(는) ${r1.q.cap}까지다</div>`;
  ok(!/tr-warn/.test(hOff) && !/내야 할/.test(hOff) && /id="trGo" disabled/.test(hOff), 'ⓔ 미끼(끔) — 그린 패널에 경고 · \'내야 할\' 줄이 없고 단추만 꺼졌다(까닭 0)');
  ok(hOn.split(warn).length === 2 && !/내야 할/.test(hOn) && /id="trGo" disabled/.test(hOn), '★★ⓔ 켬 — 그린 패널에 경고 한 줄(실행 거절과 같은 수) · 단추는 그대로 꺼짐', warn.replace(/<[^>]+>/g, ''));
  ok(hOn.replace(warn, '') === hOff, 'ⓔ 패널의 나머지 글자는 같다(경고 한 줄만 다르다)'); }

console.log(`\n=== ${pass + fail}건 중 PASS ${pass} · FAIL ${fail} ===\n`);
process.exit(fail ? 1 : 0);
