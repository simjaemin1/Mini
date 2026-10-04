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
//   ⑧ ★[T604 추신2] 존별 평행이동 `coastShift`(★T637 ⑧k·⑧l — 뭍 이웃 경계 잇는 폭 = COASTLINE_BASE) — 이동 0 = 비트 그대로 · 이동하면 띠가 줄기만 한다(부분집합) · 켬 + 빈 표 + 이동 = 끔 + 이동(같은 자리) ·
//      솔기 0(이동 다른 두 존 경계) · 뭍 이웃 경계에서 계단 없음(비탈) — 비탈 뺀 돌연변이를 이 자가 **문다** · 클라 = 서버(이동) · 함수 없으면 던진다
//   ⑨ ★[T604 추신3] 기본 b · 한반도 이동 90(zone-config) · 끔(0) = 지금 바이트(이동도 안 먹는다) · **경계 앞 바다 ≥ 8셀**(핸드오프 겹침 띠 —
//      `HANDOFF_COMMIT` 정본 zone-config 를 서버 · 클라(/zones)가 읽는다 · 박힌 수 0): 셀 중심이 바다 존 사각에서 그 폭 안인 칸은 전 뭍 존 ·
//      기본 · 끔 · 극단 이동에서 다 바다 · 지킴은 그 띠에서만 먹는다 · 지킴 뺀 돌연변이(max(0, d − s))를 이 자가 **문다** · 서버 기본 = 클라 기본(b)
//   (①~⑦ 은 이동 없는 세계에서 잰다 — 한반도 `coastShift` 를 잠시 빼고 · ⑧⑨ 가 이동 판)
// 실행: node scripts/test-coast-shape.js
'use strict';
const path = require('path');
const fs = require('fs');
const ROOT = path.join(__dirname, '..');
const R = (p) => require(path.join(ROOT, p));
delete process.env.T588_COAST;
const ZC_ALL = R('server/zone-config');
const { ZONES, findZoneAt, publicZoneMap } = ZC_ALL;
const chunk = R('server/chunk');
const CS = R('public/coast-shape.js');
const SHIFT_CFG = ZONES.hanbando.coastShift;   // ★[T604 추신3] zone-config 정본 이동(재민 90) — ①~⑦ 은 이동 없는 세계에서 재고 ⑧ 머리에서 되돌린다
delete ZONES.hanbando.coastShift;
let pass = 0, fail = 0;
const ok = (c, m, d) => { c ? pass++ : fail++; console.log((c ? '  ✓ ' : '  ✗ ') + m + (d !== undefined && d !== '' ? `  ${d}` : '')); };
const OR = Object.values(ZONES).filter((z) => z.isOcean).map((z) => ({ x0: z.worldOffsetX, y0: z.worldOffsetY, x1: z.worldOffsetX + z.zoneWidth, y1: z.worldOffsetY + z.zoneHeight }));
const BASE = 6000, NOISE = 5000;
{ const src = fs.readFileSync(path.join(ROOT, 'server', 'chunk.js'), 'utf8');
  ok(/const COASTLINE_BASE = 6000;/.test(src) && /const COASTLINE_NOISE = 5000;/.test(src), '⓪ 전제: 띠 상수가 chunk.js 정본과 같은 수(이 하네스의 BASE·NOISE)'); }
