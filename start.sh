#!/bin/bash

# Holy Songs - Start Script
# This script starts both the backend and frontend servers

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Get the directory where this script is located
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}       Holy Songs - Starting...        ${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""

# Kill any existing processes on ports 8000 and 5173
echo -e "${YELLOW}Cleaning up any existing servers...${NC}"
lsof -ti:8000 | xargs kill -9 2>/dev/null
lsof -ti:5173 | xargs kill -9 2>/dev/null

# Start the backend server in the background
echo -e "${GREEN}Starting backend server (FastAPI)...${NC}"
python3 -m uvicorn backend.main:app --reload --port 8000 &
BACKEND_PID=$!

# Wait a moment for the backend to start
sleep 2

# Start the frontend server
echo -e "${GREEN}Starting frontend server (Vite)...${NC}"
echo ""
echo -e "${BLUE}========================================${NC}"
echo -e "${GREEN}✓ Backend running at:  http://localhost:8000${NC}"
echo -e "${GREEN}✓ Frontend running at: http://localhost:5173/holy-songs/${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""
echo -e "${YELLOW}Press Ctrl+C to stop both servers${NC}"
echo ""

# Function to cleanup on exit
cleanup() {
    echo ""
    echo -e "${YELLOW}Shutting down servers...${NC}"
    kill $BACKEND_PID 2>/dev/null
    lsof -ti:8000 | xargs kill -9 2>/dev/null
    lsof -ti:5173 | xargs kill -9 2>/dev/null
    echo -e "${GREEN}Servers stopped. Goodbye!${NC}"
    exit 0
}

# Trap Ctrl+C and call cleanup
trap cleanup SIGINT SIGTERM

# Start the frontend (this will run in the foreground)
npm run dev
