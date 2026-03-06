# Reading Clipper 2.0

## 🚀 Quick Start

1. Double-click: `create-shortcut.bat`
2. Double-click desktop shortcut "Reading Clipper"
3. Press 1 to start all services
4. Browser opens automatically at http://localhost:5173

## 📋 Control Panel

- [1] Start All Services
- [2] Stop All Services
- [3] Restart All Services
- [4] Open App
- [5] View Logs
- [0] Exit

## 🔧 Services

- Content Fetch (Port 8200) - Article extraction
- Python Sidecar (Port 8100) - Chunking & embedding
- Backend (Port 3001) - API server
- Web App (Port 5173) - React frontend

## 📂 Logs

All logs saved to `logs/` directory

## ✨ Features

- Mozilla Readability article extraction
- Puppeteer for JS-heavy pages
- Image processing (lazy-load, absolute URLs)
- Metadata extraction (author, source, date)
- Article prose styling
- Semantic search with pgvector

## 🎯 What's New

| Feature | Before | After |
|---------|--------|-------|
| Content | Plain text | Structured HTML |
| Images | ❌ | ✅ |
| Metadata | ❌ | ✅ |
| JS Pages | ❌ | ✅ Puppeteer |
| Reading | ⭐⭐ | ⭐⭐⭐⭐⭐ |
