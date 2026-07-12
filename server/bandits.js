// =============================================================================
// server/bandits.js — §11 도적 캐논 본체 이식 1파: 경제·수명주기 층
//   "도적은 스폰되지 않는다, 몰락한 사람들이다" (설계_실축화_1셀1m.md §11 인계 명세)
//
// 무엇(랩 전쟁실험실.html 5799~5955 도적 블록의 서버 어댑터 — 계수 verbatim·보정 금지):
//   · 원천① 마을 소멸(해체): 순감≥5일 && 식량<3일치 && 잔존≤min(20,피크×0.55), 정착 보호 365일
//     — 랩과 동일하게 *이 모듈의 일일 스캔이 해체를 판정*한다(villages.js에 별도 '소멸 이벤트'는
//     존재하지 않음 — econ 인구가 미끄러져 내려가는 것이 소멸의 실체. 전쟁 초토화도 같은 검출로 흡수).
//     잔존 40%(3~8명)가 econ 인구에서 이탈(splice — 부활·유령 금지)해 도적단 결성, 은거지=교역 길목.
//   · 원천② 절망 이탈: 행복<0.32 && 식량<인구×10일치 '새는 양동이' ≥15 → 30일마다 1명이 정보범위 내
//     *기존* 단 합류(단이 새로 생기진 않음 — 하한 없음).
//   · 원천③ 상시 소굴: 부팅 스캔(오지 스코어 = 마을 최소거리 + 교역로 거리×0.7 + 숲, 이격 250)으로
//     2~3곳 — 30~60일마다 4~6명 재결성(결정론 RNG: villageSeed 해시 — 시점·규모가 시드만의 함수).
//     토벌 격멸 = 소굴 영구 철거(재결성 없음) / 기근 자연 해산 = 소굴 존속(카운트다운 재개).
//   · 유지비 0.5/명/일·스톡0 10일→1명씩 아사·3명 미만 해산·약탈 장물 환산(식량류 50%/잡화 25%).
//   · econ 계약 훅(sim/economy-sim-v2.js에 이미 도달 — 여기서 배선만): world.banditRouteRisk(길목 쌍
//     raidProb·기대손실 +0.15) + world.onBanditLoot(장물 충전 + 피해 마을 _banditRisk EMA 학습
//     → v2 호위 요청 가중 ×(1+2×risk) → war-core 목책 증축까지 기존 사슬이 이어짐).
//   · 토벌: risk≥0.3 && 전사+사냥꾼≥3(≤6) && 400셀 내 → 원정(쿨 40일), 추상 판정(랩 동형 계수).
//
// 1파 범위 밖(2파 인계 — 실체 층): 소굴 주변 배회 NPC·캐러밴 요격 연출·고립 NPC 습격(랩
//   updateBandits 6674~ — 경제 효과는 econ 주사위가 전부라 연출 생략해도 수치 등가), 토벌 전사 실파견.
//   실체는 최소: 소굴·야영 마커 1종(clientCamps → welcome banditCamps + bandit_camps 방송).
//   wildlife 실체와 도적 조우 규칙은 캐논대로 미정의(무접점 유지).
//
// 가드레일(계약):
//   · ENABLE_BANDITS=0 → init/onGameTick 즉시 return: 완전 no-op(ENABLE_VILLAGES 관례).
//   · ENABLE_VILLAGES=0 이면 banditHost()가 영원히 null → 자동 휴면(도적은 마을 없이 정의 불가).
//   · econ 파일 무수정 — 훅은 world 객체 함수 설치뿐(serializeEcon 비대상 — 재부팅 시 재설치).
//   · 마을별 추적 카운터(_bdt*·_banditized)는 vil.econ(plain number)에 부착 — villages.js
//     serializeEcon이 자동 영속(랩은 랩 래퍼에 두지만 서버 래퍼는 비영속이라 econ이 올바른 자리).
//   · 소굴·단 상태는 zone-local-db bandit_state(존당 1행 JSON — 규모 미니: 소굴≤3·단 소수).
//
// 좌표: 전부 '셀'(1셀=1m 캐논·×32px=월드). 랩 좌표계와 단위 동일 — 계수 그대로 유효.
// 교역로 접근: villages.getRoute(캐러밴 코스그리드 A*·px 정점, 4셀 간격) 재사용 + 유한쌍 판정은
//   econ 주입 거리행렬(world._distMatrix) — 도달불능쌍(강·산 단절)은 경로도 교역도 없으니 스킵(정직).
// 교역로 '거리'는 코스해상도(4셀) L1 거리장(2패스 변환 — 랩 맨해튼 근사 동형)으로 O(1) 조회.
//
// 테스트 훅(운영 기본값 전부 무설정):
//   BANDIT_MINDAY  — 정착 보호기 오버라이드(기본 365). 스모크 전용.
//   BANDIT_FIXTURE=dissolve — 첫 데일리에 최빈곤 마을 해체 조건 강제(곳간 소거 — /tmp DB 전용).
// =============================================================================
'use strict';

const ENABLED = process.env.ENABLE_BANDITS !== '0'; // 기본 켜짐. '0'만 완전 no-op.

const SZ = 32;  // 셀 크기(px) — villages.js와 동일
const FG = 4;   // 교역로 거리장 해상도(셀) — villages DIST_STEP과 동일(경로 정점 간격 정합)

