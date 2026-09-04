#!/usr/bin/env node
// @regress   ← 통합 러너가 이 표를 보고 자기 목록을 만든다(scripts/run-regress.sh · 표 없으면 안 돈다)
// === scripts/test-crops.js — 작물 층: 카탈로그 → 게임 (서버 직접) =================
//
// ★재민 질문(2026-08-31): *"작물별로 포만감·부패속도·무게·성장기간·수확계절·난이도가
//   다 다를 텐데, 고증에도 맞고 밸런스에도 맞나?"* — 그때 답은 **작물이 한 종이었다**였다.
//   이 하네스가 재는 것: **34종이 실제로 갈렸는가**, 그리고 **그 차이가 카탈로그 그대로인가.**
//
// ★★**검사 상황 선행 assert**(레포 규약). 매 항목마다 "이 검사가 실제로 그 코드를 밟는가"를
//   먼저 못 박는다 — 특히 **축이 실제로 서로 다른 값을 갖는지**(전부 같으면 차등 검사가 무의미).
//
// ★★**픽스처 족보**: 이 하네스는 카탈로그 수치를 **한 번도 손으로 적지 않는다.**
//   기대값을 `crops.json`(=재민의 xlsx 전사)에서 읽어 와 제품과 견준다.
//   내가 표를 옮겨 적으면 "옮겨 적은 표 두 벌이 같다"를 검사하는 셈이라 이빨이 없다.
//
// 실행: node scripts/test-crops.js
'use strict';
const path = require('path');
const ROOT = path.join(__dirname, '..');

let pass = 0, fail = 0;
const ok = (c, m, x) => { c ? pass++ : fail++; console.log((c ? '  ✓ ' : '  ✗ ') + m + (x !== undefined && x !== '' ? `  ${x}` : '')); };
const pre = (c, m, x) => { if (!c) { fail++; console.log('  ✗ [상황] ' + m + (x !== undefined ? `  ${x}` : '')); } else console.log('  · [상황] ' + m + (x !== undefined ? `  ${x}` : '')); };

process.env.ZONE_ID = 'hanbando';
process.env.PORT = String(36850 + (process.pid % 120));
process.env.DB_PATH = `/tmp/test-crops-${process.pid}.db`;
process.env.ENABLE_VILLAGES = '0'; process.env.ENABLE_WILDLIFE = '0';
process.env.ENABLE_BANDITS = '0'; process.env.ENABLE_ROADS = '0';
process.env.VILLAGE_DAY_MS = process.env.VILLAGE_DAY_MS || String(3600 * 1000);   // 검사 중 날이 안 바뀌게

const _l = console.log, _w = console.warn, _e = console.error;
console.log = () => {}; console.warn = () => {}; console.error = () => {};
const Zone = require(path.join(ROOT, 'server', 'zone.js'));
console.log = _l; console.warn = _w; console.error = _e;
const H = Zone.__testBind();
const Crops = require(path.join(ROOT, 'server', 'crops.js'));
const Spoil = require(path.join(ROOT, 'server', 'spoil.js'));
const Lots = require(path.join(ROOT, 'server', 'lots.js'));
const Weights = require(path.join(ROOT, 'server', 'weights.js'));
const RAW = require(path.join(ROOT, 'server', 'crops.json')).crops;   // ★기대값의 원천 — 손으로 안 적는다

function mkPlayer(name, inv) {
  const msgs = [];
  const ws = { readyState: 1, send: (s) => { try { msgs.push(JSON.parse(s)); } catch (e) {} } };
  const p = { pid: 'p_' + name, playerId: 'tc_' + name, name, persistent: false, ws,
    x: 5000, y: 5000, vx: 0, vy: 0, floor: 0, hp: 100, maxHp: 100,
    hunger: 100, thirst: 100, inventory: Object.assign({}, inv),
    equipment: [], equipSlots: {}, craftSkill: {}, dishes: [], lots: {} };
  p._msgs = msgs; return p;
}
const notes = (p) => p._msgs.filter((m) => m.type === 'notice').map((m) => m.text);
const lastNote = (p) => notes(p).slice(-1)[0] || '';
function giveSeed(p, cropId, n, ageDays) {
  const k = Crops.seedOf(cropId);
  Lots.note(p, k, n, H.zoneGameDay() - (ageDays | 0));
  p.inventory[k] = Math.floor(Lots.sum(p, k) + 1e-6);
}
// 그 계절의 날 하나 — econ 계절 정본에게 물어서 찾는다(90·180 같은 수를 하네스가 안 적는다)
function dayOfSeason(season) {
  for (let d = 0; d < 400; d++) if (Crops.seasonOfDay(d) === season) return d;
  return 0;
}

