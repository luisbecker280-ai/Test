// ============================================================================
// NOCTURNE — Nacht 1: „Die Tankstelle"
// Konfiguration, Karte & reine Spiellogik-Helfer (ohne THREE-Abhaengigkeit,
// damit Node-Tests die Karte pruefen koennen).
//
// Kartensymbole:
//   M Fels/Berg      R Strasse        U Strasse im Tunnel   r Vorplatz-Asphalt
//   . Gras           p Trampelpfad    T Baum (solide)
//   H Gebaeudewand   w Fensterwand    W Innenwand           B Huettenwand (Holz)
//   D Tuer           d Garagen-Rolltor
//   : Shop-Boden     g Garagen-Boden  h Huetten-Boden
// ============================================================================
"use strict";

// ?fast in der URL: reduzierte Details fuer Headless-Tests (Software-WebGL)
var FAST = (typeof location !== "undefined") && /fast/.test(location.search);

var CFG = {
  CELL: 2.0,
  WALL_H: 3.2,          // Wandhoehe der Gebaeude
  EYE: 1.62,
  GRID_W: 96,
  GRID_H: 64,

  WALK_SPEED: 3.2,
  RUN_SPEED: 5.6,
  STAMINA_MAX: 100,
  PLAYER_R: 0.35,

  BATTERY_MAX: 100,
  BATTERY_DRAIN: 1.1,

  ENERGY_BARS_START: 0,
  PISTOL_AMMO: 6,
  STUN_DURATION: 6.5,     // Sekunden Betaeubung nach Pistolentreffer
  PISTOL_RANGE: 22,

  CREATURE_SPEED_PATROL: 1.7,
  CREATURE_SPEED_HUNT: 4.6,
  CREATURE_CONTACT: 1.05,
  CREATURE_SIGHT: 20,
  CREATURE_HEAR_RUN: 12,   // Hoerradius fuer rennende Schritte
  JUMPSCARE_DURATION: 1.0,

  // Auto (Finale)
  CAR_ACCEL: 6.5,
  CAR_MAX_SPEED: 13.0,
  CAR_TURN: 1.7,
  CRASH_SPEED: 4.0,        // ab dieser Geschwindigkeit ist ein Aufprall toedlich

  // Kunden in Akt 1
  CUSTOMERS_NEEDED: 3,

  PLAYER_START: { x: 47.5, z: 26.5, angle: -Math.PI / 2 },  // hinter dem Tresen
  CREATURE_SPAWN: { x: 80.5, z: 50.5 },

  // Strasse (Fahr- und Verkehrsachse)
  ROAD_Z0: 6, ROAD_Z1: 9,
  TUNNEL_X: 10,            // westlich davon ist die Roehre; Sieg bei x < 5 Zellen
  WIN_X_CELL: 5,

  // Zapfsaeulen (Weltkoordinaten der Zellenmitte)
  PUMPS: [[48, 15], [55, 15]],

  // --- Story-Positionen (Zellen) ---
  POS: {
    counterFront: [47, 24],     // hier stehen Kunden
    door: [50, 22],             // Eingangstuer
    coffee: [43, 24],           // Kaffeemaschine
    burger: [43, 27],           // Burgertheke
    register: [46, 25],         // Kasse (am Tresen)
    radio: [49, 26],            // Radio hinterm Tresen
    carGarage: [64, 26],        // das kaputte Auto in der Garage
    garageDoor: [64, 22],       // Rolltor (Mitte)
    hut: [19, 47],              // Jagdhuette innen
    hutDoor: [19, 44],
    body: [19, 52],             // Leiche hinter der Huette (Autoschluessel)
    wreck: [76, 46],            // Autowrack im Wald
    policePark: [43, 12],       // Haltepunkt Polizeiauto
    pumpFill: [48, 14],         // Kanister befuellen (vor Zapfsaeule 1)
  },

  // --- 5 Autoteile: [Name, Zelle, Etikett fuer HUD/Minimap-Suchkreis] ---
  PARTS: [
    { id: "battery", name: "Autobatterie", cell: [57, 28], area: "Lager der Tankstelle" },
    { id: "plugs", name: "Zuendkerzen", cell: [18, 46], area: "Jagdhuette im Wald" },
    { id: "wheel", name: "Ersatzrad", cell: [75, 45], area: "Autowrack im Osten" },
    { id: "fuel", name: "Benzinkanister", cell: [66, 28], area: "Garage (an Saeule fuellen!)" },
    { id: "carkey", name: "Autoschluessel", cell: [19, 52], area: "hinter der Jagdhuette" },
  ],

  // --- Items ---
  PISTOL_CELL: [46, 26],         // Schublade unterm Tresen
  AMMO_CELL: [21, 48],           // Munitionsschachtel in der Huette
  ENERGY_BAR_CELLS: [[53, 25], [44, 26], [57, 24], [17, 46]],
  FLASH_BATTERY_CELLS: [[53, 28], [17, 49], [62, 24], [74, 46]],

  // --- Verstecke ---
  HIDE_SPOTS: [
    { cell: [47, 27], name: "Unter dem Tresen" },
    { cell: [59, 28], name: "Spind im Lager" },
    { cell: [21, 45], name: "Ecke der Huette" },
  ],

  // Laternen/Lichtmasten [x, z] (aussen) — Vorplatz + Strasse
  LAMPS: [[40, 12], [62, 12], [30, 8], [70, 8], [14, 8]],
};

