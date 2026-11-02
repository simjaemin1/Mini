#!/usr/bin/env node
// @regress   ← 통합 러너가 이 표를 보고 자기 목록을 만든다(scripts/run-regress.sh · 표 없으면 안 돈다)
// === scripts/test-preserve-carry.js — T767: 보존 가공 = **개수 그대로 · 신선도 이어받기 · 썩는 속도만 느리게** ===
//     (손잡이 `T767_PRESERVE_CARRY` — ★[T778] 켬 기본 · `=0` 이 끔 = 종전 바이트 · 순간 로트 `T732_MOMENT_LOT` 도 켬 기본)
//
// ★재민 10-15 판정: "애초에 갓 잡은 걸로 가공이 안 되는 게 문제 · 신선도가 떨어진다고 양이 떨어지는 거 아니잖아 ·
//   신선도를 그대로 가져와야 · 건어물은 신선도 감소 속도가 느려지는 것뿐이어야".
//   이 하네스는 **운영 함수 그대로**(`zone.doPreserve` · `doCraftCollect` · `_facilityRecipes` · `spoil` · `lots`)를 네 판의 아이로 돌린다:
//     끔 · 날 로트 / 끔 · 순간 로트(T732) / 켬 · 날 로트 / 켬 · 순간 로트 — 손잡이는 모듈 머리에서 읽으니 판마다 새 프로세스다.
//   시간: 게임일을 길게(1시간) · `SPOIL_Q10=1`(노출 = 경과 일수 — test-preserve 와 같은 자) · 가공 소요일만 줄인다(720ms).
//
//  ⓪ 끔 = 종전(수율): 갓 잡은 1 → 1(날) · **0(순간 로트 — T732 §7-0)** · 시든 3 → ⌊3 × 수율⌋ · 산출 신선도 1(리셋) · 화면 수율 %
//  ① 켬 · 갓 잡은 1 → 1 — 산출 신선도 = 넣은 것의 그 순간 신선도
//  ② 켬 · 시든 3 → 3 — 산출 신선도 = 넣은 것의 신선도(이어받음) · 그 뒤 보존식 곡선(보관 45일)으로 늙는다(생선 2.5일이 아니다)
//  ③ 켬 · 섞인 재료(갓 1 + 시든 2) → 레코드마다 제 신선도(평균 0 · 오래된 것부터 나간 그 차례)
//  ④ 상한 재료 게이트 그대로(거절 · 안 삼킨다)
//  ⑤ 대기열 주문이 건물 저장을 넘는다(JSON 왕복 뒤 수령 = 같은 값)
//  ⑥ 화면 — 켬이면 수율 칸이 비고 "나올 것의 신선도"가 온다(만들기 단추가 보내는 한 개의 값) · 끄면 종전 칸 그대로
//  ⑦ 장부 — 개수 n → n · 무게(`weights`) · 열량(`kcal`) 표(어긋나면 표에 적고 회부 — 새 수 0)
//  ⑧ 글자 — 끔 갈래 줄이 종전 그대로(수율 곱 · 리셋 note) · 켬 갈래는 손잡이 안에서만 닿는다
//
// 실행: node scripts/test-preserve-carry.js
'use strict';
const path = require('path');
const fs = require('fs');
const { execFileSync } = require('child_process');
const ROOT = path.resolve(__dirname, '..');
const SV = (p) => path.join(ROOT, 'server', p);

