#!/usr/bin/env node
// (@regress 없음 — 러너 밖 · T623 표 짜는 기계 · 제품 무변)
// =============================================================================
// T623 — 새 품목 열하나의 **값 후보 표** = T608 이 낸 비 × 게임에 이미 있는 품목의 지금 값(유도만 · 새 수 0 · 값을 정하지 않는다)
//
//   읽는 것(옮겨 적지 않는다):
//     ⓐ 지금 값 — `server/specialty.js` 품목표(새 품목 손잡이 둘 `T574_NEW_ITEMS` · `T602_NEW_FISH` 를 켜고 싣는다 — 지금 임시 값 = 형제 복제)
//     ⓑ T608 비 — `설계/고증_새품목값.md` §3 의 다섯 줄. 비는 그 줄의 **두 수에서 다시 셈**한다(지금 값 ÷ 지금 값 · 산지 수 ÷ 산지 수)
//        — 문서에 그 줄이 그대로 있는지(`T608_LINES`)만 확인한다(줄이 바뀌면 이 기계가 멈춘다 · 사본 감시)
//     ⓒ 어종 kg — `설계/고증_바닷물고기.md`(T592) 표의 "보통 a~bkg" 칸을 **그 문서에서 뽑는다**(명태 0.5~1 · 일곱 종)
//        비 = T608 §3 이 쓴 식 그대로: 종 보통 하한 ÷ 명태 보통 상한 ~ 종 보통 상한 ÷ 명태 보통 하한(낮음 ~ 높음)
//   후보 = 견준 품목의 지금 값 × 비 · 단 **산지 수 비**는 희소 축이라 뒤집어 곱한다(산지가 많을수록 덜 희소 — 아래 `inv`)
//   비가 없는 칸은 빈칸(천하석 — 품목표에 줄이 없고 T608 비도 없다 · 진사 ↔ 옥 — 0 으로 나눔).
//
// 쓰는 법: node scripts/t623-cand.js [--md] [--json 파일]      (--md = 설계 문서에 붙일 표 · 기본 = 짧은 표)
//   다른 자가 부를 때: require('./t623-cand').build() → { rows, items }(items[id] = { now, lo, hi })
// =============================================================================
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');

// 새 품목 손잡이는 specialty 를 싣기 **전에** 건다(품목표가 실릴 때 선다 — t574-ore-table 과 같은 규약)
function loadSpecialty() {
  const keep = { a: process.env.T574_NEW_ITEMS, b: process.env.T602_NEW_FISH };
  process.env.T574_NEW_ITEMS = '1'; process.env.T602_NEW_FISH = '1';
  const p = require.resolve(path.join(ROOT, 'server', 'specialty'));
  const had = require.cache[p];
  delete require.cache[p];
  const SP = require(p);
  // 부른 쪽의 캐시·env 를 되돌린다(이 기계가 다른 자 안에서 불려도 그 판의 품목표를 안 바꾼다)
  if (had) require.cache[p] = had; else delete require.cache[p];
  if (keep.a === undefined) delete process.env.T574_NEW_ITEMS; else process.env.T574_NEW_ITEMS = keep.a;
  if (keep.b === undefined) delete process.env.T602_NEW_FISH; else process.env.T602_NEW_FISH = keep.b;
  return SP.RESOURCES;
}

// T608 §3 의 줄 — 이 글자들이 문서에 있어야 한다(없으면 멈춘다 · 비의 수는 아래에서 다시 센다)
const T608_DOC = path.join(ROOT, '설계', '고증_새품목값.md');
const T608_LINES = {
  cinnabar_obsidian: '진사의 baseValue(현재 50, `mercury` 복제) ÷ 흑요석의 baseValue(15) = 약 3.3배',
  cinnabar_jade: '0으로\n  나눌 수 없어 비 계산 불가',
  shell_jade: '남방 조개 팔찌감의 산지 수(2) ÷ 옥의 닛폰 산지 수(1, 이토이가와) = 2배',
  ironsand_copper: '사철의 baseValue(현재 4, `iron` 복제) ÷ 구리의 baseValue(4) = 1배(같음)',
  shell_murex: '조개 팔찌감의 baseValue(현재 60, `amber_raw` 복제) ÷ 자색고둥의 baseValue(40) = 1.5배',
  amazonite: '천하석**: `specialty.js`에 값 자체가 없어(§0) 비율 계산 대상이 없다',
  fish_kg: 'kg(보통 1~3kg 다수) ÷ 명태(보통 0.5~1kg, T592) = **약 1~6배** 범위',
};
// 산지 수(T608 §1 표 · §3 줄 그대로 — 문서의 "(2)" "(1, 이토이가와)" 두 수)
const SITES = { shell_bangle: 2, jade_raw_nippon: 1 };

