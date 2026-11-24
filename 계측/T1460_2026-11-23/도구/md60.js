// md60.js — T1460 보고 표(마크다운): node md60.js <ana.json> <runs 폴더>
'use strict';
const fs = require('fs'), path = require('path');
const o = JSON.parse(fs.readFileSync(process.argv[2], 'utf8')), RUNS = process.argv[3];
const f = (x, d = 1) => x == null ? '—' : (typeof x === 'number' ? (Number.isInteger(x) ? x.toLocaleString('en-US') : x.toFixed(d)) : String(x));
const L = [];
// ① 진단 — 은거지 자리(고유 자리 · 시드)
L.push('### 표 1 — 은거지 자리 전수(넷 다 판 · 두 해 · 본 단 전부 → 고유 자리로 묶음)', '');
L.push('| 시드 | 자리(칸) | 단(선 날 범위) | 가장 가까운 마을 · 칸 | 쓰인 교역로까지 걸음 | 둘레 140칸 숲 칸 / 표본 | 사냥터 띠 숲 | 물 칸 | 바위 칸 | 제 몫 칸(남의 칸 뺌) | 둘레 사냥터 짐승(마을 장부 · 그중 제 몫) | 장부 땅(짐승 · 나무 · 크기 · 채집 MSY) | 실물 땅(짐승 · 나무) | 먹이는 수 장부 · 실물 맨손 · 실물 석기 | 단원-날 중 길목에 나가 있던 몫 |');
L.push('|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|');
const byK = new Map();
for (const d of o.diag) { const k = d.seed + '|' + d.camp.join(','); const a = byK.get(k) || []; a.push(d); byK.set(k, a); }
for (const [k, a] of byK) {
  const d = a[0], ids = a.map((x) => '#' + x.id).join(' '), born = Math.min(...a.map((x) => x.born)), last = Math.max(...a.map((x) => x.last));
  const away = a.reduce((s, x) => s + (x.awayD || 0), 0), mem = a.reduce((s, x) => s + (x.memD || 0), 0);
  L.push(`| ${d.seed} | (${d.camp.join(',')}) | ${a.length}단 ${ids} · D${born} ~ D${last} | ${d.near} · ${f(d.nearD)} | ${f(d.walk)} | ${d.ring.forest} / ${d.ring.n} | ${d.ring.huntForest} / ${d.ring.huntBand} | ${d.ring.water} | ${d.ring.rock} | ${f(d.mine, 2)} | ${f(d.bandAnimals, 0)} · ${d.bandMine} 칸 | ${d.now ? `${d.now.game} · ${d.now.wood} · ${d.now.size} · ${d.now.fs == null ? '없음' : d.now.fs}` : '—'} | ${d.real ? `${d.real.game} · ${d.real.wood}` : '—'} | ${f(d.capNow)} · ${f(d.capReal)} · ${f(d.capRealStone)} | ${mem ? (100 * away / mem).toFixed(1) + '%' : '—'} |`);
}
L.push('');
// ③ 판
L.push('### 표 2 — 두 해 3시드 · 넷 다(N) ↔ 넷 다 + T1460(D)', '');
const cols = [['단 수 평균 · 가장 많음', (r) => `${f(r.gangsAvg)} · ${r.gangsMax}`], ['단원 가운데 · 가장 많음', (r) => `${r.memMed} · ${r.memMax}`], ['가장 큰 무리', (r) => r.biggest], ['본 단 · 수명 가운데 · 가장 김(날)', (r) => `${r.gangsSeen} · ${f(r.lifeMed)} · ${f(r.lifeMax)}`],
  ['약탈 건', (r) => r.loot], ['단 있는 날 중 약탈 없는 날', (r) => `${r.noLootDays} / ${r.gangDays}`], ['마을로 돌아감(몸 · 기록 · 없음)', (r) => `${r.home}(${r.homeBody} · ${r.homeRec} · ${r.homeNone})`], ['굶어 죽은 도적', (r) => r.starve],
  ['사냥 · 채집으로 든 식량', (r) => f(r.fgFood)], ['장물 식량', (r) => f(r.lootFood)], ['숲 은거지 단 · 트인 땅 단 · 수명 가운데', (r) => `${r.forestN} · ${r.openN} · ${f(r.lifeForest)} ↔ ${f(r.lifeOpen)}`],
  ['도적 ÷ 세계 인구 가장 큼 · 1해 · 2해 평균', (r) => `${f(r.shareMax)}% · ${f(r.shareY1)}% · ${f(r.shareY2)}%`], ['행상 피살 · 털린 캐러밴', (r) => `${r.killed} · ${r.raided}`], ['교역 식량 수입', (r) => f(r.foodImp, 0)],
  ['인구(끝) · D ÷ N', (r) => `${f(r.popEnd)}${r.popRatio ? ' · ' + r.popRatio : ''}`], ['빈 마을(끝)', (r) => r.empty]];
