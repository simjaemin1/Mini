#!/usr/bin/env node
// @regress   ← 통합 러너가 이 표를 보고 자기 목록을 만든다(scripts/run-regress.sh · 표 없으면 안 돈다)
// === scripts/test-wood-flow.js — 통나무 흐름 닻 손잡이 `T659_WOOD_FLOW`(기본 끔) =========================
//
// ★왜 [T659 · T652 회부 ①]
//   통나무(`wood`)는 v2 `SUBSISTENCE_PER_NPC` 등재(0.05/인/일)라 가격의 subs 가드(`subsGuard` · T416 술어 하나)가
//   흐름 수요 `flowT = _consEMA × 30` 을 0 으로 읽는다 ⇒ 값의 닻 = `subs × 30` = 1.5N 하나뿐이다.
//   실제 통나무 소비(집 · 땔감 · 장인 투입 — v1 `_cons` 자리들이 `_consEMA.wood` 에 쌓는 것)는 그 열 배 안팎이라
//   시딩 곳간을 "넘친다"로 읽고 값이 늦게 오른다(T652 §1). 손잡이를 켜면 **통나무에 한해** 가격 쪽 가드를 연다 —
//   공식(`target = max(subs×30, buffer, flowT, derivT)`)은 그대로이고 이미 있는 EMA 를 읽을 뿐이다(새 수 0).
//
// ★★이 하네스가 지키는 것
//   ⓐ 끔(기본) = 종전: 손잡이 거짓 · 통나무 가격 가드 참 · 게시판 거짓 · subs 등재 전 품목의 답이 손잡이 전 규칙과 같다
//   ⓑ 켬(`T659_WOOD_FLOW=1` 아이 프로세스): 통나무 **가격 쪽만** 열린다 · 게시판 무변 · 다른 subs 품목은 그대로 가드
//   ⓒ 값: 소비 EMA 가 닻보다 큰 마을에서 켬 목표 = EMA×30(그 공식) · 그림자가격 켬 > 끔 · EMA×30 < subs×30 이면 켬 = 끔(max 가 닻)
//   ⓓ 동기 계약: 가격 세 자리(`computeShadowPrices` · `_priceParamsV2` · `tickDecay`)가 같은 술어를 부른다(글자 셋) ·
//      손잡이를 읽는 자리 · 판정 자리는 술어 안 하나(사본 0)
//   ⓔ 3사본: 번들이 같은 손잡이 줄을 싣고 브라우저 꼴(process 심)에선 끔 · 랩 두 벌 인라인 = 번들
//   ⓕ 미끼: 손잡이 줄을 뺀 사본은 켬에서도 통나무 가드가 선다 ⇒ ⓑ 가 빨개진다
//
// 실행: node scripts/test-wood-flow.js
'use strict';
process.env.ENABLE_VILLAGES = process.env.ENABLE_VILLAGES || '0';
const path = require('path');
const fs = require('fs');
const vm = require('vm');
const { execFileSync } = require('child_process');
const ROOT = path.join(__dirname, '..');
let pass = 0, fail = 0;
const ok = (c, m, extra) => { c ? pass++ : fail++; console.log((c ? '  ✓ ' : '  ✗ ') + m + (extra !== undefined && extra !== '' ? `  ${extra}` : '')); };
const quiet = (fn) => { const l = console.log; console.log = () => {}; try { return fn(); } finally { console.log = l; } };

const V2_PATH = path.join(ROOT, 'sim', 'economy-sim-v2.js');
const SRC = fs.readFileSync(V2_PATH, 'utf8');
const KNOB_LINE = "  if (T659_WOOD_FLOW && r === 'wood' && who === 'price') return false;";