// gen(존, 안) — 안: 없음 = 기본(★추신3 b) · '0' = 끔(지금 식) · 'a' · 'b'
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
    const off = gen(id, '0');
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
  CS.generate = function (zone, ts, ors, zones, base, noise, old, opts) { got = { old, bandK: opts && opts.bandK, bandShift: opts && opts.bandShift, keepPx: opts && opts.keepPx }; return new Set(); };
  try { process.env.T588_COAST = 'a'; chunk.generateCoastlineWaterTiles({ ...ZONES.hanbando, id: 'hanbando' }, 32, findZoneAt, OR); }
  finally { CS.generate = g; delete process.env.T588_COAST; }
  _chunkArgs.v = got; return got;
}
function _oldDepth() { return _chunkArgs().old; }
function _bandK() { return _chunkArgs().bandK; }
function _bandShift() { return _chunkArgs().bandShift; }
function _keepPx() { return _chunkArgs().keepPx; }   // ★추신3 — chunk.js 가 넘기는 지킴 폭(zone-config HANDOFF_COMMIT)

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
  const make = new Function('zonesMeta', 'uiCfg', 'CoastShape', 'handoffCommit', src.slice(a, b) + '\nreturn computeCoastlineWaterTiles;');
  const zm = publicZoneMap('localhost');
  for (const v of ['0', 'a', 'b']) {
    const f = make(zm, { coast588: v }, CS, ZC_ALL.HANDOFF_COMMIT);
    let badZ = [];
    for (const zid of ['hanbando', 'nippon', 'jungwon_n']) { const c = f(zm[zid], 32), s = gen(zid, v); if (!same(c, s)) badZ.push(zid); }
    ok(badZ.length === 0, `④ ★클라 = 서버 — ${v === '0' ? '끔' : '켬 ' + v}(한반도·닛폰·중원북 칸·순서)`, badZ.join(',') || '셋 다 같음');
  }
}

