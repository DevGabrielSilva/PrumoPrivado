# PRUMO Privado

**Seu dinheiro, mês a mês.**

Versão pessoal do PRUMO para uso com o banco real `dbGabiru`. Este repositório armazena o código e as migrações, nunca os dados financeiros.

## Funcionalidades

- saldo disponível separado de poupança, câmbio e bens;
- movimentações efetivadas, previstas e canceladas;
- receitas, despesas, categorias, recorrências e formas de pagamento;
- transferências entre saldo e poupança;
- dólar e euro com PTAX, fonte alternativa e cache;
- cartões, compras no crédito e faturas;
- cálculo de compras conhecidas e `Outros` da fatura;
- bens pessoais e obrigações anuais;
- objetivos comparados à poupança;
- previsão mensal e margem de segurança;
- simulador à vista ou parcelado;
- temas claro, escuro e automático;
- português e inglês.

## Requisitos

- Node.js 20+;
- npm;
- MariaDB 10.6+;
- banco existente `dbGabiru`.

## Instalação segura

### 1. Instale as dependências

```bash
npm install
```

### 2. Faça backup antes da migração

```bash
mariadb-dump -u root -p dbGabiru > backup_prumo_privado.sql
```

O arquivo `backup_prumo_privado.sql` é ignorado pelo Git e não deve ser enviado ao GitHub.

### 3. Aplique a migração consolidada

```bash
mariadb -u root -p dbGabiru < database/migrate-private.sql
```

A migração não executa `DROP DATABASE`, preserva o histórico antigo de dólar e cria somente as estruturas necessárias à versão atual.

### 4. Inicie o servidor

Sem senha no MariaDB:

```bash
DB_HOST=localhost DB_PORT=3306 DB_USER=root DB_PASSWORD='' DB_NAME=dbGabiru PORT=3000 npm start
```

Acesse:

```text
http://localhost:3000
```

## Desenvolvimento

```bash
npm run dev
```

## Testes

```bash
npm test
node --check backend/server.js
node --check JS/script.js
```

## Segurança do repositório

O `.gitignore` bloqueia:

- `.env`;
- `node_modules`;
- backups SQL;
- arquivos ZIP;
- logs;
- dados em `database/private/`.

Antes de cada `git push`, confira:

```bash
git status
git diff --cached
```

Nunca envie senhas, dumps ou dados financeiros reais, mesmo para um repositório privado.

## Estrutura

```text
assets/                 identidade visual e Pru
backend/server.js       API Express e regras financeiras
css/style.css           temas e responsividade
database/schema.sql     instalação nova
database/migrate-private.sql  atualização segura do dbGabiru
JS/script.js            frontend e integrações
index.html              interface
.env.example            exemplo sem credenciais
.gitignore              proteção de arquivos privados
```

## Backup e restauração

Criar backup:

```bash
mariadb-dump -u root -p dbGabiru > backup_prumo_privado.sql
```

A restauração substitui dados e deve ser feita apenas após conferir o arquivo:

```bash
mariadb -u root -p dbGabiru < backup_prumo_privado.sql
```

## Observação

As projeções são estimativas baseadas nos dados cadastrados. O PRUMO não constitui recomendação financeira, contábil ou de investimento.
