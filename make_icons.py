from PIL import Image, ImageDraw, ImageFilter
import math, random

SS = 2048  # supersample canvas
OUT = 1024

def lerp(a,b,t): return int(a+(b-a)*t)

def bg(size):
    img = Image.new('RGBA',(size,size),(0,0,0,0))
    d = ImageDraw.Draw(img)
    for y in range(size):
        t = y/(size-1)
        # deep warm brown to near black
        r = lerp(30, 9, t)
        g = lerp(20, 6, t)
        b = lerp(12, 4, t)
        d.line([(0,y),(size,y)], fill=(r,g,b,255))
    # warm central glow
    glow = Image.new('L',(size,size),0)
    gd = ImageDraw.Draw(glow)
    gd.ellipse([size*.10,size*.02,size*.90,size*.86], fill=150)
    glow = glow.filter(ImageFilter.GaussianBlur(size*.10))
    warm = Image.new('RGBA',(size,size),(120,78,22,255))
    img = Image.composite(Image.blend(img,warm,.22), img, glow)
    # stars
    random.seed(7)
    d = ImageDraw.Draw(img)
    for _ in range(70):
        x = random.uniform(size*.03,size*.97); y = random.uniform(size*.03,size*.97)
        rr = random.uniform(size*.0015,size*.005)
        a = random.randint(40,150)
        d.ellipse([x-rr,y-rr,x+rr,y+rr], fill=(255,226,160,a))
    return img

def shield_poly(cx, cy, w, h):
    # shield centred at cx, top at cy-h/2
    top = cy - h*.5
    return [
        (cx-w*.5, top),
        (cx+w*.5, top),
        (cx+w*.5, top+h*.54),
        (cx, top+h),
        (cx-w*.5, top+h*.54),
    ]

def build_content(size):
    layer = Image.new('RGBA',(size,size),(0,0,0,0))
    d = ImageDraw.Draw(layer)
    cx = size*.5
    # outer ring
    ring_inset = size*.075
    ring_box = [ring_inset,ring_inset,size-ring_inset,size-ring_inset]
    d.ellipse(ring_box, outline=(201,162,39,235), width=int(size*.012))
    d.ellipse([ring_inset+size*.012,ring_inset+size*.012,size-ring_inset-size*.012,size-ring_inset-size*.012], outline=(255,222,128,90), width=int(size*.004))

    # shield geometry
    sw, sh = size*.40, size*.53
    cy = size*.50
    poly = shield_poly(cx, cy, sw, sh)
    top = cy - sh*.5
    bottom = cy + sh*.5

    mask = Image.new('L',(size,size),0)
    ImageDraw.Draw(mask).polygon(poly, fill=255)

    # house colour quadrants
    colors = {
        'g': (127,9,9,255),
        's': (26,71,42,255),
        'r': (14,26,64,255),
        'h': (196,150,32,255),
    }
    quad = Image.new('RGBA',(size,size),(0,0,0,0))
    qd = ImageDraw.Draw(quad)
    midx = cx
    midy = top + sh*.54
    qd.polygon([(cx-sw*.5,top),(midx,top),(midx,midy),(cx-sw*.5,midy)], fill=colors['g'])
    qd.polygon([(midx,top),(cx+sw*.5,top),(cx+sw*.5,midy),(midx,midy)], fill=colors['s'])
    qd.polygon([(cx-sw*.5,midy),(midx,midy),(cx,bottom)], fill=colors['h'])
    qd.polygon([(midx,midy),(cx+sw*.5,midy),(cx,bottom)], fill=colors['r'])
    # darken a bit for cohesion
    shade = Image.new('RGBA',(size,size),(10,6,4,105))
    layer.paste(quad, (0,0), mask)
    layer.paste(shade, (0,0), mask)

    # soft inner shadow on shield edges
    edge = Image.new('RGBA',(size,size),(0,0,0,0))
    ed = ImageDraw.Draw(edge)
    ed.polygon(poly, outline=(0,0,0,180), width=int(size*.03))
    edge = edge.filter(ImageFilter.GaussianBlur(size*.012))
    layer.paste(edge,(0,0),mask)

    # gold shield border
    d = ImageDraw.Draw(layer)
    d.line(poly+[poly[0]], fill=(226,184,67,255), width=int(size*.016), joint='curve')
    d.line(poly+[poly[0]], fill=(255,231,155,140), width=int(size*.005), joint='curve')

    # lightning bolt
    bolt = [
        (cx+size*.045, top+sh*.055),
        (cx-size*.085, top+sh*.38),
        (cx-size*.012, top+sh*.38),
        (cx-size*.058, top+sh*.70),
        (cx+size*.085, top+sh*.315),
        (cx+size*.012, top+sh*.315),
        (cx+size*.068, top+sh*.055),
    ]
    bmask = Image.new('L',(size,size),0)
    ImageDraw.Draw(bmask).polygon(bolt, fill=255)
    # vertical gold gradient for the bolt
    grad = Image.new('RGBA',(size,size),(0,0,0,0))
    gd = ImageDraw.Draw(grad)
    for y in range(size):
        t = y/(size-1)
        r = lerp(255, 173, t); g = lerp(232, 120, t); b = lerp(150, 12, t)
        gd.line([(0,y),(size,y)], fill=(r,g,b,255))
    layer.paste(grad,(0,0),bmask)

    # bolt glow
    glow = Image.new('RGBA',(size,size),(0,0,0,0))
    gd = ImageDraw.Draw(glow)
    gd.polygon(bolt, fill=(255,210,90,190))
    glow = glow.filter(ImageFilter.GaussianBlur(size*.035))
    layer = Image.alpha_composite(glow, layer)
    d = ImageDraw.Draw(layer)
    d.line(bolt+[bolt[0]], fill=(76,46,8,220), width=int(size*.006), joint='curve')

    return layer

