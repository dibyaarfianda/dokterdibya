@echo off
setlocal
cd /d %~dp0

set "APP_NAME=Generator Jadwal Jaga RSIA MELINDA"
set "ENTRY_FILE=tools\scheduler_offline_app\app.py"

if exist .venv\Scripts\python.exe (
  set "PY_CMD=.venv\Scripts\python.exe"
) else (
  set "PY_CMD=python"
)

echo [1/4] Installing PyInstaller...
%PY_CMD% -m pip install --upgrade pyinstaller
if errorlevel 1 (
  echo Failed to install PyInstaller.
  exit /b 1
)

echo [2/4] Cleaning old build artifacts...
if exist build rmdir /s /q build
if exist dist rmdir /s /q dist
if exist "%APP_NAME%.spec" del /f /q "%APP_NAME%.spec"

echo [3/4] Building EXE...
%PY_CMD% -m PyInstaller --noconfirm --clean --onefile --windowed --name "%APP_NAME%" --collect-all openpyxl --add-data "tools\scheduler_offline_app\assets\jadwaljaga.png;tools\scheduler_offline_app\assets" "%ENTRY_FILE%"
if errorlevel 1 (
  echo EXE build failed.
  exit /b 1
)

echo [4/4] Done.
echo EXE location: %cd%\dist\%APP_NAME%.exe
pause
endlocal
