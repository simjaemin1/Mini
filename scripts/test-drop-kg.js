#!/usr/bin/env node
// @regress
// === scripts/test-drop-kg.js — T636 곰 = 반달가슴곰 · 사냥 드롭 kg(T607 몸무게 × T629 수율) · ★T647 켬 기본 · 사슴 존별 아종 · 사체 고기 먹기 ===
//
// ★왜 [재민 10-04 "곰은 한반도니까 반달곰 · 불곰은 나중 존에서" · "아이템 무게는 전부 킬로그램"]
//   품목 한 개의 무게는 kg 인데(사슴·들짐승고기 1.0kg) 카탈로그 드롭(`animals.js drops`)은 몸무게에서 유도한 근거가 없었다
//   (사슴 한 마리 고기 3개 = 3kg · T629 §0). ★[T647 · PM 결정(위임) · 재민 거부권] 손잡이 `T636_DROP_KG` 는 **없음 = 켬** ·
//   `=0` = 종전(되돌림 하나 = main 바이트) · 사슴은 존마다 그 존의 아종 칸 · 사체 고기(`meat_game`)는 열량 줄을 달아 손에서 먹는다.
//   이 하네스가 지키는 것:
//
//  ① 곰 짝 — 존 칸 표에 곰 = 반달가슴곰(있음/있음) · 떼 = 반달가슴곰 칸(1 = 카탈로그 pack) · 불곰은 나중 존 한 줄(게임 id 없음)
//  ② 수 = 문서 — 몸무게는 T607 칸 글자 · 수율은 T629 칸 글자(새 수 0 · 문서를 읽어 대조) · 사슴 존 → 아종 칸
//  ③ 되돌림(`=0`) = 옛 줄 — 36종 전부 `dropsOf` 가 카탈로그 `drops` **그 객체**(같은 참조) · 없음·빈 값·'1' 은 켬
//  ④ 켬(기본) — 고기 칸만 kg: 사슴 한반도 33 · 닛폰 21 · 존 모름 27(두 아종 가운데) · 곰 36 · 꿩 1 · 가죽·뼈·뿔·모피 그대로 ·
//     표 밖 종 그대로(같은 참조) · 켬 드롭 객체는 얼어 있다
//  ⑤ 따라오는 것 — 사체 고기 열량(`kcal.js` meat_game 1,200/kg · USDA) ÷ 하루치 2,450 → 한 번 사냥 몇 날치 · 짐 무게(T618 지게 50~70kg)
//  ⑥ 실기 — 존을 임시 DB·가벼운 판으로 띄워(test-tame 꼴) 사체를 세우고 **진짜 도살**(`butcherCorpse`) → **진짜 먹기**(`doEat`) →
//     포만 · 한반도 33 / 닛폰 21 / 되돌림 3(먹기 거절) · 곳간·거래 환산은 켬/되돌림 같다(meat_game 은 곳간 넣기 표 밖)
//
// 실행: node scripts/test-drop-kg.js      (⑥ 이 존을 세 번 띄운다 — 가벼운 판이라 몇 초)
'use strict';
const path = require('path');
const fs = require('fs');
const { execFileSync } = require('child_process');
const ROOT = path.resolve(__dirname, '..');
const SV = (p) => path.join(ROOT, 'server', p);

