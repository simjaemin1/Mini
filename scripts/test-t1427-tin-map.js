#!/usr/bin/env node
// @regress   ← 통합 러너가 이 표를 보고 자기 목록을 만든다(scripts/run-regress.sh)
// @bait 3   ← [T1356] 미끼 판정 줄 수(파일 안 · `test-harness-lint` ⑲b 가 센다 — 미끼 하나에 판정 줄 하나)
// === scripts/test-t1427-tin-map.js — 지도의 주석을 확정 비율로: 큰 주석 광맥 둘 · NPC 마을이 적어도 하나는 쥔다(T1427 · 재민 11-22 판정 34) ===
//
// ★지키는 것(존을 부팅하지 않는다 — 정본 지도 · 정본 함수를 그대로 부른다 · 날짜 · 벽시계 0):
//   A1 한반도 큰 주석 광맥(NPC 가 보는 주요 — `minor` 없음) = 둘 · 그 둘이 손 배정 표(`rebalance-ore-minerals.js` "광산5·임업2 주석 주력")의
//      두 광맥이다(그 파일 글자로 읽는다) · 청동기 광종(구리 · 주석 · 납 · 금 · 흑요석)이 주요에 `MIN_MAJOR` 이상(test-mining 계약이 주석 둘로 선다)
//   A2 ★재민 조건 — NPC 마을 노동권(`land.oreMix` 를 내는 그 함수 · `villages.makeTerrainAdapter().oreMix(ccx, ccy, sustain.LABOR_R)` ·
//      마을 = 시딩과 같은 `pickSeedVillages` + `findOpenCenter`)에 주석이 든 마을이 하나 이상(이름을 적는다)
//   A3 주요 광맥 구리 ÷ 주석이 프로필 무게 띠 안 — 띠 = [POOL 구리 ÷ 주석 · 존 프로필 한반도 열 구리 ÷ 주석](둘 다 정본 표 · 새 수 0)
//   A4 자잘한 주석 열하나 그대로(플레이어 몫 — 카드 "자잘한 것은 그대로") — 이름 · 자리 · 반지름 · pk · 광종 칸이 그 열하나
//   A5 닛폰 지도 무변 — T574 굽기 기록(`region-bake-off.json` 닛폰 줄)이 적은 광종(now) 그대로(이 카드는 한반도 넷만 굽는다 · 자리 칸 무변은 굽기 기계 맞대기)
//   A6 이 카드가 바꾼 넷(광맥25 · 27 · 49 · 53)은 광종 칸만 정본 식 — pk ≡ `orePeakFor(광종, 0.30, veinU(x, y, 500))` · minerals ≡ POLY
//   ⑦ 미끼(이 파일 안 · 지도 사본을 아이 판 안에서만 바꾼다 — 정본 파일 무변 · 바꾼 자리 수를 센다 · 어느 단언이 빨강이 되는지 단언한다):
//      tin0(남긴 주석 둘을 구리로 → A1 · A2 빨강) · tin6(바꾼 넷을 주석으로 되돌림 → A1 · A3 빨강) · out(주석 둘을 모든 마을 노동권 밖으로 → A2 빨강 · A1 초록)
//
// 실행: node scripts/test-t1427-tin-map.js
'use strict';
process.env.ENABLE_VILLAGES = process.env.ENABLE_VILLAGES || '0';
process.env.T574_NEW_ITEMS = '';
const path = require('path');
const fs = require('fs');
const { spawnSync } = require('child_process');
const ROOT = path.join(__dirname, '..');
const R = (p) => require(path.join(ROOT, p));
const MUT = process.env.T1427_MUTANT || '';
const { ZONES } = R('server/zone-config');
const T = R('server/terrain'); if (T.setZonesMeta) T.setZonesMeta(ZONES);
const P = R('server/villages').__labProbe;
const S = R('server/sustain');
const HM = R('server/hanbando-minerals');
const RP = R('server/region-profiles');
const SP = R('server/specialty');
const Z = 'hanbando', ZONE = ZONES[Z], SZ = P.SZ;
const SMALL_TIN = ['광맥101', '광맥141', '광맥156', '광맥377', '광맥403', '광맥444', '광맥450', '광맥479', '광맥497', '광맥539', '광맥581'];
const CHANGED = ['광맥25', '광맥27', '광맥49', '광맥53'];
const KEEP_IDX = [...fs.readFileSync(path.join(ROOT, 'scripts', 'rebalance-ore-minerals.js'), 'utf8').matchAll(/\{\s*i:\s*(\d+),\s*to:\s*'tin'/g)].map((m) => +m[1]);

const doc = T._getHardcoded();   // 세계가 읽는 그 객체(ZONE_TERRAIN 의 ores 와 같은 배열)
const ores = doc[Z].ores;
const idxOf = (name) => ores.findIndex((o) => o.name === name);
const setMineral = (i, m) => {   // 미끼 사본 — 광종 칸을 정본 식으로(제자리 바꿈 — 세계가 같은 배열을 읽는다)
  const o = ores[i]; const e = Object.assign({}, o, { mineral: m, pk: SP.orePeakFor(m, 0.30, RP.veinU(o.center[0], o.center[1], 500)) });
  if (HM.POLY[m]) e.minerals = Object.assign({}, HM.POLY[m]); else delete e.minerals;
  ores[i] = e;
};
const vilCenters = () => (T.getZoneVillages(Z) || []).map((v) => [v.x, v.y]);
const BAITS = {
  tin0: () => { const ix = ores.map((o, i) => (!o.minor && o.mineral === 'tin' ? i : -1)).filter((i) => i >= 0); ix.forEach((i) => setMineral(i, 'copper')); return ix.length; },
  tin6: () => { CHANGED.forEach((n) => setMineral(idxOf(n), 'tin')); return CHANGED.length; },
  out: () => {   // 주석 큰 광맥을 모든 마을 노동권(150셀) 밖의 주요 광맥 자리로 — 자리만 바꾼다
    const vs = vilCenters(), RR = S.LABOR_R * SZ;
    const far = (c, r) => vs.every((v) => Math.hypot(c[0] - v[0], c[1] - v[1]) > RR + r);
    const ix = ores.map((o, i) => (!o.minor && o.mineral === 'tin' ? i : -1)).filter((i) => i >= 0);
    const spots = ores.filter((o) => !o.minor && o.mineral !== 'tin' && far(o.center, 900)).map((o) => o.center);
    ix.forEach((i, k) => { ores[i] = Object.assign({}, ores[i], { center: spots[k].slice() }); });
    return ix.length;
  },
};
let baitSites = 0;
if (MUT) { if (!BAITS[MUT]) { console.error('미끼 모름 ' + MUT); process.exit(2); } baitSites = BAITS[MUT](); }

// ── 단언 묶음 — 미끼 판에서도 같은 함수로 판정한다(이름 → 참 · 거짓 · 까닭) ─────────────────
function judge() {
  const out = {};
  const majors = ores.filter((o) => !o.minor);
  const cnt = {}; for (const o of majors) cnt[o.mineral] = (cnt[o.mineral] || 0) + 1;
  const tinNames = majors.filter((o) => o.mineral === 'tin').map((o) => o.name);
  const keepNames = KEEP_IDX.map((i) => ores[i] && ores[i].name);
  const NEED = ['copper', 'tin', 'lead', 'gold', 'obsidian'];
  const short = NEED.filter((m) => (cnt[m] || 0) < HM.MIN_MAJOR);
  out.A1 = [tinNames.length === 2 && KEEP_IDX.length === 2 && keepNames.every((n) => tinNames.includes(n)) && short.length === 0,
    `큰 주석 ${tinNames.length}(${tinNames.join(' · ')}) · 손 배정 ${keepNames.join(' · ')} · MIN_MAJOR ${HM.MIN_MAJOR} 밑 ${short.join(',') || '0'}`];
  // A2 — 시딩과 같은 마을 · land.oreMix 를 내는 그 함수
  P.setZoneId(Z);
  const _in = (x, y) => !(x < 0 || y < 0 || x >= ZONE.zoneWidth || y >= ZONE.zoneHeight);
  const isWaterTileLocal = (x, y) => { if (!_in(x, y)) return false; const tx = Math.floor(x / SZ), ty = Math.floor(y / SZ); try { return !!T.isWaterCellLocal(Z, tx * SZ + SZ / 2, ty * SZ + SZ / 2); } catch { return false; } };
  const isRockTileLocal = (x, y) => { if (!_in(x, y)) return false; try { return !!T.isRockCellLocal(Z, x, y); } catch { return false; } };
  const ta = P.makeTerrainAdapter(T, ZONE, { isTerrainBlockedLocal: (x, y) => !_in(x, y) || isRockTileLocal(x, y) || isWaterTileLocal(x, y), isWaterTileLocal });
  const picked = P.pickSeedVillages(T.getZoneVillages(Z) || [], ta, { seedAll: !!ZONE.seedAllVillages, max: ZONE.villageMax || 0 });
  const tinVils = [];
  for (const hv of picked) { const c = P.findOpenCenter(ta, Math.round(hv.x / SZ), Math.round(hv.y / SZ)); if (!c) continue; const mx = ta.oreMix(c.ccx, c.ccy, S.LABOR_R).mix; if ((mx.tin || 0) > 0) tinVils.push(`${hv.name} ${mx.tin}`); }
  out.A2 = [picked.length >= 40 && tinVils.length >= 1, `마을 ${picked.length} · 노동권에 주석 ${tinVils.length}곳(${tinVils.join(' · ') || '없음'})`];
  // A3 — 프로필 무게 띠
  const own = RP.weightsOf('ore', Z) || {};
  const band = [HM.POOL.copper / HM.POOL.tin, own.copper / own.tin].sort((a, b) => a - b);
  const ratio = (cnt.copper || 0) / Math.max(1e-9, cnt.tin || 0);
  out.A3 = [ratio >= band[0] - 1e-9 && ratio <= band[1] + 1e-9, `구리 ${cnt.copper || 0} ÷ 주석 ${cnt.tin || 0} = ${ratio.toFixed(2)} · 띠 ${band.map((x) => x.toFixed(2)).join(' ~ ')}(POOL · 존 프로필)`];
  // A4 — 자잘한 주석 열하나
  const smallNow = ores.filter((o) => o.minor && o.mineral === 'tin').map((o) => o.name).sort();
  const u = (o) => RP.veinU(o.center[0], o.center[1], 500);
  const smallOk = SMALL_TIN.every((n) => { const o = ores[idxOf(n)]; return o && o.minor && o.mineral === 'tin' && !o.minerals && Math.abs(o.pk - SP.orePeakFor('tin', 0.30, u(o))) < 1e-9; });
  out.A4 = [smallOk && JSON.stringify(smallNow) === JSON.stringify(SMALL_TIN.slice().sort()), `자잘한 주석 ${smallNow.length}(표 ${SMALL_TIN.length}) · 광종 · pk 정본 식 ${smallOk ? '맞음' : '어긋남'}`];
  // A5 — 닛폰 무변(T574 굽기 기록의 now 그대로)
  let off = null; try { off = R('server/region-bake-off.json'); } catch (e) { off = null; }
  const np = (doc.nippon && doc.nippon.ores) || [];
  const npIdx = new Map(np.map((o) => [o.center[0] + ',' + o.center[1], o]));
  let npSeen = 0, npBad = 0;
  for (const e of ((off && off.zones && off.zones.nippon) || [])) { const o = npIdx.get(e.c[0] + ',' + e.c[1]); npSeen++; if (!o || o.mineral !== e.now) npBad++; }
  out.A5 = [np.length > 0 && npSeen >= 50 && npBad === 0, `닛폰 광맥 ${np.length} · 굽기 기록 ${npSeen}줄 가운데 광종 다름 ${npBad}`];
  // A6 — 바꾼 넷의 광종 칸 = 정본 식
  let bad6 = 0;
  for (const n of CHANGED) {
    const o = ores[idxOf(n)];
    if (!o || o.minor || o.mineral === 'tin' || RP.NO_MAJOR.includes(o.mineral) || o.mineral === 'silver') { bad6++; continue; }
    if (Math.abs(o.pk - SP.orePeakFor(o.mineral, 0.30, u(o))) > 1e-9) bad6++;
    if (JSON.stringify(o.minerals || null) !== JSON.stringify(HM.POLY[o.mineral] || null)) bad6++;
  }
  out.A6 = [bad6 === 0, `${CHANGED.map((n) => { const o = ores[idxOf(n)]; return o ? `${n} ${o.mineral} pk ${o.pk}` : n + ' 없음'; }).join(' · ')} · 어긋남 ${bad6}`];
  return out;
}

const J = judge();
if (MUT) { process.stdout.write('@@T1427 ' + JSON.stringify({ sites: baitSites, res: Object.fromEntries(Object.entries(J).map(([k, v]) => [k, v[0]])) }) + '\n'); process.exit(0); }

let pass = 0, fail = 0;
const ok = (c, msg, why) => { if (c) pass++; else fail++; console.log(`  ${c ? '✔' : '✘'} ${msg}${why ? ' — ' + why : ''}`); };
console.log('## T1427 주석 지도 — 큰 주석 광맥 둘 · NPC 마을이 쥔다');
ok(J.A1[0], 'A1 큰 주석 광맥 = 둘 · 손 배정 표(광산5 · 임업2 주석 주력)의 두 광맥 · 청동기 광종 주요 MIN_MAJOR 이상', J.A1[1]);
ok(J.A2[0], 'A2 ★재민 조건 — NPC 마을 노동권(land.oreMix 정본 함수)에 주석이 든 마을 하나 이상', J.A2[1]);
ok(J.A3[0], 'A3 주요 구리 ÷ 주석이 프로필 무게 띠 안', J.A3[1]);
ok(J.A4[0], 'A4 자잘한 주석 열하나 그대로(이름 · 광종 · pk 정본 식)', J.A4[1]);
ok(J.A5[0], 'A5 닛폰 지도 무변(T574 굽기 기록의 광종 그대로)', J.A5[1]);
ok(J.A6[0], 'A6 바꾼 넷의 광종 칸 = 정본 식(pk · POLY · 주요 철 0 · 은 단독 0)', J.A6[1]);

// ⑦ 미끼 — 아이 판(지도 사본) · 바꾼 자리 수 · 정한 단언이 빨강이면 초록
const baitRun = (name, red, green) => {
  const r = spawnSync(process.execPath, [__filename], { env: Object.assign({}, process.env, { T1427_MUTANT: name }), encoding: 'utf8', timeout: 120000 });
  const line = (r.stdout || '').split('\n').find((l) => l.startsWith('@@T1427 '));
  if (!line) return { sites: 0, good: false, why: '아이 판 실패 ' + (r.status) + ' ' + String(r.stderr || '').slice(0, 200) };
  const o = JSON.parse(line.slice(8));
  const good = red.every((k) => o.res[k] === false) && green.every((k) => o.res[k] === true);
  return { sites: o.sites, good, why: Object.entries(o.res).map(([k, v]) => `${k} ${v ? '초록' : '빨강'}`).join(' · ') };
};
let b;
b = baitRun('tin0', ['A1', 'A2'], []); ok(b.sites === 2 && b.good, '미끼 tin0 — 남긴 주석 둘을 구리로 굽은 지도 → A1 · A2 빨강(큰 주석 0 · 주석 쥔 마을 0)', `바꾼 자리 ${b.sites} · ${b.why}`);
b = baitRun('tin6', ['A1', 'A3'], ['A2']); ok(b.sites === 4 && b.good, '미끼 tin6 — 바꾼 넷을 주석으로 되돌린 지도(옛 정본) → A1 · A3 빨강(주석 여섯 · 구리 ÷ 주석 3.3)', `바꾼 자리 ${b.sites} · ${b.why}`);
b = baitRun('out', ['A2'], ['A1', 'A3']); ok(b.sites === 2 && b.good, '미끼 out — 주석 둘을 모든 마을 노동권 밖으로 옮긴 지도 → A2 빨강 · A1 초록(수는 맞아도 마을이 못 쥔다)', `바꾼 자리 ${b.sites} · ${b.why}`);

console.log(`\n=== ${pass + fail}건 중 PASS ${pass} · FAIL ${fail} ===`);
process.exit(fail ? 1 : 0);
