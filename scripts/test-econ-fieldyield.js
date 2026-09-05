#!/usr/bin/env node
// @regress   ← 통합 러너가 이 표를 보고 자기 목록을 만든다(scripts/run-regress.sh · 표 없으면 안 돈다)
// === scripts/test-econ-fieldyield.js — NPC 농사의 식량이 밭에서 나온다 (ECON 수술 2-b) ===
//
// ★왜 [재민 지시 T100 · 2026-09-05]
//   T58b ⓖ 가 못 박은 것: 서버 NPC 농사는 **곳간에 아무것도 안 넣고**(`villages.js` — "회계는 econ
//   소유 · 물리 층은 수확한 칸 수만"), econ 의 농부 산출은 **밭과 무관한** `1.5 × 지력`이었다.
//   밭을 아무리 갈아도 곳간은 그대로였다. 이 카드가 그 밑변을 밭으로 옮긴다.
//
// ★★이 하네스가 지키는 것
//   ① 앵커      : kg·kcal·econ 단위가 **한 줄에서 만난다**(T59 세 자) — 상수를 손으로 못 고친다
//   ② 텃밭 하한 : 밭 0칸이어도 산출이 0 이 아니다 · 값이 생활층 `LIFE_CLEAR_PDAY` 와 **같다**
//   ③ 밑변      : 밭 칸이 2배면 산출도 2배(켬) · 끄면 밭을 **안 본다**
//   ④ 무접촉    : 어부·사냥꾼·채집 산출은 켜고 꺼도 **한 비트도** 안 움직인다
//   ⑤ 되돌림    : `T100_FIELD_YIELD=0`(=미설정) 세계가 **비트 동일** · 켠 세계는 실제로 다르다
//   ⑥ 이중계상 0: 생활 층은 여전히 `storage` 를 안 만진다 — 브리지는 **읽기 전용**
//   ⑦ 돌연변이  : 하한을 0 으로 만들면 ②가, 생활층에 곳간 가산 한 줄을 넣으면 ⑥이 빨개진다
//   ⑧ 추출 무변 : 개간 정본은 하나다(`_lifeClearDay`) — 랩도 라이브도 **그 함수**를 부른다
//   ⑨ 3사본     : 번들이 소스와 같은 표·같은 손잡이를 갖는다
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

const econ = R('sim/economy-sim');
const econV2 = R('sim/economy-sim-v2');
const SRC = fs.readFileSync(path.join(ROOT, 'sim', 'economy-sim.js'), 'utf8');
const VSRC = fs.readFileSync(path.join(ROOT, 'server', 'villages.js'), 'utf8');
const ON = process.env.T100_FIELD_YIELD === '1';
const GARDEN = process.env.T100_MUT_GARDEN === '1' ? 0 : econ.T100_GARDEN_PER_FARMER;   // ⑦ 돌연변이 손잡이(하네스 전용)

console.log('\n=== NPC 농사의 식량이 밭에서 나온다 (ECON 수술 2-b) ===');
console.log(`  손잡이: T100_FIELD_YIELD=${ON ? '켬' : '끔'}`);

// 밭 칸을 손으로 꽂은 픽스처(생활층 브리지가 하는 일 그대로 — 회계는 안 건드린다)
function vil(cells, farmers, fert) {
  const v = econ.createVillage({ initialPop: 0, name: '픽스처', fertility: fert });
  v.land.fertility = fert;
  v._fieldCells = cells;
  v.counts = Object.assign({}, v.counts, { farmer: farmers });
  return v;
}

