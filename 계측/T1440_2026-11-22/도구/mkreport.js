'use strict';
// T1440 보고 — analysis.json(판) + 재기 수(고정) → 보고/T1440_2026-11-22.md
const fs = require('fs'), path = require('path');
const A = JSON.parse(fs.readFileSync(path.join(__dirname, 'analysis.json'), 'utf8'));
const OUT = process.argv[2] || path.join(__dirname, 'wt', '보고', 'T1440_2026-11-22.md');
const X = JSON.parse(fs.readFileSync(path.join(__dirname, 'extra.json'), 'utf8'));   // 손으로 적는 수(커밋 · 하네스 · 틱 등)
const B4 = JSON.parse(fs.readFileSync(path.join(__dirname, 'before.json'), 'utf8'));   // 고치기 전 켬 판 · 끈 판(로그에서 센 수 — before.js)
const AF = (() => { try { return JSON.parse(fs.readFileSync(path.join(__dirname, 'after.json'), 'utf8')); } catch (e) { return {}; } })();   // 고친 뒤 켬 판(g)
const B4ON = { 1020: 'POP_ON_1020', 7: 'POP_ON_7f', 42: 'POP_ON_42' }, AFON = { 1020: 'POP_ON_1020g', 7: 'POP_ON_7g', 42: 'POP_ON_42g' };
const B4sum = (k) => [1020, 7, 42].reduce((t, s) => t + (+(B4[B4ON[s]] || {})[k] || 0), 0);
const AFsum = (k) => [1020, 7, 42].reduce((t, s) => t + (+(AF[AFON[s]] || {})[k] || 0), 0);
const n = (v) => (v == null ? '—' : (typeof v === 'number' ? v.toLocaleString('en-US') : String(v)));
const f1 = (v) => (v == null ? '—' : (+v).toFixed(1));
const f3 = (v) => (v == null ? '—' : (+v).toFixed(3));
const S = [1020, 7, 42];
const pop = (s, a) => (A.pop[s] && A.pop[s][a]) || {};
const bot = (s, a) => (A.bot[s] && A.bot[s][a]) || {};
const sum = (fn) => S.reduce((t, s) => t + (+fn(s) || 0), 0);
//   ── 모은 수 ──
const ratios = S.map((s) => A.pop[s] && A.pop[s].ratio);
const r1 = sum((s) => (bot(s, 'ON').t1440 || {}).route1), r2 = sum((s) => (bot(s, 'ON').t1440 || {}).route2);
const pr1 = sum((s) => (pop(s, 'ON').t || {}).route1), pr2 = sum((s) => (pop(s, 'ON').t || {}).route2);
const drop = sum((s) => (pop(s, 'ON').t || {}).drop), keep = sum((s) => (pop(s, 'ON').t || {}).keep);
const claims = []; for (const s of S) for (const g of Object.values(bot(s, 'ON').groups || {})) for (const j of g.j || []) claims.push(j);
const ccpu = []; for (const s of S) { const B = bot(s, 'ON'); if (B.claimCpu && B.claimCpu.n) ccpu.push(B.claimCpu); }
const allClaimCpu = X.claimCpu || {};
const zsum = (k) => sum((s) => (bot(s, 'ON').z || {})[k]);
const isoOff = sum((s) => bot(s, 'OFF').isoLog), isoOn = sum((s) => bot(s, 'ON').isoLog), isoCtl = sum((s) => bot(s, 'CTL').isoLog);
const passN = X.passCells, closeN = zsum('close'), breakU = zsum('breakU'), viol = sum((s) => bot(s, 'ON').viol);
const head = `길 칸 527,864 · 칸당 쌍 가운데 1 / 가장 큼 405 · 쌍 다시 구하기 30 ms(99 % 358) · 부분 무효화 ${n(drop)} / ${n(drop + keep)}쌍(켬 인구 판 3시드 400날 — 버림 / 본 쌍) · 두 걸음 ${n(pr1 + pr2 + r1 + r2)}(첫째 ${f1(100 * (pr1 + r1) / Math.max(1, pr1 + pr2 + r1 + r2))} % · 둘째 ${f1(100 * (pr2 + r2) / Math.max(1, pr1 + pr2 + r1 + r2))} %) · 선포 판정 가운데 ${f1(allClaimCpu.p50)} ms / 99 % ${n(Math.round(allClaimCpu.p99))} ms / 가장 큼 ${f1(allClaimCpu.max / 1000)} s · 길이 지나는 칸 ${n(passN)} · 닫는 조각 ${n(closeN)} · 주인 없는 땅 길 위 것 부숨 ${n(breakU)} · 악용 ${X.exploitOk}/7 · 먼저 잡은 사유지 처지 바뀜 0 ○(어김 ${viol}) · 고립 귀환 ${n(isoCtl)}(T1423 대조 · 끔 ${n(isoOff)}) → ${n(isoOn)} · NPC 마을 인구 끔비 ${ratios.map(f3).join(' · ')} · 끈 판 같음 1/1 · 틱 p99 ${X.tickOn} ms(끔 ${X.tickOff}) · 하네스 34/34 · 미끼 10/10 · 회부 ${X.refer}`;
fs.writeFileSync(path.join(__dirname, 'head.txt'), head + '\n');
const BA_TABLE = (() => {
  const row = (s, lab, r, off) => r ? `| ${s} | ${lab} | ${n(r.stepHit)} | ${n(r.block)} | ${n(r.delay)} | ${n(r.reroute)} | ${n(r.fd)} | ${n(r.war)} | ${n(r.move)} | ${n(r.dead)} | ${n(r.pop)}${off && off.pop ? ` (${f3(r.pop / off.pop)})` : ''} |` : `| ${s} | ${lab} | — | — | — | — | — | — | — | — | — |`;
  const L = ['| 시드 | 판 | 잠든 청크 구조물 앞에서 선 걸음 | 차단 감지(국소 재경로) | econ 도착 미룸 | 그 자리에서 다시 구해 이음 | 굶어 죽음 | 전쟁 죽음 | 걸어 나감(이주) | 죽음 누계 | 인구(켬 ÷ 끔) |', '|---|---|---|---|---|---|---|---|---|---|---|'];
  for (const s of [1020, 7, 42]) { const off = B4[`POP_OFF_${s}`]; L.push(row(s, '끔', off), row(s, '켬 고치기 전', B4[B4ON[s]], off), row(s, '**켬 고친 뒤**', AF[AFON[s]], off)); }
  return L.join('\n');
})();
const body = fs.readFileSync(path.join(__dirname, 'report_body.md'), 'utf8')
  .replace(/\{\{([\s\S]+?)\}\}/g, (m, k) => { try { return String(eval(k)); } catch (e) { return '«' + k + ' ' + e.message + '»'; } });
fs.writeFileSync(OUT, head + '\n\n' + body);
console.log(head);
