// ============================================================================
// NOCTURNE 3D — Konfiguration, Grundrisse & reine Spiellogik-Helfer
// (bewusst ohne THREE-Abhaengigkeit, damit Node-Tests die Karten pruefen koennen)
// ============================================================================
"use strict";

var CFG = {
  CELL: 1.5,            // Kantenlaenge einer Rasterzelle in Weltmetern
  WALL_H: 3.0,          // Wandhoehe pro Etage
  FLOOR1_Y: 3.0,        // Bodenhoehe Obergeschoss
  FENCE_H: 1.5,         // Zaunhoehe
  EYE: 1.62,            // Augenhoehe ueber Boden
  GRID_W: 36,
  GRID_H: 30,

  WALK_SPEED: 3.1,
  RUN_SPEED: 5.2,
  STAMINA_MAX: 100,
  PLAYER_R: 0.34,       // Kollisionsradius Spieler

  BATTERY_MAX: 100,
  BATTERY_DRAIN: 1.35,  // pro Sekunde bei eingeschalteter Lampe
  BATTERY_PICKUP: 45,

  SANITY_MAX: 100,
  SANITY_DRAIN_DARK: 2.1,
  SANITY_DRAIN_CREATURE: 5.5,
  SANITY_REGEN: 3.0,

  KEYS_NEEDED: 3,

  CREATURE_SPEED_LURK: 1.5,
  CREATURE_SPEED_HUNT: 3.55,
  CREATURE_CONTACT: 0.95,   // Beruehrungsdistanz -> sofortiger Tod
  CREATURE_SIGHT: 14.0,
  JUMPSCARE_DURATION: 0.95,

  // Treppe: Lauf von West (unten) nach Ost (oben), Zellen auf Reihe z=6
  STAIR_RUN: [[24, 6], [25, 6], [26, 6]],
  STAIR_BOTTOM: [23, 6],    // Einstieg unten (Erdgeschoss)
  STAIR_TOP: [27, 6],       // Podest oben (Obergeschoss)

  GATE_CELLS: [[17, 29], [18, 29]],
  PLAYER_START: { x: 17.5, z: 24.5, angle: -Math.PI / 2 }, // Blick nach Norden (zum Haus)
  CREATURE_START: { x: 27.5, z: 14.5, floor: 0 },

  // Gegenstaende: [x, z, etage]
  KEY_SPAWNS: [[11, 7, 0], [26, 14, 0], [9, 14, 1]],
  BATTERY_SPAWNS: [[8, 15, 0], [18, 6, 0], [27, 9, 0], [3, 26, 0], [32, 8, 0], [26, 13, 1], [9, 7, 1]],

  // Laternen: [x, z, etage]
  LANTERNS: [
    [15, 19, 0], [20, 26, 0], [4, 27, 0], [31, 20, 0],       // Garten
    [10, 14, 0], [9, 6, 0], [23, 14, 0], [17, 10, 0],        // Erdgeschoss innen
    [18, 8, 1], [10, 15, 1], [25, 13, 1],                    // Obergeschoss
  ],
};

// ---------------------------------------------------------------------------
// Grundriss-Symbolik:
//   F Zaun   G Tor      . Gras     p Weg      T Baum    B Busch
//   H Hauswand aussen   W Innenwand           D Tuer
//   : Innenboden        S Treppenzelle        ' ' Leere (nur Obergeschoss)
// ---------------------------------------------------------------------------

function _mkGrid(fill) {
  var g = [];
  for (var z = 0; z < CFG.GRID_H; z++) g.push(new Array(CFG.GRID_W).fill(fill));
  return g;
}
function _hline(g, x0, x1, z, sym) { for (var x = x0; x <= x1; x++) g[z][x] = sym; }
function _vline(g, x, z0, z1, sym) { for (var z = z0; z <= z1; z++) g[z][x] = sym; }
function _rectBorder(g, x0, z0, x1, z1, sym) {
  _hline(g, x0, x1, z0, sym); _hline(g, x0, x1, z1, sym);
  _vline(g, x0, z0, z1, sym); _vline(g, x1, z0, z1, sym);
}
function _fill(g, x0, z0, x1, z1, sym) {
  for (var z = z0; z <= z1; z++) for (var x = x0; x <= x1; x++) g[z][x] = sym;
}

// Haus-Footprint (beide Etagen identisch)
var HOUSE = { x0: 6, z0: 4, x1: 29, z1: 17 };

