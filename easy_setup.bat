@echo off
setlocal

echo [INFO] Setting up EatEasy Food Order System...

:: Check for Python
python --version >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] Python could not be found.
    echo [INFO] Opening Python download page...
    start https://www.python.org/downloads/
    echo [ACTION] Please install Python, ensuring you check "Add Python to PATH" during installation.
    echo          Then restart this script.
    pause
    exit /b 1
)

:: Check for Node
call npm --version >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] Node.js/npm could not be found.
    echo [INFO] Opening Node.js download page...
    start https://nodejs.org/en/download/
    echo [ACTION] Please install Node.js (LTS version recommended).
    echo          Then restart this script.
    pause
    exit /b 1
)

:: 1. Backend Setup
echo.
echo [INFO] Installing Backend Dependencies...
cd backend
python -m venv venv
call venv\Scripts\activate.bat
pip install -r requirements.txt
if %errorlevel% neq 0 (
    echo [ERROR] Backend install failed.
    pause
    exit /b 1
) else (
    echo [OK] Backend installed successfully.
)
cd ..

:: 2. Frontend Setup
echo.
echo [INFO] Installing Frontend Dependencies...
cd frontend
call npm install
if %errorlevel% neq 0 (
    echo [ERROR] Frontend install failed.
    pause
    exit /b 1
) else (
    echo [OK] Frontend installed successfully.
)

:: 3. Security Certs
echo.
echo [INFO] Generating SSL Certificates (for Mobile Mic)...
if not exist "certificates" mkdir certificates
if not exist "certificates\key.pem" (
    openssl version >nul 2>&1
    if %errorlevel% equ 0 (
        openssl req -x509 -newkey rsa:2048 -keyout certificates\key.pem -out certificates\cert.pem -days 365 -nodes -subj "/CN=EatEasyLocal"
        echo [OK] Certificates generated.
    ) else (
        echo [WARN] OpenSSL not found. Custom certificates could not be generated.
        echo        Next.js might generate its own, or you might need to install OpenSSL.
        echo        (Git Bash comes with OpenSSL).
    )
) else (
    echo [INFO] Certificates already exist.
)
cd ..

echo.
echo [SUCCESS] Setup Complete!
echo [ACTION] Double-click 'easy_run.bat' to start the system.
pause
