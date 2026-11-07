// Session share card: draws a 1080x1350 PNG with a canvas (no libraries, nothing leaves the device until the person shares it).
const W = 1080, H = 1350;

/** d: { tag, big, bigLabel, rows: [[label, value], ...up to 4], streak, best } */
export function drawCard(d, canvas = document.createElement('canvas')) {
  canvas.width = W; canvas.height = H;
  const g = canvas.getContext('2d'), css = getComputedStyle(document.documentElement);
  const ac = (css.getPropertyValue('--ac') || '#6ea8ff').trim() || '#6ea8ff', gd = '#f2c14e';
  const bg = g.createLinearGradient(0, 0, W, H); bg.addColorStop(0, '#0c1017'); bg.addColorStop(1, '#16213a');
  g.fillStyle = bg; g.fillRect(0, 0, W, H);
  const glow = g.createRadialGradient(W * 0.75, 260, 20, W * 0.75, 260, 620); glow.addColorStop(0, ac); glow.addColorStop(1, 'rgba(0,0,0,0)');
  g.globalAlpha = 0.4; g.fillStyle = glow; g.fillRect(0, 0, W, H); g.globalAlpha = 1;
  const sans = '"Inter", system-ui, -apple-system, "Segoe UI", sans-serif', serif = '"Fraunces", Georgia, serif';
  g.textBaseline = 'alphabetic';
  g.fillStyle = d.best ? gd : '#9aa7c0'; g.font = `700 40px ${sans}`; g.fillText((d.best ? '★ ' : '') + String(d.tag || 'Session').toUpperCase(), 80, 150);
  g.fillStyle = '#ffffff';
  let bs = 280; g.font = `600 ${bs}px ${serif}`;
  while (bs > 90 && g.measureText(String(d.big)).width > W - 140) { bs -= 10; g.font = `600 ${bs}px ${serif}`; }   // a skill name is wider than a day count
  g.fillText(String(d.big), 70, 520);
  g.fillStyle = '#9aa7c0'; g.font = `500 44px ${sans}`; g.fillText(String(d.bigLabel || ''), 80, 590);
  const rows = (d.rows || []).slice(0, 4), cw = (W - 160 - 30 * (rows.length - 1)) / Math.max(1, rows.length);
  rows.forEach(([l, v], i) => {
    const x = 80 + i * (cw + 30);
    g.fillStyle = 'rgba(255,255,255,.07)'; g.beginPath(); g.roundRect(x, 700, cw, 220, 28); g.fill();
    g.fillStyle = '#ffffff'; g.font = `700 64px ${sans}`; g.fillText(String(v), x + 28, 810);
    g.fillStyle = '#9aa7c0'; g.font = `500 30px ${sans}`; g.fillText(String(l), x + 28, 872);
  });
  if (d.streak) { g.fillStyle = gd; g.font = `700 52px ${sans}`; g.fillText(d.streak + '-day streak', 80, 1040); }
  g.fillStyle = '#6f7c96'; g.font = `500 34px ${sans}`; g.fillText('Mental Math Trainer', 80, 1250);
  return canvas;
}

export const toBlob = (canvas) => new Promise((res) => canvas.toBlob(res, 'image/png'));

/** Share the image where the browser allows files, otherwise download it. Returns 'shared' | 'saved' | 'cancelled'. */
export async function shareCard(d) {
  const blob = await toBlob(drawCard(d)), file = new File([blob], 'mental-math-result.png', { type: 'image/png' });
  try {
    if (navigator.canShare && navigator.canShare({ files: [file] })) { await navigator.share({ files: [file] }); return 'shared'; }
  } catch (e) { if (e && e.name == 'AbortError') return 'cancelled'; }
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = file.name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  return 'saved';
}
