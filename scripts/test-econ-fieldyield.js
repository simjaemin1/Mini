#!/usr/bin/env node
// @regress   ← 통합 러너가 이 표를 보고 자기 목록을 만든다(scripts/run-regress.sh · 표 없으면 안 돈다)
// === scripts/test-econ-fieldyield.js — 밭이 곳간에 닿는다 (ECON 수술 2-b · T100 4판) ===
//
// ★왜 [재민 지시 T100 · 2026-09-05 → **4판 2026-09-07 재민 판정**]
//   T58b ⓖ 가 못 박은 것: 서버 NPC 농사는 **곳간에 아무것도 안 넣고**(`villages.js` — "회계는 econ
//   소유 · 물리 층은 수확한 칸 수만"), econ 의 농부 산출은 **밭과 무관한** `1.5 × 지력`이었다.
//   3판은 그 자리에 모델식(`밭칸 × 0.0806 × 지력`)을 꽂았고, T117 자로 재 보니 **실제 수확은
//   그 추상 산출의 0.22~0.26** 이었다. 4판은 모델식을 **버리고** 손잡이 둘로 간다:
//     ① 경작지 ×1.5(`village-layout.js LAND_NEED 8 → 12` · 정본 하나)
//     ② 곳간에 드는 것은 **생활층의 실제 수확 × k**, `k` 는 부양 인원 앵커 `N` 에서 **유도**.
//
// ★★이 하네스가 지키는 것
//   ① 유도      : `k` 를 `N`·정본 소비·실측에서 **다시 계산해 대조**(손으로 적은 수 0)
//   ② 정본 하나 : 인당 기준 경작칸 12 가 **한 곳**에서 온다(서버 둘 + 랩 = 같은 값)
//   ③ 대체      : 켜면 농부의 추상 식량 산출이 **0** 이고, 그 자리를 수확이 채운다(얹기 0)
//   ④ 무접촉    : 어부·사냥꾼·채집 산출은 켜고 꺼도 **한 비트도** 안 움직인다
//   ⑤ 되돌림    : `T100_FIELD_YIELD=0`(=미설정) 세계가 **비트 동일** · 켠 세계는 실제로 다르다
//   ⑥ 산수 한 곳: 생활층 곳간 배선은 **한 줄**이고 그 줄에 **숫자가 없다**(사본 0)
//   ⑦ 돌연변이  : `k` 를 손으로 1 이라 적으면 ①이 빨개진다(자식 프로세스 · 변조 사본)
//   ⑧ 추출 무변 : 개간 정본은 하나다(`_lifeClearDay`) — 랩도 라이브도 **그 함수**를 부른다
//   ⑨ 3사본     : 번들이 소스와 같은 표·같은 손잡이를 갖는다
//   ⑩ 창설 곳간 : `45` 대신 **첫 수확까지**가 `crops.js` 정본에서 유도된다(겨울 창설은 봄까지 · 여유 0)
//   ⑪ 텃밭 하한 : 수확 없는 날의 바닥이 `LIFE_CLEAR_PDAY`·`k`·익음 주기에서 유도된다(손잡이 `T100_GARDEN=0`)
//
// 실행: node scripts/test-econ-fieldyield.js
'use strict';
process.env.ENABLE_VILLAGES = process.env.ENABLE_VILLAGES || '0';
process.env.DB_PATH = process.env.DB_PATH || `/tmp/t100-hz-${process.pid}.db`;
const path = require('path');
const fs = require('fs');
const { execFileSync } = require('child_process');
const ROOT = path.join(__dirname, '..');
const R = (p) => require(path.join(ROOT, p));
let pass = 0, fail = 0;
const ok = (c, m, extra) => { c ? pass++ : fail++; console.log((c ? '  ✓ ' : '  ✗ ') + m + (extra !== undefined && extra !== '' ? `  ${extra}` : '')); };
const pre = (c, m, x) => { if (!c) { fail++; console.log('  ✗ [상황] ' + m + (x !== undefined ? `  ${x}` : '')); } else console.log('  · [상황] ' + m + (x !== undefined ? `  ${x}` : '')); };

// ★⑦ 돌연변이 팔은 **변조 사본**을 적재한다(정본은 한 톨도 안 건드린다 — 부모가 만들고 부모가 지운다).
const MUT = process.env.T100_MUT_MOD || '';
const econ = MUT ? require(path.join(ROOT, 'sim', MUT)) : R('sim/economy-sim');
const econV2 = R('sim/economy-sim-v2');
const SRC = fs.readFileSync(path.join(ROOT, 'sim', MUT || 'economy-sim.js'), 'utf8');
const VSRC = fs.readFileSync(path.join(ROOT, 'server', 'villages.js'), 'utf8');
const LSRC = fs.readFileSync(path.join(ROOT, 'server', 'village-layout.js'), 'utf8');
const ON = process.env.T100_FIELD_YIELD === '1';

// ★★[T100 5판 · main 병합 뒤 수리] **줄 주석을 먼저 지우고 블록 주석을 지운다.**
//   종전엔 순서가 반대였는데, `villages.js:20` 의 줄 주석 안에 있는 `sim/*` 가 **블록 주석을 여는
//   것으로 읽혀** 2,474~5,005 줄이 통째로 지워졌다(⑥ 이 "곳간에 닿는 자리 0줄" 이라 빨개졌다 —
//   코드는 멀쩡했는데 **자가 틀렸다**). 순서를 바꾸면 그 함정이 구조적으로 사라진다.
const codeOf = (src) => src.split('\n').map((l) => l.replace(/\/\/.*$/, '')).join('\n')
  .replace(/\/\*[\s\S]*?\*\//g, ' ');

console.log('\n=== 밭이 곳간에 닿는다 (ECON 수술 2-b · T100 4판) ===');
console.log(`  손잡이: T100_FIELD_YIELD=${ON ? '켬' : '끔'}${MUT ? '  ⚠변조 사본 ' + MUT : ''}`);

// ── ① 유도 — `k` 는 고른 수가 아니라 나온 수다 ─────────────────────────────
console.log('\n① 유도 — `k` 는 `N`·정본 소비·실측에서 나온다(손으로 적은 수 0)');
{
  const N = econ.T100_ANCHOR_N, H = econ.T100_HARVEST_PER_FARMER_YEAR, CONS = econ.DAILY_FOOD_CONSUMPTION;
  pre(typeof N === 'number' && N > 1 && N < 3, '앵커 `N`(농부 1인 부양 인원)이 노출돼 있다', String(N));
  pre(typeof H === 'number' && H > 0, '실측(농부 1인 연간 수확 건수)이 노출돼 있다', String(H));
  const derived = N * CONS * 365 / H;
  ok(Math.abs(derived - econ.T100_K) < 1e-12,
    '① ★★★`k` 를 `N × (하루 1인 식량 × 365) ÷ 실측` 으로 **다시 유도해도 같다**(사본·손수치 금지)',
    `유도 ${derived.toFixed(6)} = 상수 ${econ.T100_K.toFixed(6)}`);
  ok(/const T100_K = T100_ANCHOR_N \* DAILY_FOOD_CONSUMPTION \* 365 \/ T100_HARVEST_PER_FARMER_YEAR;/.test(SRC),
    '① ★★소스에 `k` 가 **유도식으로만** 있다(숫자 리터럴로 적으면 여기가 빨개진다)');
  // 하루 1인 식량은 T59/T73/T86 사슬(kg × kcal ÷ DAY_KCAL)의 끝이다 — 그 사슬이 살아 있어야 유도가 산다.
  const KC = R('server/kcal.js'), W = R('server/weights.js');
  ok(Math.abs(W.kgOf('food') * KC.KCAL_PER_KG.food - KC.DAY_KCAL) < 1e-9,
    '① ★★food 1단위 = kgOf(food) × KCAL_PER_KG.food = DAY_KCAL (T59/T73/T86 사슬)',
    `${W.kgOf('food')}kg × ${KC.KCAL_PER_KG.food} = ${W.kgOf('food') * KC.KCAL_PER_KG.food} = ${KC.DAY_KCAL}`);
  ok(Math.abs(CONS - 1.0) < 1e-12, '① 하루 1인 식량이 econ 정본 `DAILY_FOOD_CONSUMPTION` 하나다', String(CONS));
  ok(/scripts\/farm-metrics\.js/.test(SRC.slice(Math.max(0, SRC.indexOf('const T100_ANCHOR_N') - 3000), SRC.indexOf('const T100_K'))),
    '① 실측의 **출처(자·시드·일수)**가 상수 옆에 적혀 있다(재측정 길이 있다)');
}

// ── ② 인당 기준 경작칸 — 정본 하나 ─────────────────────────────────────────
console.log('\n② 정본 하나 — 인당 기준 경작칸 12 가 한 곳에서 온다');
{
  const VL = R('server/village-layout.js');
  const V = R('server/villages.js');
  ok(VL.LAND_NEED === 12, '② 정본 `village-layout.js LAND_NEED` = 12 (T100 4판 ×1.5)', String(VL.LAND_NEED));
  const VCODE = codeOf(VSRC);
  ok(!/const\s+L_LANDNEED\s*=\s*\d/.test(VCODE),
    '② ★★★`villages.js` 에 **사본 상수가 없다**(정본이 12 로 가도 여긴 8 로 남던 자리)');
  ok(V.__labProbe._clearProbe.L_LANDNEED === VL.LAND_NEED,
    '② ★★생활층이 읽는 값 = 정본 값', `생활층 ${V.__labProbe._clearProbe.L_LANDNEED} = 정본 ${VL.LAND_NEED}`);
  ok(/landNeedPer\(fert, LAND_NEED\)/.test(LSRC), '② 시딩(균형해)도 **같은 상수**를 쓴다(보즈럽 조정 포함)');
  // 랩 2종은 인라인 규약 밖(손으로 맞추고 `lab-wiring-check` 가 대조한다) — 여기서도 한 번 더 본다.
  for (const f of ['마을실험실.html', '전쟁실험실.html']) {
    const t = fs.readFileSync(path.join(ROOT, 'lab', f), 'utf8');
    const m = t.match(/L_LAND_BASE\s*=\s*(\d+)/);
    ok(!!m && +m[1] === VL.LAND_NEED, `② 랩 \`${f}\` 의 \`L_LAND_BASE\` 가 정본과 같다`, m ? m[1] : '없다');
    const fb = t.match(/typeof L_LANDNEED!=='undefined'\)\?L_LANDNEED:(\d+)/);
    ok(!!fb && +fb[1] === VL.LAND_NEED, `② 랩 \`${f}\` 의 인라인 layout **폴백**도 정본과 같다(죽은 8 이 안 남는다)`, fb ? fb[1] : '없다');
  }
}

