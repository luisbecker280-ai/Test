// ============================================================================
// NOCTURNE 3D — Weltgeometrie
// Statische Waende/Boeden/Decken werden pro Material zu EINEM Mesh gemerged
// (Face-Culling zwischen benachbarten Wandzellen) -> sehr wenige Draw-Calls.
// ============================================================================
"use strict";

var GEO = (function () {
  var C = CFG.CELL, WH = CFG.WALL_H, F1 = CFG.FLOOR1_Y;

  // --- Mesh-Builder: sammelt Quads und baut daraus eine BufferGeometry -----
  function Builder() { this.pos = []; this.norm = []; this.uv = []; this.idx = []; }
  Builder.prototype.quad = function (a, b, c, d, n, uvs) {
    var base = this.pos.length / 3;
    [a, b, c, d].forEach(function (p) { this.pos.push(p[0], p[1], p[2]); }, this);
    for (var i = 0; i < 4; i++) this.norm.push(n[0], n[1], n[2]);
    uvs.forEach(function (t) { this.uv.push(t[0], t[1]); }, this);
    this.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
  };
  Builder.prototype.mesh = function (material) {
    var g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute("normal", new THREE.Float32BufferAttribute(this.norm, 3));
    g.setAttribute("uv", new THREE.Float32BufferAttribute(this.uv, 2));
    g.setIndex(this.idx);
    var m = new THREE.Mesh(g, material);
    m.castShadow = true;
    m.receiveShadow = true;
    return m;
  };

  // Vertikale Wandflaeche an einer Zellkante. dir: 0=+x 1=-x 2=+z 3=-z
  function wallFace(b, cx, cz, dir, yb, yt) {
    var x0 = cx * C, x1 = x0 + C, z0 = cz * C, z1 = z0 + C;
    var vv = (yt - yb) / WH;
    if (dir === 0) b.quad([x1, yb, z1], [x1, yb, z0], [x1, yt, z0], [x1, yt, z1], [1, 0, 0], [[0, 0], [1, 0], [1, vv], [0, vv]]);
    if (dir === 1) b.quad([x0, yb, z0], [x0, yb, z1], [x0, yt, z1], [x0, yt, z0], [-1, 0, 0], [[0, 0], [1, 0], [1, vv], [0, vv]]);
    if (dir === 2) b.quad([x0, yb, z1], [x1, yb, z1], [x1, yt, z1], [x0, yt, z1], [0, 0, 1], [[0, 0], [1, 0], [1, vv], [0, vv]]);
    if (dir === 3) b.quad([x1, yb, z0], [x0, yb, z0], [x0, yt, z0], [x1, yt, z0], [0, 0, -1], [[0, 0], [1, 0], [1, vv], [0, vv]]);
  }
  // Winding beachten: FrontSide cullt nach Dreiecks-Umlaufsinn, nicht nach
  // dem Normal-Attribut. (b-a)x(c-b) muss zur Sichtseite zeigen.
  function topFace(b, cx, cz, y) {
    var x0 = cx * C, x1 = x0 + C, z0 = cz * C, z1 = z0 + C;
    b.quad([x0, y, z1], [x1, y, z1], [x1, y, z0], [x0, y, z0], [0, 1, 0], [[0, 0], [1, 0], [1, 1], [0, 1]]);
  }
  function bottomFace(b, cx, cz, y) {
    var x0 = cx * C, x1 = x0 + C, z0 = cz * C, z1 = z0 + C;
    b.quad([x0, y, z0], [x1, y, z0], [x1, y, z1], [x0, y, z1], [0, -1, 0], [[0, 0], [1, 0], [1, 1], [0, 1]]);
  }

  var WALL_SYMS = { F: 1, H: 1, W: 1 };

  // Waende eines Symbols auf einer Etage mergen
  function buildWalls(floor, sym, yb, yt, material, withTop) {
    var b = new Builder();
    var dirs = [[1, 0, 0], [-1, 0, 1], [0, 1, 2], [0, -1, 3]];
    for (var cz = 0; cz < CFG.GRID_H; cz++) for (var cx = 0; cx < CFG.GRID_W; cx++) {
      if (symAt(floor, cx, cz) !== sym) continue;
      for (var d = 0; d < 4; d++) {
        var ns = symAt(floor, cx + dirs[d][0], cz + dirs[d][1]);
        if (WALL_SYMS[ns]) continue;               // Nachbar ist auch Wand -> Flaeche unsichtbar
        wallFace(b, cx, cz, dirs[d][2], yb, yt);
      }
      if (withTop) topFace(b, cx, cz, yt);
    }
    return b.mesh(material);
  }

  function buildFloorQuads(cells, y, material, up) {
    var b = new Builder();
    cells.forEach(function (c) { (up ? topFace : bottomFace)(b, c[0], c[1], y); });
    var m = b.mesh(material);
    m.castShadow = false;
    return m;
  }

  function cellsWhere(floor, pred) {
    var out = [];
    for (var cz = 0; cz < CFG.GRID_H; cz++) for (var cx = 0; cx < CFG.GRID_W; cx++)
      if (pred(symAt(floor, cx, cz), cx, cz)) out.push([cx, cz]);
    return out;
  }

  // --- Treppe: echte Stufen von y=0 bis y=3 -------------------------------
  function buildStairs(materials) {
    var group = new THREE.Group();
    var steps = 12;
    var runX0 = CFG.STAIR_RUN[0][0] * C;
    var runLen = CFG.STAIR_RUN.length * C;
    var depth = runLen / steps, rise = F1 / steps;
    var zc = (CFG.STAIR_RUN[0][1] + 0.5) * C;
    for (var i = 0; i < steps; i++) {
      var h = (i + 1) * rise;
      var box = new THREE.Mesh(
        new THREE.BoxGeometry(depth, h, C * 0.98), materials.stairs);
      box.position.set(runX0 + depth * (i + 0.5), h / 2, zc);
      box.castShadow = true; box.receiveShadow = true;
      group.add(box);
    }
    return group;
  }

  // --- Tuer: Fluegel mit Angel, Ausrichtung aus Nachbarwaenden -------------
  function makeDoor(floor, cx, cz, materials) {
    var alongX = WALL_SYMS[symAt(floor, cx - 1, cz)] || WALL_SYMS[symAt(floor, cx + 1, cz)];
    var y0 = floor * F1;
    var group = new THREE.Group();            // Pivot = Angel
    var w = C * 0.94, h = 2.35, t = 0.09;
    var panel = new THREE.Mesh(new THREE.BoxGeometry(w, h, t), materials.door);
    panel.position.set(w / 2, h / 2, 0);
    panel.castShadow = true;
    var knob = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 6), materials.metal);
    knob.position.set(w * 0.82, h * 0.48, t);
    group.add(panel, knob);
    // Sturz ueber der Tuer (fuellt die Luecke bis zur Deckenhoehe)
    var lintel = new THREE.Mesh(new THREE.BoxGeometry(C, WH - h, C * 0.4),
      floor === 0 && cz === 17 ? materials.plaster : materials.wallpaper);
    if (alongX) {
      group.position.set(cx * C + (C - w) / 2, y0, (cz + 0.5) * C);
      lintel.position.set((cx + 0.5) * C, y0 + h + (WH - h) / 2, (cz + 0.5) * C);
    } else {
      group.rotation.y = -Math.PI / 2;        // Fluegel entlang z
      group.position.set((cx + 0.5) * C, y0, cz * C + (C - w) / 2);
      lintel.position.set((cx + 0.5) * C, y0 + h + (WH - h) / 2, (cz + 0.5) * C);
      lintel.rotation.y = Math.PI / 2;
    }
    lintel.castShadow = true;
    return { floor: floor, cx: cx, cz: cz, open: 0, target: 0, group: group, lintel: lintel, alongX: alongX, baseRot: group.rotation.y };
  }

  // --- Gartentor: zwei schwingende Eisenfluegel ----------------------------
  function makeGate(materials) {
    var cells = CFG.GATE_CELLS;
    var z = cells[0][1] * C + C * 0.5;
    var panels = [];
    [[cells[0][0] * C, 1], [(cells[1][0] + 1) * C, -1]].forEach(function (hp) {
      var g = new THREE.Group();
      g.position.set(hp[0], 0, z);
      var w = C;
      for (var i = 0; i <= 6; i++) {
        var bar = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, CFG.FENCE_H + 0.5, 6), materials.metal);
        bar.position.set(hp[1] * (i / 6) * w, (CFG.FENCE_H + 0.5) / 2, 0);
        bar.castShadow = true;
        g.add(bar);
      }
      [0.25, CFG.FENCE_H + 0.2].forEach(function (y) {
        var rail = new THREE.Mesh(new THREE.BoxGeometry(w, 0.07, 0.07), materials.metal);
        rail.position.set(hp[1] * w / 2, y, 0);
        g.add(rail);
      });
      // Spitzen
      for (var j = 0; j <= 6; j++) {
        var tip = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.16, 6), materials.metal);
        tip.position.set(hp[1] * (j / 6) * w, CFG.FENCE_H + 0.55, 0);
        g.add(tip);
      }
      panels.push({ group: g, dir: hp[1] });
    });
    return { panels: panels, open: 0 };
  }

  // --- Props ---------------------------------------------------------------
  function makeTree(cx, cz, materials) {
    var g = new THREE.Group();
    var trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.22, 2.6, 7), materials.bark);
    trunk.position.y = 1.3; trunk.castShadow = true;
    g.add(trunk);
    var leaf = new THREE.MeshLambertMaterial({ color: 0x0e1a10 });
    [[2.2, 1.15], [3.0, 0.9], [3.7, 0.6]].forEach(function (lv) {
      var cone = new THREE.Mesh(new THREE.ConeGeometry(lv[1], 1.5, 8), leaf);
      cone.position.y = lv[0]; cone.castShadow = true;
      g.add(cone);
    });
    g.position.set((cx + 0.5) * C, 0, (cz + 0.5) * C);
    g.rotation.y = (cx * 7 + cz * 13) % 6;
    return g;
  }

  function makeBush(cx, cz) {
    var m = new THREE.MeshLambertMaterial({ color: 0x101a0e });
    var g = new THREE.Group();
    for (var i = 0; i < 3; i++) {
      var s = new THREE.Mesh(new THREE.SphereGeometry(0.35 + Math.random() * 0.2, 7, 5), m);
      s.position.set((Math.random() - 0.5) * 0.5, 0.28, (Math.random() - 0.5) * 0.5);
      s.scale.y = 0.7;
      g.add(s);
    }
    g.position.set((cx + 0.5) * C, 0, (cz + 0.5) * C);
    return g;
  }

  // Laterne: Pfahl + gluehender Kopf + Punktlicht (flackert im Main-Loop)
  function makeLantern(cx, cz, floor, materials) {
    var g = new THREE.Group();
    var y0 = floor * F1;
    var h = floor === 0 && symAt(0, cx, cz) !== ":" ? 2.1 : 1.55;   // Garten hoeher
    var pole = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.05, h, 6), materials.metal);
    pole.position.y = h / 2; pole.castShadow = true;
    var head = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.26, 0.22), materials.metal);
    head.position.y = h + 0.1;
    var glowMat = new THREE.MeshBasicMaterial({ color: 0xffc978 });
    var glow = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 6), glowMat);
    glow.position.y = h + 0.09;
    var light = new THREE.PointLight(0xff9d4d, 0.9, 8.5, 2.0);
    light.position.y = h + 0.05;
    g.add(pole, head, glow, light);
    g.position.set((cx + 0.5) * C, y0, (cz + 0.5) * C);
    return { group: g, light: light, base: 0.9, seed: cx * 3.7 + cz * 1.3 };
  }

  // Items: Schluessel & Batterie
  function makeKey(materials) {
    var g = new THREE.Group();
    var gold = new THREE.MeshLambertMaterial({ color: 0xc9a23f, emissive: 0x69511a });
    var ring = new THREE.Mesh(new THREE.TorusGeometry(0.09, 0.026, 8, 14), gold);
    var shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.24, 6), gold);
    shaft.rotation.z = Math.PI / 2; shaft.position.x = 0.17;
    var tooth1 = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.07, 0.03), gold);
    tooth1.position.set(0.24, -0.05, 0);
    var tooth2 = tooth1.clone(); tooth2.position.x = 0.18;
    g.add(ring, shaft, tooth1, tooth2);
    return g;
  }
  function makeBattery() {
    var g = new THREE.Group();
    var body = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.26, 10),
      new THREE.MeshLambertMaterial({ color: 0x2b7a3e, emissive: 0x0f3a18 }));
    var cap = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.05, 8),
      new THREE.MeshLambertMaterial({ color: 0xb9bec7 }));
    cap.position.y = 0.15;
    g.add(body, cap);
    return g;
  }

  // --- Gesamte Welt bauen ---------------------------------------------------
  function buildWorld(scene) {
    var mats = {
      grass: new THREE.MeshLambertMaterial({ map: TEX.grass() }),
      path: new THREE.MeshLambertMaterial({ map: TEX.path() }),
      planks: new THREE.MeshLambertMaterial({ map: TEX.planks() }),
      wallpaper: new THREE.MeshLambertMaterial({ map: TEX.wallpaper() }),
      plaster: new THREE.MeshLambertMaterial({ map: TEX.plaster() }),
      fence: new THREE.MeshLambertMaterial({ map: TEX.fence() }),
      ceiling: new THREE.MeshLambertMaterial({ map: TEX.ceiling() }),
      roof: new THREE.MeshLambertMaterial({ map: TEX.roof() }),
      door: new THREE.MeshLambertMaterial({ map: TEX.doorWood() }),
      bark: new THREE.MeshLambertMaterial({ map: TEX.bark() }),
      metal: new THREE.MeshLambertMaterial({ color: 0x3a3d45 }),
      stairs: new THREE.MeshLambertMaterial({ map: TEX.planks() }),
    };
    mats.grass.map.repeat.set(24, 20);

    // Himmel
    var sky = new THREE.Mesh(new THREE.SphereGeometry(150, 24, 12),
      new THREE.MeshBasicMaterial({ map: TEX.sky(), side: THREE.BackSide, fog: false }));
    sky.position.set(CFG.GRID_W * C / 2, 0, CFG.GRID_H * C / 2);
    scene.add(sky);

    // Grosse Rasenflaeche
    var ground = new THREE.Mesh(new THREE.PlaneGeometry(CFG.GRID_W * C * 3, CFG.GRID_H * C * 3), mats.grass);
    ground.rotation.x = -Math.PI / 2;
    ground.position.set(CFG.GRID_W * C / 2, 0, CFG.GRID_H * C / 2);
    ground.receiveShadow = true;
    scene.add(ground);

    // Weg / Innenboeden / Decken / OG-Boden
    scene.add(buildFloorQuads(cellsWhere(0, function (s) { return s === "p"; }), 0.015, mats.path, true));
    var indoor0 = cellsWhere(0, function (s) { return s === ":" || s === "D" || s === "S"; });
    scene.add(buildFloorQuads(indoor0, 0.02, mats.planks, true));
    // Decke EG (unter dem OG-Boden), Treppenloch bleibt offen
    var ceil0 = cellsWhere(0, function (s, cx, cz) {
      var inHouse = cx > HOUSE.x0 && cx < HOUSE.x1 && cz > HOUSE.z0 && cz < HOUSE.z1;
      return inHouse && symAt(1, cx, cz) !== "S";
    });
    scene.add(buildFloorQuads(ceil0, WH - 0.01, mats.ceiling, false));
    // OG-Boden (Holz) ueber allen begehbaren OG-Zellen
    var floor1cells = cellsWhere(1, function (s) { return s === ":" || s === "D"; });
    scene.add(buildFloorQuads(floor1cells, F1 + 0.02, mats.planks, true));
    // OG-Decke
    var ceil1 = cellsWhere(1, function (s) { return s === ":" || s === "D" || s === "S"; });
    scene.add(buildFloorQuads(ceil1, F1 + WH - 0.01, mats.ceiling, false));
    // Flachdach von aussen
    var roofCells = cellsWhere(1, function (s) { return s !== " "; });
    scene.add(buildFloorQuads(roofCells, F1 + WH + 0.05, mats.roof, true));

    // Waende
    scene.add(buildWalls(0, "H", 0, WH, mats.plaster, false));
    scene.add(buildWalls(0, "W", 0, WH, mats.wallpaper, false));
    scene.add(buildWalls(0, "F", 0, CFG.FENCE_H, mats.fence, true));
    scene.add(buildWalls(1, "H", F1, F1 + WH, mats.plaster, false));
    scene.add(buildWalls(1, "W", F1, F1 + WH, mats.wallpaper, false));

    // Treppe
    scene.add(buildStairs(mats));

    // Tueren
    var doors = [];
    [0, 1].forEach(function (f) {
      cellsWhere(f, function (s) { return s === "D"; }).forEach(function (c) {
        var d = makeDoor(f, c[0], c[1], mats);
        scene.add(d.group, d.lintel);
        doors.push(d);
      });
    });

    // Tor
    var gate = makeGate(mats);
    gate.panels.forEach(function (p) { scene.add(p.group); });

    // Baeume & Buesche
    cellsWhere(0, function (s) { return s === "T"; }).forEach(function (c) { scene.add(makeTree(c[0], c[1], mats)); });
    cellsWhere(0, function (s) { return s === "B"; }).forEach(function (c) { scene.add(makeBush(c[0], c[1])); });

    // Laternen
    var lanterns = [];
    CFG.LANTERNS.forEach(function (l) {
      var lt = makeLantern(l[0], l[1], l[2], mats);
      scene.add(lt.group);
      lanterns.push(lt);
    });

    // Items
    var items = [];
    CFG.KEY_SPAWNS.forEach(function (k) {
      var m = makeKey(mats);
      m.position.set((k[0] + 0.5) * C, k[2] * F1 + 0.55, (k[1] + 0.5) * C);
      scene.add(m);
      items.push({ kind: "key", cx: k[0], cz: k[1], floor: k[2], mesh: m, taken: false });
    });
    CFG.BATTERY_SPAWNS.forEach(function (k) {
      var m = makeBattery();
      m.position.set((k[0] + 0.5) * C, k[2] * F1 + 0.45, (k[1] + 0.5) * C);
      scene.add(m);
      items.push({ kind: "battery", cx: k[0], cz: k[1], floor: k[2], mesh: m, taken: false });
    });

    return { materials: mats, doors: doors, gate: gate, lanterns: lanterns, items: items };
  }

  return { buildWorld: buildWorld };
})();
