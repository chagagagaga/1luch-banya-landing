import { chromium } from 'playwright';
const OUT='/private/tmp/claude-501/-Users-alex/0bc48c55-0c04-4795-afc4-6b65a2a3063a/scratchpad/shots';
import fs from 'fs'; fs.mkdirSync(OUT,{recursive:true});
const b=await chromium.launch({channel:'chrome'});
for (const [w,name] of [[390,'m'],[1440,'d']]) {
  const p=await b.newPage({viewport:{width:w,height:900},deviceScaleFactor:2});
  await p.goto('http://localhost:8099/index.html',{waitUntil:'networkidle'});
  const secs=await p.$$('main > section');
  for (let i=0;i<secs.length;i++){
    const id=await secs[i].evaluate(e=>e.id||e.className.replace('section ','').trim());
    await secs[i].scrollIntoViewIfNeeded(); await p.waitForTimeout(250);
    await secs[i].screenshot({path:`${OUT}/${name}-${String(i).padStart(2,'0')}-${id}.png`}).catch(()=>{});
  }
  await p.close();
}
await b.close(); console.log('готово');
