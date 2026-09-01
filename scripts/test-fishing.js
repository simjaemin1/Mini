#!/usr/bin/env node
// @regress   ← 통합 러너가 이 표를 보고 자기 목록을 만든다(scripts/run-regress.sh · 표 없으면 안 돈다)
// === scripts/test-fishing.js — 낚시 v2: 판단·위험·손맛 서버 E2E =================
//
// ★[재민 확정 2026-08-26] 지시 ①~⑥. **정본 함수만 부른다** — 물리를 하네스가 다시 짜면 사본이다.
//   자리 판정·분포·재고는 `server/fishing.js`, 왕복은 zone.js `__testBind()` 훅을 그대로 쓴다.
//
// ★★이 하네스의 제1 규약 (족보 재발 금지):
//   ㊻ **픽스처가 검사 대상을 오염시키지 않는지 먼저 본다.**
//      직전 배치들에서 두 번 당했다 — `__e2e_give` 가 `savePlayer` 를 불러 "미저장 상태"를 스스로
//      저장했고(B-6), 부족 픽스처가 게시판이 약속한 보상 품목을 깎았다(e2e-events).
//      ⇒ 여기서는 ⓐ 어장 재고를 **직접 세팅하지 않고** 정본 경로(어획)로만 움직이고
//        ⓑ 검사 전에 "그 상황이 실제로 성립했나"를 **먼저 assert** 한다
//        ⓒ 기록 보존 검사(⑥)는 픽스처가 `savePlayer` 를 부르지 않는 길(진짜 어획)로만 만든다.
//   ★그리고 **자명 통과 금지**: 자리 차등은 "두 자리가 실제로 다른 자리인가"를 먼저 재고,
//     분포는 "꼬리가 실제로 있나"를 먼저 잰다.
//
// 실행: node scripts/test-fishing.js
'use strict';
const path = require('path');
const fs = require('fs');
const ROOT = path.join(__dirname, '..');
const R = (p) => require(path.join(ROOT, p));

let pass = 0, fail = 0;
const ok = (c, m, extra) => { c ? pass++ : fail++; console.log((c ? '  ✓ ' : '  ✗ ') + m + (extra !== undefined ? `  ${extra}` : '')); };
const say = (m) => console.log(m);

// ── 실서버 in-process 기동(임시 DB·임시 포트) — test-mining 과 같은 문법 ──────
const TMP = `/tmp/test-fishing-${process.pid}.db`;
for (const f of [TMP, TMP + '-wal', TMP + '-shm']) { try { fs.unlinkSync(f); } catch (e) {} }
process.env.ZONE_ID = 'hanbando';
process.env.PORT = String(39000 + (process.pid % 800));
process.env.DB_PATH = TMP;
process.env.ENABLE_VILLAGES = process.env.ENABLE_VILLAGES || '1';   // ④ 자원 정합엔 마을이 필요하다
process.env.VILLAGE_MAX = process.env.VILLAGE_MAX || '2';
process.env.ENABLE_WILDLIFE = '0'; process.env.ENABLE_BANDITS = '0'; process.env.ENABLE_ROADS = '0';
process.env.FISH_TICK_MS = process.env.FISH_TICK_MS || '999000';    // 주기 확산은 검사가 직접 부른다(시각 통제)

const _l = console.log, _w = console.warn, _e = console.error;
console.log = () => {}; console.warn = () => {}; console.error = () => {};
const Zone = require(path.join(ROOT, 'server', 'zone.js'));
console.log = _l; console.warn = _w; console.error = _e;
const H = Zone.__testBind();
const F = H.Fishing, T = H.terrain, Z = H.ZONE_ID;
const SimVillages = require(path.join(ROOT, 'server', 'villages.js'));
const S = require(path.join(ROOT, 'server', 'sustain.js'));

