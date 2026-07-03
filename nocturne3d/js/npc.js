// ============================================================================
// NOCTURNE Nacht 1 — NPCs (Kunden, Polizist), Verkehr & fahrbares Auto
// ============================================================================
"use strict";

// --- Einfacher Mensch (normale Proportionen, im Gegensatz zur Kreatur) -----
function buildHuman(colors) {
  var g = new THREE.Group();
  var jacket = new THREE.MeshLambertMaterial({ color: colors.jacket });
  var pants = new THREE.MeshLambertMaterial({ color: colors.pants });
  var skin = new THREE.MeshLambertMaterial({ color: 0x9a8270 });
  var torso = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.6, 0.24), jacket);
  torso.position.y = 1.25; torso.castShadow = true;
  var head = new THREE.Mesh(new THREE.SphereGeometry(0.13, 8, 7), skin);
  head.position.y = 1.72;
  function limb(mat, w, h) {
    var p = new THREE.Group();
    var m = new THREE.Mesh(new THREE.BoxGeometry(w, h, w), mat);
    m.position.y = -h / 2; m.castShadow = true;
    p.add(m);
    return p;
  }
  var armL = limb(jacket, 0.1, 0.62); armL.position.set(-0.27, 1.5, 0);
  var armR = limb(jacket, 0.1, 0.62); armR.position.set(0.27, 1.5, 0);
  var legL = limb(pants, 0.13, 0.95); legL.position.set(-0.11, 0.95, 0);
  var legR = limb(pants, 0.13, 0.95); legR.position.set(0.11, 0.95, 0);
  g.add(torso, head, armL, armR, legL, legR);
  if (colors.cap) {
    var cap = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.08, 0.3),
      new THREE.MeshLambertMaterial({ color: colors.cap }));
    cap.position.y = 1.84;
    g.add(cap);
  }
  return { group: g, arms: [armL, armR], legs: [legL, legR], head: head };
}

// Wegpunkt-Laeufer
function WalkerMixin(obj) {
  obj.wp = [];
  obj.walkTo = function (points) { obj.wp = points.slice(); };
  obj.stepWalker = function (dt, speed) {
    if (!obj.wp.length) return true;
    var t = obj.wp[0];
    var dx = t[0] - obj.x, dz = t[1] - obj.z;
    var d = Math.hypot(dx, dz);
    if (d < 0.15) { obj.wp.shift(); return obj.wp.length === 0; }
    obj.x += (dx / d) * speed * dt;
    obj.z += (dz / d) * speed * dt;
    obj.heading = Math.atan2(dx, dz);
    obj.walkAnim = (obj.walkAnim || 0) + dt * 6;
    return false;
  };
  obj.pose = function (moving) {
    var s = moving ? Math.sin(obj.walkAnim || 0) * 0.5 : 0;
    obj.model.legs[0].rotation.x = s;
    obj.model.legs[1].rotation.x = -s;
    obj.model.arms[0].rotation.x = -s * 0.6;
    obj.model.arms[1].rotation.x = s * 0.6;
    obj.model.group.position.set(obj.x, 0, obj.z);
    obj.model.group.rotation.y = obj.heading || 0;
  };
}

// ============================================================================
// Kunde: faehrt vor, geht zum Tresen, bestellt, wartet, geht, faehrt weg
// ============================================================================
var ORDERS = [
  { id: "coffee", label: "Kaffee", station: "coffee" },
  { id: "burger", label: "Burger", station: "burger" },
  { id: "pay", label: "Zahlen", station: "register" },
];

