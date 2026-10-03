#!/usr/bin/env node
// (@regress 없음 — 러너 밖 · T574 추신4 굽기 기계 · 기본은 표만)
// =============================================================================
// T574 추신4 — 두 존 정본 광맥의 광종을 꼬리 L(재민 10-03 "꼬리 폭은 네 의견대로" — 500셀)로 **다시 굽는다**.
//   자리(좌표·크기·이름·주요/자잘)는 그대로 · 광종 칸(`mineral` · `minerals` · `pk`)만 바뀐다.
//   ① 닛폰 55 = T580 이 낸 `scripts/t580-bake-nippon.js --L <L> --apply` 를 **부른다**(다 굽기 · `bakeOre` · 사본 0).
//   ② 한반도 787 = **덜 흔드는 굽기**(`region-profiles.rebakeKeep` — 재민 v9 + 마을 배정을 될 수 있는 대로 둔다):
//      꼬리(자리 해시 씨 732 < 그 자리 꼬리 몫 T → 닛폰 고유 품목에서) · '없음'이 된 광종(옥) → 한반도 품목에서 다시 ·
//      나머지는 정본 그대로. 둘 다 재민 08-01 규칙 셋(주요 철·사철 0 · 은 단독 0 → 연은 · 납·구리·금 POLY)을 지난다.
//      바뀐 광맥의 pk = 정본 식 `orePeakFor(광종, 0.30, veinU(x, y, 500))`(T580 · `t574-ore-table.js` repk 와 같은 규약).
//   ③ 바뀐 광맥의 **옛 기록 통째**(여섯째 판)를 `server/region-bake-off.json` 에 적는다 — `T574_REGION=0`(끔)이면
//      terrain.js 가 정본을 실을 때 `restoreBakeOff` 로 되돌린다(두 자 바이트 동일의 길).
//   ⚠새 품목 셋(진사·사철·조개 팔찌감)은 **끔으로** 굽는다(값 판정 전 — 추신4) · 손잡이를 밖에서 줘도 지운다.
//   ⚠닛폰 자잘 광맥(T580 ④ 최소 504 · 재민 값)은 이 기계 밖 — 수를 고르면 PM 이 자리 + 같은 `bakeOre`.
//
// 쓰는 법: node scripts/t574-bake.js [--L 500]           → 표만(정본 무변) — 바뀔 광맥 수 · 규칙 셋 · 면적 몫
//          node scripts/t574-bake.js --L 500 --apply     → 정본 두 존 광종 칸 + server/region-bake-off.json
//          [--json 표.json]
// =============================================================================
'use strict';
process.env.T574_NEW_ITEMS = '';   // 새 품목 셋은 끔으로 굽는다(specialty 를 싣기 전에)
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const ROOT = path.join(__dirname, '..');
const GAME = path.join(ROOT, 'server', 'hanbando-terrain.json');
const OFF = path.join(ROOT, 'server', 'region-bake-off.json');
const RP = require(path.join(ROOT, 'server', 'region-profiles'));
const SP = require(path.join(ROOT, 'server', 'specialty'));
const HB = require(path.join(ROOT, 'server', 'hanbando-minerals'));
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const APPLY = process.argv.includes('--apply');
const Lc = +arg('--L', String(RP.L_DEFAULT));
if (!(Lc > 0)) { console.error('--L <셀> 은 0 보다 커야 한다'); process.exit(2); }
const say = (s) => process.stdout.write(s + '\n');
const MINERAL_KEYS = ['mineral', 'minerals', 'pk'];   // 굽기가 바꾸는 칸 — 그 밖의 칸은 한 글자도 안 바뀐다(자리 그대로)

