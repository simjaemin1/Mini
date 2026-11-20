#!/usr/bin/env node
// @regress   ← 통합 러너가 이 표를 보고 자기 목록을 만든다(표 없으면 안 돈다)
// @bait 1   ← [T1356] 미끼 판정 줄 수(파일 안 · `test-harness-lint` ⑲b 가 센다)
// === scripts/test-t1359-hunt-body.js — 몸 판 사냥 빠르기 두 읽기(T1359 · T1331 회부 2) =====================================
//
// 지키는 것:
//   ① 손잡이 `T1359_HUNT_BODY` — 끔 기본 · `'1'` 만 켬(villages 내보내기)
//   ② 몸 표(`server/beast-body.js` · 서버 몸 판이 부르는 그 모듈)에서 사냥꾼 하루 몫:
//      ⓐ 끔(종전) = 랩 `huntTake(가득 찬 숲)` ÷ 환율 — 환율 5,000 이면 1,249날째까지 죽음 0 · 1,250날째 첫 죽음(4 ÷ 5,000 = 0.0008/날)
//      ⓑ 켬 = 몸 하나 = 한 마리 — 첫날 죽음 1(가득 찬 숲 4/날 · 그날 하나만 죽고 몫은 남는다)
//      ⓒ 두 읽기 다 보존(살아 있는 몸 = 처음 − 사냥 죽음)
//   ③ 미끼(이 파일 안) — beast-body 의 몫 줄 한 곳(`(opt.huntBody ? 1 : SCALE)` → `SCALE`)만 바꾼 사본 → ② ⓑ 의 줄이 빨강(첫날 죽음 0)
//   날짜 · 벽시계를 쓰지 않는다(몸 표의 날 수만).
'use strict';
const path = require('path');
const fs = require('fs');
const os = require('os');
const { execFileSync } = require('child_process');
const ROOT = path.join(__dirname, '..');
let pass = 0, fail = 0;
const ok = (c, m, d) => { c ? pass++ : fail++; console.log((c ? '  ✓ ' : '  ✗ ') + m + (d !== undefined && d !== '' ? `  ${d}` : '')); return !!c; };
console.log('\n=== T1359 — 몸 판 사냥 빠르기 두 읽기 ===');
// ── ① 손잡이 ──
const knob = (env) => { const e = Object.assign({}, process.env); delete e.T1359_HUNT_BODY; delete e.NODE_OPTIONS; Object.assign(e, env);
  try { return execFileSync(process.execPath, ['-e', "const V=require('./server/villages');console.log(JSON.stringify(V.T1359_HUNT_BODY))"], { cwd: ROOT, env: e, encoding: 'utf8' }).trim().split('\n').pop(); } catch (err) { return 'err'; } };
const k0 = knob({}), k1 = knob({ T1359_HUNT_BODY: '1' }), k2 = knob({ T1359_HUNT_BODY: 'yes' });
const unitOk = ok(k0 === 'false' && k1 === 'true' && k2 === 'false', '① T1359_HUNT_BODY — 끔 기본 · `1` 만 켬', `${k0} · ${k1} · ${k2}`);
if (!unitOk) { console.log(`\n${pass} 통과 · ${fail} 실패`); process.exit(1); }
// ── ② 몸 표 — 가짜 무리터 하나(가득 찬 표본 칸 5,000 = 몸 100 · 환율 5,000) · 사냥꾼 하나 ──
const BB = path.join(ROOT, 'server', 'beast-body.js');
function huntTake(G) {   // 랩 식 그대로(서버 `villages.js huntTake` 와 같은 글자 — 아래 ④ 가 대조한다)
  const L_HUNT = 4, L_GAMEMAX = 100, L_GAMEHALF = L_GAMEMAX * 0.15, g = Math.max(0, G);
  return L_HUNT * (g / (g + L_GAMEHALF)) / (L_GAMEMAX / (L_GAMEMAX + L_GAMEHALF));
}
function sim(file, huntBody, days) {
  const B = require(file).create({ L_GAMEMAX: 100, L_GAMER: 0.002, huntTake, species: ['deer'], scale: 5000, huntBody, blocked: () => false });
  const led = new Map(); for (let x = 0; x < 100; x++) for (let y = 0; y < 50; y++) led.set(`${x * 2},${y * 2}`, 100);
  const n0 = B.migrate(1, led, 1);
  const p = {}; let first = -1, kills = 0;
  for (let d = 1; d <= days; d++) { const b = B.hunt(1, p, 50, 50); if (b) { kills++; if (first < 0) first = d; } }
  const s = B.stat ? B.stat() : null;
  return { n0, first, kills, alive: s ? s.alive : null, expect: s ? s.expect : null };
}
const A = sim(BB, false, 1300), Bn = sim(BB, true, 3);
ok(A.n0 === 100 && A.first === 1250 && A.kills === 1, '② ⓐ 끔 — 몫 = huntTake ÷ 환율 · 첫 죽음 1,250날째(0.0008/날)', JSON.stringify(A));
const predB = (r) => r.first === 1 && r.kills === 3;
ok(predB(Bn), '② ⓑ 켬 — 몸 하나 = 한 마리 · 첫날부터 날마다 죽음 1(몫 4/날)', JSON.stringify(Bn));
ok(A.alive === A.expect && A.alive === 99 && Bn.alive === Bn.expect && Bn.alive === 97, '② ⓒ 두 읽기 다 보존(살아 있는 몸 = 처음 − 사냥 죽음)', `${A.alive}/${A.expect} · ${Bn.alive}/${Bn.expect}`);
// ④ 이 하네스의 huntTake 가 서버 글자와 같은가(사본이 어긋나면 ② 가 다른 식을 잰다)
const VS = fs.readFileSync(path.join(ROOT, 'server', 'villages.js'), 'utf8');
ok(/const L_GAMEMAX = 100, L_GAMER = 0\.002, L_HUNT = 4;/.test(VS) && /return L_HUNT \* \(g \/ \(g \+ L_GAMEHALF\)\) \/ \(L_GAMEMAX \/ \(L_GAMEMAX \+ L_GAMEHALF\)\);/.test(VS)
  && /huntBody: T1359_HUNT_BODY/.test(VS), '④ 서버 huntTake 글자 · 몸 표에 손잡이를 넘기는 자리(`huntBody: T1359_HUNT_BODY`)');
// ── ③ 미끼 — beast-body 사본(임시 파일) · 바꾼 자리를 센다 ──
const NEEDLE = '(opt.huntBody ? 1 : SCALE)';
const src = fs.readFileSync(BB, 'utf8'), nN = src.split(NEEDLE).length - 1;
const D = fs.mkdtempSync(path.join(os.tmpdir(), 't1359h-')), BAIT = path.join(D, 'beast-body.js'); require('./lib-tmp').own(D);   // [PM land1086 · lint ㉑] lib-tmp — 판 끝(빨강 · 상한 포함)에 지운다
fs.writeFileSync(BAIT, nN === 1 ? src.replace(NEEDLE, 'SCALE') : src);
let Bb = null; try { Bb = sim(BAIT, true, 3); } catch (e) { Bb = { err: String(e).slice(0, 120) }; }
ok(nN === 1 && Bb && !Bb.err && !predB(Bb) && Bb.kills === 0, '③ 미끼 — 바꾼 자리 1곳(몫 줄의 손잡이 갈래 → `SCALE`)인 사본은 ② ⓑ 의 줄이 빨강(첫날 죽음 0)', `바꾼 자리 ${nN} · ${JSON.stringify(Bb)}`);
console.log(`\n${pass} 통과 · ${fail} 실패`);
process.exit(fail ? 1 : 0);