// ── 캐논 §11 계수(전쟁실험실.html 5809~5823 verbatim — 랩 동형, 소굴 위치가 곧 밸런스라 보정 금지) ──
const BDT_CONV = 0.4, BDT_GMIN = 3, BDT_GMAX = 8;              // 소멸 전환: 잔존 40%(3~8명)
const BDT_CRI_HAP = 0.32, BDT_CRI_FOOD = 10;                   // 위기일: 행복<0.32 && 식량<인구×10일치
const BDT_DIS_FALL = 5, BDT_DIS_FOOD = 3;                      // 해체: 순감 5일+ && 식량<3일치 && 잔존≤min(20,피크×0.55)
const BDT_MIN_DAY = parseInt(process.env.BANDIT_MINDAY || '', 10) || 365; // 정착 보호기(BANDIT_MINDAY는 테스트 전용)
const BDT_EXO_D = 15, BDT_EXO_GAP = 30;                        // 절망 이탈: 양동이 15+ → 30일마다 1명
const BDT_UPKEEP = 0.5, BDT_STARVE = 10, BDT_CAP = 60;         // 일 소비 0.5/명·스톡0 10일→아사·비축 상한 60/명
const BDT_RT_R = 30, BDT_RT_X = 0.15;                          // 교역로 30셀 내 은거지 = 길목(raidProb +0.15)
const BDT_CAMP_BUF = 40, BDT_FENCE_F = 0.5, BDT_FENCE_G = 0.25;// 은거지 완충(영토반경+40) · 장물 환산(식량류 50%/잡화 25%)
const BDT_RISK_UP = 0.15, BDT_RISK_DK = 0.985;                 // _banditRisk: 피해 +0.15, 일 ×0.985(~46일 기억)
const BDT_SUP_TH = 0.3, BDT_SUP_N = 3, BDT_SUP_CD = 40, BDT_SUP_R = 400; // 토벌: 위험≥0.3·전사+사냥꾼≥3·400셀·쿨 40일
const BDT_DEN_SEP = 250, BDT_DEN_DV = 200;                     // 소굴 이격 250 · 마을 최소거리 하한(오지 전제)
const BDT_DEN_CD0 = 30, BDT_DEN_CD1 = 60, BDT_DEN_SZ0 = 4, BDT_DEN_SZ1 = 6, BDT_DEN_FOOD = 30; // 재결성 30~60일·4~6명·비축 30/명
// (BDT_BR_R 다리 가중·BDT_AMB_* 고립 습격은 1파 비대상 — 본체 다리 없음·실체 층은 2파)

const FIXTURE = process.env.BANDIT_FIXTURE || ''; // 테스트 전용(헤더 주석) — 운영 무설정

const S = {
  ready: false,
  zoneId: null,
  host: null,        // villages.banditHost(): { zoneId, villages, world, ta, getRoute, broadcast, seed, cellsW, cellsH }
  db: null,          // zone-local-db (require 캐시 = zone.js와 동일 인스턴스)
  denSeed: 1,
  seq: 1, denSeq: 1,
  DENS: [],          // {id,cx,cy,sc,dv,dr,gen,next,cleared}
  GANGS: [],         // {id,camp:{cx,cy},n,food,zero,born,home,why,lootN,lastLoot,den(소굴id|null),_sup:{vilDbId,eta,force,wep}|null,_supKill}
  pairs: new Map(),  // 'A|B'(econ name 정렬) → [gang,...] — econ 훅 O(1) 조회 테이블
  pairSig: '',
  _routes: null,     // { sig, pts:[{x,y}셀] } — 유한쌍 교역로 표본(마을 구성 변경 시만 재수집)
  routeField: null, routeFieldSig: '', // 코스해상도 L1 거리장
  lastDay: -1,
  campSig: '',
  _fixtured: false,
  stats: { gangs: 0, members: 0, peak: 0, conv: 0, exo: 0, loot: 0, lootAmt: 0, sup: 0, supDead: 0, starve: 0, disband: 0, dens: 0, denOcc: 0, denForm: 0, denClear: 0, log: [] },
};

function log(day, m) {
  if (S.stats.log.length < 500) S.stats.log.push('D' + day + ' ' + m);
  console.log(`[${S.zoneId}] 🏴 [도적] D${day} ${m}`);
}
// onBanditLoot은 villages econ 틱의 console 침묵 창(tickWorldV2 중 console.log 스왑) 안에서 불린다 —
// 링 버퍼엔 남지만 콘솔이 삼킴. 대기열에 쌓아 daily(침묵 창 밖) 진입 시 방출.
function queueLog(day, m) {
  if (S.stats.log.length < 500) S.stats.log.push('D' + day + ' ' + m);
  (S._pendingLogs || (S._pendingLogs = [])).push(`[${S.zoneId}] 🏴 [도적] D${day} ${m}`);
}

