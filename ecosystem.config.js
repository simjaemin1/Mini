// PM2 설정 — 운영 환경에서 자동 재시작, 로그 관리, 메모리 모니터링
// 사용:  pm2 start ecosystem.config.js
//        pm2 logs
//        pm2 monit
//        pm2 stop all
//        pm2 delete all

module.exports = {
  apps: [
    { name: 'durango-dispatcher',  script: 'server/dispatcher.js',  env: { PORT: 3000 } },
    { name: 'durango-zone-france', script: 'server/zone.js',         env: { ZONE_ID: 'france', PORT: 3004 } },
    { name: 'durango-zone-china',  script: 'server/zone.js',         env: { ZONE_ID: 'china',  PORT: 3001 } },
    { name: 'durango-zone-korea',  script: 'server/zone.js',         env: { ZONE_ID: 'korea',  PORT: 3002 } },
    { name: 'durango-zone-japan',  script: 'server/zone.js',         env: { ZONE_ID: 'japan',  PORT: 3003 } },
    { name: 'durango-zone-usa',    script: 'server/zone.js',         env: { ZONE_ID: 'usa',    PORT: 3005 } },
    { name: 'durango-marketplace', script: 'server/marketplace.js',  env: { PORT: 3010 } },
  ].map(a => ({
    ...a,
    node_args: a.script !== 'server/dispatcher.js' ? '--experimental-sqlite' : undefined,
    max_memory_restart: '500M',
    autorestart: true,
    log_date_format: 'YYYY-MM-DD HH:mm:ss',
    error_file: `./logs/${a.name}.err.log`,
    out_file:   `./logs/${a.name}.out.log`,
  })),
};
