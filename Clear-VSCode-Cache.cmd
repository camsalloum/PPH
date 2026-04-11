@echo off
title Clear VS Code Cache
echo ========================================
echo   VS Code Cache Cleaner
echo ========================================
echo.

REM Check if VS Code is running
tasklist /FI "IMAGENAME eq Code.exe" 2>nul | findstr /I "Code.exe" >nul 2>&1
if %errorlevel% equ 0 (
    echo [WARNING] VS Code is still running!
    echo Close VS Code first for a full cache clear.
    echo.
    choice /C YN /M "Continue anyway"
    if errorlevel 2 exit /b 0
    echo.
)

set "VSCODE_DIR=%APPDATA%\Code"
set "CLEANED=0"
set "BACKED_UP=0"
set "BACKUP_BASE=%~dp0backups\vscode-cache-backups"

echo Clearing VS Code caches...
echo.

REM 1. Main cache folders
for %%D in (Cache, CachedData, CachedExtensions, CachedExtensionVSIXs, "Code Cache") do (
    if exist "%VSCODE_DIR%\%%~D" (
        echo   [DEL] %%~D
        rmdir /S /Q "%VSCODE_DIR%\%%~D" >nul 2>&1
        set /a CLEANED+=1
    )
)

REM 2. GPU cache
if exist "%VSCODE_DIR%\GPUCache" (
    echo   [DEL] GPUCache
    rmdir /S /Q "%VSCODE_DIR%\GPUCache" >nul 2>&1
    set /a CLEANED+=1
)

REM 3. Service worker cache
if exist "%VSCODE_DIR%\Service Worker" (
    echo   [DEL] Service Worker
    rmdir /S /Q "%VSCODE_DIR%\Service Worker" >nul 2>&1
    set /a CLEANED+=1
)

REM 4. Workspace storage (can contain local chat/session history)
if exist "%VSCODE_DIR%\User\workspaceStorage" (
    echo   [INFO] Workspace Storage may include local chat/session history.
    choice /C YN /M "Delete Workspace Storage too"
    if errorlevel 2 (
        echo   [SKIP] Workspace Storage kept.
    ) else (
        call :backup_workspace_storage
        echo   [DEL] Workspace Storage
        rmdir /S /Q "%VSCODE_DIR%\User\workspaceStorage" >nul 2>&1
        set /a CLEANED+=1
    )
)

REM 5. Clear Vite dep cache for this project
if exist "%~dp0node_modules\.vite" (
    echo   [DEL] Vite dep cache (node_modules\.vite)
    rmdir /S /Q "%~dp0node_modules\.vite" >nul 2>&1
    set /a CLEANED+=1
)

echo.
if %CLEANED% gtr 0 (
    echo ========================================
    echo   Done! Cleared %CLEANED% cache folders.
    if %BACKED_UP% gtr 0 echo   Backed up Workspace Storage to: %BACKUP_BASE%
    echo   Restart VS Code now.
    echo ========================================
) else (
    echo   Nothing to clear - caches are already clean.
)

echo.
pause

goto :eof

:backup_workspace_storage
if not exist "%VSCODE_DIR%\User\workspaceStorage" exit /b 0

for /f %%I in ('powershell -NoProfile -Command "Get-Date -Format yyyyMMdd_HHmmss"') do set "TS=%%I"
if not defined TS set "TS=manual_%RANDOM%"

if not exist "%BACKUP_BASE%" mkdir "%BACKUP_BASE%" >nul 2>&1
set "WS_BACKUP=%BACKUP_BASE%\workspaceStorage_%TS%"

echo   [BKP] Workspace Storage ^> %WS_BACKUP%
robocopy "%VSCODE_DIR%\User\workspaceStorage" "%WS_BACKUP%" /E >nul
if errorlevel 8 (
    echo   [WARN] Backup may have failed. Check folder permissions.
) else (
    set /a BACKED_UP+=1
)
exit /b 0
