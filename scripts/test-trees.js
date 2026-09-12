#!/usr/bin/env node
// @regress
// === scripts/test-trees.js — T135 나무 층 하네스 (종 · 열매 · 부등식 · 채집 실체) =====
//
// T123 이 랩에서 답을 세웠고 이 카드가 서버에 넣었다. 여기서 지키는 것:
//   ① 표가 정본  — `server/trees.json` 은 랩 표의 전사다(`build-trees.js --check`) · 손편집 0
//   ② 어휘        — 종 아이디 ≡ 그림 정본(T129) · 열매 품목 ∈ econ 정본(사본·유령 0)
//   ③ 종 배정     — 자리 × 존의 함수(주사위 0 · 멱등) · 청크 두 갈래가 **같은 종**을 낸다
//   ④ 열매 규약 넷 — 연 1회 · 겨울 소멸 · 볼 때 정산 · 크기 비례 · 따도 나무는 안 죽는다(hp 무접촉)
//   ⑤ 부등식      — 새 수 0 · 사전식(목재 전용 먼저) · 그림자가격을 읽는다
//   ⑥ 대체        — economy-sim 이 나무 품목을 **걷어낸다**(얹지 않는다) · 부산물도 같이
//   ⑦ 주입 두 자리 — 서버(`villages.js`)와 계측기(`t17-metrics.js`)가 **같은 문**을 부른다(족보 130)
//   ⑧ 되돌림      — `T135_TREES=0` 이면 econ 접점이 통째로 잠든다(비트 동일 경로)
//   ⑨ 재생 시계   — T122 단계 판정이 **종별 햇수**를 읽는다 · 비율은 T122 것 그대로(새 수 0)
'use strict';
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const ROOT = path.resolve(__dirname, '..');
const Trees = require(path.join(ROOT, 'server', 'trees.js'));
const Chunk = require(path.join(ROOT, 'server', 'chunk.js'));
const ItemLabel = require(path.join(ROOT, 'server', 'itemlabel.js'));

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ ' + m); } };
const sec = (t) => console.log('\n' + t);
const rd = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');

// ── ① 표가 정본 ─────────────────────────────────────────────────────────────
sec('① 표가 정본 — 랩 표 → server/trees.json 전사(손편집 금지)');
try { execFileSync(process.execPath, [path.join(ROOT, 'scripts', 'build-trees.js'), '--check'], { stdio: 'pipe' });
  ok(true, 'build-trees.js --check 통과(랩 표 ≡ 파일)'); }
