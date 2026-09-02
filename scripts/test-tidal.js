#!/usr/bin/env node
// @regress   ← 통합 러너가 이 표를 보고 자기 목록을 만든다(scripts/run-regress.sh · 표 없으면 안 돈다)
// === scripts/test-tidal.js — 갯벌 채집(조개·해조) 서버 E2E ========================
//
// ★[재민 확정 2026-09-02 · T52] T3 자염이 연 갯벌을 **채집지로** 완성한다.
//
// ★★이 하네스가 지키는 계약 일곱:
//   ① **물때는 시각의 순수 함수** — 틱 0 · 주사위 0 · 같은 ms 면 언제나 같은 답
//   ② **자리가 종류를 정한다** — 해조밭/조개밭은 물때가 바뀌어도 안 변한다(아는 사람은 안다)
//   ③ **해안만** — 갯벌이 아닌 자리에선 아무것도 안 나온다(강가 대조군으로 증명)
//   ④ **econ 재화 id 그대로** — 새 품목 0(T3 소금 규약 동형) · 무게·로트를 우리가 안 붙인다
//   ⑤ **조개 ≤ 생선** — 생굴이 생선보다 빨리 상한다(카드가 정한 순서)
//   ⑥ **짠물이 먼저** — 병을 들고 갯벌에 서면 자염의 동선을 안 뺏는다
//   ⑦ **바닷물 우회 금지** — 갯벌이 열려도 T4 의 "짠물은 목을 축이지 않는다"는 그대로다
//
// ★족보 (57) 준수: 채집이 **실제로 일어났는지** 인벤 변화로 먼저 센다.
// ★족보 (76) 준수: 검사 자리가 그 코드를 **실제로 밟는지** 먼저 assert 한다.
//
// 실행: node scripts/test-tidal.js
'use strict';
const path = require('path');
const fs = require('fs');
const ROOT = path.join(__dirname, '..');

