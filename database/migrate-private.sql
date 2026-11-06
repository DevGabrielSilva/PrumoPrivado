-- PRUMO PRIVADO - MIGRACAO CONSOLIDADA E NAO DESTRUTIVA
-- Antes de executar:
-- mariadb-dump -u root -p dbGabiru > backup_prumo_privado.sql
USE dbGabiru;

CREATE TABLE IF NOT EXISTS tbConfiguracoes(
 id TINYINT PRIMARY KEY DEFAULT 1,
 saldoInicial DECIMAL(12,2) NOT NULL DEFAULT 0,
 dataSaldoInicial DATE NOT NULL DEFAULT (CURRENT_DATE),
 limiteSeguranca DECIMAL(12,2) NOT NULL DEFAULT 0,
 dataUltimoBackup DATETIME NULL
);
INSERT IGNORE INTO tbConfiguracoes(id,saldoInicial,dataSaldoInicial,limiteSeguranca) VALUES(1,0,CURRENT_DATE,0);

ALTER TABLE tbFinancas ADD COLUMN IF NOT EXISTS origem VARCHAR(30) NOT NULL DEFAULT 'MANUAL';
ALTER TABLE tbFinancas ADD COLUMN IF NOT EXISTS chaveOrigem VARCHAR(80) NULL;
ALTER TABLE tbFinancas ADD COLUMN IF NOT EXISTS situacao ENUM('PREVISTA','EFETIVADA','CANCELADA') NOT NULL DEFAULT 'EFETIVADA';
ALTER TABLE tbFinancas ADD COLUMN IF NOT EXISTS formaPagamento ENUM('DINHEIRO','PIX','DEBITO','CREDITO','BOLETO','TRANSFERENCIA','OUTRO') NULL;
ALTER TABLE tbFinancas ADD COLUMN IF NOT EXISTS codCartao INT NULL;
ALTER TABLE tbFinancas ADD COLUMN IF NOT EXISTS quantidadeParcelas INT NULL;
ALTER TABLE tbFinancas ADD COLUMN IF NOT EXISTS primeiraFatura DATE NULL;
ALTER TABLE tbFinancas ADD COLUMN IF NOT EXISTS competenciaRecorrencia CHAR(7) NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uk_fin_origem ON tbFinancas(chaveOrigem);
CREATE INDEX IF NOT EXISTS idx_fin_data_tipo ON tbFinancas(dataMovimentacao,tipo);

ALTER TABLE tbFaturas ADD COLUMN IF NOT EXISTS competencia CHAR(7) NULL;
ALTER TABLE tbFaturas ADD COLUMN IF NOT EXISTS valorInformado BOOLEAN NOT NULL DEFAULT FALSE;
CREATE UNIQUE INDEX IF NOT EXISTS uk_fatura_competencia ON tbFaturas(codCartao,competencia);

CREATE TABLE IF NOT EXISTS tbMoedasEstrangeiras(
 codMoeda INT AUTO_INCREMENT PRIMARY KEY,
 dataMovimentacao DATE NOT NULL,
 moeda ENUM('USD','EUR') NOT NULL,
 tipo ENUM('ENTRADA','SAIDA') NOT NULL,
 valorReal DECIMAL(12,2) NOT NULL,
 cotacaoOperacao DECIMAL(12,4) NOT NULL,
 valorMoeda DECIMAL(12,4) NOT NULL,
 descricao VARCHAR(100) NULL,
 origemLegada VARCHAR(80) NULL,
 chaveOperacao VARCHAR(80) NULL,
 codFinReal INT NULL,
 UNIQUE KEY uk_moeda_legada(origemLegada),
 UNIQUE KEY uk_moeda_operacao(chaveOperacao),
 INDEX idx_moeda_data(moeda,dataMovimentacao),
 CONSTRAINT fk_moeda_fin FOREIGN KEY(codFinReal) REFERENCES tbFinancas(codFin) ON DELETE SET NULL,
 CONSTRAINT chk_moeda_cotacao CHECK(cotacaoOperacao>0),
 CONSTRAINT chk_moeda_valor CHECK(valorMoeda>0),
 CONSTRAINT chk_moeda_real CHECK(valorReal>0)
);
ALTER TABLE tbMoedasEstrangeiras ADD COLUMN IF NOT EXISTS chaveOperacao VARCHAR(80) NULL;
ALTER TABLE tbMoedasEstrangeiras ADD COLUMN IF NOT EXISTS codFinReal INT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uk_moeda_operacao ON tbMoedasEstrangeiras(chaveOperacao);

-- Preserva e copia o histórico antigo de dólar apenas uma vez.
INSERT IGNORE INTO tbMoedasEstrangeiras(dataMovimentacao,moeda,tipo,valorReal,cotacaoOperacao,valorMoeda,descricao,origemLegada)
SELECT dataMovimentacao,'USD',tipo,COALESCE(NULLIF(valorReal,0),cotacaoDolar*valorDolar),cotacaoDolar,valorDolar,descricao,CONCAT('tbInvestimentosDolar:',codInvestimento)
FROM tbInvestimentosDolar;

CREATE TABLE IF NOT EXISTS tbObrigacoesBens(
 codObrigacao INT AUTO_INCREMENT PRIMARY KEY,
 codBem INT NOT NULL,
 ano SMALLINT NOT NULL,
 tipo ENUM('IPVA','LICENCIAMENTO','IPTU','LICENCA_ANUAL') NOT NULL,
 descricao VARCHAR(100) NULL,
 valor DECIMAL(12,2) NOT NULL DEFAULT 0,
 dataVencimento DATE NULL,
 paga BOOLEAN NOT NULL DEFAULT FALSE,
 dataPagamento DATE NULL,
 quantidadeParcelas INT NOT NULL DEFAULT 1,
 codFinPagamento INT NULL,
 FOREIGN KEY(codBem) REFERENCES tbBens(codBem) ON DELETE CASCADE,
 FOREIGN KEY(codFinPagamento) REFERENCES tbFinancas(codFin) ON DELETE SET NULL,
 UNIQUE KEY uk_obrigacao_bem_ano(codBem,ano,tipo)
);

CREATE TABLE IF NOT EXISTS tbCotacoes(
 moeda CHAR(3) PRIMARY KEY,
 cotacaoCompra DECIMAL(12,6) NOT NULL,
 cotacaoVenda DECIMAL(12,6) NULL,
 dataCotacao DATETIME NOT NULL,
 fonte VARCHAR(80) NOT NULL,
 consultadaEm DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_trans_data ON tbTransferencias(dataTransferencia);
CREATE INDEX IF NOT EXISTS idx_parcela_data ON tbParcelasCartao(dataParcela,paga);
CREATE INDEX IF NOT EXISTS idx_fatura_vencimento ON tbFaturas(dataVencimento,paga);

UPDATE tbFinancas
SET situacao=CASE WHEN dataMovimentacao>CURRENT_DATE THEN 'PREVISTA' ELSE 'EFETIVADA' END
WHERE situacao IS NULL;
