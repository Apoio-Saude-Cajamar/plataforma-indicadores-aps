// Fundo decorativo: pontos que flutuam devagar, ligados por linhas finas, e se afastam do cursor.
(function () {
  const canvas = document.getElementById('rede');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const reduzir = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const cor = () => getComputedStyle(document.documentElement).getPropertyValue('--net').trim() || '32, 59, 143';
  let w = 0, h = 0, dpr = 1, pontos = [], rato = { x: -9999, y: -9999 };
  const DIST = 180, RAIO = 140;

  function redimensionar() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    w = window.innerWidth; h = window.innerHeight;
    canvas.width = w * dpr; canvas.height = h * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const n = Math.round(Math.min(90, (w * h) / 16000));
    pontos = Array.from({ length: n }, () => ({ x: Math.random() * w, y: Math.random() * h, vx: (Math.random() - .5) * .25, vy: (Math.random() - .5) * .25, ox: 0, oy: 0 }));
  }

  function quadro() {
    ctx.clearRect(0, 0, w, h);
    const c = cor();
    for (const p of pontos) {
      if (!reduzir) { p.x += p.vx; p.y += p.vy; if (p.x < 0 || p.x > w) p.vx *= -1; if (p.y < 0 || p.y > h) p.vy *= -1; }
      const dx = p.x - rato.x, dy = p.y - rato.y, d = Math.hypot(dx, dy);
      const alvoX = d < RAIO ? (dx / d) * (RAIO - d) * .35 : 0, alvoY = d < RAIO ? (dy / d) * (RAIO - d) * .35 : 0;
      p.ox += (alvoX - p.ox) * .08; p.oy += (alvoY - p.oy) * .08;
    }
    for (let i = 0; i < pontos.length; i++) {
      const a = pontos[i], ax = a.x + a.ox, ay = a.y + a.oy;
      for (let j = i + 1; j < pontos.length; j++) {
        const b = pontos[j], bx = b.x + b.ox, by = b.y + b.oy, d = Math.hypot(ax - bx, ay - by);
        if (d < DIST) { ctx.strokeStyle = `rgba(${c}, ${(1 - d / DIST) * .26})`; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.stroke(); }
      }
      ctx.fillStyle = `rgba(${c}, .35)`; ctx.beginPath(); ctx.arc(ax, ay, 1.6, 0, Math.PI * 2); ctx.fill();
    }
    if (!reduzir) requestAnimationFrame(quadro);
  }

  window.addEventListener('resize', () => { redimensionar(); if (reduzir) quadro(); });
  window.addEventListener('pointermove', e => { rato = { x: e.clientX, y: e.clientY }; });
  window.addEventListener('pointerleave', () => { rato = { x: -9999, y: -9999 }; });
  redimensionar();
  quadro();
})();
