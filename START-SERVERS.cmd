@echo off
title IPDashboard Servers
cd /d "%~dp0"

REM Ensure Node.js is available
where node >nul 2>&1 || (echo ERROR: node not found on PATH & pause & exit /b 1)

echo ========================================
echo Starting IPDashboard Servers...
echo ========================================
echo.

REM Kill existing servers using multiple methods for reliability
echo Killing existing servers on ports 3000 and 3001...

REM Method 1: Kill by port (most targeted)
for /f "tokens=5" %%a in ('netstat -ano ^| findstr :3001 ^| findstr LISTENING 2^>nul') do (
    echo Killing process on port 3001 PID %%a
    taskkill /F /PID %%a /T >nul 2>&1
)
for /f "tokens=5" %%a in ('netstat -ano ^| findstr :3000 ^| findstr LISTENING 2^>nul') do (
    echo Killing process on port 3000 PID %%a
    taskkill /F /PID %%a /T >nul 2>&1
)

REM Wait a bit for ports to be released
timeout /t 2 /nobreak >nul

REM Method 2: Re-check ports and kill remaining PIDs (avoids killing unrelated node processes)
for /f "tokens=5" %%a in ('netstat -ano ^| findstr :3001 ^| findstr LISTENING 2^>nul') do (
    echo [Retry] Killing leftover PID %%a on port 3001
    taskkill /F /PID %%a /T >nul 2>&1
)
for /f "tokens=5" %%a in ('netstat -ano ^| findstr :3000 ^| findstr LISTENING 2^>nul') do (
    echo [Retry] Killing leftover PID %%a on port 3000
    taskkill /F /PID %%a /T >nul 2>&1
)

REM Wait for ports to fully release
timeout /t 2 /nobreak >nul

REM Verify ports are free
netstat -ano | findstr ":3001.*LISTENING" >nul 2>&1
if %errorlevel% equ 0 (
    echo [WARNING] Port 3001 still in use! Waiting 5 more seconds...
    timeout /t 5 /nobreak >nul
)
netstat -ano | findstr ":3000.*LISTENING" >nul 2>&1
if %errorlevel% equ 0 (
    echo [WARNING] Port 3000 still in use! Waiting 5 more seconds...
    timeout /t 5 /nobreak >nul
)

echo Servers killed (if any were running)
echo.

REM Drop stale PostgreSQL connections from previous runs
echo Dropping stale PostgreSQL connections...
where psql >nul 2>&1
if %errorlevel% equ 0 (
    set PGPASSWORD=Pph654883!
    psql -U postgres -d postgres -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname IN ('fp_database','ip_auth_database','propackhub_platform') AND pid <> pg_backend_pid() AND state = 'idle';" >nul 2>&1
    if %errorlevel% equ 0 (
        echo [OK] Stale DB connections dropped
    ) else (
        echo [INFO] Could not drop DB connections via psql - will proceed anyway
    )
    set PGPASSWORD=
) else (
    REM Fallback: use a script file instead of inline node -e (CMD quote escaping issues)
    node -e "const{Client}=require('./server/node_modules/pg');(async()=>{const c=new Client({host:'localhost',port:5432,user:'postgres',password:'Pph654883!',database:'postgres',connectionTimeoutMillis:5000});try{await c.connect();await c.query('SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE pid <> pg_backend_pid() AND state=$$idle$$');console.log('[OK] Stale DB connections dropped');await c.end()}catch(e){console.log('[INFO] Could not drop DB connections:',e.message)}})()" 2>nul
)
timeout /t 2 /nobreak >nul

REM Check if server directory exists
if not exist "server" (
    echo ERROR: Server directory not found!
    pause
    exit /b 1
)

REM Check if node_modules exists in server directory
if not exist "server\node_modules" (
    echo WARNING: node_modules not found in server directory!
    echo Please run: cd server ^&^& npm install
    echo.
)

REM Check if node_modules exists in root directory (for frontend)
if not exist "node_modules" (
    echo WARNING: node_modules not found in root directory!
    echo Please run: npm install
    echo.
)

REM Start backend
echo Starting Backend Server on port 3001...
set "LOG_DIR=%~dp0logs"
if not exist "%LOG_DIR%" mkdir "%LOG_DIR%" >nul 2>&1
set "BACKEND_LOG=%LOG_DIR%\backend-3001.log"

