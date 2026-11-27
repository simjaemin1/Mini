# T1496 실제 검증 자료

검증 집계는 verification.json, 고정 제품/하네스 해시는 manifest.json, 초기 영향 목록과 최종21종 목록은 touched-plan*.json이다. gates/에는 최종21종·보충7종의 실제 로그/종료 코드가 있고 history-initial/에는 보완 전 빨강을 구분했다. 데이터는 서로 다른 판을 섞어 평균내지 않았다.

- off-baseline-result.json/off-baseline.txt: 최종 소스의 정본1020/400날 끔 바이트 동일.
- wood-off-base.json/wood-off-compare.txt: 나무 행위 켬·새 손잡이 끔의 옛 제품 대조30날. base-hook.cjs는 기준 커밋의 villages.js만 읽어 올린다. 다른 제품은 같은 트리다.
- body-on-plain.json/body-on-observed.*:3날 몸 세계. 실제 나무꾼 몸 표본0이라 벌목 증거로 쓰지 않았다.
- body-on-30-plain.json/body-on-30-observed.*: 같은 몸∞·24분·집켬 조건의30날 판. 관찰기 무변30/30과 실제 손 목재 증가를 확인했다.
- body30-status.json/world-status.json: 실제 명령·지정 손잡이·종료 코드·걸린 시간. 경과시간을 CPU 절감률로 해석하지 않는다.
- observe.cjs는 제품 반환값을 유지하고 별도 관측 객체만 센다. 생존/직업/이동 값을 바꾸지 않는다.
- ci-measure.txt와 scripts/ci-class.json의 행은 최종 새 하네스5회 실측이다. 원격 Actions 초록 주장은 없다.

재현은 Node22.23.0/ABI127에서 한다. world-checks.py/body30.py/final-default.py에 명령이 있다. 옛 소스는 `git show 2ce164b94:server/villages.js > /tmp/t1496-base-villages.js`로 준비하고 계측기의 경로를 현재 작업 트리에 맞춘다. TMP의 관찰기 파일은 이 폴더의 사본과 같다. 긴 판은 끝 표시 JSON을 보고 재실행 여부를 판단하며 완료된 판을 덮지 않는다.

제품은 server/villages.js 한 파일이며 새 저장 필드는 없다. 기근 직업 문 자체·어부 길·기본 켬 채택은 이번 결과로 판정하지 않는다.