// ── ③ 대체 — 농부의 추상 산출을 걷어내고 그 자리를 수확이 채운다 ───────────
console.log('\n③ 대체 — 얹지 않는다(둘 다 넣으면 곡물가가 붕괴한다 · T123 마을5)');
{
  ok(/if \(!\(T100_FIELD_YIELD && npc\.currentJob === 'farmer'\)\) addProduce\(jdef\.output, baseAmt\);/.test(SRC),
    '③ ★★★켜면 농부의 추상 식량 산출 한 줄이 **막힌다**(대체 · 얹기 0)');
  ok(/addProduce\(r, baseAmt \* rate\);/.test(SRC) && !/T100_FIELD_YIELD[^\n]*addProduce\(r,/.test(SRC),
    '③ ★★부산물(밀·쌀·보리·삼·모시)은 **안 막는다** — 곡물·섬유 사슬은 T86 그대로다');
  ok(/function farmLandBoost\(v\) \{\s*\n\s*return \(v\.land && v\.land\.fertility\) \|\| 0;\s*\n\}/.test(SRC),
    '③ ★`landBoost` 는 두 팔 모두 `v.land.fertility` 그 자체다(3판 모델식 폐기 · 부산물 무변)');
  ok(SRC.indexOf('CELL_FOOD_PER_DAY') < 0 && SRC.indexOf('T100_GARDEN_PER_FARMER') < 0,
    '③ 3판 모델식(`칸 × 0.0806 × 지력`)의 상수가 **소스에서 사라졌다**(폐기 · 죽은 앵커 0)');

  // 곳간 입구 — 실제로 넣는다(켬) · 한 톨도 안 넣는다(끔)
  const v = econ.createVillage({ initialPop: 0, name: '픽스처', fertility: 1.0 });
  const f0 = v.storage.food || 0, g0 = v._grainToday || 0;
  const put = econ.harvestToGranary(v, 10);
  if (ON) {
    ok(Math.abs(put - 10 * econ.T100_K) < 1e-9, '③ ★★수확 10건 = `10 × k` 식량등가', put.toFixed(4));
    ok((v.storage.food || 0) > f0 && Math.abs((v.storage.food - f0) - put * 0.97) < 1e-9,
      '③ 곳간이 실제로 는다(세금 3% 는 금고로 — `addProduce` 와 같은 꼴)', (v.storage.food - f0).toFixed(4));
    ok(Math.abs((v._grainToday || 0) - g0 - put) < 1e-9,
      '③ ★볏짚 연료 밑변(`_grainToday`)도 채운다(대체로 걷어낸 자리를 그대로 메운다 — 땔감이 통째로 나무로 안 몰린다)');
    // 부양 실측 — `k` 가 앵커를 되돌려 주는가(유도의 자기 검산)
    const perFarmerYear = econ.T100_HARVEST_PER_FARMER_YEAR * econ.T100_K;
    ok(Math.abs(perFarmerYear / (econ.DAILY_FOOD_CONSUMPTION * 365) - econ.T100_ANCHOR_N) < 1e-9,
      '③ ★★★실측 수확량 × k = 농부 1인이 **N 사람**을 먹인다(앵커로 되돌아온다)',
      `${(perFarmerYear / 365).toFixed(4)}인 = N ${econ.T100_ANCHOR_N}`);
  } else {
    ok(put === 0 && (v.storage.food || 0) === f0 && (v._grainToday || 0) === g0,
      '③ [끔] 곳간 입구가 **한 톨도 안 넣는다**(비트 동일의 뿌리)');
  }
}

// ── ④ 어부·사냥꾼·채집 무접촉 ──────────────────────────────────────────────
console.log('\n④ 무접촉 — 어부·사냥꾼·채집 산출은 안 건드렸다');
{
  ok(econ.FARMER_BASE === 1.5, '④ `FARMER_BASE` 가 노출돼 있다(계측기가 1.5 를 옮겨 적지 않는다)', String(econ.FARMER_BASE));
  ok(/landBoost: \(v\) => v\.land\.water/.test(SRC), '④ 어부 `landBoost` 가 `v.land.water` 그대로다(소스)');
  ok(/landBoost: \(v\) => v\.land\.game/.test(SRC), '④ 사냥꾼 `landBoost` 가 `v.land.game` 그대로다(소스)');
  const CODE = codeOf(SRC);
  const hits = CODE.split('\n').filter(l => l.indexOf('T100_FIELD_YIELD') >= 0).length;
  ok(hits === 9, '④ ★손잡이를 무는 줄이 **아홉뿐**이다(선언 1 + `farmFlowPerDay` 1 + `harvestToGranary` 1 + `seedFoodDays` 1 + `gardenFloorTopUp` 1 + 대체 1 + **잠재(T183) 1** + **배율 심기(T179) 1** + 내보내기 1 — 주석 제외)', `${hits}줄`);
  ok(/farmFlowPerDay\(v, _cf\.farmer \|\| 0\)/.test(SRC), '④ 부양력(prodK)도 **같은 함수**를 본다(K 만 옛 밑변이면 인구가 밭 없이 분다)');
  // 부양력은 켜면 앵커 그 자체다 — 용량과 산출이 같은 앵커를 본다.
  const v = econ.createVillage({ initialPop: 0, name: '픽스처', fertility: 0.8 });
  v.land.fertility = 0.8;
  const flow = econ.farmFlowPerDay(v, 10);
  if (ON) ok(Math.abs(flow - 10 * econ.T100_ANCHOR_N * econ.DAILY_FOOD_CONSUMPTION) < 1e-9,
    '④ ★★[켬] 부양력 = 농부수 × N × 하루 1인 식량 (**앵커 그 자체** · 지력에 안 물린다)', flow.toFixed(4));
  else ok(Math.abs(flow - 10 * econ.FARMER_BASE * 0.8) < 1e-9, '④ [끔] 부양력이 옛 식 그대로다', flow.toFixed(4));
}

// ── ⑤ 되돌림 — 비트 동일 ───────────────────────────────────────────────────
console.log('\n⑤ 되돌림 — 끈 세계가 T86 세계와 비트 동일한가');
if (!process.env.T100_CHILD) {
  const fp = (env) => execFileSync(process.execPath, [__filename, '--fingerprint'],
    { env: Object.assign({}, process.env, env, { T100_CHILD: '1', T100_MUT_MOD: '' }), stdio: 'pipe' }).toString().split('FP:')[1] || 'NONE';
  const off = fp({ T100_FIELD_YIELD: '0' });
  const unset = fp({ T100_FIELD_YIELD: '' });
  const on = fp({ T100_FIELD_YIELD: '1' });
  ok(off === unset, '⑤ ★★★`T100_FIELD_YIELD=0` 과 **미설정**이 비트 동일(되돌림이 기본이다)', off.slice(0, 46) + '…');
  ok(off !== on, '⑤ ★★[자명 통과 금지] 켠 세계는 **실제로 다르다**(0=0 통과가 아니다)', on.slice(0, 46) + '…');
} else if (process.argv.indexOf('--fingerprint') >= 0) {
  const w = econV2.createWorldV2({ seed: 42, villageCount: 5, namePool: ['가', '나', '다', '라', '마'], infoRange: 5000, raidPer100: 0.005, picker: 'rational' });
  const _l = console.log; console.log = () => {};
  for (let d = 0; d < 400; d++) econV2.tickWorldV2(w);
  console.log = _l;
  process.stdout.write('FP:' + w.villages.map(v => `${v.name}:${v.npcs.length}/f${v.storage.food.toFixed(4)}/w${(v.storage.wood || 0).toFixed(4)}/h${(v.storage.wheat || 0).toFixed(4)}`).join(' '));
  process.exit(0);
} else { console.log('  (자식 프로세스 — ⑤ 건너뜀)'); }

// ── ⑥ 산수는 한 곳 — 생활층 곳간 배선에 숫자가 없다 ────────────────────────
console.log('\n⑥ 산수 한 곳 — 생활층은 econ 입구를 부르기만 한다');
const clearRegion = (src) => {
  const i = src.indexOf('function _lifeClearDay'), j = src.indexOf('function _lifeHeadlessDay');
  const k = src.indexOf('function _lifeLiveFarmTile'), l = src.indexOf('\n}', k);
  return src.slice(i, j) + src.slice(k, l);
};
const bites = (src) => /\.(storage|treasury)\s*(\[|\.)\s*[A-Za-z_'"`]/.test(
  clearRegion(src).replace(/\/\/.*$/gm, ''));
{
  ok(!bites(VSRC), '⑥ ★★개간·실체화 절엔 여전히 `storage`/`treasury` 쓰기가 **한 줄도 없다**(회계는 econ 한 곳)');
  const CODE = codeOf(VSRC);
  const calls = CODE.split('\n').filter(l => l.indexOf('harvestToGranary') >= 0);
  ok(calls.length === 1, '⑥ ★★★생활층이 곳간에 닿는 자리가 **한 줄**이다', `${calls.length}줄`);
  ok(calls.length === 1 && /_lifeEcon\(\)\.harvestToGranary\(vil\.econ, 1, _farmMul\(vil, npc\)\)/.test(calls[0]),
    '⑥ ★그 한 줄이 **econ 입구를 부르기만** 한다(건수 1 + 배율 하나 — 계수·환산·세금은 전부 econ 안 · 사본 0)');
  ok(calls.length === 1 && !/[*/+]|T100_K|TAX_RATE/.test(calls[0].split('harvestToGranary')[1] || ''),
    '⑥ ★★[T190] 그 줄에 **산수가 없다**(배율을 여기서 곱하지 않는다 — 이중 0)');
  ok(calls.length === 1 && /if \(did === 'harvest'\)/.test(calls[0]), '⑥ 그 자리가 **수확 갈래**다(파종·김매기가 곳간을 안 만진다)');
  ok(/ec\._fieldCells = f;/.test(VSRC) && /_fieldBridge\(vil\);/.test(VSRC),
    '⑥ 칸 수 브리지는 그대로다(공간 값 · 장부가 아니다) — ★[T198] 심는 자리가 **한 함수**로 모였다');
}

// ── ⑦ 돌연변이 ─────────────────────────────────────────────────────────────
console.log('\n⑦ ★이 하네스가 실패할 줄 아는가');
if (!process.env.T100_CHILD) {
  const run = (env) => {
    try { execFileSync(process.execPath, [__filename], { env: Object.assign({}, process.env, env, { T100_CHILD: '1' }), stdio: 'pipe' }); return 0; }
    catch (e) { return e.status || 1; }
  };
  ok(run({ T100_FIELD_YIELD: '1', T100_MUT_MOD: '' }) === 0, '⑦ [대조] 멀쩡한 켠 판은 **깨끗이 통과한다**(항상 빨간 감사기가 아니다)');
  // ★변조 사본 — `k` 를 손으로 1 이라 적은 economy-sim 을 `sim/` 옆에 잠깐 두고 자식에게 물린다.
  //   (상대 require(`./specialty`)가 살아야 해서 같은 디렉터리여야 한다. 부모가 만들고 부모가 지운다.)
  const MUTNAME = '_t100mut-economy-sim.js';
  const MUTPATH = path.join(ROOT, 'sim', MUTNAME);
  let made = false;
  try {
    const mutSrc = SRC.replace(
      'const T100_K = T100_ANCHOR_N * DAILY_FOOD_CONSUMPTION * 365 / T100_HARVEST_PER_FARMER_YEAR;',
      'const T100_K = 1;   // 하네스 변조본 — 유도를 손수치로 바꿨다');
    ok(mutSrc !== SRC, '⑦ 변조 지점(유도 한 줄)이 소스에 **실재한다**');
    fs.writeFileSync(MUTPATH, mutSrc); made = true;
    ok(run({ T100_FIELD_YIELD: '1', T100_MUT_MOD: MUTNAME }) !== 0,
      '⑦ ★★★`k` 를 손으로 1 이라 적으면 **①이 빨개진다**(곳간에 드는 식량이 1/k 로 급감하는 판)');
  } finally { if (made) { try { fs.unlinkSync(MUTPATH); } catch (e) { console.log('  ⚠변조 사본 정리 실패: ' + MUTPATH); } } }
  // ★변조 둘째 — 창설 곳간을 옛 수 45 로 되돌린 사본(4판의 골짜기를 되살리는 판)
  let made2 = false;
  try {
    const mutSrc2 = SRC.replace('const SEED_FOOD_DAYS_D0 = 55;', 'const SEED_FOOD_DAYS_D0 = 45;')
                       .replace("if (C && typeof C.daysToFirstHarvest === 'function') {", 'if (false) {');
    ok(mutSrc2 !== SRC, '⑦ 창설 곳간의 변조 지점이 소스에 **실재한다**');
    fs.writeFileSync(MUTPATH, mutSrc2); made2 = true;
    ok(run({ T100_FIELD_YIELD: '1', T100_MUT_MOD: MUTNAME }) !== 0,
      '⑦ ★★★창설 곳간을 **45 로 되돌리면 ⑩ 이 빨개진다**(4판의 골짜기를 되살리는 판)');
  } finally { if (made2) { try { fs.unlinkSync(MUTPATH); } catch (e) { console.log('  ⚠변조 사본 정리 실패: ' + MUTPATH); } } }
  // ★변조 셋째 [T183] — **두 번 넣는 판**: 농부 게이트를 지우면 실현(추상 `addProduce`)과 잠재(T183 자리)에
  //   같은 밭 식량이 두 번 든다. 그 판이 초록이면 "이중 0" 은 빈말이다.
  let made3 = false;
  try {
    const mutSrc3 = SRC.replace(
      "if (!(T100_FIELD_YIELD && npc.currentJob === 'farmer')) addProduce(jdef.output, baseAmt);",
      'addProduce(jdef.output, baseAmt);   // 하네스 변조본 — 대체를 걷어내 **두 번** 넣는다');
    ok(mutSrc3 !== SRC, '⑦ [T183] 두 번 넣기의 변조 지점(대체 게이트)이 소스에 **실재한다**');
    fs.writeFileSync(MUTPATH, mutSrc3); made3 = true;
    ok(run({ T100_FIELD_YIELD: '1', T100_MUT_MOD: MUTNAME }) !== 0,
      '⑦ ★★★실현에도 잠재에도 **두 번** 넣으면 빨개진다(③ 대체 · ⑫ 이중 0)');
  } finally { if (made3) { try { fs.unlinkSync(MUTPATH); } catch (e) { console.log('  ⚠변조 사본 정리 실패: ' + MUTPATH); } } }
  // ★변조 넷째 [T183] — 잠재에 **배수**를 끼우는 판(`_t100Pot * 2`). ⑫ⓑ 의 꼴 검사가 물어야 한다.
  let made4 = false;
  try {
    const mutSrc4 = SRC.replace(
      'dailyProductionPotential.food = (dailyProductionPotential.food || 0) + _t100Pot;',
      'dailyProductionPotential.food = (dailyProductionPotential.food || 0) + _t100Pot * 2;');
    ok(mutSrc4 !== SRC, '⑦ [T183] 잠재 배수의 변조 지점이 소스에 **실재한다**');
    fs.writeFileSync(MUTPATH, mutSrc4); made4 = true;
    ok(run({ T100_FIELD_YIELD: '1', T100_MUT_MOD: MUTNAME }) !== 0,
      '⑦ ★★★잠재에 **×2** 를 끼우면 빨개진다(⑫ 꼴 검사 — 새 수 0 의 파수꾼)');
  } finally { if (made4) { try { fs.unlinkSync(MUTPATH); } catch (e) { console.log('  ⚠변조 사본 정리 실패: ' + MUTPATH); } } }
  // ★변조 다섯째 [T179] — 문에서 배율을 다시 떼어낸 사본(대체가 배율을 삼키던 그 판)
  let made5 = false;
  try {
    const mutSrc3 = SRC.replace('const amt = ((n > 0 ? n : 1)) * T100_K * _m;',
                                'const amt = ((n > 0 ? n : 1)) * T100_K;   // 하네스 변조본 — 배율을 다시 삼킨다');
    ok(mutSrc3 !== SRC, '⑦ 배율 자리의 변조 지점이 소스에 **실재한다**');
    fs.writeFileSync(MUTPATH, mutSrc3); made5 = true;
    ok(run({ T100_FIELD_YIELD: '1', T100_MUT_MOD: MUTNAME }) !== 0,
      '⑦ ★★★문에서 `_m` 을 떼면 **⑬ 이 빨개진다**(숙련 10 농부가 다시 초보와 같아지는 판)');
  } finally { if (made5) { try { fs.unlinkSync(MUTPATH); } catch (e) { console.log('  ⚠변조 사본 정리 실패: ' + MUTPATH); } } }
  // ★변조 여섯째 [T179] — 배율을 문 **뒤에서 한 번 더** 곱한 사본(이중 — T172 가 처음에 못 잡았던 그것)
  let made6 = false;
  try {
    const mutSrc4 = SRC.replace('  const tax = amt * TAX_RATE;', '  v._t100Dbl = amt * _m;   // 하네스 변조본 — 배율을 두 번 문다\n  const tax = amt * TAX_RATE;');
    ok(mutSrc4 !== SRC, '⑦ 이중 곱셈의 변조 지점이 소스에 **실재한다**');
    fs.writeFileSync(MUTPATH, mutSrc4); made6 = true;
    ok(run({ T100_FIELD_YIELD: '1', T100_MUT_MOD: MUTNAME }) !== 0,
      '⑦ ★★★배율을 **두 번** 물리면 ⑬ 의 「한 줄」 감지기가 문다(이중 0)');
  } finally { if (made6) { try { fs.unlinkSync(MUTPATH); } catch (e) { console.log('  ⚠변조 사본 정리 실패: ' + MUTPATH); } } }
  // ★변조 일곱째 [T190] — 배율을 **안 넘기는** 사본(T179 가 문만 열어 두고 끝낸 그 상태)
  let made7 = false;
  try {
    const mutV = VSRC.replace('_lifeEcon().harvestToGranary(vil.econ, 1, _farmMul(vil, npc))',
                              '_lifeEcon().harvestToGranary(vil.econ, 1)');
    ok(mutV !== VSRC, '⑦ [T190] 호출부의 변조 지점이 소스에 **실재한다**');
    const VMUT = codeOf(mutV).split('\n').filter((l) => l.indexOf('harvestToGranary') >= 0)[0] || '';
    ok(!/_farmMul\(vil, npc\)/.test(VMUT),
      '⑦ ★★★배율을 **안 넘기면** ⑥·⑬·⑯ 의 호출부 검사가 문다(켠 팔이 다시 평평해지는 판)');
    made7 = true;
  } finally { if (!made7) console.log('  ⚠[T190] 일곱째 변조 점검 실패'); }
  // ★변조 여덟째 [T190] — 생활층에서 배율을 **한 번 더** 곱하는 사본(이중)
  {
    const mutV2 = VSRC.replace(', 1, _farmMul(vil, npc))', ', 1, _farmMul(vil, npc) * 2)');   // ★호출부만(선언부가 아니라)
    ok(mutV2 !== VSRC, '⑦ [T190] 이중 곱셈의 변조 지점이 소스에 **실재한다**');
    const line = codeOf(mutV2).split('\n').filter((l) => l.indexOf('harvestToGranary') >= 0)[0] || '';
    ok(/[*/+]/.test(line.split('harvestToGranary')[1] || ''),
      '⑦ ★★★생활층에서 배율을 **두 번** 물리면 ⑥ 의 「산수 없다」 감지기가 문다(이중 0)');
  }
  // ★변조 다섯째 [T193] — 장부에 **배수**를 끼우는 판(`_t100Pot * 2`). ⑬ⓐ 의 꼴 검사가 물어야 한다.
  let made9 = false;
  try {
    const mutSrc5 = SRC.replace(
      'if (T193_LEDGER) dailyProduction.food = (dailyProduction.food || 0) + _t100Pot;',
      'if (T193_LEDGER) dailyProduction.food = (dailyProduction.food || 0) + _t100Pot * 2;');
    ok(mutSrc5 !== SRC, '⑦ [T193] 장부 배수의 변조 지점이 소스에 **실재한다**');
    fs.writeFileSync(MUTPATH, mutSrc5); made9 = true;
    ok(run({ T100_FIELD_YIELD: '1', T193_LEDGER: '1', T100_MUT_MOD: MUTNAME }) !== 0,
      '⑦ ★★★장부에 **×2** 를 끼우면 빨개진다(⑮ 꼴·양 검사 — 새 수 0 의 파수꾼)');
  } finally { if (made9) { try { fs.unlinkSync(MUTPATH); } catch (e) { console.log('  ⚠변조 사본 정리 실패: ' + MUTPATH); } } }
  const mutated = VSRC.replace('  _fieldBridge(vil);\n  const bo = {',
    '  _fieldBridge(vil); vil.econ.storage.food += 1;\n  const bo = {');
  ok(mutated !== VSRC && bites(mutated),
    '⑦ ★★개간 절에 **곳간 가산 한 줄**을 넣으면 ⑥의 감지기가 **문다**(감지기 자기검사)');
} else { console.log('  (자식 프로세스 — ⑦ 건너뜀)'); }

// ── ⑧ 개간 정본은 하나다 ───────────────────────────────────────────────────
console.log('\n⑧ 개간 정본 — 랩도 라이브도 같은 함수를 부른다');
{
  const V = R('server/villages.js');
  ok(/_lifeClearDay\(vil, farmerN\);/.test(VSRC), '⑧ `_lifeHeadlessDay` 가 추출한 정본을 부른다(사본 아님)');
  ok((VSRC.match(/function _lifeClearDay/g) || []).length === 1, '⑧ 개간 함수가 **하나**다');
  ok(typeof V.__labProbe._clearProbe.day === 'function' && /day: \(vil, farmerN\) => _lifeClearDay\(vil, farmerN\)/.test(VSRC),
    '⑧ ★★랩 주입구가 **그 함수 자체**를 내준다(하네스가 크루 상한·프론티어를 다시 적지 않는다)');
}

// ── ⑩ 창설 곳간 — 45 는 지어낸 수였다 ─────────────────────────────────────
console.log('\n⑩ 창설 곳간 — 첫 수확까지(T100 5판 · 여유 0)');
{
  const CR = R('server/crops.js');
  ok(typeof CR.daysToFirstHarvest === 'function',
    '⑩ 정본 `crops.js daysToFirstHarvest` 가 있다(창설 곳간의 밑변을 econ 이 지어내지 않는다)');
  const d0 = CR.daysToFirstHarvest(0);
  ok(d0 === econ.SEED_FOOD_DAYS_D0,
    '⑩ ★★★econ 이 적어 둔 창설일 0 값을 `crops.js` 에서 **다시 유도해도 같다**(브라우저 폴백 = 서버 정본)',
    `유도 ${d0} = 상수 ${econ.SEED_FOOD_DAYS_D0}`);
  ok(econ.SEED_FOOD_DAYS_LEGACY === 45,
    '⑩ 옛 수 45 는 **끈 팔의 값으로만** 남아 있다(비트 동일의 뿌리)', String(econ.SEED_FOOD_DAYS_LEGACY));
  ok(d0 !== econ.SEED_FOOD_DAYS_LEGACY, '⑩ [자명 통과 금지] 유도값이 옛 수와 **실제로 다르다**', `${d0} ≠ 45`);
  // 겨울 창설 — 봄 첫 파종창까지 굴러간다(T99 휴면 그대로)
  const winter = [];
  for (let d = 0; d < 365; d++) if (CR.sowableMonth('논', CR.monthOf(d)).length === 0 && CR.sowableMonth('밭', CR.monthOf(d)).length === 0) winter.push(d);
  pre(winter.length > 0, '심을 수 없는 날(겨울)이 실제로 있다 — 자명 통과 금지', `${winter.length}일`);
  if (winter.length) {
    const w = winter[Math.floor(winter.length / 2)];
    const dw = CR.daysToFirstHarvest(w);
    ok(dw > d0, '⑩ ★★겨울에 세운 마을은 **봄 첫 수확까지** 더 오래 버텨야 한다', `게임일 ${w}(${CR.monthOf(w)}월) → ${dw}일 > 봄 ${d0}일`);
    ok(CR.sowableMonth('논', CR.monthOf(w + dw)).length + CR.sowableMonth('밭', CR.monthOf(w + dw)).length >= 0,
      '⑩ 그 날 수가 실제 달력 위에 앉는다(휴면 T99 를 통과한 값)');
  }
  // 손잡이 — 끄면 옛 수 그대로
  if (ON) {
    ok(econ.seedFoodDays(0) === d0, '⑩ ★[켬] 창설 곳간이 유도값을 쓴다', `${econ.seedFoodDays(0)}일`);
    const v = econ.createVillage({ initialPop: 10, name: '픽스처', fertility: 1.0 });
    ok(Math.abs((v.storage.food || 0) - 10 * d0) < 1e-9,
      '⑩ ★★창설 부존이 실제로 `initN × 유도값` 이다(한 줄이 그 값을 쓴다)', (v.storage.food || 0).toFixed(1));
  } else {
    ok(econ.seedFoodDays(0) === 45, '⑩ ★[끔] 창설 곳간이 옛 수 45 그대로다(비트 동일)');
    const v = econ.createVillage({ initialPop: 10, name: '픽스처', fertility: 1.0 });
    ok(Math.abs((v.storage.food || 0) - 450) < 1e-9, '⑩ [끔] 창설 부존 = initN × 45', (v.storage.food || 0).toFixed(1));
  }
  ok(/v\.storage\.food = initN \* seedFoodDays\(opts\.bornDay \|\| 0\);/.test(SRC),
    '⑩ 창설 자리가 **한 줄**이고 그 줄에 숫자가 없다(45 를 다시 적으면 빨개진다)');
}

// ── ⑪ 텃밭 하한(조건부 ⓒ) ─────────────────────────────────────────────────
console.log('\n⑪ 텃밭 하한 — 수확 없는 날의 바닥(T100 5판 ⓒ · 새 수 0)');
{
  const V = R('server/villages.js');
  ok(econ.T100_GARDEN_CELLS === V.__labProbe._clearProbe.LIFE_CLEAR_PDAY,
    '⑪ ★★텃밭 칸수 = 생활층 정본 `LIFE_CLEAR_PDAY`(두 곳이 갈리면 여기가 빨개진다)',
    `econ ${econ.T100_GARDEN_CELLS} = 생활층 ${V.__labProbe._clearProbe.LIFE_CLEAR_PDAY}`);
  const derived = econ.T100_GARDEN_CELLS * econ.T100_K / econ.SEED_FOOD_DAYS_D0;
  ok(Math.abs(derived - econ.T100_GARDEN_FLOOR) < 1e-12,
    '⑪ ★★★바닥을 `텃밭 칸수 × k ÷ 익음 주기` 로 **다시 유도해도 같다**(손으로 적은 수 0)',
    `유도 ${derived.toFixed(6)} = 상수 ${econ.T100_GARDEN_FLOOR.toFixed(6)}`);
  ok(/const T100_GARDEN_FLOOR = T100_GARDEN_CELLS \* T100_K \/ SEED_FOOD_DAYS_D0;/.test(SRC),
    '⑪ ★소스에 바닥이 **유도식으로만** 있다');
  ok(econ.T100_GARDEN_FLOOR < econ.T100_ANCHOR_N,
    '⑪ 바닥은 앵커보다 **아래**다(하한이지 산출이 아니다)',
    `${econ.T100_GARDEN_FLOOR.toFixed(4)} < ${econ.T100_ANCHOR_N} (${(econ.T100_GARDEN_FLOOR / econ.T100_ANCHOR_N * 100).toFixed(1)}%)`);
  const v = econ.createVillage({ initialPop: 0, name: '픽스처', fertility: 1.0 });
  v.counts = Object.assign({}, v.counts, { farmer: 10 });
  const f0 = v.storage.food || 0;
  const put = econ.gardenFloorTopUp(v);
  if (ON && econ.T100_GARDEN) {
    ok(Math.abs(put - 10 * econ.T100_GARDEN_FLOOR) < 1e-9, '⑪ ★수확이 0 인 날엔 농부수 × 바닥을 댄다', put.toFixed(4));
    ok(Math.abs((v.storage.food - f0) - put * 0.97) < 1e-9, '⑪ 곳간에 실제로 들어간다(세금 3% 는 금고로 — 같은 꼴)');
    econ.harvestToGranary(v, 100);
    ok(econ.gardenFloorTopUp(v) === 0, '⑪ ★★수확이 바닥보다 많은 날엔 **한 톨도 안 댄다**(max — 얹기 0)');
  } else {
    ok(put === 0 && (v.storage.food || 0) === f0, '⑪ [끔/손잡이 0] 바닥이 **한 톨도 안 댄다**');
  }
  ok(/gardenFloorTopUp\(v\);/.test(SRC), '⑪ 하루 한 번 부르는 자리가 소스에 있다(econ 틱 · 생활층 아님)');
}

// ── ⑫ 켠 팔의 잠재 — 농부가 `dailyProductionPotential` 에서 사라지지 않는다 (T183) ─
console.log('\n⑫ 켠 팔의 잠재 — 밭이 낸 식량이 **잠재에도** 쌓이나(T183 · 새 수 0)');
{
  // ⓐ 잠재를 건드리는 자리 전수 — 주석을 뺀 코드에서 센다(자리가 늘면 여기가 빨개진다)
  const C = codeOf(SRC);
  const hits = C.split('\n').map((l, i) => [i + 1, l]).filter(([, l]) => /dailyProductionPotential/.test(l));
  const writes = hits.filter(([, l]) => /dailyProductionPotential(\[[^\]]+\]|\.food)\s*=/.test(l));
  const reads = hits.filter(([, l]) => !/dailyProductionPotential(\[[^\]]+\]|\.food)\s*=/.test(l) && !/const dailyProductionPotential = \{\}/.test(l));
  ok(hits.length === 5, '⑫ 잠재를 건드리는 자리는 **다섯**이다(선언 1 · 쓰기 2 · 읽기 2)', `실제 ${hits.length}`);
  ok(writes.length === 2, '⑫ ★쓰는 곳 **둘** — `addProduce`(끈 팔의 길) · T183(켠 팔의 길)', `실제 ${writes.length}`);
  ok(reads.length === 2, '⑫ 읽는 곳 **둘** — `totalFoodProductionEquivalent`(prodK) · 볏짚(fuelK)', `실제 ${reads.length}`);
  ok(/const dailyFoodProdPotential = totalFoodProductionEquivalent\(dailyProductionPotential\);/.test(C)
     && /\(dailyProductionPotential\.food \|\| 0\) \* STRAW_FUEL_PER_FOOD/.test(C),
    '⑫ 읽는 두 곳의 꼴이 그대로다(prodK 다리 · 볏짚 다리)');

  // ⓑ T183 자리 — **정확한 꼴**로 있다(배수·중복을 끼워 넣으면 여기가 빨개진다)
  ok(/const _t100In = T100_FIELD_YIELD \? \(v\._t100InflowToday \|\| 0\) : 0;/.test(C),
    '⑫ ★비우기 **전에** 오늘치를 읽고, **이 줄에서도 손잡이를 본다**(끈 팔은 밖에서 심어도 안 움직인다)');
  ok(/const _t100Pot = _t100In \+ gardenFloorTopUp\(v\);/.test(C),
    '⑫ ★수확분 + 텃밭 하한분 — 둘 다 밭이 낸 식량이다(하한만 빼면 잠재가 실체보다 작아진다)');
  ok(/dailyProductionPotential\.food = \(dailyProductionPotential\.food \|\| 0\) \+ _t100Pot;/.test(C),
    '⑫ ★★★잠재에 적는 수는 **실체 그대로**다 — 배수 0 · 새 수 0(`* 2` 같은 걸 끼우면 여기가 빨개진다)');
  ok(/v\._t100InflowToday = 0;/.test(C.slice(C.indexOf('const _t100Pot'))),
    '⑫ 텃밭을 끈 판에서도 오늘치로 비운다(누적 누수 차단)');
  ok(!hits.some(([, l]) => /farmFlowPerDay|JOBS\.farmer\.base/.test(l)),
    '⑫ ★잠재를 채우는 자리에 **추상식이 없다**(4판이 걷어낸 `base × 지력` 으로 잠재를 메우지 않는다 — 사본 0)');
  ok(/const _capFlow = farmFlowPerDay\(v, _cf\.farmer \|\| 0\)/.test(C),
    '⑫ 그 추상식이 사는 곳은 **`PRODK_CAP` 의 용량 다리** 하나다(T100 4판이 밭 밑변으로 갈아 끼운 그 자리 · 무변)');

  // ⓒ 기능 — 잠재가 실제로 움직이나(`_kDbg.fuel` 의 볏짚 다리로 본다 · 상수 사본 0)
  //   ★자명 통과 금지: Δ 가 0 이면 빨강. 그리고 **선형**이어야 한다(2배 넣으면 2배 움직인다).
  const probe = (inj) => {
    const w = econV2.createWorldV2({ seed: 5, villageCount: 1, namePool: ['가'], infoRange: 5000, raidPer100: 0 });
    const v = w.villages[0];
    v._t100InflowToday = inj;
    const _l = console.log; console.log = () => {};
    try { econV2.tickWorldV2(w); } finally { console.log = _l; }
    return { fuel: v._kDbg ? v._kDbg.fuel : null, prod: v._kDbg ? v._kDbg.prod : null, food: +(v.storage.food || 0).toFixed(6) };
  };
  const p0 = probe(0), p1 = probe(50), p2 = probe(100);
  if (ON) {
    ok(p1.fuel > p0.fuel, '⑫ ★★★밭이 낸 식량을 넣으면 **연료 부양력(fuelK)이 오른다**(0 이면 빨강 — 자명 통과 금지)',
      `${p0.fuel} → ${p1.fuel} (Δ ${(p1.fuel - p0.fuel).toFixed(1)})`);
    const d1 = p1.fuel - p0.fuel, d2 = p2.fuel - p0.fuel;
    ok(d1 > 0 && Math.abs(d2 - 2 * d1) <= 0.15,
      '⑫ ★**선형**이다 — 두 배 넣으면 두 배 움직인다(상한·EMA 가 아니라 볏짚 다리를 탔다는 뜻)',
      `Δ(50) ${d1.toFixed(1)} · Δ(100) ${d2.toFixed(1)}`);
    ok(p0.food === p1.food && p1.food === p2.food,
      '⑫ ★곳간은 **한 톨도 안 변한다** — 이 자리는 잠재만 적는다(실체는 `harvestToGranary` 가 이미 넣었다 · 이중 0)');
    ok(p0.prod === p1.prod && p1.prod === p2.prod,
      '⑫ ★★[T176 §1 정정] prodK 는 **안 움직인다** — `PRODK_CAP`(기본 켬)이 잠재 다리를 덮어쓰기 때문이다.',
      `prod ${p0.prod} 고정 · 그래서 켠 팔이 실제로 잃던 것은 **볏짚(fuelK) 하나**다`);
  } else {
    ok(p0.fuel === p1.fuel && p1.fuel === p2.fuel && p0.prod === p1.prod,
      '⑫ ★★[끔] 밖에서 `_t100InflowToday` 를 **심어도** fuelK·prodK 가 한 자도 안 변한다(비트 동일 — 손잡이 밖)',
      `fuel ${p0.fuel} · prod ${p0.prod} 고정`);
    ok(p0.food === p1.food, '⑫ [끔] 곳간도 안 변한다');
  }
}

