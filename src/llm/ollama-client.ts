export interface OllamaResponse {
    response: string;
}

export class OllamaClient {
    constructor(
        private readonly baseUrl: string =
            process.env.OLLAMA_BASE_URL || "http://localhost:11434",
        private readonly model: string =
            process.env.OLLAMA_MODEL || "qwen3:8b"
    ) {}

    async generate(prompt: string): Promise<string> {
        const response = await fetch(
            `${this.baseUrl}/api/generate`,
            {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    model: this.model,
                    prompt,
                    stream: false,
                }),
            }
        );

        if (!response.ok) {
            throw new Error(
                `Ollama request failed: ${response.status}`
            );
        }

        const data: OllamaResponse = await response.json();

        return data.response;
    }
}