// ── ① 앵커 — kg·kcal·econ 단위가 한 줄에서 만난다 ──────────────────────────
console.log('\n① 앵커 — 이 숫자는 유도된 것이지 고른 것이 아니다');
{
  const CR = R('server/crops.js'), KC = R('server/kcal.js'), W = R('server/weights.js');
  const GKG = CR.GROUP_KG, DAYK = KC.DAY_KCAL;
  ok(Math.abs(W.kgOf('food') * KC.KCAL_PER_KG.food - DAYK) < 1e-9,
    '① ★★food 1단위 = kgOf(food) × KCAL_PER_KG.food = DAY_KCAL (T59/T73/T86 사슬)',
    `${W.kgOf('food')}kg × ${KC.KCAL_PER_KG.food} = ${W.kgOf('food') * KC.KCAL_PER_KG.food} = ${DAYK}`);
  const grains = Object.values(CR.CROPS).filter(c => c.group === '곡물' && (GKG[c.group] || 0) > 0 && (c.kcal || 0) > 0);
  pre(grains.length >= 5, '곡물 표가 실제로 여러 종이다(자명 통과 금지)', grains.length + '종');
  const perDay = (c) => ((c.yield || 0) * GKG[c.group] * c.kcal / DAYK) / Math.max(1, c.growDays || 1);
  const derived = grains.reduce((a, c) => a + perDay(c), 0) / grains.length;
  ok(Math.abs(derived - econ.CELL_FOOD_PER_DAY) < 5e-5,
    '① ★★★`CELL_FOOD_PER_DAY` 를 `crops.js`+`kcal.js` 에서 **다시 유도해도 같다**(사본 금지)',
    `유도 ${derived.toFixed(6)} = 상수 ${econ.CELL_FOOD_PER_DAY}`);
  ok(!/yield.*\*\s*0\.7\b/.test(SRC.split('CELL_FOOD_PER_DAY')[0].slice(-4000)),
    '① econ 이 `crops.js` 의 kg 표를 **옮겨 적지 않았다**(앵커는 주석의 유도 한 줄뿐)');
}

// ── ② 텃밭 하한 ────────────────────────────────────────────────────────────
console.log('\n② 텃밭 하한 — 밭 0칸이어도 굶기지 않는다');
{
  const V = R('server/villages.js');
  ok(econ.T100_GARDEN_PER_FARMER === V.__labProbe._clearProbe.LIFE_CLEAR_PDAY,
    '② ★★하한 값이 생활층 정본 `LIFE_CLEAR_PDAY` 와 **같다**(두 곳이 갈리면 여기가 빨개진다)',
    `econ ${econ.T100_GARDEN_PER_FARMER} = 생활층 ${V.__labProbe._clearProbe.LIFE_CLEAR_PDAY}`);
  const v0 = vil(0, 10, 1.0);
  const flow0 = econ.farmFlowPerDay(v0, 10);
  if (ON) {
    ok(flow0 > 0, '② ★★밭 0칸 마을의 농사 산출이 **0 이 아니다**(소멸 조건)', `${flow0.toFixed(3)} 단위/일`);
    ok(Math.abs(flow0 - 10 * GARDEN * econ.CELL_FOOD_PER_DAY * 1.0) < 1e-9,
      '② 하한 = 농부수 × 하한칸 × 칸·일당 × 지력', `${flow0.toFixed(4)}`);
    const vLow = vil(5, 10, 1.0);     // 5칸 < 하한 30칸 → 하한이 이긴다
    ok(Math.abs(econ.farmFlowPerDay(vLow, 10) - flow0) < 1e-9,
      '② 밭이 하한보다 좁으면 **하한이 밑변**이다', `5칸 → ${econ.farmFlowPerDay(vLow, 10).toFixed(4)}`);
  } else {
    ok(Math.abs(flow0 - 10 * econ.FARMER_BASE * 1.0) < 1e-9, '② [끔] 하한이 안 낀다 — 옛 식 그대로', flow0.toFixed(3));
  }
}

// ── ③ 밑변이 밭인가 ────────────────────────────────────────────────────────
console.log('\n③ 밑변 — 밭 칸이 늘면 산출이 는다');
{
  const a = vil(400, 10, 1.0), b = vil(800, 10, 1.0);
  const fa = econ.farmFlowPerDay(a, 10), fb = econ.farmFlowPerDay(b, 10);
  pre(400 > 10 * econ.T100_GARDEN_PER_FARMER, '고른 밭 칸이 하한보다 넓다(하한이 가려 자명 통과하지 않게)', '400칸 > 하한 30칸');
  if (ON) {
    ok(Math.abs(fb - 2 * fa) < 1e-9, '③ ★★★밭 칸 2배 = 산출 2배(**면적이 밑변이다**)', `${fa.toFixed(2)} → ${fb.toFixed(2)}`);
    ok(Math.abs(fa - 400 * econ.CELL_FOOD_PER_DAY * 1.0) < 1e-9,
      '③ 산출 = 칸 × 칸·일당 × 지력 (자리=면적 · 산출=지력 이중산입 분리 규약)', fa.toFixed(3));
    const c = vil(400, 10, 0.5);
    ok(Math.abs(econ.farmFlowPerDay(c, 10) - fa / 2) < 1e-9, '③ 지력이 반이면 산출도 반(지력은 여전히 산다)');
    ok(Math.abs(econ.farmLandBoost(a) * econ.FARMER_BASE * 10 - fa) < 1e-9,
      '③ `landBoost` 는 그 마을 산출의 **1인분**이다(종전 자리에 그대로 꽂힌다)', econ.farmLandBoost(a).toFixed(4));
  } else {
    ok(Math.abs(fa - fb) < 1e-9, '③ [끔] 밭 칸을 **안 본다** — 2배로 해도 같다', `${fa.toFixed(2)} = ${fb.toFixed(2)}`);
    ok(Math.abs(econ.farmLandBoost(a) - a.land.fertility) < 1e-12,
      '③ ★★[끔] `farmLandBoost` 가 `v.land.fertility` **그 자체**다(비트 동일의 뿌리)');
  }
}

