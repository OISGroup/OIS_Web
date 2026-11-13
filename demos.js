(() => {
  const $ = (id) => document.getElementById(id);
  const tabs = [...document.querySelectorAll('.demo-tab')];
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function activateTab(tab, focus = false) {
    tabs.forEach((item) => {
      const active = item === tab;
      item.setAttribute('aria-selected', String(active));
      item.tabIndex = active ? 0 : -1;
      $(item.getAttribute('aria-controls')).hidden = !active;
    });
    history.replaceState(null, '', `#${tab.getAttribute('aria-controls')}`);
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

  // Confocal specifications and qualitative fringe-projection controls.
  const lenses = {
    confocal: [
      { name: '10× objective', one: '10×', two: '3 µm', three: '840 × 700 µm' },
      { name: '20× objective', one: '20×', two: '1 µm', three: 'Not specified' }
    ],
    scanner: [
      { name: 'Coarse fringes', one: 'Structured light', two: 'Fringe phase', three: '3D point cloud', cycles: 5 },
      { name: 'Medium fringes', one: 'Structured light', two: 'Fringe phase', three: '3D point cloud', cycles: 8 },
      { name: 'Fine fringes', one: 'Structured light', two: 'Fringe phase', three: '3D point cloud', cycles: 12 }
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
  function drawConfocal(ctx, height) {
    // Fixed optics and simultaneous illumination: no lateral or axial scan.
    opticsText(ctx, 'FULL-FIELD DISPERSIVE OPTICS', 42, 32, '#c4e5dc', 11);
    opticsLens(ctx, 230, 91, 90);
    const colours = ['#a590fa', '#79baf7', '#88d9b4', '#e7dc82', '#eea68d'];
    colours.forEach((colour, i) => {
      const y = 165 + i * 23;
      opticsLine(ctx, 85, y, 399, y, colour + '88', 1, [4, 5]);
      for (let x = 115; x <= 355; x += 60) {
        opticsLine(ctx, x - 18, 116, x, y, colour + '77');
        opticsLine(ctx, x + 18, 116, x, y, colour + '77');
      }
    });
    const surfaceY = 257 - height * .8;
    ctx.beginPath(); ctx.moveTo(70, 290); ctx.lineTo(70, surfaceY);
    ctx.lineTo(180, surfaceY); ctx.lineTo(180, surfaceY - 16);
    ctx.lineTo(280, surfaceY - 16); ctx.lineTo(280, surfaceY);
    ctx.lineTo(410, surfaceY); ctx.lineTo(410, 290); ctx.closePath();
    ctx.fillStyle = '#264f53'; ctx.fill(); ctx.strokeStyle = '#c3e6d7'; ctx.lineWidth = 2; ctx.stroke();
    opticsText(ctx, 'SURFACE HEIGHT ENCODED IN COLOUR', 42, 316, '#b5d7cc', 10);
    opticsText(ctx, 'Fixed optics / no axial scan', 42, 336, '#9fcbbf', 10);
    ctx.fillStyle = '#0d2831'; ctx.fillRect(457, 39, 170, 270);
    ctx.strokeStyle = '#4d8075'; ctx.strokeRect(457, 39, 170, 270);
    const captured = opticsProgress >= .25, reconstructed = opticsProgress >= .75;
    opticsText(ctx, reconstructed ? '3D SURFACE' : 'COLOUR IMAGE', 471, 58, '#c4e5dc', 11);
    // Every cell appears together in the captured frame, then becomes a height map.
    for (let row = 0; row < 12; row++) for (let col = 0; col < 14; col++) {
      const step = col > 4 && col < 9 ? 1 : 0;
      const x = 472 + col * 9 + (reconstructed ? row * 1.5 : 0);
      const y = 88 + row * 13 - (reconstructed ? step * 20 : 0);
      ctx.fillStyle = captured ? colours[Math.max(0, Math.min(4, Math.round((100 - height) / 25) - step))] : '#24464c';
      ctx.fillRect(x, y, 8, 11);
    }
    opticsText(ctx, reconstructed ? 'HEIGHT RECONSTRUCTED' : captured ? 'ONE FRAME CAPTURED' : 'READY FOR ONE SHOT', 467, 294, '#d9f28d', 9);
  }
  function drawScanner(ctx, height, patternIndex) {
    const cycles = lenses.scanner[patternIndex].cycles;
    const reconstructing = opticsProgress >= .7;
    const phase = Math.floor(Math.min(opticsProgress, .69) * 12) * Math.PI / 2;
    const relief = (u, v) => .18 + (height / 100) * .7 * Math.exp(-(((u - .53) / .23) ** 2 + ((v - .47) / .29) ** 2));
    opticsText(ctx, 'FULL-FIELD FRINGE PROJECTION', 30, 30, '#c4e5dc', 11);
    ctx.fillStyle = '#b9d6d0'; ctx.fillRect(188, 56, 60, 35);
    ctx.fillStyle = '#20434a'; ctx.fillRect(204, 84, 28, 12);
    opticsText(ctx, 'PROJECTOR', 188, 48, '#a6ccc1', 9);
    for (const x of [72, 340]) {
      ctx.fillStyle = '#325b63'; ctx.fillRect(x, 59, 43, 31);
      ctx.strokeStyle = '#a6dbd0'; ctx.strokeRect(x, 59, 43, 31);
      ctx.beginPath(); ctx.arc(x + 21, 92, 6, 0, Math.PI * 2); ctx.fillStyle = '#b5e9d9'; ctx.fill();
      opticsText(ctx, 'CAMERA', x, 49, '#a6ccc1', 9);
    }
    ctx.beginPath(); ctx.moveTo(218, 96); ctx.lineTo(45, 155); ctx.lineTo(409, 155); ctx.closePath(); ctx.fillStyle = '#a5e4d413'; ctx.fill();
    opticsLine(ctx, 218, 96, 45, 155, '#9accc666', 1);
    opticsLine(ctx, 218, 96, 409, 155, '#9accc666', 1);
    // A synthetic surface modulates the spatial phase of a full-field pattern.
    const left = 45, top = 155, w = 364, h = 143;
    for (let y = 0; y < h; y += 3) for (let x = 0; x < w; x += 3) {
      const u = x / w, v = y / h;
      const signal = .5 + .5 * Math.cos(2 * Math.PI * cycles * (u + relief(u, v) * .08) + phase);
      const value = Math.round(35 + signal * 170);
      ctx.fillStyle = `rgb(${Math.round(value * .76)},${value},${Math.min(255, value + 15)})`; ctx.fillRect(left + x, top + y, 3, 3);
    }
    ctx.strokeStyle = '#92bfb4'; ctx.strokeRect(left, top, w, h);
    opticsLine(ctx, 93, 98, 155, 155, '#8ac9c0aa', 1, [4, 4]);
    opticsLine(ctx, 361, 98, 300, 155, '#8ac9c0aa', 1, [4, 4]);
    opticsText(ctx, 'FRINGE DEFORMATION OVER THE SURFACE', 45, 319, '#b5d7cc', 10);
    opticsText(ctx, 'Pattern sequence → calibrated 3D reconstruction', 45, 337, '#9fcbbf', 9);
    ctx.fillStyle = '#0d2831'; ctx.fillRect(457, 39, 170, 270);
    ctx.strokeStyle = '#4d8075'; ctx.strokeRect(457, 39, 170, 270);
    opticsText(ctx, reconstructing ? '3D POINT CLOUD' : 'CAMERA PATTERN', 468, 58, '#c4e5dc', 10);
    if (reconstructing) {
      for (let row = 0; row < 18; row++) for (let col = 0; col < 25; col++) {
        const u = col / 24, v = row / 17;
        const x = 476 + u * 103 + v * 24, y = 153 + v * 100 - relief(u, v) * 66;
        ctx.beginPath(); ctx.arc(x, y, 1.15, 0, Math.PI * 2); ctx.fillStyle = relief(u, v) > .45 ? '#d6ed9c' : '#9edbcb'; ctx.fill();
      }
    } else {
      ctx.drawImage(ctx.canvas, left, top, w, h, 468, 100, 148, 120);
    }
    opticsText(ctx, reconstructing ? 'CALIBRATED GEOMETRY' : opticsProgress > 0 ? 'PATTERN ACQUISITION' : 'READY TO ACQUIRE', 467, 294, '#d9f28d', 9);
  }
  function renderOptics() {
    const confocal = opticsMode === 'confocal';
    $('mode-confocal').setAttribute('aria-pressed', String(confocal)); $('mode-scanner').setAttribute('aria-pressed', String(!confocal));
    $('optics-stage-title').textContent = confocal ? 'Chromatic confocal / full-field capture' : 'Fringe projection / structured light';
    $('optics-caption').textContent = confocal ? 'Longitudinal chromatic dispersion encodes axial position in the returned colour signal. Calibration reconstructs surface topography from a single full-field image.' : 'Projected fringes encode surface geometry. Camera observations are decoded and combined with geometric calibration to reconstruct a dense 3D point cloud.';
    $('optics-note').textContent = confocal ? 'Wavelength-dependent focus and colour-to-height calibration determine the axial measurement response.' : 'The spatial fringe phase and calibrated projection / camera geometry determine surface depth.';
    $('optics-title').textContent = confocal ? 'Chromatic confocal metrology' : 'Fringe-projection 3D scanning';
    $('optics-description').textContent = confocal ? 'A dispersive optical system focuses different wavelengths at different depths. The returned colour signal is calibrated to surface height, enabling full-field 3D measurement without axial mechanical scanning.' : 'A projector illuminates the object with fringe patterns. Cameras record their deformation, and calibrated reconstruction converts the image data into 3D surface coordinates.';
    $('optics-select-label').textContent = confocal ? 'Objective' : 'Fringe spacing';
    const index = Number($('lens-select').value), lens = lenses[opticsMode][index];
    const labels = confocal ? ['Magnification', 'Axial performance', 'Field of view'] : ['Illumination', 'Encoding', 'Output'];
    ['one', 'two', 'three'].forEach((part, i) => { $(`spec-${part}-label`).textContent = labels[i]; $(`spec-${part}`).textContent = lens[part]; });
    const focus = Number($('focus-range').value);
    $('focus-label').textContent = 'Relative surface height';
    $('focus-output').textContent = focus < 35 ? 'Low' : focus > 65 ? 'High' : 'Middle';
    opticsCanvas.setAttribute('aria-label', confocal ? 'Schematic of simultaneous full-field colour capture and calibrated height reconstruction' : 'Schematic full-field fringe projection, camera pattern acquisition and calibrated point-cloud reconstruction');
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
    $('lens-select').value = mode === 'confocal' ? '0' : '1'; $('optics-play').textContent = mode === 'confocal' ? 'Capture one full field ↗' : 'Acquire fringe patterns ↗'; renderOptics();
  }
  $('mode-confocal').addEventListener('click', () => setOpticsMode('confocal'));
  $('mode-scanner').addEventListener('click', () => setOpticsMode('scanner'));
  $('lens-select').addEventListener('change', () => { stopOptics(); opticsProgress = 0; renderOptics(); });
  $('focus-range').addEventListener('input', () => { stopOptics(); opticsProgress = 0; renderOptics(); });
  $('optics-play').addEventListener('click', () => {
    stopOptics(); opticsProgress = 0; $('optics-play').disabled = true;
    opticsTimer = setInterval(() => {
      opticsProgress = Math.min(1, opticsProgress + (reducedMotion ? .12 : .025));
      $('optics-status').textContent = opticsMode === 'confocal' ? (opticsProgress < .25 ? 'Capturing full field' : opticsProgress < .75 ? 'Colour-to-height calibration' : '3D surface reconstructed') : (opticsProgress < .7 ? 'Acquiring fringe patterns' : 'Reconstructing 3D coordinates');
      renderOptics();
      if (opticsProgress >= 1) { stopOptics(); $('optics-status').textContent = 'Acquisition complete'; $('optics-play').textContent = 'Replay acquisition ↗'; }
    }, reducedMotion ? 20 : 55);
  });
  setOpticsMode('confocal');
  function openDemoFromHash() {
    const tab = tabs.find(item => `#${item.getAttribute('aria-controls')}` === location.hash);
    if (!tab) return;
    activateTab(tab);
    $(tab.getAttribute('aria-controls')).scrollIntoView({ behavior: 'instant', block: 'start' });
  }
  document.querySelectorAll('[data-open-optics]').forEach(link => link.addEventListener('click', () => {
    activateTab($('tab-optics'));
    setOpticsMode('confocal');
  }));
  window.addEventListener('hashchange', openDemoFromHash);
  openDemoFromHash();

})();
