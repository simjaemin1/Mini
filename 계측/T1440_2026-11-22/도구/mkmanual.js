'use strict';
// extra.json = extra_auto.json(mkextra) + 보고 표 줄(악용 · 무거운 판정 · 회부) — 판 수에서 글을 짓는다
const fs = require('fs'), path = require('path');
const rd = (f) => JSON.parse(fs.readFileSync(path.join(__dirname, f), 'utf8'));
const X = rd('extra_auto.json'), A = rd('analysis.json');
const S = [1020, 7, 42];
const n = (v) => (v == null ? '—' : (typeof v === 'number' ? v.toLocaleString('en-US') : String(v)));
const bot = (s, a) => (A.bot[s] && A.bot[s][a]) || {};
const G = (k) => X.ex[k] || { on: [], off: [], ctl: [] };
const bySeed = (arr) => S.map((s) => arr.find((x) => x.s === s) || null);
const j3 = (f, arr) => bySeed(arr).map((x) => (x ? f(x) : '—')).join(' · ');
const same3 = (f, arr) => { const v = bySeed(arr).map((x) => (x ? f(x) : '—')); return v.every((y) => y === v[0]) ? `${v[0]}` : v.join(' · '); };
const stand = (x) => (x && x.pieces != null && x.end && x.end[0] != null ? `${x.end[0]}/${x.pieces}` : '—');
const isoOn = S.map((s) => bot(s, 'ON').isoLog), isoOff = S.map((s) => bot(s, 'OFF').isoLog), isoCtl = S.map((s) => (A.bot[s] && A.bot[s].CTL ? A.bot[s].CTL.isoLog : null));
const vpOn = S.map((s) => (bot(s, 'ON').z || {}).vpOff), vpCtl = S.map((s) => (A.bot[s] && A.bot[s].CTL && A.bot[s].CTL.z ? A.bot[s].CTL.z.vpOff : null));
const violOn = S.reduce((t, s) => t + (bot(s, 'ON').viol || 0), 0);
const ok = {};
//   악용마다: [이름, 봇이 한 것, 켬 글, 끔 글, 대조 글, 막혔나]
const rows = [];
{ const g = G('wingsU'); const road = (x) => (x.v || {}).road || 0, broke = (x) => x.want - (x.end[0] || 0);
  ok.wingsU = bySeed(g.on).every((x) => x && broke(x) >= 1 && broke(x) <= road(x) + 2);
  rows.push(['날개 — 주인 없는 땅', `길 양옆 · 길 위에 울타리 ${bySeed(g.on)[0] ? bySeed(g.on)[0].want : '—'}개(길을 좁혀 몰기)`,
    `길 위 ${same3(road, g.on)}개에 알림 · 캐러밴이 친 것 ${j3(broke, g.on)} · 저장된 길 그대로(쌍 안 버림)`, `선 것 ${j3(stand, g.off)}(길이 울타리를 안 본다 · 잠든 청크에선 몸이 지나간다)`,
    j3(stand, g.ctl), ok.wingsU]); }
{ const g = G('wingsP'); const pv = (x) => (x.v || {}).protected || 0, yv = (x) => (x.v || {}).yield || 0;
  ok.wingsP = bySeed(g.on).every((x) => x && yv(x) <= 1 && x.passN === yv(x));
  rows.push(['날개 — 사유지', '길 양옆을 사유지로 한 칸씩 10칸(길을 밀어 다른 쪽으로)', `보호 ${same3(pv, g.on)}(길이 옆 칸으로) · 마지막 칸 내줌 ${same3(yv, g.on)}(길이 지나는 칸)`, `선포 10 · 길은 사유지를 안 본다(그대로)`, '—', ok.wingsP]); }
{ const g = G('thick'); const road = (x) => (x.v || {}).road || 0, broke = (x) => x.pieces - (x.end[0] || 0);
  ok.thick = bySeed(g.on).every((x) => x && broke(x) >= 1);
  rows.push(['열 겹', `길을 가로지르는 울타리 여러 겹(${bySeed(g.on)[0] ? bySeed(g.on)[0].pieces : '—'}개)`, `길 위 ${same3(road, g.on)}개 알림 · 캐러밴이 친 것 ${j3(broke, g.on)} · 길 그대로`, `선 것 ${j3(stand, g.off)}`,
    j3(stand, g.ctl), ok.thick]); }
{ const gF = G('houseF'), gN = G('houseN'); const hit = (x) => x.pieces - (x.end[0] || 0);
  ok.house = bySeed(gF.on).every((x) => x && hit(x) === 0) && bySeed(gN.on).every((x) => x && hit(x) === 0);
  rows.push(['남의 집 위로 길 몰기', `남(B)이 주인 없는 땅에 집(들 ${bySeed(gF.on)[0] ? bySeed(gF.on)[0].pieces : '—'} · 목 ${bySeed(gN.on)[0] ? bySeed(gN.on)[0].pieces : '—'}) · A 가 사유지로 길을 그 집 쪽으로`, `걸음 1 이 집까지 비켜 간다 — 집이 맞은 것 들 ${j3(hit, gF.on)} · 목 ${j3(hit, gN.on)}`, `길은 사유지 · 집을 안 본다(그대로)`, '—', ok.house]); }
{ const g = G('vilpush'); const pv = (x) => (x.v || {}).protected || 0;
  const passed = S.reduce((t, s) => t + (bot(s, 'ON').passed || 0), 0);
  ok.vilpush = violOn === 0;
  rows.push(['마을 땅 사유지로 마을 밖 사유지 밀기', `마을 땅 위 목(${bySeed(g.on)[0] && bySeed(g.on)[0].vil ? bySeed(g.on)[0].vil : '—'})을 마을 땅 사유지 ${bySeed(g.on)[0] ? bySeed(g.on)[0].claims : '—'}칸으로 · 길이 갈 곳은 남의 마을 밖 사유지`, `걸음 3 보호 ${same3(pv, g.on)} — 낮은 급(마을 밖) 사유지 가운데 나중 것이 길을 내줌(세 시드 합 ${passed}) · 같은 급 이상 처지 바뀜 0`, '길은 사유지를 안 본다', '—', ok.vilpush]); }
{ const g = G('neck'); const pv = (x) => (x.v || {}).protected || 0, yv = (x) => (x.v || {}).yield || 0;
  ok.neck = bySeed(g.on).every((x) => x && yv(x) === 1 && x.passN === 1);
  rows.push(['좁은 목 사유지 + 울타리', `교역로 ${bySeed(g.on)[0] ? bySeed(g.on)[0].routes : '—'}줄이 지나는 목(${bySeed(g.on)[0] ? bySeed(g.on)[0].want : '—'}칸)을 가운데부터 사유지로 · 닫는 칸에 울타리`, `보호 ${same3(pv, g.on)} · 목을 닫는 칸 = 길이 지나는 칸 · 울타리 = 닫는 조각 — 캐러밴이 쳤고 봇이 다시 놓음 ${j3((x) => x.again, g.on)}번(벌점 ${j3((x) => x.againVp, g.on)})`, '선포 10 · 길은 사유지를 안 본다', '—', ok.neck]); }
{ const g = G('grad'); ok.grad = bySeed(g.on).every((x) => x && x.maxProt != null && x.maxProt <= 3);
  rows.push(['조금씩 3배', '길을 가로지르는 사유지 줄을 날마다 두 칸씩(선포마다 판정)', `선포 ${j3((x) => x.steps, g.on)} · 보호 동안 처음 길 대비 가장 길게 ${j3((x) => x.maxProt, g.on)}배 · 3배 넘음 0`, '선포만 쌓임', '—', ok.grad]); }
{ const g = G('door'); const road = (x) => (x.v || {}).road || 0, broke = (x) => x.pieces - (x.end[0] || 0);
  ok.door = bySeed(g.on).every((x) => x && broke(x) >= 1);
  rows.push(['문 통행세', `길을 가로지르는 벽 줄(${bySeed(g.on)[0] ? bySeed(g.on)[0].pieces : '—'})에 문 하나`, `문도 길에겐 벽 — 길 위 ${same3(road, g.on)} 알림 · 캐러밴이 친 것 ${j3(broke, g.on)} · 통행세 0`, `선 것 ${j3(stand, g.off)}`, j3(stand, g.ctl), ok.door]); }
