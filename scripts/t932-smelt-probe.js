// === scripts/t932-smelt-probe.js — T932 관찰기(읽기만 · 판에 0): 대장장이가 하루를 다 제련에 쓴 날을 판 끝에 적는다 ===
//
// econ 정본의 계측 칸 `t932Stat`(sim/economy-sim.js — 모듈 칸 · 마을 객체 무접촉 · 행동 무관)을 그대로 옮겨 적는다(셈은 econ 이 한다 · 사본 0).
//   랩:   T932_OUT=<파일> NODE_OPTIONS="-r $PWD/scripts/t932-smelt-probe.js" node scripts/t17-metrics.js 800 1020
//   서버: t577-server-run 판(T577_SEED · T577_OUT 이 선 존 프로세스) — `<T577_OUT 에서 .json 뗀 것>.t932.json`
//   끔(`T932_SMELT_CONT=0` — 종전 `return`)이면 days = 마을 하루가 거기서 끝난 날 · idle = 그날 일을 못 한 뒤 차례 주민 · pop = 그날 꼬리(먹기 · 나이 …)를 못 탄 사람.
//   켬이면 같은 칸이 "그 대장장이만 하루를 끝낸 날"을 센다(뒤 차례 · 꼬리는 돈다).
'use strict';
const path = require('path');
const fs = require('fs');
const A1 = process.argv[1] || '';
const SERVER = !!process.env.T577_SEED && /server[\/\\]zone\.js$/.test(A1);
const LAB = !SERVER && !!process.env.T932_OUT && /scripts[\/\\](t17-metrics|t176-ab)\.js$/.test(A1);
if (SERVER || LAB) {
  const OUT = SERVER ? (process.env.T577_OUT ? process.env.T577_OUT.replace(/\.json$/, '') + '.t932.json' : '') : process.env.T932_OUT;
  if (OUT) {
    const V1 = require(path.join(__dirname, '..', 'sim', 'economy-sim'));
    process.on('exit', () => {
      try {
        const S = V1.t932Stat || null;
        fs.mkdirSync(path.dirname(OUT), { recursive: true });
        fs.writeFileSync(OUT, JSON.stringify({ where: SERVER ? 'server' : path.basename(A1), seed: process.env.T577_SEED || process.argv[3] || null,
          knob: { T932_SMELT_CONT: process.env.T932_SMELT_CONT == null ? null : process.env.T932_SMELT_CONT }, on: V1.T932_SMELT_CONT, stat: S }));
      } catch (e) { /* 관측 실패는 판을 안 건드린다 */ }
    });
  }
}
