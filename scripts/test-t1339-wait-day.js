#!/usr/bin/env node
// @regress
// @date-ok 가짜 야간 로그 시각 픽스처(보고기에 주입) — 벽시계와 안 맞댄다 [T1356]
// === scripts/test-t1339-wait-day.js — 게임일 기다림 문(`lib-wait-day`) · 유보 RC(러너 · 야간 보고) · 한 순간 붙잡기(`lib-phase.hold`) 자 (T1339) ===
//
// ★무엇:
//   ① 닿음 · 느림 · 멈춤 — 가짜 날 시계 셋(제때 가는 · 느리게 가는 · 멈춘)으로 `waitDay` 가 셋을 가른다(상한은 안전망 · 느림 = 유보 · 멈춤 = 빨강).
//   ② `judge` — 조건이 서면 통과 · 느린 판이면 ⚠ 유보 줄(✗ 0) · 멈춘 시계면 ✗(그 이름) · `rc` = 0 / 75 / 1.
//   ③ 본문이 날을 얼렸다 푸는 판(`bodyPauses`) — 본문 시간은 멈춤 셈 밖 · `until` 조건 닿음 · `settleDay`.
//   ④ 러너 — RC 75 + 결과 줄 = `⚠ RC=75 · 유보`(실패 목록 밖 · 러너 RC 0) · RC 75 인데 결과 줄 0 = 크래시 = ✗.
//   ⑤ 야간 보고 — `⚠ RC=75` 블록은 빨강도 초록도 아닌 유보로 센다(유보 절 · 상시 밖 빨강 0).
//   ⑥ `lib-phase.hold` — 붙잡은 동안 `Date.now()` 한 값 · 끝나면 되돌림(예외에도).
//   ⑦ 미끼 — 멈춘 시계를 "느림"으로 읽는 문(상한만 보는 문)은 ① 의 멈춤을 유보로 바꾼다 ⇒ 이 자가 문다.
'use strict';
const fs = require('fs'), os = require('os'), path = require('path');
const { execFileSync, spawnSync } = require('child_process');
const ROOT = path.join(__dirname, '..');
const WD = require('./lib-wait-day');
let pass = 0, fail = 0;
const ok = (c, m, x) => { c ? pass++ : fail++; console.log((c ? '  ✓ ' : '  ✗ ') + m + (x != null && x !== '' ? '  ' + x : '')); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
//   가짜 날 시계 — `msPerDay` 마다 하루(0 이면 멈춤) · 시작 10
const clock = (msPerDay) => { const t0 = Date.now(); return () => (msPerDay > 0 ? 10 + Math.floor((Date.now() - t0) / msPerDay) : 10); };

(async () => {
  console.log('\n=== 게임일 기다림 문 · 유보 RC · 한 순간 붙잡기 (T1339) ===');
  console.log('\n① 닿음 · 느림 · 멈춤');
  const rA = await WD.waitDay(clock(20), 20, { capMs: 3000, pollMs: 10, stallMs: 1000 });
  ok(rA.reached && rA.day >= 20, '① 제때 가는 시계 — 목표 날에 닿는다(상한 전)', WD.desc(rA));
  const rB = await WD.waitDay(clock(150), 40, { capMs: 900, pollMs: 10, stallMs: 1000 });
  ok(rB.slow && !rB.reached && rB.day > rB.d0, '① 느린 시계 — 상한에 닿았고 날은 갔다 = 느림(유보 갈래)', WD.desc(rB));
  const rC = await WD.waitDay(clock(0), 20, { capMs: 3000, pollMs: 10, stallMs: 400 });
  ok(rC.stalled && rC.ms < 2000, '① 멈춘 시계 — 멈춤 창(400ms)에서 바로 멈춤(상한을 안 기다린다 · 빨강 갈래)', WD.desc(rC));
  const rC2 = await WD.waitDay(clock(0), 20, { capMs: 300, pollMs: 10, stallMs: 5000 });
  ok(rC2.stalled, '① 멈춘 시계 — 상한이 먼저 와도 날이 한 칸도 안 갔으면 멈춤(느림 아님)', WD.desc(rC2));

  console.log('\n② 판정 · RC');
  { const lines = []; let p2 = 0, f2 = 0; const ok2 = (c, m, x) => { c ? p2++ : f2++; lines.push((c ? '✓ ' : '✗ ') + m + ' ' + (x || '')); };
    const _log = console.log; const yl = []; console.log = (s) => yl.push(String(s));
    let n0;
    try {
      n0 = WD.count();
      WD.judge(ok2, rA, true, 'a');            // 통과
      WD.judge(ok2, rB, false, 'b');           // 느림 → 유보
      WD.judge(ok2, rC, false, 'c');           // 멈춤 → 빨강
      WD.judge(ok2, null, false, 'd');         // 기다림 없음 → 빨강
    } finally { console.log = _log; }
    ok(p2 === 1 && f2 === 2 && lines.some((l) => /^✗ c .*멈춘 시계/.test(l)), '② 통과 1 · 빨강 2(멈춘 시계는 이름을 붙인다) · 느림은 ✗ 를 안 낸다', lines.join(' | '));
    ok(WD.count() === n0 + 1 && yl.some((l) => /^\s*⚠ 유보 — b /.test(l) && /판이 느림/.test(l)), '② 느림 = `⚠ 유보 — 이름` 줄 하나(판이 느림 · 그 판의 날 셈)', yl.find((l) => /유보/.test(l)) || '');
    const _l2 = console.log; console.log = () => {};
    let r0, r1; try { r0 = WD.rc(0); r1 = WD.rc(1); } finally { console.log = _l2; }
    ok(r0 === 75 && r1 === 1, '② RC — 빨강 0 · 유보 있음 = 75 · 빨강 있음 = 1', `${r0} · ${r1}`); }

  console.log('\n③ 본문 · 조건 · 가라앉음');
  { //   본문이 매번 300ms 날을 얼린다(그동안 날이 안 간다) — 멈춤 창 250ms 라도 본문 시간은 셈 밖이라 멈춤이 아니다
    let frozen = 0, acc = 0, at = Date.now(); const read = () => { if (!frozen) { acc += Date.now() - at; at = Date.now(); } return 10 + Math.floor(acc / 10); };
    const r = await WD.waitDay(read, 30, { capMs: 8000, pollMs: 30, stallMs: 250, bodyPauses: true, body: async () => { frozen = 1; await sleep(300); frozen = 0; at = Date.now(); } });
    ok(r.reached, '③ 본문이 날을 얼렸다 푸는 판 — `bodyPauses` 면 본문 시간은 멈춤 셈 밖(닿음)', WD.desc(r));
    const rN = await WD.waitDay(read, 1e9, { capMs: 3000, pollMs: 30, stallMs: 250, body: async () => { frozen = 1; await sleep(300); frozen = 0; at = Date.now(); } });
    ok(rN.stalled, '③ [대조] 같은 본문을 `bodyPauses` 없이 — 멈춤(본문 시간이 셈에 든다)', WD.desc(rN));
    let hit = false; setTimeout(() => { hit = true; }, 150);
    const rU = await WD.waitDay(clock(1000), 1e9, { capMs: 3000, pollMs: 10, stallMs: 2000, until: () => hit });
    ok(rU.reached && rU.ms < 1500, '③ `until` — 조건이 먼저 서면 닿음(목표 날 전)', WD.desc(rU));
    let v = 5; setTimeout(() => { v = 6; }, 100); setTimeout(() => { v = 7; }, 200);
    const d = await WD.settleDay(() => v, 300, 3000);   // 100ms · 200ms 에 바뀐다 — 조용한 창(300ms)보다 일찍 돌려주면 5 나 6 이다(시간 비교 0)
    ok(d === 7, '③ `settleDay` — 마지막 바뀐 뒤 조용한 창이 지나야 그 날을 준다(중간 값 5 · 6 이 아니다)', String(d)); }

  console.log('\n④ 러너 — RC 75');
  { const tmp = (n, body) => { const f = path.join(ROOT, 'scripts', n); fs.writeFileSync(f, body); return f; };
    const a = tmp('_t1339_hold.js', "console.log('  ✓ 하나'); console.log('  ⚠ 유보 — 둘  판이 느림'); console.log('=== 결과: 1 통과 / 0 실패 ==='); process.exit(75);\n");
    const b = tmp('_t1339_crash75.js', 'process.exit(75);\n');
    let out = '', rc = null;
    try { const r = spawnSync('bash', ['scripts/run-regress.sh', '_t1339_hold.js', '_t1339_crash75.js'], { cwd: ROOT, encoding: 'utf8', env: Object.assign({}, process.env, { DRAIN_SEC: '0' }), timeout: 120000 });
      out = r.stdout + r.stderr; rc = r.status; }
    finally { for (const f of [a, b]) { try { fs.unlinkSync(f); } catch (e) {} } }
    ok(/##### _t1339_hold\.js #####[\s\S]*?⚠ RC=75 · 유보/.test(out) && /⚠ 유보 — 둘/.test(out), '④ RC 75 + 결과 줄 = `⚠ RC=75 · 유보` 판정 줄(유보 줄도 이름을 말한다)', (out.match(/⚠ RC=75[^\n]*/) || [''])[0]);
    ok(/##### _t1339_crash75\.js #####[\s\S]*?✗ RC=75 · 결과줄 0개/.test(out), '④ RC 75 인데 결과 줄 0 = 크래시 = ✗(유보로 숨지 않는다)');
    ok(/유보 1: _t1339_hold\.js/.test(out) && /실패 1: _t1339_crash75\.js/.test(out) && !/통과 [1-9][0-9]*: [^\n]*_t1339_hold/.test(out), '④ 요약 — 유보 목록 · 실패 목록이 갈린다(유보는 통과 목록 밖)');
    ok(rc === 1, '④ 러너 RC — 실패가 있으면 1(유보만이면 0 은 아래 ⑤ 에서 보고가 센다)', String(rc)); }

  console.log('\n⑤ 야간 보고 — ⚠ RC=75 블록');
  { const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 't1339-'));
    try {
      const st = (m) => `2026-11-16T04:${String(m).padStart(2, '0')}:00+0900`;
      const log = [`${st(0)} ===== nightly-run 시작 · TZ=Asia/Seoul · base=deadbeef =====`, `${st(0)}   [오늘] 묶음 A · 2종`, `${st(0)}   [목록] e2e-slow.js test-ok.js `,
        `${st(1)} ##### e2e-slow.js #####`, `${st(1)}   ⚠ 유보 — ③ 전제  판이 느림`, `${st(5)}   ⚠ RC=75 · 유보(판이 느림 — 게임일 상한 · 빨강 아님) · 결과줄 18개`,
        `${st(6)} ##### test-ok.js #####`, `${st(7)}   ✓ RC=0`, `${st(8)} ===== 본 판 끝 =====`].join('\n') + '\n';
      const f = path.join(TMP, 'n.log'); fs.writeFileSync(f, log); fs.writeFileSync(f + '.retry', '');
      const kn = path.join(TMP, 'k.txt'); fs.writeFileSync(kn, '# 픽스처\n');
      const md = execFileSync(process.execPath, [path.join(ROOT, 'scripts', 'nightly-report.js'), '--log', f, '--base', 'deadbeef', '--known', kn, '--prev-dir', TMP], { cwd: ROOT, encoding: 'utf8' });
      ok(/통과 \*\*1\*\* · 실패 \*\*0\*\*/.test(md) && /유보 \*\*1\*\*/.test(md), '⑤ 머리 줄 — 통과 1 · 실패 0 · 유보 1(유보는 초록도 빨강도 아니다)', (md.split('\n').find((l) => /돈 것/.test(l)) || '').slice(0, 160));
      ok(/## 2a\. 유보[\s\S]*`e2e-slow` — RC=75/.test(md) && /상시 밖 빨강 0건/.test(md), '⑤ 유보 절에 이름 · 판정 줄 · 상시 밖 빨강 0');
      const reds = execFileSync(process.execPath, [path.join(ROOT, 'scripts', 'nightly-report.js'), '--reds', f], { cwd: ROOT, encoding: 'utf8' }).trim();
      ok(reds === '', '⑤ `--reds`(단독 재실행 목록)에 유보는 안 든다', JSON.stringify(reds));
    } finally { try { fs.rmSync(TMP, { recursive: true, force: true }); } catch (e) {} } }

  console.log('\n⑥ lib-phase.hold — 한 순간 붙잡기');
  { const P = require('./lib-phase'); const t0 = Date.now();
    let x = 0; const spin = (ms) => { const s = performance.now(); while (performance.now() - s < ms) x++; };
    const r = P.hold((t) => { const a = Date.now(); spin(5); return [t, a, Date.now()]; });
    ok(r[0] === r[1] && r[1] === r[2] && r[0] >= t0, '⑥ 붙잡은 동안 `Date.now()` 한 값(5ms 를 돌아도)', r.join(' · '));
    const t1 = Date.now(); spin(3);
    ok(Date.now() - t1 >= 2, '⑥ 끝나면 진짜 시계로(되돌림 — 3ms 돌면 시계가 간다)', `${Date.now() - t1}ms`);
    let threw = false; try { P.hold(() => { throw new Error('x'); }); } catch (e) { threw = true; }
    const u = Date.now(); spin(3);
    ok(threw && Date.now() - u >= 2, '⑥ 예외로 끝나도 되돌린다(붙잡힌 채 남지 않는다)', `${Date.now() - u}ms 흘렀다`); }

  console.log('\n⑦ 미끼 — 상한만 보는 문(멈춤 셈 없음)');
  { //   멈춘 시계를 상한까지 기다린 뒤 "날이 d0 그대로"를 느림으로 읽는 문 — ① 의 멈춤이 유보로 숨는다. 이 자의 ① 멈춤 단언이 그 문을 문다.
    const bait = async (readDay, target, capMs) => { const t0 = Date.now(); let d0 = null, day = null; for (;;) { const d = readDay(); if (d0 == null) d0 = d; day = d; if (day >= target) return { reached: true }; if (Date.now() - t0 >= capMs) return { slow: true, stalled: false }; await sleep(10); } };
    const rb = await bait(clock(0), 20, 300);
    ok(rb.slow && !rb.stalled, '⑦ [미끼] 상한만 보는 문은 멈춘 시계를 느림(유보)으로 읽는다 — ① 의 "멈춤 = 빨강" 단언이 그 문이면 빨개진다', JSON.stringify(rb)); }

  console.log(`\n=== test-t1339-wait-day 결과: ${pass} 통과 / ${fail} 실패 ===`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
