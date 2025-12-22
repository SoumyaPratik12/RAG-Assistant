# TODO List for RAG Application Fixes

## 1. Fix DocumentPanel Text Visibility in Dark Mode
- [x] Add dark:text-white to textarea in DocumentPanel.tsx
- [x] Add accept=".pdf,.doc" to file input in DocumentPanel.tsx

## 2. Add Support for .doc Files
- [x] Removed .doc support due to textract installation issues, kept only .pdf support
- [x] Updated parsers.py to handle only .pdf files
- [x] Updated ingest.py to allow only .pdf extensions

## 3. Fix StatusBar Dark Mode Gradient
- [x] Change StatusBar.tsx dark background to gradient from-slate-900 to-blue-900

## 4. Fix StreamQuery SSE Parsing
- [x] Update api.ts streamQuery to properly parse Server-Sent Events

## 5. Improve ChatPanel Dark Mode Styling
- [x] Add dark:text-slate-400 to instructional p tag in ChatPanel.tsx
- [x] Add dark classes to example question buttons

## 6. Set Default Theme to Light
- [x] Update ThemeContext.tsx to set initial dark to false

## 7. Fix Answer Display Issue
- [x] Fix ChatPanel.tsx to properly accumulate answer during streaming
- [x] Update backend query.py to return proper SSE format instead of plain text
