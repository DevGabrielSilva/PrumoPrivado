const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.join(__dirname,'..');

test('arquivos essenciais existem',()=>{
  ['index.html','css/style.css','JS/script.js','backend/server.js','database/schema.sql','database/migrate-private.sql','.gitignore','.env.example','README.md'].forEach(file=>assert.ok(fs.existsSync(path.join(root,file)),file));
});

test('scripts SQL não apagam o banco',()=>{
  for(const file of ['database/schema.sql','database/migrate-private.sql']){
    const sql=fs.readFileSync(path.join(root,file),'utf8').toUpperCase();
    assert.equal(sql.includes('DROP DATABASE'),false,file);
    assert.equal(sql.includes('TRUNCATE TABLE'),false,file);
  }
});

test('identidade privada é PRUMO',()=>{
  const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
  assert.match(html,/PRUMO/);
  assert.match(html,/assets\/mascote\.png/);
  assert.doesNotMatch(html,/TRÉGUA/i);
});

test('gitignore protege dados privados',()=>{
  const ignore=fs.readFileSync(path.join(root,'.gitignore'),'utf8');
  ['.env','backup_*.sql','node_modules/','*.zip'].forEach(item=>assert.ok(ignore.includes(item),item));
});
