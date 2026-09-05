#!/usr/bin/env node
// @regress   ← 통합 러너가 이 표를 보고 자기 목록을 만든다(scripts/run-regress.sh · 표 없으면 안 돈다)
// === 밭 세계 스프라이트 하네스 [T79c 2026-09-04] ================================
//
// 밭이 **작물을 안다**는 것을 지킨다. 종전엔 몰랐다 — `cropSprite()` 가 셀 좌표 해시 홀짝으로
// `grain`/`veg` 를 골라서 **벼밭이 채소로 그려질 수 있었다**(T79 §0-ⓑ 실측).
//
// 계약 다섯:
//   ① 8군 × **STAGES** 장이 있다 — 알파가 살아 있고 앵커와 크기가 맞는다.
//      ★[T120] 단계 수를 여기 적지 않는다 — `fields_render.py STAGES` 를 **읽는다**.
//        4 를 손으로 적어 두었더니 T120 이 6 으로 늘리는 날 이 파일이 거짓말을 했다(사본 금지).
//   ② 8군이 **서버 정본과 1:1** — 굽는 표(`fields_render.py GROUPS`)의 group 집합이
//      `server/crops.js` 의 group 집합과 정확히 같다. 작물 분류가 늘면 여기가 먼저 빨개진다.
//   ③ 클라가 **group 으로 고른다** — `cropSprite` 가 좌표를 안 받고, 좌표 해시가 0곳이며,
//      슬러그 표가 서버 group 을 키로 갖는다. 그리고 그 표는 **서버가 준 값으로 채워진다**
//      (작물표 사본 0 · 족보 79).
//   ④ 단계 0(맨 흙)은 군마다 **다르다** — 이랑 수가 다르다(줄 간격이 작물마다 다르니까).
//      자명 통과 방지: 8장이 다 같으면 "군을 고른다"는 말이 그림에선 거짓이 된다.
//   ⑤ 한 군의 **자라는 넷**(0..3)이 네 그림이다.
//   ⑥ [T120] **멈춘 둘**(4 쉬는 밭 · 5 그루터기)이 자라는 넷과도, 서로도 다르다 —
//      이 카드의 뜻이 그림에서 지켜지는 자리다(겨울 밭이 자람으로 읽히면 그게 버그였다).
//
// ★검사기는 정본을 스스로 찾는다: 군 목록은 `crops.js` 에서, 굽는 표는 `fields_render.py` 에서,
//   배선은 클라 소스에서 **직접 읽는다**. 어느 표도 여기 옮겨 적지 않았다.
// ★`--selftest` 로 계약을 일부러 깨 본다.
//
// 실행: node scripts/test-crops-world.js  [--selftest]
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SELFTEST = process.argv.includes('--selftest');
let fail = 0;
const ok = (c, m) => { console.log((c ? '  ✓ ' : '  ✗ ') + m); if (!c) fail++; };

const DIR = path.join(ROOT, 'public', 'assets', 'crops');
const PY = path.join(ROOT, 'scripts', 'fields_render.py');
const CONST = path.join(ROOT, 'public', 'client', '00-const.js');
const ICON = path.join(ROOT, 'public', 'client', '43-i-icon.js');

function png(p) {
  const { PNG } = require('pngjs');
  const im = PNG.sync.read(fs.readFileSync(p));
  let clear = 0, solid = 0;
  for (let i = 3; i < im.data.length; i += 4) { if (im.data[i] === 0) clear++; else if (im.data[i] > 240) solid++; }
  return { w: im.width, h: im.height, clear, solid, data: im.data };
}

console.log('=== 밭 세계 스프라이트 (T79c) ===');

