#!/usr/bin/env node
// @regress   ← 통합 러너가 이 표를 보고 자기 목록을 만든다
// === scripts/test-village-label.js — T593 ⑤ 마을 이름표 = 땅이 말하는 직업 ===============================
//
// ★왜 [재민 10-03 "최남단 마을이 바다 옆인데 농촌" · 카드 T593 ⑤]
//   이름의 꼬리표("농촌n/어촌n/광산n/임업n")는 **후보 칸의 꼬리표**일 뿐이고 직업은 땅에서 나온다.
//   초기화 시딩에서 그 꼬리표를 땅에 맞춘다(손잡이 `T593_LABEL` · 기본 끔). 이 하네스가 지키는 것:
//     ① 손잡이 — 기본 끔 · 켜면 켜진다
//     ② 문턱은 **typeLabel 그대로** — 갈래 함수가 옛 typeLabel 식(랩 사본의 그 줄)과 격자 전수에서 같은 답을 낸다
//     ③ 규칙 — 판정 둘 · 받쳐 주면 그대로 · 못 받쳐 주면 땅이 가리키는 쪽(광맥 선 · 숲 선 · 큰 몫 · 기본값)
//     ④ 이름 짓기 — 번호는 후보 전체의 다음 번호 · 꼬리만 바꾸는 꼴 · 꼬리표 없는 이름은 그대로 · 겹침 0
//     ⑤ 실지도(한반도 51 + 닛폰 30) — 바뀐 이름은 꼬리표가 실제로 바뀐 것뿐 · 남은 꼬리표는 땅이 받쳐 준다 · 이름 겹침 0
//     ⑥ 배선 — 서버 시딩·두 자(`t17-metrics`·`t176-ab`)가 **같은 함수**를 부른다 · 끄면 후보 이름 그대로
//
// 실행: node scripts/test-village-label.js
'use strict';
process.env.ENABLE_VILLAGES = '0';
process.env.DB_PATH = process.env.DB_PATH || `/tmp/t593-label-${process.pid}.db`;
const path = require('path');
const fs = require('fs');
const { execFileSync } = require('child_process');
const ROOT = path.join(__dirname, '..');
const R = (p) => require(path.join(ROOT, p));
let pass = 0, fail = 0;
const ok = (c, m, x) => { c ? pass++ : fail++; console.log((c ? '  ✓ ' : '  ✗ ') + m + (x !== undefined && x !== '' ? `  ${x}` : '')); };
const codeOf = (s) => s.split('\n').map((l) => l.replace(/\/\/.*$/, '')).join('\n').replace(/\/\*[\s\S]*?\*\//g, ' ');
const VP = path.join(ROOT, 'server', 'villages.js');
const P = R('server/villages').__labProbe;
const VL = R('server/village-layout');
const E = R('sim/economy-sim');
const LV = R('server/livelihood');

console.log('\n=== T593 ⑤ 마을 이름표 ===');

// ── ① 손잡이 ──────────────────────────────────────────────────────────────────
console.log('\n① 손잡이 — 기본 끔');
{
  ok(P.T593_LABEL === false, '① ★★기본이 **끔**이다(끔 = 후보 이름 그대로)', String(P.T593_LABEL));
  const on = JSON.parse(execFileSync(process.execPath, ['-e', `process.stdout.write(JSON.stringify(require(${JSON.stringify(VP)}).__labProbe.T593_LABEL))`],
    { env: Object.assign({}, process.env, { T593_LABEL: '1' }), stdio: 'pipe' }).toString());
  ok(on === true, '① `T593_LABEL=1` 이면 켜진다');
}

// ── ② 문턱 = typeLabel 그대로 ──────────────────────────────────────────────────
console.log('\n② 문턱 — typeLabel 그대로(랩 사본의 옛 줄과 격자 전수 대조)');
{
  // ★[PM 10-03] 기준 줄을 econ 번들이 아니라 **랩 자체 배치 사본**(`lab/마을실험실.html` 의 압축된 옛 줄)에서 읽는다 —
  //   번들은 `server/village-layout.js` 를 그대로 묶으므로 T593 을 다시 묶는 순간 옛 줄이 사라진다(착지 때 번들 재생성으로 빨강).
  const LAB = fs.readFileSync(path.join(ROOT, 'lab', '마을실험실.html'), 'utf8');
  const m = LAB.match(/const typeLabel ?= ?(\(hShare[\s\S]*?: ?'plain');/);
  ok(!!m, '② [상황] 랩 사본에서 옛 typeLabel 줄을 읽었다(그 줄이 기준이다 — 하네스가 문턱을 옮겨 적지 않는다)', m ? `${m[1].replace(/\s+/g, ' ').length}자` : '못 찾음');
  if (m) {
    const old = new Function('fShare', 'hShare', `return ${m[1]};`);
    let n = 0, bad = 0;
    for (let f = 0; f <= 1.0001; f += 0.0025) for (let h = 0; h <= 1.0001; h += 0.0025) {
      n++; const w = VL.typeBranch(f, h); if ((w === 'none' ? 'plain' : w) !== old(f, h)) bad++;
    }
    ok(bad === 0 && n > 100000, '② ★★갈래 함수(`typeBranch`)가 옛 typeLabel 과 **격자 전수에서 같은 답**이다(기본 갈래 = plain)', `${n}점 중 다름 ${bad}`);
  }
  const L = VL.TYPE_LINES;
  ok(L.fishHi === 0.42 && L.farmLo === 0.20 && L.farmHi === 0.40 && L.fishLo === 0.15 && L.both === 0.18, '② 문턱 다섯이 이름으로 올라왔을 뿐 값 그대로다', JSON.stringify(L));
}

// ── ③ 규칙 ────────────────────────────────────────────────────────────────────
console.log('\n③ 규칙 — 판정 · 받쳐 줌 · 땅이 가리키는 쪽');
{
  const K = P.t593Kind;
  const forW = (s) => LV.FLOOR.wood + LV.GAIN.wood * s;               // 숲 몫 s 인 땅의 임업 부존(정본 식의 앞 방향)
  const lpVein = { ore: 1.2, oreMix: { copper: 1 }, tin: 0, wood: LV.FLOOR.wood };   // 광맥 점수 1.2
  const lpWeak = { ore: 0.5, oreMix: { copper: 1 }, tin: 0, wood: LV.FLOOR.wood };   // 광맥 점수 0.5
  const lpWood = { ore: 0.1, oreMix: {}, tin: 0, wood: forW(VL.TYPE_LINES.fishHi + 0.05) };
  const lpThin = { ore: 0.1, oreMix: {}, tin: 0, wood: forW(VL.TYPE_LINES.fishHi - 0.05) };
  ok(E.veinScore(lpVein) >= E.BOOM_VEIN_MIN && E.veinScore(lpWeak) < E.BOOM_VEIN_MIN, '③ [상황] 광맥 점수가 정본 선 위·아래 두 땅', `${E.veinScore(lpVein)} · ${E.veinScore(lpWeak)} (선 ${E.BOOM_VEIN_MIN})`);
  ok(K('mining', 'riverside', lpVein, 0.1, 0.5) === 'riverside' && K('forest', 'plain', lpWood, 0.5, 0.1) === 'plain',
     '③ ★★판정 둘이 먼저다 — typeLabel 이 어촌·농촌이라 말하면 그 꼬리표(광맥·숲이 있어도)');
  ok(K('plain', 'mixed', lpVein, 0.4, 0.3) === 'plain' && K('riverside', 'mixed', lpWood, 0.4, 0.3) === 'riverside',
     '③ ★섞임(농·어 둘 다 굵다)이면 농촌·어촌 꼬리표를 **그대로** 둔다(광맥·숲이 있어도 — 그 꼬리표가 이미 맞다)');
  ok(K('plain', 'none', lpWeak, 0.3, 0.05) === 'plain', '③ 기본 갈래의 농촌 꼬리표는 그대로(typeLabel 기본값이 plain)');
  ok(K('mining', 'mixed', lpVein, 0.4, 0.3) === 'mining' && K('mining', 'none', lpVein, 0.3, 0.05) === 'mining',
     '③ ★광산 꼬리표는 광맥 점수가 선을 넘으면 그대로');
  ok(K('mining', 'mixed', lpWeak, 0.4, 0.3) === 'plain' && K('mining', 'mixed', lpWeak, 0.2, 0.3) === 'riverside' && K('mining', 'none', lpWeak, 0.3, 0.05) === 'plain',
     '③ ★★광맥이 선 아래면 광산이 아니다 — 섞임은 **큰 몫 쪽**, 기본은 typeLabel 기본값(농촌)');
  ok(K('forest', 'mixed', lpWood, 0.4, 0.3) === 'forest' && K('forest', 'mixed', lpThin, 0.4, 0.3) === 'plain',
     '③ ★임업 꼬리표는 숲 몫이 어촌 줄(0.42)을 넘을 때만 그대로', `숲 몫 ${(VL.TYPE_LINES.fishHi + 0.05).toFixed(2)} · ${(VL.TYPE_LINES.fishHi - 0.05).toFixed(2)}`);
  ok(K('forest', 'none', lpVein, 0.3, 0.05) === 'mining' && K('mining', 'none', lpWood, 0.3, 0.05) === 'forest' && K('riverside', 'none', lpWeak, 0.15, 0.34) === 'plain',
     '③ 못 받쳐 주는 꼬리표는 땅이 가리키는 쪽으로(광맥 선 → 광산 · 숲 선 → 임업 · 그 밖 기본 → 농촌)');
}

// ── ④ 이름 짓기 ───────────────────────────────────────────────────────────────
console.log('\n④ 이름 짓기 — 낱말만 바꾼다');
{
  const lay = (why, f, h) => ({ typeWhy: why, type: why === 'none' ? 'plain' : why, fShare: f, hShare: h });
  const lpWeak = { ore: 0.5, oreMix: { copper: 1 }, tin: 0, wood: LV.FLOOR.wood };
  const all = [{ name: '농촌22', type: 'plain' }, { name: '어촌16', type: 'riverside' }, { name: '광산2', type: 'mining' }, { name: '광산7', type: 'mining' },
    { name: '미도리광산', type: 'mining' }, { name: '후카임업', type: 'forest' }, { name: '후카농촌', type: 'plain' }, { name: '후지로', type: 'mining' }];
  const N = P.t593Namer(all);
  const a = N.label(all[2], lay('mixed', 0.41, 0.31), lpWeak);
  const b = N.label(all[3], lay('mixed', 0.23, 0.26), lpWeak);
  const c = N.label(all[4], lay('mixed', 0.24, 0.26), lpWeak);
  const d = N.label(all[5], lay('mixed', 0.28, 0.24), lpWeak);
  const e = N.label(all[7], lay('none', 0.15, 0.34), lpWeak);
  const f = N.label(all[0], lay('mixed', 0.45, 0.31), lpWeak);
  ok(a.name === '농촌23' && b.name === '어촌17', '④ ★"농촌n" 꼴은 새 낱말의 **다음 번호**(후보 전체의 가장 큰 번호 + 1)', `${a.name} · ${b.name}`);
  ok(c.name === '미도리어촌', '④ ★"줄기+낱말" 꼴은 꼬리만 바꾼다', c.name);
  ok(d.name === '후카농촌2', '④ ★★바꾼 이름이 이미 있으면 번호를 붙인다(겹침 0)', d.name);
  ok(e.name === '후지로' && e.kind === 'plain' && !e.renamed, '④ 꼬리표 없는 이름은 그대로 둔다(갈래만 바뀐다)', `${e.name} · ${e.kind}`);
  ok(f.name === '농촌22' && !f.renamed, '④ 꼬리표가 맞으면 이름도 그대로');
}

// ── ⑤ 실지도 ───────────────────────────────────────────────────────────────────
console.log('\n⑤ 실지도 — 한반도 51 + 닛폰 30(서버 시딩과 같은 조립 · 같은 함수)');
{
  //   표 기계(`t593-labels.js`)가 서버 시딩과 같은 조립·같은 함수로 낸 표를 받아 **성질**을 본다(이름을 하네스가 짓지 않는다).
  const JF = `/tmp/t593-label-test-${process.pid}.json`;
  execFileSync(process.execPath, [path.join(ROOT, 'scripts', 't593-labels.js'), '--json', JF], { env: Object.assign({}, process.env), stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 64 << 20 });
  const out = JSON.parse(fs.readFileSync(JF, 'utf8'));
  try { fs.unlinkSync(JF); } catch (e) {}
  const hb = out.find((t) => t.zone === 'hanbando'), np = out.find((t) => t.zone === 'nippon');
  ok(hb && hb.candidates === 51 && np && np.candidates === 30, '⑤ [상황] 후보 51 + 30 을 다 세웠다', `${hb && hb.candidates} + ${np && np.candidates}`);
  // 받쳐 줌 — 남은 꼬리표마다 그 근거 칸이 실제로 있다(판정 둘 · 섞임의 농·어 · 기본의 농 · 광맥 선 · 숲 선)
  const backed = (r) => (r.why === r.tag)
    || ((r.tag === 'plain' || r.tag === 'riverside') && r.why === 'mixed') || (r.tag === 'plain' && r.why === 'none')
    || (r.tag === 'mining' && r.vein >= E.BOOM_VEIN_MIN) || (r.tag === 'forest' && r.forS > VL.TYPE_LINES.fishHi);
  for (const t of out) {
    const rows = t.rows.filter((r) => !r.skip);
    const names = rows.map((r) => r.newName);
    ok(new Set(names).size === names.length, `⑤ ★${t.zone} — 새 이름이 **겹치지 않는다**`, `${names.length}곳`);
    ok(rows.every((r) => !r.renamed || r.kind !== r.tag), `⑤ ${t.zone} — 이름이 바뀐 곳은 전부 꼬리표가 실제로 바뀐 곳이다`);
    const unbacked = rows.filter((r) => !r.kindChanged && !backed(r));
    ok(unbacked.length === 0, `⑤ ★${t.zone} — 남은 꼬리표는 전부 땅이 받쳐 준다`, unbacked.map((r) => r.name).join(' ') || `${rows.filter((r) => !r.kindChanged).length}곳`);
    const flipped = rows.filter((r) => r.kindChanged && backed(r) && !(r.why === 'riverside' || r.why === 'plain'));
    ok(flipped.length === 0, `⑤ ${t.zone} — 받쳐 주는 꼬리표를 판정 없이 바꾼 곳이 없다`, flipped.map((r) => r.name).join(' ') || '0');
  }
  const ch = hb.rows.filter((r) => r.renamed);
  ok(ch.length > 0, '⑤ ★한반도에서 실제로 바뀐 이름이 있다(자명 통과 금지)', ch.map((r) => `${r.name}→${r.newName}`).join(' · '));
  const coast = hb.rows.filter((r) => r.coastal);
  console.log(`    한반도 바닷가 마을(land.coastal): ${coast.map((r) => `${r.name}(${r.why} 농${r.f} 어${r.h} → ${r.newName})`).join(' · ') || '없음'}`);
  ok(coast.length > 0, '⑤ [상황] 바닷가 마을이 표에 있다(카드가 물은 그 마을 — 결과는 표로 본다 · 판정 0)', `${coast.length}곳`);
}

// ── ⑥ 배선 ────────────────────────────────────────────────────────────────────
console.log('\n⑥ 배선 — 서버 시딩·두 자가 같은 함수 · 끄면 후보 이름');
{
  const V = codeOf(fs.readFileSync(VP, 'utf8'));
  ok(/const _t593 = T593_LABEL \? _t593Namer\(hard\) : null;/.test(V) && /const vName = _lab \? _lab\.name : hv\.name;/.test(V),
     '⑥ ★★서버 시딩이 그 함수로 이름을 짓고, 끄면 **후보 이름 그대로**다');
  ok(/zone: state\.zoneId, name: vName,/.test(V) && /rows\.push\(\{ dbId, name: vName,/.test(V), '⑥ DB 이름과 econ 이름이 **같은 새 이름**이다(econ 은 DB 이름으로 선다)');
  ok(/for \(const v of state\.villages\) if \(v\._seedName\) state\.claimedNames\.add\(v\._seedName\);/.test(V), '⑥ 이름을 바꾼 마을은 후보 이름으로도 차지한다(레거시 디듀프)');
  for (const f of ['t17-metrics.js', 't176-ab.js']) {
    const S = codeOf(fs.readFileSync(path.join(ROOT, 'scripts', f), 'utf8'));
    ok(/const _t593 = P\.T593_LABEL \? P\.t593Namer\(hard\) : null;/.test(S) && /name: _t593 \? _t593\.label\(hv, layout, lp\)\.name : hv\.name/.test(S)
       && /!!\(seeds\[0\] && seeds\[0\]\.t593\) !== !!P\.T593_LABEL/.test(S), `⑥ ★자 \`${f}\` 가 같은 함수 · 같은 손잡이로 이름을 짓는다(캐시도 손잡이를 가린다)`);
  }
}

console.log(`\n=== 결과: ${pass} PASS / ${fail} FAIL ===\n`);
for (const f of [process.env.DB_PATH, process.env.DB_PATH + '-wal', process.env.DB_PATH + '-shm']) { try { fs.unlinkSync(f); } catch (e) {} }
process.exit(fail ? 1 : 0);