// ══ 하위 실행 ⑥ — 존 하나를 띄워 사체 → 도살 → 먹기 ════════════════════════════════════════
if (process.env.T636_SUB === 'butcher') {
  const TMP = `/tmp/t636-drop-kg-${process.pid}.db`;
  for (const f of [TMP, TMP + '-wal', TMP + '-shm']) { try { fs.unlinkSync(f); } catch (e) {} }
  process.env.ZONE_ID = process.env.T636_SUB_ZONE || 'hanbando';
  process.env.PORT = String(41900 + (process.pid % 90));
  process.env.DB_PATH = TMP;
  process.env.ENABLE_VILLAGES = '0'; process.env.ENABLE_WILDLIFE = '0'; process.env.ENABLE_BANDITS = '0'; process.env.ENABLE_ROADS = '0';
  const _log = console.log; console.log = () => {}; console.warn = () => {}; console.error = () => {};
  const Zone = require(SV('zone.js'));
  const H = Zone.__testBind();
  const notes = [];
  const out = {};
  const mkP = (tag) => ({ pid: `p_${tag}`, playerId: `anon_t636_${tag}`, name: '사냥꾼', persistent: false,
    x: 5000, y: 5000, floor: 0, hp: 100, maxHp: 100, hunger: 50, thirst: 100,
    inventory: {}, toolItems: [], equipment: [], equipSlots: {}, craftSkill: {}, oreLedger: {}, oreCarry: {}, dishes: [], lots: {},
    isNpc: false, isDown: false, vx: 0, vy: 0,
    ws: { readyState: 1, send: (s) => { try { const o = JSON.parse(s); if (o.type === 'notice') notes.push(o.text); } catch (e) {} } } });
  for (const type of ['deer', 'bear', 'pheasant', 'wolf']) {
    const p = mkP(type);
    const c = H.spawnCorpse({ type, x: 5010, y: 5000 }, p.playerId);
    H.butcherCorpse(p, c.cid);
    out[type] = { inv: Object.assign({}, p.inventory), left: H.corpses.has(c.cid) };
    if (type === 'deer') {   // 도살 → 먹기 → 포만(손에서 한 개)
      const h0 = p.hunger, hp0 = p.hp, n0 = p.inventory.meat_game || 0;
      H.doEat(p, 'meat_game', 1);
      out.eat = { h0, h1: p.hunger, hp0, hp1: p.hp, n0, n1: p.inventory.meat_game || 0, eff: H.FOOD_EFFECTS.meat_game || null };
    }
  }
  // 곳간·거래 환산 — 곳간 넣기 표의 품목마다 열량 환산(넣기·거래소 `econUnitsOf` · 꺼내기·보상 `itemsOf`)
  const V = require(SV('villages.js'));
  const map = V.playerVillageDepositMap();
  const conv = {};
  for (const k of Object.keys(map).sort()) conv[k] = [H.Kcal.econUnitsOf(k, 1), H.Kcal.kcalOf(k) > 0 ? H.Kcal.itemsOf(k, 1) : null];
  console.log = _log;
  console.log(JSON.stringify({ zone: process.env.ZONE_ID, knob: process.env.T636_DROP_KG === undefined ? null : process.env.T636_DROP_KG, out, notes,
    inMap: Object.prototype.hasOwnProperty.call(map, 'meat_game'), conv }));
  for (const f of [TMP, TMP + '-wal', TMP + '-shm']) { try { fs.unlinkSync(f); } catch (e) {} }
  process.exit(0);
}

// ══ 본 실행 ═══════════════════════════════════════════════════════════════════════════════
delete process.env.T636_DROP_KG;
const A = require(SV('animals.js'));
const K = require(SV('kcal.js'));
const W = require(SV('weights.js'));
const Carry = require(SV('carry.js'));
const PI = require(SV('player-items.js'));
const ZSRC = fs.readFileSync(SV('zone.js'), 'utf8');
const KSRC = fs.readFileSync(SV('kcal.js'), 'utf8');
const D607 = fs.readFileSync(path.join(ROOT, '설계', '고증_짐승.md'), 'utf8');
const D629 = fs.readFileSync(path.join(ROOT, '설계', '고증_사냥수율.md'), 'utf8');
const D618 = fs.readFileSync(path.join(ROOT, '설계', '고증_짐나르기.md'), 'utf8');

let pass = 0, fail = 0;
const ok = (c, m, x) => { c ? pass++ : fail++; console.log((c ? '  ✓ ' : '  ✗ ') + m + (x !== undefined && x !== '' ? `  ${x}` : '')); };
const pre = (c, m, x) => { if (!c) { fail++; console.log('  ✗ [상황] ' + m + (x !== undefined ? `  ${x}` : '')); } else console.log('  · [상황] ' + m + (x !== undefined ? `  ${x}` : '')); };
const say = (m) => console.log(m);
const withEnv = (env, fn) => { const old = {}; for (const k of Object.keys(env)) { old[k] = process.env[k]; if (env[k] == null) delete process.env[k]; else process.env[k] = env[k]; }
  try { return fn(); } finally { for (const k of Object.keys(env)) { if (old[k] === undefined) delete process.env[k]; else process.env[k] = old[k]; } } };
