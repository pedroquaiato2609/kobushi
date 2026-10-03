# Ninshiki Mobile

App nativo Android (React Native + Expo) do Ninshiki. Usa a **mesma API** do app web
(`api/`) — nenhum dado ou lógica de negócio é duplicado no backend; esse app só consome
os mesmos endpoints REST que `web/` já usa.

## Por que Expo (e não React Native "puro")

Dá pra gerar um `.apk` instalável via build na nuvem (EAS) sem precisar de Android
Studio, Java ou um Mac instalados nesta máquina. O fluxo de desenvolvimento roda com
`npx expo start` e o app abre no celular pelo Expo Go (ou no navegador, só pra ver o
layout rápido, com `npx expo start --web`).

## Autenticação: como funciona sem navegador

A API usa sessão por **cookie HttpOnly** (`ninshiki_session`), pensado pro navegador.
Um app nativo não tem cookie jar de navegador, então:

1. `POST /auth/login` e `/auth/setup`, quando a chamada vem com o cabeçalho
   `x-ninshiki-client: mobile`, devolvem o token da sessão também no corpo da resposta
   (além de continuar setando o cookie normalmente — o fluxo web não muda em nada,
   porque o navegador nunca manda esse cabeçalho).
2. O app guarda esse token no `expo-secure-store` (Keystore do Android).
3. Em toda chamada seguinte, o app monta o cabeçalho `Cookie: ninshiki_session=<token>`
   na mão — o servidor não liga pra como o cookie chegou, só lê o header.

Essa ponte fica toda em `src/api/client.ts`.

## Estrutura

