#!/usr/bin/env node
// === scripts/lab-trees.js — 랩(전쟁실험실) 나무·열매·벌목 표 (T123) ===============
//
// ⚠**계측기다. 하네스가 아니다 — 러너에 넣지 마라**(`@regress` 없음).
//
// 랩 `lab/전쟁실험실.html` 을 헤드리스로 열어 **랩 자신의 생활층**(`lifeInit` + `lifeDayAll`)을
// 800일 돌리고 표를 낸다. 엔진만 도는 `lab-smoke.js` 와 다르다 — 이 카드가 재는 것은 **숲**이다.
//
// 열 이름은 T117(`farm-metrics.js`) 과 같은 자 + 이 카드 셋: forestPct · felledFruit · fruitHarvest.
//
// 실행: node scripts/lab-trees.js [일수=800] [시드=1020] [--nofruit]
'use strict';
const path = require('path');
const { chromium } = require('playwright');
const DAYS = parseInt(process.argv[2], 10) || 800;
const SEED = parseInt(process.argv[3], 10) || 1020;
const NOFRUIT = process.argv.includes('--nofruit');

// ★★결정론 — 랩은 기본적으로 `Math.random` 을 쓴다(수확량 0.8~1.2 흔들림 등).
//   그대로 두면 같은 시드로 두 번 돌려도 표가 다르다 — **계측기가 못 쓸 물건이 된다.**
//   `test-lab-mining.js`·`test-lab-psite.js` 와 같은 처방: 페이지가 뜨기 전에 `Math.random` 을
//   시드 PRNG(mulberry32)로 갈아 끼운다. 시드는 **랩 시드와 같은 수** — 한 손잡이로 세계 전체가 정해진다.
//   덤: on/off 두 팔이 같은 난수열을 쓰므로 ⓑ A/B 가 **짝지은 비교**가 된다(차이 = 열매 실체화뿐).
const PRNG_INIT = (seed) => `(() => {
  let s = ${seed} | 0;
  Math.random = function(){ s = (s + 0x6D2B79F5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
})();`;

