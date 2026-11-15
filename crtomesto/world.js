/* Črtomesto — a little, entirely local, three-dimensional pencil world. */
(() => {
'use strict';
const $ = id => document.getElementById(id);
const canvas = $('scene');
let renderer;
try {
  renderer = new THREE.WebGLRenderer({canvas, antialias:true, alpha:false, powerPreference:'high-performance'});
} catch (e) { $('webglFallback').hidden = false; return; }
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.setClearColor(0xf3f0e7,1);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
const scene = new THREE.Scene();
scene.background = new THREE.Color(0xf3f0e7);
scene.fog = new THREE.Fog(0xf3f0e7,40,72);
// Real sunlight: a warm key light with soft shadows + cool sky/ground bounce.
const sun = new THREE.DirectionalLight(0xfff3dd, 2.1);
sun.position.set(60,90,35);
sun.castShadow = true;
sun.shadow.mapSize.set(2048,2048);
sun.shadow.camera.near = 5; sun.shadow.camera.far = 260;
sun.shadow.camera.left=-70; sun.shadow.camera.right=70;
sun.shadow.camera.top=70; sun.shadow.camera.bottom=-70;
sun.shadow.bias = -0.0004;
scene.add(sun); scene.add(sun.target);
const sky = new THREE.HemisphereLight(0xf6f1e4, 0xcfc8b6, 1.15);
scene.add(sky);
const fillLight = new THREE.DirectionalLight(0xdfe6ea, .5);
fillLight.position.set(-50,40,-60); scene.add(fillLight);
// A shadow-catcher ground so people/cars sit in the light with contact shadows.
const shadowGround = new THREE.Mesh(
  new THREE.PlaneGeometry(1200,1200),
  new THREE.ShadowMaterial({opacity:.16})
);
shadowGround.rotation.x=-Math.PI/2; shadowGround.position.y=.02;
shadowGround.receiveShadow=true; scene.add(shadowGround);
const camera = new THREE.PerspectiveCamera(38,1,.14,550);
const root = new THREE.Group(); scene.add(root);
let seed = 125307;
function rand(a=0,b=1) { seed = (seed * 1664525 + 1013904223) >>> 0; return a+(seed/4294967296)*(b-a); }
const pick = a => a[Math.floor(rand(0,a.length))];
const clamp = (v,a,b) => Math.max(a,Math.min(b,v));
const mix = (a,b,t) => a+(b-a)*t;
const TAU = Math.PI*2;
const lineMaterials = [
  new THREE.LineBasicMaterial({color:0x41423d,transparent:true,opacity:.98,depthWrite:false}),
  new THREE.LineBasicMaterial({color:0x717269,transparent:true,opacity:.74,depthWrite:false}),
  new THREE.LineBasicMaterial({color:0x929184,transparent:true,opacity:.53,depthWrite:false}),
  new THREE.LineBasicMaterial({color:0xb86448,transparent:true,opacity:.94,depthWrite:false})
];
// A dry, slightly broken graphite edge, fixed to the paper rather than flickering.
lineMaterials.slice(0,3).forEach(material=>{
  material.onBeforeCompile=shader=>{
    shader.fragmentShader=shader.fragmentShader.replace('#include <color_fragment>',`#include <color_fragment>
      float tooth = fract(sin(dot(floor(gl_FragCoord.xy * 1.2), vec2(12.9898,78.233))) * 43758.5453);
      diffuseColor.a *= 0.72 + tooth * 0.28;
    `);
  };
});
const fillColors = [0xf3f0e7,0xeae6dc,0xe8e3d8,0xe2dfd4,0xf7f3e9,0xb96a50];
const fillMaterials = fillColors.map(c => new THREE.MeshLambertMaterial({color:c,side:THREE.DoubleSide,polygonOffset:true,polygonOffsetFactor:1,polygonOffsetUnits:1}));
let totalStrokes = 0;
const drafts = [], obstacles = [], mapBuildings = [], boats = [], birds = [];
class Draft {
  constructor(delay=0, parent=root) {
    this.group = new THREE.Group(); parent.add(this.group);
    this.arrays = [[],[],[],[]]; this.faces = fillColors.map(()=>[]); this.delay=delay; this.lines=[]; this.meshes=[];
    drafts.push(this);
  }
  line(a,b,k=1) { this.arrays[k].push(...a,...b); totalStrokes++; }
  stroke(a,b,k=0,w=.036) {
    const dist=Math.hypot(b[0]-a[0],b[1]-a[1],b[2]-a[2]);
    const n=Math.max(1,Math.min(6,Math.ceil(dist/3)));
    let prev=a;
    for(let j=1;j<=n;j++) {
      const t=j/n; const p=j===n?b:[mix(a[0],b[0],t)+rand(-w,w),mix(a[1],b[1],t)+rand(-w,w),mix(a[2],b[2],t)+rand(-w,w)];
      this.line(prev,p,k); prev=p;
    }
    if(k===0 && dist>2.5 && rand()<.32) this.line([a[0]+.053,a[1]+.034,a[2]+.029],[b[0]+.041,b[1]+.027,b[2]+.035],2);
  }
  path(p,k=0,closed=false) { for(let i=1;i<p.length;i++)this.stroke(p[i-1],p[i],k); if(closed)this.stroke(p[p.length-1],p[0],k); }
  face(p,k=0) { for(let i=1;i<p.length-1;i++) this.faces[k].push(...p[0],...p[i],...p[i+1]); }
  box(x,y,z,w,h,d,outline=true,tone=0) {
    const a=[x-w/2,y,z-d/2],b=[x+w/2,y,z-d/2],c=[x+w/2,y,z+d/2],e=[x-w/2,y,z+d/2];
    const A=[a[0],y+h,a[2]],B=[b[0],y+h,b[2]],C=[c[0],y+h,c[2]],E=[e[0],y+h,e[2]];
    this.face([a,b,B,A],tone); this.face([b,c,C,B],tone===0?1:tone);this.face([c,e,E,C],tone);this.face([e,a,A,E],tone===0?4:tone);this.face([A,B,C,E],tone===0?4:tone);
    if(outline) {this.path([A,B,C,E],0,true);this.path([a,b,c,e],1,true);[[a,A],[b,B],[c,C],[e,E]].forEach(p=>this.stroke(...p,0));}
  }
  circle(x,y,z,r,k=0,plane='xz',n=40) {
    let p=[]; for(let i=0;i<=n;i++){let a=i/n*TAU;p.push(plane==='xy'?[x+Math.cos(a)*r,y+Math.sin(a)*r,z]:plane==='yz'?[x,y+Math.sin(a)*r,z+Math.cos(a)*r]:[x+Math.cos(a)*r,y,z+Math.sin(a)*r]);} this.path(p,k);
  }
  cylinder(x,y,z,r1,r2,h,n=18,vertical=true,tone=0) {
    const low=[],high=[];
    for(let i=0;i<n;i++){let a=i/n*TAU;low.push([x+Math.cos(a)*r1,y,z+Math.sin(a)*r1]);high.push([x+Math.cos(a)*r2,y+h,z+Math.sin(a)*r2]);}
    this.face(high,tone===0?4:tone);
    for(let i=0;i<n;i++){let j=(i+1)%n;this.face([low[i],low[j],high[j],high[i]],tone);if(vertical && i%2===0)this.stroke(low[i],high[i],1);}
    this.path(low,0,true);this.path(high,0,true);
  }
  finish() {
    this.arrays.forEach((a,i)=>{if(!a.length)return;let g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(a,3));let l=new THREE.LineSegments(g,lineMaterials[i]);l.renderOrder=2;this.group.add(l);this.lines.push(l);});
    this.faces.forEach((a,i)=>{if(!a.length)return;let g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(a,3));g.computeVertexNormals();let m=new THREE.Mesh(g,fillMaterials[i]);m.receiveShadow=true;this.group.add(m);this.meshes.push(m);});
    this.arrays=null; this.faces=null; return this;
  }
}
function rect(D,map,u,v,w,h,k=1,o=.04){D.path([map(u,v,o),map(u+w,v,o),map(u+w,v+h,o),map(u,v+h,o)],k,true);}
function hatchRect(D,map,x,y,w,h,step=.58,k=2){
  for(let t=y-x-w;t<y+h-x;t+=step*rand(.75,1.2)){
    let x1=Math.max(x,y-t),x2=Math.min(x+w,y+h-t);
    if(x2>x1){const cut=rand()<.23?rand(.05,.25)*(x2-x1):0;D.stroke(map(x1+cut,x1+cut+t,.018),map(x2,x2+t+rand(-.04,.04),.018),k,.025);}
  }
}
function windowSketch(D,map,u,v,w,h,style=0) {
  D.face([map(u,v,.054),map(u+w,v,.054),map(u+w,v+h,.054),map(u,v+h,.054)],3);
  rect(D,map,u-.10,v-.10,w+.2,h+.2,1,.06);
  rect(D,map,u+.10,v+.11,w-.2,h-.22,1,.073);
  D.line(map(u+w/2,v+.1,.08),map(u+w/2,v+h-.1,.08),1);
  D.line(map(u+.1,v+h*.54,.08),map(u+w-.1,v+h*.54,.08),1);
  D.stroke(map(u-.2,v-.15,.13),map(u+w+.2,v-.15,.13),0);
  D.line(map(u-.2,v-.27,.05),map(u+w+.2,v-.27,.05),1);
  D.line(map(u-.1,v+h+.11,.065),map(u+w+.1,v+h+.11,.065),1);
  for(let t=.04;t<w;t+=.19)D.line(map(u+t,v-.29,.025),map(u+t+.17,v-.48-rand(0,.13),.025),2);
  if(style===1){
    [-.46,w+.08].forEach(s=>{rect(D,map,u+s,v,.38,h,1,.07);for(let yy=.17;yy<h;yy+=.22)D.line(map(u+s+.04,v+yy,.08),map(u+s+.34,v+yy+.04,.08),2);});
  } else if(style===2) {
    for(let xx=.15;xx<w;xx+=.22)D.line(map(u+xx,v+.12,.086),map(u+xx,v+h-.1,.086),2);
  }
  if(rand()<.19){D.line(map(u+.15,v+h-.1,.09),map(u+w-.1,v+.18,.09),2);}
}
function archDoor(D,map,u,v,w,h){
  const r=w/2, cy=v+h-r; let pts=[map(u,v,.06),map(u+w,v,.06),map(u+w,cy,.06)];
  for(let i=0;i<=14;i++){let a=i/14*Math.PI;pts.push(map(u+r+Math.cos(a)*r,cy+Math.sin(a)*r,.06));}
  D.face(pts,3);D.path(pts,0,true);
  let arc=[];for(let i=0;i<=16;i++){let a=i/16*Math.PI;arc.push(map(u+r+Math.cos(a)*(r+.19),cy+Math.sin(a)*(r+.19),.07));}D.path(arc,1);
  D.line(map(u+r,v,.08),map(u+r,v+h-.15,.08),1);
  for(let xx=.22;xx<w;xx+=.23)D.line(map(u+xx,v+.05,.079),map(u+xx,cy,.079),2);
  D.line(map(u+.18,cy,.08),map(u+w-.18,cy,.08),1);
  D.circle(...map(u+w*.63,v+h*.4,.12),.055,0,'xy',8);
  D.stroke(map(u-.25,v-.07,.3),map(u+w+.25,v-.07,.3),0);
}
function balcony(D,map,u,v,w){
  D.face([map(u-.25,v-.26,.02),map(u+w+.25,v-.26,.02),map(u+w+.25,v-.26,.75),map(u-.25,v-.26,.75)],1);
  D.stroke(map(u-.25,v-.25,.75),map(u+w+.25,v-.25,.75),0);
  D.stroke(map(u-.25,v+.55,.75),map(u+w+.25,v+.55,.75),0);
  for(let q=-.25;q<w+.28;q+=.23)D.line(map(u+q,v-.25,.75),map(u+q,v+.55,.75),1);
  D.line(map(u-.25,v+.55,.75),map(u-.25,v+.55,0),1);D.line(map(u+w+.25,v+.55,.75),map(u+w+.25,v+.55,0),1);
}
function roof(D,x,y,z,w,d,rh,style=0){
  const a=[x-w/2-.38,y,z-d/2-.36],b=[x+w/2+.38,y,z-d/2-.36],c=[x+w/2+.38,y,z+d/2+.36],e=[x-w/2-.38,y,z+d/2+.36];
  const ra=[x-w/2-.38,y+rh,z],rb=[x+w/2+.38,y+rh,z];
  D.face([a,b,rb,ra],2);D.face([ra,rb,c,e],1);D.face([a,ra,e],0);D.face([b,c,rb],0);
  D.path([a,b,c,e],0,true);D.stroke(ra,rb,0);[[a,ra],[b,rb],[c,rb],[e,ra]].forEach(p=>D.stroke(...p,0));
  for(let xx=x-w/2-.3;xx<x+w/2+.4;xx+=.62){D.line([xx,y+.015,z+d/2+.36],[xx+rand(-.1,.1),y+rh+.02,z],2);D.line([xx,y+.015,z-d/2-.36],[xx+rand(-.1,.1),y+rh+.02,z],2);}
  for(let t=.13;t<1;t+=.14){
    let zz=(d/2+.36)*t, yy=y+rh*(1-t)+.025;
    D.stroke([x-w/2-.35,yy,z+zz],[x+w/2+.35,yy,z+zz],1,.027);
    D.stroke([x-w/2-.35,yy,z-zz],[x+w/2+.35,yy,z-zz],2,.027);
    for(let q=0;q<5;q++){let xx=rand(x-w/2,x+w/2);D.line([xx,yy+.02,z+zz],[xx+.38,yy+.25,z+zz-.22],2);}
  }
}
function building(D,x,z,w,d,floors,variant=0){
  const h=floors*3.25+.6, rh=rand(2.1,4.3);
  mapBuildings.push({x,z,w,d});obstacles.push({x,z,w:w+.55,d:d+.55});
  D.box(x,0,z,w,h,d,true,0);
  D.box(x,h-.42,z,w+.28,.28,d+.28,true,0);
  D.box(x,3.45,z,w+.16,.16,d+.16,true,0);
  if(variant===3){
    D.box(x,h,z,w+.45,.35,d+.45,true,0);
    for(let q=-w/2;q<=w/2;q+=.5){D.line([x+q,h+.35,z+d/2],[x+q,h+1.05,z+d/2],1);}D.stroke([x-w/2,h+1.05,z+d/2],[x+w/2,h+1.05,z+d/2],0);
    roof(D,x,h+.25,z,w*.72,d*.7,rh*.58);
  } else roof(D,x,h,z,w,d,rh);
  const facades=[
    {map:(u,v,e=0)=>[x+u,v,z+d/2+e],span:w,front:true},
    {map:(u,v,e=0)=>[x+w/2+e,v,z-u],span:d,front:false},
    {map:(u,v,e=0)=>[x-u,v,z-d/2-e],span:w,front:false},
    {map:(u,v,e=0)=>[x-w/2-e,v,z+u],span:d,front:false}
  ];
  facades.forEach((f,index)=>{
    const {map,span}=f, cols=Math.max(2,Math.floor(span/2.7)), gap=span/(cols+.35), ww=Math.min(1.32,gap*.48);
    if(index===1||index===2)hatchRect(D,map,-span/2+.1,3.7,span-.2,h-4,.78,2);
    for(let floor=1;floor<floors;floor++){
      let yy=4.13+(floor-1)*3.25;
      for(let c=0;c<cols;c++){
        let u=-span/2+span/(cols+1)*(c+1)-ww/2;
        windowSketch(D,map,u,yy,ww,1.72,index===0&&variant%2===0?1:index===3?2:0);
        if(floor===1 && c===1 && index===0 && variant%3===0)balcony(D,map,u-.25,yy,ww+.5);
      }
    }
    for(let yy=.65;yy<3.4;yy+=.64){D.line(map(-span/2,yy,.02),map(span/2,yy,.02),2);for(let u=-span/2+((Math.round(yy*10)%2)*.6);u<span/2;u+=1.4)D.line(map(u,yy,.021),map(u,yy+.64,.021),2);}
    if(index===0){
      const dw=1.4;archDoor(D,map,-dw/2,.05,dw,2.92);
      if(span>7.3){windowSketch(D,map,-span*.36-.6,.65,1.3,1.8,0);windowSketch(D,map,span*.36-.65,.65,1.3,1.8,0);}
      if(variant===2){
        const aw=span*.71;D.face([map(-aw/2,3.2,.07),map(aw/2,3.2,.07),map(aw/2,2.68,1.35),map(-aw/2,2.68,1.35)],4);D.path([map(-aw/2,3.2,.07),map(aw/2,3.2,.07),map(aw/2,2.68,1.35),map(-aw/2,2.68,1.35)],0,true);
        for(let q=-aw/2;q<aw/2;q+=.42)D.line(map(q,3.2,.09),map(q,2.67,1.37),2);
        D.stroke(map(-aw/2,2.68,1.35),map(-aw/2,2.4,1.35),1);D.stroke(map(aw/2,2.68,1.35),map(aw/2,2.4,1.35),1);
      }
    } else {for(let c=0;c<cols;c++){let u=-span/2+span/(cols+1)*(c+1)-.5;windowSketch(D,map,u,.8,1,1.65,0);}}
    // Sparse plaster marks, not a repeating texture.
    for(let q=0;q<7;q++){let u=rand(-span/2+.3,span/2-.3),v=rand(3.9,h-.7);D.line(map(u,v,.022),map(u+rand(.12,.42),v+rand(.1,.6),.022),2);}
  });
  const cx=x-w*.22,cz=z-d*.15, cy=h+rh*.65;
  D.box(cx,cy,cz,.8,2.2,.85,true,1);D.box(cx,cy+2.1,cz,1.08,.22,1.1,true,0);
  for(let yy=cy+.25;yy<cy+2;yy+=.34)D.line([cx-.4,yy,cz+.435],[cx+.4,yy,cz+.435],2);
  if(rand()<.4){D.box(x+w*.3,h+rh*.42,z+d*.22,.64,2.2,.7,true,0);}
  if(variant===1){ // A small aerial, drawn as a few fragile strokes.
    const a=[x+w*.24,h+rh,z];D.stroke(a,[a[0],a[1]+3.2,a[2]],1);for(let i=0;i<3;i++)D.line([a[0]-.9,a[1]+1.3+i*.5,a[2]],[a[0]+.9,a[1]+1.3+i*.5,a[2]],1);
  }
}

