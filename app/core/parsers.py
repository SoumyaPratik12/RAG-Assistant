def parse_file(path: str, filename: str) -> str:
    """
    Parse a file and return its text content.
    Supported formats: .txt, .md, .pdf, .docx
    """
    ext = filename.lower()

    if ext.endswith(".txt") or ext.endswith(".md"):
        with open(path, "r", encoding="utf-8", errors="ignore") as f:
            return f.read()

    if ext.endswith(".pdf"):
        import pdfplumber
        with pdfplumber.open(path) as pdf:
            return "\n".join(
                page.extract_text() or "" for page in pdf.pages
            )

    if ext.endswith(".docx"):
        import docx
        doc = docx.Document(path)
        return "\n".join(p.text for p in doc.paragraphs)

    # Unsupported file type
    return ""
