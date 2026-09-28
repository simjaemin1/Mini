#!/usr/bin/env node
// === scripts/t496-table.js — T496 표: ① 두 자 바이트 동일 · 소문 도달 분포 ② 쉬는 짐꾼 3시드 ③ 밀도 눈금 ===
//
// ⚠**표 짜는 기계다. 하네스가 아니다** — 러너에 넣지 않는다.
//   읽는 것(판 폴더 둘 + 존 기하 하나):
//     <runs>/main-<시드>.json            맨 t17(main 워크트리 — 소문 분리 끔 = 종전)
//     <runs>/<팔>-<시드>.json            t17 JSON(가지 · `scripts/t474-arm.js` 가 같은 프로세스에서 낸 것)
//     <runs>/arm-<팔>-<시드>.json        관측(캐러밴 · 장부 · 눈금 · 소문 도달 · 마을별)
//       팔: off(기본 = 소문 분리 켬 · 장부에 지리) · walk(T474) · rest(T474 + T496 쉬는 짐꾼) · walkm(T474 + `T489_RUMOR_SPLIT=0` 소문 거울)
//     <t176>/main-<시드>.json · plain-<시드>.json · geo-<시드>.json(+ `geo-<시드>.log` 의 `[geo-preload]` 줄)
//     <clocks.json>                      `scripts/t474-clocks.js`(존 기하 — 소문 쌍 도달 날 · 출발 마을당 전 마을)
//
// ★산수는 나눗셈·합·최소제곱뿐이다(새 수 0):
//   ㉮  = 살아 있는 마을 × 날 ÷ 사건(t17 ⓚ 그 식 · 반올림 전) · ㉯ = 같은 분자 ÷ 값 유형 사건(t17 `eventsValue`)
//   ㉮′ = ㉮ × 팔 사람·일 ÷ 끔 사람·일(인구를 끔 세계에 맞춰 편 밀도 — T489 사람 눈금)
//   ㉮″ = ㉮ × 끝 인구 ÷ 캐논 당시 끝 인구(시드별) — 캐논 문장이 정박될 때(T17 이전 · 2026-09-02)의 마을 크기로 편 밀도.
//         캐논 당시 인구는 `인계/공통.md` "옛(T17 이전)" 줄을 **글에서 읽는다**(옮겨 적지 않는다).
//         ⚠㉮′·㉮″ 는 "사건은 사람 수에 비례한다"는 **가정**의 값이다 — 그 가정은 아래 단면 탄성 β 가 잰다.
//   β(단면 탄성) = 마을마다 log(사건 ÷ 날)을 log(평균 인구)에 최소제곱한 기울기(인구 0 마을 뺌 · 시드마다) —
//         β = 1 이면 사건이 사람 수에 비례(사람 눈금이 자연) · β = 0 이면 마을 크기와 무관(마을 눈금이 자연).
//   가름은 T252 자 그대로(`인계/공통.md` §3: 부호 3/3 그리고 |평균| > 폭 → 가름 · 부호 3/3 · |평균| ≤ 폭 → 방향만 · 갈림 → 못 가름).
//   캐논 = "마을당 2~3일에 1건"(`설계/설계_게임성_사건레이어_TODO.md` §10.1 · 목표치 [확정]).
//
// 실행: node scripts/t496-table.js <runs> <t176> <clocks.json> [시드…]      (기본 시드 1020 7 42)
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const RUNS = process.argv[2] || '/tmp/t496/runs';
const T176 = process.argv[3] || '/tmp/t496/t176';
const CLOCKS = process.argv[4] || '/tmp/t496/clocks.json';
const SEEDS = process.argv.length > 5 ? process.argv.slice(5).map(Number) : [1020, 7, 42];
const rdj = (p) => { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch (e) { return null; } };
const rd = (f) => rdj(path.join(RUNS, f));
const same = (a, b) => { try { return fs.readFileSync(a).equals(fs.readFileSync(b)); } catch (e) { return false; } };
const mean = (xs) => xs.reduce((p, x) => p + x, 0) / xs.length;
const f2 = (x) => (x == null || !isFinite(x) ? '—' : x.toFixed(2));
const f3 = (x) => (x == null || !isFinite(x) ? '—' : x.toFixed(3));
const n0 = (x) => (x == null || !isFinite(x) ? '—' : Math.round(x).toLocaleString('en-US'));
const pc = (x) => (x == null || !isFinite(x) ? '—' : (x >= 0 ? '+' : '') + x.toFixed(1) + '%');
const verdict = (ds) => {
  if (ds.every((d) => d === 0)) return { v: '= 0', m: 0, w: 0 };
  const pos = ds.filter((d) => d > 0).length, neg = ds.filter((d) => d < 0).length;
  const m = mean(ds), w = Math.max(...ds) - Math.min(...ds);
  return { v: (pos === ds.length || neg === ds.length) ? (Math.abs(m) > w ? '가름' : '방향만') : '못 가름', m, w };
};
const out = [];
const P = (s) => out.push(s);
const ARMS = ['off', 'walk', 'rest', 'walkm'];
const NAME = { off: '기본(소문 분리 켬 · T474 끔)', walk: 'T474(캐러밴 = 몸)', rest: 'T474 + T496(쉬는 짐꾼)', walkm: 'T474 + 소문 거울(`=0`)' };
const T = {}, A = {};
for (const a of ARMS) { T[a] = SEEDS.map((s) => rd(`${a}-${s}.json`)); A[a] = SEEDS.map((s) => rd(`arm-${a}-${s}.json`)); }
const have = (a) => T[a].every(Boolean) && A[a].every(Boolean);
const densA = (t) => t.live * t.days / t.board.emitted;               // ㉮(반올림 전)
const densV = (t) => t.live * t.days / t.eight.eventsValue;           // ㉯(반올림 전)

