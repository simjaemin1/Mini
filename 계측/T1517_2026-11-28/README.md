# T1517 전쟁 새 저장 계측

현재 유지 코드/feature flag는 T1517_WAR_SNAP=1만 쓴다. T1497 별칭은 없다.

`historical-precard/`는 정식 카드가 늦게 확인되기 전 실제로 실행한 원자료다. 그 안의 T1497_WAR_SNAP·t1497WarSnap·GPT2 경로·원래 commit/hash/실행문은 원문 그대로이며 T1517 실행으로 치환하거나 통과로 세지 않는다. 과거 원본 보고도 report-original.md로 동결했다. 원래 파일은 3d8944bc의 옛 경로에서 찾을 수 있다.

현재 요구 대조는 requirements.json, 정식 실행은 run-zone.py, 공식 보강 하네스는 scripts/test-war-snapshot-contract.js다. 새 1246일 장판은 실행하지 않는다.
