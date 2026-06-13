# Ballfight balance statistics

The simulator automatically uses all but one logical CPU core. Use `--workers 2` to reduce CPU load or `--workers 1` for the lightest execution. Visual-only particles, decorative shockwaves, and projectile trails are skipped during statistics runs without changing combat results.

개발자용 전투 통계는 모드별 TXT 파일에 저장됩니다. 사이트에서는 이 파일을 사용하지 않습니다.

```powershell
.\tools\simulate-1v1.cmd
.\tools\simulate-1v1v1.cmd
```

기본값은 조합당 1,000경기, 워커 2개, 초당 30틱, 경기 제한 300초입니다.

```powershell
.\tools\simulate-1v1.cmd --runs 100 --workers 1
.\tools\simulate-1v1v1.cmd --runs 5000 --workers 2 --max-seconds 360
```

1v1 명령은 `latest-1v1.txt`, 1v1v1 명령은 `latest-1v1v1.txt`만 덮어씁니다. 따라서 한 모드를 다시 실행해도 다른 모드의 최신 결과는 유지됩니다. 별도의 CSV, JSON, 시간별 결과 파일은 생성하지 않습니다.
