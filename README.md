# FraudShield API

REST API de detecção e análise de fraudes em transações financeiras, construída com Node.js, Express e Prisma.

## Stack

- **Runtime:** Node.js
- **Framework:** Express 5
- **ORM:** Prisma v5 + SQLite (substituível por PostgreSQL)
- **Autenticação:** JWT (access token + refresh token com rotação)
- **Testes:** Jest + Supertest

## Instalação

```bash
git clone https://github.com/anititit/fraudshield.git
cd fraudshield
npm install
cp .env.example .env   # configure DATABASE_URL com sua string PostgreSQL
npx prisma migrate deploy
npm run dev
```

## Variáveis de ambiente

| Variável | Descrição | Padrão |
|----------|-----------|--------|
| `PORT` | Porta do servidor | `3000` |
| `NODE_ENV` | Ambiente | `development` |
| `JWT_SECRET` | Chave secreta do JWT | — |
| `JWT_EXPIRES_IN` | Expiração do access token | `1h` |
| `REFRESH_TOKEN_EXPIRES_DAYS` | Expiração do refresh token | `7` |
| `DATABASE_URL` | Connection string PostgreSQL | `postgresql://user:pass@localhost:5432/fraudshield` |
| `TEST_DATABASE_URL` | Connection string para testes (opcional) | mesmo formato |

## Endpoints

### Auth — `/api/auth`

| Método | Rota | Auth | Descrição |
|--------|------|------|-----------|
| POST | `/register` | Não | Cria um novo usuário |
| POST | `/login` | Não | Retorna access token e refresh token |
| POST | `/refresh` | Não | Renova o access token (rotaciona o refresh token) |
| POST | `/logout` | Não | Invalida o refresh token |

**Register / Login — body:**
```json
{ "email": "user@example.com", "password": "senha123" }
```

**Login — resposta:**
```json
{
  "accessToken": "eyJ...",
  "refreshToken": "uuid-v4",
  "expiresIn": "1h"
}
```

**Refresh — body:**
```json
{ "refreshToken": "uuid-v4" }
```

---

### Fraude — `/api/fraud` 🔒

> Todas as rotas exigem `Authorization: Bearer <accessToken>`

| Método | Rota | Descrição |
|--------|------|-----------|
| POST | `/analyze` | Analisa uma transação e retorna o relatório de risco |
| GET | `/report/:id` | Busca um relatório pelo ID |
| GET | `/reports` | Lista relatórios com paginação e filtros |

**Analyze — body:**
```json
{
  "amount": 15000,
  "userId": "user_42",
  "location": "BR",
  "deviceId": "device_abc"
}
```

**Analyze — resposta:**
```json
{
  "id": "uuid",
  "amount": 15000,
  "riskScore": 40,
  "riskLevel": "MEDIUM",
  "flags": ["HIGH_AMOUNT"],
  "analyzedAt": "2026-03-22T00:00:00.000Z",
  "analyzedBy": "user-uuid"
}
```

**Regras de pontuação:**

| Flag | Condição | Pontos |
|------|----------|--------|
| `HIGH_AMOUNT` | `amount > 10000` | +40 |
| `MISSING_USER` | `userId` ausente | +30 |
| `MISSING_DEVICE` | `deviceId` ausente | +20 |
| `MISSING_LOCATION` | `location` ausente | +10 |

**Níveis de risco:** `LOW` (0–39) · `MEDIUM` (40–69) · `HIGH` (70–100)

**Filtros disponíveis em `/reports`:**

| Parâmetro | Descrição |
|-----------|-----------|
| `page` | Número da página (padrão: 1) |
| `limit` | Itens por página (padrão: 20) |
| `riskLevel` | `LOW`, `MEDIUM` ou `HIGH` |
| `analyzedBy` | ID do analista |
| `startDate` | ISO 8601 — início do período |
| `endDate` | ISO 8601 — fim do período |

---

### Dashboard — `/api/dashboard` 🔒

| Método | Rota | Descrição |
|--------|------|-----------|
| GET | `/summary` | Totais por nível de risco, média e máximo de riskScore |
| GET | `/by-user` | Relatórios agrupados por analista |
| GET | `/timeline` | Contagem diária de transações (HIGH/MEDIUM/LOW) |

Todos aceitam `?startDate=&endDate=` para filtrar por período.

**Summary — resposta:**
```json
{
  "total": 120,
  "byRiskLevel": { "HIGH": 30, "MEDIUM": 50, "LOW": 40 },
  "avgRiskScore": 42.5,
  "maxRiskScore": 100
}
```

**Timeline — resposta:**
```json
[
  { "date": "2026-03-22", "total": 15, "HIGH": 3, "MEDIUM": 7, "LOW": 5 }
]
```

---

## Testes

```bash
# necessita PostgreSQL rodando localmente (ou defina TEST_DATABASE_URL)
TEST_DATABASE_URL="postgresql://postgres:postgres@localhost:5432/fraudshield_test" npm test
```

30 testes de integração cobrindo auth, análise de fraude e dashboard. Os dados são limpos automaticamente entre cada teste.

## Estrutura do projeto

```
src/
├── app.js                  # Express app
├── server.js               # Entrada do servidor
├── config/
│   ├── env.js              # Variáveis de ambiente
│   └── prisma.js           # PrismaClient singleton
├── controllers/            # Handlers de request/response
├── middleware/
│   ├── authenticate.js     # Verificação JWT
│   ├── errorHandler.js     # Tratamento global de erros
│   └── notFound.js         # 404
├── routes/                 # Definição de rotas
└── services/               # Lógica de negócio
prisma/
├── schema.prisma           # Modelos: User, RefreshToken, FraudReport
└── migrations/             # Histórico de migrations
tests/                      # Testes de integração (Jest + Supertest)
```