// 아이 프로세스 — env 를 바꿔 v2 를 새로 적재하고 술어 · 값을 JSON 으로 돌려준다(손잡이는 적재 때 읽는다)
//   mutate: 적재 때 v2 사본 글자만 바꾼다(미끼 — 디스크 무변 · T650 계측기 그 문법)
function child(env, mutate) {
  const code = `
    process.env.ENABLE_VILLAGES = '0';
    const fs = require('fs'), Module = require('module');
    const MUT = ${JSON.stringify(mutate || null)};
    if (MUT) { const _l = Module._extensions['.js']; Module._extensions['.js'] = function (m, f) {
      if (f === ${JSON.stringify(V2_PATH)}) { const c = fs.readFileSync(f, 'utf8'); if (!c.includes(MUT[0])) throw new Error('MUT_MISS'); m._compile(c.replace(MUT[0], MUT[1]), f); return; }
      return _l(m, f); }; }
    const l = console.log; console.log = () => {};
    const v1 = require(${JSON.stringify(path.join(ROOT, 'sim', 'economy-sim'))}), v2 = require(${JSON.stringify(V2_PATH)});
    console.log = l;
    const SUBS = Object.keys(v2.SUBSISTENCE_PER_NPC);
    const g = {}; for (const r of SUBS) g[r] = [v2.subsGuard(r, 'price'), v2.subsGuard(r, 'board')];
    const vil = (wood, ema) => { const v = v1.createVillage({ initialPop: 8, name: 'fixture' }); v.storage.wood = wood; v._consEMA = { wood: ema }; return v; };
    const hi = vil(100, 5), lo = vil(100, 0.2);
    const out = { knob: v2.T659_WOOD_FLOW, g,
      hi: { p: v2.computeShadowPrices(hi).wood, t: v2._priceParamsV2(hi, 'wood').target },
      lo: { p: v2.computeShadowPrices(lo).wood, t: v2._priceParamsV2(lo, 'wood').target } };
    process.stdout.write(JSON.stringify(out));`;
  const e = Object.assign({}, process.env, env);
  for (const k of Object.keys(env)) if (env[k] == null) delete e[k];
  return JSON.parse(execFileSync(process.execPath, ['-e', code], { env: e, cwd: ROOT, maxBuffer: 1 << 24 }).toString());
}

console.log('\nⓐ 끔(기본) = 종전');
const OFF = child({ T659_WOOD_FLOW: null });
const v2 = quiet(() => require(V2_PATH));
const oldRule = (r, who) => (who === 'board' ? false : !!v2.SUBSISTENCE_PER_NPC[r]);   // 손잡이 전 술어(T416 현행 팔) — 대조군
const SUBS = Object.keys(OFF.g);
ok(OFF.knob === false, 'ⓐ 손잡이 미설정 = 거짓(기본 끔)');
ok(OFF.g.wood && OFF.g.wood[0] === true && OFF.g.wood[1] === false, 'ⓐ 통나무 — 가격 가드 참 · 게시판 거짓(종전 그대로)', JSON.stringify(OFF.g.wood));
const offSame = SUBS.filter((r) => OFF.g[r][0] === oldRule(r, 'price') && OFF.g[r][1] === oldRule(r, 'board')).length;
ok(SUBS.length > 5 && offSame === SUBS.length, `ⓐ subs 등재 ${SUBS.length}종 전부 — 손잡이 전 규칙과 같은 답`, `${offSame}/${SUBS.length}`);
const ZERO = child({ T659_WOOD_FLOW: '0' });
ok(ZERO.knob === false && JSON.stringify(ZERO.g) === JSON.stringify(OFF.g) && ZERO.hi.p === OFF.hi.p, 'ⓐ `T659_WOOD_FLOW=0` = 미설정과 같다(술어 · 값)');

console.log('\nⓑ 켬 — 통나무 가격 쪽만 열린다');
const ON = child({ T659_WOOD_FLOW: '1' });
ok(ON.knob === true, 'ⓑ `T659_WOOD_FLOW=1` = 참');
ok(ON.g.wood[0] === false && ON.g.wood[1] === false, 'ⓑ 통나무 — 가격 가드 거짓(흐름을 본다) · 게시판 거짓(무변)', JSON.stringify(ON.g.wood));
const others = SUBS.filter((r) => r !== 'wood');
const onSame = others.filter((r) => ON.g[r][0] === OFF.g[r][0] && ON.g[r][1] === OFF.g[r][1]).length;
ok(onSame === others.length && ON.g.stone && ON.g.stone[0] === true && ON.g.food && ON.g.food[0] === true,
  `ⓑ 다른 subs 품목 ${others.length}종은 그대로(돌 · 식량 가드 참 — 통나무 하나만)`, `${onSame}/${others.length}`);