function buildFloor0() {
  var g = _mkGrid(".");
  // Zaun + Tor (Sueden)
  _rectBorder(g, 0, 0, CFG.GRID_W - 1, CFG.GRID_H - 1, "F");
  CFG.GATE_CELLS.forEach(function (c) { g[c[1]][c[0]] = "G"; });
  // Weg vom Tor zur Haustuer
  _vline(g, 17, 18, 28, "p");
  _vline(g, 18, 18, 28, "p");
  // Haus: Aussenwaende + Innenboden + Haustuer
  _rectBorder(g, HOUSE.x0, HOUSE.z0, HOUSE.x1, HOUSE.z1, "H");
  _fill(g, HOUSE.x0 + 1, HOUSE.z0 + 1, HOUSE.x1 - 1, HOUSE.z1 - 1, ":");
  g[17][17] = "D";                              // Haustuer
  // Innenwaende Erdgeschoss
  _vline(g, 13, 5, 16, "W"); g[8][13] = "D"; g[14][13] = "D";
  _vline(g, 21, 5, 16, "W"); g[8][21] = "D"; g[14][21] = "D";
  _hline(g, 7, 12, 11, "W"); g[11][10] = "D";   // Kueche | Wohnzimmer
  _hline(g, 22, 28, 11, "W"); g[11][25] = "D";  // Treppenraum | Esszimmer
  // Treppenkorridor (Zellen z=6, Lauf nach Osten), seitlich zugemauert
  _hline(g, 23, 27, 5, "W");
  _hline(g, 23, 27, 7, "W");
  CFG.STAIR_RUN.forEach(function (c) { g[c[1]][c[0]] = "S"; });
  g[6][27] = "W";                               // Abstellraum unter dem Podest
  // Garten: Baeume (blockierend) + BueSCHE (begehbar)
  [[3, 3], [31, 4], [4, 22], [32, 24], [2, 14], [33, 15], [25, 21], [10, 21]]
    .forEach(function (c) { g[c[1]][c[0]] = "T"; });
  [[5, 5], [30, 7], [6, 18], [29, 26], [12, 26], [23, 26], [33, 27], [2, 9]]
    .forEach(function (c) { g[c[1]][c[0]] = "B"; });
  return g.map(function (row) { return row.join(""); });
}

function buildFloor1() {
  var g = _mkGrid(" ");
  _rectBorder(g, HOUSE.x0, HOUSE.z0, HOUSE.x1, HOUSE.z1, "H");
  _fill(g, HOUSE.x0 + 1, HOUSE.z0 + 1, HOUSE.x1 - 1, HOUSE.z1 - 1, ":");
  // Treppenloch + Schachtwaende; Zugang nur vom Podest im Osten
  _hline(g, 23, 26, 5, "W");
  _hline(g, 23, 26, 7, "W");
  g[6][23] = "W";                               // unteres Ende: zu (sonst Sturz)
  CFG.STAIR_RUN.forEach(function (c) { g[c[1]][c[0]] = "S"; });
  // Innenwaende Obergeschoss
  _hline(g, 7, 28, 11, "W"); g[11][10] = "D"; g[11][24] = "D";
  _vline(g, 13, 5, 10, "W"); g[7][13] = "D";
  _vline(g, 17, 12, 16, "W"); g[14][17] = "D";
  return g.map(function (row) { return row.join(""); });
}

var GRIDS = [buildFloor0(), buildFloor1()];

// ---------------------------------------------------------------------------
// Begehbarkeit / Kollision (etagenbewusst)
// ---------------------------------------------------------------------------
function symAt(floor, cx, cz) {
  if (cx < 0 || cz < 0 || cx >= CFG.GRID_W || cz >= CFG.GRID_H) return "F";
  return GRIDS[floor][cz].charAt(cx);
}

// world = { doorOpen(floor,cx,cz) -> bool, gateUnlocked -> bool }
function isBlocked(floor, cx, cz, world) {
  var s = symAt(floor, cx, cz);
  if (s === "." || s === "p" || s === ":" || s === "S" || s === "B") return false;
  if (s === "D") return !(world && world.doorOpen(floor, cx, cz));
  if (s === "G") return !(world && world.gateUnlocked);
  return true; // F H W T ' ' und alles Unbekannte
}

// Fuer Pfadsuche: Tueren gelten als passierbar (die Kreatur oeffnet sie)
function isPathBlocked(floor, cx, cz, world) {
  var s = symAt(floor, cx, cz);
  if (s === "." || s === "p" || s === ":" || s === "S" || s === "B" || s === "D") return false;
  if (s === "G") return !(world && world.gateUnlocked);
  return true;
}

