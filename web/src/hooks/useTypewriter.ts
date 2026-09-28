import { useEffect, useRef, useState } from 'react';

/**
 * Efeito de digitação: mostra `text` aos poucos, acelerando quando o texto real chega mais rápido
 * do que a "digitação" (então nunca fica muito atrasado). `resetKey` reinicia quando o trecho muda.
 */
export function useTypewriter(text: string, resetKey: string | number = 0): string {
  const [shown, setShown] = useState(0);
  const target = useRef(text.length);
  target.current = text.length;

  useEffect(() => { setShown(0); }, [resetKey]);
  useEffect(() => {
    let frame = 0;
    const tick = () => {
      setShown((cur) => {
        const behind = target.current - cur;
        return behind <= 0 ? cur : Math.min(target.current, cur + Math.max(1, Math.ceil(behind / 20)));
      });
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, []);

  return text.slice(0, shown);
}
