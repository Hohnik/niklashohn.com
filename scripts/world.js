/* ============================================================
   world.js — the renderer.

   Everything is drawn at CELL resolution: the canvas backing
   store is width/pixelSize wide, and CSS blows it back up with
   image-rendering: pixelated. So one fragment is one visible
   pixel-art cell, the fragment count drops by ~16x, and the
   pixel grid is exact instead of being faked by rounding.
   ============================================================ */
window.NH = window.NH || {};

NH.World = (function () {
  let gl = null, canvas = null;
  let heightProg = null, visProg = null, mainProg = null;
  let heightFbo = null, heightTex = null;
  let visFbo = null, visTex = null;
  let cellW = 0, cellH = 0, texW = 0, texH = 0, pixel = 0, pad = 0;
  let hU = {}, vU = {}, mU = {}, trailU = [];
  let failure = null;

  const TRAIL_SLOTS = 10;

  function compile(type, src) {
    const sh = gl.createShader(type);
    gl.shaderSource(sh, src);
    gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
      const log = gl.getShaderInfoLog(sh);
      gl.deleteShader(sh);
      throw new Error((type === gl.VERTEX_SHADER ? 'vertex' : 'fragment') + ' shader: ' + log);
    }
    return sh;
  }

  function link(vsSrc, fsSrc) {
    const p = gl.createProgram();
    gl.attachShader(p, compile(gl.VERTEX_SHADER, vsSrc));
    gl.attachShader(p, compile(gl.FRAGMENT_SHADER, fsSrc));
    gl.bindAttribLocation(p, 0, 'a_pos');
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
      throw new Error('link: ' + gl.getProgramInfoLog(p));
    }
    return p;
  }

  function uniforms(p, names) {
    const out = {};
    names.forEach(function (n) { out[n] = gl.getUniformLocation(p, n); });
    return out;
  }

  function init(el) {
    canvas = el;
    const opts = { antialias: false, depth: false, alpha: false, preserveDrawingBuffer: false };
    gl = canvas.getContext('webgl', opts) || canvas.getContext('experimental-webgl', opts);
    if (!gl) { failure = 'This browser has no WebGL.'; return false; }

    try {
      /* highp is only a *minimum* guarantee in WebGL 1. Where the
         fragment stage has none, drop the whole shader to mediump
         rather than failing to compile. */
      const hp = gl.getShaderPrecisionFormat(gl.FRAGMENT_SHADER, gl.HIGH_FLOAT);
      const prec = (hp && hp.precision > 0) ? 'highp' : 'mediump';
      const fix = function (s) { return s.replace('precision highp float;', 'precision ' + prec + ' float;'); };

      heightProg = link(NH.VERT, fix(NH.FRAG_HEIGHT));
      visProg = link(NH.VERT, fix(NH.FRAG_VISIBLE));
      mainProg = link(NH.VERT, fix(NH.FRAG_MAIN));
    } catch (e) {
      failure = e.message; return false;
    }

    /* One oversized triangle covers the screen with three
       vertices instead of a quad's six indices. */
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

    hU = uniforms(heightProg, ['u_texSize', 'u_cam', 'u_pad', 'u_seed', 'u_scale',
      'u_water', 'u_m0', 'u_m1', 'u_m2', 'u_markR']);
    vU = uniforms(visProg, ['u_height', 'u_texSize', 'u_pad', 'u_lift']);
    mU = uniforms(mainProg, ['u_height', 'u_visible', 'u_texSize', 'u_res', 'u_cam', 'u_pad', 'u_lift',
      'u_water', 'u_seed', 'u_ink', 'u_palette', 'u_fog', 'u_waves', 'u_time',
      'u_plane', 'u_hover',
      'u_planeSize', 'u_planeKind', 'u_planeOn', 'u_shadowOn', 'u_occlude',
      'u_m0', 'u_m1', 'u_m2', 'u_markStyle', 'u_trailOn']);
    trailU = [];
    for (let i = 0; i < TRAIL_SLOTS; i++) {
      trailU.push(gl.getUniformLocation(mainProg, 'u_trail[' + i + ']'));
    }

    heightFbo = gl.createFramebuffer();
    visFbo = gl.createFramebuffer();
    heightTex = newTarget();
    visTex = newTarget();

    resize();
    return true;
  }

  /* NEAREST + CLAMP_TO_EDGE is what makes a non-power-of-two
     texture legal in WebGL 1 — and it is what we want anyway,
     since every texel holds one exact level, not a colour to
     be blended. */
  function newTarget() {
    const t = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return t;
  }

  function attach(fb, tex, w, h) {
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }

  /* Size the canvas in cells and give it an exact integer CSS
     scale, so the pixel grid never lands on a half pixel. */
  function resize() {
    if (!gl) return;
    pixel = NH.cfg.get('pixel');
    /* The height texture only has to reach as far below the screen
       as the layer search actually looks, which is LEVELS * lift
       rows — not the worst case for the steepest lift setting. */
    pad = NH.LEVELS * (NH.cfg.get('view') === 'flat' ? 0 : NH.cfg.get('lift'));
    cellW = Math.max(2, Math.ceil(window.innerWidth / pixel));
    cellH = Math.max(2, Math.ceil(window.innerHeight / pixel));

    const max = gl.getParameter(gl.MAX_TEXTURE_SIZE);
    cellW = Math.min(cellW, max);
    cellH = Math.min(cellH, max - pad);

    canvas.width = cellW;
    canvas.height = cellH;
    canvas.style.width = (cellW * pixel) + 'px';
    canvas.style.height = (cellH * pixel) + 'px';

    texW = cellW;
    texH = cellH + pad;
    attach(heightFbo, heightTex, texW, texH);
    attach(visFbo, visTex, cellW, cellH);
  }

  function markUniform(loc, mark) {
    if (!mark) { gl.uniform3f(loc, 0, 0, -1); return; }
    gl.uniform3f(loc, mark.x, mark.y, mark.glow === undefined ? 0 : mark.glow);
  }

  function render(s) {
    if (!gl) return;
    const lift = NH.cfg.get('view') === 'flat' ? 0 : NH.cfg.get('lift');
    /* The camera lands on whole cells. A fractional camera would
       make the entire terrain shimmer as it slid between cells. */
    const camX = Math.round(s.cam.x), camY = Math.round(s.cam.y);

    // ---- pass 1: the height field ----
    gl.bindFramebuffer(gl.FRAMEBUFFER, heightFbo);
    gl.viewport(0, 0, texW, texH);
    gl.useProgram(heightProg);
    gl.uniform2f(hU.u_texSize, texW, texH);
    gl.uniform2f(hU.u_cam, camX, camY);
    gl.uniform1f(hU.u_pad, pad);
    gl.uniform2f(hU.u_seed, s.seed.x, s.seed.y);
    gl.uniform1f(hU.u_scale, NH.WORLD_SCALE);
    gl.uniform1f(hU.u_water, NH.WATER);
    gl.uniform1f(hU.u_markR, NH.MARK_RADIUS);
    markUniform(hU.u_m0, s.marks[0]);
    markUniform(hU.u_m1, s.marks[1]);
    markUniform(hU.u_m2, s.marks[2]);
    gl.drawArrays(gl.TRIANGLES, 0, 3);

    // ---- pass 2: resolve the visible layer, once per cell ----
    gl.bindFramebuffer(gl.FRAMEBUFFER, visFbo);
    gl.viewport(0, 0, cellW, cellH);
    gl.useProgram(visProg);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, heightTex);
    gl.uniform1i(vU.u_height, 0);
    gl.uniform2f(vU.u_texSize, texW, texH);
    gl.uniform1f(vU.u_pad, pad);
    gl.uniform1f(vU.u_lift, lift);
    gl.drawArrays(gl.TRIANGLES, 0, 3);

    // ---- pass 3: the picture ----
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, cellW, cellH);
    gl.useProgram(mainProg);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, heightTex);
    gl.uniform1i(mU.u_height, 0);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, visTex);
    gl.uniform1i(mU.u_visible, 1);
    gl.uniform2f(mU.u_texSize, texW, texH);
    gl.uniform2f(mU.u_res, cellW, cellH);
    gl.uniform2f(mU.u_cam, camX, camY);
    gl.uniform1f(mU.u_pad, pad);
    gl.uniform1f(mU.u_lift, lift);
    gl.uniform1f(mU.u_water, NH.WATER);
    gl.uniform2f(mU.u_seed, s.seed.x, s.seed.y);
    gl.uniform1f(mU.u_ink, NH.cfg.get('ink') ? 1 : 0);
    gl.uniform1i(mU.u_palette, NH.cfg.get('palette'));
    gl.uniform1f(mU.u_fog, NH.cfg.get('fog') ? 1 : 0);
    gl.uniform1f(mU.u_waves, NH.cfg.get('waves') ? 1 : 0);
    gl.uniform1f(mU.u_time, s.time);
    gl.uniform3f(mU.u_plane, s.plane.x, s.plane.y, s.plane.heading);
    gl.uniform1f(mU.u_hover, NH.HOVER);
    gl.uniform1f(mU.u_planeSize, NH.PLANE_SIZE);
    gl.uniform1i(mU.u_planeKind, NH.cfg.get('plane'));
    gl.uniform1f(mU.u_planeOn, 1);
    gl.uniform1f(mU.u_shadowOn, (NH.cfg.get('shadow') && lift > 0) ? 1 : 0);
    gl.uniform1f(mU.u_occlude, NH.cfg.get('occlude') ? 1 : 0);
    markUniform(mU.u_m0, s.marks[0]);
    markUniform(mU.u_m1, s.marks[1]);
    markUniform(mU.u_m2, s.marks[2]);
    gl.uniform1i(mU.u_markStyle, NH.cfg.get('marker'));

    const trailOn = NH.cfg.get('trail');
    gl.uniform1f(mU.u_trailOn, trailOn ? 1 : 0);
    if (trailOn) {
      for (let i = 0; i < TRAIL_SLOTS; i++) {
        const t = s.trail[i];
        if (t) gl.uniform3f(trailU[i], t.x, t.y, t.life);
        else gl.uniform3f(trailU[i], 0, 0, 0);
      }
    }
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  return {
    init: init,
    resize: resize,
    render: render,
    get trailSlots() { return TRAIL_SLOTS; },
    get cells() { return { w: cellW, h: cellH, pixel: pixel }; },
    get error() { return failure; },
    get ok() { return !!gl; }
  };
})();

/* Shared world constants used by both the renderer and the flight
   model. Kept here so the numbers only exist once. */
NH.WORLD_SCALE = 1 / 260;   // world cells -> noise space
NH.HOVER = 7;               // levels the plane flies above the ground
NH.PLANE_SIZE = 7.2;        // half-length of the plane, in cells
