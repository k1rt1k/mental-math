#!/usr/bin/env python3
"""Generates every app icon from one vector design, so they always match.

    python3 tools/make-icons.py          (needs: pip install pillow numpy playwright && playwright install chromium)

Design: "7x", the times table.  A big soft-serif 7 (Fraunces Black, the same family as the question numerals inside the app)
in cool white, with a gold x tucked into the empty pocket under its arm.  Gold is the app's reward colour; the 7 and the x
read as one lockup, a multiplication waiting to be answered.  The tile is a continuous-corner (Apple-style) squircle in
cobalt-to-indigo, with a barely-there graph grid fading out from the centre as a nod to the question board.

Lighting is one coherent top-left light: soft ambient shadow + tight contact shadow under the glyphs, a crisp top-edge
highlight and a soft bottom inner shade (so the 7 is slightly raised, never glossy), a warm glow behind the gold, a rim light
on the tile edge, and 1-LSB dither on export so the gradients never band.

Variants (each is optically adjusted, not just resized):
  round   icon.svg, icon-512, icon-192     transparent corners, full detail
  full    icon-maskable-512                full bleed, lockup shrunk so every part sits inside the 80% safe circle
  apple   apple-touch-icon (180)           full bleed (iOS applies its own mask), lockup slightly smaller
  small   favicon-32                       no grid / rim, bolder and larger lockup so it survives at 32 px
  badge   badge-96                         monochrome white-on-transparent for Android notifications (OS tints it)
  mono    icon-monochrome-512              same shapes inside the 66% safe zone, for Android 13+ themed icons

Glyph outlines are Fraunces (SIL Open Font License 1.1), pre-baked below, so no font is needed to run this.
Change colours / proportions in the constants at the top; icon.svg is written by this script, never hand-edited.
"""
import io, os, sys

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.normpath(os.path.join(HERE, '..', 'public'))

# ---- design constants (512 x 512 space) -------------------------------------------------------------------------------
TILE = ('#5C86FF', '#3446E0', '#181775')          # top-left -> centre -> bottom-right
SEVEN = dict(cx=211, cy=246, h=332)               # centre and height of the 7
TIMES = dict(cx=362, cy=364, h=140)               # centre and height of the gold x
SQUIRCLE = ('M328.8 0c64.126 0 96.189 0 120.682 12.48a114.5 114.5 0 0 1 50.038 50.038c12.48 24.493 12.48 56.556 12.48 120.682L512 328.8'
            'c0 64.126 0 96.189-12.48 120.682a114.5 114.5 0 0 1-50.038 50.038c-24.493 12.48-56.556 12.48-120.682 12.48L183.2 512'
            'c-64.126 0-96.189 0-120.682-12.48a114.5 114.5 0 0 1-50.038-50.038C0 424.99 0 392.93 0 328.8L0 183.2'
            'c0-64.126 0-96.189 12.48-120.682A114.5 114.5 0 0 1 62.518 12.48C87.011 0 119.074 0 183.2 0Z')
# glyphs: centred on (0,0), y-down, 1000 units tall (so gradients run the right way up)
G7 = {'d': ('M117.4 -251.4 175.9 -240.1H-141Q-175.5 -240.1 -189.9 -228.2Q-204.4 -216.2 -210.7 -186.6L-222.7 -130.3Q-229 -100 -246.6 -83.5'
            'Q-264.2 -66.9 -295.2 -66.9Q-330.4 -66.9 -348 -88.4Q-365.7 -109.9 -362.8 -152.8L-348 -412.7Q-345.9 -452.1 -323.7 -476.1'
            'Q-301.6 -500 -262.8 -500H259Q309 -500 336.1 -474.6Q363.2 -449.3 363.2 -407.7Q363.2 -383.8 349.1 -354.9Q335.1 -326.1 297.7 -281.7'
            'L202 -167.6Q161.1 -118.3 136.1 -83.1Q111.1 -47.9 98.4 -20.8Q85.8 6.3 81.5 31Q77.3 55.6 77.3 83.1Q77.3 122.5 89.3 152.5'
            'Q101.3 182.4 116.4 208.8Q131.5 235.2 143.5 264.4Q155.5 293.7 155.5 332.4Q155.5 399.3 107.9 449.6Q60.4 500 -42.4 500'
            'Q-134.7 500 -186.1 446.5Q-237.5 393 -237.5 300Q-237.5 239.4 -217.1 177.1Q-196.6 114.8 -147 42.3Q-97.3 -30.3 -9.3 -121.1Z'),
      'w': 726.4}