// 마크다운 표 한 줄 → 칸(굵게 표시를 벗긴다)
const rowOf = (doc, head, name) => {
  const lines = doc.split('\n'); const h = lines.findIndex((l) => head.test(l));
  for (let i = h + 2; h >= 0 && i < lines.length && /^\|/.test(lines[i]); i++) {
    const c = lines[i].split('|').slice(1, -1).map((s) => s.trim().replace(/\*\*/g, ''));
    if (c[0] === name) return c;
  }
  return null;
};
const nums = (v) => (typeof v === 'number' ? [v] : Array.isArray(v) ? v.slice() : Object.values(v).flatMap(nums));
const hasNum = (cell, n) => new RegExp('(^|[^0-9.])' + String(n).replace('.', '\\.') + '($|[^0-9])').test(cell);
const T607_NAME = { deer: '사슴(꽃사슴/시카디어)', bear: '반달가슴곰', pheasant: '꿩' };
const T629_NAME = { deer: '사슴', bear: '곰(반달가슴곰)', pheasant: '꿩' };

say('\n=== 곰 = 반달가슴곰 · 사냥 드롭 kg · 켬 기본 · 사슴 존별 · 사체 고기 먹기 (T636 · T647) ===');

// ── ① 곰 짝 ─────────────────────────────────────────────────────────────────────────────
say('\n① 곰 짝 — 곰 = 반달가슴곰(재민 10-04) · 불곰은 나중 존');
{
  const r = A.ZONE_FAUNA.find((x) => x.id === 'bear');
  const c607 = rowOf(D607, /^\|\s*종\s*\|\s*한반도\s*\|/, '반달가슴곰');
  pre(!!c607, 'T607 ① 표에서 반달가슴곰 줄을 찾았다', c607 ? c607.slice(1, 3).join(' / ') : '없음');
  const word = (s) => { const m = String(s || '').match(/^(있음|없음|드묾)/); return m ? m[1] : null; };
  ok(!!r && r.t607 === '반달가슴곰' && c607 && r.hb === word(c607[1]) && r.np === word(c607[2]), '★★① 존 칸 표의 곰 = 반달가슴곰 줄 · 칸이 T607 글자 그대로', r ? `${r.hb}/${r.np}` : '없음');
  ok(A.faunaCell('bear', 'hanbando') === '있음' && A.faunaCell('bear', 'nippon') === '있음', '① 두 존 다 있음 — 존 칸 손잡이를 켜도 곰은 안 빠진다');
  ok(c607 && /^1\(단독\)/.test(c607[5]) && A.ANIMALS.bear.pack === 1, '① 곰 떼 = 반달가슴곰 칸 "1(단독)" = 카탈로그 pack 1(무변)', c607 ? c607[5] : '');
  ok(A.FAUNA_LATER.length === 1 && A.FAUNA_LATER[0].t607 === '불곰' && /나중 존/.test(A.FAUNA_LATER[0].note) && !A.ANIMALS.brown_bear,
    '① 불곰 = 나중 존 한 줄(주석) — 게임 id 없음(지금 존에 안 남)');
}

