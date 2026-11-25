CREATE DATABASE IF NOT EXISTS dbGabiru CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE dbGabiru;
CREATE TABLE IF NOT EXISTS tbBens(codBem INT AUTO_INCREMENT PRIMARY KEY,dataCadastro DATE NOT NULL,dataAquisicao DATE NULL,descricao VARCHAR(100) NOT NULL,categoria VARCHAR(50),valorPago DECIMAL(12,2) NOT NULL DEFAULT 0,valorAtual DECIMAL(12,2) NOT NULL DEFAULT 0,CHECK(valorPago>=0),CHECK(valorAtual>=0));
CREATE TABLE IF NOT EXISTS tbFinancas(codFin INT AUTO_INCREMENT PRIMARY KEY,dataMovimentacao DATE NOT NULL,tipo ENUM('RECEITA','DESPESA') NOT NULL,descricao VARCHAR(100) NOT NULL,valor DECIMAL(12,2) NOT NULL,categoria VARCHAR(50),recorrente BOOLEAN NOT NULL DEFAULT FALSE,frequencia ENUM('MENSAL','ANUAL') NULL,dataInicioRecorrencia DATE NULL,dataFimRecorrencia DATE NULL,codBem INT NULL,origem VARCHAR(30) NOT NULL DEFAULT 'MANUAL',chaveOrigem VARCHAR(80) NULL,FOREIGN KEY(codBem) REFERENCES tbBens(codBem) ON DELETE SET NULL,UNIQUE KEY uk_fin_origem(chaveOrigem),INDEX idx_fin_data_tipo(dataMovimentacao,tipo),CHECK(valor>0));
CREATE TABLE IF NOT EXISTS tbTransferencias(codTransferencia INT AUTO_INCREMENT PRIMARY KEY,dataTransferencia DATE NOT NULL,origem ENUM('SALDO','POUPANCA') NOT NULL,destino ENUM('SALDO','POUPANCA') NOT NULL,valor DECIMAL(12,2) NOT NULL,descricao VARCHAR(100),INDEX idx_trans_data(dataTransferencia),CHECK(origem<>destino),CHECK(valor>0));
CREATE TABLE IF NOT EXISTS tbInvestimentosDolar(codInvestimento INT AUTO_INCREMENT PRIMARY KEY,dataMovimentacao DATE NOT NULL,tipo ENUM('ENTRADA','SAIDA') NOT NULL,valorReal DECIMAL(12,2),cotacaoDolar DECIMAL(12,4) NOT NULL,valorDolar DECIMAL(12,4) NOT NULL,descricao VARCHAR(100),INDEX idx_dolar_data(dataMovimentacao),CHECK(cotacaoDolar>0),CHECK(valorDolar>0));
CREATE TABLE IF NOT EXISTS tbCartoes(codCartao INT AUTO_INCREMENT PRIMARY KEY,nomeCartao VARCHAR(50) NOT NULL,diaFechamento TINYINT NOT NULL,diaVencimento TINYINT NOT NULL,ativo BOOLEAN DEFAULT TRUE,CHECK(diaFechamento BETWEEN 1 AND 31),CHECK(diaVencimento BETWEEN 1 AND 31));
CREATE TABLE IF NOT EXISTS tbComprasCartao(codCompra INT AUTO_INCREMENT PRIMARY KEY,codCartao INT NOT NULL,dataCompra DATE NOT NULL,descricao VARCHAR(100) NOT NULL,categoria VARCHAR(50),valorTotal DECIMAL(12,2) NOT NULL,quantidadeParcelas INT NOT NULL,valorParcela DECIMAL(12,2) NOT NULL,dataPrimeiraParcela DATE NOT NULL,codBem INT NULL,chaveOrigem VARCHAR(80) NULL,UNIQUE KEY uk_compra_origem(chaveOrigem),FOREIGN KEY(codCartao) REFERENCES tbCartoes(codCartao) ON DELETE RESTRICT,FOREIGN KEY(codBem) REFERENCES tbBens(codBem) ON DELETE SET NULL,CHECK(valorTotal>0),CHECK(quantidadeParcelas>0));
CREATE TABLE IF NOT EXISTS tbParcelasCartao(codParcela INT AUTO_INCREMENT PRIMARY KEY,codCompra INT NOT NULL,numeroParcela INT NOT NULL,valor DECIMAL(12,2) NOT NULL,dataParcela DATE NOT NULL,faturada BOOLEAN DEFAULT FALSE,paga BOOLEAN DEFAULT FALSE,FOREIGN KEY(codCompra) REFERENCES tbComprasCartao(codCompra) ON DELETE CASCADE,UNIQUE(codCompra,numeroParcela),INDEX idx_parcela_data(dataParcela,paga),CHECK(valor>0));
CREATE TABLE IF NOT EXISTS tbFaturas(codFatura INT AUTO_INCREMENT PRIMARY KEY,codCartao INT NOT NULL,dataFechamento DATE NOT NULL,dataVencimento DATE NOT NULL,valorTotal DECIMAL(12,2) NOT NULL,dataPagamento DATE,paga BOOLEAN DEFAULT FALSE,codFinPagamento INT NULL,FOREIGN KEY(codCartao) REFERENCES tbCartoes(codCartao),FOREIGN KEY(codFinPagamento) REFERENCES tbFinancas(codFin) ON DELETE SET NULL,UNIQUE(codCartao,dataVencimento),INDEX idx_fatura_vencimento(dataVencimento,paga),CHECK(valorTotal>=0));
CREATE TABLE IF NOT EXISTS tbFaturaParcelas(codFaturaParcela INT AUTO_INCREMENT PRIMARY KEY,codFatura INT NOT NULL,codParcela INT NOT NULL,FOREIGN KEY(codFatura) REFERENCES tbFaturas(codFatura) ON DELETE CASCADE,FOREIGN KEY(codParcela) REFERENCES tbParcelasCartao(codParcela) ON DELETE RESTRICT,UNIQUE(codFatura,codParcela),UNIQUE(codParcela));
CREATE TABLE IF NOT EXISTS tbObjetivos(codObjetivo INT AUTO_INCREMENT PRIMARY KEY,descricao VARCHAR(100) NOT NULL,categoria VARCHAR(50),valorObjetivo DECIMAL(12,2) NOT NULL,dataCriacao DATE NOT NULL,dataObjetivo DATE,ativo BOOLEAN DEFAULT TRUE,CHECK(valorObjetivo>0));
CREATE TABLE IF NOT EXISTS tbAportesObjetivos(codAporte INT AUTO_INCREMENT PRIMARY KEY,codObjetivo INT NOT NULL,dataAporte DATE NOT NULL,valor DECIMAL(12,2) NOT NULL,descricao VARCHAR(100),FOREIGN KEY(codObjetivo) REFERENCES tbObjetivos(codObjetivo) ON DELETE CASCADE,CHECK(valor>0));
CREATE TABLE IF NOT EXISTS tbProgramasPontos(codPrograma INT AUTO_INCREMENT PRIMARY KEY,nomePrograma VARCHAR(50) NOT NULL UNIQUE,saldo DECIMAL(15,2) NOT NULL DEFAULT 0,dataAtualizacao DATE NOT NULL,CHECK(saldo>=0));
CREATE TABLE IF NOT EXISTS tbMovimentacoesPontos(codMovimentacaoPonto INT AUTO_INCREMENT PRIMARY KEY,codPrograma INT NOT NULL,dataMovimentacao DATE NOT NULL,tipo ENUM('ENTRADA','SAIDA') NOT NULL,quantidade DECIMAL(15,2) NOT NULL,descricao VARCHAR(100),FOREIGN KEY(codPrograma) REFERENCES tbProgramasPontos(codPrograma) ON DELETE RESTRICT,INDEX idx_pontos_programa_data(codPrograma,dataMovimentacao),CHECK(quantidade>0));
INSERT IGNORE INTO tbProgramasPontos(nomePrograma,saldo,dataAtualizacao) VALUES('Livelo',0,CURRENT_DATE),('Esfera',0,CURRENT_DATE),('Smiles',0,CURRENT_DATE);

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
 CHECK(cotacaoOperacao>0),CHECK(valorMoeda>0),CHECK(valorReal>0)
);

