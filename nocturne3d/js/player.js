// ============================================================================
// NOCTURNE 3D — First-Person-Spieler mit echter Treppenphysik
// Die Etage ist KEIN Schalter: sie ergibt sich aus der Hoehe (y), die beim
// Treppensteigen kontinuierlich interpoliert wird.
// ============================================================================
"use strict";

function Player() {
  this.x = CFG.PLAYER_START.x * CFG.CELL;
  this.z = CFG.PLAYER_START.z * CFG.CELL;
  this.y = 0;                    // Fusshoehe
  this.angle = CFG.PLAYER_START.angle;
  this.pitch = 0;
  this.floor = 0;

  this.stamina = CFG.STAMINA_MAX;
  this.battery = CFG.BATTERY_MAX;
  this.sanity = CFG.SANITY_MAX;
  this.keys = 0;
  this.flashOn = true;

  this.bobPhase = 0;
  this.bob = 0;
  this.moving = false;
  this.running = false;
  this.stepCycle = 0;
}

Player.prototype.indoor = function () {
  var s = symAt(this.floor, Math.floor(this.x / CFG.CELL), Math.floor(this.z / CFG.CELL));
  return s === ":" || s === "S" || s === "D" || this.floor === 1;
};

// Kreis-gegen-Zellen-Kollision auf der aktuellen Etage
Player.prototype._collides = function (nx, nz, world) {
  var r = CFG.PLAYER_R, C = CFG.CELL;
  var cx0 = Math.floor((nx - r) / C), cx1 = Math.floor((nx + r) / C);
  var cz0 = Math.floor((nz - r) / C), cz1 = Math.floor((nz + r) / C);
  for (var cz = cz0; cz <= cz1; cz++) for (var cx = cx0; cx <= cx1; cx++) {
    if (!isBlocked(this.floor, cx, cz, world)) continue;
    // naechster Punkt des Zellrechtecks zum Kreismittelpunkt
    var px = Math.max(cx * C, Math.min(nx, cx * C + C));
    var pz = Math.max(cz * C, Math.min(nz, cz * C + C));
    if ((px - nx) * (px - nx) + (pz - nz) * (pz - nz) < r * r) return true;
  }
  return false;
};

Player.prototype.update = function (dt, input, world, audio) {
  // Blick
  this.angle += input.mouseDX * 0.0023;
  this.pitch = Math.max(-1.35, Math.min(1.35, this.pitch - input.mouseDY * 0.0023));
  input.mouseDX = input.mouseDY = 0;

  // Bewegungsrichtung relativ zur Blickrichtung
  var fx = Math.cos(this.angle), fz = Math.sin(this.angle);
  var mx = 0, mz = 0;
  if (input.keys.KeyW) { mx += fx; mz += fz; }
  if (input.keys.KeyS) { mx -= fx; mz -= fz; }
  if (input.keys.KeyA) { mx += fz; mz -= fx; }
  if (input.keys.KeyD) { mx -= fz; mz += fx; }
  var len = Math.hypot(mx, mz);
  this.moving = len > 0.01;

  this.running = false;
  var speed = CFG.WALK_SPEED;
  if (this.moving && input.keys.ShiftLeft && this.stamina > 1) {
    speed = CFG.RUN_SPEED;
    this.running = true;
    this.stamina = Math.max(0, this.stamina - 20 * dt);
  } else {
    this.stamina = Math.min(CFG.STAMINA_MAX, this.stamina + 11 * dt);
  }

  if (this.moving) {
    mx /= len; mz /= len;
    // Treppen bremsen etwas
    var onStairs = isStairCell(Math.floor(this.x / CFG.CELL), Math.floor(this.z / CFG.CELL));
    var sp = speed * (onStairs ? 0.72 : 1.0) * dt;
    // Achsen getrennt testen -> sauberes Entlanggleiten an Waenden
    var nx = this.x + mx * sp;
    if (!this._collides(nx, this.z, world)) this.x = nx;
    var nz = this.z + mz * sp;
    if (!this._collides(this.x, nz, world)) this.z = nz;

    // Kopfwackeln + Schritte
    this.bobPhase += dt * (this.running ? 11.5 : 7.5);
    this.bob = Math.sin(this.bobPhase) * (this.running ? 0.065 : 0.045);
    this.stepCycle += dt * (this.running ? 2.4 : 1.55);
    if (this.stepCycle >= 1) {
      this.stepCycle = 0;
      if (audio) audio.footstep(this.running, this.indoor());
    }
  } else {
    this.bob *= Math.max(0, 1 - dt * 6);
  }

  // Hoehe: dem Boden folgen (Treppe = Rampe) und Etage aus der Hoehe ableiten
  var gy = groundHeight(this.x, this.z, this.floor);
  var dy = gy - this.y;
  var maxStep = Math.max(3.2 * dt, Math.abs(dy) * 10 * dt);
  this.y += Math.sign(dy) * Math.min(Math.abs(dy), maxStep);
  if (Math.abs(gy - this.y) < 0.02) this.y = gy;
  this.floor = floorFromY(this.y);

  // Taschenlampe verbraucht Akku
  if (this.flashOn) {
    this.battery = Math.max(0, this.battery - CFG.BATTERY_DRAIN * dt);
    if (this.battery <= 0) this.flashOn = false;
  }
};

Player.prototype.eyeY = function () {
  return this.y + CFG.EYE + this.bob;
};

Player.prototype.lightLevel = function () {
  // 1 = Lampe an, sonst schwaches Restlicht wenn eine Laterne nah ist
  if (this.flashOn && this.battery > 0) return 1.0;
  var best = 0;
  for (var i = 0; i < CFG.LANTERNS.length; i++) {
    var l = CFG.LANTERNS[i];
    if (l[2] !== this.floor) continue;
    var d = Math.hypot((l[0] + 0.5) * CFG.CELL - this.x, (l[1] + 0.5) * CFG.CELL - this.z);
    if (d < 5.5) best = Math.max(best, 1 - d / 5.5);
  }
  return best * 0.6;
};

Player.prototype.cellX = function () { return Math.floor(this.x / CFG.CELL); };
Player.prototype.cellZ = function () { return Math.floor(this.z / CFG.CELL); };