// ── 캐논 당시 인구 — `인계/공통.md` "옛(T17 이전)" 세 줄(글에서 읽는다) ──────────────────
const COMMON = fs.readFileSync(path.join(ROOT, '인계', '공통.md'), 'utf8');
const canonPop = {};
{
  const i = COMMON.indexOf('옛(T17 이전)');
  const blk = i >= 0 ? COMMON.slice(i, i + 600) : '';
  for (const m of blk.matchAll(/(\d+): 인구 ([\d,]+) · [^\n]*?([\d.]+)일\/건/g)) canonPop[+m[1]] = { pop: +m[2].replace(/,/g, ''), dens: +m[3] };
}

// ═══ ① 두 자 바이트 동일 ═══════════════════════════════════════════════════════
P('## ① 소문 분리 기본 켬 — 두 자 3시드 바이트 동일');
P('');
P(`| 자 · 판 | ${SEEDS.join(' | ')} |`); P(`|---|${SEEDS.map(() => '---').join('|')}|`);
P(`| t17 — 가지 기본(소문 = 몸 · 장부에 지리 · 소문 그래프가 돈 판) ↔ main | ${SEEDS.map((s) => (same(path.join(RUNS, `off-${s}.json`), path.join(RUNS, `main-${s}.json`)) ? '**동일**' : '다름')).join(' | ')} |`);
if (have('off')) P(`| (그 판 장부 소문 그래프 — 속도 · 걸음 · 적중) | ${A.off.map((x) => (x.ledgerRumor ? `${x.ledgerRumor.speed} · ${x.ledgerRumor.walks} · ${x.ledgerRumor.hits}` : '없음')).join(' | ')} |`);
P(`| t17 — T474 켬: 소문 = 몸 ↔ 소문 거울(\`=0\`) | ${SEEDS.map((s) => (same(path.join(RUNS, `walk-${s}.json`), path.join(RUNS, `walkm-${s}.json`)) ? '**동일**' : '다름')).join(' | ')} |`);
P(`| t176-ab — 가지 기본(맨 자) ↔ main | ${SEEDS.map((s) => (same(path.join(T176, `plain-${s}.json`), path.join(T176, `main-${s}.json`)) ? '**동일**' : '다름')).join(' | ')} |`);
P(`| t176-ab — 가지 기본 + 지리(\`t496-geo-preload\` · 소문 그래프가 돈 판) ↔ main | ${SEEDS.map((s) => (same(path.join(T176, `geo-${s}.json`), path.join(T176, `main-${s}.json`)) ? '**동일**' : '다름')).join(' | ')} |`);
{
  const lines = SEEDS.map((s) => { try { const m = fs.readFileSync(path.join(T176, `geo-${s}.log`), 'utf8').match(/\[geo-preload\][^\n]*/); return m ? m[0] : '없음'; } catch (e) { return '없음'; } });
  P(`| (t176 지리 판 — preload 줄) | ${lines.map((l) => { const w = l.match(/"walks":(\d+)/), h = l.match(/"hits":(\d+)/), sp = l.match(/소문 시계 (\d+)/); return w ? `${sp ? sp[1] : '?'} · ${w[1]} · ${h ? h[1] : '?'}` : l; }).join(' | ')} |`);
}
P('');