// The paper is also the ground: paving, quays, water and fine construction marks.
const ground = new Draft(-1000);
ground.face([[-220,-2.64,-200],[220,-2.64,-200],[220,-2.64,220],[-220,-2.64,220]],0);
ground.box(-5,-2.8,-30,128,2.8,72,false,0);
ground.stroke([-69,0,6],[59,0,6],0);ground.stroke([-69,-2.7,6],[59,-2.7,6],0);
for(let yy=-2.35;yy<0;yy+=.63){
  ground.stroke([-69,yy,6.02],[59,yy,6.02],1);
  for(let xx=-69+rand(0,1.8);xx<59;xx+=rand(1.2,2.8))ground.line([xx,yy,6.03],[xx,yy+.61,6.03],2);
}
for(let xx=-68;xx<59;xx+=2.1){
  ground.line([xx,.018,5.4],[xx,.018,.7],2);
  ground.line([xx,.02,3.1],[xx+2.05,.02,3.1],2);
  if(rand()<.5)ground.line([xx+.2,.022,4.9],[xx+1.5,.022,3.6],2);
}
ground.stroke([-68,.03,.6],[58,.03,.6],1);ground.stroke([-68,.04,5.4],[58,.04,5.4],0);
// Stone avenue and two small cross streets.
for(let zz=-64;zz<.6;zz+=1.03){
  for(let xx=-11;xx<-.1;xx+=1.12){let x=xx+((Math.round(zz)%2)*.52);rect(ground,(u,v)=>[u,.025,v],x,zz,.99,.88,2,0);}
}
for(const zz of [-14,-30,-47]){
  ground.stroke([-68,.03,zz-1.8],[57,.03,zz-1.8],1);ground.stroke([-68,.03,zz+1.6],[57,.03,zz+1.6],2);
  for(let xx=-67;xx<58;xx+=2.1){ground.line([xx,.02,zz-1.7],[xx,.02,zz+1.6],2);ground.line([xx,.02,zz],[xx+2,.02,zz],2);}
}
// Open-water pencil marks: broken, gently curved and deliberately irregular.
for(let z=9;z<105;z+=rand(2,3.6)){
  for(let x=-95;x<110;x+=rand(7,15)){
    let len=rand(2,11),pts=[];
    if(x>24 && x<44 && z<45)continue;
    for(let q=0;q<=8;q++){let xx=x+q/8*len;pts.push([xx,-2.58,z+Math.sin(xx*.21+z)*.66+Math.sin(xx*.47)*.12]);}ground.path(pts,z>72?2:rand()<.2?1:2);
    if(rand()<.22)ground.line([x+1,-2.57,z+.3],[x+len*.6,-2.57,z+.34],2);
  }
}
// Pier and its circular end.
const pier=new Draft(-1000);pier.group.position.x=13;
pier.box(34,-2.7,19,10.8,2.7,28,true,0);
pier.cylinder(34,-2.7,35,7.8,7.8,2.7,36,false,0);
for(let zz=6;zz<40;zz+=1.1){pier.line([28.7,.024,zz],[39.3,.024,zz],2);for(let x=29;x<40;x+=2.1)pier.line([x,.025,zz],[x,.025,zz+1.08],2);}
for(let yy=-2.2;yy<-.1;yy+=.6){pier.stroke([39.43,yy,5],[39.43,yy,33],1);for(let zz=5;zz<33;zz+=1.6)pier.line([39.44,yy,zz],[39.44,yy+.58,zz],2);}
function rail(D,a,b,height=1.0,step=2.6){
  const l=Math.hypot(b[0]-a[0],b[2]-a[2]),n=Math.floor(l/step);
  D.stroke([a[0],a[1]+height,a[2]],[b[0],b[1]+height,b[2]],1);
  D.stroke([a[0],a[1]+height*.46,a[2]],[b[0],b[1]+height*.46,b[2]],2);
  for(let i=0;i<=n;i++){let t=i/n,x=mix(a[0],b[0],t),z=mix(a[2],b[2],t);D.line([x,a[1],z],[x,a[1]+height,z],0);}
}
rail(ground,[-68,.15,5.8],[40.9,.15,5.8],.95,3.1);rail(ground,[53,.15,5.8],[58,.15,5.8],.95,3.1);
rail(pier,[28.8,.1,7],[28.8,.1,29],1,2.4);rail(pier,[39.2,.1,7],[39.2,.1,29],1,2.4);
for(let i=0;i<31;i++){let a=i/31*TAU;if(Math.sin(a)<-.55)continue;let b=a+TAU/31;let p=[34+Math.cos(a)*7.5,.1,35+Math.sin(a)*7.5],q=[34+Math.cos(b)*7.5,.1,35+Math.sin(b)*7.5];rail(pier,p,q,.95,1.5);}
pier.finish();
// Short stair down to a landing at the water.
for(let i=0;i<7;i++){ground.box(-25,-i*.32,8+i*.55,5.2,.28,.6,true,0);}ground.box(-25,-2.2,13,7,.25,2.7,true,1);
// Sketchy grounding hatching, the equivalent of a pencil's cast shadow.
for(let i=0;i<115;i++){let x=rand(-64,57),z=rand(-63,-3);ground.line([x,.032,z],[x+rand(1,3),.032,z-rand(.7,1.8)],2);}
ground.finish();

// Houses: each little block is independently drawn into the scene.
let blockIndex=0;
const rows=[
  {z:-5.3,x:[-55,-43,-31,-19,7,19,31,44,55]},
  {z:-21,x:[-55,-43,-31,-19,7,20,33,46,56]},
  {z:-38,x:[-55,-43,8,21,34,47,57]},
  {z:-55,x:[-55,-43,-31,-19,-6,7,20,33,46,57]}
];
rows.forEach((row,ri)=>{
  for(let i=0;i<row.x.length;i+=3){
    let D=new Draft(130+blockIndex*60);D.inkCenter={x:row.x.slice(i,i+3).reduce((a,b)=>a+b,0)/row.x.slice(i,i+3).length,z:row.z};D.ink=1; blockIndex++;
    row.x.slice(i,i+3).forEach((x,j)=>{
      const w=rand(7.6,9.6),d=ri===0?rand(8,9.8):rand(8.7,10.7),floors=ri===3?pick([3,4,4,5]):pick([3,4,4,5,5,6]);
      building(D,x+rand(-.22,.22),row.z+rand(-.3,.3),w,d,floors,(i+j+ri)%5);
    });D.finish();
  }
});
// A small basilica and a Venetian-style clock tower at the end of the avenue.
const church=new Draft(500);
church.box(-24,0,-37,17,13,15,true,0);roof(church,-24,13,-37,17,15,6);
const churchFront=(u,v,e=0)=>[-24+u,v,-29.5+e];
archDoor(church,churchFront,-1.6,.05,3.2,5.4);
for(let u of [-6,4.6]){archDoor(church,churchFront,u,5.1,1.4,4.7);}
church.circle(-24,10.8,-29.42,1.6,0,'xy',36);church.circle(-24,10.8,-29.41,1.29,1,'xy',36);
for(let i=0;i<12;i++){let a=i/12*TAU;church.line([-24,10.8,-29.4],[-24+Math.cos(a)*1.28,10.8+Math.sin(a)*1.28,-29.4],1);}
church.stroke([-24,19,-37],[-24,21,-37],0);church.stroke([-24.7,20.3,-37],[-23.3,20.3,-37],0);
[-32.6,-15.4].forEach(x=>{church.box(x,0,-29.9,.7,13.4,.9,true,0);});
obstacles.push({x:-24,z:-37,w:17.5,d:15.5});mapBuildings.push({x:-24,z:-37,w:17,d:15});
const tx=-6,tz=-34;
church.box(tx,0,tz,6.4,29,6.4,true,0);
for(let y=2;y<26;y+=3){church.box(tx,y,tz,6.48,.16,6.48,true,0);}
const towerFront=(u,v,e=0)=>[tx+u,v,tz+3.21+e];
const towerSide=(u,v,e=0)=>[tx+3.21+e,v,tz-u];
archDoor(church,towerFront,-1.15,.05,2.3,3.65);
[towerFront,towerSide].forEach(map=>{
  for(let y of [5,10,15])archDoor(church,map,-.47,y,.94,1.95);
  for(let u of [-1.9,.6])archDoor(church,map,u,26,1.3,4.0);
  const c=map(0,22.7,.09);const circle=[];for(let i=0;i<=48;i++){let a=i/48*TAU;circle.push(map(Math.cos(a)*1.52,22.7+Math.sin(a)*1.52,.09));}church.path(circle,0);const inner=[];for(let i=0;i<=48;i++){let a=i/48*TAU;inner.push(map(Math.cos(a)*1.34,22.7+Math.sin(a)*1.34,.10));}church.path(inner,1);
  for(let i=0;i<12;i++){let a=i/12*TAU;church.line(map(Math.cos(a)*1.12,22.7+Math.sin(a)*1.12,.12),map(Math.cos(a)*1.3,22.7+Math.sin(a)*1.3,.12),0);}
  church.stroke(map(0,22.7,.13),map(-.72,23.35,.13),0);church.stroke(map(0,22.7,.13),map(.2,23.64,.13),0);
  hatchRect(church,map,-3,1,6,19,.6,2);
});
church.box(tx,29.8,tz,7.2,.5,7.2,true,0);church.box(tx,30.3,tz,6,2.5,6,true,0);church.box(tx,32.8,tz,7,.38,7,true,0);
const towerRoof=[[-3.7,0,-3.7],[3.7,0,-3.7],[3.7,0,3.7],[-3.7,0,3.7]].map(p=>[tx+p[0],33.2,tz+p[2]]),apex=[tx,41,tz];
for(let i=0;i<4;i++){church.face([towerRoof[i],towerRoof[(i+1)%4],apex],i%2?1:2);church.stroke(towerRoof[i],apex,0);}
for(let t=.13;t<1;t+=.12){let a=towerRoof.map(p=>[mix(apex[0],p[0],t),mix(apex[1],p[1],t),mix(apex[2],p[2],t)]);church.path(a,2,true);}
church.stroke([tx,41,tz],[tx,42.5,tz],0);
church.finish();obstacles.push({x:tx,z:tz,w:7,d:7});mapBuildings.push({x:tx,z:tz,w:6.4,d:6.4});