// ── ② 수 = 문서 ─────────────────────────────────────────────────────────────────────────
say('\n② 수 = 문서 — 몸무게는 T607 칸 · 수율은 T629 칸(새 수 0) · 사슴 존 → 아종 칸');
{
  ok(A.DROP_KG.length === 3 && A.DROP_KG.map((r) => r.id).join() === 'deer,bear,pheasant', '② 표 줄 = T607 무게 칸과 T629 수율 칸이 둘 다 있는 게임 종 셋(사슴·곰·꿩)');
  for (const r of A.DROP_KG) {
    const c607 = rowOf(D607, /^\|\s*종\s*\|\s*한반도\s*\|/, T607_NAME[r.id]);
    const c629 = rowOf(D629, /^\|\s*종\s*\|\s*지육/, T629_NAME[r.id]);
    pre(!!c607 && !!c629, `${r.id} — 두 문서에서 줄을 찾았다`, `${T607_NAME[r.id]} · ${T629_NAME[r.id]}`);
    const miss607 = nums(r.live).filter((n) => !hasNum(c607 ? c607[4] : '', n));
    ok(miss607.length === 0, `★② ${r.id} 몸무게 수가 T607 몸무게 칸 글자에 있다`, `${nums(r.live).join(' · ')}${miss607.length ? ' — 없음 ' + miss607.join(',') : ''}`);
    const pct = r.yld.map((x) => Math.round(x * 100));
    const row629 = c629 ? c629.join(' | ') : '';
    const miss629 = pct.filter((p) => !new RegExp('≈\\s*' + p + '%').test(row629));
    ok(miss629.length === 0, `★② ${r.id} 수율이 T629 줄 글자(≈n%)에 있다`, `${pct.map((p) => p + '%').join(' × ')}${miss629.length ? ' — 없음 ' + miss629.join(',') : ''}`);
  }
  // ★[T647] 사슴 존 → 아종 칸 — 칸 이름이 T607 글자의 두 아종(만주아종 68~109 · 일본아종 40~70)과 짝
  const deer = A.DROP_KG.find((r) => r.id === 'deer'), c = rowOf(D607, /^\|\s*종\s*\|\s*한반도\s*\|/, T607_NAME.deer);
  const cell = c ? c[4] : '';
  ok(deer.zones && deer.zones.hanbando === 'manchu' && deer.zones.nippon === 'nippon'
    && /만주아종 수컷68~109/.test(cell) && /일본아종 수컷40~70/.test(cell)
    && deer.live.manchu.join() === '68,109' && deer.live.nippon.join() === '40,70',
  '★★② [T647] 사슴 존 → 아종 — 한반도 = 만주아종 칸(68~109) · 닛폰 = 일본아종 칸(40~70) · 두 칸 다 T607 글자', cell);
  ok(Object.keys(deer.zones).length === 2 && A.DROP_KG.filter((r) => r.zones).length === 1, '② 존별 칸은 사슴 하나 · 두 존만(곰·꿩은 T607 이 존을 안 가른다)');
  const off = ['wild_boar', 'tiger', 'leopard', 'wolf', 'red_fox', 'arctic_hare', 'quail'];
  ok(off.every((id) => !A.dropKgRow(id)), '② 표 밖 종 = 지금 값(멧돼지 T629 미확인 · 호랑이·표범·늑대·여우 T629 줄 없음 · 북극토끼 T607 무게 없음 · 메추라기 T607 무게 미확인)');
  // ★[T647] 사체 고기 열량 줄 — 출처 줄(USDA FDC 173855 · 120 kcal/100g)과 값(× 10)이 같은 말을 한다
  const m = KSRC.match(/KCAL_PER_KG\.meat_game = (\d+);\s*\/\/ USDA FDC (\d+) — (\d+) kcal\/100g/);
  ok(!!m && +m[1] === +m[3] * 10 && m[2] === '173855' && /Game meat, deer, raw/.test(KSRC), '★② [T647] meat_game 열량 = 출처 줄 그대로(USDA FDC 173855 "Game meat, deer, raw" 120 kcal/100g × 10)', m ? `${m[1]} kcal/kg` : '없음');
}

// ── ③ 되돌림(=0) = 옛 줄 ────────────────────────────────────────────────────────────────
say('\n③ 되돌림(T636_DROP_KG=0) = 옛 줄 — dropsOf 가 카탈로그 drops 그 객체');
{
  ok(A.dropKgOn() === true, '★★③ [T647] 손잡이 없음 = **켬**(기본)');
  withEnv({ T636_DROP_KG: '' }, () => ok(A.dropKgOn() === true, "③ 빈 값도 켬(없음과 같다)"));
  withEnv({ T636_DROP_KG: '1' }, () => ok(A.dropKgOn() === true, "③ '1' 도 켬"));
  const ids = Object.keys(A.ANIMALS);
  withEnv({ T636_DROP_KG: '0' }, () => {
    ok(A.dropKgOn() === false, "★③ '0' 하나만 끔(되돌림)");
    const bad = [];
    for (const id of ids) for (const z of [undefined, 'hanbando', 'nippon']) if (A.dropsOf(id, z) !== A.ANIMALS[id].drops) bad.push(id + (z ? '@' + z : ''));
    ok(bad.length === 0, '★★③ 되돌림 — 36종 × 존 셋 전부 카탈로그 drops 그 객체(글자가 아니라 객체째 · main 바이트)', `다른 것 ${bad.length}`);
  });
  ok(/const drops = \(def && def\.drops\) \? dropsOf\(mob\.type, ZONE_ID\) : \{ meat_game: 1, leather: 1 \};/.test(ZSRC), '③ 배선 — zone.js spawnCorpse 가 dropsOf 하나를 존 id 와 함께 부른다(옛 대체값 그대로)');
  ok((ZSRC.match(/def\.drops/g) || []).length === 1, '③ 사체 드롭을 읽는 자리는 그 한 곳뿐(다른 길 0)');
  ok(/if \(dropKgOn\(\)\) FOOD_EFFECTS\.meat_game = Object\.assign\(\{\}, FOOD_EFFECTS\.meat_raw\);/.test(ZSRC)
    && /if \(require\('\.\/animals'\)\.dropKgOn\(\)\) KCAL_PER_KG\.meat_game = /.test(KSRC),
  '③ 먹기 표 · 열량 줄도 같은 손잡이 뒤(되돌림이면 둘 다 없다 — 실기는 ⑥)');
}

