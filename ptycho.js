(() => {
  'use strict';
  const $=id=>document.getElementById(id),panel=$('panel-ptycho');
  const scan=$('ptycho-scan-canvas').getContext('2d'),diffraction=$('ptycho-diffraction-canvas').getContext('2d'),recon=$('ptycho-recon-canvas').getContext('2d');
  const reduced=matchMedia('(prefers-reduced-motion: reduce)');
  const canvas=size=>{const c=document.createElement('canvas');c.width=c.height=size;return c;};
  const reference=canvas(300),ref=reference.getContext('2d'),sample=canvas(128),coarse=canvas(12),initial=canvas(128),image=canvas(128),pattern=canvas(32);
  const passes=40;
  let model,running=false,frame=0,lastTime=0,credit=0,showInitial=false,order=[],orderPass=-1;
  function line(c,x1,y1,x2,y2,colour,width=1){c.beginPath();c.moveTo(x1,y1);c.lineTo(x2,y2);c.strokeStyle=colour;c.lineWidth=width;c.stroke();}
  function text(c,value,x,y,colour='#aac7c5',size=11){c.font=`${size}px system-ui`;c.fillStyle=colour;c.fillText(value,x,y);}
  // Synthetic amplitude test specimen: progressively finer line pairs.
  ref.fillStyle='#182630';ref.fillRect(0,0,300,300);
  for(let x=20;x<300;x+=20){line(ref,x,0,x,300,'#26353d');line(ref,0,x,300,x,'#26353d');}
  [18,12,8,5].forEach((pitch,group)=>{
    const x0=30+(group%2)*132,y0=30+Math.floor(group/2)*135;
    ref.fillStyle='#c5ced0';for(let i=0;i<5;i++)ref.fillRect(x0+i*pitch,y0,pitch/2,76);
    ref.fillStyle='#7b9198';for(let i=0;i<4;i++)ref.fillRect(x0,y0+87+i*5,83,2);
  });
  for(const [x,y] of [[15,15],[285,15],[15,285],[285,285]]){line(ref,x-6,y,x+6,y,'#e3e8e8',2);line(ref,x,y-6,x,y+6,'#e3e8e8',2);}
  sample.getContext('2d').drawImage(reference,0,0,128,128);
  coarse.getContext('2d').drawImage(reference,0,0,12,12);
  initial.getContext('2d').drawImage(coarse,0,0,128,128);
  const amplitudes=c=>{const p=c.getContext('2d').getImageData(0,0,128,128).data;return Float64Array.from({length:128*128},(_,i)=>p[i*4]/255);};
  const truth=amplitudes(sample),starting=amplitudes(initial);
  function drawScan() {
    scan.drawImage(reference,0,0);scan.fillStyle='#0b243080';scan.fillRect(0,0,300,300);
    const factor=300/128,radius=16*factor;
    model.positions.slice(0,model.acquired).forEach(pos=>{
      scan.beginPath();scan.arc((pos.x+16)*factor,(pos.y+16)*factor,radius,0,Math.PI*2);
      scan.strokeStyle='#99cec62f';scan.lineWidth=1;scan.stroke();
    });
    if(model.lastPattern>=0){
      const pos=model.positions[model.lastPattern],x=(pos.x+16)*factor,y=(pos.y+16)*factor;
      scan.beginPath();scan.arc(x,y,radius,0,Math.PI*2);scan.fillStyle='#d8f28d20';scan.fill();scan.strokeStyle='#d8f28d';scan.lineWidth=2;scan.stroke();
      line(scan,x-6,y,x+6,y,'#e7f7b7',1.5);line(scan,x,y-6,x,y+6,'#e7f7b7',1.5);
    }
  }
  function drawDiffraction() {
    diffraction.fillStyle='#080f17';diffraction.fillRect(0,0,300,300);
    if(model.lastPattern<0){text(diffraction,'Awaiting acquisition',78,150);return;}
    const values=model.patterns[model.lastPattern],pc=pattern.getContext('2d'),pixels=pc.createImageData(32,32);
    const maximum=Math.log1p(Math.max(...values)**2);
    for(let y=0;y<32;y++)for(let x=0;x<32;x++) {
      const i=y*32+x,j=(((y+16)%32)*32+(x+16)%32)*4,t=Math.log1p(values[i]**2)/maximum;
      pixels.data[j]=10+230*t;pixels.data[j+1]=18+207*t;pixels.data[j+2]=30+130*t;pixels.data[j+3]=255;
    }
    pc.putImageData(pixels,0,0);diffraction.imageSmoothingEnabled=false;diffraction.drawImage(pattern,24,24,252,252);
    text(diffraction,'log(1 + diffraction intensity)',32,294,'#b8c5cc',10);
  }
  function drawReconstruction() {
    const values=showInitial?starting:model.amplitude(),ic=image.getContext('2d'),pixels=ic.createImageData(128,128);
    for(let i=0;i<values.length;i++) {
      const v=Math.max(0,Math.min(1,values[i]));
      pixels.data[i*4]=v*255;pixels.data[i*4+1]=v*250+5;pixels.data[i*4+2]=v*245+10;pixels.data[i*4+3]=255;
    }
    ic.putImageData(pixels,0,0);recon.imageSmoothingEnabled=true;recon.drawImage(image,0,0,300,300);
    recon.fillStyle='#0b2732df';recon.fillRect(9,9,showInitial||!model.updates?145:155,23);
    text(recon,showInitial||!model.updates?'COARSE INITIAL ESTIMATE':'RECOVERED AMPLITUDE',17,25,'#ddf3da',10);
    $('ptycho-recon-canvas').setAttribute('aria-label',showInitial?'Low-resolution starting estimate of the synthetic specimen':`Live reconstructed amplitude after ${model.updates} object updates from simulated diffraction data`);
  }
  function draw() {
    drawScan();drawDiffraction();drawReconstruction();
    const count=model.positions.length,complete=model.updates>=count*passes;
    const refining=model.updates>=count,pass=Math.max(0,Math.min(passes-1,Math.floor(model.updates/count)-1));
    $('ptycho-positions').textContent=`${model.acquired} / ${count}`;
    $('ptycho-pass').textContent=refining?`${pass} / ${passes-1}`:'—';
    $('ptycho-error').textContent=model.passError===null?'—':`${(model.passError*100).toFixed(2)}%`;
    $('ptycho-progress').value=model.updates/(count*passes)*100;
    $('ptycho-progress').setAttribute('aria-valuetext',`${model.acquired} patterns acquired; ${pass} refinement passes completed`);
    $('ptycho-status').textContent=complete?'Reconstruction complete':!model.updates?'Coarse initial estimate':!running?'Reconstruction paused':refining?'Refining object estimate':'Acquiring + reconstructing';
    $('run-ptycho').textContent=running?'Pause reconstruction':complete?'Replay reconstruction':model.updates?'Resume reconstruction':'Run reconstruction';
    $('run-ptycho').setAttribute('aria-pressed',String(running));
    document.querySelectorAll('[data-ptycho-stage]').forEach((el,i)=>{const current=!model.updates?0:refining?2:1;el.classList.toggle('active',i===current);el.classList.toggle('done',i<current||complete);});
  }
  function pause(){running=false;cancelAnimationFrame(frame);draw();}
  function reset() {
    running=false;cancelAnimationFrame(frame);credit=0;lastTime=0;orderPass=-1;showInitial=false;
    model=new PtychoModel(truth,starting,Number($('overlap-range').value));
    $('ptycho-compare').setAttribute('aria-pressed','false');$('ptycho-compare').textContent='Show starting estimate';draw();
  }
  function nextUpdate() {
    const count=model.positions.length,pass=Math.floor(model.updates/count);
    if(pass!==orderPass){
      order=Array.from({length:count},(_,i)=>i);orderPass=pass;
      // Deterministic shuffle avoids retracing the same raster during refinement.
      if(pass){let seed=pass*7919;for(let i=count-1;i>0;i--){seed=(Math.imul(seed,1664525)+1013904223)>>>0;const j=seed%(i+1);[order[i],order[j]]=[order[j],order[i]];}}
    }
    model.update(order[model.updates%count]);
  }
  function tick(now) {
    if(!running)return;
    const count=model.positions.length,pass=Math.floor(model.updates/count),speed=Number($('ptycho-speed').value);
    const elapsed=lastTime?Math.min(100,now-lastTime):16;lastTime=now;
    // Spend six seconds on acquisition and seven on refinement at normal speed.
    credit+=elapsed*(pass?count*(passes-1)/7000:count/6000)*speed;
    const deadline=performance.now()+9;
    while((credit>=1||reduced.matches)&&model.updates<count*passes&&performance.now()<deadline){nextUpdate();credit=Math.max(0,credit-1);}
    const complete=model.updates>=count*passes;
    if(complete)running=false;
    if(!reduced.matches||complete)draw();
    if(running)frame=requestAnimationFrame(tick);
  }
  $('run-ptycho').addEventListener('click',()=>{
    if(running){pause();return;}
    if(model.updates>=model.positions.length*passes)reset();
    showInitial=false;$('ptycho-compare').setAttribute('aria-pressed','false');$('ptycho-compare').textContent='Show starting estimate';
    running=true;lastTime=0;draw();frame=requestAnimationFrame(tick);
  });
  $('reset-ptycho').addEventListener('click',reset);
  $('overlap-range').addEventListener('input',()=>{$('overlap-output').textContent=`${$('overlap-range').value}%`;reset();});
  $('ptycho-speed').addEventListener('input',()=>{$('ptycho-speed-output').textContent=`${$('ptycho-speed').value}×`;});
  $('ptycho-compare').addEventListener('click',()=>{showInitial=!showInitial;$('ptycho-compare').setAttribute('aria-pressed',String(showInitial));$('ptycho-compare').textContent=showInitial?'Show live reconstruction':'Show starting estimate';drawReconstruction();});
  new MutationObserver(()=>{if(panel.hidden&&running)pause();}).observe(panel,{attributes:true,attributeFilter:['hidden']});
  document.addEventListener('visibilitychange',()=>{if(document.hidden&&running)pause();});
  reset();
})();
