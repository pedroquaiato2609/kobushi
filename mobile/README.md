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
  theme.ts              paleta de cores (espelho de web/src/styles.css, modo claro)
  lib/money.ts           formatação de dinheiro (espelho de web/src/lib/money.ts)
  api/
    client.ts            fetch autenticado + o esquema de token acima
    types.ts              tipos espelhados de web/src/api/types.ts (só o que já tem tela)
  auth/AuthContext.tsx    estado de sessão (usuário, login, logout, boot)
  navigation/RootNavigator.tsx
  screens/
    LoginScreen.tsx
    DashboardScreen.tsx   Visão geral de Finanças (saldo, receitas/despesas, renda
                          comprometida, sobra do salário, vencimentos, insights)
```

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
- [x] Dashboard de Finanças: saldo, receitas/despesas do mês, renda comprometida,
      quanto sobra do salário, próximos vencimentos, insights

## Próximos passos (nessa ordem, combinado com o usuário)

1. **Finanças**: lista de movimentações + criar movimentação, Minha renda/Recorrências,
   categorias
2. **Academia**: treinos, biblioteca de exercícios, treino ativo (séries, cronômetro
   de descanso)
3. **Agenda/Atividades**: calendário, atividades recorrentes, lembretes, deslocamentos
4. Os módulos menores (Leitura, Estudos, Princípios, Kanban, Documentos, assistente por
   chat) — ainda sem prioridade definida

Cada módulo novo é: copiar os tipos relevantes pra `src/api/types.ts`, criar a(s)
tela(s) em `src/screens/`, e adicionar ao `RootNavigator` (provavelmente virando uma
navegação em abas nessa altura, em vez de só uma stack).