function isStairCell(cx, cz) {
  for (var i = 0; i < CFG.STAIR_RUN.length; i++) {
    var c = CFG.STAIR_RUN[i];
    if (c[0] === cx && c[1] === cz) return true;
  }
  return false;
}

// Bodenhoehe an Weltposition (x,z) fuer eine Entitaet, die aktuell auf
// Etage `floor` unterwegs ist. Auf der Treppe wird linear interpoliert.
function groundHeight(x, z, floor) {
  var cx = Math.floor(x / CFG.CELL), cz = Math.floor(z / CFG.CELL);
  if (isStairCell(cx, cz)) {
    var x0 = CFG.STAIR_RUN[0][0] * CFG.CELL;                       // unterer Rand
    var x1 = (CFG.STAIR_RUN[CFG.STAIR_RUN.length - 1][0] + 1) * CFG.CELL; // oberer Rand
    var t = Math.min(1, Math.max(0, (x - x0) / (x1 - x0)));
    return t * CFG.FLOOR1_Y;
  }
  return floor === 1 ? CFG.FLOOR1_Y : 0;
}

// Etage aus der Hoehe ableiten (Treppenmitte als Schwelle)
function floorFromY(y) { return y > CFG.FLOOR1_Y * 0.5 ? 1 : 0; }

// ---------------------------------------------------------------------------
// A*-Pfadsuche auf einer Etage
// ---------------------------------------------------------------------------
function findPath(floor, start, goal, world) {
  var W = CFG.GRID_W, key = function (c) { return c[0] + c[1] * W; };
  var open = [{ c: start, g: 0, f: 0 }], came = {}, gscore = {};
  gscore[key(start)] = 0;
  var seen = {}; seen[key(start)] = true;
  var iter = 0;
  while (open.length && iter++ < 4000) {
    var bi = 0;
    for (var i = 1; i < open.length; i++) if (open[i].f < open[bi].f) bi = i;
    var cur = open.splice(bi, 1)[0];
    if (cur.c[0] === goal[0] && cur.c[1] === goal[1]) {
      var path = [cur.c], k = key(cur.c);
      while (came[k] !== undefined) { path.push(came[k]); k = key(came[k]); }
      path.reverse();
      return path;
    }
    var dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
    for (var d = 0; d < 4; d++) {
      var nx = cur.c[0] + dirs[d][0], nz = cur.c[1] + dirs[d][1];
      if (isPathBlocked(floor, nx, nz, world)) continue;
      var nk = nx + nz * W, ng = cur.g + 1;
      if (gscore[nk] !== undefined && ng >= gscore[nk]) continue;
      gscore[nk] = ng; came[nk] = cur.c;
      var h = Math.abs(nx - goal[0]) + Math.abs(nz - goal[1]);
      if (!seen[nk]) { open.push({ c: [nx, nz], g: ng, f: ng + h }); seen[nk] = true; }
      else { for (var j = 0; j < open.length; j++) if (open[j].c[0] === nx && open[j].c[1] === nz) { open[j].g = ng; open[j].f = ng + h; } }
    }
  }
  return null;
}

// Sichtlinie auf einer Etage (DDA ueber das Raster; geschlossene Tueren blocken)
function lineOfSight(floor, x0, z0, x1, z1, world) {
  var dx = x1 - x0, dz = z1 - z0;
  var dist = Math.hypot(dx, dz);
  if (dist < 0.001) return true;
  var steps = Math.ceil(dist / (CFG.CELL * 0.33));
  for (var i = 1; i < steps; i++) {
    var t = i / steps;
    var cx = Math.floor((x0 + dx * t) / CFG.CELL);
    var cz = Math.floor((z0 + dz * t) / CFG.CELL);
    var s = symAt(floor, cx, cz);
    if (s === "F" || s === "H" || s === "W" || s === "T") return false;
    if (s === "D" && !(world && world.doorOpen(floor, cx, cz))) return false;
  }
  return true;
}

// Node-Export fuer Karten-Validierung
if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    CFG: CFG, GRIDS: GRIDS, symAt: symAt, isBlocked: isBlocked,
    isPathBlocked: isPathBlocked, groundHeight: groundHeight,
    findPath: findPath, lineOfSight: lineOfSight, isStairCell: isStairCell,
    floorFromY: floorFromY, HOUSE: HOUSE,
  };
}
