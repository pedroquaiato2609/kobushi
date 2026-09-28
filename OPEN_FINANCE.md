# Conectar dados bancários reais

O Ninshiki usa a API da Pluggy para importar contas, saldos e transações. Sem as
credenciais, está disponível apenas a demonstração. As correções foram testadas
com respostas simuladas; a validação com um banco real depende das etapas abaixo.

1. Crie sua conta no [painel da Pluggy](https://dashboard.pluggy.ai) e uma aplicação.
   Confirme com a Pluggy o acesso a instituições reais, cobertura do seu banco e
   condições comerciais. Uma conexão sandbox continua trazendo dados fictícios.
2. Coloque o Client ID e o Client Secret dessa aplicação no arquivo `.env` desta pasta:

   ```dotenv
   PLUGGY_CLIENT_ID=seu_client_id
   PLUGGY_CLIENT_SECRET=seu_client_secret
   ```

   Não envie essas chaves pelo chat e não as coloque no frontend.
3. Nesta pasta, recrie somente o serviço da API para carregar as novas variáveis:

   ```powershell
   docker compose up -d --force-recreate api
   ```

4. Abra Finanças → Conexões. Deve aparecer **Open Finance (via Pluggy)** e
   **Conectar meu banco**. Aceite a leitura, escolha sua instituição real no widget
   e conclua a autorização solicitada pela instituição/provedor.
5. Aguarde a importação. Compare saldo e algumas movimentações com o aplicativo
   do banco. Use **Atualizar agora** para consultar novamente os dados da Pluggy.
   A API consulta o provedor a cada 6 horas; a frequência de coleta do banco é
   determinada pela Pluggy, pelo plano e pela instituição, não por esse botão.

As conexões DEMO existentes continuam fictícias. Conecte seu banco separadamente.
Você pode revogar a demonstração e escolher apagar seus dados pela interface.
O Ninshiki não possui operações de pagamento ou transferência bancária.

## Diagnóstico

- Só aparece demonstração: verifique se as duas variáveis foram preenchidas e
  se o contêiner da API foi recriado (um simples restart não recarrega o `.env`).
- Falha de autenticação: confira as credenciais da aplicação no painel da Pluggy.
- Instituição indisponível: confirme cobertura e habilitação com a Pluggy.
- Precisa renovar: reabra a autorização pelo botão Renovar consentimento.
- Atualizando: o banco ainda está preparando os dados; a conexão não será marcada
  como atualizada antes de os dados estarem disponíveis.

## Limites desta versão

São importados inicialmente até 90 dias de transações. Faturas são calculadas pelo
Ninshiki a partir das transações; não há importação do endpoint de faturas do banco.
O receptor de webhooks está disponível em `/webhooks/pluggy`, protegido pelo cabeçalho
`X-Webhook-Secret`. Notificações são persistidas com conteúdo criptografado, deduplicadas
pelo eventId e processadas em segundo plano a cada 30 segundos, com novas tentativas.
Somente conexões já autorizadas no Ninshiki são sincronizadas. Itens criados pelo painel
da Pluggy, incluindo o item de teste do webhook, não importam dados para sua conta.
Mantenha a tela de conexão aberta até concluir; vinculação automática de conexões
iniciadas e abandonadas antes do callback ainda não está implementada.
Eventos de exclusão de transações geram aviso de revisão; não apagam automaticamente
lançamentos que podem estar conciliados ou pareados com transferências.
Atualizações usam a janela de importação existente, não todo o histórico bancário.
As chaves no servidor não substituem o consentimento do titular.

## Webhooks locais por túnel HTTPS

O arquivo `docker-compose.webhooks.yml` adiciona um gateway que publica apenas
`POST /webhooks/pluggy` e um túnel temporário Cloudflare. A API e as demais rotas
não ficam disponíveis por esse endereço. Docker e computador precisam estar ligados.

```powershell
docker compose -f docker-compose.yml -f docker-compose.webhooks.yml up -d webhook-gateway webhook-tunnel
docker compose -f docker-compose.yml -f docker-compose.webhooks.yml logs webhook-tunnel
```

O log mostra um endereço `https://...trycloudflare.com`. Ele pode mudar quando o
túnel reinicia. O endereço usado na configuração inicial está em `ops/webhook-url.txt`.
Se mudar, atualize o registro (e o arquivo local) com o novo endereço:

```powershell
docker compose exec -T api node scripts/register-pluggy-webhook.mjs https://SEU-ENDERECO.trycloudflare.com/webhooks/pluggy
```

O script cria/atualiza somente o registro gerenciado pelo Ninshiki, seleciona `all`
e configura o cabeçalho secreto pela API. Não cadastre outra cópia pelo painel e
não configure `PLUGGY_WEBHOOK_URL` no token: o registro global já entrega os eventos
com autenticação. O identificador do registro fica no volume de arquivos da API.
O segredo foi gerado em `.env` (`PLUGGY_WEBHOOK_SECRET`); não deve ser compartilhado.

Para parar:

```powershell
docker compose -f docker-compose.yml -f docker-compose.webhooks.yml stop webhook-tunnel webhook-gateway
```

O túnel é para desenvolvimento. Antes do uso contínuo em produção, troque por um
domínio estável hospedado ou túnel gerenciado e atualize o webhook.

Referências: [autenticação](https://docs.pluggy.ai/en/docs/authentication),
[widget](https://docs.pluggy.ai/en/docs/connect-widget/environments),
[renovação](https://docs.pluggy.ai/en/recipes/update-an-item-using-pluggy-connect),
[estados da conexão](https://docs.pluggy.ai/en/docs/connections/item-lifecycle).
