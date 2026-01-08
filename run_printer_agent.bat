@echo off
echo ===========================================
echo 🖨️  Setting up EatEasy Printer Agent...
echo ===========================================

:: Check Python
python --version >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] Python is not installed!
    echo Please install Python from https://www.python.org/downloads/
    pause
    exit /b
)

:: Install dependencies
echo Installing libraries...
pip install requests pillow python-dotenv pytz

:: Run Agent
echo.
echo ✅ Setup complete. Starting Agent...
echo.
python printer_agent.py
pause
