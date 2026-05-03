@echo off
setlocal
cd /d %~dp0

set "EXE_PATH=dist\Generator Jadwal Jaga RSIA MELINDA.exe"

if exist "%EXE_PATH%" (
  start "" "%EXE_PATH%"
) else if exist .venv\Scripts\python.exe (
  .venv\Scripts\python.exe tools\scheduler_offline_app\app.py
) else (
  echo Python venv not found at .venv\Scripts\python.exe
  echo Running with system python...
  python tools\scheduler_offline_app\app.py
)

endlocal