start "Backend 3001" powershell -NoExit -ExecutionPolicy Bypass -Command "cd -LiteralPath '%~dp0server'; '' | Out-File -FilePath '%BACKEND_LOG%' -Encoding utf8; ('[' + (Get-Date).ToString('yyyy-MM-dd HH:mm:ss') + '] Backend starting (port 3001)') | Out-File -FilePath '%BACKEND_LOG%' -Append -Encoding utf8; if (-not $env:STARTUP_PROFILE) { $env:STARTUP_PROFILE = '0' }; npm run dev 2>&1 | Tee-Object -FilePath '%BACKEND_LOG%' -Append"

echo Waiting for backend (port 3001) before starting frontend (max 120s)...
set /a _BACKEND_WAIT=0
:WAIT_BACKEND_ONLY
netstat -ano | findstr ":3001.*LISTENING" >nul 2>&1
if %errorlevel% equ 0 goto BACKEND_READY
set /a _BACKEND_WAIT+=1
if %_BACKEND_WAIT% geq 120 goto BACKEND_WAIT_TIMEOUT
timeout /t 1 /nobreak >nul
goto WAIT_BACKEND_ONLY

:BACKEND_WAIT_TIMEOUT
echo [WARNING] Backend not listening after %_BACKEND_WAIT%s. Starting frontend anyway...
goto START_FRONTEND

:BACKEND_READY
echo [OK] Backend is listening after %_BACKEND_WAIT%s.

:START_FRONTEND

REM Start frontend
echo Starting Frontend Server on port 3000...
set "FRONTEND_LOG=%LOG_DIR%\frontend-3000.log"
start "Frontend 3000" powershell -NoExit -ExecutionPolicy Bypass -Command "cd -LiteralPath '%~dp0'; '' | Out-File -FilePath '%FRONTEND_LOG%' -Encoding utf8; ('[' + (Get-Date).ToString('yyyy-MM-dd HH:mm:ss') + '] Frontend starting on port 3000') | Out-File -FilePath '%FRONTEND_LOG%' -Append -Encoding utf8; npm run dev 2>&1 | Tee-Object -FilePath '%FRONTEND_LOG%' -Append"
timeout /t 5 /nobreak >nul

echo.
echo ========================================
echo Servers are starting...
echo ========================================
echo.
echo Backend window title: "Backend 3001"
echo Frontend window title: "Frontend 3000"
echo.
echo Check your taskbar for the server windows.
echo They may be minimized - look for "Backend 3001" and "Frontend 3000"
echo.
echo Waiting for ports 3001 and 3000 to be ready (max 60s)...
set /a _WAIT_S=0
:WAIT_FOR_PORTS
set "_B_OK="
set "_F_OK="
netstat -ano | findstr ":3001.*LISTENING" >nul 2>&1 && set "_B_OK=1"
netstat -ano | findstr ":3000.*LISTENING" >nul 2>&1 && set "_F_OK=1"

if defined _B_OK if defined _F_OK goto PORTS_READY

set /a _WAIT_S+=1
if %_WAIT_S% geq 60 goto PORTS_TIMEOUT
timeout /t 1 /nobreak >nul
goto WAIT_FOR_PORTS

:PORTS_TIMEOUT
echo [WARNING] Timed out waiting for ports after %_WAIT_S%s.
echo Check the "Backend 3001" and "Frontend 3000" windows for errors.
goto AFTER_PORT_WAIT

:PORTS_READY
echo [OK] Both ports are listening after %_WAIT_S%s.

:AFTER_PORT_WAIT

REM Check if backend is listening
netstat -ano | findstr :3001 | findstr LISTENING >nul 2>&1
if %errorlevel% equ 0 (
    echo [OK] Backend is running on port 3001
) else (
    echo [WARNING] Backend may not have started yet. Check the "Backend 3001" window for errors.
)

REM Check if frontend is listening
netstat -ano | findstr :3000 | findstr LISTENING >nul 2>&1
if %errorlevel% equ 0 (
    echo [OK] Frontend is running on port 3000
) else (
    echo [WARNING] Frontend may not have started yet. Check the "Frontend 3000" window for errors.
)

echo.
echo ========================================
echo Done! Check the server windows for status.
echo ========================================
echo.
exit /b 0