// T592 kg — 문서 표에서 뽑는다
const T592_DOC = path.join(ROOT, '설계', '고증_바닷물고기.md');
const FISH = [
  { id: 'red_seabream', ko: '참돔' }, { id: 'sea_bass', ko: '농어' }, { id: 'mullet', ko: '숭어' }, { id: 'black_porgy', ko: '감성돔' },
  { id: 'rockfish', ko: '볼락' }, { id: 'horse_mackerel', ko: '전갱이' }, { id: 'mackerel', ko: '고등어' },
];
function fishKg() {
  const D = fs.readFileSync(T592_DOC, 'utf8');
  const out = {};
  const pm = /\|\s*pollock\s*\|\s*명태\s*\|\s*([\d.]+)~([\d.]+)\(보통\)/.exec(D);
  if (!pm) throw new Error('T592 문서에서 명태 보통 kg 줄을 못 찾았다');
  out.pollock = { lo: +pm[1], hi: +pm[2], line: D.slice(0, pm.index).split('\n').length };
  for (const f of FISH) {
    const m = new RegExp('\\|\\s*\\*\\*' + f.ko + '\\*\\*\\s*\\|\\s*보통\\s*([\\d.]+)~([\\d.]+)kg').exec(D);
    if (!m) throw new Error(`T592 문서에서 ${f.ko} 보통 kg 줄을 못 찾았다`);
    out[f.id] = { lo: +m[1], hi: +m[2], line: D.slice(0, m.index).split('\n').length };
  }
  return out;
}

