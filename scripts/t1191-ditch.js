#!/usr/bin/env node
'use strict';
// (@regress 없음 — 러너 밖 · T1191 계측기 · 판 자 DB 를 읽기만 · 제품 무변 · 판정 0)
// === scripts/t1191-ditch.js — 환호(시범 마을 도랑) 꼴 셋의 칸 · 일손 · 영토 겹침 + 영토가 자라며 도랑을 만나면 ===
//
// 쓰는 법: node scripts/t1191-ditch.js [--json <파일>] <판.db> [<판.db> …]
//   판.db = `scripts/t577-server-run.js` 가 남기는 판 DB(부팅 직후 = 2날 판 · 끝 = 800날 판 · 둘 다 같은 표로 읽는다)
//
// 자(전부 정본 — 사본 0):
//   · 도랑 = `village_buildings` 'ditch' 행(`_ditchDig` 가 부팅 때 판 칸 · 시범 마을만) · 영토 = 'terr' 행(`vil._terrSet` 이 읽는 그 행)
//   · 시딩 영토 = 회관 `data.bnd`(시딩 때 구운 외곽선 — `t1063-terr-count.js` 와 같은 채움)
//   · 꼴 기하 = `server/village-layout.js` `ditchRing`(검단리 규약 — 폭 2 · 장/단 118/70 · 출입구 · 여유) 그 함수를 그대로 부른다.
//     축(단축 = 강 쪽)은 판 DB 에 없으므로 판 도랑 칸에서 되찾는다(주축 PCA · 그 수직 · 1° 훑기 가운데 판 도랑과 가장 많이 겹치는 축) — 되찾은 축으로 같은 집을 넣어 다시 그린 고리가
//     판 도랑과 몇 칸 겹치나를 같이 적는다(되찾기 검사 · 지형 구멍은 DB 에 없어 기하 고리가 조금 크다).
//   · 일손 = 개간 셀 속도(`LIFE_CLEAR_PDAY` = 3 칸/인·일 — 생활층 정본 · 도랑 파기 속도는 게임에 없다 → 빌려 쓴 자) · 흙 = 칸 × 깊이(검단리 0.2 ~ 1.1 m)
// 꼴: ㄷ 마을 전체 고리(지금 판 고리) + 도랑 칸 영토 편입 · ㄹ 핵심 구역(회관 마당 · 곳간)만 두른 고리 · (섞기는 보고에서 유적 표로 고른다 — 둘의 수를 다 적는다)
const fs = require('fs');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');
const VL = require(path.join(__dirname, '..', 'server', 'village-layout.js'));
const ji = process.argv.indexOf('--json'), JOUT = ji > 0 ? process.argv[ji + 1] : null;
const files = process.argv.slice(2).filter((f, i, a) => f !== '--json' && a[i - 1] !== '--json' && fs.existsSync(f));
if (!files.length) { console.error('쓰는 법: node scripts/t1191-ditch.js [--json <파일>] <판.db> …'); process.exit(2); }
let LIFE_CLEAR_PDAY = 3;
try { const src = fs.readFileSync(path.join(__dirname, '..', 'server', 'villages.js'), 'utf8'); const m = /const LIFE_CLEAR_PDAY\s*=\s*(\d+(?:\.\d+)?)/.exec(src); if (m) LIFE_CLEAR_PDAY = +m[1]; } catch (e) {}
const DEPTH = [0.2, 1.1];   // 검단리 도랑 깊이(설계/설계_장마당_환호_고증과_설계안.md B-1 · 우리역사넷)

