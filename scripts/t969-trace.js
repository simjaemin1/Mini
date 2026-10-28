'use strict';
// (@regress 없음 — 러너 밖 · T969 관찰기 · 읽기만 · 제품 손잡이 0)
// === scripts/t969-trace.js — 교전 걸음이 하루 안에서 **어떻게 끊겨 돌았나** · 정산이 언제 · 무엇으로 났나(서버 판 자 곁 프리로드) ===
//
// ★[T969 2026-10-28 · T959 회부 2] 새 판 자(교전 몫 = 운영 하루)에서 벽시계 기준선과 가상 시계 판이 시드 42 econ 에서 갈렸다.
//   쓰는 법: NODE_OPTIONS="-r $PWD/scripts/t969-trace.js [-r $PWD/scripts/t745-vclock.js]" node scripts/t577-server-run.js 380 42
//     (이 파일을 **가상 시계보다 앞**에 둔다 — 실제 시계(`process.hrtime.bigint`)를 가상 시계가 바꾸기 전에 잡는다 · 아이 존만 · `T577_SEED`)
//   war-live `createWarLive` 를 감싸(모듈 내보내기 — 제품 무변) 돌려준 `stepFight` · `settle` 을 센다:
//     ① 전쟁 × econ 날: 교전 걸음 수 · **덩이 수**(같은 전쟁 걸음 사이에 실제 시간 2 ms 넘게 빈 자리 = 다른 일이 끼어든 자리) · 가장 긴 덩이
//     ② 정산: 날 · 까닭 · 승자 · 몸 초(`f.t`) · 양쪽 시작 · 죽음 · 궤주 — 두 판(벽시계 · 가상 시계)에서 처음 다른 정산이 econ 갈림의 첫 칸 후보
//   출력: `<판>.t969.json`(T577_OUT 곁 · `T969_OUT` 로 바꿀 수 있다)
if (!process.env.T577_SEED) return;
const path = require('path');
const fs = require('fs');
const OUT = process.env.T969_OUT || (process.env.T577_OUT ? process.env.T577_OUT.replace(/\.json$/, '') + '.t969.json' : '');
const RH = process.hrtime.bigint.bind(process.hrtime);   // 실제 시계(가상 시계 앞)
const WL = require(path.join(__dirname, '..', 'server', 'war-live.js'));
const rec = { days: {}, settles: [], gapNs: 2e6, trail: {}, peek: [] };
const PEEK = process.env.T969_PEEK ? process.env.T969_PEEK.split(':').map((x, i) => (i ? +x : x)) : null;
const orig = WL.createWarLive;
WL.createWarLive = function (opts) {
  const o = orig.call(this, opts);
  const dayOf = (opts && opts.dayOf) || (() => 0);
  const sf = o.stepFight, st = o.settle;
  const last = new Map();
  o.stepFight = function (f) {
    const d = dayOf() | 0, id = f && f.w ? f.w.id : '?', k = d + ':' + id, now = RH();
    const r = rec.days[k] || (rec.days[k] = { d, id, steps: 0, runs: 0, maxRun: 0, cur: 0 });
    const L = last.get(id);
    if (!L || L.k !== k || now - L.t > BigInt(rec.gapNs)) { r.runs++; r.cur = 0; }
    r.steps++; r.cur++; if (r.cur > r.maxRun) r.maxRun = r.cur;
    last.set(id, { k, t: now });
    const ret = sf.apply(this, arguments);
    //   몸 자취 — 전쟁마다 첫 걸음 · 100 걸음마다: 걸음 수 · 몸 초 · 상태 · 병사(편 · 종류 · x · y · hp · 상태)
    if (f && f.ctx && (r.steps === 1 || r.steps % 100 === 0)) {
      const tr = rec.trail[id] || (rec.trail[id] = []);
      if (tr.length < 80) tr.push([d, r.steps, +(+f.t).toFixed(3), f.state, f.ctx.units.map((u) => [u.side, u.type, +(+u.x).toFixed(3), +(+u.y).toFixed(3), +(+u.hp).toFixed(2), u.st || '', u.ctl ? 1 : 0])]);
    }
    //   ★갈림 자리 들여다보기 — `T969_PEEK=<전쟁 id>:<첫 걸음>:<끝 걸음>` 이면 그 걸음마다 병사 상태 · 세계 술어(시야 · 엄폐 · 막힘 · 건물 상자 수)를 남긴다(읽기만)
    if (PEEK && f && f.ctx && String(id) === PEEK[0] && r.steps >= PEEK[1] && r.steps <= PEEK[2]) {
      const U = f.ctx.units, W = f.ctx.world, a = U.find((u) => u.side === 'A'), b = U.find((u) => u.side === 'B');
      rec.peek.push([d, r.steps, U.map((u) => [u.side, +(+u.x).toFixed(3), +(+u.y).toFixed(3), u.st, u.ctl ? 1 : 0, u.tgt ? 1 : 0]),
        a && b && W ? [W.losBlocked(a.x, a.y, b.x, b.y) ? 1 : 0, W.coverAt(b.x, b.y, 0.5) ? 1 : 0, W.coverAt(a.x, a.y, 0.5) ? 1 : 0, W.blocked(b.x, b.y) ? 1 : 0] : null, f.holder,
        //   시야 줄 표본(1.5 m 간격 — war-live losBlocked 와 같은 표본)마다 막힘 · 엄폐(건물 상자 또는 나무) 칸
        a && b && W ? (() => { const dx = b.x - a.x, dy = b.y - a.y, n = Math.ceil(Math.hypot(dx, dy) / 1.5), o = []; for (let i = 1; i < n; i++) { const x = a.x + dx * i / n, y = a.y + dy * i / n; const bl = W.blocked(x, y), cv = W.coverAt(x, y, 0); if (bl || cv) o.push([Math.floor(x), Math.floor(y), bl ? 1 : 0, cv ? 1 : 0]); } return o; })() : null]);
    }
    return ret;
  };
  o.settle = function (f, why, winner) {
    const ok = st.apply(this, arguments);
    if (ok && f && f.settled) {
      const S = f.ctx && f.ctx.sides, res = f.settled.res;
      rec.settles.push({ day: dayOf() | 0, id: f.w && f.w.id, atk: f.w && f.w.atk && f.w.atk.name, def: f.w && f.w.def && f.w.def.name, why, winner: winner || null,
        t: +(+f.t).toFixed(3), A: S ? [S.A.start, S.A.dead] : null, B: S ? [S.B.start, S.B.dead] : null, rout: res ? [res.routA, res.routB] : null });
    }
    return ok;
  };
  return o;
};
process.on('exit', () => {
  if (!OUT) return;
  const days = Object.values(rec.days).map((r) => [r.d, r.id, r.steps, r.runs, r.maxRun]).sort((a, b) => a[0] - b[0] || String(a[1]).localeCompare(String(b[1])));
  try { fs.writeFileSync(OUT, JSON.stringify({ cols: ['day', 'war', 'steps', 'runs', 'maxRun'], days, settles: rec.settles, trail: rec.trail, peek: rec.peek })); } catch (e) {}
});
