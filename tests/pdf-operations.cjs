// Requires Playwright; run node tests/pdf-operations.cjs.
// Optional: PLAYWRIGHT_MODULE and CHROMIUM_EXECUTABLE select existing local tooling.
const fs=require('fs'),http=require('http'),vm=require('vm'),assert=require('assert/strict'),cp=require('child_process');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const path=require('path'), os=require('os');
const root=path.resolve(__dirname,'..'), out=fs.mkdtempSync(path.join(os.homedir(),'pdfpure-test-'));
fs.copyFileSync(path.join(root,'vendor/pdf-lib.min.js'),path.join(out,'pdf-lib.cjs'));
const {PDFDocument}=require(out+'/pdf-lib.cjs');
const worker=vm.runInNewContext(fs.readFileSync(root+'/worker.js','utf8').replace('export default','globalThis.worker =')+';worker',{URL,Response});
(async()=>{
 const a=await PDFDocument.create();a.addPage([100,200]);a.addPage([200,300]);a.addPage([300,400]);fs.writeFileSync(out+'/a.pdf',await a.save());
 const b=await PDFDocument.create();b.addPage([400,500]);fs.writeFileSync(out+'/b.pdf',await b.save());fs.writeFileSync(out+'/broken.pdf','not a pdf');
 const server=http.createServer(async(req,res)=>{try{const r=await worker.fetch(new Request('http://localhost'+req.url),{},{});res.writeHead(r.status,Object.fromEntries(r.headers));res.end(Buffer.from(await r.arrayBuffer()));}catch(e){res.writeHead(500);res.end(e.message);}});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const origin='http://127.0.0.1:'+server.address().port;
 const browser=await chromium.launch({executablePath:process.env.CHROMIUM_EXECUTABLE || undefined,headless:true,downloadsPath:out,args:['--no-sandbox']});
 const page=await browser.newPage({viewport:{width:390,height:844}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('https://**/*',route=>route.abort());
 const results=[];
 const fixture=name=>({name,mimeType:'application/pdf',buffer:fs.readFileSync(out+'/'+name)});
 async function download(button,name) {const wait=page.waitForEvent('download');await page.locator(button).click();const d=await wait;await d.saveAs(out+'/'+name);return PDFDocument.load(fs.readFileSync(out+'/'+name));}
 try {
  for(const lang of ['', 'zh/','de/','es/','fr/','ja/','pt/']) {
   await page.goto(origin+'/'+lang+'pdf-splitter');await page.locator('#split-file-inp').setInputFiles(fixture('a.pdf'));await page.locator('#split-range').fill('3, 1-2, 3');
   const split=await download('#btn-split-action',lang.replace('/','')+'split.pdf');assert.deepEqual(split.getPages().map(p=>p.getWidth()),[300,100,200]);results.push(lang+'split page order and duplicate removal passed');
  }
  for (const invalid of ['', '0', '4', '2-1', '1x', '1,', '99999999999999999']) {
   await page.locator('#split-range').fill(invalid);await page.locator('#btn-split-action').click();await page.waitForFunction(()=>!document.querySelector('#btn-split-action').disabled);assert.match(await page.locator('[role=status]').innerText(),/páginas|PDF/);results.push('invalid range '+JSON.stringify(invalid)+' rejected');
  }
  await page.goto(origin+'/pdf-merger');await page.locator('#pdf-file-input').setInputFiles([fixture('a.pdf'),fixture('b.pdf')]);
  const merged=await download('#btn-merge-action','merged.pdf');assert.deepEqual(merged.getPages().map(p=>p.getWidth()),[100,200,300,400]);results.push('merge produced four readable ordered pages');
  await page.locator('#btn-clear-pdf').click();await page.locator('#pdf-file-input').setInputFiles([fixture('a.pdf'),fixture('broken.pdf')]);await page.locator('#btn-merge-action').click();await page.waitForFunction(()=>!document.querySelector('#btn-merge-action').disabled);assert.match(await page.locator('[role=status]').innerText(),/valid files/);results.push('invalid PDF fails with recoverable feedback');
  await page.goto(origin+'/image-to-pdf');
  const images=await page.evaluate(()=>['image/png','image/jpeg','image/webp'].map(type=>{const c=document.createElement('canvas');c.width=32;c.height=24;const x=c.getContext('2d');x.fillStyle='red';x.fillRect(0,0,32,24);return {type,data:c.toDataURL(type).split(',')[1]};}));
  await page.locator('#img2pdf-input').setInputFiles(images.map((v,i)=>({name:'sample'+i,mimeType:v.type,buffer:Buffer.from(v.data,'base64')})));
  const imagePDF=await download('#btn-make-pdf','images.pdf');assert.equal(imagePDF.getPageCount(),3);assert(imagePDF.getPages().every(p=>p.getWidth()===32&&p.getHeight()===24));results.push('PNG JPEG WebP converted to three readable PDF pages');
  await page.goto(origin+'/pdf-redactor');assert(await page.locator('#btn-burn-redact').isDisabled());assert.match(await page.locator('[role=status]').innerText(),/unavailable/);results.push('redaction no longer reports fake success');
  assert.deepEqual(errors.filter(e=>e!=='tailwind is not defined'),[]);fs.writeFileSync(out+'/result.json',JSON.stringify({status:'passed',browser:browser.version(),viewport:'390x844',externalRequests:'blocked',results,errors},null,2));console.log(JSON.stringify({passed:results.length,errors}));
 } finally {await browser.close();server.close();fs.rmSync(out,{recursive:true,force:true});}
})().catch(e=>{console.error(e);process.exitCode=1;});
