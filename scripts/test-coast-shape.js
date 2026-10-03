#!/usr/bin/env node
// @regress
// === scripts/test-coast-shape.js — 해안 구간 성격 생성기(T588 · `public/coast-shape.js` · 손잡이 `T588_COAST`) ======
//
// ★왜 [T588 · 족보 480·541]: 해안선 띠를 구간마다 다른 성격(굴곡 차원 D — T589 고증)으로 깎는 생성기를 **손잡이 뒤에** 넣었다.
//   손잡이를 켜는 것은 재민 ○ 뒤 PM 이다. 그때까지 이 하네스가 지키는 것:
//   ① 끔 = 지금 식 — 켬이어도 **구간 표가 비면** 지금 식과 칸·순서까지 같다(전 뭍 존) ⇒ 새 길의 "지금 식 몫"이 정본 식 그대로다
//   ② 결정적 — 같은 입력 두 번 = 같은 칸 · 엔진 무관 수학(√ 사슬 2^x 가 정확한 자리에서 정확)
//   ③ 솔기 0 — 두 존 경계에 걸친 **가짜 존**으로 구워도 두 존이 따로 구운 칸과 같다(칸의 답이 세계 좌표만의 함수) · 두 안(a·b)
//   ④ 클라 쌍둥이 — 클라 `00-const.js computeCoastlineWaterTiles` 를 소스에서 떼어 돌리면 서버와 같은 칸(a·b)
//   ⑤ 성격이 실제로 먹는다 — 켬이면 한반도 남해안이 바뀌고(구간 몸통 1셀 돌기 0) · 표에 수가 없는 구간(중원 동해안)은 몸통이 그대로
//   ⑥ 자명 통과 금지 — 세계 좌표가 아닌 것(존 자리)을 잡음에 섞은 돌연변이를 ③ 이 **문다** · 표를 바꾸면 ⑤ 가 바뀜을 본다
//   ⑦ ★[T588 추신2] T591 띠 배수 위 — 닛폰(배수 0.298) 켬 판의 띠 몫이 끔(T591) 판 몫 근처다(배수가 구간 띠 바탕에도 곱해진다 · 굴곡은 그 위) ·
//      배수를 빼먹은 돌연변이(배수 함수 = 1)는 이 자가 **문다** · 빌려 쓴 구간(닛폰 서·남)은 켬이면 바뀐다 · 배수 존에 배수 함수가 안 오면 던진다
// 실행: node scripts/test-coast-shape.js
'use strict';
const path = require('path');
const fs = require('fs');
const ROOT = path.join(__dirname, '..');
const R = (p) => require(path.join(ROOT, p));
delete process.env.T588_COAST;
const { ZONES, findZoneAt, publicZoneMap } = R('server/zone-config');
const chunk = R('server/chunk');
const CS = R('public/coast-shape.js');
let pass = 0, fail = 0;
const ok = (c, m, d) => { c ? pass++ : fail++; console.log((c ? '  ✓ ' : '  ✗ ') + m + (d !== undefined && d !== '' ? `  ${d}` : '')); };
const OR = Object.values(ZONES).filter((z) => z.isOcean).map((z) => ({ x0: z.worldOffsetX, y0: z.worldOffsetY, x1: z.worldOffsetX + z.zoneWidth, y1: z.worldOffsetY + z.zoneHeight }));
const BASE = 6000, NOISE = 5000;
{ const src = fs.readFileSync(path.join(ROOT, 'server', 'chunk.js'), 'utf8');
  ok(/const COASTLINE_BASE = 6000;/.test(src) && /const COASTLINE_NOISE = 5000;/.test(src), '⓪ 전제: 띠 상수가 chunk.js 정본과 같은 수(이 하네스의 BASE·NOISE)'); }
const gen = (zid, env) => { if (env) process.env.T588_COAST = env; else delete process.env.T588_COAST;
  const s = chunk.generateCoastlineWaterTiles({ ...ZONES[zid], id: zid }, 32, findZoneAt, OR); delete process.env.T588_COAST; return s; };
