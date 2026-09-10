# Manual de contingência — Valhalla OBR

## Antes do evento

1. Rode o servidor em um computador ligado por cabo à rede local.
2. Ative snapshots automáticos no painel **Admin → Contingência**.
3. Baixe um backup JSON e copie-o para outro computador e para um pendrive.
4. Abra `/view` e o painel de árbitro em cada tablet, ainda com a rede funcionando.
5. Faça uma rodada simulada completa e valide ranking, PDF e CSV.

## Queda de internet externa

O evento continua no servidor local. Não reinicie roteadores nem tablets se a rede local continuar acessível. A sincronização com o Olimpo pode ser feita depois.

## Queda temporária da rede local

O tablet conserva o rascunho no dispositivo. Mantenha a página aberta. Ao reconectar, confira o indicador de rascunho; conflitos mostram as duas opções antes de qualquer sobrescrita.

## Falha do computador principal

1. No computador reserva, copie o projeto e configure `DATABASE_URL`.
2. Execute as migrações (`npm run db:migrate`) e inicie o servidor.
3. Entre como administrador, selecione o mesmo evento e use **Restaurar backup**.
4. Primeiro use **Validar sem restaurar**; confira contagens e checksum.
5. Restaure, confirme as contagens e faça um lançamento de teste.

## Conflito entre tablets

Pare os lançamentos daquela mesa. Compare a versão do servidor e a versão local no aviso de conflito. Escolha a ficha correta consultando o histórico por tablet, operador, equipe e horário.

## Encerramento

Feche as rodadas no painel admin, trate recursos, publique o lote final, homologue e gere backup JSON, CSV e PDF. Teste a conexão antes de sincronizar com o Olimpo.
