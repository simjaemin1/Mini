#!/usr/bin/env node
'use strict';
// (@regress 없음 — 러너 밖 · T1449 표 · 계측 JSON 만 읽는다 · 판을 돌리거나 수를 제품에 되먹이지 않는다)
// === scripts/t1449-table.js — 청동은 값이 있을 때만: 팔마다 판(T1407 표의 열 그대로 + 칼과 쥘 사람) ==========
//   쓰는 법: node scripts/t1449-table.js <판 뿌리>… [--json <요약.json>]
//     판 뿌리 = `<꼴>-<팔>-<시드>/` 자리들 + `done.txt`(T1449 러너) — 판마다 t1407 관찰기(주석 장부) · t1385 관찰기(랩만 · 청동 몫) · t1449 관찰기(칼과 쥘 사람).
//   T1407 열은 `t1407-table.js --json` 이 낸 요약을 그대로 읽는다(정의 사본 0 — 쥔 마을 · 절반 넘는 마을 · 세계 청동 % · kg 은 그 표의 정의).
//   서버 판은 t1385 관찰기가 없다 — 쥔 마을 · 청동 몫 칸은 t1449 관찰기(편성이 세는 근접검 · 청동 = 정수 자루)로 채우고 칸 머리에 적는다.
//   T1449 열: 안 쥔 칼 몫(전쟁 편성 · 끔 셈 / 켬 셈 · 판 끝 · 둘째 해 평균) = Σ(근접검 − 정예 − 단검) ÷ Σ근접검 · 마을 가운데 · 최대 · 칼 ÷ 사람 최대(어촌2 꼴).
const fs = require('fs'), path = require('path'), { spawnSync } = require('child_process');
const ROOT = path.join(__dirname, '..');
const WG = require(path.join(ROOT, 'server', 'weights.js'));
const KG = { tin: WG.kgOf('tin'), ore: WG.kgOf('ore_tin') };   // kg 정본(`server/weights.js` — t1407 표와 같은 자)
const args = process.argv.slice(2);
const jsonOut = args.includes('--json') ? args[args.indexOf('--json') + 1] : null;
const roots = args.filter((a, i) => !a.startsWith('--') && args[i - 1] !== '--json');
const f0 = (x) => (x == null || !isFinite(x) ? '—' : (+x).toFixed(0)), f1 = (x) => (x == null || !isFinite(x) ? '—' : (+x).toFixed(1)), f2 = (x) => (x == null || !isFinite(x) ? '—' : (+x).toFixed(2));
const med = (a) => { const b = a.filter((x) => isFinite(x)).sort((x, y) => x - y); return b.length ? (b.length % 2 ? b[(b.length - 1) / 2] : (b[b.length / 2 - 1] + b[b.length / 2]) / 2) : null; };
const ARM_ORDER = ['off', 'bundle', 'wa', 'wab', 'wabs', 'wabo'];
const ARM_NAME = { off: '끔', bundle: '묶음', wa: '묶음 + ㉮', wab: '+ 사 모으는 문', wabs: '+ 병기고 크기', wabo: '+ 원석 값(T1407 ㉡)' };
const SEEDS = ['1020', '7', '42'];
function t1449Of(dir) {
  const fs0 = fs.readdirSync(dir), f = fs0.find((x) => /(^|\.)t1449\.json$/.test(x));
  if (!f) return null;
  const r = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')); if (r.err) throw Error(dir + ': ' + r.err);
  const C = (c) => r.vcols.indexOf(c), days = Object.keys(r.day).map(Number).sort((a, b) => a - b), dN = days[days.length - 1];
  const agg = (rows) => {   // 한 날 — 세계 · 마을
    let S = 0, uOff = 0, uOn = 0, B = 0, Wd = 0, holders = 0, half = 0, bzS = 0, maxPer = { v: 0, n: null, w: 0, N: 0 };
    const per = [], perOn = [], hold = [];
    rows.forEach((x, i) => {
      if (!x) return; const s = x[C('S')], b = x[C('B')], N = x[C('N')];
      S += s; B += b; uOff += x[C('uOffWar')]; uOn += x[C('uOnWar')]; Wd += x[C('W')];
      if (s >= 1) { per.push(x[C('uOffWar')] / s); perOn.push(x[C('uOnWar')] / s); }
      if (b >= 1) { holders++; hold.push(b / Math.max(1, s)); bzS += s; }
      if (s > 0 && b > s / 2) half++;
      const wp = x[C('weapon')] / Math.max(1, N); if (wp > maxPer.v) maxPer = { v: wp, n: r.names[i], w: x[C('weapon')], N };
    });
    return { S, B, uOff, uOn, W: Wd, shOff: S > 0 ? uOff / S : null, shOn: S > 0 ? uOn / S : null, medOff: med(per), maxOff: per.length ? Math.max(...per) : null, medOn: med(perOn), maxOn: perOn.length ? Math.max(...perOn) : null,
      holders, holdBz: bzS > 0 ? B / bzS : null, holdMed: med(hold), half, worldBz: S > 0 ? B / S : null, maxPer };
  };
  const end = agg(r.day[dN]);
  const y2 = days.filter((d) => d > dN / 2);   // 둘째 해(판 뒤 절반) 평균
  const ys = y2.map((d) => agg(r.day[d]));
  const avg = (k) => { const a = ys.map((q) => q[k]).filter((x) => x != null && isFinite(x)); return a.length ? a.reduce((p, q) => p + q, 0) / a.length : null; };
  return { end, y2: { shOff: avg('shOff'), shOn: avg('shOn'), medOff: avg('medOff'), maxOff: avg('maxOff') }, dN };
}
const runs = [];
for (const root of roots) {
  const tmp = path.join(require('os').tmpdir(), 't1449-t1407-' + process.pid + '-' + path.basename(root) + '.json');
  const p = spawnSync(process.execPath, [path.join(ROOT, 'scripts', 't1407-table.js'), root, '--json', tmp], { encoding: 'utf8', maxBuffer: 64 << 20 });
  if (p.status !== 0) throw Error('t1407-table ' + root + ': ' + (p.stderr || '').slice(0, 400));
  const S = JSON.parse(fs.readFileSync(tmp, 'utf8')); fs.unlinkSync(tmp);
  for (const s of S) {
    let t = null; try { t = t1449Of(path.join(root, s.dir)); } catch (e) { t = { err: String(e.message || e) }; }
    runs.push(Object.assign(s, { root: path.basename(root), t }));
  }
}
const pick = (root, kind, arm, f) => SEEDS.map((sd) => { const x = runs.find((q) => q.root === root && q.kind === kind && q.arm === arm && q.seed === sd); return x ? f(x) : '—'; }).join(' · ');
const offOf = (x) => runs.find((o) => o.root === x.root && o.kind === x.kind && o.seed === x.seed && o.arm === 'off');
function table(h, rows) { console.log('| ' + h.join(' | ') + ' |\n|' + h.map(() => '---').join('|') + '|'); for (const x of rows) console.log('| ' + x.join(' | ') + ' |'); console.log(''); }
const hold = (x) => (x.probe ? { holders: x.probe.holders, holdBz: x.probe.holdBz, half: x.probe.half, worldBz: x.probe.worldBz, med: x.probe.holderNames ? med(x.probe.holderNames.map((t) => { const m = t.match(/ ([\d.]+)\/([\d.]+)$/); return m && +m[2] > 0 ? +m[1] / +m[2] : NaN; })) : null }
  : (x.t && x.t.end ? { holders: x.t.end.holders, holdBz: x.t.end.holdBz, half: x.t.end.half, worldBz: x.t.end.worldBz, med: x.t.end.holdMed, fromT1449: true } : null));
