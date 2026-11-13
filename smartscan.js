(() => {
  const canvas = document.getElementById('scan-workflow');
  const ctx = canvas.getContext('2d');
  const play = document.getElementById('scan-play');
  const reset = document.getElementById('scan-reset');
  const buttons = [...document.querySelectorAll('[data-scan-step]')];
  const panel = document.getElementById('panel-smartscan');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const titles = ['Plan the capture poses', 'Capture successive views', 'Acquire the missing surface', 'Align into common coordinates', 'Build the surface mesh', 'Extract the region of interest'];
  const descriptions = [
    'Position the scanner around the part and plan views of its surfaces.',
    'Each scanner pose adds a view of the housing. The acquired points appear in the reconstruction alongside the robot cell.',
    'Next-best-view selects a new angle on the uncaptured region. The scanner moves there and acquires the additional surface data.',
    'Coordinate transfer and registration bring the captured views into a common frame. Coloured patches converge on the same part.',
    'Fuse the registered observations into a surface mesh while retaining the housing’s central bore and flange geometry.',
    'Select the flange surface for extraction. The resulting geometry can be handed to downstream planning and inspection tools.'
  ];
  const colours = ['#8bd9cf', '#b6dba1', '#97b9ef', '#efb98c'];
  const durations = [2300, 5200, 3600, 3200, 2500, 2400];
  let step = 0, progress = 0, running = false, frame = 0, lastTime = 0, width = 1100, height = 490;
  const tau = Math.PI * 2;
  const clamp = v => Math.max(0, Math.min(1, v));
  const ease = v => { const t = clamp(v); return t * t * (3 - 2 * t); };
  const mix = (a, b, t) => a + (b - a) * t;
  const yaw = -.56;
  const sectors = 64;
  const surfaces = [
    { r0: 52, r1: 52, y0: -18, y1: 65, kind: 'wall', normal: 1 },
    { r0: 25, r1: 25, y0: -38, y1: 65, kind: 'bore', normal: -1 },
    { r0: 25, r1: 52, y0: 65, y1: 65, kind: 'rim', normal: 1 },
    { r0: 52, r1: 86, y0: -18, y1: -18, kind: 'flange', normal: 1 },
    { r0: 86, r1: 86, y0: -38, y1: -18, kind: 'edge', normal: 1 }
  ];
  const patches = [], triangles = [];
  function vertex(surface, a, t) {
    const r = mix(surface.r0, surface.r1, t), y = mix(surface.y0, surface.y1, t);
    const horizontal = surface.y0 === surface.y1;
    return { x: Math.cos(a) * r, y, z: Math.sin(a) * r, a,
      kind: surface.kind, group: Math.floor((a / tau) * 4) % 4,
      normal: horizontal ? { x: 0, y: 1, z: 0 } : { x: Math.cos(a) * surface.normal, y: 0, z: Math.sin(a) * surface.normal } };
  }
  surfaces.forEach(surface => {
    for (let i = 0; i < sectors; i++) for (let j = 0; j < 7; j++) {
      const a = i / sectors * tau, a2 = (i + 1) / sectors * tau;
      const one = vertex(surface, a, j / 7), two = vertex(surface, a2, j / 7);
      const three = vertex(surface, a2, (j + 1) / 7), four = vertex(surface, a, (j + 1) / 7);
      patches.push(one);
      triangles.push([one, two, three], [one, three, four]);
    }
  });
  function project(p, cx, cy, scale = 1.25) {
    const x = p.x * Math.cos(yaw) + p.z * Math.sin(yaw);
    const depth = -p.x * Math.sin(yaw) + p.z * Math.cos(yaw);
    return { x: cx + x * scale, y: cy + (depth * .43 - p.y * .91) * scale, depth };
  }
  function text(label, x, y, colour = '#9ebeb9', size = 11, weight = 600) {
    ctx.fillStyle = colour; ctx.font = `${weight} ${size}px system-ui`; ctx.fillText(label, x, y);
  }
  function line(a, b, colour, thickness = 1, dash = []) {
    ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.strokeStyle = colour; ctx.lineWidth = thickness; ctx.setLineDash(dash); ctx.stroke(); ctx.setLineDash([]);
  }
  function dot(p, radius, colour) { ctx.beginPath(); ctx.arc(p.x, p.y, radius, 0, tau); ctx.fillStyle = colour; ctx.fill(); }
  function floor(cx, cy, scale) {
    for (let i = -180; i <= 180; i += 30) {
      line(project({ x: i, y: -48, z: -140 }, cx, cy, scale), project({ x: i, y: -48, z: 140 }, cx, cy, scale), '#34515b66');
      line(project({ x: -180, y: -48, z: i }, cx, cy, scale), project({ x: 180, y: -48, z: i }, cx, cy, scale), '#34515b66');
    }
  }
  function visible(p) { const n = p.normal; return n.y * .91 + (-n.x * Math.sin(yaw) + n.z * Math.cos(yaw)) * .43 > -.02; }
  function mesh(cx, cy, scale, alpha = 1, selected = false, reveal = 1) {
    const sorted = triangles.filter(t => visible(t[0])).map(t => ({ t, d: t.reduce((sum, p) => sum + project(p, 0, 0).depth, 0) / 3 }));
    sorted.sort((a, b) => a.d - b.d);
    ctx.save(); ctx.globalAlpha = alpha;
    for (const { t } of sorted) {
      if ((t[0].a / tau) > reveal) continue;
      const points = t.map(p => project(p, cx, cy, scale));
      ctx.beginPath(); ctx.moveTo(points[0].x, points[0].y); ctx.lineTo(points[1].x, points[1].y); ctx.lineTo(points[2].x, points[2].y); ctx.closePath();
      const highlighted = selected && t[0].kind === 'flange';
      const shade = Math.round(28 + 28 * (Math.sin(t[0].a + yaw) + 1) / 2);
      ctx.fillStyle = highlighted ? '#d8a16f' : `rgb(${shade},${shade + 41},${shade + 44})`;
      ctx.fill(); ctx.strokeStyle = highlighted ? '#f3cc9566' : '#9bcdbb3c'; ctx.lineWidth = .5; ctx.stroke();
    }
    ctx.restore();
  }
  const captureOrder = [0, 1, 2];
  function captured(p) {
    if (step === 0) return false;
    if (step === 1) {
      const amount = progress * 3;
      const n = captureOrder.indexOf(p.group);
      return n >= 0 && (n + (p.a % (tau / 4)) / (tau / 4)) < amount;
    }
    if (step === 2) return p.group !== 3 || (progress > .48 && (p.a / tau - .75) * 4 < (progress - .48) / .52);
    return true;
  }
  function pointCloud(cx, cy, scale) {
    for (const p of patches) {
      if (!captured(p)) continue;
      const offset = step === 3 ? 1 - ease(progress) : step < 3 ? 1 : 0;
      const shifts = [{ x: -17, y: 8 }, { x: 9, y: -12 }, { x: 16, y: 8 }, { x: -9, y: -17 }];
      const pos = project(p, cx, cy, scale); pos.x += shifts[p.group].x * offset; pos.y += shifts[p.group].y * offset;
      ctx.globalAlpha = visible(p) ? .94 : .22;
      dot(pos, visible(p) ? 1.35 : .8, colours[p.group]);
    }
    ctx.globalAlpha = 1;
  }
  function scanAngle() {
    if (step === 0) return -.6;
    if (step === 1) return mix(-.6, 3.6, ease(progress));
    if (step === 2) return mix(3.6, 5.3, ease(progress * 2));
    return 5.3;
  }
  function drawRobot(cx, cy, scale) {
    const angle = scanAngle();
    const head3 = { x: Math.cos(angle) * 135, y: 140, z: Math.sin(angle) * 135 };
    const base3 = { x: -160, y: -42, z: -25 };
    const shoulder3 = { x: -160, y: 55, z: -25 };
    const elbow3 = { x: mix(-160, head3.x, .48) - 30, y: 205, z: mix(-25, head3.z, .48) };
    const base = project(base3, cx, cy, scale), shoulder = project(shoulder3, cx, cy, scale);
    const elbow = project(elbow3, cx, cy, scale), head = project(head3, cx, cy, scale);
    const target = project({ x: Math.cos(angle) * 45, y: 18, z: Math.sin(angle) * 45 }, cx, cy, scale);
    line({ x: base.x - 25, y: base.y + 5 }, { x: base.x + 25, y: base.y + 5 }, '#466a74', 14);
    for (const [a, b, thick] of [[base, shoulder, 18], [shoulder, elbow, 15], [elbow, head, 12]]) {
      line(a, b, '#5d8993', thick + 3); line(a, b, '#b4cdd0', thick);
    }
    [shoulder, elbow, head].forEach(p => { dot(p, 10, '#24444f'); dot(p, 5, '#adcbd0'); });
    const acquiring = (step === 1 && progress > 0) || (step === 2 && progress >= .48);
    if (acquiring) {
      const colour = step === 2 ? '#efb98c' : '#9be2cd';
      ctx.beginPath(); ctx.moveTo(head.x, head.y); ctx.lineTo(target.x - 32, target.y + 8); ctx.lineTo(target.x + 32, target.y + 8); ctx.closePath();
      ctx.fillStyle = colour + '20'; ctx.fill(); line(head, target, colour + 'aa', 1, [3, 5]);
      ctx.beginPath(); ctx.ellipse(target.x, target.y + 5, 32, 10, 0, 0, tau); ctx.strokeStyle = colour; ctx.lineWidth = 1.4; ctx.stroke();
    }
    ctx.save(); ctx.translate(head.x, head.y); ctx.rotate(Math.atan2(target.y - head.y, target.x - head.x) - Math.PI / 2);
    ctx.fillStyle = '#dce9e3'; ctx.fillRect(-19, -13, 38, 26); ctx.strokeStyle = '#8bb1b1'; ctx.strokeRect(-19, -13, 38, 26);
    ctx.fillStyle = '#18313d'; ctx.fillRect(-12, 8, 24, 8); dot({ x: 0, y: 14 }, 4, '#92d9cf'); ctx.restore();
  }
  function drawPath(cx, cy, scale) {
    const points = Array.from({ length: 40 }, (_, i) => {
      const a = -.6 + i / 39 * 4.2;
      return project({ x: Math.cos(a) * 135, y: 140, z: Math.sin(a) * 135 }, cx, cy, scale);
    });
    for (let i = 1; i < points.length; i++) line(points[i - 1], points[i], '#7eaaa77a', 1, [3, 4]);
    [0, 13, 26, 39].forEach(i => dot(points[i], 3, '#acd7c9'));
    if (step === 2) {
      const p = project({ x: Math.cos(5.3) * 135, y: 140, z: Math.sin(5.3) * 135 }, cx, cy, scale);
      ctx.beginPath(); ctx.arc(p.x, p.y, 13, 0, tau); ctx.strokeStyle = '#efb98c'; ctx.lineWidth = 1.4; ctx.stroke();
      text('NEXT VIEW', p.x - 34, p.y - 22, '#efc499', 10);
    }
  }
  function drawPane(kind, x, y, paneW, paneH) {
    ctx.save(); ctx.translate(x, y); ctx.beginPath(); ctx.rect(0, 0, paneW, paneH); ctx.clip();
    const s = Math.min(paneW / 550, paneH / 460); ctx.translate((paneW - 550 * s) / 2, (paneH - 460 * s) / 2); ctx.scale(s, s);
    const left = kind === 'cell', cx = left ? 325 : 270, cy = left ? 316 : 268, scale = left ? 1.12 : 1.65;
    text(left ? '01 / ROBOT CELL' : '02 / RECONSTRUCTED GEOMETRY', 26, 35, '#a9ccc1', 11, 750);
    text(left ? 'Capture poses → surface observations' : ['Waiting for scan data', 'Successive scan views', 'Additional surface capture', 'Common coordinate frame', 'Fused surface mesh', 'Selected flange surface'][step], 26, 57, '#799fa2', 11, 400);
    floor(cx, cy, left ? 1.05 : 1.35);
    if (left) {
      mesh(cx, cy, scale); drawPath(cx, cy, scale); drawRobot(cx, cy, scale);
      text('Physical part', 312, 412, '#b4ccc7', 11);
    } else {
      if (step === 0) {
        for (const p of patches.filter((_, i) => i % 5 === 0)) dot(project(p, cx, cy, scale), .8, '#38555f');
        text('Views appear as the scanner captures the part', 123, 411, '#849fa4', 11, 400);
      } else if (step < 4) {
        pointCloud(cx, cy, scale);
        if (step === 2 && progress < .65) {
          const p = project({ x: 65, y: -10, z: -35 }, cx, cy, scale);
          line(p, { x: 426, y: 135 }, '#efb98c', 1, [3, 3]); text('Uncaptured region', 353, 124, '#efc499', 11);
        }
        colours.forEach((colour, i) => { dot({ x: 160 + i * 67, y: 410 }, 3, colour); text(`View ${i + 1}`, 169 + i * 67, 414, '#9bbab6', 10, 400); });
      } else {
        if (step === 4 && progress < 1) pointCloud(cx, cy, scale);
        mesh(cx, cy, scale, 1, step === 5 && progress > .15, step === 4 ? progress : 1);
        if (step === 5 && progress > .4) {
          ctx.fillStyle = '#193a40'; ctx.fillRect(149, 388, 250, 37); ctx.strokeStyle = '#729487'; ctx.strokeRect(149, 388, 250, 37);
          text('Selected surface  →  Geometry export', 168, 411, '#d8eebc', 11);
        } else text('Registered geometry → surface mesh', 150, 413, '#b0ccc1', 11);
      }
    }
    ctx.restore();
  }
  function draw() {
    ctx.clearRect(0, 0, width, height);
    const bg = ctx.createLinearGradient(0, 0, width, height); bg.addColorStop(0, '#142f3b'); bg.addColorStop(1, '#081c28'); ctx.fillStyle = bg; ctx.fillRect(0, 0, width, height);
    const mobile = width < 680;
    if (mobile) {
      drawPane('cell', 0, 0, width, height / 2); drawPane('model', 0, height / 2, width, height / 2);
      line({ x: 20, y: height / 2 }, { x: width - 20, y: height / 2 }, '#426058');
    } else {
      drawPane('cell', 0, 0, width / 2, height); drawPane('model', width / 2, 0, width / 2, height);
      line({ x: width / 2, y: 25 }, { x: width / 2, y: height - 25 }, '#426058');
    }
    canvas.dataset.step = String(step); canvas.dataset.progress = progress.toFixed(2);
  }
  function updateLabels() {
    buttons.forEach((button, i) => button.setAttribute('aria-pressed', String(i === step)));
    document.getElementById('scan-stage-title').textContent = titles[step];
    document.getElementById('scan-stage-description').textContent = descriptions[step];
    canvas.setAttribute('aria-label', `${titles[step]}. ${descriptions[step]}`);
  }
  function pause() { running = false; cancelAnimationFrame(frame); play.textContent = step === 5 && progress >= 1 ? 'Replay workflow ↻' : 'Play workflow ▶'; }
  function tick(now) {
    if (!running) return;
    const elapsed = Math.min(100, now - lastTime); lastTime = now;
    progress = Math.min(1, progress + elapsed / durations[step]);
    draw();
    if (progress >= 1) {
      if (step === 5) { pause(); return; }
      step++; progress = 0; updateLabels();
    }
    frame = requestAnimationFrame(tick);
  }
  play.addEventListener('click', () => {
    if (reduced.matches) { pause(); step = step === 5 ? 0 : step + 1; progress = 1; updateLabels(); draw(); play.textContent = 'Next stage →'; return; }
    if (running) { pause(); return; }
    if (step === 5 && progress >= 1) { step = 0; progress = 0; }
    running = true; play.textContent = 'Pause workflow Ⅱ'; updateLabels(); lastTime = performance.now(); frame = requestAnimationFrame(tick);
  });
  reset.addEventListener('click', () => { pause(); step = 0; progress = 0; updateLabels(); draw(); play.textContent = reduced.matches ? 'Next stage →' : 'Play workflow ▶'; });
  buttons.forEach(button => button.addEventListener('click', () => { pause(); step = Number(button.dataset.scanStep); progress = reduced.matches ? 1 : .5; updateLabels(); draw(); }));
  function resize() {
    const rect = canvas.getBoundingClientRect(); if (!rect.width) return;
    width = rect.width; height = rect.height;
    const dpr = Math.min(devicePixelRatio || 1, 2); canvas.width = Math.round(width * dpr); canvas.height = Math.round(height * dpr); ctx.setTransform(dpr, 0, 0, dpr, 0, 0); draw();
  }
  new ResizeObserver(resize).observe(canvas);
  new MutationObserver(() => { if (panel.hidden) pause(); else resize(); }).observe(panel, { attributes: true, attributeFilter: ['hidden'] });
  document.addEventListener('visibilitychange', () => { if (document.hidden) pause(); });
  reduced.addEventListener('change', () => { pause(); play.textContent = reduced.matches ? 'Next stage →' : 'Play workflow ▶'; });
  if (reduced.matches) play.textContent = 'Next stage →';
  updateLabels(); resize();
})();