// ═══ ① 소문 도달 분포 ═══════════════════════════════════════════════════════════
if (have('off')) {
  P('## ① 소문 도달 분포 — 종전 거울(500) ↔ 기본(몸 7,200)');
  P('');
  P('**t17 기하**(econ `villageDist` · 사건 × 마을 전수 · 기본 판 `arm-off` 의 두 셈 — `rumor` = 캐러밴 시계 500 · `rumorCode` = 코드 그대로):');
  P('');
  P(`| 수 | 종전 ${SEEDS.join(' · ')} | 기본 ${SEEDS.join(' · ')} |`); P('|---|---|---|');
  const row = (name, f) => P(`| ${name} | ${A.off.map((x) => f(x.rumor)).join(' · ')} | ${A.off.map((x) => f(x.rumorCode)).join(' · ')} |`);
  row('시계(econ/일)', (r) => String(r.speed));
  row('(사건 × 마을) 도달 날 p10/p50/p90/최대', (r) => `${r.delay.p10}/${r.delay.p50}/${r.delay.p90}/${r.delay.max}`);
  row('평균 지연(일)', (r) => f2(r.meanDelay));
  row('7일 안에 닿는 몫(쌍)', (r) => f2(r.delay.within7));
  row('한 사건이 7일 안에 닿는 마을 수 p50', (r) => String(r.in7.p50));
  row('한 사건이 전 마을에 닿는 날 p50/최대', (r) => `${r.fullReach.p50}/${r.fullReach.max}`);
  row('판 끝까지 들은 몫', (r) => f3(r.heardByEnd));
  P('');
}
{
  const C = rdj(CLOCKS);
  if (C && C.rumorPairs) {
    const rp = C.rumorPairs, rr = C.rumorReach;
    P(`**존 기하**(한반도 ${C.N}곳 · 지형 BFS 거리행렬 · 다리 포함 · 유한 쌍 ${rp.mirror.n} — \`scripts/t474-clocks.js\`):`);
    P('');
    P('| 수 | 종전 거울 | 기본(코드) |'); P('|---|---|---|');
    P(`| 시계(econ/일) | ${rp.mirrorSpeed} | ${rp.codeSpeed} |`);
    P(`| 쌍 도달 날 p10·p50·p90·최대 | ${rp.mirror.p10}·${rp.mirror.p50}·${rp.mirror.p90}·${rp.mirror.max} | ${rp.code.p10}·${rp.code.p50}·${rp.code.p90}·${rp.code.max} |`);
    P(`| 쌍 평균 · 하루 몫 · 7일 안 몫 | ${rp.mirror.mean} · ${rp.mirror.oneDay} · ${rp.mirror.within7} | ${rp.code.mean} · ${rp.code.oneDay} · ${rp.code.within7} |`);
    P(`| 출발 마을당 전 마을 도달 p50 · 최대 | ${rr.off.allDay.p50} · ${rr.off.allDay.max} | ${rr.code.allDay.p50} · ${rr.code.allDay.max} |`);
    P(`| 출발 마을당 7일 안 마을 수 p10·p50 | ${rr.off.in7.p10}·${rr.off.in7.p50} | ${rr.code.in7.p10}·${rr.code.in7.p50} |`);
    P('');
  }
}

