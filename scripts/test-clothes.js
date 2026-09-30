#!/usr/bin/env node
// @regress   ← 통합 러너가 이 표를 보고 자기 목록을 만든다(scripts/run-regress.sh · 표 없으면 안 돈다)
// === scripts/test-clothes.js — 옷 품목 표 (T74) =================================
//
// ★★[재민 확정 2026-09-03 · T74] 이 카드는 **구조 카드**다 — 값은 종전과 비트 동일이고,
//   바뀐 것은 "옷을 이루는 것들이 어디에 있는가"뿐이다. 그래서 이 하네스의 제1 임무는
//   **아무것도 안 움직였음을 증명하는 것**이고, 제2 임무는 **표가 진짜 정본인지**(표에서
//   빼면 제작이 거절되는지 — 폴백 금지) 확인하는 것이다.
//
// ★제1 규약 — **종전 값을 하네스가 지어내지 않는다.** 종전 식을 여기 다시 적어
//   `craftItem` 과 맞댄다: `min(round(62 · qSkill(lv) · grade), cap)`.
//   그 식이 곧 "T74 이전"이므로, 표를 잘못 옮기면 여기서 빨개진다.
//
// 실행: node scripts/test-clothes.js
'use strict';
const path = require('path');
const fs = require('fs');
const ROOT = path.join(__dirname, '..');

let pass = 0, fail = 0;
const ok = (c, m, x) => { c ? pass++ : fail++; console.log((c ? '  ✓ ' : '  ✗ ') + m + (x !== undefined && x !== '' ? `  ${x}` : '')); };
const say = (m) => console.log(m);

const _l = console.log; console.log = () => {};
const P = require(path.join(ROOT, 'server', 'player-items.js'));
const C = require(path.join(ROOT, 'server', 'clothes.js'));
const W = require(path.join(ROOT, 'server', 'weights.js'));
const B = require(path.join(ROOT, 'server', 'body.js'));
console.log = _l;
// ★★[T536 추신 2026-09-30 · #90] `T516_WARMTH_CLO` 는 기본 켬이다 — "종전과 비트 동일"(③)은 **되돌림 판**(`=0`)을 다시 올려 잰다.
//   팔은 모듈 적재 때 읽힌다 ⇒ env 를 주고 `clothes`·`player-items`·`body` 를 다시 올리고, 원래 인스턴스를 도로 꽂는다(⑦ 과 같은 규약).
//   끔 판(`T516_WARMTH_CLO=0`)으로 이 하네스를 돌리면 되돌림 판 = 정본 판이라 종전 출력 그대로다.
const reloadMods = (env) => {
  const mods = ['clothes.js', 'player-items.js', 'body.js'].map((f) => require.resolve(path.join(ROOT, 'server', f)));
  const keepMods = mods.map((m) => require.cache[m]), keep = {};
  for (const k of Object.keys(env)) keep[k] = process.env[k];
  for (const m of mods) delete require.cache[m];
  for (const [k, v] of Object.entries(env)) { if (v === undefined) delete process.env[k]; else process.env[k] = v; }
  const _q = console.log; console.log = () => {};
  try { const P2 = require(mods[1]); return { C: require(mods[0]), P: P2, B: require(mods[2]) }; } finally {
    console.log = _q;
    for (const m of mods) delete require.cache[m];
    for (const [k, v] of Object.entries(keep)) { if (v === undefined) delete process.env[k]; else process.env[k] = v; }
    mods.forEach((m, i) => { if (keepMods[i]) require.cache[m] = keepMods[i]; });
  }
};
const Off = reloadMods({ T516_WARMTH_CLO: '0' });   // 되돌림 판 — 방한 = 종전 식

say('\n=== 옷 품목 표 (T74 · 구조 카드) ===');