```
src/
  config.ts            URL base da API (EXPO_PUBLIC_API_URL ou produção por padrão)
  theme.ts              paleta de cores + raio de borda (espelho de web/src/styles.css)
  components/Icon.tsx    ícones SVG finos — cópia fiel de web/src/components/Icon.tsx
                         (mesmos paths, mesmo traço), usando react-native-svg. Nada de
                         emoji na navegação/ações; o 🏆 de recorde pessoal é a única
                         exceção, porque o próprio app web usa esse emoji ali também
  lib/
    money.ts             formatação/parsing de dinheiro (espelho de web/src/lib/money.ts)
    dates.ts              data de hoje (ISO) e formatação dd/mm
    gym.ts                 rótulos de músculo/equipamento (espelho de web/src/lib/muscles.ts)
    reading.ts             rótulos/ordem de status e cálculo de progresso (espelho de
                           web/src/lib/reading.ts)
    labels.ts               rótulos de recurso/ação pro cartão de confirmação do chat
  api/
    client.ts            fetch autenticado + o esquema de token acima
    types.ts              tipos espelhados de web/src/api/types.ts (só o que já tem tela)
  auth/AuthContext.tsx    estado de sessão (usuário, login, logout, boot)
  navigation/
    RootNavigator.tsx      abas: Finanças, Leitura, Academia, Mais, Assistente
    FinanceStack.tsx         Finanças → movimentações, contas, renda/recorrências,
                             categorias (cada uma com cadastro/edição)
    ReadingStack.tsx         Leitura → detalhe do livro, novo livro, todos os livros
    GymStack.tsx              Academia → treino ativo, biblioteca de exercícios,
                              novo treino, novo/editar exercício
    MoreStack.tsx             Mais → menu com os 8 módulos menores (Agenda, Atividades,
                              Lembretes, Deslocamentos, Princípios, Estudos, Kanban,
                              Documentos) — mesmo padrão do app web, que também separa
                              "abas principais" de um menu "Mais" (lá por espaço na barra
                              inferior; aqui porque 9 abas não caberiam/ficariam legíveis)
  screens/
    LoginScreen.tsx
    DashboardScreen.tsx   Visão geral de Finanças (saldo, receitas/despesas, renda
                          comprometida, sobra do salário, vencimentos, insights) +
                          atalhos pras telas abaixo
    finance/
      NewTransactionScreen.tsx cria OU edita uma movimentação (apaga também)
      TransactionsScreen.tsx    lista do mês, com navegação mês a mês
      AccountsScreen.tsx + NewAccountScreen.tsx       contas/cartões
      RecurringScreen.tsx + NewRecurringScreen.tsx    Minha renda + Recorrências
                                                      (pausar/editar/apagar, desconto %)
      CategoriesScreen.tsx + NewCategoryScreen.tsx    categorias (com subcategoria e cor)
    reading/
      ReadingScreen.tsx      estante (lendo agora / quero ler) + estatísticas
      BookDetailScreen.tsx    progresso, status (chips), nota (estrelas), registrar
                              sessão, histórico, excluir livro
      NewBookScreen.tsx        adicionar um livro à estante
      AllBooksScreen.tsx       todos os livros, com filtro por status
    gym/
      WorkoutsScreen.tsx      treinos cadastrados, treino em andamento, treino livre
      ActiveWorkoutScreen.tsx registrar séries (musculação e cardio, com a lógica de
                              "sessão única" do app web), cronômetro, finalizar
      ExercisePickerScreen.tsx buscar e adicionar um exercício ao treino em andamento
      ExerciseLibraryScreen.tsx buscar/ver todos os exercícios cadastrados
      NewExerciseScreen.tsx    cria OU edita um exercício (nome, tipo, equipamento,
                               sessão única, músculos); apaga os que você mesmo criou
      NewWorkoutScreen.tsx     cria um treino: nome, dias da semana, exercícios com
                               meta (só o nível "ideal" por enquanto — o app web
                               também deixa configurar mínimo/máximo)
    chat/
      ChatScreen.tsx          conversa com o assistente (envio síncrono, sem streaming —
                              ver nota abaixo) + lista/trocar/apagar/criar conversa (modal),
                              sugestões de pergunta na conversa vazia, chips do que o
                              agente fez em cada turno, botões de resposta rápida
                              (offer_options) e cartão de aprovar/rejeitar ações pendentes
    agenda/
      AgendaScreen.tsx         dia selecionado (anterior/próximo) em formato de LISTA
                              cronológica — atividades aplicáveis, deslocamentos e eventos,
                              com nível do dia direto ali. Não é a grade visual (TimeGrid)
                              do app web: pra tela de celular uma lista por horário é mais
                              apropriado, e evitou reconstruir um componente de calendário
                              inteiro só pro mobile
    activities/
      ActivitiesScreen.tsx     lista (filtro por tipo, arquivadas), nível do dia inline
      NewActivityScreen.tsx    cria OU edita — paridade completa com o app web: horário
                              diferente por dia da semana (toggle "horário diferente em
                              algum dia"), e botão de sugestão de melhor horário por IA
                              pra atividades de horário livre/período
    reminders/
      RemindersScreen.tsx      lista unificada (lembrete avulso + atividade + deslocamento
                              + evento) igual à do app web; editar um evento ainda não
                              existe no mobile (só mostra, não abre)
      NewReminderScreen.tsx    cria OU edita um lembrete avulso
    commutes/
      CommutesScreen.tsx + NewCommuteScreen.tsx   deslocamento ancorado numa atividade de
                              horário definido, com prévia dos horários calculados
    principles/
      PrinciplesScreen.tsx     mesma trava por senha do Cofre do app web (sem cripto no
                              cliente — o servidor guarda o desbloqueio por um tempo),
                              pastas, lista de princípios
      NewPrincipleScreen.tsx   cria OU edita
    kanban/
      KanbanScreen.tsx         quadros, colunas e cards — SEM arrastar-e-soltar (não tem
                              lib de drag-and-drop instalada, e não dava pra verificar uma
                              dependência nativa nova sem gerar um build); mover um card de
                              coluna é feito no detalhe do card, escolhendo a nova coluna
      CardDetailScreen.tsx     título, descrição em texto simples (o app web usa editor
                              rico), coluna, prazo, atividade relacionada, apagar
    documents/
      DocumentsScreen.tsx      pastas, busca, nota/lista/arquivo — SEM enviar arquivo
                              nesta versão (precisaria de expo-document-picker, uma
                              dependência nativa nova ainda sem build pra testar); um
                              arquivo já enviado pelo app web aparece e dá pra abrir/baixar
                              no navegador do celular
      NewDocScreen.tsx         nota em texto simples, lista em formato de checklist, ou
                              visualização de arquivo
    study/
      StudyScreen.tsx          abas Notas / Planos de estudo
      NewStudyNoteScreen.tsx   nota em texto simples (o app web usa um editor rico/TipTap
                              que guarda HTML — uma nota editada aqui perde a formatação
                              se reaberta no app web)
      StudyPlanDetailScreen.tsx lista de aulas com check, adicionar aula nova
```

