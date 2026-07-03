// ============================================================================
// NOCTURNE Nacht 1 — Story-Engine: 4 Akte
//   1 "Eine normale Nachtschicht"  – Kunden bedienen, Verkehr
//   2 "Die Warnung"                – Polizei-Event, Radio-Nachrichten
//   3 "Er ist hier"                – Blackout, Kreatur, 5 Autoteile
//   4 "Die Flucht"                 – Motorstart, selbst fahren, Tunnel
// ============================================================================
"use strict";

function Story(scene, built, world, player, creature, audio, ui) {
  this.scene = scene;
  this.built = built;
  this.world = world;
  this.player = player;
  this.creature = creature;
  this.audio = audio;
  this.ui = ui;                    // { dialog(text,dur), title(text,sub), objective(text) }

  this.act = 1;
  this.t = 0;
  this.customersServed = 0;
  this.customer = null;
  this.customerTimer = 6;
  this.customerIndex = 0;
  this.prepared = null;            // vorbereitete Ware ("coffee"/"burger")
  this.police = null;
  this.policeLeftAt = -1;
  this.traffic = new Traffic(scene, built);
  this.blackoutDone = false;
  this.scareEventDone = false;

  this.partsInstalled = {};        // id -> true
  this.partsCount = 0;
  this.filling = 0;                // Zapf-Fortschritt 0..1 (läuft)
  this.fillingActive = false;

  this.engineState = 0;            // 0=aus, 1=Startsequenz, 2=laeuft
  this.engineT = 0;
  this.driveScareDone = false;

  this.stats = { time: 0, customers: 0, parts: 0, shots: 0 };
}

Story.prototype.installedAll = function () { return this.partsCount >= CFG.PARTS.length - 1 && this.player.hasCarKey; };

Story.prototype.objectiveText = function () {
  if (this.act === 1) return "Bediene die Kunden (" + this.customersServed + "/" + CFG.CUSTOMERS_NEEDED + ")";
  if (this.act === 2) return this.police ? "Hoer dir an, was der Polizist sagt" : "Schliess die Eingangstuer ab [L] und bleib drinnen";
  if (this.act === 3) {
    var missing = [];
    CFG.PARTS.forEach(function (p) {
      if (p.id !== "carkey" && !this.partsInstalled[p.id]) missing.push(p.name);
    }, this);
    if (!this.player.hasCarKey) missing.push("Autoschluessel");
    if (missing.length === 0) return "Steig ins Auto und starte den Motor!";
    return "Repariere das Auto in der Garage (" + this.partsCount + "/4 Teile" + (this.player.hasCarKey ? ", Schluessel OK" : "") + ")";
  }
  if (this.act === 4) return "FAHR! Durch den Tunnel im Westen!";
  return "";
};

