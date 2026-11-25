// Conexão com o banco MariaDB. As credenciais vêm de variáveis de ambiente; nunca grave senhas no código.
const mariadb=require('mariadb');
const pool=mariadb.createPool({host:process.env.DB_HOST||'localhost',port:Number(process.env.DB_PORT||3306),user:process.env.DB_USER||'root',password:process.env.DB_PASSWORD||'',database:process.env.DB_NAME||'dbGabiru',connectionLimit:5,bigIntAsNumber:true,dateStrings:true});

module.exports={pool};
