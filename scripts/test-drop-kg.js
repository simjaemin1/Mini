#!/usr/bin/env node
// @regress
// === scripts/test-drop-kg.js — T636 곰 = 반달가슴곰 · 사냥 드롭을 킬로그램으로(T607 몸무게 × T629 수율 · 손잡이 `T636_DROP_KG` 기본 끔) ===
//
// ★왜 [재민 10-04 "곰은 한반도니까 반달곰 · 불곰은 나중 존에서" · "아이템 무게는 전부 킬로그램"]
//   품목 한 개의 무게는 kg 인데(사슴·들짐승고기 1.0kg) 카탈로그 드롭(`animals.js drops`)은 몸무게에서 유도한 근거가 없었다
//   (사슴 한 마리 고기 3개 = 3kg · T629 §0). 이 하네스가 지키는 것:
//
//  ① 곰 짝 — 존 칸 표에 곰 = 반달가슴곰(있음/있음) · 떼 = 반달가슴곰 칸(1 = 카탈로그 pack) · 불곰은 나중 존 한 줄(게임 id 없음)
//  ② 수 = 문서 — 몸무게는 T607 칸 글자 · 수율은 T629 칸 글자(새 수 0 · 문서를 읽어 대조)
//  ③ 끔 = 옛 줄 — 36종 전부 `dropsOf` 가 카탈로그 `drops` **그 객체**(같은 참조) · zone.js 사체 배선이 이 함수 하나
//  ④ 켬 — 고기 칸만 kg: 사슴 3 → 27 · 곰 6 → 36 · 꿩 1 → 1(0.735kg = 닭고기 1.47개 → 반올림 1) · 가죽·뼈·뿔·모피 그대로 ·
//     표 밖 종 그대로(같은 참조) · 켬 드롭 객체는 얼어 있다
//  ⑤ 따라오는 것 — 고기 kcal(`kcal.js` 고기 1,500/kg) ÷ 하루치 2,450 → 한 번 사냥 몇 날치 · 짐 무게(T618 지게 50~70kg) ·
//     플레이어 적재(`carry.js` 25kg + 지게 ≤20kg)
//  ⑥ 실기 — 존을 임시 DB·가벼운 판으로 띄워(test-tame 꼴) 사체를 세우고 **진짜 도살**(`butcherCorpse`) → 인벤 고기 끔 3·6 · 켬 27·36
//
// 실행: node scripts/test-drop-kg.js      (⑥ 이 존을 두 번 띄운다 — 가벼운 판이라 몇 초)
'use strict';
const path = require('path');
const fs = require('fs');
const { execFileSync } = require('child_process');
const ROOT = path.resolve(__dirname, '..');
const SV = (p) => path.join(ROOT, 'server', p);

// ══ 하위 실행 ⑥ — 존 하나를 띄워 사체 → 도살 ═══════════════════════════════════════════════
if (process.env.T636_SUB === 'butcher') {
  const TMP = `/tmp/t636-drop-kg-${process.pid}.db`;
  for (const f of [TMP, TMP + '-wal', TMP + '-shm']) { try { fs.unlinkSync(f); } catch (e) {} }
  process.env.ZONE_ID = 'hanbando';
  process.env.PORT = String(41900 + (process.pid % 90));
  process.env.DB_PATH = TMP;
  process.env.ENABLE_VILLAGES = '0'; process.env.ENABLE_WILDLIFE = '0'; process.env.ENABLE_BANDITS = '0'; process.env.ENABLE_ROADS = '0';
  const _log = console.log; console.log = () => {}; console.warn = () => {}; console.error = () => {};
  const Zone = require(SV('zone.js'));
  const H = Zone.__testBind();
  const notes = [];
  const out = {};
  for (const type of ['deer', 'bear', 'pheasant', 'wolf']) {
    const p = { playerId: `anon_t636_${type}`, name: '사냥꾼', x: 5000, y: 5000, floor: 0, inventory: {},
      ws: { readyState: 1, send: (s) => { try { const o = JSON.parse(s); if (o.type === 'notice') notes.push(o.text); } catch (e) {} } } };
    const c = H.spawnCorpse({ type, x: 5010, y: 5000 }, p.playerId);
    H.butcherCorpse(p, c.cid);
    out[type] = { inv: p.inventory, left: H.corpses.has(c.cid) };
  }
  console.log = _log;
  console.log(JSON.stringify({ knob: process.env.T636_DROP_KG || null, out, notes }));
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

say('\n=== 곰 = 반달가슴곰 · 사냥 드롭 kg (T636 · 손잡이 T636_DROP_KG 기본 끔) ===');

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
say('\n② 수 = 문서 — 몸무게는 T607 칸 · 수율은 T629 칸(새 수 0)');
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
  const off = ['wild_boar', 'tiger', 'leopard', 'wolf', 'red_fox', 'arctic_hare', 'quail'];
  ok(off.every((id) => !A.dropKgRow(id)), '② 표 밖 종 = 지금 값(멧돼지 T629 미확인 · 호랑이·표범·늑대·여우 T629 줄 없음 · 북극토끼 T607 무게 없음 · 메추라기 T607 무게 미확인)');
}

