/** Leva uma frase para o chat da Home, que a envia ao abrir (usado por sugestões, insights e os botões "Ajuda da IA"/"Pedir à IA" de outras telas). */
export const PROMPT_KEY = 'ninshiki.pendingPrompt';
/** Mesma chave usada por HomePage para lembrar a última conversa aberta. */
export const CONVERSATION_KEY = 'ninshiki.conversation';

export function askAssistant(navigate: (to: string) => void, prompt: string) {
  sessionStorage.setItem(PROMPT_KEY, prompt);
  // Sempre em conversa nova: um pedido disparado de outra tela (ou de uma sugestão) não deve continuar
  // uma conversa que já estava em andamento — a Home lê esta chave ao montar para decidir a conversa ativa.
  localStorage.removeItem(CONVERSATION_KEY);
  navigate('/');
}