// ── 가짜 소켓 — 서버가 보낸 메시지를 그대로 받아 둔다(하네스가 결과를 지어내지 않는다) ──
function mkPlayer(name) {
  const msgs = [];
  const ws = { readyState: 1, send: (s) => { try { msgs.push(JSON.parse(s)); } catch (e) {} } };
  const p = {
    pid: 'p_' + name, playerId: 'test_' + name, name, persistent: true,
    x: 0, y: 0, floor: 0, hp: 100, maxHp: 100, hunger: 100, thirst: 100,
    inventory: {}, toolItems: [], equipment: [], equipSlots: {}, craftSkill: {},
    oreLedger: {}, oreCarry: {}, ws, isDown: false,
  };
  p.__msgs = msgs;
  p.__last = (t) => { for (let i = msgs.length - 1; i >= 0; i--) if (msgs[i].type === t) return msgs[i]; return null; };
  p.__notices = () => msgs.filter((m) => m.type === 'notice').map((m) => m.text);
  return p;
}

// ── 물 자리 찾기(실지도) ─────────────────────────────────────────────────────
const ZONE = H.ZONE;
function scanSpots(step, cap) {
  const out = [];
  for (let y = 0; y < ZONE.zoneHeight && out.length < cap; y += step) {
    for (let x = 0; x < ZONE.zoneWidth && out.length < cap; x += step) {
      if (!H.isWaterTileLocal(x, y)) continue;
      const sp = F.spotAt(T, Z, x, y);
      if (!sp.water) continue;
      out.push({ x, y, sp, sc: F.spotScore(sp) });
    }
  }
  return out;
}