// 한반도 — 덜 흔드는 굽기(정본 json 한 판을 받아 새 광맥 배열과 셈을 돌려준다)
function bakeHanbando(ores) {
  let changed = 0, chMaj = 0, tail = 0, redraw = 0; const majList = [];
  const out = ores.map((o) => {
    const b = RP.rebakeKeep('hanbando', o, Lc);
    if (!b || b.mineral === o.mineral) return o;
    changed++; if (b.why === 'tail') tail++; else redraw++;
    if (!o.minor) { chMaj++; majList.push(`${o.name} ${o.mineral}→${b.mineral}(${b.why === 'tail' ? '꼬리' : '없음→다시'})`); }
    const e = Object.assign({}, o, { mineral: b.mineral, pk: SP.orePeakFor(b.mineral, 0.30, RP.veinU(o.center[0], o.center[1], 500)) });
    if (b.minerals) e.minerals = b.minerals; else delete e.minerals;
    return e;
  });
  return { out, changed, chMaj, tail, redraw, majList };
}
// 재민 08-01 규칙 셋 — 위반 수(① 주요 철·사철 · ③ 은 단독 · ② 납·구리·금은 POLY 그대로 / 나머지는 단광종)
function ruleCheck(ores) {
  let iron = 0, silver = 0, poly = 0;
  for (const o of ores) {
    if (!o.minor && RP.NO_MAJOR.includes(o.mineral)) iron++;
    if (o.mineral === 'silver') silver++;
    const want = HB.POLY[o.mineral] || null;
    if (JSON.stringify(o.minerals || null) !== JSON.stringify(want)) poly++;
  }
  return { iron, silver, poly, total: iron + silver + poly };
}
function share(ores) {
  const c = {}; let t = 0;
  for (const o of ores) { const a = Math.PI * Math.pow(o.radius / 32, 2); c[o.mineral] = (c[o.mineral] || 0) + a; t += a; }
  for (const k in c) c[k] = c[k] / t;
  return c;
}
const fmt = (d) => Object.entries(d).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${(v * 100).toFixed(1)}`).join(' · ');
const cnt = (ores) => { const c = {}; for (const o of ores) c[o.mineral] = (c[o.mineral] || 0) + 1; return c; };

const raw0 = fs.readFileSync(GAME, 'utf8');
const doc0 = JSON.parse(raw0);
if (JSON.stringify(doc0) !== raw0.trim() && !raw0.includes('\n')) { console.error('정본 json 이 왕복 바이트 같지 않다 — 굽기를 멈춘다'); process.exit(3); }
const res = { L: Lc, s0: RP.S0(), before: {}, after: {} };
for (const z of ['hanbando', 'nippon']) res.before[z] = { n: doc0[z].ores.length, count: cnt(doc0[z].ores), area: share(doc0[z].ores), rules: ruleCheck(doc0[z].ores) };

if (!APPLY) {
  const h = bakeHanbando(doc0.hanbando.ores);
  say(`## T574 추신4 굽기 표 — L ${Lc} · s₀ ${RP.S0()} · 새 품목 끔 · 정본 무변`);
  say(`한반도 ${doc0.hanbando.ores.length}: 바뀔 광맥 ${h.changed}(주요 ${h.chMaj}) · 꼬리 ${h.tail} · 없음→다시 ${h.redraw} · 규칙 셋 위반 지금 ${res.before.hanbando.rules.total} → 뒤 ${ruleCheck(h.out).total}`);
  say(`  면적 몫 지금: ${fmt(share(doc0.hanbando.ores))}`);
  say(`  면적 몫 뒤:   ${fmt(share(h.out))}`);
  for (const m of h.majList) say(`  · ${m}`);
  say('\n닛폰 — T580 의 굽기 기계(표만):');
  say(execFileSync(process.execPath, [path.join(__dirname, 't580-bake-nippon.js')], { env: Object.assign({}, process.env, { T574_NEW_ITEMS: '' }) }).toString().trim());
  if (arg('--json')) fs.writeFileSync(arg('--json'), JSON.stringify(Object.assign(res, { hanbando: { changed: h.changed, chMaj: h.chMaj, tail: h.tail, redraw: h.redraw, majList: h.majList } }), null, 1));
  say('\n표만 — 정본 무변(적용은 --apply)');
  process.exit(0);
}