function Customer(scene, built, orderIdx) {
  var palette = [{ jacket: 0x4a5a6a, pants: 0x2a2e36 }, { jacket: 0x6a4a3a, pants: 0x30343c }, { jacket: 0x3a5a44, pants: 0x22262c }];
  this.model = buildHuman(palette[orderIdx % palette.length]);
  scene.add(this.model.group);
  this.car = built.makeVehicle("traffic");
  scene.add(this.car.group);
  this.order = ORDERS[orderIdx % ORDERS.length];
  this.state = "arriving";
  this.served = false;
  this.timer = 0;
  var C = CFG.CELL;
  // Auto: von Osten zur Zapfsaeule
  this.car.group.position.set(190, 0, (CFG.ROAD_Z0 + 3.5) * C);
  this.car.group.rotation.y = -Math.PI / 2;
  this.carTarget = [(CFG.PUMPS[1][0] + 0.5) * C + 2, (CFG.PUMPS[1][1] + 1.6) * C];
  this.x = this.carTarget[0]; this.z = this.carTarget[1];
  this.model.group.visible = false;
  WalkerMixin(this);
  // Sprechblase
  this.bubble = new THREE.Sprite(new THREE.SpriteMaterial({ map: TEX.bubble(this.order.label), transparent: true, fog: false }));
  this.bubble.scale.set(1.5, 1.1, 1);
  this.bubble.visible = false;
  scene.add(this.bubble);
}

Customer.prototype.update = function (dt, world, audio, doorAt) {
  var C = CFG.CELL, cg = this.car.group;
  if (this.state === "arriving") {
    var dx = this.carTarget[0] - cg.position.x, dz = this.carTarget[1] - cg.position.z;
    var d = Math.hypot(dx, dz);
    if (d < 0.4) {
      this.state = "walkIn";
      this.car.extra.frontLight.intensity = 0;
      this.model.group.visible = true;
      this.x = cg.position.x; this.z = cg.position.z + 1.4;
      var door = CFG.POS.door, cf = CFG.POS.counterFront;
      this.walkTo([[(door[0] + 0.5) * C, (door[1] - 0.6) * C], [(door[0] + 0.5) * C, (door[1] + 1.4) * C],
      [(cf[0] + 0.5) * C, (cf[1] + 0.5) * C]]);
    } else {
      this.car.extra.frontLight.intensity = 0.7;
      var sp = Math.min(9, d * 1.4 + 1);
      cg.position.x += (dx / d) * sp * dt;
      cg.position.z += (dz / d) * sp * dt;
      cg.rotation.y = -Math.atan2(dz, dx);
      this.car.wheels.forEach(function (w) { w.rotation.z -= sp * dt * 2.6; });
    }
  } else if (this.state === "walkIn") {
    this._autoDoor(world, audio);
    if (this.stepWalker(dt, 2.2)) {
      this.state = "ordering";
      this.bubble.visible = true;
      this.heading = Math.PI;                 // zum Tresen (Sueden) schauen
    }
    this.pose(true);
  } else if (this.state === "ordering") {
    this.pose(false);
    this.bubble.position.set(this.x, 2.4, this.z);
    if (this.served) {
      this.state = "leaving";
      this.bubble.visible = false;
      var door = CFG.POS.door;
      this.walkTo([[(door[0] + 0.5) * C, (door[1] + 1.4) * C], [(door[0] + 0.5) * C, (door[1] - 0.6) * C],
      [cg.position.x, cg.position.z + 1.4]]);
    }
  } else if (this.state === "leaving") {
    this._autoDoor(world, audio);
    if (this.stepWalker(dt, 2.4)) {
      this.state = "driveOff";
      this.model.group.visible = false;
      this.car.extra.frontLight.intensity = 0.7;
      if (audio) audio.carPassBy();
    }
    this.pose(true);
  } else if (this.state === "driveOff") {
    cg.position.x += 8.5 * dt;
    cg.rotation.y = -Math.PI / 2 + Math.PI;   // nach Osten
    this.car.wheels.forEach(function (w) { w.rotation.z += 8.5 * dt * 2.6; });
    if (cg.position.x > 188) this.state = "done";
  }
  return this.state === "done";
};

Customer.prototype._autoDoor = function (world, audio) {
  var door = CFG.POS.door, C = CFG.CELL;
  if (Math.hypot(this.x - (door[0] + 0.5) * C, this.z - (door[1] + 0.5) * C) < 2.6) {
    var d = world.getDoor(door[0], door[1]);
    if (d && d.target !== 1 && !d.locked) { d.target = 1; if (audio) { audio.doorCreak(); audio.bell(); } }
  }
};

Customer.prototype.dispose = function (scene) {
  scene.remove(this.model.group, this.car.group, this.bubble);
};