(async () => {
  say('\n=== 낚시 v2 — 판단·위험·손맛 (서버 정본 E2E) ===');

  // ═══ ⓪ 전제 — 실지도에 판정할 물이 실제로 있는가 ═══════════════════════════
  say('\n⓪ 전제');
  const spots = scanSpots(89, 900);
  // ★★마을 시딩을 **기다린다**. 존은 부팅 뒤 몇십 초 동안 마을을 앉히는데, 그 전에 물으면
  //   `waterVillageAt` 이 언제나 null 이라 ④ 가 "마을이 없어서" 실패한다(1차 실행에서 실제로 그랬다).
  //   이건 결함이 아니라 **하네스가 전제를 안 기다린 것**이다(사건 레이어 배치의 같은 함정).
  const cvReady = async () => {
    for (let i = 0; i < 120; i++) {
      const list = SimVillages.clientVillages ? SimVillages.clientVillages() : [];
      if (list && list.length) return list;
      await new Promise((r) => setTimeout(r, 1000));
    }
    return [];
  };
  const vlist = await cvReady();
  say(`    마을 시딩 대기 — ${vlist.length}곳`);
  // ★④(자원 정합)는 **마을 노동권 안의 물**이라야 성립한다. 지도에서 가장 깊은 칸은 대개 변방이라
  //   마을이 없다(1차 실행에서 실제로 그래서 못 쟀다). 그래서 마을 중심 둘레를 훑는다.
  const nearVil = [];
  for (const cv of vlist) {
    const cx0 = Math.round((cv.cx != null ? cv.cx : (cv.x / 32)) || 0), cy0 = Math.round((cv.cy != null ? cv.cy : (cv.y / 32)) || 0);
    for (let r = 4; r <= S.LABOR_R && nearVil.length < 60; r += 4) {
      for (let a = 0; a < 24; a++) {
        const x = (cx0 + Math.cos(a / 24 * 2 * Math.PI) * r) * 32, y = (cy0 + Math.sin(a / 24 * 2 * Math.PI) * r) * 32;
        if (x < 0 || y < 0 || x >= ZONE.zoneWidth || y >= ZONE.zoneHeight) continue;
        if (!H.isWaterTileLocal(x, y)) continue;
        const sp = F.spotAt(T, Z, x, y); if (!sp.water) continue;
        const vv = SimVillages.waterVillageAt ? SimVillages.waterVillageAt(x, y) : null;
        if (vv) { nearVil.push({ x, y, sp, sc: F.spotScore(sp), vil: vv }); break; }
      }
    }
  }
  ok(spots.length > 200, '★자명 통과 금지 — 실지도에 물 자리 표본이 충분하다', `${spots.length}곳`);
  const kinds = {}; for (const s of spots) kinds[s.sp.kind] = (kinds[s.sp.kind] || 0) + 1;
  ok((kinds.river || 0) > 20 && (kinds.lake || 0) > 20,
    '★전제 — 강과 호수가 **둘 다** 표본에 있다(자리 종류가 하나뿐이면 차등 검사가 무의미하다)', JSON.stringify(kinds));

  // ═══ ① 판단 — 자리가 어획에 실제로 차등을 만드는가 ═════════════════════════
  say('\n① 판단 — 자리 차등 (수심 → 크기 · 흐름 경계/합류부 → 빈도)');
  const rivers = spots.filter((s) => s.sp.kind === 'river' || s.sp.kind === 'mouth');
  const deep = rivers.slice().sort((a, b) => b.sp.depth01 - a.sp.depth01)[0];
  const seam = rivers.slice().sort((a, b) => (Math.max(b.sp.seam01, b.sp.conflu) - Math.max(a.sp.seam01, a.sp.conflu)))[0];
  ok(deep && deep.sp.depth01 > 0.6, '★전제 — 깊은 자리가 실제로 있다', deep ? `수심 ${deep.sp.depth01.toFixed(2)}` : 'X');
  ok(seam && Math.max(seam.sp.seam01, seam.sp.conflu) > 0.6, '★전제 — 흐름 경계/합류부가 실제로 있다',
    seam ? `경계 ${Math.max(seam.sp.seam01, seam.sp.conflu).toFixed(2)}` : 'X');
  ok(deep.x !== seam.x || deep.y !== seam.y, '★전제 — 두 자리가 서로 **다른 자리**다(같은 칸이면 차등이 자명 통과다)',
    `깊은(${deep.x},${deep.y}) vs 경계(${seam.x},${seam.y})`);

  // 표본 검정 — 정본 `plan()` 을 같은 씨로 N 회. 씨를 고정해 **자리만** 다르게 한다.
  const N = 4000;
  const mkRng = (seed) => { let s = seed >>> 0; return () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; }; };
  const sample = (sp, seed) => {
    const r = mkRng(seed); const kg = [], wait = [];
    for (let i = 0; i < N; i++) { const pl = F.plan(sp, 1, 0, r); kg.push(pl.kg); wait.push(pl.waitMs); }
    const mean = (a) => a.reduce((x, y) => x + y, 0) / a.length;
    const sd = (a) => { const m = mean(a); return Math.sqrt(a.reduce((x, y) => x + (y - m) * (y - m), 0) / (a.length - 1)); };
    return { kg, wait, kgM: mean(kg), waitM: mean(wait), kgSd: sd(kg), waitSd: sd(wait) };
  };
  const A = sample(deep.sp, 777), B = sample(seam.sp, 777);
  // 웰치 t — 표본 4000×2. 이 정도 표본이면 |t|>4 는 우연이 아니다(p < 1e-4).
  const welch = (m1, s1, n1, m2, s2, n2) => (m1 - m2) / Math.sqrt(s1 * s1 / n1 + s2 * s2 / n2);
  const tKg = welch(A.kgM, A.kgSd, N, B.kgM, B.kgSd, N);
  const tWait = welch(B.waitM, B.waitSd, N, A.waitM, A.waitSd, N);
  say(`    깊은 자리: 평균 ${A.kgM.toFixed(3)}kg · 대기 ${Math.round(A.waitM)}ms`);
  say(`    경계 자리: 평균 ${B.kgM.toFixed(3)}kg · 대기 ${Math.round(B.waitM)}ms   (표본 ${N}×2)`);
  ok(tKg > 4, `★★① 깊은 자리가 **더 큰 놈**을 낸다 (Welch t=${tKg.toFixed(1)} > 4)`);
  ok(tWait > 4 || B.waitM < A.waitM * 0.9,
    `★★① 흐름 경계가 **더 자주** 문다 (대기 ${Math.round(B.waitM)}ms < ${Math.round(A.waitM)}ms · t=${tWait.toFixed(1)})`);
  // 반례 — 같은 자리끼리는 차이가 없어야 한다(위 판정이 표본 잡음을 잡은 게 아님을 보인다)
  const A2 = sample(deep.sp, 991);
  const tSelf = Math.abs(welch(A.kgM, A.kgSd, N, A2.kgM, A2.kgSd, N));
  ok(tSelf < 4, `★★반례 — 같은 자리 두 표본은 차이가 없다 (|t|=${tSelf.toFixed(1)} < 4) = 위 t 는 자리가 만든 것이다`);

  // ═══ ⑤ 크기 분포 — 로그정규 · 대어일수록 창이 짧다 ══════════════════════════
  say('\n⑤ 위험 — 크기 분포(로그정규)와 챔질 창');
  const ks = A.kg.slice().sort((a, b) => a - b);
  const q = (f) => ks[Math.min(ks.length - 1, Math.floor(ks.length * f))];
  const med = q(0.5), p95 = q(0.95), mx = ks[ks.length - 1];
  say(`    깊은 자리 ${N}표본 — 중앙 ${med.toFixed(2)}kg · 상위5% ${p95.toFixed(2)}kg · 최대 ${mx.toFixed(2)}kg`);
  ok(p95 / med > 2, `★⑤ 꼬리가 실제로 있다 — 상위5%가 중앙의 ${(p95 / med).toFixed(1)}배 (>2)`);
  ok(med < A.kgM, `★⑤ 로그정규의 표식 — 중앙(${med.toFixed(2)}) < 평균(${A.kgM.toFixed(2)}) = 오른쪽으로 치우쳤다`);
  // ln(kg) 이 정규에 가까운가 — 왜도로 본다(로그정규면 로그가 대칭이다)
  const ln = A.kg.map(Math.log).filter(Number.isFinite);
  const lm = ln.reduce((a, b) => a + b, 0) / ln.length;
  const lsd = Math.sqrt(ln.reduce((a, b) => a + (b - lm) ** 2, 0) / (ln.length - 1));
  const skew = ln.reduce((a, b) => a + ((b - lm) / lsd) ** 3, 0) / ln.length;
  ok(Math.abs(skew) < 0.35, `★⑤ ln(kg) 왜도 ${skew.toFixed(3)} ≈ 0 → 로그정규가 맞다`);
  const wMed = F.windowMsFor(med), wBig = F.windowMsFor(p95), wMax = F.windowMsFor(mx);
  say(`    챔질 창 — 중앙 ${wMed}ms · 상위5% ${wBig}ms · 최대어 ${wMax}ms`);
  ok(wBig < wMed && wMax <= wBig, `★★⑤ **대어일수록 창이 짧다** (${wMed} > ${wBig} ≥ ${wMax})`);
  ok(wMax >= F.CFG.WIN_MIN_MS, `★⑤ 창이 0으로 무너지지 않는다(하한 ${F.CFG.WIN_MIN_MS}ms)`);

  // ═══ ② 챔질 창 — 서버 시각이 권위다 ═════════════════════════════════════════
  say('\n② 위험 — 챔질 창(서버 시각 권위)');
  const P = mkPlayer('striker');
  P.x = deep.x; P.y = deep.y;                 // 물 위에 세운다(던질 자리를 서버가 고른다)
  H.tryFishCast(P);
  const st0 = P.__last('fish_state');
  ok(!!st0 && st0.state === 'wait', '★전제 — 던지기가 실제로 성립했다', st0 ? st0.state : P.__notices().slice(-1)[0]);
  ok(!!P._fish && P._fish.biteAt > Date.now(), '★전제 — 입질 시각이 **미래**로 잡혔다(서버가 정했다)',
    P._fish ? `${P._fish.biteAt - Date.now()}ms 뒤 · 창 ${P._fish.windowMs}ms` : 'X');

  // ⓐ 성급한 챔질 — 입질 전
  const before = P.__msgs.length;
  H.tryFishStrike(P);
  ok(/성급/.test(P.__notices().slice(-1)[0] || ''), '★★② 입질 **전** 챔질은 놓침이다', P.__notices().slice(-1)[0]);
  ok(P._fish === null, '★② 성급한 챔질 뒤엔 줄이 걷힌다(상태가 남지 않는다)');

  // ⓑ 창 **안** 챔질 — 성공
  const P2 = mkPlayer('intime'); P2.x = deep.x; P2.y = deep.y;
  H.tryFishCast(P2);
  ok(!!P2._fish, '★전제 — 두 번째 던지기 성립');
  P2._fish.biteAt = Date.now() - 50;          // 방금 물었다(서버 상태를 하네스가 당긴다 = 조업 진척 검사와 같은 문법)
  P2._fish.bit = true;
  const invBefore = { ...P2.inventory };
  H.tryFishStrike(P2);
  const cat = P2.__last('fish_catch');
  ok(!!cat, '★★② 창 **안** 챔질은 성공이다', cat ? `${cat.kg}kg ×${cat.n} ${cat.item}` : P2.__notices().slice(-1)[0]);
  ok(cat && Object.keys(P2.inventory).some((k) => (P2.inventory[k] || 0) > (invBefore[k] || 0)),
    '★② 잡은 물고기가 실제로 인벤에 들어온다', JSON.stringify(P2.inventory));

  // ⓒ 창 **밖** 챔질 — 놓침
  const P3 = mkPlayer('late'); P3.x = deep.x; P3.y = deep.y;
  H.tryFishCast(P3);
  P3._fish.biteAt = Date.now() - (P3._fish.windowMs + F.CFG.WIN_LAT_MS + 400);
  P3._fish.bit = true;
  const kgMissed = P3._fish.kg;
  H.tryFishStrike(P3);
  ok(/놓쳤다/.test(P3.__notices().slice(-1)[0] || ''), '★★② 창 **밖** 챔질은 놓침이다', P3.__notices().slice(-1)[0]);
  ok(!P3.__last('fish_catch'), '★② 놓쳤으면 물고기는 안 들어온다');

  // ⓓ **클라 시각 조작은 안 먹힌다** — 서버가 자기 시계만 본다
  const P4 = mkPlayer('cheat'); P4.x = deep.x; P4.y = deep.y;
  H.tryFishCast(P4);
  const realBite = P4._fish.biteAt;
  // 클라가 보낼 수 있는 것은 "지금 챘다"뿐이다. 시각 필드를 실어 보내도 서버는 안 읽는다.
  H.tryFishStrike(P4, { clientNow: realBite + 10, t: realBite + 10 });
  ok(/성급/.test(P4.__notices().slice(-1)[0] || ''),
    '★★② 클라가 시각을 실어 보내도 **서버 시계로** 판정한다(조작 거절)', P4.__notices().slice(-1)[0]);

  // ═══ ③ 고갈 · 리필 ═════════════════════════════════════════════════════════
  say('\n③ 판단 — 명당 고갈과 회복');
  F.fishCells.clear();
  const cx = Math.floor(deep.x / 32), cy = Math.floor(deep.y / 32);
  const r0 = F.stockRatioAt(cx, cy, Date.now());
  ok(Math.abs(r0 - 1) < 1e-6, '★전제 — 손 안 댄 자리는 만땅이다(암묵적 만땅 규약)', r0.toFixed(4));
  let caught = 0;
  const now0 = Date.now();
  for (let i = 0; i < 40; i++) {
    const P5 = mkPlayer('grind' + i); P5.x = deep.x; P5.y = deep.y;
    H.tryFishCast(P5);
    if (!P5._fish) continue;
    P5._fish.biteAt = Date.now() - 50; P5._fish.bit = true;
    H.tryFishStrike(P5);
    if (P5.__last('fish_catch')) caught++;
  }
  const r1 = F.stockRatioAt(cx, cy, Date.now());
  ok(caught >= 5, '★전제 — 연속 어획이 실제로 일어났다(0건이면 아래가 자명 통과다)', `${caught}/40건`);
  // ★이 자리가 **몇 마리 만에 바닥나나** — 재민이 손잡이를 돌릴 때 볼 수 있게 수치로 남긴다.
  say(`    자리 수명(실측): ${caught}마리에 재고 ${(1 - F.stockRatioAt(cx, cy, Date.now())).toFixed(2)} 소진` +
      ` (반경 ${F.CFG.DRAW_R} · ${F.fishCells.size}셀 · KG_PER_STOCK ${F.CFG.KG_PER_STOCK})`);
  ok(r1 < r0 * 0.85, `★★③ 같은 자리를 긁으면 **재고가 준다** (${r0.toFixed(3)} → ${r1.toFixed(3)})`);
  const planFull = F.plan(deep.sp, 1, 0, mkRng(5)), planLow = F.plan(deep.sp, r1, 0, mkRng(5));
  ok(planLow.waitMs > planFull.waitMs, `★★③ 빈 자리는 **덜 문다** (대기 ${planFull.waitMs} → ${planLow.waitMs}ms)`);
  // 회복 — 확산(총량 보존) + 재생(정본 r)
  const defBefore = F.deficitStock();
  const t1 = Date.now();
  for (let i = 0; i < 6; i++) F.diffuse(0.02, () => {});    // 게임일 0.12 ≈ 3분
  const r2 = F.stockRatioAt(cx, cy, t1);
  const defShort = F.deficitStock();
  ok(r2 > r1 + 0.05, `★★③ 몇 분이면 그 자리가 **눈에 띄게 회복한다** (${r1.toFixed(3)} → ${r2.toFixed(3)})`);
  ok(defShort > defBefore * 0.95,
    `★★③ 그런데 **총 결손은 거의 그대로다** — 자리 회복은 옆에서 온 것이지 만들어낸 게 아니다 (${(defShort / defBefore * 100).toFixed(1)}%)`);
  // 총량이 실제로 주는 유일한 길 = 정본 로지스틱 재생. 분 단위론 r=0.02/일 이라 사실상 0 이므로
  // **의미 있는 지평**(30 게임일)에서 잰다 — 안 그러면 이 판정이 부동소수점 잡음을 재게 된다.
  for (let i = 0; i < 30; i++) F.diffuse(1, () => {});
  const defLong = F.deficitStock();
  ok(defLong < defShort * 0.85,
    `★★③ 계절이 지나면 총 결손도 준다(정본 r=${S.L_FISHR}/일 로지스틱) (${defShort.toFixed(2)} → ${defLong.toFixed(2)})`);
  ok(F.fishCells.size > 0, '★③ 자투리가 보존된다(만땅 아닌 셀 레코드가 남아 있다)', `${F.fishCells.size}셀`);

  // ═══ ④ 자원 정합 — NPC 어부와 같은 물 ═══════════════════════════════════════
  say('\n④ 일관성 — 플레이어와 NPC 어부가 **같은 자원 풀**을 쓴다');
  ok(nearVil.length > 0, '★전제 — **마을 노동권 안의 물**을 실제로 찾았다(없으면 이 절이 자명 통과다)',
    nearVil.length ? `${nearVil.length}곳 · 첫 마을 ${nearVil[0].vil.name}` : '0곳');
  const target = nearVil[0] || null;
  const vil = target ? target.vil : null;
  if (!vil) {
    ok(false, '★④ 전제 — 이 물을 어장으로 치는 마을이 있다(없으면 검사 불가)');
  } else {
    // 그 마을 물에서 **실제로** 긁어 낸다 — ③ 에서 만든 결손은 변방이라 이 마을 것이 아니다.
    F.fishCells.clear();
    SimVillages.refreshFishSustain(vil, Date.now());
    for (let i = 0; i < 30; i++) {
      const Pv = mkPlayer('vfish' + i); Pv.x = target.x; Pv.y = target.y;
      H.tryFishCast(Pv);
      if (!Pv._fish) continue;
      Pv._fish.biteAt = Date.now() - 50; Pv._fish.bit = true;
      H.tryFishStrike(Pv);
    }
    const L = vil.econ.land;
    const base0 = L._fishBase != null ? L._fishBase : L.fishSustain;
    ok(base0 != null && base0 > 0, '★전제 — 그 마을에 어장 상한(MSY)이 실제로 잡혀 있다', `${base0}`);
    // ★★평시 무해 전제 — 만땅일 때 상한이 NPC 산출보다 훨씬 크면, 이 키를 채워도 **평시 NPC 산출은 안 변한다**.
    //   (상한이 실제로 물리기 시작하는 건 플레이어가 그만큼 긁어냈을 때뿐이다.)
    //   이 여유가 곧 "NPC 가 체감하려면 얼마나 잡아야 하나"의 답이기도 하다 — 수치로 남긴다.
    const JOBS_fisher_base = 1.2;   // sim/economy-sim.js JOBS.fisher.base (읽기 전용 상수 인용)
    const fisherN = (vil.econ.counts && vil.econ.counts.fisher) || 0;
    const rawNow = fisherN * JOBS_fisher_base * (L.water || 0);
    say(`    ${vil.name}: 어부 ${fisherN}명 · 산출 raw ${rawNow.toFixed(2)}/일 vs 어장 상한 ${base0}/일` +
        ` → 여유 ${rawNow > 0 ? (base0 / rawNow).toFixed(1) + '배' : '(어부 0)'}`);
    ok(rawNow === 0 || base0 > rawNow * 2,
      '★★전제 — 만땅 어장 상한이 NPC 산출보다 넉넉하다 = 이 키를 채워도 **평시 산출 불변**',
      `${base0} > ${(rawNow * 2).toFixed(2)}`);
    say(`    ⇒ NPC 가 체감하려면 플레이어가 결손 ${((base0 - rawNow) / F.stockToEcon(1)).toFixed(0)} stock` +
        ` (≈ ${(((base0 - rawNow) / F.stockToEcon(1)) * F.CFG.KG_PER_STOCK).toFixed(0)}kg) 을 긁어야 한다`);
    const info = SimVillages.refreshFishSustain(vil, Date.now());
    say(`    ${vil.name}: 기준 ${info.base} · 결손 ${info.deficitStock} stock → 감산 ${info.cut} · 지금 상한 ${info.fishSustain}`);
    ok(info.cut > 0, '★★④ 플레이어가 긁은 만큼 **그 수역의 econ 어장 상한이 내려간다**', `−${info.cut}`);
    ok(info.fishSustain < info.base, '★④ 정본 필드(v.land.fishSustain)에서 실제로 보인다',
      `${info.base} → ${info.fishSustain}`);
    // NPC 어부가 **같은 키**를 읽는지 — econ 정본 소스에서 확인(문자열이 아니라 실제 참조 경로를 본다)
    const src = fs.readFileSync(path.join(ROOT, 'sim', 'economy-sim.js'), 'utf8');
    ok(/_fishScale\s*=\s*\(v\.land\.fishSustain\s*!=\s*null/.test(src),
      '★★④ NPC 어부 산출이 **그 키를 그대로 읽는다**(같은 물이다) — econ 정본에서 확인');
    // 환산 계수가 sustain.js 정본인지 — 사본이면 여기서 갈린다
    const oneStock = F.stockToEcon(1);
    ok(Math.abs(oneStock - (S.L_FISHR / 4) * S.FISH_ECON_PER_STOCK) < 1e-12,
      '★④ stock→econ 환산이 sustain.js **정본 계수** 그대로다(사본 아님)', oneStock.toExponential(3));
    // 회복하면 상한도 돌아온다
    F.fishCells.clear();
    const back = SimVillages.refreshFishSustain(vil, Date.now());
    ok(Math.abs(back.fishSustain - back.base) < 1e-9, '★④ 어장이 회복하면 상한도 **원래대로** 돌아온다',
      `${back.fishSustain} = ${back.base}`);
  }

  // ═══ ⑥ 기록 누적 ═══════════════════════════════════════════════════════════
  say('\n⑥ 기록 — 마릿수·최대·놓친 최대');
  F.fishCells.clear();   // ★깨끗한 자리에서 — 앞 절이 비워 둔 물로 재면 "빈 바늘"만 나와 기록이 안 쌓인다
  const P6 = mkPlayer('recorder'); P6.x = deep.x; P6.y = deep.y;
  const st = H._fishStats(P6);
  ok(st.casts === 0 && st.caught === 0 && st.maxKg === 0, '★전제 — 새 사람의 기록은 비어 있다');
  // ★비교 대상은 **계획된** 크기가 아니라 **실제로 잡힌** 크기다(재고가 모자라면 덜 잡힌다).
  let bigSeen = 0, landed = 0;
  for (let i = 0; i < 25; i++) {
    H.tryFishCast(P6);
    if (!P6._fish) continue;
    P6._fish.biteAt = Date.now() - 50; P6._fish.bit = true;
    H.tryFishStrike(P6);
    const c = P6.__last('fish_catch');
    if (c && c.kg > bigSeen) { bigSeen = c.kg; }
    if (c) landed++;
  }
  ok(landed >= 5, '★전제 — 이 절에서 실제로 여러 마리를 잡았다', `${landed}/25`);
  // 놓친 최대 — 창을 지나쳐 본다
  H.tryFishCast(P6);
  const missKg = P6._fish ? P6._fish.kg : 0;
  if (P6._fish) { P6._fish.biteAt = Date.now() - (P6._fish.windowMs + 999); P6._fish.bit = true; H.tryFishStrike(P6); }
  const st2 = H._fishStats(P6);
  say(`    ${JSON.stringify(st2)}`);
  ok(st2.casts >= 25, '★⑥ 던진 횟수가 쌓인다', st2.casts);
  ok(st2.caught > 0, '★⑥ 잡은 마릿수가 쌓인다', st2.caught);
  ok(st2.maxKg > 0 && Math.abs(st2.maxKg - bigSeen) < 0.06,
    '★⑥ **최대 크기**가 실제로 그 판의 최대와 같다', `${st2.maxKg} vs ${bigSeen.toFixed(2)}`);
  ok(st2.maxMissedKg > 0 && Math.abs(st2.maxMissedKg - missKg) < 0.06,
    '★⑥ **놓친 최대**가 따로 쌓인다(놓친 대어가 기록에 남는다)', `${st2.maxMissedKg} vs ${missKg.toFixed(2)}`);
  ok(st2.missed >= 1, '★⑥ 놓침 횟수가 쌓인다', st2.missed);

  // ═══ ⑦ 픽스처 결백 — 이 하네스가 검사 대상을 오염시키지 않았는가 ═══════════
  say('\n⑦ 픽스처 결백(족보 ㊻)');
  const zsrc = fs.readFileSync(path.join(ROOT, 'server', 'zone.js'), 'utf8');
  ok(/function tryFishStrike\(player\)/.test(zsrc),
    '★⑦ 챔질은 **인자를 하나만** 받는다 = 클라 시각을 받을 자리가 애초에 없다');
  ok(!/_fish\.biteAt\s*=\s*[^;]*msg\./.test(zsrc), '★⑦ 클라 메시지가 입질 시각을 건드리는 경로가 없다');
  ok(F.CFG.KG_PER_STOCK > 0 && F.CFG.CELL_K > 0, '★⑦ 손잡이가 전부 살아 있다(env 미설정 = 채택값)',
    `KG_PER_STOCK ${F.CFG.KG_PER_STOCK} · CELL_K ${F.CFG.CELL_K}`);

  say(`\n=== ${pass + fail}건 중 PASS ${pass} · FAIL ${fail} ===\n`);
  for (const f of [TMP, TMP + '-wal', TMP + '-shm']) { try { fs.unlinkSync(f); } catch (e) {} }
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
