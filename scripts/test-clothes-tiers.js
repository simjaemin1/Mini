#!/usr/bin/env node
// @regress   ← 통합 러너가 이 표를 보고 자기 목록을 만든다(scripts/run-regress.sh · 표 없으면 안 돈다)
// === scripts/test-clothes-tiers.js — 옷 티어 셋(삼베·가죽·모피)이 **화면에서** 갈린다 [T515 2026-09-29] ============
//
// ★카드 T515 ①② — "T508 이 옷 방한을 clo 로 유도하면 삼베·가죽·모피가 **화면에서** 갈려야 한다(지금 옷 레이어 하나?)".
//   ⓐ 옷 층은 하나가 아니라 **여섯**이다(T81 · `clothes_<mat>` · 같은 CLOTH 기하 × 재질 · 갖옷만 털 두께 `FUR_PAD`).
//   ⓑ 그런데 `e2e-charsprite ⓗ` 는 **층 단독**을 잰다 — 한쪽만 불투명한 둘레(갖옷의 털 두께)가 휘도 0 과 견줘져 차를 키운다.
//     화면에 서는 것은 **몸 위에 옷 한 벌**이다(`42-r2-char.js charLayersFor` — 몸 → 옷 순서).
//     같은 자(|Δ휘도| ≥ BAR 또는 다른 화소 ≥ 50% · 프레임 idle 첫 판)를 **합성**에 대 보니 가죽↔모피가 못 갈렸다(보고/T515 ① 표).
//   ⇒ 갖옷 본천을 허리끈 비(`CLOTH_TRIM_K` — 이 파이프가 "한 톤 짙게"로 쓰는 그 비)로 **한 톤씩** 짙게 했다 — 자가 멈추라 할 때까지.
//     새 형상 0 · 새 수 0(T81 값 × K^n · 멈춤 = 자) — 이 하네스가 그 유도(④)와 결과(③)를 지킨다.
//
// ★표가 본체다(②) — 품목 여섯의 방한(숙련 0·5·10)과 그림 키. 방한 값만으로는 티어가 안 갈린다(구간이 겹친다) ⇒ 키는 **품목 id** 다.
//
// ★자명 통과 금지 — 자가 "못 갈린다"도 말할 수 있어야 한다: 같은 합성끼리는 0 · 0% 로 **떨어진다**(③ 대조군).
//
// 실행: node scripts/test-clothes-tiers.js
'use strict';

const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const R = (p) => path.join(ROOT, p);
const { codeOnly } = require('./code-only');
const { PNG } = require(R('node_modules/pngjs'));

let pass = 0, fail = 0;
const ok = (c, m, extra) => { c ? pass++ : fail++; console.log((c ? '  ✓ ' : '  ✗ ') + m + (extra ? `  ${extra}` : '')); };

const DIR = R('public/assets/char');
const META = JSON.parse(fs.readFileSync(path.join(DIR, 'char_meta.json'), 'utf8'));
const Clothes = require(R('server/clothes.js'));

