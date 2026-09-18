import fs from 'node:fs';
import path from 'node:path';

const index = JSON.parse(fs.readFileSync('quiz-index.json','utf8'));
const included = new Set();
for (const item of index) {
  if (item.dataUrl) included.add(String(item.dataUrl));
  if (item.lessonPattern && Array.isArray(item.lessonRange) && item.lessonRange.length === 2) {
    for (let n=Number(item.lessonRange[0]); n<=Number(item.lessonRange[1]); n+=1) {
      included.add(String(item.lessonPattern).replace('{LL}', String(n).padStart(2,'0')));
    }
  }
}
const files=fs.readdirSync('packs').filter(x=>x.endsWith('.json')).sort();
let yes=0,no=0;
for(const file of files){
  const rel='packs/'+file;
  const full=path.join('packs',file);
  const pack=JSON.parse(fs.readFileSync(full,'utf8'));
  const flag=included.has(rel);
  pack.catalog={...(pack.catalog||{}),included:flag};
  flag?yes++:no++;
  fs.writeFileSync(full,JSON.stringify(pack,null,2)+'\n');
}
console.log('CATALOG_MIGRATION packs='+files.length+' included='+yes+' excluded='+no);