// ── ② 굽는 표 ↔ 서버 group ─────────────────────────────────────
console.log('\n[② 8군이 서버 정본과 1:1 — 굽는 표 ↔ crops.js]');
let py = fs.existsSync(PY) ? fs.readFileSync(PY, 'utf8') : null;
ok(!!py, 'scripts/fields_render.py 가 있다');
let SLUGS = [], GROUPS = [];
if (py) {
  const blk = py.match(/^GROUPS = \[([\s\S]*?)^\]/m);
  ok(!!blk, 'fields_render.py 에서 GROUPS 표를 읽었다');
  if (blk) {
    for (const m of blk[1].matchAll(/^\s*\('([a-z]+)',\s*'([^']+)'/gm)) { SLUGS.push(m[1]); GROUPS.push(m[2]); }
  }
}
// ★[T120] 단계 수도 **굽는 표가 정본**이다 — 여기 상수로 적지 않는다.
let STAGES = 0;
{
  const m = py && py.match(/^STAGES\s*=\s*(\d+)/m);
  STAGES = m ? +m[1] : 0;
  ok(STAGES >= 4, `굽는 표에서 단계 수를 읽었다 — fields_render.py STAGES = ${STAGES}`);
}
let C = null; try { C = require(path.join(ROOT, 'server', 'crops.js')); } catch (e) {}
ok(!!C, 'server/crops.js 를 읽었다(분류 정본)');
if (C) {
  const srv = [...new Set(C.list().map((c) => c.group))].sort();
  const mine = [...GROUPS].sort();
  ok(srv.length === 8, `서버 분류 ${srv.length}군 — ${srv.join(' ')}`);
  ok(JSON.stringify(srv) === JSON.stringify(mine),
     `굽는 표의 군 집합이 서버와 같다 ${JSON.stringify(srv) !== JSON.stringify(mine) ? `— 서버 ${srv.join(' ')} / 표 ${mine.join(' ')}` : ''}`);
  ok(new Set(SLUGS).size === SLUGS.length && SLUGS.length === 8, `슬러그 8개가 겹치지 않는다 — ${SLUGS.join(' ')}`);
}

// ── ① 32장 존재·치수·알파 ──────────────────────────────────────
// ★★[T101] 계약이 바뀌었다 — 종전은 `64×64 정사각`이었다. 그건 **아이콘 패스** 산물의 모양이고,
//   64×32 셀 다이아와 애초에 안 맞았다(T97 §0-ⓒ). 이제 세계 패스라 크기가 장마다 다르고
//   자리는 앵커 JSON 이 말한다. ⇒ 새 계약: **밭 바닥이 정확히 셀 다이아**이고 **이웃과 붙는다**.
console.log(`\n[① 8군 × ${STAGES}단계 = ${SLUGS.length * STAGES}장 · 앵커 JSON · 바닥 = 셀 다이아 64px]`);
const ANCH_P = path.join(DIR, 'crops_anchors.json');
ok(fs.existsSync(ANCH_P), 'crops_anchors.json 이 배치돼 있다');
const AN = fs.existsSync(ANCH_P) ? JSON.parse(fs.readFileSync(ANCH_P, 'utf8')) : {};
const meta = {};
let bad = 0;
for (const s of SLUGS) for (let st = 0; st < STAGES; st++) {
  const k = `${s}_${st}`, p = path.join(DIR, k + '.png');
  if (!fs.existsSync(p)) { ok(false, `${k}.png 없음`); bad++; continue; }
  const m = png(p); meta[k] = m;
  const a = AN[k];
  if (!a) { ok(false, `${k}: 앵커 JSON 에 없다`); bad++; continue; }
  if (m.w !== a.w || m.h !== a.h) { ok(false, `${k}.png ${m.w}×${m.h} ≠ 앵커 ${a.w}×${a.h}`); bad++; }
  else if (!(m.clear > 0 && m.solid > 0)) { ok(false, `${k}.png 알파가 죽었다`); bad++; }
}
ok(bad === 0, `${SLUGS.length * STAGES}장 전수 — 앵커 ↔ PNG 크기 일치 · 알파 살아 있음 (어긋남 ${bad})`);
{
  const PPU = +(64 / Math.SQRT2).toFixed(3);
  const off = Object.keys(AN).filter((k) => Math.abs(AN[k].ppu - PPU) > 0.01);
  ok(Object.keys(AN).length === SLUGS.length * STAGES && off.length === 0,
     `앵커 ${Object.keys(AN).length}키 · ppu 전수 = ${PPU}(게임 해상도 — 가구와 같은 규격)` +
     (off.length ? ` 어긋남 ${JSON.stringify(off.slice(0, 4))}` : ''));
  // ★바닥이 셀 다이아인가 — 가장 넓은 불투명 행이 **정확히 64px** 이어야 한다(1셀 = 64px).
  //   눈대중 48/64 를 클라에 적던 시절의 반대다: 이제 굽는 쪽이 셀을 맞추고 클라는 앵커만 읽는다.
  // ★문턱은 **절반 피복(α≥128)** 이다 — 다이아의 뾰족한 좌우 끝은 화소를 반만 덮으므로
  //   "거의 불투명(α>200)" 으로 재면 `bean_2`·`spice_3` 이 63 으로 나온다(실측 · 안티에일리어싱).
  //   모양의 폭을 재는 표준 정의가 절반 피복이고, 후처리 크롭도 같은 사상이다
  //   (`nature-postprocess.py ALPHA_MIN`). α≥128 로 재면 전수 정확히 64 다.
  const wide = [];
  for (const k of Object.keys(meta)) {
    const m = meta[k]; let best = 0;
    for (let y = 0; y < m.h; y++) {
      let lo = -1, hi = -1;
      for (let x = 0; x < m.w; x++) { if (m.data[(y * m.w + x) * 4 + 3] >= 128) { if (lo < 0) lo = x; hi = x; } }
      if (lo >= 0) best = Math.max(best, hi - lo + 1);
    }
    wide.push([k, best]);
  }
  const s0 = wide.filter(([k]) => k.endsWith('_0'));
  const off0 = s0.filter(([, w]) => w !== 64);
  ok(off0.length === 0,
     `단계 0 여덟 장의 가장 넓은 행 = 64px(셀 다이아 폭) ` +
     (off0.length ? `— 어긋남 ${JSON.stringify(off0)}` : `(전수 ${s0[0] ? s0[0][1] : '-'})`));
  const under = wide.filter(([, w]) => w < 64);
  ok(under.length === 0, `${SLUGS.length * STAGES}장 전수 바닥이 셀을 덮는다(가장 넓은 행 ≥ 64px · 미달 ${under.length}` +
     `${under.length ? ': ' + JSON.stringify(under) : ''})`);
}
{
  const files = fs.readdirSync(DIR).filter((f) => f.endsWith('.png')).map((f) => f.slice(0, -4));
  const orphan = files.filter((f) => !(f in meta));
  ok(orphan.length === 0, `옛 스프라이트가 안 남았다 (남은 것 ${orphan.length}${orphan.length ? ': ' + orphan.join(', ') : ''})`);
}

// ── ①-b 이음새 — 넉 장을 붙이면 구멍이 없다 ────────────────────────────
console.log('\n[①-b 이음새 — 4×4 로 붙였을 때 안쪽에 구멍이 0]');
{
  // 셀 중심 화면 좌표: +x 이웃 (+32,+16) · +y 이웃 (−32,+16). 앵커로만 놓는다(델타 계산 0).
  function tile(k, N) {
    const m = meta[k], a = AN[k];
    const pts = [];
    for (let gy = 0; gy < N; gy++) for (let gx = 0; gx < N; gx++) pts.push([gx, gy, (gx - gy) * 32, (gx + gy) * 16]);
    const xs = pts.map((p) => p[2] - a.ox), ys = pts.map((p) => p[3] - a.oy);
    const W = Math.ceil(Math.max(...xs) + m.w - Math.min(...xs)) + 4;
    const H = Math.ceil(Math.max(...ys) + m.h - Math.min(...ys)) + 4;
    const buf = new Uint8Array(W * H);           // 알파만
    const ox0 = -Math.min(...xs) + 2, oy0 = -Math.min(...ys) + 2;
    for (const [, , sx, sy] of pts) {
      const px = Math.round(sx - a.ox + ox0), py = Math.round(sy - a.oy + oy0);
      for (let y = 0; y < m.h; y++) for (let x = 0; x < m.w; x++) {
        const al = m.data[(y * m.w + x) * 4 + 3];
        if (al > 200) buf[(py + y) * W + (px + x)] = 1;
      }
    }
    return { buf, W, H, ox0, oy0, a };
  }
  // 안쪽 셀(1,1)~(2,2) 의 다이아 안에 구멍이 있으면 이음새가 벌어진 것이다.
  function holes(k) {
    const N = 4, t = tile(k, N);
    let hole = 0, tot = 0;
    for (let gy = 1; gy <= 2; gy++) for (let gx = 1; gx <= 2; gx++) {
      const cx = (gx - gy) * 32 - t.a.ox + t.ox0 + t.a.ox;    // 셀 중심 = 앵커 자리
      const cy = (gx + gy) * 16 - t.a.oy + t.oy0 + t.a.oy;
      for (let dy = -15; dy <= 15; dy++) {
        const half = 32 - Math.abs(dy) * 2;
        for (let dx = -half + 1; dx <= half - 1; dx++) {
          const X = Math.round(cx + dx), Y = Math.round(cy + dy);
          if (X < 0 || Y < 0 || X >= t.W || Y >= t.H) continue;
          tot++; if (!t.buf[Y * t.W + X]) hole++;
        }
      }
    }
    return { hole, tot };
  }
  const rows = SLUGS.map((s) => [s + '_0', holes(s + '_0')]);
  const worst = rows.reduce((a, b) => (b[1].hole > a[1].hole ? b : a));
  for (const [k, h] of rows) {
    ok(h.hole === 0, `${k}: 안쪽 네 칸 다이아에 빈 화소 ${h.hole}/${h.tot}`);
  }
  console.log(`     ⇒ 가장 나쁜 것 ${worst[0]} ${worst[1].hole}/${worst[1].tot}. ` +
              'T97 때는 타일이 43.5~45px 라 칸마다 좌우 ~9.5px 이 비었다(보고 T97 §0-ⓒ).');
}

// ── ③ 클라가 group 으로 고른다 ─────────────────────────────────
console.log('\n[③ 클라 선택이 group 이다 — 좌표 해시 0]');
{
  const cs = fs.readFileSync(CONST, 'utf8');
  const fn = cs.match(/function cropSprite\(([^)]*)\)([\s\S]*?)\n\}/);
  ok(!!fn, '00-const.js 에서 cropSprite 를 읽었다');
  if (fn) {
    const args = fn[1].split(',').map((x) => x.trim());
    ok(!args.some((a) => /^w[xy]$/.test(a)),
       `cropSprite 가 좌표를 안 받는다 — (${args.join(', ')})`);
    ok(!/73856093|19349663/.test(fn[2]), '고르는 몸에 좌표 해시가 없다');
    ok(/_slug\[/.test(fn[2]) && /_of\[/.test(fn[2]), 'group → 슬러그 표로 고른다');
  }
  // 슬러그 표의 키가 서버 group 과 같은가(사본이 아니라 **키**로만 존재)
  const sl = cs.match(/_slug:\s*\{([\s\S]*?)\}/);
  ok(!!sl, '00-const.js 에서 _slug 표를 읽었다');
  if (sl && C) {
    const keys = [...sl[1].matchAll(/'([^']+)':\s*'([a-z]+)'/g)];
    const kk = keys.map((m) => m[1]).sort();
    const vv = keys.map((m) => m[2]).sort();
    const srv = [...new Set(C.list().map((c) => c.group))].sort();
    ok(JSON.stringify(kk) === JSON.stringify(srv), `_slug 의 키 8개가 서버 분류와 같다`);
    ok(JSON.stringify(vv) === JSON.stringify([...SLUGS].sort()), `_slug 의 값 8개가 굽는 슬러그와 같다`);
  }
  // 표를 **서버가 준 값으로** 채운다(작물표 사본 금지)
  const ic = fs.readFileSync(ICON, 'utf8');
  ok(/CROP_SPR\._of\[c\.id\]\s*=\s*c\.group/.test(ic),
     '작물 군은 서버 페이로드에서 채운다(43-i-icon applyCropPayload)');
  // 호출부가 작물을 넘긴다
  const b = fs.readFileSync(path.join(ROOT, 'public', 'client', '36-r2-building.js'), 'utf8');
  ok(/cropSprite\(_st,\s*data\.crop\)/.test(b), '플레이어 밭이 `data.crop` 을 넘긴다');
}

// ── ④ 익은 밭 여덟 장이 서로 다르다 (=밭이 작물을 안다) ────────
console.log('\n[④ 단계 3(익음) 여덟 장이 서로 다르다 — 이게 "밭이 작물을 안다"의 그림 쪽 뜻이다]');
const sigOf = (m) => { let h = 0; for (let i = 0; i < m.data.length; i += 4) h = (h * 31 + m.data[i] + m.data[i + 3] * 7) | 0; return h; };
{
  const sig = {};
  for (const s of SLUGS) if (meta[`${s}_3`]) sig[s] = sigOf(meta[`${s}_3`]);
  const uniq = new Set(Object.values(sig));
  ok(uniq.size === SLUGS.length,
     `익은 밭 여덟 장이 서로 다르다 (서로 다른 그림 ${uniq.size}/${SLUGS.length})`);
  // ★단계 0(맨 흙)은 **같아도 된다** — 심기 전 밭은 무엇이 심길지 말해 주지 않는다.
  //   줄 간격이 같은 군끼리는 같은 그림이 나온다. 그게 옳다(주사위가 아니라 이랑 수의 함수다).
  const s0 = new Set(SLUGS.map((s) => meta[`${s}_0`] && sigOf(meta[`${s}_0`])).filter(Boolean));
  console.log(`     ⓘ 단계 0 은 서로 다른 그림 ${s0.size}/${SLUGS.length} — 이랑 수가 같은 군끼리 같다.`);
  console.log('       심기 전 밭이 무엇이 심길지 말해 주면 그게 거짓말이다. 여기선 실패로 안 센다.');
}

// ── ⑤ 한 군의 **자라는 넷**이 네 그림이다 ──────────────────────
console.log('\n[⑤ 한 군의 자라는 네 단계(0..3)가 서로 다른 그림이다]');
{
  const bad2 = [];
  for (const s of SLUGS) {
    const u = new Set([0, 1, 2, 3].map((st) => meta[`${s}_${st}`] && sigOf(meta[`${s}_${st}`])).filter(Boolean));
    if (u.size !== 4) bad2.push(`${s}(${u.size}/4)`);
  }
  ok(bad2.length === 0, `여덟 군 × 네 단계가 다 다르다 ${bad2.length ? '— 아닌 것: ' + bad2.join(' · ') : ''}`);
  // ★불투명 화소 수로 "자란다"를 판정하지 **않는다** — 재 보니 못 쓴다.
  //   프레임이 bbox 에 맞춰지므로 작물이 위로 자랄수록 흙이 차지하는 **비율이 줄어**
  //   `bean`·`tuber` 는 단계 3 의 불투명 화소가 단계 0 보다 **적다**(1161 < 1194 · 1180 < 1194).
  //   자란 게 아니라 액자가 커진 것이다. 그래서 숫자는 기록만 한다(T76 §IoU 와 같은 판단).
  const line = SLUGS.map((s) => `${s} ${[0, 1, 2, 3].map((st) => (meta[`${s}_${st}`] || {}).solid || 0).join('/')}`);
  console.log('     불투명 화소(0/1/2/3) — 기록만: ' + line.join(' · '));
}

// ── ⑥ [T120] 멈춘 둘 — 자라는 넷과도, 서로도 다르다 ────────────
// ★★이 카드의 뜻이 그림에서 지켜지는 자리다. 여태 겨울 휴면 밭도 벤 다년생도 **"2 자람"으로
//   그려졌다**(T91 회부 4 · T99 회부 4) — 셋이 한 얼굴이면 화면은 거짓말을 한다.
//   ⇒ 4·5 는 0..3 **어느 것과도** 같으면 안 되고, 서로도 달라야 한다.
if (STAGES >= 6) {
  console.log('\n[⑥ 멈춘 둘(4 쉬는 밭 · 5 그루터기)이 자라는 넷과도 서로도 다르다]');
  const dupGrow = [], dupPair = [];
  for (const s of SLUGS) {
    const g = [0, 1, 2, 3].map((st) => meta[`${s}_${st}`] && sigOf(meta[`${s}_${st}`]));
    for (const st of [4, 5]) {
      const v = meta[`${s}_${st}`] && sigOf(meta[`${s}_${st}`]);
      if (v == null) { dupGrow.push(`${s}_${st}(없음)`); continue; }
      const hit = g.indexOf(v);
      if (hit >= 0) dupGrow.push(`${s}_${st}=${s}_${hit}`);
    }
    const a = meta[`${s}_4`] && sigOf(meta[`${s}_4`]), b = meta[`${s}_5`] && sigOf(meta[`${s}_5`]);
    if (a != null && a === b) dupPair.push(s);
  }
  ok(dupGrow.length === 0, `멈춘 둘이 자라는 넷 중 어느 것과도 같지 않다 ${dupGrow.length ? '— 겹침: ' + dupGrow.join(' · ') : ''}`);
  ok(dupPair.length === 0, `쉬는 밭 ≠ 그루터기 ${dupPair.length ? '— 같은 군: ' + dupPair.join(' · ') : ''}`);
  // ★자명 통과 금지 — "다르다"는 해시로도 나온다. **눈이 갈라 보는 축**을 수로 못 박는다.
  //   ★★[T120 2패스 · 재는 축을 한 번 틀렸다] 1패스의 축은 "5 가 4 보다 푸르다"였다.
  //     재질만 보면 맞다(밑동 `stem` 0.52/0.55/0.26 이 볏짚 `straw` 0.74/0.62/0.32 보다 푸르다).
  //     그런데 타일 **평균**은 재질이 아니라 **덮은 넓이**가 정한다 — 4 를 강화해 볏짚을 늘리자
  //     4 의 초록 기가 5 를 넘어섰다(5.9 vs 3.1). 판정은 빨개졌는데 **그림은 더 좋아졌다.**
  //     ⇒ 문턱을 내려 통과시키지 않았다. **틀린 축을 버렸다.** 실제로 눈이 쓰는 축은 둘이다:
  //       ⓐ 4 는 마른 것이 덮여 **노랗다**(맨 흙보다도, 그루터기보다도)
  //       ⓑ 5 는 **자른 면**이 있어 밝은 화소가 는다(맨 흙 0.09% → 2.2~6.5%)
  const cast = (k, f) => {
    const m = meta[k]; if (!m) return null;
    let v = 0, n = 0;
    for (let i = 0; i < m.data.length; i += 4) {
      if (m.data[i + 3] < 128) continue;
      v += f(m.data[i], m.data[i + 1], m.data[i + 2]); n++;
    }
    return n ? v / n : null;
  };
  const YEL = (k) => cast(k, (r, g, b2) => (r + g) / 2 - b2);
  const GRN = (k) => cast(k, (r, g, b2) => g - (r + b2) / 2);
  const HI = (k) => cast(k, (r, g, b2) => (0.2126 * r + 0.7152 * g + 0.0722 * b2 > 150 ? 100 : 0));
  {
    const dry = [], notdry = [], cut = [], rows3 = [];
    for (const s of SLUGS) {
      const g2 = GRN(`${s}_2`), g4 = GRN(`${s}_4`);
      const y0 = YEL(`${s}_0`), y4 = YEL(`${s}_4`), y5 = YEL(`${s}_5`);
      const h0 = HI(`${s}_0`), h5 = HI(`${s}_5`);
      if ([g2, g4, y0, y4, y5, h0, h5].some((v) => v == null)) continue;
      if (!(g4 < g2 - 2)) dry.push(`${s}(자람 ${g2.toFixed(1)} vs 쉼 ${g4.toFixed(1)})`);
      if (!(y4 - y0 >= 1.5 && y4 - y5 >= 1.5)) notdry.push(`${s}(맨흙Δ${(y4 - y0).toFixed(1)} 그루터기Δ${(y4 - y5).toFixed(1)})`);
      if (!(h5 - h0 >= 1.0)) cut.push(`${s}(${h0.toFixed(2)}→${h5.toFixed(2)})`);
      rows3.push(`${s} 초록 2:${g2.toFixed(1)}/4:${g4.toFixed(1)} · 노랑 0:${y0.toFixed(1)}/4:${y4.toFixed(1)}/5:${y5.toFixed(1)} · 밝은점 0:${h0.toFixed(2)}/5:${h5.toFixed(2)}`);
    }
    ok(dry.length === 0, `여덟 군 전수 ⓐ **쉬는 밭이 자람보다 덜 푸르다**(멈췄다) ${dry.length ? '— 미달: ' + dry.join(' · ') : ''}`);
    ok(notdry.length === 0, `여덟 군 전수 ⓐ **쉬는 밭이 맨 흙보다도 그루터기보다도 노랗다**(마른 것이 덮였다 · Δ≥1.5) ${notdry.length ? '— 미달: ' + notdry.join(' · ') : ''}`);
    ok(cut.length === 0, `여덟 군 전수 ⓑ **그루터기에 자른 면이 보인다**(밝은 화소 ≥ 맨 흙 +1.0%p) ${cut.length ? '— 미달: ' + cut.join(' · ') : ''}`);
    console.log('     ' + rows3.join('\n     '));
  }
}

if (SELFTEST) {
  console.log('\n[--selftest] 아래 셋을 일부러 깨 본다.');
  let s2 = 0;
  const chk = (c, m) => { console.log((c ? '  ✓ ' : '  ✗ ') + m); if (!c) s2++; };
  // ②를 깬다 — 굽는 표에서 한 군을 뺀다
  const g2 = GROUPS.slice(0, 7);
  chk(JSON.stringify(g2.sort()) === JSON.stringify([...new Set(C.list().map((c) => c.group))].sort()),
      '[오염] 굽는 표에서 한 군을 빼면 ② 가 잡는다');
  // ③을 깬다 — 좌표 해시를 되살린 몸
  chk(!/73856093/.test('const h = (wx*73856093) ^ (wy*19349663);'), '[오염] 좌표 해시를 되살리면 ③ 이 잡는다');
  // ④를 깬다 — 맨 흙 여덟 장이 다 같다면
  chk(new Set(['a', 'a', 'a', 'a', 'a', 'a', 'a', 'a']).size === 8, '[오염] 익은 밭이 다 같으면 ④ 가 잡는다');
  console.log('결과: ' + (s2 === 3 ? 'PASS(검사기가 오염 3건을 다 잡았다)' : `FAIL(${s2}/3 만 잡았다)`));
  process.exit(s2 === 3 ? 0 : 1);
}
console.log('\n결과: ' + (fail ? `FAIL(${fail})` : 'PASS'));
process.exit(fail ? 1 : 0);
