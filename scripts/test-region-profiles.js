#!/usr/bin/env node
// @regress
// === scripts/test-region-profiles.js — T574 존 특산 프로필 + 경계 넘는 꼬리 하네스 ==================
//
// 지키는 것:
//   ⓐ 끔 = 옛 글자 — `T574_REGION=0` 이면 다섯 자리(계획기 · 부팅 채움 · 군락 · 낚시/민물 · 나무)가 옛 줄 그대로
//      (★추신4: 손잡이 없음 = 켬 L 500 — 재민 10-03 · 끔은 `0` 이다)
//   ⓑ 꼬리 셈(추신2 ②) — 이웃 고유 품목 몫(d) = s₀ · (그 존 비중) · e^(−d/L) 그대로 · 합 1 · 제 존 품목은 (1 − T) 로 줄 뿐 ·
//      두 존 다 있는 품목은 꼬리가 없다 · 대칭(한반도 고유 → 닛폰 서쪽) · 바다·프로필 없는 이웃(중원북·베링)은 꼬리가 없다 ·
//      s₀ 손잡이 · d 에 단조
//   ⓒ 표 — 단계 수는 POOL 파생(새 수 0) · '없음' = 0(그 존엔 안 난다 — 꼬리로만 · 추신2) · '낮음' > 0 ·
//      재민 확정 제거 셋(텅스텐·석탄·대리석)은 광종 표에 없다 · 새 품목은 손잡이 + 품목이 있을 때만 ·
//      식료 칸(민물·군락·작물·열매)은 빈칸(T576 대기 · 추신2 ③) · "약" 넷은 표에 적혔다
//   ⓓ 뽑기 — 결정론 · 닛폰 안쪽 광종 빈도 ≈ 그 자리 섞인 가중 · 같은 u 같은 답
//   ⓔ 종 고르기 — 고르게면 null(옛 줄이 낸다 — 한반도 숲은 켬에서도 비트 동일) · 아니면 가중
//   ⓕ 자리마다 실제로 걸렸나 — 켬이면 닛폰 숲의 종 몫이 바뀌고 · 닛폰 경계 물에 한반도 낚시 종이 꼬리로 들고 ·
//      식료 빈칸(민물·군락)은 켬에서도 같다(자명 통과 금지 — 표 한 칸을 채우면 바뀐다)
//   ⓗ 굽기 — 재민 08-01 규칙 셋(주요 광맥 철 없음 · 은 단독 없음 · 다광종 POLY) · POLY 정본 하나
//   ⓖ 광맥 u 는 계획기 hash2(…, 731) 와 같은 식이다
//   ⓘ 추신4 — L 500 으로 구운 정본: 자리 칸은 그대로(광종 칸만) · 정본 = 굽기(옛 기록) 자기일치(한반도 덜 흔드는 굽기 ·
//      닛폰 다 굽기) · 재민 08-01 규칙 셋 위반 0(두 존) · 끔이면 옛 기록으로 통째 되돌림 · 켬이면 그대로
'use strict';
const path = require('path');
const fs = require('fs');
const ROOT = path.resolve(__dirname, '..');
const S = (p) => require(path.join(ROOT, 'server', p));
delete process.env.T574_NEW_ITEMS;
process.env.T574_REGION = '0';   // ★추신4: 손잡이 없음 = 켬(L 500) — 이 하네스의 바탕은 끔(`0`)이고 켬은 칸마다 withEnv 로 준다
const RP = S('region-profiles');
const HB = S('hanbando-minerals');
const Trees = S('trees');
const FF = S('freshfish');
const Fishing = S('fishing');
const SP = S('specialty');
const ZC = S('zone-config');

let pass = 0, fail = 0;
const ok = (c, m, extra) => { c ? pass++ : fail++; console.log((c ? '  ✓ ' : '  ✗ ') + m + (extra ? `  ${extra}` : '')); };
const sec = (t) => console.log('\n' + t);
const near = (a, b, e) => Math.abs(a - b) <= e;
const withEnv = (env, fn) => { const old = {}; for (const k of Object.keys(env)) { old[k] = process.env[k]; if (env[k] == null) delete process.env[k]; else process.env[k] = env[k]; } try { return fn(); } finally { for (const k of Object.keys(env)) { if (old[k] == null) delete process.env[k]; else process.env[k] = old[k]; } } };
const HW = ZC.ZONES.hanbando.zoneWidth, HH = ZC.ZONES.hanbando.zoneHeight, NW = ZC.ZONES.nippon.zoneWidth;
// 옛 나무 종 — trees.js 의 옛 줄 그대로(해시는 정본 `crops.h32`를 부른다)
const C = S('crops');
const zs = (z) => { let h = 0; for (let i = 0; i < z.length; i++) h = (Math.imul(h, 31) + z.charCodeAt(i)) | 0; return h >>> 0; };
const IDS = Trees.ids();
const oldTree = (z, cx, cy) => IDS[C.h32(cx | 0, cy | 0, zs(z)) % IDS.length];

