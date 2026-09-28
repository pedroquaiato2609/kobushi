import { config } from '../../config';
import { AppError, ProviderError } from '../../domain/errors';

export interface TranscribeInput {
  audio: Buffer;
  mimeType: string;
  language: string; // 'pt-BR' -> 'pt'
  model: string;
}

/** Ditado por voz: recebe o áudio gravado no navegador e devolve o texto (OpenAI /audio/transcriptions). */
export class OpenAiTranscriber {
  async transcribe({ audio, mimeType, language, model }: TranscribeInput): Promise<string> {
    if (!config.openaiApiKey) throw new AppError('OPENAI_API_KEY não configurada no .env (necessária para o ditado no modo "servidor").', 400);

    const ext = mimeType.includes('mp4') ? 'mp4' : mimeType.includes('ogg') ? 'ogg' : mimeType.includes('wav') ? 'wav' : 'webm';
    const form = new FormData();
    form.append('file', new Blob([audio], { type: mimeType }), `audio.${ext}`);
    form.append('model', model);
    if (language) form.append('language', language.slice(0, 2));

    const res = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: { authorization: `Bearer ${config.openaiApiKey}` },
      body: form,
    });
    const data: any = await res.json().catch(() => null);
    if (!res.ok) throw new ProviderError(`Transcrição: ${data?.error?.message ?? res.statusText}`);
    return (data?.text as string) ?? '';
  }
}
