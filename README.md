# ⚔️ Valhalla

**Valhalla** is an open-source, offline-first tournament manager built specifically for the [Brazilian Robotics Olympiad (OBR)](https://www.obr.org.br/). It runs entirely on a local network — no internet required.

---

## Features

- 🏆 **Multi-category ranking** — Rescue (Levels 1 & 2) and Artistic (Levels 1 & 2)
- 📊 **Configurable score columns** — Add, rename, reorder score columns per category
- 🧮 **Scoring formula engine** — Custom JavaScript formulas with tiebreaker support
- 🔐 **Offline authentication** — Role-based access (Admin / Referee / Public) with simple passwords
- 📡 **Real-time ranking** — Auto-refreshing public ranking page
- 🐳 **Docker-ready** — Start with a single command
- 📱 **Responsive** — Works on tablets and phones for referee scoring

---

## Tech Stack

| Layer      | Technology              |
| ---------- | ----------------------- |
| Framework  | Next.js 15 (App Router) |
| Language   | TypeScript (strict)     |
| API        | tRPC v11                |
| Database   | SQLite via Prisma       |
| Styling    | TailwindCSS v4          |
| UI         | shadcn/ui components    |
| Validation | Zod                     |
| Session    | iron-session            |
| Container  | Docker + Docker Compose |

---

## Project Structure

```
src/
├── app/                       # Next.js App Router pages
│   ├── api/trpc/[trpc]/       # tRPC API endpoint
│   ├── login/                 # Login page
│   ├── dashboard/
│   │   ├── admin/             # Admin dashboard
│   │   └── referee/           # Referee scoring interface
│   └── ranking/               # Public ranking display
├── domain/                    # Pure domain types & interfaces
│   ├── entities/              # Entity types (Event, Team, Category, Score, User)
│   └── repositories/          # Repository interfaces
├── application/               # Business logic
│   └── services/              # Auth service, Scoring engine
├── infrastructure/            # External system integrations
│   ├── database/              # Prisma client singleton
│   ├── repositories/          # Prisma repository implementations
│   └── auth/                  # iron-session configuration
├── presentation/              # UI components
│   └── components/
│       ├── ui/                # shadcn/ui components
│       └── shared/            # TRPCProvider, layout wrappers
├── server/                    # tRPC server
│   ├── trpc/                  # tRPC init, context, router
│   └── routers/               # Feature routers (event, team, category, score, auth)
└── lib/                       # Shared utilities
    ├── utils.ts               # cn(), formatDate(), etc.
    ├── logger.ts              # Structured logger
    └── trpc/                  # tRPC client helpers
```

---

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) 20+
- [Docker](https://www.docker.com/) (optional, for containerized deployment)

### Local Development

```bash
# 1. Clone the repository
git clone https://github.com/OtacilioN/Valhalla.git
cd Valhalla

# 2. Copy environment variables
cp .env.example .env
# Edit .env and set a strong SESSION_SECRET (min 32 chars)

# 3. Install dependencies
npm install

# 4. Set up the database
npm run prisma:migrate

# 5. Start the development server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) to view the app.

### Production with Docker

```bash
# 1. Copy and configure environment
cp .env.example .env
# Set SESSION_SECRET to a secure random string

# 2. Build and start
docker-compose up -d

# 3. Access at http://localhost:3000
```

The database is persisted in a Docker volume (`valhalla_data`).

---

## User Roles

| Role      | Access                                          |
| --------- | ----------------------------------------------- |
| `ADMIN`   | Full access: manage events, teams, categories   |
| `REFEREE` | Submit scores for teams in their assigned arena |
| `PUBLIC`  | View real-time rankings (no password required)  |

Authentication is **offline** — no email, no OAuth. The admin creates an event with two passwords (admin + referee). Users select their role and enter the corresponding password.

---

## Domain Overview

### Event

The central entity. Each event has:

- Name, description, location, start/end dates
- Admin & referee passwords
- Arenas, Categories, Referees

Only **one event can be active** at a time.

### Categories

Default categories created with each event:

- Rescue Level 1
- Rescue Level 2
- Artistic Level 1
- Artistic Level 2

Each category has:

- Configurable score columns
- A JavaScript scoring formula

### Score Column Presets

**Rescue:** Round 1 · Time 1 · Round 2 · Time 2 · Round 3 · Time 3

**Artistic:** Interview · Presentation 1 · Presentation 2 · Penalties

### Scoring Formulas

Formulas are stored as JavaScript IIFEs:

```javascript
// Rescue: sum of best 2 rounds, tiebreaker = time of counted rounds
(function (scores) {
  var rounds = [scores[0], scores[2], scores[4]];
  var times = [scores[1], scores[3], scores[5]];
  // ... discard worst, sum rest
  return [total, tiebreakerTime];
});

// Artistic
(function (scores) {
  var max = scores[1] > scores[2] ? scores[1] : scores[2];
  var score = scores[0] + max;
  return [score, scores[1] + scores[2], scores[3] * -1];
});
```

---

## Environment Variables

| Variable              | Required | Description                                                |
| --------------------- | -------- | ---------------------------------------------------------- |
| `SESSION_SECRET`      | ✅       | Secret for iron-session (≥32 chars)                        |
| `DATABASE_URL`        | ✅       | SQLite path (e.g. `file:./data/valhalla.db`)               |
| `NEXT_PUBLIC_APP_URL` | ❌       | App URL for tRPC client (default: `http://localhost:3000`) |

---

## Database Migrations

```bash
# Create a new migration
npm run prisma:migrate

# Apply migrations in production
npx prisma migrate deploy

# Open Prisma Studio (database UI)
npm run prisma:studio
```

---

## Architecture Principles

- **Clean Architecture** layers: domain → application → infrastructure → presentation
- **tRPC** for end-to-end type safety
- **Server components** preferred; client components only when needed
- **Strict TypeScript** — no `any`
- **Feature-oriented** folder structure
- Prepared for **real-time features** (WebSockets) in a future iteration

---

## Contributing

Contributions are welcome! Please open an issue or PR.

---

## License

MIT © [Otacilio Maia](https://github.com/OtacilioN)

---

# Extensão OBR Presencial 2026

Toda a documentação original de Otacilio Maia foi preservada acima. Esta seção registra, de forma complementar, a evolução deste fork para a operação presencial completa.

Sistema livre para administrar uma etapa presencial da Olimpíada Brasileira de Robótica. O Valhalla foi adaptado para operar **Prática (Resgate) e Artística**, com foco nas regras de 2026, uso em tablets, servidor na rede local, rastreabilidade das alterações e telões públicos.

O projeto parte do [Valhalla original](https://github.com/OtacilioN/Valhalla) e incorpora os fluxos úteis do `tournamenter-obr`, com uma operação mais guiada e uma interface própria para administração, arbitragem, secretaria e público.

> A modalidade Virtual não faz parte deste escopo.

## O que está pronto

### Operação por mesa

- Fluxo mobile/tablet em etapas: selecionar mesa ou palco, confirmar turno, visualizar a fila e abrir a equipe.
- Qualquer tablet pode assumir qualquer mesa; o equipamento não fica preso a um árbitro.
- Chamada de equipe, calibração, início da rodada, ausência, reagendamento, pausa e encerramento.
- Confirmação nas ações críticas, sem confirmação desnecessária ao pausar.
- Cronômetros persistidos no servidor e recuperáveis em outro tablet.
- Rascunho automático da ficha, histórico de revisões e recuperação após recarregar ou trocar de aparelho.
- Detecção de conflito quando dois tablets alteram a mesma ficha.
- Operador, anunciador e pontuador selecionados da lista de árbitros do evento.
- Inclusão excepcional de um novo nome mediante autorização administrativa.
- Correção de ficha finalizada com senha, identificação do administrador e justificativa.

### Resgate — Prática 2026

- Três rodadas por equipe e ranking pela soma das duas melhores notas.
- Colunas de nota e tempo das três rodadas, incluindo os desempates.
- Ruleset configurável por arena: obstáculos, gangorra, rampas, lacunas, redutores, checkpoints, saída, vítimas e multiplicadores.
- Quantidade de ladrilhos definida na arena e preenchimento por marcação, sem digitação durante a rodada.
- Tentativas de checkpoint de zero a nove.
- Da quarta tentativa em diante, o checkpoint não pontua ladrilhos, mas todas as falhas contam no bônus de saída.
- Estados distintos para checkpoint alcançado, não alcançado e abandonado.
- Ação **Fim da rodada / desistência**, atribuindo cinco minutos ao desempate.
- Desafio surpresa com sorteio, elegibilidade, execução, desistência e conclusão.
- Bancos independentes para Nível 1 e Nível 2, sem repetição entre a segunda e a terceira rodada enquanto houver outra opção.

### Artística 2026

- Entrevista técnica e duas apresentações.
- Cronômetros próprios de entrevista, palco e apresentação.
- Registro por jurado, função, participação na entrevista/apresentação e consenso.
- Penalidades, sustentabilidade, originalidade, conteúdo proibido e desclassificação.
- Melhor apresentação combinada com entrevista e sustentabilidade conforme a fórmula configurada.

### Agenda avançada

- Cadastro de arenas fáceis, médias e difíceis.
- Gerador das três rodadas garantindo que cada equipe passe pelos três níveis.
- Balanceamento entre arenas do mesmo nível.
- Pausas, almoço, manutenção e outros períodos indisponíveis.
- Uma sessão não pode começar nem atravessar um período bloqueado.
- Detecção de conflito quando uma rodada começa antes do término estimado da anterior.
- Rearranjo manual, troca entre equipes e acompanhamento do estado por mesa.
- Exportação completa ou por rodada em CSV, cópia em Markdown e impressão por rodada.

### Administração e auditoria

- Abertura, suspensão e fechamento operacional de turnos/rodadas.
- Cadastro de árbitros, arenas, mesas, palcos, fases e categorias.
- Histórico associado a evento, equipe, mesa, sessão, tablet, pessoa e papel.
- Filtros por período, operador, terminal, equipe e tipo de ação.
- Comparação e restauração de versões concorrentes da ficha.
- Publicação do ranking ao vivo ou em lotes manuais, com histórico e restauração.
- Recursos formais e homologação dos resultados.

### Telões públicos

- `/view` abre a tela pública padrão.
- `/view/<nome>` abre uma tela configurada, por exemplo `/view/ranking`.
- Quantidade livre de telas: é possível deixar uma rota diferente em cada monitor.
- Views de ranking, agenda, chamadas, situação das mesas, avisos e imagens.
- Rotação automática configurável; o telão não exige clique.
- Navegação de teste pela barra inferior ou pelas setas do teclado.
- Paginação automática para manter todo o conteúdo dentro da tela.
- Ranking animado com mudança de posição, variação da nota e destaque de correções.
- Chamadas recentes no topo da fila e exibição simultânea de até três alertas.
- Avisos com Markdown básico, títulos, negrito e imagens.
- Logo personalizado por evento e paleta visual da OBR.

### Olimpo

- Importação de equipes por token, com prévia das inclusões e alterações.
- Associação persistente do ID da equipe, etapa e token externos.
- Envio manual e sincronização automática em intervalos de 1, 5, 10, 15 ou 30 minutos.
- Contrato compatível com o plugin OBR do Tournamenter:

```http
POST https://olimpo.robocup.org.br/api/events/steps/score
Content-Type: application/json

{ "steps": [...] }
```

- Registro da última tentativa, retorno do serviço e falhas no painel de diagnóstico.
- Nova tentativa no próximo intervalo quando a internet volta.

### Contingência

- Backup completo em JSON e validação SHA-256 antes de restaurar.
- Snapshots manuais e backups automáticos periódicos, retendo os 50 mais recentes.
- Backups automáticos usam o mesmo formato restaurável do backup manual.
- Exportações de resultado em CSV e PDF.
- Health check em `/api/health`, latência do banco, uptime, rascunhos pendentes e últimas falhas.
- Manual operacional dentro do painel e [manual completo](public/CONTINGENCY_MANUAL.md).
- Aplicação instalável como PWA e utilizável no servidor local sem internet.

## Banco demonstrativo

O seed padrão representa uma **OBR Regional Paraíba 2026** e contém 16 equipes paraibanas, árbitros, arenas fácil/média/difícil, mesas de entrevista, palco, desafio surpresa, três rodadas práticas, pausas, agenda, fichas, ranking, auditoria, recurso e views públicas.

| Papel         | Senha de demonstração |
| ------------- | --------------------- |
| Administração | `teste123`            |
| Arbitragem    | `teste123`            |
| Secretaria    | `teste123`            |

> O seed remove os eventos do banco apontado por `DATABASE_URL`. Use somente em uma base de demonstração.

```bash
npm run db:test-seed
```

## Instalação local

Requisitos: Node.js 20 ou superior, npm e uma máquina acessível pelos tablets na mesma rede.

```bash
git clone https://github.com/SEU-USUARIO/Valhalla.git
cd Valhalla
npm install
cp .env.example .env.local
```

Edite `.env.local`:

```dotenv
SESSION_SECRET="gere-uma-chave-segura-com-pelo-menos-32-caracteres"
DATABASE_URL="file:./data/valhalla.db"
NEXT_PUBLIC_APP_URL="http://IP-DO-SERVIDOR:3000"
SESSION_COOKIE_SECURE="false"
OLIMPO_SCORE_API_URL="https://olimpo.robocup.org.br/api/events/steps/score"
```

Prepare e execute:

```bash
npm run prisma:migrate
npm run build
npm start
```

Abra `http://localhost:3000` no servidor ou `http://IP-DO-SERVIDOR:3000` nos tablets.

### Comandos de operação

```bash
npm run server:start
npm run server:status
npm run server:restart
npm run server:stop
npm run server:logs
```

PID e logs ficam dentro do projeto.

### Desenvolvimento e verificação

```bash
npm run dev
npm run type-check
npm test
npm run build
```

## Docker

```bash
cp .env.example .env
docker compose up --build -d
docker compose ps
```

Os dados SQLite são mantidos no volume `valhalla_data`. Em uma competição real, copie também os backups para outra máquina ou mídia.

## Roteiro recomendado para o evento

1. Crie o evento e cadastre os árbitros.
2. Importe as equipes do Olimpo e confira a prévia.
3. Configure categorias, regras e arenas, indicando fácil, média e difícil.
4. Cadastre pausas e defina o início das três rodadas.
5. Gere a agenda, corrija conflitos e exporte as tabelas.
6. Configure as telas públicas e abra cada rota no monitor correspondente.
7. Crie um snapshot, confira `/api/health` e teste os tablets.
8. Abra o turno; cada árbitro escolhe mesa, turno e equipe na fila.
9. Acompanhe rascunhos, conflitos, correções e auditoria.
10. Publique os resultados, resolva recursos, homologue e sincronize com o Olimpo.
11. Baixe backup, CSV e PDF ao encerrar o evento.

## Testes automatizados

A suíte cobre autenticação, regras de pontuação, duas melhores rodadas, desempates, estados de fase, autorização administrativa, concorrência, lotes de publicação, tentativas 4ª+, rodízio entre níveis de arena, pausas e conflitos de horário.

```bash
npm run type-check
npm test
npm run build
```

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
| PDF                  | pdf-lib               |

As regras puras ficam em `src/domain`, os cálculos em `src/application`, persistência e sessão em `src/infrastructure`, procedimentos tRPC em `src/server` e páginas em `src/app`.

## Segurança e limites operacionais

- Alterar uma ficha finalizada exige autorização administrativa e gera histórico.
- Logs não são editáveis pela interface.
- Não exponha o servidor na internet sem HTTPS, firewall e senhas fortes.
- A sincronização com o Olimpo depende de internet e IDs/tokens reais importados.
- Antes de uma etapa oficial, ensaie com todos os tablets e restaure um backup em outra máquina.
- O regulamento oficial da OBR prevalece sobre qualquer comportamento do software.

## Documentação adicional

- [Plano funcional completo](docs/OBR_PRESENTIAL_MASTER_PLAN.md)
- [Manual de contingência](public/CONTINGENCY_MANUAL.md)

## Licença e contribuições

Consulte a licença do projeto original. Issues e pull requests devem descrever o cenário operacional, a regra afetada, como reproduzir e quais testes foram executados.
