@echo off
echo ====================================
echo Edge RAG Server Startup
echo ====================================
echo.

REM Check if Ollama is running
curl -s http://localhost:11434/api/tags >nul 2>&1
if %errorlevel% neq 0 (
    echo [WARNING] Ollama is not running!
    echo Please start Ollama first:
    echo   1. Open a new terminal
    echo   2. Run: ollama serve
    echo   3. Run: ollama pull llama3.2:1b
    echo.
    pause
    exit /b 1
)

echo [OK] Ollama is running
echo.

REM Check if frontend is built
if not exist "Frontend\dist\index.html" (
    echo [WARNING] Frontend not built!
    echo Building frontend...
    cd Frontend
    call npm run build
    cd ..
    echo.
)

echo [OK] Frontend is ready
echo.

REM Start the server
echo Starting FastAPI server...
echo Server will be available at: http://127.0.0.1:8000
echo.
python -m uvicorn app.main:app --reload
