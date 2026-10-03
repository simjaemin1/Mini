#!/usr/bin/env node
// === scripts/t593-labels.js — T593 ⑤ 마을 이름표 표(옛 이름 → 새 이름 · 한반도 51 + 닛폰 30) ======================
//
// ★계측기다(판정 0). 이름은 **서버 시딩이 부르는 그 함수**(`villages.js _t593Namer` — `__labProbe.t593Namer`)로 짓는다(사본 0).
//   세계 조립은 서버 시딩과 같은 길이다: 후보 `terrain.siteCandidates`(정본 json) → `pickSeedVillages`(존 설정)
//   → `findOpenCenter`(뭍 없으면 스킵) → `VillageLayout.generate` → `extractLandParamsApprox`.
//   물 술어도 서버와 같다 — 해안선 띠(`chunk.generateCoastlineWaterTiles`) ∪ 강·호수(`terrain.isWaterCellLocal`).
//   ⚠번호("농촌23")는 서버처럼 **시딩 순서**로 매긴다(선별 마을 먼저) — 선별 밖 후보는 그 뒤에 "심었다면"으로 이어 센다.
//
// 칸: 갈래(`typeBranch`) · 농·어 몫 · 광맥 점수(econ `veinScore`) · 숲 몫(`livelihood` 임업 부존의 역) ·
//     호전(econ `_warlikeMult` 의 이름 해시 > 문턱 — **econ 정본 줄을 읽는다**: 이름이 econ 입력이라는 증거 칸).
//
// 실행: node scripts/t593-labels.js [--md 표.md] [--json 표.json]
'use strict';
process.env.ENABLE_VILLAGES = '0';
process.env.DB_PATH = process.env.DB_PATH || `/tmp/t593-labels-${process.pid}.db`;
const path = require('path'), fs = require('fs');
const ROOT = path.join(__dirname, '..');
const R = (p) => require(path.join(ROOT, p));
const arg = (k) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : null; };
const { ZONES, findZoneAt } = R('server/zone-config');
const T = R('server/terrain'); if (T.setZonesMeta) T.setZonesMeta(ZONES);
const E = R('sim/economy-sim');
const LV = R('server/livelihood');
const VL = R('server/village-layout');
const P = R('server/villages').__labProbe;
const SZ = P.SZ;
// econ 정본 줄에서 이름 해시·호전 문턱을 읽는다(export 가 없다 — `t176-ab` 가 `HEALTH_DP_W` 를 읽는 그 문법 · 계산 사본 0)
const ESRC = fs.readFileSync(path.join(ROOT, 'sim', 'economy-sim.js'), 'utf8');
const _hashStr = new Function('return ' + ESRC.match(/function _hashStr\(s\) \{[\s\S]*?\n\}/)[0])();
const WARLIKE_THRESH = +ESRC.match(/const WARLIKE_THRESH = ([0-9.]+);/)[1];
const warlike = (name) => _hashStr('warlike|' + name) > WARLIKE_THRESH;
const OCEANS = Object.values(ZONES).filter((z) => z.isOcean).map((z) => ({ x0: z.worldOffsetX, y0: z.worldOffsetY, x1: z.worldOffsetX + z.zoneWidth, y1: z.worldOffsetY + z.zoneHeight }));

function zoneTable(Z) {
  const ZONE = ZONES[Z];
  P.setZoneId(Z);
  const inZ = (x, y) => !(x < 0 || y < 0 || x >= ZONE.zoneWidth || y >= ZONE.zoneHeight);
  const COAST = R('server/chunk').generateCoastlineWaterTiles({ ...ZONE, id: Z }, SZ, findZoneAt, OCEANS);
  const isWaterTileLocal = (x, y) => {
    if (!inZ(x, y)) return false;
    const tx = Math.floor(x / SZ), ty = Math.floor(y / SZ);
    if (COAST.has(`${tx}_${ty}`)) return true;
    try { return !!T.isWaterCellLocal(Z, tx * SZ + SZ / 2, ty * SZ + SZ / 2); } catch { return false; }
  };
  const isRockTileLocal = (x, y) => { if (!inZ(x, y)) return false; try { return !!T.isRockCellLocal(Z, x, y); } catch { return false; } };
  const isTerrainBlockedLocal = (x, y) => (!inZ(x, y)) ? true : (isRockTileLocal(x, y) || isWaterTileLocal(x, y));
  const ta = P.makeTerrainAdapter(T, ZONE, { isTerrainBlockedLocal, isWaterTileLocal, waterTiles: COAST });
  const hard = T.siteCandidates(Z) || [];
  const picked = P.pickSeedVillages(hard, ta, { seedAll: !!ZONE.seedAllVillages, max: ZONE.villageMax || 0 });
  const pickedSet = new Set(picked.map((v) => v.name));
  const namer = P.t593Namer(hard);
  const order = picked.concat(hard.filter((v) => !pickedSet.has(v.name)));
  const rows = [];
  for (const hv of order) {
    const row = { name: hv.name, tag: hv.type, picked: pickedSet.has(hv.name) };
    const c = P.findOpenCenter(ta, Math.round(hv.x / SZ), Math.round(hv.y / SZ));
    if (!c) { row.skip = '뭍 없음'; rows.push(row); continue; }
    if (ta.prepareFert) ta.prepareFert(c.ccx, c.ccy, 62);
    const layout = VL.generate(ta, c.ccx, c.ccy, P.INITIAL_POP, {});
    const lp = P.extractLandParamsApprox(ta, c.ccx, c.ccy, layout);
    const lab = namer.label(hv, layout, lp);
    Object.assign(row, { why: layout.typeWhy, f: layout.fShare, h: layout.hShare, vein: +E.veinScore(lp).toFixed(3),
      forS: +(((lp.wood || 0) - LV.FLOOR.wood) / LV.GAIN.wood).toFixed(3), wood: lp.wood, coastal: !!lp.coastal, sea: lp._seaDistPx,
      kind: lab.kind, newName: lab.name, renamed: lab.renamed, kindChanged: lab.kind !== hv.type,
      warOld: warlike(hv.name), warNew: warlike(lab.name) });
    rows.push(row);
  }
  return { zone: Z, candidates: hard.length, picked: picked.length, rows };
}