// The lighthouse, a small nod to the original pencil-and-paper inspiration.
const light=new Draft(340);light.group.position.x=13;const lx=34,lz=35;
light.cylinder(lx,0,lz,3.5,3.5,.5,24,false,1);
light.cylinder(lx,.5,lz,2.95,2.05,18.4,28,false,0);
for(let y=2.4;y<18.9;y+=3.3){let r=2.95-(y-.5)/18.4*.9;light.circle(lx,y,lz,r+.018,1,'xz',44);}
for(let i=0;i<7;i++){
  let a=i/7*TAU,r1=2.95,r2=2.05;
  light.stroke([lx+Math.cos(a)*r1,.55,lz+Math.sin(a)*r1],[lx+Math.cos(a)*r2,18.85,lz+Math.sin(a)*r2],2,.035);
}
// Dense diagonal graphite on the less lit side of the round tower.
for(let i=0;i<41;i++){
  let a=rand(-.2,1.6),y=rand(.9,17.2),len=rand(.7,2.7),p=[];
  for(let t=0;t<=5;t++){let yy=y+t/5*len,aa=a+t*.025,rr=2.95-(yy-.5)/18.4*.9+.025;p.push([lx+Math.cos(aa)*rr,yy,lz+Math.sin(aa)*rr]);}light.path(p,2);
}
const lf=(u,v,e=0)=>[lx+u,v,lz+2.97-(v/18.4*.9)+e];
archDoor(light,lf,-.72,.55,1.44,3.0);
for(let yy of [6.2,10.2,14.2])windowSketch(light,lf,-.39,yy,.78,1.18,0);
light.cylinder(lx,18.7,lz,2.16,3.4,.45,28,false,0);
light.cylinder(lx,19.15,lz,3.4,3.4,.25,28,false,0);
light.circle(lx,20.35,lz,3.35,0,'xz',48);light.circle(lx,19.8,lz,3.35,1,'xz',48);
for(let i=0;i<24;i++){let a=i/24*TAU;light.line([lx+Math.cos(a)*3.35,19.4,lz+Math.sin(a)*3.35],[lx+Math.cos(a)*3.35,20.35,lz+Math.sin(a)*3.35],0);}
light.cylinder(lx,19.4,lz,1.9,1.9,3.75,12,true,4);
for(let i=0;i<12;i++){let a=i/12*TAU;light.stroke([lx+Math.cos(a)*1.9,19.4,lz+Math.sin(a)*1.9],[lx+Math.cos(a)*1.9,23.15,lz+Math.sin(a)*1.9],0);}
light.circle(lx,21.3,lz,1.91,1,'xz',36);
light.cylinder(lx,23.15,lz,2.35,.1,2,24,true,1);
light.stroke([lx,25.15,lz],[lx,27.5,lz],0);
light.face([[lx,27.4,lz],[lx+1.8,27.1,lz+.15],[lx,26.5,lz]],5);light.path([[lx,27.4,lz],[lx+1.8,27.1,lz+.15],[lx,26.5,lz]],3,true);
// Fresnel lamp drawn in amber, rather than a glowing game effect.
light.circle(lx,21.15,lz+.06,.48,3,'xy',24);light.stroke([lx-.7,21.15,lz+.13],[lx+.7,21.15,lz+.13],3);
for(let i=0;i<10;i++){let a=i/10*TAU;light.line([lx+Math.cos(a)*3.6,.52,lz+Math.sin(a)*3.6],[lx+Math.cos(a)*5.4,.05,lz+Math.sin(a)*5.4],2);}
light.finish();obstacles.push({x:lx+13,z:lz,w:6.2,d:6.2});

// Street furniture and individual organic pencil marks make the scale human.
const props=new Draft(700);
function lamp(D,x,z,h=5.5){
  D.cylinder(x,0,z,.22,.15,.35,8,false,1);D.stroke([x,.3,z],[x,h-.85,z],0);D.stroke([x+.07,.3,z],[x+.07,h-.85,z],1);
  const y=h-.85;D.box(x,y,z,.62,.8,.62,true,4);
  D.face([[x-.43,y+.8,z-.43],[x+.43,y+.8,z-.43],[x,y+1.23,z]],1);D.face([[x+.43,y+.8,z-.43],[x+.43,y+.8,z+.43],[x,y+1.23,z]],1);D.face([[x+.43,y+.8,z+.43],[x-.43,y+.8,z+.43],[x,y+1.23,z]],0);
  D.stroke([x-.43,y+.8,z+.43],[x,y+1.23,z],0);D.stroke([x+.43,y+.8,z+.43],[x,y+1.23,z],0);D.stroke([x,y+1.23,z],[x,y+1.47,z],0);
}
function bench(D,x,z,turn=0){
  const p=(u,v,w)=>[x+u*Math.cos(turn)+w*Math.sin(turn),v,z-u*Math.sin(turn)+w*Math.cos(turn)];
  for(let zz=-.4;zz<.4;zz+=.17){D.path([p(-1.15,.65,zz),p(1.15,.65,zz),p(1.15,.74,zz),p(-1.15,.74,zz)],1,true);}
  for(let y=.95;y<1.53;y+=.2)D.stroke(p(-1.15,y,-.42),p(1.15,y,-.42),1);
  for(let xx of [-.85,.85]){D.stroke(p(xx,0,-.32),p(xx,1.6,-.42),0);D.stroke(p(xx,0,.33),p(xx,.7,.33),0);D.stroke(p(xx,.95,-.42),p(xx,.95,.38),0);}
}
function tree(D,x,z,s=1,cypress=false){
  const h=rand(4.7,6.5)*s;
  D.stroke([x,0,z],[x+.06,h*.67,z],0);D.stroke([x+.16,.04,z+.05],[x+.1,h*.64,z+.05],1);
  if(cypress){
    const pts=[];for(let i=0;i<=32;i++){let a=i/32*TAU;pts.push([x+Math.cos(a)*.8*s*(.9+rand(-.13,.13)),h*.66+Math.sin(a)*h*.5,z+Math.cos(a)*.19*s]);}D.face(pts,0);D.path(pts,1,true);
    for(let i=0;i<25;i++){let yy=rand(h*.2,h*1.15),w=.75*s*Math.sin((yy-h*.15)/h*Math.PI);D.line([x-rand(0,w),yy,z+.18],[x+rand(0,w),yy+rand(.1,.5),z+.2],2);}
  }else{
    for(let j=0;j<3;j++){
      const cx=x+rand(-.8,.8)*s,cy=h*.77+rand(-.4,.5)*s,cz=z+rand(-.6,.6)*s,r=rand(1.25,1.85)*s;
      D.stroke([x,h*.45,z],[cx,cy,cz],1);
      // Two imperfect contour loops and a few scribbled clusters, not wire spheres.
      for(let l=0;l<3;l++){
        const pts=[];for(let i=0;i<=34;i++){let a=i/34*TAU,rr=r*(1+.08*Math.sin(a*7+j)+.07*Math.cos(a*11+j));pts.push([cx+Math.cos(a)*rr,cy+Math.sin(a)*rr*.82,cz+Math.cos(a+l)*rr*(l===0?.25:.66)]);}if(l===0)D.face(pts,0);D.path(pts,l===0?1:2,true);
      }
      for(let q=0;q<8;q++){let a=rand(0,TAU),b=rand(.2,.8),u=Math.cos(a)*r*b,v=Math.sin(a)*r*b;D.path([[cx+u-.2,cy+v,cz+r*.5],[cx+u,cy+v+.2,cz+r*.53],[cx+u+.3,cy+v+.13,cz+r*.5]],2);}
    }
  }
  D.circle(x,.03,z,.6*s,2,'xz',15);
}
for(let x=-62;x<57;x+=10){lamp(props,x,3.6,5.1);if(x!==28)bench(props,x+3,2.15);}
for(let z=-9;z>-60;z-=11){lamp(props,-10,z,5.2);lamp(props,-.8,z,5.2);}
[-59,-47,-35,-23,2,14,26,49,58].forEach((x,i)=>tree(props,x,1.6,rand(.78,1.05),i%3===0));
for(let z=-17;z>-60;z-=15){tree(props,-11.4,z,1.1,false);tree(props,.3,z,.9,true);}
lamp(props,42.7,18,4.6);lamp(props,51.2,29,4.6);bench(props,47,41,Math.PI);
// Mooring bollards and coiled ropes.
for(let x=-61;x<56;x+=8){props.cylinder(x,.15,5.6,.2,.2,.43,8,false,1);props.box(x,.55,5.6,.55,.12,.25,true,1);props.circle(x+.45,.03,5.3,.3,2,'xz',16);}
for(let i=0;i<5;i++){let x=rand(-63,54);props.box(x,0,rand(1,4),.7,1,.7,true,1);}
// A tiny fountain off the avenue.
props.cylinder(-7,0,-18,2.15,2.15,.4,24,false,0);props.circle(-7,.45,-18,1.85,1,'xz',36);props.cylinder(-7,.4,-18,.4,.24,1.7,12,true,0);props.cylinder(-7,1.8,-18,.85,1.2,.35,18,false,0);props.circle(-7,2.2,-18,1.1,1,'xz',30);
props.finish();

function sailboat(x,z,length,rotation,delay=500){
  const D=new Draft(delay);D.group.position.set(x,-2.35,z);D.group.rotation.y=rotation;const w=length*.33;
  const rim=[[-w/2,.38,-length*.42],[w/2,.38,-length*.42],[w*.6,.38,length*.13],[0,.38,length*.53],[-w*.6,.38,length*.13]],bottom=rim.map(p=>[p[0]*.67,-.33,p[2]*.8]);
  D.face(rim,4);for(let i=0;i<rim.length;i++)D.face([rim[i],rim[(i+1)%rim.length],bottom[(i+1)%rim.length],bottom[i]],1);D.path(rim,0,true);D.path(bottom,1,true);
  for(let i=0;i<3;i++){let t=.2+i*.22;D.path(rim.map((p,j)=>[mix(p[0],bottom[j][0],t),mix(p[1],bottom[j][1],t),mix(p[2],bottom[j][2],t)]),1,true);}
  const mastH=length*1.33;D.stroke([0,.4,0],[0,mastH,0],0);D.stroke([.07,.4,0],[.07,mastH,0],1);
  let sail=[[.13,mastH-.2,.05],[.13,1.35,.05],[length*.46,1.35,length*.05]];D.face(sail,4);D.path(sail,0,true);
  const jib=[[-.13,mastH-.6,-.05],[-length*.32,2,-length*.16],[-.13,2,-.05]];D.face(jib,0);D.path(jib,1,true);
  for(let t=.2;t<.9;t+=.18)D.line([.16,mix(1.35,mastH-.2,t),.07],[length*.46*(1-t),1.37,length*.05*(1-t)],2);
  D.stroke([0,mastH,0],[0,.4,length*.51],1);D.stroke([0,mastH,0],[0,.4,-length*.41],1);D.stroke([-.08,1.3,0],[length*.45,1.3,length*.05],0);
  for(let q=0;q<5;q++)D.line([-w*.35,.41,-length*.29+q*length*.12],[w*.35,.41,-length*.29+q*length*.12],2);
  D.finish();D.dynamic=true;boats.push({group:D.group,draft:D,x,z,rotation,phase:rand(0,TAU),started:null});
}
sailboat(12,22,7,-.42);sailboat(-22,31,5.2,.3,750);sailboat(56,57,7.8,-.8,900);sailboat(-47,18,4.5,1.7,900);

// The odd bicycle, small café tables, and hanging clothes between houses.
const life=new Draft(950);
function bicycle(x,z){
  const y=.59;life.circle(x-.69,y,z,.51,0,'xy',24);life.circle(x+.75,y,z,.51,0,'xy',24);
  life.path([[x-.69,y,z],[x-.15,1.3,z],[x+.16,y,z],[x-.69,y,z]],0);life.path([[x-.15,1.3,z],[x+.53,1.3,z],[x+.16,y,z]],1);life.stroke([x+.75,y,z],[x+.47,1.62,z],0);life.stroke([x+.27,1.66,z],[x+.55,1.66,z],0);life.stroke([x-.35,1.45,z],[x+.03,1.45,z],0);
}
bicycle(9,-.4);bicycle(-26,-.3);bicycle(39,-16);
for(let x of [15,18,21]){
  life.cylinder(x,0,-.1,.1,.1,.95,6,false,1);life.cylinder(x,.95,-.1,.65,.65,.08,20,false,4);
  for(let side of [-1,1]){life.box(x+side*.95,.4,-.1,.55,.08,.55,true,0);life.stroke([x+side*.95-.2,0,-.1],[x+side*.95-.2,.98,-.3],1);life.stroke([x+side*.95+.2,0,-.1],[x+side*.95+.2,.98,-.3],1);life.stroke([x+side*.95-.2,.95,-.3],[x+side*.95+.2,.95,-.3],1);}
}
const laundryA=[-15,12,-21],laundryB=[3,12.7,-21];let rope=[];for(let i=0;i<=24;i++){let t=i/24;rope.push([mix(laundryA[0],laundryB[0],t),mix(laundryA[1],laundryB[1],t)-Math.sin(t*Math.PI)*1.1,-21]);}life.path(rope,1);
for(let i=0;i<6;i++){let x=-11+i*2.1,y=11.2+Math.abs(i-3)*.1,w=rand(.7,1.2),h=rand(1.2,1.7);life.face([[x,y,-21],[x+w,y,-21],[x+w,y-h,-21.1],[x,y-h,-21.08]],4);life.path([[x,y,-21],[x+w,y,-21],[x+w,y-h,-21.1],[x,y-h,-21.08]],1,true);}
life.finish();

