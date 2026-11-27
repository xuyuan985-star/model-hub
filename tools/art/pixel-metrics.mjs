import fs from 'node:fs';
import zlib from 'node:zlib';
import path from 'node:path';

function decodePNG(file){
  const buf = fs.readFileSync(file);
  let p=8,w=0,h=0,bd=0,ct=0,idat=[],plte=null,trns=null;
  while(p<buf.length){
    const len=buf.readUInt32BE(p); const type=buf.toString('ascii',p+4,p+8);
    const data=buf.subarray(p+8,p+8+len);
    if(type==='IHDR'){w=data.readUInt32BE(0);h=data.readUInt32BE(4);bd=data[8];ct=data[9];}
    else if(type==='PLTE'){plte=data;}
    else if(type==='tRNS'){trns=data;}
    else if(type==='IDAT'){idat.push(data);}
    else if(type==='IEND')break;
    p+=12+len;
  }
  const raw=zlib.inflateSync(Buffer.concat(idat));
  const ch=ct===6?4:ct===2?3:ct===3?1:ct===0?1:ct===4?2:1;
  const stride=w*ch; const out=Buffer.alloc(w*h*4); let prev=Buffer.alloc(stride); let off=0;
  for(let y=0;y<h;y++){
    const ft=raw[off++]; const line=Buffer.from(raw.subarray(off,off+stride)); off+=stride;
    for(let x=0;x<stride;x++){
      const a=x>=ch?line[x-ch]:0,b=prev[x],c=x>=ch?prev[x-ch]:0; let v=line[x];
      if(ft===1)v=(v+a)&255; else if(ft===2)v=(v+b)&255; else if(ft===3)v=(v+((a+b)>>1))&255;
      else if(ft===4){const pp=a+b-c,pa=Math.abs(pp-a),pb=Math.abs(pp-b),pc=Math.abs(pp-c);v=(v+(pa<=pb&&pa<=pc?a:pb<=pc?b:c))&255;}
      line[x]=v;
    }
    for(let x=0;x<w;x++){
      const o=(y*w+x)*4;
      if(ct===6){out[o]=line[x*4];out[o+1]=line[x*4+1];out[o+2]=line[x*4+2];out[o+3]=line[x*4+3];}
      else if(ct===2){out[o]=line[x*3];out[o+1]=line[x*3+1];out[o+2]=line[x*3+2];out[o+3]=255;}
      else if(ct===3){const i=line[x];out[o]=plte[i*3];out[o+1]=plte[i*3+1];out[o+2]=plte[i*3+2];out[o+3]=(trns&&i<trns.length)?trns[i]:255;}
      else if(ct===0){out[o]=out[o+1]=out[o+2]=line[x];out[o+3]=255;}
      else if(ct===4){out[o]=out[o+1]=out[o+2]=line[x*2];out[o+3]=line[x*2+1];}
    }
    prev=line;
  }
  return {w,h,data:out};
}

const key=(d,o)=> (d[o]<<16)|(d[o+1]<<8)|d[o+2];
// 单帧：同色相邻占比（4 邻域，只统计不透明像素对）+ 调色板 + 平均同色游程
/** 2×2 真块覆盖率：不透明像素里，能组成 2×2 同色块的占比（"单块 ≥2px"的量化口径）。 */
function block2(img, x0,y0,w,h, skipHex){
  const k=(x,y)=>{ const o=(y*img.w+x)*4; return (img.data[o]<<16)|(img.data[o+1]<<8)|img.data[o+2]; };
  const on=(x,y)=> img.data[((y*img.w+x)*4)+3]>40;
  let tot=0, ok=0;
  for(let y=y0;y<y0+h;y++) for(let x=x0;x<x0+w;x++){
    if(!on(x,y)) continue;
    if(skipHex && k(x,y)===skipHex) continue;   // 排除 1px 外描边：ART-SPEC §0 强制 1px，它天然不构成 2×2
    tot++;
    // 以该像素为左上/右上/左下/右下任一角的 2×2 同色块存在即算"真块"
    let hit=false;
    for(const [dx,dy] of [[0,0],[-1,0],[0,-1],[-1,-1]]){
      const X=x+dx, Y=y+dy;
      if(X<x0||Y<y0||X+1>=x0+w||Y+1>=y0+h) continue;
      if(!on(X,Y)||!on(X+1,Y)||!on(X,Y+1)||!on(X+1,Y+1)) continue;
      const c=k(X,Y);
      if(k(X+1,Y)===c && k(X,Y+1)===c && k(X+1,Y+1)===c){ hit=true; break; }
    }
    if(hit) ok++;
  }
  return tot? +(100*ok/tot).toFixed(1) : 0;
}

