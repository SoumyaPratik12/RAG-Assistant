# Setup Instructions

## ✅ Issues Fixed

1. **Parser Import Error** - Fixed `docx` import in `app/core/parsers.py`
2. **Frontend Path Mismatch** - Updated `app/main.py` to use `Frontend/` (capital F)
3. **Frontend Build** - Built successfully at `Frontend/dist/`

## 🚀 Quick Start

### 1. Install Ollama (if not installed)
Download from: https://ollama.ai/download

### 2. Start Ollama Service
```bash
# In a separate terminal
ollama serve
```

### 3. Pull the LLM Model
```bash
ollama pull llama3.2:1b
```

### 4. Start the Application
```bash
# Option 1: Use the startup script
start.bat

# Option 2: Manual start
python -m uvicorn app.main:app --reload
```

### 5. Access the Application
Open browser: http://127.0.0.1:8000

## 📊 Current Status

- ✅ Backend: Ready
- ✅ Frontend: Built and ready
- ✅ Vector DB: 6 documents indexed
- ⚠️ Ollama: Needs to be started manually

## 🔧 Troubleshooting

**If Ollama fails to connect:**
1. Check if Ollama is running: `curl http://localhost:11434/api/tags`
2. Verify model is installed: `ollama list`
3. Check `.env` file has correct OLLAMA_URL

**If frontend doesn't load:**
1. Verify `Frontend/dist/` exists
2. Rebuild: `cd Frontend && npm run build`

## 📝 Environment Variables (.env)

```
LLM_MODEL=llama3.2:1b
OLLAMA_URL=http://localhost:11434
EMBEDDING_MODEL=all-MiniLM-L6-v2
```