const signs=[];
function sign(text,x,y,z,width){
  const c=document.createElement('canvas');c.width=512;c.height=96;const ctx=c.getContext('2d');ctx.fillStyle='#f3f0e7';ctx.fillRect(0,0,512,96);ctx.strokeStyle='#757b67';ctx.lineWidth=2;ctx.strokeRect(3,3,506,90);ctx.fillStyle='#575f4c';ctx.textAlign='center';ctx.textBaseline='middle';ctx.font='38px Georgia';ctx.fillText(text,256,51);
  const texture=new THREE.CanvasTexture(c);texture.colorSpace=THREE.SRGBColorSpace;
  const m=new THREE.Mesh(new THREE.PlaneGeometry(width,width*96/512),new THREE.MeshBasicMaterial({map:texture,transparent:true,opacity:0,polygonOffset:true,polygonOffsetFactor:-1,polygonOffsetUnits:-1}));m.position.set(x,y,z);m.visible=false;root.add(m);signs.push({mesh:m,x,z});
}
// Window signage uses only locally drawn lettering, no downloaded imagery.
sign('KAVARNA',19,3.53,-.35,4.2);sign('ATELJE',-31,3.59,-.24,3.5);sign('PAPIRNICA',7,3.56,-.2,4.3);
// Airborne pencil strokes.
for(let i=0;i<9;i++){
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute([-1,0,0,-.45,.23,0,-.45,.23,0,0,0,0,0,0,0,.48,.25,.03,.48,.25,.03,1.05,.08,.06],3));
  const b=new THREE.LineSegments(g,lineMaterials[1]);b.position.set(rand(-54,58),rand(26,39),rand(-43,39));b.visible=false;root.add(b);birds.push({obj:b,x:b.position.x,z:b.position.z,phase:rand(0,TAU),speed:rand(.6,1.1)});
}

// ===================== EXPANDED PENCIL WORLD =====================
// A much larger walkable city + coast + countryside. Everything is still drawn
// into the same local ink tiles, so only the nearby world receives detail.
const WORLD={minX:-540,maxX:540,minZ:-540,maxZ:280,landZ:8};
const walkZones=[];
function zone(x0,z0,x1,z1){walkZones.push({x0,z0,x1,z1});}
function inZone(x,z){for(const r of walkZones)if(x>=r.x0&&x<=r.x1&&z>=r.z0&&z<=r.z1)return true;return false;}

// Ground slab for the enlarged land. The paper background remains the sea.
const mega=new Draft();
mega.face([[-560,-.02,-560],[560,-.02,-560],[560,-.02,10],[-560,-.02,10]],0);
mega.stroke([-560,.03,8],[560,.03,8],0);
for(let x=-560;x<560;x+=rand(3,7)){mega.line([x,.031,8],[x+rand(1,3),.031,8+rand(-.2,.2)],2);}
mega.finish();

// ---------- roads ----------
function roadH(D,z,x0,x1,w=9){
  D.face([[x0,.012,z-w/2],[x1,.012,z-w/2],[x1,.012,z+w/2],[x0,.012,z+w/2]],1);
  D.stroke([x0,.03,z-w/2],[x1,.03,z-w/2],1);D.stroke([x0,.03,z+w/2],[x1,.03,z+w/2],1);
  D.stroke([x0,.05,z-w/2-1.1],[x1,.05,z-w/2-1.1],2);D.stroke([x0,.05,z+w/2+1.1],[x1,.05,z+w/2+1.1],2);
  for(let x=x0+3;x<x1;x+=8)D.line([x,.032,z],[x+3.2,.032,z],2);
  for(let x=x0;x<x1;x+=rand(18,34)){D.circle(x,.034,z+rand(-2,2),.42,2,'xz',12);D.line([x-.3,.035,z],[x+.3,.035,z],2);}
}
function roadV(D,x,z0,z1,w=9){
  D.face([[x-w/2,.012,z0],[x+w/2,.012,z0],[x+w/2,.012,z1],[x-w/2,.012,z1]],1);
  D.stroke([x-w/2,.03,z0],[x-w/2,.03,z1],1);D.stroke([x+w/2,.03,z0],[x+w/2,.03,z1],1);
  D.stroke([x-w/2-1.1,.05,z0],[x-w/2-1.1,.05,z1],2);D.stroke([x+w/2+1.1,.05,z0],[x+w/2+1.1,.05,z1],2);
  for(let z=z0+3;z<z1;z+=8)D.line([x,.032,z],[x,.032,z+3.2],2);
  for(let z=z0;z<z1;z+=rand(18,34)){D.circle(x+rand(-2,2),.034,z,.42,2,'xz',12);D.line([x,.035,z-.3],[x,.035,z+.3],2);}
}
function crosswalkH(D,x,z,w=9){for(let i=-w/2+1;i<w/2-1;i+=1.1)D.face([[x-2,.033,z+i],[x+2,.033,z+i],[x+2,.033,z+i+.55],[x-2,.033,z+i+.55]],4);}
function crosswalkV(D,x,z,w=9){for(let i=-w/2+1;i<w/2-1;i+=1.1)D.face([[x+i,.033,z-2],[x+i+.55,.033,z-2],[x+i+.55,.033,z+2],[x+i,.033,z+2]],4);}
const roads=new Draft();
const hRoads=[-70,-114,-158,-202,-246,-290,-334,-378,-422,-466];
const vRoads=[-220,-176,-132,-88,-44,0,44,88,132,176,220];
hRoads.forEach(z=>roadH(roads,z,-430,430));
vRoads.forEach(x=>roadV(roads,x,-500,6));
roadH(roads,-20,-430,-230,7);roadH(roads,-20,230,430,7);
hRoads.forEach(z=>vRoads.forEach(x=>{if(Math.abs(x)<230&&z<-60){crosswalkH(roads,x,z);crosswalkV(roads,x,z);}}));
roads.finish();

// ---------- small urban objects ----------
function bin(D,x,z){D.cylinder(x,0,z,.32,.28,.85,10,false,1);D.circle(x,.88,z,.34,1,'xz',12);D.line([x-.2,.9,z],[x+.2,.9,z],1);}
function hydrant(D,x,z){D.cylinder(x,0,z,.16,.16,.65,8,false,3);D.cylinder(x,.65,z,.2,.2,.12,8,false,3);D.stroke([x-.22,.45,z],[x+.22,.45,z],0);}
function bollard(D,x,z){D.cylinder(x,0,z,.12,.12,.7,8,false,1);D.circle(x,.72,z,.13,1,'xz',8);}
function car(D,x,z,vertical=false){
  const w=vertical?2.1:4.4,d=vertical?4.4:2.1;
  D.box(x,.35,z,w,.55,d,true,1);D.box(x+(vertical?0:-.2),.9,z+(vertical?-.2:0),w*.72,.5,d*.72,true,0);
  if(vertical){D.circle(x-.95,.35,z-1.4,.35,0,'yz',12);D.circle(x+.95,.35,z-1.4,.35,0,'yz',12);D.circle(x-.95,.35,z+1.4,.35,0,'yz',12);D.circle(x+.95,.35,z+1.4,.35,0,'yz',12);}
  else{D.circle(x-1.4,.35,z-.95,.35,0,'xy',12);D.circle(x-1.4,.35,z+.95,.35,0,'xy',12);D.circle(x+1.4,.35,z-.95,.35,0,'xy',12);D.circle(x+1.4,.35,z+.95,.35,0,'xy',12);}
  D.stroke([x-w/2,.62,z-d/2],[x+w/2,.62,z-d/2],2);D.stroke([x-w/2,.62,z+d/2],[x+w/2,.62,z+d/2],2);
  obstacles.push({x,z,w:w+.3,d:d+.3});
}
function person(D,x,z,style=0){
  const h=rand(1.55,1.8);D.circle(x,h,z,.14,0,'xy',10);
  D.stroke([x,h-.14,z],[x,h*.52,z],0);
  D.stroke([x,h*.52,z],[x-.18,0,z],1);D.stroke([x,h*.52,z],[x+.18,0,z],1);
  D.stroke([x,h*.78,z],[x-.22,h*.5,z],1);D.stroke([x,h*.78,z],[x+.22,h*.5,z],1);
  if(style===1){D.stroke([x-.18,h*.98,z],[x+.18,h*.98,z],0);D.stroke([x-.12,h*.98,z],[x-.12,h*1.08,z],1);D.stroke([x+.12,h*.98,z],[x+.12,h*1.08,z],1);D.stroke([x-.12,h*1.08,z],[x+.12,h*1.08,z],1);}
  if(style===2){D.stroke([x+.22,h*.5,z],[x+.34,h*.3,z],1);D.circle(x+.36,h*.24,z,.1,1,'xy',8);}
}
function trafficLight(D,x,z){D.stroke([x,0,z],[x,3.4,z],0);D.box(x,3.4,z,.35,1,.35,true,1);D.circle(x,3.95,z+.19,.09,3,'xy',8);D.circle(x,3.7,z+.19,.09,1,'xy',8);D.circle(x,3.45,z+.19,.09,1,'xy',8);}
function busStop(D,x,z){D.stroke([x,0,z],[x,2.6,z],0);D.stroke([x+2.4,0,z],[x+2.4,2.6,z],0);D.box(x+1.2,2.6,z,3,.12,1.4,true,0);D.box(x+1.2,.5,z,2.2,.1,.5,true,1);D.box(x+2.2,1.4,z,.5,.8,.08,true,4);}
function powerPole(D,x,z){D.stroke([x,0,z],[x,8,z],0);D.stroke([x-1.2,7.4,z],[x+1.2,7.4,z],1);D.stroke([x-.9,6.6,z],[x+.9,6.6,z],1);D.circle(x-1.1,7.5,z,.08,1,'xy',6);D.circle(x+1.1,7.5,z,.08,1,'xy',6);}
function wire(D,a,b,sag=1.2){const pts=[];for(let i=0;i<=12;i++){const t=i/12;pts.push([mix(a[0],b[0],t),mix(a[1],b[1],t)-Math.sin(t*Math.PI)*sag,mix(a[2],b[2],t)]);}D.path(pts,2);}
function billboard(D,x,z,text){D.stroke([x-1.8,0,z],[x-1.8,3,z],0);D.stroke([x+1.8,0,z],[x+1.8,3,z],0);D.box(x,3,z,4.4,2.2,.2,true,0);sign(text,x,4.1,z+.12,4);}
function marketStall(D,x,z){D.box(x,0,z,2.6,.9,1.6,true,1);D.face([[x-1.5,2.2,z-1],[x+1.5,2.2,z-1],[x+1.3,2.5,z+1],[x-1.3,2.5,z+1]],4);D.path([[x-1.5,2.2,z-1],[x+1.5,2.2,z-1],[x+1.3,2.5,z+1],[x-1.3,2.5,z+1]],1,true);for(let i=0;i<6;i++)D.circle(x-1+i*.4,1,z+rand(-.4,.4),.12,1,'xz',8);for(let sx of [-1.2,1.2])D.stroke([x+sx,.9,z-.7],[x+sx,2.2,z-.9],1);}
function crate(D,x,z,s=.7){D.box(x,0,z,s,s,s,true,1);D.line([x-s/2,s/2,z-s/2],[x+s/2,s/2,z+s/2],2);D.line([x-s/2,s/2,z+s/2],[x+s/2,s/2,z-s/2],2);}
function barrel(D,x,z){D.cylinder(x,0,z,.35,.35,.9,12,false,1);D.circle(x,.3,z,.36,2,'xz',12);D.circle(x,.6,z,.36,2,'xz',12);}
function fence(D,x0,z0,x1,z1,h=1){
  const len=Math.hypot(x1-x0,z1-z0),n=Math.max(1,Math.round(len/1.6));
  D.stroke([x0,h,z0],[x1,h,z1],1);D.stroke([x0,h*.5,z0],[x1,h*.5,z1],2);
  for(let i=0;i<=n;i++){const t=i/n,x=mix(x0,x1,t),z=mix(z0,z1,t);D.stroke([x,0,z],[x,h,z],1);}
}
function flowerBed(D,x,z,w,d){D.box(x,0,z,w,.25,d,true,1);for(let i=0;i<w*d*2;i++){const xx=x+rand(-w/2,w/2),zz=z+rand(-d/2,d/2);D.stroke([xx,.25,zz],[xx+rand(-.06,.06),.45+rand(0,.15),zz],2);D.circle(xx,.5,zz,.05,3,'xy',5);}}
function grassTuft(D,x,z){for(let i=0;i<3;i++)D.line([x,.02,z],[x+rand(-.12,.12),.18+rand(0,.12),z+rand(-.12,.12)],2);}
function rock(D,x,z,s=1){const pts=[];for(let i=0;i<7;i++){const a=i/7*TAU;pts.push([x+Math.cos(a)*s*rand(.6,1),.02,z+Math.sin(a)*s*rand(.5,.9)]);}D.face(pts,2);D.path(pts,1,true);D.line([x-s*.3,.03,z],[x+s*.2,.03,z+s*.3],2);}

