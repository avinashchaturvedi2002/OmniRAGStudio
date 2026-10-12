import type { Express } from "express";

interface ConversionResponse {
  fileName: string;
  mimeType: string | null;
  markdown: string;
}

export async function convertFileToMarkdown(
  file: Express.Multer.File
): Promise<ConversionResponse> {
  const form = new FormData();

  const blob = new Blob(
    [new Uint8Array(file.buffer)],
    { type: file.mimetype || "application/octet-stream" }
  );

  form.append("file", blob, file.originalname);

  const baseUrl =
    process.env.EMBEDDING_SERVICE_URL ??
    "http://127.0.0.1:8000";

  const response = await fetch(`${baseUrl}/convert`, {
    method: "POST",
    body: form,
  });

  if (!response.ok) {
    throw new Error(
      `Document conversion failed: ${response.status}`
    );
  }

  return response.json() as Promise<ConversionResponse>;
}