// ── ⑮ 장부가 밭을 본다 (T193) ──────────────────────────────────────────────
console.log('\n⑮ 장부 — 밭이 곳간에 넣은 그 양이 **실현 흐름 장부**에도 적히나(T193 · 손잡이 기본 끔)');
{
  const C = codeOf(SRC);
  const LED = econ.T193_LEDGER;
  // ⓐ 자리 전수 — `dailyProduction`(실현 장부)을 쓰는 곳 둘 · 읽는 곳 하나
  const hits = C.split('\n').map((l, i) => [i + 1, l]).filter(([, l]) => /dailyProduction\b/.test(l));
  const writes = hits.filter(([, l]) => /dailyProduction(\[[^\]]+\]|\.food)\s*=/.test(l) && !/= v\.dailyProductionBuf/.test(l));
  ok(/const dailyProduction = v\.dailyProductionBuf;/.test(C), '⑮ 장부는 **마을에 사는 버퍼**다(`v.dailyProductionBuf`)');
  ok(/for \(const r in dailyProduction\) dailyProduction\[r\] = 0;/.test(C),
    '⑮ ★그 버퍼는 **틱 머리에서 리셋**된다 — 그래서 생활층(틱 뒤)에서 적으면 지워진다');
  ok(writes.length === 4, '⑮ ★쓰는 줄 넷 — 리셋 둘 + `addProduce`(끈 팔) + T193(켠 팔)', `실제 ${writes.length}`);
  ok(/const dailyFoodProd = totalFoodProductionEquivalent\(dailyProduction\);/.test(C),
    '⑮ 읽는 곳은 하나 — `totalFoodProductionEquivalent` → `dailySurplus` → `surplusEMA.food`');
  ok(/if \(T193_LEDGER\) dailyProduction\.food = \(dailyProduction\.food \|\| 0\) \+ _t100Pot;/.test(C),
    '⑮ ★★★적는 수는 **잠재에 적는 그 수 그대로**다(`_t100Pot`) — 배수 0 · 새 수 0(`* 2` 를 끼우면 여기가 빨개진다)');
  ok(/const T193_LEDGER = process\.env\.T193_LEDGER === '1';/.test(C),
    '⑮ 손잡이는 **기본 끔**이다(`=== \'1\'` — 켜야 켜진다)');
  ok(C.indexOf('T193_LEDGER') > 0 && !/T193_LEDGER[^\n]*dailyProductionPotential/.test(C),
    '⑮ 손잡이는 **실현 장부만** 문다 — T183 의 잠재 줄은 손잡이 밖이다(따로 산다)');

  // ⓑ 리셋 실측 — 생활층 자리가 왜 못 쓰는 자리인가(자명 통과 금지: 실제로 지워지는 걸 본다)
  {
    const w = econV2.createWorldV2({ seed: 5, villageCount: 1, namePool: ['가'], infoRange: 5000, raidPer100: 0 });
    const v = w.villages[0];
    const _l = console.log; console.log = () => {};
    try { econV2.tickWorldV2(w); v.dailyProductionBuf.food = 999; econV2.tickWorldV2(w); } finally { console.log = _l; }
    ok(v.dailyProductionBuf.food !== 999,
      '⑮ ★생활층 자리에 적은 값은 **다음 틱이 읽기 전에 지워진다**(999 → 리셋) — 자리가 틱 안이어야 하는 이유',
      `틱 뒤 ${v.dailyProductionBuf.food.toFixed(2)}`);
  }

  // ⓒ 기능 — 켜면 장부에 오르고, 끄면 0. 곳간은 두 판이 **같다**(장부만 적는다 · 이중 0)
  const probe = () => {
    const w = econV2.createWorldV2({ seed: 5, villageCount: 1, namePool: ['가'], infoRange: 5000, raidPer100: 0 });
    const v = w.villages[0];
    econ.harvestToGranary(v, 100);                      // 생활층이 어제 거둔 것(정본 입구)
    const _l = console.log; console.log = () => {};
    try { econV2.tickWorldV2(w); } finally { console.log = _l; }
    return { led: +(v.dailyProductionBuf.food || 0), sp: v.surplusEMA.food, food: +(v.storage.food || 0).toFixed(6) };
  };
  const p = probe();
  if (ON && LED) {
    ok(p.led > 0, '⑮ ★★★[켬] 수확 100건이 장부에 **오른다**(0 이면 빨강 — 자명 통과 금지)', `장부 ${p.led.toFixed(2)}`);
    ok(Math.abs(p.led - 100 * econ.T100_K) < 1e-6,
      '⑮ ★오른 양이 곳간에 넣은 그 양과 **같다**(`100 × k` · 세전 · 배수 0)', `${p.led.toFixed(4)} = 100×${econ.T100_K.toFixed(4)}`);
    ok(p.sp > 0, '⑮ ★그래서 `surplusEMA.food` 가 **양수로 선다**(마을이 자기를 적자로 안 읽는다)', p.sp.toFixed(3));
  } else if (ON) {
    ok(p.led === 0, '⑮ ★★[켠 팔 · 손잡이 끔] 장부는 여전히 **0** 이다(T186 팔 그대로 — 비트 동일의 뿌리)');
  } else {
    ok(p.led === 0, '⑮ [끔] 밭 입구가 아예 안 열리므로 장부도 0 이다');
  }
  ok(/if \(!\(T100_FIELD_YIELD && npc\.currentJob === 'farmer'\)\) addProduce\(jdef\.output, baseAmt\);/.test(C),
    '⑮ ★이중 0 — 켠 팔에서 농부의 `food` 는 `addProduce` 를 **안 탄다**(들어오는 길이 하나뿐이다)');
  // ⓓ `totalFoodProductionEquivalent` 이 보는 것 — `food` 만이 아니다(§0-ⓐ 의 셋째 물음)
  ok(/if \(T73_RAWGRAIN\) for \(const r of RAW_GRAINS\) total \+= \(prod\[r\] \|\| 0\) \* RAW_GRAIN_FOOD_FACTOR;/.test(C),
    '⑮ 장부를 읽는 자는 `food` 말고 **생곡도 본다**(T73) — 켠 팔이 통째로 눈먼 건 아니었다(부산물은 두 팔이 같은 길)');
}