const okN = [ok.wingsU && ok.wingsP, ok.thick, ok.house, ok.vilpush, ok.neck, ok.grad, ok.door].filter(Boolean).length;
//   판정 51 — 남의 가게 앞 길 돌리기(재기 · 막는 규칙이 아니다 — 판정 51 이 허락한 손짓의 값)
const shopTxt = (x, side) => { if (!x) return '—'; const st = (x.stepsArr || []).map((t) => (side ? t[4] : t[3])).join('→'); return `${x.offAt != null ? `${x.offAt}칸` : `24칸 넘게(${x.stopWhy || '—'})`}${st ? `(${side ? '거리' : '지나는 쌍'} ${side ? x.d0 : x.thru0}→${st})` : ''}`; };
const shopRows = [];
{ const g = G('shop'), gk = G('shopK');
  shopRows.push(['남의 가게 앞 길 돌리기 — 길가', 'B 가 길가 칸(길 칸 옆 한 칸)을 사유지로 · A 가 그 앞 길 칸을 "비켜 가게" 사유지로 한 칸씩(B 칸에 가까운 길 칸부터)', `B 칸 둘레 한 칸을 지나는 쌍이 0 이 될 때까지 A 선포 ${j3((x) => shopTxt(x, true), g.on)}`, '길이 사유지를 안 본다(못 돌린다)', '—']);
  shopRows.push(['남의 가게 앞 길 돌리기 — 그대로 둠', 'B 가 길 칸을 "그대로 둠"으로(길이 B 땅을 지난다) · A 가 그 앞뒤 길 칸을 "비켜 가게"로 한 칸씩', `B 칸을 지나는 쌍이 0 이 될 때까지 A 선포 ${j3((x) => shopTxt(x, false), gk.on)} · B 칸은 끝까지 길이 지나는 칸(처지 그대로)`, '—', '—']);
}
const isoAll = isoOn.every((v) => v === 0);
const E = Object.assign({}, X);
E.exploitOk = isoAll ? okN : `${okN}(고립 귀환 ${isoOn.join(' · ')})`;
E.exRows = rows.map((r) => `| ${r[0]} | ${r[1]} | ${r[2]} | ${r[3]} | ${r[4]} | ${r[5] ? '○' : '✗'} |`).join('\n')
  + shopRows.map((r) => `\n| ${r[0]} | ${r[1]} | ${r[2]} | ${r[3]} | ${r[4]} | 재기(판정 51 이 허락한 것 — 회부 정보) |`).join('')
  + `\n| (닫는 조각 다시 놓기) | 부서질 때마다 다시 | 위 목 줄 — 벌점이 쌓인다(추방 판정 46 = T1441) | — | — | → T1441 |`
  + `\n| 판 전체 | | 고립 귀환 ${isoOn.join(' · ')} · 먼저 잡은 사유지 처지 바뀜 어김 ${violOn} | 고립 귀환 ${isoOff.join(' · ')} | 고립 귀환 ${isoCtl.map((v) => (v == null ? '—' : v)).join(' · ')} | |`;
