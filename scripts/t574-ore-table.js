#!/usr/bin/env node
// (@regress 없음 — 러너 밖 · T574 표 짜는 기계)
// =============================================================================
// T574 — 두 존 광종의 **거리(TV)** 표 + 굽기 미리보기(관측 전용 · 정본 json 무변 · 새 수 0)
//
//   ⓐ 지금(실측 면적): 정본 `hanbando-terrain.json` 광맥의 지배 광종(`mineral`)을 원판 넓이(πr²)로 가중 — 카드 머리의 그 비
//      · 조성(`minerals` 분포 × 넓이)도 같이 — 다광종의 은이 여기서 보인다
//   ⓑ 설계(프로필 표): 지금 = 두 존 같은 POOL(TV 0) · 새 = `region-profiles` 표(땅속 · 꼬리 전)
//   ⓒ 굽기 미리보기(L 셋 250·500·1000 · ★정본은 안 쓴다):
//      · 닛폰 = **다 굽기**(R1) — 광맥 55 전부를 `region-profiles.bakeOre`(계획기·부팅이 부르는 그 함수 · 같은 씨 731)로.
//        옛 55 의 광종은 카드 머리대로 "큰 광맥 셋이 우연히 받은 것"이고, T550 이 새 광맥을 같은 함수로 굽는다.
//      · 한반도 = **덜 흔드는 굽기**(R2) — 정본 787(재민 v9 + 마을 배정)을 될 수 있는 대로 둔다:
//          ① 꼬리 — 씨 732 의 자리 해시 < 그 자리 꼬리 몫 T 이면 이웃 고유 품목(닛폰 옥·유황 …)으로(어느 것인지는 씨 731)
//          ② 이 존에서 '없음'이 된 정본 광종(한반도 옥)은 이 존 가중에서 다시 뽑는다(씨 731)
//          ③ 나머지는 정본 그대로
//        (①② 다 재민 08-01 굽기 규칙 셋을 얹는다 — 주요엔 철 없음 · 은 단독 없음 · 다광종)
//      `--write <파일> --L 500` 을 주면 그 미리보기 json 을 **그 파일에만** 쓴다 — ③ 자 판의 입력.
//   pk: 광종이 바뀐 광맥만 정본 식(`orePeakFor(광종, 0.30, hash2(⌊x/32⌋, ⌊y/32⌋, 500))` — test-mining 이 지키는 식)으로 다시 매긴다
//       (`migrate-veins-polymetal.js` 의 repk 와 같은 규약 · 역산 금지) · 안 바뀐 광맥은 pk·minerals 그대로.
//
// 쓰는 법: node scripts/t574-ore-table.js [--json f.json] [--write <미리보기.json> --L 500 [--new]]
// =============================================================================
'use strict';
const path = require('path');
const fs = require('fs');
const R = (p) => require(path.join(__dirname, '..', p));
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const has = (k) => process.argv.includes(k);
const GAME = path.join(__dirname, '..', 'server', 'hanbando-terrain.json');
const SP = R('server/specialty');
const HB = R('server/hanbando-minerals');
const say = (s) => process.stdout.write(s + '\n');
if (has('--new')) process.env.T574_NEW_ITEMS = '1';
const RP = R('server/region-profiles');

