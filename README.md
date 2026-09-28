# Ninshiki

Implementação do método Ninshiki: o dia como unidade, estrutura estável e intensidade adaptável
(mínimo · ideal · máximo). Quatro telas (Home com agente de IA, Agenda, Kanban, Dashboard) mais Configurações.

> **Status:** testes unitários (86) e checagem de tipos passam; a stack de produção foi construída e testada
> no Docker contra um Postgres real (migração, login, CSRF, limite de tentativas, cabeçalhos).

## Academia

Aba **Academia** (`/academia`), pensada para usar no celular dentro da academia e também no computador.

- **Treinar (modo treino):** escolha um treino ou comece um treino livre. Cronômetro geral do treino, descanso que dispara ao concluir cada série
  (ajustável em ±15 s, com aviso sonoro e vibração ao acabar), tela sempre acesa e o treino continua se você trocar de tela ou recarregar.
  Cada exercício mostra a carga da última vez e o recorde; você registra carga × repetições com os botões − / +.
- **Mínimo · ideal · máximo:** cada exercício do treino tem metas de séries × repetições × carga nos três níveis (o mesmo princípio das atividades).
  Cada série recebe o nível que atingiu; ao finalizar, o treino ganha um nível (sugerido pelas séries, você pode mudar). Se existir uma atividade
  chamada **Academia** na rotina, o nível é registrado nela no dia (sem sobrescrever um registro que você já fez).
- **Recordes (PR):** um PR é uma carga maior ou um 1RM estimado maior (fórmula de Epley) que qualquer série anterior do exercício. A primeira vez
  que você faz um exercício não conta como PR. O aviso aparece na hora e vale para o histórico e os relatórios.
- **Treinos:** monte treinos com exercícios da biblioteca, ordem, descanso, metas por nível, dias sugeridos e observações.
- **Exercícios:** 68 pré-cadastrados (nomes em português, músculos principais e auxiliares, como executar e dica), mais os seus. Ao cadastrar, você
  toca nos músculos no mapa (1º toque = principal, 2º = auxiliar) e o desenho é **gerado sozinho**. Também dá para enviar uma **foto de referência**
  (PNG/JPEG/WebP até 5 MB; o tipo é conferido pelo conteúdo do arquivo) que passa a aparecer no lugar do mapa.
- **Relatórios:** recuperação por grupo muscular (mapa de calor, ~72 h), volume semanal e por músculo, recordes de cada exercício, evolução das cargas
  (1RM estimado e maior carga por sessão) e histórico de treinos.
- **IA:** o chat consulta treinos, histórico, recordes e recuperação (ferramentas `gym_*`, com permissão por ferramenta em Configurações) e pode montar
  ou ajustar treinos e criar exercícios — sempre mostrando o resumo e **só gravando depois do seu "sim"**. Ela não registra séries: isso é feito por você
  no modo treino. Botões "Ajuda da IA"/"Análise da IA" levam a conversa já com o contexto.

Os dados ficam no seu banco (tabelas `gym_*`, migração `008_gym.sql`); o catálogo é inserido na inicialização e nunca sobrescreve o que você editar.

## Produção

```bash
cp .env.production.example .env.production      # preencha DOMAIN, ACME_EMAIL, POSTGRES_PASSWORD, DATA_ENCRYPTION_KEY...
docker compose -f docker-compose.prod.yml --env-file .env.production up -d --build
```

Requisitos: servidor com Docker, portas 80/443 livres e o DNS de `DOMAIN` apontando para ele (o Caddy emite o HTTPS sozinho).

O que a configuração de produção garante:

- **Fail-fast:** a API não inicia em produção com senha padrão do banco, sem `DATA_ENCRYPTION_KEY`, sem `ALLOWED_ORIGINS`
  ou com segredo de webhook fraco (`api/src/config.ts`, `productionProblems`). O compose também exige os segredos.
- **Rede:** só o Caddy publica portas (80/443). Banco e API ficam na rede interna.
- **Contêineres:** usuário sem privilégios, sistema de arquivos somente leitura, `no-new-privileges`, logs com rotação.
- **HTTP:** HSTS, CSP restrita (front e API), `X-Frame-Options`, `nosniff`, `Cache-Control: no-store` em `/api`.
- **Autenticação:** cookie `HttpOnly; Secure; SameSite=Lax`, checagem de Origin (CSRF), limite por IP (10/min nas rotas de senha)
  e bloqueio progressivo por conta, reautenticação para ações críticas, auditoria. Logs nunca registram cookies nem segredos.
