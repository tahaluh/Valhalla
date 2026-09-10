# Compatibilidade com o Sistema Olímpo

Esta integração foi conferida contra o `tournamenter-obr` **2026.1.5**, commit `feb91c1263db1caedff843d3c7b3fe683dec3a2e`, especialmente os arquivos `SyncModule.js`, `scripts_api/api.js` e `scripts_config/importar.js`.

## Importação

O fluxo consulta:

```http
GET https://olimpo.robocup.org.br/api/events/steps/participants?token=<TOKEN>
Accept: application/json
```

A resposta esperada é uma etapa com `id`, `name` e `teams` — ou `participants` para tolerar a outra nomenclatura usada por versões do serviço. Cada equipe precisa ter `id` e pode informar `name`, `institution`, `school`, `organization`, `entity`, `city` e `state`.

O Valhalla mantém os mesmos vínculos essenciais do plugin:

- `externalId` corresponde a `olimpoId`;
- `externalStepId` corresponde a `stepId`;
- `externalEventToken` corresponde a `token`;
- `externalStepName` preserva a identificação legível da etapa.

Antes de alterar a base, o administrador recebe a comparação entre o retorno e as equipes locais. A aplicação ocorre em transação única. Equipes que não aparecem no retorno não são apagadas automaticamente, seguindo a configuração segura do plugin, cujo recurso de remoção também permanece desativado.

## Envio de resultados

O envio usa o mesmo endpoint, método e envelope do `SyncModule.js`:

```http
POST https://olimpo.robocup.org.br/api/events/steps/score
Content-Type: application/json

{
  "steps": [
    {
      "id": "ID_DA_ETAPA",
      "token": "TOKEN_DA_ETAPA",
      "headers": ["Rank", "...colunas", "Final"],
      "scores": [
        {
          "id": "ID_DA_EQUIPE_NO_OLIMPO",
          "dataMap": { "Nome da coluna": "ficha serializada" },
          "headersMap": { "Nome da coluna": 123 }
        }
      ]
    }
  ]
}
```

As equipes são agrupadas pelo par `stepId + token`. Para cada coluna, uma nota ausente gera valor `0` e ficha vazia `""`, exatamente como no conversor do plugin. `dataMap` contém a ficha oficial serializada e `headersMap` contém `Rank`, valores das colunas e `Final`. Esses dois nomes permanecem em inglês porque são os valores padrão de `Table.headerRank` e `Table.headerFinal` efetivamente enviados pelo plugin.

Respostas HTTP `400` ou superiores são falhas e têm o corpo preservado no diagnóstico. O horário do último sucesso só muda após uma resposta aceita; tentativas com erro possuem horário e estado próprios.

## Sincronização automática

- envio imediato ao habilitar;
- intervalo configurável entre 60 e 1.800 segundos;
- execução no servidor, mesmo sem a página administrativa aberta;
- envio manual disponível a qualquer momento;
- último sucesso, última tentativa, retorno e falhas visíveis no painel;
- todas as tentativas relevantes auditadas.

Ao contrário do plugin legado, o Valhalla mantém a validação TLS ativa. Desabilitar a verificação do certificado globalmente colocaria tokens e resultados em risco e não é necessário para o endpoint oficial com certificado válido.

## Verificação local do contrato

`tests/olimpo-integration.test.ts` sobe um servidor HTTP temporário que imita os dois endpoints, executa importação e envio através da API tRPC e valida URL, token codificado, método, cabeçalho, envelope, `headers`, `headersMap`, `dataMap`, IDs, valores ausentes e comportamento de erro. Isso valida a compatibilidade estrutural sem enviar dados ao Olímpo real.