## O chat não usa streaming (por enquanto)

O app web mostra a resposta do assistente "digitando" aos poucos via Server-Sent
Events. O React Native não tem um jeito confiável e simples de ler uma resposta HTTP em
pedaços (sem bibliotecas nativas extras), então o app mobile usa o endpoint síncrono
(`POST /conversations/:id/messages`, sem `/stream`): a tela mostra "Pensando…" e a
resposta inteira aparece de uma vez quando o turno termina. Funcionalmente é a mesma
coisa (mesmas ferramentas, mesma confirmação de ações), só não tem o efeito de
"digitando". Dá pra trocar pra streaming depois com `react-native-sse` ou similar, se
fizer falta.

## Rodando em desenvolvimento

```bash
cd mobile
npm install
npx expo start              # mostra um QR code — abre no celular com o app Expo Go
npx expo start --web        # preview rápido no navegador (só pra conferir layout)
```

Por padrão aponta pra produção (`https://kobushi.vps-kinghost.net/api`). Pra apontar
pra uma stack local, crie um `.env.local` (já está no `.gitignore`):

```
EXPO_PUBLIC_API_URL=http://SEU_IP_NA_REDE:3000/api
```

(use o IP da máquina na rede local, não `localhost` — o celular/emulador não entende
`localhost` como "esta máquina").

## Gerando o `.apk` (build de verdade, pra instalar no celular)

Isso roda na nuvem da Expo (EAS), de graça no plano free. Passos (únicos, uma vez):

```bash
npm install -g eas-cli
eas login                      # precisa de uma conta gratuita em expo.dev
eas build:configure
eas build -p android --profile preview
```

Ao terminar, a EAS dá um link pra baixar o `.apk` direto — manda esse link pro celular
(por e-mail, WhatsApp, etc.) e instala normalmente (o Android vai pedir pra liberar
"instalar de fontes desconhecidas" na primeira vez, já que não veio da Play Store).

## O que já tem

- [x] Login/logout com sessão persistida (fecha o app e continua logado)
- [x] Visual: ícones SVG finos (mesmo traço do app web, sem emoji de navegação/ação),
      cantos arredondados no mesmo raio do app web, status bar respeitada em toda tela
      sem header nativo (`useSafeAreaInsets`)
- [x] **Finanças**: dashboard (saldo, receitas/despesas do mês, renda comprometida,
      sobra do salário, vencimentos, insights) + nova/editar/apagar movimentação, lista
      de movimentações por mês, contas/cartões (cadastro/edição/arquivar), Minha
      renda/Recorrências (cadastro/edição/apagar, pausar, desconto %), categorias
      (cadastro/edição/apagar, cor, subcategoria)
- [x] **Leitura**: estante (lendo agora / quero ler) com progresso, estatísticas
      (sequência, páginas no mês, lidos no ano), todos os livros com filtro por status,
      detalhe do livro (progresso, status, nota em estrelas, registrar sessão, histórico,
      excluir), **+ novo livro**
- [x] **Academia**: lista de treinos, "treino livre", treino ativo com registro de série
      (musculação: carga/repetições, já pré-preenchida pela meta; cardio: minutos/km,
      com a mesma lógica de "sessão única" x "várias séries" do app web), cronômetro
      isolado num componente próprio (não derruba a performance do resto da tela),
      adicionar exercício durante o treino, biblioteca de exercícios com busca,
      **+ novo treino** (metas por exercício nos 3 níveis — mín./ideal/máx., igual ao app
      web), **+ novo/editar/apagar exercício** —
      **finalizar treino** abre um popup com resumo (duração, séries, volume, recordes),
      exercícios feitos, escolha de nível (mín./ideal/máx.) e observações, igual ao app web
