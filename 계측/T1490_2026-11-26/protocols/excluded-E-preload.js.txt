'use strict';
// 러너 밖 읽기 귀. 기존 S14 귀 그대로 + 걷는 봇의 출발 방향만 0으로 고정(서버 시각 무접촉).
if (/t1485-walkbot\.js$/.test(String(process.argv[1] || ''))) Date.prototype.getSeconds = () => 0;
require('./t1485-observer');