(async () => {
  const b = await chromium.launch();
  const p = await b.newPage();
  await p.addInitScript(PRNG_INIT(SEED));
  const errs = [];
  p.on('pageerror', (e) => errs.push(String(e.message).slice(0, 160)));
  p.on('console', (m) => { if (m.type() === 'error') errs.push('CONSOLE ' + m.text().slice(0, 120)); });
  await p.goto('file://' + path.resolve(__dirname, '..', 'lab', '전쟁실험실.html'), { waitUntil: 'load', timeout: 180000 });
  await p.waitForTimeout(2000);
  const r = await p.evaluate(({ days, seed, nofruit }) => {
    const out = { rows: [], trees: {}, err: null };
    try {
      if (nofruit) window.T123_FRUIT = 0;
      const si = document.getElementById('seed'); if (si) si.value = String(seed);
      const nv = document.getElementById('nvil'); if (nv) nv.value = '8';
      reseed(); lifeInit();
      out.vil0 = VILS.length;                       // ★소멸 계산 정본: 시작 마을 수 − 남은 마을 수(랩은 인구 0 마을을 VILS 에서 지운다)
      // ★★**추상 흐름을 같이 잰다**(관측자 — 랩 무수정). econ 엔진의 채집꾼은 여전히
      //   `foragerYieldsFor` 로 `fruit`·`chestnut`·`grape` 를 *추상으로* 만든다(economy-sim.js:388).
      //   T123 이 얹은 것은 **실체**다. 둘 중 어느 쪽이 곳간을 채우는지는 재 봐야 안다 —
      //   엔진이 오늘 만든 양은 `v.econ.dailyProductionBuf` 에 그대로 있다(읽기만 한다).
      const ABS_KEYS = Array.from(new Set(Object.keys(TREES).map((k) => TREES[k].fruit).filter(Boolean).concat(['fruit'])));   // + 추상 catch-all `fruit`
      out.abs = {};
      for (let d = 0; d < days; d++) {
        lifeDayAll(true);
        for (const v of VILS) { const b = v.econ && v.econ.dailyProductionBuf; if (!b) continue;
          for (const k of ABS_KEYS) if (b[k]) out.abs[k] = (out.abs[k] || 0) + b[k]; }
      }
      out.treeTable = Object.keys(TREES).map((k) => ({ id: k, ko: TREES[k].ko, wood: TREES[k].wood,
        mature: TREES[k].mature, char: TREES[k].char, fruit: TREES[k].fruit, fy: TREES[k].fy, fs: TREES[k].fs }));
      for (let i = 0; i < VILS.length; i++) {
        const v = VILS[i], ev = v.econ, st = v._tstat || { felled: {}, felledFruit: 0, felledWood: 0, fruitHarv: 0, fruitDrop: 0 };
        let forest = 0; if (v.forestRich) for (const g of v.forestRich.values()) forest += g;
        // ★숲이 **한 해에** 낼 수 있는 열매 총량(상한) — 규약 그대로: 나무 하나 = fy × 크기, 연 1회.
        //   채집꾼이 아무리 부지런해도 이 위로는 못 딴다. 추상 흐름과 비교할 자가 이것이다.
        let fruitCap = 0, fruitCells = 0, fruitCapEdge = 0;
        if (v.forestRich) for (const [k2, g] of v.forestRich) {
          const ci2 = k2.indexOf(','), T2 = treeOf(+k2.slice(0, ci2), +k2.slice(ci2 + 1));
          if (!T2 || !T2.fruit) continue;
          fruitCells++; const cap = T2.fy * (g / 100);   // 100 = L_WOODMAX (랩 정본 · 아래서 실제 값으로 나눈다)
          fruitCap += cap;
          if (v.forageRich && v.forageRich.has(k2)) fruitCapEdge += cap;   // 채집꾼이 실제로 도는 임연부만
        }
        fruitCap = fruitCap * 100 / L_WOODMAX; fruitCapEdge = fruitCapEdge * 100 / L_WOODMAX;
        const stor = (ev && ev.storage) || {};
        // ★품목 목록을 손으로 적지 않는다 — 표가 정본이다(초안이 여기 옛 이름을 적어 두고 어긋났다).
        let fruitStock = 0;
        for (const k of Object.keys(TREES)) { const f = TREES[k].fruit; if (f) fruitStock += stor[f] || 0; }
        const felledTot = st.felledFruit + st.felledWood;
        out.rows.push({
          vid: i, name: v.name, fert: v.fert,
          N: (ev && ev.npcs) ? ev.npcs.length : 0,
          fN: (ev && ev.counts) ? Math.round(ev.counts.lumberjack || 0) : 0,
          forN: (ev && ev.counts) ? Math.round(ev.counts.forager || 0) : 0,
          cells: v.forestRich ? v.forestRich.size : 0,
          forest0: v._initForestTotal || 0, forest1: forest,
          forestPct: v._initForestTotal ? +(100 * forest / v._initForestTotal).toFixed(1) : 0,
          felledFruit: +st.felledFruit.toFixed(2), felledWood: +st.felledWood.toFixed(2),
          fruitRate: felledTot > 0 ? +(st.felledFruit / felledTot).toFixed(3) : null,
          fruitHarvest: +st.fruitHarv.toFixed(2), fruitDrop: +st.fruitDrop.toFixed(2),
          econFood: +((stor.food || 0)).toFixed(0), fruitStock: +fruitStock.toFixed(1),
          fruitCap: +fruitCap.toFixed(1), fruitCapEdge: +fruitCapEdge.toFixed(1), fruitCells,
          wood: +((stor.wood || 0)).toFixed(0),
          // ★T86 넷(카드 ⓑ) — 랩 econ 이 그대로 들고 있는 자리. t17-metrics ⓐ 와 같은 식.
          K: (ev && ev._dpDebug && ev._dpDebug.K != null) ? +(+ev._dpDebug.K).toFixed(1) : null,
          weapQ: +(((stor.weapon || 0) * (ev && ev._weapQ != null ? ev._weapQ : 1))).toFixed(1),
          expand: (ev && ev.expansions) || 0,
        });
        for (const [k, n] of Object.entries(st.felled)) out.trees[k] = +(((out.trees[k] || 0) + n)).toFixed(2);
      }
      out.pop = out.rows.reduce((a, x) => a + x.N, 0);
      out.day = VILS[0] ? VILS[0].day : null;
      out.trade = (ECON_WORLD && ECON_WORLD.tradeLog) ? ECON_WORLD.tradeLog.length : 0;
      out.dead = Math.max(0, (out.vil0 || 0) - VILS.length);
      // ★카드 ⓒ "이유 표" — 마을마다 부등식의 두 변을 그대로 찍는다(새 수 0 · 판정 함수와 같은 식).
      //   gain = w(목재)×목재수율 · loss = 성목햇수 × w(열매)×연간열매수율. gain ≥ loss 면 벤다.
      out.ineq = [];
      for (let i = 0; i < VILS.length; i++) {
        const v = VILS[i], ev = v.econ; if (!ev) continue;
        // ★랩과 같은 문법(전쟁실험실 벌목 자리) — priceFn 은 *표*를 준다. w 는 그 표를 읽는 함수.
        let pt = null;
        try { pt = (ECON_WORLD && typeof ECON_WORLD.priceFn === 'function') ? ECON_WORLD.priceFn(ev) : null; } catch (e) { pt = null; }
        if (!pt) continue;
        const w = (r) => Math.max(0.05, Math.min(200, (pt[r] || 1) / 1.0));
        const iq = (v._tstat && v._tstat.ineq) || {};
        const row = { vid: i, name: v.name, wood: +w('wood').toFixed(3), sp: {} };
        for (const k of Object.keys(TREES)) {
          const T = TREES[k]; if (!T.fruit) continue;
          const gain = w('wood') * T.wood, loss = T.mature * w(T.fruit) * T.fy;
          const q = iq[k] || { y: 0, n: 0 };
          row.sp[k] = { g: +gain.toFixed(3), l: +loss.toFixed(3), fell: gain >= loss, wf: +w(T.fruit).toFixed(4),
            y: q.y, n: q.n, rate: (q.y + q.n) > 0 ? +(q.y / (q.y + q.n)).toFixed(3) : null };
        }
        out.ineq.push(row);
      }
    } catch (e) { out.err = String(e.message).slice(0, 300); }
    return out;
  }, { days: DAYS, seed: SEED, nofruit: NOFRUIT });
  await b.close();

  if (r.err) { console.error('랩 오류:', r.err); process.exit(1); }
  const nf = (x) => Number(x).toLocaleString();
  console.log(`\n=== 랩 나무·열매 표 — 전쟁실험실 · 시드 ${SEED} · ${DAYS}일 · 마을 ${r.rows.length} · 열매실체 ${NOFRUIT ? '끔(통제군)' : '켬'} ===`);
  console.log(`  인구 ${nf(r.pop)} · 게임일 ${r.day} · pageerror ${errs.length} · Math.random 시드 ${SEED}(결정론)`);

  console.log('\nⓐ 종 표 (랩 정본 · `trees.json` 뼈대)');
  console.log('  id          ko      wood  mature  char  fruit            fy   fs');
  for (const t of r.treeTable) console.log('  ' + t.id.padEnd(11) + String(t.ko).padEnd(7)
    + t.wood.toFixed(2).padStart(5) + String(t.mature).padStart(7) + t.char.toFixed(2).padStart(7)
    + '  ' + String(t.fruit || '—').padEnd(15) + String(t.fy).padStart(5) + String(['봄','여름','가을','겨울'][t.fs]).padStart(5));

  console.log('\nⓑ 마을별 — ★T117 과 같은 자 + 이 카드 셋(forestPct·felledFruit·fruitHarvest)');
  console.log('  vid name       fert    N  fN forN cells forestPct felledWood felledFruit fruitRate fruitHarvest fruitDrop fruitStock  wood econFood');
  for (const x of r.rows.slice().sort((a, b2) => b2.cells - a.cells)) {
    console.log('  ' + String(x.vid).padStart(3) + ' ' + String(x.name).padEnd(10)
      + String(x.fert).padStart(5) + String(x.N).padStart(5) + String(x.fN).padStart(4) + String(x.forN).padStart(5)
      + String(x.cells).padStart(6) + (x.forestPct + '%').padStart(10)
      + String(x.felledWood).padStart(11) + String(x.felledFruit).padStart(12)
      + String(x.fruitRate == null ? '—' : x.fruitRate).padStart(10)
      + String(x.fruitHarvest).padStart(13) + String(x.fruitDrop).padStart(10)
      + String(x.fruitStock).padStart(11) + String(x.wood).padStart(6) + String(x.econFood).padStart(9));
  }

  const sum = (k) => r.rows.reduce((a, x) => a + (x[k] || 0), 0);
  const f0 = sum('forest0'), f1 = sum('forest1');
  const gone = r.rows.filter((x) => x.forestPct <= 0.5).length;
  const rates = r.rows.map((x) => x.fruitRate).filter((x) => x != null);
  console.log(`\nⓒ 숲 균형 — 전체 ${f0 ? (100 * f1 / f0).toFixed(1) : '—'}% 남음 · 고갈(≤0.5%) 마을 ${gone}/${r.rows.length}`);
  console.log(`ⓓ 벌목 — 목재종 ${sum('felledWood').toFixed(1)} · 열매종 ${sum('felledFruit').toFixed(1)}`
    + ` · 열매종 벌목률 ${rates.length ? (rates.reduce((a, x) => a + x, 0) / rates.length).toFixed(3) : '—'}`
    + ` (분포 ${rates.length ? Math.min(...rates).toFixed(3) + '~' + Math.max(...rates).toFixed(3) : '—'})`);
  console.log(`ⓔ 열매 — 나무에서 딴 것 ${sum('fruitHarvest').toFixed(1)} · 벌목 낙과 ${sum('fruitDrop').toFixed(1)} · 곳간 재고 ${sum('fruitStock').toFixed(1)}`);
  {
    const abs = r.abs || {};
    const absSum = Object.values(abs).reduce((a, x) => a + x, 0);
    const real = sum('fruitHarvest') + sum('fruitDrop');
    console.log(`ⓔ' 추상 vs 실체 — econ 채집꾼이 추상으로 만든 같은 품목 Σ ${absSum.toFixed(1)}`
      + ` (${Object.entries(abs).sort((a, b2) => b2[1] - a[1]).map(([k, v2]) => k + ' ' + v2.toFixed(1)).join(' · ')})`);
    const years = DAYS / 365;
    const cap = sum('fruitCap'), capE = sum('fruitCapEdge');
    console.log(`   ⇒ 실체 ${real.toFixed(1)} / 추상 ${absSum.toFixed(1)} = ${absSum ? (100 * real / absSum).toFixed(2) : '—'}%`);
    console.log(`   ⇒ 숲의 연간 열매 상한 Σ ${cap.toFixed(1)}/년 (그중 채집꾼이 도는 임연부 ${capE.toFixed(1)}/년 · 열매종 칸 ${sum('fruitCells')})`
      + ` vs 추상 ${(absSum / years).toFixed(1)}/년  ⇒ 상한/추상 = ${absSum ? (100 * cap * years / absSum).toFixed(1) : '—'}%`);
    console.log(`   ※카드 ④ "추상 대체"는 **아직 못 했다** — 추상을 만드는 자리(economy-sim.js:388 foragerYieldsFor)가 econ 엔진 안이라`);
    console.log(`     이 카드(서버 무접촉·인라인 사본 규약)가 못 만진다. 대체는 이식 카드의 일이고, 위 세 수가 그 판정거리다.`);
  }
  const kSum = r.rows.reduce((a, x) => a + (x.K || 0), 0);
  console.log(`ⓕ econ(T86 넷) — 인구 ${nf(r.pop)} · KΣ ${kSum.toFixed(0)} · 소멸 ${r.dead}/${r.vil0}`
    + ` · 무기Q ${sum('weapQ').toFixed(0)} · 확장셀 ${sum('expand')} · 거래 ${nf(r.trade)}`
    + ` · 곳간 식량 ${nf(sum('econFood'))} · 목재 ${nf(sum('wood'))}`);
  console.log('\nⓖ 종별 벌목(크기 환산)');
  for (const [k, n] of Object.entries(r.trees).sort((a, b2) => b2[1] - a[1])) console.log('  ' + k.padEnd(12) + String(n).padStart(8));

  // ⓗ 부등식 이유 표 — 카드 ⓒ "0/51 이나 51/51 이면 식이 틀린 것 · 이유 표"
  if (r.ineq && r.ineq.length) {
    const sps = Object.keys(r.ineq[0].sp);
    console.log('\nⓗ 부등식 이유 표 — gain=w(목재)×목재수율 · loss=성목햇수×w(열매)×연간열매수율 · gain≥loss ⇒ 벤다');
    console.log(`  ★두 층을 같이 본다: [끝값]=${DAYS}일째 가격으로 푼 답 · [판정]=${DAYS}일 동안 실제로 물어본 횟수와 「벤다」 비율.`);
    console.log('     값이 흐르므로 둘은 같지 않다 — 다르면 그게 답이다("이 마을은 도중에 마음을 바꿨다").');
    console.log('  vid name       w(목재)  ' + sps.map((k) => k.padEnd(26)).join(''));
    for (const x of r.ineq) {
      console.log('  ' + String(x.vid).padStart(3) + ' ' + String(x.name).padEnd(10) + String(x.wood).padStart(8) + '  '
        + sps.map((k) => (x.sp[k].fell ? '벤다 ' : '둔다 ')
            + (x.sp[k].g + '≥' + x.sp[k].l).padEnd(15)
            + (x.sp[k].rate == null ? '  —   ' : ' ' + String(x.sp[k].rate).padStart(5)) + ' ').join(''));
    }
    for (const k of sps) {
      const n = r.ineq.filter((x) => x.sp[k].fell).length;
      const y = r.ineq.reduce((a, x) => a + x.sp[k].y, 0), nn = r.ineq.reduce((a, x) => a + x.sp[k].n, 0);
      const per = r.ineq.filter((x) => x.sp[k].rate != null);
      console.log('  ⇒ ' + k.padEnd(11) + ' 끝값 벤다 ' + n + '/' + r.ineq.length + ' 마을'
        + ' · 판정 ' + (y + nn) + '회 중 벤다 ' + y + (y + nn ? ' (' + (100 * y / (y + nn)).toFixed(1) + '%)' : '')
        + (per.length ? ' · 마을별 비율 ' + Math.min(...per.map((x) => x.sp[k].rate)).toFixed(3)
            + '~' + Math.max(...per.map((x) => x.sp[k].rate)).toFixed(3) : ''));
    }
  }
})();
