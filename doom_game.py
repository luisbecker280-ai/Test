#!/usr/bin/env python3
"""
NOCTURNE - Ein atmosphaerisches Horror-Survival-Spiel mit Raycasting-Engine.

Aus dem fruehen Doom-artigen Raycaster gewachsen, aber komplett auf Horror
umgebaut: Dunkelheit, Taschenlampe, eine stalkende Kreatur, ein begehbares
Haus mit Garten und Zaun, Decke, Distanz-Nebel, Sanity-System und Flucht-Ziel.

Du erwachst nachts im Garten eines verlassenen Hauses. Etwas ist hier mit dir.
Finde die drei Schluessel, entriegle das Gartentor und entkomme - bevor es
dich findet.

Steuerung:
    Maus               - Umsehen (X = drehen, Y = hoch/runter)
    W / A / S / D      - Bewegen
    SHIFT              - Rennen (verbraucht Ausdauer)
    F                  - Taschenlampe an/aus (Akku begrenzt)
    E                  - Tuer oeffnen/schliessen, Notiz lesen
    ESC                - Pause / Beenden
    ENTER              - Start / Neustart

Ziel: 3 Schluessel finden -> Tor entriegeln -> durch das Tor entkommen.
"""

import array
import heapq
import math
import random

import pygame

# ----------------------------------------------------------------------------
# Grundkonfiguration
# ----------------------------------------------------------------------------
SCREEN_W, SCREEN_H = 800, 600
RENDER_W, RENDER_H = 400, 300            # interne Raycast-Aufloesung

FOV = math.radians(66)
HALF_FOV = FOV / 2
MAX_DEPTH = 22.0

# Bewegung
MOVE_SPEED = 2.6
SPRINT_SPEED = 4.3
MOUSE_TURN = 0.0026
PLAYER_RADIUS = 0.22
CREATURE_RADIUS = 0.30

# Umsehen (Pitch) + Kopf-Wippen per Y-Shearing
PITCH_LIMIT = math.radians(26)
MOUSE_PITCH_SPEED = 0.0021
MAX_PITCH_SHIFT = 90.0
SHIFT_CLAMP = 135.0
GRADIENT_MARGIN = 150
BOB_AMP = 5.0

# Ausdauer (Rennen)
STAMINA_MAX = 100.0
STAMINA_DRAIN = 26.0
STAMINA_REGEN = 16.0

# Taschenlampe / Licht
AMBIENT_LIGHT = 0.11                       # Grundhelligkeit (sehr dunkel)
FLASH_LIGHT = 1.0
FLASH_BEAM_HALF = math.radians(19)        # Kegel-Halbwinkel fuers Wand-Shading
FLASH_MAX_BATTERY = 100.0
FLASH_DRAIN = 2.6                         # Akku/Sekunde wenn an
FLASH_BATTERY_PER_PICKUP = 45.0
FOG_TINT = (10, 13, 18)                   # kalter Nebel-/Dunkelton

# Sanity / Angst
SANITY_MAX = 100.0
SANITY_DRAIN_DARK = 1.1
SANITY_DRAIN_CREATURE = 9.0
SANITY_REGEN = 1.4

# Kreatur
CREATURE_SPEED_HUNT = 2.15
CREATURE_SPEED_LURK = 1.05
CREATURE_UNSEEN_BONUS = 1.5               # schneller, wenn nicht angeschaut
CREATURE_CONTACT_RANGE = 0.8
CREATURE_DAMAGE = 24
CREATURE_SANITY_HIT = 22.0
CREATURE_REPATH_INTERVAL = 0.4
CREATURE_SIGHT_RANGE = 13.0

# Spieler-Gesundheit
PLAYER_MAX_HEALTH = 100

# Ziel
KEYS_REQUIRED = 3

# Texturen
TEX_SIZE = 64
NUM_SHADES = 16

# Wand-Materialien (Basisfarben fuer prozedurale Texturen)
WALL_BASE_COLORS = {
    "H": (66, 56, 48),    # Haus-Aussenwand: verwittertes Holz/Stein
    "W": (92, 84, 73),    # Innenwand: vergilbte Tapete
    "F": (58, 49, 41),    # Zaun: dunkles Holz
    "#": (26, 27, 32),    # Weltgrenze: fast schwarzer Stein (dunkler Wald)
    "R": (74, 71, 66),    # Fels / Ruinenmauer
    "D": (104, 73, 42),   # Tuer: Holz
    "G": (54, 57, 64),    # Tor: Eisengitter
}
SOLID_SYMBOLS = set(WALL_BASE_COLORS.keys())

# ----------------------------------------------------------------------------
# Level-Geometrie: Garten mit Zaun + Tor, begehbares Haus mit Raeumen.
# Programmatisch aus Rechtecken gebaut und vorab per BFS auf vollstaendige
# Erreichbarkeit geprueft (auch mit blockierenden Props).
# ----------------------------------------------------------------------------
LEVEL_W, LEVEL_H = 48, 40

HOUSE = (11, 5, 37, 25)        # x0, y0, x1, y1 (exklusiv)
VWALL_X = 22
HWALL_Y_W = 14
HWALL_Y_E = 15
GATE_CELL = (24, 38)
ENTRANCE = (24, 24)

INTERIOR_DOORS = [(22, 19), (22, 9), (16, 14), (29, 15)]
ALL_DOORS = [ENTRANCE] + INTERIOR_DOORS

# Gegenstaende
KEY_SPAWNS = [(14, 8), (32, 9), (30, 21)]
BATTERY_SPAWNS = [(5, 34), (42, 6), (18, 20), (25, 11), (8, 12)]
NOTE_SPAWNS = [(14, 12), (33, 20)]

# Notiz-Texte (Story-Schnipsel)
NOTE_TEXTS = [
    ["Tag 3. Ich hoere es nachts im Flur.",
     "Die Tueren halten es nicht lange auf.",
     "Drei Schluessel. Dann das Tor.",
     "Mehr Plan habe ich nicht."],
    ["Es kommt naeher, wenn das Licht stirbt.",
     "Und es kommt naeher, wenn ich wegsehe.",
     "Also sehe ich es an.",
     "Aber dann sieht es mich auch."],
]

CREATURE_START = (33.5, 8.5)
PLAYER_START = (24.5, 35.5, -math.pi / 2)

# Props: Garten = tote Baeume 'T', Grabsteine 'g', Laternen 'L', Busch 'b',
# Stein 'r'; Innen = Tisch 'm', Regal 'h', Bett 'e', Stuhl 'c', Blut 'x'.
PROP_PLAN = {
    "T": [(4, 4), (43, 4), (4, 35), (43, 35), (8, 31), (40, 30), (6, 9), (41, 12)],
    "g": [(5, 33), (7, 33), (6, 34), (4, 30), (8, 28)],
    "L": [(24, 31), (24, 28), (20, 26), (28, 26), (3, 20), (44, 20)],
    "b": [(15, 30), (33, 30), (12, 34), (36, 34), (18, 4), (30, 4)],
    "r": [(10, 18), (38, 12)],
    "e": [(13, 7)],
    "h": [(20, 7), (34, 7), (34, 22), (13, 17)],
    "m": [(17, 11), (28, 8), (28, 21)],
    "c": [(26, 21), (30, 8)],
    "x": [(15, 19), (32, 18), (24, 23)],
}
PROP_BLOCKING = {
    "T": True, "g": True, "r": True, "e": True, "h": True, "m": True, "c": True,
    "L": False, "b": False, "x": False,
}
LIGHT_PROP = "L"               # wirft Glanzlicht


def _fill_rect(grid, x0, y0, x1, y1, ch):
    for y in range(max(0, y0), min(LEVEL_H, y1)):
        for x in range(max(0, x0), min(LEVEL_W, x1)):
            grid[y][x] = ch


def _border_rect(grid, x0, y0, x1, y1, ch):
    for x in range(x0, x1):
        grid[y0][x] = ch
        grid[y1 - 1][x] = ch
    for y in range(y0, y1):
        grid[y][x0] = ch
        grid[y][x1 - 1] = ch


def build_level():
    grid = [["#"] * LEVEL_W for _ in range(LEVEL_H)]

    # Garten-Boden + Zaun-Ring
    _fill_rect(grid, 1, 1, LEVEL_W - 1, LEVEL_H - 1, ".")
    _border_rect(grid, 1, 1, LEVEL_W - 1, LEVEL_H - 1, "F")
    _fill_rect(grid, 2, 2, LEVEL_W - 2, LEVEL_H - 2, ".")

    # Gartentor + Durchgang nach "draussen"
    gx, gy = GATE_CELL
    grid[gy][gx] = "G"
    grid[gy + 1][gx] = "."

    # Haus: Aussenwaende + Innenboden
    hx0, hy0, hx1, hy1 = HOUSE
    _border_rect(grid, hx0, hy0, hx1, hy1, "H")
    _fill_rect(grid, hx0 + 1, hy0 + 1, hx1 - 1, hy1 - 1, ":")

    # Innenwaende -> Raeume
    for y in range(hy0 + 1, hy1 - 1):
        grid[y][VWALL_X] = "W"
    for x in range(hx0 + 1, VWALL_X):
        grid[HWALL_Y_W][x] = "W"
    for x in range(VWALL_X + 1, hx1 - 1):
        grid[HWALL_Y_E][x] = "W"

    # Tueren
    for (dx, dy) in ALL_DOORS:
        grid[dy][dx] = "D"

    game_map = ["".join(row) for row in grid]

    indoor = {(x, y) for y in range(LEVEL_H) for x in range(LEVEL_W)
              if game_map[y][x] == ":"}

    blocking = set()
    prop_cells = {}
    for sym, coords in PROP_PLAN.items():
        for (x, y) in coords:
            prop_cells[(x, y)] = sym
            if PROP_BLOCKING[sym]:
                blocking.add((x, y))

    return game_map, indoor, blocking, prop_cells


GAME_MAP, INDOOR_CELLS, BLOCKING_PROP_CELLS, PROP_CELLS = build_level()
MAP_H = len(GAME_MAP)
MAP_W = len(GAME_MAP[0])


def map_at(ix, iy):
    if 0 <= iy < MAP_H and 0 <= ix < MAP_W:
        return GAME_MAP[iy][ix]
    return "#"


