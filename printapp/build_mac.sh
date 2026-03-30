#!/bin/bash
# Build EatEasy Printer Agent for macOS (Single .app bundle)

echo "==========================================="
echo "🖨️  Building EatEasy Printer Agent for macOS"
echo "==========================================="

# Create/activate venv
if [ ! -d ".venv" ]; then
    echo "Creating virtual environment..."
    python3 -m venv .venv
fi

source .venv/bin/activate

# Install dependencies
echo "Installing dependencies..."
pip install --upgrade pip
pip install customtkinter pillow requests python-dotenv pytz pyinstaller

# Build with PyInstaller (--onefile for compact bundle)
echo "Building application..."
pyinstaller --noconfirm --onefile --windowed \
    --name "EatEasyPrinter" \
    --hidden-import customtkinter \
    --hidden-import PIL \
    --collect-all customtkinter \
    app.py

echo ""
echo "==========================================="
echo "✅ Build complete!"
echo "App location: dist/EatEasyPrinter"
echo "==========================================="
echo ""
echo "To run: ./dist/EatEasyPrinter"
