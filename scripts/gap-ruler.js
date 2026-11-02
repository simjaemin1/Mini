#!/usr/bin/env node
// (@regress 없음 — 러너 밖 계측기 · 실서버 판을 띄운다 · 판정 0)
// === scripts/gap-ruler.js — 격차 자(T1101): 부익부빈익빈이 가속되는지 재는 관찰기 ==========================================
//
// ★[T1101 · 재민 11-02] 행복이 낮을 때의 효과(명령 거부 · 출정 거부 · 질 · 산출 감소)를 넣기 **전에** 잣대부터 — 이 자는 효과를 안 넣는다.
//   재는 것:
//     ⓐ 마을 간 인구 지니 · 곳간(식량 등가) 지니 추이(첫날 · 100날마다 · 끝) — 끝 − 첫날 이 + 면 벌어졌다.
//     ⓑ 빈 마을(사람이 살다가 0) · 해체(도적 표) 수.
//     ⓒ 충격 회복 시간 — 보호기 끝 뒤 첫 풍흉 날, 세계가 그해 굴린 흉년을 인구 가운데 마을 하나에 그대로 세우고(`gap-ruler-hook.js`)
//        그 마을 인구 · 곳간이 충격 날 값으로 돌아온 날 · 바닥 · 끝 값 · 끝 100날 기울기 · 같은 시드 충격 없는 판(대조)과의 끝 차.
//     ⓓ 하위 10 마을(판 평균 인구 아래 열)의 행복 바닥(< 0.5 · econ 중립점) 날 수 — 상위 10 과 나란히.
//   판은 서버 판 자(`t577-server-run.js` — 실서버 · 새 세계 · 손님 0 · 빠른 시계 · 판 자 기본 env 그대로)를 그대로 부른다.
//   관찰은 `NODE_OPTIONS=--require gap-ruler-hook.js` 로 존 아이에 얹는다(제품 무접촉 · 판 자 무접촉).
//
// 실행:
//   node scripts/gap-ruler.js [일수=800] [시드=1020,7,42] [--out 계측/T1101_격차자.json]   # 대조 판 · 충격 판을 같이 띄운다(각 T577_PAR · 기본 2)
//   node scripts/gap-ruler.js --table <dir>                                             # 판 자료만 읽어 표
'use strict';
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const G = require('./gap-ruler-lib');
const ROOT = path.join(__dirname, '..');
const A = process.argv.slice(2);

function load(dir) {
  const out = {};
  for (const mode of ['base', 'shock']) {
    const d = path.join(dir, mode);
    if (!fs.existsSync(d)) continue;
    for (const f of fs.readdirSync(d).filter((x) => /\.gap\.json$/.test(x))) {
      const D = JSON.parse(fs.readFileSync(path.join(d, f), 'utf8'));
      (out[D.seed] = out[D.seed] || {})[mode] = D;
    }
  }
  return out;
}