// ══ 아이 판 — 한 손잡이 조합으로 네 장면을 돈다(마지막 줄 = JSON) ══════════════════════════════
if (process.env.T767_SUB === 'run') {
  process.env.ZONE_ID = 'hanbando';
  process.env.PORT = String(36850 + (process.pid % 140));
  process.env.DB_PATH = `/tmp/test-pvc-${process.pid}.db`;
  process.env.ENABLE_VILLAGES = '0'; process.env.ENABLE_WILDLIFE = '0';
  process.env.ENABLE_BANDITS = '0'; process.env.ENABLE_ROADS = '0';
  process.env.VILLAGE_DAY_MS = process.env.VILLAGE_DAY_MS || String(3600 * 1000);   // 게임일 1시간 — 검사 중 날이 안 바뀐다
  process.env.SPOIL_Q10 = '1';                                                       // 노출 = 경과 일수(기준온도 환경)
  process.env.PRESERVE_DAYS_DRY = '0.0002'; process.env.PRESERVE_DAYS_SMOKE = '0.0002'; process.env.PRESERVE_DAYS_PICKLE = '0.0002';
  const _log = console.log; console.log = () => {}; console.warn = () => {}; console.error = () => {};
  const out = { err: null };
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  (async () => {
    try {
      const Zone = require(SV('zone.js'));
      const H = Zone.__testBind();
      const Spoil = require(SV('spoil.js'));
      const Lots = require(SV('lots.js'));
      const Body = require(SV('body.js'));
      const DAY_MS = +process.env.VILLAGE_DAY_MS;
      const MOM = Lots.momentOn();
      out.knob = { carry: !!Spoil.T767_CARRY, moment: MOM };
      const R6 = (x) => +(+x).toFixed(6);
      function mkPlayer(name) {
        const msgs = [];
        const ws = { readyState: 1, send: (s) => { try { msgs.push(JSON.parse(s)); } catch (e) {} } };
        const p = { pid: 'p_' + name, playerId: 'tp_' + name, name, persistent: false, ws,
          x: 5000, y: 5000, vx: 0, vy: 0, floor: 0, hp: 100, maxHp: 100, hunger: 0, thirst: 100,
          inventory: {}, equipment: [], equipSlots: {}, craftSkill: {}, dishes: [], lots: {} };
        p._msgs = msgs; Body.ensure(p); return p;
      }
      const lastNote = (p) => (p._msgs.filter((m) => m.type === 'notice').map((m) => m.text).slice(-1)[0] || '');
      const rack = { id: 'pvc1', dbId: null, type: 'drying_rack', ownerId: null, ownerName: null, x: 5020, y: 5000, data: {} };
      H.buildings.set(rack.id, rack);
      // 나이 있는 로트 — 날 로트면 취득일만 과거로 · 순간 로트면 얻은 순간을 과거로(소수 날). 신선도는 제품이 유도한다.
      function giveAt(p, item, n, age) {
        if (MOM) { const k = Math.floor(Lots.nowMs() - age * Lots.dayMs()); Lots.note(p, item, n, Math.floor(k / Lots.dayMs()), 'carry', k); }
        else Lots.note(p, item, n, H.zoneGameDay() - Math.round(age));
        p.inventory[item] = Math.floor(Lots.sum(p, item) + 1e-6);
      }
      const fAt = (item, lot, day) => Spoil.freshnessOf(item, Spoil.exposureOf(lot, day));
      const recF = (p, item) => Lots.of(p, item).map((l) => ({ n: R6(l.n), f: fAt(item, l, H.zoneGameDay()), k: l.k != null ? l.k : null, d: l.d }));
      // 한 판: 지금 내 생선에서 n 을 말리고(만들기) → 다 되면 받는다. 넣기 전에 **오래된 것부터 나갈 레코드**의 신선도를 미리 본다(같은 차례).
      async function dry(p, n, opt) {
        rack.ownerId = p.playerId; rack.ownerName = p.playerId;
        await sleep(20);   // "갓 잡은" = 20ms 전 — 순간 로트면 그만큼 늙었다(하루 1시간 · 노출 5.6e-6일 · f 0.999998)
        const today = H.zoneGameDay();
        const before = Spoil.peekAges(Lots.of(p, 'fish'), n).map((r) => ({ n: R6(r.n), f: Spoil.freshnessOf('fish', Spoil.exposureOf(r, today)) }));
        const row = (H._facilityRecipes(p, 'dry') || []).find((x) => x.id === 'dry_fish') || null;
        const fish0 = Lots.sum(p, 'fish'), dried0 = p.inventory.dried_fish || 0;
        p._msgs.length = 0; H.doPreserve(p, 'dry_fish', n);
        const note = lastNote(p);
        const q = (rack.data.queue || []).filter((j) => j.owner === p.playerId);
        const job = q.length ? q[q.length - 1] : null;
        const jobView = job ? { items: job.items, lotItems: job.lotItems, lotFresh: job.lotFresh || null, label: job.label } : null;
        if (job) {
          await sleep(Spoil.preserveMs('dry_fish', DAY_MS) + 300);
          if (opt && opt.roundtrip) rack.data = JSON.parse(JSON.stringify(rack.data));   // ⑤ 건물 저장 왕복(주문째)
          p._msgs.length = 0; H.doCraftCollect(p, rack.id);
        }
        const fishLeft = R6(Lots.sum(p, 'fish'));
        return { before, row: row ? { yieldPct: row.yieldPct, hasOut: Object.prototype.hasOwnProperty.call(row, 'outFresh'), outFresh: row.outFresh, outStage: row.outStage, fresh: row.fresh, stageKo: row.stageKo } : null,
          note, job: jobView, fish0: R6(fish0), fishLeft, dried: (p.inventory.dried_fish || 0) - dried0, lots: recF(p, 'dried_fish') };
      }
      // 나이별 시든 생선: 날 로트 2일(f 0.2) · 순간 로트 1.5일(f 0.4) — 날 문법은 정수 날만 셀 수 있다
      const WILT = MOM ? 1.5 : 2;
      out.wiltAge = WILT;
      // ① 갓 잡은 1
      { const p = mkPlayer('fresh'); giveAt(p, 'fish', 1, 0); out.fresh1 = await dry(p, 1); }
      // ② 시든 3(건물 저장 왕복을 넘어 받는다) · 그 뒤 곡선
      {
        const p = mkPlayer('wilt'); giveAt(p, 'fish', 3, WILT);
        out.wilt3 = await dry(p, 3, { roundtrip: true });
        const today = H.zoneGameDay();
        const L = Lots.of(p, 'dried_fish');
        out.wilt3.later = L.map((l) => ({ f2: fAt('dried_fish', l, today + 2), f4: fAt('dried_fish', l, today + 4) }));
        out.fishCurve = { f2: Spoil.freshnessOf('fish', WILT + 2), f0: Spoil.freshnessOf('fish', WILT) };
      }
      // ③ 섞인 재료 — 시든 2(먼저 얻은 것) + 갓 1
      { const p = mkPlayer('mix'); giveAt(p, 'fish', 2, WILT); giveAt(p, 'fish', 1, 0); out.mix3 = await dry(p, 3); }
      // ④ 상한 재료 — 전부 상함
      { const p = mkPlayer('rot'); giveAt(p, 'fish', 2, Math.ceil(Spoil.shelfOf('fish')) + 2); out.rot2 = await dry(p, 2); }
      out.shelf = { fish: Spoil.shelfOf('fish'), dried_fish: Spoil.shelfOf('dried_fish') };
      // ⑦ 장부 표 — 존이 다 뜬 뒤의 표(무게 · 열량 정본이 늦게 채우는 줄까지)로 잰다
      {
        const W = require(SV('weights.js')), K = require(SV('kcal.js'));
        out.ledger = [];
        for (const [id, r] of Object.entries(Spoil.PRESERVE)) {
          const froms = Array.isArray(r.from) ? r.from : [r.from];
          for (const f of froms) out.ledger.push({ id, from: f, out: r.out, kgIn: W.kgOf(f), kgInD: W.kgOfOrDefault(f), kgOut: W.kgOf(r.out),
            kcIn: +K.kcalOf(f).toFixed(1), kcOut: +K.kcalOf(r.out).toFixed(1) });
        }
      }
    } catch (e) { out.err = String((e && e.stack) || e).slice(0, 800); }
    try { fs.unlinkSync(process.env.DB_PATH); } catch (e) {}
    _log(JSON.stringify(out));
    process.exit(0);
  })();
  return;
}

