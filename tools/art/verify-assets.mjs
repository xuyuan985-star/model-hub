import fs from 'node:fs';
import zlib from 'node:zlib';
import path from 'node:path';
import { OUTLINE_RGB, OUTLINE_HEX, DARK_BASES, contrastRatio } from './tokens.mjs';

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
  if(bd!==8) throw new Error('unsupported bitDepth '+bd+' in '+file);
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const ch = ct===6?4: ct===2?3: ct===4?2: ct===0?1: 1;
  const stride = w*ch;
  const out = Buffer.alloc(w*h*4);
  let prev = Buffer.alloc(stride);
  let off = 0;
  for(let y=0;y<h;y++){
    const ft = raw[off++];
    const line = Buffer.from(raw.subarray(off, off+stride)); off += stride;
    for(let x=0;x<stride;x++){
      const a = x>=ch ? line[x-ch] : 0;
      const b = prev[x];
      const c = x>=ch ? prev[x-ch] : 0;
      let v = line[x];
      if(ft===1) v = (v+a)&255;
      else if(ft===2) v = (v+b)&255;
      else if(ft===3) v = (v + ((a+b)>>1))&255;
      else if(ft===4){ const pp=a+b-c; const pa=Math.abs(pp-a), pb=Math.abs(pp-b), pc=Math.abs(pp-c); v=(v + (pa<=pb&&pa<=pc?a:pb<=pc?b:c))&255; }
      line[x]=v;
    }
    for(let x=0;x<w;x++){
      const o=(y*w+x)*4;
      if(ct===6){ out[o]=line[x*4]; out[o+1]=line[x*4+1]; out[o+2]=line[x*4+2]; out[o+3]=line[x*4+3]; }
      else if(ct===2){ out[o]=line[x*3]; out[o+1]=line[x*3+1]; out[o+2]=line[x*3+2]; out[o+3]=255; }
      else if(ct===3){ const i=line[x]; const alpha = trns && i<trns.length ? trns[i] : 255; out[o]=plte[i*3]; out[o+1]=plte[i*3+1]; out[o+2]=plte[i*3+2]; out[o+3]=alpha; }
      else if(ct===0){ out[o]=out[o+1]=out[o+2]=line[x]; out[o+3]=255; }
      else if(ct===4){ out[o]=out[o+1]=out[o+2]=line[x*2]; out[o+3]=line[x*2+1]; }
    }
    prev = line;
  }
  return { w, h, data: out };
}

const root = 'web/game/assets';
const px = (n)=>path.join(root,'pixel',n);
const pt = (n)=>path.join(root,'portrait',n);

// ---- 1. 像素角色剪影可辨性：归一化 bbox 后两两 IoU ----
const castNames = ['npc_xi','npc_jin','npc_juan','npc_mu','npc_kai'];
function silhouette(file){
  const img = decodePNG(file);
  let minX=1e9,minY=1e9,maxX=-1,maxY=-1;
  for(let y=0;y<img.h;y++) for(let x=0;x<img.w;x++){
    if(img.data[(y*img.w+x)*4+3]>40){ if(x<minX)minX=x; if(x>maxX)maxX=x; if(y<minY)minY=y; if(y>maxY)maxY=y; }
  }
  return { img, box:{minX,minY,maxX,maxY} };
}
function normMask(img, box, N=24){
  const m = new Uint8Array(N*N);
  const bw = box.maxX-box.minX+1, bh = box.maxY-box.minY+1;
  for(let gy=0;gy<N;gy++) for(let gx=0;gx<N;gx++){
    const x0 = box.minX + Math.floor(gx*bw/N), x1 = box.minX + Math.floor((gx+1)*bw/N);
    const y0 = box.minY + Math.floor(gy*bh/N), y1 = box.minY + Math.floor((gy+1)*bh/N);
    let on=0, tot=0;
    for(let y=y0;y<y1;y++) for(let x=x0;x<x1;x++){ tot++; if(img.data[(y*img.w+x)*4+3]>40) on++; }
    m[gy*N+gx] = tot && on/tot>0.5 ? 1:0;
  }
  return m;
}
function iou(a,b){ let i=0,u=0; for(let k=0;k<a.length;k++){ if(a[k]&&b[k])i++; if(a[k]||b[k])u++; } return u? i/u : 0; }