// ── ③ 끔 = 옛 줄 ────────────────────────────────────────────────────────────────────────
say('\n③ 끔 = 옛 줄 — dropsOf 가 카탈로그 drops 그 객체');
{
  ok(A.dropKgOn() === false, '★③ 손잡이 없음 = 끔');
  const ids = Object.keys(A.ANIMALS);
  const bad = ids.filter((id) => A.dropsOf(id) !== A.ANIMALS[id].drops);
  ok(bad.length === 0, '★★③ 끔 — 36종 전부 같은 참조(글자가 아니라 객체째 · main 바이트)', `${ids.length}종 · 다른 것 ${bad.length}`);
  withEnv({ T636_DROP_KG: '0' }, () => ok(A.dropKgOn() === false && A.dropsOf('deer') === A.ANIMALS.deer.drops, "③ '0' 도 끔(켬은 '1' 하나)"));
  ok(/const drops = \(def && def\.drops\) \? dropsOf\(mob\.type\) : \{ meat_game: 1, leather: 1 \};/.test(ZSRC), '③ 배선 — zone.js spawnCorpse 가 dropsOf 하나를 부른다(옛 대체값 그대로)');
  ok((ZSRC.match(/def\.drops/g) || []).length === 1, '③ 사체 드롭을 읽는 자리는 그 한 곳뿐(다른 길 0)');
}

// ── ④ 켬 ────────────────────────────────────────────────────────────────────────────────
say('\n④ 켬 — 고기 칸만 kg · 가죽·뼈·뿔·모피 그대로');
const ON = withEnv({ T636_DROP_KG: '1' }, () => {
  const out = {};
  for (const id of Object.keys(A.ANIMALS)) out[id] = A.dropsOf(id);
  return out;
});
{
  const R = Object.fromEntries(A.DROP_KG.map((r) => [r.id, A.dropKgRow(r.id)]));
  ok(ON.deer.meat_game === 27 && A.ANIMALS.deer.drops.meat_game === 3, '★★④ 사슴 고기 3 → 27(kg — 사슴·들짐승고기 한 개 1.0kg)',
    `생체 ${R.deer.liveKg} × ${(R.deer.yld * 100).toFixed(2)}% = ${R.deer.meatKg.toFixed(2)}kg`);
  ok(ON.bear.meat_game === 36 && A.ANIMALS.bear.drops.meat_game === 6, '★★④ 곰(반달가슴곰) 고기 6 → 36', `생체 ${R.bear.liveKg} × 33% = ${R.bear.meatKg.toFixed(2)}kg`);
  ok(ON.pheasant.meat_chicken === 1, '★④ 꿩 닭고기 1 → 1 — 0.735kg = 한 개 0.5kg 의 1.47배 → 반올림 1(지금과 같음)', `${R.pheasant.meatKg.toFixed(3)}kg ÷ ${R.pheasant.unitKg}`);
  let other = 0;
  for (const r of A.DROP_KG) for (const [k, v] of Object.entries(A.ANIMALS[r.id].drops)) if (k !== r.item && ON[r.id][k] !== v) other++;
  ok(other === 0, '★④ 가죽·뼈·뿔·모피·깃털은 지금 값(T629 에 개수로 옮길 수가 없다 — 가죽은 넓이 m² 하나)', `다른 칸 ${other}`);
  const same = Object.keys(A.ANIMALS).filter((id) => !A.dropKgRow(id)).every((id) => ON[id] === A.ANIMALS[id].drops);
  ok(same, '④ 표 밖 종은 켬에서도 카탈로그 그 객체');
  ok(Object.isFrozen(ON.deer) && !Object.isFrozen(A.ANIMALS.deer.drops) && ON.deer !== A.ANIMALS.deer.drops, '④ 켬 드롭은 얼린 사본(카탈로그는 안 건드린다)');
  const changed = Object.keys(A.ANIMALS).filter((id) => JSON.stringify(ON[id]) !== JSON.stringify(A.ANIMALS[id].drops));
  ok(changed.join() === 'bear,deer', '★④ 켬에서 드롭이 바뀌는 종 = 둘(곰 · 사슴)', changed.join(',') || '0');
  let round = 0; for (const r of Object.values(R)) if (Math.abs(r.units * r.unitKg - r.meatKg) > r.unitKg / 2 + 1e-9) round++;
  ok(round === 0, '④ 낱개 × 한 개 kg 은 셈한 고기 kg 의 반올림 안(반 개 이내)', `어긋남 ${round}`);
}