GX = {'d': ('M-427.3 457.5Q-517.5 363.8 -422.6 264.4L246.9 -457.2Q286.2 -498.8 332.4 -500Q378.7 -501.1 423.8 -453.7Q470 -406.3 471.2 -364.1'
            'Q472.4 -321.9 425 -272.2L-245.7 451.7Q-288.5 495.6 -335.3 499.7Q-382.2 503.7 -427.3 457.5ZM426.1 456.3Q383.3 500.3 332.4 496.2'
            'Q281.6 492.2 246.9 456.3L-427.3 -269.9Q-468.9 -313.8 -468.3 -362.9Q-467.7 -412.1 -425 -454.9Q-338.2 -545.1 -251.5 -453.7'
            'L430.7 280.5Q470 319.9 468.9 366.7Q467.7 413.5 426.1 456.3Z'),
      'w': 942.5}

VARIANTS = {   # shape, lockup scale, grid, rim, lockup shift
    'round': dict(clip=True, k=1.00, grid=True, rim=True, dy=0),
    'full': dict(clip=False, k=0.80, grid=True, rim=False, dy=0),
    'apple': dict(clip=False, k=0.94, grid=True, rim=False, dy=0),
    'small': dict(clip=True, k=1.20, grid=False, rim=False, dy=-2),
}


def _use(g, spec, fill, extra=''):
    s = spec['h'] / 1000.0
    return f'<path d="{g["d"]}" transform="translate({spec["cx"]} {spec["cy"]}) scale({s:.5f})" fill="{fill}" {extra}/>'