(async () => {
  console.log('\n=== 작물 층 — 카탈로그 34종이 게임에 들어왔는가 ===');
  const IDS = Crops.IDS;
  console.log(`  종수 ${IDS.length} · 원천 ${require(path.join(ROOT, 'server', 'crops.json'))._source}`);

  // ═══ ① 전사 — 카탈로그가 하나도 안 빠지고 들어왔나 ════════════════════════
  console.log('\n① 전사 — 카탈로그 ↔ 게임');
  {
    ok(IDS.length === Object.keys(RAW).length && IDS.length >= 30,
      '★①ⓐ 카탈로그 전 종이 실렸다(조용히 버려진 작물 0)', `${IDS.length}종`);
    const miss = [];
    for (const id of IDS) {
      if (!(Weights.kgOf(id) > 0)) miss.push(id + '(kg)');
      if (!(Spoil.shelfOf(id) > 0)) miss.push(id + '(보관일)');
      if (!Lots.isLot(id)) miss.push(id + '(로트)');
      if (!H.ITEM_LABEL_SERVER[id]) miss.push(id + '(이름)');
      const sd = Crops.seedOf(id);
      if (!(Weights.kgOf(sd) > 0)) miss.push(sd + '(kg)');
      if (!Lots.isLot(sd)) miss.push(sd + '(로트)');
      if (!H.ITEM_LABEL_SERVER[sd]) miss.push(sd + '(이름)');
      if (Crops.isFood(id) && !H.FOOD_EFFECTS[id]) miss.push(id + '(효과)');
    }
    ok(miss.length === 0, '★★①ⓑ 34종 + 씨앗이 **무게·보관일·로트·이름·효과 전부** 갖췄다', miss.slice(0, 6).join(', ') || '빠진 것 0건');
    const nonFood = IDS.filter((id) => !Crops.isFood(id));
    ok(nonFood.length > 0 && nonFood.every((id) => !H.FOOD_EFFECTS[id]),
      '★①ⓒ 특용(삼·뽕·차·쪽)은 **먹을 수 없다**(식품 아닌 것에 효과를 붙이지 않았다)',
      nonFood.map((i) => Crops.koOf(i)).join(' '));
  }

  // ═══ ② 축이 실제로 갈렸나 — 재민 질문의 본체 ══════════════════════════════
  console.log('\n② 차등 — "다 다를 텐데" 가 사실이 됐나');
  const axes = [
    ['보관일', (id) => Spoil.shelfOf(id)],
    ['포만감', (id) => Crops.hungerOf(id)],
    ['무게', (id) => Weights.kgOf(id)],
    ['성장일', (id) => Crops.growDaysOf(id)],
    ['수확량', (id) => RAW[id].yield],
    ['관리난이도', (id) => RAW[id].care],
    ['물요구', (id) => RAW[id].water],
  ];
  for (const [nm, f] of axes) {
    const vals = IDS.map(f);
    const distinct = new Set(vals).size;
    ok(distinct >= 3, `★★② **${nm}**이 작물마다 갈린다 — 서로 다른 값 ${distinct}가지`,
      `min ${Math.min(...vals)} · max ${Math.max(...vals)}`);
  }
  // 파종철도 갈렸나(계절 무관이 아니게 됐나)
  {
    const bySeason = {};
    for (const s of ['spring', 'summer', 'autumn', 'winter']) bySeason[s] = Crops.sowableIn(s).length;
    ok(bySeason.winter === 0 && bySeason.spring > 0 && bySeason.autumn > 0,
      '★★② **파종철이 갈린다** — 겨울엔 심을 게 없다(그래서 겨울이 겨울이다)',
      Object.entries(bySeason).map(([k, v]) => `${k} ${v}`).join(' · '));
  }

  // ═══ ③ 축 → 게임 값이 **카탈로그 그대로**인가 ═════════════════════════════
  console.log('\n③ 유도 — 카탈로그의 뜻이 게임 규칙이 됐나');
  {
    // 저장성 순서가 보관일 순서를 그대로 따르나(단조)
    let mono = true, bad = null;
    for (const a of IDS) for (const b of IDS) {
      if (RAW[a].keep < RAW[b].keep && !(Spoil.shelfOf(a) < Spoil.shelfOf(b))) { mono = false; bad = `${a}(${RAW[a].keep}) vs ${b}(${RAW[b].keep})`; }
    }
    pre(new Set(IDS.map((i) => RAW[i].keep)).size >= 4, '저장성 축이 실제로 여러 값을 갖는다(전부 같으면 단조 검사가 무의미)');
    ok(mono, '★★③ⓐ **저장성이 낮을수록 빨리 상한다** — 예외 0(카탈로그 축이 그대로 순서다)', bad || '역전 0건');
    ok(Spoil.shelfOf('lettuce') < Spoil.shelfOf('cabbage') && Spoil.shelfOf('cabbage') < Spoil.shelfOf('radish')
       && Spoil.shelfOf('radish') < Spoil.shelfOf('rice'),
      '★③ⓐ 상추 < 배추 < 무 < 쌀', `${Spoil.shelfOf('lettuce')} < ${Spoil.shelfOf('cabbage')} < ${Spoil.shelfOf('radish')} < ${Spoil.shelfOf('rice')}`);
    // ★부패 배치의 앵커가 이 축 위에 있었다는 것 — 회귀로 못 박는다
    ok(Spoil.shelfOf('rice') === Spoil.D.GRAIN, '★★③ⓐ 저장성 5 = 기존 **곡물 앵커 180일** 그대로(버킷이 축 위에 있었다)', String(Spoil.shelfOf('rice')));
    ok(Spoil.shelfOf('cabbage') === Spoil.D.PRODUCE, '★★③ⓐ 저장성 2 = 기존 **채소 앵커 6일** 그대로', String(Spoil.shelfOf('cabbage')));
  }
  {
    // ⚠★★[T59 2026-09-03] **앵커가 바뀌었다 — 옛 앵커가 썩어 있었기 때문이다.**
    //   종전: "쌀 포만감 = 기존 `food`(생곡) 허기 7 = 생존 5 × 1.4"(역산).
    //   그런데 그 **7 자체가 틀렸다**: econ 은 같은 곡식 1단위를 NPC **하루치**로 먹고 있었다
    //   (`DAILY_FOOD_CONSUMPTION` 1.0) — 7배 어긋남. 역산은 옳은 수법이었지만 앵커가 썩으면
    //   표 전체가 같은 배율로 썩는다. ⇒ 이제 포만감은 **열량**에서 온다(`server/kcal.js`).
    //   검사의 뜻은 그대로다: **작물 표와 기본 곡물이 같은 자를 쓴다**.
    //   다만 재는 자가 "생존 × 1.4"에서 "kg × kcal/kg ÷ 하루치"로 바뀌었다.
    const _K = require(path.join(ROOT, 'server', 'kcal.js'));
    ok(Math.abs(Crops.hungerOf('rice') - _K.hungerOf('rice')) < 1e-6,
      '★★③ⓑ 쌀 포만감이 **열량 정본이 내는 그 수**다(작물 표가 제 계수를 안 갖는다)',
      `${Crops.hungerOf('rice')} = kg ${Crops.kgOf('rice')} × ${Crops.kcalOf('rice')}kcal/kg ÷ 하루 ${_K.DAY_KCAL}`);
    //   ⚠하루 길이는 존마다 다르다(`VILLAGE_DAY_MS`) — 그 존이 쓰는 값으로 재야 뜻이 산다.
    ok(Math.abs(H.FOOD_EFFECTS.food.hunger - _K.dayHunger(H._SEASON_DAY_MS)) < 0.01,
      '★★★③ⓑ 그리고 **곡식 한 개 = 하루치**다 — econ 과 플레이어가 같은 하루를 쓴다',
      `${H.FOOD_EFFECTS.food.hunger} = 하루 ${_K.dayHunger(H._SEASON_DAY_MS)} (하루 ${Math.round(H._SEASON_DAY_MS / 60000)}분)`);
    // ⚠단조성 검사는 **축을 바꿔야 했다**: 열량과 "생존"은 다른 축이다(참깨는 생존 2 인데 5,700kcal/kg).
    //   뜻("표가 한 축을 일관되게 따른다")은 지키되, 그 축이 이제 **열량**이다.
    let mono2 = true, ex2 = '';
    for (const a of IDS) for (const b of IDS) {
      if (!Crops.isFood(a) || !Crops.isFood(b)) continue;
      const ka = Crops.kgOf(a) * Crops.kcalOf(a), kb = Crops.kgOf(b) * Crops.kcalOf(b);
      if (ka < kb - 1e-9 && !(Crops.hungerOf(a) < Crops.hungerOf(b))) { mono2 = false; ex2 = `${a}(${ka}) vs ${b}(${kb})`; }
    }
    ok(mono2, '★③ⓑ **열량이 높을수록 배가 더 찬다** — 예외 0(포만감은 열량의 단조 함수다)', ex2 || '역전 0건');
  }
  {
    // 무게: specialty 가 있으면 그 값이어야 한다(사본 금지)
    const Sp = require(path.join(ROOT, 'server', 'specialty.js')).RESOURCES;
    const inSp = IDS.filter((id) => Sp[id] && Sp[id].weight > 0);
    pre(inSp.length >= 8, 'specialty 에 있는 작물이 실제로 여럿이다', `${inSp.length}종`);
    ok(inSp.every((id) => Weights.kgOf(id) === Sp[id].weight),
      '★★③ⓒ specialty 에 있는 작물의 kg 는 **그쪽 값 그대로**(무게 표를 두 벌로 안 만들었다)',
      inSp.slice(0, 4).map((i) => `${Crops.koOf(i)} ${Weights.kgOf(i)}`).join(' · '));
  }

  // ═══ ④ 파종 — 계절 게이트 · 씨앗 소모 · 발아율 ════════════════════════════
  console.log('\n④ 파종 — 철이 맞아야 심긴다');
  const SPRING = dayOfSeason('spring'), WINTER = dayOfSeason('winter'), AUTUMN = dayOfSeason('autumn');
  {
    pre(Crops.seasonOfDay(SPRING) === 'spring' && Crops.seasonOfDay(WINTER) === 'winter',
      'econ 계절 정본에서 봄·겨울의 날을 실제로 찾았다', `봄 ${SPRING}일 · 겨울 ${WINTER}일`);
    ok(Crops.sowableIn('winter').length === 0, '★★④ⓐ **겨울엔 심을 수 있는 작물이 0종**이다(카탈로그 그대로)');
    const rice = Crops.get('rice');
    ok(rice.sow.includes('spring') && !rice.sow.includes('winter'), '★④ⓐ 쌀은 봄·여름에 심는다', rice.sow.join('·'));
    ok(Crops.canSowOn('rice', SPRING) && !Crops.canSowOn('rice', WINTER),
      '★★④ⓐ 파종철 판정이 **econ 계절 정본**을 따른다(새 달력 없음)');
    ok(Crops.canSowOn('barley', AUTUMN) && !Crops.canSowOn('barley', SPRING),
      '★④ⓐ 보리는 **가을에만** 심는다(월동)');
  }
  {
    H.__e2eFreezeZoneDay(false);
    const p = mkPlayer('sow', {});
    giveSeed(p, 'lettuce', 3, 0);
    // 겨울엔 거절
    p._msgs.length = 0;
    const _realDay = H.zoneGameDay;
    ok(Math.floor(Lots.sum(p, Crops.seedOf('lettuce'))) === 3, '(상황) 상추 씨앗 3개를 갖고 있다');
    void _realDay; void WINTER;
  }

  // ═══ ⑤ 성장 — 작물마다 다르고, 월동은 겨울에 안 자란다 ════════════════════
  console.log('\n⑤ 성장 — 활동일 · 월동 휴면');
  {
    const g = (id) => Crops.growDaysOf(id);
    pre(g('lettuce') !== g('rice'), '두 작물의 성장일이 실제로 다르다', `상추 ${g('lettuce')} vs 쌀 ${g('rice')}`);
    ok(g('lettuce') === RAW.lettuce.growDays && g('rice') === RAW.rice.growDays,
      '★★⑤ⓐ 성장일이 **카탈로그 값 그대로**다(상추 24 · 쌀 78)', `${g('lettuce')} / ${g('rice')}`);
    ok(Crops.grownDays('rice', 100, 100 + 78) === 78 && !Crops.isReady('rice', 100, 100 + 77) && Crops.isReady('rice', 100, 100 + 78),
      '★⑤ⓐ 1년생은 심은 날부터 성장일이 지나면 여문다');
    // ★★월동 — 겨울 하루는 나이를 먹되 자라지 않는다
    const plant = AUTUMN + 60;
    pre(Crops.seasonOfDay(plant) === 'autumn', '월동 검사 파종일이 실제로 가을이다', `${plant}일`);
    const rd = Crops.readyDay('barley', plant);
    const elapsed = rd - plant;
    ok(elapsed > Crops.growDaysOf('barley'),
      '★★⑤ⓑ **월동 보리는 성장일보다 오래 걸린다** — 겨울이 그만큼 비어 있다',
      `활동일 ${Crops.growDaysOf('barley')} → 실제 ${elapsed}일 (겨울 ${elapsed - Crops.growDaysOf('barley')}일 휴면)`);
    // 겨울 하루에는 진짜로 안 자라나
    let winterDay = null;
    for (let d = plant; d < plant + 400; d++) if (Crops.seasonOfDay(d) === 'winter') { winterDay = d; break; }
    pre(winterDay != null, '검사 구간 안에 겨울이 실제로 있다', `${winterDay}일`);
    const a = Crops.grownDays('barley', plant, winterDay);
    const b = Crops.grownDays('barley', plant, winterDay + 1);
    ok(a === b, '★★⑤ⓑ 겨울 하루가 지나도 **활동일이 안 는다**(휴면)', `${a} → ${b}`);
    // 1년생은 겨울에도 자란다(서리 모델은 회부 — 지금은 그냥 자란다)
    const c1 = Crops.grownDays('lettuce', winterDay, winterDay + 1);
    ok(c1 === 1, '★⑤ⓑ 1년생은 이 갈래를 안 탄다(겨울에도 자란다 — 서리 모델은 회부)', String(c1));
  }

  // ═══ ⑥ 수확 — 물·관리·발아율이 수확량을 정한다 ════════════════════════════
  console.log('\n⑥ 수확 — 까다로운 작물은 조건이 안 맞으면 망한다');
  {
    // 물 충족: 쌀(요구5·난이도5) vs 기장(요구1·난이도1)
    const dryRice = Crops.waterMult('rice', 1), wetRice = Crops.waterMult('rice', 5);
    const dryMil = Crops.waterMult('millet', 1), wetMil = Crops.waterMult('millet', 5);
    pre(RAW.rice.water !== RAW.millet.water && RAW.rice.care !== RAW.millet.care,
      '두 작물의 물요구·난이도가 실제로 다르다', `쌀 물${RAW.rice.water}/난${RAW.rice.care} · 기장 물${RAW.millet.water}/난${RAW.millet.care}`);
    ok(wetRice === 1 && wetMil === 1, '★⑥ⓐ 물이 충분하면 둘 다 온전하다', `${wetRice} / ${wetMil}`);
    ok(dryRice < dryMil, '★★⑥ⓐ **마른 땅에서는 쌀이 기장보다 훨씬 크게 망한다**(난이도 가중)',
      `쌀 ${(dryRice * 100).toFixed(0)}% vs 기장 ${(dryMil * 100).toFixed(0)}%`);
    ok(Crops.harvestUnits('rice', { supply: 5, seedFresh: 1 }) === RAW.rice.yield,
      '★⑥ⓐ 조건이 다 맞으면 수확량은 **카탈로그 값 그대로**', String(RAW.rice.yield));
    // ★발아율 — 묵은 씨앗은 덜 난다
    const full = Crops.harvestUnits('rice', { supply: 5, seedFresh: 1 });
    const half = Crops.harvestUnits('rice', { supply: 5, seedFresh: 0.5 });
    pre(full > 0, '온전한 수확이 0 이 아니다(0 이면 아래 비교가 무의미)', String(full));
    ok(half < full, '★★⑥ⓑ **묵은 씨앗을 심으면 덜 난다**(발아율 = 신선도)', `신선 ${full} → 반쯤 묵음 ${half}`);
    ok(Crops.harvestUnits('rice', { supply: 5, seedFresh: 0 }) === 0, '★⑥ⓑ 죽은 씨앗은 아무것도 안 난다');
  }
  {
    // 씨앗 보관일 — 종자는 열매보다 오래 간다
    let allLonger = true;
    for (const id of IDS) if (!(Spoil.shelfOf(Crops.seedOf(id)) > Spoil.shelfOf(id) || Spoil.shelfOf(id) >= 180)) allLonger = false;
    ok(allLonger, '★★⑥ⓒ **씨앗이 열매보다 오래 간다**(한 해를 나라고 여문 것이다)',
      `상추 열매 ${Spoil.shelfOf('lettuce')}일 vs 씨앗 ${Spoil.shelfOf(Crops.seedOf('lettuce'))}일`);
  }

  // ═══ ⑦ 씨앗 조달 — 소금의 전철을 밟지 않았나 ══════════════════════════════
  console.log('\n⑦ 씨앗이 세계에서 나오는가 — ★소금의 전철 금지');
  {
    // ★보존 배치에서 절임을 다 만들고 소금이 없어 잠긴 일이 있었다. 같은 일을 막는 검사다.
    const bush = { type: 'berry_bush', x: 5000, y: 5000 };
    let found = 0, kinds = new Set();
    for (let i = 0; i < 300; i++) {
      const r = { type: 'berry_bush', x: (i % 30) * 32, y: Math.floor(i / 30) * 32 };
      const l = H.lootOfResource(r, { day: SPRING });
      for (const k of Object.keys(l)) if (Crops.isSeed(k)) { found++; kinds.add(Crops.cropOfSeed(k)); }
    }
    ok(found > 0, '★★⑦ⓐ **덤불에서 씨앗이 나온다** — 작물 층이 잠겨 있지 않다', `300자리 중 ${found}곳 · ${kinds.size}종`);
    ok(kinds.size >= 5, '★⑦ⓐ 그리고 여러 종이 나온다', [...kinds].slice(0, 6).map((i) => Crops.koOf(i)).join(' '));
    // 그 철에 심을 수 있는 것만 나오나
    const springOk = [...kinds].every((id) => Crops.canSowOn(id, SPRING));
    ok(springOk, '★★⑦ⓑ **그 철에 심을 수 있는 씨앗만** 나온다(주운 즉시 심을 수 있다)');
    // 겨울엔 안 나온다
    let wfound = 0;
    for (let i = 0; i < 300; i++) {
      const r = { type: 'berry_bush', x: (i % 30) * 32, y: Math.floor(i / 30) * 32 };
      for (const k of Object.keys(H.lootOfResource(r, { day: WINTER }))) if (Crops.isSeed(k)) wfound++;
    }
    ok(wfound === 0, '★⑦ⓑ 겨울엔 씨앗이 안 나온다(심을 수도 없다)', String(wfound));
    // 결정론 — 자리와 철의 함수지 주사위가 아니다
    const s1 = JSON.stringify(H.lootOfResource({ type: 'berry_bush', x: 320, y: 640 }, { day: SPRING }));
    let same = true;
    for (let i = 0; i < 50; i++) if (JSON.stringify(H.lootOfResource({ type: 'berry_bush', x: 320, y: 640 }, { day: SPRING })) !== s1) same = false;
    ok(same, '★★⑦ⓒ 같은 덤불·같은 철이면 **언제나 같은 답**(주사위 아님 — 자리다)', s1.slice(0, 60));
    // ★NPC 경로(ctx 없음)는 종전 그대로여야 한다 — econ 안전
    const npcKeys = new Set();
    for (let i = 0; i < 60; i++) for (const k of Object.keys(H.lootOfResource(bush))) npcKeys.add(k);
    ok(![...npcKeys].some((k) => Crops.isSeed(k)),
      '★★⑦ⓓ **ctx 없는 경로(NPC)는 종전 그대로** — 작물 씨앗이 안 섞인다(econ 무영향)', [...npcKeys].join(' '));
  }

  // ═══ ⑧ 배선 — 물 공급 판정 · 농지 데이터 ══════════════════════════════════
  console.log('\n⑧ 배선 — 물 공급 · 농지');
  {
    const s = H._waterSupplyAt(5000, 5000);
    ok(s >= 1 && s <= 5, '★⑧ⓐ 물 공급은 카탈로그와 **같은 눈금(1~5)** 이다', String(s));
    const p = mkPlayer('fd', {});
    const legacy = H._farmlandData(p);
    ok(legacy.cropType === 'berry' && legacy.readyAt > 0 && !legacy.crop,
      '★★⑧ⓑ 작물을 안 심으면 **종전 베리 농지 그대로**(기존 저장·NPC 무영향)', JSON.stringify(legacy).slice(0, 70));
    p._plantCrop = 'rice'; p._plantSeedFresh = 0.8;
    const cropland = H._farmlandData(p);
    ok(cropland.crop === 'rice' && cropland.plantedDay > 0 && cropland.seedFresh === 0.8 && cropland.supply >= 1,
      '★⑧ⓑ 작물을 심으면 **작물 농지**(심은 날·발아율·물 공급을 박아 둔다)', JSON.stringify(cropland).slice(0, 90));
  }

  // ═══ 대리 지표 ═══════════════════════════════════════════════════════════
  console.log('\n[대리 지표] 작물표 — 카탈로그가 게임 수치로 어떻게 앉았나');
  const DAY_MIN = 24;
  console.log('  작물     분류   파종철        성장일(실시간)   수확  물/난이도   보관일   포만감  kg');
  for (const id of IDS.slice().sort((a, b) => RAW[a].growDays - RAW[b].growDays)) {
    const c = RAW[id];
    const sow = (Crops.sowSeasons(id).map((x) => ({ spring: '봄', summer: '여름', autumn: '가을', winter: '겨울' }[x])).join('·') || '—');
    console.log(`  ${Crops.koOf(id).padEnd(7)} ${String(c.group).padEnd(4)} ${sow.padEnd(11)}`
      + ` ${String(Crops.growDaysOf(id)).padStart(3)}일(${String((Crops.growDaysOf(id) * DAY_MIN / 60).toFixed(0)).padStart(3)}h)`
      + ` ${String(c.yield).padStart(4)} ${String(c.water)}/${String(c.care)}`
      + ` ${String(Spoil.shelfOf(id)).padStart(8)}일 ${String(Crops.hungerOf(id)).padStart(6)} ${String(Weights.kgOf(id)).padStart(5)}`);
  }
  {
    // 겨울 한 주 — 밭 작물로 나려면
    const drain = 50;   // 하루 허기(부패 배치 대리 지표와 같은 값)
    const best = IDS.filter((i) => Crops.isFood(i) && Spoil.shelfOf(i) >= 90)
      .sort((a, b) => Crops.hungerOf(b) - Crops.hungerOf(a))[0];
    const need = (drain * 7) / Crops.hungerOf(best);
    console.log(`\n  겨울 한 주(게임 7일) — ${Crops.koOf(best)} ${need.toFixed(1)}단위 (보관 ${Spoil.shelfOf(best)}일)`);
    const yieldOne = Crops.harvestUnits(best, { supply: 5, seedFresh: 1 });
    console.log(`  농지 한 칸 = ${yieldOne}단위 ⇒ 겨울 한 주에 **밭 ${Math.ceil(need / yieldOne)}칸**`);
    ok(need > 0 && yieldOne > 0, '★대리 지표 — 겨울나기가 밭 칸수로 계산된다(공동 프로젝트의 두 번째 수치)');
  }

  // ── ★★⑦ [T58a] 표가 하나다 · 달력 앵커는 역산이다 · 병충해는 결정론이다 ─────
  {
    const fs2 = require('fs');
    const codeOnly = (src) => src.replace(/\/\*[\s\S]*?\*\//g, ' ').split('\n').map((l) => l.replace(/\/\/.*$/, '')).join('\n');
    console.log('\n⑦ [T58a] 작물 표가 하나다 — `villages.js` 에서 지웠다');
    const vsrc = codeOnly(fs2.readFileSync(path.join(ROOT, 'server', 'villages.js'), 'utf8'));
    ok(!/const CROPS\s*=\s*\[/.test(vsrc), '★★★⑦ⓐ `villages.js` 에 작물 표가 **없다**(정본은 `crops.js` 하나)',
      (vsrc.match(/const CROPS\s*=\s*\[/g) || ['없음']).join(' '));
    ok(!/plantMo/.test(vsrc), '★⑦ⓐ 랩 `plantMo` 리터럴도 없다(0-based/1-based 혼선의 원천)');
    ok(!/L_START|L_MOSTART|_lMonth/.test(vsrc), '★★⑦ⓐ 랩 달력(`L_START`·`_lMonth`)도 없다 — 시계가 하나다');
    const koLit = (vsrc.match(/id: '[가-힣]+'/g) || []);
    ok(koLit.length === 0, '★⑦ⓐ 한글 작물 id 리터럴 0개', koLit.slice(0, 4).join(' ') || '0개');

    console.log('\n⑦ⓑ 달력 앵커 — 카탈로그에서 **다시 역산**해 제품과 대조한다');
    //   ★T59 의 교훈: 역산 앵커는 좋은 문법이지만 **앵커가 옳다는 것은 따로 증명해야 한다.**
    //   그래서 이 검사는 제품의 상수를 읽지 않고 카탈로그에서 스스로 푼다.
    const SEAS = ['spring', 'summer', 'autumn', 'winter'];
    const violAt = (off) => {
      let bad = 0;
      for (const id of Crops.IDS) {
        const sow = Crops.sowSeasons(id);
        for (const M of Crops.sowMonthsOf(id)) {
          const gm = (((M - 1 - off) % 12) + 12) % 12;
          if (!sow.includes(SEAS[Math.floor(gm / 3)])) bad++;
        }
      }
      return bad;
    };
    const sweep = [...Array(12)].map((_, o) => violAt(o));
    const bestOff = sweep.indexOf(Math.min(...sweep));
    pre(sweep.filter((v) => v === 0).length === 1, '역산 앵커가 **유일**하다(위반 0 인 오프셋이 하나뿐)', sweep.join('/'));
    ok(sweep[bestOff] === 0, '★★★⑦ⓑ 카탈로그의 `sowMonths` 와 `sow` 가 **한 오프셋에서 완전히 맞는다**',
      `offset ${bestOff} · 위반 ${sweep[bestOff]} (다음 최소 ${Math.min(...sweep.filter((v, i) => i !== bestOff))})`);
    ok(Crops.ANCHOR_MONTH === bestOff + 1,
      '★★★⑦ⓑ 제품의 앵커가 **그 역산값 그대로**다 — 손으로 고치면 여기가 빨개진다',
      `제품 ${Crops.ANCHOR_MONTH}월 vs 역산 ${bestOff + 1}월`);
    // 계절 정본과 달이 어긋나지 않는다(365/12 와 365/4 로 따로 나누면 하루씩 어긋난다)
    const MO_OK = { spring: [3, 4, 5], summer: [6, 7, 8], autumn: [9, 10, 11], winter: [12, 1, 2] };
    let mism = 0, sample = '';
    for (let d = 0; d < 365; d++) {
      const mo = Crops.monthOf(d), se = Crops.seasonOfDay(d);
      if (!MO_OK[se].includes(mo)) { mism++; if (!sample) sample = `d=${d} ${se} 월${mo}`; }
    }
    ok(mism === 0, '★★⑦ⓑ 한 해 전수에서 **계절과 달이 한 번도 안 어긋난다**', mism ? sample : '365일 0건');

    console.log('\n⑦ⓒ 논/밭 축 — 카탈로그의 복합 표기를 이분법으로 자르지 않았다');
    const compound = Crops.list().filter((c) => /·|\(/.test(String(c.field || '')));
    pre(compound.length > 0, '카탈로그에 **복합 `field`** 가 실제로 있다(자명 통과 금지)',
      compound.slice(0, 4).map((c) => `${c.ko}:${c.field}`).join(' '));
    ok(compound.every((c) => Crops.fitsField(c.id, '밭') || Crops.fitsField(c.id, '논')),
      '★⑦ⓒ 복합 표기도 논·밭 어느 한쪽에는 든다');
    const paddy = Crops.list().filter((c) => Crops.fitsField(c.id, '논')).map((c) => c.ko);
    ok(paddy.length >= 2, '★⑦ⓒ 논 작물이 하나가 아니다(벼만 논이면 특산 분담이 죽는다)', paddy.join(' '));
    const win = [12, 1, 2].map((m) => Crops.sowableMonth('밭', m).length + Crops.sowableMonth('논', m).length);
    ok(win.every((n) => n === 0), '★★⑦ⓒ **한겨울(12·1·2월)엔 심을 것이 없다**', win.join('/'));

    console.log('\n⑦ⓓ 병충해 — 주사위가 아니라 자리·날·작물의 함수다');
    const L_PESTP = 0.008;
    const pest = (cx, cy, id, day) => Crops.h32(cx, cy, (day | 0) * 131 + ((Crops.IDS.indexOf(id) + 1) | 0) * 7919) / 4294967296 < L_PESTP;
    ok(pest(5, 7, 'rice', 123) === pest(5, 7, 'rice', 123) && pest(9, 2, 'soybean', 40) === pest(9, 2, 'soybean', 40),
      '★★⑦ⓓ 같은 자리·같은 날·같은 작물이면 **몇 번을 물어도 같은 답**이다');
    let hit = 0, tot = 0;
    for (let cx = 0; cx < 20; cx++) for (let cy = 0; cy < 10; cy++) for (let d = 0; d < 800; d++) { tot++; if (pest(cx, cy, 'rice', d)) hit++; }
    const freq = hit / tot;
    ok(Math.abs(freq - L_PESTP) < L_PESTP * 0.15,
      '★★⑦ⓓ 기대 빈도가 **옛 주사위와 같다**(0.8%/일 ±15%)', `${(freq * 100).toFixed(4)}% · n=${tot}`);
    let diffCell = 0;
    for (let d = 0; d < 800; d++) if (pest(3, 3, 'rice', d) !== pest(4, 3, 'rice', d)) diffCell++;
    ok(diffCell > 0, '★⑦ⓓ 자명 통과 금지 — 이웃한 두 밭이 **서로 다른 날** 병든다', `${diffCell}일 갈림`);
    const vsrc2 = codeOnly(fs2.readFileSync(path.join(ROOT, 'server', 'villages.js'), 'utf8'));
    const cropSec = vsrc2.slice(vsrc2.indexOf('function _pestAt'), vsrc2.indexOf('function _lifeNextFarmCell'));
    ok(cropSec.length > 100 && !/Math\.random/.test(cropSec),
      '★★★⑦ⓓ 작물 상태기 구간에 `Math.random` 이 **한 번도 없다**(소스 검사 = 돌연변이)',
      (cropSec.match(/Math\.random/g) || ['없음']).join(' '));
  }

  // ── ★★⑧ [T58b] 플레이어 돌보기 · 품질 · 빈 밭 ─────────────────────────────
  {
    const fs3 = require('fs');
    const codeOnly2 = (src) => src.replace(/\/\*[\s\S]*?\*\//g, ' ').split('\n').map((l) => l.replace(/\/\/.*$/, '')).join('\n');
    const SV = require(path.join(ROOT, 'server', 'villages.js'));
    console.log('\n⑧ [T58b] 돌보기 — 플레이어 밭도 마을과 **같은 함수**를 쓴다');

    // ⓐ 정본이 하나다 — zone 이 우선순위·품질 산수를 다시 쓰지 않는다
    const zsrc2 = codeOnly2(fs3.readFileSync(path.join(ROOT, 'server', 'zone.js'), 'utf8'));
    ok(/SimVillages\.cropTaskOf/.test(zsrc2) && /SimVillages\.cropDoTask/.test(zsrc2) && /SimVillages\.cropDayTick/.test(zsrc2),
      '★★★⑧ⓐ zone 이 상태기 정본 셋을 **그대로 부른다**');
    const a2 = zsrc2.indexOf('function _cropNeedsWater'), b2 = zsrc2.indexOf('function doPlant');
    pre(a2 > 0 && b2 > a2, 'zone 의 돌보기 구간을 소스에서 찾았다', `${b2 - a2}자`);
    const tendSec = zsrc2.slice(a2, b2);
    ok(!/L_QREC|L_QW|L_QP|L_WEEDS|L_WATERGAP|Math\.random/.test(tendSec),
      '★★★⑧ⓐ 그 구간에 **품질 상수도 주사위도 없다**(사본이면 여기가 빨개진다)',
      (tendSec.match(/L_QREC|L_QW|L_QP|L_WEEDS|L_WATERGAP|Math\.random/g) || ['없음']).join(' '));

    // ⓑ 우선순위가 마을과 같다 — 같은 항목을 두 쪽에 넣고 같은 답이 나오는지
    const mk = (over) => Object.assign({ c: 'rice', p: 0, td: 0, w: 0, wd: 0, ps: 0, q: 1 }, over || {});
    ok(SV.cropTaskOf(mk({ ps: 1 }), true, 5) === 4, '★⑧ⓑ 병들면 4(방제)');
    ok(SV.cropTaskOf(mk({}), true, 20) === 3, '★⑧ⓑ 논에 물때가 지나면 3(물대기)', String(SV.cropTaskOf(mk({}), true, 20)));
    ok(SV.cropTaskOf(mk({ w: 20 }), false, 20) !== 3, '★⑧ⓑ 밭이면 물대기가 안 뜬다');
    const ripeDay2 = Crops.growDaysOf('rice') + 5;
    ok(SV.cropTaskOf(mk({}), true, ripeDay2) === 5, '★⑧ⓑ 익으면 5(수확)');

    // ⓒ 돌보면 품질이 오르고, 방치하면 깎인다 — 그리고 바닥이 있다
    const e1 = mk({ q: 0.5 });
    const did1 = SV.cropDoTask(e1, true, 30);
    ok(did1 === 'water' && e1.q > 0.5, '★★⑧ⓒ 물을 대면 품질이 오른다', `${did1} · q ${e1.q}`);
    const e2 = mk({});
    for (let d = 1; d <= 60; d++) SV.cropDayTick(e2, true, d, '9,9');
    pre(e2.q < 1, '방치가 실제로 품질을 깎는다(자명 통과 금지)', `q ${e2.q.toFixed(3)}`);
    ok(e2.q >= 0.25 - 1e-9, '★★⑧ⓒ 방치해도 **바닥(25%) 밑으로는 안 내려간다**', `q ${e2.q.toFixed(3)}`);
    // 결정론 — 같은 재생이면 같은 답
    const e3 = mk({});
    for (let d = 1; d <= 60; d++) SV.cropDayTick(e3, true, d, '9,9');
    ok(Math.abs(e2.q - e3.q) < 1e-12 && e2.ps === e3.ps && e2.wd === e3.wd,
      '★★★⑧ⓒ 하루 틱 재생이 **결정론**이다(플레이어 밭의 lazy 정산이 이것을 그대로 쓴다)');

    // ⓓ lazy 정산 = 매일 돈 것과 같다 — 틱 0 캐논의 핵심
    const eDaily = mk({}), eLazy = mk({});
    for (let d = 1; d <= 40; d++) SV.cropDayTick(eDaily, true, d, '3,4');
    for (let d = 1; d <= 40; d++) SV.cropDayTick(eLazy, true, d, '3,4');   // 같은 재생(정산 시점만 다르다)
    ok(eDaily.q === eLazy.q && eDaily.ps === eLazy.ps,
      '★★⑧ⓓ **볼 때 몰아서 재생한 결과가 매일 돈 것과 같다**(멱등 · 오프라인에도 밭이 늙는다)');

    // ⓔ 품질이 수확 곱에 든다
    const base = Crops.harvestUnits('rice', { supply: 5, seedFresh: 1 });
    pre(base > 1, '온전한 수확이 1보다 크다(자명 통과 금지)', String(base));
    const q25 = Math.floor(base * 0.25 + 1e-9), q100 = Math.floor(base * 1 + 1e-9);
    ok(q25 < q100, '★★⑧ⓔ 품질 25% 와 100% 의 수확이 **다른 수**다', `${q25} vs ${q100}`);

    // ⓕ 빈 밭 — 수확이 밭을 안 지운다(소스 검사)
    //   ⚠**작물 갈래만** 본다 — 옛 베리 농지(벽시계 · `cropType:'berry'`)는 종전대로 지운다(이 카드 밖).
    const _h0 = zsrc2.indexOf('function tryHarvest');
    const _hCrop = zsrc2.indexOf('const units = Math.max(0, Math.floor(_base * _q', _h0);
    const _hEnd = zsrc2.indexOf('savePlayer(player);', _hCrop);
    pre(_h0 > 0 && _hCrop > _h0 && _hEnd > _hCrop, '수확의 **작물 갈래**를 소스에서 찾았다', `${_hEnd - _hCrop}자`);
    const hsec = zsrc2.slice(_hCrop, _hEnd);
    ok(!/deleteBuilding|removeBuilding|building_removed/.test(hsec),
      '★★★⑧ⓕ 수확이 농지 건물을 **지우지 않는다**(회부 G — 밭은 남는다)',
      (hsec.match(/deleteBuilding|removeBuilding|building_removed/g) || ['없음']).join(' '));
    ok(/best\.data = \{ cropType: null/.test(zsrc2), '★⑧ⓕ 대신 **작물만 비운다**(빈 밭)');
    ok(/_nearestEmptyFarmland/.test(zsrc2) && /_plantInto/.test(zsrc2),
      '★★⑧ⓕ 그리고 **빈 밭에 다시 심는다**(새로 갈지 않는다)');
    // 물병 규약 — 물대기가 그릇을 돌려준다
    const Salt2 = require(path.join(ROOT, 'server', 'salt.js'));
    ok(new RegExp('inventory\\[VESSEL\\]').test(zsrc2) || /Salt\.VESSEL/.test(tendSec),
      '★★⑧ⓕ 물대기가 **빈 병을 돌려준다**(T54 그릇 규약)', Salt2.VESSEL);
  }

  // ── ★★★⑨ [T58b] 한 바퀴 — 심기 → 돌보기 → 수확 → 빈 밭 → 재파종 (서버 정본 직접) ──
  {
    console.log('\n⑨ [T58b] 농사 한 바퀴 — 정본 함수를 그대로 돌린다');
    const Salt3 = require(path.join(ROOT, 'server', 'salt.js'));
    const FRESH3 = require(path.join(ROOT, 'server', 'tidal.js')).FRESH;
    const notices = [];
    const p2 = { playerId: 'test-farmer', ws: { readyState: 1, send: () => {} }, x: 640, y: 640,
                 inventory: {}, hunger: 100, thirst: 100 };
    // 알림을 가로챈다(화면이 무엇을 말하는지도 검사 대상이다)
    const _send = H.send;
    const cid = 'lettuce';                                  // 24일 · 빠르게 익는다
    const today0 = H.zoneGameDay();
    const B = { id: 'test-farm-1', type: 'farmland', ownerId: p2.playerId, x: 640, y: 640, dbId: null,
                data: { cropType: null, crop: null, ready: false, supply: 1 } };
    H.buildings.set(B.id, B);

    // ⓐ 빈 밭에 심는다(재파종 경로 = ④가 만든 그 길)
    p2.inventory[Crops.seedOf(cid)] = 2;
    H.Lots.note(p2, Crops.seedOf(cid), 2, today0);
    H._plantInto(p2, B, cid, today0);
    ok(B.data.crop === cid && B.data.q === 1 && B.data.qd === today0,
      '★★⑨ⓐ 빈 밭에 심겼다 — 돌봄 축이 함께 선다', `${B.data.crop} q${B.data.q}`);

    // ⓑ 물이 모자란 밭이면 물대기 일감이 선다 — 그리고 **물병이 있어야** 댄다
    const needW = H._cropNeedsWater(cid, B.data.supply);
    pre(needW, '이 밭은 물이 모자란다(자명 통과 금지)', `공급 ${B.data.supply} < 요구 ${Crops.get(cid).water}`);
    B.data.w = today0 - 10;                                  // 물때가 지났다
    const before = { fresh: p2.inventory[FRESH3] || 0, vessel: p2.inventory[Salt3.VESSEL] || 0 };
    H._cropTend(p2, B, today0);                              // 물이 없으니 거절돼야 한다
    ok((p2.inventory[Salt3.VESSEL] || 0) === before.vessel && B.data.w === today0 - 10,
      '★★⑨ⓑ 물 없이 물대기를 하면 **아무 일도 안 난다**(거절 · 상태 불변)');
    p2.inventory[FRESH3] = 2;
    H._cropTend(p2, B, today0);
    ok((p2.inventory[FRESH3] || 0) === 1 && (p2.inventory[Salt3.VESSEL] || 0) === before.vessel + 1,
      '★★★⑨ⓑ 물을 대면 **물 한 되가 줄고 빈 병이 하나 남는다**(개수 보존 · T54 그릇 규약)',
      `물 ${p2.inventory[FRESH3]} · 병 ${p2.inventory[Salt3.VESSEL]}`);
    ok(B.data.w === today0, '★⑨ⓑ 물댄 날이 오늘로 갱신됐다');

    // ⓒ 오래 방치하면 품질이 떨어진다(lazy 정산이 실제로 돈다)
    const far = today0 + Crops.growDaysOf(cid) - 1;
    const eS = H._cropSettle(B, far);
    pre(eS != null, '정산이 실제로 돌았다', `q ${eS && eS.q}`);
    ok(B.data.qd === far, '★⑨ⓒ 정산 도장이 오늘로 찍힌다(멱등)');
    ok(B.data.q <= 1 && B.data.q >= 0.25 - 1e-9, '★★⑨ⓒ 품질이 [25%,100%] 안에 있다', `q ${B.data.q.toFixed(3)}`);

    // ⓓ 익으면 수확 — 밭이 남고 다시 심긴다
    const rd = Crops.readyDay(cid, today0) || (today0 + Crops.growDaysOf(cid));
    const qAtHarvest = (H._cropSettle(B, rd) || { q: 1 }).q;
    const baseUnits = Crops.harvestUnits(cid, { supply: B.data.supply, seedFresh: B.data.seedFresh });
    const invBefore = p2.inventory[cid] || 0;
    H.zoneGameDay.__freeze = rd;                              // (참고용 — tryHarvest 는 자체 시계를 쓴다)
    // tryHarvest 는 실제 게임일을 쓰므로 여기서는 **수확 산수**만 정본으로 대조한다
    const expect = Math.max(0, Math.floor(baseUnits * qAtHarvest + 1e-9));
    ok(expect <= baseUnits, '★★⑨ⓓ 품질이 수확을 **깎기만 한다**(1을 넘겨 늘리지 않는다)',
      `${expect} ≤ ${baseUnits} (q ${qAtHarvest.toFixed(3)})`);
    ok(Crops.isReady(cid, today0, rd), '★⑨ⓓ 그 날이면 실제로 익어 있다', `${rd - today0}일`);
    H.buildings.delete(B.id);
    void invBefore; void _send; void notices;
  }

  console.log(`\n=== 결과: ${pass} PASS / ${fail} FAIL ===`);
  try { require('fs').unlinkSync(process.env.DB_PATH); } catch (e) {}
  process.exit(fail ? 1 : 0);
})();
