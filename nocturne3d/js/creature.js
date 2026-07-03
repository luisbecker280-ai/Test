// ============================================================================
// NOCTURNE Nacht 1 — Die Kreatur
// Hager, zu lange Gliedmassen, gebeugter Gang, reflektierende Augen.
// Zustaende: OFF (Akt 1/2), STALK (lauert/naehert sich), HUNT (jagt),
// SEARCH (sucht zuletzt bekannte Position), STUNNED (Pistolentreffer).
// ============================================================================
"use strict";

function buildCreatureModel() {
  var skin = new THREE.MeshLambertMaterial({ map: TEX.skin() });
  var g = new THREE.Group();

  var pelvis = new THREE.Group();          // alles haengt am Becken -> Buecken moeglich
  pelvis.position.y = 1.35;

  var torso = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.21, 1.0, 8), skin);
  torso.position.y = 0.5;
  torso.castShadow = true;

  var neck = new THREE.Group();
  neck.position.y = 1.05;
  var head = new THREE.Mesh(new THREE.SphereGeometry(0.155, 10, 8), skin);
  head.scale.set(0.82, 1.45, 0.9);
  head.castShadow = true;
  var eyeMat = new THREE.MeshBasicMaterial({ color: 0xf3ead0 });
  var eyeL = new THREE.Mesh(new THREE.SphereGeometry(0.028, 6, 5), eyeMat);
  var eyeR = eyeL.clone();
  eyeL.position.set(-0.058, 0.05, 0.13);
  eyeR.position.set(0.058, 0.05, 0.13);
  var jaw = new THREE.Mesh(new THREE.SphereGeometry(0.05, 6, 5),
    new THREE.MeshBasicMaterial({ color: 0x080505 }));
  jaw.scale.set(1.0, 1.7, 0.5);
  jaw.position.set(0, -0.11, 0.12);
  neck.add(head, eyeL, eyeR, jaw);

  function limb(w, h) {
    var pivot = new THREE.Group();
    var upper = new THREE.Mesh(new THREE.BoxGeometry(w, h * 0.55, w), skin);
    upper.position.y = -h * 0.27;
    upper.castShadow = true;
    var lower = new THREE.Group();
    lower.position.y = -h * 0.55;
    var fore = new THREE.Mesh(new THREE.BoxGeometry(w * 0.8, h * 0.55, w * 0.8), skin);
    fore.position.y = -h * 0.27;
    fore.castShadow = true;
    lower.add(fore);
    pivot.add(upper, lower);
    pivot.lower = lower;
    return pivot;
  }
  // ueberlange Arme (reichen fast bis zum Boden)
  var armL = limb(0.075, 1.5); armL.position.set(-0.26, 0.95, 0);
  var armR = limb(0.075, 1.5); armR.position.set(0.26, 0.95, 0);
  var legL = limb(0.1, 1.35); legL.position.set(-0.11, 0, 0);
  var legR = limb(0.1, 1.35); legR.position.set(0.11, 0, 0);

  pelvis.add(legL, legR, armL, armR, torso, neck);
  g.add(pelvis);
  return { group: g, pelvis: pelvis, neck: neck, eyes: [eyeL, eyeR], eyeMat: eyeMat, arms: [armL, armR], legs: [legL, legR], torso: torso };
}

var C_OFF = 0, C_STALK = 1, C_HUNT = 2, C_SEARCH = 3, C_STUNNED = 4;

function Creature(scene) {
  this.model = buildCreatureModel();
  scene.add(this.model.group);
  this.reset();
}

Creature.prototype.reset = function () {
  this.x = CFG.CREATURE_SPAWN.x * CFG.CELL;
  this.z = CFG.CREATURE_SPAWN.z * CFG.CELL;
  this.state = C_OFF;
  this.model.group.visible = false;
  this.path = [];
  this.repathTimer = 0;
  this.wanderTimer = 0;
  this.stunTimer = 0;
  this.searchTimer = 0;
  this.bangTimer = 0;
  this.lastKnown = null;
  this.aggression = 0;       // steigt mit jedem gefundenen Autoteil
  this.anim = 0;
  this.caught = false;
  this.slow = 1;
};

Creature.prototype.activate = function () {
  if (this.state === C_OFF) {
    this.state = C_STALK;
    this.model.group.visible = true;
  }
};

