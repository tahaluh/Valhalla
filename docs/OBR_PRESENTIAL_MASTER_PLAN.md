# Plano mestre — Valhalla para OBR presencial

## 1. Objetivo

Transformar o Valhalla em um sistema local, offline-first e focado na operação presencial da OBR. A primeira versão de campo cobrirá exclusivamente as modalidades **Prática** e **Artística** de 2026. A modalidade Virtual fica fora deste escopo.

O produto deve substituir o fluxo operacional do `tournamenter-obr`, mas com interface de tablet mais simples, administração confiável, telas públicas melhores e rastreabilidade completa.

## 2. Fontes de regra

- `Documents/obr/OBR2026_REGIONAL_ESTADUAL_MANUAL-DE-REGRAS-E-INSTRUCOES_v1.2.pdf` — Prática.
- `Documents/obr/2026-Manual-de-Regras-e-Instrucoes-Regional_Estadual-Robotica-Artistica.pptx.pdf` — Artística.
- `tournamenter-obr` — referência de fluxo operacional e pontuação; não é a fonte normativa.

Cada evento deve guardar a versão do regulamento e da ficha usada. Nunca se recalcula uma nota histórica com uma regra alterada depois.

## 3. Decisões de produto

| Decisão         | Diretriz                                                                                                                                                                     |
| --------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Escopo inicial  | Prática e Artística, etapa presencial.                                                                                                                                       |
| Dispositivo     | Tablet é terminal intercambiável; não pertence a uma mesa nem a um árbitro.                                                                                                  |
| Operação        | O árbitro entra em uma mesa e trabalha na fila agendada dela. Não escolhe uma equipe livremente.                                                                             |
| Fonte do tempo  | Cronômetros são calculados no servidor a partir de timestamps persistidos; trocar de tablet não reinicia o tempo.                                                            |
| Correção        | Rascunho aberto pode ser corrigido pelo árbitro. Sessão finalizada exige autorização de admin e motivo.                                                                      |
| Ranking público | Evento escolhe atualização imediata (`LIVE`) ou publicação manual em lote (`MANUAL`).                                                                                        |
| Identificação   | O admin mantém uma lista nominal de árbitros; cada ficha seleciona operador, anunciador e pontuador. Cadastro excepcional no tablet exige senha e nome do admin autorizador. |
| Auditoria       | Toda ação relevante é imutável, associada a pessoa, terminal, mesa e sessão.                                                                                                 |
| Rede            | Uma máquina local hospeda o Valhalla; todos os tablets acessam pela rede local. Internet não é requisito.                                                                    |

## 4. Fluxo operacional alvo

```text
Admin configura evento, regulamento, mesas e horários
        ↓
Sistema gera as filas por turno/mesa e o admin ajusta exceções
        ↓
Tablet entra em uma mesa (QR Code ou seletor) e identifica o operador
        ↓
Árbitro trabalha na sessão atual: chamar → cronômetro → ficha → finalizar
        ↓
Nota fica em revisão, é corrigida com autorização se necessário
        ↓
Ranking interno é recalculado
        ↓
Ranking público atualiza ao vivo ou quando o admin publica um lote
```

### 4.1 Tela do árbitro

Ao selecionar uma mesa, o árbitro vê somente:

- sessão atual, próxima e fila daquele turno;
- equipe, horário e estado da sessão;
- ações `Chamar equipe`, `Iniciar`, `Finalizar`, `Não compareceu` e `Problema operacional`;
- ficha apropriada para a modalidade;
- cronômetros e rascunho persistente.

Estados: `SCHEDULED`, `CALIBRATING`, `CALLED`, `IN_PROGRESS`, `REVIEW`, `FINALIZED`, `ABSENT`, `CANCELLED`, `RESCHEDULED`.

Qualquer tablet pode assumir uma mesa já aberta. O sistema recupera a sessão, o rascunho e os cronômetros. Alterações concorrentes são detectadas por versão da sessão e não são silenciosamente sobrescritas.

### 4.2 Exceções

- **Ausência:** árbitro registra; admin pode confirmar, reagendar ou reabrir.
- **Problema da organização:** árbitro registra ocorrência; juiz-chefe/admin decide se há compensação de tempo ou nova sessão.
- **Correção após finalizar:** modal de autorização de admin (senha/PIN), motivo obrigatório e revisão completa.
- **Troca de mesa/equipe:** admin ajusta a agenda; a mudança preserva o antes/depois.

## 5. Requisitos por modalidade