// ═══ ① 표 자체 ═══════════════════════════════════════════════════════════════
say('\n① 표 — 품목 여섯 · 이름 · 천장 · 무게 · 고증');
{
  const list = C.accepts();
  ok(list.length === 6, '★① 품목이 여섯이다', JSON.stringify(list));
  // ⚠순서가 계약이다 — 재료를 안 주는 옛 호출부가 `accepts[0]` 을 기본값으로 쓴다
  ok(JSON.stringify(list) === JSON.stringify(['fur', 'ramie', 'leather', 'hide', 'fiber', 'hemp']),
    '★★① **순서가 종전 그대로다** — `accepts[0]`(갖옷)이 옛 호출부의 기본값이다', JSON.stringify(list));
  let noKo = [], noNote = [];
  for (const m of list) { if (!C.koOf(m)) noKo.push(m); if (!C.noteOf(m) || C.noteOf(m).length < 10) noNote.push(m); }
  ok(noKo.length === 0, '★① 여섯 다 **한글 이름**이 있다(화면이 "옷"이 아니라 "갖옷"이라 부른다)',
    list.map((m) => C.koOf(m)).join(' · '));
  ok(noNote.length === 0, '★① 여섯 다 **고증 한 줄**이 있다(왜 이 값인지가 표 안에 있다)',
    noNote.length ? noNote.join(',') : `${list.length}줄`);
  ok(C.kgOf('fur') === W.kgOfOrDefault('clothes') && C.kgOf('fur') > 0,
    '★★① 무게는 **`weights.js` 정본을 부른다**(표가 kg 을 따로 안 적는다)', `${C.kgOf('fur')}kg`);
  // 천장은 식물 섬유 셋에만 있다 — 그게 T4 ⑤ 의 판단이다
  const capped = list.filter((m) => C.capOf(m) != null);
  ok(JSON.stringify(capped) === JSON.stringify(['ramie', 'fiber', 'hemp']),
    '★★① 방한 **천장은 식물 섬유 셋에만** 있다(T4 ⑤ — 잘 짜도 바람은 못 막는다)', JSON.stringify(capped));
}

// ═══ ② 단조 — 삼베 < 가죽 < 모피 ═══════════════════════════════════════════
say('\n② 단조 — 재민 확정(T4 ⑤): 삼베 < 가죽 < 모피');
{
  const at = (m, lv) => P.craftItem('clothes', lv, { [m]: 3 }).attrs.warmth;
  let bad = [];
  for (const lv of [0, 3, 5, 7, 10]) {
    const h = at('hemp', lv), l = at('leather', lv), f = at('fur', lv);
    if (!(h <= l && l <= f)) bad.push(`Lv${lv}: ${h}/${l}/${f}`);
  }
  ok(bad.length === 0, '★★② 숙련 전 구간에서 **삼베 ≤ 가죽 ≤ 모피**', bad.length ? bad.join(' ') : 'Lv0·3·5·7·10 전부');
  // ★자명 통과 금지 — 장인 구간에서 실제로 **갈린다**(전부 같으면 위가 뜻이 없다)
  ok(at('hemp', 10) < at('leather', 10) && at('leather', 10) < at('fur', 10),
    '★★② 자명 통과 금지 — 장인(Lv10)에서 **셋이 실제로 다르다**',
    `삼베 ${at('hemp', 10)} < 가죽 ${at('leather', 10)} < 갖옷 ${at('fur', 10)}`);
  // 단열(℃)로도 갈리는가 — 방한 수가 아니라 **몸이 느끼는 값**으로
  const insC = (m) => B.warmthInsC(at(m, 10));
  ok(insC('hemp') < insC('leather') && insC('leather') < insC('fur'),
    '★② 그리고 **몸이 느끼는 단열(℃)** 로도 갈린다',
    `+${insC('hemp').toFixed(2)}℃ < +${insC('leather').toFixed(2)}℃ < +${insC('fur').toFixed(2)}℃`);
}