// ══ 부모 판 ═══════════════════════════════════════════════════════════════════════════════
let pass = 0, fail = 0;
const ok = (c, m, x) => { c ? pass++ : fail++; console.log((c ? '  ✓ ' : '  ✗ ') + m + (x !== undefined && x !== '' ? `  ${x}` : '')); };
const pre = (c, m, x) => { if (!c) { fail++; console.log('  ✗ [상황] ' + m + (x !== undefined ? `  ${x}` : '')); } else console.log('  · [상황] ' + m + (x !== undefined ? `  ${x}` : '')); };
const near = (a, b, tol) => Math.abs((+a) - (+b)) <= (tol == null ? 1e-4 : tol);

function child(env) {
  const e = Object.assign({}, process.env, { T767_SUB: 'run' });
  delete e.T767_PRESERVE_CARRY; delete e.T732_MOMENT_LOT;
  Object.assign(e, env);
  const txt = execFileSync(process.execPath, [__filename], { cwd: ROOT, env: e, encoding: 'utf8', timeout: 300000, maxBuffer: 64 << 20 });
  const last = txt.trim().split('\n').filter(Boolean).pop();
  return JSON.parse(last);
}

console.log('\n=== T767 보존 가공 — 개수 그대로 · 신선도 이어받기 · 썩는 속도만 느리게 ===');
const Spoil = require(SV('spoil.js'));
const RUNS = {
  // ★[T778] 두 손잡이 켬 기본 — 끔 갈래는 명시 `=0` · 켬·순간 = 기본(손잡이 없음)
  off_day: child({ T767_PRESERVE_CARRY: '0', T732_MOMENT_LOT: '0' }),
  off_mom: child({ T767_PRESERVE_CARRY: '0' }),
  on_day: child({ T732_MOMENT_LOT: '0' }),
  on_mom: child({}),
};
for (const [k, r] of Object.entries(RUNS)) pre(!r.err && r.knob, `아이 판 ${k} 이 끝까지 돌았다`, r.err ? r.err.split('\n')[0] : JSON.stringify(r.knob));
pre(!RUNS.off_day.knob.carry && !RUNS.off_day.knob.moment && !RUNS.off_mom.knob.carry && RUNS.off_mom.knob.moment
  && RUNS.on_day.knob.carry && !RUNS.on_day.knob.moment && RUNS.on_mom.knob.carry && RUNS.on_mom.knob.moment,
  '네 판의 손잡이가 뜻한 대로 섰다(끔·날 / 끔·순간 / 켬·날 / 켬·순간)');