// ── 적용 ──────────────────────────────────────────────────────────────────────
if (fs.existsSync(OFF)) { console.error(`이미 구웠다 — ${path.relative(ROOT, OFF)} 가 있다(두 번 구우면 옛 기록이 구운 칸으로 덮인다). 되돌린 뒤 다시.`); process.exit(4); }
// ① 닛폰 — T580 의 기계를 부른다(그 기계가 정본을 새로 읽어 닛폰 광맥 칸만 갈아 쓴다)
execFileSync(process.execPath, [path.join(__dirname, 't580-bake-nippon.js'), '--L', String(Lc), '--apply'], { env: Object.assign({}, process.env, { T574_NEW_ITEMS: '' }), stdio: 'inherit' });
const raw1 = fs.readFileSync(GAME, 'utf8');
const doc1 = JSON.parse(raw1);
// ② 한반도 — 덜 흔드는 굽기
const h = bakeHanbando(doc1.hanbando.ores);
doc1.hanbando.ores = h.out;
// ③ 옛 기록 — 두 존에서 바뀐 광맥 통째(여섯째 판) · 자리 칸이 바뀌었으면 멈춘다
const off = { T574: '추신4 — L 500 굽기 전(여섯째 판)의 광맥 기록. T574_REGION=0 이면 terrain.js 가 region-profiles.restoreBakeOff 로 되돌린다(자리로 찾고 지금 광종이 now 일 때만).',
  L: Lc, s0: RP.S0(), zones: {} };
for (const z of ['hanbando', 'nippon']) {
  const a = doc0[z].ores, b = doc1[z].ores;
  if (a.length !== b.length) { console.error(`${z} 광맥 수가 바뀌었다(${a.length} → ${b.length}) — 멈춘다`); process.exit(5); }
  off.zones[z] = [];
  for (let i = 0; i < a.length; i++) {
    if (JSON.stringify(a[i]) === JSON.stringify(b[i])) continue;
    const keys = new Set(Object.keys(a[i]).concat(Object.keys(b[i])));
    for (const k of keys) if (!MINERAL_KEYS.includes(k) && JSON.stringify(a[i][k]) !== JSON.stringify(b[i][k])) { console.error(`${z} ${a[i].name} 의 자리 칸 ${k} 가 바뀌었다 — 멈춘다`); process.exit(6); }
    off.zones[z].push({ c: a[i].center, now: b[i].mineral, was: a[i] });
  }
}
fs.writeFileSync(GAME, raw1.includes('\n') ? JSON.stringify(doc1, null, 1) : JSON.stringify(doc1));
fs.writeFileSync(OFF, JSON.stringify(off, null, 1) + '\n');
for (const z of ['hanbando', 'nippon']) res.after[z] = { n: doc1[z].ores.length, changed: off.zones[z].length, count: cnt(doc1[z].ores), area: share(doc1[z].ores), rules: ruleCheck(doc1[z].ores) };
say(`기록: 한반도 ${h.changed}/${doc1.hanbando.ores.length}(주요 ${h.chMaj} · 꼬리 ${h.tail} · 없음→다시 ${h.redraw}) · 닛폰 ${off.zones.nippon.length}/${doc1.nippon.ores.length} · L ${Lc}`);
for (const z of ['hanbando', 'nippon']) say(`  ${z} 규칙 셋 위반 ${res.before[z].rules.total} → ${res.after[z].rules.total}(주요 철 ${res.after[z].rules.iron} · 은 단독 ${res.after[z].rules.silver} · POLY ${res.after[z].rules.poly}) · 면적 ${fmt(res.after[z].area)}`);
say(`  옛 기록 → ${path.relative(ROOT, OFF)}(${off.zones.hanbando.length + off.zones.nippon.length}줄)`);
if (arg('--json')) fs.writeFileSync(arg('--json'), JSON.stringify(Object.assign(res, { hanbando: { changed: h.changed, chMaj: h.chMaj, tail: h.tail, redraw: h.redraw, majList: h.majList } }), null, 1));