//   무거운 판정
E.heavyRows = ['| 시드 | 무리 | 자리 | 급 | 판정 | 쌍 | CPU | 쌍 전체 다시 구하기 | 걸음 |', '|---|---|---|---|---|---|---|---|---|']
  .concat((X.heavy || []).map((h) => `| ${h[0]} | ${h[1]} | (${h[2]}, ${h[3]}) | ${h[4]} | ${h[5]} | ${h[6]} | ${(h[7] / 1000).toFixed(1)} s | ${h[8]} | ${h[9]} |`)).join('\n');
//   회부(재민 판정 · PM · 정보)
const refer = [
  ['재민 판정', '붐비는 목의 선포 판정 시간', `한 칸 선포가 쌍 수십 ~ 수백을 다른 목으로 돌려야 하면 판정이 수십 초 CPU 다(봇 판 가장 큼 ${(X.claimCpu.max / 1000).toFixed(1)} s · 재개형 16ms 몫 — 플레이어는 "길을 확인하고 있습니다" 를 1분 넘게 본다). 받아들일지 · 판정에 상한을 둘지(예: 쌍 수 · CPU 상한을 넘으면 그 칸을 바로 길이 지나는 칸으로) — 상한은 새 수라 판정이 든다.`],
  ['정보', '길 막기 벌점 · 원한의 자리', '닫는 조각 · 길 위 주인 없는 것을 캐러밴이 치면 세운 사람 +8(T1423 소식 줄 그대로) · 닫는 조각 주인이 NPC 마을 행이면 그 길을 쓰던 마을들이 원한(`t1440Grudge`). 사람 대상 원한으로 옮기는 것은 T1447(판정 55 ~ 58 · S8 — 이 가지 위)이 받는다 · 쌓인 벌점 추방은 T1441.'],
  ['정보', '남의 가게 앞 길 돌리기(판정 51)', `"비켜 가게" 사유지로 남의 길가 · 길 칸 앞 길을 미는 데 드는 칸 수(§3-2 — 길가 ${j3((x) => (x && x.offAt != null ? x.offAt : '24+'), G('shop').on)}칸 · 그대로 둠 ${j3((x) => (x && x.offAt != null ? x.offAt : '24+'), G('shopK').on)}칸). 막는 규칙은 없다(판정 51 이 허락한 손짓) — 값이 싸다고 보면 판정(예: 남의 길가 칸 둘레 선포는 걸음 3 으로).`],
  ['정보', '가는 도중 사유지를 비키는 길이 없을 때', '그 구간은 사유지를 걸어 지난다(§3-0 고침 3 — 정해진 것 6 · 8 에서 나온 동작). 다른 동작(그 자리 대기 · 되돌아가기)을 원하면 판정.'],
  ['PM', 'NPC 마을 인구 켬 ÷ 끔 · 늦은 굶음', `세 시드 ${S.map((s) => (A.pop[s] && A.pop[s].ratio != null ? A.pop[s].ratio.toFixed(3) : '—')).join(' · ')}(T1406_KEEP_ROUTES 0.84 처럼 깎이지는 않는다). 다만 식량 빚 죽음(1020 · 7 · 42)이 켬 ${S.map((s) => (A.pop[s] && A.pop[s].ON ? A.pop[s].ON.fd : '—')).join(' · ')} · 끔 ${S.map((s) => (A.pop[s] && A.pop[s].OFF ? A.pop[s].OFF.fd : '—')).join(' · ')}(7 · 42 켬은 330날 무렵부터) — 임업5 는 세 시드 켬 모두 econ 영토 확장 0(§3-1). 첫 켬 판의 굶음(몸이 서서 교역이 밀림)은 고친 뒤 사라졌고 이것은 다른 갈래다. 판 셋으로는 까닭을 못 갈랐다 — 승인 앞에 시드를 더 돌릴지 · 임업5 확장 게이트를 따로 잴지.`],
];
E.refer = refer.length; E.referJ = refer.filter((r) => r[0] === '재민 판정').length; E.referP = refer.filter((r) => r[0] === 'PM').length; E.referI = refer.filter((r) => r[0] === '정보').length;
E.referRows = ['| # | 갈래 | 무엇 | 내용 |', '|---|---|---|---|'].concat(refer.map((r, i) => `| ${i + 1} | ${r[0]} | ${r[1]} | ${r[2]} |`)).join('\n');
E.ciList = process.env.CI_LIST || '16/16';
E.shopOff = j3((x) => (x && x.offAt != null ? x.offAt : '24+'), G('shop').on); E.shopKOff = j3((x) => (x && x.offAt != null ? x.offAt : '24+'), G('shopK').on);
E.shopRatio = j3((x) => { const t = x && x.stepsArr && x.stepsArr.length ? x.stepsArr[x.stepsArr.length - 1][5] : null; return t == null ? '—' : t; }, G('shop').on);
E.shopKPass = j3((x) => (x && x.keepB ? (x.keepB.pass ? '그대로' : '바뀜') : '—'), G('shopK').on);
fs.writeFileSync(path.join(__dirname, 'extra.json'), JSON.stringify(E, null, 1));
console.log('exploitOk', E.exploitOk, JSON.stringify(ok));
console.log(E.exRows);
console.log(E.heavyRows);
console.log(E.referRows);
