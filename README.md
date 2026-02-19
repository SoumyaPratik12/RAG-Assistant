# RAG-Assistant

A full-stack Retrieval-Augmented Generation (RAG) application with FastAPI backend and React frontend.

## 🎯 Features

- 📄 Multi-format document ingestion (PDF, DOCX, TXT, MD)
- 🔍 Semantic search with sentence-transformers
- 💬 Streaming chat interface with SSE
- 🎨 Dark/Light theme support
- 📊 Real-time status monitoring
- 🔒 Secure file handling

## 🚀 Quick Start

### Prerequisites
- Python 3.8+
- Node.js 16+
- Ollama (https://ollama.ai/download)

### Installation

1. **Install Python dependencies:**
```bash
pip install -r requirements.txt
```

2. **Install Node dependencies:**
```bash
cd Frontend
npm install
npm run build
cd ..
```

3. **Start Ollama (in separate terminal):**
```bash
ollama serve
ollama pull llama3.2:1b
```

4. **Start the application:**
```bash
# Windows
start.bat

# Or manually
python -m uvicorn app.main:app --reload
```

5. **Open browser:** http://127.0.0.1:8000

## 📁 Project Structure

```
Edge RAG server/
├── app/
│   ├── core/          # Core modules (embeddings, chunking, parsers)
│   ├── routes/        # API endpoints (ingest, query)
│   └── main.py        # FastAPI application
├── Frontend/          # React + TypeScript UI
│   ├── src/
│   └── dist/          # Production build
├── data/
│   ├── documents/     # Uploaded documents
│   └── vector_db/     # Vector embeddings
├── .env               # Configuration
└── requirements.txt   # Python dependencies
```

## 🔧 Configuration

Edit `.env` file:
```
LLM_MODEL=llama3.2:1b
OLLAMA_URL=http://localhost:11434
EMBEDDING_MODEL=all-MiniLM-L6-v2
```

## 📚 API Endpoints

- `POST /ingest/text` - Ingest raw text
- `POST /ingest/files` - Upload documents
- `POST /query/stream` - Query with streaming response
- `GET /health` - System status
- `POST /clear` - Clear vector database

## 🛠️ Development

**Backend (FastAPI):**
```bash
python -m uvicorn app.main:app --reload
```

**Frontend (Vite dev server):**
```bash
cd Frontend
npm run dev
```

## 📝 Notes

- Vector database persists at `data/vector_db/store.pkl`
- Currently indexed: 6 documents
- Supports concurrent file uploads
- SSE streaming for real-time responses