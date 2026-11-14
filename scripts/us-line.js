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
//   node scripts/us-line.js line --dir <판 폴더> [--arm main --arm fix]
//       ⇒ 팔마다 한 줄: "main n2 · 낮 0.651 [0.623 ~ 0.709] · 밤 닫힘 앞 0.680 [0.555 ~ 0.754] · 밤 창 1.252 [...] · 틱 p50 낮 2.84"
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
  if (!fs.existsSync(TPL)) { console.error('틀이 없다: ' + TPL); process.exit(2); }
  fs.mkdirSync(DIR, { recursive: true });
  const P = arms.map((a) => { const i = a.indexOf('='), name = a.slice(0, i), rest = a.slice(i + 1), j = rest.indexOf(':'), ref = j < 0 ? rest : rest.slice(0, j), envs = j < 0 ? '' : rest.slice(j + 1);   // 첫 '=' 가 팔 · 첫 ':' 가 손잡이(손잡이 값의 '=' 는 그대로)
    return { name, ref, env: Object.fromEntries(envs.split(',').filter(Boolean).map((e) => { const k = e.indexOf('='); return [e.slice(0, k), e.slice(k + 1)]; })) }; });
  for (let i = 1; i <= N; i++) for (const p of P) {
    const tag = `${p.name}${i}`;
    if (fs.existsSync(path.join(DIR, tag + '.json'))) { console.log(`${tag} 있음 — 건너뜀`); continue; }
    const t0 = Date.now();
    const r = spawnSync(process.execPath, [path.join(ROOT, 'scripts', 't646-anatomy.js'), 'run', 'inf', tag, '--seg', '--lines', '--ref', p.ref],
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
    const ln = `${nm} n${day.length} · 낮 ${band(dv)} · 밤 닫힘 앞 ${band(pv)} · 밤 창 ${band(wv)} · 틱 p50 낮 ${f3(med(day.map((x) => x.tickP50)))}` + (fl.length ? ` · ⚠자가 표시(live 로 읽음) ${fl.join(', ')}` : '');
    out.push({ arm: nm, n: day.length, day: med(dv), pre: med(pv), win: med(wv), dayBand: [Math.min(...dv), Math.max(...dv)], preBand: [Math.min(...pv), Math.max(...pv)], flags: fl });
    console.log(ln);
  }
  fs.writeFileSync(path.join(DIR, 'us-line.json'), JSON.stringify(out, null, 1));
}