console.log('\nⓒ 값 — 공식 그대로 · 닻보다 큰 흐름만 값을 움직인다');
const N = 8, SUBS_T = v2.SUBSISTENCE_PER_NPC.wood * N * 30;   // 닻 = subs × 30(정본 표에서 읽는다)
ok(OFF.hi.t === SUBS_T && OFF.lo.t === SUBS_T, `ⓒ 끔 목표 = subs×30 = ${SUBS_T}(EMA 를 안 본다)`, `${OFF.hi.t} · ${OFF.lo.t}`);
ok(Math.abs(ON.hi.t - 5 * 30) < 1e-9, 'ⓒ 켬 · EMA 5/일 마을 목표 = EMA×30 = 150(flowT 공식 그대로 — max 가 흐름)', String(ON.hi.t));
ok(ON.hi.p > OFF.hi.p * 5, 'ⓒ 켬 · 같은 곳간(100)에서 그림자가격이 오른다(닻 밑 → 닻 위)', `${OFF.hi.p.toFixed(3)} → ${ON.hi.p.toFixed(3)}`);
ok(ON.lo.t === SUBS_T && ON.lo.p === OFF.lo.p, 'ⓒ 켬 · EMA×30(6) < subs×30(12) 이면 끔과 같다(max 가 닻 — 흐름이 작으면 무변)', `${OFF.lo.p} = ${ON.lo.p}`);

console.log('\nⓓ 동기 계약 — 가격 세 자리 · 판정 자리 하나');
const FLOW_CALL = "subsGuard(r, 'price') ? 0 : ((v._consEMA || {})[r] || 0) * 30";
const nCall = SRC.split(FLOW_CALL).length - 1;
ok(nCall === 3, 'ⓓ 가격 세 자리(computeShadowPrices · _priceParamsV2 · tickDecay)가 같은 술어 · 같은 식을 부른다', `${nCall}곳`);
const nRead = SRC.split('process.env.T659_WOOD_FLOW').length - 1, nJudge = SRC.split('T659_WOOD_FLOW &&').length - 1;
ok(nRead === 1 && nJudge === 1 && SRC.includes(KNOB_LINE), 'ⓓ 손잡이를 읽는 자리 하나 · 판정 자리 하나(subsGuard 안 — 사본 0)', `읽기 ${nRead} · 판정 ${nJudge}`);
const fnBody = SRC.slice(SRC.indexOf('function subsGuard('), SRC.indexOf('\n}\n', SRC.indexOf('function subsGuard(')));
ok(fnBody.includes(KNOB_LINE), 'ⓓ 판정 줄은 술어 `subsGuard` 본문 안에 있다');

console.log('\nⓔ 3사본 — 번들 · 랩');
const B = fs.readFileSync(path.join(ROOT, 'sim', 'economy-engine.browser.js'), 'utf8');
ok(B.includes(KNOB_LINE) && B.includes('process.env.T659_WOOD_FLOW'), 'ⓔ 번들이 같은 손잡이 줄을 싣는다');
{
  const win = {};
  try { vm.runInNewContext(B, { window: win, console: { log() {}, info() {}, warn() {}, error() {} } }); } catch (e) { win.err = e.message; }
  const E = win.EconEngine;
  ok(!!E && E.T659_WOOD_FLOW === false && E.subsGuard('wood', 'price') === true, 'ⓔ 브라우저 꼴(process 심 env 빈 판)에선 끔 — 랩 기본 = 종전', win.err || '');
}
let inl = 0; try { execFileSync(process.execPath, [path.join(ROOT, 'sim', 'inline-engine.js'), '--check'], { cwd: ROOT, stdio: 'pipe' }); } catch (e) { inl = e.status || 1; }
ok(inl === 0, 'ⓔ 랩 두 벌 인라인 = 번들(`inline-engine --check`)');

console.log('\nⓕ 미끼 — 손잡이 줄을 뺀 사본');
let BAIT = null; try { BAIT = child({ T659_WOOD_FLOW: '1' }, [KNOB_LINE, '']); } catch (e) { BAIT = { err: String(e.message).slice(0, 120) }; }
ok(!!BAIT && BAIT.g && BAIT.g.wood[0] === true && BAIT.hi.t === SUBS_T, 'ⓕ [자명 통과 금지] 판정 줄을 뺀 사본은 켬에서도 통나무 가드 참 · 목표 = 닻 ⇒ ⓑ · ⓒ 가 빨개진다',
  BAIT && BAIT.g ? `가드 ${BAIT.g.wood[0]} · 목표 ${BAIT.hi.t}` : (BAIT && BAIT.err));

console.log(`\n=== 결과: ${pass} PASS / ${fail} FAIL ===`);
process.exit(fail ? 1 : 0);
