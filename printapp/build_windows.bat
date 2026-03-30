@echo off
REM Build EatEasy Printer Agent for Windows (Single .exe file)

echo ===========================================
echo    Building EatEasy Printer Agent for Windows
echo ===========================================

REM Create venv if not exists
if not exist ".venv" (
    echo Creating virtual environment...
    python -m venv .venv
)

REM Activate venv
call .venv\Scripts\activate.bat

REM Install dependencies
echo Installing dependencies...
pip install --upgrade pip
pip install customtkinter pillow requests python-dotenv pytz pyinstaller

REM Build with PyInstaller (--onefile = single .exe)
echo Building application...
pyinstaller --noconfirm --onefile --windowed ^
    --name "EatEasyPrinter" ^
    --hidden-import customtkinter ^
    --hidden-import PIL ^
    --collect-all customtkinter ^
    app.py

echo.
echo ===========================================
echo    Build complete!
echo    App location: dist\EatEasyPrinter.exe
echo ===========================================
echo.
echo You can copy EatEasyPrinter.exe anywhere and run it!

pause