- **Operação:** desligamento gracioso (SIGTERM), timeouts e pool de conexões limitados, healthchecks.

Depois do primeiro deploy:

1. **Crie sua conta imediatamente.** A tela de cadastro inicial fica aberta até existir o primeiro usuário.
2. **Guarde `DATA_ENCRYPTION_KEY` fora do servidor.** Sem ela, números de conta e tokens criptografados não são recuperáveis.
3. Agende `ops/backup.sh` (banco + anexos) e teste uma restauração.
4. Rode `npm run audit:prod` (API) e `npm audit` (web) periodicamente; o CI em `.github/workflows/ci.yml` já faz isso.

Desenvolvimento continua com `docker-compose.yml` (abaixo): senhas padrão, código montado por volume e hot reload.

## Subir (desenvolvimento)

```bash
cp .env.example .env          # preencha ANTHROPIC_API_KEY e/ou OPENAI_API_KEY
docker compose up --build
```

- App: http://localhost:5173
- API: http://localhost:3000/api/health

As migrações rodam sozinhas na inicialização, e na primeira vez são criados exemplos de atividades
(seção 12 do documento do método) e um quadro kanban. Edite ou apague à vontade.

Se mudar `package.json`, reconstrua os volumes de dependências: `docker compose down -v && docker compose up --build`
(atenção: `-v` também apaga o banco).

## Interface

Tema escuro com painéis arredondados. Cores com significado: violeta é a ação principal; âmbar, verde e azul são
os níveis mínimo, ideal e máximo (no dashboard, no seletor da rotina e no tour). Eventos da agenda ganham uma cor
estável por título/atividade; colunas do kanban têm cor própria.

- **Tour guiado:** abre sozinho na primeira visita (guarda `ninshiki.tour.done` no navegador) e pode ser rever
  pelo botão "Tour guiado" do menu. Os passos ficam em `web/src/components/Tour.tsx`.
- Cada tela tem uma linha de explicação no topo (`PageHeader`).
- As fontes (Manrope e Zen Old Mincho) vêm do Google Fonts; sem internet o navegador usa a fonte do sistema.
- Só há tema escuro. As cores estão em variáveis no topo de `web/src/styles.css`.

## Novidades: chat, lembretes, documentos e perfil

### Chat com digitação em tempo real
As respostas chegam por streaming (Server-Sent Events, `POST /conversations/:id/stream`) e o texto é "digitado" aos poucos.
As ações do agente aparecem em português ("Consultou a rotina do dia"). Quando o agente faz uma oferta, ela vem em balões
separados e com botões de resposta rápida ("Sim, monte a lista"). Ofertas nunca são executadas sem o seu aceite.
O agente foi instruído a economizar tempo: ao falar de uma ida ao mercado, ele consulta a agenda e propõe juntar com outra saída.

### Limites de uso da IA (erro "Rate limit reached")
Os provedores limitam tokens por minuto (na OpenAI, contas novas costumam ter 30.000/min no `gpt-4o`). Para não estourar, o app:
- reenvia só o necessário a cada passo: o histórico antigo é descartado por turnos inteiros, os resultados de ferramentas são
  encurtados e os schemas das ferramentas são compactados (`agent/history.ts`, `jsonSchema.ts`);
- quando o limite estoura mesmo assim, **espera o tempo que o provedor pede e tenta de novo** (até 4 vezes, no máximo 20 s de espera),
  mostrando "Tentando de novo em N s…" no chat. Cota esgotada (sem crédito) não é repetida: a mensagem orienta em português.
Se ainda incomodar, use um modelo com limite maior (ex.: `gpt-4o-mini`) em Configurações > Agente ou aumente o *tier* na OpenAI.