// ═══ ② 쉬는 짐꾼 3시드 ══════════════════════════════════════════════════════════
const get = (o, p) => p.split('.').reduce((a, k) => (a == null ? a : a[k]), o);
const COLS = [
  ['캐러밴 시계(econ/일)', (t, a) => a.clocks.caravan, 'clock'],
  ['캐러밴 띄운 수', (t, a) => a.caravan.launched],
  ['도착(`_tradeAudit.n`)', (t, a) => a.caravan.audit.arrived],
  ['  손절(bail)', (t, a) => a.caravan.audit.bail],
  ['  재routing', (t, a) => a.caravan.audit.reroute],
  ['캐러밴 날 평균(최근 기록)', (t, a) => a.caravan.travelDays.mean],
  ['인구', (t) => t.base.pop],
  ['소멸', (t) => t.base.dead, 'dead'],
  ['무기Q', (t) => t.base.weapQ],
  ['확장셀', (t) => t.base.expand],
  ['게시', (t) => t.board.reqOpened],
  ['도구Q', (t) => t.tool.q],
  ['보존식', (t) => t.preserve.stock],
  ['생곡', (t) => t.eight.grain],
  ['사건', (t) => t.board.emitted],
  ['값 사건(부족·글럿·값 오름·값 내림)', (t, a) => ['STOCK_SHORTAGE', 'STOCK_GLUT', 'PRICE_SPIKE', 'PRICE_DROP'].reduce((s, k) => s + (a.ledger.byType[k] || 0), 0)],
  ['깨진 약속(T142)', (t, a) => a.ledger.reqRevalidated],
  ['사람·일', (t, a) => a.scale.personDays],
  ['㉮ 마을 눈금(일/건)', (t) => densA(t), 'dens'],
  ['㉯ 값 유형(일/건)', (t) => densV(t), 'dens'],
];
if (have('off') && (have('rest') || have('walk'))) {
  P('## ② 쉬는 짐꾼 — 3시드 800일(넷째 판-c 위 · T252 짝 Δ 는 기본 판 대비)');
  P('');
  const arms = ['off', 'walk', 'rest'].filter(have);
  P(`| 수 | ${arms.map((a) => `${NAME[a]} ${SEEDS.join(' · ')}`).join(' | ')} | ${arms.filter((a) => a !== 'off').map((a) => `${a} Δ% · T252`).join(' | ')} |`);
  P(`|---|${arms.map(() => '---').join('|')}|${arms.filter((a) => a !== 'off').map(() => '---').join('|')}|`);
  for (const [name, f, kind] of COLS) {
    const vals = {}; for (const a of arms) vals[a] = SEEDS.map((_, i) => f(T[a][i], A[a][i]));
    const fmt = (x) => (kind === 'dens' ? f2(x) : (kind === 'clock' ? f2(x) : (Number.isInteger(x) ? n0(x) : (Math.abs(x) >= 100 ? n0(x) : f2(x)))));
    const cells = arms.map((a) => vals[a].map(fmt).join(' · '));
    const ds = arms.filter((a) => a !== 'off').map((a) => {
      if (kind === 'clock') return '—';
      if (kind === 'dead') return `${vals.off.join('·')}→${vals[a].join('·')}`;
      const d = SEEDS.map((_, i) => (vals.off[i] ? (vals[a][i] - vals.off[i]) / Math.abs(vals.off[i]) * 100 : 0));
      const v = verdict(d);
      return `${pc(v.m)} · ${v.v}`;
    });
    P(`| ${name} | ${cells.join(' | ')} | ${ds.join(' | ')} |`);
  }
  P('');
  // ㉮′ · 도착 배수 · 띄운 배수(기본 판 대비 · 시드별)
  const pd0 = A.off.map((a) => a.scale.personDays);
  P(`| 팔 | ㉮′ 사람 눈금(끔 인구) ${SEEDS.join(' · ')} | 도착 배수 ${SEEDS.join(' · ')} · 평균 | 띄운 배수 · 평균 | 값 사건 ÷ 도착 |`);
  P('|---|---|---|---|---|');
  const VAL = ['STOCK_SHORTAGE', 'STOCK_GLUT', 'PRICE_SPIKE', 'PRICE_DROP'];
  for (const a of arms) {
    const dA = T[a].map(densA), dP = dA.map((d, i) => d * A[a][i].scale.personDays / pd0[i]);
    const arr = A[a].map((x, i) => x.caravan.audit.arrived / A.off[i].caravan.audit.arrived);
    const lau = A[a].map((x, i) => x.caravan.launched / A.off[i].caravan.launched);
    const vpa = A[a].map((x) => VAL.reduce((s2, k) => s2 + (x.ledger.byType[k] || 0), 0) / x.caravan.audit.arrived);
    P(`| ${NAME[a]} | ${dP.map(f2).join(' · ')} | ×${arr.map(f2).join(' · ×')} · ×${f2(mean(arr))} | ×${lau.map(f2).join(' · ×')} · ×${f2(mean(lau))} | ${vpa.map(f2).join(' · ')} |`);
  }
  if (have('walk') && have('rest')) {
    const d = SEEDS.map((_, i) => (densA(T.rest[i]) - densA(T.walk[i])) / densA(T.walk[i]) * 100);
    const v = verdict(d);
    P('');
    P(`쉬는 짐꾼 ↔ T474(캐러밴 = 몸) ㉮ 짝 Δ: ${d.map(pc).join(' · ')} → ${pc(v.m)} · ${v.v}`);
  }
  P('');
}