for (const root of [...new Set(runs.map((q) => q.root))]) for (const kind of ['lab', 'server']) {
  const R = runs.filter((q) => q.root === root && q.kind === kind); if (!R.length) continue;
  const arms = ARM_ORDER.filter((a) => R.some((q) => q.arm === a));
  console.log(`### ${root} · ${kind === 'lab' ? '두 해 랩(800날)' : '서버 자(400날)'} — 칸마다 시드 1020 · 7 · 42${kind === 'server' ? ' · 쥔 마을 칸 = t1449 관찰기(편성 자루 셈)' : ''}\n`);
  table(['팔', '캔 주석 원석 kg/해', '녹인 주석 kg/해', '부은 주석 kg/해', '청동 검/해', '석검 : 동검(부은 것)', '쥔 마을 /51', '쥔 마을 청동 몫(모아 · 가운데)', '절반 넘는 마을', '세계 병기고 청동 %', '주석 곳간 끝 kg', '빈 마을(끔엔 사는데)', '인구(끔비)', '굶어 죽음', '무기 짐 줄'],
    arms.map((a) => [ARM_NAME[a] || a,
      pick(root, kind, a, (x) => f0(x.tot.minedTin * x.yr * KG.ore)), pick(root, kind, a, (x) => f0(x.tot.smeltTin * x.yr * KG.tin)), pick(root, kind, a, (x) => f0(x.tot.castTin * x.yr * KG.tin)),
      pick(root, kind, a, (x) => f0(x.tot.castBz * x.yr)),
      pick(root, kind, a, (x) => (x.probe && x.probe.bzMade > 0 ? f1(x.probe.stoneMade / x.probe.bzMade) : (x.probe ? '∞' : '—'))),
      pick(root, kind, a, (x) => { const h = hold(x); return h ? h.holders : '—'; }),
      pick(root, kind, a, (x) => { const h = hold(x); return h && h.holdBz != null ? f0(100 * h.holdBz) + '/' + f0(100 * h.med) + '%' : '—'; }),
      pick(root, kind, a, (x) => { const h = hold(x); return h ? h.half : '—'; }),
      pick(root, kind, a, (x) => { const h = hold(x); return h && h.worldBz != null ? f1(100 * h.worldBz) : '—'; }),
      pick(root, kind, a, (x) => f0(x.tinEnd * KG.tin)),
      pick(root, kind, a, (x) => { const o = offOf(x); return o && o !== x ? String(x.emptyNames.filter((n) => !o.emptyNames.includes(n)).length) + (x.emptyNames.length ? '(' + x.emptyNames.length + ')' : '') : String(x.emptyNames.length); }),
      pick(root, kind, a, (x) => { const o = offOf(x); return o && o !== x ? f2(x.pop / o.pop) : String(x.pop); }),
      pick(root, kind, a, (x) => x.dead), pick(root, kind, a, (x) => x.legs.weapon[0])]));
  table(['팔', '안 쥔 칼 몫 — 판 끝(끔 셈 / 켬 셈)', '둘째 해 평균(끔 셈)', '마을 가운데 · 최대(판 끝 · 끔 셈)', '칼 ÷ 사람 최대(판 끝 · 마을)', '전사 합 · 근접검 합 · 청동 합(판 끝)'],
    arms.map((a) => [ARM_NAME[a] || a,
      pick(root, kind, a, (x) => (x.t && x.t.end ? f1(100 * x.t.end.shOff) + ' / ' + f1(100 * x.t.end.shOn) + '%' : '—')),
      pick(root, kind, a, (x) => (x.t && x.t.y2 ? f1(100 * x.t.y2.shOff) + '%' : '—')),
      pick(root, kind, a, (x) => (x.t && x.t.end ? f0(100 * x.t.end.medOff) + ' · ' + f0(100 * x.t.end.maxOff) + '%' : '—')),
      pick(root, kind, a, (x) => (x.t && x.t.end && x.t.end.maxPer.n ? f1(x.t.end.maxPer.v) + ' ' + x.t.end.maxPer.n + '(' + f0(x.t.end.maxPer.w) + '/' + x.t.end.maxPer.N + ')' : '—')),
      pick(root, kind, a, (x) => (x.t && x.t.end ? x.t.end.W + ' · ' + x.t.end.S + ' · ' + x.t.end.B : '—'))]));
}
if (jsonOut) fs.writeFileSync(jsonOut, JSON.stringify(runs, null, 1));
