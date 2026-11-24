#!/usr/bin/env node
'use strict';
// === scripts/us-line.js — µs 줄기 같은 상자 자 (T1314 · T1294 회부 3) ===========================================
//
// ★왜 — 상자(컨테이너 기계)가 바뀌면 지난 카드의 µs 와 한 줄에 못 놓는다(T1294: 같은 main 틱 p50 4.3 → 2.8 ms).
//   그래서 µs 카드는 **같은 상자에서 기준 판(main)과 고친 판을 번갈아** 돌리고, 판마다 중앙 · 흔들림 띠로 견준다.
// ★자 — T1144 자 그대로(`t646-anatomy run inf <tag> --seg --lines --ref <커밋>` · 표본 250 µs · 낮 phase 0.10 · 밤 0.72 · 조각 6 × 30초 · 판 하나 ≈ 23분).
//   결정 표본이 빠진 조각(T1219 자가 표시)이 있으면 그 판은 `live` 로 읽는다.
//
// 실행:
//   node scripts/us-line.js run  --dir <판 폴더> --tpl <틀 db> --n 2 --arm main=<커밋> --arm fix=<커밋>[:ENV=1,ENV2=0] ...
//       ⇒ 차례 main1 fix1 main2 fix2 … (번갈아 · 한 판씩 혼자) · 판 하나 끝날 때마다 <판 폴더>/us-line.log 에 한 줄
//   node scripts/us-line.js line --dir <판 폴더> [--arm main --arm fix] [--seg]   ★[T1425] 둘째 줄 = 틱 비용 줄(틱 ms = µs × 몸 · 몸 µs · 분위 · gc) · --seg = 덩이 표(ms/틱)
//   ★★[T1467 · 재민 11-23 판정 80 "사람 한 명에게 쓰는 시간 전부 0.3µs"] **자의 첫 줄 = 틱 µs/사람** — 틱 본문 구간 합 ÷ 틱 ÷ 사람(낮 · 밤 · 최악 = p99 틱 ÷ 사람) · 몸 수 · 표본기 켬/끔을 늘 같이 적는다.
//       옛 "걸음 µs"(결정 문 안 걸음 몸통 몫 — 건너뛴 몸이 분자에서 빠지고 분모에 남는다)는 둘째 줄(지난 판과 견줌용) · 틱 ms 줄은 셋째 줄.
//       `--seg` 덩이 표는 µs/사람(합 = 첫 줄)이 먼저 · ms/틱 표(T1425)가 뒤.
//   node scripts/us-line.js touch --file <t1467 셈 판 touch.json> [--dir <시계 판 폴더> --arm <팔>]   ★[T1467] 덩이마다 만진 몸 수 · 몸 하나 ns · 달라진 것 없이 만진 몫
//       (셈 판 = `T646_PRELOAD=scripts/t1467-touch-hook.cjs T1467_TOUCH_OUT=…` 로 돈 t646 판 — 감싸기가 시간을 얹으니 ns 는 시계 판 덩이 시간 ÷ 셈 판 만진 수)
//       ⇒ 팔마다 한 줄: "main n2 · 낮 0.651 [0.623 ~ 0.709] · 밤 닫힘 앞 0.680 [0.555 ~ 0.754] · 밤 창 1.252 [...] · 결정 순회 낮 … · 밤 닫힘 앞 … · 밤 창 … · 틱 p50 낮 2.84"
//       ★[T1323] 결정 순회 = 결정 문(순회) 구간 µs/사람(몸을 건너는 몫까지 — 걸음 µs 와 같이 적는다 · T1322 회부 3)
//   틀이 없으면 먼저 굽는다: T368_TMP=<틀 폴더> T368_ARMS=t100 T687_SHARED_BUDGET=0 node scripts/t368-farm-day.js a  (기준 커밋 트리에서)
// ★µs 카드는 이 자로 잰다(인계/공통.md).
const path = require('path'), fs = require('fs'), { spawnSync } = require('child_process');
const ROOT = path.join(__dirname, '..');
const A = process.argv.slice(2), cmd = A[0];
const opt = (k, d) => { const i = A.indexOf(k); return i >= 0 ? A[i + 1] : d; };
const arms = []; for (let i = 0; i < A.length; i++) if (A[i] === '--arm') arms.push(A[i + 1]);
const DIR = path.resolve(opt('--dir', '/tmp/us-line'));
const med = (v) => { const s = v.slice().sort((a, b) => a - b), n = s.length; return n ? (n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2) : null; };
const f3 = (x) => (x == null ? '—' : (+x).toFixed(3));
if (cmd === 'run') {
  const TPL = path.resolve(opt('--tpl', path.join(DIR, 'tpl', 'tpl-t100.db'))), N = +opt('--n', '2');
  //   ★[T1425] `--conf <c>`(t646 conf — 기본 inf · cap16 = 마을당 몸 16 ≈ 800 몸) · `--nolines`(CPU 표본기 끔 — 걸음 µs 칸은 비고 구간 시계 · 틱 분위만 · 자 탓 가르기)
  const CONFN = opt('--conf', 'inf'), NOLINES = A.includes('--nolines');
  if (!fs.existsSync(TPL)) { console.error('틀이 없다: ' + TPL); process.exit(2); }
  fs.mkdirSync(DIR, { recursive: true });
  const P = arms.map((a) => { const i = a.indexOf('='), name = a.slice(0, i), rest = a.slice(i + 1), j = rest.indexOf(':'), ref = j < 0 ? rest : rest.slice(0, j), envs = j < 0 ? '' : rest.slice(j + 1);   // 첫 '=' 가 팔 · 첫 ':' 가 손잡이(손잡이 값의 '=' 는 그대로)
    return { name, ref, env: Object.fromEntries(envs.split(',').filter(Boolean).map((e) => { const k = e.indexOf('='); return [e.slice(0, k), e.slice(k + 1)]; })) }; });
  for (let i = 1; i <= N; i++) for (const p of P) {
    const tag = `${p.name}${i}`;
    if (fs.existsSync(path.join(DIR, tag + '.json'))) { console.log(`${tag} 있음 — 건너뜀`); continue; }
    const t0 = Date.now();
    const r = spawnSync(process.execPath, [path.join(ROOT, 'scripts', 't646-anatomy.js'), 'run', CONFN, tag, '--seg'].concat(NOLINES ? [] : ['--lines']).concat(['--ref', p.ref]),
      { cwd: ROOT, env: { ...process.env, ...p.env, T646_DIR: DIR, T646_TPL: TPL }, stdio: ['ignore', fs.openSync(path.join(DIR, `run-${tag}.log`), 'w'), 'inherit'] });
    const line = `${tag} ${p.ref} ${JSON.stringify(p.env)} rc=${r.status} ${Math.round((Date.now() - t0) / 1000)}초 ${new Date().toISOString()}`;
    fs.appendFileSync(path.join(DIR, 'us-line.log'), line + '\n'); console.log(line);
  }
  process.argv[2] = 'line';
}
if (cmd === 'run' || cmd === 'line') {
  spawnSync(process.execPath, [path.join(ROOT, 'scripts', 't646-anatomy.js'), 'table'], { cwd: ROOT, env: { ...process.env, T646_DIR: DIR }, stdio: 'ignore', maxBuffer: 1 << 28 });
  const T = JSON.parse(fs.readFileSync(path.join(DIR, 'table.json'), 'utf8'));
  const names = arms.length ? arms.map((a) => a.split('=')[0].split(':')[0]) : [...new Set(T.runs.map((x) => x.tag.replace(/\d+$/, '')))];   // 팔 이름이 숫자로 끝나면(`t1294`) `--arm` 으로 이름을 준다(판 이름 = 팔 + 차례 번호)
  const band = (v) => (v.length ? `${f3(med(v))} [${f3(Math.min(...v))} ~ ${f3(Math.max(...v))}]` : '—');
  const out = [];
  for (const nm of names) {
    const re = new RegExp('^' + nm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\d+$'), R = T.runs.filter((x) => re.test(x.tag)), day = R.filter((x) => x.W === 'day'), night = R.filter((x) => x.W === 'night');
    const dv = day.map((x) => (x.live ? x.live.stepUs : x.lines && x.lines.stepUs)).filter((v) => v != null);   // 결정 표본이 빠진 조각이 있으면 그 조각 뺀 셈(T1219)
    const pv = night.map((x) => (x.pre ? x.pre.stepUs : null)).filter((v) => v != null);
    const wv = night.map((x) => (x.live ? x.live.stepUs : x.lines && x.lines.stepUs)).filter((v) => v != null);
    const fl = R.filter((x) => x.flags && x.flags.length).map((x) => x.tag + ' ' + x.W);
    //   ★[T1323 · T1322 회부 3] 결정 문 순회 µs/사람 — 걸음 µs 는 `npcStep` 표본 몫이라 결정 문 고리 안에서 몸을 건너는 몫(첫 거름 · 결정 거름)을 안 센다. 이 칸이 그 몫까지 센 수(구간 시계 · 같은 판).
    const dd = day.map((x) => (x.live ? x.live.decUs : x.lines ? x.lines.decUs : x.segUs && x.segUs['결정 문(순회)'])).filter((v) => v != null);
    const pd = night.map((x) => (x.pre ? x.pre.decUs : null)).filter((v) => v != null);
    const wd = night.map((x) => (x.live ? x.live.decUs : x.lines ? x.lines.decUs : x.segUs && x.segUs['결정 문(순회)'])).filter((v) => v != null);
    const ln = `${nm} n${day.length} · 낮 ${band(dv)} · 밤 닫힘 앞 ${band(pv)} · 밤 창 ${band(wv)} · 결정 순회 낮 ${band(dd)} · 밤 닫힘 앞 ${band(pd)} · 밤 창 ${band(wd)} · 틱 p50 낮 ${f3(med(day.map((x) => x.tickP50)))}` + (fl.length ? ` · ⚠자가 표시(live 로 읽음) ${fl.join(', ')}` : '');
    //   ★★[T1425] 틱 비용과 같이 움직이는 줄(옛 줄은 그대로 위에) — 판정 32 "틱 가운데값이 왜 초과야 · 몇 명 기준".
    //     옛 "걸음 µs" = 결정 문 구간 µs/사람 × (CPU 표본 중 `npcStep` 안 표본 ÷ 결정 문 고리 표본) — **결정 문 안 걸음 몸통의 몫**이다.
    //       첫 거름 · 표로 건넌 몸은 `npcStep` 을 안 부르니 분자(표본)에서 빠지고 분모(사람)에는 남는다 ⇒ 건너뛸수록 내려간다(건너는 값은 결정 순회 칸에).
    //       이동 문(`movePlayerStep` 고리) · 커널 준비 · econ · 색인 · 방송은 하나도 안 든다.
    //     새 줄: 틱 µs = 구간 합(틱 본문) ÷ 사람 · 몸 µs = (결정 문 + 커널 준비 + 이동 문) ÷ 사람 · 덩이 표는 ms/틱(구간 µs/사람 × 사람 ÷ 1000) · 틱 분위 = 구간 시계 조각 분위의 가운데(p50 · p95 · p99) · 최대.
    const segMs = (R2, k) => med(R2.map((x) => (x.segUs[k] || 0) * x.pop / 1000));
    const tk = (R2) => ({ us: med(R2.map((x) => x.segSumUs)), body: med(R2.map((x) => (x.segUs['결정 문(순회)'] || 0) + (x.segUs['화살·걸음 커널 준비'] || 0) + (x.segUs['이동 문(순회)'] || 0))),
      ms: med(R2.map((x) => x.segSumUs * x.pop / 1000)), msBand: R2.length ? [Math.min(...R2.map((x) => x.segSumUs * x.pop / 1000)), Math.max(...R2.map((x) => x.segSumUs * x.pop / 1000))] : [null, null],
      p50: med(R2.filter((x) => x.tq).map((x) => x.tq.p50)), p95: med(R2.filter((x) => x.tq).map((x) => x.tq.p95)), p99: med(R2.filter((x) => x.tq).map((x) => x.tq.p99)),
      max: R2.filter((x) => x.tq).reduce((m, x) => Math.max(m, x.tq.max), 0), pop: med(R2.map((x) => x.pop)), gc: med(R2.map((x) => (x.subUs && x.subUs.gc) || 0)) });
    const TD = tk(day), TN = tk(night);
    const ln2 = `${nm} 틱 · 낮 ${f3(TD.ms)} ms [${f3(TD.msBand[0])} ~ ${f3(TD.msBand[1])}] = ${f3(TD.us)} µs × ${TD.pop} 몸 · 몸 µs ${f3(TD.body)} · p50 ${f3(TD.p50)} · p95 ${f3(TD.p95)} · p99 ${f3(TD.p99)} · 최대 ${f3(TD.max)} · gc µs ${f3(TD.gc)}` +
      ` ‖ 밤 ${f3(TN.ms)} ms [${f3(TN.msBand[0])} ~ ${f3(TN.msBand[1])}] = ${f3(TN.us)} µs · 몸 µs ${f3(TN.body)} · p50 ${f3(TN.p50)} · p95 ${f3(TN.p95)} · p99 ${f3(TN.p99)} · 최대 ${f3(TN.max)}`;
    const segs = [...new Set(R.flatMap((x) => Object.keys(x.segUs)))];
    out.push({ arm: nm, n: day.length, day: med(dv), pre: med(pv), win: med(wv), decDay: med(dd), decPre: med(pd), decWin: med(wd), dayBand: [Math.min(...dv), Math.max(...dv)], preBand: [Math.min(...pv), Math.max(...pv)], flags: fl,
      tick: { day: TD, night: TN, segDay: Object.fromEntries(segs.map((k) => [k, segMs(day, k)])), segNight: Object.fromEntries(segs.map((k) => [k, segMs(night, k)])) } });
    //   ★★[T1467] 첫 줄 = 틱 µs/사람(틱 본문 구간 합 ÷ 틱 ÷ 사람) · 최악 = 조각 p99 틱 ÷ 사람(낮 · 밤 가운데 큰 쪽) · 몸 수 · 표본기
    const W1 = (R2) => R2.filter((x) => x.tq && x.pop).map((x) => x.tq.p99 * 1000 / x.pop);
    const wD = med(W1(day)), wN = med(W1(night)), worst = Math.max(wD || 0, wN || 0), prof = R.some((x) => x.prof), popM = Math.round(med(R.map((x) => x.pop)));
    const ln0 = `${nm} 틱 µs/사람 낮 ${band(day.map((x) => x.segSumUs))} · 밤 ${band(night.map((x) => x.segSumUs))} · 최악 ${f3(worst)}(p99 틱 ÷ 사람 · ${(wN || 0) > (wD || 0) ? '밤' : '낮'}) · 몸 ${popM} · 표본기 ${prof ? '켬 ⚠(틈을 만든다 — T1425 ㉢)' : '끔'} · n${day.length}`;
    out[out.length - 1].first = { day: TD.us, night: TN.us, worst, worstDay: wD, worstNight: wN, pop: popM, prof, segDayUs: Object.fromEntries(segs.map((k) => [k, med(day.map((x) => x.segUs[k] || 0))])), segNightUs: Object.fromEntries(segs.map((k) => [k, med(night.map((x) => x.segUs[k] || 0))])) };
    console.log(ln0);
    console.log('  둘째 줄(옛 걸음 µs — 지난 판과 견줌용) ' + ln);
    console.log('  셋째 줄(틱 ms) ' + ln2);
  }
  if (A.includes('--seg')) {   // ★[T1467] 덩이 표 = µs/사람(판 가운데 · 합 = 첫 줄) — 낮 · 밤
    for (const W of ['segDayUs', 'segNightUs']) {
      const ks = [...new Set(out.flatMap((o) => Object.keys(o.first[W])))];
      console.log(`\n| 덩이(${W === 'segDayUs' ? '낮' : '밤'} · µs/사람) | ${out.map((o) => o.arm + ' (몸 ' + o.first.pop + ')').join(' | ')} |\n|---|${out.map(() => '---').join('|')}|`);
      for (const k of ks) console.log(`| ${k} | ${out.map((o) => f3(o.first[W][k])).join(' | ')} |`);
      console.log(`| 덩이 가운데들의 합 | ${out.map((o) => f3(Object.values(o.first[W]).reduce((t, v) => t + v, 0))).join(' | ')} |`);
      console.log(`| **첫 줄(판마다 덩이 합 = 그 판 틱 µs/사람 · 판들의 가운데)** | ${out.map((o) => '**' + f3(o.first[W === 'segDayUs' ? 'day' : 'night']) + '**').join(' | ')} |`);
    }
  }
  if (A.includes('--seg')) {   // ★[T1425] 덩이 표(ms/틱 · 판 가운데) — 낮 · 밤 · ★[T1467] µs/사람 표 뒤에(지난 판과 견줌용)
    for (const W of ['segDay', 'segNight']) {
      const ks = [...new Set(out.flatMap((o) => Object.keys(o.tick[W])))];
      console.log(`\n| 덩이(${W === 'segDay' ? '낮' : '밤'} · ms/틱) | ${out.map((o) => o.arm).join(' | ')} |\n|---|${out.map(() => '---').join('|')}|`);
      for (const k of ks) console.log(`| ${k} | ${out.map((o) => f3(o.tick[W][k])).join(' | ')} |`);
      console.log(`| **합** | ${out.map((o) => '**' + f3(o.tick[W === 'segDay' ? 'day' : 'night'].ms) + '**').join(' | ')} |`);
    }
  }
  fs.writeFileSync(path.join(DIR, 'us-line.json'), JSON.stringify(out, null, 1));
}

if (cmd === 'touch') {   // ★[T1467] 덩이마다 만진 몸 · 몸 하나 ns · 달라진 것 없이 만진 몫(셈 판 + 시계 판)
  const TJ = JSON.parse(fs.readFileSync(path.resolve(opt('--file')), 'utf8'));
  let L = null; try { L = JSON.parse(fs.readFileSync(path.join(DIR, 'us-line.json'), 'utf8')); } catch (e) {}
  const arm = opt('--arm', L && L[0] && L[0].arm), LA = L && L.find((o) => o.arm === arm);
  const res = {};
  for (const W of ['day', 'night']) {
    const B = TJ.win[W]; if (!B) continue; const t = B.ticks, pop = B.popN / t, T = B.tick;
    const xyN = Math.max(T.keys.x || 0, T.keys.y || 0), rows = [];
    console.log(`\n| 덩이(${W === 'day' ? '낮' : '밤'} · 셈 판 틱 ${t} · 표본 틱 ${B.sTicks} · 사람 ${Math.round(pop)}) | 만진 몸/틱 | 걷는 | 서 있는 | 몸 하나 ns(시계 판) | 달라진 것 없이 만진 몫 | 걷는 몸 | 서 있는 몸 |\n|---|---|---|---|---|---|---|---|`);
    let tN = 0, tU = 0, tT = 0, tTU = 0;
    for (const [k, S] of Object.entries(B.seg)) {
      const by = S.by || {}, nw = (by['걷는'] || {}).n || 0, ns = (by['서 있는'] || {}).n || 0;
      const un = S.sn ? 1 - S.chg / S.sn : (k.startsWith('공간 색인') && T.n ? 1 - xyN / T.n : null);   // 공간 색인 = 그 틱에 자리가 안 바뀐 몸 몫(재구축이 다시 넣는다)
      const u = (c) => (c && c.sn ? ((1 - c.chg / c.sn) * 100).toFixed(1) + ' %' : '—');
      const segUs = LA && LA.first ? LA.first[W === 'day' ? 'segDayUs' : 'segNightUs'][k] : null, per = S.n / t;
      const nsBody = segUs != null && per ? segUs * LA.first.pop / per * 1000 : null;
      rows.push({ seg: k, perTick: per, walk: nw / t, stand: ns / t, nsBody, unchanged: un, segUs });
      if (un != null) { tN += per; tU += per * un; if (segUs != null) { tT += segUs; tTU += segUs * un; } }
      console.log(`| ${k} | ${Math.round(per)} | ${Math.round(nw / t)} | ${Math.round(ns / t)} | ${nsBody == null ? '—' : nsBody.toFixed(0)} | ${un == null ? '—' : (un * 100).toFixed(1) + ' %'} | ${u(by['걷는'])} | ${u(by['서 있는'])} |`);
    }
    const all = tN ? tU / tN : null, allT = tT ? tTU / tT : null;
    console.log(`| **몸 덩이 합** | ${Math.round(tN)} | | | | **${all == null ? '—' : (all * 100).toFixed(1) + ' %'}**(만진 수) · ${allT == null ? '—' : (allT * 100).toFixed(1) + ' %'}(시간) | | |`);
    console.log(`  틱 전체: 표본 몸 ${T.n} · 아무것도 안 달라진 몸 ${(T.same / T.n * 100).toFixed(1)} % · 자리(x · y) 그대로 ${((1 - xyN / T.n) * 100).toFixed(1)} % · 틱 머리 갈래 ${JSON.stringify(B.cls)}`);
    console.log(`  자리 그대로인데 달라진 칸(위 15): ${Object.entries(T.keysXY).sort((a, b) => b[1] - a[1]).slice(0, 15).map(([k, v]) => k + ' ' + v).join(' · ')}`);
    res[W] = { rows, unchangedTouch: all, unchangedTime: allT, tickSame: T.same / T.n, xySame: 1 - xyN / T.n, cls: B.cls, pop };
  }
  fs.writeFileSync(path.join(DIR, 'us-touch.json'), JSON.stringify(res, null, 1));
}