### Atividades e calendário
A aba **Atividades** mostra cada atividade com níveis, princípio, dias, histórico (28/91 dias), sequência e aviso diário.
No **calendário**, as atividades aparecem junto dos eventos (botão "Atividades" liga/desliga), sem poluir:
- **Mês:** pílulas com a cor do nível (âmbar mínimo, verde ideal, azul máximo; vazio = a fazer). Tocar num dia **entra nele**.
- **Semana:** só os eventos têm blocos; o progresso da rotina vira bolinhas no cabeçalho de cada dia e as atividades de horário
  fixo, uma linha fina na lateral. Tocar no cabeçalho abre o dia.
- **Dia:** resumo no topo (eventos, atividades, avisos), a rotina em fichas, os horários dos avisos e o botão **Voltar** para o mês/semana.

### Lembretes e notificações
A página **Lembretes** reúne tudo o que vai avisar: lembretes avulsos, o aviso diário de cada atividade e o aviso antes de cada evento,
com o próximo aviso em destaque, filtros e edição. Lembretes avulsos podem ser editados, concluídos, reativados e apagados.

Tudo cai no **sino** do app (sempre). Em cada atividade (aviso diário), evento (X minutos antes) ou lembrete avulso você escolhe
se quer também **push no celular** e/ou **WhatsApp**. O agendador roda dentro da API (a cada 30 s), não avisa atividade já
registrada no dia e nunca dispara duas vezes o mesmo aviso.

**Push (PWA):**
1. `docker compose exec api npx web-push generate-vapid-keys` e copie as chaves para `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` no `.env`.
2. `docker compose restart api`.
3. Abra o app por **HTTPS** (ou `localhost`) no celular. No iPhone (iOS 16.4+), use "Adicionar à Tela de Início" e abra por lá.
4. Configurações > Notificações > **Ativar neste aparelho** e **Enviar teste**.

**WhatsApp (Twilio):** crie uma conta na Twilio, preencha `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_WHATSAPP_FROM`
(no sandbox: `+14155238886`) e informe o seu número em Configurações > Notificações. No sandbox é preciso enviar antes o
código "join …" que a Twilio mostra. Fora da janela de 24 h desde a sua última mensagem, o WhatsApp só entrega modelos aprovados.

### Documentos
Pastas aninhadas, notas (markdown), listas (checklist "- [ ] item") e arquivos enviados (até 25 MB; texto extraído de texto puro e PDF).
Busca no título e no conteúdo, resumo por IA e o botão "Perguntar ao agente". O agente cria, lê, edita e apaga documentos
(exclusões pedem aprovação). Em cada pasta, **Ocultar do agente** o impede de ver a pasta, as subpastas e os documentos dentro
(indicado para exames e dados de saúde). Arquivos ficam no volume Docker `files`.

### Perfil e cofre
Em Configurações > Perfil, cada informação tem um nível:
- **Geral:** enviada à IA em toda conversa (nome, alergias, preferências).
- **Privado:** a IA só lê se você aprovar cada leitura.
- **Secreto:** criptografado (AES-256-GCM, chave derivada da senha por scrypt). Só abre com o cofre desbloqueado (expira em 15 min);
  5 senhas erradas bloqueiam por 1 minuto. O agente nunca cria nem altera itens secretos. **Não há recuperação de senha**:
  esquecê-la exige reiniciar o cofre, o que apaga os itens secretos.

Tudo o que a IA lê passa pelo provedor (Anthropic ou OpenAI); a tela de Perfil avisa disso.

### Celular
A interface é pensada para o celular primeiro: barra inferior (Home, Agenda, Atividades, Documentos, Mais), calendário em modo Dia,
campos sem zoom no iOS e instalação como app (PWA).

## Novidades: segurança, assistente proativo e finanças

**Segurança.** Tudo em `/api` exige login (senha com scrypt; sessão em cookie httpOnly SameSite=Lax; só o hash do token vai ao banco).
Há bloqueio após 5 tentativas erradas, lista de dispositivos com revogação, troca de senha que desconecta os outros aparelhos e confirmação de
senha (5 min) para ações críticas (excluir conta financeira, exportar ou apagar dados). O histórico de segurança nunca guarda senhas, tokens nem valores.
Números de conta são criptografados (AES-256-GCM) com `DATA_ENCRYPTION_KEY`; se ela não existir, uma chave é gerada em `FILES_DIR/.datakey`.
Valores (saldos, transações) ficam legíveis no banco para permitir consultas: proteja o disco/backup do Postgres.
Em Configurações → Segurança: dispositivos, senha, histórico, **exportar meus dados** e **apagar** (financeiros ou tudo).