def composite(size, maskable=False):
    base = bg(size)
    content = build_content(size)
    if maskable:
        # keep content inside the safe zone
        s = int(size*.80)
        c = content.resize((s,s), Image.LANCZOS)
        base.alpha_composite(c, ((size-s)//2, (size-s)//2))
    else:
        base.alpha_composite(content)
    # subtle vignette
    vig = Image.new('L',(size,size),0)
    vd = ImageDraw.Draw(vig)
    vd.ellipse([-size*.15,-size*.15,size*1.15,size*1.15], fill=255)
    vig = vig.filter(ImageFilter.GaussianBlur(size*.09))
    black = Image.new('RGBA',(size,size),(0,0,0,255))
    out = Image.composite(base, Image.blend(base, black, .55), vig)
    return out

# Render at high res then downsample for smooth edges
big = composite(SS)
big.save('/tmp/icon_master.png')
big_mask = composite(SS, maskable=True)
big_mask.save('/tmp/icon_master_maskable.png')

def save(img, path, size):
    img.resize((size,size), Image.LANCZOS).save(path, 'PNG', optimize=True)

save(big, 'icons/icon-512.png', 512)
save(big, 'icons/icon-192.png', 192)
# icono dedicado para iOS: fondo sólido, sin viñeta, opaco
ios_bg = Image.new('RGBA', (SS, SS), (14, 10, 6, 255))
ios_content = build_content(SS)
ios_bg.alpha_composite(ios_content)
ios_bg.save('/tmp/icon_ios_master.png')
save(Image.open('/tmp/icon_ios_master.png'), 'icons/apple-touch-icon.png', 180)
save(big, 'icons/favicon-32.png', 32)
save(big, 'icons/favicon-16.png', 16)
save(big_mask, 'icons/icon-maskable-512.png', 512)
save(big_mask, 'icons/icon-maskable-192.png', 192)
print('icons written')