Creature.prototype.stun = function (audio) {
  if (this.state === C_OFF || this.caught) return false;
  this.state = C_STUNNED;
  this.stunTimer = CFG.STUN_DURATION;
  this.path = [];
  if (audio) audio.stunHiss();
  return true;
};

Creature.prototype.cell = function () {
  return [Math.floor(this.x / CFG.CELL), Math.floor(this.z / CFG.CELL)];
};

Creature.prototype._wanderGoal = function (player, world) {
  for (var i = 0; i < 30; i++) {
    var cx = Math.floor(Math.random() * CFG.GRID_W);
    var cz = Math.floor(Math.random() * CFG.GRID_H);
    if (isPathBlocked(cx, cz, world)) continue;
    var d = Math.hypot(cx - player.cellX(), cz - player.cellZ());
    if (d > 6 && d < 22) return [cx, cz];
  }
  return this.cell();
};

Creature.prototype.update = function (dt, player, world, audio, lookedAt) {
  if (this.state === C_OFF || this.caught) return;
  this.anim += dt;

  var dx = player.x - this.x, dz = player.z - this.z;
  var dist = Math.hypot(dx, dz);

  // --- Fang (nicht wenn versteckt und unentdeckt) ---------------------------
  if (dist < CFG.CREATURE_CONTACT && !player.hidden) {
    this.caught = true;
    return;
  }

  // --- Betaeubung ------------------------------------------------------------
  if (this.state === C_STUNNED) {
    this.stunTimer -= dt;
    this._pose(dt, 0, true);
    this.model.group.position.set(this.x, 0, this.z);
    if (this.stunTimer <= 0) {
      this.state = C_HUNT;                 // wuetend wieder aufstehen
      this.lastKnown = [player.cellX(), player.cellZ()];
    }
    return;
  }

  var los = lineOfSight(this.x, this.z, player.x, player.z, world);
  var seesPlayer = !player.hidden && los && dist < CFG.CREATURE_SIGHT * (player.flashOn ? 1.25 : 0.8);
  var hearsPlayer = !player.hidden && player.noise > 0.6 && dist < CFG.CREATURE_HEAR_RUN;

  // --- Zustandslogik -----------------------------------------------------------
  if (seesPlayer || hearsPlayer) {
    this.state = C_HUNT;
    this.lastKnown = [player.cellX(), player.cellZ()];
  } else if (this.state === C_HUNT) {
    // Spieler verloren -> letzte Position absuchen
    this.state = C_SEARCH;
    this.searchTimer = 7 + this.aggression * 4;
  } else if (this.state === C_SEARCH) {
    this.searchTimer -= dt;
    if (this.searchTimer <= 0) this.state = C_STALK;
  }

  // Angeschaut im Licht -> zoegert
  this.slow += (((lookedAt && this.state !== C_HUNT) ? 0.25 : 1.0) - this.slow) * Math.min(1, dt * 4);

  // --- Ziel & Pfad -----------------------------------------------------------------
  this.repathTimer -= dt;
  var mycell = this.cell();
  var goal = null;
  if (this.state === C_HUNT) goal = [player.cellX(), player.cellZ()];
  else if (this.state === C_SEARCH && this.lastKnown) goal = this.lastKnown;
  else {
    this.wanderTimer -= dt;
    if (this.wanderTimer <= 0 || this.path.length === 0) {
      this.wanderTimer = 5 + Math.random() * 6;
      var w = findPath(mycell, this._wanderGoal(player, world), world);
      this.path = w ? w.slice(1) : [];
    }
  }
  if (goal && (this.repathTimer <= 0 || this.path.length === 0)) {
    this.repathTimer = 0.6;
    var p = findPath(mycell, goal, world);
    this.path = p ? p.slice(1) : [];
  }

  // --- Bewegung ---------------------------------------------------------------------
  var speed = (this.state === C_HUNT ? CFG.CREATURE_SPEED_HUNT : CFG.CREATURE_SPEED_PATROL)
    * this.slow * (0.8 + this.aggression * 0.45);
  var moving = false;
  if (this.state === C_HUNT && dist < 4 && los && !player.hidden) {
    this.x += (dx / dist) * speed * dt;
    this.z += (dz / dist) * speed * dt;
    moving = true;
  } else if (this.path.length) {
    var t = this.path[0];
    var tx = (t[0] + 0.5) * CFG.CELL, tz = (t[1] + 0.5) * CFG.CELL;
    var ddx = tx - this.x, ddz = tz - this.z;
    var dd = Math.hypot(ddx, ddz);
    var ts = symAt(t[0], t[1]);
    if (ts === "D" && dd < CFG.CELL * 1.4) {
      var door = world.getDoor(t[0], t[1]);
      if (door && door.open < 0.6) {
        if (door.locked) {
          // an der verschlossenen Tuer haemmern, dann aufbrechen
          this.bangTimer -= dt;
          if (this.bangTimer <= 0) {
            this.bangTimer = 1.1;
            if (audio) audio.doorBang();
            door.bangs = (door.bangs || 0) + 1;
            if (door.bangs >= 4) { door.locked = false; door.target = 1; if (audio) audio.doorCreak(); }
          }
          this._pose(dt, 0, false);
          this.model.group.position.set(this.x, 0, this.z);
          this.model.group.rotation.y = Math.atan2(tx - this.x, tz - this.z);
          return;
        }
        world.openDoor(t[0], t[1], true);
      }
    }
    if (dd < 0.18) this.path.shift();
    else {
      this.x += (ddx / dd) * Math.min(speed * dt, dd);
      this.z += (ddz / dd) * Math.min(speed * dt, dd);
      moving = true;
    }
  }

  // --- Modell -----------------------------------------------------------------------
  var g = this.model.group;
  g.position.set(this.x, 0, this.z);
  if (this.state === C_HUNT && dist > 0.05) g.rotation.y = Math.atan2(dx, dz);
  else if (this.path.length) {
    var n = this.path[0];
    g.rotation.y = Math.atan2((n[0] + 0.5) * CFG.CELL - this.x, (n[1] + 0.5) * CFG.CELL - this.z);
  }
  this._pose(dt, moving ? (this.state === C_HUNT ? 11 : 4.5) : 0, false);

  // Kopf fixiert den Spieler, wenn sichtbar (unheimlich)
  if (seesPlayer || this.state === C_HUNT) {
    var headAng = Math.atan2(dx, dz) - g.rotation.y;
    this.model.neck.rotation.y += (headAng - this.model.neck.rotation.y) * Math.min(1, dt * 6);
  } else {
    this.model.neck.rotation.y *= Math.max(0, 1 - dt * 3);
  }
  this.model.eyeMat.color.setHex(this.state === C_HUNT ? 0xffffff : 0xcfc4a4);
};