function table(runs, outJson) {
  const seeds = Object.keys(runs).sort();
  const res = {};
  for (const s of seeds) {
    const R = runs[s];
    res[s] = { base: R.base ? G.summarize(R.base) : null, shock: R.shock ? G.summarize(R.shock, R.base) : null,
      pickSame: !!(R.base && R.shock && R.base.pick && R.shock.pick && R.base.pick.idx === R.shock.pick.idx && R.base.pick.day === R.shock.pick.day) };
  }
  const f3 = (x) => (x == null ? '—' : x.toFixed(3));
  console.log('\n### ⓐ ⓑ 대조 판(충격 없음) — 지니 추이 · 빈 마을 · 해체');
  console.log('| 시드 | 날 | 인구 지니 | 곳간 지니 | 빈 마을 | 해체 | 총인구 |');
  console.log('|---|---:|---:|---:|---:|---:|---:|');
  for (const s of seeds) {
    const B = res[s].base; if (!B) continue;
    console.log(`| ${s} | ${B.first.day} | ${f3(B.first.giniPop)} | ${f3(B.first.giniGran)} | | | |`);
    for (const m of B.marks) console.log(`| ${s} | ${m.day} | ${f3(m.giniPop)} | ${f3(m.giniGran)} | ${m.empty} | ${m.dissolved} | ${m.pop} |`);
  }
  //   첫날 지니는 0 이다(시딩이 마을마다 같은 인구) — 끝 − 첫날 에는 초기 분화가 섞인다. 가속은 후반(판 가운데 날 → 끝)으로 본다.
  const sg = (x) => (x == null ? '—' : `${x >= 0 ? '+' : ''}${x.toFixed(3)}`);
  console.log('\n| 시드 | 인구 지니 끝 − 첫날 | 곳간 지니 끝 − 첫날 | 인구 지니 가운데 → 끝 | 곳간 지니 가운데 → 끝 | 빈 마을(끝) | 해체(누계) |');
  console.log('|---|---:|---:|---:|---:|---:|---:|');
  for (const s of seeds) {
    const B = res[s].base; if (!B) continue;
    const mid = B.marks.find((m) => m.day >= B.days / 2) || null, end = B.marks[B.marks.length - 1];
    B.mid = mid ? { day: mid.day, dPop: +(end.giniPop - mid.giniPop).toFixed(3), dGran: +(end.giniGran - mid.giniGran).toFixed(3) } : null;
    console.log(`| ${s} | ${sg(B.dPop)} | ${sg(B.dGran)} | ${B.mid ? sg(B.mid.dPop) + `(${B.mid.day}→${end.day})` : '—'} | ${B.mid ? sg(B.mid.dGran) : '—'} | ${B.empty} | ${B.dissolved} |`);
  }
  console.log('\n### ⓓ 행복 바닥(< 0.5) 날 수 — 판 평균 인구 하위 10 · 상위 10(대조 판)');
  console.log('| 시드 | 하위 10 평균 바닥 날 | 하위 10 바닥 비율 | 상위 10 평균 바닥 날 | 상위 10 바닥 비율 | 하위 10 마을 |');
  console.log('|---|---:|---:|---:|---:|---|');
  for (const s of seeds) {
    const B = res[s].base; if (!B) continue;
    console.log(`| ${s} | ${B.floor.bottom.lowMean} | ${B.floor.bottom.share} | ${B.floor.top.lowMean} | ${B.floor.top.share} | ${B.floor.bottom.names.join(' · ')} |`);
  }
  console.log('\n### ⓒ 충격 회복 — 세계가 그해 굴린 흉년을 인구 가운데 마을 하나에');
  console.log('| 시드 | 마을 | 충격 날 → 철 끝 | 흉년을 받은 마을(원본) | 기준 인구 | 인구 바닥(날) | 인구 회복 날(걸린 날) | 끝 인구 · 대조 끝 · 차 | 끝 100날 기울기 | 기준 곳간 | 곳간 바닥(날) | 곳간 회복(걸린 날) | 곳간 끝 · 대조 끝 |');
  console.log('|---|---|---|---|---:|---|---|---|---:|---:|---|---|---|');
  for (const s of seeds) {
    const S = res[s].shock; if (!S || !S.shock) { console.log(`| ${s} | (충격 판 없음 · 흉년이 안 났다) |`); continue; }
    const k = S.shock, p = k.pop, g = k.gran, pk = runs[s].shock.pick;
    const back = (x) => (x.back == null ? (x.dipped ? '안 돌아옴' : '안 떨어짐') : `${x.back}(${x.backDays}날)`);
    console.log(`| ${s} | ${k.name} | ${k.day} → ${k.until} | ${pk ? pk.donor : '—'} | ${p.base} | ${p.min}(${p.minDay}) | ${back(p)} | ${p.end} · ${p.ctlEnd ?? '—'} · ${p.gapEnd ?? '—'} | ${p.tail}`
      + ` | ${g.base} | ${g.min}(${g.minDay}) | ${back(g)} | ${g.end} · ${g.ctlEnd ?? '—'} |`);
  }
  console.log('\n### ⓒ′ 대조와 견주기 — 충격 마을 인구(충격 − 대조) · 잡음 바닥(충격 안 받은 마을들의 끝 차)');
  console.log('| 시드 | 두 판이 처음 갈린 날 | 충격 전 같은 세계 | 가장 모자란 차(날) | 따라잡은 날 | 끝 차 · 끝 비율 | 잡음 바닥 끝 차 중앙 · 90% · 최대 | 충격 마을보다 크게 갈린 마을 |');
  console.log('|---|---:|---|---|---|---|---|---:|');
  for (const s of seeds) {
    const S = res[s].shock, c = S && S.shock && S.shock.ctl; if (!c) continue;
    console.log(`| ${s} | ${c.firstDiverge ?? '—'} | ${c.cleanBefore ? '같음' : '다름'} | ${c.worstGap}(${c.worstDay}) | ${c.caught ?? (c.worstGap < 0 ? '못 따라잡음' : '—')} | ${c.endGap} · ${c.endRel} | ${c.noiseMed} · ${c.noiseP90} · ${c.noiseMax} | ${c.louder}/${c.others} |`);
  }
  console.log('\n| 시드 | 대조 · 충격 판이 같은 날 같은 마을을 골랐나 | 충격 판 인구 지니 끝 − 첫날 | 대조 판 |');
  console.log('|---|---|---:|---:|');
  for (const s of seeds) { const r = res[s]; console.log(`| ${s} | ${r.pickSame ? '같음' : '다름'} | ${r.shock ? r.shock.dPop : '—'} | ${r.base ? r.base.dPop : '—'} |`); }
  if (outJson) { fs.writeFileSync(outJson, JSON.stringify(res, null, 1)); console.log(`\n요약 JSON: ${outJson}`); }
  return res;
}