// ═══ ③ 밀도 눈금 ════════════════════════════════════════════════════════════════
if (have('off')) {
  P('## ③ 밀도 눈금 — ㉮ 마을 · ㉯ 값 유형 · ㉮′ 사람(끔 세계 인구) · ㉮″ 사람(캐논 당시 인구)');
  P('');
  P(`캐논 당시(\`인계/공통.md\` "옛(T17 이전)" — 2026-09-02 정박): ${SEEDS.map((s) => (canonPop[s] ? `${s} 인구 ${n0(canonPop[s].pop)} · ${canonPop[s].dens}일/건` : `${s} ?`)).join(' · ')}`);
  P('');
  P('| 팔 | ㉮ | ㉯ | ㉮′(끔 인구) | ㉮″(캐논 당시 인구) | 끝 인구 | 캐논 2~3(㉮ · ㉯ · ㉮″) |'); P('|---|---|---|---|---|---|---|');
  const pd0 = A.off.map((a) => a.scale.personDays);
  const inC = (xs) => (xs.every((x) => x >= 2 && x <= 3) ? '○' : (xs.some((x) => x >= 2 && x <= 3) ? '△' : '✗'));
  for (const a of ['off', 'walk', 'rest'].filter(have)) {
    const dA = T[a].map(densA), dV = T[a].map(densV), dP = dA.map((d, i) => d * A[a][i].scale.personDays / pd0[i]);
    const dC = dA.map((d, i) => (canonPop[SEEDS[i]] ? d * T[a][i].base.pop / canonPop[SEEDS[i]].pop : NaN));
    P(`| ${NAME[a]} | ${dA.map(f2).join(' · ')} | ${dV.map(f2).join(' · ')} | ${dP.map(f2).join(' · ')} | ${dC.map(f2).join(' · ')} | ${T[a].map((t) => n0(t.base.pop)).join(' · ')} | ${inC(dA)} · ${inC(dV)} · ${inC(dC)} |`);
  }
  P('');
  // 단면 탄성 β
  const beta = (pv, key) => {
    const xs = [], ys = [];
    pv.meanPop.forEach((p, i) => { const e = pv[key][i]; if (p > 0 && e > 0) { xs.push(Math.log(p)); ys.push(Math.log(e)); } });
    const mx = mean(xs), my = mean(ys);
    let sxy = 0, sxx = 0, syy = 0; for (let i = 0; i < xs.length; i++) { sxy += (xs[i] - mx) * (ys[i] - my); sxx += (xs[i] - mx) ** 2; syy += (ys[i] - my) ** 2; }
    return { b: sxy / sxx, r2: (sxy * sxy) / (sxx * syy), n: xs.length };
  };
  P('**단면 탄성 β**(마을마다 log 사건 ~ log 평균 인구 · 최소제곱 · 한 판 안 51곳):');
  P('');
  P(`| 팔 | 전체 사건 β(R²) ${SEEDS.join(' · ')} | 값 사건 β(R²) |`); P('|---|---|---|');
  for (const a of ['off', 'walk', 'rest', 'walkm'].filter(have)) {
    const bs = A[a].map((x) => (x.perVillage ? beta(x.perVillage, 'ev') : null));
    const bv = A[a].map((x) => (x.perVillage ? beta(x.perVillage, 'evValue') : null));
    P(`| ${NAME[a]} | ${bs.map((b) => (b ? `${f2(b.b)}(${f2(b.r2)})` : '—')).join(' · ')} | ${bv.map((b) => (b ? `${f2(b.b)}(${f2(b.r2)})` : '—')).join(' · ')} |`);
  }
  P('');
}
console.log(out.join('\n'));