// ── ⑤ 성격이 실제로 먹는다 · 표에 없는 구간은 그대로 ─────────────────────────────────────
console.log('\n⑤ 켬이면 한반도 남해안이 바뀐다 · 구간 몸통 1셀 돌기 0 · 표에 수가 없는 중원 동해안 몸통은 그대로');
{
  const off = gen('hanbando', '0'), on = gen('hanbando', 'a');
  ok(diffN(off, on) > 1000, '⑤ 켬(a) — 한반도 띠가 실제로 바뀐다', `${diffN(off, on).toLocaleString()}칸`);
  const NX = Math.ceil(ZONES.hanbando.zoneWidth / 32), NY = Math.ceil(ZONES.hanbando.zoneHeight / 32);
  const sea = (s, x, y) => (x < 0 || y < 0 || x >= NX) ? false : (y >= NY ? true : s.has(`${x}_${y}`));
  const spikes = (s, x0, x1) => { let n = 0; for (let y = NY - 400; y < NY; y++) for (let x = x0; x < x1; x++) { const v = sea(s, x, y); let k = 0;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (sea(s, x + dx, y + dy) !== v) k++; if (k >= 3) n++; } return n; };
  const T = Math.ceil(BASE / 2 / 32);   // 구간 몸통 = 섞임 폭 반(T/2)을 뗀 곳
  ok(spikes(on, T, NX - T) === 0, '⑤b ★켬 — 구간 몸통에 1셀 돌기(4방 셋 이상이 반대편) 0', `지금 식 ${spikes(off, T, NX - T)}곳 → ${spikes(on, T, NX - T)}`);
  // 중원남 동변(jw_e — T589 미확인 · 빌려 쓰기 짝 없음) — 존 통째로 켬 = 끔(이웃 구간 섞임이 닿는 자리도 없다)
  const offJ = gen('jungwon_s', '0'), onJ = gen('jungwon_s', 'a');
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
  const off = gen('nippon', '0'), on = gen('nippon', 'a');
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

// ── ⑧ 존별 평행이동(★T604 추신2 · 추신3 정본 값) ─────────────────────────────────────────
console.log('\n⑧ 존별 평행이동 coastShift — 켬 길만(끔 = 지금 바이트) · 줄기만 · 몸통은 이동만큼 · 솔기 0 · 경계 계단 없음 · 클라 = 서버 · 던짐');
const SH = SHIFT_CFG;   // 셀 — ★추신3 zone-config 정본 값(재민 90)
const KEEP = ZC_ALL.HANDOFF_COMMIT;   // ★추신3 지킴 폭 — 정본 zone-config(박힌 수 0)
const OPT = (o) => Object.assign({ bandK: _bandK(), bandShift: _bandShift(), keepPx: _keepPx() }, o || {});
{
  const subset = (a, b) => { for (const k of a) if (!b.has(k)) return false; return true; };
  const off0 = gen('hanbando', '0'), b0 = gen('hanbando', 'b');   // 이동 없는 판(①~⑦ 세계)
  const e0 = CS.generate({ ...ZONES.hanbando, id: 'hanbando' }, 32, OR, ZONES, BASE, NOISE, _oldDepth(), { bandK: _bandK(), chars: {} });   // 켬 + 빈 표(= 지금 식) · 이동 없음
  ZONES.hanbando.coastShift = SH;   // 정본 값으로 되돌린다(⑨ 도 이 판)
  const off1 = gen('hanbando', '0'), b1 = gen('hanbando', 'b');
  const e1 = CS.generate({ ...ZONES.hanbando, id: 'hanbando' }, 32, OR, ZONES, BASE, NOISE, _oldDepth(), OPT({ chars: {} }));   // 켬 + 빈 표 + 이동
  ok(SH > 0 && b1.size < b0.size && subset(b1, b0) && e1.size < e0.size && subset(e1, e0), `⑧ 이동 ${SH}셀 — 켬(b · 빈 표) 띠가 줄기만 한다(이동 뒤 바다 ⊂ 이동 앞 바다)`,
    `b ${b0.size.toLocaleString()} → ${b1.size.toLocaleString()} · 빈 표 ${e0.size.toLocaleString()} → ${e1.size.toLocaleString()}`);
  ok(same(e0, off0) && same(off1, off0), '⑧a ★끔(0) = 지금 바이트 — zone-config 에 이동 90 이 있어도 끔은 이동을 안 먹는다(칸·순서 = 이동 없는 끔 = 켬 + 빈 표 · 이동 없음)',
    `끔 ${off0.size.toLocaleString()} = ${off1.size.toLocaleString()}`);
  // 띠 깊이(열마다 바다 변에서 첫 뭍까지 · 셀) — 존 몸통(뭍 이웃 변 비탈 밖)에서 꼭 이동만큼 줄어드는 열이 대부분(경계 앞 8셀 지킴이 멈춘 열만 덜 준다 — ⑨)
  const NX = Math.ceil(ZONES.hanbando.zoneWidth / 32), NY = Math.ceil(ZONES.hanbando.zoneHeight / 32), R = Math.ceil((BASE + NOISE) / 32) + 2;
  const depthCol = (set, x) => { let y = NY - 1; while (y >= 0 && set.has(`${x}_${y}`)) y--; return NY - 1 - y; };
  let exact = 0, n = 0; for (let x = R; x < NX - R; x += 7) { n++; const d0 = depthCol(e0, x), d1 = depthCol(e1, x); if (Math.abs((d0 - d1) - SH) <= 1) exact++; }
  ok(exact / n > 0.9, `⑧b 켬 + 빈 표(지금 식 꼴) · 몸통 열의 띠 깊이가 이동만큼(±1셀) 준다 — 이동은 마지막 깊이에서 빠진다`, `${exact}/${n}열`);
  // ⚠갇힌 바다 메우기는 존 사각을 본다("존 테두리에 닿는 덩이는 둔다") — 가짜 존 테두리가 덩이를 자르면 그 덩이만 다르다(실제 이웃 두 존은 경계에 걸친 덩이를
  //   둘 다 두니 같다). 이동하면 그런 덩이가 가짜 존 테두리에 걸린다(606칸 — 실측) ⇒ 이 자는 메우기를 끄고(keepPockets · 자 전용) 세계 좌표 몫만 견준다.
  const genS = (v) => (zone) => CS.generate(zone, 32, OR, ZONES, BASE, NOISE, _oldDepth(), OPT({ variant: v, keepPockets: true }));
  const r = seamCheck('b', genS('b'));
  ok(r.cmp > 100000 && r.bad === 0, '⑧d ★솔기 0 — 한반도만 이동(닛폰 0)인 경계에 걸친 가짜 존 = 두 존 따로(b · 메우기 뺀 세계 좌표 몫)', `${r.cmp.toLocaleString()}칸 · 다름 ${r.bad}`);
  // 경계 계단: 한반도|닛폰 경계(x 480000) 양옆 열의 띠 깊이 — 비탈이 있으면 거의 같고, 비탈을 뺀 돌연변이는 이동만큼 뛴다
  const nip = gen('nippon', 'b'), han = gen('hanbando', 'b');
  const NXh = NX, NYn = Math.ceil(ZONES.nippon.zoneHeight / 32);
  const dEdgeH = depthCol(han, NXh - 1), dEdgeN = (() => { let y = NYn - 1; while (y >= 0 && nip.has(`0_${y}`)) y--; return NYn - 1 - y; })();
  ok(Math.abs(dEdgeH - dEdgeN) <= 3, `⑧e ★뭍 이웃 경계에서 계단 없음 — 한반도 끝 열 · 닛폰 첫 열 띠 깊이(이동 ${SH} · 비탈)`, `${dEdgeH} · ${dEdgeN}셀`);
  const mut = CS.generate({ ...ZONES.hanbando, id: 'hanbando' }, 32, OR, ZONES, BASE, NOISE, _oldDepth(), OPT({ variant: 'b', bandShift: (z) => (z.coastShift || 0) * 32 }));
  const dMut = depthCol(mut, NXh - 1);
  ok(Math.abs(dMut - dEdgeN) > 30, '⑧f 비탈을 뺀 돌연변이(평행이동 고르게) → ⑧e 자가 **문다**(경계에서 이동만큼 계단)', `${dMut} · ${dEdgeN}셀`);
  // ★[T637] 잇는 폭 = COASTLINE_BASE(띠 평균 깊이 187.5셀) — 경계에서 k셀 들어간 열의 이동 = 이동 × min(1, k ÷ 187.5)(±2셀) · 종전(잇는 폭 = 이동 90 · 45°)이면 47셀 안에서 이미 47
  { const prof = [0, 47, 94, 141, 200].map((k) => { const x = NX - 1 - k; return { k, d: depthCol(e0, x) - depthCol(e1, x), want: SH * Math.min(1, (k * 32) / BASE) }; });
    const okP = prof.every((q) => Math.abs(q.d - q.want) <= 2);
    const westP = [0, 94, 200].map((k) => ({ k, d: depthCol(e0, k) - depthCol(e1, k), want: SH * Math.min(1, (k * 32) / BASE) }));
    ok(okP && westP.every((q) => Math.abs(q.d - q.want) <= 2), `⑧k ★[T637] 경계 잇기 폭 = 띠 평균 깊이(${(BASE / 32).toFixed(1)}셀) — 닛폰 쪽(동) · 중원북 쪽(서) 경계에서 k셀 들어간 열의 이동 = ${SH} × min(1, k ÷ ${(BASE / 32).toFixed(1)})`,
      prof.map((q) => `동${q.k}:${q.d}/${q.want.toFixed(1)}`).join(' ') + ' · ' + westP.map((q) => `서${q.k}:${q.d}/${q.want.toFixed(1)}`).join(' '));
    const old45 = CS.generate({ ...ZONES.hanbando, id: 'hanbando' }, 32, OR, ZONES, BASE, NOISE, _oldDepth(), OPT({ chars: {}, bandShift: (z, ax) => { const zx1 = z.worldOffsetX + z.zoneWidth, zx0 = z.worldOffsetX; return SH * 32 * Math.min(1, Math.min(ax - zx0, zx1 - ax) / (SH * 32)); } }));
    const d47 = depthCol(e0, NX - 1 - 47) - depthCol(old45, NX - 1 - 47);
    ok(Math.abs(d47 - 47) <= 2 && Math.abs(d47 - prof[1].d) > 15, '⑧l 돌연변이(종전 잇는 폭 = 이동 90 · 45°) → ⑧k 자가 **문다**(47셀 들어간 열이 47셀 이동)', `종전 ${d47} · 지금 ${prof[1].d}`);
  }
  // 클라 쌍둥이(이동 칸이 /zones 로 실려 간다 · 지킴 폭도 /zones 의 handoffCommit)
  const src = fs.readFileSync(path.join(ROOT, 'public', 'client', '00-const.js'), 'utf8');
  const a = src.indexOf('const COASTLINE_BASE = 6000, COASTLINE_NOISE = 5000;'), bb = src.indexOf('// zonesMeta 받으면 모든 zone water tiles 미리 계산');
  const make = new Function('zonesMeta', 'uiCfg', 'CoastShape', 'handoffCommit', src.slice(a, bb) + '\nreturn computeCoastlineWaterTiles;');
  const zm = publicZoneMap('localhost');
  ok(zm.hanbando && zm.hanbando.coastShift === SH, '⑧g 전제: /zones 에 이동 칸이 실린다(있을 때만)', String(zm.hanbando && zm.hanbando.coastShift));
  let badC = [];
  for (const v of ['0', 'b']) { const f = make(zm, { coast588: v }, CS, KEEP); if (!same(f(zm.hanbando, 32), gen('hanbando', v))) badC.push(v === '0' ? '끔' : v); }
  ok(badC.length === 0, `⑧h ★클라 = 서버 — 이동 ${SH}(끔 = 이동 안 먹음 · b · 한반도 칸·순서)`, badC.join(',') || '둘 다 같음');
  let threw = false; try { CS.generate({ ...ZONES.hanbando, id: 'hanbando' }, 32, OR, ZONES, BASE, NOISE, _oldDepth(), { variant: 'b', bandK: _bandK() }); } catch (e) { threw = /bandShift/.test(String(e && e.message)); }
  let threwK = false; try { CS.generate({ ...ZONES.hanbando, id: 'hanbando' }, 32, OR, ZONES, BASE, NOISE, _oldDepth(), { variant: 'b', bandK: _bandK(), bandShift: _bandShift() }); } catch (e) { threwK = /keepPx/.test(String(e && e.message)); }
  ok(threw && threwK, '⑧i 이동 존이 있는데 평행이동 함수 · 지킴 폭(keepPx)이 안 오면 던진다(조용히 어긋나지 않는다)');
  delete ZONES.hanbando.coastShift;
  try { ok(same(gen('hanbando', 'b'), b0) && publicZoneMap('localhost').hanbando.coastShift === undefined, '⑧j 이동을 지우면 b 칸 = 이동 없는 b · /zones 에 칸 없음(종전 바이트)'); }
  finally { ZONES.hanbando.coastShift = SH; }
}

// ── ⑨ 기본 b · 정본 이동 · 경계 앞 바다 ≥ 핸드오프 겹침 띠(★T604 추신3) ─────────────────────────
console.log('\n⑨ 기본 b · 한반도 이동(정본) · 경계 앞 바다 ≥ 8셀(핸드오프 겹침 띠 HANDOFF_COMMIT — 박힌 수 0) — 전 뭍 존 · 지킴은 그 띠에서만 · 지킴 뺀 돌연변이를 문다 · 서버 기본 = 클라 기본');
{
  const zsrc = fs.readFileSync(path.join(ROOT, 'server', 'zone.js'), 'utf8');
  const csrc0 = fs.readFileSync(path.join(ROOT, 'server', 'zone-config.js'), 'utf8');
  const chsrc = fs.readFileSync(path.join(ROOT, 'server', 'chunk.js'), 'utf8');
  const cssrc = fs.readFileSync(path.join(ROOT, 'public', 'coast-shape.js'), 'utf8');
  const cesrc = fs.readFileSync(path.join(ROOT, 'server', 'central.js'), 'utf8');
  const nnsrc = fs.readFileSync(path.join(ROOT, 'public', 'client', '30-n-net.js'), 'utf8');
  const csrc = fs.readFileSync(path.join(ROOT, 'public', 'client', '00-const.js'), 'utf8');
  const one = /^const HANDOFF_COMMIT = (\d+);/m.exec(csrc0);
  ok(one && +one[1] === KEEP && KEEP / 32 === 8 && !/^const HANDOFF_COMMIT = /m.test(zsrc) && /\bHANDOFF_COMMIT \} = require\('\.\/zone-config'\)/.test(zsrc),
    '⑨ 전제: 핸드오프 겹침 띠 `HANDOFF_COMMIT` 정본 한 자리 = zone-config(8셀) · zone.js 는 거기서 받는다(제 글자 0)', `zone-config ${one && one[1]} · zone.js 정의 ${/^const HANDOFF_COMMIT = /m.test(zsrc) ? '있음' : '0'}`);
  ok(/keepPx: _ZC\.HANDOFF_COMMIT/.test(chsrc) && /handoffCommit: HANDOFF_COMMIT/.test(cesrc) && /handoffCommit = \(typeof data\.handoffCommit === 'number'/.test(nnsrc) && /keepPx: handoffCommit/.test(csrc)
    && !/\b256\b/.test(cssrc.replace(/\/\/.*$/gm, '')) && _keepPx() === KEEP,
    '⑨a ★박힌 수 0 — 지킴 폭은 HANDOFF_COMMIT 를 읽는다: 서버 chunk.js → 생성기 keepPx · central /zones → 클라 handoffCommit → 생성기 keepPx · coast-shape.js 에 256 글자 0', `chunk.js 가 넘긴 keepPx ${_keepPx()}`);
  ok(SH === 90 && !ZONES.nippon.coastShift && !ZONES.jungwon_n.coastShift, '⑨b ★zone-config — 한반도 이동 90셀(재민 값) · 닛폰 · 중원북 없음(재민 ○ 뒤)', `한반도 ${SH} · 닛폰 ${ZONES.nippon.coastShift || 0} · 중원북 ${ZONES.jungwon_n.coastShift || 0}`);
  // 서버 기본(env 없음) = b · welcome 칸 = 'b' · 클라 uiCfg 기본 = 'b'
  const dflt = ['hanbando', 'nippon', 'jungwon_n'].every((zid) => same(gen(zid), gen(zid, 'b')));
  const wl = /coast588: (\(\(v\) => \(v === '0' \? '0' : \(v === 'a' \? 'a' : 'b'\)\)\))\(process\.env\.T588_COAST\)/.exec(zsrc);
  const wf = wl ? (0, eval)(wl[1]) : null;
  const cl = /let uiCfg = \{[\s\S]*?coast588: '([a-z0-9]+)'[\s\S]*?\};/.exec(csrc);
  ok(dflt && wf && wf(undefined) === 'b' && wf('0') === '0' && wf('a') === 'a' && wf('1') === 'b' && cl && cl[1] === 'b',
    '⑨c ★기본 = b — 서버 env 없음 = b(칸·순서 · 한반도·닛폰·중원북) · welcome `coast588` 없음→b · 0→0 · a→a · 클라 `uiCfg` 기본 b', `서버 ${dflt ? '=b' : '≠b'} · welcome ${wf ? [undefined, '0', 'a', '1'].map((v) => wf(v)).join('/') : '못 찾음'} · 클라 ${cl ? cl[1] : '못 찾음'}`);
  // 경계 앞 띠: 셀 중심에서 가장 가까운 바다 존 사각까지(생성기와 같은 d) < KEEP 인데 뭍인 칸
  const keepCheck = (zid, set) => {
    const z = ZONES[zid], NXz = Math.ceil(z.zoneWidth / 32), NYz = Math.ceil(z.zoneHeight / 32), Rc = Math.ceil(KEEP / 32) + 1;
    let cand = 0, bad = 0; const cols = [];
    for (let y = 0; y < NYz; y++) for (let x = 0; x < NXz; x++) {
      if (Math.min(x, y, NXz - 1 - x, NYz - 1 - y) >= Rc) { x = NXz - 1 - Rc; continue; }
      const ax = z.worldOffsetX + x * 32 + 16, ay = z.worldOffsetY + y * 32 + 16;
      let bd = Infinity; for (const O of OR) { const nx = ax < O.x0 ? O.x0 : (ax > O.x1 ? O.x1 : ax), ny = ay < O.y0 ? O.y0 : (ay > O.y1 ? O.y1 : ay); const d = Math.hypot(ax - nx, ay - ny); if (d < bd) bd = d; }
      if (bd < KEEP) { cand++; if (!set.has(`${x}_${y}`)) { bad++; cols.push([x, y]); } }
    }
    return { cand, bad, cols };
  };
  const landZ = Object.keys(ZONES).filter((id) => !ZONES[id].isOcean);
  const seaZ = landZ.filter((id) => keepCheck(id, new Set()).cand > 0);   // 띠 칸이 있는 존(바다 변·꼭짓점)만 굽는다 — 나머지는 띠 칸 0
  for (const [lab, env] of [['기본(b)', undefined], ['끔(지금 식)', '0'], ['a', 'a']]) {
    let cand = 0, bad = 0, badZ = [];
    for (const zid of seaZ) { const k = keepCheck(zid, gen(zid, env)); cand += k.cand; bad += k.bad; if (k.bad) badZ.push(`${zid} ${k.bad}`); }
    ok(cand > 10000 && bad === 0, `⑨d ★경계 앞 바다 ≥ 8셀 — ${lab} · 전 뭍 존(${landZ.length} 중 바다에 닿는 ${seaZ.length}) · 정본 이동(한반도 ${SH})`, `띠 칸 ${cand.toLocaleString()} · 뭍 ${bad}${badZ.length ? ' — ' + badZ.join(', ') : ''}`);
  }
  // 극단 이동: 셋 다 90 · 한반도 300(띠 가장 깊은 곳보다 깊게) — 지킴은 그래도 8셀
  const save = { nippon: ZONES.nippon.coastShift, jungwon_n: ZONES.jungwon_n.coastShift };
  ZONES.nippon.coastShift = 90; ZONES.jungwon_n.coastShift = 90;
  let ex = [];
  try {
    for (const zid of ['hanbando', 'nippon', 'jungwon_n']) { const k = keepCheck(zid, gen(zid, 'b')); if (k.bad) ex.push(`${zid} ${k.bad}`); }
    ZONES.hanbando.coastShift = 300; { const k = keepCheck('hanbando', gen('hanbando', 'b')); if (k.bad) ex.push(`hanbando@300 ${k.bad}`); const k2 = keepCheck('hanbando', gen('hanbando', 'a')); if (k2.bad) ex.push(`hanbando@300a ${k2.bad}`); }
  } finally { ZONES.hanbando.coastShift = SH; for (const z of ['nippon', 'jungwon_n']) { if (save[z] === undefined) delete ZONES[z].coastShift; else ZONES[z].coastShift = save[z]; } }
  ok(ex.length === 0, '⑨e ★극단 이동에서도 경계 앞 8셀 — 한반도·닛폰·중원북 90(b) · 한반도 300(b · a)', ex.join(', ') || '뭍 0');
  // 지킴 뺀 돌연변이(추신2 판 식 max(0, d − s)) — 이 자가 문다 · 지킴은 그 띠에서만 먹는다(지킴 판 ⊇ 뺀 판 · 더해진 칸은 다 띠 안)
  const g0 = CS.shiftDepth;
  const hanG = gen('hanbando'); let hanN, kN;
  CS.shiftDepth = (d, s) => (s === 0 ? d : Math.max(0, d - s));
  try { hanN = gen('hanbando'); kN = keepCheck('hanbando', hanN); } finally { CS.shiftDepth = g0; }
  const runs = []; { const xs = [...new Set(kN.cols.map((c) => c[0]))].sort((p, q) => p - q); let i = 0; while (i < xs.length) { let j = i; while (j + 1 < xs.length && xs[j + 1] === xs[j] + 1) j++; runs.push(`x ${xs[i]}~${xs[j]}`); i = j + 1; } }
  ok(kN.bad > 0, '⑨f ★지킴 뺀 돌연변이(max(0, d − s)) → ⑨d 자가 **문다** — 한반도 기본(b + 90)에서 경계 앞 바다가 8셀보다 얇은 곳', `${kN.bad}칸 · 남변 ${runs.join(' · ')}`);
  let sup = true; for (const k of hanN) if (!hanG.has(k)) { sup = false; break; }
  let addIn = 0, addOut = 0; { const z = ZONES.hanbando; for (const k of hanG) if (!hanN.has(k)) { const [x, y] = k.split('_').map(Number); const ay = z.worldOffsetY + y * 32 + 16; const dS = (z.worldOffsetY + z.zoneHeight) - ay; if (dS < KEEP) addIn++; else addOut++; } }
  ok(sup && addIn > 0 && addOut === 0, '⑨g 지킴은 경계 앞 8셀 띠에서만 먹는다 — 지킴 판 ⊇ 뺀 판 · 더해진 바다 칸은 다 띠 안(남변)', `더해진 칸 ${addIn} · 띠 밖 ${addOut}`);
  // 이동 없는 존은 지킴이 안 닿는다(비트 그대로) — 닛폰 · 중원북 기본 판 = 지킴 뺀 판
  CS.shiftDepth = (d, s) => (s === 0 ? d : Math.max(0, d - s));
  let nN, jN; try { nN = gen('nippon'); jN = gen('jungwon_n'); } finally { CS.shiftDepth = g0; }
  ok(same(nN, gen('nippon')) && same(jN, gen('jungwon_n')), '⑨h 이동 없는 존(닛폰 · 중원북)은 지킴이 안 닿는다 — 칸·순서 그대로');
  // 클라 = 서버(/zones 의 handoffCommit 을 받은 클라) · 그 칸을 안 받은 클라(0)는 지킴 열에서 갈린다(배선이 실제로 먹는다)
  const a = csrc.indexOf('const COASTLINE_BASE = 6000, COASTLINE_NOISE = 5000;'), bb = csrc.indexOf('// zonesMeta 받으면 모든 zone water tiles 미리 계산');
  const make = new Function('zonesMeta', 'uiCfg', 'CoastShape', 'handoffCommit', csrc.slice(a, bb) + '\nreturn computeCoastlineWaterTiles;');
  const zm = publicZoneMap('localhost');
  const okC = ['b', '0'].every((v) => same(make(zm, { coast588: v }, CS, KEEP)(zm.hanbando, 32), gen('hanbando', v === 'b' ? undefined : v)));
  const noK = make(zm, { coast588: 'b' }, CS, 0)(zm.hanbando, 32), dK = diffN(noK, hanG);
  ok(okC && dK > 0 && same(noK, hanN), '⑨i ★클라 = 서버 — 기본(b) · 끔 · 이동 90 + 지킴(handoffCommit 받은 클라 · 한반도 칸·순서) · 안 받은 클라(0)는 지킴 뺀 판과 같다', `안 받은 클라 ↔ 서버 ${dK}칸`);
}

console.log(`\n=== PASS ${pass} / FAIL ${fail} ===`);
process.exit(fail ? 1 : 0);
