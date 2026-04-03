"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.reviewFile = reviewFile;
exports.ping = ping;
const vscode = __importStar(require("vscode"));
function getConfig() {
    const cfg = vscode.workspace.getConfiguration('flutterCodeReviewer');
    return {
        ollamaUrl: cfg.get('ollamaUrl', 'http://localhost:11434').replace(/\/$/, ''),
        modelName: cfg.get('modelName', 'code-review-flutter'),
    };
}
async function reviewFile(code, signal) {
    const { ollamaUrl, modelName } = getConfig();
    // AbortSignal fires → fetch throws DOMException with name 'AbortError'.
    // Callers are responsible for checking err.name === 'AbortError' to silence cancellations.
    // Do NOT pass AbortSignal.timeout() here — TimeoutError has name 'TimeoutError', not 'AbortError'.
    const response = await fetch(`${ollamaUrl}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            model: modelName,
            stream: false,
            messages: [{ role: 'user', content: code }],
        }),
        signal,
    });
    if (!response.ok) {
        throw new Error(`Ollama API responded with HTTP ${response.status}`);
    }
    const data = (await response.json());
    if (typeof data !== 'object' ||
        data === null ||
        !('message' in data) ||
        typeof data.message !== 'object' ||
        data.message === null ||
        typeof (data.message.content) !== 'string') {
        throw new Error('Ollama returned an unexpected response shape');
    }
    return data.message.content;
}
async function ping() {
    const { ollamaUrl, modelName } = getConfig();
    try {
        const response = await fetch(`${ollamaUrl}/api/tags`, {
            signal: AbortSignal.timeout(5000),
        });
        if (!response.ok) {
            return { status: 'no-ollama' };
        }
        const data = (await response.json());
        // Ollama model names include a tag suffix (e.g. "code-review-flutter:latest")
        const models = Array.isArray(data.models) ? data.models : [];
        const modelExists = models.some((m) => m.name === modelName || m.name.startsWith(`${modelName}:`));
        return modelExists ? { status: 'ok' } : { status: 'no-model' };
    }
    catch {
        return { status: 'no-ollama' };
    }
}
//# sourceMappingURL=ollamaClient.js.map