// ── ④ 켬(기본) ──────────────────────────────────────────────────────────────────────────
say('\n④ 켬(기본) — 고기 칸만 kg · 사슴은 존의 아종 · 가죽·뼈·뿔·모피 그대로');
const ON = {}, ONZ = {};
for (const id of Object.keys(A.ANIMALS)) { ON[id] = A.dropsOf(id); ONZ[id] = { hanbando: A.dropsOf(id, 'hanbando'), nippon: A.dropsOf(id, 'nippon') }; }
{
  const R = Object.fromEntries(A.DROP_KG.map((r) => [r.id, A.dropKgRow(r.id)]));
  const Rh = A.dropKgRow('deer', 'hanbando'), Rn = A.dropKgRow('deer', 'nippon');
  ok(ONZ.deer.hanbando.meat_game === 33 && Rh.sub === 'manchu', '★★④ 사슴 한반도 = 만주아종 88.5kg × 37.44% → 고기 33', `${Rh.meatKg.toFixed(2)}kg`);
  ok(ONZ.deer.nippon.meat_game === 21 && Rn.sub === 'nippon', '★★④ 사슴 닛폰 = 일본아종 55kg × 37.44% → 고기 21', `${Rn.meatKg.toFixed(2)}kg`);
  ok(ON.deer.meat_game === 27 && A.dropsOf('deer', 'jungwon_n').meat_game === 27 && R.deer.sub === null,
    '★④ 존 모름 · 표에 없는 존(중원북) = 두 아종 가운데 71.75kg → 27(T636 값)', `${R.deer.meatKg.toFixed(2)}kg`);
  ok(ON.bear.meat_game === 36 && ONZ.bear.hanbando.meat_game === 36 && ONZ.bear.nippon.meat_game === 36, '★④ 곰(반달가슴곰) 6 → 36(존 안 가름)', `생체 ${R.bear.liveKg} × 33% = ${R.bear.meatKg.toFixed(2)}kg`);
  ok(ON.pheasant.meat_chicken === 1, '④ 꿩 닭고기 1 → 1 — 0.735kg = 한 개 0.5kg 의 1.47배 → 반올림 1(지금과 같음)', `${R.pheasant.meatKg.toFixed(3)}kg ÷ ${R.pheasant.unitKg}`);
  let other = 0;
  for (const r of A.DROP_KG) for (const [k, v] of Object.entries(A.ANIMALS[r.id].drops)) for (const d of [ON[r.id], ONZ[r.id].hanbando, ONZ[r.id].nippon]) if (k !== r.item && d[k] !== v) other++;
  ok(other === 0, '★④ 가죽·뼈·뿔·모피·깃털은 지금 값(T629 에 개수로 옮길 수가 없다 — 가죽은 넓이 m² 하나)', `다른 칸 ${other}`);
  const same = Object.keys(A.ANIMALS).filter((id) => !A.dropKgRow(id)).every((id) => ON[id] === A.ANIMALS[id].drops && ONZ[id].hanbando === A.ANIMALS[id].drops);
  ok(same, '④ 표 밖 종은 켬에서도 카탈로그 그 객체');
  ok(Object.isFrozen(ONZ.deer.hanbando) && !Object.isFrozen(A.ANIMALS.deer.drops) && ONZ.deer.hanbando !== ONZ.deer.nippon, '④ 켬 드롭은 아종 칸마다 얼린 사본(카탈로그는 안 건드린다)');
  const changed = Object.keys(A.ANIMALS).filter((id) => JSON.stringify(ON[id]) !== JSON.stringify(A.ANIMALS[id].drops));
  ok(changed.join() === 'bear,deer', '★④ 켬에서 드롭이 바뀌는 종 = 둘(곰 · 사슴)', changed.join(',') || '0');
  let round = 0; for (const r of [...Object.values(R), Rh, Rn]) if (Math.abs(r.units * r.unitKg - r.meatKg) > r.unitKg / 2 + 1e-9) round++;
  ok(round === 0, '④ 낱개 × 한 개 kg 은 셈한 고기 kg 의 반올림 안(반 개 이내)', `어긋남 ${round}`);
}

