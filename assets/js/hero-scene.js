/* MJ Mortgage — the home hero's line house, drawn with three.js.

   The page already shows this house as a static SVG (build.js, heroScene()).
   This file only upgrades it to a slowly turning 3D drawing, and only where
   that costs the visitor nothing they would notice:

     - desktop layout only (the hero is two columns from 1081px up);
     - never under prefers-reduced-motion, Save-Data, a 2G/3G connection,
       fewer than 4 CPU cores or less than 4 GB of device memory;
     - never without WebGL;
     - three.js (one pinned, immutable CDN file) is fetched after the page has
       loaded and the browser is idle, so it cannot delay first paint or LCP;
     - the loop runs at 30 fps at most, and stops while the hero is off screen
       or the tab is hidden.

   If any of that fails, at any point, nothing happens: the SVG stays. The
   canvas sits in an absolutely positioned box the SVG already fills, so
   switching between them moves nothing on the page. */
(function () {
  'use strict';

  var THREE_URL = 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.min.js';

  var host = document.getElementById('h-scene');
  var dataEl = document.getElementById('h-scene-data');
  if (!host || !dataEl || !window.matchMedia) return;
  var canvas = host.querySelector('canvas');
  if (!canvas) return;

  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)');
  var desktop = window.matchMedia('(min-width: 1081px)');
  var conn = navigator.connection || {};

  function allowed() {
    if (reduce.matches || !desktop.matches) return false;
    if (conn.saveData || /(^|-)(2g|3g)$/.test(conn.effectiveType || '')) return false;
    if (navigator.hardwareConcurrency && navigator.hardwareConcurrency < 4) return false;
    if (navigator.deviceMemory && navigator.deviceMemory < 4) return false;
    if (!window.WebGLRenderingContext || !('IntersectionObserver' in window)) return false;
    return true;
  }
  if (!allowed()) return;

  var house;
  try { house = JSON.parse(dataEl.textContent); } catch (e) { return; }

  var started = false;
  function start() {
    if (started || !allowed()) return;
    started = true;
    import(THREE_URL).then(build).catch(function () { /* the SVG stays */ });
  }

  function build(T) {
    var renderer;
    try {
      renderer = new T.WebGLRenderer({ canvas: canvas, alpha: true, antialias: true, powerPreference: 'low-power' });
    } catch (e) { return; }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    renderer.setClearColor(0x000000, 0);

    var scene = new T.Scene();
    var camera = new T.PerspectiveCamera(30, 1, 0.1, 50);
    camera.position.set(0, 3.9, 12.4);
    camera.lookAt(0, 1.0, 0);

    var group = new T.Group();
    function lines(flat, color, opacity) {
      var g = new T.BufferGeometry();
      g.setAttribute('position', new T.Float32BufferAttribute(flat, 3));
      var m = new T.LineBasicMaterial({ color: color, transparent: true, opacity: opacity });
      group.add(new T.LineSegments(g, m));
    }
    /* Same three inks as the SVG: teal walls, coral roof, gold lot line. */
    lines(house.g, 0xC9A96E, 0.75);
    lines(house.w, 0x1A3A45, 0.5);
    lines(house.r, 0xD4503E, 0.9);
    scene.add(group);

    function size() {
      var w = host.clientWidth, h = host.clientHeight;
      if (!w || !h) return;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    }
    size();

    var BASE = -0.62, SWING = 0.3, SPEED = 0.00022; /* one slow sway, about 28 s */
    var raf = 0, last = 0, onScreen = true, live = false, t0 = performance.now();

    function frame(now) {
      raf = requestAnimationFrame(frame);
      if (now - last < 33) return;
      last = now;
      group.rotation.y = BASE + Math.sin((now - t0) * SPEED) * SWING;
      renderer.render(scene, camera);
      if (!live) { live = true; host.classList.add('live'); }
    }
    function play() { if (!raf && onScreen && !document.hidden && allowed()) raf = requestAnimationFrame(frame); }
    function pause() { if (raf) { cancelAnimationFrame(raf); raf = 0; } }

    new IntersectionObserver(function (entries) {
      onScreen = entries[0].isIntersecting;
      if (onScreen) play(); else pause();
    }, { threshold: 0.05 }).observe(host);
    document.addEventListener('visibilitychange', function () { if (document.hidden) pause(); else play(); });

    /* Narrowed below the desktop layout, or the visitor switched reduced
       motion on: hand the box back to the SVG. */
    function recheck() {
      if (allowed()) { size(); play(); } else { pause(); live = false; host.classList.remove('live'); }
    }
    if (desktop.addEventListener) { desktop.addEventListener('change', recheck); reduce.addEventListener('change', recheck); }
    if ('ResizeObserver' in window) new ResizeObserver(size).observe(host);
    else window.addEventListener('resize', size, { passive: true });

    canvas.addEventListener('webglcontextlost', function (e) {
      e.preventDefault(); pause(); live = false; host.classList.remove('live');
    });
    canvas.addEventListener('webglcontextrestored', function () { size(); play(); });

    play();
  }

  /* After load, when the browser has nothing better to do. */
  function whenIdle() {
    if ('requestIdleCallback' in window) requestIdleCallback(start, { timeout: 3000 });
    else setTimeout(start, 1200);
  }
  if (document.readyState === 'complete') whenIdle();
  else window.addEventListener('load', whenIdle, { once: true });
})();