// ---------------------------------------------------------------------------
// Kartenbau
// ---------------------------------------------------------------------------
function _mkGrid(fill) {
  var g = [];
  for (var z = 0; z < CFG.GRID_H; z++) g.push(new Array(CFG.GRID_W).fill(fill));
  return g;
}
function _hline(g, x0, x1, z, s) { for (var x = x0; x <= x1; x++) g[z][x] = s; }
function _vline(g, x, z0, z1, s) { for (var z = z0; z <= z1; z++) g[z][x] = s; }
function _rect(g, x0, z0, x1, z1, s) { _hline(g, x0, x1, z0, s); _hline(g, x0, x1, z1, s); _vline(g, x0, z0, z1, s); _vline(g, x1, z0, z1, s); }
function _fill(g, x0, z0, x1, z1, s) { for (var z = z0; z <= z1; z++) for (var x = x0; x <= x1; x++) g[z][x] = s; }

// deterministischer Zufall fuer die Baumverteilung
function _hash(x, z) {
  var n = (x * 73856093) ^ (z * 19349663);
  n = (n ^ (n >> 13)) * 1274126177;
  return ((n ^ (n >> 16)) >>> 0) % 1000 / 1000;
}

var SHOP = { x0: 42, z0: 22, x1: 60, z1: 30 };
var GARAGE = { x0: 60, z0: 22, x1: 68, z1: 30 };
var HUT = { x0: 16, z0: 44, x1: 22, z1: 50 };

