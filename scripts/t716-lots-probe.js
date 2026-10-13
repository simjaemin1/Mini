#!/usr/bin/env node
// (@regress 없음 — 러너 밖 · T716 계측기 · 제품 무접촉 · 판정 0)
// === scripts/t716-lots-probe.js — **곳간 그림자 로트**: econ 곳간이 로트를 들었다면 몇 개 · 몇 바이트 · 하루 몇 µs 인가 ===
//
// ★왜 [T716 ③ · 재민 10-12 "수만~수십만 개인데 다 들고 있을 수 있어?"] econ 곳간(`v.storage[재화]`)은 날짜 없는 총량이다.
//   이 자는 세계를 **한 글자도 안 바꾸고** 곳간 옆에 그림자 장부를 둔다: 상하는 재화(`lots.isLot`)의 칸이 늘면 그 순간의 로트를 하나 얹고,
//   줄면 **오래된 것부터** 뺀다(설계 ② 의 소비 순서). 그래서 "로트를 들면 몇 개가 살아 있나"가 그대로 센다.
//   ⚠econ 은 지금 가격 가중으로 먹는다(오래된 것부터가 아니다) — 그림자의 "줄면 오래된 것부터"는 **설계의 규칙**이지 econ 의 사실이 아니다.
//
// ★띠 넷(같은 흐름을 동시에 넷으로 센다):
//   T  같은 순간 = 같은 JS 한 차례(동기 실행 한 번 — econ 하루 틱·생활층 조각·캐러밴 한 번이 각각 한 차례) — "같은 순간만 합친다"
//   H  게임 1시간 띠(시간 = 그날 econ 경계부터 흐른 실시간 ÷ VILLAGE_DAY_MS × 24시간 — 빠른 시계 250ms/일 그대로)
//   D  게임 하루 띠 = econ 날(`world.day`) — 지금 `lots.js` 의 정수 게임일과 같은 굵기
//   X  D 와 같되 **상한 것(f ≤ 0)은 버린다**(설계 ②) — 노출은 `spoil.exposureOf`(곳간 자리 `placeFields('granary')` · 고도 0) · 신선도는 `spoil.freshnessOf`
//      ⇒ 버린 양 장부(재화별 하루 합)가 같이 나온다. X 는 실제 곳간보다 적게 들 수 있다(버린 만큼) — 그 뒤 줄어드는 몫은 있는 데까지만 뺀다.
//
// ★세계는 그대로다 — 기준선 게이트(`server-baseline-check.js`)를 이 자와 **같은 판에** 건다(NODE_OPTIONS 로 둘 다 아이 존에 실린다).
//   견주기가 "같음"이면 그림자가 세계를 안 건드렸다는 실측이다.
//
// 쓰는 법: node scripts/t716-lots-probe.js [--seed 1020] [--days 400] [--out 계측/T716_곳간로트_1020.json] [--base 계측/서버기준선_2026-10-13.json]
//   → 기준선 게이트 견주기 출력 + 그림자 장부 JSON(하루 줄 · 띠별 로트 수 · 마을 최대 · 버린 양 · µs · 스냅숏 날의 재화별 수 · 저장 바이트)
'use strict';
const path = require('path');
const fs = require('fs');