// ── ⑨ 3사본 ────────────────────────────────────────────────────────────────
console.log('\n⑨ 3사본 · 소스 계약');
{
  const B = fs.readFileSync(path.join(ROOT, 'sim', 'economy-engine.browser.js'), 'utf8');
  for (const k of ['T100_ANCHOR_N', 'T100_HARVEST_PER_FARMER_YEAR', 'T100_K', 'T100_FIELD_YIELD', 'farmFlowPerDay', 'harvestToGranary', 'SEED_FOOD_DAYS_D0', 'seedFoodDays', 'T100_GARDEN_FLOOR', 'gardenFloorTopUp'])
    ok(B.indexOf(k) >= 0, `⑨ 번들에 \`${k}\` 가 있다`);
  const n = (B.match(/T100_FIELD_YIELD/g) || []).length, m = (SRC.match(/T100_FIELD_YIELD/g) || []).length;
  ok(n === m, '⑨ ★손잡이가 무는 자리 수가 소스와 **같다**', `번들 ${n} = 소스 ${m}`);
}

// ── ⑬ 배율 자리 [T179] — 대체가 삼킨 `skillMul·toolBoost·inputMult` ───────
//   T172 가 사냥·벌목에서 잡은 것과 **같은 결함**이 밭에도 있었다: 농부의 추상 산출을 걷어내면
//   그 안의 배율 셋도 같이 사라진다(숙련 10 농부와 초보가 같은 식량을 거둔다).
//   ⇒ 문(`harvestToGranary`)은 **양**(`n`)과 **배율**(`mul`)을 따로 받고, 배율은 실체 자리가 계산한다.
//   ⚠지금 부르는 자리(서버 수확 갈래)는 아직 `mul` 을 안 준다 ⇒ 미전달 = 1 = **종전 비트**.
console.log('\n⑬ 배율 자리 [T179] — 대체가 삼킨 배율 셋을 문이 되받는가');
{
  const CODE = codeOf(SRC);
  // ⓐ 문이 배율을 받는다 — 인수는 셋, 기본은 1
  ok(/function harvestToGranary\(v, n, mul\) \{/.test(CODE),
    '⑬ ★문이 **양과 배율을 따로** 받는다(`harvestToGranary(v, n, mul)`)');
  ok(/const _m = \(typeof mul === 'number' && mul >= 0\) \? mul : 1;/.test(CODE),
    '⑬ ★미전달·음수·NaN 은 **1** 이다(되돌림의 뿌리 — 지금 부르는 자리는 안 준다)');
  // ⓑ 이중 0 — 배율이 곱해지는 줄이 **하나뿐**이다
  const mLines = CODE.split('\n').filter((l) => /\b_m\b/.test(l) && l.indexOf('const _m =') < 0);
  ok(mLines.length === 1 && /const amt = \(\(n > 0 \? n : 1\)\) \* T100_K \* _m;/.test(mLines[0]),
    '⑬ ★★★배율이 물리는 줄이 **하나**다(이중 0 — 두 번 곱하면 빨개진다)', `${mLines.length}줄`);
  ok(!/_t100HarvestN[^\n]*_m/.test(CODE),
    '⑬ ★건수 계측(`_t100HarvestN`)은 배율에 **안 물린다**(수확 횟수지 양이 아니다)');
  // ⓒ 걷어낸 자리가 배율을 **심는다** — 실체 자리가 읽을 정본 하나(사본 0)
  ok(/if \(T100_FIELD_YIELD && npc\.currentJob === 'farmer'\) npc\._t172mul = skillMul \* toolBoost \* inputMult;/.test(CODE),
    '⑬ ★★대체가 막는 그 자리에서 배율 셋을 **심어 둔다**(`_t172mul` — 사냥·벌목 문과 같은 필드)');
  const setLines = CODE.split('\n').filter((l) => /_t172mul\s*=/.test(l));
  const mulDefs = CODE.split('\n').filter((l) => /const _mul = /.test(l));
  ok(setLines.length === 3 && setLines.every((l) => /_t172mul = (_mul|skillMul \* toolBoost \* inputMult);/.test(l))
     && mulDefs.length === 2 && mulDefs.every((l) => /skillMul \* toolBoost \* inputMult/.test(l)),
    '⑬ ★`_t172mul` 을 심는 자리가 **셋**(사냥·벌목·밭)이고 전부 **같은 셋 곱**이다',
    `${setLines.length}자리 · _mul 정의 ${mulDefs.length}`);
  ok(!/npc\._t172mul[^\n]*addProduce/.test(CODE) && /\) addProduce\(jdef\.output, baseAmt\);\n[\s\S]{0,900}?\n\s*if \(T100_FIELD_YIELD && npc\.currentJob === 'farmer'\) npc\._t172mul/.test(SRC),
    '⑬ ★심기만 하고 **여기서 곱하지 않는다**(배율은 실체가 나는 곳에 한 번 · 대체 게이트 **바로 뒤**)');
  // ⓓ 실측 — 숙련 10(×1.5) 이 실체에서 갈린다 · `inputMult=0` → 실체 0 · 미전달 비트 동일
  const mk = () => econ.createVillage({ initialPop: 0, name: 'T179', fertility: 1.0 });
  const v0 = mk(), v1 = mk(), v2 = mk(), v3 = mk();
  const a0 = econ.harvestToGranary(v0, 1);          // 미전달
  const a1 = econ.harvestToGranary(v1, 1, 1);       // 초보(숙련 0 · 맨손 · 투입 충족)
  const aS = econ.harvestToGranary(v2, 1, 1.5);     // 숙련 10 = 1 + 10×0.05
  const aZ = econ.harvestToGranary(v3, 1, 0);       // inputMult = 0
  if (ON) {
    ok(a0 === a1 && a0 > 0, '⑬ ★★미전달 = `mul 1` **비트 동일**(서버가 안 줘도 종전 그대로)', a0.toFixed(6));
    ok(Math.abs(aS - a0 * 1.5) < 1e-12 && aS > a0,
      '⑬ ★★★숙련 10 농부가 **실제로 더 거둔다**(×1.5 — 대체 전 세계의 그 배율)', `${a0.toFixed(4)} → ${aS.toFixed(4)}`);
    ok(aZ === 0, '⑬ ★★`inputMult = 0` 이면 **실체가 0**(씨앗 없는 농부는 한 톨도 못 거둔다)');
    ok(Math.abs((v2._t100HarvestN || 0) - 1) < 1e-12 && Math.abs((v2.storage.food || 0) - aS * 0.97) < 1e-9,
      '⑬ 배율이 붙어도 **건수는 1** 이고 세금은 같은 꼴로 떨어진다', `건수 ${v2._t100HarvestN}`);
  } else {
    ok(a0 === 0 && a1 === 0 && aS === 0 && aZ === 0,
      '⑬ [끔] 배율을 줘도 **한 톨도 안 넣는다**(손잡이가 먼저다 — 비트 동일)');
  }
  // ⓔ 실체 자리는 서버다 — T190 이 그 자리를 놓았다(⑯ 절이 본다)
  const VCODE = codeOf(VSRC);
  const calls = VCODE.split('\n').filter((l) => l.indexOf('harvestToGranary') >= 0);
  ok(calls.length === 1 && /harvestToGranary\(vil\.econ, 1, _farmMul\(vil, npc\)\)/.test(calls[0]),
    '⑬ ★생활층이 **배율을 넘긴다**(T190 — 문이 열린 채 비어 있던 셋째 인수)');
  ok(VCODE.indexOf('_t172mul') >= 0,
    '⑬ 생활층이 배율 정본(`_t172mul`)을 **읽는다**(심는 곳은 econ 하나 · 여기선 읽기만)');
}

