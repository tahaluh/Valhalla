# ⚔️ Valhalla

Gerenciador livre de torneios para etapas presenciais da [Olimpíada Brasileira de Robótica (OBR)](https://www.obr.org.br/), com suporte às modalidades **Prática (Resgate)** e **Artística** nas categorias Nível 1 e Nível 2.

O Valhalla funciona em um servidor na rede local, permitindo que administração, secretaria, árbitros, mesas, palcos e telões operem mesmo sem internet. Quando houver conexão, as equipes podem ser importadas e os resultados sincronizados com o Olímpo.

> A modalidade Virtual não faz parte do escopo atual.

## Funcionalidades

- Operação guiada em celulares e tablets: mesa ou palco → turno → fila → equipe → cronômetro → ficha → finalização.
- Três rodadas de Resgate, com soma das duas melhores pontuações e critérios de desempate.
- Entrevista, duas apresentações e geração automática da fila de apresentação extra para equipes empatadas.
- Notas individuais por jurado e confirmação explícita da ficha de consenso.
- Rulesets, colunas de pontuação e fórmulas configuráveis.
- Agenda com rodízio entre arenas, períodos indisponíveis e detecção de conflitos.
- Rascunho persistente, recuperação entre tablets, fila local de ações — inclusive sorteio surpresa — durante quedas de rede e comparação de versões concorrentes.
- Correções administrativas justificadas e histórico completo das alterações.
- Ranking animado e telões configuráveis para horários, chamadas, avisos, imagens e mesas.
- Importação e sincronização manual ou automática com o Olímpo.
- Homologação versionada das regras, fichas oficiais em PDF por sessão, backups, restauração, diagnóstico e suporte a PWA.
- Execução local por Node.js ou Docker.

## Operação da competição

### Mesas, arenas e palcos

O árbitro escolhe o posto e confirma o turno aberto pela administração. A tela apresenta a fila em ordem e conduz uma equipe por vez pelas ações disponíveis:

- chamar equipe, com múltiplas chamadas registradas;
- iniciar calibração;
- iniciar ou pausar a rodada;
- abrir e preencher a ficha;
- marcar ausência;
- solicitar reagendamento;
- encerrar ou finalizar a avaliação.

O tablet não fica permanentemente preso a uma mesa ou pessoa. Operador, anunciador e pontuador são selecionados da lista de árbitros do evento e ficam pré-preenchidos no aparelho. Um novo nome pode ser incluído durante a operação mediante senha e identificação do administrador responsável.

Cronômetros e rascunhos são persistidos no servidor. Recarregar a página ou assumir a sessão em outro tablet não apaga a ficha. Se dois aparelhos alterarem a mesma avaliação, o sistema informa o conflito e permite comparar e recuperar as versões.

Se o tablet perder temporariamente a conexão com o servidor local, chamadas, pausas, reagendamentos, ausências, sorteios surpresa e finalizações são preservados no aparelho, na ordem em que ocorreram. O banco de desafios aprovado fica armazenado no tablet para que a equipe receba o desafio mesmo durante a queda. A fila é reenviada automaticamente após a reconexão e também pode ser disparada manualmente pelo árbitro; conflitos entre tablets interrompem o envio para revisão.

### Resgate — Prática 2026

- Três rodadas por equipe e ranking pela soma das duas melhores notas.
- Nota e tempo registrados separadamente em cada rodada.
- Ruleset editável por arena, incluindo checkpoints, ladrilhos, gangorras, interseções, obstáculos, rampas, lacunas, redutores, saída, vítimas e multiplicadores.
- Quantidade de ladrilhos definida previamente; durante a rodada o árbitro apenas marca as passagens e tentativas.
- Registro de checkpoint alcançado, não alcançado ou abandonado.
- Tentativas adicionais: da quarta em diante o checkpoint não pontua ladrilhos, mas as falhas continuam contando para o bônus de saída.
- Encerramento por **Fim da rodada / desistência**, com tempo máximo aplicado ao desempate.
- Categorias possuem nível OBR explícito, sem depender do texto do nome para escolher as regras ou os desafios.
- Banco oficial do plugin Tournamenter OBR 2026.1.5, com 15 desafios de Nível 1 e 30 de Nível 2, editável e sujeito à aprovação da organização.
- Mesa de desafio com fila, juiz responsável, alerta de aproximação/atraso, geração individual por equipe, opção auditada de gerar novamente, recusa, ausência, desistência, execução e conclusão.
- Horário de referência configurável para o desafio: 30 minutos por padrão e atalhos de 1, 2, 5 ou 15 minutos para simulações. Ele não cria bloqueios automáticos; o admin abre e fecha manualmente a janela de sorteios.
- Proteção contra repetição do mesmo desafio entre a segunda e a terceira rodada enquanto existir outra opção.
- Painel administrativo consolidado com situação de cada equipe, rodada, nível, horário, juiz e tablet.
- Ficha oficial em PDF registra o texto sorteado, horário, situação final, elegibilidade, juiz e tablet do sorteio.
- Verificação da pontuação máxima teórica das arenas antes de gerar a agenda avançada.

### Artística 2026

- Entrevista técnica, duas apresentações oficiais e apresentação extra de desempate.
- Cronômetros próprios para entrevista e palco.
- Mínimo de dois jurados na entrevista e três nas apresentações.
- Ao menos um jurado da apresentação deve ter participado da entrevista.
- Cada jurado registra sua ficha individual; o grupo então confirma uma ficha única de consenso.
- Alterar uma nota individual invalida o consenso anterior e exige nova confirmação.
- O servidor recalcula a nota oficial a partir da ficha, sem confiar apenas no total enviado pelo navegador.
- Penalidades acumuladas entre as duas apresentações.
- Registro de sustentabilidade, originalidade, conteúdo proibido e desclassificação.
- Apresentação extra com fator de normalização configurável e auditado.
- Detecção dos empates pelos critérios oficiais e geração da fila extra no palco escolhido, com horário e intervalo configuráveis.

### Agenda

- Cadastro de arenas fáceis, médias e difíceis.
- Geração das três rodadas garantindo a passagem de cada equipe pelos diferentes níveis.
- Balanceamento entre arenas do mesmo nível.
- Bloqueios para almoço, pausas, manutenção e outros períodos indisponíveis.
- Uma sessão não pode começar nem atravessar um bloqueio cadastrado.
- Detecção de sobreposição entre o término estimado de uma rodada e o início da seguinte.
- Rearranjo manual e troca de horários entre equipes.
- Exportação completa ou por rodada em CSV.
- Cópia da agenda em Markdown e impressão de tabelas individuais.

### Administração, secretaria e auditoria

- Abertura, suspensão e fechamento operacional de turnos e rodadas.
- Cadastro de eventos, categorias, equipes, árbitros, arenas, mesas, palcos e fases.
- Correção de notas finalizadas mediante senha administrativa, responsável e justificativa.
- Histórico por evento, equipe, mesa, sessão, tablet, pessoa, período e tipo de ação.
- Registro de logins, sessões, cronômetros, rascunhos, notas, publicações e configurações.
- Ranking ao vivo ou publicação manual em lotes.
- Histórico e restauração de lotes publicados.
- Validação objetiva e homologação das regras antes da homologação dos resultados; qualquer mudança posterior invalida a aprovação pelo hash da configuração.
- Exportação da ficha preenchida de cada sessão em PDF, incluindo responsáveis, jurados, consenso, resultado e campos detalhados para assinatura.
- Recursos formais e homologação dos resultados.

## Telões públicos

`/view` abre a tela pública padrão. Cada configuração adicional recebe uma rota própria em `/view/<nome>`, como `/view/ranking`, permitindo usar uma apresentação diferente em cada monitor.

As telas podem combinar:

- ranking por categoria, animado quando equipes sobem ou descem;
- notas atualizadas e destaque visual de correções;
- horários das competições;
- chamadas de equipes, com as mais recentes no topo;
- fila de alertas, exibindo até três simultaneamente;
- situação das mesas, equipe atual, próxima equipe e atraso;
- avisos com Markdown e imagens;
- imagens em tela cheia;
- logo personalizado do evento.

A ordem, duração, categoria, aparência e rotação são configuradas pela administração. O telão avança automaticamente, sem exigir clique. Para testes, também é possível escolher uma etapa pela barra inferior ou usar as setas do teclado. Listas grandes são paginadas para permanecer dentro da área visível.

## Integração com o Olímpo

O Valhalla importa equipes usando os dados externos do Olímpo e mantém associados o ID da equipe, o ID da etapa e o token do evento. Antes da importação, a administração recebe uma prévia das inclusões e alterações.

Os resultados podem ser enviados manualmente ou sincronizados em intervalos configuráveis. O payload segue o contrato utilizado pelo plugin OBR do Tournamenter:

```http
POST https://olimpo.robocup.org.br/api/events/steps/score
Content-Type: application/json

{ "steps": [...] }
```

As equipes são agrupadas corretamente por etapa e token. Os valores calculados seguem em `headersMap`, enquanto a ficha serializada correspondente segue em `dataMap`. A última tentativa, o retorno do serviço e eventuais falhas aparecem no painel de diagnóstico. Se a internet estiver indisponível, uma nova tentativa ocorre no próximo intervalo configurado.

A implementação foi conferida campo a campo contra o `tournamenter-obr` 2026.1.5. Consulte a [especificação de compatibilidade](docs/OLIMPO_COMPATIBILITY.md) para ver endpoints, mapeamentos, payload e o teste local completo do contrato.

## Perfis de acesso

| Perfil        | Acesso                                                                |
| ------------- | --------------------------------------------------------------------- |
| Administração | Evento, equipes, regras, agenda, auditoria, publicação e contingência |
| Arbitragem    | Operação de qualquer mesa ou palco e preenchimento das fichas         |
| Secretaria    | Acompanhamento e ações operacionais                                   |
| Público       | Telões em `/view` e `/view/<nome>`, sem autenticação                  |

A autenticação é local, sem e-mail ou OAuth. Cada evento possui senhas para administração, arbitragem e secretaria. Somente um evento fica ativo por vez.

## Banco demonstrativo

O seed cria uma **OBR Regional Paraíba 2026** com 16 equipes, árbitros, três arenas, mesas de entrevista, palco, apresentação extra, desafio surpresa, pausas, agenda, fichas, ranking, auditoria, recurso e telões públicos.

| Perfil        | Senha      |
| ------------- | ---------- |
| Administração | `teste123` |
| Arbitragem    | `teste123` |
| Secretaria    | `teste123` |

> O seed substitui todos os eventos no banco indicado por `DATABASE_URL`. Use-o somente em uma base de demonstração.

```bash
npm run db:test-seed
```

## Instalação

### Requisitos

- [Node.js](https://nodejs.org/) 20 ou superior;
- npm;
- máquina acessível pelos tablets na mesma rede;
- Docker e Docker Compose, caso prefira executar em contêiner.

### Execução local

```bash
git clone https://github.com/OtacilioN/Valhalla.git
cd Valhalla
npm install
cp .env.example .env.local
```

Configure `.env.local`:

```dotenv
SESSION_SECRET="gere-uma-chave-segura-com-pelo-menos-32-caracteres"
DATABASE_URL="file:./data/valhalla.db"
NEXT_PUBLIC_APP_URL="http://IP-DO-SERVIDOR:3000"
SESSION_COOKIE_SECURE="false"
OLIMPO_API_BASE_URL="https://olimpo.robocup.org.br/api/events/steps"
OLIMPO_SCORE_API_URL="https://olimpo.robocup.org.br/api/events/steps/score"
```

Prepare o banco, gere a aplicação e inicie o servidor:

```bash
npm run prisma:migrate
npm run build
npm run server:start
```

Abra `http://localhost:3000` no servidor ou `http://IP-DO-SERVIDOR:3000` nos tablets.

### Comandos do servidor

```bash
npm run server:start
npm run server:status
npm run server:restart
npm run server:stop
npm run server:logs
```

O inicializador carrega `.env.local` ou `.env`, adapta o caminho relativo do SQLite para a build standalone e mantém PID e logs dentro do projeto.

### Docker

```bash
cp .env.example .env
docker compose up --build -d
docker compose ps
```

O banco SQLite é mantido no volume `valhalla_data`.

## Contingência

- Backup completo em JSON com validação SHA-256 antes da restauração.
- Snapshots manuais e backups automáticos, retendo os 50 mais recentes.
- Mesmo formato restaurável para backups manuais e automáticos.
- Exportação de resultados em CSV e PDF.
- Health check em `/api/health`.
- Painel com latência do banco, uptime, rascunhos pendentes e últimas falhas.
- Aplicação instalável como PWA e utilizável no servidor local sem internet.
- [Manual de contingência](public/CONTINGENCY_MANUAL.md).

Em uma competição oficial, teste todos os tablets na rede, restaure um backup em outra máquina antes do evento e mantenha uma cópia externa dos arquivos gerados.

## Roteiro recomendado

1. Crie o evento e cadastre a equipe de arbitragem.
2. Importe as equipes do Olímpo e confira a prévia.
3. Revise categorias, fórmulas, rulesets e arenas.
4. Confirme que as arenas possuem a mesma pontuação máxima.
5. Cadastre pausas e defina o início das rodadas.
6. Gere a agenda, resolva conflitos e exporte as tabelas.
7. Configure uma ou mais telas públicas e abra cada rota no monitor correspondente.
8. Crie um snapshot, confira `/api/health` e teste os tablets.
9. Abra o turno; cada árbitro escolhe o posto, o turno e a equipe na fila.
10. Acompanhe rascunhos, conflitos, correções e auditoria.
11. Publique os resultados, resolva recursos, homologue e sincronize com o Olímpo.
12. Exporte os resultados e faça o backup final.

## Desenvolvimento

```bash
npm run dev
npm run type-check
npm test
npm run test:e2e:install
npm run test:e2e
npm run lint
npm run build
```

A suíte automatizada cobre autenticação, regras de pontuação, duas melhores rodadas, desempates, consenso e normalização artística, penalidades acumuladas, estados de fase, autorização administrativa, concorrência, fila offline, banco e ciclo do desafio surpresa, lotes de publicação, tentativas adicionais, equivalência e rodízio das arenas, pausas, conflitos de horário e payload do Olímpo. Os testes de integração criam um SQLite temporário, aplicam as migrações e percorrem a API tRPC; o Playwright valida o telão e o login administrativo em Chromium desktop e tablet. O workflow de qualidade executa essas verificações em cada push e pull request.

## Arquitetura

| Camada               | Tecnologia            |
| -------------------- | --------------------- |
| Interface e servidor | Next.js 15 / React 19 |
| API tipada           | tRPC 11               |
| Linguagem            | TypeScript estrito    |
| Banco local          | SQLite / Prisma       |
| Sessão               | iron-session          |
| Validação            | Zod                   |
| Estilos              | Tailwind CSS          |
| Componentes          | shadcn/ui             |
| PDF                  | pdf-lib               |
| Contêiner            | Docker Compose        |

```text
src/
├── app/             páginas, dashboards, API e telões
├── domain/          entidades e regras puras
├── application/     serviços de aplicação e pontuação
├── infrastructure/ banco, repositórios e sessão
├── presentation/   componentes compartilhados de interface
├── server/          procedimentos tRPC, jobs e integrações
└── lib/             utilitários e cliente tRPC
```

O projeto mantém separação entre domínio, aplicação, infraestrutura e apresentação, com TypeScript estrito, validação por Zod e contratos tipados de ponta a ponta pelo tRPC.

## Segurança e limites operacionais

- Toda alteração de uma ficha finalizada exige autorização administrativa e gera histórico.
- Logs não podem ser editados pela interface.
- Não exponha o servidor à internet sem HTTPS, firewall e senhas fortes.
- A sincronização com o Olímpo depende de conexão e credenciais externas válidas.
- O regulamento oficial da OBR prevalece sobre qualquer comportamento do software.

## Documentação adicional

- [Plano funcional](docs/OBR_PRESENTIAL_MASTER_PLAN.md)
- [Manual de contingência](public/CONTINGENCY_MANUAL.md)

## Autoria, licença e contribuições

Valhalla foi criado por [Otacilio Maia](https://github.com/OtacilioN) e é distribuído sob a licença MIT.

Issues e pull requests devem informar o cenário operacional, a regra afetada, como reproduzir o comportamento e quais testes foram executados.