// ============================================================================
// Polizei-Event
// ============================================================================
function PoliceEvent(scene, built) {
  this.car = built.makeVehicle("police");
  scene.add(this.car.group);
  this.officer = buildHuman({ jacket: 0x26303e, pants: 0x1c222c, cap: 0x1c2430 });
  this.officer.group.visible = false;
  scene.add(this.officer.group);
  this.state = "arriving";
  this.blinkT = 0;
  var C = CFG.CELL;
  this.car.group.position.set(188, 0, (CFG.ROAD_Z0 + 3.5) * C);
  this.park = [(CFG.POS.policePark[0] + 0.5) * C, (CFG.POS.policePark[1] + 0.5) * C];
  this.x = this.park[0]; this.z = this.park[1];
  WalkerMixin(this);
  this.model = this.officer;              // fuer pose()
  this.dialogDone = false;
  this.timer = 0;
}

PoliceEvent.prototype.update = function (dt, world, audio, onDialog) {
  var C = CFG.CELL, cg = this.car.group;
  this.blinkT += dt;
  if (this.car.extra.red) {                // dezentes Blinken
    var on = Math.floor(this.blinkT * 3) % 2 === 0;
    this.car.extra.red.material.color.setHex(on ? 0xff4444 : 0x661111);
    this.car.extra.blue.material.color.setHex(on ? 0x223366 : 0x4466ff);
  }
  if (this.state === "arriving") {
    var dx = this.park[0] - cg.position.x, dz = this.park[1] - cg.position.z;
    var d = Math.hypot(dx, dz);
    this.car.extra.frontLight.intensity = 0.7;
    if (d < 0.5) {
      this.state = "walkIn";
      this.car.extra.frontLight.intensity = 0;
      this.officer.group.visible = true;
      this.x = cg.position.x; this.z = cg.position.z + 1.4;
      var door = CFG.POS.door, cf = CFG.POS.counterFront;
      this.walkTo([[(door[0] + 0.5) * C, (door[1] - 0.6) * C], [(door[0] + 0.5) * C, (door[1] + 1.4) * C],
      [(cf[0] + 0.5) * C, (cf[1] + 0.5) * C]]);
    } else {
      var sp = Math.min(8, d * 1.2 + 1);
      cg.position.x += (dx / d) * sp * dt;
      cg.position.z += (dz / d) * sp * dt;
      cg.rotation.y = -Math.atan2(dz, dx);
      this.car.wheels.forEach(function (w) { w.rotation.z -= sp * dt * 2.6; });
    }
  } else if (this.state === "walkIn") {
    this._autoDoor(world, audio);
    if (this.stepWalker(dt, 2.0)) {
      this.state = "talking";
      this.heading = Math.PI;
      this.timer = 0;
      onDialog();
    }
    this.pose(true);
  } else if (this.state === "talking") {
    this.pose(false);
    this.timer += dt;
    if (this.dialogDone) {
      this.state = "walkOut";
      var door = CFG.POS.door;
      this.walkTo([[(door[0] + 0.5) * C, (door[1] + 1.4) * C], [(door[0] + 0.5) * C, (door[1] - 0.6) * C],
      [cg.position.x, cg.position.z + 1.4]]);
    }
  } else if (this.state === "walkOut") {
    this._autoDoor(world, audio);
    if (this.stepWalker(dt, 2.2)) {
      this.state = "driveOff";
      this.officer.group.visible = false;
      this.car.extra.frontLight.intensity = 0.8;
      if (audio) audio.carPassBy();
    }
    this.pose(true);
  } else if (this.state === "driveOff") {
    // zur Strasse und nach Westen in den Tunnel
    cg.position.z += (16 - cg.position.z) * Math.min(1, dt * 1.2);
    cg.position.x -= 9 * dt;
    cg.rotation.y = Math.PI;                  // nach Westen
    this.car.wheels.forEach(function (w) { w.rotation.z += 9 * dt * 2.6; });
    if (cg.position.x < 6) this.state = "done";
  }
  return this.state === "done";
};

