# PRUMO Privado 2.1 Consolidado

**Seu dinheiro, mês a mês.**

Esta versão substitui os arquivos acumulados das versões 1.1 a 1.6.1 por uma única implementação de frontend e backend. Não há scripts de atualização cumulativa nem rotas concorrentes.

## Estrutura do projeto

```
backend/
  server.js          ponto de entrada: configura o Express e monta as rotas
  db.js              conexão com o MariaDB (lê as variáveis de ambiente)
  helpers.js         funções utilitárias (respostas, datas, transações)
  services/          regras de negócio (saldo, projeção, cotações, crédito)
  routes/            um arquivo por módulo (movimentações, câmbio, bens...)
JS/                  frontend, um arquivo por módulo, carregado em ordem
css/                 estilos e temas
database/            migração do banco
tests/               testes automatizados (node --test)
```

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

5. Crie um usuário próprio para o PRUMO no banco, em vez de usar o root:

```sql
CREATE USER 'prumo'@'localhost' IDENTIFIED BY 'escolha-uma-senha-forte';
GRANT ALL PRIVILEGES ON dbGabiru.* TO 'prumo'@'localhost';
FLUSH PRIVILEGES;
```

6. Instale e teste:

```bash
npm install
npm test
```

7. Inicie, informando as credenciais do usuário criado no passo 5:

```bash
DB_HOST=localhost DB_PORT=3306 DB_USER=prumo DB_PASSWORD='sua-senha' DB_NAME=dbGabiru PORT=3000 npm start
```

Acesse `http://localhost:3000` e pressione `Command + Shift + R`.

Dica: com Node 20.6 ou superior você pode guardar essas variáveis no arquivo `.env` (que nunca vai para o GitHub) e iniciar com `node --env-file=.env backend/server.js`.

## Acesso somente neste computador

Por padrão o servidor aceita conexões apenas do próprio computador (`127.0.0.1`). Assim, ninguém mais na rede Wi-Fi consegue abrir ou alterar seus dados financeiros.

Se um dia você quiser acessar de outro aparelho na sua rede, inicie com `HOST=0.0.0.0` — mas faça isso só em redes em que confia, pois ainda não há tela de login.

## Testes

```bash
npm test
```

Os testes verificam as funções de cálculo, a estrutura dos arquivos e as respostas da API com um banco simulado, sem mexer nos seus dados.

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

- O servidor escuta somente em `127.0.0.1`, salvo se você definir `HOST` (acima).
- Use o usuário `prumo` do banco, com senha própria e acesso apenas ao `dbGabiru`, nunca o root sem senha.
- Nunca envie `.env`, backups SQL, `node_modules` ou dados financeiros ao GitHub.

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

## Novidades da v2.2

- **Outros automático**: ao informar o total da fatura, o que não foi anotado vira uma compra "Outros - <cartão> <AAAA-MM>" (chave `fatura-outros:<codFatura>`). Reinformar o total atualiza, nunca duplica. Se você anotou mais que a fatura, aparece o alerta de excedente em Cartões. Rode `database/migrate-consolidated.sql` (adiciona `tbComprasCartao.chaveOrigem`).
- **Pru interativo**: comentário curto a cada lançamento, transferência e fatura; o simulador diz por quantos meses a compra deixa você no vermelho. Dá pra deixar o Pru quieto em Configurações.
- **Lançamento rápido** (botão "+"), **lembretes** de fatura que fechou/vai fechar, **importar fatura** (PDF/CSV/texto: só sugere o total) e **Resumo do mês**.
- Home mais simples: cotações discretas e três números principais.