const fmtL = (L) => (L || []).map((l) => `${l.n}@${(+l.f).toFixed(4)}`).join(' ');

// ⓪ 끔 = 종전
console.log('\n⓪ 끔 = 종전(수율 · 리셋)');
{
  const a = RUNS.off_day, b = RUNS.off_mom;
  ok(a.fresh1.dried === 1 && a.fresh1.lots.length === 1 && near(a.fresh1.lots[0].f, 1),
    '⓪ 끔·날 — 갓 잡은 1 → 1 · 산출 신선도 1(리셋)', `${a.fresh1.dried}개 · ${fmtL(a.fresh1.lots)}`);
  pre(b.fresh1.before.length === 1 && b.fresh1.before[0].f < 1, '끔·순간 — 갓 잡은 것도 넣는 순간엔 신선도가 1 밑이다(순간 노출)', b.fresh1.before.map((x) => x.f).join(','));
  ok(b.fresh1.dried === 0 && b.fresh1.fishLeft === 1 && /한 개도 나오지 않습니다/.test(b.fresh1.note),
    '★⓪ 끔·순간 — **갓 잡은 1 → 0**(T732 §7-0 · 수율 ⌊1 × 0.99…⌋) · 생선은 되돌린다 — 이 카드가 걷는 꼴', `${b.fresh1.dried}개 · 생선 ${b.fresh1.fishLeft} · "${b.fresh1.note.slice(0, 30)}"`);
  for (const [nm, r] of [['날', a], ['순간', b]]) {
    const fIn = r.wilt3.before.reduce((s, x) => s + x.n * x.f, 0) / 3;
    const want = Spoil.outputQty(3, fIn);
    ok(r.wilt3.dried === want && want < 3 && r.wilt3.lots.every((l) => near(l.f, 1)),
      `⓪ 끔·${nm} — 시든 3 → ⌊3 × 수율(${fIn.toFixed(3)})⌋ = ${want} · 산출 신선도 1(리셋)`, `${r.wilt3.dried}개 · ${fmtL(r.wilt3.lots)}`);
    ok(r.wilt3.row && typeof r.wilt3.row.yieldPct === 'number' && !r.wilt3.row.hasOut,
      `⓪ 끔·${nm} — 화면 줄: 수율 % 그대로 · 새 칸 없음`, JSON.stringify(r.wilt3.row));
    ok(r.wilt3.job && !r.wilt3.job.lotFresh && !/신선도 그대로/.test(r.wilt3.note),
      `⓪ 끔·${nm} — 주문에 신선도 칸 없음 · 알림 글자 종전`, r.wilt3.note.slice(0, 60));
  }
}