CREATE TABLE IF NOT EXISTS tbConfiguracoes(
 id TINYINT PRIMARY KEY DEFAULT 1,
 saldoInicial DECIMAL(12,2) NOT NULL DEFAULT 0,
 dataSaldoInicial DATE NOT NULL DEFAULT (CURRENT_DATE),
 limiteSeguranca DECIMAL(12,2) NOT NULL DEFAULT 0,
 dataUltimoBackup DATETIME NULL
);
INSERT IGNORE INTO tbConfiguracoes(id,saldoInicial,dataSaldoInicial,limiteSeguranca) VALUES(1,0,CURRENT_DATE,0);

ALTER TABLE tbFinancas ADD COLUMN IF NOT EXISTS situacao ENUM('PREVISTA','EFETIVADA','CANCELADA') NOT NULL DEFAULT 'EFETIVADA';
ALTER TABLE tbFinancas ADD COLUMN IF NOT EXISTS formaPagamento ENUM('DINHEIRO','PIX','DEBITO','CREDITO','BOLETO','TRANSFERENCIA','OUTRO') NULL;
ALTER TABLE tbFinancas ADD COLUMN IF NOT EXISTS codCartao INT NULL;
ALTER TABLE tbFinancas ADD COLUMN IF NOT EXISTS quantidadeParcelas INT NULL;
ALTER TABLE tbFinancas ADD COLUMN IF NOT EXISTS primeiraFatura DATE NULL;
ALTER TABLE tbFinancas ADD COLUMN IF NOT EXISTS competenciaRecorrencia CHAR(7) NULL;

