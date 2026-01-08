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

:: Create virtual environment if not exists
if not exist ".venv" (
    echo Creating virtual environment...
    python -m venv .venv
)

:: Activate venv
call .venv\Scripts\activate.bat

:: Install dependencies
echo Installing libraries...
pip install requests pillow python-dotenv pytz

:: Run Agent
echo.
echo ✅ Setup complete. Starting Agent...
echo.
python printer_agent.py
pause