function buildMap() {
  var g = _mkGrid(".");

  // Kartenraender: Fels
  _rect(g, 0, 0, CFG.GRID_W - 1, CFG.GRID_H - 1, "M");
  _hline(g, 0, CFG.GRID_W - 1, 1, "M");
  _vline(g, 1, 0, CFG.GRID_H - 1, "M");
  _vline(g, CFG.GRID_W - 2, 0, CFG.GRID_H - 1, "M");
  _hline(g, 0, CFG.GRID_W - 1, CFG.GRID_H - 2, "M");

  // Strasse (west-ost)
  _fill(g, 0, CFG.ROAD_Z0, CFG.GRID_W - 1, CFG.ROAD_Z1, "R");

  // Tunnel: Felsmassiv im Westen, Roehre um die Strasse
  _fill(g, 0, 0, CFG.TUNNEL_X, 16, "M");
  _fill(g, 0, CFG.ROAD_Z0, CFG.TUNNEL_X, CFG.ROAD_Z1, "U");
  // Strassenende im Osten: Fels
  _fill(g, CFG.GRID_W - 3, CFG.ROAD_Z0 - 2, CFG.GRID_W - 1, CFG.ROAD_Z1 + 2, "M");

  // Vorplatz
  _fill(g, 38, 10, 68, 21, "r");

  // Shop-Gebaeude
  _rect(g, SHOP.x0, SHOP.z0, SHOP.x1, SHOP.z1, "H");
  _fill(g, SHOP.x0 + 1, SHOP.z0 + 1, SHOP.x1 - 1, SHOP.z1 - 1, ":");
  g[SHOP.z0][50] = "D";                                   // Eingangstuer (Norden)
  [45, 46, 47, 53, 54, 55].forEach(function (x) { g[SHOP.z0][x] = "w"; }); // Fensterfront
  _vline(g, 54, 23, 29, "W"); g[26][54] = "D";            // Lager im Osten
  // Durchgang Shop -> Garage
  g[26][SHOP.x1] = "D";

  // Garage
  _rect(g, GARAGE.x0, GARAGE.z0, GARAGE.x1, GARAGE.z1, "H");
  _fill(g, GARAGE.x0 + 1, GARAGE.z0 + 1, GARAGE.x1 - 1, GARAGE.z1 - 1, "g");
  g[26][SHOP.x1] = "D";                                   // (gemeinsame Wand)
  [63, 64, 65].forEach(function (x) { g[GARAGE.z0][x] = "d"; }); // Rolltor

  // Jagdhuette
  _rect(g, HUT.x0, HUT.z0, HUT.x1, HUT.z1, "B");
  _fill(g, HUT.x0 + 1, HUT.z0 + 1, HUT.x1 - 1, HUT.z1 - 1, "h");
  g[HUT.z0][19] = "D";                                    // Tuer nach Norden

  // Trampelpfade (Vorplatz -> Sueden -> Huette / Wrack)
  _vline(g, 50, 31, 40, "p");
  _hline(g, 20, 50, 40, "p");
  _vline(g, 19, 41, 43, "p");
  _hline(g, 50, 76, 40, "p");
  _vline(g, 76, 41, 44, "p");

  // Waldzonen: Baeume auf Gras, mit Lichtungen um Huette/Wrack/Leiche
  var clearings = [[19, 47, 5.5], [76, 46, 4.5], [19, 52, 3.0], [50, 16, 3.0]];
  for (var z = 2; z < CFG.GRID_H - 2; z++) {
    for (var x = 2; x < CFG.GRID_W - 2; x++) {
      if (g[z][x] !== ".") continue;
      var densest = z > 32 || z < 5;                     // tiefer Wald
      var density = densest ? 0.34 : 0.16;
      // Abstand zu Strasse/Vorplatz halten
      if (z >= CFG.ROAD_Z0 - 1 && z <= CFG.ROAD_Z1 + 1) continue;
      var ok = true;
      for (var c = 0; c < clearings.length; c++) {
        if (Math.hypot(x - clearings[c][0], z - clearings[c][1]) < clearings[c][2]) { ok = false; break; }
      }
      if (!ok) continue;
      if (_hash(x, z) < density) g[z][x] = "T";
    }
  }

  return g.map(function (r) { return r.join(""); });
}

var MAP = buildMap();

// ---------------------------------------------------------------------------
// Begehbarkeit / Kollision
// ---------------------------------------------------------------------------
function symAt(cx, cz) {
  if (cx < 0 || cz < 0 || cx >= CFG.GRID_W || cz >= CFG.GRID_H) return "M";
  return MAP[cz].charAt(cx);
}

