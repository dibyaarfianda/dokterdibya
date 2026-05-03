@echo off
setlocal
cd /d %~dp0

set "APP_NAME=Generator Jadwal Jaga RSIA MELINDA"
set "ENTRY_FILE=tools\scheduler_offline_app\app.py"
set "DEPLOY_DIR=%USERPROFILE%\Desktop\Scheduler"

if exist .venv\Scripts\python.exe (
  set "PY_CMD=.venv\Scripts\python.exe"
) else (
  set "PY_CMD=python"
)

echo [1/5] Installing build dependencies...
%PY_CMD% -m pip install --upgrade pyinstaller pillow
if errorlevel 1 (
  echo Failed to install build dependencies.
  exit /b 1
)

echo [2/5] Generating multi-size logo icons...
%PY_CMD% tools\scheduler_offline_app\generate_logo_icons.py
if errorlevel 1 (
  echo Failed to generate logo icons.
  exit /b 1
)

echo [3/5] Cleaning old build artifacts...
if exist build rmdir /s /q build
if exist dist rmdir /s /q dist
if exist "%APP_NAME%.spec" del /f /q "%APP_NAME%.spec"

echo [4/6] Building EXE...
%PY_CMD% -m PyInstaller --noconfirm --clean --onefile --windowed --name "%APP_NAME%" --icon "tools\scheduler_offline_app\assets\icons\jadwaljaga.ico" --collect-all openpyxl --add-data "tools\scheduler_offline_app\assets\jadwaljaga.png;tools\scheduler_offline_app\assets" --add-data "tools\scheduler_offline_app\assets\icons;tools\scheduler_offline_app\assets\icons" "%ENTRY_FILE%"
if errorlevel 1 (
  echo EXE build failed.
  exit /b 1
)

echo [5/6] Syncing EXE and icons to Desktop Scheduler...
if not exist "%DEPLOY_DIR%" mkdir "%DEPLOY_DIR%"
if not exist "%DEPLOY_DIR%\icons" mkdir "%DEPLOY_DIR%\icons"

copy /y "dist\%APP_NAME%.exe" "%DEPLOY_DIR%\%APP_NAME%.exe" >nul
copy /y "tools\scheduler_offline_app\assets\jadwaljaga.png" "%DEPLOY_DIR%\jadwaljaga.png" >nul
xcopy /e /i /y "tools\scheduler_offline_app\assets\icons" "%DEPLOY_DIR%\icons\" >nul

echo [6/6] Done.
echo EXE location: %cd%\dist\%APP_NAME%.exe
echo Scheduler folder: %DEPLOY_DIR%
echo Build completed successfully.
endlocal & exit /b 0
