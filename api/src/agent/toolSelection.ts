// Poupa tokens: cada chamada ao modelo reenvia todos os schemas de ferramentas do zero (não há "memória" de turnos
// anteriores nesse aspecto), e isso é o que mais pesa no limite por minuto dos provedores — por isso as ferramentas
// de um assunto só vão ao modelo quando a conversa é sobre aquele assunto.
const FINANCE_HINT = /(finan|gast(o|ei|ar|ando|os)\b|despes|receit|saldo|fatura|cart[aã]o|or[cç]ament|invest|assinatur|pagament|pagar|\bpago\b|r\$|sal[aá]rio|categoria|parcela|banco|\bpix\b|dinheiro|econom|mercado|combust|aluguel|vencimento|transfer[eê]nc|meta de|reserva|patrim)/i;
const GYM_HINT = /(trein|academia|malha[çc]|exerc[ií]cio|supino|agachamento|levantamento terra|deadlift|halter|barra fixa|musculaç|s[ée]rie(s)?\b|repeti[çc][ãa]o|repeti[çc][õo]es|descanso entre|\b1\s?rm\b|recorde pessoal|\bpr\b.*(trein|exerc[ií]cio)|b[íi]ceps|tr[íi]ceps|deltoide|peitoral|quadr[íi]ceps|isquiotibial|panturrilha|gl[úu]teo|rosca\b|remada\b|leg press)/i;
const READING_HINT = /(leitur|\blivro|\bl[êe](r|ndo)\b|\bli\b|p[áa]gina|autor|isbn|estante|capítulo|cap[íi]tulo|ebook|audiobook|resenha|releit)/i;
const STUDY_HINT = /(estud|anota[çc][ãa]o|anota[çc][õo]es|plano de estudo|aula(s)?\b|apostila|prova|conte[úu]do|mat[ée]ria|resumo|revis[ãa]o de mat|curso\b|disciplina|assunto)/i;

function mentionsPrefix(recent: { role: string; content?: string; name?: string; toolCalls?: { name: string }[] }[], hint: RegExp, prefix: string): boolean {
  return recent.slice(-8).some((m) =>
    (typeof m.content === 'string' && m.role !== 'tool' && hint.test(m.content)) ||
    (m.role === 'tool' && (m.name ?? '').startsWith(prefix)) ||
    (m.toolCalls ?? []).some((c) => c.name.startsWith(prefix)));
}

export const isFinanceConversation = (recent: Parameters<typeof mentionsPrefix>[0]) => mentionsPrefix(recent, FINANCE_HINT, 'fin_');
export const isGymConversation = (recent: Parameters<typeof mentionsPrefix>[0]) => mentionsPrefix(recent, GYM_HINT, 'gym_');
export const isReadingConversation = (recent: Parameters<typeof mentionsPrefix>[0]) => mentionsPrefix(recent, READING_HINT, 'reading_');
export const isStudyConversation = (recent: Parameters<typeof mentionsPrefix>[0]) => mentionsPrefix(recent, STUDY_HINT, 'study_');
