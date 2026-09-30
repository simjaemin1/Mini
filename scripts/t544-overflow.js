#!/usr/bin/env node
// (@regress 없음 — 러너 밖 계측기 · T544 자)
// =============================================================================
// T544 자 — **딴 것이 곳간에 안 들면 어디로 가나**(넘침의 행방 · 캐논 소멸 금지).
//
//   채집꾼이 딴 단위(`_t347Deliv` — 세계 걷는 목록의 손 · 마을 누계 `d`)는 곳간 입구(`forageToGranary` — 수요 문이 그날 몫까지만 받는다)를
//   지나 곳간(`_t347Gran` 누계 `g`)에 든다. 둘의 차가 **넘침**이다. 그 넘침이
//     ⓐ 짐·손에 남나(`pk` — T544 짐 · `hU` — 몸의 손) · ⓑ 바닥 실물로 놓이나(떨굼 문 — 채집 갈래엔 **없다** · 하네스 ⑳ⓐ 가 정적으로 문다)
//     ⓒ 그냥 사라지나(= 딴 − 곳간 − 짐 변화 − 손 변화)
//   를 마을·날로 센다. 항등: **딴 = 곳간 + 짐 + 사라짐**(바닥 0).
//
// ★재기만 한다(세계 0 · 읽기만). 두 가지 자료를 먹는다 — 둘 다 `/perf` 채집 행(`foragePerf` rows)의 누계 칸이다:
//   · `scripts/t347-forage-day.js` 의 JSON(`runs[판].curve[날].rows[마을]` — 헤드리스 30일 판)
//   · 이 자의 곁 창(`tap` — 도는 실서버(`t470-act-world`) `/perf` 를 하루 한 번 읽어 마을 행을 그대로 적는다 · reset 0)
//   누계 칸은 부팅에 0 에서 시작한다(`_t347Deliv`·`_t347Gran` — 생활층 마을 칸 · 짐은 econ 칸이라 틀에 있으면 그 값에서 · `--pk0` 로 판마다 첫 표본 짐을 밑으로).
//   게이트가 닫힌 마을은 행이 빠진다 — 누계는 마지막으로 본 값이다(닫힌 뒤엔 딸 수 없으니 누계가 안 는다).
//
// 쓰는 법:
//   node scripts/t544-overflow.js table <json|dir>... [--villages] [--wide] [--md] [--upto=N]  … 판마다 합 · 행방 · (마을 표 · 마을 × 판 한 표 · N 일째까지)
//   node scripts/t544-overflow.js tap <outdir>:<port>[:<secret>] ...           … 실서버 곁 창(하루 한 번 · 끝나면 스스로 멈춘다)
// =============================================================================
'use strict';
const fs = require('fs');
const path = require('path');

const MODE = process.argv[2];
if (MODE === 'tap') tap(process.argv.slice(3));
else if (MODE === 'table') table(process.argv.slice(3));
else { console.error('쓰는 법: table <json|dir>... [--villages] [--wide] [--md] [--pk0] [--upto=N] · tap <outdir>:<port>[:<secret>] ...'); process.exit(2); }

// ── 곁 창 — `/perf` 채집 행을 하루 한 번 그대로 적는다(읽기만 · reset 0) ─────────────────
function tap(args) {
  const zs = args.map((x) => { const [d, port, sec] = x.split(':'); return { d, port: +port, sec: sec || 't470-forage_1020', last: null, f: path.join(d, 't544-tap.json') }; });
  const get = async (z) => { try { const r = await fetch(`http://localhost:${z.port}/perf`, { headers: { 'x-zone-secret': z.sec } }); return await r.json(); } catch (e) { return null; } };
  (async () => {
    for (;;) {
      let alive = 0;
      for (const z of zs) {
        const p = await get(z); if (!p) continue; alive++;
        const day = (p.econTick && p.econTick.last && p.econTick.last.day) || 0;
        if (day === z.last || !p.forage) continue; z.last = day;
        let o = { days: [] }; try { o = JSON.parse(fs.readFileSync(z.f, 'utf8')); } catch (e) {}
        const f = p.forage;
        o.days.push({ day, at: new Date().toISOString(), act: f.actVillages, groves: f.groves, gran: f.gran,
          rows: (f.rows || []).map((q) => ({ n: q.n, d: q.d, g: q.g, pk: q.pk, pko: q.pko, ow: q.ow, hU: q.hU, fg: q.fg, f: q.f, mix: q.mix, K: q.K, N: q.N,
            pick: q.dbg && q.dbg.pick, units: q.dbg && q.dbg.units, dem: q.dbg && q.dbg.dem, pkIn: q.dbg && q.dbg.pkIn, hold: q.dbg && q.dbg.hold })) });
        fs.writeFileSync(z.f, JSON.stringify(o));
      }
      if (!alive && zs.every((z) => z.last != null)) break;
      await new Promise((r) => setTimeout(r, 60000));
    }
  })();
}

