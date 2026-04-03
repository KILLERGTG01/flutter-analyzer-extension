import * as vscode from 'vscode';

export type PingResult =
  | { status: 'ok' }
  | { status: 'no-ollama' }
  | { status: 'no-model' };

function getConfig(): { ollamaUrl: string; modelName: string } {
  const cfg = vscode.workspace.getConfiguration('flutterCodeReviewer');
  return {
    ollamaUrl: cfg.get<string>('ollamaUrl', 'http://localhost:11434').replace(/\/$/, ''),
    modelName: cfg.get<string>('modelName', 'code-review-flutter'),
  };
}

export async function reviewFile(
  code: string,
  signal: AbortSignal,
): Promise<string> {
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

  const data = (await response.json()) as unknown;
  if (
    typeof data !== 'object' ||
    data === null ||
    !('message' in data) ||
    typeof (data as { message: unknown }).message !== 'object' ||
    (data as { message: unknown }).message === null ||
    typeof ((data as { message: { content: unknown } }).message.content) !== 'string'
  ) {
    throw new Error('Ollama returned an unexpected response shape');
  }
  return (data as { message: { content: string } }).message.content;
}

export async function ping(): Promise<PingResult> {
  const { ollamaUrl, modelName } = getConfig();

  try {
    const response = await fetch(`${ollamaUrl}/api/tags`, {
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) {
      return { status: 'no-ollama' };
    }
    const data = (await response.json()) as { models?: { name: string }[] };

    // Ollama model names include a tag suffix (e.g. "code-review-flutter:latest")
    const models = Array.isArray(data.models) ? data.models : [];
    const modelExists = models.some(
      (m) => m.name === modelName || m.name.startsWith(`${modelName}:`),
    );

    return modelExists ? { status: 'ok' } : { status: 'no-model' };
  } catch {
    return { status: 'no-ollama' };
  }
}
