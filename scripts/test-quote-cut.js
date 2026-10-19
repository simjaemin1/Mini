#!/usr/bin/env node
// @regress   ← 통합 러너가 이 표를 보고 자기 목록을 만든다(scripts/run-regress.sh · 표 없으면 안 돈다)
// === scripts/test-quote-cut.js — T807: 거래소 견적 = 실행(상한에 닿을 때) · 손잡이 `T807_QUOTE_CUT`('1' 만 켬) ===
//
// ★T792 회부 2: 곡식 → 고기 6 을 내면 견적은 44(상한)를, 실행은 36 을 줬다 — 사람에게 보인 값과 실제 맞바꿈이 다르면 거짓말이다.
//   까닭(이 하네스 ① 이 같은 곳간 · 같은 순간에 재현한다): 상한에 닿으면 조각 계획(`planSliced`)이 낼 양을 **소수에서** 멈추고 견적은 그 took(= 상한)을 말한다.
//   실행은 낱개만 낼 수 있어 `⌊maxGive ÷ 개당 단위⌋` 로 깎은 개수로 다시 계획한다.
//   고친 것(`server/trade.js` 한 자리 · 새 수 0): 깎는 셈을 함수 하나(`_capGive`)로 — 켬이면 견적도 그 함수로 깎은 개수에서 받을 양을 잰다.
//  ① 재현(끔) — 같은 곳간 · 같은 순간에 견적 take ≠ 실행 take · 실행 take = 깎은 개수로 낸 견적 take(실행이 맞다)
//  ② 켬 — 견적 take = 실행 take · 견적이 낼 개수(`giveCut`)를 말한다 = 실행 give
//  ③ 상한 밖 — 켬 · 끔 견적이 같다(손잡이는 상한 갈래에서만)
//  ④ 글자 — 손잡이 한 자리 · 실행 절삭 = `_capGive` · 화면 줄이 `giveCut` 을 읽는다
//
// 실행: node scripts/test-quote-cut.js
'use strict';
const path = require('path');
const fs = require('fs');
const { execFileSync } = require('child_process');
const ROOT = path.join(__dirname, '..');

function child() {
  const TMP = `/tmp/test-quote-cut-${process.pid}.db`;
  for (const f of [TMP, TMP + '-wal', TMP + '-shm']) { try { fs.unlinkSync(f); } catch (e) {} }
  Object.assign(process.env, { ZONE_ID: 'hanbando', PORT: String(37000 + (process.pid % 800)), DB_PATH: TMP, ENABLE_VILLAGES: '1', VILLAGE_MAX: '2',
    ENABLE_WILDLIFE: '0', ENABLE_BANDITS: '0', ENABLE_ROADS: '0' });
  const _l = console.log, _w = console.warn, _e = console.error;
  console.log = () => {}; console.warn = () => {}; console.error = () => {};
  const Zone = require(path.join(ROOT, 'server', 'zone.js'));
  const H = Zone.__testBind(); const V = H.SimVillages, T = H.Trade;
  const out = { T807: T.T807_QUOTE_CUT };
  const done = (o) => { console.log = _l; process.stdout.write('\n@@JSON@@' + JSON.stringify(Object.assign(out, o))); process.exit(0); };
  let tries = 0;
  const wait = () => {
    const list = V.clientVillages ? V.clientVillages() : [];
    if (!list || !list.length) { if (++tries > 150) return done({ err: '마을 없음' }); return setTimeout(wait, 1000); }
    const CV = list[0], PX = CV.cx * 32 + 16, PY = CV.cy * 32 + 16;
    const B = () => V.villageTradeBoard(CV.id, PX, PY, {});
    const Q = (a, b, q) => V.villageTradeQuote(CV.id, PX, PY, a, b, q, null);
    const X = (inv, a, b, q) => V.villageTradeExec(CV.id, PX, PY, inv, a, b, q, null);
    const rows = B().rows.filter((r) => r.canGive && r.canTake);
    let pick = null;
    const env = process.env.T807_PICK ? JSON.parse(process.env.T807_PICK) : null;
    if (env) pick = env;
    else {
      outer: for (const g of rows) for (const t of rows) {
        if (g.res === t.res || !(t.stock > 1)) continue;
        for (let q = 1; q <= 400; q++) {
          const a = Q(g.res, t.res, q); if (!a || a.err || !a.capped) continue;
          const cut = T._capGive(q, a.maxGive, 1); if (!(cut > 0)) break;
          const b = Q(g.res, t.res, cut);
          if (b && !b.err && b.take !== a.take) { pick = { g: g.res, t: t.res, q, item: g.give[0] || g.item }; break outer; }
          break;
        }
      }
    }
    if (!pick) return done({ err: '상한에서 갈리는 짝을 못 찾았다' });
    const qa = Q(pick.g, pick.t, pick.q);
    const qc = qa && qa.capped ? Q(pick.g, pick.t, T._capGive(pick.q, qa.maxGive, 1)) : null;
    // 상한 밖 견적(③) — 1개
    const q1 = Q(pick.g, pick.t, 1);
    const inv = { [pick.item]: pick.q };
    const x = X(inv, pick.g, pick.t, pick.q);
    done({ pick, qa: qa && { take: qa.take, capped: qa.capped, cap: qa.cap, maxGive: qa.maxGive, giveCut: qa.giveCut }, qc: qc && { take: qc.take },
      q1: q1 && { take: q1.take, capped: q1.capped, giveCut: q1.giveCut }, x: x && { ok: x.ok, err: x.err, give: x.give, take: x.take } });
  };
  wait();
}
if (process.argv[2] === '--child') { child(); return; }

