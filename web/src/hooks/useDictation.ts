import { useRef, useState } from 'react';
import { api } from '../api/client';

export type DictationState = 'idle' | 'recording' | 'transcribing';

/**
 * Ditado por voz, no estilo do ChatGPT: toque para gravar, toque de novo para parar e inserir o texto.
 * - modo "server": grava no navegador (MediaRecorder) e transcreve no backend (OpenAI).
 * - modo "browser": usa o reconhecimento de fala do próprio navegador (Chrome/Edge/Safari), sem custo de API.
 */
export function useDictation(mode: 'server' | 'browser', onText: (text: string) => void, lang = 'pt-BR') {
  const [state, setState] = useState<DictationState>('idle');
  const [error, setError] = useState<string | null>(null);
  const recorder = useRef<MediaRecorder | null>(null);
  const recognition = useRef<any>(null);
  const chunks = useRef<Blob[]>([]);
  const onTextRef = useRef(onText);
  onTextRef.current = onText;

  const SpeechRecognitionCtor = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
  const supported = mode === 'server'
    ? typeof MediaRecorder !== 'undefined' && Boolean(navigator.mediaDevices?.getUserMedia)
    : Boolean(SpeechRecognitionCtor);

  async function start() {
    setError(null);
    try {
      if (mode === 'server') {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        const rec = new MediaRecorder(stream);
        chunks.current = [];
        rec.ondataavailable = (e) => { if (e.data.size > 0) chunks.current.push(e.data); };
        rec.onstop = async () => {
          stream.getTracks().forEach((t) => t.stop());
          setState('transcribing');
          try {
            const { text } = await api.uploadAudio(new Blob(chunks.current, { type: rec.mimeType || 'audio/webm' }));
            if (text.trim()) onTextRef.current(text.trim());
          } catch (e) {
            setError((e as Error).message);
          } finally {
            setState('idle');
          }
        };
        rec.start();
        recorder.current = rec;
      } else {
        const r = new SpeechRecognitionCtor();
        r.lang = lang;
        r.continuous = true;
        r.interimResults = false;
        r.onresult = (e: any) => {
          for (let i = e.resultIndex; i < e.results.length; i++) {
            if (e.results[i].isFinal) onTextRef.current(String(e.results[i][0].transcript).trim());
          }
        };
        r.onerror = (e: any) => { setError(e.error === 'not-allowed' ? 'Permita o acesso ao microfone.' : `Ditado: ${e.error}`); setState('idle'); };
        r.onend = () => setState('idle');
        r.start();
        recognition.current = r;
      }
      setState('recording');
    } catch (e) {
      const name = (e as Error).name;
      setError(name === 'NotAllowedError' ? 'Permita o acesso ao microfone no navegador.' : (e as Error).message);
      setState('idle');
    }
  }

  function stop() {
    recorder.current?.stop();
    recognition.current?.stop();
  }

  return { state, error, supported, toggle: () => (state === 'recording' ? stop() : state === 'idle' ? start() : undefined) };
}