// ── ⓐ 끔 = 옛 글자 ─────────────────────────────────────────────────────────────
sec('ⓐ 끔(T574_REGION=0) = 옛 글자');
ok(RP.L() === 0 && !RP.on(), 'T574_REGION=0 = 끔', `L=${RP.L()}`);
withEnv({ T574_REGION: null }, () => ok(RP.L() === 500 && RP.on() && RP.L_DEFAULT === 500, '★손잡이 없음 = 켬 L 500(재민 10-03 · 추신4)', `L=${RP.L()}`));
withEnv({ T574_REGION: '' }, () => ok(RP.L() === 500, '빈 손잡이도 기본 500'));
withEnv({ T574_REGION: '250' }, () => ok(RP.L() === 250, '다른 L 은 그 값(런타임 자리만 — 구운 정본은 L 500 한 판)'));
{
  let diff = 0, n = 0;
  for (const z of ['hanbando', 'nippon']) for (let cy = 0; cy < 4063; cy += 37) for (let cx = 0; cx < (z === 'nippon' ? 1562 : 2188); cx += 29) { n++; if (Trees.speciesAt(z, cx, cy) !== oldTree(z, cx, cy)) diff++; }
  ok(diff === 0, '나무 종 — 끔이면 옛 줄(h % 8)과 전 표본 같다', `${n}칸 중 다른 칸 ${diff}`);
}
ok(RP.chooseSpecies('tree', 'nippon', 30000, 60000, 0.3, null, IDS) === null, '종 고르기 — 끔이면 null(옛 줄이 낸다)');
{
  const pool = FF.poolOf('lower', 200); let same = 0;
  for (let h = 0; h < 500; h++) if (FF.pick('lower', 200, h) === FF.pick('lower', 200, h, undefined)) same++;
  ok(same === 500 && pool.length > 0, '민물 pick — 고르는 함수를 안 주면 옛 함수 그대로', `${same}/500`);
}
{   // 다섯 자리의 문 — 끔일 때 지나는 줄이 옛 글자인지(소스로)
  const rd = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
  const z = rd('server/zone.js'), v = rd('server/villages.js'), ch = rd('server/chunk.js'), tr = rd('server/trees.js'), pl = rd('scripts/plan-ore-clusters.js');
  ok(/\|\| species\[Math\.floor\(_fu \* species\.length\)\]/.test(z) && /const _fu = _dt\(\);/.test(z), '낚시 — 주사위 한 번 그대로 · 옛 식이 뒤에 남았다');
  ok(/if \(!o\.mineral && RegionProfiles\.on\(\)\) \{/.test(z) && /if \(!o\.mineral\) o\.mineral = Specialty\.pickMineral\(ZONE\.biome/.test(z), '부팅 채움 — 켬일 때만 굽기 · 옛 pickMineral 줄이 뒤에 그대로');
  ok(/_RP\.on\(\)\) \?/.test(v) && /: undefined;/.test(v), '민물 몸 — 끄면 고르는 함수 undefined');
  ok(/_wildKindOf\(zoneId, px, py, _ku, kinds\) \|\| kinds\[/.test(ch), '야생 군락 — 같은 씨 하나 · 옛 식이 뒤에 남았다');
  ok(/if \(RP && RP\.on\(\)\)/.test(tr) && /return IDS\[h % IDS\.length\];/.test(tr), '나무 — 켬일 때만 · 옛 식 그대로');
  ok(/const RP_ON = RP\.on\(\) && RP\.has\(ZID\);/.test(pl) && /const _rb = \(RP_ON && !FORCE_MINERAL\) \?/.test(pl) && /: HB_MIN\s*\n\s*\? HB_MIN\.mineralAt\(0, 0, hash2\(best\.cx, best\.cy, 731\)\)/.test(pl),
    '계획기 — RP_ON 일 때만 굽기 · 옛 두 갈래 그대로');
  ok(/if \(o\.minerals\) e\.minerals = o\.minerals;/.test(pl) && /if \(_rb && _rb\.minerals\) o\.minerals = _rb\.minerals;/.test(pl), '계획기 — minerals 칸은 켬 굽기만 단다(끄면 안 선다)');
}

// ── ⓑ 꼬리 셈 ─────────────────────────────────────────────────────────────────
sec('ⓑ 꼬리 셈 — 이웃 고유 품목 몫(d) = s₀ · 그 존 비중 · e^(−d/L) (추신2 ②)');
{
  const Lc = 500, s0 = RP.S0();
  const wh = RP.weightsOf('ore', 'hanbando'), wn = RP.weightsOf('ore', 'nippon');
  ok(s0 === 0.5, 's₀ 기본 = 0.5(★PM 기본 "제 존 비중의 0.5")', String(s0));
  ok(Object.keys(RP.regionMix('hanbando', HW - 16, 60000)).length === 0, '끔(T574_REGION=0)이면 꼬리 계수 없음');
  const f0 = RP.regionMix('hanbando', HW, 60000, Lc).nippon, fL = RP.regionMix('hanbando', HW - Lc * 32, 60000, Lc).nippon;
  ok(near(f0, s0, 1e-12) && near(fL, s0 / Math.E, 1e-12), '꼬리 계수 = s₀ · e^(−d/L)(경계 s₀ · d = L 에서 s₀/e)', `${f0} · ${fL.toFixed(6)}`);
  let bad = 0, worst = 0;
  for (const dc of [0, 10, 100, 250, 500, 1000, 2000]) {
    const m = RP.mixAt('ore', 'hanbando', HW - dc * 32, 70000, null, null, Lc);
    for (const u of RP.uniqueOf('ore', 'nippon', 'hanbando')) { const want = s0 * wn[u] * Math.exp(-dc / Lc); worst = Math.max(worst, Math.abs(m.p[u] - want)); if (!near(m.p[u], want, 1e-12)) bad++; }
  }
  ok(bad === 0, '닛폰 고유 품목(옥·유황)의 한반도 안 몫 = s₀ · 닛폰 비중 · e^(−d/L) — 식 그대로', `최대 차 ${worst.toExponential(1)}`);
  let sbad = 0;
  for (let i = 0; i < 400; i++) {
    const z = i % 2 ? 'hanbando' : 'nippon', W = z === 'nippon' ? NW : HW;
    const m = RP.mixAt('ore', z, (i * 7919) % W, (i * 104729) % HH, null, null, Lc);
    if (!near(Object.values(m.p).reduce((a, b) => a + b, 0), 1, 1e-12)) sbad++;
  }
  ok(sbad === 0, '섞인 가중 합 = 1(두 존 · 400 표본)');
  const m = RP.mixAt('ore', 'hanbando', HW - 100 * 32, 70000, null, null, Lc);
  ok(near(m.p.copper, wh.copper * (1 - m.tail), 1e-12) && near(m.p.obsidian, wh.obsidian * (1 - m.tail), 1e-12),
    '두 존 다 있는 품목(구리·흑요석)은 꼬리가 없다 — 제 비중 × (1 − T) 그대로');
  const mi = RP.mixAt('ore', 'nippon', 200 * 32, 70000, null, null, Lc);
  ok(near(mi.p.iron, s0 * wh.iron * Math.exp(-200 / Lc), 1e-12), '대칭 — 한반도 고유 품목(철 정광)이 닛폰 서쪽으로 같은 식의 꼬리', `${(mi.p.iron * 100).toFixed(2)}%`);
  let mono = true, prev = Infinity;
  for (let dc = 0; dc <= 2000; dc += 50) { const t = RP.mixAt('ore', 'hanbando', HW - dc * 32, 90000, null, null, Lc).tail; if (t > prev + 1e-15) mono = false; prev = t; }
  ok(mono, '꼬리 몫 T 는 경계에서 멀수록 줄어든다');
  {   // 한반도 서쪽 끝·북쪽 끝 — 꼬리는 닛폰(동쪽) 하나뿐이고, 그 계수는 동쪽 경계까지의 거리로만 정해진다
    const mW = RP.regionMix('hanbando', 5, 60000, Lc), mN = RP.regionMix('hanbando', 30000, 5, Lc);
    ok(Object.keys(mW).every((k) => k === 'nippon') && near(mW.nippon, s0 * Math.exp(-(HW - 5) / 32 / Lc), 1e-12), '서쪽 이웃 중원북(프로필 없음)은 꼬리가 없다 — 회부');
    ok(Object.keys(mN).every((k) => k === 'nippon') && near(mN.nippon, s0 * Math.exp(-(HW - 30000) / 32 / Lc), 1e-12), '북쪽 이웃 베링(프로필 없음)은 꼬리가 없다 — 회부');
  }
  ok(Object.keys(RP.regionMix('nippon', NW - 5, 60000, Lc)).every((k) => k === 'hanbando'), '닛폰 동쪽 바다는 꼬리가 없다(바다 제외)');
  ok(RP.mixAt('ore', 'jungwon_n', 100, 100, null, null, Lc) === null, '프로필 없는 존은 null(옛 길)');
  withEnv({ T574_S0: '0.25' }, () => ok(near(RP.regionMix('hanbando', HW, 60000, Lc).nippon, 0.25, 1e-12), 's₀ 손잡이(T574_S0)가 경계 계수를 바꾼다'));
}

// ── ⓒ 표 ────────────────────────────────────────────────────────────────────
sec('ⓒ 표 — 단계 수는 POOL 파생 · 없음 = 0(꼬리로만) · 낮음 > 0 · 재민 확정 존중 · 새 품목 손잡이 · 식료 빈칸');
{
  const v = Object.values(HB.POOL), sum = v.reduce((a, b) => a + b, 0);
  ok(RP.LV['많음'] === Math.max(...v) && RP.LV['보통'] === sum / v.length && RP.LV['낮음'] === Math.min(...v) && RP.LV['없음'] === 0, '단계 = POOL 최댓값·평균·최솟값 · 없음 0(새 수 0)', JSON.stringify(RP.LV));
  ok(!('jade_raw' in RP.weightsOf('ore', 'hanbando')) && !('sulfur' in RP.weightsOf('ore', 'hanbando')) && !('iron' in RP.weightsOf('ore', 'nippon')),
    "'닛폰에만'(옥·유황)은 한반도 가중 0 · '한반도에만'(철 정광)은 닛폰 가중 0 — 이웃 꼬리로만(추신2 \"한반도에서 지워도 된다\")");
  ok(['fishFresh', 'forage', 'crop', 'fruit'].every((k) => Array.isArray(RP.TABLE[k]) && RP.TABLE[k].length === 0) && RP.NOTES.some((n) => n.id === 'eel') && RP.NOTES.some((n) => n.id === 'rice'),
    '식료 칸(민물·군락·작물·열매)은 빈칸 — T551 근거(뱀장어·벼)는 NOTES 에(T576 대기 · 추신2 ③)');
  ok(RP.levelOf('ore', 'hanbando', 'lead') === HB.POOL.lead && RP.levelOf('ore', 'nippon', 'tin') === HB.POOL.tin, "광종 '그대로' = POOL 값");
  let zero = 0;
  for (const kind of ['ore', 'tree', 'fishFresh', 'forage']) for (const r of RP.TABLE[kind]) for (const c of ['hb', 'np']) if (r[c] === '낮음' && !(RP.LV['낮음'] > 0)) zero++;
  ok(zero === 0 && RP.LV['낮음'] > 0, "낮음은 0 이 아니다(없는 것은 낮게 — 띠와 자유무역으로 온다)");
  const oreIds = RP.TABLE.ore.map((r) => r.id);
  ok(!oreIds.includes('tungsten') && !oreIds.includes('coal') && !oreIds.includes('marble'), '재민 확정 제거 셋(텅스텐·석탄·대리석)은 광종 표에 없다 — 표(NOTES)에만');
  ok(RP.NOTES.some((n) => n.id === 'tungsten') && RP.NOTES.some((n) => n.id === 'marble'), '부딪힌 칸은 NOTES 에 적혔다');
  const unknown = RP.TABLE.ore.filter((r) => !r.isNew && !SP.RESOURCES[r.id]).map((r) => r.id);
  ok(unknown.length === 0, '광종 표의 옛 품목은 전부 econ 품목(유령 0)', unknown.join(',') || '0');
  ok(!('cinnabar' in (RP.weightsOf('ore', 'nippon') || {})), '새 품목 — 손잡이 끔이면 표에 안 든다');
  withEnv({ T574_NEW_ITEMS: '1' }, () => {
    const has = !!SP.RESOURCES.cinnabar;
    ok(('cinnabar' in (RP.weightsOf('ore', 'nippon') || {})) === has, '새 품목 — 손잡이 켬이어도 품목이 specialty 에 있을 때만 든다', `cinnabar 품목 ${has ? '있음' : '없음'}`);
  });
  ok(RP.NOTES.some((n) => n.id === 'shark_whale_hinoki_urushi' && n.st === '약'), 'T551 근거 약한 넷(상어·고래·히노키·옻)은 표에 "약"으로');
  const tvs = RP.tvTable();
  ok(tvs.ore > 0.3 && RP.tv(HB.POOL, HB.POOL) === 0, '광종 TV — 지금 설계(두 존 같은 POOL) 0 → 새 표 > 0.3(크게)', JSON.stringify(tvs));
  ok(tvs.forage === 0 && tvs.fishFresh === 0, '군락·민물 TV 0 — 식료 빈칸(지금 값 그대로)');
}

// ── ⓓ 광종 뽑기 ─────────────────────────────────────────────────────────────────
sec('ⓓ 광종 뽑기 — 결정론 · 빈도 ≈ 그 자리 섞인 가중');
withEnv({ T574_REGION: '500' }, () => {
  ok(RP.pickOre('nippon', 30000, 60000, 0.42) === RP.pickOre('nippon', 30000, 60000, 0.42), '같은 자리 · 같은 u = 같은 광종');
  ok(RP.pickOre('jungwon_n', 100, 100, 0.5) === null, '프로필 없는 존은 null(부르는 쪽이 옛 길로)');
  for (const [z, x] of [['nippon', 30000], ['hanbando', HW - 3000]]) {
    const N = 20000, cnt = {};
    for (let i = 0; i < N; i++) { const k = RP.pickOre(z, x, 60000, (i + 0.5) / N); cnt[k] = (cnt[k] || 0) + 1; }
    const w = RP.oreMixAt(z, x, 60000); let worst = 0;
    for (const k of Object.keys(w)) worst = Math.max(worst, Math.abs((cnt[k] || 0) / N - w[k]));
    ok(worst < 0.001, `${z} ${z === 'nippon' ? '안쪽' : '동쪽 꼬리 자리'} — 고른 u 의 광종 빈도 = 섞인 가중`, `최대 차 ${worst.toFixed(5)}${z === 'hanbando' ? ` · 옥 ${((cnt.jade_raw || 0) / N * 100).toFixed(1)}%` : ''}`);
  }
});

// ── ⓔ 종 고르기 ───────────────────────────────────────────────────────────────
sec('ⓔ 종 고르기 — 고르게면 null · 아니면 가중');
withEnv({ T574_REGION: '500' }, () => {
  ok(RP.chooseSpecies('tree', 'hanbando', HW - 16, 60000, 0.3, null, IDS) === null, '한반도 숲(경계 칸까지) — 닛폰 고유 나무가 없어 null(옛 줄이 낸다)');
  ok(typeof RP.chooseSpecies('tree', 'nippon', 30000, 60000, 0.3, null, IDS) === 'string', '닛폰 안쪽 숲 — 가중으로 고른다');
  const N = 16000, cnt = {};
  for (let i = 0; i < N; i++) { const k = RP.chooseSpecies('tree', 'nippon', 30000, 60000, (i + 0.5) / N, null, IDS); cnt[k] = (cnt[k] || 0) + 1; }
  const w = RP.weightsOf('tree', 'nippon', IDS); let worst = 0;
  for (const k of IDS) worst = Math.max(worst, Math.abs((cnt[k] || 0) / N - w[k]));
  ok(worst < 0.001, '닛폰 숲 종 빈도 = 닛폰 가중(참나무·밤나무 많음)', `oak ${(cnt.oak / N).toFixed(3)} · pine ${(cnt.pine / N).toFixed(3)}`);
});

// ── ⓕ 자리마다 실제로 걸렸나 ─────────────────────────────────────────────────────
sec('ⓕ 다섯 자리 — 켬이면 실제로 바뀌고 · 한반도 안쪽은 그대로');
withEnv({ T574_REGION: '500' }, () => {
  let dHb = 0, nHb = 0, oak = 0, nNp = 0;
  for (let cy = 100; cy < 3900; cy += 41) {
    for (let cx = 50; cx < 1500; cx += 23) { nHb++; if (Trees.speciesAt('hanbando', cx, cy) !== oldTree('hanbando', cx, cy)) dHb++; }
    for (let cx = 500; cx < 1500; cx += 23) { nNp++; if (Trees.speciesAt('nippon', cx, cy) === 'oak') oak++; }
  }
  ok(dHb === 0, '나무 — 한반도는 켬에서도 옛 종 그대로(닛폰 고유 나무가 없어 꼬리가 없다)', `${nHb}칸 중 다른 칸 ${dHb}`);
  ok(oak / nNp > 0.18, '나무 — 닛폰 안쪽 참나무 몫이 고르게(12.5%)보다 크다', `${(oak / nNp * 100).toFixed(1)}%`);
  // 민물 — 식료 빈칸(T576 대기)이라 켬에서도 옛 줄 · 자명 통과 금지: 닛폰 뱀장어 한 칸을 채우면 그만큼 오른다
  const ch = (ids, u) => RP.chooseSpecies('fishFresh', 'nippon', 30000, 60000, u, null, ids);
  const day = 200;   // 가을(180~270) — 하류에 뱀장어가 사는 철
  let same = 0, n = 0;
  for (let h = 0; h < 4000; h++) { n++; if (FF.pick('lower', day, h).id === FF.pick('lower', day, h, ch).id) same++; }
  ok(same === n, '민물 — 식료 빈칸이라 켬에서도 옛 종 그대로', `${same}/${n}`);
  RP.TABLE.fishFresh.push({ id: 'eel', ko: '뱀장어', hb: '보통', np: '많음', st: '—', ev: '하네스 미끼' });
  let eel0 = 0, eel1 = 0;
  for (let h = 0; h < 4000; h++) { if (FF.pick('lower', day, h).id === 'eel') eel0++; if (FF.pick('lower', day, h, ch).id === 'eel') eel1++; }
  const ids = FF.poolOf('lower', day).map((s2) => s2.id), wE = RP.weightsOf('fishFresh', 'nippon', ids).eel;
  RP.TABLE.fishFresh.pop();
  ok(eel1 > eel0 && near(eel1 / n, wE, 0.03), '자명 통과 금지 — 칸을 채우면 뱀장어 몫이 그 가중만큼 오른다(섞은 u 가 고르다)',
    `${(eel0 / n * 100).toFixed(1)}% → ${(eel1 / n * 100).toFixed(1)}% (기대 ${(wE * 100).toFixed(1)}%)`);
  // 낚시 — 닛폰 경계 물에 한반도 목록에만 있는 종(잉어·명태)이 꼬리로 든다
  const lf = (z) => Fishing.speciesFor(RP.biomeOf(z));
  const npList = Fishing.speciesFor('mountain'), hbList = Fishing.speciesFor('forest');
  let other = 0; const M = 6000;
  for (let i = 0; i < M; i++) { const s2 = RP.chooseSpecies('fishRod', 'nippon', 32, 60000, (i + 0.5) / M, lf, npList) || npList[Math.floor((i + 0.5) / M * npList.length)]; if (s2 !== 'trout') other++; }
  const wantOther = RP.S0() * Math.exp(-1 / 500) * (2 / 3);
  ok(near(other / M, wantOther, 0.01), '낚시 — 닛폰 경계 물에 한반도 종(잉어·명태)이 꼬리 몫만큼 든다', `${(other / M * 100).toFixed(1)}% (기대 ${(wantOther * 100).toFixed(1)}%)`);
  ok(RP.chooseSpecies('fishRod', 'hanbando', HW - 32, 60000, 0.5, lf, hbList) === null, '낚시 — 한반도는 꼬리로 들 닛폰 고유 종이 없다 → null(옛 줄)');
  // 군락 — 식료 빈칸 ⇒ 켬에서도 null · 자명 통과 금지: 표 한 칸을 채우면 고른다
  ok(RP.chooseSpecies('forage', 'nippon', 30000, 60000, 0.5, null, ['mushroom_patch', 'beehive']) === null, '군락 — 식료 빈칸이라 켬에서도 옛 줄');
  RP.TABLE.forage.push({ id: 'beehive', ko: '벌집', hb: '보통', np: '많음', st: '—', ev: '하네스 미끼' });
  const got = RP.chooseSpecies('forage', 'nippon', 30000, 60000, 0.9, null, ['mushroom_patch', 'beehive']);
  RP.TABLE.forage.pop();
  ok(got === 'beehive', '자명 통과 금지 — 표 한 칸(닛폰 벌집 많음)을 채우면 군락이 가중으로 고른다', got);
});

// ── ⓗ 굽기 — 재민 08-01 규칙 셋(주요 철 없음 · 은 단독 없음 · 다광종) ─────────────────────────────
sec('ⓗ 굽기(bakeOre) — 재민 확정 규칙 셋 · POLY 정본 하나');
withEnv({ T574_REGION: '500' }, () => {
  let ironMaj = 0, silver = 0, polyBad = 0, n = 0, ironMin = 0;
  for (let i = 0; i < 6000; i++) {
    const z = i % 2 ? 'nippon' : 'hanbando', W = z === 'nippon' ? NW : HW;
    const x = (i * 7919) % W, y = (i * 104729) % HH, u = (i + 0.5) / 6000;
    const a = RP.bakeOre(z, x, y, u, true), b = RP.bakeOre(z, x, y, u, false); n++;
    if (RP.NO_MAJOR.includes(a.mineral)) ironMaj++;
    if (b.mineral === 'iron') ironMin++;
    if (a.mineral === 'silver' || b.mineral === 'silver') silver++;
    for (const r of [a, b]) { const P = HB.POLY[r.mineral]; if (P ? JSON.stringify(r.minerals) !== JSON.stringify(P) : r.minerals !== null) polyBad++; }
  }
  ok(ironMaj === 0, '① 주요 광맥엔 철(·사철)이 안 든다', `${n}표본`);
  ok(ironMin > 0, '① 자잘(플레이어 전용)엔 철이 그대로 든다(탐험 보상)', `${ironMin}`);
  ok(silver === 0, '③ 은 단독 광맥은 안 굽는다(연은 = 납)');
  ok(polyBad === 0, '② 납·구리·금은 POLY 분포를 달고 나머지는 단광종');
  ok(RP.bakeOre('jungwon_n', 100, 100, 0.5, true) === null, '프로필 없는 존은 null(옛 길)');
  const src = fs.readFileSync(path.join(ROOT, 'scripts', 'migrate-veins-polymetal.js'), 'utf8');
  ok(/require\(path\.join\(__dirname, '\.\.', 'server', 'hanbando-minerals'\)\)\.POLY/.test(src) && !/lead:\s*\{\s*lead:\s*0\.85/.test(src), 'POLY 정본 하나 — 마이그레이션 스크립트도 hanbando-minerals 를 읽는다(사본 0)');
});

// ── ⓖ 광맥 u ─────────────────────────────────────────────────────────────────
sec('ⓖ 광맥 자리 u = 계획기 hash2(셀, 731)');
{
  const hash2 = (ix, iy, s) => { let h = (ix | 0) * 374761393 + (iy | 0) * 668265263 + (s | 0) * 1274126177; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967295; };
  let bad = 0; for (let i = 0; i < 300; i++) { const x = (i * 7717) % HW, y = (i * 92821) % HH; if (RP.veinU(x, y) !== hash2(Math.floor(x / 32), Math.floor(y / 32), 731)) bad++; }
  ok(bad === 0, 'veinU = hash2(⌊x/32⌋, ⌊y/32⌋, 731) — 300 표본');
  const src = fs.readFileSync(path.join(ROOT, 'server', 'region-profiles.js'), 'utf8').replace(/\/\/[^\n]*/g, '');
  ok(!/Math\.random/.test(src), '주사위 0 — region-profiles 에 Math.random 없음');
}

// ── ⓘ 추신4 — L 500 으로 구운 정본 ─────────────────────────────────────────────
sec('ⓘ 추신4 — L 500 으로 구운 정본(자리 그대로 · 자기일치 · 규칙 셋 · 끔 되돌림)');
{
  const raw = fs.readFileSync(path.join(ROOT, 'server', 'hanbando-terrain.json'), 'utf8');
  const doc = JSON.parse(raw);
  const off = JSON.parse(fs.readFileSync(path.join(ROOT, 'server', 'region-bake-off.json'), 'utf8'));
  const POS = ['name', 'center', 'radius', 'minor'], MIN = ['mineral', 'minerals', 'pk'];
  const key = (c) => c[0] + ',' + c[1];
  ok(off.L === 500 && off.L === RP.L_DEFAULT && off.s0 === RP.S0(), '옛 기록의 L = 기본 L = 500 · s₀ 같다', `L ${off.L} · s₀ ${off.s0}`);
  // ① 자리 칸 그대로 — 옛 기록과 지금 정본이 광종 칸(mineral·minerals·pk)에서만 다르다
  let posBad = 0, nowBad = 0, miss = 0, same = 0; const by = {};
  for (const z of ['hanbando', 'nippon']) {
    const idx = new Map(doc[z].ores.map((o) => [key(o.center), o]));
    by[z] = new Map();
    for (const e of off.zones[z]) {
      const o = idx.get(key(e.c)); if (!o) { miss++; continue; }
      by[z].set(key(e.c), e.was);
      if (o.mineral !== e.now) nowBad++;
      if (JSON.stringify(o) === JSON.stringify(e.was)) same++;
      const keys = new Set(Object.keys(o).concat(Object.keys(e.was)));
      for (const k of keys) if (!MIN.includes(k) && JSON.stringify(o[k]) !== JSON.stringify(e.was[k])) posBad++;
      for (const k of POS) if (JSON.stringify(o[k]) !== JSON.stringify(e.was[k])) posBad++;
    }
  }
  ok(miss === 0 && nowBad === 0 && same === 0, '옛 기록 줄마다 — 그 자리 광맥이 있고 · 지금 광종 = now · 실제로 다르다', `없음 ${miss} · now 다름 ${nowBad} · 같은 줄 ${same}`);
  ok(posBad === 0, '자리(이름·좌표·반경·주요/자잘)는 그대로 — 바뀐 칸은 광종 칸뿐', `다른 자리 칸 ${posBad}`);
  ok(off.zones.hanbando.length === 119 && off.zones.nippon.length === 54, '바뀐 광맥 — 한반도 119/787 · 닛폰 54/55', `${off.zones.hanbando.length} · ${off.zones.nippon.length}`);
  // ② 정본 = 굽기(옛 기록) — 한반도는 덜 흔드는 굽기(rebakeKeep) · 닛폰은 다 굽기(bakeOre — T580 기계와 같은 줄)
  const expect = (z, old) => {
    const b = z === 'hanbando' ? RP.rebakeKeep(z, old, 500) : RP.bakeOre(z, old.center[0], old.center[1], RP.veinU(old.center[0], old.center[1]), !old.minor, 500);
    if (!b || b.mineral === old.mineral) return old;
    const e = Object.assign({}, old, { mineral: b.mineral, pk: SP.orePeakFor(b.mineral, 0.30, RP.veinU(old.center[0], old.center[1], 500)) });
    if (b.minerals) e.minerals = b.minerals; else delete e.minerals;
    return e;
  };
  let selfBad = 0, n = 0;
  for (const z of ['hanbando', 'nippon']) for (const o of doc[z].ores) { n++; const old = by[z].get(key(o.center)) || o; if (JSON.stringify(expect(z, old)) !== JSON.stringify(o)) selfBad++; }
  ok(selfBad === 0, '정본 = 굽기(옛 기록) — 두 존 광맥 하나하나 바이트 같다(굽기 함수가 정본을 낸다)', `${n}개 중 다름 ${selfBad}`);
  // ③ 재민 08-01 규칙 셋 — 두 존 정본 위반 0
  let iron = 0, silver = 0, poly = 0;
  for (const z of ['hanbando', 'nippon']) for (const o of doc[z].ores) {
    if (!o.minor && RP.NO_MAJOR.includes(o.mineral)) iron++;
    if (o.mineral === 'silver') silver++;
    if (JSON.stringify(o.minerals || null) !== JSON.stringify(HB.POLY[o.mineral] || null)) poly++;
  }
  ok(iron + silver + poly === 0, '재민 08-01 규칙 셋 위반 0 — 주요 철·사철 · 은 단독 · 납·구리·금 POLY(두 존 정본 842)', `철 ${iron} · 은 ${silver} · POLY ${poly}`);
  // ④ 닛폰 고유 품목은 한반도에 꼬리로만 든다
  const npU = RP.uniqueOf('ore', 'nippon', 'hanbando');
  let notTail = 0, nU = 0;
  for (const o of doc.hanbando.ores) if (npU.includes(o.mineral)) { nU++; const old = by.hanbando.get(key(o.center)) || o; const b = RP.rebakeKeep('hanbando', old, 500); if (!b || b.why !== 'tail' || b.mineral !== o.mineral) notTail++; }
  ok(nU > 0 && notTail === 0, '닛폰 고유 품목(옥·유황)은 한반도에 꼬리(씨 732 < T)로만 들었다', `${nU}개 · 꼬리 아님 ${notTail}`);
  // ④′ 뽑기 씨 독립 — 다시 뽑힌 옥 광맥이 한 품목으로 쏠리지 않는다(옛 광종을 낸 u 를 다시 쓰면 98 중 90 이 납이었다)
  { const rd = {}; let nr = 0;
    for (const e of off.zones.hanbando) { const b = RP.rebakeKeep('hanbando', e.was, 500); if (b && b.why === 'redraw') { nr++; rd[b.mineral] = (rd[b.mineral] || 0) + 1; } }
    const top = Math.max(...Object.values(rd)); ok(nr > 0 && top / nr < 0.5 && Object.keys(rd).length >= 4, '다시 뽑기(옥 → 한반도 품목)는 한 품목에 몰리지 않는다(뽑기 씨 733 ⟂ 옛 광종 씨 731)', JSON.stringify(rd)); }
  // ⑤ 끔이면 통째 되돌림 · 켬이면 그대로
  const cp = JSON.parse(raw), nOff = RP.restoreBakeOff(cp);
  let back = 0;
  for (const z of ['hanbando', 'nippon']) for (const o of cp[z].ores) { const w = by[z].get(key(o.center)); if (w && JSON.stringify(w) === JSON.stringify(o)) back++; }
  ok(nOff === 173 && back === 173, '끔(T574_REGION=0) — 정본을 실을 때 바뀐 173 광맥이 옛 기록 그대로(키 차례까지) 돌아온다', `${nOff} · 같은 ${back}`);
  withEnv({ T574_REGION: null }, () => { const c2 = JSON.parse(raw); ok(RP.restoreBakeOff(c2) === 0 && JSON.stringify(c2) === raw, '켬(기본)이면 되돌림 0 — 구운 정본 그대로'); });
  ok(/require\('\.\/region-profiles'\)\.restoreBakeOff\(_hardcodedCache\)/.test(fs.readFileSync(path.join(ROOT, 'server', 'terrain.js'), 'utf8')), 'terrain.js 가 정본을 실을 때 되돌림 문을 지난다(한 줄)');
}

console.log(`\n=== ${pass + fail}건 중 PASS ${pass} · FAIL ${fail} ===`);
process.exit(fail ? 1 : 0);