def svg(variant='round', size=512, uid=''):
    """The full icon as an SVG string. `uid` keeps ids unique when several are inlined in one page."""
    if variant == 'badge':
        return badge_svg(size)
    v = VARIANTS[variant]; u = uid
    k, dy = v['k'], v['dy']
    xform = f'translate(256 {256 + dy}) scale({k}) translate(-256 -256)'
    lines = ''.join(f'M{i} 0V512M0 {i}H512' for i in range(64, 512, 64))
    seven_flat = lambda f: _use(G7, SEVEN, f)
    times_flat = lambda f: _use(GX, TIMES, f)
    shadow = '#060B52'
    clip_attr = f' clip-path="url(#cp{u})"' if v['clip'] else ''
    parts = [f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="{size}" height="{size}" role="img" aria-label="Mental Math"><defs>
<linearGradient id="bg{u}" x1=".14" y1="0" x2=".86" y2="1"><stop offset="0" stop-color="{TILE[0]}"/><stop offset=".46" stop-color="{TILE[1]}"/><stop offset="1" stop-color="{TILE[2]}"/></linearGradient>
<radialGradient id="glow{u}" cx=".27" cy="-.02" r=".95"><stop offset="0" stop-color="#fff" stop-opacity=".22"/><stop offset=".55" stop-color="#fff" stop-opacity="0"/></radialGradient>
<radialGradient id="vig{u}" cx=".5" cy=".5" r=".76"><stop offset=".55" stop-color="#02052e" stop-opacity="0"/><stop offset="1" stop-color="#02052e" stop-opacity=".38"/></radialGradient>
<radialGradient id="gm{u}" cx=".5" cy=".42" r=".62"><stop offset="0" stop-color="#fff"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient>
<mask id="gk{u}"><rect width="512" height="512" fill="url(#gm{u})"/></mask>
<linearGradient id="wh{u}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff"/><stop offset=".34" stop-color="#eef2ff"/><stop offset=".72" stop-color="#cbd8ff"/><stop offset="1" stop-color="#9db6f6"/></linearGradient>
<linearGradient id="gd{u}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffeaa8"/><stop offset=".5" stop-color="#ffc94a"/><stop offset="1" stop-color="#ff9b17"/></linearGradient>
<radialGradient id="gg{u}"><stop offset="0" stop-color="#ffc24a" stop-opacity=".2"/><stop offset="1" stop-color="#ffc24a" stop-opacity="0"/></radialGradient>
<linearGradient id="rim{u}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".5"/><stop offset=".22" stop-color="#fff" stop-opacity="0"/><stop offset=".86" stop-color="#fff" stop-opacity="0"/><stop offset="1" stop-color="#fff" stop-opacity=".1"/></linearGradient>
<filter id="amb{u}" x="-40%" y="-40%" width="180%" height="190%"><feGaussianBlur stdDeviation="16"/></filter>
<filter id="con{u}" x="-20%" y="-20%" width="140%" height="150%"><feGaussianBlur stdDeviation="4"/></filter>
<filter id="bw{u}" x="-10%" y="-10%" width="120%" height="120%" color-interpolation-filters="sRGB"><feOffset in="SourceAlpha" dy="5" result="o"/><feComposite in="SourceAlpha" in2="o" operator="out" result="t"/><feGaussianBlur in="t" stdDeviation="1.4" result="tb"/><feFlood flood-color="#fff" flood-opacity=".9"/><feComposite in2="tb" operator="in" result="hl"/><feOffset in="SourceAlpha" dy="-7" result="o2"/><feComposite in="SourceAlpha" in2="o2" operator="out" result="b"/><feGaussianBlur in="b" stdDeviation="3.5" result="bb"/><feFlood flood-color="#2a3a98" flood-opacity=".5"/><feComposite in2="bb" operator="in" result="sd"/><feMerge><feMergeNode in="SourceGraphic"/><feMergeNode in="sd"/><feMergeNode in="hl"/></feMerge></filter>
<filter id="bg2{u}" x="-10%" y="-10%" width="120%" height="120%" color-interpolation-filters="sRGB"><feOffset in="SourceAlpha" dy="4" result="o"/><feComposite in="SourceAlpha" in2="o" operator="out" result="t"/><feGaussianBlur in="t" stdDeviation="1.2" result="tb"/><feFlood flood-color="#fff6d6" flood-opacity=".95"/><feComposite in2="tb" operator="in" result="hl"/><feOffset in="SourceAlpha" dy="-5" result="o2"/><feComposite in="SourceAlpha" in2="o2" operator="out" result="b"/><feGaussianBlur in="b" stdDeviation="2.6" result="bb"/><feFlood flood-color="#c2540a" flood-opacity=".5"/><feComposite in2="bb" operator="in" result="sd"/><feMerge><feMergeNode in="SourceGraphic"/><feMergeNode in="sd"/><feMergeNode in="hl"/></feMerge></filter>
<radialGradient id="sheen{u}"><stop offset="0" stop-color="#fff" stop-opacity=".95"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient>
<clipPath id="c7{u}">{_use(G7, SEVEN, "#000")}</clipPath><clipPath id="cp{u}"><path d="{SQUIRCLE}"/></clipPath></defs>''']
    parts.append(f'<g{clip_attr}>')
    parts.append(f'<rect width="512" height="512" fill="url(#bg{u})"/>')
    if v['grid']:
        parts.append(f'<path d="{lines}" stroke="#c4d4ff" stroke-opacity=".075" stroke-width="1.5" fill="none" mask="url(#gk{u})"/>')
    parts.append(f'<rect width="512" height="512" fill="url(#glow{u})"/><rect width="512" height="512" fill="url(#vig{u})"/>')
    parts.append(f'<g transform="{xform}">')
    both = lambda f7, fx: seven_flat(f7) + times_flat(fx)
    parts.append(f'<g filter="url(#amb{u})" opacity=".5" transform="translate(0 18)">{both(shadow, shadow)}</g>')
    parts.append(f'<g filter="url(#con{u})" opacity=".38" transform="translate(0 5)">{both(shadow, shadow)}</g>')
    parts.append(f'<g filter="url(#bw{u})">{seven_flat(f"url(#wh{u})")}</g>')
    parts.append(f'<g clip-path="url(#c7{u})"><ellipse cx="{SEVEN["cx"] - 70}" cy="{SEVEN["cy"] - 118}" rx="120" ry="62" fill="url(#sheen{u})" opacity=".55" transform="rotate(-18 {SEVEN["cx"] - 70} {SEVEN["cy"] - 118})"/></g>')
    gx, gy, gr = TIMES['cx'], TIMES['cy'], TIMES['h'] * .78
    parts.append(f'<circle cx="{gx}" cy="{gy}" r="{gr:.0f}" fill="url(#gg{u})"/>')
    parts.append(f'<g filter="url(#bg2{u})">{times_flat(f"url(#gd{u})")}</g>')
    parts.append('</g>')
    if v['rim']:
        parts.append(f'<path d="{SQUIRCLE}" fill="none" stroke="url(#rim{u})" stroke-width="3" transform="translate(256 256) scale(.988) translate(-256 -256)"/>')
    parts.append('</g></svg>')
    return ''.join(parts)


def badge_svg(size=96, k=1.36):
    """Monochrome 7x (pure white shapes, no effects). k=1.36 fills the notification badge; k=.66 fits the 66% themed-icon safe zone."""
    s7 = dict(SEVEN, cx=SEVEN['cx'] - 8, cy=SEVEN['cy'] - 2); sx = dict(TIMES, cx=TIMES['cx'] - 2, cy=TIMES['cy'] + 4)
    xform = f'translate(256 256) scale({k}) translate(-256 -256) translate(-6 0)'
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="{size}" height="{size}"><g transform="{xform}">'
            f'{_use(G7, s7, "#fff")}{_use(GX, sx, "#fff")}</g></svg>')


# ---- rendering --------------------------------------------------------------------------------------------------------
def render(svg_str, px, transparent=True):
    """SVG -> PIL RGBA at px x px, via headless Chromium (full filter support), rendered at 2x then Lanczos-reduced."""
    from playwright.sync_api import sync_playwright
    from PIL import Image
    ss = px * 2 if px >= 512 else max(px * 2, 512)
    svg_big = svg_str.replace(f'width="{px}"', f'width="{ss}"', 1).replace(f'height="{px}"', f'height="{ss}"', 1)
    html = f'<html><body style="margin:0;background:transparent">{svg_big}</body></html>'
    with sync_playwright() as p:
        b = p.chromium.launch(); pg = b.new_page(viewport={'width': ss, 'height': ss}, device_scale_factor=1)
        pg.set_content(html); pg.wait_for_timeout(200)
        png = pg.screenshot(omit_background=transparent, clip={'x': 0, 'y': 0, 'width': ss, 'height': ss}); b.close()
    im = Image.open(io.BytesIO(png)).convert('RGBA')
    return im.resize((px, px), Image.LANCZOS) if ss != px else im


def dither(im, seed=7):
    """+-1 LSB noise on colour so smooth gradients never band on 8-bit screens (alpha untouched)."""
    import numpy as np
    from PIL import Image
    a = np.asarray(im, np.float32).copy()
    a[..., :3] += np.random.default_rng(seed).uniform(-1.1, 1.1, a.shape[:2] + (1,))
    return Image.fromarray(np.clip(a + .5, 0, 255).astype(np.uint8), 'RGBA')


def main():
    try:
        import playwright, PIL, numpy  # noqa: F401
    except ImportError as e:
        sys.exit(f'missing dependency ({e.name}). Run: pip install pillow numpy playwright && playwright install chromium')
    from PIL import Image
    with open(f'{OUT}/icon.svg', 'w') as f: f.write(svg('round', 512))
    big = dither(render(svg('round', 512), 512))                      # rendered at 1024 internally, reduced to 512
    big.save(f'{OUT}/icon-512.png', optimize=True)
    big.resize((192, 192), Image.LANCZOS).save(f'{OUT}/icon-192.png', optimize=True)
    dither(render(svg('full', 512), 512), 3).convert('RGB').save(f'{OUT}/icon-maskable-512.png', optimize=True)
    dither(render(svg('apple', 180), 180), 5).convert('RGB').save(f'{OUT}/apple-touch-icon.png', optimize=True)
    render(svg('small', 32), 32).save(f'{OUT}/favicon-32.png', optimize=True)
    render(badge_svg(96), 96).save(f'{OUT}/badge-96.png', optimize=True)
    render(badge_svg(512, .66), 512).save(f'{OUT}/icon-monochrome-512.png', optimize=True)
    print('icons written to', OUT)


if __name__ == '__main__':
    main()
