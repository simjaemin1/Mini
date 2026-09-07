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
  ok(hits === 7, '④ ★손잡이를 무는 줄이 **일곱뿐**이다(선언 1 + `farmFlowPerDay` 1 + `harvestToGranary` 1 + `seedFoodDays` 1 + `gardenFloorTopUp` 1 + 대체 1 + 내보내기 1 — 주석 제외)', `${hits}줄`);
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
  ok(calls.length === 1 && /_lifeEcon\(\)\.harvestToGranary\(vil\.econ, 1\)/.test(calls[0]),
    '⑥ ★그 한 줄이 **econ 입구를 부르기만** 한다(계수·환산·세금은 전부 econ 안 — 사본 0)');
  ok(calls.length === 1 && /if \(did === 'harvest'\)/.test(calls[0]), '⑥ 그 자리가 **수확 갈래**다(파종·김매기가 곳간을 안 만진다)');
  ok(/if \(vil\.econ\) vil\.econ\._fieldCells = vil\._farmSet\.size;/.test(VSRC),
    '⑥ 칸 수 브리지는 그대로다(`_paddyShare`·`_clearedFrac` 계열 — 장부가 아니다)');
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
  const mutated = VSRC.replace('  if (vil.econ) vil.econ._fieldCells = vil._farmSet.size;',
    '  if (vil.econ) { vil.econ._fieldCells = vil._farmSet.size; vil.econ.storage.food += 1; }');
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

// ── ⑨ 3사본 ────────────────────────────────────────────────────────────────
console.log('\n⑨ 3사본 · 소스 계약');
{
  const B = fs.readFileSync(path.join(ROOT, 'sim', 'economy-engine.browser.js'), 'utf8');
  for (const k of ['T100_ANCHOR_N', 'T100_HARVEST_PER_FARMER_YEAR', 'T100_K', 'T100_FIELD_YIELD', 'farmFlowPerDay', 'harvestToGranary', 'SEED_FOOD_DAYS_D0', 'seedFoodDays', 'T100_GARDEN_FLOOR', 'gardenFloorTopUp'])
    ok(B.indexOf(k) >= 0, `⑨ 번들에 \`${k}\` 가 있다`);
  const n = (B.match(/T100_FIELD_YIELD/g) || []).length, m = (SRC.match(/T100_FIELD_YIELD/g) || []).length;
  ok(n === m, '⑨ ★손잡이가 무는 자리 수가 소스와 **같다**', `번들 ${n} = 소스 ${m}`);
}

console.log(`\n=== 결과: ${pass} PASS / ${fail} FAIL ===\n`);
process.exit(fail ? 1 : 0);
