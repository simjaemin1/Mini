#!/usr/bin/env node
// === scripts/downed-metrics.js — 쓰러짐의 대리 지표 (계측기 · 러너 밖) =========
//
// ★★[재민 확정 2026-09-02 · T56] **이건 검사가 아니라 자(尺)다.** 통과/실패를 말하지 않고
//   수를 낸다. T43 이 손잡이마다 근거를 적었지만 그중 하나가 **산수가 틀렸고**
//   (*"야생에서 800px 을 달려오는 데 ~40초"* — 800px 은 25m 라 걸어도 12.5초다),
//   틀린 근거는 다음 사람이 그 값을 만질 때 그대로 물려받는다. 그래서 잰다.
//
// 네 가지를 낸다:
//   ⓐ **도달** — 정본 이속·스태미나에서 유도한 "T초 안에 갈 수 있는 거리". 외침 반경의 검산.
//   ⓑ **외침 반경·주기** — 채택값이 ⓐ 예산 안에 있는가(여유 몇 %인가).
//   ⓒ **짐 회수 원정** — 야생에서 죽은 자리 → 깨어나는 자리. **정본 함수로** 잰다.
//   ⓓ **더위**(회부용 · 구현 금지) — 24년 기온 분포. 더위 축을 켜면 누가 언제 죽는가.
//
// 실행: node scripts/downed-metrics.js [표본수]
'use strict';
const path = require('path');
const fs = require('fs');
const ROOT = path.join(__dirname, '..');
const N = Math.max(20, parseInt(process.argv[2], 10) || 200);

const TMP = `/tmp/downed-metrics-${process.pid}.db`;
for (const f of [TMP, TMP + '-wal', TMP + '-shm']) { try { fs.unlinkSync(f); } catch (e) {} }
process.env.ZONE_ID = 'hanbando';
process.env.PORT = String(37600 + (process.pid % 150));
process.env.DB_PATH = TMP;
process.env.ENABLE_VILLAGES = '1';
process.env.ENABLE_WILDLIFE = '0'; process.env.ENABLE_BANDITS = '0'; process.env.ENABLE_ROADS = '0';

const _l = console.log, _w = console.warn, _e = console.error;
console.log = () => {}; console.warn = () => {}; console.error = () => {};
const Zone = require(path.join(ROOT, 'server', 'zone.js'));
console.log = _l; console.warn = _w; console.error = _e;
const H = Zone.__testBind();
const B = H.Body, Rescue = H.Rescue, SimVillages = H.SimVillages;
const say = (m) => console.log(m);
const fmt = (n, d) => Number(n).toFixed(d == null ? 1 : d);

// ── 정본에서 수를 **읽는다**(여기 상수를 적으면 그게 사본이다) ────────────────
const SRC = fs.readFileSync(path.join(ROOT, 'server', 'zone.js'), 'utf8');
const SPEED = +(/const MOVE_SPEED = (\d+)/.exec(SRC) || [])[1];        // px/s
const SPRINT = +(/const SPRINT_MULT = ([\d.]+)/.exec(SRC) || [])[1];
const PX_PER_M = 32;                                                   // 실축화 캐논(1셀=1m=32px)