for (const [nm, key] of [['날', 'on_day'], ['순간', 'on_mom']]) {
  const r = RUNS[key];
  console.log(`\n①~⑤ 켬 · ${nm} 로트`);
  // ① 갓 잡은 1 → 1
  ok(r.fresh1.dried === 1 && r.fresh1.fishLeft === 0 && r.fresh1.lots.length === 1,
    `★★① 켬·${nm} — 갓 잡은 1 → **1**`, `${r.fresh1.dried}개 · ${fmtL(r.fresh1.lots)}`);
  ok(near(r.fresh1.lots[0] && r.fresh1.lots[0].f, r.fresh1.before[0].f),
    `★① 켬·${nm} — 산출 신선도 = 넣은 것의 그 순간 신선도`, `${r.fresh1.before[0].f} → ${r.fresh1.lots[0] && r.fresh1.lots[0].f}`);
  // ② 시든 3 → 3 · 이어받기 · 그 뒤 곡선
  pre(r.wilt3.before.every((x) => x.f > 0 && x.f < Spoil.FRESH_AT), `시든 재료가 **정말 시듦**이다(0 < f < ${Spoil.FRESH_AT})`, r.wilt3.before.map((x) => x.f).join(','));
  ok(r.wilt3.dried === 3 && r.wilt3.fishLeft === 0, `★★② 켬·${nm} — 시든 3 → **3**(개수 그대로)`, `${r.wilt3.dried}개`);
  const fIn = r.wilt3.before[0].f;
  ok(r.wilt3.lots.length >= 1 && r.wilt3.lots.every((l) => near(l.f, fIn)),
    `★★② 켬·${nm} — 산출 신선도 = 넣은 것의 신선도(이어받음 · 리셋 아님)`, `넣은 ${fIn} → 산출 ${fmtL(r.wilt3.lots)}`);
  const lt = r.wilt3.later[0];
  ok(lt && near(lt.f2 - lt.f4, 2 / Spoil.shelfOf('dried_fish'), 1e-4) && lt.f4 > 0,
    `★★② 켬·${nm} — 그 뒤 **보존식 곡선**으로 늙는다(이틀에 2/${Spoil.shelfOf('dried_fish')})`, `+2일 ${lt && lt.f2} · +4일 ${lt && lt.f4}`);
  ok(r.fishCurve.f2 === 0 && lt && lt.f2 > 0,
    `★② 켬·${nm} — 같은 신선도의 생선은 이틀 뒤 상함 — 느려진 것은 **속도만**이다`, `생선 +2일 ${r.fishCurve.f2} · 건어물 +2일 ${lt && lt.f2}`);
  ok(r.wilt3.job && r.wilt3.job.lotFresh && Array.isArray(r.wilt3.job.lotFresh.dried_fish) && /신선도 그대로/.test(r.wilt3.note),
    `② 켬·${nm} — 주문이 넣은 레코드의 신선도를 싣는다 · 알림 "(신선도 그대로)"`, `${JSON.stringify(r.wilt3.job && r.wilt3.job.lotFresh)} · ${r.wilt3.note.slice(0, 50)}`);
  // ③ 섞인 재료
  const bIn = r.mix3.before.map((x) => `${x.n}@${x.f.toFixed(4)}`).sort().join(' ');
  const bOut = r.mix3.lots.map((x) => `${x.n}@${x.f.toFixed(4)}`).sort().join(' ');
  pre(new Set(r.mix3.before.map((x) => x.f.toFixed(4))).size === 2, '섞인 재료 — 넣는 레코드의 신선도가 **둘로 갈린다**', bIn);
  ok(r.mix3.dried === 3 && bIn === bOut, `★★③ 켬·${nm} — 레코드마다 제 신선도로 나온다(평균 0)`, `넣은 ${bIn} → 산출 ${bOut}`);
  // ④ 상한 재료
  ok(r.rot2.dried === 0 && r.rot2.fishLeft === 2 && /상한/.test(r.rot2.note) && !r.rot2.job,
    `④ 켬·${nm} — 상한 재료는 그대로 거절 · 안 삼킨다(게이트 \`canPreserve\` 무접촉)`, `생선 ${r.rot2.fishLeft} · "${r.rot2.note.slice(0, 30)}"`);
  // ⑤ 저장 왕복(②가 왕복 뒤에 받았다)
  ok(r.wilt3.dried === 3 && r.wilt3.lots.every((l) => near(l.f, fIn)),
    `⑤ 켬·${nm} — 대기열 주문이 건물 저장(JSON 왕복)을 넘어 같은 값으로 선다`, fmtL(r.wilt3.lots));
  if (nm === '순간') ok(r.wilt3.lots.every((l) => l.k != null), '⑤ 켬·순간 — 산출 로트가 다 된 순간 `k` 를 싣는다(T732 규약)', r.wilt3.lots.map((l) => l.k).join(','));
  else ok(r.wilt3.lots.every((l) => l.k == null), '⑤ 켬·날 — 산출 로트는 날 문법(`k` 없음 · main 꼴)', r.wilt3.lots.map((l) => l.d).join(','));
  // ⑥ 화면
  const row = r.wilt3.row;
  ok(row && row.yieldPct === null && row.hasOut && near(row.outFresh, r.wilt3.before[0].f, 1e-4) && row.outStage === Spoil.stageOf(row.outFresh),
    `★⑥ 켬·${nm} — 화면 줄: 수율 칸이 비고 **나올 것의 신선도**(한 개 · 오래된 것부터)`, JSON.stringify(row));
  const mrow = r.mix3.row;
  ok(mrow && near(mrow.outFresh, r.mix3.before[0].f, 1e-4),
    `⑥ 켬·${nm} — 섞인 재료면 만들기 단추가 보내는 그 한 개(오래된 것)의 값`, `${mrow && mrow.outFresh} = ${r.mix3.before[0].f}`);
}