const same = (a, b) => { const A = [...a], B = [...b]; if (A.length !== B.length) return false; for (let i = 0; i < A.length; i++) if (A[i] !== B[i]) return false; return true; };
const diffN = (a, b) => { let n = 0; for (const k of a) if (!b.has(k)) n++; for (const k of b) if (!a.has(k)) n++; return n; };

// ── ① 끔 = 켬 + 빈 표(전 뭍 존 · 순서까지) ────────────────────────────────────────────
console.log('\n① 켬이어도 구간 표가 비면 지금 식 그대로(칸·순서) — 전 뭍 존');
{
  const empty = { chars: {} };
  let bad = [], n = 0, cells = 0;
  for (const [id, z] of Object.entries(ZONES)) {
    if (z.isOcean) continue; n++;
    const off = gen(id);
    const onEmpty = CS.generate({ ...z, id }, 32, OR, ZONES, BASE, NOISE, _oldDepth(), Object.assign({ bandK: _bandK() }, empty));   // 정본 생성기 · 정본 지금 식 함수 · 정본 배수 함수 · 빈 표
    cells += off.size;
    if (!same(off, onEmpty)) bad.push(id);
  }
  ok(n >= 18 && bad.length === 0, '① ★끔 판 = 켬 + 빈 표 판 — 같은 칸 · 같은 순서(지금 식 몫이 정본 식 그대로)', `${n}존 · ${cells.toLocaleString()}칸 · 다른 존 ${bad.join(',') || 0}`);
}
// 지금 식의 깊이 함수 · T591 배수 함수 — chunk.js 가 생성기에 넘기는 바로 그 함수들(정본에서 가져온다: 손잡이 켬 길이 생성기를 부르는 인자를 엿본다)
function _chunkArgs() {
  if (_chunkArgs.v) return _chunkArgs.v;
  const g = CS.generate; let got = null;
  CS.generate = function (zone, ts, ors, zones, base, noise, old, opts) { got = { old, bandK: opts && opts.bandK }; return new Set(); };
  try { process.env.T588_COAST = 'a'; chunk.generateCoastlineWaterTiles({ ...ZONES.hanbando, id: 'hanbando' }, 32, findZoneAt, OR); }
  finally { CS.generate = g; delete process.env.T588_COAST; }
  _chunkArgs.v = got; return got;
}
function _oldDepth() { return _chunkArgs().old; }
function _bandK() { return _chunkArgs().bandK; }

// ── ② 결정적 · 엔진 무관 수학 ─────────────────────────────────────────────────────────
console.log('\n② 결정적 — 같은 입력 두 번 = 같은 칸 · 2^x √ 사슬');
{
  const a1 = gen('hanbando', 'a'), a2 = gen('hanbando', 'a'), b1 = gen('hanbando', 'b');
  ok(same(a1, a2), '② 켬(a) 두 번 = 같은 칸 · 같은 순서', `${a1.size.toLocaleString()}칸`);
  ok(diffN(a1, b1) > 0, '②b 두 안(a·b)은 다른 칸을 낸다(진폭이 실제로 먹는다)', `${diffN(a1, b1).toLocaleString()}칸 다름`);
  ok(CS.pow2(0.5) === Math.SQRT2 && CS.pow2(-1) === 0.5 && CS.pow2(3) === 8 && CS.pow2(0) === 1, '②c pow2 — 정확한 자리(2^½ · 2^-1 · 2^3 · 2^0)에서 정확');
  let maxRel = 0; for (let x = -6; x <= 6; x += 0.37) maxRel = Math.max(maxRel, Math.abs(CS.pow2(x) / Math.pow(2, x) - 1));
  ok(maxRel < 1e-14, '②d pow2 — 2^x 와 끝자리 몇 개 안(√ 사슬 · Math.pow 안 씀)', `최대 상대오차 ${maxRel.toExponential(1)}`);
}