Creature.prototype._pose = function (dt, freq, stunned) {
  var m = this.model;
  if (stunned) {
    // zusammengesackt
    m.pelvis.position.y += (0.7 - m.pelvis.position.y) * Math.min(1, dt * 5);
    m.pelvis.rotation.x += (0.9 - m.pelvis.rotation.x) * Math.min(1, dt * 5);
    return;
  }
  m.pelvis.position.y += (1.35 - m.pelvis.position.y) * Math.min(1, dt * 4);
  // gebeugter Gang + Zucken bei der Jagd
  var hunch = this.state === C_HUNT ? 0.5 : 0.32;
  var twitch = this.state === C_HUNT ? Math.sin(this.anim * 31) * 0.05 : 0;
  m.pelvis.rotation.x += (hunch + twitch - m.pelvis.rotation.x) * Math.min(1, dt * 5);
  var swing = freq > 0 ? Math.sin(this.anim * freq) * 0.65 : 0;
  m.legs[0].rotation.x = swing;
  m.legs[1].rotation.x = -swing;
  m.legs[0].lower.rotation.x = Math.max(0, -swing) * 0.8;
  m.legs[1].lower.rotation.x = Math.max(0, swing) * 0.8;
  if (this.state === C_HUNT) {
    m.arms[0].rotation.x += (-1.7 - m.arms[0].rotation.x) * Math.min(1, dt * 4);
    m.arms[1].rotation.x += (-1.7 - m.arms[1].rotation.x) * Math.min(1, dt * 4);
    m.arms[0].lower.rotation.x = -0.4;
    m.arms[1].lower.rotation.x = -0.4;
  } else {
    m.arms[0].rotation.x += (swing * 0.4 - m.arms[0].rotation.x) * Math.min(1, dt * 4);
    m.arms[1].rotation.x += (-swing * 0.4 - m.arms[1].rotation.x) * Math.min(1, dt * 4);
    m.arms[0].lower.rotation.x = -0.15;
    m.arms[1].lower.rotation.x = -0.15;
  }
  m.neck.rotation.z = Math.sin(this.anim * 1.9) * 0.1 + twitch * 2;
};