// ---------- building enrichment ----------
function enrichBuilding(D,x,z,w,d,floors,variant){
  const h=floors*3.25+.6;
  for(const sx of [-1,1]){D.stroke([x+sx*(w/2+.07),.1,z+d/2+.07],[x+sx*(w/2+.07),h-.2,z+d/2+.07],1);}
  const front=(u,v,e=0)=>[x+u,v,z+d/2+e];
  for(let i=0;i<floors;i++){
    if(rand()<.5){const u=rand(-w/2+1,w/2-1),v=4.2+i*3.25;D.box(x+u,v,z+d/2+.28,.7,.45,.35,true,1);D.line([x+u-.3,v+.1,z+d/2+.46],[x+u+.3,v+.1,z+d/2+.46],2);}
    if(rand()<.45){const u=rand(-w/2+1,w/2-1),v=3.9+i*3.25;D.box(x+u,v,z+d/2+.22,.9,.18,.25,true,1);for(let q=0;q<4;q++)D.circle(x+u-.3+q*.2,v+.22,z+d/2+.3,.05,3,'xy',5);}
  }
  if(rand()<.6){const u=rand(-w/2+1,w/2-1);D.face([front(u,1.2,.03),front(u+.7,1.2,.03),front(u+.7,2.1,.03),front(u,2.1,.03)],4);D.path([front(u,1.2,.03),front(u+.7,1.2,.03),front(u+.7,2.1,.03),front(u,2.1,.03)],2,true);}
  for(let i=0;i<5;i++){const u=rand(-w/2,w/2),v=rand(.5,h);D.path([front(u,v,.02),front(u+rand(-.3,.3),v+rand(.2,.7),.02),front(u+rand(-.5,.5),v+rand(.8,1.4),.02)],2);}
  if(rand()<.5){const rx=x+rand(-w/3,w/3),rz=z+rand(-d/3,d/3);D.stroke([rx,h+1,rz],[rx,h+3.2,rz],1);D.stroke([rx-.7,h+2.6,rz],[rx+.7,h+2.6,rz],1);D.stroke([rx-.5,h+2.2,rz],[rx+.5,h+2.2,rz],1);}
  if(rand()<.35){D.face([[x-w/4,h+.8,z-d/4],[x+w/4,h+.8,z-d/4],[x+w/4,h+1.1,z+d/4],[x-w/4,h+1.1,z+d/4]],1);D.path([[x-w/4,h+.8,z-d/4],[x+w/4,h+.8,z-d/4],[x+w/4,h+1.1,z+d/4],[x-w/4,h+1.1,z+d/4]],2,true);}
}
const shopNames=['TRGOVINA','PEKARNA','KNJIGARNA','GALERIJA','BAR','POŠTA','BANKA','LEKARNA','CVETLIČARNA','RIBARNICA','ŽELEZNINA','HOTEL','MUZEJ','KINO','SLAŠČIČARNA','ČEVLJAR','KROJAČ','URAR','FOTOGRAF','GLASBA'];

// ---------- city blocks ----------
function cityBlock(cx,cz){
  if(cx>-95&&cx<75&&cz>-80&&cz<20)return; // old core
  if(cx>-210&&cx<-110&&cz>-210&&cz<-110)return; // park
  if(cx>130&&cx<240&&cz>-310&&cz<-210)return; // stadium
  const D=new Draft();
  const lots=rand()<.5?2:3;
  for(let i=0;i<lots;i++){
    const x=cx+(i-(lots-1)/2)*13+rand(-1,1),z=cz+rand(-4,4);
    const w=rand(10,12.5),d=rand(12,18),floors=Math.floor(rand(3,7));
    building(D,x,z,w,d,floors,Math.floor(rand(0,5)));
    enrichBuilding(D,x,z,w,d,floors,0);
    if(rand()<.7)sign(shopNames[Math.floor(rand(0,shopNames.length))],x,3.55,z+d/2+.06,4);
    if(rand()<.4)car(D,x+rand(-6,6),z+d/2+4,rand()<.5);
    if(rand()<.5)person(D,x+rand(-5,5),z+d/2+2,Math.floor(rand(0,3)));
  }
  for(let i=0;i<10;i++)grassTuft(D,cx+rand(-16,16),cz+rand(-16,16));
  if(rand()<.4)bin(D,cx+rand(-14,14),cz+18);
  if(rand()<.3)hydrant(D,cx+rand(-14,14),cz-18);
  D.finish();
}
for(let x=-198;x<=198;x+=44)for(let z=-92;z>=-312;z-=44)cityBlock(x,z);

// ---------- western suburb ----------
function gardenHouse(cx,cz){
  const D=new Draft();
  const w=rand(8,10),d=rand(8,10),floors=2;
  building(D,cx,cz,w,d,floors,2);enrichBuilding(D,cx,cz,w,d,floors,2);
  fence(D,cx-15,cz-15,cx+15,cz-15,.9);fence(D,cx-15,cz+15,cx+15,cz+15,.9);
  fence(D,cx-15,cz-15,cx-15,cz+15,.9);fence(D,cx+15,cz-15,cx+15,cz+15,.9);
  D.face([[cx-1,.02,cz+d/2],[cx+1,.02,cz+d/2],[cx+1,.02,cz+15],[cx-1,.02,cz+15]],1);
  tree(D,cx+rand(-10,10),cz+rand(-10,10),rand(.7,1),rand()<.3);
  flowerBed(D,cx-6,cz+d/2+2,3,1.2);flowerBed(D,cx+6,cz+d/2+2,3,1.2);
  D.box(cx+2,.7,cz+14,.3,1,.3,true,1);D.stroke([cx+2,1.7,cz+14],[cx+2,2.1,cz+14],1);
  if(rand()<.5)car(D,cx-8,cz+12,true);
  if(rand()<.6)person(D,cx+rand(-8,8),cz+rand(4,12),Math.floor(rand(0,3)));
  for(let i=0;i<16;i++)grassTuft(D,cx+rand(-14,14),cz+rand(-14,14));
  D.finish();
}
for(let x=-400;x<=-260;x+=36)for(let z=-240;z<=-20;z+=36)gardenHouse(x,z);

// ---------- park ----------
(function park(){
  const D=new Draft(),cx=-160,cz=-160;
  D.face([[cx-50,.02,cz-50],[cx+50,.02,cz-50],[cx+50,.02,cz+50],[cx-50,.02,cz+50]],0);
  D.face([[cx-50,.03,cz-3],[cx+50,.03,cz-3],[cx+50,.03,cz+3],[cx-50,.03,cz+3]],1);
  D.face([[cx-3,.03,cz-50],[cx+3,.03,cz-50],[cx+3,.03,cz+50],[cx-3,.03,cz+50]],1);
  D.circle(cx,.04,cz,12,1,'xz',40);
  for(let i=0;i<70;i++){const a=rand(0,TAU),r=rand(16,46);tree(D,cx+Math.cos(a)*r,cz+Math.sin(a)*r,rand(.8,1.4),rand()<.25);}
  for(let i=0;i<24;i++){const a=i/24*TAU;bench(D,cx+Math.cos(a)*14,cz+Math.sin(a)*14,a+Math.PI/2);}
  D.cylinder(cx,0,cz,3,3,.6,20,false,0);D.cylinder(cx,.6,cz,.5,.3,2.4,12,true,0);D.circle(cx,3.1,cz,1.4,1,'xz',24);
  flowerBed(D,cx-20,cz-20,8,3);flowerBed(D,cx+20,cz-20,8,3);flowerBed(D,cx-20,cz+20,8,3);flowerBed(D,cx+20,cz+20,8,3);
  // playground
  D.stroke([cx+30,0,cz+30],[cx+30,2.4,cz+30],0);D.stroke([cx+34,0,cz+30],[cx+34,2.4,cz+30],0);D.stroke([cx+30,2.4,cz+30],[cx+34,2.4,cz+30],0);
  D.stroke([cx+31,2.4,cz+30],[cx+31,.8,cz+30],2);D.stroke([cx+33,2.4,cz+30],[cx+33,.8,cz+30],2);D.stroke([cx+30.8,.8,cz+30],[cx+33.2,.8,cz+30],1);
  D.face([[cx+38,.02,cz+28],[cx+42,.02,cz+28],[cx+40,1.8,cz+32]],1);D.path([[cx+38,.02,cz+28],[cx+42,.02,cz+28],[cx+40,1.8,cz+32]],1,true);
  // pond
  D.circle(cx-30,.03,cz+30,9,1,'xz',36);for(let i=0;i<12;i++){const a=rand(0,TAU),r=rand(0,7);D.stroke([cx-30+Math.cos(a)*r,.035,cz+30+Math.sin(a)*r],[cx-30+Math.cos(a)*r+1,.035,cz+30+Math.sin(a)*r],2);}
  for(let i=0;i<10;i++)person(D,cx+rand(-40,40),cz+rand(-40,40),Math.floor(rand(0,3)));
  D.finish();
})();

// ---------- stadium ----------
(function stadium(){
  const D=new Draft(),cx=185,cz=-260,SEG=72;
  const ell=(a,rx,rz,y)=>[cx+Math.cos(a)*rx,y,cz+Math.sin(a)*rz];
  // pitch
  D.face([[cx-30,.03,cz-16],[cx+30,.03,cz-16],[cx+30,.03,cz+16],[cx-30,.03,cz+16]],0);
  D.stroke([cx,.04,cz-16],[cx,.04,cz+16],1);D.circle(cx,.04,cz,5,1,'xz',24);
  for(let sx of [-1,1]){D.stroke([cx+sx*30,.04,cz-5],[cx+sx*30,1.6,cz-5],0);D.stroke([cx+sx*30,1.6,cz-5],[cx+sx*30,1.6,cz+5],0);D.stroke([cx+sx*30,.04,cz+5],[cx+sx*30,1.6,cz+5],0);}
  // smooth continuous bowl: inner lip rises to outer rim (no stacked boxes)
  const rows=9, innerRx=36, innerRz=24, rise=7.5, spread=15;
  for(let r=0;r<rows;r++){
    const t0=r/rows,t1=(r+1)/rows;
    const rx0=innerRx+spread*t0, rz0=innerRz+spread*.7*t0, y0=.4+rise*t0*t0;
    const rx1=innerRx+spread*t1, rz1=innerRz+spread*.7*t1, y1=.4+rise*t1*t1;
    for(let i=0;i<SEG;i++){
      const a0=i/SEG*TAU,a1=(i+1)/SEG*TAU;
      const p00=ell(a0,rx0,rz0,y0),p01=ell(a1,rx0,rz0,y0),p11=ell(a1,rx1,rz1,y1),p10=ell(a0,rx1,rz1,y1);
      D.face([p00,p01,p11,p10],r%2?1:2);
      if(r%2===0)D.stroke(p00,p01,2);
    }
  }
  // outer rim wall + roof ring
  const rimRx=innerRx+spread, rimRz=innerRz+spread*.7, rimY=.4+rise;
  for(let i=0;i<SEG;i++){
    const a0=i/SEG*TAU,a1=(i+1)/SEG*TAU;
    D.face([ell(a0,rimRx,rimRz,0),ell(a1,rimRx,rimRz,0),ell(a1,rimRx,rimRz,rimY),ell(a0,rimRx,rimRz,rimY)],1);
    D.stroke(ell(a0,rimRx+1.5,rimRz+1.2,rimY+1.2),ell(a1,rimRx+1.5,rimRz+1.2,rimY+1.2),1);
  }
  // floodlight masts
  for(let sx of [-1,1])for(let sz of [-1,1]){
    const mx=cx+sx*(rimRx+4),mz=cz+sz*(rimRz+4);
    D.stroke([mx,0,mz],[mx,16,mz],0);D.box(mx,16,mz,2.4,1.4,1.2,true,1);
    for(let q=-1;q<=1;q++)D.circle(mx+q*.7,16.7,mz+.65,.18,3,'xy',8);
  }
  D.finish();
})();

// ---------- market square ----------
(function market(){
  const D=new Draft(),cx=60,cz=-120;
  for(let i=0;i<10;i++)marketStall(D,cx-18+(i%5)*9,cz-8+Math.floor(i/5)*10);
  for(let i=0;i<30;i++)crate(D,cx+rand(-24,24),cz+rand(-14,14),rand(.4,.8));
  for(let i=0;i<20;i++)person(D,cx+rand(-24,24),cz+rand(-14,14),Math.floor(rand(0,3)));
  D.cylinder(cx,0,cz,2,2,.5,16,false,0);D.cylinder(cx,.5,cz,.4,.2,2,10,true,0);
  D.finish();
})();

// ---------- cemetery ----------
(function cemetery(){
  const D=new Draft(),cx=-360,cz=-320;
  fence(D,cx-40,cz-30,cx+40,cz-30,1.2);fence(D,cx-40,cz+30,cx+40,cz+30,1.2);fence(D,cx-40,cz-30,cx-40,cz+30,1.2);fence(D,cx+40,cz-30,cx+40,cz+30,1.2);
  for(let i=0;i<8;i++)for(let j=0;j<5;j++){const x=cx-32+i*8,z=cz-22+j*9;D.box(x,0,z,.8,.9,.25,true,1);if(rand()<.4){D.stroke([x,.9,z],[x,1.5,z],1);D.stroke([x-.25,1.25,z],[x+.25,1.25,z],1);}}
  D.box(cx+25,0,cz,8,5,10,true,0);roof(D,cx+25,5,cz,8,10,3);
  for(let i=0;i<14;i++)tree(D,cx+rand(-36,36),cz+rand(-26,26),rand(.8,1.2),true);
  D.finish();
})();

// ---------- construction site ----------
(function construction(){
  const D=new Draft(),cx=120,cz=-80;
  fence(D,cx-20,cz-16,cx+20,cz-16,1.4);fence(D,cx-20,cz+16,cx+20,cz+16,1.4);fence(D,cx-20,cz-16,cx-20,cz+16,1.4);fence(D,cx+20,cz-16,cx+20,cz+16,1.4);
  for(let f=0;f<4;f++){D.box(cx,f*3.2,cz,18,.3,14,true,1);for(let sx of [-8,0,8])for(let sz of [-6,6])D.stroke([cx+sx,f*3.2,cz+sz],[cx+sx,(f+1)*3.2,cz+sz],1);}
  D.stroke([cx+24,0,cz],[cx+24,22,cz],0);D.stroke([cx+24,22,cz],[cx+40,22,cz],0);D.stroke([cx+24,22,cz],[cx+16,22,cz],0);D.stroke([cx+36,22,cz],[cx+36,12,cz],2);D.box(cx+36,11,cz,1.5,1,1.5,true,1);
  for(let i=0;i<12;i++)barrel(D,cx+rand(-16,16),cz+rand(-12,12));
  for(let i=0;i<10;i++)crate(D,cx+rand(-16,16),cz+rand(-12,12),rand(.6,1));
  D.finish();
})();