const masks = {};
const sizeInfo = [];
for(const n of castNames){
  const s = silhouette(px(n+'.png'));
  masks[n] = normMask(s.img, s.box);
  sizeInfo.push({ name:n, w:s.img.w, h:s.img.h, bbox:[s.box.minX,s.box.minY,s.box.maxX,s.box.maxY], bw:s.box.maxX-s.box.minX+1, bh:s.box.maxY-s.box.minY+1 });
}
const pairs = [];
for(let i=0;i<castNames.length;i++) for(let j=i+1;j<castNames.length;j++){
  pairs.push({ a:castNames[i], b:castNames[j], iou:+iou(masks[castNames[i]],masks[castNames[j]]).toFixed(3) });
}
pairs.sort((x,y)=>y.iou-x.iou);

// ---- 2. 行走帧手臂摆动：帧0 vs 帧2 的手臂区域差异 ----
const walkDiff = [];
for(const n of castNames){
  const img = decodePNG(px(n+'.png'));
  const fw = 16, fh = 24; // 按 ART-SPEC
  if(img.w % fw || img.h % fh){ walkDiff.push({ name:n, note:'帧尺寸不是16x24的整数倍: '+img.w+'x'+img.h }); continue; }
  const cols = img.w/fw, rows = img.h/fh;
  const armDiff = (r, a, b)=>{
    let diff=0, on=0;
    for(let y=6;y<16;y++) for(let x=0;x<fw;x++){
      for(const [c1,c2] of [[a,b]]){
        const o1=((r*fh+y)*img.w + c1*fw+x)*4, o2=((r*fh+y)*img.w + c2*fw+x)*4;
        const s1=img.data[o1+3]>40, s2=img.data[o2+3]>40;
        if(s1||s2) on++;
        if(s1!==s2){diff++;}
        else if(s1&&(img.data[o1]!==img.data[o2]||img.data[o1+1]!==img.data[o2+1]||img.data[o1+2]!==img.data[o2+2])) diff++;
      }
    }
    return { diff, on };
  };
  const res = armDiff(1,0,2); // 第二行(索引1)=walk，帧0 vs 帧2
  walkDiff.push({ name:n, grid:cols+'x'+rows, walkFramesDiff:res.diff, armAreaPixels:res.on, ratio:+(res.diff/Math.max(1,res.on)).toFixed(3) });
}

// ---- 3. 描边/背景分离度：用实际写入图集的描边色（tokens.mjs），不用旧墨色 ----
const contrastInfo = {
  outline: OUTLINE_HEX,
  pairs: DARK_BASES.map((b) => ({ base: b.name, ratio: contrastRatio(OUTLINE_RGB, b.rgb) })),
  passThreshold: 1.6,
  passed: DARK_BASES.every((b) => contrastRatio(OUTLINE_RGB, b.rgb) >= 1.6)
};

// ---- 4. 立绘头部锚点：默认 vs 差分 的不透明 bbox 顶部 ----
const portraitPairs = [['pt_xi','pt_xi_half'],['pt_xi','pt_xi_frown'],['pt_jin','pt_jin_half'],['pt_juan','pt_juan_half'],['pt_kai','pt_kai_half'],['pt_mu','pt_mu_half'],['pt_observer','pt_observer_half']];
const anchorInfo = [];
for(const [a,b] of portraitPairs){
  if(!fs.existsSync(pt(a+'.png')) || !fs.existsSync(pt(b+'.png'))){ anchorInfo.push({ pair:a+' / '+b, note:'立绘未产出（队长管线接管），跳过' }); continue; }
  const A = decodePNG(pt(a+'.png')), B = decodePNG(pt(b+'.png'));
  const topOf = (img)=>{ for(let y=0;y<img.h;y++) for(let x=0;x<img.w;x++) if(img.data[(y*img.w+x)*4+3]>8) return y; return -1; };
  const fullOf = (img)=>{ let minX=1e9,maxX=-1,minY=1e9,maxY=-1; for(let y=0;y<img.h;y++) for(let x=0;x<img.w;x++) if(img.data[(y*img.w+x)*4+3]>8){ if(x<minX)minX=x; if(x>maxX)maxX=x; if(y<minY)minY=y; if(y>maxY)maxY=y; } return [minX,minY,maxX,maxY]; };
  anchorInfo.push({ pair:a+' / '+b, size:[A.w,A.h], topDefault:topOf(A), topDiff:topOf(B), bboxDefault:fullOf(A), bboxDiff:fullOf(B) });
}

console.log(JSON.stringify({ sizeInfo, topSimilarPairs: pairs.slice(0,5), allPairs: pairs, walkDiff, contrastInfo, anchorInfo }, null, 1));