**Assistente proativo.** Sugestões nascem de sinais reais (obrigação de amanhã sem lembrete, agenda concentrada à tarde, objetivo adiado
3+ dias, conflito de horário, revisão do dia, card atrasado, alertas financeiros), sempre com o motivo e os dados usados. Frequência
desligada/discreta/normal, tipos, teto por dia e horário de silêncio em Configurações → Assistente. O que você dispensa não volta.

**Finanças.** Contas e cartões (fatura aberta/fechada, pagamento como transferência), movimentações pendentes/confirmadas, categorias e
subcategorias, orçamentos, metas, recorrências e assinaturas, fluxo de caixa e patrimônio. 11 tipos de insight, cada um com os dados usados;
você pode ignorar, silenciar ou perguntar ao assistente. Avisos de vencimento, fatura e orçamento pelo sino/celular/WhatsApp. O chat consulta e
**prepara** ações financeiras com um resumo exato; elas só executam depois que você aprova, e essa confirmação não pode ser desligada.
O "uso" das assinaturas é informado por você (o app não mede o uso real).

## Open Finance (somente leitura)

Para ativar bancos reais, siga [o guia de configuração](OPEN_FINANCE.md).
Sem uma aplicação Pluggy habilitada e o consentimento do titular, não há acesso a dados reais.

Finanças → **Conexões**. O contrato do provedor (`application/openFinance/types.ts`) **não tem nenhuma operação de pagamento ou transferência**
(há um teste que garante isso). A senha bancária é digitada só no fluxo oficial da instituição/provedor, nunca no Ninshiki; a chave do provedor
fica só no servidor e o identificador de cada conexão é criptografado no banco.

- **Consentimento explícito** (caixa obrigatória, com o que é lido e o que nunca será feito), com **prazo**: o app avisa 30 dias antes de vencer e marca como vencido.
- **Estado por instituição:** atualizada / atualizando / erro / precisa renovar / vencida / revogada, com a última atualização. Atualização automática a cada 6 h e "Atualizar agora".
- **Sem duplicar:** cada movimentação do banco é registrada uma vez (tabela `of_seen`); o que você apagar não volta.
- **Seus lançamentos manuais são preservados:** se o valor bate com um lançamento seu único (mesma conta, até 3 dias), o Ninshiki só vincula e confirma; se houver dúvida, importa como nova.
- **Transferências entre suas contas** (saída + entrada de mesmo valor em até 1 dia, par único) viram um lançamento só, sem contar como receita/despesa. Pagamento de fatura idem.
- **Saldo do banco × saldo calculado:** o saldo informado pela instituição é guardado; se divergir do calculado, a conta mostra um aviso.
- **Renovar / revogar:** ao revogar você escolhe manter ou apagar o que foi importado (pede a senha).

Sem `PLUGGY_CLIENT_ID`/`PLUGGY_CLIENT_SECRET` só existe o **banco de demonstração** (dados fictícios, marcados como DEMO). Com as credenciais, o provedor real
passa a ser o padrão (opcional: `PLUGGY_WEBHOOK_URL`, `PLUGGY_CONNECT_SCRIPT`).

## Identidade visual

A marca (`web/public/logo.svg`, `logo-mark.svg`, `favicon.svg`, ícones PWA) é uma espiral aberta (ensō) feita dos três níveis do método — âmbar (mínimo),
verde (ideal), azul (máximo) — envolvendo uma íris: 認識, "perceber". No app ela é o componente `Logo` (`components/Logo.tsx`).

## Arquitetura

```
api/src
  domain/          vocabulário do método (níveis, tipos, datas puras, erros)
  application/     schemas zod, ports (interfaces dos repositórios) e serviços = os casos de uso
  infrastructure/  Postgres (repositórios), migrações, seed, transcrição de voz
  agent/           provedores de IA, tools, permissões, orquestrador
  http/            rotas Fastify (finas: validam e chamam um serviço)
  container.ts     único lugar que conhece as implementações concretas
web/src            pages/, components/, hooks/, api/ (cliente + tipos), lib/
```

