// Garante, ao iniciar, as colunas que o app precisa. Se o banco ainda não tem (migração não rodada), cria sozinho.
// Se o usuário do banco não tiver permissão de ALTER, avisa no terminal o comando para rodar manualmente.
async function garantirColunas(pool){
  try{
    const cols=await pool.query("SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='tbComprasCartao' AND COLUMN_NAME='codFin'");
    if(cols.length)return true;
    await pool.query('ALTER TABLE tbComprasCartao ADD COLUMN codFin INT NULL');
    console.log('Banco atualizado: coluna tbComprasCartao.codFin criada. Rode database/migrate-consolidated.sql para ligar as compras antigas.');
    return true;
  }catch(e){
    console.warn('ATENÇÃO: não consegui criar tbComprasCartao.codFin automaticamente ('+e.message+'). Rode: mariadb -u root -p dbGabiru < database/migrate-consolidated.sql');
    return false;
  }
}
module.exports={garantirColunas};