- [x] **Assistente**: chat com o mesmo assistente do app web (mesmas ferramentas, mesmas
      confirmações antes de gravar algo) — ver a nota sobre streaming acima; sempre
      reconsulta o estado da conversa ao final do turno, mesmo quando dá erro no meio;
      múltiplas conversas (listar, trocar, criar, apagar), sugestões de pergunta na
      conversa vazia, chips do que o agente executou em cada turno e os botões de
      resposta rápida que o assistente oferece
- [x] **Mais** (menu com os módulos abaixo, todos verificados ponta a ponta contra um
      backend de teste — criar, ver e, quando faz sentido, editar/apagar):
      - **Dashboard**: período (7/30/90 dias), resumo, gráfico de barras por dia e por
        atividade (feito só com `View`, sem lib de gráfico — não roda no navegador/React
        Native a mesma lib que o app web usa), card de leitura, resumo de meditação
        (**+ registrar**), revisões recentes (**+ revisão de hoje**)
      - **Agenda**: dia selecionado em lista cronológica (atividades, deslocamentos,
        eventos), **+ criar/editar/apagar evento**
      - **Atividades**: cadastro completo (tipo, horário fixo/período/livre, dias da
        semana, níveis, lembrete), nível do dia
      - **Lembretes**: lista unificada (avulsos + atividades + deslocamentos + eventos),
        **+ novo lembrete avulso**; tocar num evento abre a edição completa dele
      - **Deslocamentos**: ancorado numa atividade de horário definido, com prévia do
        horário calculado por dia da semana
      - **Princípios**: protegidos pela senha do Cofre, organizados em pastas
      - **Estudos**: notas (texto simples) e planos de estudo (aulas com check)
      - **Kanban**: quadros, colunas, cards (mover de coluna sem arrastar, pelo detalhe)
      - **Documentos**: notas, listas (checklist) e arquivos em pastas, com busca
      - **Configurações**: Conta (dados, trocar senha, dispositivos conectados e
        desconectar, **+ exportar meus dados / apagar dados financeiros / apagar tudo —
        LGPD**, cada ação pedindo a senha de novo), Cofre & Perfil
        (criar/desbloquear/trocar/reiniciar o Cofre + informações que a IA usa, nos 3
        níveis de confidencialidade), Notificações (sino, celular/push e WhatsApp, cada
        um com botão de teste), **Agente** (provedor/modelo de IA, instruções
        permanentes, idioma/tom), **Assistente proativo** (quando e o que ele pode
        sugerir sozinho, silêncio, revisão diária/semanal), **Permissões** (o que o
        agente pode fazer sozinho, ferramenta por ferramenta, com 3 atalhos prontos) e
        **Histórico** (tudo que o agente já tentou/fez, com detalhe técnico)

## "Trocar de aba não carrega" — achada a causa real (não era navegação)

Histórico, porque as duas primeiras tentativas investigaram a coisa errada:

