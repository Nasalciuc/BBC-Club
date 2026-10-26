import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
const root=path.resolve(import.meta.dirname,'..');
const repo=path.resolve(root,'../../..');
const dependency=path.join(repo,'node_modules/lucide-react-native');
const version=JSON.parse(fs.readFileSync(path.join(dependency,'package.json'),'utf8')).version;
const names=['search','map-pin','plane','calendar','user','users','armchair','globe','compass','clipboard-list','chevron-right','chevron-down','arrow-left','arrow-right','x','share','heart','bookmark','phone','bell','lock','trash','user-pen','check','info','sun-cloud','bar-chart','file-text','message'];
const aliases={'sun-cloud':'cloud-sun','bar-chart':'chart-column-increasing',message:'message-square'};
const target=path.join(root,'assets/locked/icons-svg');
fs.mkdirSync(target,{recursive:true});
const esc=s=>String(s).replaceAll('&','&amp;').replaceAll('"','&quot;').replaceAll('<','&lt;');
const manifest=[];
for(const name of names){
 const source=aliases[name]||name;
 const code=fs.readFileSync(path.join(dependency,'dist/esm/icons',source+'.mjs'),'utf8');
 const literal=code.match(/const iconData = ([\s\S]*?);\s*const /)?.[1];
 if(!literal) throw Error('Unrecognized pinned icon format: '+source);
 const data=Function('"use strict";return ('+literal+')')();
 const children=data.node.map(([tag,attrs])=>'<'+tag+' '+Object.entries(attrs).filter(([k])=>k!=='key').map(([k,v])=>k+'="'+esc(v)+'"').join(' ')+' />').join('\n  ');
 const svg='<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#1E293B" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">\n  '+children+'\n</svg>\n';
 const file='assets/locked/icons-svg/'+name+'.svg';
 fs.writeFileSync(path.join(root,file),svg);
 manifest.push({id:name,file,library:'lucide-react-native',version,sourceIcon:source,viewBox:[0,0,24,24],stroke:'#1E293B',strokeWidth:2,usage:'pinned-native-vector-implementation',reference:'assets/locked/icons-reference/icon-'+name+'.png',pixelIdenticalToRaster:false,sha256:crypto.createHash('sha256').update(svg).digest('hex')});
}
fs.copyFileSync(path.join(dependency,'LICENSE'),path.join(target,'LICENSE.txt'));
fs.writeFileSync(path.join(target,'catalog.json'),JSON.stringify({library:'lucide-react-native',version,notes:'Existing library geometry exported without regeneration. Raster examples remain the visual baseline. Family and cabin-business have screenshot-only canonical assets; never substitute armchair/users for them. Do not use these line SVGs for filled active tab icons.',icons:manifest},null,2));
const entries=JSON.parse(fs.readFileSync(path.join(root,'assets/locked/catalog.json'),'utf8'));
const cards=entries.map(e=>'<figure><div class="preview"><img loading="lazy" src="'+e.file+'" alt="'+e.id+'"></div><figcaption><strong>'+e.id+'</strong><br>'+e.usage+' · '+e.widthPx+'×'+e.heightPx+'<br><small>'+e.source+' @ '+e.sourceRectPx.join(', ')+'</small></figcaption></figure>').join('\n');
const vectors=manifest.map(e=>'<figure><div class="preview"><img width="48" height="48" src="'+e.file+'" alt="'+e.id+'"></div><figcaption>'+e.id+' · Lucide '+version+'<br><small>Native vector; not a raster trace</small></figcaption></figure>').join('\n');
fs.writeFileSync(path.join(root,'VISUAL-CATALOG.html'),'<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>BBC Club 3.0 — locked visual catalog</title><style>body{margin:32px;background:#FAFAF8;color:#1E293B;font:16px system-ui}h1{font-size:32px}p{max-width:900px;color:#64748B}.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:20px}figure{margin:0;padding:16px;background:white;border:1px solid #E2E8F0;border-radius:16px;overflow:hidden}.preview{height:180px;display:flex;align-items:center;justify-content:center;background:#F1F5F9;border-radius:8px}.preview img{max-width:100%;max-height:100%;object-fit:contain}figcaption{margin-top:12px;overflow-wrap:anywhere;line-height:1.5}small{color:#64748B}</style><h1>BBC Club 3.0 — locked visual catalog</h1><p>117 unscaled source-pixel extracts. “reference” means inspect and implement natively; do not embed a control screenshot. “image” means the recorded static crop may be used as artwork. “static-image” includes baked labels and cannot replace interactive map controls. Raster sources are authoritative; vector implementations below are pinned separately.</p><div class="grid">'+cards+'</div><h2>Pinned vector implementations</h2><p>29 exported Lucide line SVGs. These are existing library geometry, not exact traces of generated screenshot glyphs. Family and reclining business-seat visuals stay as source PNGs. Active tab icons use their original filled raster references.</p><div class="grid">'+vectors+'</div></html>');
console.log(JSON.stringify({rasterFragments:entries.length,vectorIcons:manifest.length,libraryVersion:version,gallery:'VISUAL-CATALOG.html'}));