function metrics(img, x0,y0,w,h){
  let pairs=0, same=0; const cols=new Set();
  const runsH=[], runsV=[];
  for(let y=y0;y<y0+h;y++){
    let run=1;
    for(let x=x0;x<x0+w;x++){
      const o=(y*img.w+x)*4;
      if(img.data[o+3]<=40){ run=1; continue; }
      cols.add(key(img.data,o));
      if(x+1<x0+w){
        const o2=o+4;
        if(img.data[o2+3]>40){ pairs++; if(key(img.data,o)===key(img.data,o2)) same++; }
      }
      if(y+1<y0+h){
        const o3=o+img.w*4;
        if(img.data[o3+3]>40){ pairs++; if(key(img.data,o)===key(img.data,o3)) same++; }
      }
      if(x>x0){ const op=o-4; if(img.data[op+3]>40 && key(img.data,op)===key(img.data,o)) run++; else { if(img.data[op+3]>40) {runsH.push(run); run=1;} } }
    }
  }
  const avgRun = runsH.length ? +(runsH.reduce((a,b)=>a+b,0)/runsH.length).toFixed(2) : 0;
  const OUTLINE = 0x4a5a70; // tokens.mjs OUTLINE_RGB #4A5A70
  return { sameNbrPct: pairs? +(100*same/pairs).toFixed(1):0, colors: cols.size, avgRun,
    block2Pct: block2(img,x0,y0,w,h), block2BodyPct: block2(img,x0,y0,w,h,OUTLINE) };
}

const root='web/game/assets/pixel';
const files=fs.readdirSync(root).filter(f=>f.endsWith('.png')).sort();
const rows=[];
for(const f of files){
  const img=decodePNG(path.join(root,f));
  if(f.startsWith('npc_')||f.startsWith('pc_')){
    // 人物图集：逐帧统计后取平均（16×24）
    const acc={same:0,colors:0,run:0,n:0,minSame:100,worst:null,blk:0,minBlk:100};
    for(let r=0;r<img.h/24;r++) for(let c=0;c<img.w/16;c++){
      const m=metrics(img,c*16,r*24,16,24);
      acc.same+=m.sameNbrPct; acc.colors=Math.max(acc.colors,m.colors); acc.run+=m.avgRun; acc.n++;
      acc.blk+=m.block2Pct; if(m.block2Pct<acc.minBlk) acc.minBlk=m.block2Pct;
      acc.blkB=(acc.blkB||0)+m.block2BodyPct; acc.minBlkB=Math.min(acc.minBlkB===undefined?100:acc.minBlkB, m.block2BodyPct);
      if(m.sameNbrPct<acc.minSame){acc.minSame=m.sameNbrPct; acc.worst='r'+r+'c'+c;}
    }
    rows.push({file:f, kind:'cast', sameNbrPct:+(acc.same/acc.n).toFixed(1), worstFrame:acc.worst, worstSame:acc.minSame, colors:acc.colors, avgRun:+(acc.run/acc.n).toFixed(2), block2Pct:+(acc.blk/acc.n).toFixed(1), worstBlock2:acc.minBlk, block2BodyPct:+(acc.blkB/acc.n).toFixed(1), worstBlock2Body:acc.minBlkB});
  } else {
    const m=metrics(img,0,0,img.w,img.h);
    rows.push({file:f, kind:'single', w:img.w, h:img.h, ...m});
  }
}
console.log(JSON.stringify(rows,null,1));