// ── ③ 솔기 0 — 경계에 걸친 가짜 존 = 두 존 따로 ───────────────────────────────────────
console.log('\n③ 솔기 0 — 존 경계에 걸친 가짜 존으로 구워도 두 존이 따로 구운 칸과 같다');
function seamCheck(variant, gen2) {
  // 한반도|닛폰 경계(x 480000) 남해안 · 중원북|한반도 남서 꼭짓점(409984,180000) — 가짜 존은 두 존에 걸친다
  const boxes = [[480000 - 9600, 180000 - 16000, 19200, 16000], [409984 - 9600, 180000 - 16000, 19200, 16000]];
  let cmp = 0, bad = 0;
  for (const [x0, y0, w, h] of boxes) {
    const fake = { id: 'fake', worldOffsetX: x0, worldOffsetY: y0, zoneWidth: w, zoneHeight: h };
    const F = gen2(fake);
    const real = {};
    for (let ty = 2; ty < h / 32 - 2; ty++) for (let tx = 2; tx < w / 32 - 2; tx++) {   // 가짜 존 테두리 두 칸은 뺀다(갇힌 바다 메우기는 존 테두리를 본다)
      const ax = x0 + tx * 32 + 16, ay = y0 + ty * 32 + 16, z = findZoneAt(ax, ay); if (!z || z.isOcean) continue;
      if (!real[z.id]) real[z.id] = gen2({ ...ZONES[z.id], id: z.id });
      const lx = Math.floor((ax - ZONES[z.id].worldOffsetX) / 32), ly = Math.floor((ay - ZONES[z.id].worldOffsetY) / 32);
      cmp++; if (F.has(`${tx}_${ty}`) !== real[z.id].has(`${lx}_${ly}`)) bad++;
    }
  }
  return { cmp, bad };
}
const genV = (variant) => (zone) => CS.generate(zone, 32, OR, ZONES, BASE, NOISE, _oldDepth(), { variant, bandK: _bandK() });
for (const v of ['a', 'b']) { const r = seamCheck(v, genV(v)); ok(r.cmp > 100000 && r.bad === 0, `③ ★안 ${v} — 경계에 걸친 가짜 존 = 두 존 따로(칸마다)`, `${r.cmp.toLocaleString()}칸 대조 · 다름 ${r.bad}`); }

// ── ④ 클라 쌍둥이 — 00-const.js 를 소스에서 떼어 돌린다 ─────────────────────────────────
console.log('\n④ 클라 쌍둥이 — 00-const.js computeCoastlineWaterTiles = 서버(같은 파일 · 같은 칸)');
{
  const src = fs.readFileSync(path.join(ROOT, 'public', 'client', '00-const.js'), 'utf8');
  const a = src.indexOf('const COASTLINE_BASE = 6000, COASTLINE_NOISE = 5000;'), b = src.indexOf('// zonesMeta 받으면 모든 zone water tiles 미리 계산');
  ok(a > 0 && b > a, '④ 전제: 클라 해안 조각을 소스에서 찾았다', `${a}~${b}`);
  const make = new Function('zonesMeta', 'uiCfg', 'CoastShape', src.slice(a, b) + '\nreturn computeCoastlineWaterTiles;');
  const zm = publicZoneMap('localhost');
  for (const v of ['', 'a', 'b']) {
    const f = make(zm, v ? { coast588: v } : {}, CS);
    let badZ = [];
    for (const zid of ['hanbando', 'nippon', 'jungwon_n']) { const c = f(zm[zid], 32), s = gen(zid, v || undefined); if (!same(c, s)) badZ.push(zid); }
    ok(badZ.length === 0, `④ ★클라 = 서버 — ${v ? '켬 ' + v : '끔'}(한반도·닛폰·중원북 칸·순서)`, badZ.join(',') || '셋 다 같음');
  }
}