// ── ① 품목 → 그림 키 ─────────────────────────────────────────────────────────
console.log('\n=== ① 품목 여섯 → 그림 키(`clothes_<id>` · 클라 `clothLayerOf` 규약) ===');
const IDS = Clothes.accepts();
{
  const layers = META.layers || [];
  const miss = IDS.filter((m) => layers.indexOf('clothes_' + m) < 0);
  ok(IDS.length > 0 && miss.length === 0, `품목 ${IDS.length}개가 전부 제 층을 갖는다(시트 메타 layers)`, miss.length ? `없음: ${miss.join(',')}` : IDS.map((m) => 'clothes_' + m).join(' '));
  const src = codeOnly(fs.readFileSync(R('public/client/42-r2-char.js'), 'utf8'));
  const bare = /function clothLayerOf\(mat\)\s*\{\s*if \(!mat\) return 'clothes_hemp';/.test(src);
  ok(bare, '맨몸(옷 없음)은 **삼베 그림**이다 — 클라 규약 "알몸 금지"(T81) 그대로(이 카드는 안 바꿨다)', "clothLayerOf: if (!mat) return 'clothes_hemp'");
}

// ── ② 방한 → 티어 표 ─────────────────────────────────────────────────────────
//   티어 = 카드가 부른 셋(삼베 hemp · 가죽 leather · 모피 fur). 나머지 셋은 **품목 표의 칸**으로 부류를 읽는다:
//   천장(cap)이 있으면 식물 섬유(`clothes.js` "식물 섬유는 아무리 잘 짜도 바람을 못 막는다") ⇒ 삼베 부류 · 천장 없는 가죽 ⇒ 가죽 부류.
console.log('\n=== ② 방한(warmthOf · 숙련 0/5/10) → 티어 · 그림 키 ===');
const LV = [0, 5, 10];
const tierOf = (m) => (m === 'fur' ? '모피' : (Clothes.capOf(m) != null ? '삼베' : '가죽'));
const rowsW = IDS.map((m) => ({ m, ko: Clothes.koOf(m), cap: Clothes.capOf(m), w: LV.map((l) => Clothes.warmthOf(m, l)), tier: tierOf(m) }));
console.log('    품목 · 이름 · 천장 · 방한 Lv0/5/10 · 티어 · 그림 키');
for (const r of rowsW) console.log(`    ${r.m} · ${r.ko} · ${r.cap == null ? '—' : r.cap} · ${r.w.join('/')} · ${r.tier} · clothes_${r.m}`);
console.log('    (없음) · 맨몸 · — · 0 · 맨몸 · clothes_hemp(규약 — 알몸 금지)');
{
  ok(rowsW.every((r) => r.w.every((v) => Number.isFinite(v))), '방한은 정본 식(`clothes.warmthOf` → `player-items.craftItem`)에서 읽었다(표에 수 사본 0)');
  const span = {};
  for (const r of rowsW) { const s = span[r.tier] || (span[r.tier] = [Infinity, -Infinity]); s[0] = Math.min(s[0], ...r.w); s[1] = Math.max(s[1], ...r.w); }
  console.log('    티어별 방한 구간:', Object.entries(span).map(([t, s]) => `${t} ${s[0]}~${s[1]}`).join(' · '),
    '⇒ 구간이 겹친다(숙련이 들어간다) — 티어의 열쇠는 방한 값이 아니라 **품목 id** 다(새 칸 0)');
}

// ── ③ 화면 합성 자 — 몸 위에 옷 한 벌 ────────────────────────────────────────
console.log('\n=== ③ 화면 합성(몸 + 옷 한 벌) — 티어 셋이 쌍마다 갈린다(8방향 · idle 첫 판) ===');
const barSrc = fs.readFileSync(R('scripts/e2e-charsprite.js'), 'utf8');
const bm = barSrc.match(/const BAR = ([\d.]+);/);
ok(!!bm, '자 BAR 를 `e2e-charsprite ⓗ` 에서 읽었다(T65 채택 앞섶 신호 · 하네스에 수 사본 0)', bm ? `BAR ${bm[1]}` : '');
const BAR = bm ? +bm[1] : NaN;
const RFRAC = 0.5;                                          // ⓗ 의 "화소의 절반 이상" — 같은 자의 둘째 팔(글자 그대로)
const FW = META.frameW, FH = META.frameH;
const readSheet = (key) => PNG.sync.read(fs.readFileSync(path.join(DIR, key + '_idle.png')));
const frameOf = (png, row) => {
  const out = [];
  for (let y = 0; y < FH; y++) for (let x = 0; x < FW; x++) {
    const i = ((row * FH + y) * png.width + x) * 4;
    out.push([png.data[i], png.data[i + 1], png.data[i + 2], png.data[i + 3]]);
  }
  return out;
};
// 곧은 알파 위덮기(source-over) — 캔버스 `drawImage` 가 몸 위에 옷을 얹는 그 식
const over = (t, b) => {
  const at = t[3] / 255, ab = b[3] / 255, ao = at + ab * (1 - at);
  if (ao <= 0) return [0, 0, 0, 0];
  const c = (i) => Math.round((t[i] * at + b[i] * ab * (1 - at)) / ao);
  return [c(0), c(1), c(2), Math.round(ao * 255)];
};
const L = (p) => 0.2126 * p[0] + 0.7152 * p[1] + 0.0722 * p[2];
const cmp = (a, b) => {                                     // ⓗ 의 cmp 그대로(합집합 α>150 · 채널차 >16 · 평균 |ΔL|)
  let n = 0, tot = 0, s = 0;
  for (let i = 0; i < a.length; i++) {
    const pa = a[i], pb = b[i];
    if (pa[3] <= 150 && pb[3] <= 150) continue;
    tot++;
    if (Math.max(Math.abs(pa[0] - pb[0]), Math.abs(pa[1] - pb[1]), Math.abs(pa[2] - pb[2])) > 16) n++;
    s += Math.abs(L(pa) - L(pb));
  }
  return { r: tot ? n / tot : 0, dl: tot ? s / tot : 0 };
};
const passes = (c) => c.dl >= BAR || c.r >= RFRAC;
const TRIO = ['hemp', 'leather', 'fur'];
const body = readSheet('body');
const sheets = {}; for (const m of TRIO) sheets[m] = readSheet('clothes_' + m);
const comp = {}, alone = {};
for (const m of TRIO) {
  comp[m] = []; alone[m] = [];
  for (let row = 0; row < 8; row++) {
    const b = frameOf(body, row), c = frameOf(sheets[m], row);
    comp[m].push(c.map((p, i) => over(p, b[i]))); alone[m].push(c);
  }
}
{
  const ctl = cmp(comp.leather[2], comp.leather[2]);
  ok(ctl.r === 0 && ctl.dl === 0 && !passes(ctl), '★대조군 — 같은 합성끼리는 0 · 0% 로 **자가 떨어진다**(자가 "못 갈린다"를 말할 수 있다)', `${(ctl.r * 100).toFixed(1)}% · ${ctl.dl.toFixed(2)}`);
  const PAIRS = [['hemp', 'leather'], ['hemp', 'fur'], ['leather', 'fur']];
  console.log('    │ 쌍              │ 방향 0..7 합성 |Δ휘도|·다른 화소%                                             │ 층 단독(ⓗ · 방향 2) │');
  for (const [a, b] of PAIRS) {
    const per = []; let good = 0;
    for (let row = 0; row < 8; row++) { const c = cmp(comp[a][row], comp[b][row]); per.push(c); if (passes(c)) good++; }
    const la = cmp(alone[a][2], alone[b][2]);
    console.log(`    │ ${(a + '↔' + b).padEnd(15)} │ ${per.map((c) => `${c.dl.toFixed(1)}·${(c.r * 100).toFixed(0)}`).join(' ')} │ ${la.dl.toFixed(2)} · ${(la.r * 100).toFixed(1)}% │`);
    ok(passes(per[2]), `★★${a}↔${b} — ⓗ 의 그 프레임(방향 2)에서 **화면 합성**이 갈린다`, `|Δ휘도| ${per[2].dl.toFixed(2)} · 다른 화소 ${(per[2].r * 100).toFixed(1)}% (자 ${BAR} · ${RFRAC * 100}%)`);
    ok(good === 8, `★${a}↔${b} — 여덟 방향 전부 갈린다(한 방향에서만 갈리면 돌아선 사람이 같은 옷으로 보인다)`, `${good}/8`);
  }
}

// ── ④ 갖옷 색의 유도 — T81 값 × 허리끈 비^n ──────────────────────────────────
console.log('\n=== ④ 갖옷 본천 = T81 고증값 × CLOTH_TRIM_K² (새 수 0) ===');
{
  const rc = fs.readFileSync(R('scripts/render_common.py'), 'utf8').replace(/#[^\n]*/g, '');   // 파이썬 주석(#)만 걷는다
  const num = (re) => { const m = rc.match(re); return m ? m.slice(1).map(Number) : null; };
  const base = num(/CLOTH_FUR_T81\s*=\s*\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*\)/);
  const k = num(/CLOTH_TRIM_K\s*=\s*([\d.]+)/);
  const fur = num(/'fur':\s*\(\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*\)/);
  const nm = rc.match(/CLOTH_FUR_TONES\s*=\s*(\d+)/);
  const n = nm ? +nm[1] : NaN;
  ok(!!base && !!k && !!fur && Number.isFinite(n), '재료 넷을 `render_common.py` 에서 읽었다 — T81 값 · 허리끈 비 · 톤 수 · 표의 갖옷', JSON.stringify({ base, k: k && k[0], n, fur }));
  if (base && k && fur && Number.isFinite(n)) {
    const want = base.map((v) => v * Math.pow(k[0], n));
    const d = Math.max(...want.map((v, i) => Math.abs(v - fur[i])));
    ok(d < 1e-9, `★★표의 갖옷 = T81 × ${k[0]}^${n} (글자 그대로의 곱 — 손으로 고른 색이 아니다)`, `최대차 ${d.toExponential(1)}`);
    ok(n >= 1 && d < 1e-9 && fur.every((v, i) => v < base[i]), '★자명 통과 금지 — 유도가 실제로 값을 옮겼다(T81 값과 다르다 · 더 어둡다 = "hide 보다 어둡고 붉다" 유지)',
      `${base.join(',')} → ${fur.join(',')}`);
    const ratio = (c) => [c[0] / c[2], c[1] / c[2]];
    const rb = ratio(base), rf = ratio(fur);
    ok(Math.abs(rb[0] - rf[0]) < 1e-9 && Math.abs(rb[1] - rf[1]) < 1e-9, '색조 무변 — 세 채널을 같은 비로 곱했다(붉은 기 그대로 · 밝기만 옮겼다)', `R/B ${rf[0].toFixed(4)} · G/B ${rf[1].toFixed(4)}`);
  }
}

console.log(`\n=== ${pass + fail}건 중 PASS ${pass} · FAIL ${fail} ===`);
console.log('    접점: T515 · char_render · render_common CLOTH_MATS · clothes_fur · 42-r2-char clothLayerOf · e2e-charsprite ⓗ');
process.exit(fail ? 1 : 0);
