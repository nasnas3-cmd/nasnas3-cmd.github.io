const fs=require('fs');
const files=['ui.js','battle.js','map.js','engine.js','audio.js','gfx.js','data.js','save.js'].filter(f=>fs.existsSync(f));
const mods=['battle','map','engine','ui','gfx','audio','save','data'];
const exportsMap={};
function getExportBlock(c, mod){
  const re=new RegExp('window\\.RPG\\.'+mod+'\\s*=\\s*\\{','g');
  let mm, best=null;
  while(mm=re.exec(c)){
    let i=mm.index+mm[0].length-1, depth=0;
    for(;i<c.length;i++){
      if(c[i]==='{')depth++;
      else if(c[i]==='}'){depth--; if(depth===0){best=c.slice(mm.index, i+1); break;}}
    }
  }
  return best;
}
for(const f of files){
  const c=fs.readFileSync(f,'utf8');
  for(const m of mods){
    const block=getExportBlock(c,m);
    if(!block) continue;
    const keyRe=/([A-Za-z_]\w*)\s*:/g; let k;
    const keys=new Set();
    while(k=keyRe.exec(block)) keys.add(k[1]);
    exportsMap[m]=exportsMap[m]||new Set();
    keys.forEach(x=>exportsMap[m].add(x));
  }
}
console.log('EXPORT SETS (counts):');
for(const m of mods) if(exportsMap[m]) console.log('  '+m+' ('+exportsMap[m].size+'):',[...exportsMap[m]].sort().join(', '));
const refRe=/RPG\.(battle|map|engine|ui|gfx|audio|save|data)\.([A-Za-z_]\w*)/g;
let refs={};
for(const f of files){
  const c=fs.readFileSync(f,'utf8');
  let m;
  while(m=refRe.exec(c)){ refs[m[1]]=refs[m[1]]||new Set(); refs[m[1]].add(m[2]); }
}
console.log('\nUNRESOLVED (referenced but NOT in export set):');
let any=false;
for(const mod of mods){
  if(!refs[mod]) continue;
  for(const prop of refs[mod]){
    if(prop==='data') continue; // RPG.data.X handled elsewhere
    if(!exportsMap[mod] || !exportsMap[mod].has(prop)){
      console.log('  RPG.'+mod+'.'+prop);
      any=true;
    }
  }
}
if(!any) console.log('  NONE');