// ⑦ 장부 — 개수 · 무게 · 열량
console.log('\n⑦ 장부 — 개수 n → n · 무게 · 열량(표의 값 그대로 · 어긋나면 표에 적고 회부)');
{
  const rows = RUNS.on_day.ledger || [];
  pre(rows.length > 0, '장부 표 — 존이 뜬 아이 판(켬·날)의 무게 · 열량 정본으로 잰다', `${rows.length}줄`);
  const same = rows.filter((x) => x.kcIn > 0 && Math.abs(x.kcIn - x.kcOut) < 0.05);
  const diff = rows.filter((x) => !(x.kcIn > 0 && Math.abs(x.kcIn - x.kcOut) < 0.05));
  for (const x of rows) console.log(`    ${x.id.padEnd(12)} ${String(x.from).padEnd(14)} → ${x.out.padEnd(13)} kg ${x.kgIn == null ? `없음(기본 ${x.kgInD})` : x.kgIn} → ${x.kgOut} · kcal/개 ${x.kcIn} → ${x.kcOut}${Math.abs(x.kcIn - x.kcOut) < 0.05 ? '' : '   [회부 — 표가 어긋남]'}`);
  ok(RUNS.on_day.wilt3.dried === 3 && RUNS.on_mom.wilt3.dried === 3 && RUNS.on_day.mix3.dried === 3 && RUNS.on_mom.mix3.dried === 3,
    '★★⑦ 개수 장부 — 넣은 n = 나온 n(켬 두 판 · 시든 · 섞인)', '3 → 3 × 4');
  const single = rows.filter((x) => !Array.isArray(Spoil.PRESERVE[x.id].from) && x.id !== 'pickle_fish');
  ok(single.length >= 4 && single.every((x) => Math.abs(x.kcIn - x.kcOut) < 0.05),
    '★⑦ 열량 — 원물 하나에서 오는 레시피는 1개 열량 = 원물 1개 열량(kcal.js §3 · 개수 그대로면 열량 장부가 닫힌다)',
    single.map((x) => `${x.from}→${x.out} ${x.kcIn}=${x.kcOut}`).join(' · '));
  console.log(`    · [표] 열량 같음 ${same.length}줄 · 어긋남 ${diff.length}줄(${diff.map((x) => `${x.id}:${x.from}`).join(' ')})`);
  ok(rows.every((x) => x.kgOut > 0), '⑦ 무게 — 산출 보존식 여섯이 무게 표에 있다(누락 0)', [...new Set(rows.map((x) => `${x.out} ${x.kgOut}`))].join(' · '));
  const noKg = rows.filter((x) => !(x.kgIn > 0)).map((x) => x.from);
  console.log(`    · [표] 무게 표에 줄이 없는 넣을 것 ${new Set(noKg).size}종(기본 1.0kg 그물 · 열량 0 — 이 카드 밖 · 회부): ${[...new Set(noKg)].join(' ')}`);
  fs.mkdirSync('/tmp/t767', { recursive: true });
  fs.writeFileSync('/tmp/t767/ledger.json', JSON.stringify({ rows, same: same.length, diff: diff.map((x) => `${x.id}:${x.from}`) }, null, 1));
}

