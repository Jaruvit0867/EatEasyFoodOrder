@echo off
setlocal enabledelayedexpansion

echo [INFO] Starting EatEasy System...

:: Initialize IP variable
set IPV4=localhost

:: Try to get the first non-local IPv4 address
for /f "tokens=2 delims=:" %%a in ('ipconfig ^| findstr "IPv4"') do (
    set "IP_TEMP=%%a"
    REM Remove leading spaces
    for /f "tokens=* delims= " %%b in ("!IP_TEMP!") do set "IP_TEMP=%%b"
    REM Simple check to avoid empty or 127.0.0.1 if possible (though findstr IPv4 usually skips localhost loopback in standard output unless connected)
    set IPV4=!IP_TEMP!
    goto :FoundIP
)

:FoundIP

:: 1. Start Backend in a new window
echo [INFO] Starting Backend (Port 8000)...
start "EatEasy Backend" cmd /k "cd backend && call venv\Scripts\activate.bat && uvicorn main:app --host 0.0.0.0 --port 8000"

:: 2. Start Frontend in a new window
echo [INFO] Starting Frontend (Port 3000)...
start "EatEasy Frontend" cmd /k "cd frontend && npm run dev:https"

:: Wait a moment for startup
timeout /t 3 /nobreak >nul

echo.
echo [OK] System is RUNNING in separate windows!
echo ---------------------------------------------------
echo    Tablet/Mobile Access:  https://%IPV4%:3000
echo    PC/Local Access:       https://localhost:3000
echo ---------------------------------------------------
echo [INFO] On Mobile: If you see 'Security Warning', click Advanced -> Proceed
echo [INFO] Close the opened windows to stop the servers.
pause