// ── 표 ──────────────────────────────────────────────────────────────────────────
function table(args) {
  const VIL = args.includes('--villages'), MD = args.includes('--md'), PK0 = args.includes('--pk0');
  //   `--upto=N` — N 일째까지만 센다(두 판의 표본 날 수가 다를 때 같은 창으로 견준다)
  const UPTO = (() => { const a = args.find((x) => x.startsWith('--upto=')); return a ? +a.slice(7) : Infinity; })();
  const files = [];
  for (const a of args.filter((x) => !x.startsWith('--'))) {
    const [label, p] = a.includes('=') ? a.split('=') : [null, a];
    let st = null; try { st = fs.statSync(p); } catch (e) { console.error('없다: ' + p); continue; }
    if (st.isDirectory()) { for (const f of ['t544-tap.json', 'tap2.json']) { const q = path.join(p, f); if (fs.existsSync(q)) { files.push({ label: label || path.basename(p), f: q }); break; } } }
    else files.push({ label: label || path.basename(p, '.json'), f: p });
  }
  //   반올림 자리 밑의 음수(−0.0)는 0 으로 적는다 — 누계 칸이 넷째 자리에서 반올림된 값이라 항등의 끝수가 ±1e-4 로 흔들린다
  const f1 = (x, d = 1) => (x == null ? '—' : (Math.abs(+x) < 0.5 * Math.pow(10, -d) ? 0 : +x).toFixed(d)), f0 = (x) => (x == null ? '—' : Math.round(x).toLocaleString('en-US'));
  const out = [];
  for (const { label, f } of files) {
    const J = JSON.parse(fs.readFileSync(f, 'utf8'));
    //   판 목록 — t347 자는 `runs[판].curve` · 곁 창은 `days` 하나
    const runs = J.runs ? Object.entries(J.runs).map(([k, r]) => [k, r.curve || []]) : [['실서버', J.days || []]];
    for (const [rk, curve] of runs) {
      const per = new Map(); let days = 0, holdN = 0, pkInT = 0;
      const sorted = curve.filter((dd) => dd.day <= UPTO).sort((a, b) => a.day - b.day);
      for (const dd of sorted) {
        days++;
        for (const q of (dd.rows || [])) {
          const v = per.get(q.n) || { n: q.n, seen: 0, d: 0, g: 0, pk: 0, pko: 0, pk0: null, hU: 0, hU0: null, ow: 0, hold: 0, pkIn: 0, lastDay: 0 };
          per.set(q.n, v); v.seen++;
          if (typeof q.d === 'number') v.d = Math.max(v.d, q.d);
          if (typeof q.g === 'number') v.g = Math.max(v.g, q.g);
          if (typeof q.pk === 'number') { if (v.pk0 == null) v.pk0 = q.pk; v.pk = q.pk; }
          if (typeof q.pko === 'number') v.pko = q.pko;
          if (typeof q.hU === 'number') { if (v.hU0 == null) v.hU0 = q.hU; v.hU = q.hU; }
          if (typeof q.ow === 'number') v.ow = q.ow;
          if (q.hold) { v.hold++; holdN++; }
          if (typeof q.pkIn === 'number') { v.pkIn += q.pkIn; pkInT += q.pkIn; }
          v.lastDay = dd.day;
        }
      }
      const rows = [...per.values()].map((v) => {
        const pkBase = PK0 ? (v.pk0 || 0) : 0, hBase = v.hU0 || 0;
        const dK = v.pk - pkBase, dH = v.hU - hBase;
        const lost = +(v.d - v.g - dK - dH).toFixed(6);
        return Object.assign(v, { dK, dH, lost, over: +(v.d - v.g).toFixed(6) });
      });
      const S = (k) => rows.reduce((s, r) => s + (r[k] || 0), 0);
      const R = { label, run: rk, days, villages: rows.length, picked: S('d'), gran: S('g'), over: S('over'), pack: S('dK'), packOther: S('pko'), hands: S('dH'), lost: S('lost'), owe: S('ow'), holdN, pkIn: pkInT,
        overV: rows.filter((r) => r.over > 1e-3).length, lostV: rows.filter((r) => r.lost > 1e-3).length, rows };   // 마을 셈은 표시 자리(0.001)로 — `/perf` 행이 넷째 자리에서 반올림된다
      out.push(R);
    }
  }
  // 판을 라벨로 합친다(판 셋 → 한 줄)
  const byL = new Map();
  for (const R of out) { const a = byL.get(R.label) || { label: R.label, runs: 0, days: 0, villages: 0, picked: 0, gran: 0, over: 0, pack: 0, packOther: 0, hands: 0, lost: 0, owe: 0, holdN: 0, pkIn: 0, overV: 0, lostV: 0 };
    byL.set(R.label, a); a.runs++; for (const k of ['days', 'villages', 'picked', 'gran', 'over', 'pack', 'packOther', 'hands', 'lost', 'owe', 'holdN', 'pkIn', 'overV', 'lostV']) a[k] += R[k]; }
  const where = (a) => (a.lost > 1e-3 ? `ⓒ 사라짐 ${f1(a.lost)}단` : '') + (a.pack + a.hands > 1e-3 ? `${a.lost > 1e-3 ? ' · ' : ''}ⓐ 짐·손 ${f1(a.pack + a.hands)}단` : '') + (a.lost <= 1e-3 && a.pack + a.hands <= 1e-3 ? '넘침 0' : '');
  if (MD) {
    console.log('| 판 | 판·날 | 마을(넘친 · 사라진) | 딴 단위 | 곳간 | 넘침(딴 − 곳간) | 짐(곳간에 들 것) | 손 | **사라짐** | 행방 | 딴 ÷ 곳간 | 미룬 날 · 짐에서 든 몫 · 끝 미룬 몫 | 목록 밖 손(짐) |');
    console.log('|---|---:|---|---:|---:|---:|---:|---:|---:|---|---:|---|---:|');
    for (const a of byL.values()) console.log(`| ${a.label} | ${a.days} | ${a.villages}(${a.overV} · ${a.lostV}) | ${f1(a.picked)} | ${f1(a.gran)} | ${f1(a.over)} | ${f1(a.pack)} | ${f1(a.hands)} | **${f1(a.lost)}** | ${where(a)} | ${a.gran > 0 ? f1(a.picked / a.gran, 3) : '—'} | ${a.holdN} · ${f1(a.pkIn)} · ${f1(a.owe, 2)} | ${f1(a.packOther)} |`);
  } else {
    for (const a of byL.values()) console.log(`${a.label} · 판 ${a.runs} · 판·날 ${a.days} · 마을 ${a.villages} · 딴 ${f1(a.picked)} · 곳간 ${f1(a.gran)} · 넘침 ${f1(a.over)} · 짐 ${f1(a.pack)} · 손 ${f1(a.hands)} · 사라짐 ${f1(a.lost)} · 딴÷곳간 ${a.gran > 0 ? f1(a.picked / a.gran, 3) : '—'} · 미룬 날 ${a.holdN} · 짐에서 든 ${f1(a.pkIn)} · 끝 미룬 몫 ${f1(a.owe, 2)} · 목록 밖 손 ${f1(a.packOther)} → ${where(a)}`);
  }
  //   `--wide` — 마을 한 줄에 판(라벨)을 칸으로(딴 · 든 · 넘침 + 행방 표시 ⓐ 짐·손 / ⓒ 사라짐) · 넘침 큰 마을부터
  if (args.includes('--wide')) {
    const labs = [...byL.keys()], vm = new Map();
    for (const R of out) for (const r of R.rows) { const m = vm.get(r.n) || {}; vm.set(r.n, m); m[R.label] = r; }
    const cell = (r) => (!r ? '—' : `${f1(r.d)} · ${f1(r.g)} · ${f1(r.over)}${r.lost > 1e-3 ? ' ⓒ' : ''}${(r.dK + r.dH) > 1e-3 ? ' ⓐ' : ''}`);
    console.log(`\n| 마을 | ${labs.map((l) => `${l} 딴 · 든 · 넘침`).join(' | ')} |`);
    console.log(`|---|${labs.map(() => '---:').join('|')}|`);
    const tot = (n) => labs.reduce((s, l) => s + ((vm.get(n)[l] || {}).over || 0), 0);
    for (const n of [...vm.keys()].sort((a, b) => (tot(b) - tot(a)) || a.localeCompare(b))) console.log(`| ${n} | ${labs.map((l) => cell(vm.get(n)[l])).join(' | ')} |`);
    console.log(`| **합** | ${labs.map((l) => { const a = byL.get(l); return `**${f1(a.picked)} · ${f1(a.gran)} · ${f1(a.over)}**`; }).join(' | ')} |`);
  }
  if (VIL) for (const R of out) {
    console.log(`\n${R.label} · ${R.run} — 마을 ${R.villages}(딴 − 곳간 > 0: ${R.overV})`);
    console.log('| 마을 | 본 날 | 딴 | 곳간 | 넘침 | 짐 | 손 | 사라짐 | 딴÷곳간 | 미룬 날 |');
    console.log('|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|');
    for (const r of R.rows.sort((a, b) => (b.over - a.over) || (b.d - a.d))) console.log(`| ${r.n} | ${r.seen} | ${f1(r.d)} | ${f1(r.g)} | ${f1(r.over)} | ${f1(r.dK)} | ${f1(r.dH)} | ${f1(r.lost)} | ${r.g > 0 ? f1(r.d / r.g, 2) : '—'} | ${r.hold} |`);
  }
}
