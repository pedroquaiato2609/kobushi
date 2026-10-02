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
    RootNavigator.tsx      abas: Finanças, Leitura, Academia, Assistente
    FinanceStack.tsx         Finanças → movimentações, contas, renda/recorrências,
                             categorias (cada uma com cadastro/edição)
    ReadingStack.tsx         Leitura → detalhe do livro, novo livro, todos os livros
    GymStack.tsx              Academia → treino ativo, biblioteca de exercícios,
                              novo treino, novo/editar exercício
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
                              ver nota abaixo) + cartão de aprovar/rejeitar ações pendentes
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
      adicionar exercício durante o treino, finalizar, biblioteca de exercícios com
      busca, **+ novo treino** (metas por exercício), **+ novo/editar/apagar exercício**
- [x] **Assistente**: chat com o mesmo assistente do app web (mesmas ferramentas, mesmas
      confirmações antes de gravar algo) — ver a nota sobre streaming acima; sempre
      reconsulta o estado da conversa ao final do turno, mesmo quando dá erro no meio

## Bug conhecido, não resolvido (preciso de um APK de verdade pra confirmar)

No preview web do Expo (`expo start --web`), trocar de **aba** (Finanças→Leitura, por
exemplo) às vezes não troca o conteúdo da tela — a cor do ícone ativo muda (o estado do
`Tab.Navigator` atualizou), mas a tela visível continua sendo a anterior. Testei bastante
e tudo aponta pra ser um artefato específico de `@react-navigation/bottom-tabs` rodando
em `react-native-web` (que troca de tela via CSS `display`, diferente do Android nativo,
que troca de *view* no nível do sistema operacional) — mas **isso não foi confirmado num
celular Android de verdade**. Testar isso especificamente no próximo APK gerado.

## Próximos passos

1. **Agenda/Atividades**: calendário, atividades recorrentes, lembretes, deslocamentos
   — nada disso existe no app mobile ainda
2. Os módulos menores (Estudos, Princípios, Kanban, Documentos) — ainda sem prioridade
   definida
3. **Login com Google** — combinado com o usuário, esperando ele criar o projeto no
   Google Cloud Console e mandar as credenciais (client ID/secret web + Android)
4. Fechar a lacuna de Academia: metas de treino com níveis mínimo/ideal/máximo (hoje o
   app mobile só grava o nível "ideal" ao criar um treino novo)
5. Chat: múltiplas conversas (hoje só usa uma) e os botões de resposta rápida/atalho que
   o app web mostra
6. Investigar o bug de troca de aba descrito acima num APK de verdade

Cada módulo novo é: copiar os tipos relevantes pra `src/api/types.ts`, criar a(s)
tela(s) em `src/screens/`, e adicionar ao `RootNavigator` (provavelmente virando uma
navegação em abas nessa altura, em vez de só uma stack).