// ── ④ 어부·사냥꾼·채집 무접촉 ──────────────────────────────────────────────
console.log('\n④ 무접촉 — 어부·사냥꾼·채집 산출은 안 건드렸다');
{
  ok(econ.FARMER_BASE === 1.5, '④ `FARMER_BASE` 가 노출돼 있다(계측기가 1.5 를 옮겨 적지 않는다)', String(econ.FARMER_BASE));
  ok(/landBoost: \(v\) => v\.land\.water/.test(SRC), '④ 어부 `landBoost` 가 `v.land.water` 그대로다(소스)');
  ok(/landBoost: \(v\) => v\.land\.game/.test(SRC), '④ 사냥꾼 `landBoost` 가 `v.land.game` 그대로다(소스)');
  const CODE = SRC.replace(/\/\*[\s\S]*?\*\//g, ' ').split('\n').map(l => l.replace(/\/\/.*$/, '')).join('\n');
  const hits = CODE.split('\n').filter(l => l.indexOf('T100_FIELD_YIELD') >= 0).length;
  ok(hits === 3, '④ ★손잡이를 무는 줄이 **셋뿐**이다(선언 1 + `farmFlowPerDay` 1 + `farmLandBoost` 1 — 주석 제외)', `${hits}줄`);
  ok(/farmFlowPerDay\(v, _cf\.farmer \|\| 0\)/.test(SRC), '④ 부양력(prodK)도 **같은 함수**를 본다(K 만 옛 밑변이면 인구가 밭 없이 분다)');
}

// ── ⑤ 되돌림 — 비트 동일 ───────────────────────────────────────────────────
console.log('\n⑤ 되돌림 — 끈 세계가 T86 세계와 비트 동일한가');
if (!process.env.T100_CHILD) {
  const fp = (env) => execFileSync(process.execPath, [__filename, '--fingerprint'],
    { env: Object.assign({}, process.env, env, { T100_CHILD: '1' }), stdio: 'pipe' }).toString().split('\u0001FP:')[1] || 'NONE';
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
  process.stdout.write('\u0001FP:' + w.villages.map(v => `${v.name}:${v.npcs.length}/f${v.storage.food.toFixed(4)}/w${(v.storage.wood || 0).toFixed(4)}`).join(' '));
  process.exit(0);
} else { console.log('  (자식 프로세스 — ⑤ 건너뜀)'); }

// ── ⑥ 이중 계상 0 ──────────────────────────────────────────────────────────
console.log('\n⑥ 이중 계상 0 — 생활 층은 곳간을 안 만진다');
const clearRegion = (src) => {
  const i = src.indexOf('function _lifeClearDay'), j = src.indexOf('function _lifeHeadlessDay');
  const k = src.indexOf('function _lifeLiveFarmTile'), l = src.indexOf('\n}', k);
  return src.slice(i, j) + src.slice(k, l);
};
const bites = (src) => /\.(storage|treasury)\s*(\[|\.)\s*[A-Za-z_'"`]/.test(
  clearRegion(src).replace(/\/\/.*$/gm, ''));
{
  ok(!bites(VSRC), '⑥ ★★★개간·실체화 절에 `storage`/`treasury` 쓰기가 **한 줄도 없다**(회계는 econ 한 곳)');
  ok(/if \(vil\.econ\) vil\.econ\._fieldCells = vil\._farmSet\.size;/.test(VSRC),
    '⑥ 브리지는 **칸 수 한 개**다(`_paddyShare`·`_clearedFrac` 계열 — 장부가 아니다)');
  ok(/_fieldCells \|\| 0/.test(SRC) && !/_fieldCells\s*=/.test(SRC),
    '⑥ ★★econ 은 `_fieldCells` 를 **읽기만** 한다(econ 이 밭을 쓰면 물리와 갈린다)');
}

// ── ⑦ 돌연변이 ─────────────────────────────────────────────────────────────
console.log('\n⑦ ★이 하네스가 실패할 줄 아는가');
if (!process.env.T100_CHILD) {
  const run = (env) => {
    try { execFileSync(process.execPath, [__filename], { env: Object.assign({}, process.env, env, { T100_CHILD: '1' }), stdio: 'pipe' }); return 0; }
    catch (e) { return e.status || 1; }
  };
  ok(run({ T100_FIELD_YIELD: '1', T100_MUT_GARDEN: '1' }) !== 0, '⑦ 텃밭 하한을 0 으로 만들면 **②가 빨개진다**');
  ok(run({ T100_FIELD_YIELD: '1' }) === 0, '⑦ [대조] 멀쩡한 켠 판은 **깨끗이 통과한다**(항상 빨간 감사기가 아니다)');
  const mutated = VSRC.replace('  if (vil.econ) vil.econ._fieldCells = vil._farmSet.size;',
    '  if (vil.econ) { vil.econ._fieldCells = vil._farmSet.size; vil.econ.storage.food += 1; }');
  ok(mutated !== VSRC && bites(mutated),
    '⑦ ★★★생활층에 **곳간 가산 한 줄**을 넣으면 ⑥의 감지기가 **문다**(감지기 자기검사)');
} else { console.log('  (자식 프로세스 — ⑦ 건너뜀)'); }

// ── ⑧ 개간 정본은 하나다 ───────────────────────────────────────────────────
console.log('\n⑧ 개간 정본 — 랩도 라이브도 같은 함수를 부른다');
{
  const V = R('server/villages.js');
  ok(/_lifeClearDay\(vil, farmerN\);/.test(VSRC), '⑧ `_lifeHeadlessDay` 가 추출한 정본을 부른다(사본 아님)');
  ok((VSRC.match(/function _lifeClearDay/g) || []).length === 1, '⑧ 개간 함수가 **하나**다');
  ok(typeof V.__labProbe._clearProbe.day === 'function' && /day: \(vil, farmerN\) => _lifeClearDay\(vil, farmerN\)/.test(VSRC),
    '⑧ ★★랩 주입구가 **그 함수 자체**를 내준다(하네스가 크루 상한·프론티어를 다시 적지 않는다)');
  ok(!/LIFE_CREW|LIFE_CLEAR_PDAY/.test(fs.readFileSync(path.join(ROOT, 'scripts', 't100-fieldbase.js'), 'utf8')
      .replace(/\/\/.*$/gm, '').replace(/CP\.LIFE_CLEAR_PDAY/g, '')),
    '⑧ 계측기가 크루 상한·개간 속도를 **옮겨 적지 않았다**');
}

// ── ⑨ 3사본 ────────────────────────────────────────────────────────────────
console.log('\n⑨ 3사본 · 소스 계약');
{
  const B = fs.readFileSync(path.join(ROOT, 'sim', 'economy-engine.browser.js'), 'utf8');
  for (const k of ['CELL_FOOD_PER_DAY', 'T100_GARDEN_PER_FARMER', 'T100_FIELD_YIELD', 'farmFlowPerDay', 'farmLandBoost'])
    ok(B.indexOf(k) >= 0, `⑨ 번들에 \`${k}\` 가 있다`);
  const n = (B.match(/T100_FIELD_YIELD/g) || []).length, m = (SRC.match(/T100_FIELD_YIELD/g) || []).length;
  ok(n === m, '⑨ ★손잡이가 무는 자리 수가 소스와 **같다**', `번들 ${n} = 소스 ${m}`);
}

console.log(`\n=== 결과: ${pass} PASS / ${fail} FAIL ===\n`);
process.exit(fail ? 1 : 0);
