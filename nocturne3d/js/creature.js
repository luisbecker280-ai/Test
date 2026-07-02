// ============================================================================
// NOCTURNE 3D — Die Kreatur
// Hageres 3D-Modell mit gluehenden Augen. Die KI jagt per A* ueber BEIDE
// Etagen: liegt der Spieler auf der anderen, laeuft sie zur Treppe und
// steigt sie physisch hoch/runter (gleiches Hoehenmodell wie der Spieler).
// ============================================================================
"use strict";

function buildCreatureModel() {
  var skin = new THREE.MeshLambertMaterial({ map: TEX.skin() });
  var g = new THREE.Group();

  var torso = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.24, 0.95, 8), skin);
  torso.position.y = 1.55;
  torso.castShadow = true;

  var head = new THREE.Mesh(new THREE.SphereGeometry(0.17, 10, 8), skin);
  head.scale.set(0.9, 1.35, 0.95);
  head.position.y = 2.25;
  head.castShadow = true;

  var eyeMat = new THREE.MeshBasicMaterial({ color: 0xfff6d8 });
  var eyeL = new THREE.Mesh(new THREE.SphereGeometry(0.030, 6, 5), eyeMat);
  var eyeR = eyeL.clone();
  eyeL.position.set(-0.062, 2.29, 0.145);
  eyeR.position.set(0.062, 2.29, 0.145);
  var mouth = new THREE.Mesh(new THREE.SphereGeometry(0.05, 6, 5),
    new THREE.MeshBasicMaterial({ color: 0x090607 }));
  mouth.scale.set(1.0, 1.5, 0.4);
  mouth.position.set(0, 2.13, 0.13);

  function limb(w, h) {
    var pivot = new THREE.Group();
    var m = new THREE.Mesh(new THREE.BoxGeometry(w, h, w), skin);
    m.position.y = -h / 2;
    m.castShadow = true;
    pivot.add(m);
    return pivot;
  }
  var armL = limb(0.09, 1.05); armL.position.set(-0.28, 2.0, 0);
  var armR = limb(0.09, 1.05); armR.position.set(0.28, 2.0, 0);
  var legL = limb(0.12, 1.1); legL.position.set(-0.12, 1.1, 0);
  var legR = limb(0.12, 1.1); legR.position.set(0.12, 1.1, 0);

  // Reihenfolge = Zeichenreihenfolge beim Jumpscare (Depth-Test aus):
  // Gliedmassen zuerst, Gesicht zuletzt -> Gesicht liegt immer obenauf
  g.add(legL, legR, armL, armR, torso, head, eyeL, eyeR, mouth);
  return { group: g, head: head, eyes: [eyeL, eyeR], eyeMat: eyeMat, arms: [armL, armR], legs: [legL, legR] };
}

var LURK = 0, HUNT = 1;

function Creature(scene) {
  var m = buildCreatureModel();
  this.model = m;
  scene.add(m.group);
  this.x = CFG.CREATURE_START.x * CFG.CELL;
  this.z = CFG.CREATURE_START.z * CFG.CELL;
  this.floor = CFG.CREATURE_START.floor;
  this.y = this.floor * CFG.FLOOR1_Y;
  this.state = LURK;
  this.aggression = 0;
  this.path = [];
  this.repathTimer = 0;
  this.wanderTimer = 0;
  this.anim = 0;
  this.caught = false;
  this.slowFactor = 1;
}

Creature.prototype.reset = function () {
  this.x = CFG.CREATURE_START.x * CFG.CELL;
  this.z = CFG.CREATURE_START.z * CFG.CELL;
  this.floor = CFG.CREATURE_START.floor;
  this.y = this.floor * CFG.FLOOR1_Y;
  this.state = LURK;
  this.aggression = 0;
  this.path = [];
  this.caught = false;
  this.model.group.visible = true;
};

Creature.prototype.cell = function () {
  return [Math.floor(this.x / CFG.CELL), Math.floor(this.z / CFG.CELL)];
};

// Zielzelle bestimmen: Spieler direkt – oder erst die Treppe, wenn er auf
// der anderen Etage ist.
Creature.prototype._goal = function (player) {
  if (player.floor === this.floor)
    return [player.cellX(), player.cellZ()];
  // andere Etage: zum jeweils fernen Ende des Treppenlaufs
  return this.floor === 0 ? CFG.STAIR_RUN[CFG.STAIR_RUN.length - 1] : CFG.STAIR_RUN[0];
};

Creature.prototype._wanderGoal = function (player, world) {
  for (var i = 0; i < 30; i++) {
    var cx = Math.floor(Math.random() * CFG.GRID_W);
    var cz = Math.floor(Math.random() * CFG.GRID_H);
    if (isPathBlocked(this.floor, cx, cz, world)) continue;
    var d = Math.hypot(cx - player.cellX(), cz - player.cellZ());
    if (d > 4 && d < 15) return [cx, cz];
  }
  return this.cell();
};

