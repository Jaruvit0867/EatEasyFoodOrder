@echo off
setlocal

echo 🔧 Setting up EatEasy Food Order System...

:: Check for Python
python --version >nul 2>&1
if %errorlevel% neq 0 (
    echo ❌ Python could not be found. Please install Python.
    pause
    exit /b 1
)

:: Check for Node
call npm --version >nul 2>&1
if %errorlevel% neq 0 (
    echo ❌ Node.js/npm could not be found. Please install Node.js.
    pause
    exit /b 1
)

:: 1. Backend Setup
echo.
echo 📦 Installing Backend Dependencies...
cd backend
python -m venv venv
call venv\Scripts\activate.bat
pip install -r requirements.txt
if %errorlevel% neq 0 (
    echo ❌ Backend install failed.
    pause
    exit /b 1
) else (
    echo ✅ Backend installed successfully.
)
cd ..

:: 2. Frontend Setup
echo.
echo 🎨 Installing Frontend Dependencies...
cd frontend
call npm install
if %errorlevel% neq 0 (
    echo ❌ Frontend install failed.
    pause
    exit /b 1
) else (
    echo ✅ Frontend installed successfully.
)

:: 3. Security Certs
echo.
echo 🔒 Generating SSL Certificates (for Mobile Mic)...
if not exist "certificates" mkdir certificates
if not exist "certificates\key.pem" (
    openssl version >nul 2>&1
    if %errorlevel% equ 0 (
        openssl req -x509 -newkey rsa:2048 -keyout certificates\key.pem -out certificates\cert.pem -days 365 -nodes -subj "/CN=EatEasyLocal"
        echo ✅ Certificates generated.
    ) else (
        echo ⚠️  OpenSSL not found. Custom certificates could not be generated.
        echo    Next.js might generate its own, or you might need to install OpenSSL.
        echo    (Git Bash comes with OpenSSL).
    )
) else (
    echo ℹ️  Certificates already exist.
)
cd ..

echo.
echo ✨ Setup Complete!
echo 👉 Double-click 'easy_run.bat' to start the system.
pause