# ----------------------------------------------------------------------------
# Tueren & Tor: Laufzeit-Zustand
# ----------------------------------------------------------------------------
class WorldState:
    """Veraenderlicher Weltzustand (Tueren, Tor) - getrennt von der Geometrie,
    damit reset_game() ihn frisch aufsetzen kann."""

    def __init__(self):
        # Tueren starten geschlossen; Tor verriegelt bis alle Schluessel da sind
        self.doors = {cell: False for cell in ALL_DOORS}   # cell -> offen?
        self.gate_unlocked = False

    def door_open(self, ix, iy):
        return self.doors.get((ix, iy), False)


def is_walkable(ix, iy, world):
    """Begehbar fuer Bewegung/Pathfinding (ohne blockierende Props)."""
    sym = map_at(ix, iy)
    if sym in (".", ":"):
        return True
    if sym == "D":
        return world.door_open(ix, iy)
    if sym == "G":
        return world.gate_unlocked
    return False


def is_blocked(x, y, world):
    """Bewegungs-Kollision: Wand, geschlossene Tuer/Tor oder blockierender Prop."""
    ix, iy = int(x), int(y)
    if not is_walkable(ix, iy, world):
        return True
    return (ix, iy) in BLOCKING_PROP_CELLS


def ray_solid(ix, iy, world):
    """Liefert das zu zeichnende Wandsymbol, wenn der Strahl hier stoppt, sonst
    None (Strahl laeuft weiter). Geschlossene Tueren/verriegeltes Tor sind
    solide und werden gerendert; offene Tueren / entriegeltes Tor sind frei."""
    sym = map_at(ix, iy)
    if sym in (".", ":"):
        return None
    if sym == "D":
        return None if world.door_open(ix, iy) else "D"
    if sym == "G":
        return None if world.gate_unlocked else "G"
    return sym  # echte Wand


# ----------------------------------------------------------------------------
# A*-Pathfinding (mit Tuer-Bewusstsein): die Kreatur navigiert um Waende und
# durch Tueren. Geschlossene Tueren sind passierbar, aber teuer - die Kreatur
# bevorzugt offene Wege und oeffnet eine Tuer nur, wenn noetig (Horror-Effekt).
# ----------------------------------------------------------------------------
def _heuristic(a, b):
    return abs(a[0] - b[0]) + abs(a[1] - b[1])


def _path_passable(ix, iy, world):
    sym = map_at(ix, iy)
    if sym in (".", ":", "D"):
        passable = True
    elif sym == "G":
        passable = world.gate_unlocked
    else:
        passable = False
    if not passable:
        return False, 0
    if (ix, iy) in BLOCKING_PROP_CELLS:
        return False, 0
    # geschlossene Tuer: passierbar, aber hohe Kosten
    extra = 0
    if sym == "D" and not world.door_open(ix, iy):
        extra = 6
    return True, extra


def find_path(start, goal, world, max_nodes=900):
    if start == goal:
        return [start]
    ok, _ = _path_passable(goal[0], goal[1], world)
    if not ok:
        return None

    open_heap = [(0, start)]
    came_from = {}
    g_score = {start: 0}
    visited = set()
    nodes = 0

    while open_heap:
        _, current = heapq.heappop(open_heap)
        if current in visited:
            continue
        visited.add(current)
        nodes += 1

        if current == goal:
            path = [current]
            while current in came_from:
                current = came_from[current]
                path.append(current)
            path.reverse()
            return path

        if nodes > max_nodes:
            return None

        cx, cy = current
        for nxt in ((cx + 1, cy), (cx - 1, cy), (cx, cy + 1), (cx, cy - 1)):
            passable, extra = _path_passable(nxt[0], nxt[1], world)
            if not passable:
                continue
            tentative = g_score[current] + 1 + extra
            if tentative < g_score.get(nxt, 1 << 30):
                g_score[nxt] = tentative
                came_from[nxt] = current
                heapq.heappush(open_heap, (tentative + _heuristic(nxt, goal), nxt))

    return None


# ----------------------------------------------------------------------------
# Prozeduraler Sound (stdlib 'array', kein numpy noetig). Alles defensiv
# gekapselt: faellt das Audiogeraet aus, laeuft das Spiel einfach still weiter.
# ----------------------------------------------------------------------------
AUDIO_RATE = 22050


def _env(i, n, attack=0.01, release=0.2):
    """Lautstaerke-Huellkurve 0..1 fuer Sample i von n (Attack/Sustain/Release)."""
    t = i / max(1, n)
    a = min(1.0, (i / max(1, int(n * attack)))) if attack > 0 else 1.0
    r = min(1.0, ((n - i) / max(1, int(n * release)))) if release > 0 else 1.0
    return a * r


class AudioEngine:
    def __init__(self):
        self.enabled = False
        self.channels = 1
        self.rate = AUDIO_RATE
        self.sounds = {}
        self._ambient_chan = None
        self._heartbeat_chan = None
        try:
            pygame.mixer.pre_init(AUDIO_RATE, -16, 1, 512)
            pygame.mixer.init()
            info = pygame.mixer.get_init()
            if not info:
                return
            self.rate = info[0]
            self.channels = info[2]
            pygame.mixer.set_num_channels(24)
            self._build_all()
            self.enabled = True
        except Exception:
            self.enabled = False

    # ---- Konvertierung float-Samples -> pygame.Sound ----
    def _to_sound(self, samples):
        buf = array.array("h")
        stereo = self.channels == 2
        for s in samples:
            v = int(max(-1.0, min(1.0, s)) * 30000)
            buf.append(v)
            if stereo:
                buf.append(v)
        return pygame.mixer.Sound(buffer=buf.tobytes())

    # ---- Synth-Bausteine ----
    def _noise(self, dur, vol=1.0, attack=0.01, release=0.4, lowpass=0.0):
        n = int(dur * self.rate)
        out = [0.0] * n
        prev = 0.0
        for i in range(n):
            white = random.uniform(-1.0, 1.0)
            if lowpass > 0.0:
                prev = prev + (white - prev) * (1.0 - lowpass)
                white = prev
            out[i] = white * vol * _env(i, n, attack, release)
        return out

    def _tone(self, freq, dur, vol=1.0, decay=3.0, vibrato=0.0, vib_rate=5.0):
        n = int(dur * self.rate)
        out = [0.0] * n
        for i in range(n):
            t = i / self.rate
            f = freq * (1.0 + vibrato * math.sin(2 * math.pi * vib_rate * t))
            env = math.exp(-decay * t)
            out[i] = math.sin(2 * math.pi * f * t) * vol * env
        return out

    def _mix(self, *layers):
        n = max(len(l) for l in layers)
        out = [0.0] * n
        for layer in layers:
            for i, s in enumerate(layer):
                out[i] += s
        return out

    def _build_all(self):
        random.seed(1337)

        # Herzschlag: zwei tiefe Thumps + Stille (loopbar)
        thump1 = self._tone(58, 0.16, vol=0.9, decay=14.0)
        thump2 = self._tone(46, 0.20, vol=0.7, decay=12.0)
        gap = [0.0] * int(0.10 * self.rate)
        rest = [0.0] * int(0.62 * self.rate)
        self.sounds["heartbeat"] = self._to_sound(thump1 + gap + thump2 + rest)

        # Ambient-Drone: zwei dissonante tiefe Sinus + langsames Rauschen (loop)
        n = int(3.0 * self.rate)
        drone = [0.0] * n
        for i in range(n):
            t = i / self.rate
            a = math.sin(2 * math.pi * 55 * t)
            b = math.sin(2 * math.pi * 58.7 * t)
            trem = 0.6 + 0.4 * math.sin(2 * math.pi * 0.13 * t)
            drone[i] = (a + b) * 0.16 * trem
        wind = self._noise(3.0, vol=0.05, attack=0.2, release=0.2, lowpass=0.04)
        self.sounds["ambient"] = self._to_sound(self._mix(drone, wind))

        # Schritt: kurzer dumpfer Rausch-Burst
        self.sounds["step"] = self._to_sound(
            self._noise(0.13, vol=0.5, attack=0.02, release=0.6, lowpass=0.10))

        # Fluestern: gefiltertes Rauschen, mittellang
        self.sounds["whisper"] = self._to_sound(
            self._noise(0.9, vol=0.5, attack=0.25, release=0.4, lowpass=0.22))

        # Schreck-Sting: aufsteigender, dissonanter Ton + Rauschtreffer
        n = int(0.7 * self.rate)
        sting = [0.0] * n
        for i in range(n):
            t = i / self.rate
            f = 220 + 900 * (t / 0.7)
            env = _env(i, n, 0.005, 0.5)
            sting[i] = (math.sin(2 * math.pi * f * t)
                        + 0.5 * math.sin(2 * math.pi * f * 1.5 * t)) * 0.4 * env
        hit = self._noise(0.7, vol=0.45, attack=0.002, release=0.7, lowpass=0.0)
        self.sounds["scare"] = self._to_sound(self._mix(sting, hit))

        # Tuer-Knarren: absteigender, modulierter Ton
        self.sounds["door"] = self._to_sound(
            self._tone(160, 0.6, vol=0.4, decay=2.5, vibrato=0.25, vib_rate=11.0))

        # Aufsammeln: freundlicher Zweiklang
        self.sounds["pickup"] = self._to_sound(
            self._tone(660, 0.10, vol=0.4, decay=8.0)
            + self._tone(990, 0.12, vol=0.4, decay=8.0))

        # Schluessel: hellerer Dreiklang
        self.sounds["key"] = self._to_sound(
            self._tone(720, 0.10, vol=0.4, decay=7.0)
            + self._tone(960, 0.10, vol=0.4, decay=7.0)
            + self._tone(1200, 0.16, vol=0.4, decay=6.0))

        # Akku schwach: kurzer Warnton
        self.sounds["lowbeep"] = self._to_sound(self._tone(420, 0.18, vol=0.3, decay=6.0))

        # Tor entriegelt / Sieg-Klang: metallischer Klang + Ring
        clank = self._noise(0.25, vol=0.4, attack=0.001, release=0.8, lowpass=0.0)
        ring = self._tone(300, 0.7, vol=0.3, decay=3.0)
        self.sounds["gate"] = self._to_sound(self._mix(clank, ring))

    # ---- Wiedergabe ----
    def play(self, name, vol=1.0, pan=0.0):
        if not self.enabled:
            return
        snd = self.sounds.get(name)
        if not snd:
            return
        try:
            chan = snd.play()
            if chan:
                left = max(0.0, min(1.0, vol * (1.0 - max(0.0, pan))))
                right = max(0.0, min(1.0, vol * (1.0 + min(0.0, pan))))
                chan.set_volume(left, right)
        except Exception:
            pass

    def start_ambient(self):
        if not self.enabled or self._ambient_chan:
            return
        try:
            self._ambient_chan = self.sounds["ambient"].play(loops=-1)
            if self._ambient_chan:
                self._ambient_chan.set_volume(0.55)
        except Exception:
            pass

    def set_heartbeat(self, intensity):
        if not self.enabled:
            return
        try:
            if intensity <= 0.02:
                if self._heartbeat_chan:
                    self._heartbeat_chan.stop()
                    self._heartbeat_chan = None
                return
            if not self._heartbeat_chan:
                self._heartbeat_chan = self.sounds["heartbeat"].play(loops=-1)
            if self._heartbeat_chan:
                self._heartbeat_chan.set_volume(min(1.0, intensity))
        except Exception:
            pass

    def stop_all(self):
        if not self.enabled:
            return
        try:
            pygame.mixer.stop()
        except Exception:
            pass
        self._ambient_chan = None
        self._heartbeat_chan = None


