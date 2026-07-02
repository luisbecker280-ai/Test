// ============================================================================
// NOCTURNE 3D — Prozedurale Texturen (Canvas -> THREE.CanvasTexture)
// Kein einziger externer Download: alles wird zur Laufzeit gemalt.
// ============================================================================
"use strict";

var TEX = (function () {
  function make(size, draw) {
    var c = document.createElement("canvas");
    c.width = c.height = size;
    var ctx = c.getContext("2d");
    draw(ctx, size);
    var t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.anisotropy = 4;
    return t;
  }

  function noise(ctx, s, alpha, dark) {
    var img = ctx.getImageData(0, 0, s, s), d = img.data;
    for (var i = 0; i < d.length; i += 4) {
      var n = (Math.random() - 0.5) * 2 * alpha * 255;
      if (dark && n > 0) n *= 0.4;
      d[i] += n; d[i + 1] += n; d[i + 2] += n;
    }
    ctx.putImageData(img, 0, 0);
  }

  function grass(ctx, s) {
    ctx.fillStyle = "#141d10"; ctx.fillRect(0, 0, s, s);
    for (var i = 0; i < 1400; i++) {
      var x = Math.random() * s, y = Math.random() * s;
      var g = 22 + Math.random() * 26;
      ctx.strokeStyle = "rgba(" + (g * 0.5 | 0) + "," + (g | 0) + "," + (g * 0.35 | 0) + ",0.6)";
      ctx.beginPath(); ctx.moveTo(x, y);
      ctx.lineTo(x + (Math.random() - 0.5) * 3, y - 2 - Math.random() * 4);
      ctx.stroke();
    }
    noise(ctx, s, 0.05, true);
  }

  function path(ctx, s) {
    ctx.fillStyle = "#1b1a17"; ctx.fillRect(0, 0, s, s);
    var n = 5, g = s / n;
    for (var y = 0; y < n; y++) for (var x = 0; x < n; x++) {
      var v = 40 + Math.random() * 22;
      ctx.fillStyle = "rgb(" + (v | 0) + "," + (v - 3 | 0) + "," + (v - 6 | 0) + ")";
      ctx.beginPath();
      ctx.ellipse(x * g + g / 2 + (Math.random() - 0.5) * 5, y * g + g / 2 + (Math.random() - 0.5) * 5,
        g * 0.42, g * 0.36, Math.random() * 3, 0, 7);
      ctx.fill();
    }
    noise(ctx, s, 0.08, true);
  }

  function planks(ctx, s, base) {
    base = base || 60;
    var rows = 6;
    for (var r = 0; r < rows; r++) {
      var v = base * (0.7 + Math.random() * 0.5);
      ctx.fillStyle = "rgb(" + (v | 0) + "," + (v * 0.66 | 0) + "," + (v * 0.42 | 0) + ")";
      ctx.fillRect(0, r * s / rows, s, s / rows - 1);
      ctx.strokeStyle = "rgba(0,0,0,0.55)";
      ctx.strokeRect(0, r * s / rows, s, s / rows - 1);
      for (var i = 0; i < 24; i++) {
        ctx.strokeStyle = "rgba(0,0,0,0.16)";
        var y = r * s / rows + Math.random() * (s / rows);
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(s, y + (Math.random() - 0.5) * 4); ctx.stroke();
      }
      // Astloecher
      if (Math.random() < 0.7) {
        ctx.fillStyle = "rgba(15,9,4,0.8)";
        ctx.beginPath();
        ctx.ellipse(Math.random() * s, r * s / rows + s / rows / 2, 3, 2, 0, 0, 7);
        ctx.fill();
      }
    }
    noise(ctx, s, 0.06, true);
  }

  function wallpaper(ctx, s) {
    ctx.fillStyle = "#2a2431"; ctx.fillRect(0, 0, s, s);
    // vertikale Streifen
    for (var x = 0; x < s; x += 16) {
      ctx.fillStyle = (x / 16) % 2 ? "#241f2b" : "#2d2735";
      ctx.fillRect(x, 0, 16, s);
    }
    // Ornament-Punkte
    ctx.fillStyle = "rgba(120,105,90,0.20)";
    for (var y = 8; y < s; y += 24) for (var x2 = 8; x2 < s; x2 += 16) {
      ctx.beginPath(); ctx.arc(x2, y + (x2 % 32 ? 6 : 0), 2.2, 0, 7); ctx.fill();
    }
    // Wasserflecken / Grime unten
    var gr = ctx.createLinearGradient(0, 0, 0, s);
    gr.addColorStop(0, "rgba(0,0,0,0.25)");
    gr.addColorStop(0.5, "rgba(0,0,0,0)");
    gr.addColorStop(1, "rgba(10,6,2,0.5)");
    ctx.fillStyle = gr; ctx.fillRect(0, 0, s, s);
    noise(ctx, s, 0.05, true);
  }

  function plaster(ctx, s) {
    ctx.fillStyle = "#4a453d"; ctx.fillRect(0, 0, s, s);
    noise(ctx, s, 0.10, true);
    // Risse
    for (var i = 0; i < 7; i++) {
      ctx.strokeStyle = "rgba(12,10,8,0.5)";
      ctx.beginPath();
      var x = Math.random() * s, y = 0;
      ctx.moveTo(x, y);
      while (y < s) { y += 8 + Math.random() * 14; x += (Math.random() - 0.5) * 14; ctx.lineTo(x, y); }
      ctx.stroke();
    }
    var gr = ctx.createLinearGradient(0, 0, 0, s);
    gr.addColorStop(0, "rgba(0,0,0,0.15)");
    gr.addColorStop(1, "rgba(20,16,8,0.45)");
    ctx.fillStyle = gr; ctx.fillRect(0, 0, s, s);
  }

  function fence(ctx, s) {
    ctx.fillStyle = "#0c0d10"; ctx.fillRect(0, 0, s, s);
    var n = 7, w = s / n;
    for (var i = 0; i < n; i++) {
      var v = 32 + Math.random() * 14;
      ctx.fillStyle = "rgb(" + (v | 0) + "," + (v * 0.8 | 0) + "," + (v * 0.55 | 0) + ")";
      ctx.fillRect(i * w + 2, 0, w - 5, s);
      ctx.strokeStyle = "rgba(0,0,0,0.5)";
      for (var j = 0; j < 6; j++) {
        ctx.beginPath();
        ctx.moveTo(i * w + 3, Math.random() * s);
        ctx.lineTo(i * w + w - 4, Math.random() * s);
        ctx.stroke();
      }
    }
    noise(ctx, s, 0.07, true);
  }

  function ceiling(ctx, s) {
    ctx.fillStyle = "#3a3733"; ctx.fillRect(0, 0, s, s);
    noise(ctx, s, 0.08, true);
    // Wasserflecken
    for (var i = 0; i < 5; i++) {
      var x = Math.random() * s, y = Math.random() * s, r = 10 + Math.random() * 26;
      var gr = ctx.createRadialGradient(x, y, 2, x, y, r);
      gr.addColorStop(0, "rgba(30,22,10,0.45)");
      gr.addColorStop(1, "rgba(30,22,10,0)");
      ctx.fillStyle = gr;
      ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fill();
    }
  }

  function roof(ctx, s) {
    ctx.fillStyle = "#17181c"; ctx.fillRect(0, 0, s, s);
    var rows = 8;
    for (var r = 0; r < rows; r++) for (var x = 0; x < s; x += 16) {
      var v = 20 + Math.random() * 12;
      ctx.fillStyle = "rgb(" + (v | 0) + "," + (v | 0) + "," + (v + 4 | 0) + ")";
      ctx.fillRect(x + (r % 2 ? 8 : 0), r * s / rows, 15, s / rows - 1);
    }
    noise(ctx, s, 0.05, true);
  }

  function doorWood(ctx, s) {
    planks(ctx, s, 46);
    // Tuerrahmen + Fuellungen andeuten
    ctx.strokeStyle = "rgba(0,0,0,0.7)"; ctx.lineWidth = 4;
    ctx.strokeRect(6, 6, s - 12, s - 12);
    ctx.strokeRect(s * 0.22, s * 0.10, s * 0.56, s * 0.32);
    ctx.strokeRect(s * 0.22, s * 0.55, s * 0.56, s * 0.35);
    ctx.lineWidth = 1;
  }

  function bark(ctx, s) {
    ctx.fillStyle = "#191410"; ctx.fillRect(0, 0, s, s);
    for (var x = 0; x < s; x += 5) {
      var v = 18 + Math.random() * 16;
      ctx.fillStyle = "rgb(" + (v | 0) + "," + (v * 0.8 | 0) + "," + (v * 0.55 | 0) + ")";
      ctx.fillRect(x, 0, 3, s);
    }
    noise(ctx, s, 0.09, true);
  }

  function skin(ctx, s) {
    ctx.fillStyle = "#8d7f74"; ctx.fillRect(0, 0, s, s);
    noise(ctx, s, 0.15, true);
    // Adern / Flecken
    for (var i = 0; i < 26; i++) {
      ctx.strokeStyle = "rgba(70,40,40,0.30)";
      ctx.beginPath();
      var x = Math.random() * s, y = Math.random() * s;
      ctx.moveTo(x, y);
      for (var j = 0; j < 4; j++) { x += (Math.random() - 0.5) * 22; y += (Math.random() - 0.5) * 22; ctx.lineTo(x, y); }
      ctx.stroke();
    }
    for (var k = 0; k < 30; k++) {
      ctx.fillStyle = "rgba(40,26,26," + (0.1 + Math.random() * 0.2) + ")";
      ctx.beginPath();
      ctx.arc(Math.random() * s, Math.random() * s, 2 + Math.random() * 7, 0, 7);
      ctx.fill();
    }
  }

  function sky(ctx, s) {
    var gr = ctx.createLinearGradient(0, 0, 0, s);
    gr.addColorStop(0, "#04050c");
    gr.addColorStop(0.6, "#070a16");
    gr.addColorStop(1, "#0a0d18");
    ctx.fillStyle = gr; ctx.fillRect(0, 0, s, s);
    // Sterne
    for (var i = 0; i < 420; i++) {
      var b = Math.random();
      ctx.fillStyle = "rgba(200,210,255," + (0.25 + b * 0.6) + ")";
      var r = b > 0.92 ? 1.6 : 0.8;
      ctx.fillRect(Math.random() * s, Math.random() * s * 0.7, r, r);
    }
    // Mond mit Hof
    var mx = s * 0.72, my = s * 0.2;
    var halo = ctx.createRadialGradient(mx, my, 4, mx, my, 60);
    halo.addColorStop(0, "rgba(190,200,230,0.9)");
    halo.addColorStop(0.25, "rgba(150,160,200,0.25)");
    halo.addColorStop(1, "rgba(150,160,200,0)");
    ctx.fillStyle = halo;
    ctx.beginPath(); ctx.arc(mx, my, 60, 0, 7); ctx.fill();
    ctx.fillStyle = "#d8dcec";
    ctx.beginPath(); ctx.arc(mx, my, 11, 0, 7); ctx.fill();
    ctx.fillStyle = "rgba(120,124,150,0.6)";
    ctx.beginPath(); ctx.arc(mx - 4, my + 3, 3, 0, 7); ctx.fill();
    ctx.beginPath(); ctx.arc(mx + 4, my - 2, 2, 0, 7); ctx.fill();
  }

  return {
    grass: function () { return make(256, grass); },
    path: function () { return make(128, path); },
    planks: function () { return make(256, function (c, s) { planks(c, s); }); },
    wallpaper: function () { return make(256, wallpaper); },
    plaster: function () { return make(256, plaster); },
    fence: function () { return make(256, fence); },
    ceiling: function () { return make(256, ceiling); },
    roof: function () { return make(256, roof); },
    doorWood: function () { return make(128, doorWood); },
    bark: function () { return make(128, bark); },
    skin: function () { return make(128, skin); },
    sky: function () { return make(1024, sky); },
  };
})();
