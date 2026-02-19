import os
import subprocess
from pathlib import Path


def _parse_doc_with_textract(path: str) -> str:
    try:
        import textract  # type: ignore
    except ImportError:
        return ""

    try:
        raw = textract.process(path)
        return raw.decode("utf-8", errors="ignore").strip()
    except Exception:
        return ""


def _parse_doc_with_word(path: str) -> str:
    # Windows fallback: use installed MS Word through COM automation.
    if os.name != "nt":
        return ""

    try:
        import pythoncom  # type: ignore
        import win32com.client  # type: ignore
    except ImportError:
        return ""

    coinit_done = False
    word = None
    document = None
    try:
        pythoncom.CoInitialize()
        coinit_done = True
        word = win32com.client.DispatchEx("Word.Application")
        word.Visible = False
        document = word.Documents.Open(
            str(Path(path).resolve()),
            ConfirmConversions=False,
            ReadOnly=True,
            AddToRecentFiles=False,
        )
        text = (document.Content.Text or "").strip()
        return text
    except Exception:
        return ""
    finally:
        if document is not None:
            try:
                document.Close(False)
            except Exception:
                pass
        if word is not None:
            try:
                word.Quit()
            except Exception:
                pass
        if coinit_done:
            try:
                pythoncom.CoUninitialize()
            except Exception:
                pass


def _parse_doc_with_antiword(path: str) -> str:
    # Linux/macOS fallback if antiword is available on PATH.
    try:
        proc = subprocess.run(
            ["antiword", path],
            check=False,
            capture_output=True,
            text=True,
        )
    except Exception:
        return ""

    if proc.returncode != 0:
        return ""
    return (proc.stdout or "").strip()


def _parse_doc(path: str) -> str:
    for parser in (_parse_doc_with_textract, _parse_doc_with_word, _parse_doc_with_antiword):
        text = parser(path)
        if text:
            return text

    raise ValueError(
        "Unable to parse .doc file. Install `textract` (and antiword/catdoc), "
        "or on Windows install `pywin32` with Microsoft Word available."
    )


def parse_file(path: str, filename: str) -> str:
    """
    Parse a file and return its text content.
    Supported formats: .txt, .md, .pdf, .doc, .docx
    """
    ext = filename.lower()

    if ext.endswith(".txt") or ext.endswith(".md"):
        with open(path, "r", encoding="utf-8", errors="ignore") as f:
            return f.read()

    if ext.endswith(".pdf"):
        import pdfplumber

        with pdfplumber.open(path) as pdf:
            return "\n".join(page.extract_text() or "" for page in pdf.pages)

    if ext.endswith(".docx"):
        from docx import Document

        doc = Document(path)
        return "\n".join(p.text for p in doc.paragraphs)

    if ext.endswith(".doc"):
        return _parse_doc(path)

    # Unsupported file type
    return ""
