$ErrorActionPreference = "Stop"
$nodeCommand = Get-Command node -ErrorAction SilentlyContinue
$nodePath = if ($nodeCommand) {
  $nodeCommand.Source
} else {
  Join-Path $env:USERPROFILE ".cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe"
}

if (-not (Test-Path $nodePath)) {
  throw "Node.js를 찾을 수 없습니다. Node.js를 설치한 뒤 다시 실행해 주세요."
}

& $nodePath (Join-Path $PSScriptRoot "simulate.mjs") --mode 1v1v1 @args
exit $LASTEXITCODE