let pass = 0, fail = 0;
const ok = (c, m, extra) => { c ? pass++ : fail++; console.log((c ? '  ✓ ' : '  ✗ ') + m + (extra !== undefined ? `  ${extra}` : '')); };
const say = (m) => console.log(m);
const codeOnly = (src) => src.replace(/\/\*[\s\S]*?\*\//g, ' ').split('\n').map((l) => l.replace(/\/\/.*$/, '')).join('\n');

const TMP = `/tmp/test-tidal-${process.pid}.db`;
for (const f of [TMP, TMP + '-wal', TMP + '-shm']) { try { fs.unlinkSync(f); } catch (e) {} }
process.env.ZONE_ID = 'hanbando';
process.env.PORT = String(37900 + (process.pid % 180));
process.env.DB_PATH = TMP;
process.env.ENABLE_VILLAGES = '0';
process.env.ENABLE_WILDLIFE = '0'; process.env.ENABLE_BANDITS = '0'; process.env.ENABLE_ROADS = '0';

const _l = console.log, _w = console.warn, _e = console.error;
console.log = () => {}; console.warn = () => {}; console.error = () => {};
const Zone = require(path.join(ROOT, 'server', 'zone.js'));
console.log = _l; console.warn = _w; console.error = _e;
const H = Zone.__testBind();
const Tidal = require(path.join(ROOT, 'server', 'tidal.js'));
const Forage = H.Forage, Salt = H.Salt, Lots = H.Lots, Spoil = H.Spoil, W = H.Weights;
const Specialty = require(path.join(ROOT, 'server', 'specialty.js'));

let _pid = 0;
function mkPlayer(name, x, y) {
  const msgs = [];
  const ws = { readyState: 1, send: (s) => { try { msgs.push(JSON.parse(s)); } catch (e) {} } };
  const p = { pid: 'p_' + (++_pid), playerId: 't52_' + name + '_' + _pid, name, persistent: false,
    x: x || 5000, y: y || 5000, floor: 0, hp: 100, maxHp: 100, hunger: 50, thirst: 100,
    inventory: {}, toolItems: [], equipment: [], equipSlots: {}, craftSkill: {},
    oreLedger: {}, oreCarry: {}, dishes: [], lots: {}, ws, isNpc: false, isDown: false, vx: 0, vy: 0 };
  p.__last = () => { const n = msgs.filter((m) => m.type === 'notice'); return n.length ? n[n.length - 1].text : ''; };
  return p;
}

(async () => {
  say('\n=== 갯벌 채집 — 조개·해조 (T52) ===');

  // ── ① 물때 — 시각의 순수 함수 ───────────────────────────────────────────
  say('\n① 물때 — 틱 0 · 주사위 0');
  {
    const P = Tidal.CFG.PERIOD_MS;
    ok(P > 60000, '★반일주조 주기(고증 M2 12시간 25분)', `${(P / 60000).toFixed(4)}분`);
    // 결정론 — 같은 ms 를 200번 물어도 같다
    let same = true; const a0 = Tidal.isOpen(123456), l0 = Tidal.levelAt(123456);
    for (let i = 0; i < 200; i++) { if (Tidal.isOpen(123456) !== a0 || Tidal.levelAt(123456) !== l0) { same = false; break; } }
    ok(same, '★★같은 시각을 200번 물어도 **같은 답**(주사위 0)', `open=${a0} level=${l0.toFixed(4)}`);
    // 열림 비율이 손잡이대로인가 — 그리고 **닫히는 때가 실제로 있다**(자명 통과 금지)
    let open = 0; const N = 4000;
    for (let i = 0; i < N; i++) if (Tidal.isOpen(i * (P / N))) open++;
    const frac = open / N;
    ok(Math.abs(frac - Tidal.CFG.OPEN_FRAC) < 0.02, '★열려 있는 시간이 손잡이대로다',
      `${(frac * 100).toFixed(1)}% vs ${(Tidal.CFG.OPEN_FRAC * 100).toFixed(0)}%`);
    ok(open > 0 && open < N, '★★자명 통과 금지 — **닫히는 때가 실제로 있다**', `${open}/${N}`);
    // 수위는 연속(절벽 없음) — "속은 연속, 겉은 계단"
    let maxJump = 0;
    for (let i = 1; i < 2000; i++) maxJump = Math.max(maxJump, Math.abs(Tidal.levelAt(i * P / 2000) - Tidal.levelAt((i - 1) * P / 2000)));
    ok(maxJump < 0.01, '★수위는 **연속**이다(겉만 계단)', `최대 낙차 ${maxJump.toFixed(5)}`);
    ok(Tidal.untilOpenMs(P / 2) > 0 && Tidal.untilOpenMs(0) === 0,
      '★"다음 썰물까지"가 지금 열려 있으면 0, 만조면 양수', `${(Tidal.untilOpenMs(P / 2) / 60000).toFixed(2)}분`);
    // 소스에 틱이 없다 — setInterval/표 갱신 금지
    const src = codeOnly(fs.readFileSync(path.join(ROOT, 'server', 'tidal.js'), 'utf8'));
    ok(!/setInterval|setTimeout/.test(src), '★★`tidal.js` 에 **틱이 없다**(조회할 때 닫힌 해로 푼다)');
    ok(!/Math\.random/.test(src), '★★`tidal.js` 에 **주사위가 없다**');
  }

  // ── ② 자리가 종류를 정한다 ──────────────────────────────────────────────
  say('\n② 자리 × 물때 — 무엇이 잡히나');
  {
    const P = Tidal.CFG.PERIOD_MS;
    // 간조 시각 여럿에서, 같은 자리의 **해조/조개 성질이 안 변한다**
    const cell = [1234 * 32 + 16, 77 * 32 + 16];
    const kinds = [0, P, P * 2, P * 3, P * 7].map((t) => Tidal.pickAt(cell[0], cell[1], t));
    const weedy = kinds.map((k) => k === 'seaweed');
    ok(weedy.every((v) => v === weedy[0]), '★★해조밭이냐 조개밭이냐는 **자리의 성질**이다(물때가 바뀌어도 안 변한다)',
      kinds.join(' '));
    // 그런데 조개밭 안에서 굴/전복은 **물때마다 갈린다**(그게 "오늘 운이 좋았다")
    let flips = 0, tried = 0;
    for (let cx = 0; cx < 400; cx++) {
      const x = cx * 32 + 16, y = 55 * 32 + 16;
      if (Tidal.pickAt(x, y, 0) === 'seaweed') continue;
      tried++;
      if (Tidal.pickAt(x, y, 0) !== Tidal.pickAt(x, y, P * 13)) flips++;
    }
    ok(tried > 50, '(전제) 조개밭 표본이 충분하다', `${tried}곳`);
    ok(flips > 0, '★★같은 조개밭도 **물때가 다르면 나오는 게 다르다**', `${flips}/${tried}곳이 갈렸다`);
    // 분포가 손잡이대로 — 그리고 세 종이 **다 나온다**(자명 통과 금지)
    const cnt = {};
    for (let cx = 0; cx < 300; cx++) for (let cy = 0; cy < 40; cy++) {
      const k = Tidal.pickAt(cx * 32 + 16, cy * 32 + 16, 0); cnt[k] = (cnt[k] || 0) + 1;
    }
    ok(cnt.seaweed > 0 && cnt.oyster > 0 && cnt.abalone > 0, '★★세 종이 **다 나온다**', JSON.stringify(cnt));
    const tot = cnt.seaweed + cnt.oyster + cnt.abalone;
    ok(Math.abs(cnt.seaweed / tot - Tidal.CFG.WEED_FRAC) < 0.06, '★해조밭 비율이 손잡이 근처',
      `${(cnt.seaweed / tot * 100).toFixed(1)}% vs ${(Tidal.CFG.WEED_FRAC * 100).toFixed(0)}%`);
    ok(cnt.abalone / (cnt.abalone + cnt.oyster) < Tidal.CFG.RARE_FRAC * 2.5, '★전복은 **드물다**',
      `조개밭의 ${(cnt.abalone / (cnt.abalone + cnt.oyster) * 100).toFixed(1)}%`);
    // 물이 차면 아무것도 안 나온다
    ok(Tidal.pickAt(cell[0], cell[1], P / 2) === null, '★★물이 차 있으면 **갯벌이 닫힌다**');
  }

  // ── ③ 산출은 econ 재화 그대로 — 새 품목 0 ───────────────────────────────
  say('\n③ 새 품목을 만들지 않았다 (T3 소금 규약 동형)');
  {
    for (const k of Object.keys(Tidal.CATCH)) {
      const sp = Specialty.RESOURCES[k];
      ok(!!sp, `★\`${k}\` 는 **econ 재화로 이미 있다**(우리가 만든 게 아니다)`, sp && `baseValue ${sp.baseValue} · ${sp.category}`);
      ok(W.kgOf(k) === (sp && sp.weight), `★무게도 econ 정본 그대로 — ${Tidal.koOf(k)}`, `${W.kgOf(k)}kg`);
      ok(Lots.isLot(k), `★로트가 **이미 붙어 있었다**(marine) — ${Tidal.koOf(k)}`);
    }
    // 무게표에 우리가 옮겨 적지 않았다
    const wsrc = codeOnly(fs.readFileSync(path.join(ROOT, 'server', 'weights.js'), 'utf8'));
    ok(!/oyster|seaweed|abalone/.test(wsrc), '★★`weights.js` 에 갯벌 품목이 **없다**(사본 0 — econ 이 정본이다)');
  }

  // ── ④ 보관일 — 조개 ≤ 생선 ─────────────────────────────────────────────
  say('\n④ 신선도 — 조개는 생선보다 빨리 상한다');
  {
    const fish = Spoil.shelfOf('fish');
    ok(Spoil.shelfOf('oyster') <= fish, '★★굴 ≤ 생선', `${Spoil.shelfOf('oyster')} ≤ ${fish}`);
    ok(Spoil.shelfOf('abalone') <= fish, '★전복 ≤ 생선', `${Spoil.shelfOf('abalone')} ≤ ${fish}`);
    ok(Spoil.shelfOf('seaweed') > fish, '★해조는 채소급이라 더 간다', `${Spoil.shelfOf('seaweed')} > ${fish}`);
    ok(Spoil.shelfOf('oyster') === Tidal.CATCH.oyster.shelf, '★★보관일의 정본은 `tidal.js` 하나(spoil 이 읽어 간다)');
    const ssrc = codeOnly(fs.readFileSync(path.join(ROOT, 'server', 'spoil.js'), 'utf8'));
    ok(!/oyster:\s*[\d.]/.test(ssrc), '★`spoil.js` 가 갯벌 보관일을 **옮겨 적지 않았다**');
  }

  // ── ⑤ 실행 — 갯벌에서 실제로 캐지는가 ───────────────────────────────────
  say('\n⑤ 실행 — 진짜 갯벌에서 진짜로 캔다');
  {
    // 갯벌 한 칸을 **찾는다**(고르지 않고 잰다 — 족보 (73))
    const Z = H.ZONE;
    let flat = null;
    outer:
    for (let ty = 0; ty < 4000 && !flat; ty += 7) {
      for (let tx = 0; tx < 2200; tx += 7) {
        const x = tx * 32 + 16, y = ty * 32 + 16;
        if (!H.isSeaTileLocal(x, y) && Salt.isTidalFlat(x, y, { isSea: (a, b) => H.isSeaTileLocal(a, b) })) { flat = [x, y]; break outer; }
      }
    }
    ok(!!flat, '(상황) 지도에서 갯벌 한 칸을 찾았다', flat ? `(${flat[0]},${flat[1]})` : '못 찾음');
    void Z;
    if (flat) {
      const ctxOf = (p) => H._forageCtx(p);
      // ⓐ 병이 있으면 **짠물이 먼저**(자염 동선 보존)
      const pv = mkPlayer('vessel', flat[0], flat[1]); pv.inventory[Salt.VESSEL] = 2;
      const s1 = Forage.sourceAt(flat[0], flat[1], ctxOf(pv));
      ok(s1 && s1.kind === Salt.BRINE, '★★병을 들고 서면 **짠물이 먼저다**(자염의 동선을 안 뺏는다)', s1 && s1.kind);
      // ⓐ-2 ★★**입력 경로가 그 갈래에 도달하는가** — `sourceAt` 에 넣는 것과 도달하는 것은 다른 명제다.
      //   실클라 하네스가 잡은 함정: 바다 게이트가 "병이 있나"라 **병 없는 사람은 채집에 못 닿았다**.
      Tidal.__setNow(0);
      const pg = mkPlayer('gate', flat[0], flat[1]);
      ok(!!Forage.seaSourceAt(flat[0], flat[1], ctxOf(pg)), '★★★병이 **없어도** 바다 게이트가 열린다(갯벌 채집에 도달한다)');
      ok(!!Forage.seaSourceAt(flat[0], flat[1], ctxOf(pv)), '★병이 있으면 그 게이트는 짠물로 열린다');
      Tidal.__setNow(Tidal.CFG.PERIOD_MS / 2);
      ok(!Forage.seaSourceAt(flat[0], flat[1], ctxOf(pg)), '★★만조 + 병 없음이면 게이트가 **안 열린다**(종전 `drinkBrine` 안내가 산다)');
      // ★그리고 게이트는 **바다 것만** 센다 — 갈대·자갈이 새어 들어오면 바닷가 안내를 덮는다
      const sAll = Forage.sourceAt(flat[0], flat[1], ctxOf(pg));
      ok(!sAll || !Forage.seaSourceAt(flat[0], flat[1], ctxOf(pg)),
        '★★게이트가 **갈대·자갈을 안 센다**(종전 동작을 안 뺏는다)', sAll ? `sourceAt=${sAll.kind} · seaSourceAt=null` : '둘 다 null');
      Tidal.__setNow(null);
      // ⓑ 병이 없으면 갯벌 채집 — 열린 물때에서만
      //   ★★**시각을 못 박는다.** 안 그러면 "돌린 순간이 썰물일 때만 통과하는 검사"가 된다 —
      //     그건 자명 통과다(족보 (56)). 열림/닫힘 **두 상태를 다** 밟는다.
      ok(Tidal.__nowOverride() === null, '★★시험 손잡이는 **기본이 꺼져 있다**(운영 경로가 안 쓴다)');
      Tidal.__setNow(0);   // 간조 — 갯벌이 드러난 순간
      const pb = mkPlayer('bare', flat[0], flat[1]);
      const openNow = Tidal.isOpen();
      const s2 = Forage.sourceAt(flat[0], flat[1], ctxOf(pb));
      ok(openNow, '(전제) 시각을 **간조로 못 박았다**');
      if (openNow) {
        ok(!!s2 && Tidal.isCatch(s2.kind), '★★병 없이 서면 **갯벌 채집**이 열린다', s2 && `${s2.kind} @ ${s2.where}`);
        ok(!!s2 && /^t:/.test(String(s2.key)), '★고갈 키가 셀에 붙는다(조개밭은 마른다 — 짠물과 다르다)', s2 && s2.key);
        // 실제로 캐진다 — 인벤이 는다(족보 (57))
        const before = JSON.stringify(pb.inventory);
        H.tryForage(pb);
        ok(JSON.stringify(pb.inventory) !== before, '★★진짜로 캐진다 — 인벤이 늘었다', `${before} → ${JSON.stringify(pb.inventory)}`);
        const got = Object.keys(pb.inventory).find((k) => Tidal.isCatch(k));
        ok(!!got, '★★손에 온 것이 **갯벌 산출**이다', got && `${Tidal.koOf(got)}(${got})`);
        if (got) {
          Lots.reconcile(pb, got, pb.inventory, H.zoneGameDay());
          ok(Lots.sum(pb, got) > 0, '★★로트가 **저절로** 붙는다(marine — 우리가 안 붙였다)', `${Lots.sum(pb, got)}단위`);
          ok(!!H.FOOD_EFFECTS[got], '★★먹을 수 있다(주입된 포만감)', JSON.stringify(H.FOOD_EFFECTS[got]));
          ok(!/^[a-z_]+$/.test(H.ITEM_LABEL_SERVER[got] || got), '★★한글 이름표가 붙었다(영문 키가 안 뜬다)', H.ITEM_LABEL_SERVER[got]);
        }
        // ⓒ 고갈 — 한 자리를 훑으면 그 자리만 마른다(반독점)
        const pc = mkPlayer('dry', flat[0], flat[1]);
        let n = 0;
        for (let i = 0; i < 12; i++) { pc._forageAt = 0; const b = JSON.stringify(pc.inventory); H.tryForage(pc); if (JSON.stringify(pc.inventory) !== b) n++; }
        ok(n >= 1 && n <= Forage.CFG.CAP, '★★한 자리는 **마른다**(개체별 lazy 고갈 · 반독점)', `12번 시도에 ${n}번 성공(상한 ${Forage.CFG.CAP})`);
      }
      // ⓑ-2 **닫힌 물때** — 같은 자리에서 갯벌이 닫히고 종전 갈래로 떨어진다(대조군)
      Tidal.__setNow(Tidal.CFG.PERIOD_MS / 2);   // 만조
      ok(!Tidal.isOpen(), '(전제) 이번엔 **만조로 못 박았다**');
      const pf = mkPlayer('flood', flat[0], flat[1]);
      const s3 = Forage.sourceAt(flat[0], flat[1], ctxOf(pf));
      ok(!s3 || !Tidal.isCatch(s3.kind), '★★★물이 차면 **같은 자리에서 아무것도 안 캐진다**(대조군 — 자리가 아니라 물때가 갈랐다)',
        s3 ? `${s3.kind} @ ${s3.where}` : 'null');
      pf._forageAt = 0; const bF = JSON.stringify(pf.inventory); H.tryForage(pf);
      const gotFlood = Object.keys(pf.inventory).some((k) => Tidal.isCatch(k));
      ok(!gotFlood, '★★그리고 실제로 캐도 **갯벌 산출이 안 들어온다**', `${bF} → ${JSON.stringify(pf.inventory)}`);
      Tidal.__setNow(null);   // ★반드시 되돌린다 — 뒤 절이 이 값을 물려받으면 그게 오염이다
      // ⓓ ★해안만 — 강가 대조군에서는 절대 안 나온다(족보 (55): 통계로 주장하면 반례를 붙여라)
      let river = null;
      for (let ty = 0; ty < 4000 && !river; ty += 11) {
        for (let tx = 0; tx < 2200; tx += 11) {
          const x = tx * 32 + 16, y = ty * 32 + 16;
          if (H.isWaterTileLocal(x, y) && !H.isSeaTileLocal(x, y)) { river = [x + 32, y]; break; }
        }
      }
      ok(!!river, '(대조군) 강·호수 물가 한 칸을 찾았다', river ? `(${river[0]},${river[1]})` : '못 찾음');
      if (river) {
        // ★★대조군도 **간조로 못 박는다.** 안 그러면 "그때 마침 물이 차 있어서" 통과한 게 되고,
        //   갯벌 판정을 통째로 빼도 초록이 뜬다 — 개발 중 돌연변이 검사가 실제로 그 구멍을 잡았다.
        Tidal.__setNow(0);
        ok(Tidal.isOpen(), '(전제) 대조군도 **간조**다 — 물이 차서 통과하는 게 아니다');
        const pr = mkPlayer('river', river[0], river[1]);
        const sr = Forage.sourceAt(river[0], river[1], ctxOf(pr));
        ok(!sr || !Tidal.isCatch(sr.kind), '★★★민물가에서는 **굴이 안 나온다** — 갯벌은 바다에 접한 뭍만이다',
          sr ? `${sr.kind} @ ${sr.where}` : 'null');
        // 그리고 **들판 한복판**에서도 안 나온다(바다 근처가 아니면 갈래가 아예 없다)
        const far = [river[0] + 4000, river[1] + 4000];
        const pl = mkPlayer('land', far[0], far[1]);
        const sl = Forage.sourceAt(far[0], far[1], ctxOf(pl));
        ok(!sl || !Tidal.isCatch(sl.kind), '★★들판에서도 안 나온다', sl ? `${sl.kind} @ ${sl.where}` : 'null');
        Tidal.__setNow(null);
      }
    }
  }

  // ── ⑥ 조리 — 기존 요리 문법에 그대로 얹혔나 ─────────────────────────────
  say('\n⑥ 조리 — 새 문법 0');
  {
    for (const [k, r] of Object.entries(Tidal.cookMap())) {
      ok(!!H.COOK_RECIPES[k], `★\`${k}\` 가 요리 표에 있다 — ${r.label}`);
      ok(!('produces' in r), `★★\`produces\` 를 **안 적었다** — \`doCook\` 이 그 필드를 안 읽는다(족보 (83))`);
      for (const it of Object.keys(r.cost)) ok(Tidal.isCatch(it), `★재료가 갯벌 산출이다 — ${Tidal.koOf(it)}`);
    }
    // 조리 표를 zone 이 다시 나열하지 않았다
    const zsrc = codeOnly(fs.readFileSync(path.join(ROOT, 'server', 'zone.js'), 'utf8'));
    ok(!/clam_stew|seaweed_soup/.test(zsrc), '★★zone 이 조리 두 종을 **옮겨 적지 않았다**(정본이 주입한다)');
    const inj = (zsrc.match(/require\('\.\/tidal'\)\.install/g) || []).length;
    const gate = (zsrc.match(/Forage\.seaSourceAt\(/g) || []).length;
    ok(inj === 1 && gate === 1, '★★★zone.js 접점이 **정확히 둘**이다 — 주입 한 줄 + 바다 게이트 한 줄(치환)',
      `install ${inj} · gate ${gate}`);
    ok(!/\bTidal\b/.test(zsrc.replace(/require\('\.\/tidal'\)/g, '')), '★★zone 이 갯벌 정본을 **모듈로 안 들고 있다**(한 줄에서만 부른다)');
  }

  // ── ⑦ 바닷물 우회 금지 — T4 의 술어가 살아 있다 ─────────────────────────
  say('\n⑦ 갯벌이 열려도 바닷물은 여전히 목을 안 축인다');
  {
    const zsrc = fs.readFileSync(path.join(ROOT, 'server', 'zone.js'), 'utf8');
    ok(/isSeaTileLocal\([^)]*\)\s*\)\s*\{\s*\n\s*Body\.drinkBrine/.test(zsrc) || /Body\.drinkBrine\(player/.test(zsrc),
      '★★T4 의 `drinkBrine` 갈래가 그대로 있다');
    const b = require(path.join(ROOT, 'server', 'body.js'));
    const p = mkPlayer('brine'); p.thirst = 50;
    const t0 = p.thirst; b.drinkBrine(p, Date.now());
    ok(p.thirst <= t0, '★★바닷물을 마셔도 갈증이 **안 회복된다**', `${t0} → ${p.thirst}`);
    ok(!H.FOOD_EFFECTS[Salt.BRINE], '★★★짠물은 **먹을 수 없다** — 병에 담아 마시는 우회로가 없다',
      H.FOOD_EFFECTS[Salt.BRINE] ? JSON.stringify(H.FOOD_EFFECTS[Salt.BRINE]) : '없음');
  }

  say(`\n=== ${pass + fail}건 중 PASS ${pass} · FAIL ${fail} ===\n`);
  for (const f of [TMP, TMP + '-wal', TMP + '-shm']) { try { fs.unlinkSync(f); } catch (e) {} }
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