// ── ⑤ 따라오는 것 ───────────────────────────────────────────────────────────────────────
say('\n⑤ 따라오는 것 — 한 번 사냥 몇 날치 · 짐 무게');
{
  const perKg = K.kcalPerKg('meat_raw'), day = K.DAY_KCAL;
  pre(perKg === 1500 && day === 2450, 'kcal.js 고기 kcal/kg · 하루치', `${perKg} kcal/kg · 하루 ${day} kcal`);
  const days = (kg) => +(kg * perKg / day).toFixed(2);
  const deerOff = A.ANIMALS.deer.drops.meat_game * W.kgOf('meat_game'), deerOn = ON.deer.meat_game * W.kgOf('meat_game');
  ok(days(deerOn) > 16 && days(deerOn) < 17, '★⑤ 사슴 한 마리 = 한 사람 몇 날치', `끔 ${days(deerOff)}날 → 켬 ${days(deerOn)}날`);
  const bearOn = ON.bear.meat_game * W.kgOf('meat_game');
  ok(days(bearOn) > 21 && days(bearOn) < 23, '⑤ 곰 한 마리', `끔 ${days(A.ANIMALS.bear.drops.meat_game)}날 → 켬 ${days(bearOn)}날`);
  ok(K.kcalOf('meat_game') === 0, '⑤ ⚠사체 고기 품목(meat_game)은 kcal 표에 줄이 없다(0) — 날치 셈은 카드대로 고기 kcal/kg(1,500)로 냈다 · 회부', `kcalOf(meat_game)=${K.kcalOf('meat_game')}`);
  const kgOf = (d) => Object.entries(d).reduce((s, [k, n]) => s + n * W.kgOf(k), 0);
  const m618 = D618.match(/(\d+)\s*[∼~]\s*(\d+)\s*㎏/);
  pre(!!m618, 'T618 지게 무게 칸을 읽었다', m618 ? `${m618[1]}~${m618[2]}kg` : '없음');
  const lo = m618 ? +m618[1] : 50;
  ok(kgOf(ON.deer) <= lo && kgOf(ON.bear) <= lo, '★⑤ 켬 사슴·곰 한 마리 짐 = T618 지게 한 짐(50~70kg) 안 — 한 번에 진다', `사슴 ${kgOf(ON.deer).toFixed(1)}kg · 곰 ${kgOf(ON.bear).toFixed(1)}kg`);
  const cap = Carry.CFG.CAP_KG, jige = PI.CARRIER_MAX_KG;
  ok(kgOf(ON.deer) > cap && kgOf(ON.deer) <= cap + jige, '⑤ 플레이어 — 사슴 한 마리는 맨몸 적재를 넘고 지게(만렙 +20)면 안에 든다', `맨몸 ${cap}kg · 지게 ≤${cap + jige}kg`);
  ok(kgOf(ON.bear) > cap + jige, '⑤ 곰 한 마리는 지게 상한도 조금 넘는다(과적 — 느려질 뿐 주울 수 있다)', `${kgOf(ON.bear).toFixed(1)}kg`);
}

// ── ⑥ 실기 — 진짜 도살 ──────────────────────────────────────────────────────────────────
say('\n⑥ 실기 — 존을 띄워 사체를 세우고 진짜로 도살(butcherCorpse)');
{
  const sub = (env) => JSON.parse(execFileSync(process.execPath, [__filename], { env: Object.assign({}, process.env, env), stdio: 'pipe' }).toString().trim().split('\n').pop());
  const off = sub({ T636_SUB: 'butcher', T636_DROP_KG: '' });
  const on = sub({ T636_SUB: 'butcher', T636_DROP_KG: '1' });
  pre(off.out.deer && off.out.deer.inv.meat_game === 3 && !off.out.deer.left, '끔 — 사슴을 도살하면 고기 3(카탈로그 · 이게 아니면 아래가 자명 통과)', JSON.stringify(off.out.deer && off.out.deer.inv));
  ok(on.out.deer.inv.meat_game === 27 && on.out.deer.inv.leather === 2 && on.out.deer.inv.horn === 1, '★★⑥ 켬 — 사슴 도살 인벤 고기 27 · 가죽 2 · 뿔 1', JSON.stringify(on.out.deer.inv));
  ok(on.out.bear.inv.meat_game === 36 && off.out.bear.inv.meat_game === 6, '★⑥ 켬 — 곰 도살 고기 36(끔 6)', JSON.stringify(on.out.bear.inv));
  ok(JSON.stringify(on.out.wolf.inv) === JSON.stringify(off.out.wolf.inv) && JSON.stringify(on.out.pheasant.inv) === JSON.stringify(off.out.pheasant.inv),
    '⑥ 늑대(표 밖) · 꿩(반올림 같음)은 켬 · 끔 인벤이 같다', JSON.stringify(on.out.wolf.inv));
  ok((on.notes || []).some((s) => /도살 \+meat_game 27/.test(s)), '⑥ 도살 알림이 켬 수를 말한다', (on.notes || [])[0] || '');
  ok(Object.values(on.out).every((o) => !o.left), '⑥ 도살한 사체는 지워졌다(두 번 못 바른다)');
}

console.log(`\n=== ${pass + fail}건 중 PASS ${pass} · FAIL ${fail} ===\n`);
process.exit(fail ? 1 : 0);