const KO = { plain: '농촌', riverside: '어촌', mining: '광산', forest: '임업' };
const WHY = { riverside: '어촌 판정', plain: '농촌 판정', mixed: '섞임', none: '기본' };
const out = [];
for (const Z of ['hanbando', 'nippon']) {
  const t = zoneTable(Z);
  out.push(t);
  const ch = t.rows.filter((r) => r.kindChanged), rn = t.rows.filter((r) => r.renamed);
  console.log(`\n== ${Z} — 후보 ${t.candidates} · 선별 ${t.picked} · 꼬리표 바뀜 ${ch.length}(선별 ${ch.filter((r) => r.picked).length}) · 이름 바뀜 ${rn.length}(선별 ${rn.filter((r) => r.picked).length})`);
  for (const r of t.rows) {
    if (r.skip) { console.log(`  ${r.name.padEnd(7)} ${KO[r.tag]} — ${r.skip}`); continue; }
    const mark = r.renamed ? '★' : (r.kindChanged ? '☆' : ' ');
    console.log(`${mark} ${r.name.padEnd(7)} ${KO[r.tag]}→${KO[r.kind]} ${r.newName.padEnd(7)} ${WHY[r.why].padEnd(5)} 농${r.f.toFixed(2)} 어${r.h.toFixed(2)} 광맥${r.vein.toFixed(2)} 숲${r.forS.toFixed(2)}${r.coastal ? ' 바닷가' : ''}${r.picked ? '' : ' (선별 밖)'}${r.renamed && r.warOld !== r.warNew ? ` 호전 ${r.warOld ? '예' : '아니'}→${r.warNew ? '예' : '아니'}` : ''}`);
  }
}
const md = arg('--md'), js = arg('--json');
if (js) fs.writeFileSync(js, JSON.stringify(out, null, 1));
if (md) {
  const L = [];
  for (const t of out) {
    L.push(`\n#### ${t.zone === 'hanbando' ? '한반도' : '닛폰'} — 후보 ${t.candidates} · 선별(시딩) ${t.picked}\n`);
    L.push('| 옛 이름 | 옛 꼬리표 | 갈래 | 농 몫 | 어 몫 | 광맥 점수 | 숲 몫 | 새 꼬리표 | **새 이름** | 시딩 | 호전(이름 해시) |');
    L.push('|---|---|---|---:|---:|---:|---:|---|---|---|---|');
    for (const r of t.rows) {
      if (r.skip) { L.push(`| ${r.name} | ${KO[r.tag]} | — | | | | | | ${r.name} | ${r.skip} | |`); continue; }
      const nn = r.renamed ? `**${r.newName}**` : (r.kindChanged ? `${r.newName} (꼬리표 없음)` : r.newName);
      const war = r.renamed ? (r.warOld === r.warNew ? `${r.warOld ? '예' : '아니'} 그대로` : `**${r.warOld ? '예' : '아니'} → ${r.warNew ? '예' : '아니'}**`) : '';
      L.push(`| ${r.name} | ${KO[r.tag]} | ${WHY[r.why]} | ${r.f.toFixed(2)} | ${r.h.toFixed(2)} | ${r.vein.toFixed(3)} | ${r.forS.toFixed(3)} | ${r.kindChanged ? `**${KO[r.kind]}**` : KO[r.kind]} | ${nn} | ${r.picked ? '○' : '선별 밖'} | ${war} |`);
    }
  }
  fs.writeFileSync(md, L.join('\n') + '\n');
}
try { for (const f of [process.env.DB_PATH, process.env.DB_PATH + '-wal', process.env.DB_PATH + '-shm']) fs.unlinkSync(f); } catch (e) {}