const doc = JSON.parse(fs.readFileSync(GAME, 'utf8'));
const ZS = ['hanbando', 'nippon'];
const hash2 = (ix, iy, s) => { let h = (ix | 0) * 374761393 + (iy | 0) * 668265263 + (s | 0) * 1274126177; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967295; };
const area = (o) => Math.PI * Math.pow(o.radius / 32, 2);
function dist(ores, comp, majOnly) {
  const c = {}; let t = 0;
  for (const o of ores) {
    if (majOnly && o.minor) continue;
    const a = area(o), d = comp ? (o.minerals || { [o.mineral]: 1 }) : { [o.mineral]: 1 };
    let s = 0; for (const k in d) s += d[k];
    for (const k in d) { c[k] = (c[k] || 0) + a * d[k] / s; }
    t += a;
  }
  for (const k in c) c[k] /= t;
  return c;
}
const fmt = (d) => Object.entries(d).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${(v * 100).toFixed(1)}`).join(' · ');
const u731 = (o) => hash2(Math.floor(o.center[0] / 32), Math.floor(o.center[1] / 32), 731);
const u732 = (o) => hash2(Math.floor(o.center[0] / 32), Math.floor(o.center[1] / 32), 732);
const repk = (e, m) => { e.pk = SP.orePeakFor(m, 0.30, hash2(Math.floor(e.center[0] / 32), Math.floor(e.center[1] / 32), 500)); };
const setMin = (e, b) => { e.mineral = b.mineral; repk(e, b.mineral); if (b.minerals) e.minerals = b.minerals; else delete e.minerals; };
// 재민 08-01 굽기 규칙 셋(region-profiles.bakeOre 와 같은 셋 — 거기 NO_MAJOR·POLY 를 읽는다 · 사본 0)
function rules(order, p, u, isMajor) {
  const q = Object.assign({}, p); if (isMajor) for (const k of RP.NO_MAJOR) delete q[k];
  let s = 0; for (const k of order) s += q[k] || 0; if (!(s > 0)) return null;
  let r = Math.max(0, Math.min(1 - 1e-12, u)) * s, k = null;
  for (const id of order) { const w = q[id] || 0; if (!(w > 0)) continue; k = id; r -= w; if (r < 0) break; }
  if (k === 'silver') k = 'lead';
  const poly = HB.POLY[k]; return { mineral: k, minerals: poly ? Object.assign({}, poly) : null };
}
// R1 — 다 굽기
function rebakeAll(zone, ores, Lc) {
  let changed = 0, chMaj = 0;
  const out = ores.map((o) => {
    const b = RP.bakeOre(zone, o.center[0], o.center[1], u731(o), !o.minor, Lc);
    const e = Object.assign({}, o);
    if (b && b.mineral !== o.mineral) { changed++; if (!o.minor) chMaj++; setMin(e, b); }
    return e;
  });
  return { ores: out, changed, chMaj };
}
// R2 — 덜 흔드는 굽기
function rebakeKeep(zone, ores, Lc) {
  const own = RP.weightsOf('ore', zone), ownOrder = Object.keys(own);
  let changed = 0, chMaj = 0, toTail = 0, redraw = 0; const majList = [];
  const out = ores.map((o) => {
    const e = Object.assign({}, o);
    const m = RP.mixAt('ore', zone, o.center[0], o.center[1], null, null, Lc);
    const tailIds = m.order.filter((k) => !(own[k] > 0));
    let b = null, why = '';
    if (tailIds.length && u732(o) < m.tail) { const tp = {}; for (const k of tailIds) tp[k] = m.p[k]; b = rules(tailIds, tp, u731(o), !o.minor); why = '꼬리'; }
    if (!b && !(own[o.mineral] > 0)) { b = rules(ownOrder, own, u731(o), !o.minor); why = '없음→다시'; }
    if (b && b.mineral !== o.mineral) {
      changed++; if (why === '꼬리') toTail++; else redraw++;
      if (!o.minor) { chMaj++; majList.push(`${o.name} ${o.mineral}→${b.mineral}(${why})`); }
      setMin(e, b);
    }
    return e;
  });
  return { ores: out, changed, chMaj, toTail, redraw, majList };
}
const res = { now: {}, design: {}, preview: {} };
say('## ⓐ 지금 — 정본 광맥 실측 면적(지배 광종 · 원판 πr²)');
for (const Z of ZS) {
  const o = doc[Z].ores;
  res.now[Z] = { dom: dist(o, false), comp: dist(o, true), majDom: dist(o, false, true), n: o.length, maj: o.filter((v) => !v.minor).length };
  say(`  ${Z}(광맥 ${o.length} · 주요 ${res.now[Z].maj}): ${fmt(res.now[Z].dom)}`);
  say(`     조성(다광종 분포): ${fmt(res.now[Z].comp)}`);
}
res.now.tv = +RP.tv(res.now.hanbando.dom, res.now.nippon.dom).toFixed(4);
res.now.tvComp = +RP.tv(res.now.hanbando.comp, res.now.nippon.comp).toFixed(4);
res.now.tvMaj = +RP.tv(res.now.hanbando.majDom, res.now.nippon.majDom).toFixed(4);
say(`  **TV 지금(실측 면적 · 지배 광종) = ${res.now.tv}** · 조성 ${res.now.tvComp} · 주요만 ${res.now.tvMaj}`);

say('\n## ⓑ 설계 — 프로필 표(땅속 · 굽기 전)');
const poolTv = RP.tv(HB.POOL, HB.POOL);
res.design = { tvNow: poolTv, tvNew: RP.tvTable(), hb: RP.weightsOf('ore', 'hanbando'), np: RP.weightsOf('ore', 'nippon'), newItems: RP.newOn() };
say(`  지금: 두 존 같은 POOL(계획기 T348 "존 무관") → TV ${poolTv}`);
say(`  새: 한반도 ${fmt(res.design.hb)}`);
say(`      닛폰  ${fmt(res.design.np)}`);
say(`  **TV 새(표) = ${res.design.tvNew.ore}** · 나무 ${res.design.tvNew.tree} · 낚시 ${res.design.tvNew.fishRod}(biome 목록 — 지금과 같다) · 민물 ${res.design.tvNew.fishFresh} · 군락 ${res.design.tvNew.forage}(식료 칸 빈칸 — T576)`);

say('\n## ⓒ 굽기 미리보기 — 닛폰 다 굽기(R1) + 한반도 덜 흔드는 굽기(R2) · 정본 무변');
say('| L | TV(지배 · 면적) | TV(조성) | 닛폰 바뀐 광맥(주요) | 한반도 바뀐 광맥(주요) · 꼬리로 · 다시 뽑기 | 한반도 뒤(지배 · 면적) | 닛폰 뒤(지배 · 면적) |');
say('|---:|---:|---:|---|---|---|---|');
for (const Lc of [250, 500, 1000]) {
  const n = rebakeAll('nippon', doc.nippon.ores, Lc), h = rebakeKeep('hanbando', doc.hanbando.ores, Lc);
  const nd = dist(n.ores, false), hd = dist(h.ores, false), nc = dist(n.ores, true), hc = dist(h.ores, true);
  const r = { L: Lc, tv: +RP.tv(hd, nd).toFixed(4), tvComp: +RP.tv(hc, nc).toFixed(4), np: { changed: n.changed, chMaj: n.chMaj }, hb: { changed: h.changed, chMaj: h.chMaj, toTail: h.toTail, redraw: h.redraw, majList: h.majList }, npDom: nd, hbDom: hd, npComp: nc, hbComp: hc };
  res.preview[Lc] = r;
  say(`| ${Lc} | ${r.tv} | ${r.tvComp} | ${n.changed}/${doc.nippon.ores.length}(${n.chMaj}) | ${h.changed}/${doc.hanbando.ores.length}(${h.chMaj}) · ${h.toTail} · ${h.redraw} | ${fmt(hd)} | ${fmt(nd)} |`);
}
for (const Lc of [250, 500, 1000]) say(`  한반도 주요 바뀜 L ${Lc}: ${res.preview[Lc].hb.majList.join(' · ') || '없음'}`);
if (has('--json')) { fs.writeFileSync(arg('--json'), JSON.stringify(res, null, 1)); say('→ ' + arg('--json')); }
if (has('--write')) {
  const out = arg('--write'), Lc = +arg('--L', '500');
  const d2 = JSON.parse(fs.readFileSync(GAME, 'utf8'));
  const n = rebakeAll('nippon', d2.nippon.ores, Lc), h = rebakeKeep('hanbando', d2.hanbando.ores, Lc);
  d2.nippon.ores = n.ores; d2.hanbando.ores = h.ores;
  say(`  미리보기: L ${Lc} · 닛폰 다 굽기 ${n.changed}/${n.ores.length} · 한반도 덜 흔드는 굽기 ${h.changed}/${h.ores.length}(주요 ${h.chMaj})${RP.newOn() ? ' · 새 품목 켬' : ''}`);
  const wasMin = !fs.readFileSync(GAME, 'utf8').includes('\n');
  fs.writeFileSync(out, wasMin ? JSON.stringify(d2) : JSON.stringify(d2, null, 1));
  say('→ 미리보기 json ' + out + '(정본 아님)');
}