function seedTerr(hall) {
  let d = null; try { d = JSON.parse(hall.data || 'null'); } catch (e) { d = null; }
  const b = d && Array.isArray(d.bnd) ? d.bnd : null;
  if (!b || !b.length) return new Set();
  const mask = new Map(); let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (let i = 0; i < b.length; i += 3) { const x = hall.cx + b[i], y = hall.cy + b[i + 1]; mask.set(x + ',' + y, b[i + 2]); x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
  const out = new Set(), q = [[hall.cx, hall.cy]];
  const D = [[0, -1, 1], [1, 0, 2], [0, 1, 4], [-1, 0, 8]];
  while (q.length) {
    const [x, y] = q.pop(), k = x + ',' + y;
    if (out.has(k) || x < x0 || x > x1 || y < y0 || y > y1) continue;
    out.add(k);
    const m = mask.get(k) || 0;
    for (const [dx, dy, bit] of D) if (!(m & bit)) q.push([x + dx, y + dy]);
  }
  return out;
}
// 도랑 칸의 주축 — 2×2 공분산의 큰 고유벡터 = 장축(u) · 단축 v = u 의 수직(= `ditchRing` 의 toWater 방향)
function frameOf(cells, cx, cy) {
  let sxx = 0, syy = 0, sxy = 0;
  for (const c of cells) { const dx = c.cx - cx, dy = c.cy - cy; sxx += dx * dx; syy += dy * dy; sxy += dx * dy; }
  const th = 0.5 * Math.atan2(2 * sxy, sxx - syy);
  const u = { x: Math.cos(th), y: Math.sin(th) };
  return { toWater: { x: -u.y, y: u.x } };
}
const K = (c) => c.cx + ',' + c.cy;
const out = [];
for (const f of files) {
  const d = new DatabaseSync(f, { readOnly: true });
  const meta = { value: (d.prepare('SELECT max(day) m FROM villages').get() || {}).m };   // 마을 행이 적은 날(마지막 마감)
  const vrows = new Map(d.prepare('SELECT id, name, cx, cy, population FROM villages').all().map((r) => [r.id, r]));
  const terr = new Map(), owner = new Map();
  for (const r of d.prepare("SELECT village_id v, cx, cy FROM village_buildings WHERE type = 'terr'").all()) {
    const k = r.cx + ',' + r.cy; if (!terr.has(r.v)) terr.set(r.v, new Set()); terr.get(r.v).add(k); if (!owner.has(k)) owner.set(k, r.v);
  }
  const by = (type) => { const m = new Map(); for (const r of d.prepare('SELECT village_id v, cx, cy, data FROM village_buildings WHERE type = ?').all(type)) { if (!m.has(r.v)) m.set(r.v, []); m.get(r.v).push(r); } return m; };
  const ditch = by('ditch'), house = by('house'), hall = by('hall'), gran = by('granary');
  // 생활층이 지은 집(buildings · owner npc_simvil_<id>) — 끝 판의 집 자리(움집 · 집 칸 px ÷ 32)
  const lifeHouse = new Map();
  try { for (const r of d.prepare("SELECT owner_id, type, x, y FROM buildings WHERE type IN ('house','hut','pithouse')").all()) { const m = /^npc_simvil_(\d+)$/.exec(r.owner_id || ''); if (!m) continue; const v = +m[1]; if (!lifeHouse.has(v)) lifeHouse.set(v, []); lifeHouse.get(v).push({ cx: Math.floor(r.x / 32), cy: Math.floor(r.y / 32) }); } } catch (e) {}
  for (const [v, D] of ditch) {
    const V = vrows.get(v) || { name: '?', cx: 0, cy: 0 }, H = (hall.get(v) || [])[0];
    const ccx = H ? H.cx : V.cx, ccy = H ? H.cy : V.cy;
    const Dset = new Set(D.map(K)), own = terr.get(v) || new Set(), seed = H ? seedTerr(H) : new Set();
    const houses = (house.get(v) || []).map((h) => ({ cx: h.cx, cy: h.cy }));
    // 되찾기 — 주축과 그 수직 둘 다 그려 보고 판 도랑과 더 많이 겹치는 쪽(PCA 는 장 · 단 축을 바꿔 줄 수 있다 · 지형 구멍이 많으면)
    const f0 = frameOf(D, ccx, ccy), cands = [f0, { toWater: { x: -f0.toWater.y, y: f0.toWater.x } }];
    for (let deg = 0; deg < 180; deg++) cands.push({ toWater: { x: Math.cos(deg * Math.PI / 180), y: Math.sin(deg * Math.PI / 180) } });   // 1° 훑기(지형 구멍이 한쪽에 몰리면 PCA 가 기운다)
    let fr = f0, re = null, reHit = -1;
    const tryRing = (ff, hs) => { const rr = VL.ditchRing(ccx, ccy, { houses: hs, axis: ff }); const ss = new Set(rr.cells.map(K)); let h = 0; for (const k of Dset) if (ss.has(k)) h++; if (h > reHit) { reHit = h; re = rr; fr = ff; } };
    for (const ff of cands) tryRing(ff, houses);
    // 부팅 때 고리를 잡은 집 목록(`vil._houseCells`)은 DB 집 행과 다를 수 있다 — 단반경 b 도 훑는다(가짜 집 하나를 단축 위에 놓아 `ditchRing` 이 그 b 를 고르게 · 정본 함수 그대로)
    if (reHit < Dset.size * 0.9) {
      const bMin = VL.HALL_YARD + VL.LOT_R + VL.DITCH_MARGIN;
      for (const ff of cands) for (let b = bMin; b <= 90; b++) {
        const r0 = b - VL.DITCH_MARGIN - VL.LOT_R; const vv = ff.toWater;
        tryRing(ff, [{ cx: ccx + vv.x * r0, cy: ccy + vv.y * r0 }]);
      }
    }
    const ell = (x, y, a, b) => { const dx = x - ccx, dy = y - ccy, u = { x: fr.toWater.y * -1, y: fr.toWater.x }, vv = fr.toWater; const pu = dx * (-vv.y) + dy * vv.x, pv = dx * vv.x + dy * vv.y; return (pu / a) * (pu / a) + (pv / b) * (pv / b); };
    // ㄷ — 지금 고리 + 영토 편입
    const outOwn = [...Dset].filter((k) => !own.has(k)).length, outSeed = [...Dset].filter((k) => !seed.has(k)).length;
    let other = 0; const otherV = new Set();
    for (const k of Dset) { const o = owner.get(k); if (o != null && o !== v) { other++; otherV.add(o); } }
    // 영토가 고리를 넘었나 — 끝 영토 칸 가운데 바깥 타원 밖 · 고리 칸(도랑) 위 · 안쪽
    let terrBeyond = 0, terrOnDitch = 0, terrInside = 0;
    for (const k of own) { const ci = k.indexOf(','), x = +k.slice(0, ci), y = +k.slice(ci + 1); if (Dset.has(k)) { terrOnDitch++; continue; } const e = ell(x, y, re.ao, re.bo); if (e > 1) terrBeyond++; else terrInside++; }
    // 집이 고리 안 · 밖(시딩 집 + 생활층이 지은 집)
    const allH = houses.concat(lifeHouse.get(v) || []);
    let hIn = 0, hOut = 0; for (const h of allH) { if (ell(h.cx, h.cy, re.a, re.b) < 1) hIn++; else hOut++; }
    // ㄷ′ — 지금(이 판 날) 집 전부를 품게 다시 그린 마을 전체 고리(같은 축 · 같은 규약)
    const allH0 = houses.concat(lifeHouse.get(v) || []);
    const rw = VL.ditchRing(ccx, ccy, { houses: allH0, axis: fr });
    const rwSet = new Set(rw.cells.map(K));
    let rwOther = 0; const rwOV = new Set(); for (const k of rwSet) { const o = owner.get(k); if (o != null && o !== v) { rwOther++; rwOV.add(o); } }
    const rwOutOwn = [...rwSet].filter((k) => !own.has(k) && !owner.has(k)).length;
    // ㄹ — 핵심 구역(회관 마당 + 곳간)만 두른 고리(같은 축 · 같은 규약 · 집 없이 곳간 자리를 '집'으로)
    const core = (gran.get(v) || []).map((g) => ({ cx: g.cx, cy: g.cy }));
    const rc = VL.ditchRing(ccx, ccy, { houses: core, axis: fr });
    const rcSet = new Set(rc.cells.map(K));
    const rcOutOwn = [...rcSet].filter((k) => !own.has(k)).length, rcOutSeed = [...rcSet].filter((k) => !seed.has(k)).length;
    let rcOther = 0; for (const k of rcSet) { const o = owner.get(k); if (o != null && o !== v) rcOther++; }
    let rcHin = 0; for (const h of allH) if (ell(h.cx, h.cy, rc.a, rc.b) < 1) rcHin++;
    const man = (n) => +(n / LIFE_CLEAR_PDAY).toFixed(1);
    out.push({ db: path.basename(f), day: meta ? +meta.value : null, v, name: V.name, pop: V.population,
      D: { cells: Dset.size, a: re.a, b: re.b, perim: +(Math.PI * (3 * (re.a + re.b) - Math.sqrt((3 * re.a + re.b) * (re.a + 3 * re.b)))).toFixed(0), reHit, reCells: re.cells.length,
        outSeed, outOwn, overlapOther: other, otherVils: otherV.size, toAddTerr: outOwn - other, manDays: man(Dset.size), m3: [+(Dset.size * DEPTH[0]).toFixed(0), +(Dset.size * DEPTH[1]).toFixed(0)] },
      W: { cells: rwSet.size, a: rw.a, b: rw.b, overlapOther: rwOther, otherVils: rwOV.size, noOwner: rwOutOwn, manDays: man(rwSet.size) },
      grow: { terr: own.size, seed: seed.size, terrBeyond, terrOnDitch, terrInside },
      houses: { all: allH.length, inRing: hIn, outRing: hOut },
      R: { cells: rcSet.size, a: rc.a, b: rc.b, outSeed: rcOutSeed, outOwn: rcOutOwn, overlapOther: rcOther, housesIn: rcHin, manDays: man(rcSet.size), m3: [+(rcSet.size * DEPTH[0]).toFixed(0), +(rcSet.size * DEPTH[1]).toFixed(0)] } });
  }
}
console.log(`| 판 | 날 | 마을 | 인구 | ㄷ 도랑 칸 | 장 · 단반경(m) | 둘레(m) | 시딩 영토 밖 | 끝 영토 밖 | 이웃 영토와 겹침 | 일손(인·일 · 개간 셀 속도 ${LIFE_CLEAR_PDAY}) | 흙(m³ · 깊이 0.2 ~ 1.1) | 되찾기 겹침 |`);
console.log('|---|---:|---|---:|---:|---|---:|---:|---:|---:|---:|---|---|');
for (const r of out) console.log(`| ${r.db} | ${r.day} | ${r.name} | ${r.pop} | ${r.D.cells} | ${r.D.a} · ${r.D.b} | ${r.D.perim} | ${r.D.outSeed} | ${r.D.outOwn} | ${r.D.overlapOther}(${r.D.otherVils}곳) | ${r.D.manDays} | ${r.D.m3[0]} ~ ${r.D.m3[1]} | ${r.D.reHit}/${r.D.cells}(기하 ${r.D.reCells}) |`);
console.log('\n| 판 | 마을 | ㄹ 핵심 고리 칸 | 장 · 단반경 | 시딩 영토 밖 | 끝 영토 밖 | 이웃 겹침 | 고리 안 집 | 일손(인·일) | 흙(m³) |');
console.log('|---|---|---:|---|---:|---:|---:|---|---:|---|');
for (const r of out) console.log(`| ${r.db} | ${r.name} | ${r.R.cells} | ${r.R.a} · ${r.R.b} | ${r.R.outSeed} | ${r.R.outOwn} | ${r.R.overlapOther} | ${r.R.housesIn}/${r.houses.all} | ${r.R.manDays} | ${r.R.m3[0]} ~ ${r.R.m3[1]} |`);
console.log('\n| 판 | 마을 | ㄷ′ 지금 집 전부 고리 칸 | 장 · 단반경 | 이웃 영토와 겹침 | 어느 영토에도 없는 칸 | 일손(인·일) |');
console.log('|---|---|---:|---|---:|---:|---:|');
for (const r of out) console.log(`| ${r.db} | ${r.name} | ${r.W.cells} | ${r.W.a} · ${r.W.b} | ${r.W.overlapOther}(${r.W.otherVils}곳) | ${r.W.noOwner} | ${r.W.manDays} |`);
console.log('\n| 판 | 마을 | 영토 칸(시딩 → 지금) | 도랑 위 영토 칸 | 고리 안 영토 | 고리 바깥 영토 | 집(고리 안 · 밖) |');
console.log('|---|---|---|---:|---:|---:|---|');
for (const r of out) console.log(`| ${r.db} | ${r.name} | ${r.grow.seed} → ${r.grow.terr} | ${r.grow.terrOnDitch} | ${r.grow.terrInside} | ${r.grow.terrBeyond} | ${r.houses.inRing} · ${r.houses.outRing} |`);
if (JOUT) fs.writeFileSync(JOUT, JSON.stringify(out, null, 1));