**1ª tentativa**: suspeitei de um bug do `react-native-screens` específico de build de
release ([software-mansion/react-native-screens#4649](https://github.com/software-mansion/react-native-screens/issues/4649))
e tentei corrigir com `detachInactiveScreens={false}`. Piorou num aparelho de verdade
(várias abas paravam de carregar, app mais lento) — revertido pro padrão da biblioteca.

**2ª tentativa**: suspeita de um bug diferente, já corrigido oficialmente em versões
recentes do `@react-navigation/bottom-tabs` — descartada ao confirmar que a versão aqui
(`7.20.0`) já era a mais recente estável.

**Causa real, confirmada com reprodução isolada** (interceptando a chamada de rede via
Puppeteer e cronometrando): a aba trocava **certinho** — o sintoma "ícone fica roxo e
fica girando pra sempre" era uma chamada à API que **nunca recebia resposta nem erro**,
deixando `isLoading` travado em `true` pro resto da vida da tela. Não era bug de
navegação nenhum. A suspeita mais forte do que causava a chamada travar: o registro de
notificação push (`registerForPushNotifications`, novo nesta sessão), que faz uma
chamada ao serviço do Google pra gerar o token — e um projeto Firebase recém-criado pode
demorar muito ou nunca responder nessa primeira chamada.

**Correção, em 3 partes, cada uma confirmada com reprodução isolada antes de buildar**:
1. `src/api/client.ts`: toda chamada da API agora tem um limite de **15s** — usa
   `Promise.race` contra um cronômetro, não só `AbortController`/`signal` (testado: o
   `fetch` do preview web **ignora** `signal`, então só abortar não bastava; com a
   corrida contra o relógio, a tela para de esperar de qualquer jeito, mesmo que a
   requisição de rede continue tentando sozinha por trás)
2. `src/lib/notifications.ts`: cada passo do registro de push (criar canal, checar/pedir
   permissão, gerar o token) tem seu próprio limite de tempo — nunca mais trava o app
   esperando o Google responder
3. `App.tsx`: o `QueryClient` não tenta de novo automaticamente quando o erro já foi um
   timeout/falha de conexão (`retry` virou uma função) — com o `retry: 1` antigo, um
   timeout de 15s virava 30s de espera (a 2ª tentativa também demorava 15s) antes do
   erro aparecer

E, pra TODA tela que faz uma consulta (eram ~17 sem nenhum tratamento de erro — um
problema à parte, achado nessa investigação): `src/components/QueryError.tsx`, mostrado
sempre que uma consulta falha, com a mensagem de erro de verdade (ex.: "Tempo esgotado
(15s): GET /gym/sessions/active") e um botão de tentar de novo, em vez de ficar girando
pra sempre sem dizer por quê.

## Próximos passos

1. **Login com Google** — combinado com o usuário, esperando ele criar o projeto no
   Google Cloud Console e mandar as credenciais (client ID/secret web + Android). É o
   único item pendente que o usuário pediu para deixar de fora da passada de "fazer tudo
   que falta" — depende de uma credencial que só ele pode gerar.
2. **Voz**: configuração do ditado por voz — não existe porque o mobile ainda não tem
   ditado por voz (precisaria de uma dependência nativa nova, sem build pra testar ainda)
3. O que ficou de fora por exigir uma dependência nativa nova (sem build pra testar
   ainda) ou por ser uma reescrita grande demais:
   - Upload de arquivo em Documentos (precisa de `expo-document-picker`)
   - Editor de texto rico em Estudos/Documentos/Kanban (hoje é texto simples; o app web
     usa TipTap, que não roda em React Native)
   - Arrastar-e-soltar no Kanban (mover card de coluna já funciona, só não por drag)
   - Agenda como grade visual (TimeGrid) em vez de lista — plausível, mas é um
     componente de calendário à parte, não só "mais uma tela"
   - Efeito de "digitando" no chat (streaming) — ver a nota dedicada acima

Cada módulo novo é: copiar os tipos relevantes pra `src/api/types.ts`, criar a(s)
tela(s) em `src/screens/`, e adicionar ao `MoreStack` (ou ao `RootNavigator`, se for
grande o bastante pra virar uma aba própria).

## Bug de backend achado testando a tela de LGPD ("apagar tudo")

Ao verificar o botão **Apagar tudo e reiniciar** (novo em Configurações → Conta) contra
um backend de teste de verdade, `DELETE /privacy/everything` sempre dava **500** —
mesmo com a conta corretamente apagada do banco (a sessão já morria, mas o usuário via
um erro). Causa: `PgExportRepository.eraseEverything()`
(`api/src/infrastructure/repositories/exportRepository.ts`) tentava `rm()` na própria
pasta `FILES_DIR`, que em todo ambiente Docker (desenvolvimento e produção) é um
**ponto de montagem** — não dá pra remover o ponto de montagem em si
(`EBUSY: resource busy or locked, rmdir '/data/files'`), só o que tem dentro dele.
Corrigido para apagar o **conteúdo** da pasta (`readdir` + `rm` de cada entrada), sem
tocar na pasta em si. Re-testado contra o mesmo backend: `204` e sessão encerrada
corretamente. Suite completa (231 testes) e `tsc --noEmit` seguem passando.
