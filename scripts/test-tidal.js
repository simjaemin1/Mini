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
// ★★[T54 2026-09-02] 계약 셋이 더 붙었다:
//   ⑧ **민물 채수는 민물에서만** — 병이 있어야 열리고, 갯벌에선 여전히 짠물이 먼저다
//   ⑨ **병은 그릇이다** — 담기·마시기를 왕복해도 병 개수와 무게가 보존된다
//   ⑩ **말리기** — 건굴·마른 미역이 건조대 창에 저절로 뜨고, 효과·무게는 원물에서 유도된다
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
    // ★[T54] 접점이 셋 늘었다(용기 게이트 술어 · `driedEffects` 주입 · `returns` 읽기) ⇒ **다섯**.
    //   카드의 예산(T54 는 3줄)을 하네스가 지킨다 — 넷째 줄이 생기면 여기가 빨개진다.
    const vg = (zsrc.match(/require\('\.\/tidal'\)\.usesVessel/g) || []).length;
    const de = (zsrc.match(/require\('\.\/tidal'\)\.driedEffects/g) || []).length;
    const rt = zsrc.split('\n').filter((l) => /eff\.returns/.test(l)).length;   // ★줄 수로 센다(한 줄 안의 반복은 한 접점이다)
    ok(inj === 1 && gate === 1, '★★★T52 접점이 **정확히 둘**이다 — 주입 한 줄 + 바다 게이트 한 줄(치환)',
      `install ${inj} · gate ${gate}`);
    ok(vg === 1 && de === 1 && rt === 1, '★★★T54 접점이 **정확히 셋**이다 — 용기 술어 · 말린 것 효과 주입 · `returns` 읽기',
      `usesVessel ${vg}줄 · driedEffects ${de}줄 · eff.returns ${rt}줄`);
    // ★[T99 2026-09-05 · CI regress-unit 이 잡았다] 기대값 **3 → 4**.
    //   넷째는 **T58b(`035566db`)의 플레이어 물대기**다: `_cropTend` 가 물 한 되를 셀 때
    //   `require('./tidal').FRESH` 를 읽는다(`server/zone.js` — 민물 품목 이름을 zone 이 옮겨 적지
    //   않으려고 정본에게 물은 것이다 · T54 그릇 규약과 같은 결). 예산이 늘어난 게 아니라
    //   **정본을 한 번 더 부른 것**이라 옳은 방향이고, 그래서 수를 낮추는 게 아니라 올린다.
    //   ⚠다섯째가 생기면 여기가 다시 빨개진다 — 그게 이 검사가 있는 이유다(zone 예산 감시).
    const tidalRefs = (zsrc.match(/require\('\.\/tidal'\)/g) || []).length;
    ok(tidalRefs === 4, '★zone 이 갯벌 정본을 부르는 자리는 **넷뿐**이다(주입 · 용기 술어 · 말린 것 효과 · 민물 이름)', `${tidalRefs}곳`);
    ok(!/\bTidal\b/.test(zsrc.replace(/require\('\.\/tidal'\)/g, '')), '★★zone 이 갯벌 정본을 **모듈로 안 들고 있다**(한 줄에서만 부른다)');
  }

  // ══════════════════════════════════════════════════════════════════════════
  //  T54 — 용기 일반화(민물 휴대) + 말리기 (2026-09-02)
  // ══════════════════════════════════════════════════════════════════════════

  // ── ⑧ 민물 채수 — **민물에서만** ────────────────────────────────────────
  say('\n⑧ 민물 채수 — 병이 있어야 열리고, 민물에서만 열린다');
  {
    const ctxOf = (p) => H._forageCtx(p);
    // 자리는 **고르지 않고 잰다**(족보 (73)) — 강·호수 물가 한 칸.
    let river = null;
    for (let ty = 0; ty < 4000 && !river; ty += 11) {
      for (let tx = 0; tx < 2200; tx += 11) {
        const x = tx * 32 + 16, y = ty * 32 + 16;
        if (H.isWaterTileLocal(x, y) && !H.isSeaTileLocal(x, y)) { river = [x + 32, y]; break; }
      }
    }
    ok(!!river, '(상황) 강·호수 물가 한 칸을 찾았다', river ? `(${river[0]},${river[1]})` : '못 찾음');
    // 갯벌 한 칸도(대조군) — 여기선 **짠물이 먼저**여야 한다
    let flat = null;
    outer2:
    for (let ty = 0; ty < 4000 && !flat; ty += 7) {
      for (let tx = 0; tx < 2200; tx += 7) {
        const x = tx * 32 + 16, y = ty * 32 + 16;
        if (!H.isSeaTileLocal(x, y) && Salt.isTidalFlat(x, y, { isSea: (a, b) => H.isSeaTileLocal(a, b) })) { flat = [x, y]; break outer2; }
      }
    }
    if (river) {
      // ★★물때를 **두 상태 다** 못 박는다(족보 (95) — 벽시계에 기댄 판정은 대조군에서도 자명 통과한다).
      for (const [tag, t] of [['간조', 0], ['만조', Tidal.CFG.PERIOD_MS / 2]]) {
        Tidal.__setNow(t);
        const pv = mkPlayer('fw_' + tag, river[0], river[1]); pv.inventory[Salt.VESSEL] = 2;
        const s = Forage.sourceAt(river[0], river[1], ctxOf(pv));
        ok(!!s && s.kind === Tidal.FRESH, `★★민물가 + 병 ⇒ **채수**가 열린다 (${tag}에도 물때와 무관)`, s && s.kind);
        ok(!!s && s.key === null, '★강은 마르지 않는다(고갈 키 없음 — 짠물과 같은 문법)', s && String(s.key));
      }
      Tidal.__setNow(null);
      // ★★**갈대를 뺏지 않는다** — 병이 없으면 종전 그대로다.
      const pn = mkPlayer('fw_bare', river[0], river[1]);
      const sn = Forage.sourceAt(river[0], river[1], ctxOf(pn));
      ok(!!sn && sn.kind === 'fiber', '★★★병이 **없으면** 종전대로 갈대다(기존 동작 무손실)', sn && sn.kind);
      // ★★그리고 병을 다 채우면 **스스로 닫힌다** — 그 다음 E 는 다시 갈대다.
      const pe = mkPlayer('fw_empty', river[0], river[1]); pe.inventory[Salt.VESSEL] = 1;
      pe._forageAt = 0; H.tryForage(pe);
      const sAfter = Forage.sourceAt(river[0], river[1], ctxOf(pe));
      ok(Math.floor(pe.inventory[Salt.VESSEL] || 0) === 0 && !!sAfter && sAfter.kind === 'fiber',
        '★★★병을 다 채우면 채수 갈래가 **스스로 닫힌다**(갈대가 돌아온다)',
        `병 ${Math.floor(pe.inventory[Salt.VESSEL] || 0)} · 다음 ${sAfter && sAfter.kind}`);
      // ★★들판 대조군 — 물가가 아니면 병이 있어도 안 열린다
      const far = [river[0] + 4000, river[1] + 4000];
      const pl = mkPlayer('fw_land', far[0], far[1]); pl.inventory[Salt.VESSEL] = 2;
      const sl = Forage.sourceAt(far[0], far[1], ctxOf(pl));
      ok(!sl || sl.kind !== Tidal.FRESH, '★★들판에서는 병이 있어도 **물이 안 나온다**', sl ? sl.kind : 'null');
    }
    if (flat) {
      // ★★★**바다 대조군** — 갯벌에서 병을 들면 여전히 **짠물**이다(민물이 새어 들면 세계가 거짓말을 한다).
      Tidal.__setNow(0);
      const ps = mkPlayer('fw_sea', flat[0], flat[1]); ps.inventory[Salt.VESSEL] = 2;
      const ss = Forage.sourceAt(flat[0], flat[1], ctxOf(ps));
      ok(!!ss && ss.kind === Salt.BRINE, '★★★갯벌에서는 여전히 **짠물**이다(민물이 바다를 안 덮는다)', ss && ss.kind);
      Tidal.__setNow(null);
    }
    // ★계약 — 마신 한 되의 회복량이 `zone.tryGather` 의 물가 회복량과 **같은 수**인가.
    //   (zone 안의 리터럴이라 참조할 수가 없다 ⇒ 소스를 읽어 묶는다. 갈라지면 여기서 빨개진다.)
    const zsrc0 = fs.readFileSync(path.join(ROOT, 'server', 'zone.js'), 'utf8');
    const m30 = /player\.thirst\s*=\s*Math\.min\(100,\s*before\s*\+\s*(\d+)\)/.exec(zsrc0);
    ok(!!m30 && Number(m30[1]) === Tidal.DRINK_THIRST,
      '★★★한 되의 갈증 회복이 **물가에서 마시는 그 수**와 같다(사본 아님 · 계약 검사)',
      m30 ? `zone ${m30[1]} vs tidal ${Tidal.DRINK_THIRST}` : 'zone 리터럴을 못 찾음');
  }

  // ── ⑨ 병은 그릇이다 — 개수 보존 ─────────────────────────────────────────
  say('\n⑨ 병은 그릇이지 소모품이 아니다 — 왕복해도 개수가 보존된다');
  {
    const ctxOf = (p) => H._forageCtx(p);
    let river = null;
    for (let ty = 0; ty < 4000 && !river; ty += 11) {
      for (let tx = 0; tx < 2200; tx += 11) {
        const x = tx * 32 + 16, y = ty * 32 + 16;
        if (H.isWaterTileLocal(x, y) && !H.isSeaTileLocal(x, y)) { river = [x + 32, y]; break; }
      }
    }
    if (river) {
      const p = mkPlayer('vessel_rt', river[0], river[1]);
      p.inventory[Salt.VESSEL] = 3; p.thirst = 40;
      const kg0 = H.Carry.totalKg(p);
      // ⓐ 담기 — 병 −1, 물 +1
      p._forageAt = 0; H.tryForage(p);
      const v1 = Math.floor(p.inventory[Salt.VESSEL] || 0), w1 = Math.floor(p.inventory[Tidal.FRESH] || 0);
      ok(v1 === 2 && w1 === 1, '★★담으면 **병이 물이 된다**(병 −1 · 물 +1)', `병 ${v1} · 물 ${w1}`);
      ok(Math.abs(H.Carry.totalKg(p) - kg0) < 1e-6, '★★★무게가 **안 변한다** — 한 되는 병과 같은 1.00kg(T3 규약)',
        `${kg0.toFixed(3)}kg → ${H.Carry.totalKg(p).toFixed(3)}kg`);
      // ⓑ 마시기 — 물 −1, 병 +1, 갈증 회복
      const th0 = p.thirst;
      H.doEat(p, Tidal.FRESH, 1);
      const v2 = Math.floor(p.inventory[Salt.VESSEL] || 0), w2 = Math.floor(p.inventory[Tidal.FRESH] || 0);
      ok(w2 === 0 && v2 === 3, '★★★마시면 **빈 병이 돌아온다**(물 −1 · 병 +1) — 병은 소모품이 아니다', `병 ${v2} · 물 ${w2}`);
      ok(p.thirst > th0, '★★그리고 갈증이 **실제로** 찬다', `${th0} → ${Math.round(p.thirst)}`);
      ok(Math.abs(p.thirst - Math.min(100, th0 + Tidal.DRINK_THIRST)) < 1e-6,
        '★회복량이 정본 그대로다', `+${Tidal.DRINK_THIRST}`);
      ok(Math.abs(H.Carry.totalKg(p) - kg0) < 1e-6, '★★왕복 뒤에도 무게가 그대로다', `${H.Carry.totalKg(p).toFixed(3)}kg`);
      // ⓒ ★들판에서 마신다 — 물가가 아니어도 된다(이 배치가 연 것이 바로 그것이다)
      const pf = mkPlayer('vessel_field', river[0] + 4000, river[1] + 4000);
      pf.inventory[Tidal.FRESH] = 2; pf.thirst = 10;
      const tf0 = pf.thirst; H.doEat(pf, Tidal.FRESH, 1);
      ok(pf.thirst > tf0 && Math.floor(pf.inventory[Salt.VESSEL] || 0) === 1,
        '★★★**들판 한복판에서 마신다** — 물을 들고 다닐 수 있게 됐다', `갈증 ${tf0} → ${Math.round(pf.thirst)} · 빈 병 1`);
      // ⓓ ★★짠물 우회는 여전히 없다 — 병에 담은 바닷물은 못 마신다
      ok(!H.FOOD_EFFECTS[Salt.BRINE], '★★★짠물은 **여전히 못 먹는다**(T4 우회로 금지)',
        H.FOOD_EFFECTS[Salt.BRINE] ? JSON.stringify(H.FOOD_EFFECTS[Salt.BRINE]) : '없음');
      const pb2 = mkPlayer('brine_eat'); pb2.inventory[Salt.BRINE] = 2; pb2.thirst = 30;
      const tb0 = pb2.thirst; H.doEat(pb2, Salt.BRINE, 1);
      ok(pb2.thirst === tb0 && Math.floor(pb2.inventory[Salt.BRINE]) === 2,
        '★★★짠물을 **먹으려 해도 아무 일도 안 일어난다**(갈증 그대로 · 재고 그대로)',
        `갈증 ${tb0} → ${pb2.thirst} · 짠물 ${Math.floor(pb2.inventory[Salt.BRINE])}`);
      // ⓔ 물은 **안 썩는다**(로트가 아니다)
      ok(!Lots.isLot(Tidal.FRESH), '★민물 한 되는 로트가 아니다(물은 안 썩는다)');
      ok(W.kgOf(Tidal.FRESH) === W.kgOf(Salt.VESSEL) && W.kgOf(Tidal.FRESH) === W.kgOf(Salt.BRINE),
        '★★셋의 무게가 같다 — 병 = 짠물 = 민물', `${W.kgOf(Tidal.FRESH)}kg`);
    }
  }

  // ── ⑩ 말리기 — 갯벌이 겨울까지 간다 ─────────────────────────────────────
  say('\n⑩ 말리기 — 건굴·마른 미역');
  {
    // ⓐ 표에 저절로 올라왔나(새 문법 0)
    const dry = Object.entries(Spoil.PRESERVE).filter(([k, r]) => r.kind === 'dry').map(([k]) => k);
    ok(dry.includes('dry_oyster') && dry.includes('dry_seaweed'), '★말리기 두 종이 **건조대 갈래**에 들었다', dry.join(' · '));
    for (const k of ['dry_oyster', 'dry_seaweed']) {
      const r = Spoil.PRESERVE[k];
      ok(Tidal.isCatch(r.from), `★${r.label} 의 재료가 **갯벌 산출**이다`, `${Tidal.koOf(r.from)}(${r.from})`);
      ok(!!Spoil.PRESERVED_ITEMS[r.out], `★산출이 보존식 표에 있다 — ${r.out}`, Spoil.PRESERVED_ITEMS[r.out] && Spoil.PRESERVED_ITEMS[r.out].ko);
      ok(Lots.isLot(r.out), '★보존식도 **로트다**(오래 가지만 영원하진 않다)');
    }
    // ⓑ 보관일 순서 — 원물 < 건조품, 그리고 표의 같은 자리에서 왔다
    ok(Spoil.shelfOf('dried_oyster') > Spoil.shelfOf('oyster'), '★★말리면 **오래 간다** — 굴 2 → 건굴 45',
      `${Spoil.shelfOf('oyster')} → ${Spoil.shelfOf('dried_oyster')}`);
    ok(Spoil.shelfOf('dried_seaweed') > Spoil.shelfOf('seaweed'), '★★해조 6 → 마른 미역 180(곡물급 · 유도값)',
      `${Spoil.shelfOf('seaweed')} → ${Spoil.shelfOf('dried_seaweed')}`);
    ok(Spoil.shelfOf('dried_oyster') === Spoil.shelfOf('dried_fish'), '★★건굴은 **건어물과 같은 자리**다(새 상수 0)',
      `${Spoil.shelfOf('dried_oyster')}일`);
    // ⓒ ★★효과는 **원물에서 유도**됐다 — 새 계수를 안 지었다
    //   ⚠[T59 2026-09-03] 허기 판정이 바뀌었다 — **뜻은 그대로, 근거만 더 깊어졌다.**
    //     T54 는 "원물 허기 × 말리기 배수(역산 앵커)"였는데, T59 가 **열량을 단위로** 세우면서
    //     그 배수 자체가 사라졌다: 말리기는 **수분만 뺀다 ⇒ 열량이 보존된다.**
    //     ⇒ 이제 검사는 "배수가 맞나"가 아니라 **"말린 것의 열량이 원물과 같나"** 다(더 강한 주장이다).
    const de = Tidal.driedEffects();
    const Kc = require(path.join(ROOT, 'server', 'kcal.js'));
    for (const [k, d] of Object.entries(Tidal.DRY)) {
      const raw = Tidal.CATCH[d.from].food;
      ok(Math.abs(Kc.kcalOf(k) - Kc.kcalOf(d.from)) < 1e-6,
        `★★${k} 의 **열량이 원물과 같다**(말리기는 수분만 뺀다)`,
        `${Math.round(Kc.kcalOf(d.from))} kcal → ${Math.round(Kc.kcalOf(k))} kcal`);
      ok(de[k].thirst === -raw.thirst, '★갈증은 **부호만 뒤집었다**(마른 것은 물기를 도로 가져간다)',
        `+${raw.thirst} → ${de[k].thirst}`);
      ok(H.FOOD_EFFECTS[k] && H.FOOD_EFFECTS[k].hunger === Kc.hungerOf(k, 24 * 60 * 1000),
        `★★zone 의 표에 **유도되어 들어갔다** — 먹을 수 있다`, JSON.stringify(H.FOOD_EFFECTS[k]));
      // 무게도 유도값 — 원물 kg × 잔량비
      const rawKg = Specialty.RESOURCES[d.from].weight;
      ok(Math.abs(W.kgOf(k) - +(rawKg * Tidal.DRY_RESIDUE).toFixed(3)) < 1e-9,
        '★무게도 **원물 × 잔량비**다', `${rawKg} × ${Tidal.DRY_RESIDUE} = ${W.kgOf(k)}kg`);
      ok(!/^[a-z_]+$/.test(H.ITEM_LABEL_SERVER[k] || k), '★한글 이름표가 붙었다', H.ITEM_LABEL_SERVER[k]);
    }
    // ⓓ ⚠[T59] **역산 앵커(말린 과실 ÷ 딸기)는 폐기됐다** — 그 앵커의 뿌리(생곡 7)가 썩어 있었다.
    //   대신 같은 물리를 **말리기 전체**에 대해 검사한다: 어떤 말리기든 열량이 보존돼야 한다.
    for (const r of Object.values(Spoil.PRESERVE)) {
      if (r.kind !== 'dry') continue;
      const from = Array.isArray(r.from) ? r.from[0] : r.from;
      ok(Math.abs(Kc.kcalOf(r.out) - Kc.kcalOf(from)) < 1e-6,
        `★★★${r.label} — 말려도 **열량은 그대로**다(새 계수 0)`,
        `${Math.round(Kc.kcalOf(from))} → ${Math.round(Kc.kcalOf(r.out))} kcal`);
    }
    const rk = W.kgOf('dried_fruit') / W.kgOf('berry');
    ok(Math.abs(Tidal.DRY_RESIDUE - rk) < 0.01, '★★잔량비도 **말린 과실 ÷ 생과**다', `${Tidal.DRY_RESIDUE} ≈ ${rk.toFixed(3)}`);
    // ⓔ 실행 — 건조대에 걸면 진짜로 마르나(정본 경로 그대로)
    {
      const p = mkPlayer('dryrun');
      const today = H.zoneGameDay();
      Lots.note(p, 'oyster', 6, today); p.inventory.oyster = 6;
      const gate = Spoil.canPreserve('dry_oyster', 1);
      ok(gate.ok, '★신선한 굴은 말릴 수 있다');
      ok(!Spoil.canPreserve('dry_oyster', 0).ok, '★★상한 굴로는 못 만든다(상한 걸 말려도 상한 것이다)');
      const q = Spoil.outputQty(6, 1);
      ok(q > 0, '★산출이 나온다', `굴 6 → 건굴 ${q}`);
      const ms = Spoil.preserveMs('dry_oyster', 24 * 60 * 1000);
      ok(ms > 0, '★말리는 데 시간이 든다(사흘)', `${Math.round(ms / 60000)}분`);
    }
    // ⓕ 건조대 창에 **저절로** 뜨는가 — 등록 코드 0(족보 (83) 의 화면판)
    {
      const p = mkPlayer('menu');
      const rows = H._facilityRecipes(p, 'dry').map((r) => r.id);
      ok(rows.includes('dry_oyster') && rows.includes('dry_seaweed'),
        '★★★건조대 창에 **저절로** 떴다 — 등록 코드 0', rows.join(' · '));
      const menu = H.preserveMenuPayload().map((r) => r.key);
      ok(menu.includes('dry_oyster') && menu.includes('dry_seaweed'), '★클라 목록에도 실린다(서버가 정본을 그대로 낸다)');
    }
    // ⓖ ★겨울 산수 — 갯벌이 겨울 비축이 되나(카드 §2④ 의 물음)
    {
      const eff = H.FOOD_EFFECTS.dried_seaweed || null;
      ok(!!eff && eff.hunger > 0, '★마른 미역은 **먹을 수 있다**', eff ? JSON.stringify(eff) : '표에 없다');
      const perKg = eff ? eff.hunger / W.kgOf('dried_seaweed') : 0;
      ok(perKg > 0, '(지표) 마른 미역 kg 당 허기', `${perKg.toFixed(0)}/kg`);
      // ★★실제로 **먹힌다**(표에 있는 것과 먹히는 것은 다른 명제 — 족보 (83))
      const pw = mkPlayer('winter'); const d0 = H.zoneGameDay();
      Lots.note(pw, 'dried_seaweed', 2, d0); pw.inventory.dried_seaweed = 2; pw.hunger = 20; pw.thirst = 80;
      const h0 = pw.hunger, q0 = pw.thirst;
      H.doEat(pw, 'dried_seaweed', 1);
      ok(pw.hunger > h0, '★★★마른 미역을 **진짜로 먹는다**(허기가 찬다)', `${h0} → ${Math.round(pw.hunger)}`);
      ok(pw.thirst < q0, '★★그리고 **목이 마르다**(보존식은 갈증을 준다 — 겨울나기는 물도 있어야 하는 문제다)',
        `${q0} → ${Math.round(pw.thirst)}`);
    }
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
