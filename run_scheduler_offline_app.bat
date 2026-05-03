@echo off
setlocal
cd /d %~dp0

if exist .venv\Scripts\python.exe (
  .venv\Scripts\python.exe tools\scheduler_offline_app\app.py
) else (
  echo Python venv not found at .venv\Scripts\python.exe
  echo Running with system python...
  python tools\scheduler_offline_app\app.py
)

endlocal