// ── ⑤ 성격이 실제로 먹는다 · 표에 없는 구간은 그대로 ─────────────────────────────────────
console.log('\n⑤ 켬이면 한반도 남해안이 바뀐다 · 구간 몸통 1셀 돌기 0 · 표에 수가 없는 중원 동해안 몸통은 그대로');
{
  const off = gen('hanbando'), on = gen('hanbando', 'a');
  ok(diffN(off, on) > 1000, '⑤ 켬(a) — 한반도 띠가 실제로 바뀐다', `${diffN(off, on).toLocaleString()}칸`);
  const NX = Math.ceil(ZONES.hanbando.zoneWidth / 32), NY = Math.ceil(ZONES.hanbando.zoneHeight / 32);
  const sea = (s, x, y) => (x < 0 || y < 0 || x >= NX) ? false : (y >= NY ? true : s.has(`${x}_${y}`));
  const spikes = (s, x0, x1) => { let n = 0; for (let y = NY - 400; y < NY; y++) for (let x = x0; x < x1; x++) { const v = sea(s, x, y); let k = 0;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (sea(s, x + dx, y + dy) !== v) k++; if (k >= 3) n++; } return n; };
  const T = Math.ceil(BASE / 2 / 32);   // 구간 몸통 = 섞임 폭 반(T/2)을 뗀 곳
  ok(spikes(on, T, NX - T) === 0, '⑤b ★켬 — 구간 몸통에 1셀 돌기(4방 셋 이상이 반대편) 0', `지금 식 ${spikes(off, T, NX - T)}곳 → ${spikes(on, T, NX - T)}`);
  // 중원남 동변(jw_e — T589 미확인 · 빌려 쓰기 짝 없음) — 존 통째로 켬 = 끔(이웃 구간 섞임이 닿는 자리도 없다)
  const offJ = gen('jungwon_s'), onJ = gen('jungwon_s', 'a');
  ok(offJ.size > 1000 && diffN(offJ, onJ) === 0, '⑤c 표에 성격 수가 없는 구간(중원 동해안 — T589 미확인)은 켬이어도 그대로', `${offJ.size.toLocaleString()}칸 · 다름 ${diffN(offJ, onJ)}`);
}

// ── ⑥ 자명 통과 금지 ───────────────────────────────────────────────────────────────
console.log('\n⑥ 자명 통과 금지 — 존 자리에 기대는 돌연변이를 ③ 이 문다 · 표를 바꾸면 칸이 바뀐다');
{
  // 돌연변이: 깊이 잡음에 **존 자리**(세계 좌표가 아닌 것)를 섞는다 — 두 존이 같은 칸에 다른 답을 내야 한다
  const mut = (zone) => CS.generate(zone, 32, OR, ZONES, BASE, NOISE, (x, y) => _oldDepth()(x, y) + (zone.worldOffsetX % 7) * 300, { chars: {}, bandK: _bandK() });
  const r = seamCheck('mut', mut);
  ok(r.bad > 0, '⑥ ★존 자리를 섞은 돌연변이 → ③ 솔기 자가 **문다**(잡을 수 있는 자다)', `다름 ${r.bad.toLocaleString()}칸`);
  const alt = JSON.parse(JSON.stringify(CS.CHAR)); alt.kr_e.D = 1.3;
  const a = CS.generate({ ...ZONES.hanbando, id: 'hanbando' }, 32, OR, ZONES, BASE, NOISE, _oldDepth(), { variant: 'a', bandK: _bandK() });
  const b = CS.generate({ ...ZONES.hanbando, id: 'hanbando' }, 32, OR, ZONES, BASE, NOISE, _oldDepth(), { variant: 'a', chars: alt, bandK: _bandK() });
  ok(diffN(a, b) > 0, '⑥b 표의 D 한 칸(한반도 동 1.037 → 1.3)을 바꾸면 칸이 바뀐다(표를 실제로 읽는다)', `${diffN(a, b).toLocaleString()}칸`);
}

