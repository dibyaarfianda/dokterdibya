@echo off
setlocal
cd /d %~dp0

set "EXE_PATH_ROOT=Generator Jadwal Jaga RSIA MELINDA.exe"
set "EXE_PATH_DIST=dist\Generator Jadwal Jaga RSIA MELINDA.exe"

if exist "%EXE_PATH_ROOT%" (
  start "" "%EXE_PATH_ROOT%"
) else if exist "%EXE_PATH_DIST%" (
  start "" "%EXE_PATH_DIST%"
) else if exist .venv\Scripts\python.exe (
  .venv\Scripts\python.exe tools\scheduler_offline_app\app.py
) else (
  echo Python venv not found at .venv\Scripts\python.exe
  echo Running with system python...
  python tools\scheduler_offline_app\app.py
)

endlocal
