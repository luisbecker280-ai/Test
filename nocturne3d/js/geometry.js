// ============================================================================
// NOCTURNE Nacht 1 — Weltgeometrie
// Statik wird pro Material gemerged; Baeume als InstancedMesh (3 Vorlagen).
// ============================================================================
"use strict";

var GEO = (function () {
  var C = CFG.CELL, WH = CFG.WALL_H;

  // --- Builder --------------------------------------------------------------
  function Builder() { this.pos = []; this.norm = []; this.uv = []; this.idx = []; }
  Builder.prototype.quad = function (a, b, c, d, n, uvs) {
    var base = this.pos.length / 3;
    [a, b, c, d].forEach(function (p) { this.pos.push(p[0], p[1], p[2]); }, this);
    for (var i = 0; i < 4; i++) this.norm.push(n[0], n[1], n[2]);
    uvs.forEach(function (t) { this.uv.push(t[0], t[1]); }, this);
    this.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
  };
  Builder.prototype.tri = function (a, b, c, n) {
    var base = this.pos.length / 3;
    [a, b, c].forEach(function (p) { this.pos.push(p[0], p[1], p[2]); }, this);
    for (var i = 0; i < 3; i++) this.norm.push(n[0], n[1], n[2]);
    this.uv.push(0, 0, 1, 0, 0.5, 1);
    this.idx.push(base, base + 1, base + 2);
  };
  Builder.prototype.mesh = function (material) {
    var g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute("normal", new THREE.Float32BufferAttribute(this.norm, 3));
    g.setAttribute("uv", new THREE.Float32BufferAttribute(this.uv, 2));
    g.setIndex(this.idx);
    var m = new THREE.Mesh(g, material);
    m.castShadow = m.receiveShadow = true;
    return m;
  };

  function wallFace(b, cx, cz, dir, yb, yt) {
    var x0 = cx * C, x1 = x0 + C, z0 = cz * C, z1 = z0 + C, vv = (yt - yb) / WH;
    if (dir === 0) b.quad([x1, yb, z1], [x1, yb, z0], [x1, yt, z0], [x1, yt, z1], [1, 0, 0], [[0, 0], [1, 0], [1, vv], [0, vv]]);
    if (dir === 1) b.quad([x0, yb, z0], [x0, yb, z1], [x0, yt, z1], [x0, yt, z0], [-1, 0, 0], [[0, 0], [1, 0], [1, vv], [0, vv]]);
    if (dir === 2) b.quad([x0, yb, z1], [x1, yb, z1], [x1, yt, z1], [x0, yt, z1], [0, 0, 1], [[0, 0], [1, 0], [1, vv], [0, vv]]);
    if (dir === 3) b.quad([x1, yb, z0], [x0, yb, z0], [x0, yt, z0], [x1, yt, z0], [0, 0, -1], [[0, 0], [1, 0], [1, vv], [0, vv]]);
  }
  function topFace(b, cx, cz, y) {
    var x0 = cx * C, x1 = x0 + C, z0 = cz * C, z1 = z0 + C;
    b.quad([x0, y, z1], [x1, y, z1], [x1, y, z0], [x0, y, z0], [0, 1, 0], [[0, 0], [1, 0], [1, 1], [0, 1]]);
  }
  function bottomFace(b, cx, cz, y) {
    var x0 = cx * C, x1 = x0 + C, z0 = cz * C, z1 = z0 + C;
    b.quad([x0, y, z0], [x1, y, z0], [x1, y, z1], [x0, y, z1], [0, -1, 0], [[0, 0], [1, 0], [1, 1], [0, 1]]);
  }

  var SOLID = { M: 1, H: 1, W: 1, B: 1, w: 1 };

  function buildWalls(sym, yb, yt, mat, withTop) {
    var b = new Builder();
    var dirs = [[1, 0, 0], [-1, 0, 1], [0, 1, 2], [0, -1, 3]];
    for (var cz = 0; cz < CFG.GRID_H; cz++) for (var cx = 0; cx < CFG.GRID_W; cx++) {
      if (symAt(cx, cz) !== sym) continue;
      for (var d = 0; d < 4; d++) {
        if (SOLID[symAt(cx + dirs[d][0], cz + dirs[d][1])]) continue;
        wallFace(b, cx, cz, dirs[d][2], yb, yt);
      }
      if (withTop) topFace(b, cx, cz, yt);
    }
    return b.mesh(mat);
  }

  function floorQuads(pred, y, mat, up) {
    var b = new Builder();
    for (var cz = 0; cz < CFG.GRID_H; cz++) for (var cx = 0; cx < CFG.GRID_W; cx++)
      if (pred(symAt(cx, cz), cx, cz)) (up ? topFace : bottomFace)(b, cx, cz, y);
    var m = b.mesh(mat);
    m.castShadow = false;
    return m;
  }

  // Geometrie in einen Builder mergen (fuer Baum-Vorlagen)
  function mergeGeom(b, geom, mat4) {
    geom.applyMatrix4(mat4);
    var p = geom.attributes.position, n = geom.attributes.normal, u = geom.attributes.uv;
    var base = b.pos.length / 3;
    for (var i = 0; i < p.count; i++) {
      b.pos.push(p.getX(i), p.getY(i), p.getZ(i));
      b.norm.push(n.getX(i), n.getY(i), n.getZ(i));
      b.uv.push(u ? u.getX(i) : 0, u ? u.getY(i) : 0);
    }
    var idx = geom.index;
    if (idx) for (var j = 0; j < idx.count; j++) b.idx.push(base + idx.getX(j));
    else for (var k = 0; k < p.count; k++) b.idx.push(base + k);
    geom.dispose();
  }

  // --- Realistischere Baeume: rekursive Verzweigung, 3 Vorlagen -------------
  function genTree(seed) {
    var rng = (function (s) { return function () { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; }; })(seed);
    var trunk = new Builder(), leaves = new Builder();
    var up = new THREE.Vector3(0, 1, 0), tmpQ = new THREE.Quaternion(), m = new THREE.Matrix4();

    function branch(pos, dir, len, rad, depth) {
      var cyl = new THREE.CylinderGeometry(rad * 0.62, rad, len, 5, 1);
      tmpQ.setFromUnitVectors(up, dir);
      m.compose(pos.clone().addScaledVector(dir, len / 2), tmpQ, new THREE.Vector3(1, 1, 1));
      mergeGeom(trunk, cyl, m);
      var tip = pos.clone().addScaledVector(dir, len);
      if (depth >= (FAST ? 2 : 3)) {
        var blob = new THREE.IcosahedronGeometry(0.9 + rng() * 1.1, 0);
        m.compose(tip, new THREE.Quaternion(), new THREE.Vector3(1, 0.72, 1));
        mergeGeom(leaves, blob, m);
        return;
      }
      var kids = depth === 0 ? 3 : 2 + (rng() < 0.5 ? 1 : 0);
      for (var i = 0; i < kids; i++) {
        var nd = dir.clone()
          .add(new THREE.Vector3((rng() - 0.5) * 1.5, 0.55 + rng() * 0.5, (rng() - 0.5) * 1.5))
          .normalize();
        branch(tip.clone().addScaledVector(dir, -len * 0.08 * i), nd, len * (0.58 + rng() * 0.2), rad * 0.55, depth + 1);
      }
    }
    branch(new THREE.Vector3(0, 0, 0), up.clone(), 2.6 + rng() * 1.4, 0.3 + rng() * 0.14, 0);
    return { trunk: trunk, leaves: leaves };
  }

  function buildTrees(scene, mats) {
    var cells = [];
    for (var cz = 0; cz < CFG.GRID_H; cz++) for (var cx = 0; cx < CFG.GRID_W; cx++)
      if (symAt(cx, cz) === "T") cells.push([cx, cz]);
    var templates = [genTree(11), genTree(77), genTree(313)];
    var buckets = [[], [], []];
    cells.forEach(function (c) {
      buckets[(c[0] * 7 + c[1] * 13) % 3].push(c);
    });
    var leafMat = new THREE.MeshLambertMaterial({ color: 0x11190f });
    templates.forEach(function (t, ti) {
      var list = buckets[ti];
      if (!list.length) return;
      var tg = new THREE.BufferGeometry();
      tg.setAttribute("position", new THREE.Float32BufferAttribute(t.trunk.pos, 3));
      tg.setAttribute("normal", new THREE.Float32BufferAttribute(t.trunk.norm, 3));
      tg.setAttribute("uv", new THREE.Float32BufferAttribute(t.trunk.uv, 2));
      tg.setIndex(t.trunk.idx);
      var lg = new THREE.BufferGeometry();
      lg.setAttribute("position", new THREE.Float32BufferAttribute(t.leaves.pos, 3));
      lg.setAttribute("normal", new THREE.Float32BufferAttribute(t.leaves.norm, 3));
      lg.setAttribute("uv", new THREE.Float32BufferAttribute(t.leaves.uv, 2));
      lg.setIndex(t.leaves.idx);
      var im1 = new THREE.InstancedMesh(tg, mats.bark, list.length);
      var im2 = new THREE.InstancedMesh(lg, leafMat, list.length);
      var m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3();
      list.forEach(function (c, i) {
        var jx = ((c[0] * 31 + c[1] * 17) % 10) / 10 - 0.5;
        var jz = ((c[0] * 13 + c[1] * 29) % 10) / 10 - 0.5;
        p.set((c[0] + 0.5 + jx * 0.5) * C, 0, (c[1] + 0.5 + jz * 0.5) * C);
        q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), (c[0] * 3 + c[1] * 7) % 6);
        var sc = 0.8 + ((c[0] * 11 + c[1] * 5) % 10) / 18;
        s.set(sc, sc * (0.9 + ((c[0] + c[1]) % 5) / 12), sc);
        m.compose(p, q, s);
        im1.setMatrixAt(i, m);
        im2.setMatrixAt(i, m);
      });
      im1.castShadow = true;
      scene.add(im1, im2);
    });
  }

  // --- Satteldach ueber einem Zellrechteck -----------------------------------
  function gableRoof(b, cx0, cz0, cx1, cz1, eaveY, ridgeY, over) {
    var x0 = cx0 * C - over, x1 = (cx1 + 1) * C + over;
    var z0 = cz0 * C - over, z1 = (cz1 + 1) * C + over;
    var zm = (z0 + z1) / 2;
    var uS = (x1 - x0) / 4, vS = (z1 - z0) / 4;
    // Nordflaeche + Suedflaeche
    b.quad([x0, eaveY, z0], [x1, eaveY, z0], [x1, ridgeY, zm], [x0, ridgeY, zm], [0, 0.7, -0.7], [[0, 0], [uS, 0], [uS, vS], [0, vS]]);
    b.quad([x1, eaveY, z1], [x0, eaveY, z1], [x0, ridgeY, zm], [x1, ridgeY, zm], [0, 0.7, 0.7], [[0, 0], [uS, 0], [uS, vS], [0, vS]]);
    // Untersicht (damit man von unten kein Loch sieht)
    b.quad([x0, eaveY - 0.02, z1], [x1, eaveY - 0.02, z1], [x1, eaveY - 0.02, z0], [x0, eaveY - 0.02, z0], [0, -1, 0], [[0, 0], [uS, 0], [uS, vS], [0, vS]]);
    return { x0: x0, x1: x1, z0: z0, z1: z1, zm: zm };
  }
  function gableEnds(b, r, eaveY, ridgeY) {
    b.tri([r.x0, eaveY, r.z0], [r.x0, eaveY, r.z1], [r.x0, ridgeY, r.zm], [-1, 0, 0]);
    b.tri([r.x1, eaveY, r.z1], [r.x1, eaveY, r.z0], [r.x1, ridgeY, r.zm], [1, 0, 0]);
  }

  // --- Tuer ------------------------------------------------------------------
  function makeDoor(cx, cz, mats) {
    var alongX = SOLID[symAt(cx - 1, cz)] || SOLID[symAt(cx + 1, cz)];
    var group = new THREE.Group();
    var w = C * 0.94, h = 2.35, t = 0.09;
    var panel = new THREE.Mesh(new THREE.BoxGeometry(w, h, t), mats.door);
    panel.position.set(w / 2, h / 2, 0);
    panel.castShadow = true;
    var knob = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 6), mats.metal);
    knob.position.set(w * 0.82, h * 0.48, t);
    group.add(panel, knob);
    var lintel = new THREE.Mesh(new THREE.BoxGeometry(C, WH - h, C * 0.4), mats.interior);
    if (alongX) {
      group.position.set(cx * C + (C - w) / 2, 0, (cz + 0.5) * C);
      lintel.position.set((cx + 0.5) * C, h + (WH - h) / 2, (cz + 0.5) * C);
    } else {
      group.rotation.y = -Math.PI / 2;
      group.position.set((cx + 0.5) * C, 0, cz * C + (C - w) / 2);
      lintel.position.set((cx + 0.5) * C, h + (WH - h) / 2, (cz + 0.5) * C);
      lintel.rotation.y = Math.PI / 2;
    }
    return { cx: cx, cz: cz, open: 0, target: 0, locked: false, group: group, lintel: lintel, baseRot: group.rotation.y };
  }

  // --- Fahrzeuge ---------------------------------------------------------------
  function makeVehicle(type, mats) {
    var g = new THREE.Group();
    var colors = { player: 0x5a4632, traffic: [0x37424e, 0x4e3737, 0x3d4a3a, 0x4a4a52][Math.floor(Math.random() * 4)], police: 0xdfe3e8 };
    var bodyMat = new THREE.MeshLambertMaterial({ color: colors[type] || colors.traffic });
    var glassMat = new THREE.MeshLambertMaterial({ color: 0x0c1016 });
    var body = new THREE.Mesh(new THREE.BoxGeometry(4.2, 0.65, 1.8), bodyMat);
    body.position.y = 0.62; body.castShadow = true;
    var cabin = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.62, 1.66), bodyMat);
    cabin.position.set(-0.25, 1.22, 0); cabin.castShadow = true;
    var wind = new THREE.Mesh(new THREE.BoxGeometry(2.24, 0.44, 1.68), glassMat);
    wind.position.set(-0.25, 1.2, 0);
    g.add(body, cabin, wind);
    var wheels = [];
    [[1.45, 0.85], [1.45, -0.85], [-1.45, 0.85], [-1.45, -0.85]].forEach(function (p) {
      var wme = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.36, 0.26, 10), mats.tire);
      wme.rotation.x = Math.PI / 2;
      wme.position.set(p[0], 0.36, p[1]);
      g.add(wme);
      wheels.push(wme);
    });
    // Scheinwerfer / Ruecklichter (emissiv)
    var hlMat = new THREE.MeshBasicMaterial({ color: 0xffe9b0 });
    var tlMat = new THREE.MeshBasicMaterial({ color: 0xff2a1a });
    [[2.11, 0.62, 0.55], [2.11, 0.62, -0.55]].forEach(function (p) {
      var hl = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.16, 0.3), hlMat);
      hl.position.set(p[0], p[1], p[2]); g.add(hl);
    });
    [[-2.11, 0.62, 0.55], [-2.11, 0.62, -0.55]].forEach(function (p) {
      var tl = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.14, 0.26), tlMat);
      tl.position.set(p[0], p[1], p[2]); g.add(tl);
    });
    var extra = {};
    if (type === "police") {
      var bar = new THREE.Group();
      var barBase = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.14, 0.34), mats.metal);
      var red = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.16, 0.3), new THREE.MeshBasicMaterial({ color: 0xcc2222 }));
      var blue = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.16, 0.3), new THREE.MeshBasicMaterial({ color: 0x2244dd }));
      red.position.x = -0.24; blue.position.x = 0.24;
      bar.add(barBase, red, blue);
      bar.position.set(-0.25, 1.62, 0);
      g.add(bar);
      var stripe = new THREE.Mesh(new THREE.BoxGeometry(4.24, 0.2, 1.84), new THREE.MeshLambertMaterial({ color: 0x2244aa }));
      stripe.position.y = 0.62;
      g.add(stripe);
      extra.red = red; extra.blue = blue;
    }
    if (type === "player") {
      var spots = [];
      [[0.55], [-0.55]].forEach(function (o) {
        var sp = new THREE.SpotLight(0xffe6b8, 0, 42, 0.42, 0.4, 1.4);
        sp.position.set(2.1, 0.7, o[0]);
        var tgt = new THREE.Object3D();
        tgt.position.set(14, 0.2, o[0] * 0.6);
        g.add(sp, tgt);
        sp.target = tgt;
        spots.push(sp);
      });
      extra.headlights = spots;
      // offene Motorhaube (bis repariert)
      var hood = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.06, 1.7), bodyMat);
      hood.position.set(1.45, 1.25, 0);
      hood.rotation.z = 0.9;
      g.add(hood);
      extra.hood = hood;
    } else {
      var pl = new THREE.PointLight(0xffe6b8, 0, 14, 1.6);
      pl.position.set(2.0, 0.8, 0);
      g.add(pl);
      extra.frontLight = pl;
    }
    return { group: g, wheels: wheels, extra: extra, type: type };
  }

  // --- Items -------------------------------------------------------------------
  function makeItemMesh(kind, mats) {
    var g = new THREE.Group();
    function box(w, h, d, color, emissive) {
      return new THREE.Mesh(new THREE.BoxGeometry(w, h, d),
        new THREE.MeshLambertMaterial({ color: color, emissive: emissive || 0x000000 }));
    }
    if (kind === "battery") {
      var b = box(0.42, 0.3, 0.28, 0x16181e); b.position.y = 0.15; g.add(b);
      var t1 = box(0.07, 0.07, 0.07, 0xcccccc); t1.position.set(-0.12, 0.34, 0);
      var t2 = box(0.07, 0.07, 0.07, 0xcc4444); t2.position.set(0.12, 0.34, 0);
      g.add(t1, t2);
    } else if (kind === "plugs") {
      var bx = box(0.3, 0.14, 0.2, 0x5a4a22); bx.position.y = 0.1; g.add(bx);
    } else if (kind === "wheel") {
      var w = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.24, 12), mats.tire);
      w.rotation.z = Math.PI / 2; w.position.y = 0.42;
      var rim = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.26, 8),
        new THREE.MeshLambertMaterial({ color: 0x8a8f98 }));
      rim.rotation.z = Math.PI / 2; rim.position.y = 0.42;
      g.add(w, rim);
    } else if (kind === "fuel") {
      var k = box(0.32, 0.44, 0.22, 0x8a1f1a); k.position.y = 0.24; g.add(k);
      var h = box(0.16, 0.06, 0.06, 0x5a1512); h.position.set(0, 0.5, 0); g.add(h);
    } else if (kind === "carkey" || kind === "keyGarage") {
      var gold = new THREE.MeshLambertMaterial({ color: kind === "carkey" ? 0x99a6b8 : 0xc9a23f, emissive: 0x333322 });
      var ring = new THREE.Mesh(new THREE.TorusGeometry(0.08, 0.024, 8, 12), gold);
      var shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.2, 6), gold);
      shaft.rotation.z = Math.PI / 2; shaft.position.x = 0.15;
      g.add(ring, shaft);
      g.position.y = 0.3;
    } else if (kind === "pistol") {
      var bl = box(0.34, 0.09, 0.07, 0x14161c); bl.position.set(0.05, 0.14, 0);
      var grip = box(0.09, 0.2, 0.07, 0x241a12); grip.position.set(-0.1, 0.03, 0); grip.rotation.z = 0.25;
      g.add(bl, grip);
    } else if (kind === "ammo") {
      var am = box(0.2, 0.12, 0.14, 0x3a4028, 0x141a08); am.position.y = 0.08; g.add(am);
    } else if (kind === "bar") {
      var bar = box(0.22, 0.05, 0.1, 0xc9902c, 0x664410); bar.position.y = 0.06; g.add(bar);
    } else if (kind === "flashbattery") {
      var fb = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.22, 8),
        new THREE.MeshLambertMaterial({ color: 0x2b7a3e, emissive: 0x0f3a18 }));
      fb.position.y = 0.12; g.add(fb);
    }
    return g;
  }

  // --- Welt bauen -----------------------------------------------------------------
  function buildWorld(scene) {
    var mats = {
      grass: new THREE.MeshLambertMaterial({ map: TEX.grass() }),
      forest: new THREE.MeshLambertMaterial({ map: TEX.forestFloor() }),
      asphalt: new THREE.MeshLambertMaterial({ map: TEX.asphalt() }),
      concrete: new THREE.MeshLambertMaterial({ map: TEX.concrete() }),
      dirt: new THREE.MeshLambertMaterial({ map: TEX.dirt() }),
      siding: new THREE.MeshLambertMaterial({ map: TEX.siding() }),
      interior: new THREE.MeshLambertMaterial({ map: TEX.interior() }),
      tiles: new THREE.MeshLambertMaterial({ map: TEX.tiles() }),
      woodWall: new THREE.MeshLambertMaterial({ map: TEX.woodWall() }),
      planks: new THREE.MeshLambertMaterial({ map: TEX.planks() }),
      rock: new THREE.MeshLambertMaterial({ map: TEX.rock() }),
      roof: new THREE.MeshLambertMaterial({ map: TEX.roof() }),
      bark: new THREE.MeshLambertMaterial({ map: TEX.bark() }),
      door: new THREE.MeshLambertMaterial({ map: TEX.doorWood() }),
      rollDoor: new THREE.MeshLambertMaterial({ map: TEX.rollDoor() }),
      windowLit: new THREE.MeshLambertMaterial({ map: TEX.windowLit(), emissive: 0x2a2418, emissiveMap: TEX.windowLit() }),
      shelf: new THREE.MeshLambertMaterial({ map: TEX.shelf() }),
      metal: new THREE.MeshLambertMaterial({ color: 0x3a3d45 }),
      tire: new THREE.MeshLambertMaterial({ color: 0x101114 }),
      rust: new THREE.MeshLambertMaterial({ color: 0x4a3220 }),
    };
    mats.grass.map.repeat.set(30, 22);

    // Himmel
    var sky = new THREE.Mesh(new THREE.SphereGeometry(260, 24, 12),
      new THREE.MeshBasicMaterial({ map: TEX.sky(), side: THREE.BackSide, fog: false }));
    sky.position.set(CFG.GRID_W * C / 2, 0, CFG.GRID_H * C / 2);
    scene.add(sky);

    // Boden
    var ground = new THREE.Mesh(new THREE.PlaneGeometry(CFG.GRID_W * C * 2.4, CFG.GRID_H * C * 2.4), mats.grass);
    ground.rotation.x = -Math.PI / 2;
    ground.position.set(CFG.GRID_W * C / 2, 0, CFG.GRID_H * C / 2);
    ground.receiveShadow = true;
    scene.add(ground);
    scene.add(floorQuads(function (s) { return s === "R" || s === "U"; }, 0.02, mats.asphalt, true));
    scene.add(floorQuads(function (s) { return s === "r" || s === "g"; }, 0.018, mats.concrete, true));
    scene.add(floorQuads(function (s) { return s === "p"; }, 0.015, mats.dirt, true));
    scene.add(floorQuads(function (s) { return s === ":"; }, 0.02, mats.tiles, true));
    scene.add(floorQuads(function (s) { return s === "h"; }, 0.02, mats.planks, true));
    // Waldboden-Overlay unter dichten Baumzonen
    scene.add(floorQuads(function (s, cx, cz) { return s === "." && (cz > 33 || cz < 5); }, 0.012, mats.forest, true));

    // Mittelstreifen der Strasse
    (function () {
      var b = new Builder();
      var zc = (CFG.ROAD_Z0 + 2) * C;                 // zwischen den Fahrspuren
      for (var x = 2; x < (CFG.GRID_W - 3) * C; x += 6) {
        b.quad([x, 0.03, zc + 0.09], [x + 2.6, 0.03, zc + 0.09], [x + 2.6, 0.03, zc - 0.09], [x, 0.03, zc - 0.09],
          [0, 1, 0], [[0, 0], [1, 0], [1, 1], [0, 1]]);
      }
      var m = b.mesh(new THREE.MeshBasicMaterial({ color: 0x8f8f7a }));
      m.castShadow = false;
      scene.add(m);
    })();

    // Waende
    scene.add(buildWalls("H", 0, WH, mats.siding, false));
    scene.add(buildWalls("w", 0, WH, mats.windowLit, false));
    scene.add(buildWalls("W", 0, WH, mats.interior, false));
    scene.add(buildWalls("B", 0, 2.7, mats.woodWall, false));
    scene.add(buildWalls("M", 0, 9.0, mats.rock, true));

    // Innendecken
    scene.add(floorQuads(function (s) { return s === ":" || s === "g"; }, WH - 0.05, mats.interior, false));
    scene.add(floorQuads(function (s) { return s === "h"; }, 2.55, mats.planks, false));

    // Daecher
    (function () {
      var b = new Builder();
      var r1 = gableRoof(b, SHOP.x0, SHOP.z0, GARAGE.x1, GARAGE.z1, WH + 0.1, WH + 2.0, 0.9);
      gableEnds(b, r1, WH + 0.1, WH + 2.0);
      var r2 = gableRoof(b, HUT.x0, HUT.z0, HUT.x1, HUT.z1, 2.75, 3.9, 0.7);
      gableEnds(b, r2, 2.75, 3.9);
      scene.add(b.mesh(mats.roof));
    })();

    // Tunnel: Decke + Portal-Sturz
    (function () {
      var b = new Builder();
      for (var cx = 0; cx <= CFG.TUNNEL_X; cx++)
        for (var cz = CFG.ROAD_Z0; cz <= CFG.ROAD_Z1; cz++) bottomFace(b, cx, cz, 4.8);
      var px = (CFG.TUNNEL_X + 1) * C;
      var z0 = CFG.ROAD_Z0 * C, z1 = (CFG.ROAD_Z1 + 1) * C;
      b.quad([px, 4.8, z1], [px, 4.8, z0], [px, 9, z0], [px, 9, z1], [1, 0, 0], [[0, 0], [2, 0], [2, 1], [0, 1]]);
      scene.add(b.mesh(mats.rock));
    })();

    // "Andere Seite" des Tunnels (Outro-Kulisse): Strasse + Portalwand im Westen
    (function () {
      var b = new Builder();
      var z0 = CFG.ROAD_Z0 * C, z1 = (CFG.ROAD_Z1 + 1) * C;
      b.quad([-140, 0.02, z1], [0, 0.02, z1], [0, 0.02, z0], [-140, 0.02, z0],
        [0, 1, 0], [[0, 0], [30, 0], [30, 2], [0, 2]]);
      scene.add(b.mesh(mats.asphalt));
      var rb = new Builder();
      // Felswand mit Tunneloeffnung, von Westen gesehen
      rb.quad([-0.1, 0, z0], [-0.1, 0, -30], [-0.1, 9, -30], [-0.1, 9, z0], [-1, 0, 0], [[0, 0], [6, 0], [6, 1], [0, 1]]);
      rb.quad([-0.1, 0, 90], [-0.1, 0, z1], [-0.1, 9, z1], [-0.1, 9, 90], [-1, 0, 0], [[0, 0], [10, 0], [10, 1], [0, 1]]);
      rb.quad([-0.1, 4.8, z1], [-0.1, 4.8, z0], [-0.1, 9, z0], [-0.1, 9, z1], [-1, 0, 0], [[0, 0], [2, 0], [2, 1], [0, 1]]);
      scene.add(rb.mesh(mats.rock));
    })();

    // Vordach (Kanopie) + Stuetzen + Zapfsaeulen
    var canopyLights = [];
    (function () {
      var x0 = 88, x1 = 118, z0 = 26, z1 = 38, y = 4.5;
      var slab = new THREE.Mesh(new THREE.BoxGeometry(x1 - x0, 0.5, z1 - z0), mats.siding);
      slab.position.set((x0 + x1) / 2, y + 0.25, (z0 + z1) / 2);
      slab.castShadow = true;
      scene.add(slab);
      [[x0 + 1.2, z0 + 1.2], [x1 - 1.2, z0 + 1.2], [x0 + 1.2, z1 - 1.2], [x1 - 1.2, z1 - 1.2]].forEach(function (p) {
        var col = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, y, 8), mats.metal);
        col.position.set(p[0], y / 2, p[1]);
        col.castShadow = true;
        scene.add(col);
      });
      // Leuchtstreifen + Lichter
      [[97, 31], [111, 31]].forEach(function (p) {
        var strip = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.08, 0.5),
          new THREE.MeshBasicMaterial({ color: 0xd8e6f2 }));
        strip.position.set(p[0], y - 0.06, p[1]);
        scene.add(strip);
        var l = new THREE.PointLight(0xcfe0ee, 1.1, 13, 1.7);
        l.position.set(p[0], y - 0.5, p[1]);
        scene.add(l);
        canopyLights.push({ light: l, base: 1.1, strip: strip, seed: p[0] });
      });
      // Zapfsaeulen
      CFG.PUMPS.forEach(function (pc) {
        var px = (pc[0] + 0.5) * C, pz = (pc[1] + 0.5) * C;
        var body = new THREE.Mesh(new THREE.BoxGeometry(0.9, 1.7, 0.55),
          new THREE.MeshLambertMaterial({ color: 0x7a2620 }));
        body.position.set(px, 0.85, pz);
        body.castShadow = true;
        var screen = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.3, 0.04),
          new THREE.MeshBasicMaterial({ color: 0x9fb8a8 }));
        screen.position.set(px, 1.25, pz + 0.29);
        var hose = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 1.1, 6), mats.tire);
        hose.position.set(px + 0.5, 0.9, pz);
        hose.rotation.z = 0.5;
        scene.add(body, screen, hose);
      });
    })();

    // Neon-Schild an der Strasse
    var sign;
    (function () {
      var pole = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.16, 6.4, 8), mats.metal);
      pole.position.set(73, 3.2, 22.5);
      var panel = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 2.1),
        new THREE.MeshBasicMaterial({ map: TEX.neonSign(), transparent: false, side: THREE.DoubleSide, fog: false }));
      panel.position.set(73, 5.4, 22.5);
      scene.add(pole, panel);
      var glow = new THREE.PointLight(0xff6a50, 0.8, 10, 1.8);
      glow.position.set(73, 5.2, 23.2);
      scene.add(glow);
      sign = { panel: panel, glow: glow };
    })();

    // Strassenlampen
    var lamps = [];
    CFG.LAMPS.forEach(function (lc) {
      var lx = (lc[0] + 0.5) * C, lz = (lc[1] + 0.5) * C;
      var pole = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.12, 5.4, 8), mats.metal);
      pole.position.set(lx, 2.7, lz);
      var head = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.16, 0.3),
        new THREE.MeshBasicMaterial({ color: 0xffd9a0 }));
      head.position.set(lx, 5.35, lz);
      var l = new THREE.PointLight(0xffb35c, 0.85, 16, 1.8);
      l.position.set(lx, 5.1, lz);
      scene.add(pole, head, l);
      lamps.push({ light: l, base: 0.85, head: head, seed: lx });
    });

    // Shop-Innenlichter
    var shopLights = [];
    [[95, 50], [107, 52]].forEach(function (p) {
      var l = new THREE.PointLight(0xffe6c0, 0.9, 13, 1.8);
      l.position.set(p[0], WH - 0.4, p[1]);
      scene.add(l);
      shopLights.push({ light: l, base: 0.9 });
    });
    var garageLight = new THREE.PointLight(0xcad6e0, 0.55, 11, 1.8);
    garageLight.position.set(129, WH - 0.5, 52);
    scene.add(garageLight);

    // --- Einrichtung Shop ---
    function prop(mesh, cx, cz, y, rotY) {
      mesh.position.set((cx + 0.5) * C, y || 0, (cz + 0.5) * C);
      if (rotY) mesh.rotation.y = rotY;
      mesh.castShadow = true;
      scene.add(mesh);
      return mesh;
    }
    // Tresen entlang z=25 (x 45..49)
    var counter = new THREE.Mesh(new THREE.BoxGeometry(10, 1.1, 0.9), mats.planks);
    counter.position.set(95, 0.55, 51);
    counter.castShadow = true;
    scene.add(counter);
    // Regale
    prop(new THREE.Mesh(new THREE.BoxGeometry(5.4, 2.0, 0.7), mats.shelf), 51.4, 24, 1.0);
    prop(new THREE.Mesh(new THREE.BoxGeometry(5.4, 2.0, 0.7), mats.shelf), 51.4, 27.5, 1.0);
    // Kaffeemaschine / Burgertheke / Kasse / Radio
    prop(new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.8, 0.6), new THREE.MeshLambertMaterial({ color: 0x22262e })), CFG.POS.coffee[0], CFG.POS.coffee[1], 1.2);
    var burgerCase = prop(new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.7, 0.9), new THREE.MeshLambertMaterial({ color: 0x3a2e22, emissive: 0x30160a })), CFG.POS.burger[0], CFG.POS.burger[1], 1.1);
    prop(new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.4, 0.4), new THREE.MeshLambertMaterial({ color: 0x1c1f26 })), CFG.POS.register[0], CFG.POS.register[1], 1.3);
    var radio = prop(new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.25, 0.2), new THREE.MeshLambertMaterial({ color: 0x26221c })), CFG.POS.radio[0], CFG.POS.radio[1], 1.28);
    // Spind im Lager
    prop(new THREE.Mesh(new THREE.BoxGeometry(1.1, 2.2, 0.6), mats.metal), 59, 23.4, 1.1);
    // Werkbank Garage
    prop(new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.95, 0.8), mats.planks), 62, 29, 0.5);

    // Huette: Tisch + Kiste + Bett
    prop(new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.75, 0.9), mats.planks), 18.5, 48, 0.4);
    prop(new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.5, 0.5), mats.rust), 21, 48.4, 0.25);
    prop(new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.4, 0.9), mats.woodWall), 17.2, 45.4, 0.2);

    // Leiche hinter der Huette (Autoschluessel liegt daneben)
    (function () {
      var g = new THREE.Group();
      var skin = new THREE.MeshLambertMaterial({ color: 0x4a4038 });
      var torso = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.22, 0.9), skin);
      torso.position.y = 0.12;
      var legs = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.18, 0.9), skin);
      legs.position.set(0.05, 0.1, 0.85);
      var head = new THREE.Mesh(new THREE.SphereGeometry(0.14, 8, 6), new THREE.MeshLambertMaterial({ color: 0x5c5148 }));
      head.position.set(0, 0.12, -0.55);
      var stain = new THREE.Mesh(new THREE.CircleGeometry(0.9, 12), new THREE.MeshLambertMaterial({ color: 0x1c0806 }));
      stain.rotation.x = -Math.PI / 2; stain.position.y = 0.011;
      g.add(torso, legs, head, stain);
      g.position.set((19 + 0.5) * C, 0, (52 + 0.2) * C);
      g.rotation.y = 0.7;
      scene.add(g);
    })();

    // Autowrack im Wald
    (function () {
      var g = new THREE.Group();
      var body = new THREE.Mesh(new THREE.BoxGeometry(4.0, 0.7, 1.8), mats.rust);
      body.position.y = 0.35; body.rotation.z = 0.06;
      var cab = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.5, 1.6), mats.rust);
      cab.position.set(-0.2, 0.9, 0); cab.rotation.x = 0.05;
      g.add(body, cab);
      g.position.set((76 + 0.5) * C, 0, (46 + 0.5) * C);
      g.rotation.y = 2.4;
      g.traverse(function (o) { if (o.isMesh) o.castShadow = true; });
      scene.add(g);
    })();

    // Tueren + Rolltor
    var doors = [];
    for (var cz = 0; cz < CFG.GRID_H; cz++) for (var cx = 0; cx < CFG.GRID_W; cx++) {
      if (symAt(cx, cz) === "D") {
        var d = makeDoor(cx, cz, mats);
        scene.add(d.group, d.lintel);
        doors.push(d);
      }
    }
    var rollDoor = (function () {
      var panel = new THREE.Mesh(new THREE.BoxGeometry(3 * C, WH - 0.1, 0.14), mats.rollDoor);
      panel.position.set((63 + 1.5) * C, (WH - 0.1) / 2, GARAGE.z0 * C + 0.4);
      panel.castShadow = true;
      scene.add(panel);
      return { panel: panel, open: 0, target: 0, baseY: (WH - 0.1) / 2 };
    })();

    // Das kaputte Auto in der Garage (Spielerauto)
    var playerCar = makeVehicle("player", mats);
    playerCar.group.position.set((CFG.POS.carGarage[0] + 0.5) * C, 0, (CFG.POS.carGarage[1] + 0.5) * C);
    playerCar.group.rotation.y = Math.PI / 2;              // Nase zum Rolltor (Norden)
    scene.add(playerCar.group);

    // Items (Teile + Pistole + Munition + Riegel + Batterien + Garagenschluessel)
    var items = [];
    function addItem(kind, cell, label) {
      var m = makeItemMesh(kind, mats);
      m.position.set((cell[0] + 0.5) * C, (kind === "carkey" ? 0.05 : 0.0) + 0.42, (cell[1] + 0.5) * C);
      m.traverse(function (o) { if (o.isMesh) o.castShadow = true; });
      scene.add(m);
      items.push({ kind: kind, cx: cell[0], cz: cell[1], mesh: m, taken: false, label: label || kind });
      return items[items.length - 1];
    }
    CFG.PARTS.forEach(function (p) { addItem(p.id === "fuel" ? "fuel" : p.id, p.cell, p.name); });
    addItem("pistol", CFG.PISTOL_CELL, "Revolver");
    addItem("ammo", CFG.AMMO_CELL, "Munition");
    CFG.ENERGY_BAR_CELLS.forEach(function (c) { addItem("bar", c, "Energieriegel"); });
    CFG.FLASH_BATTERY_CELLS.forEach(function (c) { addItem("flashbattery", c, "Batterie"); });
    addItem("keyGarage", [57, 23], "Garagenschluessel");

    // Baeume
    buildTrees(scene, mats);

    return {
      materials: mats, doors: doors, rollDoor: rollDoor, items: items,
      lamps: lamps, canopyLights: canopyLights, shopLights: shopLights,
      garageLight: garageLight, sign: sign, playerCar: playerCar,
      burgerCase: burgerCase, radio: radio,
      makeVehicle: function (t) { return makeVehicle(t, mats); },
    };
  }

  return { buildWorld: buildWorld };
})();