// ── ⑦ T591 띠 배수 위(★추신2) ─────────────────────────────────────────────────────────
console.log('\n⑦ T591 띠 배수 위 — 닛폰 켬 띠 몫 ≈ 끔(T591) 몫 · 배수 빼먹은 돌연변이를 문다 · 빌려 쓴 구간이 먹는다 · 배수 함수 없으면 던진다');
{
  const K = CS.kOf(ZONES.nippon);
  ok(K > 0 && K < 1, '⑦ 전제: 닛폰에 T591 배수가 있다(zone-config `coastBandK`)', `${K}`);
  const NC = Math.ceil(ZONES.nippon.zoneWidth / 32) * Math.ceil(ZONES.nippon.zoneHeight / 32);
  const off = gen('nippon'), on = gen('nippon', 'a');
  const r = on.size / off.size;
  ok(r > 0.8 && r < 1.25, '⑦b ★닛폰 켬(a) 띠 몫이 끔(T591 배수 판) 몫의 0.8~1.25배 — 배수가 구간 띠 바탕에도 곱해진다(굴곡은 그 위)', `끔 ${(100 * off.size / NC).toFixed(2)}% · 켬 ${(100 * on.size / NC).toFixed(2)}% (×${r.toFixed(3)})`);
  const mut = CS.generate({ ...ZONES.nippon, id: 'nippon' }, 32, OR, ZONES, BASE, NOISE, _oldDepth(), { variant: 'a', bandK: () => 1 });
  const rm = mut.size / off.size;
  ok(!(rm > 0.8 && rm < 1.25), '⑦c 배수를 빼먹은 돌연변이(배수 함수 = 1) → ⑦b 자가 **문다**', `돌연변이 ${(100 * mut.size / NC).toFixed(2)}% (×${rm.toFixed(3)})`);
  // 빌려 쓴 구간(닛폰 서·남 — 남변) 몸통이 켬이면 바뀐다 · 표에서 빌림을 지우면(미확인) 남변 몸통은 끔과 같다
  const NXn = Math.ceil(ZONES.nippon.zoneWidth / 32), NYn = Math.ceil(ZONES.nippon.zoneHeight / 32), Tn = Math.ceil(BASE / 2 / 32) + 2;
  const southBody = (s) => { const o = new Set(); for (const k of s) { const [x, y] = k.split('_').map(Number); if (y > NYn - 400 && x > Tn && x < NXn - 700) o.add(k); } return o; };
  const ch2 = JSON.parse(JSON.stringify(CS.CHAR)); delete ch2.jp_w; delete ch2.jp_s;
  const noBorrow = CS.generate({ ...ZONES.nippon, id: 'nippon' }, 32, OR, ZONES, BASE, NOISE, _oldDepth(), { variant: 'a', chars: ch2, bandK: _bandK() });
  ok(diffN(southBody(off), southBody(on)) > 100, '⑦d 빌려 쓴 구간(닛폰 남변 — 서 ← 한반도 동 · 남 ← 한반도 남)이 켬이면 바뀐다', `${diffN(southBody(off), southBody(on)).toLocaleString()}칸`);
  ok(diffN(southBody(off), southBody(noBorrow)) === 0, '⑦e 빌림을 지우면(미확인) 닛폰 남변 몸통 = 끔(빌림만이 남변을 바꾼다)', `다름 ${diffN(southBody(off), southBody(noBorrow))}`);
  let threw = false; try { CS.generate({ ...ZONES.nippon, id: 'nippon' }, 32, OR, ZONES, BASE, NOISE, _oldDepth(), { variant: 'a' }); } catch (e) { threw = /bandK/.test(String(e && e.message)); }
  ok(threw, '⑦f 배수 존이 있는데 배수 함수가 안 오면 던진다(조용히 어긋나지 않는다)');
}

console.log(`\n=== PASS ${pass} / FAIL ${fail} ===`);
process.exit(fail ? 1 : 0);
