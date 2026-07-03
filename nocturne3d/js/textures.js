// ============================================================================
// NOCTURNE Nacht 1 — Prozedurale Texturen (Canvas). Alles offline.
// ============================================================================
"use strict";

var TEX = (function () {
  function make(size, draw, h) {
    var c = document.createElement("canvas");
    c.width = size; c.height = h || size;
    var ctx = c.getContext("2d");
    draw(ctx, c.width, c.height);
    var t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.anisotropy = 4;
    return t;
  }
  function noise(ctx, w, h, alpha, dark) {
    var img = ctx.getImageData(0, 0, w, h), d = img.data;
    for (var i = 0; i < d.length; i += 4) {
      var n = (Math.random() - 0.5) * 2 * alpha * 255;
      if (dark && n > 0) n *= 0.4;
      d[i] += n; d[i + 1] += n; d[i + 2] += n;
    }
    ctx.putImageData(img, 0, 0);
  }

  var T = {};

  T.grass = function () {
    return make(256, function (ctx, w, h) {
      ctx.fillStyle = "#121a0e"; ctx.fillRect(0, 0, w, h);
      for (var i = 0; i < 1600; i++) {
        var x = Math.random() * w, y = Math.random() * h, g = 18 + Math.random() * 26;
        ctx.strokeStyle = "rgba(" + (g * 0.5 | 0) + "," + (g | 0) + "," + (g * 0.3 | 0) + ",0.55)";
        ctx.beginPath(); ctx.moveTo(x, y);
        ctx.lineTo(x + (Math.random() - 0.5) * 3, y - 2 - Math.random() * 5); ctx.stroke();
      }
      noise(ctx, w, h, 0.05, true);
    });
  };

  T.forestFloor = function () {
    return make(256, function (ctx, w, h) {
      ctx.fillStyle = "#15130c"; ctx.fillRect(0, 0, w, h);
      for (var i = 0; i < 500; i++) {                    // Laub
        var v = 20 + Math.random() * 26;
        ctx.fillStyle = "rgba(" + (v | 0) + "," + (v * 0.7 | 0) + "," + (v * 0.3 | 0) + ",0.5)";
        ctx.beginPath();
        ctx.ellipse(Math.random() * w, Math.random() * h, 2 + Math.random() * 3, 1.5, Math.random() * 3, 0, 7);
        ctx.fill();
      }
      noise(ctx, w, h, 0.07, true);
    });
  };

  T.asphalt = function () {
    return make(256, function (ctx, w, h) {
      ctx.fillStyle = "#191a1c"; ctx.fillRect(0, 0, w, h);
      noise(ctx, w, h, 0.09, true);
      for (var i = 0; i < 26; i++) {                     // Risse
        ctx.strokeStyle = "rgba(8,8,9,0.6)";
        ctx.beginPath();
        var x = Math.random() * w, y = Math.random() * h;
        ctx.moveTo(x, y);
        for (var j = 0; j < 3; j++) { x += (Math.random() - 0.5) * 26; y += (Math.random() - 0.5) * 26; ctx.lineTo(x, y); }
        ctx.stroke();
      }
      for (var k = 0; k < 10; k++) {                     // Oelflecken
        ctx.fillStyle = "rgba(5,6,8,0.35)";
        ctx.beginPath(); ctx.arc(Math.random() * w, Math.random() * h, 5 + Math.random() * 14, 0, 7); ctx.fill();
      }
    });
  };

  T.concrete = function () {
    return make(256, function (ctx, w, h) {
      ctx.fillStyle = "#2c2c2e"; ctx.fillRect(0, 0, w, h);
      noise(ctx, w, h, 0.08, true);
      ctx.strokeStyle = "rgba(10,10,10,0.5)";
      for (var x = 0; x <= w; x += 64) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke(); }
      for (var y = 0; y <= h; y += 64) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke(); }
    });
  };

  T.dirt = function () {
    return make(128, function (ctx, w, h) {
      ctx.fillStyle = "#241d12"; ctx.fillRect(0, 0, w, h);
      noise(ctx, w, h, 0.1, true);
      for (var i = 0; i < 22; i++) {
        ctx.fillStyle = "rgba(60,50,32,0.35)";
        ctx.beginPath(); ctx.ellipse(Math.random() * w, Math.random() * h, 3 + Math.random() * 6, 2, 0, 0, 7); ctx.fill();
      }
    });
  };

  // Gebaeude: schmutzige Metall-/Putzfassade der Tankstelle
  T.siding = function () {
    return make(256, function (ctx, w, h) {
      ctx.fillStyle = "#3d4247"; ctx.fillRect(0, 0, w, h);
      for (var y = 0; y < h; y += 22) {                  // horizontale Paneele
        ctx.fillStyle = (y / 22) % 2 ? "#394047" : "#414850";
        ctx.fillRect(0, y, w, 20);
        ctx.strokeStyle = "rgba(0,0,0,0.55)";
        ctx.strokeRect(0, y, w, 20);
      }
      // Rostlaeufer
      for (var i = 0; i < 8; i++) {
        var x = Math.random() * w;
        var gr = ctx.createLinearGradient(0, 0, 0, h);
        gr.addColorStop(0, "rgba(90,50,25,0)");
        gr.addColorStop(1, "rgba(90,50,25,0.35)");
        ctx.fillStyle = gr;
        ctx.fillRect(x, Math.random() * h * 0.4, 3 + Math.random() * 6, h);
      }
      noise(ctx, w, h, 0.05, true);
    });
  };

  T.interior = function () {
    return make(256, function (ctx, w, h) {
      ctx.fillStyle = "#4a4640"; ctx.fillRect(0, 0, w, h);
      noise(ctx, w, h, 0.06, true);
      var gr = ctx.createLinearGradient(0, 0, 0, h);
      gr.addColorStop(0, "rgba(0,0,0,0.12)");
      gr.addColorStop(1, "rgba(15,10,4,0.4)");
      ctx.fillStyle = gr; ctx.fillRect(0, 0, w, h);
    });
  };

  T.tiles = function () {                                 // Shopboden
    return make(256, function (ctx, w, h) {
      var n = 8, g = w / n;
      for (var y = 0; y < n; y++) for (var x = 0; x < n; x++) {
        var v = 52 + ((x + y) % 2) * 10 + Math.random() * 8;
        ctx.fillStyle = "rgb(" + (v | 0) + "," + (v | 0) + "," + (v - 4 | 0) + ")";
        ctx.fillRect(x * g, y * g, g - 1, g - 1);
      }
      noise(ctx, w, h, 0.05, true);
    });
  };

  T.woodWall = function () {                              // Jagdhuette
    return make(256, function (ctx, w, h) {
      for (var y = 0; y < h; y += 26) {
        var v = 42 + Math.random() * 16;
        ctx.fillStyle = "rgb(" + (v | 0) + "," + (v * 0.66 | 0) + "," + (v * 0.4 | 0) + ")";
        ctx.fillRect(0, y, w, 24);
        ctx.strokeStyle = "rgba(0,0,0,0.6)"; ctx.strokeRect(0, y, w, 24);
        for (var i = 0; i < 14; i++) {
          ctx.strokeStyle = "rgba(0,0,0,0.18)";
          var yy = y + Math.random() * 24;
          ctx.beginPath(); ctx.moveTo(0, yy); ctx.lineTo(w, yy + (Math.random() - 0.5) * 5); ctx.stroke();
        }
      }
      noise(ctx, w, h, 0.06, true);
    });
  };

  T.planks = function () {
    return make(256, function (ctx, w, h) {
      var rows = 6;
      for (var r = 0; r < rows; r++) {
        var v = 46 * (0.7 + Math.random() * 0.5);
        ctx.fillStyle = "rgb(" + (v | 0) + "," + (v * 0.66 | 0) + "," + (v * 0.42 | 0) + ")";
        ctx.fillRect(0, r * h / rows, w, h / rows - 1);
        ctx.strokeStyle = "rgba(0,0,0,0.55)";
        ctx.strokeRect(0, r * h / rows, w, h / rows - 1);
      }
      noise(ctx, w, h, 0.06, true);
    });
  };

  T.rock = function () {
    return make(256, function (ctx, w, h) {
      ctx.fillStyle = "#26262a"; ctx.fillRect(0, 0, w, h);
      for (var i = 0; i < 40; i++) {
        var v = 28 + Math.random() * 20;
        ctx.fillStyle = "rgba(" + (v | 0) + "," + (v | 0) + "," + (v + 4 | 0) + ",0.6)";
        ctx.beginPath();
        var x = Math.random() * w, y = Math.random() * h;
        ctx.moveTo(x, y);
        for (var j = 0; j < 6; j++) ctx.lineTo(x + (Math.random() - 0.5) * 60, y + (Math.random() - 0.5) * 40);
        ctx.closePath(); ctx.fill();
      }
      noise(ctx, w, h, 0.09, true);
    });
  };

  T.roof = function () {
    return make(256, function (ctx, w, h) {
      ctx.fillStyle = "#1c1d21"; ctx.fillRect(0, 0, w, h);
      var rows = 8;
      for (var r = 0; r < rows; r++) for (var x = 0; x < w; x += 20) {
        var v = 22 + Math.random() * 12;
        ctx.fillStyle = "rgb(" + (v | 0) + "," + (v | 0) + "," + (v + 4 | 0) + ")";
        ctx.fillRect(x + (r % 2 ? 10 : 0), r * h / rows, 19, h / rows - 1);
      }
      noise(ctx, w, h, 0.05, true);
    });
  };

  T.bark = function () {
    return make(128, function (ctx, w, h) {
      ctx.fillStyle = "#171310"; ctx.fillRect(0, 0, w, h);
      for (var x = 0; x < w; x += 4) {
        var v = 20 + Math.random() * 18;
        ctx.fillStyle = "rgb(" + (v | 0) + "," + (v * 0.8 | 0) + "," + (v * 0.55 | 0) + ")";
        ctx.fillRect(x, 0, 3, h);
      }
      for (var i = 0; i < 20; i++) {
        ctx.strokeStyle = "rgba(0,0,0,0.5)";
        ctx.beginPath();
        var xx = Math.random() * w;
        ctx.moveTo(xx, 0); ctx.lineTo(xx + (Math.random() - 0.5) * 10, h); ctx.stroke();
      }
      noise(ctx, w, h, 0.08, true);
    });
  };

  // Fensterfront: dunkle Scheibe mit schwachem Innenlicht + Rahmen
  T.windowLit = function () {
    return make(128, function (ctx, w, h) {
      ctx.fillStyle = "#3d4247"; ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = "#0e1620";
      ctx.fillRect(8, 14, w - 16, h - 34);
      var gr = ctx.createLinearGradient(0, 14, 0, h - 20);
      gr.addColorStop(0, "rgba(255,220,150,0.30)");
      gr.addColorStop(0.5, "rgba(255,210,130,0.10)");
      gr.addColorStop(1, "rgba(255,220,150,0.03)");
      ctx.fillStyle = gr;
      ctx.fillRect(8, 14, w - 16, h - 34);
      ctx.strokeStyle = "#22262b"; ctx.lineWidth = 4;
      ctx.strokeRect(8, 14, w - 16, h - 34);
      ctx.beginPath(); ctx.moveTo(w / 2, 14); ctx.lineTo(w / 2, h - 20); ctx.stroke();
      ctx.lineWidth = 1;
      noise(ctx, w, h, 0.03, true);
    });
  };

  T.doorWood = function () {
    return make(128, function (ctx, w, h) {
      var v;
      for (var y = 0; y < h; y += 22) {
        v = 40 + Math.random() * 10;
        ctx.fillStyle = "rgb(" + (v | 0) + "," + (v * 0.7 | 0) + "," + (v * 0.45 | 0) + ")";
        ctx.fillRect(0, y, w, 21);
      }
      ctx.strokeStyle = "rgba(0,0,0,0.7)"; ctx.lineWidth = 4;
      ctx.strokeRect(5, 5, w - 10, h - 10);
      ctx.strokeRect(w * 0.2, h * 0.12, w * 0.6, h * 0.3);
      ctx.strokeRect(w * 0.2, h * 0.55, w * 0.6, h * 0.34);
      ctx.lineWidth = 1;
      noise(ctx, w, h, 0.05, true);
    });
  };

  T.rollDoor = function () {
    return make(128, function (ctx, w, h) {
      for (var y = 0; y < h; y += 12) {
        var v = 46 + (y / 12 % 2) * 8;
        ctx.fillStyle = "rgb(" + (v | 0) + "," + (v + 2 | 0) + "," + (v + 5 | 0) + ")";
        ctx.fillRect(0, y, w, 11);
        ctx.strokeStyle = "rgba(0,0,0,0.6)";
        ctx.beginPath(); ctx.moveTo(0, y + 11); ctx.lineTo(w, y + 11); ctx.stroke();
      }
      noise(ctx, w, h, 0.05, true);
    });
  };

  T.shelf = function () {                                 // Regal mit bunten Waren
    return make(128, function (ctx, w, h) {
      ctx.fillStyle = "#20242a"; ctx.fillRect(0, 0, w, h);
      var rows = 4;
      for (var r = 0; r < rows; r++) {
        var y = r * h / rows;
        ctx.fillStyle = "#31363e"; ctx.fillRect(0, y + h / rows - 5, w, 5);
        for (var x = 4; x < w - 8; x += 11) {
          var hue = [["#7a3030"], ["#2f5f3a"], ["#7a6a2c"], ["#32507a"], ["#6a3a72"]][(x / 11 | 0) % 5][0];
          ctx.fillStyle = hue;
          ctx.fillRect(x, y + 6 + Math.random() * 4, 9, h / rows - 14);
        }
      }
      noise(ctx, w, h, 0.05, true);
    });
  };

  T.skin = function () {
    return make(128, function (ctx, w, h) {
      ctx.fillStyle = "#7e7268"; ctx.fillRect(0, 0, w, h);
      noise(ctx, w, h, 0.16, true);
      for (var i = 0; i < 30; i++) {
        ctx.strokeStyle = "rgba(60,34,36,0.3)";
        ctx.beginPath();
        var x = Math.random() * w, y = Math.random() * h;
        ctx.moveTo(x, y);
        for (var j = 0; j < 4; j++) { x += (Math.random() - 0.5) * 20; y += (Math.random() - 0.5) * 20; ctx.lineTo(x, y); }
        ctx.stroke();
      }
      for (var k = 0; k < 26; k++) {
        ctx.fillStyle = "rgba(40,26,26," + (0.1 + Math.random() * 0.22) + ")";
        ctx.beginPath(); ctx.arc(Math.random() * w, Math.random() * h, 2 + Math.random() * 7, 0, 7); ctx.fill();
      }
    });
  };

  T.sky = function () {
    return make(1024, function (ctx, w, h) {
      var gr = ctx.createLinearGradient(0, 0, 0, h);
      gr.addColorStop(0, "#03040a");
      gr.addColorStop(0.6, "#060913");
      gr.addColorStop(1, "#090c15");
      ctx.fillStyle = gr; ctx.fillRect(0, 0, w, h);
      for (var i = 0; i < 500; i++) {
        var b = Math.random();
        ctx.fillStyle = "rgba(200,210,255," + (0.2 + b * 0.6) + ")";
        var r = b > 0.93 ? 1.6 : 0.8;
        ctx.fillRect(Math.random() * w, Math.random() * h * 0.65, r, r);
      }
      var mx = w * 0.7, my = h * 0.18;
      var halo = ctx.createRadialGradient(mx, my, 5, mx, my, 70);
      halo.addColorStop(0, "rgba(190,200,235,0.9)");
      halo.addColorStop(0.25, "rgba(150,160,205,0.22)");
      halo.addColorStop(1, "rgba(150,160,205,0)");
      ctx.fillStyle = halo; ctx.beginPath(); ctx.arc(mx, my, 70, 0, 7); ctx.fill();
      ctx.fillStyle = "#d9def0"; ctx.beginPath(); ctx.arc(mx, my, 13, 0, 7); ctx.fill();
      ctx.fillStyle = "rgba(120,124,152,0.6)";
      ctx.beginPath(); ctx.arc(mx - 5, my + 4, 3.5, 0, 7); ctx.fill();
      ctx.beginPath(); ctx.arc(mx + 5, my - 3, 2.5, 0, 7); ctx.fill();
    });
  };

  // Neonschild der Tankstelle
  T.neonSign = function () {
    return make(256, function (ctx, w, h) {
      ctx.fillStyle = "#0b0d12"; ctx.fillRect(0, 0, w, h);
      ctx.strokeStyle = "#1c2027"; ctx.lineWidth = 6; ctx.strokeRect(3, 3, w - 6, h - 6);
      ctx.font = "bold 54px monospace"; ctx.textAlign = "center";
      ctx.shadowColor = "#ff4a3a"; ctx.shadowBlur = 18;
      ctx.fillStyle = "#ff6a55";
      ctx.fillText("GAS", w / 2, 70);
      ctx.shadowColor = "#4ab8ff";
      ctx.fillStyle = "#7ed0ff";
      ctx.font = "bold 40px monospace";
      ctx.fillText("24 h", w / 2, 128);
      ctx.shadowBlur = 0;
    }, 160);
  };

  // Bestell-Sprechblasen (Kunde)
  T.bubble = function (text) {
    return make(128, function (ctx, w, h) {
      ctx.clearRect(0, 0, w, h);
      ctx.fillStyle = "rgba(240,240,245,0.95)";
      ctx.beginPath();
      ctx.roundRect(4, 4, w - 8, h - 30, 12);
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(w / 2 - 8, h - 26); ctx.lineTo(w / 2 + 8, h - 26); ctx.lineTo(w / 2, h - 8);
      ctx.closePath(); ctx.fill();
      ctx.fillStyle = "#16181e";
      ctx.font = "bold 26px monospace"; ctx.textAlign = "center";
      ctx.fillText(text, w / 2, h / 2 - 8);
    }, 96);
  };

  return T;
})();
