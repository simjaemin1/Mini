'use strict';
// === scripts/t766-observe.js — T766 관찰기(서버 판 자 `t577-server-run.js` 곁 프리로드 · 읽기만 · 갈래 ⓑ′ 하나만 쓴다) ============
//
// ★[T766 2026-10-15 · 재민 "도적을 줄여야 하나? 도적 효과가 너무 강한가?"] 빈 마을은 도적 탓인가 해체 문 탓인가.
//   쓰는 법(판 넷 + ⓑ′):
//     NODE_OPTIONS="-r $PWD/scripts/t766-observe.js" node scripts/t577-server-run.js 800 1020,7,42                 # ⓐ 지금 main
//     NODE_OPTIONS=… ENABLE_BANDITS=0 node scripts/t577-server-run.js 800 1020,7,42                                 # ⓑ 도적 층 통째 끔
//     NODE_OPTIONS=… T766_DISSOLVE_INCOMING=1 node scripts/t577-server-run.js 800 1020,7,42                         # ⓒ 해체 문 + 오는 식량
//     NODE_OPTIONS=… ENABLE_BANDITS=0 T766_DISSOLVE_INCOMING=1 node scripts/t577-server-run.js 800 1020,7,42        # ⓓ ⓑ + ⓒ
//     NODE_OPTIONS=… T766_RAID_OFF=1 node scripts/t577-server-run.js 800 1020,7,42                                  # ⓑ′ 길 훅만 끔
//   (`T577_SEED` 가 있는 아이 서버만 잰다 · 판 JSON 곁 `<판>.t766.json`)
//   ⓑ′ `T766_RAID_OFF=1` — **제품 손잡이가 아니다**(레포 판 · 이 프리로드에만 있다 · T736 "도적 훅 0" 판과 같은 두 줄):
//     장부 `scanDay` 마다 econ 이 읽는 도적 훅 둘을 0 · null 로 — `banditRouteRisk`(길 위험 · 교역 결정) · `banditGang`(길목 갱 = 습격 전투).
//     습격이 없으니 `onBanditLoot`(장물)도 안 불린다. 해체 · 절망 이탈 · 소굴 재결성 · 유지비 · 토벌은 그대로 돈다.
//     `server/bandits.js` 안에 습격만 끄는 갈래(env)는 없다 — 그래서 이 판은 프리로드다(T766 §1-② "있으면").
//   하루 한 줄(마을마다): [인구 · 곳간 식량(도적 층 잣대 food+fish+meat+cooked) · 오는 식량(T766 두 칸 = `bandits.incomingFood`) ·
//     해체 표 · 순감 날(_bdtFall) · 피크(_bdtPeak) · 그날 아사 · 누적 죽음 · 행상 피살 누계 · 잃은 화물 누계]
//   끝: 도적 층 셈 통째(`bandits.stats()` · 로그 줄 뺌).
const path = require('path');
const fs = require('fs');
if (!process.env.T577_SEED) return;   // 부모 러너 — 아무것도 안 한다
const OUT = process.env.T766_OBS_OUT || (process.env.T577_OUT ? process.env.T577_OUT.replace(/\.json$/, '') + '.t766.json' : '');
const RAID_OFF = process.env.T766_RAID_OFF === '1';
const ROOT = path.join(__dirname, '..');
const Ev = require(path.join(ROOT, 'server', 'events'));
const B = require(path.join(ROOT, 'server', 'bandits'));
const rec = { names: null, raidOff: RAID_OFF, rows: [], stats: null };
const r1 = (x) => Math.round((+x || 0) * 10) / 10;
const mk = Ev.createLedger;
Ev.createLedger = function () {
  const L = mk.apply(this, arguments);
  const sd = L.scanDay;
  L.scanDay = function (world, day) {
    try {
      if (RAID_OFF) { world.banditRouteRisk = () => 0; world.banditGang = () => null; }
      snap(world, day | 0);
    } catch (e) { console.error('[t766] 관측 실패:', e.message); }
    return sd.apply(this, arguments);   // t577 훅이 이 뒤에 끝 날 process.exit 을 부른다 — 그 앞에 찍는다
  };
  return L;
};
function snap(world, day) {
  const V = world.villages;
  if (!rec.names) rec.names = V.map((v) => v.name);
  rec.rows.push([day, V.map((v) => {
    const St = v.storage || {};
    const fe = (St.food || 0) + (St.fish || 0) + (St.meat || 0) + (St.cooked_food || 0);
    const T = v.tradeStats || {};
    return [(v.npcs || []).length, r1(fe), r1(B.incomingFood(world, v)), v._banditized ? 1 : 0, v._bdtFall || 0, v._bdtPeak || 0,
      v._deathsToday || 0, v._deadTot || 0, T.tradersKilled || 0, r1(T.cargoLost)];
  })]);
}
process.on('exit', () => {
  try { const S = B.stats(); rec.stats = Object.assign({}, S, { log: undefined }); } catch (e) { rec.stats = null; }
  if (OUT) try { fs.writeFileSync(OUT, JSON.stringify(rec)); } catch (e) { /* 관측 실패는 판을 안 건드린다 */ }
});
