// ============================================================================
// NOCTURNE Nacht 1 — Spieler (First-Person, Inventar, Verstecken)
// ============================================================================
"use strict";

function Player() {
  this.x = CFG.PLAYER_START.x * CFG.CELL;
  this.z = CFG.PLAYER_START.z * CFG.CELL;
  this.angle = CFG.PLAYER_START.angle;
  this.pitch = 0;

  this.stamina = CFG.STAMINA_MAX;
  this.battery = CFG.BATTERY_MAX;
  this.flashOn = false;

  // Inventar
  this.bars = CFG.ENERGY_BARS_START;
  this.hasPistol = false;
  this.ammo = 0;
  this.hasGarageKey = false;
  this.hasCarKey = false;
  this.carrying = null;          // gerade getragenes Autoteil (id) oder null
  this.fuelFilled = false;       // Kanister voll?
  this.sprintBoost = 0;          // Energieriegel-Bonus

  this.hidden = false;           // in einem Versteck?
  this.hideSpot = null;

  this.bobPhase = 0;
  this.bob = 0;
  this.moving = false;
  this.running = false;
  this.stepCycle = 0;
  this.noise = 0;                // wie laut ist der Spieler gerade (fuer die KI)
}

Player.prototype.indoor = function () {
  return isIndoor(this.cellX(), this.cellZ());
};

Player.prototype._collides = function (nx, nz, world) {
  var r = CFG.PLAYER_R, C = CFG.CELL;
  var cx0 = Math.floor((nx - r) / C), cx1 = Math.floor((nx + r) / C);
  var cz0 = Math.floor((nz - r) / C), cz1 = Math.floor((nz + r) / C);
  for (var cz = cz0; cz <= cz1; cz++) for (var cx = cx0; cx <= cx1; cx++) {
    if (!isBlocked(cx, cz, world)) continue;
    var px = Math.max(cx * C, Math.min(nx, cx * C + C));
    var pz = Math.max(cz * C, Math.min(nz, cz * C + C));
    if ((px - nx) * (px - nx) + (pz - nz) * (pz - nz) < r * r) return true;
  }
  return false;
};

Player.prototype.update = function (dt, input, world, audio) {
  if (this.hidden) { this.noise = 0; this.moving = false; return; }

  this.angle += input.mouseDX * 0.0023;
  this.pitch = Math.max(-1.35, Math.min(1.35, this.pitch - input.mouseDY * 0.0023));
  input.mouseDX = input.mouseDY = 0;

  var fx = Math.cos(this.angle), fz = Math.sin(this.angle);
  var mx = 0, mz = 0;
  if (input.keys.KeyW) { mx += fx; mz += fz; }
  if (input.keys.KeyS) { mx -= fx; mz -= fz; }
  if (input.keys.KeyA) { mx += fz; mz -= fx; }
  if (input.keys.KeyD) { mx -= fz; mz += fx; }
  var len = Math.hypot(mx, mz);
  this.moving = len > 0.01;

  if (this.sprintBoost > 0) this.sprintBoost -= dt;
  this.running = false;
  var speed = CFG.WALK_SPEED;
  if (this.moving && input.keys.ShiftLeft && this.stamina > 1) {
    speed = CFG.RUN_SPEED * (this.sprintBoost > 0 ? 1.15 : 1);
    this.running = true;
    this.stamina = Math.max(0, this.stamina - (this.sprintBoost > 0 ? 10 : 17) * dt);
  } else {
    this.stamina = Math.min(CFG.STAMINA_MAX, this.stamina + 10 * dt);
  }

  if (this.moving) {
    mx /= len; mz /= len;
    var sp = speed * dt;
    var nx = this.x + mx * sp;
    if (!this._collides(nx, this.z, world)) this.x = nx;
    var nz = this.z + mz * sp;
    if (!this._collides(this.x, nz, world)) this.z = nz;

    this.bobPhase += dt * (this.running ? 11.5 : 7.5);
    this.bob = Math.sin(this.bobPhase) * (this.running ? 0.06 : 0.04);
    this.stepCycle += dt * (this.running ? 2.4 : 1.5);
    if (this.stepCycle >= 1) {
      this.stepCycle = 0;
      if (audio) audio.footstep(this.running, this.indoor());
    }
    this.noise = this.running ? 1.0 : 0.35;
  } else {
    this.bob *= Math.max(0, 1 - dt * 6);
    this.noise = 0;
  }

  if (this.flashOn) {
    this.battery = Math.max(0, this.battery - CFG.BATTERY_DRAIN * dt);
    if (this.battery <= 0) this.flashOn = false;
  }
};

Player.prototype.eyeY = function () {
  return (this.hidden ? 0.9 : CFG.EYE) + this.bob;
};
Player.prototype.cellX = function () { return Math.floor(this.x / CFG.CELL); };
Player.prototype.cellZ = function () { return Math.floor(this.z / CFG.CELL); };
