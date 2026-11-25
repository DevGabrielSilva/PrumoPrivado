# PRUMO Privado 2.0 Consolidado

**Seu dinheiro, mês a mês.**

Esta versão substitui os arquivos acumulados das versões 1.1 a 1.6.1 por uma única implementação de frontend e backend. Não há scripts de atualização cumulativa nem rotas concorrentes.

## Instalação

1. Faça backup:

```bash
mariadb-dump -u root -p dbGabiru > backup_prumo_antes_2_0.sql
```

2. Preserve na pasta atual: `.git/`, `.env` e todos os `backup_*.sql`.
3. Substitua os demais arquivos pelos deste pacote.
4. Execute a migração não destrutiva:

```bash
mariadb -u root -p dbGabiru < database/migrate-consolidated.sql
```

5. Instale e teste:

```bash
npm install
npm test
node --check backend/server.js
node --check JS/script.js
```

6. Inicie:

```bash
DB_HOST=localhost DB_PORT=3306 DB_USER=root DB_PASSWORD='' DB_NAME=dbGabiru PORT=3000 npm start
```

Acesse `http://localhost:3000` e pressione `Command + Shift + R`.

## O que foi consolidado

- uma única API em `/api/app/*`;
- uma única definição para dashboard, movimentações, projeção, bens e configurações;
- receitas e despesas recorrentes por competência;
- efetivação mensal independente;
- poupança inicial no saldo poupado e patrimônio;
- formulários com IDs limpos ao criar novos registros;
- compra parcelada no crédito sem recorrência adicional;
- campos de data com data atual e área clicável;
- reset transacional na ordem correta;
- valores negativos destacados em vermelho;
- projeção mensal clicável com composição.

## Segurança

Nunca envie `.env`, backups SQL, `node_modules` ou dados financeiros ao GitHub.

## Versão 2.1

- imagem real do Pru incluída no pacote;
- recorrências exibidas em uma linha, sem duplicar ao efetivar;
- edição e exclusão por competência;
- cards de projeção com rótulos claros;
- sugestão do melhor mês para uma compra;
- custos de bens vinculados às movimentações;
- primeira fatura selecionada por mês;
- próximos compromissos preenchidos;
- módulo de gastos fixos;
- saldo livre, custo fixo, sobra mensal, cobertura da reserva e próximo risco na Visão geral.
