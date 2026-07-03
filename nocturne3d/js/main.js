// ============================================================================
// NOCTURNE Nacht 1 — Hauptschleife, Interaktion, HUD, Minimap, Finale
// ============================================================================
"use strict";

(function () {
  var STATE = { MENU: 0, PLAYING: 1, PAUSED: 2, JUMPSCARE: 3, DEAD: 4, OUTRO: 5, WIN: 6 };
  var state = STATE.MENU;
  var mode = "walk";                 // walk | engine | drive
  var DEBUG = /debug/.test(location.search);

  var renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(FAST ? 1 : Math.min(window.devicePixelRatio, 1.5));
  renderer.shadowMap.enabled = !FAST;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputEncoding = THREE.sRGBEncoding;
  document.getElementById("game").appendChild(renderer.domElement);

  var scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x04050a, 0.030);
  var camera = new THREE.PerspectiveCamera(72, window.innerWidth / window.innerHeight, 0.08, 400);
  window.addEventListener("resize", function () {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  scene.add(new THREE.HemisphereLight(0x252c40, 0x0a0a0e, 0.4));
  var moon = new THREE.DirectionalLight(0x8f9cc4, 0.13);
  moon.position.set(120, 90, -40);
  scene.add(moon);

  var flashlight = new THREE.SpotLight(0xffe2b0, 0, 34, 0.44, 0.45, 1.5);
  flashlight.castShadow = true;
  flashlight.shadow.mapSize.set(1024, 1024);
  var flashTarget = new THREE.Object3D();
  scene.add(flashlight, flashTarget);
  flashlight.target = flashTarget;

  var built = GEO.buildWorld(scene);
  var doorIndex = {};
  built.doors.forEach(function (d) { doorIndex[d.cx + "," + d.cz] = d; });
  // Garagen-Innentuer ist anfangs abgeschlossen (Garagenschluessel im Lager)
  var garageInnerDoor = doorIndex[SHOP.x1 + "," + 26];
  if (garageInnerDoor) garageInnerDoor.locked = true;

  var audio = new AudioEngine();

  var world = {
    rollDoorOpen: false,
    getDoor: function (cx, cz) { return doorIndex[cx + "," + cz]; },
    doorOpen: function (cx, cz) {
      var d = doorIndex[cx + "," + cz];
      return d ? d.open > 0.65 : false;
    },
    openDoor: function (cx, cz, byCreature) {
      var d = doorIndex[cx + "," + cz];
      if (d && !d.locked && d.target !== 1) { d.target = 1; audio.doorCreak(); }
    },
  };

  var player = new Player();
  var creature = new Creature(scene);
  var carCtl = null;

  // --- UI ---------------------------------------------------------------------
  var el = {};
  ["menu", "pause", "dead", "win", "redflash", "muzzle", "fade", "prompt", "objective",
    "dialog", "title", "titleSub", "inv", "batteryFill", "staminaFill",
    "minimap", "minimapLabel", "stats", "winsub"].forEach(function (id) { el[id] = document.getElementById(id); });
  var mctx = el.minimap.getContext("2d");

  var dialogT = 0;
  var ui = {
    dialog: function (text, dur) {
      el.dialog.textContent = text;
      el.dialog.style.opacity = 1;
      dialogT = dur || 4;
    },
    title: function (big, sub) {
      el.title.textContent = big;
      el.titleSub.textContent = sub || "";
      el.title.parentElement.style.opacity = 1;
      setTimeout(function () { el.title.parentElement.style.opacity = 0; }, 3400);
    },
  };

  var story = new Story(scene, built, world, player, creature, audio, ui);

  function setState(s) {
    state = s;
    el.menu.style.display = s === STATE.MENU ? "flex" : "none";
    el.pause.style.display = s === STATE.PAUSED ? "flex" : "none";
    el.dead.style.display = s === STATE.DEAD ? "flex" : "none";
    el.win.style.display = s === STATE.WIN ? "flex" : "none";
    document.getElementById("hud").style.display =
      (s === STATE.PLAYING || s === STATE.PAUSED) ? "block" : "none";
  }

  function startGame() {
    location.reload();               // sauberer Neustart der ganzen Nacht
  }

  // Maus-Sperre robust anfordern (funktioniert je nach Browser bei file://
  // nicht immer sofort — daher Best-Effort, ohne dass das Spiel haengt).
  var lastLockRequest = 0;
  function requestLock() {
    lastLockRequest = performance.now();
    if (DEBUG || !document.body.requestPointerLock) return;
    try {
      var p = document.body.requestPointerLock();
      if (p && p.catch) p.catch(function () { });
    } catch (e) { /* Browser verweigert Pointer Lock bei file:// – egal */ }
  }

  function firstStart() {
    setState(STATE.PLAYING);
    requestLock();
    audio.startAmbience();
    audio.setRadio("music");
    ui.title("NACHT 1", "23:47 — Nachtschicht an der Tankstelle");
    ui.dialog("Bedien die Kundschaft. Der Kaffee ist frisch, die Nacht ist lang.", 5);
  }

  // --- Eingabe -------------------------------------------------------------------
  var input = { keys: {}, mouseDX: 0, mouseDY: 0 };
  document.addEventListener("keydown", function (e) {
    input.keys[e.code] = true;
    if (state !== STATE.PLAYING) {
      if (state === STATE.PAUSED) {
        // Aus der Pause jederzeit per Taste zurueck ins Spiel
        setState(STATE.PLAYING);
        requestLock();
      } else if (e.code === "Enter") {
        if (state === STATE.MENU) firstStart();
        else if (state === STATE.DEAD || state === STATE.WIN) startGame();
      }
      return;
    }
    if (e.code === "KeyF" && mode === "walk") {
      if (player.battery > 0) { player.flashOn = !player.flashOn; audio.click ? audio.click() : 0; }
    }
    if (e.code === "KeyE") interact();
    if (e.code === "KeyQ" && player.bars > 0 && mode === "walk") {
      player.bars--;
      player.stamina = CFG.STAMINA_MAX;
      player.sprintBoost = 12;
      audio.eat();
      ui.dialog("Energieriegel gegessen — Ausdauer voll!", 2.5);
    }
    if (e.code === "KeyL" && mode === "walk") tryLock();
  });
  document.addEventListener("keyup", function (e) { input.keys[e.code] = false; });
  document.addEventListener("mousemove", function (e) {
    if (document.pointerLockElement && state === STATE.PLAYING) {
      input.mouseDX += e.movementX;
      input.mouseDY += e.movementY;
    }
  });
  document.body.addEventListener("mousedown", function (e) {
    if (state === STATE.MENU) { firstStart(); return; }
    if (state === STATE.DEAD || state === STATE.WIN) { startGame(); return; }
    if (state === STATE.PAUSED) {
      setState(STATE.PLAYING);           // sofort weiterspielen, nicht auf Lock warten
      requestLock();
      return;
    }
    if (state === STATE.PLAYING && !document.pointerLockElement && !DEBUG) {
      requestLock();
      return;
    }
    if (state === STATE.PLAYING && e.button === 0) shoot();
  });
  document.addEventListener("pointerlockchange", function () {
    if (document.pointerLockElement) {
      if (state === STATE.PAUSED) setState(STATE.PLAYING);
    } else if (state === STATE.PLAYING && !DEBUG) {
      // Nur pausieren, wenn der Lock nicht direkt wieder abprallt (file://-Browser)
      if (performance.now() - lastLockRequest > 500) setState(STATE.PAUSED);
    }
  });

  // --- Pistole -----------------------------------------------------------------------
  function shoot() {
    if (!player.hasPistol || player.ammo <= 0 || player.hidden || mode !== "walk") return;
    player.ammo--;
    story.stats.shots++;
    audio.gunshot();
    el.muzzle.style.opacity = 0.85;
    setTimeout(function () { el.muzzle.style.opacity = 0; }, 60);
    // Treffer? Blickrichtung + Sichtlinie + Reichweite
    var dx = creature.x - player.x, dz = creature.z - player.z;
    var dist = Math.hypot(dx, dz);
    var ang = Math.atan2(dz, dx);
    var adiff = Math.abs(((player.angle - ang) % (Math.PI * 2) + Math.PI * 3) % (Math.PI * 2) - Math.PI);
    var hit = creature.state !== C_OFF && dist < CFG.PISTOL_RANGE && adiff < 0.14 &&
      lineOfSight(player.x, player.z, creature.x, creature.z, world);
    if (hit) {
      creature.stun(audio);
      ui.dialog("Getroffen! Es geht zu Boden — LAUF!", 3);
    } else if (creature.state !== C_OFF) {
      // Der Knall verraet dich
      creature.lastKnown = [player.cellX(), player.cellZ()];
      creature.state = C_HUNT;
    }
  }

  // --- Abschliessen ---------------------------------------------------------------------
  function tryLock() {
    var door = CFG.POS.door;
    var d = doorIndex[door[0] + "," + door[1]];
    if (!d) return;
    if (Math.hypot(player.x - (door[0] + 0.5) * CFG.CELL, player.z - (door[1] + 0.5) * CFG.CELL) > 3) return;
    if (d.open > 0.1) { d.target = 0; }
    d.locked = !d.locked;
    d.bangs = 0;
    audio.pickup();
    ui.dialog(d.locked ? "Eingangstuer abgeschlossen." : "Eingangstuer aufgeschlossen.", 2);
  }

  // --- Interaktion [E] ---------------------------------------------------------------------
  function nearCell(cell, r) {
    return Math.hypot(player.x - (cell[0] + 0.5) * CFG.CELL, player.z - (cell[1] + 0.5) * CFG.CELL) < (r || 2.2);
  }
  function facingDoor() {
    for (var d = 0.7; d <= 2.4; d += 0.55) {
      var cx = Math.floor((player.x + Math.cos(player.angle) * d) / CFG.CELL);
      var cz = Math.floor((player.z + Math.sin(player.angle) * d) / CFG.CELL);
      var door = doorIndex[cx + "," + cz];
      if (door) return door;
    }
    return null;
  }
  function nearestItem() {
    var best = null, bd = 2.0;
    built.items.forEach(function (it) {
      if (it.taken) return;
      var d = Math.hypot(player.x - it.mesh.position.x, player.z - it.mesh.position.z);
      if (d < bd) { bd = d; best = it; }
    });
    return best;
  }
  function nearHideSpot() {
    for (var i = 0; i < CFG.HIDE_SPOTS.length; i++)
      if (nearCell(CFG.HIDE_SPOTS[i].cell, 1.8)) return CFG.HIDE_SPOTS[i];
    return null;
  }

  var prevPos = null;
  function interact() {
    if (mode !== "walk") return;
    // Versteck verlassen
    if (player.hidden) {
      player.hidden = false;
      if (prevPos) { player.x = prevPos[0]; player.z = prevPos[1]; }
      return;
    }
    // Kunde bedienen
    var served = story.tryServe();
    if (served) { ui.dialog(served, 3); return; }
    // Zapfvorgang starten
    if (story.act >= 3 && player.carrying === "fuel" && !player.fuelFilled && nearCell(CFG.POS.pumpFill, 2.6)) {
      story.fillingActive = true;
      story.filling = 0;
      audio.startPump();
      ui.dialog("Tanke den Kanister... bleib in der Naehe! (Die Pumpe ist laut.)", 3);
      return;
    }
    // Auto: Teil einbauen / einsteigen
    if (nearCell(CFG.POS.carGarage, 3.2)) {
      if (player.carrying) {
        if (player.carrying === "fuel" && !player.fuelFilled) {
          ui.dialog("Der Kanister ist leer. Fuell ihn an der Zapfsaeule!", 3);
          return;
        }
        var id = player.carrying;
        player.carrying = null;
        story.addPart(id);
        audio.pickup();
        ui.dialog("Eingebaut! (" + story.partsCount + "/4 Teile)", 2.5);
        return;
      }
      if (story.installedAll() && story.engineState === 0) {
        // Einsteigen -> Startsequenz
        mode = "engine";
        story.act = 4;
        story.engineState = 1;
        story.engineT = 0;
        built.rollDoor.target = 1;
        ui.title("AKT 4", "Die Flucht");
        ui.dialog("Komm schon... SPRING AN!", 3);
        audio.engineCrank(false);
        return;
      }
      if (!story.installedAll() && story.act >= 3) {
        ui.dialog("Dem Auto fehlen noch Teile. Sieh auf die Karte (Suchgebiete).", 3);
        return;
      }
    }
    // Items
    var it = nearestItem();
    if (it) {
      if (["battery", "plugs", "wheel", "fuel"].indexOf(it.kind) >= 0) {
        if (story.act < 3) { ui.dialog("Das brauche ich (noch) nicht.", 2); return; }
        if (player.carrying) { ui.dialog("Ich kann nur ein Teil tragen.", 2); return; }
        player.carrying = it.kind;
        it.taken = true; it.mesh.visible = false;
        audio.pickup();
        ui.dialog(it.label + " aufgenommen — zum Auto in der Garage!", 3);
      } else if (it.kind === "carkey") {
        it.taken = true; it.mesh.visible = false;
        player.hasCarKey = true;
        audio.pickup();
        ui.dialog("Der Autoschluessel... er hat es nicht mehr geschafft.", 3.5);
        story.stats.parts++;
        creature.aggression = Math.min(1, creature.aggression + 0.22);
      } else if (it.kind === "pistol") {
        it.taken = true; it.mesh.visible = false;
        player.hasPistol = true;
        player.ammo += CFG.PISTOL_AMMO;
        audio.pickup();
        ui.dialog("Revolver gefunden (" + player.ammo + " Schuss). Klick = schiessen. Betaeubt es nur!", 4);
      } else if (it.kind === "ammo") {
        it.taken = true; it.mesh.visible = false;
        player.ammo += 6;
        audio.pickup();
        ui.dialog("Munition +6.", 2);
      } else if (it.kind === "bar") {
        it.taken = true; it.mesh.visible = false;
        player.bars++;
        audio.pickup();
        ui.dialog("Energieriegel eingesteckt ([Q] essen).", 2.5);
      } else if (it.kind === "flashbattery") {
        it.taken = true; it.mesh.visible = false;
        player.battery = Math.min(CFG.BATTERY_MAX, player.battery + 45);
        audio.pickup();
        ui.dialog("Taschenlampen-Batterie eingesetzt.", 2);
      } else if (it.kind === "keyGarage") {
        it.taken = true; it.mesh.visible = false;
        player.hasGarageKey = true;
        if (garageInnerDoor) garageInnerDoor.locked = false;
        audio.pickup();
        ui.dialog("Garagenschluessel! Die Tuer zur Garage ist jetzt offen.", 3);
      }
      return;
    }
    // Verstecken
    var hs = nearHideSpot();
    if (hs) {
      prevPos = [player.x, player.z];
      player.hidden = true;
      player.hideSpot = hs;
      player.x = (hs.cell[0] + 0.5) * CFG.CELL;
      player.z = (hs.cell[1] + 0.5) * CFG.CELL;
      ui.dialog(hs.name + " — halt still...", 2.5);
      return;
    }
    // Tueren
    var door = facingDoor();
    if (door) {
      if (door.locked) {
        ui.dialog(door === garageInnerDoor ? "Abgeschlossen. Der Garagenschluessel muss im Lager sein." : "Abgeschlossen.", 2.5);
        return;
      }
      door.target = door.target === 1 ? 0 : 1;
      audio.doorCreak();
      if (door.cx === CFG.POS.door[0] && door.cz === CFG.POS.door[1]) audio.bell();
    }
  }

  // --- Jumpscare -----------------------------------------------------------------------------
  var jumpscareT = 0;
  function setScareRender(on) {
    creature.model.group.traverse(function (o) {
      if (o.isMesh) {
        o.material.depthTest = !on;
        o.material.depthWrite = !on;
        o.renderOrder = on ? 1000 : 0;
      }
    });
  }
  function triggerJumpscare() {
    if (state !== STATE.PLAYING) return;
    setState(STATE.JUMPSCARE);
    jumpscareT = 0;
    setScareRender(true);
    creature.model.group.visible = true;
    // Pose zuruecksetzen (falls die Kreatur gerade betaeubt/gebeugt war)
    creature.model.pelvis.position.y = 1.35;
    creature.model.pelvis.rotation.x = 0.15;
    creature.model.neck.rotation.set(0, 0, 0);
    creature.model.legs.forEach(function (l) { l.rotation.x = 0; l.lower.rotation.x = 0; });
    audio.setChase(0);
    audio.stopEngine();
    audio.stopPump();
    audio.setRadio("off");
    audio.setHeartbeat(0);
    audio.scream();
    if (document.exitPointerLock) document.exitPointerLock();
  }
  function updateJumpscare(dt) {
    jumpscareT += dt;
    var t = Math.min(1, jumpscareT / CFG.JUMPSCARE_DURATION);
    var px = mode === "drive" && carCtl ? carCtl.x : player.x;
    var pz = mode === "drive" && carCtl ? carCtl.z : player.z;
    var pa = mode === "drive" && carCtl ? -carCtl.angle : player.angle;
    var eye = mode === "drive" ? 1.35 : player.eyeY();
    var fx = Math.cos(pa), fz = Math.sin(pa);
    var dist = 1.35 - t * 0.8;
    var g = creature.model.group;
    g.position.set(px + fx * dist, eye - 2.2, pz + fz * dist);
    g.rotation.y = Math.atan2(px - g.position.x, pz - g.position.z);
    g.scale.setScalar(1.0 + t * 0.3);
    creature.model.arms[0].rotation.x = -2.5;
    creature.model.arms[1].rotation.x = -2.5;
    creature.model.neck.rotation.z = Math.sin(jumpscareT * 55) * 0.25;
    camera.position.set(px + (Math.random() - 0.5) * 0.16, eye + (Math.random() - 0.5) * 0.16, pz + (Math.random() - 0.5) * 0.16);
    camera.rotation.set(0.1 + (Math.random() - 0.5) * 0.12, -pa - Math.PI / 2 + (Math.random() - 0.5) * 0.12, (Math.random() - 0.5) * 0.16, "YXZ");
    el.redflash.style.opacity = (Math.floor(jumpscareT * 18) % 2 === 0 ? 0.35 : 0.15) + t * 0.15;
    flashlight.intensity = 2.6;
    if (jumpscareT >= CFG.JUMPSCARE_DURATION) {
      el.redflash.style.opacity = 0;
      creature.model.group.visible = false;
      g.scale.setScalar(1);
      setScareRender(false);
      setState(STATE.DEAD);
    }
  }

  // --- Minimap (statischer Hintergrund + dynamische Ebene) --------------------------------------
  var mmBack = document.createElement("canvas");
  mmBack.width = el.minimap.width; mmBack.height = el.minimap.height;
  (function () {
    var b = mmBack.getContext("2d");
    var sx = mmBack.width / CFG.GRID_W, sz = mmBack.height / CFG.GRID_H;
    b.fillStyle = "rgba(5,7,11,0.85)";
    b.fillRect(0, 0, mmBack.width, mmBack.height);
    for (var cz = 0; cz < CFG.GRID_H; cz++) for (var cx = 0; cx < CFG.GRID_W; cx++) {
      var s = symAt(cx, cz);
      var col = null;
      if (s === "M") col = "rgba(70,72,80,0.9)";
      else if (s === "H" || s === "W" || s === "B" || s === "w") col = "rgba(165,165,175,0.9)";
      else if (s === "R" || s === "U") col = "rgba(52,54,60,0.9)";
      else if (s === "r" || s === "g") col = "rgba(40,42,48,0.9)";
      else if (s === "T") col = "rgba(30,54,30,0.75)";
      else if (s === "p") col = "rgba(56,46,30,0.8)";
      else if (s === "D" || s === "d") col = "rgba(150,105,55,0.95)";
      if (col) { b.fillStyle = col; b.fillRect(cx * sx, cz * sz, Math.max(1, sx), Math.max(1, sz)); }
    }
  })();

  function drawMinimap(timeNow) {
    var W = el.minimap.width, H = el.minimap.height;
    var sx = W / CFG.GRID_W, sz = H / CFG.GRID_H;
    mctx.clearRect(0, 0, W, H);
    mctx.drawImage(mmBack, 0, 0);
    var pulse = 0.5 + 0.5 * Math.sin(timeNow * 4.5);
    // Suchgebiete fuer fehlende Teile (Akt 3)
    if (story.act === 3) {
      CFG.PARTS.forEach(function (p) {
        var got = p.id === "carkey" ? player.hasCarKey : story.partsInstalled[p.id];
        if (got || (player.carrying === p.id)) return;
        var cx = p.cell[0] * sx, cz = p.cell[1] * sz;
        mctx.beginPath();
        mctx.arc(cx, cz, 16 + pulse * 3, 0, 7);
        mctx.strokeStyle = "rgba(230,190,80,0.65)";
        mctx.lineWidth = 1.5;
        mctx.stroke();
      });
    }
    // AUSGANG: Tunnel pulsiert gruen
    var tx = 7 * sx, tz = (CFG.ROAD_Z0 + 2) * sz;
    mctx.beginPath();
    mctx.arc(tx, tz, 4 + pulse * 4, 0, 7);
    mctx.fillStyle = "rgba(80,230,120," + (0.3 + pulse * 0.45) + ")";
    mctx.fill();
    mctx.fillStyle = "rgba(150,255,180," + (0.7 + pulse * 0.3) + ")";
    mctx.font = "bold 9px monospace";
    mctx.textAlign = "left";
    mctx.fillText("TUNNEL", tx + 9, tz + 3);
    // Spieler / Auto
    var px = (mode === "drive" && carCtl ? carCtl.x : player.x) / CFG.CELL * sx;
    var pz = (mode === "drive" && carCtl ? carCtl.z : player.z) / CFG.CELL * sz;
    var a = mode === "drive" && carCtl ? -carCtl.angle : player.angle;
    mctx.beginPath();
    mctx.moveTo(px + Math.cos(a) * 7, pz + Math.sin(a) * 7);
    mctx.lineTo(px + Math.cos(a + 2.5) * 4.5, pz + Math.sin(a + 2.5) * 4.5);
    mctx.lineTo(px + Math.cos(a - 2.5) * 4.5, pz + Math.sin(a - 2.5) * 4.5);
    mctx.closePath();
    mctx.fillStyle = "#f2f2f6";
    mctx.fill();
    el.minimapLabel.textContent = story.objectiveText();
  }

  // --- Filmkorn ------------------------------------------------------------------------------------
  var grain = document.getElementById("grain");
  var gctx = grain.getContext("2d");
  var grainTimer = 0;
  function updateGrain(dt) {
    grainTimer -= dt;
    if (grainTimer > 0) return;
    grainTimer = 0.09;
    var img = gctx.createImageData(128, 128);
    for (var i = 0; i < img.data.length; i += 4) {
      img.data[i] = img.data[i + 1] = img.data[i + 2] = Math.random() * 255;
      img.data[i + 3] = 20;
    }
    gctx.putImageData(img, 0, 0);
  }

  // --- Outro ------------------------------------------------------------------------------------------
  var outro = { t: 0, car: null, eyes: null };
  function startOutro() {
    setState(STATE.OUTRO);
    outro.t = 0;
    el.fade.style.opacity = 1;
    audio.setChase(0);
    audio.setHeartbeat(0);
    setTimeout(function () {
      // Auto auf der "anderen Seite" des Tunnels weiterfahren lassen
      var g = built.playerCar.group;
      g.position.set(2, 0, 16);
      g.rotation.y = Math.PI;                        // nach Westen
      built.playerCar.extra.headlights.forEach(function (s) { s.intensity = 1.4; });
      camera.position.set(-24, 2.2, 26);
      camera.lookAt(-2, 1.2, 16);
      el.fade.style.opacity = 0;
      el.win.style.display = "flex";
      el.winsub.textContent = "";
      outro.phase = 1;
    }, 1400);
  }
  function updateOutro(dt) {
    outro.t += dt;
    if (outro.phase === 1) {
      var g = built.playerCar.group;
      g.position.x -= 9.5 * dt;
      built.playerCar.wheels.forEach(function (w) { w.rotation.z += 9.5 * dt * 2.6; });
      audio.setEngineSpeed(0.55);
      // Augen-Teaser am Tunnelportal
      if (outro.t > 4.2 && !outro.eyes) {
        outro.eyes = new THREE.Group();
        [[-0.09], [0.09]].forEach(function (o) {
          var e = new THREE.Mesh(new THREE.SphereGeometry(0.05, 6, 5),
            new THREE.MeshBasicMaterial({ color: 0xfff2cc, fog: false }));
          e.position.set(3.5 + o[0] * 4, 1.9, 23.5 + o[0]);
          outro.eyes.add(e);
        });
        scene.add(outro.eyes);
      }
      if (outro.eyes && outro.t > 6.4) outro.eyes.visible = Math.floor(outro.t * 9) % 3 !== 0;
      if (outro.t > 8) {
        audio.stopEngine();
        audio.winChime();
        el.stats.innerHTML =
          "Zeit: " + Math.floor(story.stats.time / 60) + ":" + ("0" + Math.floor(story.stats.time % 60)).slice(-2) +
          " &nbsp;|&nbsp; Kunden bedient: " + story.stats.customers +
          " &nbsp;|&nbsp; Teile gefunden: " + story.stats.parts +
          " &nbsp;|&nbsp; Schuesse: " + story.stats.shots;
        el.winsub.textContent = "NACHT 2 — bald.";
        outro.phase = 2;
        setState(STATE.WIN);
      }
    }
  }

  // --- Hauptschleife --------------------------------------------------------------------------------------
  var last = performance.now(), timeNow = 0, timeScale = 1;

  function frame(now) {
    requestAnimationFrame(frame);
    var dt = Math.min(0.05, (now - last) / 1000) * timeScale;
    last = now;
    timeNow += dt;

    if (dialogT > 0) {
      dialogT -= dt;
      if (dialogT <= 0) el.dialog.style.opacity = 0;
    }

    if (state === STATE.PLAYING) {
      story.update(dt);

      if (mode === "walk") {
        player.update(dt, input, world, audio);
      } else if (mode === "engine") {
        if (story.engineState === 2) {
          mode = "drive";
          carCtl = new CarController(built.playerCar);
          carCtl.angle = Math.PI / 2;
          built.playerCar.extra.headlights.forEach(function (s) { s.intensity = 1.5; });
          ui.dialog("JETZT! FAHR!", 2.5);
        }
      } else if (mode === "drive" && carCtl) {
        carCtl.update(dt, input, world, audio);
        player.x = carCtl.x; player.z = carCtl.z;      // fuer Karte/Audio
        if (carCtl.crashed) triggerJumpscare();
        // Schockmoment: sie rennt einmal quer durch das Scheinwerferlicht
        if (!story.driveScareDone && carCtl.x < 118 && carCtl.z < 24) {
          story.driveScareDone = true;
          creature.model.group.visible = true;
          creature.x = carCtl.x - 20;
          creature.z = 22;
          creature.state = C_HUNT;
          creature.path = [[Math.floor((carCtl.x - 22) / CFG.CELL), 5]];
          audio.setChase(1);
          setTimeout(function () { audio.setChase(0.3); }, 3000);
        }
        if (carCtl.x < CFG.WIN_X_CELL * CFG.CELL) startOutro();
      }

      var lookedAt = false;
      if (mode === "walk") {
        var cdx = creature.x - player.x, cdz = creature.z - player.z;
        var cdist = Math.hypot(cdx, cdz);
        var angTo = Math.atan2(cdz, cdx);
        var adiff = Math.abs(((player.angle - angTo) % (Math.PI * 2) + Math.PI * 3) % (Math.PI * 2) - Math.PI);
        lookedAt = adiff < 0.5 && cdist < CFG.CREATURE_SIGHT && player.flashOn &&
          lineOfSight(player.x, player.z, creature.x, creature.z, world);
      }
      if (mode !== "drive") {
        creature.update(dt, player, world, audio, lookedAt);
        if (creature.caught) triggerJumpscare();
      } else if (creature.model.group.visible && creature.path.length) {
        // Waehrend der Fahrt: rein inszeniert — sie rennt ueber die Strasse
        var ct = creature.path[0];
        var ctx2 = (ct[0] + 0.5) * CFG.CELL, ctz2 = (ct[1] + 0.5) * CFG.CELL;
        var cdd = Math.hypot(ctx2 - creature.x, ctz2 - creature.z);
        if (cdd > 0.3) {
          creature.x += (ctx2 - creature.x) / cdd * CFG.CREATURE_SPEED_HUNT * 1.3 * dt;
          creature.z += (ctz2 - creature.z) / cdd * CFG.CREATURE_SPEED_HUNT * 1.3 * dt;
          creature.anim += dt;
          creature.model.group.position.set(creature.x, 0, creature.z);
          creature.model.group.rotation.y = Math.atan2(ctx2 - creature.x, ctz2 - creature.z);
          creature._pose(dt, 12, false);
        } else {
          creature.model.group.visible = false;
          creature.path = [];
        }
      }

      // Musik-Dramaturgie + Herzschlag
      var cd2 = Math.hypot(creature.x - player.x, creature.z - player.z);
      var chase = 0;
      if (creature.state === C_HUNT) chase = Math.min(1, 1.3 - cd2 / 30);
      else if (creature.state === C_SEARCH) chase = 0.35;
      else if (creature.state === C_STALK && cd2 < 14) chase = 0.22;
      audio.setChase(Math.max(0, chase));
      audio.setHeartbeat(creature.state === C_OFF ? 0 : Math.max(0, 1 - cd2 / 16));

      // Kamera
      if (mode === "drive" && carCtl) {
        var fx = Math.cos(carCtl.angle), fz = -Math.sin(carCtl.angle);
        camera.position.set(carCtl.x - fx * 0.3, 1.35, carCtl.z - fz * 0.3);
        camera.rotation.set(player.pitch * 0.3, carCtl.angle - Math.PI / 2 + input.mouseDX * 0, 0, "YXZ");
        var lookX = carCtl.x + fx * 10, lookZ = carCtl.z + fz * 10;
        camera.lookAt(lookX, 1.1, lookZ);
      } else if (mode === "engine") {
        var cg = built.playerCar.group;
        camera.position.set(cg.position.x - 0.4, 1.35, cg.position.z);
        camera.lookAt(cg.position.x, 1.2, cg.position.z - 12);
        camera.position.x += (Math.random() - 0.5) * 0.01;
      } else {
        camera.position.set(player.x, player.eyeY(), player.z);
        camera.rotation.set(player.pitch, -player.angle - Math.PI / 2, 0, "YXZ");
      }

      // HUD
      el.objective.textContent = story.objectiveText();
      el.batteryFill.style.width = player.battery + "%";
      el.staminaFill.style.width = player.stamina + "%";
      var inv = [];
      if (player.hasPistol) inv.push("Revolver: " + player.ammo);
      if (player.bars > 0) inv.push("Riegel [Q]: " + player.bars);
      if (player.carrying) inv.push("Traegt: " + player.carrying);
      el.inv.textContent = inv.join("   |   ");
      el.prompt.textContent = promptText();
      if (story.fillingActive) el.prompt.textContent = "Tanke... " + Math.floor(story.filling * 100) + "%  (bleib hier!)";
      drawMinimap(timeNow);
    } else if (state === STATE.JUMPSCARE) {
      updateJumpscare(dt);
    } else if (state === STATE.OUTRO || state === STATE.WIN) {
      updateOutro(dt);
    }

    // Tueren / Rolltor animieren
    built.doors.forEach(function (d) {
      var sp = dt * 1.9;
      d.open += Math.max(-sp, Math.min(sp, d.target - d.open));
      d.group.rotation.y = d.baseRot + d.open * 1.5;
    });
    var rd = built.rollDoor;
    rd.open += Math.max(-dt * 0.5, Math.min(dt * 0.5, (rd.target || 0) - rd.open));
    rd.panel.position.y = rd.baseY + rd.open * (CFG.WALL_H - 0.5);
    world.rollDoorOpen = rd.open > 0.6;

    // Lichter flackern
    built.lamps.forEach(function (l) {
      l.light.intensity = l.base * (0.85 + 0.15 * Math.sin(timeNow * 8 + l.seed) * Math.sin(timeNow * 21 + l.seed));
    });
    built.canopyLights.forEach(function (l) {
      var flick = story.act >= 3 ? (Math.random() < 0.03 ? 0.4 : 1) : 1;
      l.light.intensity = l.base * flick * (0.9 + 0.1 * Math.sin(timeNow * 11 + l.seed));
    });
    if (built.sign) built.sign.glow.intensity = 0.7 + 0.25 * Math.sin(timeNow * 2.2) + (Math.random() < 0.02 ? -0.5 : 0);

    // Taschenlampe
    if (state !== STATE.JUMPSCARE) {
      flashlight.intensity = (mode === "walk" && player.flashOn && player.battery > 0 && !player.hidden)
        ? 1.7 * (player.battery < 15 ? 0.55 + 0.45 * Math.abs(Math.sin(timeNow * 12)) : 1) : 0;
    }
    flashlight.position.copy(camera.position);
    var dir = new THREE.Vector3();
    camera.getWorldDirection(dir);
    flashTarget.position.copy(camera.position).addScaledVector(dir, 8);

    // Items drehen
    built.items.forEach(function (it) {
      if (!it.taken) {
        it.mesh.rotation.y += dt * 1.4;
      }
    });

    audio.update(dt);
    updateGrain(dt);
    renderer.render(scene, camera);
  }

  function promptText() {
    if (player.hidden) return "[E] Versteck verlassen";
    if (mode !== "walk") return "";
    var it = nearestItem();
    if (story.customer && story.customer.state === "ordering") {
      var o = story.customer.order;
      if (!story.prepared && o.id !== "pay" && nearCell(CFG.POS[o.station])) return "[E] " + o.label + " zubereiten";
      if (o.id === "pay" && nearCell(CFG.POS.register)) return "[E] Kassieren";
      if (story.prepared && Math.hypot(player.x - story.customer.x, player.z - story.customer.z) < 2.4) return "[E] Uebergeben";
    }
    if (story.act >= 3 && player.carrying === "fuel" && !player.fuelFilled && nearCell(CFG.POS.pumpFill, 2.6)) return "[E] Kanister befuellen";
    if (nearCell(CFG.POS.carGarage, 3.2)) {
      if (player.carrying) return "[E] Teil einbauen";
      if (story.installedAll() && story.engineState === 0) return "[E] Einsteigen und starten";
    }
    if (it) return "[E] " + it.label + " aufnehmen";
    var hs = nearHideSpot();
    if (hs) return "[E] Verstecken: " + hs.name;
    var door = facingDoor();
    if (door) {
      if (door.locked) return "Abgeschlossen";
      var isEntry = door.cx === CFG.POS.door[0] && door.cz === CFG.POS.door[1];
      return "[E] Tuer " + (door.target === 1 ? "schliessen" : "oeffnen") + (isEntry && story.act >= 2 ? "   [L] Abschliessen" : "");
    }
    return "";
  }

  setState(STATE.MENU);
  requestAnimationFrame(frame);

  // --- Debug-API ------------------------------------------------------------------------------------------------
  if (DEBUG) {
    window.NOC = {
      start: firstStart,
      state: function () { return ["MENU", "PLAYING", "PAUSED", "JUMPSCARE", "DEAD", "OUTRO", "WIN"][state]; },
      mode: function () { return mode; },
      act: function () { return story.act; },
      story: function () { return story; },
      player: function () { return player; },
      creature: function () { return creature; },
      car: function () { return carCtl; },
      input: input,
      time: function () { return timeNow; },
      teleport: function (cx, cz) {
        player.x = (cx + 0.5) * CFG.CELL;
        player.z = (cz + 0.5) * CFG.CELL;
      },
      setAngle: function (a, p) { player.angle = a; player.pitch = p || 0; },
      interact: interact,
      shoot: shoot,
      serveInstant: function () {
        if (story.customer) { story.customer.served = true; story.customersServed++; }
      },
      skipToAct3: function () {
        story.customersServed = CFG.CUSTOMERS_NEEDED;
        if (story.customer) { story.customer.dispose(scene); story.customer = null; }
        if (story.police) {
          scene.remove(story.police.car.group, story.police.officer.group);
          story.police = null;
        }
        story.act = 3;
        story.audio.setRadio("static");
        story.blackout();
        creature.activate();
        story.traffic.enabled = false;
      },
      giveAll: function () {
        player.fuelFilled = true;
        ["battery", "plugs", "wheel", "fuel"].forEach(function (id) {
          if (!story.partsInstalled[id]) story.addPart(id);
        });
        player.carrying = null;
        player.hasCarKey = true;
        player.hasGarageKey = true;
        if (garageInnerDoor) garageInnerDoor.locked = false;
      },
      givePistol: function () { player.hasPistol = true; player.ammo = 6; },
      forceJumpscare: triggerJumpscare,
      world: world,
      rollDoor: function () { return built.rollDoor; },
      setTimeScale: function (s) { timeScale = Math.max(0.1, Math.min(8, s)); },
    };
  }
})();