(async () => {
  say('\n=== 쓰러짐 대리 지표 (T56 계측기) ===');
  say(`    정본: 이속 ${SPEED}px/s(=${SPEED / PX_PER_M}m/s) · 질주 ×${SPRINT} · 1걸음=${PX_PER_M}px`);
  say(`    창 ${H.RESCUE_WINDOW_MS / 1000}초 · 붙들기 ${H.RESCUE_HOLD_MS / 1000}초 · 구조 거리 ${H.RESCUE_RANGE_PX}px`);

  // ═══ ⓐ 도달 — 스태미나가 정하는 **평균 속도** ═════════════════════════════
  say('\nⓐ 도달 — 전력질주는 22초뿐이다(스태미나 정본에서 유도)');
  const C = B.CFG;
  const vWalk = SPEED, vRun = SPEED * SPRINT;
  //   빈손(적재율 0) 기준. 소모 = 1/STAM_SPRINT_SEC · (1 + LOAD_W·load) — 달려오는 사람은 빈손이다.
  const drain = 1 / C.STAM_SPRINT_SEC;                   // /s
  const recMove = (1 / C.STAM_REST_SEC) * C.STAM_MOVE_MULT;   // 걸으며 회복 /s
  const t1 = (1 - C.STAM_MIN) / drain;                   // 첫 질주(가득 → 바닥)
  const tRec = (C.STAM_RESUME - C.STAM_MIN) / recMove;   // 다시 달릴 만큼 차기까지(걸으며)
  const t2 = (C.STAM_RESUME - C.STAM_MIN) / drain;       // 그 뒤의 짧은 질주
  const cycleT = tRec + t2, cycleD = tRec * vWalk + t2 * vRun;
  const vAvg = cycleD / cycleT;
  say(`     첫 질주 ${fmt(t1)}초 ${fmt(t1 * vRun, 0)}px  ·  이후 순환 = 걷기 ${fmt(tRec)}초 + 질주 ${fmt(t2)}초`);
  say(`     ⇒ 순환 평균 **${fmt(vAvg)}px/s**(걷기 ${vWalk} · 질주 ${vRun} 사이)`);
  const reach = (T) => (T <= t1 ? T * vRun : t1 * vRun + (T - t1) * vAvg);
  const budget = (H.RESCUE_WINDOW_MS - H.RESCUE_HOLD_MS) / 1000;
  say('');
  say('     T초 안에 갈 수 있는 직선 거리');
  say('     ┌───────┬──────────┬────────┐');
  for (const T of [10, 30, 60, 90, 120, budget]) {
    const d = reach(T);
    say(`     │ ${String(fmt(T, 0)).padStart(5)}초 │ ${String(fmt(d, 0)).padStart(8)}px │ ${String(fmt(d / PX_PER_M, 0)).padStart(5)}m │`
      + (T === budget ? '  ← 창 − 붙들기 = 구조 예산' : ''));
  }
  say('     └───────┴──────────┴────────┘');
  say(`     ★T43 이 적은 "800px ≈ 40초" 는 틀렸다 — 800px 은 ${fmt(800 / PX_PER_M, 0)}m 이고 걸어도 ${fmt(800 / vWalk)}초다.`);

  // ═══ ⓑ 외침 반경·주기 — 채택값의 검산 ════════════════════════════════════
  say('\nⓑ 외침 — 소리가 먼저, 도달이 검산');
  //   ⚠★[T119] 여기 있던 `Rescue.CFG.SHOUT_RANGE_PX` 는 **T110 뒤 0(=유도해라)** 이다.
  //     상수를 읽으면 이 계측기만 "반경 0" 을 보고한다 ⇒ 정본 함수에 묻는다(사본 0).
  const R = Rescue.shoutRange(), EV = Rescue.CFG.SHOUT_EVERY_MS;
  //   반경 R 에서 출발하면 몇 초 걸리나 — reach 의 역함수(단조라 이분법으로 충분하다)
  let lo = 0, hi = 3600;
  for (let i = 0; i < 60; i++) { const m = (lo + hi) / 2; if (reach(m) < R) lo = m; else hi = m; }
  const tEdge = (lo + hi) / 2;
  const slack = budget - tEdge;
  say(`     채택 반경 ${R}px = ${fmt(R / PX_PER_M, 0)}m = ${Rescue.steps(R)}걸음`
    + `  (★[T110] 손으로 적은 수가 아니라 **유도**된다: 이속 ${SPEED} × 창 ${H.RESCUE_WINDOW_MS / 1000}초 × HEAR_FRAC ${Rescue.CFG.HEAR_FRAC})`);
  say(`     가장자리에서 달려오면 ${fmt(tEdge)}초 · 예산 ${fmt(budget)}초 ⇒ **여유 ${fmt(slack)}초(${fmt(100 * slack / budget)}%)**`);
  say(`     그 여유가 지형 우회분이다 — 직선의 ${fmt(100 * budget / tEdge - 100)}% 를 더 걸어도 닿는다.`);
  say(`     채택 주기 ${EV / 1000}초 ⇒ 창(${H.RESCUE_WINDOW_MS / 1000}초) 동안 ${Math.floor(H.RESCUE_WINDOW_MS / EV)}번.`
    + ` 반경으로 걸어 들어온 사람의 무지 시간 ≤ ${EV / 1000}초 ≪ 여유 ${fmt(slack, 0)}초.`);

  // ═══ ⓒ 짐 회수 원정 — 정본 함수로 잰다 ═══════════════════════════════════
  say('\nⓒ 짐 회수 원정 — 죽은 자리에서 깨어나는 자리까지 (정본 `nearestVillageWake`)');
  const W = H.ZONE.zoneWidth, Hh = H.ZONE.zoneHeight;
  //   ★결정론: 난수 대신 **격자**로 훑는다(같은 세계면 같은 표가 나온다 — 주사위 0).
  const side = Math.ceil(Math.sqrt(N));
  const ds = [];
  let wild = 0, tried = 0;
  for (let i = 0; i < side; i++) {
    for (let j = 0; j < side; j++) {
      const x = Math.round((i + 0.5) * W / side), y = Math.round((j + 0.5) * Hh / side);
      tried++;
      if (H.isWaterTileLocal(x, y) || H.isTerrainBlockedLocal(x, y)) continue;
      if ((SimVillages.shelterAt(x, y) || 0) > 0) continue;      // 마을 안은 안 죽는다(§12)
      wild++;
      const w = H.nearestVillageWake(x, y);
      if (w) ds.push(Math.hypot(w.x - x, w.y - y));
    }
  }
  ds.sort((a, b) => a - b);
  const q = (f) => ds.length ? ds[Math.min(ds.length - 1, Math.floor(f * ds.length))] : 0;
  say(`     표본 ${tried}칸 중 **설 수 있는 야생** ${wild}칸 · 깨어날 자리를 찾은 것 ${ds.length}칸`);
  if (ds.length) {
    for (const [ko, f] of [['최소', 0], ['1사분위', 0.25], ['중앙값', 0.5], ['3사분위', 0.75], ['최대', 0.999]]) {
      const d = q(f);
      say(`       ${ko.padEnd(6)} ${String(fmt(d, 0)).padStart(7)}px = ${String(fmt(d / PX_PER_M, 0)).padStart(5)}m`
        + ` · 걸어서 ${fmt(d / vWalk / 60)}분 · 순환으로 ${fmt(d / vAvg / 60)}분`);
    }
    say(`     ★죽음의 대가는 "짐을 잃는 것"이 아니라 **중앙값 ${fmt(q(0.5) / vAvg / 60)}분짜리 왕복**이다`);
    say(`       (편도. 돌아오는 길은 짐을 지고 걷는다 — 과적이면 더 느리다).`);
  }

  // ═══ ★[T119 2026-09-05] ⓔ **실효 구조율** — 쓰러지면 어떻게 되는가 ═════════
  //
  //   ★왜 여기인가: T110 이 "소리에는 끝이 있다"를 세웠고, T119 가 구조를 **사건**으로 만들었다.
  //     그러면 물어야 할 것이 생긴다 — *쓰러진 사람 100 중 몇이 살아나는가.*
  //   ⚠★**사람 없이 재는 수와 사람이 있어야 재는 수를 가른다.** 이 계측기엔 플레이어가 없다.
  //     그래서 여기서 내는 것은 **지형이 정하는 몫**이다:
  //       · 마을 이송률 = 쓰러진 자리가 마을 완충 안일 확률 (`resolveDowned` 의 판정 그대로)
  //       · 외침이 닿는 곳에 **마을이 있는가** — 사람이 있을 만한 자리가 소리 안에 있나(T110 이 남긴 자리)
  //     플레이어 구조율 자체는 **사람이 있어야 나오는 수**다 — 지어내지 않는다(회부).
  say('\n★ⓔ 실효 구조율 — 쓰러지면 어떻게 되는가 (지형이 정하는 몫)');
  {
    const vils = (SimVillages.clientVillages() || []).map((v) => ({ x: v.cx * 32 + 16, y: v.cy * 32 + 16, name: v.name }));
    const side2 = Math.ceil(Math.sqrt(N));
    let stand = 0, inVil = 0, wild2 = 0, heard = 0;
    const nearD = [];
    for (let i = 0; i < side2; i++) {
      for (let j = 0; j < side2; j++) {
        const x = Math.round((i + 0.5) * W / side2), y = Math.round((j + 0.5) * Hh / side2);
        if (H.isWaterTileLocal(x, y) || H.isTerrainBlockedLocal(x, y)) continue;
        stand++;
        if ((SimVillages.shelterAt(x, y) || 0) > 0) { inVil++; continue; }   // 마을 안 — 이송(§12)
        wild2++;
        let bd = Infinity;
        for (const v of vils) { const d = Math.hypot(v.x - x, v.y - y); if (d < bd) bd = d; }
        if (isFinite(bd)) { nearD.push(bd); if (bd <= R) heard++; }
      }
    }
    const pc = (a, b) => (b > 0 ? fmt(100 * a / b) : '—');
    say(`     설 수 있는 칸 ${stand} — 마을 안 ${inVil}(${pc(inVil, stand)}%) · 야생 ${wild2}(${pc(wild2, stand)}%)`);
    say(`     ⇒ **마을 이송률 ${pc(inVil, stand)}%** — 여기서 쓰러지면 짐도 안 잃고 후유증도 없다(T88 죽 한 그릇 포함).`);
    say(`     ⇒ 야생 ${pc(wild2, stand)}% 는 **사람이 오지 않으면 죽음**이다. 그 사람이 올 수 있는지가 아래다.`);
    say(`     야생 칸 중 외침 반경(${R}px) 안에 **마을이 있는** 칸 ${heard}/${wild2} = **${pc(heard, wild2)}%**`);
    nearD.sort((a, b) => a - b);
    const q2 = (f) => (nearD.length ? nearD[Math.min(nearD.length - 1, Math.floor(f * nearD.length))] : 0);
    say(`     야생에서 가장 가까운 마을까지 — 중앙 ${fmt(q2(0.5), 0)}px(${fmt(q2(0.5) / PX_PER_M, 0)}m) · 1사분위 ${fmt(q2(0.25), 0)}px · 3사분위 ${fmt(q2(0.75), 0)}px`);
    // ★대조 — T110 이 반경을 옮기기 전(9,600px)과 나란히. 수가 **왜** 그렇게 정해졌는지가 여기 보인다.
    for (const [ko, RR] of [['T56 옛 반경', 9600], ['채택(T110)', R]]) {
      let h2 = 0; for (const d of nearD) if (d <= RR) h2++;
      say(`       ${ko.padEnd(12)} ${String(RR).padStart(5)}px → 마을이 소리 안인 야생 칸 ${pc(h2, wild2)}%`);
    }
    say(`     ★읽는 법: 이 %는 "구조된다"가 아니라 **"소리가 사람 사는 곳에 닿는다"** 다.`);
    say(`       실제 구조율은 그때 그 마을에 **깨어 있는 사람이 있었는가**에 달렸고, 그건 사람이 있어야 나오는 수다(회부).`);
    say(`     ★그리고 이제 살아난 순간은 **장부에 남는다**(T119 \`RESCUED\`) — 실서버 연표를 세면 진짜 구조율이 나온다.`);
  }

  // ═══ ⓓ 더위 — 회부용 표(구현 금지) ═══════════════════════════════════════
  say('\nⓓ 더위 — 축을 켜면 누가 언제 죽나 (회부 B-1 · **이 카드는 안 만든다**)');
  const Wx = require(path.join(ROOT, 'server', 'weather.js'));
  const a = Wx.anchors();
  say(`     기온 정본은 **존 전체가 한 곡선**이다 — 위도는 존 상수, 마을별 차이 0.`);
  say(`     고도만 −6.5℃/km 인데 이 세계의 산은 35m 고 **바위는 통행 불가**라 설 수 있는 고도는 0 뿐이다.`);
  say(`     ⇒ "51마을 × 야생 표본" 은 실측 결과 **한 표본**이다(마을 완충은 추위만 깎고 더위엔 안 붙는다).`);
  say(`     앵커: 여름낮 ${a.tSummerDay}℃ · 여름밤 ${a.tSummerNight}℃ · 겨울낮 ${a.tWinterDay}℃ · 겨울밤 ${a.tWinterNight}℃`);
  let mx = -99, mxAt = null, o29 = 0, o32 = 0, o35 = 0, n = 0;
  const yearMax = [];
  for (let y = 0; y < 24; y++) {
    let ym = -99;
    for (let d = 0; d < 365; d++) {
      for (const night of [false, true]) {
        const t = Wx.tempAt(y * 365 + d, night, 0); n++;
        if (t > 29) o29++; if (t > 32) o32++; if (t > 35) o35++;
        if (t > ym) ym = t;
        if (t > mx) { mx = t; mxAt = { year: y, doy: d, night }; }
      }
    }
    yearMax.push(+ym.toFixed(2));
  }
  say(`     24년 표본 ${n}(낮·밤) — 최고 **${fmt(mx, 2)}℃**(${mxAt.year}년차 ${mxAt.doy}일 ${mxAt.night ? '밤' : '낮'})`);
  say(`       29℃ 초과 ${o29}회(${fmt(100 * o29 / n, 2)}%) · 32℃ ${o32}회(${fmt(100 * o32 / n, 2)}%) · 35℃ **${o35}회**`);
  say(`       연도별 최고: ${Math.min(...yearMax)} ~ ${Math.max(...yearMax)}℃`);
  say(`     ★추위 축의 표는 29℃ 에서 끝난다(coldOfC 마지막 제어점 = 여름낮 앵커) — 더위 축을 켜려면`);
  say(`       **29℃ 위에 새 제어점**을 놓아야 하는데, 이 세계의 기온이 거기서 ${fmt(mx - 29, 1)}℃ 밖에 더 안 올라간다.`);
  say(`       그 폭에 0→1 을 욱여넣으면 여름 낮이 매년 극단이 되고, 넓게 잡으면 24년에 한 번도 안 닿는다.`);
  say(`     ⇒ 온도로는 성립하지 않는다. 한반도 여름의 위험은 열사병이 아니라 **탈수와 노동**이고,`);
  say(`       그 축은 이 세계에 **이미 있다**(갈증 · T44 r=0.046296 HP/게임분). 판정은 재민 몫.`);

  say('');
  for (const f of [TMP, TMP + '-wal', TMP + '-shm']) { try { fs.unlinkSync(f); } catch (e) {} }
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