AUDIO = None  # wird in main() / Tests initialisiert


def get_audio():
    return AUDIO


# ----------------------------------------------------------------------------
# Prozedurale Wandtexturen mit Pseudo-Relief (gerichtete Schattierung) und
# zufaelligen Flecken/Rissen. Einmalig vorgerendert, je Material NUM_SHADES
# Helligkeitsstufen (mit kaltem Nebel-Tint fuer ferne/dunkle Stufen).
# ----------------------------------------------------------------------------
def _clampc(c):
    return (max(0, min(255, int(c[0]))), max(0, min(255, int(c[1]))), max(0, min(255, int(c[2]))))


def _shade_px(color, amt):
    return _clampc((color[0] * amt, color[1] * amt, color[2] * amt))


def _relief(base):
    """Gerichtete Schattierung (oben-links heller) fuer Plastizitaet."""
    tex = pygame.Surface((TEX_SIZE, TEX_SIZE))
    for y in range(TEX_SIZE):
        for x in range(TEX_SIZE):
            grad = 1.12 - 0.30 * (x / TEX_SIZE) - 0.18 * (y / TEX_SIZE)
            tex.set_at((x, y), _shade_px(base, grad))
    return tex


def _make_wood(base, rng, planks=5, vertical=True):
    tex = _relief(base)
    for p in range(1, planks):
        line = int(p * TEX_SIZE / planks)
        for q in range(TEX_SIZE):
            c = _shade_px(base, 0.45)
            if vertical:
                tex.set_at((line, q), c)
                if line + 1 < TEX_SIZE:
                    tex.set_at((line + 1, q), _shade_px(base, 0.7))
            else:
                tex.set_at((q, line), c)
                if line + 1 < TEX_SIZE:
                    tex.set_at((q, line + 1), _shade_px(base, 0.7))
    # Holzmaserung
    for _ in range(90):
        x = rng.randrange(TEX_SIZE)
        y = rng.randrange(TEX_SIZE)
        tex.set_at((x, y), _shade_px(base, rng.uniform(0.6, 1.05)))
    return tex