ALTER TABLE tbFaturas ADD COLUMN IF NOT EXISTS competencia CHAR(7) NULL;
ALTER TABLE tbFaturas ADD COLUMN IF NOT EXISTS valorInformado BOOLEAN NOT NULL DEFAULT FALSE;

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

ALTER TABLE tbFinancas ADD COLUMN IF NOT EXISTS codBem INT NULL;
CREATE TABLE IF NOT EXISTS tbCustosBens(
 codCusto INT AUTO_INCREMENT PRIMARY KEY,
 codBem INT NOT NULL,
 dataCusto DATE NOT NULL,
 tipo ENUM('MANUTENCAO','REPARO','SEGURO','IMPOSTO','LICENCIAMENTO','DOCUMENTACAO','CONDOMINIO','REFORMA','VISTORIA','TAXA','OUTRO') NOT NULL,
 descricao VARCHAR(120) NULL,
 valor DECIMAL(12,2) NOT NULL,
 situacao ENUM('PREVISTO','PAGO') NOT NULL DEFAULT 'PAGO',
 observacao VARCHAR(255) NULL,
 codFin INT NULL,
 FOREIGN KEY(codBem) REFERENCES tbBens(codBem) ON DELETE CASCADE,
 FOREIGN KEY(codFin) REFERENCES tbFinancas(codFin) ON DELETE SET NULL,
 INDEX idx_custo_bem_data(codBem,dataCusto)
);

ALTER TABLE tbConfiguracoes ADD COLUMN IF NOT EXISTS reservaEmergencia DECIMAL(12,2) NOT NULL DEFAULT 0;
ALTER TABLE tbConfiguracoes ADD COLUMN IF NOT EXISTS alertaUSDAtivo BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE tbConfiguracoes ADD COLUMN IF NOT EXISTS alertaUSDValor DECIMAL(12,4) NOT NULL DEFAULT 5.0000;
ALTER TABLE tbConfiguracoes ADD COLUMN IF NOT EXISTS alertaEURAtivo BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE tbConfiguracoes ADD COLUMN IF NOT EXISTS alertaEURValor DECIMAL(12,4) NOT NULL DEFAULT 6.0000;

ALTER TABLE tbConfiguracoes ADD COLUMN IF NOT EXISTS poupancaInicial DECIMAL(12,2) NOT NULL DEFAULT 0;
ALTER TABLE tbConfiguracoes ADD COLUMN IF NOT EXISTS configuracaoInicialConcluida BOOLEAN NOT NULL DEFAULT FALSE;
CREATE TABLE IF NOT EXISTS tbOcorrenciasRecorrentes(
 codOcorrencia INT AUTO_INCREMENT PRIMARY KEY,
 codFinModelo INT NOT NULL,
 competencia CHAR(7) NOT NULL,
 dataPrevista DATE NOT NULL,
 valor DECIMAL(12,2) NOT NULL,
 situacao ENUM('PREVISTA','EFETIVADA','CANCELADA') NOT NULL DEFAULT 'PREVISTA',
 dataEfetivacao DATE NULL,
 codFinEfetivada INT NULL,
 observacao VARCHAR(255) NULL,
 FOREIGN KEY(codFinModelo) REFERENCES tbFinancas(codFin) ON DELETE CASCADE,
 FOREIGN KEY(codFinEfetivada) REFERENCES tbFinancas(codFin) ON DELETE SET NULL,
 UNIQUE KEY uk_ocorrencia_modelo_competencia(codFinModelo,competencia)
);