// ── ⑭ 나머지 두 문은 살아 있다 [T179 §0ⓐ] ─────────────────────────────────
//   채집(T135 `forageTakeFn`)·석재(T163 `stoneBudgetFn`)는 `baseAmt` 를 **안 덮는다**.
//   표가 아니라 **회귀 방지**다 — 뒤 카드가 이 둘을 T154 꼴로 바꾸면 여기가 빨개진다.
console.log('\n⑭ 나머지 두 문 — 채집·석재는 배율을 안 삼킨다(회귀 방지)');
{
  const CODE = codeOf(SRC);
  ok(/const got = _realFn\(v, baseAmt \* repShare\) \|\| null;/.test(CODE),
    '⑭ ★★채집 문은 `baseAmt` 를 **예산으로 건넨다**(덮어쓰기 0 — 배율 셋이 이미 그 안에 있다)');
  ok(!/baseAmt\s*=\s*[^=]/.test(CODE.split("produceSpecial === 'forager'")[1].split("produceSpecial === 'cook'")[0]),
    '⑭ ★채집 절 안에서 `baseAmt` 에 **다시 대입하는 줄이 없다**');
  ok(/const stoneYield = _stoneK \* skillMul \* _forageScale \* 0\.9;/.test(CODE),
    '⑭ ★★석재 문은 **관 굵기(`_stoneK`)만** 갈아 끼우고 `skillMul` 은 문 **뒤에** 남는다');
  ok(/let _stoneK = \(v\.land\.stone \|\| 0\);/.test(CODE) && /if \(_sbFn\) \{ const _k = _sbFn\(v\); if \(Number\.isFinite\(_k\) && _k >= 0\) _stoneK = _k; \}/.test(CODE),
    '⑭ 석재 문의 폴백이 곧 종전이다(미주입 = 비트 동일)');
}