### 5.1 Prática

- Três rodadas por equipe para Níveis 1 e 2; o gerador tenta distribuir rodadas em arenas diferentes.
- Até 2 minutos de calibração e 5 minutos de execução; o tempo de execução não pausa.
- Agenda e resultados anteriores disponíveis publicamente.
- Ficha estruturada por rodada: elementos do trajeto, checkpoints/tentativas, falhas de progresso, vítimas, multiplicadores, ladrilho de chegada, desafio surpresa, desistência e tempo final.
- Ao encerrar por desistência, o tempo de desempate é 5 minutos.
- Ranking: soma das duas maiores notas das três rodadas; aplicar todos os desempates oficiais de 2026.
- Desafio surpresa: sorteio controlado, registro da equipe, horário de liberação e status de demonstração.

### 5.2 Artística

- Uma entrevista técnica, até 10 minutos, em mesa/sala agendada; ao menos dois juízes.
- Duas apresentações separadas, cada uma em sessão de palco; ao menos três juízes, com pelo menos um que participou da entrevista.
- Cronômetro de ocupação do palco (7 min) e cronômetro da apresentação (mín. 1:30, máx. 5 min, incluindo reinícios).
- Fichas oficiais: entrevista, apresentação, penalidades/reinícios/intervenções e sustentabilidade (até 5 pontos extras).
- Classificação: `entrevista × 0,4 + melhor apresentação × 0,6 + sustentabilidade`.
- Desempates: soma das duas apresentações, menos penalidades e, se persistir, rodada adicional.
- Suportar rodada adicional e normalização quando houver mais de um palco principal.

## 6. Modelo de dados proposto

| Entidade              | Responsabilidade                                                                                                    |
| --------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `Referee`             | Lista nominal cadastrada pelo admin para identificar operador, anunciador e pontuador sem criar contas individuais. |
| `EvaluationStation`   | Arena de Prática, mesa de entrevista, palco ou mesa de desafio; substitui o conceito limitado de arena.             |
| `Phase`               | Rodada 1/2/3, Entrevista, Apresentação 1/2, rodada extra e respectiva configuração.                                 |
| `ScheduleSlot`        | Horário, posto, equipe, fase, ordem e estado; é a unidade da fila.                                                  |
| `EvaluationSession`   | Execução real de um slot: início/fim, cronômetros, versão, operador e resultado.                                    |
| `ScorecardTemplate`   | Ficha versionada por regulamento/modalidade/fase.                                                                   |
| `ScorecardSubmission` | Resposta estruturada da ficha, cálculo, penalidades e estado de revisão.                                            |
| `ScoreRevision`       | Histórico de valores de nota; já iniciado na base atual, será migrado para a sessão/ficha.                          |
| `Terminal`            | Identidade local do tablet, nome amigável e último uso.                                                             |
| `TerminalUsage`       | Vínculo temporal entre terminal, mesa e operador.                                                                   |
| `AuditLog`            | Registro imutável de toda ação e de antes/depois em JSON.                                                           |
| `PublicationBatch`    | Snapshot público de ranking, autor e horário da publicação.                                                         |
| `Appeal`              | Recurso, prazo, anexos, parecer e decisão. Fase posterior.                                                          |

`Team` não recebe uma mesa fixa: a relação equipe–mesa existe em `ScheduleSlot`, permitindo rodadas em postos diferentes.

## 7. Identificação e permissões

| Papel      | Pode fazer                                                                                              |
| ---------- | ------------------------------------------------------------------------------------------------------- |
| Admin      | Configurar evento, regulamentos, árbitros, mesas, agenda, publicação, ajustes e auditoria.              |
| Árbitro    | Entrar em qualquer mesa, selecionar os responsáveis da lista, operar a fila e preencher fichas abertas. |
| Secretaria | Check-in, presença, agenda e comunicação com equipes.                                                   |
| Público    | Consultar ranking, cronograma e telas de apresentação.                                                  |

O login continua simples, por senha de papel. A autoria nominal vem das listas controladas pelo admin e dos nomes selecionados em cada sessão. Uma pessoa fora da lista só pode ser adicionada no tablet com senha e identificação nominal do administrador autorizador.

## 8. Auditoria e segurança operacional

Toda ação relevante registra: servidor/data/hora, evento, sessão, equipe, mesa, terminal, operador, papel, ação, estado anterior, estado novo, motivo e autorizador quando houver.

Eventos auditáveis mínimos:

- entrada/saída e troca de mesa pelo terminal;
- chamada, início, pausa excepcional e término de cronômetro;
- nota criada, alterada, finalizada e reaberta;
- ausência, reagendamento, desclassificação e ocorrência;
- mudança de agenda, regra ou ficha;
- alteração de modo de publicação e publicação do ranking;
- login e autorização administrativa.

O painel admin deve filtrar por equipe, sessão, mesa, tablet, pessoa, período e tipo de ação. Logs não podem ser editados ou excluídos pela interface.

## 9. Telas públicas

### Ranking

- modo telão, responsivo e com contraste alto;
- atualização automática ou por lote publicado;
- transição/indicador de subida e descida de posição;
- indicação de que o resultado é provisório, publicado ou homologado;
- seleção de categoria e atualização sem recarregar a tela.

### Operação pública

- fila atual e próximas equipes por mesa;
- chamada de equipe e horário;
- agenda completa por modalidade;
- tela de mensagens/anúncios para projeção.

## 10. Fases de implementação

### Marco 0 — Estabilização da base

- corrigir formatação/lint já existente para build reproduzível;
- migrar o atual `Score` para não depender apenas de colunas soltas;
- manter compatibilidade de leitura com eventos já criados;
- testes de fórmula e ranking oficiais.

**Saída:** aplicação compila, migra banco e mantém dados atuais.

### Marco 1 — Identidade, postos e agenda

- lista nominal de árbitros e autorização administrativa para inclusões excepcionais;
- postos de avaliação e configuração de capacidade;
- fases e slots agendados;
- gerador automático com duração, intervalo, rodízio e ajustes manuais;
- check-in de tablet por seletor ou QR Code.

**Saída:** admin monta um evento e cada mesa tem uma fila operacional utilizável.

### Marco 2 — Sessão de Prática

- tela `mesa → turno → equipe atual`;
- calibração, rodada, ausência e ocorrências;
- cronômetro persistente e recuperação em outro tablet;
- ficha oficial e cálculo de ranking/desempate;
- revisão e autorização de correção.

**Saída:** uma competição de Prática com três rodadas pode ser operada sem planilha.

### Marco 3 — Sessão de Artística

- agenda de entrevistas e dois palcos/apresentações;
- fichas oficiais, consenso/juízes, cronômetros e penalidades;
- cálculo, desempate, rodada extra e normalização quando aplicável.

**Saída:** uma competição de Artística pode ser operada integralmente.

### Marco 4 — Auditoria e publicação

- `Terminal`, `TerminalUsage` e `AuditLog` completos;
- painel de acompanhamento e filtros;
- publicação ao vivo/manual por lote;
- ranking público, fila pública e modo telão animado.

**Saída:** organização acompanha mudanças e controla o que é exibido ao público.

### Marco 5 — Robustez de evento

- backup/restore e exportação CSV/JSON/PDF;
- recurso formal, homologação e fechamento de resultados;
- importação e sincronização com Olímpo;
- manual operacional e checklist de instalação local;
- testes em rede local com tablets reais.

**Saída:** piloto completo pronto para evento regional/estadual.

## 11. Critérios de aceite do piloto

1. Admin cria evento, escolhe regulamento 2026, cria mesas e gera agenda.
2. Dois tablets podem operar a mesma mesa em momentos diferentes sem perder sessão ou cronômetro.
3. Árbitro marca início, ausência e resultado da equipe seguinte sem procurar cadastro manualmente.
4. Trocar uma nota finalizada só funciona com autorização de admin e deixa evidência completa.
5. Admin identifica todas as ações de uma mesa, um tablet, uma pessoa ou uma equipe.
6. Ranking de Prática e Artística respeita os cálculos e desempates do manual.
7. Em modo manual, nenhuma nota nova aparece publicamente até a publicação do admin.
8. Backup restaurado em outra máquina preserva agenda, notas, publicação e auditoria.

## 12. Fora do escopo inicial

- modalidade Virtual;
- sistema genérico de plugins em runtime;
- brackets e partidas genéricas;
- aplicativo desktop separado para gerenciar servidores;
- modalidade Virtual e integrações além dos endpoints de participantes/resultados já usados pelo plugin OBR.

## 13. Próxima entrega recomendada

Iniciar o **Marco 1**, pois agenda por mesa e sessões são a base da tela de árbitro, dos cronômetros, da auditoria e da publicação. O trabalho já iniciado de histórico/publicação deve ser preservado, mas adaptado para apontar a sessões e usuários reais.