const runs = o.runs.filter((r) => !r.missing);
L.push('| 칸 | ' + runs.map((r) => r.tag).join(' | ') + ' |', '|---|' + runs.map(() => '---').join('|') + '|');
for (const [n, g] of cols) L.push(`| ${n} | ` + runs.map(g).join(' | ') + ' |');
L.push('');
const d6 = runs.filter((r) => r.t1460);
if (d6.length) { L.push('켬(D) 판 T1460 셈 — 은거지에 있던 단원-날 · 길목에 나가 있던 단원-날 · 그중 몸 없음 · 든 식량:', ''); for (const r of d6) L.push(`* ${r.tag}: 있던 ${r.t1460.here} · 나가 있던 ${r.t1460.away} · 몸 없음 ${r.t1460.noBody} · 식량 ${f(r.t1460.food, 2)} · 땅 다시 읽음 ${r.t1460.reads}`); L.push(''); }
// ⑤ 숨을 자리 표(관찰기 — 날 60 · 730)
for (const tag of ['D_1020']) {
  const p = path.join(RUNS, tag, `${tag}-1020.json.t1460.json`); if (!fs.existsSync(p)) continue;
  const J = JSON.parse(fs.readFileSync(p, 'utf8')), S = J.spots || {};
  for (const day of ['60', '730']) { const R = (S[day] || []).filter((r) => r.spot).sort((a, b) => b.loot - a.loot); if (!R.length) continue;
    L.push(`### 표 3 — 산 마을마다 그 둘레 숨을 자리(㉠ 고르기 함수) · 털 것 · 그 자리 둘레가 먹이는 수(${tag} · 날 ${day} · 털 것 차례)`, '');
    L.push(`마을 ${R.length} · 숨을 자리 둘레가 맨손으로 먹이는 곳 ${R.filter((r) => r.cap > 0).length} · 석기로 먹이는 곳 ${R.filter((r) => r.capStone > 0).length}(가장 많이 ${Math.max(...R.map((r) => r.capStone || 0))}명)`, '');
    L.push('| 차례 | 마을 | 털 것 | 숨을 자리 · 마을에서 칸 | 실물 땅(짐승 · 나무) | 먹이는 수 맨손 · 석기 |', '|---|---|---|---|---|---|');
    R.slice(0, 12).forEach((r, i) => L.push(`| ${i + 1} | ${r.v} | ${f(r.loot, 0)} | (${r.spot.join(',')}) · ${r.d} | ${r.real ? r.real.game + ' · ' + r.real.wood : '—'} | ${r.cap} · ${r.capStone} |`));
    const best = R.slice().sort((a, b) => b.capStone - a.capStone || b.loot - a.loot).slice(0, 5);
    L.push('', '석기로 가장 많이 먹이는 숨을 자리 다섯: ' + best.map((r) => `${r.v}(털 것 ${R.indexOf(r) + 1}째 · ${r.capStone}명)`).join(' · '), '');
  }
}
console.log(L.join('\n'));
