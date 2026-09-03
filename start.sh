#!/bin/bash
# Ring Sentinel - Startup Script
# This script starts the backend server

echo "🔴 Ring Sentinel - Coordinated Fraud Ring Detector"
echo "=================================================="
echo ""

# Check if Python is available
if ! command -v python &> /dev/null; then
    echo "❌ Python is not installed. Please install Python 3.8+"
    exit 1
fi

# Check if dependencies are installed
echo "Checking dependencies..."
python -c "import fastapi, uvicorn, networkx, sklearn" 2>/dev/null
if [ $? -ne 0 ]; then
    echo "Installing dependencies..."
    pip install fastapi uvicorn networkx scikit-learn numpy pydantic
fi

echo "✅ Dependencies OK"
echo ""

# Start the server
echo "Starting Ring Sentinel server..."
echo "Server will be available at: http://localhost:8000"
echo "Dashboard: http://localhost:8000/dashboard"
echo ""
echo "Press Ctrl+C to stop the server"
echo ""

cd backend
python run.py