// ⑧ 글자 — 끔 갈래 줄이 종전 그대로 · 켬 갈래는 손잡이 안
console.log('\n⑧ 글자');
{
  const z = fs.readFileSync(SV('zone.js'), 'utf8'), s = fs.readFileSync(SV('spoil.js'), 'utf8');
  ok(/Spoil\.T767_CARRY \? Math\.floor\(got\.taken \+ 1e-6\) : Spoil\.outputQty\(got\.taken, fr\.fresh\)/.test(z),
    '⑧ 끔이면 산출 = 종전 `Spoil.outputQty(got.taken, fr.fresh)`(수율 곱 그대로)');
  ok(/if \(Spoil\.T767_CARRY\) _pvJob\.lotFresh =/.test(z) && /Lots\.note\(player, k, n, _d, 'carry', _kDone\);/.test(z),
    '⑧ 주문 신선도 칸은 켬에서만 · 그 칸이 없으면 수령은 종전 `Lots.note`(리셋)');
  ok(/yieldPct: \(have > 0 && !Spoil\.T767_CARRY\)/.test(z) && /if \(Spoil\.T767_CARRY && have > 0\)/.test(z),
    '⑧ 화면 줄 — 끔이면 수율 그대로 · 새 칸은 켬에서만');
  ok((s.match(/process\.env\.T767_PRESERVE_CARRY/g) || []).length === 1 && /T767_PRESERVE_CARRY !== '0'/.test(s),
    "⑧ 손잡이는 spoil.js 한 자리(`!== '0'` · ★[T778] 켬 기본 · `=0` 이 끔)");
}

console.log(`\n=== 결과: ${pass} PASS / ${fail} FAIL ===`);
process.exit(fail ? 1 : 0);
