@echo off
setlocal
chcp 65001 >nul

echo ==========================================
echo      Setting up EatEasy System
echo ==========================================

:: Check for Python
where python >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] Python not found or not in PATH.
    echo Opening Python download page...
    start https://www.python.org/downloads/
    echo [IMPORTANT] Please install Python and make sure to check "Add Python to PATH".
    echo After installation, restart this script.
    pause
    exit /b 1
)

:: Check for Node
call npm --version >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] Node.js/npm not found.
    echo Opening Node.js download page...
    start https://nodejs.org/en/download/
    echo [IMPORTANT] Please install Node.js (LTS^).
    echo After installation, restart this script.
    pause
    exit /b 1
)

:: 1. Backend Setup
echo.
echo [STEP 1] Installing Backend Dependencies...
cd backend
python -m venv venv
call venv\Scripts\activate.bat
pip install -r requirements.txt
if %errorlevel% neq 0 (
    echo [ERROR] Backend install failed.
    pause
    exit /b 1
) else (
    echo [OK] Backend installed.
)
cd ..

:: 2. Frontend Setup
echo.
echo [STEP 2] Installing Frontend Dependencies...
cd frontend
call npm install
if %errorlevel% neq 0 (
    echo [ERROR] Frontend install failed.
    pause
    exit /b 1
) else (
    echo [OK] Frontend installed.
)
cd ..

:: 3. Security Certs (at project root level)
echo.
echo [STEP 3] SSL Certificates (for Mobile Mic)...
if not exist "certificates" mkdir certificates
if not exist "certificates\key.pem" (
    echo [INFO] Generating certificates using Python...
    python generate_certs.py
    if exist "certificates\key.pem" (
        echo [OK] Certificates generated.
    ) else (
        echo [ERROR] Certificate generation failed.
    )
) else (
    echo [INFO] Certificates already exist.
)

echo.
echo ==========================================
echo [SUCCESS] Setup Complete!
echo Double-click 'easy_run.bat' to start.
echo ==========================================
pause
