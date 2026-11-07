'use strict';
// 파일 URL이 차단된 환경의 랩 하네스용 HTTP. 제품 서버와 별도다.
// node scripts/fixture-lab-http.js (LAB_HTTP_PORT 기본 8088)
const express = require('express');
const path = require('path');
const app = express();
app.get('/favicon.ico', (_req, res) => res.status(204).end());
app.use(express.static(path.resolve(__dirname, '..')));
const server = app.listen(Number(process.env.LAB_HTTP_PORT || 8088), '127.0.0.1', () => console.log('lab HTTP ready'));
process.on('SIGTERM', () => server.close());
process.on('SIGINT', () => server.close());