// ═══ ③ 되돌림 — 종전과 비트 동일 ═══════════════════════════════════════════
say('\n③ 되돌림 — 값은 한 자도 안 움직였다(구조 카드)');
{
  // ★종전 식을 **여기 다시 적어** 맞댄다. 표를 잘못 옮기면 여기서 빨개진다.
  //   등급: econ `CLOTH_Q_MAT` 다섯 + `fiber` 는 종전에 이름 없는 폴백 0.6 이었다.
  const OLD_GRADE = { fur: 1.0, ramie: 0.9, leather: 0.85, hide: 0.65, hemp: 0.6, fiber: 0.6 };
  const OLD_CAP = { hemp: 26, ramie: 26, fiber: 26 };
  const OLD_SCALE = 62, OLD_SPAN = 0.6;
  const oldWarmth = (m, lv) => {
    const q = (1 - OLD_SPAN + OLD_SPAN * (Math.max(0, Math.min(10, lv)) / 10)) * OLD_GRADE[m];
    const w = Math.round(OLD_SCALE * q);
    return OLD_CAP[m] != null ? Math.min(w, OLD_CAP[m]) : w;
  };
  let bad = [], n = 0;
  for (const m of C.accepts()) for (let lv = 0; lv <= 10; lv++) {
    const got = Off.P.craftItem('clothes', lv, { [m]: 3 }).attrs.warmth, want = oldWarmth(m, lv);
    n++; if (got !== want) bad.push(`${m}/Lv${lv} ${got}≠${want}`);
  }
  ok(bad.length === 0, `★★★③ 재료 여섯 × 숙련 열하나 **${n}칸 전수 비트 동일**`,
    bad.length ? bad.slice(0, 4).join(' · ') : '전부 일치');
  // ★그리고 종전 등급표가 **정말 그 값이었는지**를 소스에서 확인한다(하네스가 수를 지어내지 않는다)
  const psrc = fs.readFileSync(path.join(ROOT, 'server', 'player-items.js'), 'utf8');
  const m5 = /fur: 1\.0, ramie: 0\.9, leather: 0\.85, hide: 0\.65, hemp: 0\.6/.test(psrc);
  ok(m5, '★★③ 등급 다섯은 **`MAT_GRADE` 에 그대로** 있다(econ `CLOTH_Q_MAT` 동일값 계약 무변)');
  const esrc = fs.readFileSync(path.join(ROOT, 'sim', 'economy-sim.js'), 'utf8');
  const eq = /CLOTH_Q_MAT = \{ fur: 1\.0, ramie: 0\.9, leather: 0\.85, hide: 0\.65, hemp: 0\.6 \}/.test(esrc);
  ok(eq, '★★③ 그리고 econ 쪽 표와 **글자까지 같다**(코히런스 계약 — 이 카드가 안 건드렸다)');
  // 내구·품질도 안 움직였다(warmth 만 보면 반쪽이다)
  const i = P.craftItem('clothes', 7, { leather: 3 });
  ok(i.q === +(((1 - 0.6 + 0.6 * 0.7) * 0.85).toFixed(3)) && i.durMax === Math.round(120 * (1 + 0.6 * i.q)),
    '★★③ **품질·내구도 그대로다** — 방한만 보면 반쪽이다', `q ${i.q} · 내구 ${i.durMax}`);
}

// ═══ ④ 표가 정본인가 — 폴백 금지 ═══════════════════════════════════════════
say('\n④ 표가 정본인가 — 빼면 거절된다(폴백 금지)');
{
  // 제작의 관문은 `zone.EQUIPMENT_RECIPES.clothes.accepts` 이고 그 목록이 이 표에서 온다.
  const zsrc = fs.readFileSync(path.join(ROOT, 'server', 'zone.js'), 'utf8');
  ok(/accepts: require\('\.\/clothes'\)\.accepts\(\)/.test(zsrc),
    '★★④ `EQUIPMENT_RECIPES.clothes.accepts` 가 **표를 읽는다**(손으로 적힌 목록 0)');
  ok(!/accepts: \['fur','ramie','leather','hide','fiber','hemp'\]/.test(zsrc),
    '★★④ 그리고 **옛 목록이 남아 있지 않다**(죽은 사본 0)');
  // ★★돌연변이 — 표에서 한 품목을 빼면 그 재료가 **관문에서 거절**된다
  //   ⚠**순서까지 되돌린다.** 초안은 `delete` 뒤에 그냥 다시 넣었는데, 그러면 그 품목이 **맨 뒤로**
  //     가서 `accepts` 순서가 깨진다(⑤ 가 그걸 잡았다 — `accepts[0]` 기본값 계약이 걸린 자리다).
  //     하네스가 자기 검사 대상을 오염시킨 자리다(족보 ㊻).
  {
    const before = C.accepts().slice();
    const snap = {}; for (const k of before) snap[k] = C.CLOTHES[k];
    delete C.CLOTHES.leather;
    const gone = !C.accepts().includes('leather') && !C.has('leather') && C.koOf('leather') === null;
    for (const k of before) { delete C.CLOTHES[k]; }          // 통째로 비우고
    for (const k of before) { C.CLOTHES[k] = snap[k]; }       // 원래 순서로 다시 세운다
    ok(gone && C.has('leather') && JSON.stringify(C.accepts()) === JSON.stringify(before),
      '★★④ 돌연변이 — 표에서 빼면 **목록·이름·소속이 함께 사라진다**(되돌리면 순서까지 산다)',
      JSON.stringify(C.accepts()));
  }
  // ★그리고 표에 없는 재료로는 `mat` 이 안 붙는다 — 이름 없는 옷이 생기지 않는다
  const stray = P.craftItem('clothes', 5, { bronze: 3 });
  ok(stray.mat === undefined, '★★④ 표 밖 재료로는 **품목이 안 정해진다**(`mat` 미부여)', `mat ${stray.mat}`);
}

