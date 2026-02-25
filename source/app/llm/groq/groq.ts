/**
 * groq.ts
 * Groq LLM provider for w-AI-fu v2
 * Replaces the OpenAI provider using Groq's OpenAI-compatible API
 *
 * Groq supports: llama-3.3-70b-versatile, llama-3.1-8b-instant,
 *                mixtral-8x7b-32768, gemma2-9b-it, and more.
 * See: https://console.groq.com/docs/models
 */

import OpenAI from "openai";
import type { ILlmProvider, LlmGenerateParams, LlmOutput } from "../llm_provider.js";
import { getAuthJson } from "../../auth/auth.js";
import { getConfigValue } from "../../config/config.js";
import { log, logErr } from "../../log/log.js";

let groqClient: OpenAI | undefined = undefined;

function getGroqClient(): OpenAI {
    if (groqClient !== undefined) return groqClient;

    const auth = getAuthJson();
    const apiKey: string = (auth?.groq?.token as string) ?? "";

    if (!apiKey || apiKey.trim() === "") {
        logErr("[Groq] API key is missing. Please add your Groq API key to userdata/auth/auth.json under 'groq.token'.");
        throw new Error("Groq API key not set.");
    }

    groqClient = new OpenAI({
        apiKey,
        baseURL: "https://api.groq.com/openai/v1",
    });

    return groqClient;
}

export const GroqLlmProvider: ILlmProvider = {
    name: "groq",

    async generate(params: LlmGenerateParams): Promise<LlmOutput> {
        const client = getGroqClient();

        // Model: configurable from UI via 'groq_model' or fallback to default
        const model: string =
            (getConfigValue("llm", "groq_model") as string | undefined) ??
            "llama-3.3-70b-versatile";

        const temperature: number =
            (getConfigValue("llm", "temperature") as number | undefined) ?? 1.0;

        const maxTokens: number =
            (getConfigValue("llm", "max_output_length") as number | undefined) ?? 80;

        log(`[Groq] Using model: ${model}`);

        try {
            const completion = await client.chat.completions.create({
                model,
                messages: params.messages,
                temperature: Math.min(temperature, 2.0),
                max_tokens: maxTokens,
                stream: false,
            });

            const content = completion.choices[0]?.message?.content ?? "";
            return { text: content, error: undefined };
        } catch (err: unknown) {
            const message = err instanceof Error ? err.message : String(err);
            logErr(`[Groq] Generation error: ${message}`);
            return { text: "", error: message };
        }
    },

    /**
     * Reset/invalidate the cached client (e.g. after API key change)
     */
    reset(): void {
        groqClient = undefined;
    },
};