Creature.prototype.update = function (dt, player, world, audio, lookedAt) {
  if (this.caught) return;
  this.anim += dt;
  this.aggression = Math.min(1, this.aggression + dt * 0.010);

  var dx = player.x - this.x, dz = player.z - this.z;
  var hdist = Math.hypot(dx, dz);
  var sameFloor = player.floor === this.floor;

  // --- Fang: Beruehrung = sofortiger Tod (Jumpscare loest main.js aus) ----
  if (sameFloor && hdist < CFG.CREATURE_CONTACT && Math.abs(player.y - this.y) < 1.8) {
    this.caught = true;
    return;
  }

  // --- Zustandswechsel -----------------------------------------------------
  var los = sameFloor && lineOfSight(this.floor, this.x, this.z, player.x, player.z, world);
  var sees = los && hdist < CFG.CREATURE_SIGHT;
  if (this.state === LURK && (sees && (player.lightLevel() > 0.3 || hdist < 5.5) || this.aggression > 0.85 || player.sanity < 25)) {
    this.state = HUNT;
  } else if (this.state === HUNT && !sees && !sameFloor && Math.random() < dt * 0.02) {
    this.state = LURK;
  }

  // Angestarrt im Licht -> friert fast ein (aber verschwindet nicht)
  this.slowFactor += ((lookedAt ? 0.16 : 1.0) - this.slowFactor) * Math.min(1, dt * 5);

  // --- Pfad ------------------------------------------------------------------
  this.repathTimer -= dt;
  var mycell = this.cell();
  if (this.state === HUNT) {
    if (this.repathTimer <= 0 || this.path.length === 0) {
      this.repathTimer = 0.7;
      var p = findPath(this.floor, mycell, this._goal(player), world);
      this.path = p ? p.slice(1) : [];
    }
  } else {
    this.wanderTimer -= dt;
    if (this.wanderTimer <= 0 || this.path.length === 0) {
      this.wanderTimer = 4 + Math.random() * 5;
      var w = findPath(this.floor, mycell, this._wanderGoal(player, world), world);
      this.path = w ? w.slice(1) : [];
    }
  }

  // --- Bewegung entlang des Pfads -------------------------------------------
  var speed = (this.state === HUNT ? CFG.CREATURE_SPEED_HUNT : CFG.CREATURE_SPEED_LURK)
    * this.slowFactor * (0.75 + this.aggression * 0.35);
  if (this.state === HUNT && sameFloor && hdist < 3.5 && los) {
    // Endspurt: direkt auf den Spieler zu
    this.x += (dx / hdist) * speed * dt;
    this.z += (dz / hdist) * speed * dt;
  } else if (this.path.length) {
    var t = this.path[0];
    var tx = (t[0] + 0.5) * CFG.CELL, tz = (t[1] + 0.5) * CFG.CELL;
    var ddx = tx - this.x, ddz = tz - this.z;
    var dd = Math.hypot(ddx, ddz);
    // geschlossene Tuer auf dem Weg? -> aufreissen
    var ts = symAt(this.floor, t[0], t[1]);
    if (ts === "D" && !world.doorOpen(this.floor, t[0], t[1]) && dd < CFG.CELL * 1.3) {
      world.openDoor(this.floor, t[0], t[1], true);
    }
    if (dd < 0.15) this.path.shift();
    else {
      this.x += (ddx / dd) * Math.min(speed * dt, dd);
      this.z += (ddz / dd) * Math.min(speed * dt, dd);
    }
  }

  // --- Hoehe & Etage (gleiches Modell wie beim Spieler) ----------------------
  var gy = groundHeight(this.x, this.z, this.floor);
  this.y += (gy - this.y) * Math.min(1, dt * 10);
  if (Math.abs(gy - this.y) < 0.03) this.y = gy;
  this.floor = floorFromY(this.y);

  // --- Modell / Animation -----------------------------------------------------
  var g = this.model.group;
  g.position.set(this.x, this.y, this.z);
  if (hdist > 0.05 && sameFloor) g.rotation.y = Math.atan2(dx, dz);
  else if (this.path.length) {
    var n = this.path[0];
    g.rotation.y = Math.atan2((n[0] + 0.5) * CFG.CELL - this.x, (n[1] + 0.5) * CFG.CELL - this.z);
  }
  var moving = this.path.length > 0 || (this.state === HUNT && sameFloor);
  var swing = moving ? Math.sin(this.anim * (this.state === HUNT ? 10 : 5)) * 0.6 : 0;
  this.model.legs[0].rotation.x = swing;
  this.model.legs[1].rotation.x = -swing;
  if (this.state === HUNT) {
    // Arme nach vorn gestreckt
    this.model.arms[0].rotation.x += (-1.9 - this.model.arms[0].rotation.x) * Math.min(1, dt * 4);
    this.model.arms[1].rotation.x += (-1.9 - this.model.arms[1].rotation.x) * Math.min(1, dt * 4);
  } else {
    this.model.arms[0].rotation.x += (swing * 0.5 - this.model.arms[0].rotation.x) * Math.min(1, dt * 4);
    this.model.arms[1].rotation.x += (-swing * 0.5 - this.model.arms[1].rotation.x) * Math.min(1, dt * 4);
  }
  // unheimliches Kopf-Zucken
  this.model.head.rotation.z = Math.sin(this.anim * 1.7) * 0.12 + (this.state === HUNT ? Math.sin(this.anim * 23) * 0.05 : 0);
  this.model.eyeMat.color.setHex(this.state === HUNT ? 0xffffff : 0xd8cdb4);
};
