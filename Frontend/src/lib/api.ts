// lib/api.ts

const API_BASE_URL =
  (import.meta as any).env?.VITE_BACKEND_URL || "http://localhost:8000";

async function parseApiError(res: Response, fallback: string): Promise<Error> {
  const raw = await res.text();
  if (!raw) return new Error(fallback);

  try {
    const parsed = JSON.parse(raw);
    const detail = parsed?.detail;

    if (typeof detail === "string") {
      return new Error(detail);
    }

    if (detail && typeof detail === "object") {
      const message = detail.message || fallback;
      const failed = Array.isArray(detail.failed_files) ? detail.failed_files : [];
      if (failed.length > 0) {
        const failureText = failed
          .map((f: any) => `${f.file}: ${f.error}`)
          .join(" | ");
        return new Error(`${message}. ${failureText}`);
      }
      return new Error(message);
    }
  } catch {
    // fall through and return raw text
  }

  return new Error(raw || fallback);
}

/* ============================================================
   INGEST TEXT
   ============================================================ */
export async function ingestText(payload: { text: string; replace?: boolean }) {
  const body = {
    replace: payload.replace ?? true,
    text: payload.text,
  };

  const res = await fetch(`${API_BASE_URL}/ingest/text`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    throw await parseApiError(res, "Text ingestion failed");
  }

  return res.json();
}

/* ============================================================
   UPLOAD FILES
   ============================================================ */
export async function uploadFiles(files: File[], replace = true) {
  const formData = new FormData();
  files.forEach((file) => formData.append("files", file));
  formData.append("replace", String(replace));

  const res = await fetch(`${API_BASE_URL}/ingest/files`, {
    method: "POST",
    body: formData,
  });

  if (!res.ok) {
    throw await parseApiError(res, "File upload failed");
  }

  return res.json();
}

/* ============================================================
   CLEAR KNOWLEDGE BASE
   ============================================================ */
export async function clearKnowledgeBase() {
  const res = await fetch(`${API_BASE_URL}/clear`, {
    method: "POST",
  });

  if (!res.ok) {
    throw await parseApiError(res, "Failed to clear knowledge base");
  }

  return res.json();
}

/* ============================================================
   STREAM QUERY (SSE-SAFE, ROBUST)
   ============================================================ */
export async function streamQuery(
  payload: { query: string; topK?: number; threshold?: number },
  onChunk: (chunk: string) => void,
  onDone?: () => void,
  onError?: (error: Error) => void
) {
  try {
    const res = await fetch(`${API_BASE_URL}/query/stream`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!res.ok || !res.body) {
      throw new Error(
        `Stream failed: ${res.status} ${res.statusText}`
      );
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    const parseSseData = (msg: string): string => {
      const lines = msg.split("\n");
      const dataLines: string[] = [];
      for (const line of lines) {
        if (line.startsWith("data:")) {
          dataLines.push(line.replace(/^data:\s?/, ""));
        }
      }
      return dataLines.join("\n");
    };

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });

      // SSE messages end with \n\n
      const messages = buffer.split("\n\n");
      buffer = messages.pop() || "";

      for (const msg of messages) {
        if (!msg.includes("data:")) continue;

        const data = parseSseData(msg);
        if (!data) continue;

        if (data === "[DONE]") {
          onDone?.();
          return;
        }

        if (data.startsWith("[ERROR]")) {
          throw new Error(data.replace("[ERROR]", "").trim());
        }

        onChunk(data);
      }
    }

    // Flush remaining buffer
    if (buffer.includes("data:")) {
      const data = parseSseData(buffer);
      if (data && data !== "[DONE]") {
        if (data.startsWith("[ERROR]")) {
          throw new Error(data.replace("[ERROR]", "").trim());
        } else {
          onChunk(data);
        }
      }
    }

    onDone?.();
  } catch (err) {
    console.error("Stream query error:", err);
    if (onError) onError(err as Error);
    else throw err;
  }
}

/* ============================================================
   NON-STREAMING QUERY (WRAPS STREAMING)
   ============================================================ */
export async function ask(query: string): Promise<string> {
  let result = "";

  await streamQuery(
    { query },
    (chunk) => {
      result += chunk;
    }
  );

  return result;
}
