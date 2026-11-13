(() => {
  const $ = (id) => document.getElementById(id);
  const tabs = [...document.querySelectorAll('.demo-tab')];
  let smartTimer = null;
  let ptychoTimer = null;
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function activateTab(tab, focus = false) {
    tabs.forEach((item) => {
      const active = item === tab;
      item.setAttribute('aria-selected', String(active));
      item.tabIndex = active ? 0 : -1;
      $(item.getAttribute('aria-controls')).hidden = !active;
    });
    if (focus) tab.focus();
  }
  tabs.forEach((tab, index) => {
    tab.addEventListener('click', () => activateTab(tab));
    tab.addEventListener('keydown', (event) => {
      let next = index;
      if (event.key === 'ArrowRight') next = (index + 1) % tabs.length;
      else if (event.key === 'ArrowLeft') next = (index - 1 + tabs.length) % tabs.length;
      else if (event.key === 'Home') next = 0;
      else if (event.key === 'End') next = tabs.length - 1;
      else return;
      event.preventDefault();
      activateTab(tabs[next], true);
    });
  });

  // SmartScan: a conceptual digital twin with a connected robot, coverage model and next-best-view adjustment.
  const scanSvg = $('smartscan-svg');
  const stageItems = [...$('smartscan-stages').children];
  const topo = $('topo-canvas');
  const topoCtx = topo.getContext('2d');
  const stitch = $('stitch-canvas');
  const stitchCtx = stitch.getContext('2d');
  const coverageCells = Array.from({ length: 5 }, (_, i) => $(`coverage-${i}`));
  let placed = false;
  let scanPhase = 0;
  let scanProgress = 0;
  const base = { x: 130, y: 244 };
  const plannedViews = [{ x: 338, y: 130 }, { x: 382, y: 122 }, { x: 458, y: 123 }, { x: 490, y: 128 }];
  const adaptedViews = [{ x: 490, y: 128 }, { x: 466, y: 82 }, { x: 420, y: 104 }];
  const phaseText = [
    'Select the hardware configuration and place a sample to begin.',
    'Sample registered in the workspace. SmartScan can now generate a path.',
    'The agentic orchestrator generates viewpoints and a robot path from the sample geometry.',
    'Each robot view adds a scan patch, registered and stitched into a shared 3D model.',
    'The stitched 3D model has a visible data hole. Next-best-view sends the robot to a new angle over that hole.',
    'A new scan patch fills the hole; the simulated topography is cleaned.'
  ];
  function hardwareName() {
    return `${$('robot-select').selectedOptions[0].textContent} + ${$('scanner-select').selectedOptions[0].textContent}`;
  }
  function interpolateViews(views, progress) {
    const scaled = Math.min(views.length - 1, Math.max(0, progress) * (views.length - 1));
    const i = Math.min(views.length - 2, Math.floor(scaled));
    const t = scaled - i;
    return { x: views[i].x + (views[i + 1].x - views[i].x) * t, y: views[i].y + (views[i + 1].y - views[i].y) * t };
  }
  function renderRobot(tool, aimX = tool.x + 7) {
    const x = tool.x, y = tool.y;
    const wristY = y - 17;
    const robotType = $('robot-select').value;
    const gantry = robotType === 'gantry';
    $('arm-assembly').toggleAttribute('hidden', gantry);
    $('gantry-assembly').toggleAttribute('hidden', !gantry);
    $('rotary-stage').toggleAttribute('hidden', robotType !== 'table');
    if (gantry) {
      $('gantry-slide').setAttribute('d', `M${x.toFixed(1)} 52V${wristY.toFixed(1)}`);
      $('gantry-carriage').setAttribute('x', (x - 22).toFixed(1));
    } else {
      // Two fixed-length links. The end of the second link is the scanner mount.
      const dx = x - base.x, dy = wristY - base.y;
      const length1 = 175, length2 = 235;
      const distance = Math.min(length1 + length2 - .001, Math.hypot(dx, dy));
      const along = (length1 ** 2 - length2 ** 2 + distance ** 2) / (2 * distance);
      const rise = Math.sqrt(Math.max(0, length1 ** 2 - along ** 2));
      const ux = dx / distance, uy = dy / distance;
      const elbowX = base.x + along * ux + rise * uy;
      const elbowY = base.y + along * uy - rise * ux;
      $('robot-link-1').setAttribute('d', `M${base.x} ${base.y} ${elbowX.toFixed(1)} ${elbowY.toFixed(1)}`);
      $('robot-link-2').setAttribute('d', `M${elbowX.toFixed(1)} ${elbowY.toFixed(1)} ${x.toFixed(1)} ${wristY.toFixed(1)}`);
      $('robot-elbow').setAttribute('cx', elbowX.toFixed(1)); $('robot-elbow').setAttribute('cy', elbowY.toFixed(1));
      $('robot-wrist').setAttribute('cx', x.toFixed(1)); $('robot-wrist').setAttribute('cy', wristY.toFixed(1));
    }
    $('scan-head').setAttribute('transform', `translate(${x.toFixed(1)} ${y.toFixed(1)})`);
    $('scan-beam').setAttribute('d', `M${x.toFixed(1)} ${(y + 24).toFixed(1)} ${aimX.toFixed(1)} 208`);
  }
  function renderCoverage(phase, progress) {
    const states = ['idle', 'idle', 'idle', 'idle', 'idle'];
    let percent = 0;
    if (phase === 3) {
      if (progress > .10) { states[0] = 'covered'; percent = 20; }
      if (progress > .34) { states[1] = 'covered'; percent = 40; }
      if (progress > .60) { states[3] = 'covered'; percent = 60; }
      if (progress > .84) { states[4] = 'covered'; percent = 80; }
      if (progress > .89) states[2] = 'gap';
    } else if (phase === 4) {
      states[0] = states[1] = states[3] = states[4] = 'covered';
      states[2] = progress < .97 ? 'gap' : 'covered';
      percent = progress < .97 ? 80 : 100;
    } else if (phase === 5) { states.fill('covered'); percent = 100; }
    coverageCells.forEach((cell, i) => { cell.classList.toggle('covered', states[i] === 'covered'); cell.classList.toggle('gap', states[i] === 'gap'); });
    scanSvg.classList.toggle('gap-visible', states[2] === 'gap');
    $('coverage-value').textContent = `${percent}%`;
    $('coverage-bar').style.width = `${percent}%`;
    drawStitchedModel(states, phase);
  }
  function drawStitchedModel(states, phase) {
    const ctx = stitchCtx, w = stitch.width, h = stitch.height;
    ctx.clearRect(0, 0, w, h);
    const bg = ctx.createLinearGradient(0, 0, w, h); bg.addColorStop(0, '#173b43'); bg.addColorStop(1, '#0c2630');
    ctx.fillStyle = bg; ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = '#49786f44'; ctx.lineWidth = 1;
    for (let y = 24; y < h; y += 29) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke(); }
    const surface = (u, v) => 9 * Math.sin(u * 1.15) + 7 * Math.cos(v * 1.35) + 18 * Math.exp(-(((u - 2.6) ** 2 + (v - 2.5) ** 2) / 2));
    const point = (u, v) => ({ x: 165 + (u - v) * 23, y: 125 + (u + v) * 11 - surface(u, v) });
    const polygon = (a, b, c, d, fill, stroke) => {
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.lineTo(c.x, c.y); ctx.lineTo(d.x, d.y); ctx.closePath();
      ctx.fillStyle = fill; ctx.fill(); ctx.strokeStyle = stroke; ctx.lineWidth = 1; ctx.stroke();
    };
    // Five overlapping view strips register into one shared 3D surface.
    for (let patch = 0; patch < 5; patch++) {
      const state = states[patch];
      for (let ui = 0; ui < 4; ui++) for (let vi = 0; vi < 10; vi++) {
        const u = patch + ui / 4, v = vi / 2;
        const a = point(u, v), b = point(u + .25, v), c = point(u + .25, v + .5), d = point(u, v + .5);
        const raised = surface(u + .12, v + .25);
        const alpha = Math.max(.28, Math.min(.58, .39 + raised / 90));
        const missingCenter = state === 'gap' && vi >= 3 && vi <= 6;
        if (missingCenter) continue;
        const fill = state === 'covered' || state === 'gap' ? `rgba(140,223,199,${alpha})` : 'rgba(104,152,148,.055)';
        const stroke = state === 'covered' || state === 'gap' ? 'rgba(216,247,220,.34)' : 'rgba(108,162,154,.20)';
        polygon(a, b, c, d, fill, stroke);
      }
      if (state === 'covered') {
        ctx.strokeStyle = '#daf3a1'; ctx.lineWidth = 1.5; ctx.beginPath();
        for (let vi = 0; vi <= 10; vi++) { const p = point(patch + 1, vi / 2); vi ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y); }
        ctx.stroke();
      }
    }
    if (states[2] === 'gap') {
      const a = point(2, 1.5), b = point(3, 1.5), c = point(3, 3.5), d = point(2, 3.5);
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.lineTo(c.x, c.y); ctx.lineTo(d.x, d.y); ctx.closePath();
      ctx.fillStyle = '#081f29'; ctx.fill(); ctx.strokeStyle = '#f4b58a'; ctx.lineWidth = 2.5; ctx.setLineDash([5, 4]); ctx.stroke(); ctx.setLineDash([]);
      const center = point(2.5, 2.5);
      ctx.beginPath(); ctx.arc(center.x, center.y, 6, 0, Math.PI * 2); ctx.fillStyle = '#f4b58a'; ctx.fill();
      ctx.beginPath(); ctx.moveTo(116, 76); ctx.lineTo(center.x - 5, center.y - 8); ctx.strokeStyle = '#f4b58a'; ctx.lineWidth = 1.5; ctx.stroke();
      ctx.fillStyle = '#f4c39f'; ctx.font = '700 10px system-ui'; ctx.fillText('MISSING SCAN DATA', 15, 69);
    }
    ctx.fillStyle = '#9dc8bd'; ctx.font = '10px system-ui'; ctx.fillText('REGISTERED SURFACE PATCHES', 18, 23);
    const acquired = states.filter((state) => state === 'covered').length;
    stitch.dataset.hole = states[2] === 'gap' ? 'open' : 'closed';
    $('patch-counter').textContent = `${acquired} / 5 patches`;
    $('stitch-event').textContent = phase === 5 ? 'Data hole closed — complete stitched 3D surface' : states.includes('gap') ? 'Data hole detected → robot moving to next best view' : acquired ? `Scan patch ${String(acquired).padStart(2, '0')} aligned and stitched` : 'Waiting for the first scan patch';
  }
  function setSmartPhase(phase, progress = 0) {
    scanPhase = phase;
    scanProgress = progress;
    stageItems.forEach((item, index) => { item.classList.toggle('done', index < phase); item.classList.toggle('active', index === phase); });
    const status = ['Awaiting sample', 'Sample placed', 'Generating path', 'Following path', 'Choosing next best view', 'Coverage complete'];
    const decision = ['Waiting for sample', 'Sample geometry registered', 'Scan path generated', 'Coverage gap detected', 'Next-best-view: fill the hole', 'Coverage verified'];
    const details = [
      'Configures hardware and generates its own scan path.',
      'Identifies the sample and available robot workspace.',
      'Creates candidate views and an initial robot trajectory.',
      'Four patches are stitched; the center region has no scan data.',
      'Automatically moves above the missing region and acquires a new view.',
      'The missing patch is stitched into the model before cleanup.'
    ];
    const holeFilled = phase === 4 && progress >= .97;
    $('smartscan-status').textContent = holeFilled ? 'Hole filled' : status[phase];
    $('smartscan-caption').textContent = phase === 0 ? phaseText[phase] : `${holeFilled ? 'The robot rescans the missing area and stitches that patch into the 3D model.' : phaseText[phase]} ${hardwareName()}.`;
    $('orchestrator-decision').textContent = holeFilled ? 'Data hole closed' : phase === 3 && progress < .89 ? 'Monitoring coverage' : decision[phase];
    $('orchestrator-detail').textContent = holeFilled ? 'The new view supplies the missing surface patch.' : phase === 3 && progress < .89 ? 'Checks each registered patch for missing surface data.' : details[phase];
    $('topo-label').textContent = phase < 3 ? 'Waiting for scan' : phase < 5 ? 'Raw acquisition' : 'Cleaned profile';
    scanSvg.classList.toggle('planning', phase >= 2);
    scanSvg.classList.toggle('scanning', phase === 3);
    scanSvg.classList.toggle('adapting', phase === 4);
    scanSvg.classList.toggle('cleaned', phase === 5);
    renderCoverage(phase, progress);
    const tool = phase === 3 ? interpolateViews(plannedViews, progress) : phase === 4 ? interpolateViews(adaptedViews, progress) : phase === 5 ? adaptedViews.at(-1) : plannedViews[0];
    renderRobot(tool, phase === 4 ? 416 : tool.x + 7);
    drawTopography();
  }
  function drawTopography() {
    const w = topo.width, h = topo.height;
    topoCtx.clearRect(0, 0, w, h);
    topoCtx.strokeStyle = '#274750'; topoCtx.lineWidth = 1;
    for (let y = 14; y < h; y += 20) { topoCtx.beginPath(); topoCtx.moveTo(0, y); topoCtx.lineTo(w, y); topoCtx.stroke(); }
    if (scanPhase < 3) { topoCtx.fillStyle = '#779d9a'; topoCtx.font = '11px system-ui'; topoCtx.fillText('Signal appears during scanning', 12, 43); return; }
    const maxX = scanPhase === 3 ? Math.max(8, scanProgress * w * .55) : scanPhase === 4 ? w * (.55 + scanProgress * .45) : w;
    const density = Number($('density-range').value);
    const profile = (x) => 39 + 10 * Math.sin(x / 47) + 6 * Math.sin(x / 18) - 15 * Math.exp(-(((x - 360) / 44) ** 2));
    topoCtx.beginPath(); topoCtx.strokeStyle = scanPhase === 5 ? '#d8f28d' : '#9fe4d8'; topoCtx.lineWidth = 2;
    for (let x = 0; x <= maxX; x += 2) {
      const noise = scanPhase === 5 ? 0 : (Math.sin(x * 2.17) * 5 + Math.sin(x * .89) * 3) / density;
      const y = profile(x) + noise;
      x === 0 ? topoCtx.moveTo(x, y) : topoCtx.lineTo(x, y);
    }
    topoCtx.stroke();
    if (scanPhase === 5) { topoCtx.fillStyle = '#d8f28d'; topoCtx.font = '10px system-ui'; topoCtx.fillText('SIMULATED CLEAN PROFILE', w - 190, 14); }
  }
  function setScannerAppearance() {
    const scanner = $('scanner-select').value;
    $('scan-head').querySelector('rect').setAttribute('fill', scanner === 'laser' ? '#f4bc9a' : scanner === 'confocal' ? '#d8f28d' : '#c7eadb');
  }
  $('place-sample').addEventListener('click', () => {
    if (smartTimer) { clearInterval(smartTimer); smartTimer = null; }
    placed = true; scanSvg.classList.add('placed');
    $('run-smartscan').disabled = false; $('run-smartscan').textContent = 'Run scan ↗';
    $('place-sample').textContent = 'Replace sample';
    setSmartPhase(1);
  });
  $('run-smartscan').addEventListener('click', () => {
    if (!placed) return;
    if (smartTimer) clearInterval(smartTimer);
    $('run-smartscan').disabled = true;
    setSmartPhase(2);
    let tick = 0;
    smartTimer = setInterval(() => {
      tick++;
      if (tick <= 10) setSmartPhase(2);
      else if (tick <= 47) setSmartPhase(3, Math.min(1, (tick - 11) / 36));
      else if (tick <= 84) setSmartPhase(4, Math.min(1, (tick - 48) / 36));
      else {
        clearInterval(smartTimer); smartTimer = null;
        setSmartPhase(5, 1);
        $('run-smartscan').disabled = false; $('run-smartscan').textContent = 'Run again ↗';
      }
    }, reducedMotion ? 13 : 70);
  });
  $('density-range').addEventListener('input', () => { $('density-output').textContent = ['Low', 'Medium', 'High'][Number($('density-range').value) - 1]; drawTopography(); });
  ['robot-select', 'scanner-select'].forEach((id) => $(id).addEventListener('change', () => {
    if (smartTimer) { clearInterval(smartTimer); smartTimer = null; }
    setScannerAppearance();
    setSmartPhase(placed ? 1 : 0);
    $('run-smartscan').disabled = !placed;
  }));
  setScannerAppearance(); setSmartPhase(0);

  // Optics: linked lens, focal plane, acquisition path and image result.
  const lenses = {
    confocal: [
      { name: 'Wide-field objective', one: '5×', two: '0.15', three: '4.0 mm' },
      { name: 'Balanced objective', one: '10×', two: '0.30', three: '2.0 mm' },
      { name: 'High-detail objective', one: '20×', two: '0.45', three: '1.0 mm' }
    ],
    scanner: [
      { name: 'Wide-area lens', one: '16 mm', two: '350 mm', three: 'Wide' },
      { name: 'Balanced lens', one: '25 mm', two: '250 mm', three: 'Medium' },
      { name: 'Detail lens', one: '35 mm', two: '180 mm', three: 'Narrow' }
    ]
  };
  const opticsCanvas = $('optics-canvas'), opticsCtx = opticsCanvas.getContext('2d');
  let opticsMode = 'confocal', opticsProgress = 0, opticsTimer = null;
  function opticsLine(ctx, x1, y1, x2, y2, color, width = 1, dash = []) {
    ctx.beginPath(); ctx.setLineDash(dash); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.strokeStyle = color; ctx.lineWidth = width; ctx.stroke(); ctx.setLineDash([]);
  }
  function opticsText(ctx, text, x, y, color = '#9fcbbf', size = 10) { ctx.fillStyle = color; ctx.font = `700 ${size}px system-ui`; ctx.fillText(text, x, y); }
  function opticsLens(ctx, x, y, width) {
    ctx.fillStyle = '#244c53'; ctx.strokeStyle = '#aee4d5'; ctx.lineWidth = 2;
    ctx.fillRect(x - width - 15, y - 18, width * 2 + 30, 40); ctx.strokeRect(x - width - 15, y - 18, width * 2 + 30, 40);
    ctx.beginPath(); ctx.ellipse(x, y + 2, width, 13, 0, 0, Math.PI * 2); ctx.fillStyle = '#bceadd'; ctx.fill(); ctx.strokeStyle = '#e3fbeb'; ctx.stroke();
    opticsText(ctx, 'OBJECTIVE', x - 34, y - 26, '#9bbeb5', 9);
  }
  function drawConfocal(ctx, focus, lensIndex) {
    const lensY = 65 + focus * .20;
    const planeY = 180 + focus * .78;
    const scanX = 98 + opticsProgress * 297;
    const aperture = [17, 23, 30][lensIndex];
    ctx.fillStyle = '#173b43'; ctx.fillRect(37, 177, 390, 127);
    for (let i = 0; i < 4; i++) { ctx.fillStyle = i % 2 ? '#214c50' : '#285556'; ctx.fillRect(37, 177 + i * 31, 390, 30); }
    ctx.strokeStyle = '#7dbbab'; ctx.strokeRect(37, 177, 390, 127);
    for (let i = 0; i < 8; i++) {
      const x = 64 + i * 49, y = 203 + (i % 3) * 28;
      ctx.beginPath(); ctx.arc(x, y, 6 + i % 2 * 3, 0, Math.PI * 2); ctx.fillStyle = '#9ad4b16e'; ctx.fill();
    }
    opticsLine(ctx, 37, planeY, 427, planeY, '#d8f28d', 1.4, [5, 5]);
    opticsText(ctx, 'FOCAL PLANE', 42, Math.min(planeY - 7, 298), '#d8f28d', 9);
    ctx.beginPath(); ctx.moveTo(225 - aperture, lensY + 22); ctx.lineTo(scanX, planeY); ctx.lineTo(225 + aperture, lensY + 22); ctx.closePath(); ctx.fillStyle = '#a0e6d51d'; ctx.fill();
    opticsLine(ctx, 225 - aperture, lensY + 22, scanX, planeY, '#a5e4d4', 1.7);
    opticsLine(ctx, 225 + aperture, lensY + 22, scanX, planeY, '#a5e4d4', 1.7);
    opticsLine(ctx, scanX, planeY, 225, lensY - 8, '#d8f28d', 1.3, [4, 5]);
    ctx.beginPath(); ctx.arc(scanX, planeY, 7, 0, Math.PI * 2); ctx.fillStyle = '#dcf59e'; ctx.fill();
    ctx.beginPath(); ctx.arc(scanX, planeY, 17, 0, Math.PI * 2); ctx.strokeStyle = '#d8f28d88'; ctx.stroke();
    opticsLens(ctx, 225, lensY, aperture);
    opticsLine(ctx, 225, lensY - 18, 225, 29, '#d8f28d', 1.4, [4, 4]);
    opticsLine(ctx, 213, 31, 221, 31, '#e0f6c3', 3); opticsLine(ctx, 229, 31, 237, 31, '#e0f6c3', 3);
    opticsText(ctx, 'PINHOLE', 245, 35, '#d8f28d', 9);
    opticsText(ctx, 'OPTICAL SECTION', 42, 327, '#a6ccc1', 10);
    // The right panel fills column by column as the sample is scanned.
    ctx.fillStyle = '#0d2831'; ctx.fillRect(457, 39, 170, 270); ctx.strokeStyle = '#4d8075'; ctx.strokeRect(457, 39, 170, 270);
    opticsText(ctx, 'SECTION IMAGE', 471, 58, '#a6d4c6', 10);
    const cols = 18, rows = 16, cellW = 7.2, cellH = 12.7;
    for (let col = 0; col < cols; col++) for (let row = 0; row < rows; row++) {
      const x = 475 + col * cellW, y = 77 + row * cellH;
      const signal = Math.sin(col * .72) * Math.cos(row * .55) + 1.2 * Math.exp(-(((col - 8) ** 2 + (row - 9) ** 2) / 18));
      const acquired = col / (cols - 1) <= opticsProgress;
      ctx.fillStyle = acquired ? `rgba(178,235,190,${Math.max(.09, Math.min(.85, .18 + signal * .27))})` : '#24464c';
      ctx.fillRect(x, y, cellW - 1, cellH - 1);
    }
    opticsText(ctx, `${Math.round(opticsProgress * 100)}% ACQUIRED`, 471, 294, '#d9f28d', 10);
  }
  function drawScanner(ctx, focus, lensIndex) {
    const lensY = 64 + focus * .28;
    const scanX = 86 + opticsProgress * 320;
    const surfaceY = (x) => 249 - 20 * Math.exp(-(((x - 270) / 63) ** 2)) + 12 * Math.sin(x / 38);
    const targetY = surfaceY(scanX);
    const width = [190, 145, 105][lensIndex];
    // 3D object profile and the focus envelope move consistently with the selected lens.
    ctx.beginPath(); ctx.moveTo(37, 305);
    for (let x = 37; x <= 427; x += 3) ctx.lineTo(x, surfaceY(x));
    ctx.lineTo(427, 305); ctx.closePath(); ctx.fillStyle = '#2a5d59'; ctx.fill(); ctx.strokeStyle = '#a4e4c6'; ctx.lineWidth = 2; ctx.stroke();
    for (let x = 50; x < 420; x += 25) opticsLine(ctx, x, surfaceY(x), x + 13, 305, '#72b9a464', 1);
    const focusPlane = 205 + (focus - 50) * .72;
    opticsLine(ctx, 57, focusPlane, 422, focusPlane, '#d8f28d88', 1, [5, 6]);
    opticsText(ctx, 'FOCUS WINDOW', 42, focusPlane - 7, '#d8f28d', 9);
    ctx.beginPath(); ctx.moveTo(222 - 16, lensY + 22); ctx.lineTo(scanX, targetY); ctx.lineTo(222 + 16, lensY + 22); ctx.closePath(); ctx.fillStyle = '#bcebd61c'; ctx.fill();
    opticsLine(ctx, 222, lensY + 20, scanX, targetY, '#d9f28d', 2.3);
    ctx.beginPath(); ctx.arc(scanX, targetY, 7, 0, Math.PI * 2); ctx.fillStyle = '#d9f28d'; ctx.fill();
    // Triangulation camera receives the illuminated point.
    ctx.fillStyle = '#2e5960'; ctx.strokeStyle = '#a6dbd0'; ctx.lineWidth = 2; ctx.fillRect(350, 57, 54, 38); ctx.strokeRect(350, 57, 54, 38);
    ctx.beginPath(); ctx.arc(377, 96, 8, 0, Math.PI * 2); ctx.fillStyle = '#b5e9d9'; ctx.fill();
    opticsLine(ctx, scanX, targetY, 377, 96, '#a2daca', 1.7, [5, 4]);
    opticsText(ctx, 'CAMERA', 353, 47, '#a6ccc1', 9);
    opticsLens(ctx, 222, lensY, [18, 23, 28][lensIndex]);
    opticsLine(ctx, Math.max(48, 222 - width), 315, Math.max(48, 222 - width), 323, '#8bbeb2', 1);
    opticsLine(ctx, Math.min(430, 222 + width), 315, Math.min(430, 222 + width), 323, '#8bbeb2', 1);
    opticsText(ctx, 'SURFACE SWEEP', 42, 340, '#a6ccc1', 10);
    ctx.fillStyle = '#0d2831'; ctx.fillRect(457, 39, 170, 270); ctx.strokeStyle = '#4d8075'; ctx.strokeRect(457, 39, 170, 270);
    opticsText(ctx, '3D POINT CLOUD', 471, 58, '#a6d4c6', 10);
    for (let i = 0; i < 45 * opticsProgress; i++) {
      const t = i / 45;
      for (let row = 0; row < 7; row++) {
        const x = 472 + t * 112 + row * 5;
        const y = 251 - row * 15 - 24 * Math.exp(-(((t - .57) / .20) ** 2)) + 8 * Math.sin(t * 10);
        ctx.beginPath(); ctx.arc(x, y, 1.15, 0, Math.PI * 2);
        ctx.fillStyle = row % 2 ? '#d9f28d' : '#9ee4d8'; ctx.fill();
      }
    }
    opticsText(ctx, `${Math.round(opticsProgress * 100)}% CAPTURED`, 471, 294, '#d9f28d', 10);
  }
  function renderOptics() {
    const confocal = opticsMode === 'confocal';
    $('mode-confocal').setAttribute('aria-pressed', String(confocal)); $('mode-scanner').setAttribute('aria-pressed', String(!confocal));
    $('optics-stage-title').textContent = confocal ? 'Confocal / optical sectioning' : '3D scanning / surface capture';
    $('optics-caption').textContent = confocal ? 'The objective, focal plane and section image move together as one optical scan.' : 'The scanner illuminates each surface point; the camera records points for a growing 3D cloud.';
    const index = Number($('lens-select').value || 1), lens = lenses[opticsMode][index];
    const labels = confocal ? ['Magnification', 'Numerical aperture', 'Field of view'] : ['Focal length', 'Working distance', 'Field coverage'];
    ['one', 'two', 'three'].forEach((part, i) => { $(`spec-${part}-label`).textContent = labels[i]; $(`spec-${part}`).textContent = lens[part]; });
    const focus = Number($('focus-range').value);
    $('focus-output').textContent = focus < 35 ? 'Near' : focus > 65 ? 'Far' : 'Centre';
    if (!opticsTimer) $('optics-status').textContent = lens.name;
    const ctx = opticsCtx; ctx.clearRect(0, 0, 650, 350);
    const bg = ctx.createLinearGradient(0, 0, 650, 350); bg.addColorStop(0, '#12333c'); bg.addColorStop(1, '#0b202b'); ctx.fillStyle = bg; ctx.fillRect(0, 0, 650, 350);
    ctx.strokeStyle = '#315c5d55'; ctx.lineWidth = 1;
    for (let x = 25; x < 650; x += 35) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, 350); ctx.stroke(); }
    for (let y = 18; y < 350; y += 35) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(650, y); ctx.stroke(); }
    opticsLine(ctx, 445, 22, 445, 323, '#54847c', 1.4);
    confocal ? drawConfocal(ctx, focus, index) : drawScanner(ctx, focus, index);
  }
  function stopOptics() { if (opticsTimer) { clearInterval(opticsTimer); opticsTimer = null; } $('optics-play').disabled = false; }
  function setOpticsMode(mode) {
    stopOptics(); opticsMode = mode; opticsProgress = 0;
    $('lens-select').innerHTML = lenses[mode].map((lens, index) => `<option value="${index}">${lens.name}</option>`).join('');
    $('lens-select').value = '1'; $('optics-play').textContent = 'Animate acquisition ↗'; renderOptics();
  }
  $('mode-confocal').addEventListener('click', () => setOpticsMode('confocal'));
  $('mode-scanner').addEventListener('click', () => setOpticsMode('scanner'));
  $('lens-select').addEventListener('change', renderOptics);
  $('focus-range').addEventListener('input', renderOptics);
  $('optics-play').addEventListener('click', () => {
    stopOptics(); opticsProgress = 0; $('optics-play').disabled = true;
    opticsTimer = setInterval(() => {
      opticsProgress = Math.min(1, opticsProgress + (reducedMotion ? .12 : .025));
      $('optics-status').textContent = opticsMode === 'confocal' ? `Optical section ${Math.round(opticsProgress * 100)}%` : `Surface capture ${Math.round(opticsProgress * 100)}%`;
      renderOptics();
      if (opticsProgress >= 1) { stopOptics(); $('optics-status').textContent = 'Acquisition complete'; $('optics-play').textContent = 'Replay acquisition ↗'; }
    }, reducedMotion ? 20 : 55);
  });
  setOpticsMode('confocal');

  // Ptychography: overlapping positions and a visual reconstruction metaphor.
  const pScan = $('ptycho-scan-canvas').getContext('2d');
  const pRecon = $('ptycho-recon-canvas').getContext('2d');
  let pPositions = [];
  let pIndex = 0;
  function probePositions() {
    const overlap = Number($('overlap-range').value) / 100;
    const step = Math.max(27, Math.round(72 * (1 - overlap)));
    const positions = [];
    for (let y = 52; y <= 248; y += step) {
      const row = [];
      for (let x = 52; x <= 248; x += step) row.push({ x, y });
      if (positions.length / row.length % 2) row.reverse();
      positions.push(...row);
    }
    return positions;
  }
  // A deterministic, illustrative microstructure image is used in both views.
  const micrograph = document.createElement('canvas'); micrograph.width = micrograph.height = 300;
  const blurredMicrograph = document.createElement('canvas'); blurredMicrograph.width = blurredMicrograph.height = 300;
  function drawMicrograph(ctx) {
    const bg = ctx.createRadialGradient(150, 145, 20, 150, 145, 210);
    bg.addColorStop(0, '#335e63'); bg.addColorStop(1, '#102b35'); ctx.fillStyle = bg; ctx.fillRect(0, 0, 300, 300);
    const grains = [{ x: 91, y: 97, r: 56 }, { x: 213, y: 105, r: 66 }, { x: 141, y: 219, r: 69 }];
    grains.forEach((g, gi) => {
      const fill = ctx.createRadialGradient(g.x - 15, g.y - 18, 4, g.x, g.y, g.r);
      fill.addColorStop(0, gi === 1 ? '#d8efb4' : '#b8e5d3'); fill.addColorStop(.58, '#73b7ab'); fill.addColorStop(1, '#285b61');
      ctx.beginPath();
      for (let i = 0; i <= 64; i++) {
        const a = i / 64 * Math.PI * 2;
        const r = g.r * (1 + .07 * Math.sin(a * 7 + gi) + .04 * Math.cos(a * 13));
        const x = g.x + Math.cos(a) * r, y = g.y + Math.sin(a) * r;
        i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
      }
      ctx.closePath(); ctx.fillStyle = fill; ctx.fill(); ctx.strokeStyle = '#d8f2d0'; ctx.lineWidth = 2; ctx.stroke();
      for (let ring = 1; ring <= 5; ring++) {
        ctx.beginPath(); ctx.ellipse(g.x, g.y, g.r * ring / 6, g.r * ring / 6 * .88, gi * .32, 0, Math.PI * 2);
        ctx.strokeStyle = ring % 2 ? '#e4f4ce88' : '#275e6388'; ctx.lineWidth = ring % 2 ? 1.4 : 2; ctx.stroke();
      }
      for (let spoke = 0; spoke < 22; spoke++) {
        const a = spoke / 22 * Math.PI * 2 + gi * .2;
        const r1 = 10 + (spoke % 3) * 3, r2 = g.r * .82;
        ctx.beginPath(); ctx.moveTo(g.x + Math.cos(a) * r1, g.y + Math.sin(a) * r1);
        ctx.lineTo(g.x + Math.cos(a) * r2, g.y + Math.sin(a) * r2);
        ctx.strokeStyle = '#d9f4d64a'; ctx.lineWidth = 1; ctx.stroke();
      }
    });
    let seed = 142857;
    const random = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
    for (let i = 0; i < 680; i++) {
      const x = random() * 300, y = random() * 300, radius = .3 + random() * 1.7;
      ctx.beginPath(); ctx.arc(x, y, radius, 0, Math.PI * 2);
      ctx.fillStyle = random() > .45 ? '#dcf5d99c' : '#75bdb5a0'; ctx.fill();
    }
    ctx.strokeStyle = '#e8f7d9'; ctx.lineWidth = 2;
    for (let i = 0; i < 8; i++) { const x = 24 + i * 37; ctx.beginPath(); ctx.moveTo(x, 270); ctx.lineTo(x + 12, 275); ctx.stroke(); }
  }
  drawMicrograph(micrograph.getContext('2d'));
  const blurredCtx = blurredMicrograph.getContext('2d');
  const lowResSource = document.createElement('canvas'); lowResSource.width = lowResSource.height = 34;
  lowResSource.getContext('2d').drawImage(micrograph, 0, 0, 34, 34);
  blurredCtx.imageSmoothingEnabled = true;
  blurredCtx.drawImage(lowResSource, 0, 0, 300, 300);
  function drawPtycho() {
    const s = pScan.canvas.width;
    pScan.clearRect(0, 0, s, s); pScan.drawImage(micrograph, 0, 0);
    pScan.fillStyle = '#0b243092'; pScan.fillRect(0, 0, s, s);
    pPositions.slice(0, pIndex).forEach((pos) => {
      pScan.beginPath(); pScan.arc(pos.x, pos.y, 36, 0, Math.PI * 2);
      pScan.fillStyle = '#b9efdc15'; pScan.fill(); pScan.strokeStyle = '#b8e8d077'; pScan.lineWidth = 1; pScan.stroke();
    });
    const active = pPositions[Math.min(pIndex, pPositions.length - 1)];
    if (active && pIndex > 0) {
      pScan.beginPath(); pScan.arc(active.x, active.y, 36, 0, Math.PI * 2); pScan.strokeStyle = '#d8f28d'; pScan.lineWidth = 3; pScan.stroke();
      pScan.beginPath(); pScan.arc(active.x, active.y, 4, 0, Math.PI * 2); pScan.fillStyle = '#e8f9ad'; pScan.fill();
      // A changing diffraction-pattern inset indicates what the detector records.
      pScan.fillStyle = '#102a35e8'; pScan.fillRect(215, 8, 77, 77); pScan.strokeStyle = '#b1ddcc'; pScan.strokeRect(215, 8, 77, 77);
      for (let r = 9; r <= 27; r += 9) { pScan.beginPath(); pScan.arc(253, 46, r, 0, Math.PI * 2); pScan.strokeStyle = r === 18 ? '#d9f28d' : '#84c8bd'; pScan.lineWidth = 1; pScan.stroke(); }
      pScan.fillStyle = '#d9f28d'; pScan.fillRect(251, 44, 4, 4);
    }
    pRecon.clearRect(0, 0, s, s); pRecon.drawImage(blurredMicrograph, 0, 0);
    const fraction = pPositions.length ? pIndex / pPositions.length : 0;
    const reveal = Number($('resolution-range').value) / 100, split = s * reveal;
    pRecon.save(); pRecon.beginPath(); pRecon.rect(0, 0, split, s); pRecon.clip(); pRecon.drawImage(micrograph, 0, 0); pRecon.restore();
    if (split > 8 && split < s - 8) {
      pRecon.beginPath(); pRecon.moveTo(split, 0); pRecon.lineTo(split, s); pRecon.strokeStyle = '#e9f7dd'; pRecon.lineWidth = 2.5; pRecon.stroke();
      pRecon.beginPath(); pRecon.arc(split, s / 2, 18, 0, Math.PI * 2); pRecon.fillStyle = '#e9f7dd'; pRecon.fill();
      pRecon.fillStyle = '#163940'; pRecon.font = '700 17px system-ui'; pRecon.fillText('‹ ›', split - 12, s / 2 + 6);
    }
    if (split > 75) { pRecon.fillStyle = '#0b2732bd'; pRecon.fillRect(8, 9, 72, 21); pRecon.fillStyle = '#dcf7dc'; pRecon.font = '700 10px system-ui'; pRecon.fillText('HIGH RES', 16, 24); }
    if (split < 225) { pRecon.fillStyle = '#0b2732bd'; pRecon.fillRect(212, 9, 80, 21); pRecon.fillStyle = '#dcf7dc'; pRecon.font = '700 10px system-ui'; pRecon.fillText('LOW RES', 221, 24); }
    $('resolution-output').textContent = `${Math.round(reveal * 100)}% high resolution`;
    $('ptycho-positions').textContent = `${pIndex} / ${pPositions.length}`;
    $('ptycho-progress').textContent = `${Math.round(fraction * 100)}%`;
  }
  function resetPtycho() {
    if (ptychoTimer) { clearInterval(ptychoTimer); ptychoTimer = null; }
    pPositions = probePositions(); pIndex = 0;
    $('ptycho-status').textContent = 'Ready to scan';
    $('run-ptycho').disabled = false;
    $('run-ptycho').textContent = 'Animate scan ↗';
    drawPtycho();
  }
  $('overlap-range').addEventListener('input', () => { $('overlap-output').textContent = `${$('overlap-range').value}%`; resetPtycho(); });
  $('resolution-range').addEventListener('input', drawPtycho);
  const setResolutionFromPointer = (event) => {
    const rect = pRecon.canvas.getBoundingClientRect();
    $('resolution-range').value = String(Math.round(Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width)) * 100));
    drawPtycho();
  };
  pRecon.canvas.addEventListener('pointerdown', (event) => { pRecon.canvas.setPointerCapture(event.pointerId); setResolutionFromPointer(event); });
  pRecon.canvas.addEventListener('pointermove', (event) => { if (pRecon.canvas.hasPointerCapture(event.pointerId)) setResolutionFromPointer(event); });
  $('reset-ptycho').addEventListener('click', resetPtycho);
  $('run-ptycho').addEventListener('click', () => {
    resetPtycho(); $('run-ptycho').disabled = true; $('ptycho-status').textContent = 'Acquiring patterns';
    const interval = reducedMotion ? 8 : Math.max(16, 2000 / pPositions.length);
    ptychoTimer = setInterval(() => {
      pIndex = Math.min(pPositions.length, pIndex + 1); drawPtycho();
      if (pIndex === pPositions.length) { clearInterval(ptychoTimer); ptychoTimer = null; $('ptycho-status').textContent = 'Scan complete'; $('run-ptycho').disabled = false; $('run-ptycho').textContent = 'Scan again ↗'; }
    }, interval);
  });
  resetPtycho();

  // X-ray triangulation and XRR are schematic; no numerical metrology is implied.
  let xrayMode = 'triangulation';
  let singleView = false;
  function renderTriangulation() {
    const depth = Number($('depth-range').value);
    const sourceY = 64, detectorY = 301, featureX = 185, featureY = 130 + depth * 1.15;
    const hitA = 125 + (featureX - 125) * (detectorY - sourceY) / (featureY - sourceY);
    const hitB = 245 + (featureX - 245) * (detectorY - sourceY) / (featureY - sourceY);
    $('xray-feature').setAttribute('cy', featureY.toFixed(1));
    $('xray-ray-one').setAttribute('d', `M125 ${sourceY} ${featureX} ${featureY.toFixed(1)} ${hitA.toFixed(1)} ${detectorY}`);
    $('xray-ray-two').setAttribute('d', `M245 ${sourceY} ${featureX} ${featureY.toFixed(1)} ${hitB.toFixed(1)} ${detectorY}`);
    $('xray-hit-one').setAttribute('cx', hitA.toFixed(1)); $('xray-hit-two').setAttribute('cx', hitB.toFixed(1));
    [145, 190, 235].forEach((y, i) => {
      const ghost = $(`ghost-${['a', 'b', 'c'][i]}`);
      ghost.setAttribute('cx', (125 + (hitA - 125) * (y - sourceY) / (detectorY - sourceY)).toFixed(1));
      ghost.setAttribute('cy', y);
    });
    $('xray-depth-dot').setAttribute('cy', (110 + (depth - 10) * 2).toFixed(1));
    $('xray-feature').toggleAttribute('hidden', singleView);
    $('xray-ray-two').toggleAttribute('hidden', singleView);
    $('xray-hit-two').toggleAttribute('hidden', singleView);
    $('xray-ghosts').toggleAttribute('hidden', !singleView);
    $('xray-depth-dot').toggleAttribute('hidden', singleView);
    $('xray-depth-band').toggleAttribute('hidden', !singleView);
    $('xray-recon-heading').textContent = singleView ? 'One ray, many possible depths' : 'Two rays intersect at one depth';
    $('xray-depth-value').textContent = singleView ? 'Depth unresolved' : `Feature at ${depth}% relative depth`;
    $('depth-output').textContent = `${depth}%`;
    $('xray-status').textContent = singleView ? 'Depth ambiguous' : 'Depth localized';
    $('xray-help').textContent = singleView ? 'A single detector position locates the feature along one ray, leaving its depth ambiguous. Add another view to intersect the rays.' : 'The second projection intersects the first at the hidden feature. Move the depth control to see the detector parallax and recovered depth change together.';
    $('compare-view').textContent = singleView ? 'Add second view ↗' : 'Show single-view limit';
    $('compare-view').setAttribute('aria-pressed', String(singleView));
  }
  function drawReflectivity() {
    const canvas = $('xrr-canvas'), ctx = canvas.getContext('2d');
    const w = canvas.width, h = canvas.height, rough = Number($('roughness-range').value) / 10;
    $('roughness-output').textContent = `${rough.toFixed(1)} nm`;
    ctx.clearRect(0, 0, w, h); ctx.fillStyle = '#102c35'; ctx.fillRect(0, 0, w, h);
    const left = 68, right = w - 28, top = 35, bottom = h - 47;
    ctx.strokeStyle = '#366069'; ctx.lineWidth = 1;
    for (let i = 0; i <= 4; i++) { const y = top + i * (bottom - top) / 4; ctx.beginPath(); ctx.moveTo(left, y); ctx.lineTo(right, y); ctx.stroke(); }
    ctx.beginPath(); ctx.moveTo(left, top); ctx.lineTo(left, bottom); ctx.lineTo(right, bottom); ctx.strokeStyle = '#9ac8bc'; ctx.stroke();
    ctx.fillStyle = '#9dc8bd'; ctx.font = '11px system-ui'; ctx.fillText('log reflected intensity', 16, 18); ctx.fillText('incident angle / momentum transfer →', right - 207, h - 14);
    ctx.fillText('high', 17, top + 5); ctx.fillText('low', 22, bottom);
    ctx.beginPath();
    for (let i = 0; i <= 510; i++) {
      const t = i / 510;
      const envelope = Math.exp(-rough * t * 3.5);
      const fringe = Math.sin(t * 85) * envelope * 20;
      const y = top + 20 + t * (bottom - top - 35) + fringe;
      const x = left + t * (right - left);
      i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
    }
    ctx.strokeStyle = '#d8f28d'; ctx.lineWidth = 2.5; ctx.stroke();
    ctx.fillStyle = '#d8f28d'; ctx.fillText('schematic reflectivity', left + 12, top + 17);
  }
  function setXrayMode(mode) {
    xrayMode = mode;
    const tri = mode === 'triangulation';
    $('mode-triangulation').setAttribute('aria-pressed', String(tri)); $('mode-reflectivity').setAttribute('aria-pressed', String(!tri));
    $('depth-field').hidden = !tri; $('roughness-field').hidden = tri; $('view-compare-actions').hidden = !tri;
    $('triangulation-svg').toggleAttribute('hidden', !tri); $('xrr-canvas').hidden = tri;
    $('xray-stage-title').textContent = tri ? 'Triangulation / hidden feature depth' : 'X-ray reflectivity / smooth interfaces';
    $('xray-status').textContent = tri ? (singleView ? 'Depth ambiguous' : 'Depth localized') : 'Grazing-incidence scan';
    if (tri) renderTriangulation(); else $('xray-help').textContent = 'Increase roughness: the schematic high-angle fringes fade. Real XRR uses model fitting to estimate surface and interface roughness, thickness and density.';
    $('xray-note').textContent = tri ? 'Geometry is conceptual. Actual depth accuracy depends on source, detector, calibration, sample and acquisition geometry.' : 'Curve is illustrative, not measured or fitted data. XRR is particularly suited to smooth thin films and interfaces; results depend on the sample and model.';
    if (!tri) drawReflectivity();
  }
  $('mode-triangulation').addEventListener('click', () => setXrayMode('triangulation'));
  $('compare-view').addEventListener('click', () => { singleView = !singleView; renderTriangulation(); });
  $('mode-reflectivity').addEventListener('click', () => setXrayMode('reflectivity'));
  $('depth-range').addEventListener('input', renderTriangulation);
  $('roughness-range').addEventListener('input', drawReflectivity);
  renderTriangulation(); setXrayMode('triangulation');
})();