// ---------- industrial / harbor east ----------
function warehouse(D,x,z,w,d,h){
  D.box(x,0,z,w,h,d,true,1);
  for(let i=0;i<w;i+=6){D.face([[x-w/2+i,h,z-d/2],[x-w/2+i+3,h+2.5,z-d/2],[x-w/2+i+6,h,z-d/2],[x-w/2+i+6,h,z+d/2],[x-w/2+i+3,h+2.5,z+d/2],[x-w/2+i,h,z+d/2]],2);}
  D.box(x,0,z+d/2+.1,4,4,.2,true,1);for(let yy=.5;yy<4;yy+=.6)D.line([x-2,yy,z+d/2+.22],[x+2,yy,z+d/2+.22],2);
  for(let i=0;i<5;i++)D.box(x-w/2+2+i*(w-4)/5,h*.6,z+d/2+.1,1.2,1.2,.15,true,0);
  obstacles.push({x,z,w:w+.5,d:d+.5});mapBuildings.push({x,z,w,d});
}
function container(D,x,z,tone=1){D.box(x,0,z,6,2.6,2.4,true,tone);for(let i=-2.7;i<2.8;i+=.4)D.line([x+i,.2,z-1.21],[x+i,2.4,z-1.21],2);}
function crane(D,x,z){D.stroke([x,0,z],[x,18,z],0);D.stroke([x-1,0,z],[x,18,z],1);D.stroke([x+1,0,z],[x,18,z],1);D.stroke([x,18,z],[x+16,18,z],0);D.stroke([x,18,z],[x-6,18,z],0);D.stroke([x+12,18,z],[x+12,8,z],2);D.box(x+12,7,z,2,1.5,2,true,1);}
(function industrial(){
  const D=new Draft();
  for(let i=0;i<6;i++){const x=260+(i%3)*60,z=-40-Math.floor(i/3)*70;warehouse(D,x,z,40,30,9);for(let q=0;q<6;q++)container(D,x+rand(-24,24),z+rand(20,34),rand()<.3?3:1);}
  crane(D,300,10);crane(D,360,10);
  for(let i=0;i<4;i++){D.cylinder(420,0,-60-i*25,6,6,12,20,false,1);D.circle(420,12,-60-i*25,6,1,'xz',20);}
  D.cylinder(250,0,-180,2,2,24,12,false,1);for(let i=0;i<5;i++)D.circle(250,24+i*1.5,-180,2+i*.7,2,'xz',16);
  for(let i=0;i<20;i++)barrel(D,rand(240,420),rand(-200,20));
  D.finish();
})();

// ---------- railway ----------
(function railway(){
  const D=new Draft(),z=-360;
  D.stroke([-520,.05,z-1],[520,.05,z-1],0);D.stroke([-520,.05,z+1],[520,.05,z+1],0);
  for(let x=-520;x<520;x+=1.4)D.line([x,.03,z-1.6],[x,.03,z+1.6],1);
  for(let x=-520;x<520;x+=rand(3,6))grassTuft(D,x,z+rand(2,4));
  // station
  D.box(0,0,z+8,30,4,10,true,0);roof(D,0,4,z+8,30,10,3);D.face([[-15,.03,z+2],[15,.03,z+2],[15,.03,z+6],[-15,.03,z+6]],1);
  for(let x=-12;x<=12;x+=6)D.stroke([x,.03,z+2],[x,3.5,z+2],1);D.stroke([-15,3.5,z+2],[15,3.5,z+2],0);
  sign('POSTAJA',0,3,z+13.1,6);
  // train
  for(let c=0;c<4;c++){const x=-80+c*16;D.box(x,.6,z,14,3,2.8,true,c===0?3:1);D.circle(x-5,.4,z-1.4,.5,0,'yz',12);D.circle(x+5,.4,z-1.4,.5,0,'yz',12);for(let w=-5;w<=5;w+=2.5)D.box(x+w,1.8,z-1.41,1.2,1,.05,true,0);}
  for(let x=-480;x<520;x+=80){D.stroke([x,0,z-4],[x,4,z-4],0);D.box(x,4,z-4,.4,1,.4,true,1);D.circle(x,4.7,z-4.2,.12,3,'xy',8);}
  D.finish();
})();

// ---------- power lines ----------
(function power(){
  const D=new Draft();
  for(let x=-480;x<=480;x+=60){powerPole(D,x,-470);if(x>-480)wire(D,[x-60,7.4,-470],[x,7.4,-470],1.4);}
  for(let z=-460;z<=0;z+=60){powerPole(D,430,z);if(z>-460)wire(D,[430,7.4,z-60],[430,7.4,z],1.4);}
  D.box(-460,0,-460,10,3,8,true,1);for(let i=0;i<4;i++)D.cylinder(-464+i*2.5,3,-460,.3,.3,2,8,true,1);
  D.finish();
})();

// ---------- coast / boardwalk / beaches ----------
(function coast(){
  const D=new Draft();
  // boardwalk over water
  D.face([[-440,.05,8],[440,.05,8],[440,.05,18],[-440,.05,18]],1);
  for(let x=-440;x<440;x+=1.2)D.line([x,.06,8],[x,.06,18],2);
  for(let x=-440;x<440;x+=8){D.stroke([x,-2,18],[x,.05,18],1);D.stroke([x,-2,8],[x,.05,8],1);}
  rail(D,[-440,.1,17.5],[440,.1,17.5],1,4);
  for(let x=-420;x<440;x+=28){lamp(D,x,12,4.5);if(rand()<.5)bench(D,x+6,14,Math.PI);if(rand()<.4)person(D,x+rand(-4,4),13,Math.floor(rand(0,3)));}
  zone(-440,8,440,18);
  // beaches
  for(const [x0,x1] of [[-440,-120],[120,440]]){
    D.face([[x0,-.05,8],[x1,-.05,8],[x1,-.05,40],[x0,-.05,40]],4);
    for(let i=0;i<400;i++){const x=rand(x0,x1),z=rand(9,38);D.circle(x,.02,z,rand(.03,.09),2,'xz',5);}
    for(let i=0;i<120;i++)grassTuft(D,rand(x0,x1),rand(30,40));
    for(let i=0;i<10;i++){const x=rand(x0+10,x1-10),z=rand(14,30);D.stroke([x,0,z],[x,2.2,z],0);D.face([[x-1.4,2.2,z],[x+1.4,2.2,z],[x,2.6,z]],4);D.path([[x-1.4,2.2,z],[x+1.4,2.2,z],[x,2.6,z]],1,true);D.face([[x-.8,.03,z+1],[x+.8,.03,z+1],[x+.8,.03,z+2.4],[x-.8,.03,z+2.4]],3);}
    zone(x0,8,x1,40);
  }
  // piers
  for(const px of [-200,260]){
    D.box(px,-.1,40,10,.2,64,true,1);for(let z=10;z<72;z+=1.2)D.line([px-5,.02,z],[px+5,.02,z],2);
    rail(D,[px-4.8,.1,10],[px-4.8,.1,72],1,3);rail(D,[px+4.8,.1,10],[px+4.8,.1,72],1,3);
    for(let z=14;z<70;z+=10){bollard(D,px-4,z);bollard(D,px+4,z);crate(D,px+rand(-3,3),z+rand(-2,2),rand(.5,.8));}
    zone(px-5,8,px+5,72);
  }
  // breakwater
  for(let x=80;x<220;x+=rand(2,4))rock(D,x,80,rand(1,2.5));
  D.finish();
})();

// ---------- sea ----------
(function sea(){
  const D=new Draft();
  for(let z=12;z<270;z+=rand(3,6)){
    for(let x=-540;x<540;x+=rand(8,16)){
      if(z<40&&((x>-440&&x<-120)||(x>120&&x<440)))continue;
      const len=rand(3,10),pts=[];for(let q=0;q<=6;q++){const xx=x+q/6*len;pts.push([xx,-2.5,z+Math.sin(xx*.2+z)*.6]);}D.path(pts,z>120?2:rand()<.2?1:2);
    }
  }
  for(let i=0;i<40;i++){const x=rand(-500,500),z=rand(40,250);D.cylinder(x,-2,z,.3,.3,.8,8,false,3);D.stroke([x,-1.2,z],[x,-.4,z],1);D.face([[x,-.4,z],[x+.6,-.2,z],[x,-.1,z]],3);}
  // islands
  for(const [ix,iz,r] of [[320,180,34],[-340,170,28]]){
    const pts=[];for(let i=0;i<=30;i++){const a=i/30*TAU;pts.push([ix+Math.cos(a)*r*rand(.85,1.1),-2.4,iz+Math.sin(a)*r*rand(.85,1.1)]);}D.face(pts,0);D.path(pts,1,true);
    for(let i=0;i<18;i++)tree(D,ix+rand(-r*.6,r*.6),iz+rand(-r*.6,r*.6),rand(.7,1.2),true);
    D.box(ix,0,iz,5,4,6,true,0);roof(D,ix,4,iz,5,6,2);D.stroke([ix,6,iz],[ix,8,iz],0);
  }
  D.finish();
})();
// more boats
sailboat(-180,50,6,.4);sailboat(240,60,7,-.6);sailboat(360,120,8,.2);sailboat(-320,140,6,1.2);sailboat(80,180,9,-.3);sailboat(-80,220,7,.8);sailboat(420,200,6,-1.1);sailboat(-460,90,5,.5);

// ---------- living water: displaced waves, sun glint, fresnel ----------
const waterUniforms = {
  uTime:{value:0},
  uSun:{value:new THREE.Vector3(.5,.75,.35).normalize()},
  uDeep:{value:new THREE.Color(0x647f82)},
  uShallow:{value:new THREE.Color(0xa3b7b1)},
  uSky:{value:new THREE.Color(0xf3f0e7)},
  uInk:{value:new THREE.Color(0x46585a)}
};
const waterMat = new THREE.ShaderMaterial({
  uniforms:waterUniforms, transparent:true, side:THREE.DoubleSide,
  vertexShader:`
    uniform float uTime; varying vec3 vW; varying vec3 vN; varying float vH;
    float wave(vec2 p, vec2 d, float f, float a, float s){return a*sin(dot(p,d)*f+uTime*s);}
    void main(){
      vec3 pos=position;
      vec4 wp0=modelMatrix*vec4(position,1.);
      vec2 p=wp0.xz;
      float h=0.0;
      h+=wave(p,normalize(vec2(1.,.3)),.16,.22,1.1);
      h+=wave(p,normalize(vec2(-.4,1.)),.27,.13,1.7);
      h+=wave(p,normalize(vec2(.7,-.6)),.45,.07,2.3);
      h+=wave(p,normalize(vec2(-.9,-.2)),.8,.035,3.1);
      pos.y+=h; vH=h;
      float e=1.2;
      float hx=wave(p+vec2(e,0.),normalize(vec2(1.,.3)),.16,.22,1.1)+wave(p+vec2(e,0.),normalize(vec2(-.4,1.)),.27,.13,1.7)+wave(p+vec2(e,0.),normalize(vec2(.7,-.6)),.45,.07,2.3);
      float hz=wave(p+vec2(0.,e),normalize(vec2(1.,.3)),.16,.22,1.1)+wave(p+vec2(0.,e),normalize(vec2(-.4,1.)),.27,.13,1.7)+wave(p+vec2(0.,e),normalize(vec2(.7,-.6)),.45,.07,2.3);
      vN=normalize(vec3(h-hx,e,h-hz));
      vec4 wp=modelMatrix*vec4(pos,1.); vW=wp.xyz;
      gl_Position=projectionMatrix*viewMatrix*wp;
    }`,
  fragmentShader:`
    uniform vec3 uSun,uDeep,uShallow,uSky,uInk; uniform float uTime;
    varying vec3 vW; varying vec3 vN; varying float vH;
    void main(){
      vec3 N=normalize(vN);
      vec3 V=normalize(cameraPosition-vW);
      float fres=pow(1.-max(dot(N,V),0.),3.);
      vec3 col=mix(uDeep,uShallow,clamp(vH*1.6+.5,0.,1.));
      col=mix(col,uSky,fres*.55);
      vec3 H=normalize(uSun+V);
      float spec=pow(max(dot(N,H),0.),120.)*1.4;
      float glint=pow(max(dot(N,H),0.),600.)*2.2;
      col+=vec3(1.,.98,.9)*(spec+glint);
      float crest=smoothstep(.14,.28,vH);
      col=mix(col,vec3(.98,.98,.96),crest*.65);
      float trough=smoothstep(-.12,-.26,vH);
      col=mix(col,uDeep*.72,trough*.45);
      float ripple=sin(vW.x*.8+uTime*1.3)*sin(vW.z*.7-uTime*.9);
      col=mix(col,uInk,clamp(ripple,0.,1.)*.09);
      float contour=abs(fract(vH*7.0+uTime*.15)-.5);
      col=mix(col,uInk,smoothstep(.46,.5,contour)*.12);
      float dist=length(cameraPosition-vW);
      float fogF=smoothstep(70.,140.,dist);
      col=mix(col,uSky,fogF);
      gl_FragColor=vec4(col,.96*(1.-fogF*.5));
    }`
});
const waterGeo = new THREE.PlaneGeometry(1140,290,180,60);
waterGeo.rotateX(-Math.PI/2);
const water = new THREE.Mesh(waterGeo,waterMat);
water.position.set(0,-2.42,150);
water.renderOrder=1;
scene.add(water);

