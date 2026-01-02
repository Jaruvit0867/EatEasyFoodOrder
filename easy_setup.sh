#!/bin/bash

# Coloring
GREEN='\033[0;32m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

echo -e "${CYAN}🔧 Setting up EatEasy Food Order System...${NC}"

# Check for Python
if ! command -v python3 &> /dev/null; then
    echo "❌ Python3 could not be found. Please install Python 3.11+"
    exit 1
fi

# Check for Node
if ! command -v npm &> /dev/null; then
    echo "❌ Node.js/npm could not be found. Please install Node.js"
    exit 1
fi

# 1. Backend Setup
echo -e "\n${GREEN}📦 Installing Backend Dependencies...${NC}"
cd backend
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
if [ $? -eq 0 ]; then
    echo "✅ Backend installed successfully."
else
    echo "❌ Backend install failed."
    exit 1
fi
cd ..

# 2. Frontend Setup
echo -e "\n${GREEN}🎨 Installing Frontend Dependencies...${NC}"
cd frontend
npm install
if [ $? -eq 0 ]; then
    echo "✅ Frontend installed successfully."
else
    echo "❌ Frontend install failed."
    exit 1
fi
cd ..

# 3. Security Certs (at project root level)
echo -e "\n${GREEN}🔒 Generating SSL Certificates (for Mobile Mic)...${NC}"
mkdir -p certificates
# Check if key already exists to avoid overwriting/erroring if valid
if [ ! -f "certificates/key.pem" ]; then
    openssl req -x509 -newkey rsa:2048 -keyout certificates/key.pem -out certificates/cert.pem -days 365 -nodes -subj '/CN=EatEasyLocal' 2>/dev/null
    echo "✅ Certificates generated."
else
    echo "ℹ️  Certificates already exist."
fi

echo -e "\n${GREEN}✨ Setup Complete!${NC}"
echo -e "👉 Type ${CYAN}./easy_run.sh${NC} to start the system."