Story.prototype.update = function (dt) {
  this.t += dt;
  this.stats.time += dt;
  var C = CFG.CELL;

  // Verkehr laeuft immer (Frequenz je Akt)
  this.traffic.update(dt, this.audio, this.player.x);

  if (this.act === 1) {
    // Kunden nacheinander
    if (!this.customer && this.customersServed < CFG.CUSTOMERS_NEEDED) {
      this.customerTimer -= dt;
      if (this.customerTimer <= 0) {
        this.customer = new Customer(this.scene, this.built, this.customerIndex++);
        this.audio.carPassBy();
      }
    }
    if (this.customer) {
      var done = this.customer.update(dt, this.world, this.audio);
      if (done) {
        this.customer.dispose(this.scene);
        this.customer = null;
        this.customerTimer = 5 + Math.random() * 5;
        this.prepared = null;
      }
    }
    // Grusel-Vorboten
    if (!this.scareEventDone && this.customersServed >= 2) {
      this.scareEventDone = true;
      this.ui.dialog("Zwischen den Baeumen... stand da nicht etwas?", 4);
    }
    if (this.customersServed >= CFG.CUSTOMERS_NEEDED && !this.customer) {
      this.act = 2;
      this.ui.title("AKT 2", "Die Warnung");
      this.police = new PoliceEvent(this.scene, this.built);
      this.traffic.rate = 22;
    }
  } else if (this.act === 2) {
    if (this.police) {
      var self = this;
      var pDone = this.police.update(dt, this.world, this.audio, function () {
        self.ui.dialog("POLIZIST: Wir haben zwei Leichen an der alten Jagdhuette gefunden.", 4.5);
        setTimeout(function () {
          self.ui.dialog("POLIZIST: Irgendwas treibt sich im Wald herum. Schliessen Sie ab. Bleiben Sie DRINNEN.", 5);
        }, 4700);
        setTimeout(function () {
          self.ui.dialog("POLIZIST: Wir schicken einen Wagen, sobald wir koennen.", 3.5);
          self.police.dialogDone = true;
        }, 9900);
      });
      if (pDone) {
        this.police = null;
        this.policeLeftAt = this.t;
        this.audio.setRadio("news");
        this.ui.dialog("RADIO: ...warnt die Bevoelkerung. Meiden Sie das Waldgebiet an der Landstrasse 7...", 6);
        this.traffic.enabled = false;
      }
    } else if (this.policeLeftAt > 0 && this.t - this.policeLeftAt > 14) {
      // --- Blackout: Akt 3 beginnt ---
      this.act = 3;
      this.ui.title("AKT 3", "Er ist hier");
      this.audio.setRadio("static");
      this.blackout();
      this.creature.activate();
      this.ui.dialog("Das Licht! ... In der Garage steht der alte Kombi. Vielleicht faehrt er noch.", 5);
    }
  } else if (this.act === 3) {
    // Kreatur wird mit jedem Teil aggressiver (in addPart gesetzt)
    // Zapfvorgang
    if (this.fillingActive) {
      var pf = CFG.POS.pumpFill;
      var d = Math.hypot(this.player.x - (pf[0] + 0.5) * C, this.player.z - (pf[1] + 0.5) * C);
      if (d > 2.6 || this.player.hidden) {
        this.fillingActive = false;
        this.audio.stopPump();
        this.ui.dialog("Der Tankvorgang wurde unterbrochen!", 2.5);
      } else {
        this.filling += dt / 20;
        this.player.noise = 1;                     // Pumpe ist LAUT
        if (this.filling >= 1) {
          this.fillingActive = false;
          this.player.fuelFilled = true;
          this.audio.stopPump();
          this.audio.pickup();
          this.ui.dialog("Kanister voll. Zurueck zum Auto!", 3);
        }
      }
    }
  } else if (this.act === 4) {
    // Motorstart-Sequenz
    if (this.engineState === 1) {
      this.engineT += dt;
      if (this.engineT > 1.4 && this.engineT < 1.5 && !this._c1) {
        this._c1 = true;
        this.audio.engineCrank(false);
      }
      if (this.engineT > 3.1 && !this._c2) {
        this._c2 = true;
        this.audio.engineCrank(false);
        // Sie taucht im Scheinwerferlicht auf
        this.creature.x = this.player.x;
        this.creature.z = (GARAGE.z0 - 4) * C;
        this.creature.model.group.visible = true;
        this.ui.dialog("DA! Direkt vor dem Tor!", 2);
      }
      if (this.engineT > 5.0 && !this._c3) {
        this._c3 = true;
        this.audio.engineCrank(true);
      }
      if (this.engineT > 6.3) {
        this.engineState = 2;
        this.audio.startEngine();
        // Kreatur springt zur Seite, lauert an der Strasse
        this.creature.x = 70; this.creature.z = 24;
        this.creature.state = C_STALK;
      }
    }
  }
};

Story.prototype.blackout = function () {
  this.built.shopLights.forEach(function (l) { l.light.intensity = 0.06; });
  this.built.canopyLights.forEach(function (l) {
    l.base = 0.15;
    l.strip.material.color.setHex(0x2a3038);
  });
  this.built.garageLight.intensity = 0.2;
  this.built.garageLight.color.setHex(0xff5533);
  this.blackoutDone = true;
};

// Kunde bedienen: [E] an einer Station / am Kunden
Story.prototype.tryServe = function () {
  var c = this.customer;
  if (!c || c.state !== "ordering") return null;
  var C = CFG.CELL, p = this.player;
  function near(cell, r) {
    return Math.hypot(p.x - (cell[0] + 0.5) * C, p.z - (cell[1] + 0.5) * C) < (r || 2.2);
  }
  var o = c.order;
  if (o.id === "pay") {
    if (near(CFG.POS.register)) {
      c.served = true;
      this.customersServed++; this.stats.customers++;
      this.audio.pickup();
      return "Bezahlt. " + (Math.random() < 0.5 ? "\"Danke, gute Nacht noch.\"" : "\"Fahren Sie heute nicht durch den Wald.\"");
    }
    return null;
  }
  if (!this.prepared && near(CFG.POS[o.station])) {
    this.prepared = o.id;
    this.audio.pickup();
    return (o.id === "coffee" ? "Kaffee gebrueht." : "Burger eingepackt.") + " Jetzt zum Kunden.";
  }
  if (this.prepared === o.id && Math.hypot(p.x - c.x, p.z - c.z) < 2.4) {
    c.served = true;
    this.prepared = null;
    this.customersServed++; this.stats.customers++;
    this.audio.pickup();
    return "\"Danke!\" — Der Kunde geht zufrieden.";
  }
  return null;
};

// Teil einsammeln/einbauen — Rueckgabetexte fuers HUD
Story.prototype.addPart = function (id) {
  this.partsInstalled[id] = true;
  this.partsCount++;
  this.stats.parts++;
  this.creature.aggression = Math.min(1, this.creature.aggression + 0.22);
  if (this.partsCount >= 4) {
    var hood = this.built.playerCar.extra.hood;
    if (hood) hood.visible = false;                 // Haube zu
  }
};