// ═══ ⑤ 이름이 화면까지 간다 ═════════════════════════════════════════════════
say('\n⑤ 이름 — 표에서 화면까지');
{
  let bad = [];
  for (const m of C.accepts()) {
    const d = P.displayItem(P.craftItem('clothes', 10, { [m]: 3 }));
    if (!d.startsWith(C.koOf(m))) bad.push(`${m}: ${d}`);
  }
  ok(bad.length === 0, '★★⑤ 여섯 다 **제 이름으로 불린다**("옷 [방한 62]" 가 아니라 "갖옷 [방한 62]")',
    bad.length ? bad.join(' / ') : P.displayItem(P.craftItem('clothes', 10, { fur: 3 })));
  const pl = C.payload();
  ok(JSON.stringify(pl.map((r) => r.id)) === JSON.stringify(C.accepts()),
    '★★⑤ 화면으로 나가는 표도 **같은 순서**다(아이콘 배열이 목록과 어긋나지 않는다)',
    JSON.stringify(pl.map((r) => r.id)));
  ok(pl.length === 6 && pl.every((r) => r.id && r.ko && r.kg > 0),
    '★★⑤ 표가 **화면으로 나간다**(`equipmentMeta.clothes` — 아이콘·외형이 표를 다시 안 적는다)',
    JSON.stringify(pl.map((r) => `${r.id}:${r.ko}`)));
  ok(/clothes: require\('\.\/clothes'\)\.payload\(\)/.test(fs.readFileSync(path.join(ROOT, 'server', 'zone.js'), 'utf8')),
    '★⑤ 그리고 zone 이 그 표를 `EQUIPMENT_META` 에 실제로 싣는다');
}

// ═══ ⑥ 대리 지표 ═══════════════════════════════════════════════════════════
say('\n⑥ 대리 지표 — 품목 × 숙련 × 단열');
{
  say('     품목        Lv0   Lv5  Lv10   Lv10 단열      고증');
  for (const m of C.accepts()) {
    const w = [0, 5, 10].map((l) => P.craftItem('clothes', l, { [m]: 3 }).attrs.warmth);
    const ins = B.warmthInsC(w[2]);
    say(`     ${C.koOf(m).padEnd(9)} ${String(w[0]).padStart(3)} ${String(w[1]).padStart(5)} ${String(w[2]).padStart(5)}   +${ins.toFixed(2)}℃   ${C.noteOf(m).slice(0, 34)}`);
  }
}

