(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const panel = $('panel-xray'), scene = $('xray-scene'), plot = $('xray-reading-canvas');
  const ctx = scene.getContext('2d'), graph = plot.getContext('2d');
  const lime = '#d8f28d', aqua = '#84dfd0', orange = '#f5b888', muted = '#9bbdb7';
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  let mode = 'triangulation', single = false, yaw = .48, width = 650, height = 340;
  let plotWidth = 650, plotHeight = 180, faces = [], running = false, frame = 0, startTime = 0;
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const mix = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);
  const text = (c, value, x, y, colour = muted, size = 11, align = 'left') => {
    c.font = `${size}px system-ui, sans-serif`; c.fillStyle = colour; c.textAlign = align;
    c.fillText(value, x, y);
  };
  function line(c, a, b, colour, thickness = 1, dash = []) {
    c.beginPath(); c.moveTo(...a); c.lineTo(...b); c.strokeStyle = colour;
    c.lineWidth = thickness; c.setLineDash(dash); c.stroke(); c.setLineDash([]);
  }
  function project(p) {
    const x = p[0] * Math.cos(yaw) - p[2] * Math.sin(yaw);
    const z = p[0] * Math.sin(yaw) + p[2] * Math.cos(yaw);
    const tri = mode === 'triangulation';
    const scale = Math.min(width / 650, height / (tri ? 460 : 440));
    return [width / 2 + x * scale, height * (tri ? .43 : .53) + (z * Math.sin(.48) - p[1] * Math.cos(.48)) * scale, z * Math.cos(.48) + p[1] * Math.sin(.48)];
  }
  function path(points) {
    ctx.beginPath(); points.forEach((p, i) => { const q = project(p); i ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1]); }); ctx.closePath();
  }
  function face(points, fill, stroke = '#699c9b66', hole = null) {
    faces.push({ points, fill, stroke, hole, depth: points.reduce((n, p) => n + project(p)[2], 0) / points.length });
  }
  function paintFaces() {
    faces.sort((a, b) => a.depth - b.depth).forEach(f => {
      path(f.points);
      if (f.hole) { f.hole.forEach((p, i) => { const q = project(p); i ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1]); }); ctx.closePath(); }
      ctx.fillStyle = f.fill; ctx.fill('evenodd'); ctx.strokeStyle = f.stroke; ctx.lineWidth = 1; ctx.stroke();
    });
    faces = [];
  }
  function box(center, size, colour = '#294c58') {
    const p = [];
    for (const z of [-1, 1]) for (const y of [-1, 1]) for (const x of [-1, 1]) p.push(center.map((v, i) => v + [x, y, z][i] * size[i] / 2));
    [[0,1,3,2],[4,6,7,5],[0,4,5,1],[2,3,7,6],[0,2,6,4],[1,5,7,3]].forEach((indices, i) => face(indices.map(j => p[j]), colour, i % 2 ? '#82aaa080' : '#486e7480'));
  }
  function ray(a, b, colour, dash = []) { line(ctx, project(a).slice(0, 2), project(b).slice(0, 2), colour, 1.8, dash); }
  function dot(p, colour, radius = 4) {
    const q = project(p); ctx.beginPath(); ctx.arc(q[0], q[1], radius, 0, Math.PI * 2);
    ctx.fillStyle = colour; ctx.fill(); ctx.strokeStyle = '#e9f6e688'; ctx.lineWidth = 1; ctx.stroke();
  }
  function label(value, anchor, x, y, colour = muted, align = 'center') {
    const p = project(anchor);
    line(ctx, [x, y + 7], [p[0], p[1]], '#94b9b250', 1);
    const fontSize = width < 400 ? 10 : 11;
    ctx.font = `${fontSize}px system-ui, sans-serif`;
    const tw = ctx.measureText(value).width, left = align === 'center' ? x - tw / 2 : align === 'right' ? x - tw : x;
    ctx.fillStyle = '#102a33eb'; ctx.fillRect(left - 5, y - 13, tw + 10, 19);
    text(ctx, value, x, y, colour, fontSize, align);
  }
  function ringX(x, radius, n = 48) { return Array.from({ length: n }, (_, i) => [x, radius * Math.cos(i / n * Math.PI * 2), radius * Math.sin(i / n * Math.PI * 2)]); }
  function ringY(y, radius, n = 64) { return Array.from({ length: n }, (_, i) => [radius * Math.cos(i / n * Math.PI * 2), y, radius * Math.sin(i / n * Math.PI * 2)]); }
  function geometry() {
    const fraction = Number($('depth-range').value) / 100;
    const feature = [-35 + fraction * 70, 44 - fraction * 16, 0];
    const sources = [[-230, 85, -55], [-230, 85, 55]];
    const hits = sources.map(s => mix(s, feature, (215 - s[0]) / (feature[0] - s[0])));
    // Recover x from detector parallax, rather than copying the input slider.
    const disparity = hits[0][2] - hits[1][2];
    const reconstructedX = -230 + 445 / (1 + disparity / 110);
    return { fraction, feature, sources, hits, recovered: (reconstructedX + 35) / 70 };
  }
  function tgvScene(g) {
    const near = ringX(-35, 44), far = ringX(35, 28);
    face([[-35,-95,-90],[-35,95,-90],[-35,95,90],[-35,-95,90]], '#65a3af38', '#a3d6d4aa', near);
    face([[35,-95,-90],[35,95,-90],[35,95,90],[35,-95,90]], '#65a3af38', '#a3d6d4aa', far);
    for (const y of [-95, 95]) face([[-35,y,-90],[35,y,-90],[35,y,90],[-35,y,90]], '#6fa9b32b');
    for (const z of [-90, 90]) face([[-35,-95,z],[35,-95,z],[35,95,z],[-35,95,z]], '#6fa9b32b');
    for (let i = 0; i < near.length; i++) {
      const j = (i + 1) % near.length;
      face([near[i], near[j], far[j], far[i]], i < 24 ? '#8dd2cc15' : '#a0dadc29', '#87c9ca18');
    }
    face([[215,-140,-160],[215,140,-160],[215,140,160],[215,-140,160]], '#153e4be8', '#88b5b7');
    g.sources.forEach((s, i) => { if (!i || !single) box([s[0] - 15, s[1], s[2]], [36, 28, 28], i ? '#2e6566' : '#54684c'); });
    paintFaces();
    for (let z = -120; z <= 120; z += 40) ray([215,-140,z], [215,140,z], '#79aaa82c');
    for (let y = -120; y <= 120; y += 40) ray([215,y,-160], [215,y,160], '#79aaa82c');
    g.sources.forEach((s, i) => {
      if (i && single) return;
      const c = i ? aqua : lime;
      ray(s, g.feature, c); ray(g.feature, g.hits[i], c, [5, 4]);
      dot(s, c, 4); dot(g.hits[i], c, 5);
      const sourceLabel = project(s); text(ctx, i ? 'B' : 'A', sourceLabel[0] - 13, sourceLabel[1] - 12, c, 11);
      const p = project(g.hits[i]); text(ctx, i ? 'B' : 'A', p[0] + 8, p[1] - 6, c, 11);
    });
    if (single) {
      [.4, .52, .64].forEach(t => dot(mix(g.sources[0], g.hits[0], t), orange, 5));
    } else dot(g.feature, orange, 6);
    label(single ? 'Source · position A' : 'Source positions A / B', g.sources[0], width * .19, 34, lime);
    label('Glass substrate', [0,95,0], width * .51, 56);
    label('Area detector', [215,110,0], width * .82, 33, aqua);
    label(single ? 'Depth lies along one ray' : 'Via-wall feature', g.feature, width * .3, height - 27, orange);
    label('Through-glass via', [35,-28,0], width * .7, height - 27);
  }
  const wavelength = .15406, qc = .32;
  const qz = theta => 4 * Math.PI / wavelength * Math.sin(theta * Math.PI / 180);
  function reflectivity(q, sigma) {
    if (q <= qc) return 1;
    const qt = Math.sqrt(q * q - qc * qc);
    return ((q - qt) / (q + qt)) ** 2 * Math.exp(-q * qt * sigma * sigma);
  }
  function xrrScene(theta) {
    const angle = theta * Math.PI / 180, arm = 235;
    const source = [-arm * Math.cos(angle), arm * Math.sin(angle), 0];
    const detector = [arm * Math.cos(angle), arm * Math.sin(angle), 0];
    const top = ringY(0, 110), bottom = ringY(-7, 110);
    box([0,-35,0], [155,45,145], '#24434f');
    for (let i = 0; i < top.length; i++) { const j = (i + 1) % top.length; face([top[i],top[j],bottom[j],bottom[i]], '#5c8697'); }
    face(top, '#3e687eee', '#b4d1dc');
    box([source[0]-16,source[1],0], [35,32,35], '#315d66');
    box([detector[0]+10,detector[1],0], [24,44,44], '#54664e');
    paintFaces();
    // Source and detector remain at the true, equal grazing angles; no angle exaggeration.
    ray([-255,0,0], [255,0,0], '#8ca9ab66', [3, 5]);
    ray([0,0,0], [0,105,0], '#a6c5ce88', [3, 4]);
    ray(source, [0,0,0], aqua); ray([0,0,0], detector, lime);
    dot(source, aqua); dot([0,0,0], orange, 4); dot(detector, lime, 5);
    // Direction arrows along both beam segments.
    [[source,[0,0,0],aqua],[[0,0,0],detector,lime]].forEach(([a,b,c]) => {
      const p = project(mix(a,b,.6)), prev = project(mix(a,b,.55));
      const direction = Math.atan2(p[1]-prev[1],p[0]-prev[0]);
      for (const sign of [-1,1]) line(ctx, p.slice(0,2), [p[0]-8*Math.cos(direction+sign*.45),p[1]-8*Math.sin(direction+sign*.45)],c,1.8);
    });
    label('X-ray source', source, width * .17, 48, aqua);
    label('Specular detector', detector, width * .82, 48, lime);
    label('Surface normal / qz', [0,105,0], width * .5, 29);
    label('Silicon wafer', [0,0,75], width * .5, height - 25);
    label(`Incident θ = ${theta.toFixed(2)}°`, mix(source,[0,0,0],.55), width * .24, height - 67, aqua);
    label(`Reflected θ = ${theta.toFixed(2)}°`, mix([0,0,0],detector,.55), width * .78, height - 67, lime);
  }
  function drawTgvPlot(g) {
    const left = 33, right = plotWidth - 15, span = right - left;
    const coord = hit => (hit[2] + 160) / 320;
    [0,1].forEach(i => {
      const y = 42 + i * 55, c = i ? aqua : lime;
      text(graph, i ? 'B' : 'A', 4, y + 4, c, 12);
      line(graph,[left,y],[right,y],'#50716e',1);
      for (let t = 0; t <= 4; t++) line(graph,[left+span*t/4,y-4],[left+span*t/4,y+4],'#50716e');
      if (i && single) { text(graph,'Second view not acquired',left+span/2,y-10,muted,11,'center'); return; }
      const x = left + coord(g.hits[i]) * span;
      line(graph,[x,y-17],[x,y+17],c,2);
      graph.beginPath(); graph.arc(x,y,4,0,Math.PI*2); graph.fillStyle=c; graph.fill();
      text(graph,coord(g.hits[i]).toFixed(3),x,y-23,c,11,'center');
    });
    [0,.5,1].forEach(t => text(graph,t.toFixed(1),left+t*span,137,muted,10,'center'));
    text(graph,'Detector coordinate u / width',left+span/2,163,muted,11,'center');
    const recovered = `${(g.recovered * 100).toFixed(0)}% thickness`;
    setValues(['Projection A · u / width','Projection B · u / width','Recovered depth'], [coord(g.hits[0]).toFixed(3),single ? 'Not acquired' : coord(g.hits[1]).toFixed(3),single ? 'Unresolved' : recovered]);
    plot.setAttribute('aria-label',`Detector feature position A ${coord(g.hits[0]).toFixed(3)}; ${single ? 'second view not acquired; depth unresolved' : `B ${coord(g.hits[1]).toFixed(3)}; reconstructed depth ${recovered}`}. Coordinates are normalised to detector width.`);
  }
  function drawXrrPlot(theta, sigma) {
    const left = 43, right = plotWidth - 14, top = 27, bottom = plotHeight - 35;
    const x = q => left + q / 5 * (right - left);
    const y = r => top - Math.log10(Math.max(1e-10,r)) / 10 * (bottom - top);
    text(graph,'R = I / I₀',left,13,muted,10);
    for (let i = 0; i <= 5; i++) {
      const yy = top + i / 5 * (bottom - top);
      line(graph,[left,yy],[right,yy],'#47646366');
      text(graph,i ? `10⁻${['','²','⁴','⁶','⁸','¹⁰'][i]}` : '1',left-8,yy+4,muted,10,'right');
      text(graph,String(i),x(i),bottom+17,muted,10,'center');
    }
    text(graph,'qz (nm⁻¹)',right,plotHeight-2,muted,10,'right');
    graph.save(); graph.beginPath(); graph.rect(left,top,right-left,bottom-top); graph.clip();
    [[.1,'#8cb1b0',[4,4]],[sigma,lime,[]]].forEach(([s,c,dash]) => {
      graph.beginPath();
      for(let i=0;i<=500;i++){const q=i/100,yy=y(reflectivity(q,s));i?graph.lineTo(x(q),yy):graph.moveTo(x(q),yy);}
      graph.strokeStyle=c;graph.lineWidth=1.8;graph.setLineDash(dash);graph.stroke();
    });
    graph.setLineDash([]);
    const q = qz(theta), r = reflectivity(q,sigma);
    line(graph,[x(q),top],[x(q),bottom],'#f5b88899',1,[3,3]);
    graph.beginPath();graph.arc(x(q),y(r),4,0,Math.PI*2);graph.fillStyle=orange;graph.fill();graph.restore();
    setValues(['Detector angle · 2θ','Momentum transfer · qz','Reflectivity · I / I₀'],[`${(theta*2).toFixed(2)}°`,`${q.toFixed(3)} nm⁻¹`,r.toExponential(2)]);
    plot.setAttribute('aria-label',`Calculated silicon reflectivity: ${r.toExponential(2)} at q z ${q.toFixed(3)} inverse nanometres; RMS roughness ${sigma.toFixed(1)} nanometres. Dashed reference curve: 0.1 nanometres.`);
  }
  function setValues(labels, values) {
    labels.forEach((v,i) => { $(`xray-label-${i+1}`).textContent=v; $(`xray-value-${i+1}`).textContent=values[i]; });
  }
  function draw() {
    ctx.clearRect(0,0,width,height); graph.clearRect(0,0,plotWidth,plotHeight);
    if(mode==='triangulation') {
      const g=geometry(); tgvScene(g); drawTgvPlot(g);
      $('depth-output').textContent=`${Math.round(g.fraction*100)}% of thickness`;
      $('xray-status').textContent=single?'Depth unresolved':'Two projections';
    } else {
      const theta=Number($('angle-range').value)/100,sigma=Number($('roughness-range').value)/10;
      xrrScene(theta);drawXrrPlot(theta,sigma);
      $('angle-output').textContent=`${theta.toFixed(2)}°`;
      $('roughness-output').textContent=`${sigma.toFixed(1)} nm`;
      $('xray-reading-legend').textContent=`σ ${sigma.toFixed(1)} nm · dashed: 0.1 nm`;
      $('xray-status').textContent=running?'Angular scan':'Specular reflection';
    }
  }
  function resize() {
    if(panel.hidden) return;
    const dpr=Math.min(devicePixelRatio||1,2),r=scene.getBoundingClientRect(),p=plot.getBoundingClientRect();
    width=r.width;height=r.height;plotWidth=p.width;plotHeight=p.height;
    [[scene,ctx,width,height],[plot,graph,plotWidth,plotHeight]].forEach(([c,cx,w,h])=>{c.width=Math.round(w*dpr);c.height=Math.round(h*dpr);cx.setTransform(dpr,0,0,dpr,0,0);});
    draw();
  }
  function stop() {
    running=false;cancelAnimationFrame(frame);$('xrr-play').textContent='Run angular scan';$('xrr-play').setAttribute('aria-pressed','false');
  }
  function setMode(next) {
    stop();mode=next;const tri=mode==='triangulation';
    $('mode-triangulation').setAttribute('aria-pressed',String(tri));$('mode-reflectivity').setAttribute('aria-pressed',String(!tri));
    ['depth-field','view-compare-actions'].forEach(id=>$(id).hidden=!tri);
    ['angle-field','roughness-field','xrr-actions'].forEach(id=>$(id).hidden=tri);
    $('xray-heading').textContent=tri?'Through-glass via triangulation':'Silicon-wafer reflectivity';
    $('xray-description').textContent=tri?'Follow a via-wall feature from the glass substrate to its detector projections. A second calibrated view provides the parallax needed to recover its depth.':'A grazing-incidence beam reflects from a silicon wafer into the detector. Scan the angle and examine how sub-nanometre roughness changes the reflected intensity.';
    $('xray-stage-title').textContent=tri?'TGV / two-view geometry':'XRR / silicon-wafer surface';
    $('xray-reading-title').textContent=tri?'Detector feature positions':'Calculated reflectivity';
    $('xray-reading-legend').textContent=tri?'A / B sequential views':'';
    $('xray-note').textContent=tri?'A and B represent sequential source positions in a calibrated geometry. Detector coordinates and reconstructed depth are normalised; correspondence between the two wall features is assumed.':'Single-interface silicon model: λ = 0.15406 nm, qc = 0.32 nm⁻¹. Fresnel reflectivity with an RMS roughness factor; oxide and absorption are omitted.';
    updateHelp();resize();
  }
  function updateHelp() {
    $('compare-view').textContent=single?'Add second view':'Show single-view limit';
    $('compare-view').setAttribute('aria-pressed',String(single));
    $('xray-help').textContent=mode==='triangulation'?(single?'One projection constrains a feature to a ray. Its depth remains ambiguous until a corresponding feature is identified in another calibrated view.':'The same via-wall feature appears at different detector positions in views A and B. Intersecting their calibrated rays recovers its 3D position; multiple boundary points describe the via profile.'):'The source and detector each make an angle θ to the wafer surface, giving a scattering angle of 2θ. Higher roughness reduces specular reflectivity at larger qz. Surface roughness is obtained by fitting the full reflectivity response.';
  }
  $('mode-triangulation').addEventListener('click',()=>setMode('triangulation'));
  $('mode-reflectivity').addEventListener('click',()=>setMode('reflectivity'));
  $('compare-view').addEventListener('click',()=>{single=!single;updateHelp();draw();});
  $('depth-range').addEventListener('input',draw);
  $('roughness-range').addEventListener('input',draw);
  $('angle-range').addEventListener('input',()=>{stop();draw();});
  $('xrr-play').addEventListener('click',()=>{
    if(running){stop();draw();return;}
    if(reduced.matches){$('angle-range').value='350';draw();return;}
    running=true;startTime=performance.now();$('xrr-play').textContent='Pause angular scan';$('xrr-play').setAttribute('aria-pressed','true');
    const tick=now=>{
      if(!running)return;
      const t=clamp((now-startTime)/9000,0,1);$('angle-range').value=String(Math.round(10+t*340));
      if(t>=1)stop();draw();if(running)frame=requestAnimationFrame(tick);
    };
    frame=requestAnimationFrame(tick);
  });
  let drag=null;
  scene.addEventListener('pointerdown',e=>{drag={x:e.clientX,yaw};scene.setPointerCapture(e.pointerId);});
  scene.addEventListener('pointermove',e=>{if(!drag)return;yaw=clamp(drag.yaw+(e.clientX-drag.x)*.006,-.75,1.05);draw();});
  ['pointerup','pointercancel','lostpointercapture'].forEach(type=>scene.addEventListener(type,()=>drag=null));
  scene.addEventListener('keydown',e=>{if(!['ArrowLeft','ArrowRight','Home'].includes(e.key))return;e.preventDefault();yaw=e.key==='Home'?.48:clamp(yaw+(e.key==='ArrowRight'?.08:-.08),-.75,1.05);draw();});
  $('xray-reset-view').addEventListener('click',()=>{yaw=.48;draw();});
  new ResizeObserver(resize).observe(scene);
  new MutationObserver(()=>{if(panel.hidden){stop();}else resize();}).observe(panel,{attributes:true,attributeFilter:['hidden']});
  document.addEventListener('visibilitychange',()=>{if(document.hidden){stop();draw();}});
  reduced.addEventListener('change',()=>{if(reduced.matches){stop();draw();}});
  setMode('triangulation');
})();