PoliceEvent.prototype._autoDoor = Customer.prototype._autoDoor;

// ============================================================================
// Verkehr: Autos, die einfach vorbeifahren
// ============================================================================
function Traffic(scene, built) {
  this.scene = scene;
  this.built = built;
  this.cars = [];
  this.timer = 4;
  this.rate = 9;             // mittlerer Abstand in s (Akt 1)
  this.enabled = true;
}

Traffic.prototype.update = function (dt, audio, playerX) {
  if (this.enabled) {
    this.timer -= dt;
    if (this.timer <= 0) {
      this.timer = this.rate * (0.6 + Math.random() * 0.9);
      var east = Math.random() < 0.5;
      var v = this.built.makeVehicle("traffic");
      var lane = east ? (CFG.ROAD_Z0 + 1.0) * CFG.CELL : (CFG.ROAD_Z0 + 3.0) * CFG.CELL;
      v.group.position.set(east ? 24 : 188, 0, lane);
      v.group.rotation.y = east ? Math.PI / 2 - Math.PI / 2 : 0;
      v.group.rotation.y = east ? 0 : Math.PI;
      v.extra.frontLight.intensity = 0.8;
      this.scene.add(v.group);
      this.cars.push({ v: v, dir: east ? 1 : -1, speed: 11 + Math.random() * 4 });
      if (audio && Math.abs(playerX - 100) < 90) audio.carPassBy();
    }
  }
  for (var i = this.cars.length - 1; i >= 0; i--) {
    var c = this.cars[i];
    c.v.group.position.x += c.dir * c.speed * dt;
    c.v.wheels.forEach(function (w) { w.rotation.z += c.dir * c.speed * dt * 2.6; });
    if (c.v.group.position.x > 190 || c.v.group.position.x < 22) {
      this.scene.remove(c.v.group);
      this.cars.splice(i, 1);
    }
  }
};

// ============================================================================
// Fahrbares Auto (Finale)
// ============================================================================
function CarController(vehicle) {
  this.v = vehicle;
  this.x = vehicle.group.position.x;
  this.z = vehicle.group.position.z;
  this.angle = -Math.PI / 2;      // Weltwinkel: Fahrtrichtung (siehe unten)
  this.speed = 0;
  this.crashed = false;
}

CarController.prototype.update = function (dt, input, world, audio) {
  if (this.crashed) return;
  var accel = 0;
  if (input.keys.KeyW) accel = CFG.CAR_ACCEL;
  else if (input.keys.KeyS) accel = -CFG.CAR_ACCEL * 0.8;
  this.speed += accel * dt;
  this.speed -= this.speed * 0.5 * dt;                       // Rollwiderstand
  this.speed = Math.max(-4, Math.min(CFG.CAR_MAX_SPEED, this.speed));
  var steer = 0;
  if (input.keys.KeyA) steer = 1;
  if (input.keys.KeyD) steer = -1;
  this.angle += steer * CFG.CAR_TURN * dt * Math.max(-1, Math.min(1, this.speed / 5));

  var fx = Math.cos(this.angle), fz = -Math.sin(this.angle);
  var nx = this.x + fx * this.speed * dt;
  var nz = this.z + fz * this.speed * dt;
  // Kollision: Front- und Heckpunkt muessen befahrbar sein
  var ok = true;
  [[2.1, 0], [-2.1, 0], [0, 0]].forEach(function (o) {
    var px = nx + fx * o[0], pz = nz + fz * o[0];
    if (!isDrivable(Math.floor(px / CFG.CELL), Math.floor(pz / CFG.CELL), world)) ok = false;
  });
  if (ok) { this.x = nx; this.z = nz; }
  else {
    if (Math.abs(this.speed) > CFG.CRASH_SPEED) this.crashed = true;
    this.speed = 0;
  }
  this.v.group.position.set(this.x, 0, this.z);
  this.v.group.rotation.y = this.angle;
  var sp = this.speed;
  this.v.wheels.forEach(function (w) { w.rotation.z += sp * dt * 2.6; });
  if (audio) audio.setEngineSpeed(Math.abs(this.speed) / CFG.CAR_MAX_SPEED);
};