// ── 원천③ 결정론 RNG(랩 bdtDenRng 동형 — villageSeed+소굴id+세대 해시, Math.random 불사용) ──
function denRng(a, b) {
  let h = (S.denSeed ^ Math.imul(a + 1, 2654435761) ^ Math.imul(b + 101, 40503)) >>> 0;
  h ^= h >>> 13; h = Math.imul(h, 1274126177) >>> 0; h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

// =============================================================================
// 교역로 표본·거리장 — 랩 bdtRoutePts(getTradePath 캐시 재사용) 서버판.
//   유한쌍(거리행렬 finite)만 getRoute — 도달불능쌍은 A* 낭비·의미 둘 다 없음(교역 자체가 없음).
//   거리 조회는 4셀 그리드 2패스 L1 변환(맨해튼 — 랩의 맨해튼 근사와 동형) → O(1).
// =============================================================================
function routePts() {
  const host = S.host;
  const sig = host.villages.map(v => v.name).join(',');
  if (S._routes && S._routes.sig === sig) return S._routes;
  const mat = host.world._distMatrix;
  const pts = [];
  for (let i = 0; i < host.villages.length; i++) {
    for (let j = i + 1; j < host.villages.length; j++) {
      if (mat && mat[i] && !isFinite(mat[i][j])) continue; // 도달불능쌍(강·산 단절) — 교역로 없음
      const p = host.getRoute(host.villages[i], host.villages[j]);
      if (!p) continue;
      for (let k = 0; k < p.length; k++) pts.push({ x: p[k].x / SZ, y: p[k].y / SZ }); // px→셀(정점 간격 4셀)
    }
  }
  S._routes = { sig, pts };
  S.routeField = null; // 거리장 재계산 트리거
  return S._routes;
}
function ensureRouteField() {
  const rp = routePts();
  if (S.routeField && S.routeFieldSig === rp.sig) return S.routeField;
  const gw = Math.max(1, Math.ceil(S.host.cellsW / FG)), gh = Math.max(1, Math.ceil(S.host.cellsH / FG));
  const INF = 0x7fff;
  const f = new Uint16Array(gw * gh).fill(INF);
  for (const p of rp.pts) {
    const gx = Math.min(gw - 1, Math.max(0, Math.round(p.x / FG)));
    const gy = Math.min(gh - 1, Math.max(0, Math.round(p.y / FG)));
    f[gy * gw + gx] = 0;
  }
  for (let y = 0; y < gh; y++) for (let x = 0; x < gw; x++) { // 전방 패스
    const i = y * gw + x; let v = f[i];
    if (x > 0 && f[i - 1] + 1 < v) v = f[i - 1] + 1;
    if (y > 0 && f[i - gw] + 1 < v) v = f[i - gw] + 1;
    f[i] = v;
  }
  for (let y = gh - 1; y >= 0; y--) for (let x = gw - 1; x >= 0; x--) { // 후방 패스
    const i = y * gw + x; let v = f[i];
    if (x < gw - 1 && f[i + 1] + 1 < v) v = f[i + 1] + 1;
    if (y < gh - 1 && f[i + gw] + 1 < v) v = f[i + gw] + 1;
    f[i] = v;
  }
  S.routeField = { f, gw, gh, empty: rp.pts.length === 0 };
  S.routeFieldSig = rp.sig;
  return S.routeField;
}
function routeDistCells(cx, cy) { // 최근접 교역로 표본까지 L1 거리(셀) — 표본 없으면 1e9(랩 '경로 없음' 취급)
  const R = ensureRouteField();
  if (R.empty) return 1e9;
  const gx = Math.min(R.gw - 1, Math.max(0, Math.round(cx / FG)));
  const gy = Math.min(R.gh - 1, Math.max(0, Math.round(cy / FG)));
  const d = R.f[gy * R.gw + gx];
  return d >= 0x7000 ? 1e9 : d * FG;
}

// =============================================================================
// 은거지·소굴 배치 — 랩 bdtCampSpot/bdtDenScan 서버판(스코어·스텝 verbatim).
// =============================================================================
function territoryGuards() { // 전 마을 완충: 영토 반경(econ land.size×25 — war-core territoryOf 정합) + 40
  return S.host.villages.map(v => ({
    cx: v.ccx, cy: v.ccy,
    r: Math.sqrt(((v.econ && v.econ.land && v.econ.land.size ? v.econ.land.size * 25 : 2800)) / Math.PI) + BDT_CAMP_BUF,
  }));
}
function campSpot(ocx, ocy) { // 은거지 탐색: 옛 터 기준 나선 — 완충 밖·통행가능, 스코어=길목(30셀 내↑)+숲+고향 근접
  const host = S.host, ta = host.ta;
  const guards = territoryGuards();
  let best = null, bs = -1e9;
  for (let r = 26; r <= 230; r += 10) for (let a = 0; a < 360; a += 15) {
    const x = Math.round(ocx + Math.cos(a * Math.PI / 180) * r);
    const y = Math.round(ocy + Math.sin(a * Math.PI / 180) * r);
    if (x < 6 || y < 6 || x >= host.cellsW - 6 || y >= host.cellsH - 6) continue;
    if (ta.isBlocked(x, y)) continue;
    let ok = true;
    for (const g of guards) if (Math.hypot(x - g.cx, y - g.cy) < g.r) { ok = false; break; }
    if (ok) for (const b of S.GANGS) if (Math.hypot(x - b.camp.cx, y - b.camp.cy) < 30) { ok = false; break; }
    if (!ok) continue;
    const rd = routeDistCells(x, y);
    let sc = (rd <= BDT_RT_R ? (BDT_RT_R - rd) * 1.4 : -Math.min(60, (rd - BDT_RT_R) * 0.15)); // 길목 가점/감점
    if (ta.forestMult(x, y) > 1.2) sc += 14;  // 숲 엄폐(villages extractLandParams와 동일 숲 판정)
    sc -= r * 0.06;                            // 옛 터 언저리 선호
    if (sc > bs) { bs = sc; best = { cx: x, cy: y }; }
  }
  return best;
}
function denScan(day) { // ★원천③ 배치(부팅 1회): 오지 스코어 = min거리(마을, 캡500) + min거리(교역로, 캡400)×0.7 + 숲60
  const host = S.host, ta = host.ta;
  S.DENS = []; S.denSeq = 1;
  if (!host.villages.length) return;
  const t0 = Date.now();
  const N = Math.max(host.cellsW, host.cellsH);
  const DEN_N = N >= 1200 ? 3 : 2; // 랩 규칙 그대로(N=1600→3) — 한반도 ~4063셀 → 3곳
  const cand = [];
  for (let pass = 0; pass < 3 && !cand.length; pass++) {
    const DV = [BDT_DEN_DV, 140, 90][pass]; // 오지 하한 폴백(소형 맵 대비 — 본체는 pass0에서 끝남)
    for (let y = 40; y < host.cellsH - 40; y += 16) for (let x = 40; x < host.cellsW - 40; x += 16) {
      let dv = 1e9;
      for (const v of host.villages) { const d = Math.hypot(x - v.ccx, y - v.ccy); if (d < dv) dv = d; }
      if (dv < DV) continue;                 // 오지 하한(먼저 — 값싼 필터)
      if (ta.isBlocked(x, y)) continue;
      let dr = routeDistCells(x, y);
      if (dr > 1e8) dr = 600;                // 교역로 자체가 없음 → 상수 취급(랩 동일)
      const sc = Math.min(dv, 500) + Math.min(dr, 400) * 0.7 + (ta.forestMult(x, y) > 1.2 ? 60 : 0);
      cand.push({ x, y, sc, dv, dr });
    }
  }
  cand.sort((a, b) => b.sc - a.sc);
  for (const c of cand) {
    if (S.DENS.length >= DEN_N) break;
    let ok = true;
    for (const d of S.DENS) if (Math.hypot(c.x - d.cx, c.y - d.cy) < BDT_DEN_SEP) { ok = false; break; }
    if (ok) S.DENS.push({ id: S.denSeq++, cx: c.x, cy: c.y, sc: Math.round(c.sc), dv: Math.round(c.dv), dr: Math.round(c.dr), gen: 0, next: 0, cleared: 0 });
  }
  S.stats.dens = S.DENS.length;
  for (const d of S.DENS) log(day, `소굴#${d.id} 배치(${d.cx},${d.cy}) 오지점수 ${d.sc} — 마을거리 ${d.dv}·교역로거리 ${d.dr}${S.host.ta.forestMult(d.cx, d.cy) > 1.2 ? '·숲' : ''}`);
  console.log(`[${S.zoneId}] 🏴 [도적] 소굴 ${S.DENS.length}곳 배치 ${Date.now() - t0}ms (후보 ${cand.length}·그리드 ${host.cellsW}×${host.cellsH}셀)`);
}

// =============================================================================
// econ 훅 테이블·설치 — 랩 bdtPairSync/bdtInstallHooks 서버판.
//   훅은 world 함수 설치뿐(econ 파일 무수정·serializeEcon 비대상 — 재부팅 시 재설치).
// =============================================================================
function pairSync() { // 은거지↔마을쌍 경로 인접(30셀) 매핑 — 단 결성/해산·마을 구성 변경 때만 재계산
  const host = S.host;
  const sig = S.GANGS.map(b => b.id).join('|') + '#' + host.villages.map(v => v.name).join(',');
  if (sig === S.pairSig) return;
  S.pairSig = sig; S.pairs = new Map();
  if (!S.GANGS.length) return;
  const mat = host.world._distMatrix;
  for (let i = 0; i < host.villages.length; i++) {
    for (let j = i + 1; j < host.villages.length; j++) {
      const A = host.villages[i], B = host.villages[j];
      if (!A.econ || !B.econ) continue;
      if (mat && mat[i] && !isFinite(mat[i][j])) continue;
      const p = host.getRoute(A, B); // 캐시 히트(routePts가 이미 계산) — px 정점
      if (!p) continue;
      const gs = [];
      for (const b of S.GANGS) {
        let hit = false;
        for (let k = 0; k < p.length; k++) {
          const dx = p[k].x / SZ - b.camp.cx, dy = p[k].y / SZ - b.camp.cy;
          if (dx * dx + dy * dy <= BDT_RT_R * BDT_RT_R) { hit = true; break; }
        }
        if (hit) gs.push(b);
      }
      if (gs.length) {
        const k = A.econ.name < B.econ.name ? A.econ.name + '|' + B.econ.name : B.econ.name + '|' + A.econ.name;
        S.pairs.set(k, gs);
      }
    }
  }
}
function installHooks() { // econ 계약 훅(★v2 주사위는 이미 서버 도달 — 여기서 배선만. 도적 0이면 risk 0 = 완전 무해)
  const world = S.host.world;
  world.banditRouteRisk = (va, vb) => {
    if (!S.GANGS.length) return 0;
    const k = va.name < vb.name ? va.name + '|' + vb.name : vb.name + '|' + va.name;
    return S.pairs.has(k) ? BDT_RT_X : 0;
  };
  world.onBanditLoot = (victim, other, res, amt, day) => {
    if (!(amt > 0)) return;
    const k = victim.name < other.name ? victim.name + '|' + other.name : other.name + '|' + victim.name;
    const gs = S.pairs.get(k);
    if (!gs || !gs.length) return;
    const foody = res === 'food' || res === 'fish' || res === 'meat' || res === 'cooked_food' || res === 'vegetable';
    const gain = amt * (foody ? BDT_FENCE_F : BDT_FENCE_G); // 장물아비 수수료 환산
    for (const g of gs) { g.food = Math.min(g.n * BDT_CAP, g.food + gain / gs.length); g.lootN++; g.lastLoot = day; }
    victim._banditRisk = Math.min(0.6, (victim._banditRisk || 0) + BDT_RISK_UP);      // 화주 학습 → 호위·전사·무기 수요 연쇄
    other._banditRisk = Math.min(0.6, (other._banditRisk || 0) + BDT_RISK_UP * 0.5);  // 맞은편 절반 학습(소문·목격)
    S.stats.loot++; S.stats.lootAmt += amt;
    queueLog(day, `약탈 ${victim.name}→${other.name} ${res} ${amt.toFixed(1)} → 단#${gs.map(g => g.id).join('·')} 장물 +${gain.toFixed(1)}`);
  };
}

// =============================================================================
// 결성·일일 순환 — 랩 bdtFormGang/banditDaily 서버판(로직 verbatim).
// =============================================================================
function formGang(vil, size, day, why) { // econ 인구에서 *살아있는* size명 이탈(사망 아님 — 부활·유령 금지)
  const e = vil.econ;
  if (!e || e.npcs.length < size || size < BDT_GMIN) return null;
  const camp = campSpot(vil.ccx, vil.ccy);
  if (!camp) { log(day, `${vil.name} 잔존자 이탈 — 은거지 후보 없음(그냥 흩어짐)`); return null; }
  for (let i = 0; i < size; i++) { // counts 증분 캐시 동기(killTrader 패턴)
    const k = (Math.random() * e.npcs.length) | 0;
    const npc = e.npcs.splice(k, 1)[0];
    if (e.counts && npc && npc.currentJob) e.counts[npc.currentJob] = Math.max(0, (e.counts[npc.currentJob] || 0) - 1);
  }
  const g = { id: S.seq++, camp, n: size, food: size * 6, zero: 0, born: day, home: vil.name, why, lootN: 0, lastLoot: day, den: null, _sup: null, _supKill: 0 };
  S.GANGS.push(g);
  S.stats.conv += size;
  if (S.GANGS.length > S.stats.peak) S.stats.peak = S.GANGS.length;
  log(day, `${vil.name} ${why} → 도적단#${g.id} ${size}명 결성(은거지 ${camp.cx},${camp.cy})`);
  return g;
}
function applyFixture(day) { // BANDIT_FIXTURE=dissolve — 최빈곤(소형) 마을 해체 조건 강제(테스트 전용·/tmp DB)
  if (S._fixtured) return;
  S._fixtured = true;
  const foodOf = (e) => { const St = e.storage || {}; return (St.food || 0) + (St.fish || 0) + (St.meat || 0) + (St.cooked_food || 0); };
  let t = null;
  for (const vil of S.host.villages) {
    const e = vil.econ;
    if (!e || e.npcs.length < BDT_GMIN || e.npcs.length > 20) continue;
    if (!t || foodOf(e) < foodOf(t.econ)) t = vil;
  }
  if (!t) { log(day, '[FIXTURE] 대상 마을 없음(3~20명 마을 없음)'); return; }
  const e = t.econ;
  e._bdtPeak = Math.max(e._bdtPeak || 0, e.npcs.length * 3); // 피크 부풀림(잔존≤피크×0.55 통과)
  e._bdtFall = BDT_DIS_FALL;
  for (const r of ['food', 'fish', 'meat', 'cooked_food']) if (e.storage && e.storage[r]) e.storage[r] = 0;
  log(day, `[FIXTURE] ${t.name} 해체 조건 강제(곳간 소거·순감 ${BDT_DIS_FALL}일·피크 ${e._bdtPeak}) — BANDIT_MINDAY=${BDT_MIN_DAY}`);
}
function daily(day) { // 하루 1회(villages econ 틱 직후): 위기 추적→전환/이탈, 소굴 재결성, 유지비, 토벌, 훅 테이블 동기
  const host = S.host;
  if (S._pendingLogs && S._pendingLogs.length) { for (const m of S._pendingLogs) console.log(m); S._pendingLogs.length = 0; } // 침묵 창에서 쌓인 약탈 로그 방출
  if (FIXTURE === 'dissolve') applyFixture(day);
  for (const vil of host.villages) { // ── 위기 추적 + ①소멸 전환 + ②절망 이탈 (추적 카운터는 econ에 — serializeEcon 자동 영속) ──
    const e = vil.econ;
    if (!e) continue;
    const n = e.npcs.length;
    if (!n) continue;
    e._bdtPeak = Math.max(e._bdtPeak || 0, n);
    const St = e.storage || {}, fe = (St.food || 0) + (St.fish || 0) + (St.meat || 0) + (St.cooked_food || 0);
    const hap = e.lastStats ? e.lastStats.happiness : 0.5;
    e._bdtCri = (day >= BDT_MIN_DAY && hap < BDT_CRI_HAP && fe < n * BDT_CRI_FOOD) ? (e._bdtCri || 0) + 1 : (e._bdtCri || 0) * 0.95; // 새는 양동이
    if (e._bdtLastN != null) {
      if (n < e._bdtLastN) e._bdtFall = (e._bdtFall || 0) + 1;
      else if (n > e._bdtLastN) e._bdtFall = Math.max(0, (e._bdtFall || 0) - 2); // 회복 시 두 배 차감
    }
    e._bdtLastN = n;
    if (day >= BDT_MIN_DAY && !e._banditized && (e._bdtFall || 0) >= BDT_DIS_FALL && fe < n * BDT_DIS_FOOD
        && n >= BDT_GMIN && n <= Math.max(4, Math.min(20, (e._bdtPeak || n) * 0.55))) { // 죽어가는 미끄럼+곳간 바닥+잔존 소수 = 해체
      const size = Math.min(n, Math.max(BDT_GMIN, Math.min(BDT_GMAX, Math.round(n * BDT_CONV))));
      if (formGang(vil, size, day, `해체(순감 ${e._bdtFall || 0}일·잔존 ${n}명·피크 ${e._bdtPeak || n})`)) e._banditized = 1;
    } else if (S.GANGS.length && e._bdtCri >= BDT_EXO_D && day - (e._bdtExoAt || -999) >= BDT_EXO_GAP && n > BDT_GMIN) {
      const infoR = (host.world.infoRange || 400) / 2.5; // 이탈은 *기존 단 합류*만 — 정보범위 밖이면 안 떠남
      let bg = null, bd = 1e18;
      for (const g of S.GANGS) { const d = Math.hypot(g.camp.cx - vil.ccx, g.camp.cy - vil.ccy); if (d < bd) { bd = d; bg = g; } }
      if (bg && bd <= infoR) {
        const k = (Math.random() * e.npcs.length) | 0;
        const npc = e.npcs.splice(k, 1)[0];
        if (e.counts && npc && npc.currentJob) e.counts[npc.currentJob] = Math.max(0, (e.counts[npc.currentJob] || 0) - 1);
        bg.n++; e._bdtExoAt = day; S.stats.exo++;
        log(day, `${vil.name} 절망 이탈 1명 → 도적단#${bg.id}(${bg.n}명)`);
      }
    }
    if (e._banditRisk) e._banditRisk = e._banditRisk < 0.005 ? 0 : e._banditRisk * BDT_RISK_DK; // 위험 기억 감쇠
  }
  for (const dn of S.DENS) { // ── ③원천 소굴 재결성: 비면 카운트다운(30~60일·시드 해시) → 4~6명 ──
    if (dn.cleared) continue;
    if (S.GANGS.some(g => g.den === dn.id)) { dn.next = 0; continue; }
    if (!dn.next) { dn.next = day + BDT_DEN_CD0 + Math.floor(denRng(dn.id, dn.gen) * (BDT_DEN_CD1 - BDT_DEN_CD0 + 1)); log(day, `소굴#${dn.id} 재결성 카운트다운 — D${dn.next} 예정(${dn.gen + 1}대)`); continue; }
    if (day < dn.next) continue;
    const sz = BDT_DEN_SZ0 + Math.floor(denRng(dn.id, dn.gen * 7 + 3) * (BDT_DEN_SZ1 - BDT_DEN_SZ0 + 1));
    const g = { id: S.seq++, camp: { cx: dn.cx, cy: dn.cy }, n: sz, food: sz * BDT_DEN_FOOD, zero: 0, born: day, home: '황야', why: `주둔지 ${dn.gen + 1}대`, lootN: 0, lastLoot: day, den: dn.id, _sup: null, _supKill: 0 };
    S.GANGS.push(g); dn.gen++; dn.next = 0;
    S.stats.denForm++;
    if (S.GANGS.length > S.stats.peak) S.stats.peak = S.GANGS.length;
    log(day, `소굴#${dn.id} 도적단#${g.id} ${sz}명 재결성(${dn.gen}대 — 비축 ${sz * BDT_DEN_FOOD})`);
  }
  for (let i = S.GANGS.length - 1; i >= 0; i--) { // ── 유지비·자기조절 + 토벌 교전 판정 ──
    const g = S.GANGS[i];
    g.food = Math.max(0, g.food - g.n * BDT_UPKEEP);
    if (g.food <= 0) g.zero++; else g.zero = 0;
    if (g.zero >= BDT_STARVE) { g.n--; g.zero = Math.max(0, g.zero - 5); S.stats.starve++; log(day, `도적단#${g.id} 굶주림 이탈 1명(${g.n}명 잔류)`); }
    if (g._sup && day >= g._sup.eta) { // 토벌 교전(추상 판정 — 랩 동형 계수): 무장 원정대 우세, 도적 드물게 반격 전사
      const F = g._sup;
      const fvil = host.villages.find(v => v.dbId === F.vilDbId) || null;
      const kills = Math.max(1, Math.min(g.n, Math.round(F.force * (0.7 + 0.5 * F.wep) + Math.random() * 1.5 - g.n * 0.12)));
      g.n -= kills;
      g._supKill = g.n < BDT_GMIN ? 1 : 0; // 이 교전이 3명 미만으로 깎았는가(소굴 철거 인과)
      S.stats.sup++;
      let vd = '';
      if (fvil && Math.random() < 0.1 + 0.03 * Math.max(0, g.n)) {
        const ev = fvil.econ;
        if (ev && ev.npcs.length > 3) {
          const k = (Math.random() * ev.npcs.length) | 0;
          const npc = ev.npcs.splice(k, 1)[0];
          if (ev.counts && npc && npc.currentJob) ev.counts[npc.currentJob] = Math.max(0, (ev.counts[npc.currentJob] || 0) - 1);
          S.stats.supDead++; vd = ' · 원정 1명 전사';
        }
      }
      if (fvil && fvil.econ) fvil.econ._banditRisk = Math.max(0, (fvil.econ._banditRisk || 0) * 0.4); // 토벌 후 안도
      log(day, `토벌: ${fvil ? fvil.name : '(소멸 마을)'} 원정대(${F.force}명) → 도적단#${g.id} ${kills}명 사살${vd}(${Math.max(0, g.n)}명 잔존)`);
      g._sup = null;
    }
    if (g.n < BDT_GMIN) { // 3명 미만 해산 + ★원천③ 해산 원인 분기: 토벌 격멸=영구 철거 / 자연 해산=존속
      S.GANGS.splice(i, 1);
      S.stats.disband++;
      log(day, `도적단#${g.id} 해산(${Math.max(0, g.n)}명 잔존 — 흩어짐)`);
      if (g.den != null) {
        const dn = S.DENS.find(d => d.id === g.den);
        if (dn && !dn.cleared) {
          if (g._supKill) { dn.cleared = day || 1; S.stats.denClear++; log(day, `소굴#${dn.id} 철거 — 토벌대 격멸(영구 정리·재결성 없음)`); }
          else { dn.next = 0; log(day, `소굴#${dn.id} 존속 — 주둔 단 자연 해산(재결성 카운트다운 재개)`); }
        }
      }
    }
  }
  for (const vil of host.villages) { // ── 토벌 파견 결정(피해 학습 임계 — 전사·사냥꾼 수 기반 추상, 실파견은 2파) ──
    const e = vil.econ;
    if (!e || !S.GANGS.length) continue;
    if ((e._banditRisk || 0) < BDT_SUP_TH || day < (e._bdtSupCd || 0)) continue;
    const c = e.counts || {}, force = Math.round((c.warrior || 0) + (c.hunter || 0));
    if (force < BDT_SUP_N) continue;
    let bg = null, bd = 1e18;
    for (const g of S.GANGS) { if (g._sup) continue; const d = Math.hypot(g.camp.cx - vil.ccx, g.camp.cy - vil.ccy); if (d < bd) { bd = d; bg = g; } }
    if (!bg || bd > BDT_SUP_R) continue;
    const fN = Math.min(6, force), wep = Math.min(1, ((e.storage && e.storage.weapon) || 0) / Math.max(1, fN));
    bg._sup = { vilDbId: vil.dbId, eta: day + Math.max(1, Math.ceil(bd / 240)), force: fN, wep }; // 도보 강행군 ~240셀/일
    e._bdtSupCd = day + BDT_SUP_CD;
    log(day, `${vil.name} 토벌대 ${fN}명 파견 → 도적단#${bg.id}(거리 ${bd | 0}셀)`);
  }
  pairSync();
  S.stats.gangs = S.GANGS.length;
  S.stats.members = S.GANGS.reduce((a, g) => a + g.n, 0);
  S.stats.dens = S.DENS.filter(d => !d.cleared).length;
  S.stats.denOcc = S.DENS.filter(d => !d.cleared && S.GANGS.some(g => g.den === d.id)).length;
}

// =============================================================================
// 영속(zone-local-db bandit_state 1행 JSON) + 클라 마커(1종).
// =============================================================================
function save(day) {
  try {
    const gangs = S.GANGS.map(g => ({ id: g.id, camp: g.camp, n: g.n, food: g.food, zero: g.zero, born: g.born, home: g.home, why: g.why, lootN: g.lootN, lastLoot: g.lastLoot, den: g.den != null ? g.den : null, _sup: g._sup || null, _supKill: g._supKill || 0 }));
    S.db.upsertBanditState(S.zoneId, JSON.stringify({ seq: S.seq, denSeq: S.denSeq, dens: S.DENS, gangs, stats: { ...S.stats, log: undefined } }), day);
  } catch (e) {
    console.error(`[${S.zoneId}] 🏴 [도적] 저장 실패(다음 날 재시도):`, e.message);
  }
}
function restore(row) {
  const d = JSON.parse(row.data);
  S.seq = d.seq || 1; S.denSeq = d.denSeq || 1;
  S.DENS = Array.isArray(d.dens) ? d.dens : [];
  S.GANGS = (Array.isArray(d.gangs) ? d.gangs : []).map(g => ({ ...g, _sup: g._sup || null, _supKill: g._supKill || 0 }));
  if (d.stats) Object.assign(S.stats, d.stats, { log: S.stats.log });
  console.log(`[${S.zoneId}] 🏴 [도적] 복원: 소굴 ${S.DENS.length}곳(생존 ${S.DENS.filter(x => !x.cleared).length}) · 도적단 ${S.GANGS.length}(총원 ${S.GANGS.reduce((a, g) => a + g.n, 0)}) · 저장 day ${row.day}`);
}
function clientCamps() { // 마커 1종: 활동 단(n>0) + 빈 소굴(n=0, 재결성 대기 — 클라가 흐리게). 철거 소굴 제외.
  if (!S.ready) return null;
  const out = [];
  for (const g of S.GANGS) out.push({ x: Math.round(g.camp.cx * SZ + SZ / 2), y: Math.round(g.camp.cy * SZ + SZ / 2), n: g.n });
  for (const dn of S.DENS) {
    if (dn.cleared) continue;
    if (S.GANGS.some(g => g.den === dn.id)) continue;
    out.push({ x: dn.cx * SZ + SZ / 2, y: dn.cy * SZ + SZ / 2, n: 0 });
  }
  return out;
}
function broadcastCampsIfChanged() {
  const camps = clientCamps() || [];
  const sig = camps.map(c => c.x + ',' + c.y + ',' + c.n).join(';');
  if (sig === S.campSig) return;
  S.campSig = sig;
  try { S.host.broadcast({ type: 'bandit_camps', camps }); } catch (_) { }
}

// =============================================================================
// init / onGameTick — zone.js 배선 2줄(부팅 init + gameLoop 훅, villages 옆).
// =============================================================================
function bindHost() {
  const Villages = require('./villages'); // require 캐시 — 순환 없음(villages는 bandits를 모름)
  const host = Villages.banditHost && Villages.banditHost();
  if (!host || !host.ta) return false;
  S.host = host;
  S.zoneId = host.zoneId;
  S.db = require('./zone-local-db');
  S.denSeed = (host.seed >>> 0) || 1;
  let row = null;
  try { row = S.db.getBanditState(host.zoneId); } catch (_) { }
  if (row && row.data) {
    try { restore(row); } catch (e) { console.error(`[${S.zoneId}] 🏴 [도적] 복원 실패 — 신규 스캔:`, e.message); S.DENS = []; S.GANGS = []; }
  }
  if (!S.DENS.length && !S.GANGS.length) denScan(host.world.day); // 신규 존(or 복원 실패) — lifeInit 1회 동형
  installHooks();
  pairSync();
  S.lastDay = host.world.day; // 다음 econ 경계부터 데일리(재부팅 당일 이중 실행 방지)
  S.ready = true;
  save(host.world.day);
  console.log(`[${S.zoneId}] 🏴 도적 시뮬 준비(§11 1파: 경제·수명주기): 소굴 ${S.DENS.filter(d => !d.cleared).length}곳 · 도적단 ${S.GANGS.length} · econ 훅(banditRouteRisk/onBanditLoot) 설치 · day ${host.world.day}${FIXTURE ? ` [FIXTURE=${FIXTURE}]` : ''}${BDT_MIN_DAY !== 365 ? ` [MINDAY=${BDT_MIN_DAY}]` : ''}`);
  return true;
}
function init() {
  if (!ENABLED) { console.log(`[${process.env.ZONE_ID || 'zone'}] 🏴 bandits: ENABLE_BANDITS=0 — 비활성(no-op)`); return; }
  try { bindHost(); } catch (e) { console.error(`[bandits] init 실패 (존 부팅은 계속):`, e.message, e.stack); }
}
function onGameTick() {
  if (!ENABLED) return;
  if (!S.ready) { // villages가 늦게 준비되는 경우 — 가벼운 재시도(10초에 1회 수준, 평시 O(1))
    S._bindTried = (S._bindTried || 0) + 1;
    if (S._bindTried === 1 || S._bindTried % 300 === 0) { try { bindHost(); } catch (_) { } }
    if (!S.ready) return;
  }
  const day = S.host.world.day;
  if (day === S.lastDay) return; // 게임일 경계에서만(villages econ 틱이 world.day를 민 직후)
  S.lastDay = day;
  try {
    const t0 = Date.now();
    daily(day);
    save(day);
    broadcastCampsIfChanged();
    if (S.GANGS.length || S.stats.denClear) {
      console.log(`[${S.zoneId}] 🏴 도적 day ${day}: 단 ${S.stats.gangs}(총원 ${S.stats.members}) · 소굴 ${S.stats.denOcc}/${S.stats.dens} 점유 · 약탈 누계 ${S.stats.loot} · 길목쌍 ${S.pairs.size} · ${Date.now() - t0}ms`);
    }
  } catch (e) {
    console.error(`[${S.zoneId}] 🏴 도적 데일리 실패(다음 경계 재시도):`, e.message);
  }
}

module.exports = { init, onGameTick, clientCamps, stats: () => S.stats };