def _make_wallpaper(base, rng):
    tex = _relief(base)
    # vergilbte vertikale Streifen
    for x in range(TEX_SIZE):
        if (x // 4) % 2 == 0:
            for y in range(TEX_SIZE):
                px = tex.get_at((x, y))
                tex.set_at((x, y), _shade_px(px, 0.95))
    # Risse (dunkle, zackige Linien)
    for _ in range(3):
        x = rng.randrange(8, TEX_SIZE - 8)
        y = 0
        while y < TEX_SIZE:
            tex.set_at((max(0, min(TEX_SIZE - 1, x)), y), _shade_px(base, 0.25))
            x += rng.randint(-1, 1)
            y += 1
    # Stockflecken
    for _ in range(5):
        cx, cy = rng.randrange(TEX_SIZE), rng.randrange(TEX_SIZE)
        rad = rng.randint(3, 7)
        for yy in range(-rad, rad):
            for xx in range(-rad, rad):
                if xx * xx + yy * yy <= rad * rad:
                    px = (cx + xx) % TEX_SIZE, (cy + yy) % TEX_SIZE
                    tex.set_at(px, _shade_px(tex.get_at(px), rng.uniform(0.55, 0.8)))
    return tex


def _make_stone(base, rng):
    tex = _relief(base)
    for _ in range(160):
        x, y = rng.randrange(TEX_SIZE), rng.randrange(TEX_SIZE)
        tex.set_at((x, y), _shade_px(base, rng.uniform(0.55, 1.1)))
    # Mauerfugen
    for p in range(1, 4):
        yy = int(p * TEX_SIZE / 4)
        for x in range(TEX_SIZE):
            tex.set_at((x, yy), _shade_px(base, 0.4))
    return tex


def _make_door(base, rng):
    tex = _make_wood(base, rng, planks=3, vertical=True)
    # Tuergriff
    pygame.draw.circle(tex, _clampc((210, 200, 120)), (TEX_SIZE - 14, TEX_SIZE // 2), 3)
    # Rahmen
    pygame.draw.rect(tex, _shade_px(base, 0.4), (0, 0, TEX_SIZE, TEX_SIZE), 2)
    return tex


def _make_gate(base, rng):
    tex = pygame.Surface((TEX_SIZE, TEX_SIZE))
    tex.fill(_shade_px(base, 0.35))
    for bx in range(4, TEX_SIZE, 10):
        pygame.draw.rect(tex, _shade_px(base, 1.2), (bx, 2, 3, TEX_SIZE - 4))
    pygame.draw.rect(tex, _shade_px(base, 1.3), (2, 6, TEX_SIZE - 4, 3))
    pygame.draw.rect(tex, _shade_px(base, 1.3), (2, TEX_SIZE - 12, TEX_SIZE - 4, 3))
    return tex


def _make_forest(base, rng):
    tex = pygame.Surface((TEX_SIZE, TEX_SIZE))
    for y in range(TEX_SIZE):
        for x in range(TEX_SIZE):
            n = rng.uniform(0.7, 1.3)
            tex.set_at((x, y), _shade_px(base, n))
    return tex


def build_wall_textures():
    rng = random.Random(99)
    base = {
        "H": _make_wood(WALL_BASE_COLORS["H"], rng, planks=6, vertical=True),
        "W": _make_wallpaper(WALL_BASE_COLORS["W"], rng),
        "F": _make_wood(WALL_BASE_COLORS["F"], rng, planks=7, vertical=True),
        "#": _make_forest(WALL_BASE_COLORS["#"], rng),
        "R": _make_stone(WALL_BASE_COLORS["R"], rng),
        "D": _make_door(WALL_BASE_COLORS["D"], rng),
        "G": _make_gate(WALL_BASE_COLORS["G"], rng),
    }
    shaded = {}
    fog_max = _clampc((FOG_TINT[0] * 0.9, FOG_TINT[1] * 0.9, FOG_TINT[2] * 0.9))
    for symbol, surf in base.items():
        variants = []
        for i in range(NUM_SHADES):
            factor = 0.10 + 0.90 * (i / (NUM_SHADES - 1))
            variant = surf.copy()
            gray = max(0, min(255, int(255 * factor)))
            dark = pygame.Surface((TEX_SIZE, TEX_SIZE))
            dark.fill((gray, gray, gray))
            variant.blit(dark, (0, 0), special_flags=pygame.BLEND_RGB_MULT)
            # kalter Nebel-Tint auf dunkle (ferne) Stufen
            tint = (1.0 - factor) * 0.6
            fog = pygame.Surface((TEX_SIZE, TEX_SIZE))
            fog.fill(_clampc((fog_max[0] * tint, fog_max[1] * tint, fog_max[2] * tint)))
            variant.blit(fog, (0, 0), special_flags=pygame.BLEND_RGB_ADD)
            variants.append(variant.convert())
        shaded[symbol] = variants
    return shaded


# ----------------------------------------------------------------------------
# Decken-/Boden-Gradienten (getrennt fuer innen/aussen, per-Frame umgeschaltet)
# ----------------------------------------------------------------------------
def _lerp(a, b, t):
    return (int(a[0] + (b[0] - a[0]) * t),
            int(a[1] + (b[1] - a[1]) * t),
            int(a[2] + (b[2] - a[2]) * t))


def _gradient(top, bottom):
    h = RENDER_H // 2 + GRADIENT_MARGIN
    surf = pygame.Surface((RENDER_W, h))
    for y in range(h):
        t = y / (h - 1)
        pygame.draw.line(surf, _lerp(top, bottom, t), (0, y), (RENDER_W, y))
    return surf.convert()


def build_gradients():
    grads = {
        # aussen: Nachthimmel (oben fast schwarz -> Horizont kalt-blau)
        "sky": _gradient((3, 4, 9), (16, 19, 30)),
        # innen-Decke: dunkles Holz/Putz (oben fast schwarz -> Horizont braun-grau)
        "ceil_in": _gradient((6, 5, 6), (24, 21, 20)),
        # aussen-Boden: dunkle Erde
        "floor_out": _gradient((20, 20, 22), (30, 27, 22)),
        # innen-Boden: dunkle Dielen
        "floor_in": _gradient((22, 18, 14), (34, 27, 20)),
    }
    return grads


# ----------------------------------------------------------------------------
# Atmosphaere-Overlays: Dunkelheit/Taschenlampen-Maske + Vignette, Filmkorn,
# Laternen-Gluehen. Niedrig aufgeloest gebaut und hochskaliert (schnell).
# ----------------------------------------------------------------------------
def _build_darkness(hole_rx, hole_ry, edge_alpha=255, core_alpha=0, cx_frac=0.5, cy_frac=0.5):
    lw, lh = 200, 150
    surf = pygame.Surface((lw, lh), pygame.SRCALPHA)
    cx, cy = lw * cx_frac, lh * cy_frac
    for y in range(lh):
        for x in range(lw):
            dx = (x - cx) / (hole_rx * lw)
            dy = (y - cy) / (hole_ry * lh)
            d = math.sqrt(dx * dx + dy * dy)
            if d <= 1.0:
                a = core_alpha + (edge_alpha - core_alpha) * (d ** 2.2)
            else:
                a = edge_alpha
            surf.set_at((x, y), (0, 0, 0, max(0, min(255, int(a)))))
    return pygame.transform.smoothscale(surf, (SCREEN_W, SCREEN_H))


def build_overlays():
    overlays = {
        # Taschenlampe an: breiter, weicher Kegel
        "flash_on": _build_darkness(0.66, 0.74, edge_alpha=242, core_alpha=0, cy_frac=0.48),
        # Taschenlampe aus: nur winziger Schimmer um den Spieler
        "flash_off": _build_darkness(0.26, 0.30, edge_alpha=255, core_alpha=70, cy_frac=0.52),
    }
    # Filmkorn-Frames (klein gebaut, hochskaliert, dann fertig gecached)
    grain = []
    rng = random.Random(7)
    for _ in range(8):
        g = pygame.Surface((200, 150), pygame.SRCALPHA)
        for y in range(150):
            for x in range(200):
                v = rng.randint(0, 60)
                g.set_at((x, y), (v, v, v, rng.randint(0, 38)))
        grain.append(pygame.transform.smoothscale(g, (SCREEN_W, SCREEN_H)))
    overlays["grain"] = grain

    # Weiches Gluehen (additiv) fuer Laternen/Items
    gr = 48
    glow = pygame.Surface((gr * 2, gr * 2), pygame.SRCALPHA)
    for y in range(gr * 2):
        for x in range(gr * 2):
            d = math.hypot(x - gr, y - gr) / gr
            if d < 1.0:
                a = int(120 * (1.0 - d) ** 2.2)
                glow.set_at((x, y), (255, 196, 120, a))
    overlays["glow"] = glow
    return overlays


# ----------------------------------------------------------------------------
# SpriteBank: prozedural gezeichnete, plastisch schattierte Billboards fuer
# Kreatur (mehrere Frames), Props und Items. Jede Spalte wird beim Rendern
# einzeln tiefengetestet, sodass Verdeckung und Transparenz stimmen.
# Welt-Groessen (Hoehe, Breite in Tiles) je Sorte:
# ----------------------------------------------------------------------------
SPRITE_WORLD = {
    "creature": (2.25, 0.95),
    "T": (3.0, 1.5), "g": (1.1, 0.9), "L": (1.5, 0.55), "b": (0.7, 1.05),
    "r": (0.6, 1.1), "e": (0.7, 1.7), "h": (1.85, 1.15), "m": (0.95, 1.25),
    "c": (1.0, 0.7), "x": (0.10, 1.1),
    "key": (0.4, 0.4), "battery": (0.42, 0.3), "note": (0.42, 0.36),
}


def _apply_volume(surf, strength=0.5, floor_shadow=0.35):
    w, h = surf.get_size()
    for x in range(w):
        hx = 1.0 - abs((x / max(1, w - 1)) - 0.5) * 2.0
        fx = (1.0 - strength) + strength * hx
        for y in range(h):
            px = surf.get_at((x, y))
            if px.a > 0:
                fy = 1.0 - floor_shadow * (y / max(1, h - 1)) ** 3
                f = fx * fy
                surf.set_at((x, y), (int(px.r * f), int(px.g * f), int(px.b * f), px.a))


def _mottle(surf, rng, amt=0.25, density=0.4):
    w, h = surf.get_size()
    for _ in range(int(w * h * density)):
        x, y = rng.randrange(w), rng.randrange(h)
        px = surf.get_at((x, y))
        if px.a > 0:
            f = 1.0 + rng.uniform(-amt, amt)
            surf.set_at((x, y), (_clampc((px.r * f, px.g * f, px.b * f)) + (px.a,)))


def _draw_creature(frame, rng):
    w, h = 56, 112
    s = pygame.Surface((w, h), pygame.SRCALPHA)
    skin = (146, 150, 138)
    dark = (70, 74, 70)
    cx = w // 2
    bob = int(2 * math.sin(frame * math.pi / 2))
    swing = math.sin(frame * math.pi / 2)
    attack = frame == 4

    # Beine (abwechselnder Schritt)
    la = swing * 6
    ra = -swing * 6
    pygame.draw.polygon(s, dark, [(cx - 7, 64), (cx - 1, 64),
                                  (cx - 3 + la, 110), (cx - 9 + la, 110)])
    pygame.draw.polygon(s, dark, [(cx + 1, 64), (cx + 7, 64),
                                  (cx + 9 + ra, 110), (cx + 3 + ra, 110)])
    # Torso (schmal, leicht gebeugt)
    pygame.draw.polygon(s, skin, [(cx - 8, 34 + bob), (cx + 8, 34 + bob),
                                  (cx + 6, 66), (cx - 6, 66)])
    # Arme (lang; im Angriff nach vorn/oben)
    if attack:
        pygame.draw.polygon(s, skin, [(cx - 8, 36), (cx - 4, 36), (cx - 18, 14), (cx - 22, 16)])
        pygame.draw.polygon(s, skin, [(cx + 4, 36), (cx + 8, 36), (cx + 22, 16), (cx + 18, 14)])
    else:
        al = swing * 5
        pygame.draw.polygon(s, skin, [(cx - 8, 36), (cx - 4, 36),
                                      (cx - 10 + al, 72), (cx - 14 + al, 70)])
        pygame.draw.polygon(s, skin, [(cx + 4, 36), (cx + 8, 36),
                                      (cx + 14 - al, 70), (cx + 10 - al, 72)])
    # Kopf (kahl, laenglich)
    pygame.draw.ellipse(s, skin, (cx - 8, 12 + bob, 16, 24))
    # Hohle dunkle Augen + aufgerissener Mund
    pygame.draw.ellipse(s, (8, 8, 10), (cx - 6, 19 + bob, 5, 7))
    pygame.draw.ellipse(s, (8, 8, 10), (cx + 1, 19 + bob, 5, 7))
    if attack:
        pygame.draw.ellipse(s, (10, 6, 8), (cx - 4, 28 + bob, 8, 7))
    else:
        pygame.draw.line(s, (20, 12, 14), (cx - 3, 30 + bob), (cx + 3, 30 + bob), 2)

    _apply_volume(s, strength=0.55, floor_shadow=0.2)
    _mottle(s, rng, amt=0.22, density=0.5)
    return s


def _draw_tree(rng):
    w, h = 64, 112
    s = pygame.Surface((w, h), pygame.SRCALPHA)
    trunk = (52, 40, 30)
    cx = w // 2
    pygame.draw.polygon(s, trunk, [(cx - 6, h), (cx + 6, h), (cx + 3, 30), (cx - 3, 30)])
    # kahle, krumme Aeste
    branches = [(-1, 46, -20, 18), (1, 40, 22, 14), (-1, 60, -16, 40),
                (1, 56, 18, 36), (0, 32, -8, 6), (0, 30, 10, 4)]
    for sx, sy, ex, ey in branches:
        pygame.draw.line(s, trunk, (cx + sx, sy), (cx + ex, ey), 3)
        pygame.draw.line(s, trunk, (cx + ex, ey), (cx + ex + (4 if ex > 0 else -4), ey - 8), 2)
    _apply_volume(s, strength=0.5, floor_shadow=0.1)
    _mottle(s, rng, amt=0.2, density=0.3)
    return s


def _draw_gravestone(rng):
    w, h = 44, 60
    s = pygame.Surface((w, h), pygame.SRCALPHA)
    stone = (108, 110, 112)
    pygame.draw.rect(s, stone, (8, 18, w - 16, h - 18))
    pygame.draw.ellipse(s, stone, (8, 6, w - 16, 26))
    # Riss
    pygame.draw.line(s, _shade_px(stone, 0.5), (w // 2 + 4, 20), (w // 2 - 2, h - 6), 1)
    # verwitterte Inschrift
    pygame.draw.line(s, _shade_px(stone, 0.55), (16, 30), (w - 16, 30), 1)
    pygame.draw.line(s, _shade_px(stone, 0.55), (16, 36), (w - 20, 36), 1)
    _apply_volume(s, strength=0.45, floor_shadow=0.25)
    _mottle(s, rng, amt=0.2, density=0.5)
    return s


def _draw_lantern(rng):
    w, h = 28, 80
    s = pygame.Surface((w, h), pygame.SRCALPHA)
    post = (44, 40, 36)
    cx = w // 2
    pygame.draw.rect(s, post, (cx - 2, 24, 4, h - 24))
    pygame.draw.rect(s, post, (cx - 8, 10, 16, 18))           # Lampengehaeuse
    pygame.draw.rect(s, (255, 196, 110), (cx - 5, 13, 10, 12))  # leuchtende Scheibe
    pygame.draw.rect(s, post, (cx - 9, 6, 18, 5))
    _apply_volume(s, strength=0.35, floor_shadow=0.1)
    return s


def _draw_bush(rng):
    w, h = 56, 42
    s = pygame.Surface((w, h), pygame.SRCALPHA)
    green = (38, 58, 40)
    for _ in range(26):
        cx = rng.randint(10, w - 10)
        cy = rng.randint(12, h - 6)
        rad = rng.randint(6, 12)
        pygame.draw.circle(s, _shade_px(green, rng.uniform(0.7, 1.2)), (cx, cy), rad)
    _apply_volume(s, strength=0.4, floor_shadow=0.3)
    _mottle(s, rng, amt=0.25, density=0.4)
    return s


def _draw_rock(rng):
    w, h = 56, 36
    s = pygame.Surface((w, h), pygame.SRCALPHA)
    stone = (84, 82, 78)
    pygame.draw.polygon(s, stone, [(6, h), (12, 14), (26, 6), (44, 12), (50, h)])
    _apply_volume(s, strength=0.5, floor_shadow=0.3)
    _mottle(s, rng, amt=0.22, density=0.5)
    return s


def _draw_bed(rng):
    w, h = 84, 44
    s = pygame.Surface((w, h), pygame.SRCALPHA)
    frame = (70, 48, 36)
    sheet = (120, 112, 104)
    pygame.draw.rect(s, frame, (4, 16, w - 8, h - 16))
    pygame.draw.rect(s, sheet, (8, 18, w - 30, h - 22))
    pygame.draw.rect(s, (150, 146, 140), (10, 16, 20, 12))   # Kissen
    pygame.draw.rect(s, frame, (4, 6, 8, h - 6))             # Kopfteil
    _apply_volume(s, strength=0.4, floor_shadow=0.3)
    _mottle(s, rng, amt=0.18, density=0.3)
    return s


def _draw_shelf(rng):
    w, h = 56, 96
    s = pygame.Surface((w, h), pygame.SRCALPHA)
    wood = (66, 46, 32)
    pygame.draw.rect(s, wood, (4, 2, w - 8, h - 2))
    for shelf in range(1, 5):
        yy = int(shelf * h / 5)
        pygame.draw.rect(s, _shade_px(wood, 0.6), (6, yy, w - 12, 3))
        for bx in range(8, w - 10, 7):
            col = (rng.randint(60, 150), rng.randint(40, 110), rng.randint(40, 90))
            pygame.draw.rect(s, col, (bx, yy - rng.randint(10, 16), 5, rng.randint(10, 16)))
    _apply_volume(s, strength=0.45, floor_shadow=0.15)
    return s


def _draw_table(rng):
    w, h = 64, 46
    s = pygame.Surface((w, h), pygame.SRCALPHA)
    wood = (74, 52, 36)
    pygame.draw.rect(s, wood, (6, 12, w - 12, 8))
    for lx in (10, w - 14):
        pygame.draw.rect(s, _shade_px(wood, 0.7), (lx, 18, 5, h - 18))
    _apply_volume(s, strength=0.45, floor_shadow=0.3)
    _mottle(s, rng, amt=0.18, density=0.3)
    return s


def _draw_chair(rng):
    w, h = 40, 52
    s = pygame.Surface((w, h), pygame.SRCALPHA)
    wood = (78, 56, 38)
    pygame.draw.rect(s, wood, (8, 4, 6, h - 6))             # Rueckenlehne
    pygame.draw.rect(s, wood, (8, 24, w - 16, 6))           # Sitz
    for lx in (10, w - 14):
        pygame.draw.rect(s, _shade_px(wood, 0.7), (lx, 30, 4, h - 30))
    _apply_volume(s, strength=0.45, floor_shadow=0.3)
    return s


def _draw_blood(rng):
    w, h = 64, 22
    s = pygame.Surface((w, h), pygame.SRCALPHA)
    for _ in range(40):
        cx = rng.randint(8, w - 8)
        cy = rng.randint(8, h - 4)
        rad = rng.randint(2, 7)
        d = (rng.randint(70, 120), rng.randint(8, 22), rng.randint(8, 18))
        pygame.draw.circle(s, d, (cx, cy), rad)
    return s


def _draw_key(rng):
    w, h = 30, 30
    s = pygame.Surface((w, h), pygame.SRCALPHA)
    gold = (220, 188, 70)
    pygame.draw.circle(s, gold, (10, 15), 6, 2)
    pygame.draw.rect(s, gold, (14, 13, 12, 3))
    pygame.draw.rect(s, gold, (22, 13, 2, 7))
    pygame.draw.rect(s, gold, (25, 13, 2, 5))
    return s


def _draw_battery(rng):
    w, h = 24, 32
    s = pygame.Surface((w, h), pygame.SRCALPHA)
    body = (70, 130, 80)
    pygame.draw.rect(s, body, (5, 6, 14, 24))
    pygame.draw.rect(s, (180, 180, 180), (10, 2, 4, 4))
    pygame.draw.line(s, (230, 230, 230), (9, 14), (15, 14), 2)
    pygame.draw.line(s, (230, 230, 230), (12, 11), (12, 17), 2)   # +
    pygame.draw.line(s, (230, 230, 230), (9, 22), (15, 22), 2)    # -
    return s


def _draw_note(rng):
    w, h = 30, 32
    s = pygame.Surface((w, h), pygame.SRCALPHA)
    paper = (208, 200, 176)
    pygame.draw.rect(s, paper, (6, 4, 18, 24))
    for ly in range(8, 26, 4):
        pygame.draw.line(s, (120, 110, 90), (9, ly), (21, ly), 1)
    return s


class SpriteBank:
    def __init__(self):
        rng = random.Random(2024)
        self.frames = {
            "creature": [_draw_creature(f, rng) for f in range(5)],
            "T": [_draw_tree(rng)], "g": [_draw_gravestone(rng)],
            "L": [_draw_lantern(rng)], "b": [_draw_bush(rng)],
            "r": [_draw_rock(rng)], "e": [_draw_bed(rng)],
            "h": [_draw_shelf(rng)], "m": [_draw_table(rng)],
            "c": [_draw_chair(rng)], "x": [_draw_blood(rng)],
            "key": [_draw_key(rng)], "battery": [_draw_battery(rng)],
            "note": [_draw_note(rng)],
        }

    def get(self, kind, frame=0):
        seq = self.frames[kind]
        return seq[frame % len(seq)]


# ----------------------------------------------------------------------------
# Sichtlinie (fuer KI + "wird die Kreatur angeschaut?")
# ----------------------------------------------------------------------------
def has_line_of_sight(x0, y0, x1, y1, world, max_dist=CREATURE_SIGHT_RANGE):
    dx, dy = x1 - x0, y1 - y0
    dist = math.hypot(dx, dy)
    if dist > max_dist:
        return False
    if dist < 1e-6:
        return True
    steps = int(dist / 0.12) + 1
    sx, sy = dx / steps, dy / steps
    cx, cy = x0, y0
    for _ in range(steps):
        cx += sx
        cy += sy
        if ray_solid(int(cx), int(cy), world) is not None:
            return False
    return True


# ----------------------------------------------------------------------------
# Spieler
# ----------------------------------------------------------------------------
class Player:
    def __init__(self, x, y, angle=0.0):
        self.x = x
        self.y = y
        self.angle = angle
        self.pitch = 0.0
        self.health = PLAYER_MAX_HEALTH
        self.sanity = SANITY_MAX
        self.stamina = STAMINA_MAX
        self.flashlight_on = True
        self.battery = FLASH_MAX_BATTERY
        self.keys = 0
        self.batteries = 0
        self.notes_read = set()
        self.bob_phase = 0.0
        self.moving = False
        self.hurt_flash = 0.0
        self.low_battery_warned = False

    def try_move(self, dx, dy, world):
        nx = self.x + dx
        ny = self.y + dy
        if not is_blocked(nx + math.copysign(PLAYER_RADIUS, dx), self.y, world):
            self.x = nx
        if not is_blocked(self.x, ny + math.copysign(PLAYER_RADIUS, dy), world):
            self.y = ny

    def screen_shift(self):
        pitch_shift = (self.pitch / PITCH_LIMIT) * MAX_PITCH_SHIFT
        bob = math.sin(self.bob_phase) * BOB_AMP * (1.0 if self.moving else 0.0)
        return max(-SHIFT_CLAMP, min(SHIFT_CLAMP, pitch_shift + bob))

    def light_level(self):
        """0 = aus/leer, sonst Helligkeit (flackert bei schwachem Akku)."""
        if not self.flashlight_on or self.battery <= 0:
            return 0.0
        if self.battery < 18.0:
            return 0.55 + 0.45 * random.random()
        return 1.0

    def toggle_flashlight(self, audio):
        if self.battery <= 0:
            return
        self.flashlight_on = not self.flashlight_on
        if audio:
            audio.play("lowbeep", vol=0.25)

    def update(self, dt, keys, mouse_dx, mouse_dy, world):
        self.angle = (self.angle + mouse_dx * MOUSE_TURN) % (2 * math.pi)
        self.pitch = max(-PITCH_LIMIT, min(PITCH_LIMIT, self.pitch - mouse_dy * MOUSE_PITCH_SPEED))

        move_x = move_y = 0.0
        fwd = math.cos(self.angle), math.sin(self.angle)
        rgt = math.cos(self.angle + math.pi / 2), math.sin(self.angle + math.pi / 2)
        if keys[pygame.K_w]:
            move_x += fwd[0]; move_y += fwd[1]
        if keys[pygame.K_s]:
            move_x -= fwd[0]; move_y -= fwd[1]
        if keys[pygame.K_d]:
            move_x += rgt[0]; move_y += rgt[1]
        if keys[pygame.K_a]:
            move_x -= rgt[0]; move_y -= rgt[1]

        length = math.hypot(move_x, move_y)
        self.moving = length > 0
        want_sprint = (keys[pygame.K_LSHIFT] or keys[pygame.K_RSHIFT]) and self.stamina > 1.0
        speed = MOVE_SPEED
        if self.moving and want_sprint:
            speed = SPRINT_SPEED
            self.stamina = max(0.0, self.stamina - STAMINA_DRAIN * dt)
        else:
            self.stamina = min(STAMINA_MAX, self.stamina + STAMINA_REGEN * dt)

        if self.moving:
            move_x, move_y = move_x / length, move_y / length
            self.try_move(move_x * speed * dt, move_y * speed * dt, world)
            self.bob_phase += dt * (10.0 if speed > MOVE_SPEED else 7.0)

        # Taschenlampe verbraucht Akku
        if self.flashlight_on and self.battery > 0:
            self.battery = max(0.0, self.battery - FLASH_DRAIN * dt)
            if self.battery == 0:
                self.flashlight_on = False

        if self.hurt_flash > 0:
            self.hurt_flash -= dt

    def add_battery(self):
        self.battery = min(FLASH_MAX_BATTERY, self.battery + FLASH_BATTERY_PER_PICKUP)
        self.batteries += 1
        self.low_battery_warned = False


# ----------------------------------------------------------------------------
# Die Kreatur - stalkende Zustandsmaschine mit A*-Navigation
# ----------------------------------------------------------------------------
LURK, HUNT, HIDDEN = "lurk", "hunt", "hidden"


class Creature:
    def __init__(self, x, y):
        self.x = x
        self.y = y
        self.state = LURK
        self.path = []
        self.repath_timer = 0.0
        self.anim = 0.0
        self.frame = 0
        self.contact_cooldown = 0.0
        self.hidden_timer = 0.0
        self.step_timer = 0.0
        self.whisper_timer = random.uniform(3.0, 7.0)
        self.aggression = 0.0          # waechst mit der Zeit -> Spiel wird haerter
        self.visible = True

    # -- Hilfen --
    def _move_along_path(self, dt, speed, world):
        if not self.path:
            return
        tx, ty = self.path[0][0] + 0.5, self.path[0][1] + 0.5
        dx, dy = tx - self.x, ty - self.y
        d = math.hypot(dx, dy)
        if d < 0.12:
            self.path.pop(0)
            return
        step = speed * dt
        mx, my = dx / d * step, dy / d * step
        if not is_blocked(self.x + math.copysign(CREATURE_RADIUS, mx), self.y, world):
            self.x += mx
        if not is_blocked(self.x, self.y + math.copysign(CREATURE_RADIUS, my), world):
            self.y += my

    def _repath(self, player, world):
        start = (int(self.x), int(self.y))
        goal = (int(player.x), int(player.y))
        p = find_path(start, goal, world)
        self.path = p[1:] if p else []
        self.repath_timer = CREATURE_REPATH_INTERVAL

    def _teleport_far(self, player, world):
        for _ in range(40):
            cx = random.randint(2, MAP_W - 3)
            cy = random.randint(2, MAP_H - 3)
            if not is_walkable(cx, cy, world) or (cx, cy) in BLOCKING_PROP_CELLS:
                continue
            if math.hypot(cx - player.x, cy - player.y) < 6.0:
                continue
            self.x, self.y = cx + 0.5, cy + 0.5
            self.path = []
            return

    def update(self, dt, player, world, audio):
        self.aggression = min(1.0, self.aggression + dt * 0.012)
        self.anim += dt
        if self.contact_cooldown > 0:
            self.contact_cooldown -= dt

        dx, dy = player.x - self.x, player.y - self.y
        dist = math.hypot(dx, dy)

        # Wird die Kreatur gerade angeschaut? (im Sichtkegel, beleuchtet, freie Sicht)
        angle_to = math.atan2(dy, dx)
        adiff = abs((player.angle - angle_to + math.pi) % (2 * math.pi) - math.pi)
        los = has_line_of_sight(self.x, self.y, player.x, player.y, world)
        looked_at = (adiff < math.radians(26) and dist < CREATURE_SIGHT_RANGE
                     and los and player.light_level() > 0)

        # -- Zustandslogik --
        if self.state == HIDDEN:
            self.visible = False
            self.hidden_timer -= dt
            if self.hidden_timer <= 0:
                self._teleport_far(player, world)
                self.state = HUNT if random.random() < 0.5 + 0.4 * self.aggression else LURK
                self.visible = True
            return

        self.visible = True

        # Animationsframe
        moving = True
        self.frame = int(self.anim * 6) % 4

        if dist <= CREATURE_CONTACT_RANGE and self.contact_cooldown <= 0:
            player.health -= CREATURE_DAMAGE
            player.sanity = max(0.0, player.sanity - CREATURE_SANITY_HIT)
            player.hurt_flash = 0.6
            self.contact_cooldown = 1.2
            if audio:
                audio.play("scare", vol=0.9)
            # Nach Treffer kurz verschwinden (kein Instakill, klassischer Schreck)
            self.state = HIDDEN
            self.hidden_timer = random.uniform(2.5, 4.5)
            return

        # Lauern vs. Jagen
        if self.state == LURK:
            if dist < CREATURE_SIGHT_RANGE and (not looked_at or random.random() < 0.002):
                self.state = HUNT
            speed = CREATURE_SPEED_LURK
        else:  # HUNT
            speed = CREATURE_SPEED_HUNT + 0.6 * self.aggression
            if looked_at and dist < 4.5:
                # beobachtet & nah -> zoegert (man haelt es mit Blick auf Abstand)
                speed *= 0.35

        if not looked_at:
            speed *= CREATURE_UNSEEN_BONUS

        # gelegentlich abtauchen, wenn ausser Sicht (fuer Wiederauftauch-Schreck)
        if self.state == HUNT and not los and dist > 5.0 and random.random() < 0.0015:
            self.state = HIDDEN
            self.hidden_timer = random.uniform(1.5, 3.0)
            return

        self.repath_timer -= dt
        if self.repath_timer <= 0 or not self.path:
            self._repath(player, world)

        # geschlossene Tuer im Weg? Die Kreatur oeffnet sie (hoerbar) -> Horror,
        # und der Spieler kann durch Schliessen kurz Zeit gewinnen.
        if self.path:
            nd = self.path[0]
            if map_at(nd[0], nd[1]) == "D" and not world.door_open(nd[0], nd[1]):
                if math.hypot(nd[0] + 0.5 - self.x, nd[1] + 0.5 - self.y) < 1.2:
                    world.doors[nd] = True
                    if audio:
                        pan = max(-1.0, min(1.0, math.sin(angle_to - player.angle)))
                        audio.play("door", vol=0.7, pan=pan)

        self._move_along_path(dt, speed, world)

        # Schritt-/Fluester-Audio (positionsabhaengig)
        if audio and dist < 14.0:
            pan = max(-1.0, min(1.0, math.sin(angle_to - player.angle)))
            vol_dist = max(0.0, 1.0 - dist / 14.0)
            self.step_timer -= dt
            if self.step_timer <= 0 and moving:
                audio.play("step", vol=0.5 * vol_dist, pan=pan)
                self.step_timer = 0.45
            self.whisper_timer -= dt
            if self.whisper_timer <= 0:
                audio.play("whisper", vol=0.6 * vol_dist, pan=pan)
                self.whisper_timer = random.uniform(4.0, 9.0)


# ----------------------------------------------------------------------------
# Props & Items
# ----------------------------------------------------------------------------
class WorldObject:
    __slots__ = ("x", "y", "kind", "collected", "note_index", "bob")

    def __init__(self, x, y, kind, note_index=-1):
        self.x = x
        self.y = y
        self.kind = kind
        self.collected = False
        self.note_index = note_index
        self.bob = random.uniform(0, math.tau)


def spawn_props():
    props = []
    for (x, y), sym in PROP_CELLS.items():
        props.append(WorldObject(x + 0.5, y + 0.5, sym))
    return props


def spawn_items():
    items = []
    for (x, y) in KEY_SPAWNS:
        items.append(WorldObject(x + 0.5, y + 0.5, "key"))
    for (x, y) in BATTERY_SPAWNS:
        items.append(WorldObject(x + 0.5, y + 0.5, "battery"))
    for i, (x, y) in enumerate(NOTE_SPAWNS):
        items.append(WorldObject(x + 0.5, y + 0.5, "note", note_index=i))
    return items


# ----------------------------------------------------------------------------
# Raycasting (DDA) - beruecksichtigt Tueren/Tor ueber ray_solid()
# ----------------------------------------------------------------------------
def cast_ray(px, py, angle, world):
    ray_dir_x = math.cos(angle)
    ray_dir_y = math.sin(angle)
    map_x, map_y = int(px), int(py)

    delta_x = abs(1 / ray_dir_x) if ray_dir_x != 0 else 1e30
    delta_y = abs(1 / ray_dir_y) if ray_dir_y != 0 else 1e30

    if ray_dir_x < 0:
        step_x = -1
        side_dist_x = (px - map_x) * delta_x
    else:
        step_x = 1
        side_dist_x = (map_x + 1.0 - px) * delta_x
    if ray_dir_y < 0:
        step_y = -1
        side_dist_y = (py - map_y) * delta_y
    else:
        step_y = 1
        side_dist_y = (map_y + 1.0 - py) * delta_y

    side = 0
    symbol = "#"
    for _ in range(int(MAX_DEPTH * 4) + MAP_W + MAP_H):
        if side_dist_x < side_dist_y:
            side_dist_x += delta_x
            map_x += step_x
            side = 0
        else:
            side_dist_y += delta_y
            map_y += step_y
            side = 1
        hit = ray_solid(map_x, map_y, world)
        if hit is not None:
            symbol = hit
            break
    else:
        return MAX_DEPTH, "#", 0, 0.0

    if side == 0:
        perp = (map_x - px + (1 - step_x) / 2) / ray_dir_x
        wall_x = py + perp * ray_dir_y
    else:
        perp = (map_y - py + (1 - step_y) / 2) / ray_dir_y
        wall_x = px + perp * ray_dir_x
    wall_x -= math.floor(wall_x)
    return max(perp, 0.0001), symbol, side, wall_x


# ----------------------------------------------------------------------------
# Welt-Rendering: Decke (innen/aussen), Boden, texturierte Waende mit
# Distanz-Nebel und Taschenlampen-Kegel im Shading.
# ----------------------------------------------------------------------------
EYE_LEVEL = 0.5


def _brightness(col, dist, light_level):
    angle_off = ((col + 0.5) / RENDER_W - 0.5) * FOV
    beam = 1.0 - abs(angle_off) / FLASH_BEAM_HALF
    if beam < 0.0:
        beam = 0.0
    dist_fac = max(0.0, 1.0 - dist / MAX_DEPTH)
    val = AMBIENT_LIGHT * dist_fac + light_level * beam * dist_fac
    return max(0.0, min(1.0, val))


def render_world(surface, player, world, zbuffer, wall_textures, grads, shift, light_level):
    horizon = RENDER_H // 2
    indoor = (int(player.x), int(player.y)) in INDOOR_CELLS
    ceil = grads["ceil_in"] if indoor else grads["sky"]
    floor = grads["floor_in"] if indoor else grads["floor_out"]
    grad_h = ceil.get_height()
    surface.blit(ceil, (0, horizon + shift - (grad_h - 1)))
    surface.blit(floor, (0, horizon + shift))

    start_angle = player.angle - HALF_FOV
    for col in range(RENDER_W):
        ray_angle = start_angle + (col / RENDER_W) * FOV
        dist, symbol, side, wall_x = cast_ray(player.x, player.y, ray_angle, world)

        corrected = max(dist * math.cos(ray_angle - player.angle), 0.0001)
        zbuffer[col] = corrected

        wall_height = min(RENDER_H * 4, int(RENDER_H / corrected))
        draw_start = (RENDER_H - wall_height) // 2 + shift
        if draw_start + wall_height <= 0 or draw_start >= RENDER_H or wall_height <= 0:
            continue

        light = _brightness(col, corrected, light_level)
        shade_idx = int(light * (NUM_SHADES - 1))
        if side == 1:
            shade_idx = max(0, shade_idx - 2)

        tex = wall_textures[symbol][shade_idx]
        tex_x = int(wall_x * TEX_SIZE) % TEX_SIZE
        column = tex.subsurface((tex_x, 0, 1, TEX_SIZE))
        scaled = pygame.transform.scale(column, (1, wall_height))
        surface.blit(scaled, (col, draw_start))


# ----------------------------------------------------------------------------
# Billboard-Sprites (Kreatur, Props, Items) - gemeinsam tiefensortiert,
# spaltenweise z-getestet, mit Distanz-Nebel-Schattierung.
# ----------------------------------------------------------------------------
def _gather_sprites(player, creature, props, items):
    out = []
    if creature.visible:
        dx, dy = creature.x - player.x, creature.y - player.y
        dist = math.hypot(dx, dy)
        if 0.1 < dist < MAX_DEPTH:
            diff = (math.atan2(dy, dx) - player.angle + math.pi) % (2 * math.pi) - math.pi
            if abs(diff) < HALF_FOV + 0.45:
                out.append((dist, diff, "creature", creature))
    for obj in props:
        dx, dy = obj.x - player.x, obj.y - player.y
        dist = math.hypot(dx, dy)
        if dist < 0.1 or dist > MAX_DEPTH:
            continue
        diff = (math.atan2(dy, dx) - player.angle + math.pi) % (2 * math.pi) - math.pi
        if abs(diff) < HALF_FOV + 0.45:
            out.append((dist, diff, obj.kind, obj))
    for obj in items:
        if obj.collected:
            continue
        dx, dy = obj.x - player.x, obj.y - player.y
        dist = math.hypot(dx, dy)
        if dist < 0.1 or dist > MAX_DEPTH:
            continue
        diff = (math.atan2(dy, dx) - player.angle + math.pi) % (2 * math.pi) - math.pi
        if abs(diff) < HALF_FOV + 0.45:
            out.append((dist, diff, obj.kind, obj))
    out.sort(key=lambda t: t[0], reverse=True)
    return out


def _shade_sprite(scaled, brightness, dist):
    b = max(0, min(255, int(brightness * 255)))
    dark = pygame.Surface(scaled.get_size())
    dark.fill((b, b, b))
    scaled.blit(dark, (0, 0), special_flags=pygame.BLEND_RGB_MULT)
    tint = (1.0 - max(0.0, min(1.0, 1.0 - dist / MAX_DEPTH))) * 0.5
    if tint > 0.02:
        fog = pygame.Surface(scaled.get_size())
        fog.fill(_clampc((FOG_TINT[0] * tint, FOG_TINT[1] * tint, FOG_TINT[2] * tint)))
        scaled.blit(fog, (0, 0), special_flags=pygame.BLEND_RGB_ADD)
    return scaled


def render_sprites(surface, player, sprites_list, zbuffer, shift, light_level,
                   bank, time_now, glow):
    for dist, diff, kind, obj in sprites_list:
        screen_x = (0.5 + diff / FOV) * RENDER_W
        world_h, world_w = SPRITE_WORLD[kind]
        scale = RENDER_H / dist
        sh = max(1, int(scale * world_h))
        sw = max(1, int(scale * world_w))

        frame = 0
        if kind == "creature":
            frame = 4 if dist < 1.6 else obj.frame
        sprite = bank.get(kind, frame)

        ground_y = RENDER_H / 2 + shift + scale * EYE_LEVEL
        # Items schweben leicht und wippen
        if kind in ("key", "battery", "note"):
            ground_y -= scale * (0.35 + 0.06 * math.sin(time_now * 2.0 + obj.bob))
        top = ground_y - sh
        left = screen_x - sw / 2

        scaled = pygame.transform.scale(sprite, (sw, sh))
        col_center = int(max(0, min(RENDER_W - 1, screen_x)))
        brightness = _brightness(col_center, dist, light_level)
        # Items/Laternen leuchten leicht selbst
        if kind in ("key", "battery", "note", "L"):
            brightness = min(1.0, brightness + 0.35)
        scaled = _shade_sprite(scaled, brightness, dist)

        li = max(0, int(left))
        ri = min(RENDER_W, int(left) + sw)
        base_left = int(left)
        for col in range(li, ri):
            if dist < zbuffer[col]:
                sx = col - base_left
                if 0 <= sx < sw:
                    surface.blit(scaled.subsurface((sx, 0, 1, sh)), (col, int(top)))

        # additive Gloweffekte (Groesse begrenzt, damit nahe Lampen nicht
        # den halben Bildschirm ueberstrahlen)
        if kind == "L":
            gsz = max(6, min(58, int(scale * 0.42)))
            g = pygame.transform.smoothscale(glow, (gsz, gsz))
            lamp_y = top + sh * 0.16
            if 0 <= col_center < RENDER_W and dist < zbuffer[col_center] + 1.0:
                surface.blit(g, (int(screen_x - gsz / 2), int(lamp_y - gsz / 2)),
                             special_flags=pygame.BLEND_RGB_ADD)
        elif kind in ("key", "battery", "note"):
            gsz = max(5, min(30, int(scale * 0.32)))
            g = pygame.transform.smoothscale(glow, (gsz, gsz))
            surface.blit(g, (int(screen_x - gsz / 2), int(top + sh / 2 - gsz / 2)),
                         special_flags=pygame.BLEND_RGB_ADD)


# ----------------------------------------------------------------------------
# Screen-Overlays: Taschenlampen-/Dunkelheits-Maske + Vignette, Filmkorn,
# Sanity-Verzerrung, Treffer-Blitz, Taschenlampen-Viewmodel.
# ----------------------------------------------------------------------------
def composite_overlays(screen, player, overlays, time_now, frame_count):
    # 1) Dunkelheit / Taschenlampen-Maske
    mask = overlays["flash_on"] if player.light_level() > 0 else overlays["flash_off"]
    screen.blit(mask, (0, 0))

    # 2) Filmkorn (mehr bei niedriger Sanity)
    grain = overlays["grain"]
    g = grain[frame_count % len(grain)]
    screen.blit(g, (0, 0))
    sanity_frac = player.sanity / SANITY_MAX
    if sanity_frac < 0.5:
        g2 = grain[(frame_count + 3) % len(grain)]
        g2.set_alpha(int(120 * (1.0 - sanity_frac * 2)))
        screen.blit(g2, (0, 0))
        g2.set_alpha(255)

    # 3) Sanity-Tint (roetlich, je niedriger desto staerker)
    if sanity_frac < 0.6:
        amt = int(90 * (1.0 - sanity_frac / 0.6))
        tint = pygame.Surface((SCREEN_W, SCREEN_H))
        tint.fill((60, 0, 6))
        tint.set_alpha(amt)
        screen.blit(tint, (0, 0))

    # 4) Treffer-Blitz
    if player.hurt_flash > 0:
        flash = pygame.Surface((SCREEN_W, SCREEN_H))
        flash.fill((120, 0, 0))
        flash.set_alpha(int(150 * min(1.0, player.hurt_flash)))
        screen.blit(flash, (0, 0))


def draw_viewmodel(screen, player):
    cx = SCREEN_W // 2 + 120
    base_y = SCREEN_H - 10
    sway = int(6 * math.sin(player.bob_phase)) if player.moving else 0
    # Hand + Taschenlampe unten rechts
    pygame.draw.polygon(screen, (40, 36, 34),
                        [(cx - 18, base_y), (cx + 18, base_y),
                         (cx + 10, base_y - 70 + sway), (cx - 10, base_y - 70 + sway)])
    pygame.draw.rect(screen, (24, 24, 26), (cx - 14, base_y - 92 + sway, 28, 26))
    if player.light_level() > 0:
        lens = pygame.Surface((40, 40), pygame.SRCALPHA)
        pygame.draw.circle(lens, (255, 230, 150, 200), (20, 20), 12)
        screen.blit(lens, (cx - 20, base_y - 104 + sway), special_flags=pygame.BLEND_RGB_ADD)


# ----------------------------------------------------------------------------
# HUD & Menue-Screens
# ----------------------------------------------------------------------------
def _bar(screen, x, y, w, h, frac, color, label, font):
    pygame.draw.rect(screen, (18, 18, 20), (x - 1, y - 1, w + 2, h + 2))
    pygame.draw.rect(screen, (40, 40, 44), (x, y, w, h), 1)
    fw = int(w * max(0.0, min(1.0, frac)))
    pygame.draw.rect(screen, color, (x, y, fw, h))
    if label:
        screen.blit(font.render(label, True, (170, 170, 175)), (x, y - 16))


def draw_hud(screen, player, world, font, font_small, prompt):
    # dezente Statusleisten unten links
    bx, by = 16, SCREEN_H - 64
    _bar(screen, bx, by, 150, 10, player.health / PLAYER_MAX_HEALTH, (170, 40, 40),
         "GESUNDHEIT", font_small)
    _bar(screen, bx, by + 26, 150, 10, player.sanity / SANITY_MAX, (120, 70, 160),
         "VERSTAND", font_small)
    bx2 = bx + 180
    _bar(screen, bx2, by, 150, 10, player.battery / FLASH_MAX_BATTERY, (200, 180, 60),
         "AKKU", font_small)
    _bar(screen, bx2, by + 26, 150, 8, player.stamina / STAMINA_MAX, (70, 130, 150),
         "AUSDAUER", font_small)

    # Ziel + Schluessel oben links
    if player.keys >= KEYS_REQUIRED:
        obj = "Das Tor ist offen - FLIEHE durch das Gartentor!"
        col = (90, 210, 110)
    else:
        obj = f"Finde die Schluessel:  {player.keys} / {KEYS_REQUIRED}"
        col = (200, 200, 205)
    screen.blit(font.render(obj, True, col), (16, 14))
    screen.blit(font_small.render(f"Batterien: {player.batteries}", True, (160, 160, 120)),
                (16, 40))

    # Interaktions-Hinweis
    if prompt:
        p = font.render(prompt, True, (230, 220, 180))
        screen.blit(p, (SCREEN_W // 2 - p.get_width() // 2, SCREEN_H // 2 + 40))

    # dezentes Fadenkreuz
    cx, cy = SCREEN_W // 2, SCREEN_H // 2
    pygame.draw.circle(screen, (150, 150, 150), (cx, cy), 2, 1)


def draw_unreliable_map(screen, player, world):
    """Grobe, unzuverlaessige Karte (nur Waende, kein Gegner) - mehr Verlorenheit."""
    scale = 3
    mw, mh = MAP_W * scale, MAP_H * scale
    ox, oy = SCREEN_W - mw - 12, 12
    overlay = pygame.Surface((mw, mh), pygame.SRCALPHA)
    overlay.fill((0, 0, 0, 110))
    for y in range(MAP_H):
        for x in range(MAP_W):
            if GAME_MAP[y][x] in SOLID_SYMBOLS and GAME_MAP[y][x] != "G":
                pygame.draw.rect(overlay, (90, 90, 96, 130), (x * scale, y * scale, scale, scale))
    gx, gy = GATE_CELL
    pygame.draw.rect(overlay, (90, 200, 110, 200), (gx * scale, gy * scale, scale, scale))
    pygame.draw.circle(overlay, (90, 200, 120, 220),
                       (int(player.x * scale), int(player.y * scale)), 2)
    screen.blit(overlay, (ox, oy))


def draw_note(screen, font_big, font, note_index):
    pw, ph = 560, 300
    panel = pygame.Surface((pw, ph))
    panel.fill((20, 18, 16))
    pygame.draw.rect(panel, (90, 80, 60), panel.get_rect(), 3)
    lines = NOTE_TEXTS[note_index]
    title = font_big.render("Notiz", True, (210, 200, 170))
    panel.blit(title, (28, 22))
    for i, line in enumerate(lines):
        panel.blit(font.render(line, True, (200, 195, 180)), (28, 96 + i * 32))
    panel.blit(font.render("[E] schliessen", True, (150, 150, 140)), (28, ph - 38))
    screen.blit(panel, (SCREEN_W // 2 - pw // 2, SCREEN_H // 2 - ph // 2))


def draw_centered(screen, font_big, font, title, subtitle, color=(220, 220, 220)):
    screen.fill((6, 6, 8))
    t = font_big.render(title, True, color)
    s = font.render(subtitle, True, (170, 170, 175))
    screen.blit(t, (SCREEN_W // 2 - t.get_width() // 2, SCREEN_H // 2 - 70))
    screen.blit(s, (SCREEN_W // 2 - s.get_width() // 2, SCREEN_H // 2 + 6))


# ----------------------------------------------------------------------------
# Interaktion / Aufnahme / Ziel-Logik
# ----------------------------------------------------------------------------
def door_in_front(player):
    for d in (0.6, 1.0, 1.5):
        tx = int(player.x + math.cos(player.angle) * d)
        ty = int(player.y + math.sin(player.angle) * d)
        if map_at(tx, ty) == "D":
            return (tx, ty)
    return None


def handle_pickups(player, world, items, audio):
    note_to_show = -1
    for obj in items:
        if obj.collected:
            continue
        if math.hypot(obj.x - player.x, obj.y - player.y) < 0.6:
            obj.collected = True
            if obj.kind == "key":
                player.keys += 1
                if audio:
                    audio.play("key", vol=0.7)
                if player.keys >= KEYS_REQUIRED and not world.gate_unlocked:
                    world.gate_unlocked = True
                    if audio:
                        audio.play("gate", vol=0.9)
            elif obj.kind == "battery":
                player.add_battery()
                if audio:
                    audio.play("pickup", vol=0.6)
            elif obj.kind == "note":
                player.notes_read.add(obj.note_index)
                note_to_show = obj.note_index
                if audio:
                    audio.play("pickup", vol=0.6)
    return note_to_show


# ----------------------------------------------------------------------------
# Spiel-Setup & States
# ----------------------------------------------------------------------------
MENU, PLAYING, PAUSED, GAME_OVER, WIN = "menu", "playing", "paused", "game_over", "win"


def reset_game():
    player = Player(*PLAYER_START)
    creature = Creature(*CREATURE_START)
    world = WorldState()
    items = spawn_items()
    return player, creature, world, items


def update_sanity(dt, player, creature, world):
    ll = player.light_level()
    dark = ll <= 0.0
    drain = 0.0
    regen = 0.0
    cdist = math.hypot(creature.x - player.x, creature.y - player.y)
    near = creature.visible and cdist < 6.0 and has_line_of_sight(
        creature.x, creature.y, player.x, player.y, world)
    if dark:
        drain += SANITY_DRAIN_DARK
    if near:
        drain += SANITY_DRAIN_CREATURE * (1.0 - cdist / 6.0)
    if not dark and not near and (not creature.visible or cdist > 8.0):
        regen += SANITY_REGEN
    player.sanity = max(0.0, min(SANITY_MAX, player.sanity + (regen - drain) * dt))
    return cdist


# ----------------------------------------------------------------------------
# Hauptschleife
# ----------------------------------------------------------------------------
def main(test_mode=False, test_frames=60):
    global AUDIO
    pygame.init()
    pygame.display.set_caption("NOCTURNE")
    screen = pygame.display.set_mode((SCREEN_W, SCREEN_H))
    render_surface = pygame.Surface((RENDER_W, RENDER_H))
    clock = pygame.time.Clock()
    font = pygame.font.SysFont("consolas", 20)
    font_small = pygame.font.SysFont("consolas", 14)
    font_big = pygame.font.SysFont("consolas", 52, bold=True)

    AUDIO = AudioEngine()
    wall_textures = build_wall_textures()
    grads = build_gradients()
    overlays = build_overlays()
    bank = SpriteBank()
    props = spawn_props()

    if not test_mode:
        pygame.mouse.set_visible(False)
        pygame.event.set_grab(True)

    state = MENU
    player, creature, world, items = reset_game()
    zbuffer = [MAX_DEPTH] * RENDER_W
    note_timer = 0.0
    note_index = -1
    time_now = 0.0
    frame_count = 0
    running = True

    while running:
        dt = min(clock.tick(60) / 1000.0, 0.05)
        time_now += dt
        frame_count += 1
        mouse_dx = mouse_dy = 0

        for event in pygame.event.get():
            if event.type == pygame.QUIT:
                running = False
            elif event.type == pygame.MOUSEMOTION and state == PLAYING:
                mouse_dx += event.rel[0]
                mouse_dy += event.rel[1]
            elif event.type == pygame.KEYDOWN:
                if event.key == pygame.K_ESCAPE:
                    if state == PLAYING:
                        state = PAUSED
                    elif state == PAUSED:
                        state = PLAYING
                    else:
                        running = False
                elif event.key == pygame.K_RETURN:
                    if state in (MENU, GAME_OVER, WIN):
                        player, creature, world, items = reset_game()
                        note_timer = 0.0
                        state = PLAYING
                        if AUDIO:
                            AUDIO.stop_all()
                            AUDIO.start_ambient()
                elif event.key == pygame.K_f and state == PLAYING:
                    player.toggle_flashlight(AUDIO)
                elif event.key == pygame.K_e and state == PLAYING:
                    if note_timer > 0:
                        note_timer = 0.0
                    else:
                        dcell = door_in_front(player)
                        if dcell:
                            world.doors[dcell] = not world.door_open(*dcell)
                            if AUDIO:
                                AUDIO.play("door", vol=0.6)

        if state == PLAYING:
            keys = pygame.key.get_pressed()
            if note_timer <= 0:
                player.update(dt, keys, mouse_dx, mouse_dy, world)
                creature.update(dt, player, world, AUDIO)
                got_note = handle_pickups(player, world, items, AUDIO)
                if got_note >= 0:
                    note_index = got_note
                    note_timer = 6.0
                cdist = update_sanity(dt, player, creature, world)

                # Akku-Warnung
                if player.battery < 18 and not player.low_battery_warned:
                    player.low_battery_warned = True
                    if AUDIO:
                        AUDIO.play("lowbeep", vol=0.5)

                # Herzschlag je nach Bedrohung
                intensity = 0.0
                if creature.visible:
                    intensity = max(0.0, 1.0 - cdist / 8.0)
                intensity = max(intensity, (1.0 - player.sanity / SANITY_MAX) * 0.5)
                if AUDIO:
                    AUDIO.set_heartbeat(intensity)

                # Sieg / Niederlage
                if world.gate_unlocked and (int(player.x), int(player.y)) == GATE_CELL:
                    state = WIN
                    if AUDIO:
                        AUDIO.stop_all()
                        AUDIO.play("gate", vol=1.0)
                if player.health <= 0 or player.sanity <= 0:
                    state = GAME_OVER
                    if AUDIO:
                        AUDIO.stop_all()
                        AUDIO.play("scare", vol=1.0)
            else:
                note_timer -= dt

            ll = player.light_level()
            shift = int(player.screen_shift())
            sprites = _gather_sprites(player, creature, props, items)
            render_world(render_surface, player, world, zbuffer, wall_textures,
                         grads, shift, ll)
            render_sprites(render_surface, player, sprites, zbuffer, shift, ll,
                           bank, time_now, overlays["glow"])
            pygame.transform.scale(render_surface, (SCREEN_W, SCREEN_H), screen)

            prompt = ""
            if note_timer <= 0:
                dcell = door_in_front(player)
                if dcell:
                    prompt = "[E] Tuer oeffnen/schliessen"
            composite_overlays(screen, player, overlays, time_now, frame_count)
            draw_viewmodel(screen, player)
            draw_hud(screen, player, world, font, font_small, prompt)
            draw_unreliable_map(screen, player, world)
            if note_timer > 0:
                draw_note(screen, font_big, font, note_index)

        elif state == MENU:
            draw_centered(screen, font_big, font, "NOCTURNE",
                          "ENTER: Beginnen   |   F: Licht   E: Tuer   SHIFT: Rennen")
            sub = font_small.render(
                "Finde 3 Schluessel, entriegle das Tor und entkomme. Etwas jagt dich.",
                True, (150, 150, 155))
            screen.blit(sub, (SCREEN_W // 2 - sub.get_width() // 2, SCREEN_H // 2 + 40))
        elif state == PAUSED:
            draw_centered(screen, font_big, font, "PAUSE", "ESC: Weiter", (200, 200, 210))
        elif state == GAME_OVER:
            draw_centered(screen, font_big, font, "DU BIST GESTORBEN",
                          "ENTER fuer Neustart", (200, 40, 40))
        elif state == WIN:
            draw_centered(screen, font_big, font, "ENTKOMMEN",
                          "Du hast es nach draussen geschafft. ENTER fuer Neustart",
                          (90, 210, 120))

        pygame.display.flip()

        if test_mode:
            if frame_count == 3:
                state = PLAYING
                if AUDIO:
                    AUDIO.start_ambient()
            if frame_count >= test_frames:
                running = False

    if AUDIO:
        AUDIO.stop_all()
    pygame.quit()


if __name__ == "__main__":
    main()
