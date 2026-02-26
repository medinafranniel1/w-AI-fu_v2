"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.LargeLanguageModelGroq = void 0;
const Result_1 = require("../types/Result");
const Waifu_1 = require("../types/Waifu");
const llm_interface_1 = require("./llm_interface");
const io_1 = require("../io/io");
const characters_1 = require("../characters/characters");

const https = require("https");

const GENERATION_TIMEOUT_MS = 15000;

class LargeLanguageModelGroq {
    #api_key = "";

    constructor() {
        this.#api_key = Waifu_1.wAIfu.state.auth?.groq?.token ?? "";
    }

    async initialize() {
        if (!this.#api_key || this.#api_key.trim() === "") {
            io_1.IO.warn("[Groq] WARNING: No Groq API key found in auth.json under groq.token");
        }
        io_1.IO.debug("Loaded LargeLanguageModelGroq.");
        return;
    }

    async free() {
        return;
    }

    async generate(prompt, settings) {
        return new Promise(async (resolve) => {
            let is_resolved = false;

            const parsed_prompt = this.#parsePrompt(prompt);

            if (parsed_prompt === null) {
                is_resolved = true;
                resolve(new Result_1.Result(false,
                    "Could not parse prompt.",
                    llm_interface_1.LLM_GEN_ERRORS.INCORRECT_PROMPT));
                return;
            }

            const timeout = () => {
                if (is_resolved) return;
                is_resolved = true;
                resolve(new Result_1.Result(false,
                    "Timed out while waiting for LLM response.",
                    llm_interface_1.LLM_GEN_ERRORS.RESPONSE_TIMEOUT));
            };
            setTimeout(timeout, GENERATION_TIMEOUT_MS);

            const model = Waifu_1.wAIfu.state.config.large_language_model.groq_model?.value
                ?? "llama-3.1-8b-instant";

            const body = JSON.stringify({
                model: model,
                messages: parsed_prompt,
                temperature: Math.min(settings.temperature, 2.0),
                max_tokens: settings.max_output_length,
                stop: ["\n", "\r"],
            });

            const options = {
                hostname: "api.groq.com",
                path: "/openai/v1/chat/completions",
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${this.#api_key}`,
                    "Content-Length": Buffer.byteLength(body),
                },
            };

            const req = https.request(options, (res) => {
                let data = "";
                res.on("data", (chunk) => { data += chunk; });
                res.on("end", () => {
                    if (is_resolved) return;
                    try {
                        const parsed = JSON.parse(data);
                        if (parsed.error) {
                            is_resolved = true;
                            resolve(new Result_1.Result(false,
                                parsed.error.message,
                                llm_interface_1.LLM_GEN_ERRORS.UNDEFINED));
                            return;
                        }
                        let result_text = parsed.choices[0].message.content ?? "";
                        if (!result_text.endsWith("\n")) result_text += "\n";
                        is_resolved = true;
                        resolve(new Result_1.Result(true, result_text, llm_interface_1.LLM_GEN_ERRORS.NONE));
                    } catch (e) {
                        is_resolved = true;
                        resolve(new Result_1.Result(false,
                            "Failed to parse Groq response: " + e.message,
                            llm_interface_1.LLM_GEN_ERRORS.UNDEFINED));
                    }
                });
            });

            req.on("error", (e) => {
                if (is_resolved) return;
                is_resolved = true;
                resolve(new Result_1.Result(false,
                    "Groq request error: " + e.message,
                    llm_interface_1.LLM_GEN_ERRORS.UNDEFINED));
            });

            req.write(body);
            req.end();
        });
    }

    #parsePrompt(unparsed_prompt) {
        const character = (0, characters_1.getCurrentCharacter)();
        let msg_array = [];
        let matches = unparsed_prompt.matchAll(
            /(----[^]*?\*\*\*)|(\[ [^]*? \])|({ [^]*? })|(.*?)(?:\n|$)/g
        );
        for (let match of matches) {
            let content = match[0].trim();
            if (content === null) continue;
            if (content === "") continue;
            if (content.startsWith("----")) {
                msg_array.push({ role: "system", content: content.replaceAll(/----\n|----|\*\*\*\n|\*\*\*/g, "") });
                continue;
            }
            if (content.startsWith("{ ")) {
                msg_array.push({ role: "system", content: content.replaceAll(/{ | }/g, "") });
                continue;
            }
            if (content.startsWith("[ ")) {
                msg_array.push({ role: "system", content: content.replaceAll(/\[ | \]/g, "") });
                continue;
            }
            if (content.includes(":")) {
                let split_line = content.split(":");
                msg_array.push({
                    role: split_line[0] === character.char_name ? "assistant" : "user",
                    content: content,
                });
                continue;
            }
            io_1.IO.warn('Could not parse line "' + content + '"');
            return null;
        }
        msg_array.pop();
        return msg_array;
    }
}
exports.LargeLanguageModelGroq = LargeLanguageModelGroq;
