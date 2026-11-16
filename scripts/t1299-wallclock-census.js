#!/usr/bin/env node
// (@regress 없음 — 러너 밖 · T1299 정적 자 · 제품 무변 · 판정 0)
// === scripts/t1299-wallclock-census.js — 실제 시계로 도는 판 전수: 누가 벽시계 존을 띄우나 · 몸 일과 · 낮밤을 읽나 · 띄운 시각을 고정하나 (T1299 ① · T1287 회부 2) ===
//
// ★왜 [T1287] 몸의 일과 · 날씨 시각 · 들짐승 · 눈은 `worldPhase(Date.now())`(하루 24분 · 0.7 = 밤 = 게임 16.8시)를 읽는다 — 벽시계로 도는 판은
//   띄운 실제 시각에 따라 몸이 일하거나 잔다. 게이트 굽기 판만 0시로 고정했다. 이 자는 **고정이 필요할 수 있는 판**을 다 센다(정적).
//   갈리나는 이 자가 안 정한다 — 두 시각(게임 06시 · 18시 · `phase-pin.js`)으로 돌려 본다(`--dyn` 목록 · 보고 T1299 §1).
// ★가르는 칸(주석 뺀 코드 · `code-only` 정본):
//   띄움   — central · zone 을 띄우는가(`server/zone.js` · `central.js` · `fixture-boot` `boot('zone'|'central')`) · 판 자(`t577-server-run` · `server-baseline-check` · `gate-house`)를 부르는가
//   시계   — 가상 시계(`--vclock` · `T745_VCLOCK` '1')만 쓰나 · 벽시계 판이 있나(가상 시계 글자가 없거나 · 벽시계 굽기 판 자)
//   몸     — 존에 마을(`ENABLE_VILLAGES` '1' · 판 자는 늘 켬) — 몸 일과(스케줄 게이트)가 서는 판
//   낮밤 글자 — 판정 · 설정 자리에 낮밤 · 일과 낱말(밤 · 낮 · 취침 · 잠 · 일과 · 해 · worldPhase · isNight · 날씨 · 기온 · hourFrac)이 있나(읽는 것의 표지일 뿐 — 판정 아님)
//   고정   — 띄운 시각을 고정하나(`lib-phase` · `phase-pin` · `T1287_PHASE0` · `T1299_PHASE_HOUR` · 가상 시계)
//   묶음   — `@regress` · `@nightly X` · 이름(e2e · 판 자 · 관찰기 · 짧은 서버 판)
// 쓰는 법: node scripts/t1299-wallclock-census.js [--json out.json] [--md out.md] [--dyn](두 시각으로 돌릴 목록만 한 줄씩)
'use strict';
const fs = require('fs'), path = require('path');
const CO = require('./code-only');
const DIR = __dirname;
const A = process.argv.slice(2), opt = (k, d) => { const i = A.indexOf(k); return i >= 0 ? A[i + 1] : d; };
const BOOT = /server['"]?\s*,\s*['"](zone|central)\.js|server\/(zone|central)\.js|boot\s*\(\s*['"](zone|central)|bootZone\s*\(|bootCentral\s*\(|['"](zone|central)\.js['"]/;
const RULER = /t577-server-run|server-baseline-check|gate-house/;
const VC = /--vclock|T745_VCLOCK\s*[:=]\s*['"]?1|t745-vclock/;
const VILL = /ENABLE_VILLAGES\s*:\s*['"]1|ENABLE_VILLAGES=1/;
const PIN = /lib-phase|phase-pin|T1287_PHASE0|T1299_PHASE_HOUR/;
const WORDS = /밤|낮|취침|잠든|잠자|일과|해 뜸|해뜸|worldPhase|isNight|날씨|기온|hourFrac|dayPhaseRatio|weather/;
const kindOf = (f, src) => /^e2e-/.test(f) ? 'e2e' : /^(t577-server-run|server-baseline-check|gate-house)\.js$/.test(f) ? '판 자'
  : (/require\.main !== module/.test(src) && /T577_OUT|NODE_OPTIONS|--require/.test(src)) ? '관찰기' : /^test-/.test(f) ? '짧은 서버 판' : '자 · 계측';
function census() {
  const rows = [];
  for (const f of fs.readdirSync(DIR).filter((x) => x.endsWith('.js')).sort()) {
    if (f === path.basename(__filename)) continue;
    const raw = fs.readFileSync(path.join(DIR, f), 'utf8');
    let code; try { code = CO(raw); } catch (e) { code = raw; }
    const boots = BOOT.test(code), ruler = RULER.test(code) && !/^(t577-server-run|server-baseline-check|gate-house)\.js$/.test(f);
    const self = /^(t577-server-run|server-baseline-check|gate-house)\.js$/.test(f);
    if (!boots && !ruler && !self) continue;
    const reg = /^\/\/ @regress(\s|$)/m.test(raw), night = (raw.match(/^\/\/ @nightly ([A-Z])/m) || [])[1] || null;
    const vcAll = VC.test(code) && !/--make[^\n]*--house|gate-house/.test(code) && !/\bwall\b|벽시계 판/.test(code.replace(/T745_VCLOCK[^\n]*/g, ''));
    const r = { f, kind: kindOf(f, raw), reg, night, boots, ruler: ruler || self, vclock: VC.test(code), wall: !vcAll, vill: VILL.test(code) || ruler || self, words: WORDS.test(code), pin: PIN.test(code) };
    rows.push(r);
  }
  return rows;
}
module.exports = { census };
if (require.main === module) {
  const R = census();
  const dyn = R.filter((r) => r.reg && r.wall && !r.pin);
  if (A.includes('--dyn')) { for (const r of dyn) console.log(r.f); process.exit(0); }
  const K = (p) => R.filter(p).length;
  console.log(`T1299-CENSUS 띄우는 파일 ${R.length} · @regress ${K((r) => r.reg)} · 벽시계 판 있음 ${K((r) => r.wall)} · 그중 @regress ${K((r) => r.wall && r.reg)} · 몸(마을) ${K((r) => r.wall && r.vill)} · 낮밤 글자 ${K((r) => r.wall && r.words)} · 고정 ${K((r) => r.wall && r.pin)} · 두 시각 목록 ${dyn.length}`);
  const by = {}; for (const r of R.filter((x) => x.wall)) by[r.kind] = (by[r.kind] || 0) + 1;
  console.log('  갈래 ' + Object.entries(by).map(([k, v]) => `${k} ${v}`).join(' · '));
  if (opt('--json', null)) fs.writeFileSync(opt('--json'), JSON.stringify(R, null, 1));
  if (opt('--md', null)) {
    const L = ['| 파일 | 갈래 | 묶음 | 벽시계 | 몸(마을) | 낮밤 글자 | 고정 |', '|---|---|---|---|---|---|---|'];
    for (const r of R) L.push(`| \`${r.f}\` | ${r.kind} | ${r.reg ? '@regress' : '—'}${r.night ? ' · 야간 ' + r.night : ''} | ${r.wall ? '○' : '가상 시계만'} | ${r.vill ? '○' : '—'} | ${r.words ? '○' : '—'} | ${r.pin ? '○' : '—'} |`);
    fs.writeFileSync(opt('--md'), L.join('\n') + '\n');
  }
}
