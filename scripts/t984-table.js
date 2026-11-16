'use strict';
// (@regress 없음 — 러너 밖 · T984 표 기계 · 제품 무변)
// === scripts/t984-table.js — 도적 보호기 끝 전후(800날 판) · 보호막 끔 × 도적 켬/끔 — 습격 · 손실 · 굶주림 · 소멸 ===
//   쓰는 법: node scripts/t984-table.js --arm C=<dir>[,<대조 dir>…] --arm D=<dir> [--json out]
//     dir = `t577-server-run.js` 의 T577_DIR(그 안 `base-<시드>.t951.json` · `.t934.json` · `base-<시드>.json`)
//     C 의 둘째 dir 부터는 T837 갈림 대조(`DCTL_SKIP=raid:n`) — 셈마다 띠(최소 ~ 최대)
//   도적 보호기 끝나는 날 = `server/bandits.js` `_bdtOpenDay` 정본 그대로(그 파일 원문을 컴파일해 부른다 · 사본 0 — T951 표 기계와 같은 문).
//   굶주림 몫 = 죽음이 난 마을-날의 음수 칸(logi · hunger · health · happy · prestige) 크기 비(T934 · T951 근사).
//   소멸 = 그 마을 인구가 0 이 된 첫 날(t934 rows · 판 끝까지 0).
const fs = require('fs');
const path = require('path');
const Module = require('module');
const ROOT = path.join(__dirname, '..');
const A = process.argv.slice(2);
const arms = {}; let jOut = null;
for (let i = 0; i < A.length; i++) {
  if (A[i] === '--arm') { const [k, v] = A[++i].split('='); arms[k] = v.split(','); }
  else if (A[i] === '--json') jOut = A[++i];
}
const SEEDS = ['1020', '7', '42'];
const W = 60;   // 전후 창(날) — 보고 표의 폭(새 수 아님 · 자 옵션)
function bdtOpen() {
  const f = path.join(ROOT, 'server', 'bandits.js');
  const m = new Module(f, module); m.filename = f; m.paths = Module._nodeModulePaths(path.dirname(f));
  //   ★[T984 정정] `denRng` 의 씨 `S.denSeed` 는 운영에서 `init(host)` 가 `host.seed`(= 존 설정 `villageSeed` · 한반도 1020)로 놓는다 — 원문만 컴파일하면 씨가 비어
//     보호기 끝 날이 운영과 달랐다(T951 표의 '도적 보호기 끝' 열이 그 값이었다). 같은 문(존 설정 → `(seed >>> 0) || 1`)으로 놓고 부른다.
  const zs = (() => { const Z = require(path.join(ROOT, 'server', 'zone-config')); const z = (Z.ZONES || Z.zones || Z).hanbando || (Z.getZone && Z.getZone('hanbando')); return (z && z.villageSeed) || 1020; })();
  m._compile(fs.readFileSync(f, 'utf8') + '\n;S.denSeed = (' + zs + ' >>> 0) || 1; module.exports.__t984Open = _bdtOpenDay; module.exports.__t984Min = BDT_MIN_DAY;', f);
  return { open: m.exports.__t984Open, min: m.exports.__t984Min };
}
const BO = bdtOpen();
const SHIELD = +((fs.readFileSync(path.join(ROOT, 'sim', 'economy-sim.js'), 'utf8').match(/const SHIELD_DAYS = (\d+);/) || [])[1] || 365);
const load = (d, s, ext) => { try { const suf = `-${s}${ext ? '.' + ext : ''}.json`; const f = fs.readdirSync(d).find((x) => x.endsWith(suf)); return f ? JSON.parse(fs.readFileSync(path.join(d, f), 'utf8')) : null; } catch (e) { return null; } };   // 판 이름(base · enable_bandits0 …)은 아무거나 — 시드 · 칸으로 찾는다
function one(d, s) {
  const t = load(d, s, 't934'), o = load(d, s, 't951'), run = load(d, s, '');
  if (!t) return null;
  const names = t.names, N = names.length;
  const V = names.map((n) => ({ n, open: BO.open({ name: n }), deaths: [0, 0, 0], hunger: [0, 0, 0], loot: [0, 0, 0], lootFE: [0, 0, 0], toFE: [0, 0, 0],
    vd: [0, 0, 0], pre: { d: 0, h: 0, l: 0 }, post: { d: 0, h: 0, l: 0 }, gone: null, band: null, lastPop: 0 }));
  const per = (v, day) => (day < SHIELD ? 0 : (day < v.open ? 1 : 2));   // 0 첫해(보호막 창) · 1 보호막 끝 ~ 그 마을 보호기 끝 · 2 보호기 끝 뒤
  const lastDay = t.rows.length ? t.rows[t.rows.length - 1][0] : 0;
  for (const [day, row] of t.rows) {
    row.forEach((r, i) => {
      if (i >= N) return; const v = V[i];
      if (!r) return;
      const pop = r[0] || 0;
      if (pop > 0) { v.gone = null; } else if (v.lastPop > 0 && v.gone == null) v.gone = day;
      v.lastPop = pop;
      if (pop > 0) v.vd[per(v, day)]++;   // 산 마을-날(기간 길이가 다르므로 비율의 분모)
      const dd = r[1] || 0; if (!dd) return;
      const neg = [4, 5, 6, 7, 8].map((k) => Math.max(0, -(r[k] || 0))); const sm = neg.reduce((a, b) => a + b, 0);
      const h = sm > 0 ? dd * neg[1] / sm : 0;
      const p = per(v, day); v.deaths[p] += dd; v.hunger[p] += h;
      if (day >= v.open - W && day < v.open) { v.pre.d += dd; v.pre.h += h; }
      if (day >= v.open && day < v.open + W) { v.post.d += dd; v.post.h += h; }
    });
  }
  if (o) {
    const ix = Object.fromEntries(names.map((n, i) => [n, i]));
    for (const L of o.loot) {
      const [day, from, to, , , fe, dir] = L;
      const v = V[ix[from]]; if (v) { const p = per(v, day); v.loot[p]++; v.lootFE[p] += fe || 0; if (day >= v.open - W && day < v.open) v.pre.l++; if (day >= v.open && day < v.open + W) v.post.l++; }
      const w = V[ix[to]]; if (w && dir === 'out') w.toFE[per(w, day)] += fe || 0;
    }
    //   도적화(해체 → 단) 날 — t951 rows 의 `_banditized` 가 0 → 1 이 된 날
    const bi = o.cols.indexOf('banditized'), seen = {};
    for (const [day, row] of o.rows) row.forEach((r, i) => { if (r && r[bi] && !seen[i]) { seen[i] = day; const v = V[ix[o.names[i]]]; if (v) v.band = day; } });
  }
  return { V, lastDay, run: run ? { dissolved: run.dissolved, empty: run.empty, pop: run.eight && run.eight.pop, bandit: run.bandit || null } : null, lootN: o ? o.loot.length : 0 };
}
const R = {};
for (const k of Object.keys(arms)) R[k] = arms[k].map((d) => Object.fromEntries(SEEDS.map((s) => [s, one(d, s)])));
const f0 = (x) => (x == null ? '—' : (Math.round(x * 10) / 10).toLocaleString());
const band = (xs) => { const a = xs.filter((x) => x != null); return a.length ? (Math.min(...a) === Math.max(...a) ? f0(a[0]) : `${f0(Math.min(...a))} ~ ${f0(Math.max(...a))}`) : '—'; };
const sumV = (S, f) => (S ? S.V.reduce((a, v) => a + f(v), 0) : null);
const out = { shield: SHIELD, bdtMin: BO.min, W, arms: {} };
console.log(`\n=== T984 — 도적 보호기 끝 전후 · 800날 · 보호막 끔(T858_NO_SHIELD=1) × 도적 ${Object.keys(arms).join(' · ')} ===`);
console.log(`  기간: ⓐ [0, ${SHIELD}) 보호막 창(끔 판이라 막 없음) · ⓑ [${SHIELD}, 그 마을 보호기 끝) · ⓒ [그 마을 보호기 끝, 판 끝) — 보호기 끝 = ${BO.min} + 해시 × ${BO.min}(마을마다)`);
for (const s of SEEDS) {
  const M = R.C && R.C[0][s]; if (!M) continue;
  const opens = M.V.map((v) => v.open).sort((a, b) => a - b);
  console.log(`\n## 시드 ${s} — 보호기 끝 ${opens[0]} ~ ${opens[opens.length - 1]}(중앙 ${opens[opens.length >> 1]}) · 판 끝 날 ${M.lastDay}`);
  console.log('  | 셈 | ' + Object.keys(arms).map((k) => `${k}${arms[k].length > 1 ? '(띠 ' + arms[k].length + ')' : ''}`).join(' | ') + ' |');
  console.log('  |---|' + Object.keys(arms).map(() => '---').join('|') + '|');
  const line = (lab, f) => console.log(`  | ${lab} | ` + Object.keys(arms).map((k) => band(R[k].map((X) => (X[s] ? f(X[s]) : null)))).join(' | ') + ' |');
  for (const [p, lab] of [[0, 'ⓐ'], [1, 'ⓑ'], [2, 'ⓒ']]) {
    line(`${lab} 습격 손실(건)`, (S) => sumV(S, (v) => v.loot[p]));
    line(`${lab} 손실 식량 환산`, (S) => sumV(S, (v) => v.lootFE[p]));
    line(`${lab} 굶어 죽음`, (S) => sumV(S, (v) => v.deaths[p]));
    line(`${lab} 그중 굶주림 몫`, (S) => sumV(S, (v) => v.hunger[p]));
  }
  for (const [p, lab] of [[0, 'ⓐ'], [1, 'ⓑ'], [2, 'ⓒ']]) {
    line(`${lab} 산 마을-날`, (S) => sumV(S, (v) => v.vd[p]));
    line(`${lab} 습격 손실 / 1,000 마을-날`, (S) => { const n = sumV(S, (v) => v.vd[p]); return n ? 1000 * sumV(S, (v) => v.loot[p]) / n : null; });
    line(`${lab} 굶어 죽음 / 1,000 마을-날`, (S) => { const n = sumV(S, (v) => v.vd[p]); return n ? 1000 * sumV(S, (v) => v.deaths[p]) / n : null; });
    line(`${lab} 굶주림 몫 / 1,000 마을-날`, (S) => { const n = sumV(S, (v) => v.vd[p]); return n ? 1000 * sumV(S, (v) => v.hunger[p]) / n : null; });
  }
  line(`보호기 끝 앞 ${W}날 죽음`, (S) => sumV(S, (v) => (v.open < S.lastDay ? v.pre.d : 0)));
  line(`보호기 끝 뒤 ${W}날 죽음`, (S) => sumV(S, (v) => (v.open + W <= S.lastDay ? v.post.d : 0)));
  line(`보호기 끝 앞 ${W}날 굶주림 몫`, (S) => sumV(S, (v) => (v.open < S.lastDay ? v.pre.h : 0)));
  line(`보호기 끝 뒤 ${W}날 굶주림 몫`, (S) => sumV(S, (v) => (v.open + W <= S.lastDay ? v.post.h : 0)));
  line(`보호기 끝 앞 ${W}날 습격 손실`, (S) => sumV(S, (v) => (v.open < S.lastDay ? v.pre.l : 0)));
  line(`보호기 끝 뒤 ${W}날 습격 손실`, (S) => sumV(S, (v) => (v.open + W <= S.lastDay ? v.post.l : 0)));
  line('도적화(해체 → 단) 마을', (S) => S.V.filter((v) => v.band != null).length);
  line('  그중 보호기 끝 뒤 60날 안', (S) => S.V.filter((v) => v.band != null && v.band >= v.open && v.band < v.open + W).length);
  line('소멸(인구 0 · 판 끝까지)', (S) => S.V.filter((v) => v.gone != null).length);
  line('  그중 보호기 끝 뒤', (S) => S.V.filter((v) => v.gone != null && v.gone >= v.open).length);
  line('판 끝 인구', (S) => (S.run ? S.run.pop : null));
  line('판 JSON 해체', (S) => (S.run ? S.run.dissolved : null));
  line('판 JSON 빈 마을', (S) => (S.run ? S.run.empty : null));
  const gone = M.V.filter((v) => v.gone != null || v.band != null).map((v) => `${v.n}(보호기 끝 ${v.open} · 도적화 ${v.band == null ? '—' : v.band} · 소멸 ${v.gone == null ? '—' : v.gone})`);
  if (gone.length) console.log('  주 판 도적화 · 소멸 마을: ' + gone.join(' · '));
}
for (const k of Object.keys(R)) out.arms[k] = R[k].map((X) => Object.fromEntries(SEEDS.map((s) => [s, X[s] ? { lastDay: X[s].lastDay, run: X[s].run, lootN: X[s].lootN, V: X[s].V } : null])));
if (jOut) { fs.writeFileSync(jOut, JSON.stringify(out)); console.log('\n→ ' + jOut); }
