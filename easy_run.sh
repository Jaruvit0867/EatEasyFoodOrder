#!/bin/bash

# Coloring
GREEN='\033[0;32m'
CYAN='\033[0;36m'
YELLOW='\033[0;33m'
NC='\033[0m' # No Color

echo -e "${CYAN}🚀 Starting EatEasy System...${NC}"

# Function to kill background processes on exit
cleanup() {
    echo -e "\n${YELLOW}🛑 Shutting down server...${NC}"
    kill $(jobs -p) 2>/dev/null
}
trap cleanup EXIT

# 0. Check IP
IPV4=$(ipconfig getifaddr en0 2>/dev/null) # Mac Wi-Fi
if [ -z "$IPV4" ]; then
    IPV4=$(ipconfig getifaddr en1 2>/dev/null) # Mac Ethernet maybe?
fi
if [ -z "$IPV4" ]; then
    IPV4="localhost"
fi

# 1. Start Backend
echo -e "${GREEN}🔥 Starting Backend (Port 8000)...${NC}"
cd backend
source venv/bin/activate
uvicorn main:app --host 0.0.0.0 --port 8000 > /dev/null 2>&1 &
BACKEND_PID=$!
cd ..

# 2. Start Frontend
echo -e "${GREEN}✨ Starting Frontend (Port 3000)...${NC}"
cd frontend
npm run dev:https > /dev/null 2>&1 &
FRONTEND_PID=$!
cd ..

# Wait a moment for startup
sleep 3

echo -e "\n${GREEN}🌐 System is RUNNING!${NC}"
echo -e "==================================================="
echo -e "                   📱 ENDPOINTS"
echo -e "==================================================="
echo -e ""
echo -e "  🍛 ${YELLOW}หน้าสั่งอาหาร (ลูกค้า)${NC}"
echo -e "     https://localhost:3000"
echo -e "     https://$IPV4:3000"
echo -e ""
echo -e "  👨‍🍳 ${CYAN}หน้าครัว (Kitchen Display)${NC}"
echo -e "     https://localhost:3000/kitchen"
echo -e "     https://$IPV4:3000/kitchen"
echo -e ""
echo -e "  📊 ${GREEN}หน้า Dashboard (เจ้าของร้าน)${NC}"
echo -e "     https://localhost:3000/dashboard"
echo -e "     https://$IPV4:3000/dashboard"
echo -e ""
echo -e "==================================================="
echo -e "💡 On Mobile: If you see 'Security Warning', click ${YELLOW}Advanced -> Proceed${NC}"
echo -e "📝 Press ${YELLOW}CTRL+C${NC} to stop the server."

wait
