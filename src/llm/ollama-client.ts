export interface OllamaResponse {
  response: string;
}

export class OllamaClient {
  constructor(
    private readonly baseUrl: string = process.env.OLLAMA_BASE_URL || "http://localhost:11434",
    private readonly model: string = process.env.OLLAMA_MODEL || "qwen3:8b"
  ) {}

  async generate(prompt: string): Promise<string> {
    // 1. Try Ollama first
    try {
      const response = await fetch(`${this.baseUrl}/api/generate`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: this.model,
          prompt,
          stream: false,
        }),
        signal: AbortSignal.timeout(60_000),
      });

      if (response.ok) {
        const data: OllamaResponse = await response.json();
        if (data.response && data.response.trim()) {
          return data.response;
        }
      }
    } catch (error: any) {
      // Ollama not reachable -> fallback
    }

    // 2. Try OpenAI if configured
    const openAiKey = process.env.OPENAI_API_KEY;
    if (openAiKey) {
      try {
        const { OpenAI } = await import("openai");
        const openai = new OpenAI({ apiKey: openAiKey });
        const res = await openai.chat.completions.create({
          model: process.env.OPENAI_CHAT_MODEL || "gpt-4o-mini",
          messages: [{ role: "user", content: prompt }],
          temperature: 0.2,
        });
        const content = res.choices[0]?.message?.content;
        if (content) return content;
      } catch (err: any) {
        console.warn("OpenAI generation fallback error:", err.message);
      }
    }

    // 3. Fallback: extract context or provide helpful answer
    const contextMatch = prompt.match(/CONTEXT:\s*([\s\S]*?)\s*USER QUESTION:/i);
    if (contextMatch && contextMatch[1] && contextMatch[1].trim()) {
      return (
        "Based on the relevant college notice:\n\n" +
        contextMatch[1]
          .split("\n\n")
          .filter((p) => p.includes("Content:") || p.includes("[SOURCE"))
          .slice(0, 3)
          .join("\n\n")
      );
    }

    throw new Error(
      "LLM generation failed: Ollama is not running on " +
        this.baseUrl +
        " and OPENAI_API_KEY is not configured."
    );
  }
}