// ── 아이 존 안(기준선 게이트가 띄운 판) ─────────────────────────────────────────
if (process.env.T716_PROBE === '1' && process.env.SBC_HOOK === '1' && process.env.T577_OUT) {
  const ROOT = path.join(__dirname, '..');
  const OUT = process.env.T716_OUT || (process.env.T577_OUT + '.t716.json');
  const Ev = require(path.join(ROOT, 'server', 'events'));
  const Lots = require(path.join(ROOT, 'server', 'lots'));
  const Spoil = require(path.join(ROOT, 'server', 'spoil'));
  const EPS = Lots.CFG.EPS;                               // 로트 장부와 같은 바닥(1e-6)
  const DAY_REAL = parseInt(process.env.VILLAGE_DAY_MS || '250', 10) || 250;
  const GDAY = 86400000, GHOUR = 3600000;
  const PF = Spoil.placeFields('granary');                // 곳간 자리(밀폐 · 완충) — 정본 표
  const SNAP = new Set(String(process.env.T716_SNAP || '1,50,100,200,300,400').split(',').map((x) => parseInt(x, 10)));
  const BANDS = ['T', 'H', 'D', 'X'];
  const LASTDAY = (parseInt(process.env.T577_DAYS || '400', 10) || 400) - 1;
  const now = () => Number(process.hrtime.bigint());
  let W = null;                                           // 살아 있는 econ 세계(`state.world`)
  let turnId = 0, turnOpen = false;
  let seenDay = -1, dayReal0 = 0;
  const recOf = new Map();                                // 마을(econ 객체) → { name, S: { 재화: { T:[], H:[], D:[], X:[] } } } · 로트 = { k, q, d }
  const shadow = [];                                      // 그림자 기록들(마을이 세계에서 빠져도 남는다 — 차례는 처음 본 순서)
  const cnt = { T: 0, H: 0, D: 0, X: 0 };                 // 살아 있는 로트 수(합)
  // ★먹을 것 = econ 식단 군(`economy-sim.js` FOOD_GROUP ∪ T86_GROUP ∪ PRESERVED_FOODS) — 글자를 읽어 온다(옮겨 적지 않는다).
  //   `lots.isLot` 은 축산·작물 특산을 통째로 로트로 친다(깃털·뼈·삼·가죽·모피도 보관일 5일) — 그래서 먹을 것만 따로도 센다.
  const FOOD = (() => {
    const out = new Set();
    try {
      const src = fs.readFileSync(path.join(ROOT, 'sim', 'economy-sim.js'), 'utf8');
      const grab = (re) => { const m = src.match(re); if (m) for (const x of m[1].matchAll(/(\w+):\s*'\w+'/g)) out.add(x[1]); };
      grab(/const FOOD_GROUP = \{([^}]*)\}/);
      grab(/const T86_GROUP = Object\.assign\(\{\}, FOOD_GROUP, \{([^}]*)\}/);
      const pm = src.match(/const PRESERVED_FOODS = \[([^\]]*)\]/);
      if (pm) for (const x of pm[1].matchAll(/'(\w+)'/g)) out.add(x[1]);
    } catch (e) {}
    return out;
  })();
  const ns = { in: 0, out: 0, sweep: 0 };                 // 오늘 쓴 시간(ns)
  const ops = { in: 0, out: 0, pops: 0 };
  let discardToday = 0, discardFoodToday = 0; const discardBy = {};   // X 띠가 버린 양(econ 단위 · 먹을 것만 따로)
  const rows = [], snaps = {};
  const isLotRes = (r) => { try { return Lots.isLot(r); } catch (e) { return false; } };
  const turn = () => {
    if (process.env.T716_NOTICK === '1') return 0;        // (진단: =1 이면 차례를 안 센다)
    if (!turnOpen) { turnOpen = true; turnId++; process.nextTick(() => { turnOpen = false; }); }
    return turnId;
  };
  const dayNow = () => (W && Number.isFinite(W.day)) ? (W.day | 0) : 0;
  function keys(band) {
    const d = dayNow();
    if (band === 'T') return turn();
    if (band === 'D' || band === 'X') return d;
    const t = Date.now();
    if (d !== seenDay) { seenDay = d; dayReal0 = t; }
    const intra = Math.min(GDAY - 1, Math.max(0, (t - dayReal0) / DAY_REAL * GDAY));
    return Math.floor((d * GDAY + intra) / GHOUR);
  }
  function slot(rec, r) {
    return rec.S[r] || (rec.S[r] = { T: [], H: [], D: [], X: [] });
  }
  function inflow(rec, r, q) {
    const t0 = now(); ops.in++;
    const s = slot(rec, r), d = dayNow();
    for (const b of BANDS) {
      const arr = s[b], k = keys(b), last = arr[arr.length - 1];
      if (last && last.k === k) last.q += q;
      else { arr.push({ k, q, d }); cnt[b]++; }
    }
    ns.in += now() - t0;
  }
  function outflow(rec, r, q) {
    const t0 = now(); ops.out++;
    const s = slot(rec, r);
    for (const b of BANDS) {
      const arr = s[b];
      let left = q;
      while (left > EPS && arr.length) {
        const l = arr[0], take = Math.min(left, l.q);
        l.q -= take; left -= take;
        if (l.q <= EPS) { arr.shift(); cnt[b]--; ops.pops++; }
      }
    }
    ns.out += now() - t0;
  }
  function wrapKey(st, rec, r) {
    const dsc = Object.getOwnPropertyDescriptor(st, r);
    if (!dsc || !('value' in dsc) || !dsc.configurable) return false;
    let val = dsc.value;
    Object.defineProperty(st, r, {
      enumerable: dsc.enumerable, configurable: true,
      get() { return val; },
      set(x) {
        const o = +val || 0;
        val = x;
        const n = +x || 0;
        try { if (n > o + EPS) inflow(rec, r, n - o); else if (n < o - EPS) outflow(rec, r, o - n); } catch (e) {}
      },
    });
    return true;
  }
  // 그림자 합을 실제 칸에 맞춘다(가로채기 전에 생긴 칸 · 갈아 끼운 storage · 새 키) — 남으면 오늘 들어온 것, 모자라면 오래된 것부터
  //   (X 는 버린 만큼 실제보다 적은 게 맞다 — D 띠 합을 기준으로 맞추고, 같은 몫을 X 에도 얹거나 뺀다)
  function reconcileSlot(rec, r, actual) {
    const s = slot(rec, r);
    let have = 0; for (const l of s.D) have += l.q;
    const a = Math.max(0, +actual || 0);
    if (a > have + EPS) inflow(rec, r, a - have);
    else if (a < have - EPS) outflow(rec, r, have - a);
  }
  function install(world) {
    for (const v of (world.villages || [])) {
      if (!v || !v.storage) continue;
      let rec = recOf.get(v);
      if (!rec) { rec = { name: v.name, S: {} }; recOf.set(v, rec); shadow.push(rec); }
      const st = v.storage;
      for (const r of Object.keys(st)) {
        if (!isLotRes(r)) continue;
        const dsc = Object.getOwnPropertyDescriptor(st, r);
        if (dsc && 'value' in dsc) {                      // 아직 안 가로챈 칸(처음 · 새 키 · 갈아 끼운 storage) — 지금 값에 맞추고 가로챈다
          reconcileSlot(rec, r, dsc.value);
          if (process.env.T716_NOWRAP !== '1') wrapKey(st, rec, r);   // (진단: =1 이면 가로채지 않는다 — 하루 끝 맞추기만)
        }
      }
    }
  }
  function sweepX(today) {
    const t0 = now();
    for (const rec of shadow) {
      const S = rec.S;
      for (const r of Object.keys(S)) {
        const arr = S[r].X;
        while (arr.length) {
          const l = arr[0];
          const e = Spoil.exposureOf({ d: l.d, e: 0, t: l.d, m: PF.m, w: PF.w }, today, 0);
          if (Spoil.freshnessOf(r, e) > 0) break;          // 같은 자리 · 앞이 더 오래됐다 — 이 로트가 살아 있으면 뒤도 산다
          arr.shift(); cnt.X--;
          discardToday += l.q; discardBy[r] = (discardBy[r] || 0) + l.q;
          if (FOOD.has(r)) discardFoodToday += l.q;
        }
      }
    }
    ns.sweep += now() - t0;
  }
  function perVillage(b, foodOnly) {
    let mx = 0, tot = 0; const per = [];
    for (const rec of shadow) {
      let c = 0;
      for (const r of Object.keys(rec.S)) if (!foodOnly || FOOD.has(r)) c += rec.S[r][b].length;
      per.push(c); tot += c; if (c > mx) mx = c;
    }
    return { max: mx, per, tot };
  }
  function snapshot(d) {
    const byRes = {};
    for (const rec of shadow) {
      const S = rec.S;
      for (const r of Object.keys(S)) {
        const o = byRes[r] || (byRes[r] = { T: 0, H: 0, D: 0, X: 0, q: 0, shelf: Spoil.shelfOf(r) });
        for (const b of BANDS) o[b] += S[r][b].length;
        for (const l of S[r].D) o.q += l.q;
      }
    }
    // 저장 바이트 — 지금 `lots.js` 저장 꼴 {d,n,e,t,m,w} 로 D 띠를 적으면(마을마다 { 재화: [로트…] })
    let json = 0, jsonT = 0;
    for (const rec of shadow) {
      const S = rec.S;
      const o = {}, oT = {};
      for (const r of Object.keys(S)) {
        if (S[r].D.length) o[r] = S[r].D.map((l) => ({ d: l.d, n: +l.q.toFixed(6), e: 0, t: d, m: PF.m, w: PF.w }));
        if (S[r].T.length) oT[r] = S[r].T.map((l) => ({ d: l.d, n: +l.q.toFixed(6), e: 0, t: d, m: PF.m, w: PF.w }));
      }
      json += JSON.stringify(o).length; jsonT += JSON.stringify(oT).length;
    }
    const pv = {}, pvf = {}; for (const b of BANDS) { pv[b] = perVillage(b).per; pvf[b] = perVillage(b, true).per; }
    snaps[d] = { byRes, jsonD: json, jsonT, perVillage: pv, perVillageFood: pvf };
  }
  function write() {
    try {
      fs.writeFileSync(OUT, JSON.stringify({ seed: process.env.T577_SEED, days: process.env.T577_DAYS, dayReal: DAY_REAL,
        place: PF, eps: EPS, villages: shadow.length, food: Array.from(FOOD).sort(),
        cols: ['day', 'T', 'H', 'D', 'X', 'maxT', 'maxD', 'discard', 'usIn', 'usOut', 'usSweep', 'opsIn', 'opsOut', 'pops',
          'foodT', 'foodH', 'foodD', 'foodX', 'foodMaxT', 'foodMaxD', 'foodMaxX', 'foodDiscard'],
        rows, snaps, discardBy }));
    } catch (e) {}
  }
  let last = -1;
  const mk = Ev.createLedger;
  Ev.createLedger = function () {
    const L = mk.apply(this, arguments);
    const sd = L.scanDay;
    L.scanDay = function (world, day) {
      const r = sd.apply(this, arguments);
      try {
        const d = day | 0;
        if (d !== last) {
          last = d; W = world;
          install(world);
          sweepX(d + 1);                                  // 하루가 끝났다 — 이튿날 아침의 신선도로 본다
          const pvT = perVillage('T'), pvD = perVillage('D');
          const fT = perVillage('T', true), fH = perVillage('H', true), fD = perVillage('D', true), fX = perVillage('X', true);
          rows.push([d, cnt.T, cnt.H, cnt.D, cnt.X, pvT.max, pvD.max, +discardToday.toFixed(3),
            Math.round(ns.in / 1e3), Math.round(ns.out / 1e3), Math.round(ns.sweep / 1e3), ops.in, ops.out, ops.pops,
            fT.tot, fH.tot, fD.tot, fX.tot, fT.max, fD.max, fX.max, +discardFoodToday.toFixed(3)]);
          discardFoodToday = 0;
          discardToday = 0; ns.in = 0; ns.out = 0; ns.sweep = 0; ops.in = 0; ops.out = 0; ops.pops = 0;
          if (SNAP.has(d)) snapshot(d);
          if (d % 25 === 0 || d >= LASTDAY) write();
        }
      } catch (e) {}
      return r;
    };
    return L;
  };
  process.on('exit', write);   // 신호 처리는 안 건다(아이 존의 끝내는 길을 바꾸지 않는다) — 25일마다 · 끝날에 적는다
  return;
}

// ── 바깥(띄우는 쪽) ───────────────────────────────────────────────────────────
if (require.main === module) {
  const { spawnSync } = require('child_process');
  const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
  const seed = arg('--seed', '1020'), days = arg('--days', '400');
  const out = path.resolve(arg('--out', path.join('계측', `T716_곳간로트_${seed}.json`)));
  const env = Object.assign({}, process.env, {
    NODE_OPTIONS: ((process.env.NODE_OPTIONS || '') + ` --require ${__filename}`).trim(),
    T716_PROBE: '1', T716_OUT: out,
  });
  const base = path.resolve(arg('--base', path.join(__dirname, '..', '계측', '서버기준선_2026-10-13.json')));   // main 의 지금 기준선(PM 10-13 켬 기본 뒤)
  const r = spawnSync(process.execPath, [path.join(__dirname, 'server-baseline-check.js'), base,
    '--plan', `${seed}:${days}`], { env, stdio: 'inherit' });
  console.log(`\n  그림자 장부: ${out}`);
  process.exit(r.status == null ? 2 : r.status);
}