var WALKABLE = { ".": 1, "p": 1, "R": 1, "U": 1, "r": 1, ":": 1, "g": 1, "h": 1 };
var DRIVABLE = { "R": 1, "U": 1, "r": 1, "g": 1 };

// world = { doorOpen(cx,cz), rollDoorOpen }
function isBlocked(cx, cz, world) {
  var s = symAt(cx, cz);
  if (WALKABLE[s]) return false;
  if (s === "D") return !(world && world.doorOpen(cx, cz));
  if (s === "d") return !(world && world.rollDoorOpen);
  return true;
}
function isPathBlocked(cx, cz, world) {
  var s = symAt(cx, cz);
  if (WALKABLE[s] || s === "D") return false;
  if (s === "d") return !(world && world.rollDoorOpen);
  return true;
}
function isDrivable(cx, cz, world) {
  var s = symAt(cx, cz);
  if (DRIVABLE[s]) return true;
  if (s === "d") return !!(world && world.rollDoorOpen);
  return false;
}
function isIndoor(cx, cz) {
  var s = symAt(cx, cz);
  return s === ":" || s === "g" || s === "h";
}

// ---------------------------------------------------------------------------
// A* (4er-Nachbarschaft)
// ---------------------------------------------------------------------------
function findPath(start, goal, world) {
  var W = CFG.GRID_W;
  var key = function (c) { return c[0] + c[1] * W; };
  var open = [{ c: start, g: 0, f: 0 }], came = {}, gs = {};
  gs[key(start)] = 0;
  var it = 0;
  while (open.length && it++ < 9000) {
    var bi = 0;
    for (var i = 1; i < open.length; i++) if (open[i].f < open[bi].f) bi = i;
    var cur = open.splice(bi, 1)[0];
    if (cur.c[0] === goal[0] && cur.c[1] === goal[1]) {
      var path = [cur.c], k = key(cur.c);
      while (came[k] !== undefined) { path.push(came[k]); k = key(came[k]); }
      return path.reverse();
    }
    var D = [[1, 0], [-1, 0], [0, 1], [0, -1]];
    for (var d = 0; d < 4; d++) {
      var nx = cur.c[0] + D[d][0], nz = cur.c[1] + D[d][1];
      if (isPathBlocked(nx, nz, world)) continue;
      var nk = nx + nz * W, ng = cur.g + 1;
      if (gs[nk] !== undefined && ng >= gs[nk]) continue;
      gs[nk] = ng; came[nk] = cur.c;
      open.push({ c: [nx, nz], g: ng, f: ng + Math.abs(nx - goal[0]) + Math.abs(nz - goal[1]) });
    }
  }
  return null;
}

// Sichtlinie (Fenster blocken Bewegung, aber NICHT die Sicht)
function lineOfSight(x0, z0, x1, z1, world) {
  var dx = x1 - x0, dz = z1 - z0;
  var dist = Math.hypot(dx, dz);
  if (dist < 0.001) return true;
  var steps = Math.ceil(dist / (CFG.CELL * 0.4));
  for (var i = 1; i < steps; i++) {
    var t = i / steps;
    var s = symAt(Math.floor((x0 + dx * t) / CFG.CELL), Math.floor((z0 + dz * t) / CFG.CELL));
    if (s === "M" || s === "H" || s === "W" || s === "B" || s === "T") return false;
    if (s === "D" && !(world && world.doorOpen(Math.floor((x0 + dx * t) / CFG.CELL), Math.floor((z0 + dz * t) / CFG.CELL)))) return false;
    if (s === "d" && !(world && world.rollDoorOpen)) return false;
  }
  return true;
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    CFG: CFG, MAP: MAP, symAt: symAt, isBlocked: isBlocked,
    isPathBlocked: isPathBlocked, isDrivable: isDrivable, isIndoor: isIndoor,
    findPath: findPath, lineOfSight: lineOfSight,
    SHOP: SHOP, GARAGE: GARAGE, HUT: HUT,
  };
}
