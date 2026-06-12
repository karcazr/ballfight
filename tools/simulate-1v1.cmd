@echo off
setlocal
set "NODE_EXE=node"
where node >nul 2>nul
if errorlevel 1 set "NODE_EXE=%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe"
if not exist "%NODE_EXE%" if "%NODE_EXE%"=="node" goto run
if not exist "%NODE_EXE%" (
  echo Node.js could not be found. Install Node.js and try again.
  exit /b 1
)
:run
"%NODE_EXE%" "%~dp0simulate.mjs" --mode 1v1 %*
exit /b %ERRORLEVEL%