const r3 = (x) => Math.round(x * 1000) / 1000;
function build() {
  const doc = fs.readFileSync(T608_DOC, 'utf8');
  const miss = Object.entries(T608_LINES).filter(([, s]) => !doc.includes(s)).map(([k]) => k);
  if (miss.length) throw new Error('T608 §3 줄이 문서에 없다(문서가 바뀌었다 — 표를 다시 봐라): ' + miss.join(', '));
  const RS = loadSpecialty();
  const V = (id) => (RS[id] ? RS[id].baseValue : null);
  const KG = fishKg();
  const rows = [];
  // 광물·장신구 넷
  rows.push({ item: 'cinnabar', ko: '진사', cmp: 'obsidian', cmpKo: '흑요석', cmpVal: V('obsidian'), ratio: [V('cinnabar') / V('obsidian')],
    ratioText: `${V('cinnabar')} ÷ ${V('obsidian')} = ${r3(V('cinnabar') / V('obsidian'))}(T608 "약 3.3배")`, inv: false, src: 'T608 §3 첫 줄',
    note: '순환 — T608 비가 지금 복제값(수은 50) ÷ 흑요석의 산수라 후보 = 지금 값' });
  rows.push({ item: 'cinnabar', ko: '진사', cmp: 'jade_raw', cmpKo: '옥 원석', cmpVal: V('jade_raw'), ratio: null,
    ratioText: '산지 수 1 ÷ 옥 한반도 산지 0 — 계산 불가(T608)', inv: true, src: 'T608 §3 둘째 줄', note: '빈칸 — 0 으로 나눔' });
  rows.push({ item: 'iron_sand', ko: '사철', cmp: 'copper', cmpKo: '구리', cmpVal: V('copper'), ratio: [V('iron_sand') / V('copper')],
    ratioText: `${V('iron_sand')} ÷ ${V('copper')} = ${r3(V('iron_sand') / V('copper'))}(T608 "1배")`, inv: false, src: 'T608 §3 넷째 줄',
    note: '순환 — 지금 복제값(철 4) ÷ 구리 4 의 산수라 후보 = 지금 값' });
  rows.push({ item: 'shell_bangle', ko: '남방 조개 팔찌감', cmp: 'murex_shell', cmpKo: '자색고둥', cmpVal: V('murex_shell'), ratio: [V('shell_bangle') / V('murex_shell')],
    ratioText: `${V('shell_bangle')} ÷ ${V('murex_shell')} = ${r3(V('shell_bangle') / V('murex_shell'))}(T608 "1.5배")`, inv: false, src: 'T608 §3 다섯째 줄',
    note: '순환 — 지금 복제값(호박 60) ÷ 자색고둥 40 의 산수라 후보 = 지금 값' });
  rows.push({ item: 'shell_bangle', ko: '남방 조개 팔찌감', cmp: 'jade_raw', cmpKo: '옥 원석', cmpVal: V('jade_raw'), ratio: [SITES.shell_bangle / SITES.jade_raw_nippon],
    ratioText: `산지 수 ${SITES.shell_bangle}(오키나와·아마미) ÷ 옥 닛폰 ${SITES.jade_raw_nippon}(이토이가와) = ${SITES.shell_bangle / SITES.jade_raw_nippon}(T608 "2배")`, inv: true, src: 'T608 §3 셋째 줄',
    note: `희소 축이라 뒤집어 곱함(산지가 두 배면 덜 희소) — 곧이곧대로 곱하면 ${V('jade_raw') * SITES.shell_bangle}(흔할수록 비싸다)` });
  rows.push({ item: 'amazonite', ko: '천하석', cmp: 'jade_raw', cmpKo: '옥 원석(T582 "옥 아래")', cmpVal: V('jade_raw'), ratio: null,
    ratioText: '없음 — 품목표에 줄이 없어 T608 이 비를 못 냈다', inv: false, src: 'T608 §3 여섯째 줄', note: '빈칸 — 품목도 비도 없다' });
  // 어종 일곱 — 명태 값 × kg 비(낮음 ~ 높음)
  const P = KG.pollock;
  for (const f of FISH) {
    const k = KG[f.id];
    const lo = k.lo / P.hi, hi = k.hi / P.lo;   // 비는 깎지 않고 곱한다(보여 줄 때만 셋째 자리)
    rows.push({ item: f.id, ko: f.ko, cmp: 'pollock', cmpKo: '명태', cmpVal: V('pollock'), ratio: [lo, hi],
      ratioText: `${k.lo}~${k.hi}kg ÷ ${P.lo}~${P.hi}kg = ${r3(lo)}~${r3(hi)}`, inv: false,
      src: `T608 §3 일곱째 줄(식) · T592 표 ${k.line}줄(종) · ${P.line}줄(명태)`, note: '' });
  }
  // 후보 = 견준 값 × 비(뒤집으면 ÷)
  for (const r of rows) {
    if (!r.ratio || r.cmpVal == null) { r.cand = null; continue; }
    r.cand = r.ratio.map((q) => r3(r.inv ? r.cmpVal / q : r.cmpVal * q));
  }
  // 품목별 낮음·높음(줄 여럿이면 가장 낮은·높은 후보) · 지금 값
  const items = {};
  for (const r of rows) {
    const it = items[r.item] || (items[r.item] = { ko: r.ko, now: V(r.item), lo: null, hi: null, rows: 0 });
    it.rows++;
    if (!r.cand) continue;
    for (const c of r.cand) { if (it.lo == null || c < it.lo) it.lo = c; if (it.hi == null || c > it.hi) it.hi = c; }
  }
  return { rows, items, kg: KG };
}
module.exports = { build, FISH, T608_LINES };

if (require.main === module) {
  const B = build();
  const MD = process.argv.includes('--md');
  const ji = process.argv.indexOf('--json');
  if (ji > 0) fs.writeFileSync(process.argv[ji + 1], JSON.stringify(B, null, 1));
  const f = (x) => (x == null ? '—' : String(x));
  if (MD) {
    console.log('| 품목 | 지금 임시 값 | 견준 품목 | 그 품목의 지금 값 | T608 비 | 후보 낮음 | 후보 높음 | 비고 | 출처 |');
    console.log('|---|---:|---|---:|---|---:|---:|---|---|');
    for (const r of B.rows) {
      const it = B.items[r.item];
      const lo = r.cand ? r.cand[0] : null, hi = r.cand ? r.cand[r.cand.length - 1] : null;
      console.log(`| ${r.ko} | ${f(it.now)} | ${r.cmpKo} | ${f(r.cmpVal)} | ${r.ratioText} | ${r.cand ? '**' + lo + '**' : '빈칸'} | ${r.cand ? (hi !== lo ? '**' + hi + '**' : '(같음)') : '빈칸'} | ${r.note || ''} | ${r.src} |`);
    }
  } else {
    for (const [id, it] of Object.entries(B.items)) console.log(`${it.ko.padEnd(10)} ${id.padEnd(15)} 지금 ${f(it.now).padStart(5)} · 후보 ${f(it.lo)} ~ ${f(it.hi)}`);
  }
}