// ═══ ⑦ ★★[T516 2026-09-29 · #90 입력] 방한을 재질 clo 에서 유도 — `T516_WARMTH_CLO`(T536 추신부터 기본 켬 · `=0` 끔) ═══════
//   ★팔은 모듈 적재 때 읽힌다 ⇒ 켬 판은 env 를 주고 `clothes`·`player-items`(·`body`)를 **다시 올린다**
//     (test-body ⑲ⓗ·㉑ 과 같은 규약 · 원래 인스턴스를 도로 꽂는다 — 뒤 검사 오염 금지).
say('\n⑦ 재질 clo → 방한 (T516)');
{
  const mods = ['clothes.js', 'player-items.js', 'body.js'].map((f) => require.resolve(path.join(ROOT, 'server', f)));
  const reload = (env) => {
    const keepMods = mods.map((m) => require.cache[m]), keep = {};
    for (const k of Object.keys(env)) keep[k] = process.env[k];
    for (const m of mods) delete require.cache[m];
    for (const [k, v] of Object.entries(env)) { if (v === undefined) delete process.env[k]; else process.env[k] = v; }
    const _q = console.log; console.log = () => {};
    try { const P2 = require(mods[1]); return { C: require(mods[0]), P: P2, B: require(mods[2]) }; } finally {
      console.log = _q;
      for (const m of mods) delete require.cache[m];
      for (const [k, v] of Object.entries(keep)) { if (v === undefined) delete process.env[k]; else process.env[k] = v; }
      mods.forEach((m, i) => { if (keepMods[i]) require.cache[m] = keepMods[i]; });
    }
  };
  // ── ⓐ 끔 = 카탈로그 그대로 ──
  if (!C.T516_WARMTH_CLO)
  ok(C.T516_WARMTH_CLO === false, '★★⑦ⓐ 기본은 **끔** — 방한은 종전 식(③ 이 여섯 × 열하나 전수 비트 동일로 못 박는다)');
  else ok(C.T516_WARMTH_CLO === true && Off.C.T516_WARMTH_CLO === false,
    '★★⑦ⓐ 기본은 **켬**(T536 추신 · #90) — 방한 = 재질 clo · 되돌림 `T516_WARMTH_CLO=0` 은 종전 식(③ 이 그 판을 여섯 × 열하나 전수 비트 동일로 못 박는다)');
  const psrc = fs.readFileSync(path.join(ROOT, 'server', 'player-items.js'), 'utf8');
  ok(/if \(Clothes\.T516_WARMTH_CLO\) \{ const w = Clothes\.warmthCloOf\(inst\.mat\); if \(w != null\) inst\.attrs\.warmth = w; \}/.test(psrc),
    '★⑦ⓐ2 켬 갈래는 `craftItem` 한 줄 — 끄면 안 돈다(천장 줄 뒤 · `q`·내구 줄 무변)');
  // ── ⓑ 재질 clo 표 — 여섯 다 값이 있고 출처가 있다 ──
  const ids = C.accepts();
  ok(ids.every((m) => Number.isFinite(C.cloOf(m)) && C.cloOf(m) > 0), '★★⑦ⓑ 품목 여섯 다 **한 벌 clo** 가 있다', ids.map((m) => `${m} ${C.cloOf(m).toFixed(3)}`).join(' · '));
  const csrc = fs.readFileSync(path.join(ROOT, 'server', 'clothes.js'), 'utf8');
  ok(/facets-2024-0100/.test(csrc) && /pid%2F10581147/.test(csrc) && /Clothing_insulation/.test(csrc),
    '★⑦ⓑ2 clo 는 **출처의 값**이다 — Barker 2025(모피) · Son & Tasaka 1996(모시) · ASHRAE 55 의복 표(삼베·가죽)');
  ok(C.cloOf('hemp') === C.cloOf('fiber') && C.cloOf('hemp') < C.cloOf('ramie') && C.cloOf('ramie') < C.cloOf('leather') &&
     C.cloOf('leather') === C.cloOf('hide') && C.cloOf('leather') < C.cloOf('fur'),
    '★★⑦ⓑ3 얇은 식물 섬유 < 모시 < 두꺼운 가죽 < 모피 — 단열은 재질 이름이 아니라 **두께**가 정한다');
  // ── ⓒ 켬 — 방한 = WARMTH_MIN + clo × (천장 − WARMTH_MIN) ÷ CLO_TOP · 숙련 무관 ──
  const On = reload({ T516_WARMTH_CLO: '1' });
  const cap = On.P.ITEM_TYPES.clothes.attrScale;
  const want = (m) => Math.round(On.B.CFG.WARMTH_MIN + On.C.cloOf(m) * (cap - On.B.CFG.WARMTH_MIN) / On.B.CFG.CLO_TOP);
  const wOn = (m, l) => On.P.craftItem('clothes', l, { [m]: 3 }).attrs.warmth;
  ok(On.C.T516_WARMTH_CLO === true && ids.every((m) => [0, 3, 5, 7, 10].every((l) => wOn(m, l) === want(m))),
    '★★⑦ⓒ 켬: 방한 = 10 + clo × 52 ÷ CLO_TOP(T508 앵커) — 숙련 0~10 **어디서나 같은 값**', ids.map((m) => `${m} ${want(m)}`).join(' · '));
  const iOff = Off.P.craftItem('clothes', 7, { leather: 3 }), iOn = On.P.craftItem('clothes', 7, { leather: 3 });
  ok(iOn.q === iOff.q && iOn.durMax === iOff.durMax && iOn.mat === iOff.mat,
    '★⑦ⓒ2 숙련은 `q`(내구·값·이름)에 그대로 남는다 — 방한만 재질이 정한다', `q ${iOn.q} · 내구 ${iOn.durMax}`);
  const band = (m) => [0, 10].map((l) => wOn(m, l));
  ok(Math.max(...band('hemp'), ...band('ramie')) < Math.min(...band('leather')) && Math.max(...band('leather'), ...band('hide')) < Math.min(...band('fur')),
    '★★⑦ⓒ3 티어 구간이 **안 겹친다**(끔: 삼베 15~26 · 가죽 16~53 · 모피 25~62 — T515 가 본 겹침)',
    `삼베 ${band('hemp')} · 가죽 ${band('leather')} · 모피 ${band('fur')}`);
  // ── ⓓ 두 팔 다 켬(T508_CLO + T516) — 단열 ℃ = clo × CLO_C(반올림 ±½점) ──
  const Both = reload({ T516_WARMTH_CLO: '1', T508_CLO: '1' });
  const cPer = Both.B.t508Info().cPer;
  const bad = ids.filter((m) => Math.abs(Both.B.warmthInsC(Both.P.craftItem('clothes', 5, { [m]: 3 }).attrs.warmth) - Both.C.cloOf(m) * Both.B.CFG.CLO_C) > 0.5 * cPer + 1e-9);
  ok(bad.length === 0, '★★⑦ⓓ 두 팔 다 켜면 옷의 ℃ = **clo × 5.56**(1 clo ≈ 5.56℃ — 천장·앵커는 서로 지운다)',
    ids.map((m) => `${m} +${Both.B.warmthInsC(Both.P.craftItem('clothes', 5, { [m]: 3 }).attrs.warmth).toFixed(2)}℃`).join(' · '));
  // ── ⓔ 미끼 — 삼베 clo 를 모피 값으로 바꾸면 ⓑ3·ⓒ3 이 뒤집힌다 ──
  {
    const keepClo = On.C.CLOTHES.hemp.clo; On.C.CLOTHES.hemp.clo = On.C.CLOTHES.fur.clo;
    const flipped = !(wOn('hemp', 10) < wOn('leather', 0)); On.C.CLOTHES.hemp.clo = keepClo;
    ok(flipped, '⑦ⓔ (미끼) 삼베 clo 를 모피 값으로 바꾸면 "삼베 < 가죽"이 무너진다 — 판정이 실제로 clo 를 읽는다');
  }
  // ── ⓕ 무접촉 — 화면으로 나가는 표(그림 키 `clothes_<id>` 가 읽는 것)는 무변 ──
  const pl2 = On.C.payload();
  ok(JSON.stringify(pl2) === JSON.stringify(C.payload()) && pl2.every((r) => !('clo' in r)),
    '★⑦ⓕ `payload()` 무변 — clo 는 화면으로 안 나간다(T515 그림 키 `clothes_<id>` · 필드 0 추가)');
  if (!C.T516_WARMTH_CLO)
  ok(C.T516_WARMTH_CLO === false && P.craftItem('clothes', 10, { hemp: 3 }).attrs.warmth === 26, '⑦ⓖ (오염 검사) 다시 올린 뒤에도 이 하네스의 정본은 끔(장인 삼베 26)');
  else ok(C.T516_WARMTH_CLO === true && P.craftItem('clothes', 10, { hemp: 3 }).attrs.warmth === C.warmthCloOf('hemp'),
    '⑦ⓖ (오염 검사) 다시 올린 뒤에도 이 하네스의 정본은 켬(장인 삼베 = clo 한 값)', `장인 삼베 ${P.craftItem('clothes', 10, { hemp: 3 }).attrs.warmth}`);
}

say(`\n=== ${pass + fail}건 중 PASS ${pass} · FAIL ${fail} ===\n`);
process.exit(fail ? 1 : 0);
