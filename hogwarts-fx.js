/* =========================================================================
   Parchís de Hogwarts — mejoras PWA, sonido y hechizos
   - Instalación como aplicación (manifest + service worker)
   - Efectos de sonido (interfaz, Lumos y Voldemort)
   - Animación de Voldemort al capturar una ficha
   - Animación de Lumos al sacar una ficha a la casilla de salida
   ========================================================================= */
(function () {
  'use strict';

  var MUTE_KEY = 'hwfx_muted';
  var INSTALL_KEY = 'hwfx_install_dismissed';
  var muted = false;
  try { muted = localStorage.getItem(MUTE_KEY) === '1'; } catch (e) { muted = false; }

  /* ------------------------------------------------------------------ */
  /*  Motor de audio                                                     */
  /* ------------------------------------------------------------------ */
  var actx = null;

  function ensureAudio() {
    if (typeof window === 'undefined') return null;
    if (!actx) {
      var AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      try { actx = new AC(); } catch (e) { return null; }
    }
    if (actx.state === 'suspended') {
      try { actx.resume(); } catch (e) { /* ignorado */ }
    }
    return actx;
  }

  function tone(freq, start, dur, type, vol, glideTo) {
    if (!actx) return;
    var osc = actx.createOscillator();
    var gain = actx.createGain();
    var peak = Math.max(0.0003, vol || 0.08);
    var end = start + Math.max(0.03, dur);

    osc.type = type || 'sine';
    osc.frequency.setValueAtTime(Math.max(20, freq), start);
    if (glideTo) {
      osc.frequency.exponentialRampToValueAtTime(Math.max(20, glideTo), end);
    }
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(peak, start + Math.min(0.03, dur * 0.3));
    gain.gain.exponentialRampToValueAtTime(0.0001, end);

    osc.connect(gain);
    gain.connect(actx.destination);
    osc.start(start);
    osc.stop(end + 0.04);
  }

  function noise(start, dur, vol, filterType, freq, q) {
    if (!actx) return;
    var rate = actx.sampleRate;
    var length = Math.max(1, Math.floor(rate * dur));
    var buffer = actx.createBuffer(1, length, rate);
    var data = buffer.getChannelData(0);
    for (var i = 0; i < length; i++) {
      var fade = Math.pow(1 - i / length, 2.1);
      data[i] = (Math.random() * 2 - 1) * fade;
    }
    var src = actx.createBufferSource();
    src.buffer = buffer;
    var filter = actx.createBiquadFilter();
    filter.type = filterType || 'lowpass';
    filter.frequency.setValueAtTime(freq || 1000, start);
    filter.Q.value = q || 1;
    var gain = actx.createGain();
    gain.gain.setValueAtTime(vol || 0.08, start);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + dur);
    src.connect(filter);
    filter.connect(gain);
    gain.connect(actx.destination);
    src.start(start);
    src.stop(start + dur + 0.02);
  }

  function playClickSound() {
    if (muted || !ensureAudio()) return;
    var t = actx.currentTime;
    tone(1280, t, 0.045, 'sine', 0.016, 920);
    tone(1950, t + 0.004, 0.03, 'triangle', 0.007, 1500);
  }

  function playLumosSound() {
    if (muted || !ensureAudio()) return;
    var t = actx.currentTime + 0.01;
    var notes = [523.25, 659.25, 783.99, 1046.5, 1318.51];
    notes.forEach(function (f, i) {
      tone(f, t + i * 0.055, 0.62, 'sine', 0.1);
    });
    tone(1567.98, t + 0.18, 0.95, 'sine', 0.05);
    tone(2093.0, t + 0.32, 0.8, 'triangle', 0.028);
    tone(261.63, t, 0.9, 'sine', 0.035);
    noise(t + 0.1, 0.55, 0.04, 'highpass', 4200, 0.8);
  }

  function playVoldemortSound() {
    if (muted || !ensureAudio()) return;
    var t = actx.currentTime + 0.02;
    tone(92, t, 1.5, 'sawtooth', 0.09, 32);
    tone(46, t, 1.8, 'sine', 0.28, 24);
    tone(330, t + 0.06, 0.7, 'sawtooth', 0.04, 88);
    tone(466.16, t + 0.06, 0.85, 'triangle', 0.045, 160);
    noise(t + 0.04, 1.5, 0.11, 'lowpass', 700, 0.7);

    setTimeout(function () {
      if (muted || !ensureAudio()) return;
      var t2 = actx.currentTime;
      tone(1400, t2, 0.1, 'square', 0.03, 220);
      noise(t2, 0.24, 0.1, 'highpass', 2200, 0.8);
      tone(70, t2 + 0.04, 0.9, 'sine', 0.2, 38);
    }, 430);
  }

  function setMuted(value) {
    muted = !!value;
    try { localStorage.setItem(MUTE_KEY, muted ? '1' : '0'); } catch (e) { /* ignorado */ }
    syncMuteIcon();
    if (!muted) {
      if (!ensureAudio()) return;
      var t = actx.currentTime;
      tone(880, t, 0.12, 'sine', 0.045);
      tone(1320, t + 0.06, 0.16, 'sine', 0.035);
    }
  }

  function getMuted() { return muted; }

  function syncMuteIcon() {
    var button = document.getElementById('hw-sound-toggle');
    if (!button) return;
    button.textContent = muted ? '🔇' : '🔊';
    button.setAttribute('aria-pressed', muted ? 'true' : 'false');
  }

  /* ------------------------------------------------------------------ */
  /*  Estilos de los hechizos y de la instalación PWA                    */
  /* ------------------------------------------------------------------ */
  var CSS = [
    '#hw-fx-layer{position:fixed;inset:0;pointer-events:none;z-index:9000;overflow:hidden;}',
    '.hw-fx{position:fixed;inset:0;pointer-events:none;overflow:hidden;display:flex;align-items:center;justify-content:center;font-family:"Cinzel",Georgia,serif;}',

    /* ---- Voldemort ---- */
    '.hwfx-voldemort{z-index:1;}',
    '.hwfx-voldemort__veil{position:absolute;inset:0;background:radial-gradient(ellipse at 50% 46%,rgba(34,96,55,.62) 0%,rgba(4,10,6,.9) 55%,rgba(0,0,0,.95) 100%);opacity:0;animation:hwfxVVeil 2.2s ease-in-out both;}',
    '.hwfx-voldemort__flash{position:absolute;inset:0;background:radial-gradient(circle at 50% 44%,rgba(160,255,190,.9),rgba(40,170,90,.28) 36%,transparent 66%);mix-blend-mode:screen;opacity:0;animation:hwfxVFlash 2.2s ease-out both;}',
    '.hwfx-voldemort__bolts{position:absolute;inset:0;width:100%;height:100%;}',
    '.hwfx-voldemort__bolts path{fill:none;stroke:#a8ffc2;stroke-width:2.2;stroke-linecap:round;stroke-linejoin:round;stroke-dasharray:280;stroke-dashoffset:280;filter:drop-shadow(0 0 6px #43ff7b) drop-shadow(0 0 18px rgba(60,255,120,.7));animation:hwfxVBolt 2.2s linear both;}',
    '.hwfx-voldemort__figure{position:absolute;left:50%;top:46%;width:min(56vmin,350px);transform:translate(-50%,-50%);opacity:0;filter:drop-shadow(0 22px 44px rgba(0,0,0,.85)) drop-shadow(0 0 30px rgba(72,255,130,.4));animation:hwfxVFigure 2.2s cubic-bezier(.16,.84,.3,1) both;}',
    '.hwfx-voldemort__figure svg{display:block;width:100%;height:auto;overflow:visible;}',
    '.hwfx-voldemort__eye{transform-box:fill-box;transform-origin:center;animation:hwfxVEye .55s ease-in-out infinite alternate;}',
    '.hwfx-voldemort__eye2{animation-delay:.14s;}',
    '.hwfx-voldemort__title{position:absolute;left:50%;bottom:14.5%;white-space:nowrap;font-size:clamp(19px,4.2vw,40px);font-weight:900;letter-spacing:.22em;padding-left:.22em;color:#dcffe4;text-shadow:0 0 10px rgba(90,255,140,.95),0 0 34px rgba(30,220,90,.75),0 2px 0 #000;opacity:0;animation:hwfxVTitle 2.2s ease-out both;}',
    '.hwfx-voldemort__sub{position:absolute;left:50%;bottom:9%;white-space:nowrap;font-family:"Plus Jakarta Sans",system-ui,sans-serif;font-size:clamp(10px,1.7vw,14px);font-weight:700;letter-spacing:.18em;text-transform:uppercase;color:#a8eeb8;text-shadow:0 0 12px rgba(60,220,110,.8);opacity:0;animation:hwfxVSub 2.2s ease-out both;}',

    /* ---- Lumos ---- */
    '.hwfx-lumos{z-index:2;}',
    '.hwfx-lumos__flash{position:absolute;inset:0;background:radial-gradient(circle at 50% 48%,#fff 0%,#fff4c9 15%,#ffd469 30%,rgba(255,196,70,.5) 46%,transparent 70%);mix-blend-mode:screen;opacity:0;animation:hwfxLFlash 1.7s ease-out both;}',
    '.hwfx-lumos__rays{position:absolute;left:50%;top:48%;width:min(125vmin,960px);height:min(125vmin,960px);transform:translate(-50%,-50%);background:repeating-conic-gradient(from 0deg,rgba(255,231,168,.5) 0deg 1.6deg,transparent 1.6deg 11deg);-webkit-mask-image:radial-gradient(circle,rgba(0,0,0,.95) 0%,rgba(0,0,0,.7) 34%,transparent 66%);mask-image:radial-gradient(circle,rgba(0,0,0,.95) 0%,rgba(0,0,0,.7) 34%,transparent 66%);opacity:0;animation:hwfxLRays 1.7s ease-out both;}',
    '.hwfx-lumos__wand{position:absolute;left:50%;top:48%;width:min(88vmin,660px);height:min(88vmin,660px);transform:translate(-50%,-50%);opacity:0;filter:drop-shadow(0 10px 26px rgba(0,0,0,.75));animation:hwfxLWand 1.7s ease-out both;}',
    '.hwfx-lumos__wand svg{display:block;width:100%;height:100%;overflow:visible;}',
    '.hwfx-lumos__orb{position:absolute;left:50%;top:48%;width:min(25vmin,160px);height:min(25vmin,160px);transform:translate(-50%,-50%);border-radius:50%;background:radial-gradient(circle at 42% 38%,#fff 0%,#fffbe8 22%,#ffd257 55%,rgba(255,170,30,.16) 78%,transparent 80%);box-shadow:0 0 24px #fff,0 0 62px 18px rgba(255,228,140,.92),0 0 140px 54px rgba(255,180,50,.55);opacity:0;animation:hwfxLOrb 1.7s cubic-bezier(.2,.8,.3,1) both;}',
    '.hwfx-lumos__spark{position:absolute;left:50%;top:48%;width:8px;height:8px;border-radius:50%;background:radial-gradient(circle,#fff 0%,#ffdf8a 52%,transparent 70%);opacity:0;filter:drop-shadow(0 0 6px rgba(255,225,140,.95));animation:hwfxLSpark 1.45s ease-out both;animation-delay:var(--delay,0s);}',
    '.hwfx-lumos__title{position:absolute;left:50%;bottom:13%;white-space:nowrap;font-size:clamp(22px,4.8vw,46px);font-weight:900;letter-spacing:.3em;padding-left:.3em;color:#fff9dd;text-shadow:0 0 12px #fff,0 0 38px #ffcc55,0 0 84px rgba(255,180,40,.75);opacity:0;animation:hwfxLTitle 1.7s ease-out both;}',
    '.hwfx-lumos__sub{position:absolute;left:50%;bottom:7.5%;white-space:nowrap;font-family:"Plus Jakarta Sans",system-ui,sans-serif;font-size:clamp(10px,1.7vw,14px);font-weight:700;letter-spacing:.16em;text-transform:uppercase;color:#ffefc0;text-shadow:0 0 12px rgba(255,200,90,.85);opacity:0;animation:hwfxLSub 1.7s ease-out both;}',

    /* ---- Instalación PWA ---- */
    '#hw-install{position:fixed;left:max(12px,env(safe-area-inset-left));bottom:max(12px,env(safe-area-inset-bottom));z-index:8500;display:flex;align-items:center;gap:5px;font-family:"Cinzel",Georgia,serif;transition:opacity .25s ease,transform .25s ease;}',
    '#hw-install[hidden]{display:none!important;}',
    '#hw-install.hw-hide{opacity:0;transform:translateY(10px);pointer-events:none;}',
    '#hw-install-btn{display:flex;align-items:center;gap:7px;padding:8px 13px;border-radius:999px;border:1.5px solid rgba(216,173,64,.85);background:linear-gradient(135deg,rgba(28,20,12,.97),rgba(10,7,5,.97));color:#ffe6a6;font-family:inherit;font-size:11px;font-weight:700;letter-spacing:.06em;cursor:pointer;box-shadow:0 8px 24px rgba(0,0,0,.55),0 0 18px rgba(216,173,64,.18);transition:transform .15s ease,filter .15s ease;}',
    '#hw-install-btn:hover{filter:brightness(1.15);}',
    '#hw-install-btn:active{transform:scale(.97);}',
    '#hw-install-close{width:27px;height:27px;border-radius:50%;border:1px solid rgba(216,173,64,.5);background:rgba(12,8,5,.94);color:#e7c878;font-size:15px;line-height:1;cursor:pointer;display:flex;align-items:center;justify-content:center;padding:0 0 1px;box-shadow:0 4px 14px rgba(0,0,0,.5);}',
    '@media (max-width:360px){#hw-install-label{display:none;}#hw-install-btn{padding:9px 11px;}}',

    '#hw-ios-modal{position:fixed;inset:0;z-index:9600;display:flex;align-items:center;justify-content:center;padding:20px;background:rgba(0,0,0,.78);backdrop-filter:blur(7px);-webkit-backdrop-filter:blur(7px);font-family:"Plus Jakarta Sans",system-ui,sans-serif;}',
    '#hw-ios-modal[hidden]{display:none!important;}',
    '.hw-ios-card{position:relative;width:100%;max-width:390px;border-radius:22px;border:1.5px solid rgba(216,173,64,.75);background:linear-gradient(160deg,rgba(30,21,13,.99),rgba(12,8,5,.99));color:#ffedc2;padding:24px 22px 20px;box-shadow:0 24px 70px rgba(0,0,0,.7),0 0 40px rgba(216,173,64,.16);text-align:center;}',
    '.hw-ios-card .hw-ios-crest{font-size:34px;line-height:1;margin-bottom:8px;filter:drop-shadow(0 0 14px rgba(255,204,90,.55));}',
    '.hw-ios-card h3{font-family:"Cinzel",Georgia,serif;font-size:20px;line-height:1.25;margin:0 0 6px;color:#ffe08a;}',
    '.hw-ios-card p{font-size:13px;line-height:1.45;color:#d9c9a5;margin:0 0 14px;}',
    '.hw-ios-card ol{text-align:left;margin:0 0 18px;padding-left:22px;font-size:13px;line-height:1.7;color:#efe2c2;}',
    '.hw-ios-card ol b{color:#ffe08a;}',
    '.hw-ios-card .hw-ios-ok{width:100%;padding:12px 16px;border-radius:14px;border:none;background:linear-gradient(90deg,#b8860b,#e0b23c,#b8860b);color:#1b1208;font-family:"Cinzel",Georgia,serif;font-size:13px;font-weight:700;letter-spacing:.08em;cursor:pointer;box-shadow:0 8px 22px rgba(224,178,60,.28);}',
    '.hw-ios-card .hw-ios-x{position:absolute;top:10px;right:12px;width:28px;height:28px;border-radius:50%;border:1px solid rgba(216,173,64,.45);background:rgba(0,0,0,.35);color:#e7c878;font-size:15px;cursor:pointer;}',
    '.hw-share-badge{display:inline-flex;align-items:center;justify-content:center;width:20px;height:20px;border-radius:5px;border:1px solid rgba(216,173,64,.6);background:rgba(255,255,255,.08);font-size:12px;vertical-align:-4px;}',

    '#hw-toast{position:fixed;left:50%;bottom:calc(max(16px,env(safe-area-inset-bottom)) + 8px);transform:translate(-50%,16px);z-index:9700;max-width:88vw;padding:10px 16px;border-radius:999px;border:1px solid rgba(216,173,64,.65);background:rgba(14,10,6,.96);color:#ffe6a6;font-family:"Cinzel",Georgia,serif;font-size:12px;font-weight:700;letter-spacing:.04em;box-shadow:0 12px 34px rgba(0,0,0,.6);opacity:0;pointer-events:none;transition:opacity .3s ease,transform .3s ease;text-align:center;}',
    '#hw-toast.hw-show{opacity:1;transform:translate(-50%,0);}',

    /* ---- Keyframes ---- */
    '@keyframes hwfxVVeil{0%{opacity:0}8%{opacity:1}72%{opacity:1}100%{opacity:0}}',
    '@keyframes hwfxVFlash{0%{opacity:0}6%{opacity:.9}12%{opacity:.25}19%{opacity:.75}27%{opacity:.08}40%{opacity:.35}100%{opacity:0}}',
    '@keyframes hwfxVBolt{0%{opacity:0;stroke-dashoffset:280}6%{opacity:1;stroke-dashoffset:0}11%{opacity:.12}16%{opacity:1}29%{opacity:.05}38%{opacity:.8}52%{opacity:.08}62%{opacity:.6}100%{opacity:0;stroke-dashoffset:0}}',
    '@keyframes hwfxVFigure{0%{opacity:0;transform:translate(-50%,-44%) scale(.68)}10%{opacity:1;transform:translate(-50%,-52%) scale(1.07)}18%{transform:translate(-50%,-50%) scale(1)}78%{opacity:1;transform:translate(-50%,-50%) scale(1)}100%{opacity:0;transform:translate(-50%,-52%) scale(1.06)}}',
    '@keyframes hwfxVEye{from{opacity:.5;filter:drop-shadow(0 0 2px #ff3b3b)}to{opacity:1;filter:drop-shadow(0 0 14px #ff2222) drop-shadow(0 0 28px #ff5b5b)}}',
    '@keyframes hwfxVTitle{0%{opacity:0;letter-spacing:.55em;transform:translate(-50%,16px) scale(.92)}14%{opacity:1;letter-spacing:.22em;transform:translate(-50%,0) scale(1)}76%{opacity:1}100%{opacity:0;letter-spacing:.3em;transform:translate(-50%,-6px)}}',
    '@keyframes hwfxVSub{0%,18%{opacity:0;transform:translate(-50%,10px)}30%,76%{opacity:1;transform:translate(-50%,0)}100%{opacity:0;transform:translate(-50%,0)}}',
    '@keyframes hwfxLFlash{0%{opacity:0}10%{opacity:1}26%{opacity:.5}55%{opacity:.24}100%{opacity:0}}',
    '@keyframes hwfxLRays{0%{opacity:0;transform:translate(-50%,-50%) rotate(0deg) scale(.35)}18%{opacity:.95}45%{opacity:.5}100%{opacity:0;transform:translate(-50%,-50%) rotate(105deg) scale(1.7)}}',
    '@keyframes hwfxLWand{0%{opacity:0;transform:translate(-50%,-50%) rotate(-13deg) scale(.9)}16%{opacity:1;transform:translate(-50%,-50%) rotate(0deg) scale(1)}80%{opacity:1}100%{opacity:0;transform:translate(-50%,-50%) rotate(2deg) scale(1.04)}}',
    '@keyframes hwfxLOrb{0%{opacity:0;transform:translate(-50%,-50%) scale(0)}14%{opacity:1;transform:translate(-50%,-50%) scale(1.4)}26%{transform:translate(-50%,-50%) scale(1)}72%{opacity:1;transform:translate(-50%,-50%) scale(1.06)}100%{opacity:0;transform:translate(-50%,-50%) scale(1.7)}}',
    '@keyframes hwfxLSpark{0%{opacity:0;transform:translate(-50%,-50%) scale(.2)}18%{opacity:1}100%{opacity:0;transform:translate(calc(-50% + var(--dx,0px)),calc(-50% + var(--dy,0px))) scale(.55)}}',
    '@keyframes hwfxLTitle{0%{opacity:0;letter-spacing:.6em;transform:translate(-50%,12px) scale(.9)}16%{opacity:1;letter-spacing:.3em;transform:translate(-50%,0) scale(1)}78%{opacity:1}100%{opacity:0;letter-spacing:.36em;transform:translate(-50%,-6px)}}',
    '@keyframes hwfxLSub{0%,20%{opacity:0;transform:translate(-50%,10px)}32%,78%{opacity:1;transform:translate(-50%,0)}100%{opacity:0;transform:translate(-50%,0)}}',

    '@media (prefers-reduced-motion:reduce){',
    '.hwfx-voldemort__bolts,.hwfx-lumos__rays{display:none;}',
    '.hwfx-voldemort__figure,.hwfx-voldemort__title,.hwfx-voldemort__sub,.hwfx-lumos__orb,.hwfx-lumos__title,.hwfx-lumos__sub{animation-duration:1.35s!important;}',
    '.hwfx-lumos__spark{display:none;}',
    '}'
  ].join('\n');

  function injectStyles() {
    if (document.getElementById('hw-fx-styles')) return;
    var style = document.createElement('style');
    style.id = 'hw-fx-styles';
    style.textContent = CSS;
    document.head.appendChild(style);
  }

  /* ------------------------------------------------------------------ */
  /*  Capa de efectos                                                    */
  /* ------------------------------------------------------------------ */
  var fxLayer = null;

  function getLayer() {
    if (!fxLayer) {
      fxLayer = document.getElementById('hw-fx-layer');
      if (!fxLayer) {
        fxLayer = document.createElement('div');
        fxLayer.id = 'hw-fx-layer';
        document.body.appendChild(fxLayer);
      }
    }
    return fxLayer;
  }

  function mountEffect(className, html, life) {
    var layer = getLayer();
    var previous = layer.querySelector('.' + className);
    if (previous) previous.remove();

    var node = document.createElement('div');
    node.className = 'hw-fx ' + className;
    node.innerHTML = html;
    layer.appendChild(node);

    window.setTimeout(function () {
      if (node.parentNode) node.parentNode.removeChild(node);
    }, life);
  }

  function voldemortMarkup() {
    return [
      '<div class="hwfx-voldemort__veil"></div>',
      '<div class="hwfx-voldemort__flash"></div>',
      '<svg class="hwfx-voldemort__bolts" viewBox="0 0 400 400" preserveAspectRatio="xMidYMid slice" aria-hidden="true">',
      '<path d="M62 26l-15 60 23-4-23 56"/>',
      '<path d="M332 34l19 56-21-3 27 64" style="animation-delay:.12s"/>',
      '<path d="M44 246l-19 54 25-6-21 56" style="animation-delay:.2s"/>',
      '<path d="M354 232l15 62-23-5 19 68" style="animation-delay:.3s"/>',
      '<path d="M199 6l-8 48 15-4-13 44" style="animation-delay:.42s"/>',
      '<path d="M205 394l8-52-17 5 15-46" style="animation-delay:.52s"/>',
      '</svg>',
      '<div class="hwfx-voldemort__figure">',
      '<svg viewBox="0 0 260 300" aria-hidden="true">',
      '<defs>',
      '<radialGradient id="hwfxVFace" cx="50%" cy="38%" r="62%">',
      '<stop offset="0%" stop-color="#f1edde"/>',
      '<stop offset="48%" stop-color="#d8d3c2"/>',
      '<stop offset="78%" stop-color="#b4ae9d"/>',
      '<stop offset="100%" stop-color="#7e7a6c"/>',
      '</radialGradient>',
      '<linearGradient id="hwfxVRobe" x1="0" y1="0" x2="0" y2="1">',
      '<stop offset="0%" stop-color="#112117"/>',
      '<stop offset="45%" stop-color="#0a120d"/>',
      '<stop offset="100%" stop-color="#030504"/>',
      '</linearGradient>',
      '<radialGradient id="hwfxVAura" cx="50%" cy="50%" r="50%">',
      '<stop offset="0%" stop-color="rgba(90,255,150,.5)"/>',
      '<stop offset="55%" stop-color="rgba(40,190,90,.16)"/>',
      '<stop offset="100%" stop-color="rgba(0,0,0,0)"/>',
      '</radialGradient>',
      '<filter id="hwfxVGlow" x="-80%" y="-80%" width="260%" height="260%">',
      '<feGaussianBlur stdDeviation="5" result="blur"/>',
      '<feMerge><feMergeNode in="blur"/><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>',
      '</filter>',
      '</defs>',
      '<circle cx="130" cy="138" r="122" fill="url(#hwfxVAura)"/>',
      '<path d="M130 10C92 10 63 40 57 88c-5 39-24 106-49 200 76 18 168 18 244 0-25-94-44-161-49-200-6-48-35-78-73-78Z" fill="url(#hwfxVRobe)" stroke="#1d3d27" stroke-width="2"/>',
      '<path d="M130 34c-30 0-49 22-53 60-3 31 5 58 19 76-27-6-48-36-43-78 6-48 35-78 77-78s71 30 77 78c5 42-16 72-43 78 14-18 22-45 19-76-4-38-23-60-53-60Z" fill="#060b08" opacity=".92"/>',
      '<path d="M130 47c-24 0-40 20-42 47-2 30 13 58 42 68 29-10 44-38 42-68-2-27-18-47-42-47Z" fill="#050806" stroke="#2f6b42" stroke-width="1" opacity=".95"/>',
      '<path d="M130 58c-18 0-31 20-31 49 0 30 13 52 31 62 18-10 31-32 31-62 0-29-13-49-31-49Z" fill="url(#hwfxVFace)"/>',
      '<path d="M130 58c-18 0-31 20-31 49 0 3 0 6 .3 9 5-18 16-29 30.7-29s25.7 11 30.7 29c.3-3 .3-6 .3-9 0-29-13-49-31-49Z" fill="#8c8778" opacity=".55"/>',
      '<path d="M101 114c3 19 12 34 24 43-10-6-17-17-20-30-1-5-2-9-4-13Zm58 0c-2 4-3 8-4 13-3 13-10 24-20 30 12-9 21-24 24-43Z" fill="#7b776a" opacity=".45"/>',
      '<g filter="url(#hwfxVGlow)">',
      '<ellipse class="hwfx-voldemort__eye" cx="115" cy="112" rx="12" ry="6.2" fill="#ff3232"/>',
      '<ellipse class="hwfx-voldemort__eye hwfx-voldemort__eye2" cx="145" cy="112" rx="12" ry="6.2" fill="#ff3232"/>',
      '</g>',
      '<ellipse cx="115" cy="112" rx="2.6" ry="6" fill="#230404"/>',
      '<ellipse cx="145" cy="112" rx="2.6" ry="6" fill="#230404"/>',
      '<path d="M127 132c-1 3-2 5-4 7m11-7c1 3 2 5 4 7" stroke="#5d5a51" stroke-width="2.2" stroke-linecap="round" fill="none"/>',
      '<path d="M119 151c7 4 15 4 22 0" stroke="#4c4840" stroke-width="2.4" stroke-linecap="round" fill="none"/>',
      '<path d="M121 152c6 2 12 2 18 0" stroke="#e9e4d4" stroke-width="1" stroke-linecap="round" fill="none" opacity=".35"/>',
      '</svg>',
      '</div>',
      '<div class="hwfx-voldemort__title">AVADA KEDAVRA</div>',
      '<div class="hwfx-voldemort__sub">¡Ficha capturada!</div>'
    ].join('');
  }

  function lumosMarkup() {
    var sparks = '';
    for (var i = 0; i < 20; i++) {
      var angle = Math.random() * Math.PI * 2;
      var distance = 60 + Math.random() * 230;
      var size = (4 + Math.random() * 7).toFixed(1);
      var delay = (0.04 + Math.random() * 0.48).toFixed(2);
      sparks += '<span class="hwfx-lumos__spark" style="--dx:' +
        (Math.cos(angle) * distance).toFixed(1) + 'px;--dy:' +
        (Math.sin(angle) * distance).toFixed(1) + 'px;--delay:' + delay +
        's;width:' + size + 'px;height:' + size + 'px"></span>';
    }

    return [
      '<div class="hwfx-lumos__flash"></div>',
      '<div class="hwfx-lumos__rays"></div>',
      '<div class="hwfx-lumos__wand">',
      '<svg viewBox="0 0 600 600" aria-hidden="true">',
      '<defs>',
      '<linearGradient id="hwfxLWandGrad" x1="0" y1="1" x2="1" y2="0">',
      '<stop offset="0" stop-color="#2b170c"/>',
      '<stop offset=".45" stop-color="#5c3418"/>',
      '<stop offset="1" stop-color="#8a5a2b"/>',
      '</linearGradient>',
      '<filter id="hwfxLGlow" x="-40%" y="-40%" width="180%" height="180%">',
      '<feGaussianBlur stdDeviation="4" result="b"/>',
      '<feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>',
      '</filter>',
      '</defs>',
      '<g filter="url(#hwfxLGlow)">',
      '<path d="M78 546L286 322" stroke="url(#hwfxLWandGrad)" stroke-width="18" stroke-linecap="round"/>',
      '<path d="M74 550l12-14" stroke="#c9a227" stroke-width="23" stroke-linecap="round"/>',
      '<path d="M126 502l9-10M158 468l9-10M190 436l9-10" stroke="#c9a227" stroke-width="3" stroke-linecap="round" opacity=".55"/>',
      '<circle cx="290" cy="318" r="15" fill="#fff8d6"/>',
      '</g>',
      '</svg>',
      '</div>',
      '<div class="hwfx-lumos__orb"></div>',
      sparks,
      '<div class="hwfx-lumos__title">LUMOS</div>',
      '<div class="hwfx-lumos__sub">¡A la casilla de salida!</div>'
    ].join('');
  }

  var lastVoldemort = 0;
  var lastLumos = 0;

  function voldemort() {
    var now = Date.now();
    if (now - lastVoldemort < 250) return;
    lastVoldemort = now;
    playVoldemortSound();
    try {
      if (navigator.vibrate) navigator.vibrate([0, 35, 40, 25, 90]);
    } catch (e) { /* ignorado */ }
    mountEffect('hwfx-voldemort', voldemortMarkup(), 2400);
  }

  function lumos() {
    var now = Date.now();
    if (now - lastLumos < 250) return;
    lastLumos = now;
    playLumosSound();
    try {
      if (navigator.vibrate) navigator.vibrate([0, 25, 35, 20]);
    } catch (e) { /* ignorado */ }
    mountEffect('hwfx-lumos', lumosMarkup(), 1900);
  }

  /* ------------------------------------------------------------------ */
  /*  Instalación PWA                                                   */
  /* ------------------------------------------------------------------ */
  var promptEvent = null;
  var installBox = null;
  var installLabel = null;
  var installTimer = null;

  function isStandalone() {
    return (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) ||
      window.navigator.standalone === true;
  }

  function installDismissed() {
    try { return localStorage.getItem(INSTALL_KEY) === '1'; } catch (e) { return false; }
  }

  function dismissInstall(persist) {
    if (persist) {
      try { localStorage.setItem(INSTALL_KEY, '1'); } catch (e) { /* ignorado */ }
    }
    hideInstall();
  }

  function showInstall(label) {
    if (!installBox) return;
    if (installLabel) installLabel.textContent = label || 'Instalar app';
    installBox.hidden = false;
    installBox.classList.remove('hw-hide');
    if (installTimer) window.clearTimeout(installTimer);
    installTimer = window.setTimeout(function () {
      hideInstall();
    }, 14000);
  }

  function hideInstall() {
    if (!installBox) return;
    installBox.classList.add('hw-hide');
    if (installTimer) { window.clearTimeout(installTimer); installTimer = null; }
    window.setTimeout(function () {
      if (installBox && installBox.classList.contains('hw-hide')) installBox.hidden = true;
    }, 280);
  }

  function buildInstallUI() {
    injectStyles();

    installBox = document.createElement('div');
    installBox.id = 'hw-install';
    installBox.hidden = true;
    installBox.innerHTML =
      '<button id="hw-install-btn" type="button" title="Instalar Parchís de Hogwarts">' +
      '<span aria-hidden="true">⬇️</span><span id="hw-install-label">Instalar app</span>' +
      '</button>' +
      '<button id="hw-install-close" type="button" aria-label="Ocultar aviso de instalación">×</button>';
    document.body.appendChild(installBox);

    installLabel = document.getElementById('hw-install-label');

    document.getElementById('hw-install-btn').addEventListener('click', function () {
      if (promptEvent) {
        var prompt = promptEvent;
        promptEvent = null;
        try { prompt.prompt(); } catch (e) { /* ignorado */ }
        if (prompt.userChoice && prompt.userChoice.then) {
          prompt.userChoice.then(function (choice) {
            if (choice && choice.outcome === 'accepted') hideInstall();
          }).catch(function () {});
        }
      } else {
        openIosModal();
      }
    });

    document.getElementById('hw-install-close').addEventListener('click', function () {
      dismissInstall(true);
    });

    buildIosModal();

    window.addEventListener('beforeinstallprompt', function (event) {
      event.preventDefault();
      promptEvent = event;
      if (!isStandalone() && !installDismissed()) showInstall('Instalar app');
    });

    window.addEventListener('appinstalled', function () {
      promptEvent = null;
      hideInstall();
      try { localStorage.setItem(INSTALL_KEY, '1'); } catch (e) { /* ignorado */ }
      toast('¡Parchís de Hogwarts instalado!');
    });

    var ua = navigator.userAgent || '';
    var iOS = /iphone|ipad|ipod/i.test(ua) ||
      (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    var iOSBrowser = iOS && !/crios|fxios|edgios/i.test(ua);

    if (iOSBrowser && !isStandalone() && !installDismissed()) {
      window.setTimeout(function () {
        if (!isStandalone() && !installDismissed()) showInstall('Añadir a inicio');
      }, 6500);
    }
  }

  var iosModal = null;

  function buildIosModal() {
    iosModal = document.createElement('div');
    iosModal.id = 'hw-ios-modal';
    iosModal.hidden = true;
    iosModal.innerHTML =
      '<div class="hw-ios-card" role="dialog" aria-modal="true" aria-label="Añadir a pantalla de inicio">' +
      '<button class="hw-ios-x" type="button" aria-label="Cerrar">×</button>' +
      '<div class="hw-ios-crest">🪄</div>' +
      '<h3>Añadir a pantalla de inicio</h3>' +
      '<p>Juega como una app de verdad y sin conexión:</p>' +
      '<ol>' +
      '<li>Toca el botón <b>Compartir</b> <span class="hw-share-badge">⬆️</span> de Safari.</li>' +
      '<li>Elige <b>Añadir a pantalla de inicio</b>.</li>' +
      '<li>Toca <b>Añadir</b> y abre el icono del castillo.</li>' +
      '</ol>' +
      '<button class="hw-ios-ok" type="button">Entendido</button>' +
      '</div>';
    document.body.appendChild(iosModal);

    function close() { iosModal.hidden = true; }

    iosModal.addEventListener('click', function (event) {
      if (event.target === iosModal) close();
    });
    iosModal.querySelector('.hw-ios-x').addEventListener('click', close);
    iosModal.querySelector('.hw-ios-ok').addEventListener('click', close);
  }

  function openIosModal() {
    if (iosModal) iosModal.hidden = false;
  }

  var toastEl = null;
  var toastTimer = null;

  function toast(message) {
    injectStyles();
    if (!toastEl) {
      toastEl = document.createElement('div');
      toastEl.id = 'hw-toast';
      document.body.appendChild(toastEl);
    }
    toastEl.textContent = message;
    toastEl.classList.add('hw-show');
    if (toastTimer) window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(function () {
      toastEl.classList.remove('hw-show');
    }, 3200);
  }

  /* ------------------------------------------------------------------ */
  /*  Registro del service worker y sonidos de interfaz                 */
  /* ------------------------------------------------------------------ */
  function registerServiceWorker() {
    if (!('serviceWorker' in navigator)) return;
    var secure = location.protocol === 'https:' ||
      location.hostname === 'localhost' ||
      location.hostname === '127.0.0.1';
    if (!secure) return;
    window.addEventListener('load', function () {
      navigator.serviceWorker.register('./service-worker.js').catch(function (error) {
        console.warn('[PWA] No se pudo registrar el service worker:', error);
      });
    });
  }

  function unlockAudioOnGesture() {
    ensureAudio();
  }

  function bindInterfaceSound() {
    var lastClick = 0;
    document.addEventListener('pointerdown', function (event) {
      unlockAudioOnGesture();

      var target = event.target;
      var button = target && target.closest ? target.closest('button') : null;
      if (!button || button.disabled) return;

      var now = Date.now();
      if (now - lastClick < 70) return;
      lastClick = now;
      playClickSound();
    }, true);

    window.addEventListener('keydown', unlockAudioOnGesture, { passive: true });
    window.addEventListener('storage', function (event) {
      if (event.key !== MUTE_KEY) return;
      muted = event.newValue === '1';
      syncMuteIcon();
    });
  }

  /* ------------------------------------------------------------------ */
  /*  Arranque                                                          */
  /* ------------------------------------------------------------------ */
  function init() {
    injectStyles();
    buildInstallUI();
    bindInterfaceSound();
    registerServiceWorker();
    syncMuteIcon();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  /* API pública usada por el juego */
  window.__hogwartsFX = {
    voldemort: voldemort,
    lumos: lumos,
    setMuted: setMuted,
    getMuted: getMuted,
    toast: toast
  };
})();
