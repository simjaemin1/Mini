# T1246 계측 원자료

before=87b63d2c 원본, after=최종 코드, control=최종 코드의 끔. 모두 같은 수동 설정 뒤 붙는 관측기로 3×800일. 각 시드 .json은 요약, .farm.json은 실제 밭 생활층, .observe.json은 일별 가격·출생·직업 집계다.

parity는 관측기 유무 120일 원본 JSON 완전 일치 증거다. off는 카드의 공식 400일 서버 기준선 1판이며 몸 전체 라이브 판이 아니다. source.json은 실행 시작 게임 소스 해시다. before-base-proof는 실행 후 원본 복사본과 git 바이트를 대조했다.

루트 observe.js.gz는 **폐기한 초기 관측기**다. 설정 전 require 문제로 9판을 중단했고 superseded/status와 interrupted metadata에 기록했다. 최종 관측기는 저장소 scripts/t1246-observe.js 및 t1246-metrics.js다. 초기 실행을 성공 증거에 포함하지 않았다.

run.py.gz는 정확한 실행 명령·환경을 남긴다. before 복사본 재현은 git87b63d2c의 server/sim/scripts와 node_modules/public 경로를 준비하고 T1246_ROOT로 지정한다. 켬·끔 각각 별도 프로세스다.

로그와 JSON은 원문 바이트를 gzip으로 보존했다. DB는 포함하지 않는다. SHA256SUMS는 압축 파일을 포함한 보관 바이트의 해시다. 보고서는 보고/T1246_2026-11-10.md.

분석-생성기.py.gz와 보고-템플릿.md.gz는 이번 합계·표·보고를 만든 원문이다. 원문에는 실행 당시 /workspace/Mini 및 /tmp/t1246 절대 경로가 기록되어 있다.
