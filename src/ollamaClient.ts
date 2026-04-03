import * as vscode from 'vscode';

export type PingResult =
  | { status: 'ok' }
  | { status: 'no-ollama' }
  | { status: 'no-model' };

function getConfig(): { ollamaUrl: string; modelName: string } {
  const cfg = vscode.workspace.getConfiguration('flutterCodeReviewer');
  return {
    ollamaUrl: cfg.get<string>('ollamaUrl', 'http://localhost:11434'),
    modelName: cfg.get<string>('modelName', 'code-review-flutter'),
  };
}

export async function reviewFile(
  code: string,
  signal: AbortSignal,
): Promise<string> {
  const { ollamaUrl, modelName } = getConfig();

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

  const data = (await response.json()) as { message: { content: string } };
  return data.message.content;
}

export async function ping(): Promise<PingResult> {
  const { ollamaUrl, modelName } = getConfig();

  let data: { models: { name: string }[] };

  try {
    const response = await fetch(`${ollamaUrl}/api/tags`, {
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) {
      return { status: 'no-ollama' };
    }
    data = (await response.json()) as { models: { name: string }[] };
  } catch {
    return { status: 'no-ollama' };
  }

  // Ollama model names include a tag suffix (e.g. "code-review-flutter:latest")
  const modelExists = data.models.some(
    (m) => m.name === modelName || m.name.startsWith(`${modelName}:`),
  );

  return modelExists ? { status: 'ok' } : { status: 'no-model' };
}