// ── ⑤ 따라오는 것 ───────────────────────────────────────────────────────────────────────
say('\n⑤ 따라오는 것 — 한 번 사냥 몇 날치(사체 고기 열량) · 짐 무게');
{
  const perKg = K.kcalPerKg('meat_game'), day = K.DAY_KCAL;
  pre(perKg === 1200 && day === 2450, '[T647] kcal.js 사체 고기(meat_game) kcal/kg · 하루치', `${perKg} kcal/kg · 하루 ${day} kcal`);
  const days = (n) => +(n * W.kgOf('meat_game') * perKg / day).toFixed(2);
  ok(days(ONZ.deer.hanbando.meat_game) > 16 && days(ONZ.deer.hanbando.meat_game) < 16.5, '★⑤ 사슴 한 마리 = 한 사람 몇 날치 — 한반도',
    `끔 ${days(A.ANIMALS.deer.drops.meat_game)}날 → 켬 ${days(ONZ.deer.hanbando.meat_game)}날`);
  ok(days(ONZ.deer.nippon.meat_game) > 10 && days(ONZ.deer.nippon.meat_game) < 10.5, '⑤ 닛폰', `${days(ONZ.deer.nippon.meat_game)}날`);
  ok(days(ON.bear.meat_game) > 17 && days(ON.bear.meat_game) < 18, '⑤ 곰 한 마리', `끔 ${days(A.ANIMALS.bear.drops.meat_game)}날 → 켬 ${days(ON.bear.meat_game)}날`);
  const kgOf = (d) => Object.entries(d).reduce((s, [k, n]) => s + n * W.kgOf(k), 0);
  const m618 = D618.match(/(\d+)\s*[∼~]\s*(\d+)\s*㎏/);
  pre(!!m618, 'T618 지게 무게 칸을 읽었다', m618 ? `${m618[1]}~${m618[2]}kg` : '없음');
  const lo = m618 ? +m618[1] : 50;
  ok([ONZ.deer.hanbando, ONZ.deer.nippon, ON.bear].every((d) => kgOf(d) <= lo), '★⑤ 켬 사슴(두 존)·곰 한 마리 짐 = T618 지게 한 짐(50~70kg) 안 — 한 번에 진다',
    `사슴 한반도 ${kgOf(ONZ.deer.hanbando).toFixed(1)} · 닛폰 ${kgOf(ONZ.deer.nippon).toFixed(1)} · 곰 ${kgOf(ON.bear).toFixed(1)}kg`);
  const cap = Carry.CFG.CAP_KG, jige = PI.CARRIER_MAX_KG;
  ok(kgOf(ONZ.deer.hanbando) > cap && kgOf(ONZ.deer.hanbando) <= cap + jige, '⑤ 플레이어 — 한반도 사슴 한 마리는 맨몸 적재를 넘고 지게(만렙 +20)면 안에 든다', `맨몸 ${cap}kg · 지게 ≤${cap + jige}kg`);
}