**Princípio central:** a interface manual e o agente são dois clientes da **mesma** camada
`application/services.ts`. Nunca implemente uma regra numa rota ou numa tool: implemente no serviço.
Os schemas em `application/schemas.ts` também são compartilhados (rotas e tools).

### O agente

Cada tool em `agent/tools.ts` é um adaptador fino sobre um caso de uso. O modelo só recebe as tools
que não estão em **Negar**, mas a permissão é checada de novo no servidor na hora de executar
(`agent/runner.ts`). **Perguntar** cria uma ação pendente (`agent_actions`) que você aprova na Home.

### Estender

- **Nova capacidade para o agente:** crie o caso de uso em `services.ts` e adicione uma tool em `tools.ts`.
  Ela aparece sozinha em Configurações > Permissões (padrão: exclusão pergunta, o resto é permitido).
- **Novo provedor de IA:** implemente `LLMProvider` (`agent/providers/`) e registre em `providers/index.ts`.
- **Nova tabela:** adicione `api/migrations/003_*.sql`; migrações são aplicadas em ordem e uma única vez.

## Testes

```bash
cd api && npm install && npm test
```

Cobrem regras de atividade e estatísticas, conversão de mensagens e **streaming** Anthropic/OpenAI (incluindo eventos cortados ao meio),
o loop completo do agente (permitir, perguntar, negar, botões de resposta), o cofre e a criptografia, o agendador de lembretes
e as regras de visibilidade de documentos, com repositórios em memória e a API simulada. Também cobrem autenticação (bloqueio, sessões,
reautenticação, auditoria), a matemática financeira (saldos, faturas, orçamentos, insights), o motor de sugestões (limites, silêncio, não repetir)
o fluxo de confirmação das ações financeiras do agente e o Open Finance (planejador de importação, ciclo completo com o banco de demonstração,
revogação, consentimento e o adaptador Pluggy com respostas simuladas). **As migrações 003, 004 e 005 e os repositórios Postgres ainda não foram exercitados contra um banco real.**

## Limitações conhecidas

- **Um único usuário (o dono).** O primeiro acesso cria a conta e o cadastro fecha. As tabelas de finanças são separadas por usuário,
  mas rotina, agenda, kanban, documentos e chat são de instância única. Para expor fora da sua rede, use HTTPS (ex.: Tailscale com
  `tailscale serve`) e, se o proxy mudar o Host, defina `ALLOWED_ORIGINS`.
- **Sem scanner de notas nem investimentos ainda.** Dados de demonstração (inclusive o banco fictício do Open Finance) são sempre marcados como DEMO.
- **O adaptador Pluggy (Open Finance real) nunca foi executado contra a API de verdade** e o widget de conexão nunca foi aberto: foi escrito pela documentação e testado com respostas simuladas. Valide com uma conta *sandbox* da Pluggy antes de confiar (as premissas estão marcadas com "PREMISSA" em `pluggyProvider.ts`).
- **O cofre é global do servidor:** ao desbloqueá-lo, ele fica aberto para qualquer pessoa que acesse o app até expirar (15 min) ou você bloquear.
- Imagens e PDFs escaneados são guardados, mas o agente não os lê (sem OCR/visão ainda).
- Se o WhatsApp ou o push falharem, o aviso continua chegando no sino do app.
- **Horários da agenda são hora local sem fuso** (`timestamp`), e "hoje" no navegador usa o fuso do navegador.
  Se viajar, ajuste `APP_TIMEZONE`.
- Uma atividade tem uma única janela de horário (ex.: trabalho 08:00–17:30, sem intervalo de almoço).
- Arrastar cards do kanban usa drag-and-drop nativo (não funciona em touch); no celular, mude a coluna
  pelo modal do card.
- Ditado no modo "servidor" exige `OPENAI_API_KEY`, mesmo que o chat use Claude. O modo "navegador" é gratuito.
- Os tipos do frontend (`web/src/api/types.ts`) espelham os do backend à mão. Se crescer, extraia um pacote compartilhado.

## Questões de método ainda em aberto

Não estão codificadas de propósito, pois pedem decisão sua: o que dispara um "dia de baixa capacidade",
a definição de "essencial" para obrigações, quando revisar mínimo/ideal/máximo, o que fazer quando o dia
não comporta tudo, e a nota 0–10 da meditação como exceção assumida à filosofia sem pontuação.