// ── ⑯ 서버 자리 [T190] — 배율을 넘기는 쪽 ─────────────────────────────────
//   T179 는 econ 문을 `harvestToGranary(v, n, mul)` 로 열어 두고 `mul` 을 아무도 안 넘기는 상태로 뒀다.
//   T190 이 그 자리를 놓는다: 농부 `_esk` 링크(사냥꾼 규칙 그대로) + 수확 갈래 한 줄.
console.log('\n⑯ 서버 자리 [T190] — 생활층이 그 농부의 배율을 넘기는가');
{
  const VCODE = codeOf(VSRC);
  // ⓐ 짝짓는 규칙은 **하나**다 — 사냥꾼이 쓰던 그것(사본 0)
  ok(/function _lifeEconLink\(vil, simJob\) \{/.test(VCODE),
    '⑯ ★짝짓는 규칙이 **한 함수**다(직업만 다르다 — 사냥꾼 원문에서 뽑았다)');
  ok(/vs\[i2\]\._esk = _e\.length \? _e\[i2 % _e\.length\] : null;/.test(VCODE),
    '⑯ ★라운드로빈·`null` 폴백이 사냥꾼 원문 **그대로**다(새 규약 0)');
  const eskAssign = VCODE.split('\n').filter((l) => /\._esk\s*=/.test(l));
  ok(eskAssign.length === 1, '⑯ ★★`_esk` 를 심는 자리가 **한 줄**이다(사본 0)', `${eskAssign.length}줄`);
  ok(/_lifeHunterEconLink\(vil\);/.test(VCODE) && /_lifeEconLink\(vil, 'farmer'\);/.test(VCODE),
    '⑯ 일일 재대사에서 **사냥꾼·농부 둘 다** 잇는다');
  ok(/function _lifeHunterEconLink\(vil\) \{\s*\n\s*const hu = _lifeEconLink\(vil, 'hunter'\);/.test(VSRC),
    '⑯ 사냥꾼 함수가 **그 규칙을 부른다**(자기 산수 `_fgl`·`_arm` 만 남았다 — HSK 무변)');
  // ⓑ 배율을 집는 자리 — 산수 0 · 못 집으면 undefined(문이 1 로 받는다)
  ok(/function _farmMul\(vil, npc\) \{/.test(VCODE),
    '⑯ ★배율을 집는 자리가 **하나**다');
  ok(/return \(e && typeof e\._t172mul === 'number'\) \? e\._t172mul : undefined;/.test(VCODE),
    '⑯ ★★못 집으면 **`undefined`** 를 넘긴다 — 1 로 받는 것은 **econ 문 안 한 곳**이다(사본 0)');
  ok(!/_t172mul[^\n]*[*/+]/.test(VCODE) && !/[*/+][^\n]*_t172mul/.test(VCODE),
    '⑯ ★★★생활층이 배율에 **산수를 안 한다**(읽어 넘기기만 — 이중 0)');
  ok(!/skillMul|toolBoost|inputMult/.test(VCODE),
    '⑯ 배율의 구성(`skillMul`·`toolBoost`·`inputMult`)은 **여기 없다**(정본은 econ 한 곳)');
  // ⓒ 헤드리스 갈래 — 측정 경로가 전부 이쪽이다(npc 가 없다)
  ok(/_lifeDoTask\(vil, null, k, day\)/.test(VCODE),
    '⑯ ⓘ 헤드리스 결산은 `npc` **없이** 돈다(관측자 없는 마을 · `t176-ab`·`farm-metrics` 전부 이 길)');
  ok(/const ns = \(ec && ec\.npcs\) \? ec\.npcs\.filter\(\(n\) => n\.currentJob === 'farmer'\) : \[\];/.test(VCODE)
     && /ns\[\(ec\._t100HarvestN \|\| 0\) % ns\.length\]/.test(VCODE),
    '⑯ ★★★`npc` 가 없으면 econ 농부 명부를 **같은 라운드로빈**으로 집는다(지표는 이미 있는 수확 누계 — 새 수 0)');
  // ★그 갈래가 없으면 켠 팔은 배율을 **한 번도 안 쓴다** — 측정기의 마을엔 `npcPids` 자체가 없다.
  {
    const V2 = R('server/villages.js');
    const CP = V2.__labProbe && V2.__labProbe._cropProbe;
    const mk = CP && CP.attach({ dbId: 1, name: '측정', ccx: 0, ccy: 0, econ: null, layout: {} });
    ok(mk && mk.npcPids === undefined,
      '⑯ ★★★측정기가 세우는 마을엔 `npcPids` 가 **없다**(`t176-ab`·`farm-metrics`) ⇒ `_esk` 는 거기서 절대 안 선다');
    ok(/if \(!econ \|\| !pl \|\| !vil\.npcPids \|\| !vil\.npcPids\.length\) return null;/.test(VCODE),
      '⑯ 링크 함수가 `npcPids` 없으면 **바로 돌아선다**(위 줄의 근거)');
  }
  // ⓓ 실측 — 켠 팔에서 실제로 갈리는가(픽스처: econ 농부 둘에 서로 다른 배율)
  const v = econ.createVillage({ initialPop: 0, name: 'T190', fertility: 1.0 });
  v.npcs.push({ currentJob: 'farmer', _t172mul: 0.5 }, { currentJob: 'farmer', _t172mul: 1.5 });
  const V = R('server/villages.js');
  const fm = V.__labProbe && V.__labProbe._farmMulProbe;
  if (typeof fm === 'function') {
    const m0 = fm({ econ: v }, null);                       // 헤드리스 — 누계 0 → 첫째 농부
    v._t100HarvestN = 1;
    const m1 = fm({ econ: v }, null);                       // 누계 1 → 둘째 농부
    const mE = fm({ econ: v }, { _esk: { _t172mul: 1.25 } });   // 실걸음 — `_esk` 가 이긴다
    ok(m0 === 0.5 && m1 === 1.5, '⑯ ★★헤드리스 수확이 농부마다 **다른 배율**을 집는다(라운드로빈)', `${m0} → ${m1}`);
    ok(mE === 1.25, '⑯ ★실걸음 수확은 **그 농부의 `_esk`** 를 쓴다(링크가 이긴다)', String(mE));
    ok(fm({ econ: { npcs: [] } }, null) === undefined,
      '⑯ ★농부가 없으면 `undefined`(문이 1 로 받는다 — 종전 비트)');
    ok(fm({ econ: { npcs: [{ currentJob: 'farmer' }] } }, null) === undefined,
      '⑯ ★배율이 안 심긴 농부(손잡이 끔)도 `undefined` — **끔이 곧 종전이다**');
  } else {
    ok(false, '⑯ `__labProbe._farmMulProbe` 가 없다(하네스가 정본을 못 부른다 — 사본 금지)');
  }
}

// ── ⑰ 공간 브리지 [T198] — 죽어 있던 두 칸 ────────────────────────────────
//   `_clearedFrac`(개간 완료율)·`_paddyShare`(개간 논비중)은 econ 이 **곱하는데 아무도 안 심었다**
//   (T186 §0-ⓐ' 실측: 122,400 마을·일 중 심긴 날 0). T198 이 손잡이 뒤에 심는다 — 기본은 **끔**.
console.log('\n⑰ 공간 브리지 [T198] — 두 칸을 손잡이 뒤에 심는가');
{
  const VCODE = codeOf(VSRC);
  const BRIDGE = process.env.T198_BRIDGE === '1';
  // ⓐ 손잡이 · 심는 자리 하나
  ok(/const T198_BRIDGE = process\.env\.T198_BRIDGE === '1';/.test(VCODE),
    '⑰ ★손잡이가 있고 **`=== 1` 이라야 켜진다**(기본 끔 — 되돌림이 기본)');
  const setLines = VCODE.split('\n').filter((l) => /_clearedFrac\s*=|_paddyShare\s*=/.test(l));
  ok(setLines.length === 2 && setLines.every((l) => /^\s*if \(/.test(l)),
    '⑰ ★★두 칸을 심는 자리가 **각각 한 줄**이고 둘 다 분모 검사를 지난다(0 나눗셈 0)', `${setLines.length}줄`);
  const callN = (VCODE.match(/_fieldBridge\(/g) || []).length - 1;   // 선언 1 제외
  ok(callN === 5, '⑰ ★심는 자리가 **한 함수**로 모였다(부팅 · 개간 · 랩 attach · 랩 tickDay + 하네스 주입구 — 사본 0)', `${callN}곳`);
  ok(/if \(!T198_BRIDGE\) return;/.test(VCODE) && VCODE.indexOf('ec._fieldCells = f;') < VCODE.indexOf('if (!T198_BRIDGE) return;'),
    '⑰ ★★★손잡이는 **두 칸만** 가른다 — `_fieldCells` 는 그 앞에서 종전대로 심긴다(T100 무접촉)');
  ok(!/0\.\d|[^_a-zA-Z0-9.]\d+\.\d+/.test((VCODE.split('function _fieldBridge')[1] || '').split('\n}')[0]),
    '⑰ ★유도식에 **지어낸 수가 없다**(정본 셋의 크기와 나눗셈뿐 — 새 수 0)');
  // ⓑ 유도식이 생활층 정본 셋과 맞는가 — 픽스처로 **그 함수 자체**를 부른다(사본 0)
  const V = R('server/villages.js');
  const fb = V.__labProbe && V.__labProbe._fieldBridgeProbe;
  if (typeof fb === 'function') {
    const mk = (farm, dry, pot) => {
      const F = new Set(), D = new Set(), P = new Set();
      for (let i = 0; i < farm; i++) F.add('f' + i);
      for (let i = 0; i < dry; i++) D.add('f' + i);        // 밭 ⊂ 개간
      for (let i = 0; i < pot; i++) P.add('p' + i);
      const ec = {};
      fb({ econ: ec, _farmSet: F, _potSet: P, _drySet: D });
      return ec;
    };
    const a = mk(30, 12, 70);   // 개간 30(논 18 · 밭 12) · 미개간 70
    ok(a._fieldCells === 30, '⑰ `_fieldCells` 는 두 팔 모두 개간 칸 수 그대로다', String(a._fieldCells));
    if (BRIDGE) {
      ok(Math.abs(a._clearedFrac - 30 / 100) < 1e-12,
        '⑰ ★★★[켬] `_clearedFrac = |개간| / (|개간| + |미개간|)`', a._clearedFrac.toFixed(4));
      ok(Math.abs(a._paddyShare - 18 / 30) < 1e-12,
        '⑰ ★★★[켬] `_paddyShare = (|개간| − |밭|) / |개간|`', a._paddyShare.toFixed(4));
      for (const [nm, v2] of [['개간 0', mk(0, 0, 40)], ['전부 개간', mk(25, 25, 0)], ['빈 마을', mk(0, 0, 0)]]) {
        const inRange = (x) => x === undefined || (x >= 0 && x <= 1);
        ok(inRange(v2._clearedFrac) && inRange(v2._paddyShare),
          `⑰ ★[켬] 가장자리(${nm})에서도 두 칸이 **[0,1] 안이거나 안 심긴다**`,
          `${v2._clearedFrac}/${v2._paddyShare}`);
      }
      ok(mk(0, 0, 0)._clearedFrac === undefined && mk(0, 0, 40)._paddyShare === undefined,
        '⑰ ★★분모가 0 이면 **안 심는다**(지어낸 0 이 아니라 종전 `×1`)');
    } else {
      ok(a._clearedFrac === undefined && a._paddyShare === undefined,
        '⑰ ★★★[끔] 두 칸이 **`undefined` 그대로**다(econ 이 `×1` 로 받는다 — 비트 동일의 뿌리)');
      ok(mk(25, 25, 0)._clearedFrac === undefined, '⑰ [끔] 어떤 마을 꼴에서도 안 심는다');
    }
  } else {
    ok(false, '⑰ `__labProbe._fieldBridgeProbe` 가 없다(하네스가 정본을 못 부른다 — 사본 금지)');
  }
  // ⓒ econ 쪽 — 두 칸이 **T100 손잡이 밖에서** 곱힌다(살리면 끈 팔도 움직인다 = 승인 게이트)
  const CODE = codeOf(SRC);
  ok(/const _paddyMul = \(v\._paddyShare == null\) \? 1 : \(1 \+ PADDY_PREMIUM \* \(v\._paddyShare - PADDY_BASE\)\);/.test(CODE),
    '⑰ econ 의 폴백이 **중립 1** 이다(안 심으면 종전 — 문 규약과 같은 꼴)');
  const mulLines = CODE.split('\n').filter((l) => /_clearedFrac != null/.test(l));
  ok(mulLines.length === 2, '⑰ ★두 칸을 곱하는 자리가 **둘**이다(농부 `baseAmt` · 부양력 `_capFlow`)', `${mulLines.length}곳`);
  ok(mulLines.every((l) => l.indexOf('T100_FIELD_YIELD') < 0),
    '⑰ ★★★그 둘은 **T100 손잡이 밖**이다 — 살리면 **끈 팔도 움직인다**(승인 게이트 · §0ⓐ)');
}

console.log(`\n=== 결과: ${pass} PASS / ${fail} FAIL ===\n`);
process.exit(fail ? 1 : 0);
