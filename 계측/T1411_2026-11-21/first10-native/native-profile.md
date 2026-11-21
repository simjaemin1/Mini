# Native V8 profile

Weights = elapsed sample intervals; inclusive categories overlap. OS CPU is recorded separately by day.

| function | source:line | self sample sec | inclusive sample sec |
|---|---|---:|---:|
| (anonymous) | server/zone.js:17709 | 47.436 | 410.061 |
| _wwPre | server/zone.js:17327 | 32.391 | 50.685 |
| _searchStep | sim/path-core.js:351 | 30.920 | 81.477 |
| pop | sim/path-core.js:72 | 18.804 | 18.804 |
| _flushStepLazy | server/roads.js:446 | 16.165 | 26.389 |
| pump | scripts/t745-vclock.js:100 | 15.526 | 434.824 |
| sepNpcs | server/zone.js:5142 | 14.347 | 14.373 |
| rebuildSpatialIndex | server/zone.js:1426 | 13.547 | 22.423 |
| (garbage collector) | :0 | 13.052 | 13.052 |
| PathCore.routePathBegin.plain.costMul | server/villages.js:4567 | 12.967 | 15.412 |
| _sweepOne | server/zone.js:18550 | 11.201 | 18.893 |
| _wwPreOne | server/zone.js:17314 | 10.668 | 11.643 |
| _distMatrixGen | server/villages.js:4262 | 9.897 | 26.517 |
| _moveOne | server/zone.js:18101 | 9.360 | 27.119 |
| upsertRoadCell | server/zone-local-db.js:592 | 9.217 | 9.217 |
| _t1322Skip | server/zone.js:5826 | 9.177 | 29.733 |
| _rebuildSpatialInc | server/zone.js:1372 | 8.822 | 8.843 |
| _t598EdgeOk | server/villages.js:4051 | 8.114 | 23.606 |
| _decOne | server/zone.js:17828 | 8.043 | 111.045 |
| _isPointInRiver | server/terrain.js:305 | 7.959 | 8.849 |
| npcLifeTick | server/villages.js:19166 | 7.262 | 47.382 |
| isWaterCellLocal | server/terrain.js:353 | 6.966 | 14.676 |
| stampCell | server/roads.js:98 | 6.526 | 14.241 |
| _t1348Walk | server/zone.js:5587 | 6.344 | 6.352 |
| PathCore.routePathBegin.plain.stepBlocked | server/villages.js:4564 | 5.883 | 12.581 |
| npcStep | server/zone.js:5861 | 5.856 | 69.193 |
| _t1182Walk | server/villages.js:6255 | 5.831 | 7.258 |
| _t731Order | server/villages.js:11483 | 5.374 | 7.410 |
| tickCaravanBodies | server/villages.js:6306 | 5.080 | 14.042 |
| isTerrainBlockedLocal | server/zone.js:2357 | 4.891 | 20.154 |