let pass = 0, fail = 0;
const ok = (c, m, d) => { c ? pass++ : fail++; console.log(`  ${c ? '✓' : '✗'} ${m}${d !== undefined ? '  ' + d : ''}`); };
const run = (env) => JSON.parse(String(execFileSync(process.execPath, [__filename, '--child'], { env: Object.assign({}, process.env, { T807_QUOTE_CUT: '' }, env), encoding: 'utf8', maxBuffer: 1 << 26 })).split('@@JSON@@').pop());

console.log('\n=== T807 거래소 견적 = 실행(상한에 닿을 때) ===');
console.log('\n① 재현(끔 — 손잡이 없음 = main)');
const OFF = run({});
ok(!OFF.err && OFF.pick, '[상황] 상한에서 견적과 실행이 갈리는 짝을 찾았다(같은 곳간 · 같은 순간)', OFF.err || `${OFF.pick.g} ${OFF.pick.q} → ${OFF.pick.t}`);
if (!OFF.err) {
  ok(OFF.qa.capped && OFF.x.ok, '[상황] 견적이 상한에 닿았다 · 실행이 됐다', `상한 ${OFF.qa.cap} · maxGive ${OFF.qa.maxGive}`);
  ok(OFF.qa.take !== OFF.x.take, '★★끔 — 견적 take ≠ 실행 take(거짓말이 재현된다 · 자명 통과 금지)', `견적 ${OFF.qa.take} · 실행 ${OFF.x.take}(낸 것 ${OFF.x.give}/${OFF.pick.q})`);
  ok(OFF.x.take === OFF.qc.take && OFF.x.give < OFF.pick.q, '끔 — 실행 take = 깎은 개수로 낸 견적 take(실행이 맞다 · 넘치게 안 준다)', `${OFF.x.give}개 → ${OFF.qc.take}`);
  ok(OFF.qa.giveCut === undefined, '끔 — 견적에 `giveCut` 칸이 없다(종전 꼴)');
  console.log('\n② 켬');
  const ON = run({ T807_QUOTE_CUT: '1', T807_PICK: JSON.stringify(OFF.pick) });
  ok(ON.T807 && !ON.err, '켬 — 손잡이가 섰다 · 같은 짝', ON.err || '');
  ok(ON.qa.take === ON.x.take && ON.x.take === OFF.x.take, '★★켬 — 견적 take = 실행 take(실행은 끔과 같은 값)', `견적 ${ON.qa.take} · 실행 ${ON.x.take}`);
  ok(ON.qa.giveCut === ON.x.give, '★켬 — 견적이 실제로 낼 개수를 말한다 = 실행 give', `${ON.qa.giveCut} = ${ON.x.give}`);
  console.log('\n③ 상한 밖');
  ok(!ON.q1.capped && !OFF.q1.capped && ON.q1.take === OFF.q1.take && ON.q1.giveCut === undefined, '상한 밖 — 켬 · 끔 견적이 같다(손잡이는 상한 갈래에서만)', `${OFF.q1.take} = ${ON.q1.take}`);
}
console.log('\n④ 글자');
const TR = fs.readFileSync(path.join(ROOT, 'server', 'trade.js'), 'utf8');
ok(/const T807_QUOTE_CUT = process\.env\.T807_QUOTE_CUT === '1';/.test(TR) && (TR.replace(/\/\/.*$/gm, '').match(/T807_QUOTE_CUT/g) || []).length === 4, '손잡이 한 자리(`=== \'1\'` · 선언 + 견적 갈래 + 내보내기)');
ok(/give = _capGive\(q0, qt\.maxGive, perItem\);/.test(TR) && !/Math\.floor\(qt\.maxGive \/ perItem\)/.test(TR), '실행 절삭 = `_capGive` 하나(사본 0)');
const UI = fs.readFileSync(path.join(ROOT, 'public', 'client', '50-i-panel.js'), 'utf8');
ok(/trQuote\.giveCut != null/.test(UI), '화면 상한 줄이 서버의 `giveCut` 을 읽는다(없으면 종전 줄)');
console.log(`\n=== ${pass} 통과 / ${fail} 실패 ===\n`);
process.exit(fail ? 1 : 0);
