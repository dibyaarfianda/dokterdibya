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

echo [1/9] Installing build dependencies...
%PY_CMD% -m pip install --upgrade pyinstaller pillow
if errorlevel 1 (
  echo Failed to install build dependencies.
  exit /b 1
)

echo [2/9] Generating multi-size logo icons...
%PY_CMD% tools\scheduler_offline_app\generate_logo_icons.py
if errorlevel 1 (
  echo Failed to generate logo icons.
  exit /b 1
)

echo [3/9] Cleaning old build artifacts...
if exist build rmdir /s /q build
if exist dist rmdir /s /q dist
if exist "%APP_NAME%.spec" del /f /q "%APP_NAME%.spec"

echo [4/9] Building EXE...
%PY_CMD% -m PyInstaller --noconfirm --clean --onefile --windowed --name "%APP_NAME%" --icon "tools\scheduler_offline_app\assets\icons\jadwaljaga.ico" --collect-all openpyxl --add-data "tools\scheduler_offline_app\assets\jadwaljaga.png;tools\scheduler_offline_app\assets" --add-data "tools\scheduler_offline_app\assets\icons;tools\scheduler_offline_app\assets\icons" "%ENTRY_FILE%"
if errorlevel 1 (
  echo EXE build failed.
  exit /b 1
)

echo [5/9] Cleaning Desktop Scheduler root...
if not exist "%DEPLOY_DIR%" mkdir "%DEPLOY_DIR%"

for /f "delims=" %%I in ('dir /b /a "%DEPLOY_DIR%" 2^>nul') do (
  if /i not "%%~nxI"=="%APP_NAME%.exe" if /i not "%%~nxI"=="README.md" (
    if exist "%DEPLOY_DIR%\%%~nxI\" (
      rmdir /s /q "%DEPLOY_DIR%\%%~nxI"
    ) else (
      del /f /q "%DEPLOY_DIR%\%%~nxI"
    )
  )
)

echo [6/9] Syncing EXE and README to Desktop Scheduler...

taskkill /f /im "%APP_NAME%.exe" >nul 2>nul
timeout /t 1 /nobreak >nul

copy /y "dist\%APP_NAME%.exe" "%DEPLOY_DIR%\%APP_NAME%.exe" >nul
if errorlevel 1 (
  echo Failed to copy EXE to "%DEPLOY_DIR%". Close the app if it is still running.
  exit /b 1
)

copy /y "tools\scheduler_offline_app\README.md" "%DEPLOY_DIR%\README.md" >nul
if errorlevel 1 (
  echo Failed to copy README to "%DEPLOY_DIR%".
  exit /b 1
)

echo [7/9] Rebuilding Explorer icon cache files...
taskkill /f /im explorer.exe >nul 2>nul
del /f /q "%LOCALAPPDATA%\IconCache.db" >nul 2>nul
del /f /q "%LOCALAPPDATA%\Microsoft\Windows\Explorer\iconcache*" >nul 2>nul
del /f /q "%LOCALAPPDATA%\Microsoft\Windows\Explorer\thumbcache*" >nul 2>nul
start "" explorer.exe >nul 2>nul

echo [8/9] Refreshing Windows icon cache...
where ie4uinit.exe >nul 2>nul
if errorlevel 1 (
  echo Skipped icon cache refresh: ie4uinit.exe not found.
) else (
  ie4uinit.exe -ClearIconCache >nul 2>nul
  ie4uinit.exe -show >nul 2>nul
)

echo [9/9] Done.
echo EXE location: %cd%\dist\%APP_NAME%.exe
echo Scheduler folder: %DEPLOY_DIR%
echo Build completed successfully.
endlocal & exit /b 0
