'use strict';
// T1376 분석 껍데기 — `t1292-xzone-live.js analyze` 는 파일 머리에서 고정 포트(3010 · 3020 · 3021)를 쥐려 기다린다(판을 안 띄우는 analyze 도).
// 다른 판이 포트를 쥔 동안 analyze 만 돌리려고 그 한 줄만 빈 문으로 바꿔 싣는다(하네스 도구 글자 · 제품 무관 · 분석 셈 무변).
const Module = require('module'); const _c = Module.prototype._compile;
Module.prototype._compile = function (content, filename) {
  if (filename.endsWith('t1292-xzone-live.js')) { const a = "require('./lib-port').hold(3010, 3020, 3021);"; if (content.split(a).length !== 2) throw new Error('nohold: 글자 없음'); content = content.replace(a, ';'); }
  return _c.call(this, content, filename);
};