// ---------- countryside ----------
function field(D,x0,z0,x1,z1,type=0){
  D.face([[x0,.01,z0],[x1,.01,z0],[x1,.01,z1],[x0,.01,z1]],type===1?2:0);
  D.path([[x0,.02,z0],[x1,.02,z0],[x1,.02,z1],[x0,.02,z1]],2,true);
  if(type===0){for(let z=z0+1;z<z1;z+=1.4)D.stroke([x0+1,.03,z],[x1-1,.03,z],2);}
  else if(type===1){for(let x=x0+2;x<x1;x+=3)for(let z=z0+2;z<z1;z+=3){D.stroke([x,.02,z],[x,.8,z],1);D.circle(x,.9,z,.5,2,'xz',8);}}
  else{for(let x=x0+2;x<x1;x+=4){D.stroke([x,.02,z0+1],[x,.02,z1-1],2);for(let z=z0+2;z<z1;z+=2)D.line([x-.4,.4,z],[x+.4,.4,z],1);}}
}
function barn(D,x,z){D.box(x,0,z,14,6,20,true,3);D.face([[x-7,6,z-10],[x,9,z-10],[x+7,6,z-10],[x+7,6,z+10],[x,9,z+10],[x-7,6,z+10]],2);D.box(x,0,z+10.1,5,4,.2,true,1);obstacles.push({x,z,w:14.5,d:20.5});}
function silo(D,x,z){D.cylinder(x,0,z,3,3,12,16,false,1);D.cylinder(x,12,z,3,.2,3,16,true,1);for(let y=2;y<12;y+=2)D.circle(x,y,z,3.02,2,'xz',16);}
function windmill(D,x,z){D.cylinder(x,0,z,3,2,10,12,false,0);D.cylinder(x,10,z,2.2,.2,2,12,true,1);const a=rand(0,TAU);for(let i=0;i<4;i++){const aa=a+i*Math.PI/2;D.stroke([x,11,z],[x+Math.cos(aa)*6,11+Math.sin(aa)*6,z],0);D.face([[x,11,z],[x+Math.cos(aa)*6,11+Math.sin(aa)*6,z],[x+Math.cos(aa+.2)*5,11+Math.sin(aa+.2)*5,z]],1);}}
function tractor(D,x,z){D.box(x,.6,z,2.4,1,1.4,true,3);D.box(x-.6,1.6,z,1.2,1,1.2,true,0);D.circle(x-1,.4,z-.8,.6,0,'xy',12);D.circle(x-1,.4,z+.8,.6,0,'xy',12);D.circle(x+1,.4,z-.7,.35,0,'xy',10);D.circle(x+1,.4,z+.7,.35,0,'xy',10);}
function haystack(D,x,z){D.cylinder(x,0,z,1.6,.2,2.4,12,true,2);for(let i=0;i<12;i++)D.line([x+rand(-1,1),rand(0,2),z+rand(-1,1)],[x+rand(-1,1),rand(0,2),z+rand(-1,1)],2);}
(function countryside(){
  const D=new Draft();
  const fields=[[-440,-500,-260,-400,0],[-240,-500,-60,-420,1],[-40,-500,140,-430,2],[160,-500,360,-410,0],[380,-500,500,-420,1],[-440,-380,-300,-300,2],[-300,-380,-160,-300,0],[240,-380,420,-300,1]];
  fields.forEach(f=>field(D,...f));
  for(let i=0;i<10;i++){const x=rand(-460,460),z=rand(-500,-320);fence(D,x,z,x+rand(20,40),z,1);}
  barn(D,-380,-440);silo(D,-360,-440);windmill(D,200,-460);tractor(D,-320,-420);
  for(let i=0;i<14;i++)haystack(D,rand(-440,440),rand(-490,-340));
  for(let i=0;i<10;i++){const x=rand(-460,460),z=rand(-500,-330);building(D,x,z,8,9,2,2);enrichBuilding(D,x,z,8,9,2,2);}
  // forest
  for(let i=0;i<420;i++){const x=rand(-520,520),z=rand(-540,-380);if(Math.abs(x)<240&&z>-470)continue;tree(D,x,z,rand(.8,1.6),rand()<.4);}
  for(let i=0;i<200;i++){const x=rand(-520,520),z=rand(-540,-380);rock(D,x,z,rand(.3,1));}
  for(let i=0;i<300;i++)grassTuft(D,rand(-520,520),rand(-540,-380));
  // dirt paths
  for(let i=0;i<6;i++){const x=rand(-400,400);D.stroke([x,.03,-500],[x+rand(-40,40),.03,-340],2);D.stroke([x+2,.03,-500],[x+2+rand(-40,40),.03,-340],2);}
  D.finish();
})();

// ---------- distant mountains ----------
(function mountains(){
  const D=new Draft();
  for(let i=0;i<14;i++){
    const x=-540+i*84+rand(-20,20),h=rand(40,95),w=rand(70,130);
    const pts=[[-w/2,0],[ -w*.2,h*.55],[0,h],[w*.25,h*.6],[w/2,0]].map(p=>[x+p[0],p[1],-535]);
    D.face(pts,2);D.path(pts,1,false);
    for(let t=.2;t<.9;t+=.15){const y=h*t;D.stroke([x-w/2*(1-t),y,-534],[x+w/2*(1-t),y,-534],2);}
    if(h>70)D.path([[x-w*.1,h*.8,-533],[x,h,-533],[x+w*.12,h*.82,-533]],0);
  }
  D.finish();
})();

// ---------- clouds & birds ----------
(function sky(){
  const D=new Draft();
  for(let i=0;i<26;i++){
    const x=rand(-520,520),z=rand(-520,240),y=rand(55,110),s=rand(6,16);
    for(let l=0;l<3;l++){const pts=[];for(let q=0;q<=20;q++){const a=q/20*TAU;pts.push([x+Math.cos(a)*s*rand(.8,1.2),y+Math.sin(a)*s*.35+rand(-1,1),z+Math.sin(a)*s*.3]);}D.path(pts,2,true);}
  }
  D.finish();
})();
for(let i=0;i<36;i++){
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute([-1,0,0,-.45,.23,0,-.45,.23,0,0,0,0,0,0,0,.48,.25,.03,.48,.25,.03,1.05,.08,.06],3));
  const b=new THREE.LineSegments(g,lineMaterials[1]);b.position.set(rand(-500,500),rand(24,70),rand(-500,240));b.visible=false;root.add(b);birds.push({obj:b,x:b.position.x,z:b.position.z,phase:rand(0,TAU),speed:rand(.6,1.1)});
}

// ---------- micro detail scatter ----------
(function micro(){
  const D=new Draft();
  for(let i=0;i<120000;i++){
    const x=rand(-520,520),z=rand(-520,8);
    if(x>-70&&x<60&&z>-66&&z<6)continue;
    const t=rand();
    if(t<.45)grassTuft(D,x,z);
    else if(t<.7){D.circle(x,.02,z,rand(.02,.07),2,'xz',5);}
    else if(t<.85){D.line([x,.021,z],[x+rand(-.4,.4),.021,z+rand(-.4,.4)],2);}
    else{D.line([x,.022,z],[x+rand(-.15,.15),.022,z+rand(.2,.6)],2);D.line([x+rand(-.1,.1),.022,z+rand(.1,.3)],[x+rand(-.2,.2),.022,z+rand(.3,.7)],2);}
  }
  D.finish();
})();

// street furniture along the new roads
(function streetLife(){
  const D=new Draft();
  hRoads.forEach(z=>{for(let x=-420;x<430;x+=28){if(Math.abs(x)<70&&z>-80)continue;lamp(D,x,z-6,5);if(rand()<.5)tree(D,x+10,z+6,rand(.8,1.1),false);if(rand()<.3)bin(D,x+4,z-6);if(rand()<.2)person(D,x+rand(-6,6),z+rand(-4,4),Math.floor(rand(0,3)));}});
  vRoads.forEach(x=>{for(let z=-490;z<0;z+=30){if(Math.abs(x)<70&&z>-80)continue;lamp(D,x-6,z,5);if(rand()<.4)tree(D,x+6,z+10,rand(.8,1.1),true);if(rand()<.2)hydrant(D,x-6,z+6);}});
  for(let x=-400;x<420;x+=120)busStop(D,x,-64);
  for(let x=-380;x<400;x+=160)trafficLight(D,x,-70);
  for(let x=-420;x<440;x+=200)billboard(D,x,-30,['MESTO','OBALA','GOZD','TRŽNICA'][Math.floor(rand(0,4))]);
  D.finish();
})();

// Spatial pencil streaming: the city is baked into small paper tiles.
// A tile only receives ink when the walker is close; distant tiles stay blank.
const TILE=16, TILE_MIN=-36, TILE_MAX=35;
const DRAW_RADIUS=52, CULL_RADIUS=62, EYE=1.72;
const inkTiles=[], tileMap=new Map();
const lineDelay=[0,.12,.32,.2];
function tileAt(cx,cz){
  if(cx<TILE_MIN||cx>TILE_MAX||cz<TILE_MIN||cz>TILE_MAX)return null;
  const key=cx+','+cz;
  if(tileMap.has(key))return tileMap.get(key);
  const group=new THREE.Group();group.visible=false;root.add(group);
  const hash=((cx*73856093)^(cz*19349663))>>>0;
  const t={cx,cz,group,minX:cx*TILE,maxX:(cx+1)*TILE,minZ:cz*TILE,maxZ:(cz+1)*TILE,
    segments:[[],[],[],[]],faces:[[],[],[],[],[],[]],lineMeshes:[],fillMeshes:[],
    state:0,progress:0,start:0,duration:1050+(hash%520)};
  tileMap.set(key,t);inkTiles.push(t);return t;
}
function clipPoly(poly,axis,bound,greater){
  const out=[],n=poly.length;
  for(let i=0;i<n;i++){
    const a=poly[i],b=poly[(i+1)%n];
    const ai=axis==='x'?a[0]:a[2],bi=axis==='x'?b[0]:b[2];
    const ain=greater?ai>=bound:ai<=bound,bin=greater?bi>=bound:bi<=bound;
    if(ain){out.push(a);if(!bin){const t=(bound-ai)/(bi-ai);out.push([a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t,a[2]+(b[2]-a[2])*t]);}}
    else if(bin){const t=(bound-ai)/(bi-ai);out.push([a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t,a[2]+(b[2]-a[2])*t]);}
  }
  return out;
}
function bakeDraft(d,draftIndex){
  d.group.updateMatrixWorld(true);
  const mat=d.group.matrixWorld,v=new THREE.Vector3();
  d.lines.forEach(l=>{
    const kind=lineMaterials.indexOf(l.material),pos=l.geometry.attributes.position;
    for(let i=0;i<pos.count;i+=2){
      v.fromBufferAttribute(pos,i).applyMatrix4(mat);const ax=v.x,ay=v.y,az=v.z;
      v.fromBufferAttribute(pos,i+1).applyMatrix4(mat);const bx=v.x,by=v.y,bz=v.z;
      const len=Math.hypot(bx-ax,bz-az),steps=Math.max(1,Math.ceil(len/(TILE*.7)));
      for(let s=0;s<steps;s++){
        const t0=s/steps,t1=(s+1)/steps;
        const sx=ax+(bx-ax)*t0,sy=ay+(by-ay)*t0,sz=az+(bz-az)*t0;
        const ex=ax+(bx-ax)*t1,ey=ay+(by-ay)*t1,ez=az+(bz-az)*t1;
        const t=tileAt(Math.floor(((sx+ex)/2)/TILE),Math.floor(((sz+ez)/2)/TILE));
        if(t)t.segments[kind].push(sx,sy,sz,ex,ey,ez,draftIndex*1000000000+i/2+t0);
      }
    }
  });
  d.meshes.forEach(m=>{
    const kind=fillMaterials.indexOf(m.material),pos=m.geometry.attributes.position;
    for(let i=0;i<pos.count;i+=3){
      const p=[];
      for(let j=0;j<3;j++){v.fromBufferAttribute(pos,i+j).applyMatrix4(mat);p.push([v.x,v.y,v.z]);}
      const minX=Math.min(p[0][0],p[1][0],p[2][0]),maxX=Math.max(p[0][0],p[1][0],p[2][0]);
      const minZ=Math.min(p[0][2],p[1][2],p[2][2]),maxZ=Math.max(p[0][2],p[1][2],p[2][2]);
      const cx0=Math.max(TILE_MIN,Math.floor(minX/TILE)),cx1=Math.min(TILE_MAX,Math.floor(maxX/TILE));
      const cz0=Math.max(TILE_MIN,Math.floor(minZ/TILE)),cz1=Math.min(TILE_MAX,Math.floor(maxZ/TILE));
      for(let cx=cx0;cx<=cx1;cx++)for(let cz=cz0;cz<=cz1;cz++){
        const t=tileAt(cx,cz);if(!t)continue;
        let poly=clipPoly(p,'x',cx*TILE,true);
        poly=clipPoly(poly,'x',(cx+1)*TILE,false);
        poly=clipPoly(poly,'z',cz*TILE,true);
        poly=clipPoly(poly,'z',(cz+1)*TILE,false);
        if(poly.length<3)continue;
        for(let q=1;q<poly.length-1;q++)t.faces[kind].push(...poly[0],...poly[q],...poly[q+1]);
      }
    }
  });
  if(d.group.parent)d.group.parent.remove(d.group);
  d.lines.forEach(l=>l.geometry.dispose());d.meshes.forEach(m=>m.geometry.dispose());
  d.lines=[];d.meshes=[];
}
drafts.forEach((d,i)=>{if(!d.dynamic)bakeDraft(d,i);});
inkTiles.forEach(t=>{
  t.segments.forEach((arr,k)=>{
    if(!arr.length)return;
    const n=arr.length/7,idx=Array.from({length:n},(_,i)=>i);
    idx.sort((a,b)=>arr[a*7+6]-arr[b*7+6]);
    const positions=new Float32Array(n*6);
    for(let i=0;i<n;i++){const o=idx[i]*7;for(let j=0;j<6;j++)positions[i*6+j]=arr[o+j];}
    const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.BufferAttribute(positions,3));
    const l=new THREE.LineSegments(g,lineMaterials[k]);l.renderOrder=2;t.group.add(l);t.lineMeshes[k]=l;
  });
  t.faces.forEach((arr,k)=>{
    if(!arr.length)return;
    const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(arr,3));g.computeVertexNormals();
    const mat=fillMaterials[k].clone();mat.transparent=true;mat.opacity=0;mat.depthWrite=false;
    const m=new THREE.Mesh(g,mat);m.receiveShadow=true;t.group.add(m);t.fillMeshes.push(m);
  });
  t.segments=null;t.faces=null;
});
function tileDistance(t,x,z){const dx=Math.max(t.minX-x,0,x-t.maxX),dz=Math.max(t.minZ-z,0,z-t.maxZ);return Math.hypot(dx,dz);}
function smooth(v){return v*v*(3-2*v);}

