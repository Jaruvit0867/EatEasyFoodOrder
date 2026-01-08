#!/bin/bash
echo "==========================================="
echo "🖨️  Setting up EatEasy Printer Agent..."
echo "==========================================="

# Check for python3
if command -v python3 &> /dev/null; then
    PY_CMD="python3"
else
    echo "[ERROR] Python3 is not installed!"
    exit 1
fi

# Create virtual environment if not exists
if [ ! -d ".venv" ]; then
    echo "Creating virtual environment..."
    $PY_CMD -m venv .venv
fi

# Activate venv
source .venv/bin/activate

# Install dependencies
echo "Installing libraries..."
pip install requests pillow python-dotenv pytz

# Run Agent
echo ""
echo "✅ Setup complete. Starting Agent..."
echo ""
python printer_agent.py

