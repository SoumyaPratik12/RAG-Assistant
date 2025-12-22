// lib/api.ts

const API_BASE_URL =
  (import.meta as any).env?.VITE_BACKEND_URL || "http://localhost:8000";

/* ============================================================
   INGEST TEXT
   ============================================================ */
export async function ingestText(payload: { text: string }) {
  const res = await fetch(`${API_BASE_URL}/ingest/text`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    throw new Error((await res.text()) || "Text ingestion failed");
  }

  return res.json();
}

/* ============================================================
   UPLOAD FILES
   ============================================================ */
export async function uploadFiles(files: File[]) {
  const formData = new FormData();
  files.forEach((file) => formData.append("files", file));

  const res = await fetch(`${API_BASE_URL}/ingest/files`, {
    method: "POST",
    body: formData,
  });

  if (!res.ok) {
    throw new Error((await res.text()) || "File upload failed");
  }

  return res.json();
}

/* ============================================================
   STREAM QUERY (SSE-SAFE, ROBUST)
   ============================================================ */
export async function streamQuery(
  payload: { query: string },
  onChunk: (chunk: string) => void,
  onDone?: (sources?: any[]) => void,
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
    let sources: any[] = [];

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });

      // SSE messages end with \n\n
      const messages = buffer.split("\n\n");
      buffer = messages.pop() || "";

      for (const msg of messages) {
        if (!msg.startsWith("data:")) continue;

        const data = msg.replace(/^data:\s*/, "").trim();
        if (!data) continue;

        if (data === "[DONE]") {
          onDone?.(sources);
          return;
        }

        if (data.startsWith("[SOURCES]")) {
          const sourcesJson = data.replace("[SOURCES]", "");
          sources = JSON.parse(sourcesJson);
          continue;
        }

        onChunk(data);
      }
    }

    // Flush remaining buffer
    if (buffer.startsWith("data:")) {
      const data = buffer.replace(/^data:\s*/, "").trim();
      if (data && data !== "[DONE]") {
        if (data.startsWith("[SOURCES]")) {
          const sourcesJson = data.replace("[SOURCES]", "");
          sources = JSON.parse(sourcesJson);
        } else {
          onChunk(data);
        }
      }
    }

    onDone?.(sources);
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