// First-person walk. No menus: land on the quay, then the pencil follows you.
let width=innerWidth,height=innerHeight,landed=false,inkEpoch=0;
const keys=new Set();
const walkPosition=new THREE.Vector3(-6,EYE,3.8);
let walkYaw=Math.PI,walkPitch=.04;
let dragging=false,lastX=0,lastY=0,pointerId=null;
let joystick={x:0,y:0},moveTouch=null,lookTouch=null;
const prefersReduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
const landing={
  start:performance.now(),duration:prefersReduced?80:2800,
  from:new THREE.Vector3(3,27,19),fromLook:new THREE.Vector3(-6,0,-12),
  to:walkPosition.clone(),toLook:new THREE.Vector3(-6,2.05,-28)
};
camera.fov=52;camera.position.copy(landing.from);camera.lookAt(landing.fromLook);camera.updateProjectionMatrix();
function resize(){width=innerWidth;height=innerHeight;renderer.setSize(width,height,false);camera.aspect=width/height;camera.updateProjectionMatrix();}
addEventListener('resize',resize);resize();

const OB_CELL=24;let obGrid=null;
function buildObGrid(){
  obGrid=new Map();
  for(const o of obstacles){
    const x0=Math.floor((o.x-o.w/2-.4)/OB_CELL),x1=Math.floor((o.x+o.w/2+.4)/OB_CELL);
    const z0=Math.floor((o.z-o.d/2-.4)/OB_CELL),z1=Math.floor((o.z+o.d/2+.4)/OB_CELL);
    for(let cx=x0;cx<=x1;cx++)for(let cz=z0;cz<=z1;cz++){const k=cx+','+cz;if(!obGrid.has(k))obGrid.set(k,[]);obGrid.get(k).push(o);}
  }
}
function canWalk(x,z){
  if(x<-520||x>520||z<-520||z>270)return false;
  if(z>8){
    let ok=inZone(x,z);
    if(!ok&&x>42&&x<52&&z<35)ok=true;
    if(!ok&&Math.hypot(x-47,z-35)<7.25)ok=true;
    if(!ok)return false;
  }
  if(!obGrid)buildObGrid();
  const cx=Math.floor(x/OB_CELL),cz=Math.floor(z/OB_CELL);
  for(let dx=-1;dx<=1;dx++)for(let dz=-1;dz<=1;dz++){
    const list=obGrid.get((cx+dx)+','+(cz+dz));if(!list)continue;
    for(const o of list)if(Math.abs(x-o.x)<o.w/2+.28&&Math.abs(z-o.z)<o.d/2+.28)return false;
  }
  return true;
}
function updateInput(dt,time){
  const forward=(keys.has('KeyW')||keys.has('ArrowUp')?1:0)-(keys.has('KeyS')||keys.has('ArrowDown')?1:0)-joystick.y;
  const strafe=(keys.has('KeyD')||keys.has('ArrowRight')?1:0)-(keys.has('KeyA')||keys.has('ArrowLeft')?1:0)+joystick.x;
  const speed=(keys.has('ShiftLeft')||keys.has('ShiftRight')?8.2:4.2)*dt,n=Math.max(1,Math.hypot(forward,strafe));
  const dx=(Math.sin(walkYaw)*forward-Math.cos(walkYaw)*strafe)*speed/n;
  const dz=(Math.cos(walkYaw)*forward+Math.sin(walkYaw)*strafe)*speed/n;
  if(canWalk(walkPosition.x+dx,walkPosition.z))walkPosition.x+=dx;
  if(canWalk(walkPosition.x,walkPosition.z+dz))walkPosition.z+=dz;
  const moving=Math.abs(forward)+Math.abs(strafe)>.1;
  camera.position.set(walkPosition.x,walkPosition.y+(moving?Math.sin(time*.009)*.028:0),walkPosition.z);
  camera.lookAt(camera.position.x+Math.sin(walkYaw)*Math.cos(walkPitch),camera.position.y+Math.sin(walkPitch),camera.position.z+Math.cos(walkYaw)*Math.cos(walkPitch));
}
function updateInk(now,dt){
  if(!landed)return;
  const px=walkPosition.x,pz=walkPosition.z,initial=now-inkEpoch<80;
  for(const t of inkTiles){
    const dist=tileDistance(t,px,pz);
    if(dist>DRAW_RADIUS){
      if(t.state===1)t.start+=dt*1000;
      t.group.visible=t.state===2&&dist<CULL_RADIUS;
      continue;
    }
    if(t.state===0){t.state=1;t.start=now+(initial?dist*20:0);}
    const p=clamp((now-t.start)/t.duration,0,1);t.progress=p;
    t.group.visible=p>0;
    if(p<=0)continue;
    for(let k=0;k<t.lineMeshes.length;k++){
      const l=t.lineMeshes[k];if(!l)continue;
      const lp=clamp((p-lineDelay[k])/(1-lineDelay[k]),0,1);
      const count=l.geometry.attributes.position.count;
      l.geometry.setDrawRange(0,Math.floor(count*lp/2)*2);
    }
    const fp=smooth(clamp((p-.5)/.45,0,1));
    t.fillMeshes.forEach(m=>{m.material.opacity=fp;m.material.depthWrite=fp>.985;m.visible=fp>0;});
    if(p>=1)t.state=2;
  }
  boats.forEach(b=>{
    const dist=Math.hypot(b.x-px,b.z-pz),d=b.draft;
    if(dist>DRAW_RADIUS+6){b.group.visible=false;return;}
    if(b.started===null)b.started=now;
    const p=clamp((now-b.started)/1400,0,1);b.group.visible=p>0;
    d.lines.forEach((l,i)=>{const lp=clamp((p-lineDelay[i])/(1-lineDelay[i]),0,1);const count=l.geometry.attributes.position.count;l.geometry.setDrawRange(0,Math.floor(count*lp/2)*2);});
    d.meshes.forEach(m=>m.visible=p>.55);
  });
  signs.forEach(s=>{const dist=Math.hypot(s.x-px,s.z-pz),op=clamp((DRAW_RADIUS-dist)/8,0,1);s.mesh.visible=op>0;s.mesh.material.opacity=op;});
  birds.forEach(b=>{b.obj.visible=Math.hypot(b.x-px,b.z-pz)<DRAW_RADIUS;});
}

canvas.addEventListener('pointerdown',e=>{
  canvas.focus({preventScroll:true});
  if(e.pointerType==='touch'){
    if(e.clientX<width*.45&&moveTouch===null)moveTouch={id:e.pointerId,ox:e.clientX,oy:e.clientY};
    else if(lookTouch===null)lookTouch={id:e.pointerId,x:e.clientX,y:e.clientY};
    try{canvas.setPointerCapture(e.pointerId);}catch(_){}
    e.preventDefault();return;
  }
  if(e.button>1)return;
  dragging=true;pointerId=e.pointerId;lastX=e.clientX;lastY=e.clientY;
  try{canvas.setPointerCapture(e.pointerId);}catch(_){}
});
canvas.addEventListener('pointermove',e=>{
  if(e.pointerType==='touch'){
    if(moveTouch&&e.pointerId===moveTouch.id){
      const dx=e.clientX-moveTouch.ox,dy=e.clientY-moveTouch.oy,l=Math.max(1,Math.hypot(dx,dy)/58);
      joystick.x=dx/l/58;joystick.y=dy/l/58;
    }else if(lookTouch&&e.pointerId===lookTouch.id){
      const dx=e.clientX-lookTouch.x,dy=e.clientY-lookTouch.y;lookTouch.x=e.clientX;lookTouch.y=e.clientY;
      walkYaw-=dx*.0042;walkPitch=clamp(walkPitch-dy*.0033,-1.12,1.2);
    }
    return;
  }
  if(!dragging||e.pointerId!==pointerId)return;
  const dx=e.clientX-lastX,dy=e.clientY-lastY;lastX=e.clientX;lastY=e.clientY;
  walkYaw-=dx*.0042;walkPitch=clamp(walkPitch-dy*.0033,-1.12,1.2);
});
function endPointer(e){
  if(moveTouch&&e.pointerId===moveTouch.id){moveTouch=null;joystick.x=0;joystick.y=0;}
  if(lookTouch&&e.pointerId===lookTouch.id)lookTouch=null;
  if(dragging&&e.pointerId===pointerId){dragging=false;pointerId=null;}
  try{canvas.releasePointerCapture(e.pointerId);}catch(_){}
}
canvas.addEventListener('pointerup',endPointer);canvas.addEventListener('pointercancel',endPointer);
canvas.addEventListener('contextmenu',e=>e.preventDefault());
canvas.addEventListener('dblclick',()=>{try{if(document.pointerLockElement!==canvas&&canvas.requestPointerLock)canvas.requestPointerLock();}catch(_){}});
document.addEventListener('mousemove',e=>{if(document.pointerLockElement===canvas){walkYaw-=e.movementX*.0032;walkPitch=clamp(walkPitch-e.movementY*.003,-1.12,1.2);}});
window.addEventListener('keydown',e=>{
  if(['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Space'].includes(e.code))e.preventDefault();
  keys.add(e.code);
});
window.addEventListener('keyup',e=>keys.delete(e.code));
window.addEventListener('blur',()=>{keys.clear();dragging=false;moveTouch=null;lookTouch=null;joystick.x=0;joystick.y=0;});

let lastTime=performance.now();
function animate(now){
  requestAnimationFrame(animate);
  const dt=Math.min((now-lastTime)/1000,.05);lastTime=now;
  if(!landed){
    const t=clamp((now-landing.start)/landing.duration,0,1),e=1-Math.pow(1-t,3);
    camera.position.lerpVectors(landing.from,landing.to,e);
    const look=new THREE.Vector3().lerpVectors(landing.fromLook,landing.toLook,e);
    camera.lookAt(look);camera.fov=mix(52,68,e);camera.updateProjectionMatrix();
    if(t>=1){
      landed=true;inkEpoch=now;walkPosition.copy(landing.to);
      const d=landing.toLook.clone().sub(landing.to).normalize();
      walkYaw=Math.atan2(d.x,d.z);walkPitch=Math.asin(d.y);
    }
  }else{
    if(!window.__pencilWorld||window.__pencilWorld.control.enabled)updateInput(dt,now);
    updateInk(now,dt);
    if(window.__pencilGame&&window.__pencilGame.update)window.__pencilGame.update(dt,now);
  }
  waterUniforms.uTime.value=now*.001;
  // Keep the sun's shadow frustum centred on the player so shadows work everywhere.
  const fp=camera.position;
  sun.position.set(fp.x+60,90,fp.z+35);
  sun.target.position.set(fp.x,0,fp.z);
  boats.forEach(b=>{if(!b.group.visible)return;b.group.rotation.z=Math.sin(now*.0005+b.phase)*.018;b.group.position.y=-2.35+Math.sin(now*.0007+b.phase)*.055;});
  birds.forEach(b=>{if(!b.obj.visible)return;b.obj.position.x=b.x+Math.sin(now*.000085*b.speed+b.phase)*9;b.obj.position.z=b.z+Math.cos(now*.00009*b.speed+b.phase)*6;b.obj.rotation.y=Math.cos(now*.000085*b.speed+b.phase)*.5;b.obj.scale.y=1+Math.sin(now*.0019+b.phase)*.25;});
  renderer.render(scene,camera);
}
function waterHeight(x,z,t){
  const w=(dx,dz,f,a,s)=>a*Math.sin((x*dx+z*dz)*f+t*s);
  const n1=1/Math.hypot(1,.3),n2=1/Math.hypot(-.4,1),n3=1/Math.hypot(.7,-.6),n4=1/Math.hypot(-.9,-.2);
  return -2.42 + w(n1,.3*n1,.16,.22,1.1)+w(-.4*n2,n2,.27,.13,1.7)+w(.7*n3,-.6*n3,.45,.07,2.3)+w(-.9*n4,-.2*n4,.8,.035,3.1);
}
window.__pencilWorld={scene,camera,renderer,obstacles,root,canvas,keys,lineMaterials,fillMaterials,walkZones,
  walkPosition,EYE,control:{enabled:true},sun,water,waterHeight,
  get walkYaw(){return walkYaw},set walkYaw(v){walkYaw=v},
  get walkPitch(){return walkPitch},set walkPitch(v){walkPitch=v},
  canWalk:(x,z)=>canWalk(x,z),
  invalidateObstacles(){obGrid=null;},
  isLand:(x,z)=>z<=8||inZone(x,z)||(x>42&&x<52&&z<35)||Math.hypot(x-47,z-35)<7.25,
  get strokes(){return totalStrokes},get landed(){return landed},get tiles(){return inkTiles.length},
  get position(){return walkPosition.clone()},
  teleport(x,z){walkPosition.set(x,EYE,z);},
  get drawnTiles(){return inkTiles.filter(t=>t.state===2).length}};
requestAnimationFrame(animate);
})();
