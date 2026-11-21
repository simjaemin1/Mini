# 실행 중 고정한 계측기 사본

`candidate-manifest.json`의 `previousMethods` = v1(최초 원본), `methods` = v2(여섯 730날 팔), `diagnosticMethods` = v3(시간대 진단)와 각각 SHA-256을 대조한 사본이다. 최신 `scripts/`의 오프라인 판독기와 이 실행 사본을 혼동하지 않는다. 재현 시 해당 버전의 네 파일을 같은 폴더에 두고 `t1411-run.py --tree <고정 런타임> ...`를 부른다. 원본과 후보의 런타임 재구성은 상위 `RECOVERY.md`를 따른다. 이 사본은 계측 원자료이며 실행 중 수정하지 않았다.