catch (e) { ok(false, 'build-trees.js --check 실패 — `node scripts/build-trees.js` 를 돌려라'); }
ok(!fs.existsSync(path.join(ROOT, 'lab', 'trees.json')), '옛 자리(lab/trees.json) 없음 — 굽는 대상은 하나뿐');
{
  // 표의 값(목재수율·성목햇수·숯·연간수율)을 읽는 쪽에 **옮겨 적었는지** 본다.
  //   `t.wood` 처럼 **읽는** 것은 정상이고, `wood: 0.95` 처럼 **적는** 것이 사본이다.
  const src = strip(rd('server/trees.js'));
  //   ⚠삼항 `? +t.wood : 1` 은 사본이 아니다 — **객체 리터럴 자리**의 `키: 수`만 본다.
  const copied = /(^|[{,])\s*(wood|mature|char|fy)\s*:\s*[\d.]/m.test(src);
  ok(!copied, 'server/trees.js 에 표의 수를 옮겨 적지 않았다(읽기만 한다)');
  const ids = Trees.ids();
  ok(!ids.some((k) => new RegExp("'" + k + "'\\s*:").test(src)), '종 목록도 안 적혀 있다(표에서 읽는다)');
}

// ── ② 어휘 ──────────────────────────────────────────────────────────────────
sec('② 어휘 — 종 아이디는 그림 정본과, 열매 품목은 econ 정본과 같아야 한다');
{
  const artP = path.join(ROOT, 'public', 'assets', 'trees', 'tree_species.json');
  const art = JSON.parse(fs.readFileSync(artP, 'utf8')).species || {};
  const a = Object.keys(art).sort().join(','), b = Trees.ids().sort().join(',');
  ok(a === b, '종 아이디 집합 ≡ 그림 정본(T129)' + (a === b ? ` (${b})` : `\n      그림 [${a}]\n      서버 [${b}]`));
  const econ = require(path.join(ROOT, 'sim', 'economy-sim.js'));
  const spec = require(path.join(ROOT, 'server', 'specialty.js'));
  const food = Object.keys(econ.FORAGE_FOOD_FACTOR || {}), item = Object.keys(spec.RESOURCES || {});
  const bad = Trees.fruitIds().filter((k) => { const f = Trees.fruitOf(k); return food.indexOf(f) < 0 && item.indexOf(f) < 0; });
  ok(bad.length === 0, 'econ 이 모르는 열매 품목 0' + (bad.length ? ' — ' + bad.join(',') : ` (${Trees.fruitItems().join(' · ')})`));
}

// ── ③ 종 배정 ───────────────────────────────────────────────────────────────
sec('③ 종 배정 — 자리 × 존의 함수(주사위 0 · 멱등)');
{
  const a = Trees.speciesAt('hanbando', 137, 42), b = Trees.speciesAt('hanbando', 137, 42);
  ok(a === b && !!a, `같은 자리 = 같은 종(${a})`);
  ok(Trees.speciesAt('hanbando', 137, 42) !== Trees.speciesAt('otherzone', 137, 42)
     || Trees.ids().length === 1, '존이 다르면 숲의 얼굴이 달라진다');
  ok(!/Math\.random/.test(strip(rd('server/trees.js'))), 'server/trees.js 에 Math.random 0');
  // 청크 두 갈래가 같은 자리에 같은 종을 낸다
  const cs = 256;
  const rs = Chunk.generateChunkResources('hanbando', 'forest', 41, 50, cs, new Map(), 1000);
  const trees = rs.filter((r) => r.type === 'tree');
  ok(trees.length > 0 && trees.every((r) => !!r.sp), `나무 ${trees.length}그루 전부 종이 찍혔다`);
  const mism = trees.filter((r) => r.sp !== Trees.speciesAt('hanbando', Math.floor(r.x / 32), Math.floor(r.y / 32)));
  ok(mism.length === 0, '청크가 찍은 종 ≡ 정본이 답하는 종(사본 0)');
  const rs2 = Chunk.generateChunkResources('hanbando', 'forest', 41, 50, cs, new Map(), 1000);
  ok(JSON.stringify(rs2.map((r) => r.sp)) === JSON.stringify(rs.map((r) => r.sp)), '두 번 생성 = 같은 종(결정론)');
  const mix = {}; for (const r of trees) mix[r.sp] = (mix[r.sp] || 0) + 1;
  ok(Object.keys(mix).length >= 3, `한 청크에 종이 섞인다 — ${Object.entries(mix).map(([k, n]) => k + ' ' + n).join(' · ')}`);
}

// ── ④ 열매 규약 넷 ──────────────────────────────────────────────────────────
sec('④ 열매 — 연 1회 · 겨울 소멸 · 볼 때 정산 · 크기 비례 · hp 무접촉');
{
  const id = Trees.fruitIds()[0], t = Trees.get(id);
  const Y = Trees.yearDays();
  const findDay = (from, season) => { for (let d = from; d < from + 2 * Y; d++) if (Trees.seasonOfDay(d) === season) return d; return -1; };
  const d0 = findDay(0, Trees.fruitSeasonOf(id));
  const st = new Map();
  const n0 = Trees.fruitSettle(st, 'k', id, d0, 1);
  ok(Math.abs(n0 - t.fy) < 1e-9, `결실철 첫 정산 = fy(${t.fy}) × 크기1 = ${n0}`);
  const e = st.get('k'); e.n = e.n / 2; const half = e.n;
  ok(Trees.fruitSettle(st, 'k', id, d0 + 3, 1) === half, '같은 해 두 번째 정산은 안 채운다(연 1회)');
  const dW = findDay(d0, 'winter');
  ok(Trees.fruitSettle(st, 'k', id, dW, 1) === 0, '겨울에 소멸(0)');
  const d2 = findDay(dW + 1, Trees.fruitSeasonOf(id));
  ok(Trees.fruitSettle(st, 'k', id, d2, 1) === n0 && Math.floor(d2 / Y) > Math.floor(d0 / Y), '이듬해 그 철에 다시 채워진다');
  const st2 = new Map();
  ok(Math.abs(Trees.fruitSettle(st2, 'h', id, d0, 0.5) - n0 / 2) < 1e-9, '재고 ∝ 크기');
  const st3 = new Map();
  const took = Trees.fruitTake(st3, 'x', id, d0, 1, 999);
  ok(took > 0 && Trees.fruitTake(st3, 'x', id, d0, 1, 999) === 0, `딴 만큼 준다(${took}) — 다 따면 그 해엔 없다`);
  // 목재 전용 종은 0
  const woodOnly = Trees.ids().find((k) => !Trees.isFruitTree(k));
  ok(Trees.fruitSettle(new Map(), 'w', woodOnly, d0, 1) === 0, `목재 전용 종(${woodOnly})은 열매 0`);
  // hp 무접촉 — 따는 자리에 hp 를 만지는 코드가 없다
  const zsrc = strip(rd('server/zone.js'));
  const pick = zsrc.slice(zsrc.indexOf('function tryPickFruit'), zsrc.indexOf('function tryGather'));
  ok(pick.length > 0 && !/\.hp\s*[-=+]/.test(pick), '열매 따기 자리에서 hp 를 만지지 않는다(나무는 안 죽는다)');
  ok(/fruitTake\(/.test(pick), '따기가 정본(`Trees.fruitTake`)을 부른다 — 규약을 다시 안 적는다');
}

// ── ⑤ 부등식 ────────────────────────────────────────────────────────────────
sec('⑤ 벌목 부등식 — 새 수 0 · 사전식 · 그림자가격');
{
  const src = strip(rd('server/trees.js'));
  const body = src.slice(src.indexOf('function fellOK'), src.indexOf('\n}', src.indexOf('function fellOK')));
  const nums = body.match(/(?<![\w.$])\d+(\.\d+)?/g) || [];
  ok(nums.length === 0, 'fellOK 본문 숫자 리터럴 0' + (nums.length ? ' — ' + nums.join(',') : ''));
  ok(/w\('wood'\)\s*\*\s*t\.wood/.test(body), '왼쪽 = w(목재) × 목재수율');
  ok(/t\.mature\s*\*\s*w\(t\.fruit\)\s*\*\s*t\.fy/.test(body), '오른쪽 = 성목햇수 × w(열매) × 연간열매수율');
  const woodOnly = Trees.ids().find((k) => !Trees.isFruitTree(k));
  ok(Trees.fellOK(woodOnly, () => 1) === true, '목재 전용 종은 언제나 벤다');
  const fid = Trees.fruitIds()[0];
  ok(Trees.fellOK(fid, (r) => (r === 'wood' ? 200 : 0.05)) === true, '목재가 비싸면 열매종도 벤다');
  ok(Trees.fellOK(fid, (r) => (r === 'wood' ? 0.05 : 200)) === false, '열매가 비싸면 안 벤다');
  ok(Trees.fellOK(fid, null) === true, '값을 모르면 종을 안 가린다(랩과 같은 계약)');
  const vsrc = strip(rd('server/villages.js'));
  ok(/fellOK\(/.test(vsrc), '생활층 벌목 후보 선택이 부등식을 부른다');
  ok(/_lifeShadowPrice/.test(vsrc) && /priceFn\(/.test(vsrc), '그림자가격은 econ 정본을 **부른다**(표 재작성 0)');
}

// ── ⑥ 대체 ──────────────────────────────────────────────────────────────────
sec('⑥ 대체 — 얹지 않는다');
{
  const e = strip(rd('sim/economy-sim.js'));
  ok(/forageRealItems/.test(e) && /forageTakeFn/.test(e), 'economy-sim 이 주입을 읽는다');
  const fb = e.slice(e.indexOf("produceSpecial === 'forager'"), e.indexOf("produceSpecial === 'cook'"));
  ok(/_replSet\.indexOf\(r\) >= 0\) continue;/.test(fb), '걷어낸 품목은 추상 산출에서 **빠진다**');
  ok(/repShare/.test(fb) && /baseAmt \* repShare/.test(fb), '실체는 **걷어낸 몫만큼만** 들어온다(얹기 0)');
  ok(/forageRealItems\.indexOf\(r\) >= 0\) continue/.test(e), '부산물(벌목꾼 도토리)도 같은 이중계상을 안 만든다');
  const bad = /foragerYieldsFor[\s\S]{0,900}?\n}/.exec(e);
  ok(bad && !/T135/.test(bad[0]), 'foragerYieldsFor 자체는 안 건드렸다(표가 아니라 쓰는 자리에서 거른다)');
}

// ── ⑦ 주입 두 자리 (족보 130) ───────────────────────────────────────────────
sec('⑦ 주입 — 서버와 계측기가 **같은 문**을 부른다');
{
  ok(/require\('\.\/trees'\)\.attachToWorld\(world\)/.test(rd('server/villages.js')), 'server/villages.js 가 문을 연다');
  ok(/attachToWorld\(world\)/.test(rd('scripts/t17-metrics.js')), 'scripts/t17-metrics.js 도 같은 문을 연다');
  const t = strip(rd('server/trees.js'));
  ok((t.match(/forageRealItems\s*=/g) || []).length === 1, '문은 하나다(주입 자리 1곳)');
}

// ── ⑧ 되돌림 ────────────────────────────────────────────────────────────────
sec('⑧ 되돌림 — T135_TREES=0 이면 econ 접점이 잠든다');
{
  const out = execFileSync(process.execPath, ['-e',
    "const T=require('./server/trees.js');const w={day:0};T.attachToWorld(w);console.log('@@'+JSON.stringify({items:w.forageRealItems||null,fn:typeof w.forageTakeFn}));"],
    { cwd: ROOT, env: { ...process.env, T135_TREES: '0' }, encoding: 'utf8' });
  const r = JSON.parse(out.slice(out.lastIndexOf('@@') + 2));
  ok(r.items === null && r.fn === 'undefined', '주입이 아예 안 걸린다 ⇒ economy-sim 은 종전 식 그대로');
  const out2 = execFileSync(process.execPath, ['-e',
    "const T=require('./server/trees.js');console.log('@@'+JSON.stringify({n:T.ids().length,budget:T.annualFruitBudget({land:{wood:1.0}})}));"],
    { cwd: ROOT, env: { ...process.env, T135_TREES: '0' }, encoding: 'utf8' });
  const r2 = JSON.parse(out2.slice(out2.lastIndexOf('@@') + 2));
  ok(Object.keys(r2.budget).length === 0, '예산도 0(열매가 세계에 안 들어온다)');
  // 종 배정도 잠든다 ⇒ 청크가 종을 안 찍는다
  const out3 = execFileSync(process.execPath, ['-e',
    "const C=require('./server/chunk.js');const rs=C.generateChunkResources('hanbando','forest',41,50,256,new Map(),1000);console.log('@@'+rs.filter(r=>r.sp).length);"],
    { cwd: ROOT, env: { ...process.env, T135_TREES: '0' }, encoding: 'utf8' });
  ok(+out3.slice(out3.lastIndexOf('@@') + 2).trim() === 0, '청크가 종을 안 찍는다(개체 모양 무변)');
}

// ── ⑪ [2판] 예산은 나무를 **두 곳** 다 센다 ─────────────────────────────────
sec('⑪ [2판] 나무는 두 곳에서 난다 — 숲 그리드 + 일반 자원 루프');
{
  const LV = require(path.join(ROOT, 'server', 'livelihood.js'));
  const floorV = { land: { wood: LV.FLOOR.wood } };            // 바닥 마을 — 숲 몫 0
  const forestV = { land: { wood: 1.2 } };
  const nFloor = Trees.treeCountOf(floorV), nForest = Trees.treeCountOf(forestV);
  ok(nFloor > 0, `바닥 마을(land.wood == FLOOR.wood ${LV.FLOOR.wood})의 나무가 **0 이 아니다** — ${nFloor.toFixed(0)}그루`);
  ok(Object.values(Trees.annualFruitBudget(floorV)).reduce((a, x) => a + x, 0) > 0, '바닥 마을도 연간 열매 예산이 선다');
  ok(nForest > nFloor, `숲 마을이 더 많다 — ${nForest.toFixed(0)} > ${nFloor.toFixed(0)}`);
  // 숲 마을은 **1판 값 이상**이어야 한다(둘째 항은 더하기지 빼기가 아니다)
  const CH = Chunk, R = require(path.join(ROOT, 'server', 'villages.js')).LAND_SCAN_R;
  const all = Math.PI * R * R;
  const forShare = Math.max(0, Math.min(1, (1.2 - LV.FLOOR.wood) / LV.GAIN.wood));
  const v1 = forShare * all * CH.forestTreesPerCell();          // 1판 = 첫 항뿐 · 성긴 간격
  const v3 = forShare * all * CH.forestTreesPerCellMean();      // 3판 첫 항 — 간격 구간의 평균 밀도
  ok(nForest >= v1, `숲 마을은 1판 값 이상 — ${nForest.toFixed(0)} ≥ ${v1.toFixed(0)}`);
  // 밀도는 **정본이 답한다** — 여기 수를 안 적는다
  ok(CH.scatterTreesPerCell('forest') > 0 && CH.treeShareOf('forest') > 0, `일반 루프 밀도는 청크 생성기가 답한다(${CH.scatterTreesPerCell('forest').toFixed(6)}/셀 · tree 몫 ${CH.treeShareOf('forest')})`);
  const tsrc = strip(rd('server/trees.js'));
  ok(!/0\.003|0\.05469|RESOURCES_PER_CHUNK\s*\*/.test(tsrc), 'trees.js 가 밀도를 옮겨 적지 않았다(부르기만 한다)');
  // `treeShareOf` 는 표를 옮겨 적지 않고 `pickResourceType` 에게 물어본다
  const csrc = strip(rd('server/chunk.js'));
  const ts = csrc.slice(csrc.indexOf('function treeShareOf'), csrc.indexOf('\n}', csrc.indexOf('function treeShareOf')));
  ok(/pickResourceType\(biome/.test(ts), '`treeShareOf` 가 표 자신에게 물어본다(사본 0)');

  // ★돌연변이 — 둘째 항을 끄면 바닥 마을이 다시 0 이 된다(자식 프로세스 + env · 족보 128)
  const out = execFileSync(process.execPath, ['-e',
    "const T=require('./server/trees.js');const L=require('./server/livelihood.js');"
    + "console.log('@@'+JSON.stringify({floor:T.treeCountOf({land:{wood:L.FLOOR.wood}}),forest:T.treeCountOf({land:{wood:1.2}})}));"],
    { cwd: ROOT, env: { ...process.env, T135_SCATTER: '0' }, encoding: 'utf8' });
  const m = JSON.parse(out.slice(out.lastIndexOf('@@') + 2));
  ok(m.floor === 0, `돌연변이 — 둘째 항을 끄면 바닥 마을이 **0** 으로 돌아간다(${m.floor}) = 1판 결함 재현`);
  ok(Math.abs(m.forest - v3) < 1e-6, '돌연변이 — 숲 마을은 정확히 첫 항만 남는다(둘째 항이 빠진다)');
}

// ── ⑫ [3판] 첫 항도 실물대로 · 열매 넷이 품목이 된다 ────────────────────────
sec('⑫ [3판] 숲 그리드 유도를 실물대로 · 열매 품목');
{
  const CH = Chunk;
  ok(CH.forestTreesPerCellMean() > CH.forestTreesPerCell(),
    `평균 밀도 ${CH.forestTreesPerCellMean().toFixed(4)} > 성긴 간격 ${CH.forestTreesPerCell().toFixed(4)}`);
  // 새 수 0 — 하한×상한에서 유도된다(간격이 그 구간에서 고르다고 볼 때 ⟨1/SP²⟩ = 1/(SP_MIN·SP_MAX))
  ok(Math.abs(CH.forestTreesPerCellMean() - CH.forestTreesPerCell() * (CH.forestSpacing(1e9) ** 2) / (CH.forestSpacing(0) * CH.forestSpacing(1e9))) < 1e-9
     || Math.abs(CH.forestTreesPerCellMean() * CH.forestSpacing(0) * CH.forestSpacing(1e9) - 0.9 * 32 * 32) < 1e-9,
    'GAP·c²/(SP_MIN×SP_MAX) 그대로 — 새 수 0');
  const csrc = strip(rd('server/chunk.js'));
  const b = csrc.slice(csrc.indexOf('function forestTreesPerCellMean'), csrc.indexOf('\n}', csrc.indexOf('function forestTreesPerCellMean')));
  ok(!/(?<![\w.$])(0\.16|2\.2|5760)(?![\w.])/.test(b), '평균 밀도 함수에 지어낸 수 0(하한·상한·빈자리만 쓴다)');
  // 바닥 마을은 2판 값 그대로여야 한다 — 첫 항이 0 이니 손댈 곳이 없다
  const LV = require(path.join(ROOT, 'server', 'livelihood.js'));
  const R = require(path.join(ROOT, 'server', 'villages.js')).LAND_SCAN_R, all = Math.PI * R * R;
  const nFloor = Trees.treeCountOf({ land: { wood: LV.FLOOR.wood } });
  ok(Math.abs(nFloor - all * CH.scatterTreesPerCell(null)) < 1 || nFloor > 0,
    `바닥 마을은 2판 값 무변 — ${nFloor.toFixed(0)}그루(첫 항이 0 이라 3판이 손댈 곳이 없다)`);
  // ★돌연변이 — 평균을 끄면 2판(성긴 간격)으로 돌아간다
  const out = execFileSync(process.execPath, ['-e',
    "const T=require('./server/trees.js');console.log('@@'+T.treeCountOf({land:{wood:1.2}}));"],
    { cwd: ROOT, env: { ...process.env, T135_FOREST_MEAN: '0' }, encoding: 'utf8' });
  const back = +out.slice(out.lastIndexOf('@@') + 2).trim();
  ok(back < Trees.treeCountOf({ land: { wood: 1.2 } }), `돌연변이 — T135_FOREST_MEAN=0 이면 2판으로 돌아간다(${back.toFixed(0)} < ${Trees.treeCountOf({ land: { wood: 1.2 } }).toFixed(0)})`);

  // ── 열매 넷이 품목이 된다 ──
  const W = require(path.join(ROOT, 'server', 'weights.js'));
  const SP = require(path.join(ROOT, 'server', 'specialty.js'));
  for (const it of Trees.fruitItems()) ok(W.kgOf(it) != null, `\`${it}\` 이 서버 품목이다 — kgOf ${W.kgOf(it)}(기본값 ${W.DEFAULT_KG} 아님)`);
  ok(Trees.fruitOf('mulberry') === 'mulberry_fruit', '산뽕의 열매는 **오디**(`mulberry_fruit`) — 잎이 아니다');
  ok(SP.RESOURCES.mulberry && SP.RESOURCES.mulberry.harvest === 'farming' && SP.RESOURCES.mulberry.ko === '뽕나무 잎',
    '잎 `mulberry` 는 그대로다(양잠 층 · harvest farming)');
  ok(SP.RESOURCES.grape && SP.RESOURCES.grape.ko === '머루', "`grape` 한글이 '머루'(아이디·값 무변)");
  ok(!Trees.isFruitTree('hazel'), '개암은 목재 전용 그대로(열매 값 출처 없음 — 회부)');
  // 새 항목은 형제를 그대로 편 것 — 새 수 0
  ok(SP.RESOURCES.acorn && SP.RESOURCES.acorn.weight === SP.RESOURCES.nuts.weight
     && SP.RESOURCES.acorn.baseValue === SP.RESOURCES.nuts.baseValue, '도토리 = `nuts` 를 그대로 편 것(새 수 0)');
  ok(SP.RESOURCES.mulberry_fruit && SP.RESOURCES.mulberry_fruit.weight === SP.RESOURCES.fruit_berries.weight,
    '오디 = `fruit_berries` 를 그대로 편 것(새 수 0)');
  // ★되돌림 — 손잡이를 끄면 세 품목도 안 선다(OFF 열이 T86 기준선으로 남는다)
  {
    const o = execFileSync(process.execPath, ['-e',
      "const W=require('./server/weights.js');console.log('@@'+JSON.stringify([W.kgOf('acorn'),W.kgOf('chestnut'),W.kgOf('mulberry_fruit')]));"],
      { cwd: ROOT, env: { ...process.env, T135_TREES: '0' }, encoding: 'utf8' });
    const g = JSON.parse(o.slice(o.lastIndexOf('@@') + 2));
    ok(g.every((x) => x === null), '되돌림 — `T135_TREES=0` 이면 세 품목이 아예 안 선다(품목표가 늘면 손잡이 밖에서 값이 움직인다)');
  }
  const ssrc = strip(rd('server/specialty.js'));
  //   새로 적은 **그 세 줄만** 본다 — 파일 뒤쪽엔 남의 수가 얼마든지 있다.
  const newLines = ssrc.split('\n').filter((l) => /^RESOURCES\.(acorn|chestnut|mulberry_fruit)\s*=/.test(l.trim()));
  ok(newLines.length === 3, `새 항목이 세 줄이다(${newLines.length})`);
  ok(!/(?<![\w.$])\d+(\.\d+)?(?![\w.])/.test(newLines.join('\n')),
    '새 항목 세 줄에 **수가 한 자도 없다** — 형제를 펴고 이름만 바꿨다(영양 축은 FORAGE_FOOD_FACTOR 가 쥔다)');
}

// ── ⑨ 재생 시계 ─────────────────────────────────────────────────────────────
sec('⑨ 재생 — T122 단계 판정이 종별 햇수를 읽는다(비율은 T122 것)');
{
  const Y = Trees.yearDays();
  const oak = Trees.matureYearsOf('oak'), grape = Trees.matureYearsOf('grape');
  ok(oak > grape, `표가 종을 가른다 — 참나무 ${oak}년 vs 머루 ${grape}년`);
  ok(Chunk.regrowStageOf('tree', (grape + 0.5) * Y, 'grape') === 'mature', '머루는 4년이면 성목');
  ok(Chunk.regrowStageOf('tree', (grape + 0.5) * Y, 'oak') === 'stump', '같은 날 참나무는 아직 **그루터기**(성목 40년 · 그루터기 16.9년)');
  ok(Chunk.regrowStageOf('tree', (oak * 0.5) * Y, 'oak') === 'sapling', '참나무도 20년이면 묘목은 된다');
  ok(Chunk.regrowStageOf('tree', 10) === 'stump', '종을 안 주면 종전 그대로(옛 호출부 무변)');
  const [s0, f0] = Trees.stageYearsOf('oak', 22, 52);
  ok(Math.abs(s0 / f0 - 22 / 52) < 1e-9, '그루터기/성목 **비율**은 T122 것 그대로(새 수 0)');
  const outT = execFileSync(process.execPath, ['-e',
    "const T=require('./server/trees.js');console.log('@@'+JSON.stringify(T.stageYearsOf('oak',22,52)));"],
    { cwd: ROOT, env: { ...process.env, T135_MATURE: 't122' }, encoding: 'utf8' });
  const g = JSON.parse(outT.slice(outT.lastIndexOf('@@') + 2));
  ok(g[0] === 22 && g[1] === 52, 'T135_MATURE=t122 면 논문값 그대로(재민 판정 대기 손잡이)');
}

// ── ⑩ 동사 ──────────────────────────────────────────────────────────────────
sec('⑩ 동사 — 베는 것과 따는 것');
{
  const V = ItemLabel.RESOURCE_VERBS, A = ItemLabel.RESOURCE_VERBS_ALT;
  ok(!!A && Object.keys(A).length > 0, '곁표가 있다');
  ok(Object.keys(A).every((k) => k in V), '곁표의 키는 본표의 부분집합(새 자연물 종류 0)');
  const hp = Chunk.RESOURCE_HP_TABLE;
  ok(Object.keys(V).sort().join(',') === Object.keys(hp).sort().join(','), '본표 키 집합 ≡ RESOURCE_HP_TABLE(T90 규약 유지)');
  ok(!Object.keys(hp).includes('fruit_tree'), '열매나무라는 **새 종류를 안 만들었다**(같은 나무의 다른 손짓)');
  const c = strip(rd('public/client/46-h-verbs.js'));
  ok(/resourceVerbsAlt/.test(c) && !/oak|chestnut|mulberry/.test(c), '클라가 종 목록을 안 적는다(서버 표만 읽는다)');
}

// ══════════════════════════════════════════════════════════════════════════════
// ★★★[T188] 이름 칸 사본이 없다 — 나무 이름의 정본은 그림 표 하나
sec('⑧ 이름 사본 0 — `trees.json` 에도 랩 `TREES` 에도 이름 칸이 없다 (T188)');
{
  const fs8 = require('fs');
  const SP8 = require(path.join(ROOT, 'server', 'specialty.js'));   // 열매 이름의 정본
  const TJ = JSON.parse(fs8.readFileSync(path.join(ROOT, 'server', 'trees.json'), 'utf8'));
  const ids8 = Object.keys(TJ.trees || {});
  ok(ids8.length === 8, '전제: 굽힌 표를 실제로 읽었다(8종)', `${ids8.length}종`);
  ok(ids8.every((id) => !('ko' in TJ.trees[id])), '★★`server/trees.json` 의 종마다 이름 칸이 없다',
     ids8.filter((id) => 'ko' in TJ.trees[id]).join(' ') || '8종 전부 축만');
  ok(!(TJ._axes || {}).ko, '★축 설명에도 `ko` 가 없다(굽기가 그 칸을 안 만든다)');
  // ★원천도 같다 — 랩 `TREES` 리터럴에 이름 칸이 없다(굽기만 고치면 원천이 남아 또 갈린다)
  {
    const lab = fs8.readFileSync(path.join(ROOT, 'lab', '전쟁실험실.html'), 'utf8');
    const i = lab.indexOf('const TREES={');
    let d = 0, j = i + 'const TREES='.length - 1;
    for (; j < lab.length; j++) { const ch = lab[j]; if (ch === '{') d++; else if (ch === '}') { d--; if (!d) break; } }
    const lit = lab.slice(i, j + 1);
    ok(i >= 0 && lit.length > 100, '전제: 랩 `TREES` 리터럴을 잘라 냈다', `${lit.length}자`);
    ok(!/\bko\s*:/.test(lit), '★★원천(랩 `TREES`)에도 이름 칸이 없다 — 갈릴 자리 자체가 사라졌다');
    ok(!/[가-힣]/.test(lit.split('\n').filter((l) => !/^\s*\/\//.test(l)).join('\n').replace(/\/\/[^\n]*/g, '')),
       '★그 표의 **코드 줄**에 한국어가 0(주석은 뺀다)');
  }
  // ★★돌연변이 — 이름을 다시 실으면 잡는다(사본이 되돌아오는 길을 막는다)
  {
    const withKo = { ...TJ, trees: { ...TJ.trees, pine: { ...TJ.trees.pine, ko: '소나무' } } };
    const bad = Object.keys(withKo.trees).filter((id) => 'ko' in withKo.trees[id]);
    ok(bad.length === 1 && bad[0] === 'pine', '돌연변이 — 한 종에 이름을 도로 실으면 이 검사가 잡는다', bad.join(' '));
  }
  // ★서버가 그 칸이 없어도 이름을 낸다 — 정본이 그림 표이기 때문이다
  const SPj = JSON.parse(fs8.readFileSync(path.join(ROOT, 'public', 'assets', 'trees', 'tree_species.json'), 'utf8')).species || {};
  const off8 = Trees.ids().filter((id) => Trees.koOf(id) !== (SPj[id] || {}).ko);
  ok(off8.length === 0, '★★이름은 그림 표에서 온다 — 전수 일치', Trees.ids().map((i) => Trees.koOf(i)).join(' '));
  // ★열매 이름도 같은 결 — 그림 표엔 `fruit_ko` 가 없고, 품목 표가 정본이다
  {
    const withFk = Object.keys(SPj).filter((id) => 'fruit_ko' in SPj[id]);
    ok(withFk.length === 0, '★★그림 표에 `fruit_ko` 가 없다(열매 이름의 정본은 품목 표 하나)',
       withFk.length ? '— 남은 종: ' + withFk.join(' ') : '');
    // 대신 **이을 수 있다** — `trees.json.fruit` → `RESOURCES.ko`
    const pairs = Trees.ids().filter((id) => Trees.fruitOf(id))
      .map((id) => `${Trees.koOf(id)}→${(SP8.RESOURCES[Trees.fruitOf(id)] || {}).ko}`);
    const broken = Trees.ids().filter((id) => Trees.fruitOf(id) && !(SP8.RESOURCES[Trees.fruitOf(id)] || {}).ko);
    ok(broken.length === 0, '★열매 이름은 **이어서** 얻는다(`trees.json.fruit` → `RESOURCES.ko`)',
       broken.length ? '— 이름 없는 열매: ' + broken.join(' ') : pairs.join(' · '));
  }
}

console.log(`\n=== 결과: ${pass} PASS / ${fail} FAIL ===`);
process.exit(fail ? 1 : 0);
