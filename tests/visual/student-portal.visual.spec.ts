import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const root=process.cwd();
const referenceUrl=pathToFileURL(path.join(root,'tests/fixtures/student-portal-reference.html')).href;
const sections=[['home','Hoyga'],['tt','Jadwal'],['att','Imaanshaha'],['marks','Natiijo'],['hw','Hawlo'],['news','Ogeysiis'],['msg','Fariimo'],['me','Profile']];
const widths=[360,390,768,1280];
const themes=['light','dark'];

for(const width of widths) for(const theme of themes) {
 test('Student Portal reference comparison · '+width+'px · '+theme,async({browser})=>{
  const context=await browser.newContext({viewport:{width,height:900},colorScheme:theme as 'light'|'dark'});
  const reference=await context.newPage();
  const live=await context.newPage();
  live.on('pageerror',e=>console.log('[student-portal pageerror]',e.stack||e.message));
  live.on('console',m=>{if(m.type()==='error')console.log('[student-portal console]',m.text());});
  const folder=path.join(root,'artifacts','student-portal',theme,String(width));
  fs.mkdirSync(path.join(folder,'reference'),{recursive:true});
  fs.mkdirSync(path.join(folder,'schoolos'),{recursive:true});
  await live.goto('http://127.0.0.1:4173/student-portal-visual.html?component=student&theme='+theme);
  await expect(live.locator('.student-portal-shell')).toBeVisible();
  for(const [section,label] of sections) {
   await reference.goto(referenceUrl+'?theme='+theme+'#'+section);
   await expect(reference.locator('#main h1')).toBeVisible();
   await reference.screenshot({path:path.join(folder,'reference',section+'.png'),fullPage:true});
   if(width>760) {
    await live.locator('.sp-side-nav .sp-nav-item').filter({hasText:label}).click();
   } else if(['home','hw','marks'].includes(section)) {
    await live.locator('.sp-bottom-nav > .sp-nav-item').filter({hasText:label}).click();
   } else {
    await live.locator('.sp-more-wrap > button').click();
    await live.locator('.sp-more-sheet .sp-nav-item').filter({hasText:label}).click();
   }
   await expect(live.locator('.sp-main h1')).toBeVisible();
   await live.screenshot({path:path.join(folder,'schoolos',section+'.png'),fullPage:true});
  }
  const pairs=sections.map(([section])=>'<section><h2>'+section+'</h2><div class="pair"><figure><figcaption>student-portal.html</figcaption><img src="reference/'+section+'.png"></figure><figure><figcaption>SchoolOS</figcaption><img src="schoolos/'+section+'.png"></figure></div></section>').join('');
  fs.writeFileSync(path.join(folder,'index.html'),'<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Student Portal comparison</title><style>body{font:14px system-ui;margin:24px;background:#eef2f7;color:#17212b}section{margin:0 0 32px}.pair{display:grid;grid-template-columns:1fr 1fr;gap:16px}figure{margin:0;background:white;padding:10px;border:1px solid #ccd4df;border-radius:10px}figcaption{font-weight:700;margin:0 0 8px}img{width:100%;height:auto;border:1px solid #e2e8f0}@media(max-width:700px){.pair{grid-template-columns:1fr}}</style><h1>Reference vs SchoolOS · '+width+'px · '+theme+'</h1>'+pairs);
  await context.close();
 });
}
test('write Student Portal screenshot comparison overview',async()=>{
 const folder=path.join(root,'artifacts','student-portal');fs.mkdirSync(folder,{recursive:true});
 const links=themes.flatMap(theme=>widths.map(width=>'<li><a href="'+theme+'/'+width+'/index.html">'+width+'px · '+theme+'</a></li>')).join('');
 fs.writeFileSync(path.join(folder,'index.html'),'<!doctype html><meta charset="utf-8"><title>Student Portal screenshot matrix</title><h1>Student Portal · Reference and SchoolOS</h1><p>8 sections × 4 viewport widths × 2 themes.</p><ul>'+links+'</ul>');
 expect(fs.existsSync(path.join(folder,'index.html'))).toBeTruthy();
});
