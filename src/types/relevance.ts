export interface RelevanceResult {
    index: number;
    relevant: boolean;
    reason?: string;
}

export interface RelevanceResponse {
    results: RelevanceResult[];
}