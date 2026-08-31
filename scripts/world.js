/* world.js — the renderer.

   The site draws everything in cells, and not in screen pixels.
   The canvas is width / pixelSize cells wide. The CSS then makes
   it larger with image-rendering: pixelated.

   Thus one fragment is one cell that you see. The number of
   fragments falls by about 16 times. The pixel grid is also
   exact, and the site does not make it from rounded values. */
window.NH = window.NH || {};

NH.HOVER = 7;         // levels the plane flies above the ground
NH.PLANE_SIZE = 7.2;  // half-length of the plane, in cells

NH.World = (function () {
  let gl = null, canvas = null;
  let heightProg = null, visProg = null, mainProg = null;
  let heightFbo = null, heightTex = null;
  let visFbo = null, visTex = null;
  let cellW = 0, cellH = 0, texW = 0, texH = 0, pixel = 0, pad = 0;
  let hU = {}, vU = {}, mU = {}, trailU = [];
  let failure = null;
  /* The browser can take the GPU back at any time. A change to a
     different tab on a phone is enough. Each item that belongs to
     the old context then goes away. So the renderer must stop
     until this file makes them all again. */
  let lost = false;

  /* Pass 1 and pass 2 depend on the camera position and the
     terrain settings. They do not depend on the plane.

     If none of those changed after the last frame, the two
     textures are still correct. So the renderer does not draw
     them again. This saves most of the work of the frame each
     time the camera stops. That is the condition when a sheet is
     open and a person reads it. */
  let camKeyX = NaN, camKeyY = NaN, camKeyEpoch = 0;
  let passesSkipped = 0, passesRun = 0;

  /* Most uniforms come from the settings. A setting changes when
     a person clicks a control, and not 60 times a second. This
     counter goes up after each change. The uniforms from the
     settings go to the GPU only after the counter goes up. */
  let settingsEpoch = 1, sentEpoch = 0;

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

    canvas.addEventListener('webglcontextlost', function (e) {
      /* Without preventDefault the browser will not bother to
         restore it, and the page is a blank rectangle for good. */
      e.preventDefault();
      lost = true;
    });
    canvas.addEventListener('webglcontextrestored', function () {
      if (build()) { lost = false; resize(); }
    });

    if (!build()) return false;
    resize();
    return true;
  }

  /* Everything that belongs to the GL context, in one function, so
     it can be run again after a restore. */
  function build() {
    try {
      /* WebGL 1 gives highp as a minimum only. If the fragment
         stage has none, put the whole shader at mediump. The
         shader then compiles. */
      const hp = gl.getShaderPrecisionFormat(gl.FRAGMENT_SHADER, gl.HIGH_FLOAT);
      const prec = (hp && hp.precision > 0) ? 'highp' : 'mediump';
      const fix = function (s) { return s.replace('precision highp float;', 'precision ' + prec + ' float;'); };

      heightProg = link(NH.VERT, fix(NH.FRAG_HEIGHT));
      visProg = link(NH.VERT, fix(NH.FRAG_VISIBLE));
      mainProg = link(NH.VERT, fix(NH.FRAG_MAIN));
    } catch (e) {
      failure = e.message; return false;
    }

    /* One large triangle covers the screen with three vertices.
       A rectangle would need six indexes. */
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

    hU = uniforms(heightProg, ['u_texSize', 'u_cam', 'u_pad', 'u_seed', 'u_scale',
      'u_sea', 'u_terrain', 'u_m0', 'u_m1', 'u_m2', 'u_markR']);
    vU = uniforms(visProg, ['u_height', 'u_texSize', 'u_pad', 'u_lift']);
    mU = uniforms(mainProg, ['u_height', 'u_visible', 'u_texSize', 'u_res', 'u_cam', 'u_pad',
      'u_lift', 'u_sea', 'u_seed', 'u_time', 'u_palette', 'u_inkMode', 'u_light',
      'u_waterStyle', 'u_clouds', 'u_fog', 'u_plane', 'u_planeRot', 'u_bankScale',
      'u_hover', 'u_planeSize',
      'u_planeKind', 'u_planeOn', 'u_shadowOn', 'u_occlude',
      'u_m0', 'u_m1', 'u_m2', 'u_markStyle', 'u_trailMode']);
    trailU = [];
    for (let i = 0; i < TRAIL_SLOTS; i++) {
      trailU.push(gl.getUniformLocation(mainProg, 'u_trail[' + i + ']'));
    }

    heightFbo = gl.createFramebuffer();
    visFbo = gl.createFramebuffer();
    heightTex = newTarget();
    visTex = newTarget();
    settingsEpoch++;
    return true;
  }

  /* WebGL 1 permits a texture with a size that is not a power of
     two only with NEAREST and CLAMP_TO_EDGE. Those two are also
     correct here. Each texel holds one exact level. It does not
     hold a colour for the GPU to mix. */
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

  function liftNow() { return NH.cfg.v.view === 'flat' ? 0 : NH.cfg.v.lift; }

  /* Give the canvas a size in cells. Then give it a CSS scale
     that is a whole number. Thus no cell lands on a half pixel. */
  function resize() {
    if (!gl || lost) return;
    pixel = NH.cfg.v.pixel;
    /* The height texture must reach below the screen as far as
       the layer search looks. That is LEVELS * lift rows. It does
       not need the rows for the largest lift. */
    pad = NH.LEVELS * liftNow();

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
    settingsEpoch++;            // the textures are blank and the
                                // programs lost their uniforms
  }

  /* Pass 1 asks only if a beacon exists. It does not ask for the
     brightness of the pulse. The pulse would change the key 60
     times a second, and the renderer would draw the pass again on
     each frame. */
  function markStatic(loc, mark) {
    gl.uniform3f(loc, mark ? mark.x : 0, mark ? mark.y : 0, mark ? 1 : -1);
  }
  function markLive(loc, mark) {
    if (!mark) { gl.uniform3f(loc, 0, 0, -1); return; }
    gl.uniform3f(loc, mark.x, mark.y, mark.glow === undefined ? 0 : mark.glow);
  }

  function render(s) {
    if (!gl || lost) return;
    const v = NH.cfg.v;
    const lift = liftNow();
    /* The camera lands on whole cells. Part of a cell would make
       the terrain move between two cells and look unstable. */
    const camX = Math.round(s.cam.x), camY = Math.round(s.cam.y);
    const marks = s.marks;

    /* Pass 1 and pass 2 draw the two textures again only after
       the camera moves or a setting changes. This test compares
       three numbers. It makes no string for the garbage collector
       to remove. */
    if (camX !== camKeyX || camY !== camKeyY || settingsEpoch !== camKeyEpoch) {
      camKeyX = camX; camKeyY = camY; camKeyEpoch = settingsEpoch;
      passesRun++;

      // ---- pass 1: the height field ----
      gl.bindFramebuffer(gl.FRAMEBUFFER, heightFbo);
      gl.viewport(0, 0, texW, texH);
      gl.useProgram(heightProg);
      gl.uniform2f(hU.u_texSize, texW, texH);
      gl.uniform2f(hU.u_cam, camX, camY);
      gl.uniform1f(hU.u_pad, pad);
      gl.uniform2f(hU.u_seed, s.seed.x, s.seed.y);
      gl.uniform1f(hU.u_scale, v.scale);
      gl.uniform1f(hU.u_sea, NH.SEA);
      gl.uniform1i(hU.u_terrain, v.terrain);
      gl.uniform1f(hU.u_markR, NH.MARK_RADIUS);
      markStatic(hU.u_m0, marks[0]);
      markStatic(hU.u_m1, marks[1]);
      markStatic(hU.u_m2, marks[2]);
      gl.drawArrays(gl.TRIANGLES, 0, 3);

      // ---- pass 2: find the visible layer, once for each cell ----
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
    } else {
      passesSkipped++;
    }

    // ---- pass 3: the picture ----
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, cellW, cellH);
    gl.useProgram(mainProg);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, heightTex);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, visTex);

    if (sentEpoch !== settingsEpoch) {
      sentEpoch = settingsEpoch;
      gl.uniform1i(mU.u_height, 0);
      gl.uniform1i(mU.u_visible, 1);
      gl.uniform2f(mU.u_texSize, texW, texH);
      gl.uniform2f(mU.u_res, cellW, cellH);
      gl.uniform1f(mU.u_pad, pad);
      gl.uniform1f(mU.u_lift, lift);
      gl.uniform1f(mU.u_sea, NH.SEA);
      gl.uniform1f(mU.u_hover, NH.HOVER);
      gl.uniform1f(mU.u_planeSize, NH.PLANE_SIZE);
      gl.uniform1i(mU.u_palette, v.palette);
      gl.uniform1i(mU.u_inkMode, v.ink);
      gl.uniform1i(mU.u_light, v.light);
      gl.uniform1i(mU.u_waterStyle, v.water);
      gl.uniform1f(mU.u_clouds, v.clouds ? 1 : 0);
      gl.uniform1f(mU.u_fog, v.fog ? 1 : 0);
      gl.uniform1i(mU.u_planeKind, v.plane);
      gl.uniform1f(mU.u_planeOn, 1);
      gl.uniform1f(mU.u_shadowOn, (v.shadow && lift > 0) ? 1 : 0);
      gl.uniform1f(mU.u_occlude, v.occlude ? 1 : 0);
      gl.uniform1i(mU.u_markStyle, v.marker);
      gl.uniform1i(mU.u_trailMode, v.trail);
      gl.uniform2f(mU.u_seed, s.seed.x, s.seed.y);
    }

    // ---- what changes every frame ----
    gl.uniform2f(mU.u_cam, camX, camY);
    gl.uniform1f(mU.u_time, s.time);
    gl.uniform3f(mU.u_plane, s.plane.x, s.plane.y, s.plane.heading);
    gl.uniform2f(mU.u_planeRot, Math.cos(s.plane.heading), Math.sin(s.plane.heading));
    /* The shader multiplies the local y by this value. The limit
       of 0.34 stops a hard turn. Without it the plane would
       become a line. */
    gl.uniform1f(mU.u_bankScale, 1 / Math.max(0.34, Math.cos(s.plane.bank)));
    markLive(mU.u_m0, marks[0]);
    markLive(mU.u_m1, marks[1]);
    markLive(mU.u_m2, marks[2]);

    if (v.trail > 0) {
      const trail = s.trail;
      for (let i = 0; i < TRAIL_SLOTS; i++) {
        const t = trail[i];
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
    /* Make pass 1 and pass 2 run on the next frame. Call this
       after a change that the key does not hold. Only a new world
       seed does that. */
    /* Call this after a setting changes. The next frame then
       sends the settings uniforms again. It also draws pass 1 and
       pass 2 again. */
    settingsChanged: function () { settingsEpoch++; },
    /* Call after the world seed changes. */
    invalidate: function () { settingsEpoch++; },
    get cells() { return { w: cellW, h: cellH, pixel: pixel }; },
    get stats() { return { passesRun: passesRun, passesSkipped: passesSkipped }; },
    get error() { return failure; },
    get lost() { return lost; }
  };
})();
