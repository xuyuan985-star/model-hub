import fs from 'node:fs';
import zlib from 'node:zlib';
import path from 'node:path';

function decodePNG(file){
  const buf = fs.readFileSync(file);
  let p = 8, w=0,h=0,bd=0,ct=0,idat=[], plte=null, trns=null;
  while(p < buf.length){
    const len = buf.readUInt32BE(p); const type = buf.toString('ascii', p+4, p+8);
    const data = buf.subarray(p+8, p+8+len);
    if(type==='IHDR'){ w=data.readUInt32BE(0); h=data.readUInt32BE(4); bd=data[8]; ct=data[9]; }
    else if(type==='PLTE'){ plte=data; }
    else if(type==='tRNS'){ trns=data; }
    else if(type==='IDAT'){ idat.push(data); }
    else if(type==='IEND') break;
    p += 12+len;
  }
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const ch = ct===6?4: ct===2?3: ct===4?2: 1;
  const stride = w*ch;
  const out = Buffer.alloc(w*h*4);
  let prev = Buffer.alloc(stride), off = 0;
  for(let y=0;y<h;y++){
    const ft = raw[off++];
    const line = Buffer.from(raw.subarray(off, off+stride)); off += stride;
    for(let x=0;x<stride;x++){
      const a = x>=ch ? line[x-ch] : 0, b = prev[x], c = x>=ch ? prev[x-ch] : 0;
      let v = line[x];
      if(ft===1) v=(v+a)&255; else if(ft===2) v=(v+b)&255; else if(ft===3) v=(v+((a+b)>>1))&255;
      else if(ft===4){ const pp=a+b-c, pa=Math.abs(pp-a), pb=Math.abs(pp-b), pc=Math.abs(pp-c); v=(v+(pa<=pb&&pa<=pc?a:pb<=pc?b:c))&255; }
      line[x]=v;
    }
    for(let x=0;x<w;x++){
      const o=(y*w+x)*4;
      if(ct===6){ out[o]=line[x*4]; out[o+1]=line[x*4+1]; out[o+2]=line[x*4+2]; out[o+3]=line[x*4+3]; }
      else if(ct===2){ out[o]=line[x*3]; out[o+1]=line[x*3+1]; out[o+2]=line[x*3+2]; out[o+3]=255; }
      else if(ct===3){ const i=line[x]; out[o]=plte[i*3]; out[o+1]=plte[i*3+1]; out[o+2]=plte[i*3+2]; out[o+3]=(trns&&i<trns.length)?trns[i]:255; }
      else if(ct===0){ out[o]=out[o+1]=out[o+2]=line[x]; out[o+3]=255; }
      else if(ct===4){ out[o]=out[o+1]=out[o+2]=line[x*2]; out[o+3]=line[x*2+1]; }
    }
    prev = line;
  }
  return { w,h,data:out };
}

const FW=16, FH=24;
const root='web/game/assets/pixel/';
const names=['npc_xi','npc_jin','npc_juan','npc_mu','npc_kai'];

function cell(img,row,col){
  const x0=col*FW, y0=row*FH;
  const m=new Uint8Array(FW*FH), col3=new Array(FW*FH);
  for(let y=0;y<FH;y++) for(let x=0;x<FW;x++){
    const o=((y0+y)*img.w + (x0+x))*4;
    const a=img.data[o+3];
    m[y*FW+x] = a>40?1:0;
    col3[y*FW+x] = (img.data[o]<<16)|(img.data[o+1]<<8)|img.data[o+2];
  }
  return { m, col3 };
}

// 单帧剪影 IoU（row0 col0 = 朝下站姿）
const frames = {};
for(const n of names){ const img=decodePNG(root+n+'.png'); frames[n]=cell(img,0,0); }

// 单帧内部：手臂区域(躯干列 x<=4 或 x>=11, y 7..15) 着色像素数
const armStats=[];
for(const n of names){
  const img=decodePNG(root+n+'.png');
  let armCols=0, legRows=new Set();
  const f0=cell(img,1,0), f2=cell(img,1,2); // walk 第0帧 vs 第2帧
  const diffRows={}; let armDiff=0, legDiff=0;
  for(let y=0;y<FH;y++) for(let x=0;x<FW;x++){
    const k=y*FW+x;
    if(f0.m[k]!==f2.m[k] || (f0.m[k]&&f0.col3[k]!==f2.col3[k])){
      diffRows[y]=(diffRows[y]||0)+1;
      const isTorsoBand = y>=6 && y<16 && x>=3 && x<=12;
      const isArm = y>=7 && y<16 && (x<=4 || x>=11);
      if(isArm) armDiff++; else legDiff++;
    }
  }
  armStats.push({ name:n, walkFrame0_vs_2_totalDiff:armDiff+legDiff, armBandDiff:armDiff, otherDiff:legDiff, diffRowHistogram:diffRows });
}

const iouPairs=[];
for(let i=0;i<names.length;i++) for(let j=i+1;j<names.length;j++){
  const A=frames[names[i]].m, B=frames[names[j]].m;
  let inter=0,uni=0;
  for(let k=0;k<A.length;k++){ if(A[k]&&B[k])inter++; if(A[k]||B[k])uni++; }
  iouPairs.push({a:names[i],b:names[j],iou:+(inter/uni).toFixed(3)});
}
iouPairs.sort((x,y)=>y.iou-x.iou);

// 单一调色板检查：所有像素角色图共用的颜色集合
const paletteUnion=new Set(), perFile={};
for(const n of names){
  const img=decodePNG(root+n+'.png');
  const s=new Set();
  for(let i=0;i<img.w*img.h;i++){ const a=img.data[i*4+3]; if(a>40) s.add(((img.data[i*4]<<16)|(img.data[i*4+1]<<8)|img.data[i*4+2]).toString(16).padStart(6,'0')); }
  perFile[n]=s.size;
  s.forEach(c=>paletteUnion.add(c));
}

console.log(JSON.stringify({ singleshot_IoU_top: iouPairs.slice(0,4), allIou: iouPairs, armStats, paletteSizes: perFile, paletteUnionSize: paletteUnion.size }, null, 1));
