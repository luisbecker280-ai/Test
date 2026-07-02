// ============================================================================
// NOCTURNE 3D — Hauptschleife, Zustaende, HUD, Minimap, Jumpscare
// ============================================================================
"use strict";

(function () {
  var STATE = { MENU: 0, PLAYING: 1, PAUSED: 2, JUMPSCARE: 3, DEAD: 4, WIN: 5 };
  var state = STATE.MENU;
  var DEBUG = /debug/.test(location.search);

  // --- Renderer / Szene -----------------------------------------------------
  var renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputEncoding = THREE.sRGBEncoding;
  document.getElementById("game").appendChild(renderer.domElement);

  var scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x05060a, 0.052);

  var camera = new THREE.PerspectiveCamera(72, window.innerWidth / window.innerHeight, 0.08, 220);

  window.addEventListener("resize", function () {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  // Nachtlicht: Mond + kalte Grundhelligkeit
  scene.add(new THREE.HemisphereLight(0x2a3247, 0x0b0b10, 0.42));
  var moon = new THREE.DirectionalLight(0x93a1c8, 0.14);
  moon.position.set(40, 60, -30);
  scene.add(moon);

  // Taschenlampe: Spot mit echten Schatten, haengt an der Kamera
  var flashlight = new THREE.SpotLight(0xffe2b0, 1.7, 30, 0.46, 0.45, 1.6);
  flashlight.castShadow = true;
  flashlight.shadow.mapSize.set(1024, 1024);
  flashlight.shadow.camera.near = 0.2;
  flashlight.shadow.camera.far = 30;
  var flashTarget = new THREE.Object3D();
  scene.add(flashlight, flashTarget);
  flashlight.target = flashTarget;

  // --- Welt -------------------------------------------------------------------
  var built = GEO.buildWorld(scene);
  var doorIndex = {};
  built.doors.forEach(function (d) { doorIndex[d.floor + ":" + d.cx + "," + d.cz] = d; });

  var audio = new AudioEngine();

  var world = {
    gateUnlocked: false,
    doorOpen: function (f, cx, cz) {
      var d = doorIndex[f + ":" + cx + "," + cz];
      return d ? d.open > 0.65 : false;
    },
    openDoor: function (f, cx, cz, byCreature) {
      var d = doorIndex[f + ":" + cx + "," + cz];
      if (d && d.target !== 1) { d.target = 1; audio.doorCreak(); }
    },
  };

  var player = new Player();
  var creature = new Creature(scene);

  // --- Eingabe -----------------------------------------------------------------
  var input = { keys: {}, mouseDX: 0, mouseDY: 0 };
  document.addEventListener("keydown", function (e) {
    input.keys[e.code] = true;
    if (e.code === "KeyF" && state === STATE.PLAYING) toggleFlash();
    if (e.code === "KeyE" && state === STATE.PLAYING) interact();
    if (e.code === "Enter" && (state === STATE.MENU || state === STATE.DEAD || state === STATE.WIN)) startGame();
  });
  document.addEventListener("keyup", function (e) { input.keys[e.code] = false; });
  document.addEventListener("mousemove", function (e) {
    if (document.pointerLockElement && state === STATE.PLAYING) {
      input.mouseDX += e.movementX;
      input.mouseDY += e.movementY;
    }
  });
  document.body.addEventListener("click", function () {
    if (state === STATE.MENU || state === STATE.DEAD || state === STATE.WIN) startGame();
    else if (state === STATE.PAUSED || (state === STATE.PLAYING && !document.pointerLockElement)) lockPointer();
  });
  document.addEventListener("pointerlockchange", function () {
    if (!document.pointerLockElement && state === STATE.PLAYING && !DEBUG) setState(STATE.PAUSED);
    else if (document.pointerLockElement && state === STATE.PAUSED) setState(STATE.PLAYING);
  });

  function lockPointer() {
    if (!DEBUG && document.body.requestPointerLock) document.body.requestPointerLock();
  }

  function toggleFlash() {
    if (player.battery > 0) {
      player.flashOn = !player.flashOn;
      audio.click();
    }
  }

  // --- HUD-Referenzen ------------------------------------------------------------
  var el = {};
  ["menu", "pause", "dead", "win", "redflash", "prompt", "keys", "floor",
    "batteryFill", "sanityFill", "staminaFill", "minimap", "minimapFloor"].forEach(function (id) {
      el[id] = document.getElementById(id);
    });
  var minimapCtx = el.minimap.getContext("2d");

  function setState(s) {
    state = s;
    el.menu.style.display = s === STATE.MENU ? "flex" : "none";
    el.pause.style.display = s === STATE.PAUSED ? "flex" : "none";
    el.dead.style.display = s === STATE.DEAD ? "flex" : "none";
    el.win.style.display = s === STATE.WIN ? "flex" : "none";
    document.getElementById("hud").style.display =
      (s === STATE.PLAYING || s === STATE.PAUSED) ? "block" : "none";
  }

  function resetGame() {
    player = new Player();
    creature.reset();
    built.items.forEach(function (it) { it.taken = false; it.mesh.visible = true; });
    built.doors.forEach(function (d) { d.open = 0; d.target = 0; });
    built.gate.open = 0;
    built.gate.panels.forEach(function (p) { p.group.rotation.y = 0; });
    world.gateUnlocked = false;
    jumpscareT = 0;
    setScareRender(false);
    creature.model.group.scale.setScalar(1);
    el.redflash.style.opacity = 0;
  }

  function startGame() {
    resetGame();
    setState(STATE.PLAYING);
    lockPointer();
    audio.startAmbient();
  }

  // --- Interaktion (E): Tueren und Tor ---------------------------------------------
  function facingDoor() {
    for (var d = 0.7; d <= 2.1; d += 0.7) {
      var cx = Math.floor((player.x + Math.cos(player.angle) * d) / CFG.CELL);
      var cz = Math.floor((player.z + Math.sin(player.angle) * d) / CFG.CELL);
      var door = doorIndex[player.floor + ":" + cx + "," + cz];
      if (door) return door;
    }
    return null;
  }
  function nearGate() {
    if (player.floor !== 0) return false;
    for (var i = 0; i < CFG.GATE_CELLS.length; i++) {
      var g = CFG.GATE_CELLS[i];
      if (Math.hypot((g[0] + 0.5) * CFG.CELL - player.x, (g[1] + 0.5) * CFG.CELL - player.z) < 2.6) return true;
    }
    return false;
  }
  function interact() {
    var door = facingDoor();
    if (door) {
      door.target = door.target === 1 ? 0 : 1;
      audio.doorCreak();
      return;
    }
    if (nearGate() && !world.gateUnlocked && player.keys >= CFG.KEYS_NEEDED) {
      world.gateUnlocked = true;
      audio.gateOpen();
    }
  }

  // --- Jumpscare --------------------------------------------------------------------
  var jumpscareT = 0;
  // Waehrend des Jumpscares zeichnet die Kreatur OHNE Depth-Test ueber alles
  // (sonst koennte eine Wand zwischen Kamera und Gesicht stehen).
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
    audio.stopAmbient();
    audio.setHeartbeat(0);
    audio.scream();
    if (document.exitPointerLock) document.exitPointerLock();
  }

  function updateJumpscare(dt) {
    jumpscareT += dt;
    var t = Math.min(1, jumpscareT / CFG.JUMPSCARE_DURATION);
    // Kreatur direkt vors Gesicht, naeher kommend
    var fx = Math.cos(player.angle), fz = Math.sin(player.angle);
    var dist = 1.35 - t * 0.75;
    var g = creature.model.group;
    g.position.set(player.x + fx * dist, player.eyeY() - 2.15, player.z + fz * dist);
    g.rotation.y = Math.atan2(player.x - g.position.x, player.z - g.position.z);
    g.scale.setScalar(1.0 + t * 0.25);
    creature.model.arms[0].rotation.x = -2.4;
    creature.model.arms[1].rotation.x = -2.4;
    creature.model.head.rotation.z = Math.sin(jumpscareT * 60) * 0.22;
    // Kamera-Shake + roter Blitz
    camera.position.set(
      player.x + (Math.random() - 0.5) * 0.14,
      player.eyeY() + (Math.random() - 0.5) * 0.14,
      player.z + (Math.random() - 0.5) * 0.14);
    camera.rotation.set(
      0.12 + (Math.random() - 0.5) * 0.1,
      -player.angle - Math.PI / 2 + (Math.random() - 0.5) * 0.1,
      (Math.random() - 0.5) * 0.15, "YXZ");
    el.redflash.style.opacity = (Math.floor(jumpscareT * 18) % 2 === 0 ? 0.34 : 0.14) + t * 0.16;
    flashlight.intensity = 2.5;   // damit man das Gesicht sicher sieht
    if (jumpscareT >= CFG.JUMPSCARE_DURATION) {
      el.redflash.style.opacity = 0;
      creature.model.group.visible = false;
      g.scale.setScalar(1);
      setScareRender(false);
      setState(STATE.DEAD);
    }
  }

  // --- Minimap: Ausgang pulsiert unuebersehbar gruen -----------------------------------
  function drawMinimap(timeNow) {
    var W = el.minimap.width, H = el.minimap.height;
    var sx = W / CFG.GRID_W, sz = H / CFG.GRID_H;
    minimapCtx.clearRect(0, 0, W, H);
    minimapCtx.fillStyle = "rgba(6,8,12,0.72)";
    minimapCtx.fillRect(0, 0, W, H);
    var f = player.floor;
    for (var cz = 0; cz < CFG.GRID_H; cz++) for (var cx = 0; cx < CFG.GRID_W; cx++) {
      var s = symAt(f, cx, cz);
      if (s === "H" || s === "W" || s === "F") {
        minimapCtx.fillStyle = "rgba(150,150,162,0.75)";
        minimapCtx.fillRect(cx * sx, cz * sz, sx, sz);
      } else if (s === "S") {
        minimapCtx.fillStyle = "rgba(120,150,230,0.95)";
        minimapCtx.fillRect(cx * sx, cz * sz, sx, sz);
      } else if (s === "T") {
        minimapCtx.fillStyle = "rgba(40,80,40,0.8)";
        minimapCtx.fillRect(cx * sx + 1, cz * sz + 1, sx - 2, sz - 2);
      } else if (s === "D") {
        minimapCtx.fillStyle = "rgba(150,105,55,0.9)";
        minimapCtx.fillRect(cx * sx, cz * sz, sx, sz);
      }
    }
    // AUSGANG: pulsierender gruener Marker am Tor (liegt im Erdgeschoss)
    if (f === 0) {
      var gx = (CFG.GATE_CELLS[0][0] + 1) * sx, gz = (CFG.GATE_CELLS[0][1] + 0.5) * sz;
      var pulse = 0.5 + 0.5 * Math.sin(timeNow * 4.5);
      minimapCtx.beginPath();
      minimapCtx.arc(gx, gz, 4 + pulse * 5, 0, 7);
      minimapCtx.fillStyle = "rgba(80,230,120," + (0.35 + pulse * 0.4) + ")";
      minimapCtx.fill();
      minimapCtx.beginPath();
      minimapCtx.arc(gx, gz, 2.6, 0, 7);
      minimapCtx.fillStyle = "#c9ffd6";
      minimapCtx.fill();
      minimapCtx.fillStyle = "rgba(140,255,170," + (0.6 + pulse * 0.4) + ")";
      minimapCtx.font = "bold 9px monospace";
      minimapCtx.textAlign = "center";
      minimapCtx.fillText("AUSGANG", gx, gz - 9);
    }
    // Spieler: Blickrichtungs-Pfeil
    var px = player.x / CFG.CELL * sx, pz = player.z / CFG.CELL * sz;
    var a = player.angle;
    minimapCtx.beginPath();
    minimapCtx.moveTo(px + Math.cos(a) * 7, pz + Math.sin(a) * 7);
    minimapCtx.lineTo(px + Math.cos(a + 2.5) * 4.5, pz + Math.sin(a + 2.5) * 4.5);
    minimapCtx.lineTo(px + Math.cos(a - 2.5) * 4.5, pz + Math.sin(a - 2.5) * 4.5);
    minimapCtx.closePath();
    minimapCtx.fillStyle = "#f2f2f6";
    minimapCtx.fill();
    el.minimapFloor.textContent = "Etage: " + (f === 0 ? "Erdgeschoss" : "Obergeschoss");
  }

  // --- Sanity ---------------------------------------------------------------------------
  function updateSanity(dt, cdistSameFloor) {
    var ll = player.lightLevel();
    var drain = 0, regen = 0;
    if (ll <= 0.05) drain += CFG.SANITY_DRAIN_DARK;
    if (cdistSameFloor !== null && cdistSameFloor < 7)
      drain += CFG.SANITY_DRAIN_CREATURE * (1 - cdistSameFloor / 7);
    if (ll > 0.4 && (cdistSameFloor === null || cdistSameFloor > 9)) regen = CFG.SANITY_REGEN;
    player.sanity = Math.max(0, Math.min(CFG.SANITY_MAX, player.sanity + (regen - drain) * dt));
  }

  // --- Filmkorn ----------------------------------------------------------------------------
  var grain = document.getElementById("grain");
  var grainCtx = grain.getContext("2d");
  var grainTimer = 0;
  function updateGrain(dt) {
    grainTimer -= dt;
    if (grainTimer > 0) return;
    grainTimer = 0.09;
    var img = grainCtx.createImageData(128, 128);
    for (var i = 0; i < img.data.length; i += 4) {
      var v = Math.random() * 255;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
      img.data[i + 3] = 22;
    }
    grainCtx.putImageData(img, 0, 0);
  }

  // --- Hauptschleife ---------------------------------------------------------------------------
  var last = performance.now(), timeNow = 0;

  function frame(now) {
    requestAnimationFrame(frame);
    var dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    timeNow += dt;

    if (state === STATE.PLAYING) {
      player.update(dt, input, world, audio);

      // Blickt der Spieler die Kreatur im Licht an?
      var cdx = creature.x - player.x, cdz = creature.z - player.z;
      var cdist = Math.hypot(cdx, cdz);
      var sameFloor = creature.floor === player.floor;
      var angTo = Math.atan2(cdz, cdx);
      var adiff = Math.abs(((player.angle - angTo) % (Math.PI * 2) + Math.PI * 3) % (Math.PI * 2) - Math.PI);
      var lookedAt = sameFloor && adiff < 0.5 && cdist < CFG.CREATURE_SIGHT
        && player.flashOn && lineOfSight(player.floor, player.x, player.z, creature.x, creature.z, world);

      creature.update(dt, player, world, audio, lookedAt);
      if (creature.caught || player.sanity <= 0) triggerJumpscare();

      // Aufsammeln (drueberlaufen)
      built.items.forEach(function (it) {
        if (it.taken || it.floor !== player.floor) return;
        var d = Math.hypot((it.cx + 0.5) * CFG.CELL - player.x, (it.cz + 0.5) * CFG.CELL - player.z);
        if (d < 0.85) {
          it.taken = true;
          it.mesh.visible = false;
          audio.pickup();
          if (it.kind === "key") player.keys++;
          else player.battery = Math.min(CFG.BATTERY_MAX, player.battery + CFG.BATTERY_PICKUP);
        }
      });

      updateSanity(dt, sameFloor ? cdist : null);

      // Sieg: durchs offene Tor gehen
      if (world.gateUnlocked && built.gate.open > 0.5) {
        for (var i = 0; i < CFG.GATE_CELLS.length; i++) {
          var gc = CFG.GATE_CELLS[i];
          if (player.cellX() === gc[0] && player.cellZ() >= gc[1]) {
            setState(STATE.WIN);
            audio.stopAmbient();
            audio.setHeartbeat(0);
            audio.winChime();
            if (document.exitPointerLock) document.exitPointerLock();
          }
        }
      }

      // Herzschlag nach Bedrohung
      var threat = sameFloor ? Math.max(0, 1 - cdist / 10) : 0;
      threat = Math.max(threat, (1 - player.sanity / CFG.SANITY_MAX) * 0.55);
      audio.setHeartbeat(threat);

      // Kamera
      camera.position.set(player.x, player.eyeY(), player.z);
      camera.rotation.set(player.pitch, -player.angle - Math.PI / 2, 0, "YXZ");

      // HUD
      el.keys.textContent = "Schluessel: " + player.keys + " / " + CFG.KEYS_NEEDED;
      el.floor.textContent = "Etage: " + (player.floor === 0 ? "Erdgeschoss" : "Obergeschoss");
      el.batteryFill.style.width = player.battery + "%";
      el.sanityFill.style.width = player.sanity + "%";
      el.staminaFill.style.width = player.stamina + "%";
      var door = facingDoor();
      var prompt = "";
      if (door) prompt = "[E] Tuer " + (door.target === 1 ? "schliessen" : "oeffnen");
      else if (nearGate() && !world.gateUnlocked)
        prompt = player.keys >= CFG.KEYS_NEEDED ? "[E] Tor entriegeln" : "Verschlossen - " + CFG.KEYS_NEEDED + " Schluessel noetig";
      else if (isStairCell(player.cellX(), player.cellZ()))
        prompt = player.floor === 0 ? "Treppe nach oben" : "Treppe nach unten";
      el.prompt.textContent = prompt;

      drawMinimap(timeNow);
    } else if (state === STATE.JUMPSCARE) {
      updateJumpscare(dt);
    }

    // Tueren / Tor animieren
    built.doors.forEach(function (d) {
      var speed = dt * 1.8;
      d.open += Math.max(-speed, Math.min(speed, d.target - d.open));
      d.group.rotation.y = d.baseRot + d.open * 1.45;
    });
    if (world.gateUnlocked && built.gate.open < 1) {
      built.gate.open = Math.min(1, built.gate.open + dt * 0.8);
      built.gate.panels[0].group.rotation.y = built.gate.open * 1.5;
      built.gate.panels[1].group.rotation.y = -built.gate.open * 1.5;
    }

    // Laternen flackern
    built.lanterns.forEach(function (l) {
      l.light.intensity = l.base * (0.82 + 0.18 * Math.sin(timeNow * 9 + l.seed) * Math.sin(timeNow * 23 + l.seed * 2));
    });

    // Taschenlampe folgt der Kamera
    if (state !== STATE.JUMPSCARE) {
      flashlight.intensity = player.flashOn && player.battery > 0
        ? 1.7 * (player.battery < 18 ? 0.6 + 0.4 * Math.abs(Math.sin(timeNow * 13)) : 1)
        : 0;
    }
    flashlight.position.copy(camera.position);
    var dir = new THREE.Vector3();
    camera.getWorldDirection(dir);
    flashTarget.position.copy(camera.position).addScaledVector(dir, 8);

    // Items schweben & drehen
    built.items.forEach(function (it) {
      if (it.taken) return;
      it.mesh.rotation.y += dt * 1.6;
      it.mesh.position.y = it.floor * CFG.FLOOR1_Y + 0.5 + Math.sin(timeNow * 2 + it.cx) * 0.06;
    });

    audio.update(dt);
    updateGrain(dt);
    renderer.render(scene, camera);
  }

  setState(STATE.MENU);
  requestAnimationFrame(frame);

  // --- Debug-API fuer Headless-Tests -----------------------------------------------------------
  if (DEBUG) {
    window.NOC = {
      start: startGame,
      state: function () { return ["MENU", "PLAYING", "PAUSED", "JUMPSCARE", "DEAD", "WIN"][state]; },
      player: function () { return player; },
      creature: function () { return creature; },
      input: input,
      teleport: function (cx, cz, floor) {
        player.x = (cx + 0.5) * CFG.CELL;
        player.z = (cz + 0.5) * CFG.CELL;
        player.floor = floor;
        player.y = groundHeight(player.x, player.z, floor);
      },
      setAngle: function (a, p) { player.angle = a; player.pitch = p || 0; },
      giveKeys: function () { player.keys = CFG.KEYS_NEEDED; },
      unlockGate: function () { world.gateUnlocked = true; },
      forceJumpscare: triggerJumpscare,
      world: world,
      time: function () { return timeNow; },
      gate: function () { return built.gate; },
    };
  }
})();