// ── ⑥ 실기 — 진짜 도살 · 진짜 먹기 ──────────────────────────────────────────────────────
say('\n⑥ 실기 — 존을 띄워 사체 → 도살(butcherCorpse) → 먹기(doEat)');
{
  const sub = (env) => JSON.parse(execFileSync(process.execPath, [__filename], { env: Object.assign({}, process.env, env), stdio: 'pipe' }).toString().trim().split('\n').pop());
  const hb = sub({ T636_SUB: 'butcher', T636_SUB_ZONE: 'hanbando' });
  const np = sub({ T636_SUB: 'butcher', T636_SUB_ZONE: 'nippon' });
  const off = sub({ T636_SUB: 'butcher', T636_SUB_ZONE: 'hanbando', T636_DROP_KG: '0' });
  pre(off.out.deer && off.out.deer.inv.meat_game === 3 && !off.out.deer.left, '되돌림 — 사슴을 도살하면 고기 3(카탈로그 · 이게 아니면 아래가 자명 통과)', JSON.stringify(off.out.deer && off.out.deer.inv));
  ok(hb.out.deer.inv.meat_game === 33 && hb.out.deer.inv.leather === 2 && hb.out.deer.inv.horn === 1, '★★⑥ 한반도(기본 켬) — 사슴 도살 인벤 고기 33 · 가죽 2 · 뿔 1', JSON.stringify(hb.out.deer.inv));
  ok(np.out.deer.inv.meat_game === 21, '★★⑥ 닛폰 — 사슴 도살 고기 21(일본아종)', JSON.stringify(np.out.deer.inv));
  ok(hb.out.bear.inv.meat_game === 36 && np.out.bear.inv.meat_game === 36 && off.out.bear.inv.meat_game === 6, '⑥ 곰 도살 고기 36(두 존) · 되돌림 6', JSON.stringify(hb.out.bear.inv));
  ok(JSON.stringify(hb.out.wolf.inv) === JSON.stringify(off.out.wolf.inv) && JSON.stringify(hb.out.pheasant.inv) === JSON.stringify(off.out.pheasant.inv),
    '⑥ 늑대(표 밖) · 꿩(반올림 같음)은 켬 · 되돌림 인벤이 같다', JSON.stringify(hb.out.wolf.inv));
  ok((hb.notes || []).some((s) => /도살 \+meat_game 33/.test(s)), '⑥ 도살 알림이 켬 수를 말한다', (hb.notes || []).find((s) => /도살/.test(s)) || '');
  // ★[T647] 먹기 — 손에서 한 개
  const e = hb.out.eat || {};
  pre(e.n0 === 33 && e.h0 === 50, '먹기 전 — 손에 사슴고기 33 · 허기 50');
  ok(!!e.eff && e.eff.hunger > 24 && e.eff.hunger < 25 && Math.abs(e.eff.hunger - K.hungerOf('meat_game')) < 1e-9, '★★⑥ [T647] 먹기 표에 사체 고기가 있다 — 포만은 열량 유도(1kg × 1,200kcal ÷ 2,450 × 하루 허기 50)', JSON.stringify(e.eff));
  ok(e.n1 === 32 && Math.abs((e.h1 - e.h0) - e.eff.hunger) < 1e-6, '★★⑥ [T647] 존 판에서 진짜로 먹었다 — 손 33 → 32 · 허기 +24.49', `허기 ${e.h0} → ${+e.h1.toFixed(2)}`);
  ok(e.hp1 === e.hp0 + e.eff.hpDelta && e.eff.hpDelta === -3 && e.eff.thirst === 0, '⑥ 날고기 줄 그대로 — HP −3 · 갈증 0(새 수 0)', `HP ${e.hp0} → ${e.hp1}`);
  const oe = off.out.eat || {};
  ok(!oe.eff && oe.n1 === oe.n0 && oe.h1 === oe.h0 && (off.notes || []).some((s) => /먹을 수 없는 아이템: meat_game/.test(s)), '★⑥ 되돌림 — 먹기 표에 없다("먹을 수 없는 아이템" · 허기 · 손 그대로 = main)', `손 ${oe.n0} → ${oe.n1}`);
  // ★곳간·거래 무변 — meat_game 은 곳간 넣기 표 밖 · 표의 품목 환산은 켬 · 되돌림 같다
  ok(hb.inMap === false && off.inMap === false, '★⑥ 곳간·거래 — meat_game 은 곳간 넣기 표(PV_DEPOSIT_MAP) 밖(넣기·꺼내기·거래소·게시판이 이 품목을 안 다룬다)');
  ok(Object.keys(hb.conv).length > 20 && JSON.stringify(hb.conv) === JSON.stringify(off.conv), '★★⑥ 곳간·거래 환산 — 표의 품목마다 econUnitsOf · itemsOf 가 켬 · 되돌림 같다', `${Object.keys(hb.conv).length}품목`);
  ok(['hb', 'np', 'off'].every((k) => Object.values(({ hb, np, off })[k].out).every((o) => !o || o.left === undefined || !o.left)), '⑥ 도살한 사체는 지워졌다(두 번 못 바른다)');
}

console.log(`\n=== ${pass + fail}건 중 PASS ${pass} · FAIL ${fail} ===\n`);
process.exit(fail ? 1 : 0);