if (A.includes('--table')) {
  const dir = A[A.indexOf('--table') + 1];
  const o = A.indexOf('--out');
  table(load(dir), o >= 0 ? A[o + 1] : null);
  process.exit(0);
}

const DAYS = parseInt(A.find((x) => /^\d+$/.test(x)) || '800', 10);
const SEEDS = A.find((x) => /^\d+(,\d+)+$/.test(x)) || '1020,7,42';
const OUTJ = A.includes('--out') ? A[A.indexOf('--out') + 1] : null;
const DIR = process.env.GAP_DIR || `/tmp/gap-ruler-${process.pid}`;
fs.mkdirSync(DIR, { recursive: true });
const HOOK = path.join(__dirname, 'gap-ruler-hook.js');
function run(mode) {
  return new Promise((resolve) => {
    const env = Object.assign({}, process.env, {
      T577_DIR: path.join(DIR, mode), T577_TAG: `gap-${mode}`, T577_PAR: process.env.T577_PAR || '2',
      NODE_OPTIONS: `${process.env.NODE_OPTIONS || ''} --require ${HOOK}`.trim(),
      //   WAL 체크포인트를 COMMIT 자리로(T941 의 `T696_WAL=0` — 값 무변 · 판 JSON 바이트 같음 실측) — 800날 판 여섯이 WAL 로 디스크를 넘지 않게. 부르는 쪽이 준 값이 먼저.
      T696_WAL: process.env.T696_WAL != null ? process.env.T696_WAL : '0',
    });
    if (mode === 'shock') env.GAP_SHOCK = '1'; else delete env.GAP_SHOCK;
    const t0 = Date.now();
    const c = spawn(process.execPath, [path.join(__dirname, 't577-server-run.js'), String(DAYS), SEEDS], { cwd: ROOT, env, stdio: ['ignore', 'pipe', 'pipe'] });
    const lf = fs.createWriteStream(path.join(DIR, `${mode}.runner.log`));
    c.stdout.pipe(lf); c.stderr.pipe(lf);
    c.on('exit', (code) => {
      // 판 DB 는 지운다(판 자료 = `.gap.json` · 판 JSON · 로그는 남긴다)
      const d = path.join(DIR, mode);
      try { for (const f of fs.readdirSync(d)) if (/\.db(-wal|-shm)?$/.test(f)) fs.unlinkSync(path.join(d, f)); } catch (e) {}
      console.log(`  · ${mode} 판 끝 — 종료 ${code} · ${((Date.now() - t0) / 1000) | 0}초`); resolve(code);
    });
  });
}
(async () => {
  console.log(`\n=== 격차 자(T1101) — ${DAYS}날 · 시드 ${SEEDS} · 대조 판 + 충격 판 · ${DIR} ===`);
  await Promise.all([run('base'), run('shock')]);
  table(load(DIR), OUTJ);
  console.log(`\n판 자료: ${DIR}  (표만 다시: node scripts/gap-ruler.js --table ${DIR})`);
})().catch((e) => { console.error(e); process.exit(1); });
