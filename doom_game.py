#!/usr/bin/env python3
"""
Doom-artiges 3D-Spiel mit Raycasting-Engine (Pseudo-3D, wie Doom/Wolfenstein 3D/Build-Engine).

Steuerung:
    Maus bewegen (X)   - Drehen
    Maus bewegen (Y)   - Hoch-/Runterschauen
    W / S              - Vorwärts / Rückwärts
    A / D              - Seitwärts laufen (Strafe)
    LEERTASTE          - Springen
    Linksklick         - Schießen
    ESC                - Beenden
    ENTER              - Start / Neustart
"""

import heapq
import math

import pygame

# ----------------------------------------------------------------------------
# Grundkonfiguration
# ----------------------------------------------------------------------------
SCREEN_W, SCREEN_H = 800, 600
RENDER_W, RENDER_H = 400, 300            # interne Auflösung für das Raycasting

FOV = math.radians(66)
HALF_FOV = FOV / 2
MAX_DEPTH = 26.0

MOVE_SPEED = 3.2
TURN_SPEED_MOUSE = 0.0028
PLAYER_RADIUS = 0.2
ENEMY_RADIUS = 0.25

# Pitch (Hoch-/Runterschauen) per Y-Shearing
PITCH_LIMIT = math.radians(28)
MOUSE_PITCH_SPEED = 0.0022
MAX_PITCH_SHIFT = 95.0

# Sprung-Physik
GRAVITY = 9.0
JUMP_SPEED = 3.6
JUMP_SCREEN_SCALE = 90.0
SHIFT_CLAMP = 145.0
GRADIENT_MARGIN = 150

WEAPON_COOLDOWN = 0.35
WEAPON_DAMAGE = 40
WEAPON_RANGE = 14.0
WEAPON_SPREAD = math.radians(4)

ENEMY_SPEED = 1.15
ENEMY_DAMAGE = 8
ENEMY_ATTACK_RANGE = 0.9
ENEMY_ATTACK_COOLDOWN = 1.0
ENEMY_MAX_HEALTH = 100
ENEMY_REPATH_INTERVAL = 0.5

TEX_SIZE = 64
NUM_SHADES = 16

# Basisfarben je Wandmaterial (fließen in die prozeduralen Texturen ein)
WALL_BASE_COLORS = {
    "1": (176, 138, 92),   # Sandstein / Gartenmauer (Innenhof)
    "2": (112, 112, 122),  # Steinblöcke (Start/West/Ruinen)
    "3": (70, 100, 135),   # Metall (Waffenkammer)
    "#": (58, 58, 64),     # neutrale Wand / Korridore
}


# ----------------------------------------------------------------------------
# Level-Generator: Räume + Korridore (garantiert zusammenhängend, statt
# freihändig getipptem ASCII-Art, das leicht unzusammenhängende Inseln
# erzeugen kann).
# ----------------------------------------------------------------------------
LEVEL_W, LEVEL_H = 30, 22

ROOMS = {
    "start":     ((2, 16, 9, 20), "2"),
    "west":      ((2, 8, 8, 14), "2"),
    "courtyard": ((11, 6, 25, 16), "1"),
    "armory":    ((24, 2, 28, 9), "3"),
    "ruins":     ((9, 1, 21, 6), "2"),
}

PILLARS = [(14, 9), (14, 12), (18, 9), (18, 12), (21, 9), (21, 12)]

PROP_PLAN = {
    "T": [(12, 7), (12, 14), (23, 7), (23, 14), (16, 7), (19, 14)],   # Bäume
    "b": [(13, 10), (16, 13), (20, 8), (22, 11), (15, 9), (17, 11)],  # Büsche
    "f": [(3, 9), (3, 12), (6, 10)],                                   # Farne
    "L": [(10, 2), (20, 2), (10, 4), (20, 4), (25, 3), (27, 7)],       # Fackeln
    "r": [(13, 3), (17, 3)],                                          # Felsen
}

ENEMY_SPAWNS = [
    (4.5, 10.5), (6.5, 11.5), (15.5, 8.5), (22.5, 13.5),
    (26.5, 5.5), (26.5, 7.5), (12.5, 3.5), (18.5, 3.5),
]

PLAYER_START = (5.5, 18.5, -math.pi / 2)

PROP_BLOCKING = {"T": True, "r": True, "b": False, "f": False, "L": False}


def _paint_rect(grid, x0, y0, x1, y1, mat):
    for y in range(max(0, y0), min(LEVEL_H, y1)):
        for x in range(max(0, x0), min(LEVEL_W, x1)):
            grid[y][x] = mat


def _carve_rect(grid, x0, y0, x1, y1):
    for y in range(y0, y1):
        for x in range(x0, x1):
            if 0 < x < LEVEL_W - 1 and 0 < y < LEVEL_H - 1:
                grid[y][x] = "."


def _carve_hcorridor(grid, x0, x1, y, width=2):
    _carve_rect(grid, min(x0, x1), y, max(x0, x1) + 1, y + width)


def _carve_vcorridor(grid, y0, y1, x, width=2):
    _carve_rect(grid, x, min(y0, y1), x + width, max(y0, y1) + 1)


def build_level():
    grid = [["#"] * LEVEL_W for _ in range(LEVEL_H)]

    for (x0, y0, x1, y1), mat in ROOMS.values():
        _paint_rect(grid, x0 - 1, y0 - 1, x1 + 1, y1 + 1, mat)
    for (x0, y0, x1, y1), mat in ROOMS.values():
        _carve_rect(grid, x0, y0, x1, y1)

    _carve_vcorridor(grid, 13, 16, 5, width=2)
    _carve_hcorridor(grid, 8, 12, 9, width=2)
    _carve_hcorridor(grid, 14, 16, 5, width=2)
    _carve_hcorridor(grid, 20, 25, 5, width=2)

    for (x, y) in PILLARS:
        grid[y][x] = "2"

    game_map = ["".join(row) for row in grid]

    prop_grid = [[" "] * LEVEL_W for _ in range(LEVEL_H)]
    for symbol, coords in PROP_PLAN.items():
        for (x, y) in coords:
            prop_grid[y][x] = symbol
    prop_map = ["".join(row) for row in prop_grid]

    blocking_cells = set()
    for symbol, coords in PROP_PLAN.items():
        if PROP_BLOCKING[symbol]:
            blocking_cells.update(coords)

    return game_map, prop_map, blocking_cells


GAME_MAP, PROP_MAP, BLOCKING_PROP_CELLS = build_level()
MAP_H = len(GAME_MAP)
MAP_W = len(GAME_MAP[0])


def map_at(x, y):
    ix, iy = int(x), int(y)
    if 0 <= iy < MAP_H and 0 <= ix < MAP_W:
        return GAME_MAP[iy][ix]
    return "#"


def is_wall(x, y):
    return map_at(x, y) != "."


def is_blocked(x, y):
    if is_wall(x, y):
        return True
    return (int(x), int(y)) in BLOCKING_PROP_CELLS


# ----------------------------------------------------------------------------
# A*-Pathfinding für Gegner (statt direkter Linie -> bleiben nicht mehr an
# Wänden/Ecken hängen, navigieren um Hindernisse herum)
# ----------------------------------------------------------------------------
def _heuristic(a, b):
    return abs(a[0] - b[0]) + abs(a[1] - b[1])


def _neighbors(cell):
    x, y = cell
    return ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1))


def find_path(start, goal, max_nodes=600):
    if start == goal:
        return [start]
    if is_blocked(goal[0] + 0.5, goal[1] + 0.5):
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

        for nxt in _neighbors(current):
            if is_blocked(nxt[0] + 0.5, nxt[1] + 0.5):
                continue
            tentative = g_score[current] + 1
            if tentative < g_score.get(nxt, 1 << 30):
                g_score[nxt] = tentative
                came_from[nxt] = current
                heapq.heappush(open_heap, (tentative + _heuristic(nxt, goal), nxt))

    return None


# ----------------------------------------------------------------------------
# Entitäten
# ----------------------------------------------------------------------------
class Player:
    def __init__(self, x, y, angle=0.0):
        self.x = x
        self.y = y
        self.angle = angle
        self.pitch = 0.0
        self.z = 0.0
        self.vz = 0.0
        self.on_ground = True
        self.health = 100
        self.ammo = 60
        self.weapon_timer = 0.0
        self.muzzle_flash = 0.0

    def try_move(self, dx, dy):
        nx = self.x + dx
        ny = self.y + dy
        if not is_blocked(nx + math.copysign(PLAYER_RADIUS, dx), self.y):
            self.x = nx
        if not is_blocked(self.x, ny + math.copysign(PLAYER_RADIUS, dy)):
            self.y = ny

    def try_jump(self):
        if self.on_ground:
            self.vz = JUMP_SPEED
            self.on_ground = False

    def screen_shift(self):
        pitch_shift = (self.pitch / PITCH_LIMIT) * MAX_PITCH_SHIFT
        jump_shift = self.z * JUMP_SCREEN_SCALE
        return max(-SHIFT_CLAMP, min(SHIFT_CLAMP, pitch_shift + jump_shift))

    def update(self, dt, keys, mouse_dx, mouse_dy):
        self.angle += mouse_dx * TURN_SPEED_MOUSE
        self.angle %= 2 * math.pi

        self.pitch += -mouse_dy * MOUSE_PITCH_SPEED
        self.pitch = max(-PITCH_LIMIT, min(PITCH_LIMIT, self.pitch))

        move_x = move_y = 0.0
        forward = math.cos(self.angle), math.sin(self.angle)
        right = math.cos(self.angle + math.pi / 2), math.sin(self.angle + math.pi / 2)

        if keys[pygame.K_w]:
            move_x += forward[0]
            move_y += forward[1]
        if keys[pygame.K_s]:
            move_x -= forward[0]
            move_y -= forward[1]
        if keys[pygame.K_d]:
            move_x += right[0]
            move_y += right[1]
        if keys[pygame.K_a]:
            move_x -= right[0]
            move_y -= right[1]

        length = math.hypot(move_x, move_y)
        if length > 0:
            move_x, move_y = move_x / length, move_y / length
            self.try_move(move_x * MOVE_SPEED * dt, move_y * MOVE_SPEED * dt)

        if keys[pygame.K_SPACE]:
            self.try_jump()

        self.vz -= GRAVITY * dt
        self.z += self.vz * dt
        if self.z <= 0.0:
            self.z = 0.0
            self.vz = 0.0
            self.on_ground = True

        if self.weapon_timer > 0:
            self.weapon_timer -= dt
        if self.muzzle_flash > 0:
            self.muzzle_flash -= dt

    def shoot(self, enemies):
        if self.weapon_timer > 0 or self.ammo <= 0:
            return
        self.weapon_timer = WEAPON_COOLDOWN
        self.muzzle_flash = 0.08
        self.ammo -= 1

        wall_dist = cast_ray(self.x, self.y, self.angle)[0]

        best_enemy = None
        best_dist = WEAPON_RANGE
        for enemy in enemies:
            if not enemy.alive:
                continue
            ex, ey = enemy.x - self.x, enemy.y - self.y
            dist = math.hypot(ex, ey)
            if dist >= best_dist or dist >= wall_dist:
                continue
            angle_to_enemy = math.atan2(ey, ex)
            diff = (angle_to_enemy - self.angle + math.pi) % (2 * math.pi) - math.pi
            if abs(diff) <= WEAPON_SPREAD:
                best_dist = dist
                best_enemy = enemy

        if best_enemy is not None:
            best_enemy.take_damage(WEAPON_DAMAGE)


class Enemy:
    def __init__(self, x, y):
        self.x = x
        self.y = y
        self.health = ENEMY_MAX_HEALTH
        self.alive = True
        self.attack_timer = 0.0
        self.hit_flash = 0.0
        self.path = []
        self.repath_timer = 0.0

    def take_damage(self, amount):
        self.health -= amount
        self.hit_flash = 0.15
        if self.health <= 0:
            self.alive = False
            self.path = []

    def _follow_path_step(self, dt, dx, dy, dist, others):
        step = ENEMY_SPEED * dt
        mx, my = dx / dist * step, dy / dist * step

        sep_x = sep_y = 0.0
        for other in others:
            if other is self or not other.alive:
                continue
            ox, oy = self.x - other.x, self.y - other.y
            odist = math.hypot(ox, oy)
            if 0 < odist < 0.6:
                push = (0.6 - odist) / odist
                sep_x += ox * push
                sep_y += oy * push
        mx += sep_x * dt
        my += sep_y * dt

        nx, ny = self.x + mx, self.y + my
        if not is_blocked(nx + math.copysign(ENEMY_RADIUS, mx), self.y):
            self.x = nx
        if not is_blocked(self.x, ny + math.copysign(ENEMY_RADIUS, my)):
            self.y = ny

    def update(self, dt, player, others):
        if not self.alive:
            return
        if self.hit_flash > 0:
            self.hit_flash -= dt
        if self.attack_timer > 0:
            self.attack_timer -= dt

        dx, dy = player.x - self.x, player.y - self.y
        dist = math.hypot(dx, dy)
        if dist < 0.0001:
            return

        if dist <= ENEMY_ATTACK_RANGE:
            self.path = []
            if self.attack_timer <= 0:
                player.health -= ENEMY_DAMAGE
                self.attack_timer = ENEMY_ATTACK_COOLDOWN
            return

        self.repath_timer -= dt
        if self.repath_timer <= 0 or not self.path:
            start = (int(self.x), int(self.y))
            goal = (int(player.x), int(player.y))
            new_path = find_path(start, goal)
            self.path = new_path[1:] if new_path else []
            self.repath_timer = ENEMY_REPATH_INTERVAL

        if not self.path:
            return

        tx, ty = self.path[0][0] + 0.5, self.path[0][1] + 0.5
        wx, wy = tx - self.x, ty - self.y
        wdist = math.hypot(wx, wy)
        if wdist < 0.15:
            self.path.pop(0)
            if not self.path:
                return
            tx, ty = self.path[0][0] + 0.5, self.path[0][1] + 0.5
            wx, wy = tx - self.x, ty - self.y
            wdist = math.hypot(wx, wy)

        if wdist > 0.0001:
            self._follow_path_step(dt, wx, wy, wdist, others)


class Prop:
    __slots__ = ("x", "y", "kind")

    def __init__(self, x, y, kind):
        self.x = x
        self.y = y
        self.kind = kind


def spawn_props():
    props = []
    for y in range(MAP_H):
        for x in range(MAP_W):
            symbol = PROP_MAP[y][x]
            if symbol != " ":
                props.append(Prop(x + 0.5, y + 0.5, symbol))
    return props


# ----------------------------------------------------------------------------
# Raycasting (DDA-Algorithmus)
# ----------------------------------------------------------------------------
def cast_ray(px, py, angle):
    """Liefert (perp_distance, wall_symbol, side, wall_x) für einen Strahl."""
    ray_dir_x = math.cos(angle)
    ray_dir_y = math.sin(angle)

    map_x, map_y = int(px), int(py)

    delta_dist_x = abs(1 / ray_dir_x) if ray_dir_x != 0 else 1e30
    delta_dist_y = abs(1 / ray_dir_y) if ray_dir_y != 0 else 1e30

    if ray_dir_x < 0:
        step_x = -1
        side_dist_x = (px - map_x) * delta_dist_x
    else:
        step_x = 1
        side_dist_x = (map_x + 1.0 - px) * delta_dist_x

    if ray_dir_y < 0:
        step_y = -1
        side_dist_y = (py - map_y) * delta_dist_y
    else:
        step_y = 1
        side_dist_y = (map_y + 1.0 - py) * delta_dist_y

    side = 0
    wall_symbol = "#"
    for _ in range(int(MAX_DEPTH * 4) + MAP_W + MAP_H):
        if side_dist_x < side_dist_y:
            side_dist_x += delta_dist_x
            map_x += step_x
            side = 0
        else:
            side_dist_y += delta_dist_y
            map_y += step_y
            side = 1

        symbol = map_at(map_x, map_y)
        if symbol != ".":
            wall_symbol = symbol
            break
    else:
        return MAX_DEPTH, "#", 0, 0.0

    if side == 0:
        perp_dist = (map_x - px + (1 - step_x) / 2) / ray_dir_x
        wall_x = py + perp_dist * ray_dir_y
    else:
        perp_dist = (map_y - py + (1 - step_y) / 2) / ray_dir_y
        wall_x = px + perp_dist * ray_dir_x

    wall_x -= math.floor(wall_x)
    return max(perp_dist, 0.0001), wall_symbol, side, wall_x


# ----------------------------------------------------------------------------
# Prozedurale Texturen (einmalig vorgerendert, dann nur noch Column-Blits)
# ----------------------------------------------------------------------------
def _make_brick_surface(brick_color, mortar_color, rows=4, cols=2, mortar_w=0.09):
    tex = pygame.Surface((TEX_SIZE, TEX_SIZE))
    for y in range(TEX_SIZE):
        v = y / TEX_SIZE
        row = int(v * rows)
        row_frac = (v * rows) % 1.0
        offset = 0.5 if row % 2 else 0.0
        for x in range(TEX_SIZE):
            u = x / TEX_SIZE
            uu = (u + offset) % 1.0
            col_frac = (uu * cols) % 1.0
            if row_frac < mortar_w or col_frac < mortar_w * 1.4:
                c = mortar_color
            else:
                variant = ((row * 5 + int(uu * cols) * 11) % 7) - 3
                c = tuple(max(0, min(255, ch + variant * 5)) for ch in brick_color)
            tex.set_at((x, y), c)
    return tex


def _make_panel_surface(base_color, line_color, grid=16):
    tex = pygame.Surface((TEX_SIZE, TEX_SIZE))
    for y in range(TEX_SIZE):
        for x in range(TEX_SIZE):
            edge = (x % grid == 0) or (y % grid == 0)
            noise = ((x * 13 + y * 7) % 11) - 5
            if edge:
                c = line_color
            else:
                c = tuple(max(0, min(255, ch + noise * 2)) for ch in base_color)
            tex.set_at((x, y), c)
    return tex


def build_wall_textures():
    base = {
        "1": _make_brick_surface(WALL_BASE_COLORS["1"], (90, 65, 45)),
        "2": _make_panel_surface(WALL_BASE_COLORS["2"], (70, 70, 78)),
        "3": _make_panel_surface(WALL_BASE_COLORS["3"], (40, 60, 85)),
        "#": _make_panel_surface(WALL_BASE_COLORS["#"], (35, 35, 40)),
    }
    shaded = {}
    for symbol, surf in base.items():
        variants = []
        for i in range(NUM_SHADES):
            factor = 0.22 + 0.78 * (i + 1) / NUM_SHADES
            variant = surf.copy()
            dark = pygame.Surface((TEX_SIZE, TEX_SIZE))
            gray = max(0, min(255, int(255 * factor)))
            dark.fill((gray, gray, gray))
            variant.blit(dark, (0, 0), special_flags=pygame.BLEND_RGB_MULT)
            variants.append(variant.convert())
        shaded[symbol] = variants
    return shaded


def _lerp(a, b, t):
    return (int(a[0] + (b[0] - a[0]) * t),
            int(a[1] + (b[1] - a[1]) * t),
            int(a[2] + (b[2] - a[2]) * t))


def build_gradients():
    h = RENDER_H // 2 + GRADIENT_MARGIN
    ceiling = pygame.Surface((RENDER_W, h))
    floor = pygame.Surface((RENDER_W, h))
    sky_top, sky_horizon = (8, 8, 18), (38, 38, 52)
    floor_far, floor_near = (46, 44, 48), (52, 40, 30)

    for y in range(h):
        t = y / (h - 1)
        pygame.draw.line(ceiling, _lerp(sky_top, sky_horizon, t), (0, y), (RENDER_W, y))
        pygame.draw.line(floor, _lerp(floor_far, floor_near, t), (0, y), (RENDER_W, y))

    return ceiling.convert(), floor.convert()


# ----------------------------------------------------------------------------
# Welt-Rendering (Wände, texturiert, mit Pitch-/Sprung-Shift)
# ----------------------------------------------------------------------------
def render_world(surface, player, zbuffer, wall_textures, ceiling_grad, floor_grad, shift):
    horizon = RENDER_H // 2
    grad_h = ceiling_grad.get_height()
    surface.blit(ceiling_grad, (0, horizon + shift - (grad_h - 1)))
    surface.blit(floor_grad, (0, horizon + shift))

    start_angle = player.angle - HALF_FOV

    for col in range(RENDER_W):
        ray_angle = start_angle + (col / RENDER_W) * FOV
        dist, wall_symbol, side, wall_x = cast_ray(player.x, player.y, ray_angle)

        corrected = max(dist * math.cos(ray_angle - player.angle), 0.0001)
        zbuffer[col] = corrected

        wall_height = min(RENDER_H * 3, int(RENDER_H / corrected))
        draw_start = (RENDER_H - wall_height) // 2 + shift
        draw_end = draw_start + wall_height
        if draw_end <= 0 or draw_start >= RENDER_H or wall_height <= 0:
            continue

        shade = max(0.0, 1.0 - corrected / MAX_DEPTH)
        shade_idx = int(shade * (NUM_SHADES - 1))
        if side == 1:
            shade_idx = max(0, shade_idx - 3)

        tex = wall_textures[wall_symbol][shade_idx]
        tex_x = int(wall_x * TEX_SIZE) % TEX_SIZE
        column = tex.subsurface((tex_x, 0, 1, TEX_SIZE))
        scaled_column = pygame.transform.scale(column, (1, wall_height))
        surface.blit(scaled_column, (col, draw_start))


# ----------------------------------------------------------------------------
# Billboard-Sprites: Gegner + Props gemeinsam tiefensortiert (sonst könnten
# nahe Bäume fälschlich von fernen Gegnern verdeckt werden oder umgekehrt)
# ----------------------------------------------------------------------------
PROP_SIZE = {
    # symbol: (world_height, world_width)
    "T": (2.6, 1.1),
    "b": (0.6, 0.9),
    "f": (0.45, 0.55),
    "r": (0.45, 0.95),
    "L": (1.0, 0.28),
}
PROP_COLOR = {
    "T_trunk": (74, 50, 33), "T_leaf": (40, 110, 50),
    "b": (52, 120, 58),
    "f": (60, 130, 70),
    "r": (100, 98, 92),
    "L_stick": (70, 48, 30), "L_flame": (240, 150, 40),
}


def _gather_visible_sprites(player, enemies, props):
    visible = []
    for enemy in enemies:
        if not enemy.alive:
            continue
        dx, dy = enemy.x - player.x, enemy.y - player.y
        dist = math.hypot(dx, dy)
        if dist < 0.15:
            continue
        angle_to = math.atan2(dy, dx)
        diff = (angle_to - player.angle + math.pi) % (2 * math.pi) - math.pi
        if abs(diff) < HALF_FOV + 0.35:
            visible.append((dist, diff, "enemy", enemy))

    for prop in props:
        dx, dy = prop.x - player.x, prop.y - player.y
        dist = math.hypot(dx, dy)
        if dist < 0.15 or dist > MAX_DEPTH:
            continue
        angle_to = math.atan2(dy, dx)
        diff = (angle_to - player.angle + math.pi) % (2 * math.pi) - math.pi
        if abs(diff) < HALF_FOV + 0.35:
            visible.append((dist, diff, "prop", prop))

    visible.sort(key=lambda item: item[0], reverse=True)
    return visible


# Bodenkontakt-Hoehe (Weltyeinheiten) der Kamera ueber dem Boden. Indem JEDES
# bodenstehende Billboard (Gegner wie Props) dieselbe ground_y-Formel nutzt,
# liegt die Fuss-Linie aller Objekte bei gleicher Distanz auf derselben
# Bildschirmzeile - unabhaengig von ihrer world_h. Das verhindert, dass ein
# naher, kurzer Baum einen ferneren, hohen Gegner unten durchscheinen laesst.
EYE_LEVEL = 0.5


def _billboard_rect(screen_x, dist, world_h, world_w, shift):
    scale = RENDER_H / dist
    height = scale * world_h
    width = scale * world_w
    ground_y = RENDER_H / 2 + shift + scale * EYE_LEVEL
    left = int(screen_x - width / 2)
    right = int(screen_x + width / 2)
    top = int(ground_y - height)
    bottom = int(ground_y)
    return left, right, top, bottom


def _fill_columns(surface, left, right, top, bottom, color, dist, zbuffer):
    l = max(0, left)
    r = min(RENDER_W, right)
    for col in range(l, r):
        if dist < zbuffer[col]:
            pygame.draw.line(surface, color, (col, top), (col, bottom))


def _draw_enemy(surface, screen_x, dist, shift, enemy, zbuffer):
    left, right, top, bottom = _billboard_rect(screen_x, dist, 1.6, 0.8, shift)
    color = (220, 60, 60) if enemy.hit_flash <= 0 else (255, 230, 230)
    _fill_columns(surface, left, right, top, bottom, color, dist, zbuffer)

    if right - left > 6:
        eye_y = top + int((bottom - top) * 0.25)
        for col in range(max(0, left), min(RENDER_W, right)):
            if dist < zbuffer[col]:
                rel = (col - left) / max(1, right - left)
                if 0.25 < rel < 0.4 or 0.6 < rel < 0.75:
                    pygame.draw.line(surface, (10, 10, 10), (col, eye_y), (col, eye_y + 3))

    if enemy.health < ENEMY_MAX_HEALTH:
        bar_w = right - left
        if bar_w > 4:
            pygame.draw.rect(surface, (60, 0, 0), (left, top - 6, bar_w, 3))
            ratio = max(0.0, enemy.health / ENEMY_MAX_HEALTH)
            pygame.draw.rect(surface, (0, 200, 0), (left, top - 6, int(bar_w * ratio), 3))


def _draw_tree(surface, screen_x, dist, shift, zbuffer):
    h, w = PROP_SIZE["T"]
    left, right, top, bottom = _billboard_rect(screen_x, dist, h, w, shift)
    trunk_top = bottom - int((bottom - top) * 0.32)
    canopy_w = max(2, int((right - left) * 1.35))
    canopy_l = int(screen_x - canopy_w / 2)
    canopy_r = int(screen_x + canopy_w / 2)
    canopy_bottom = trunk_top + 4
    canopy_height = max(1, canopy_bottom - top)

    trunk_l = screen_x - (right - left) * 0.18
    trunk_r = screen_x + (right - left) * 0.18
    _fill_columns(surface, int(trunk_l), int(trunk_r), trunk_top, bottom, PROP_COLOR["T_trunk"], dist, zbuffer)

    # Runde Baumkrone (elliptisch pro Spalte verjuengt) statt rechteckigem Block
    l = max(0, canopy_l)
    r = min(RENDER_W, canopy_r)
    half_w = max(1.0, (canopy_r - canopy_l) / 2)
    for col in range(l, r):
        if dist >= zbuffer[col]:
            continue
        t = max(-1.0, min(1.0, (col + 0.5 - screen_x) / half_w))
        taper = math.sqrt(max(0.0, 1.0 - t * t))
        col_top = canopy_bottom - int(canopy_height * taper)
        pygame.draw.line(surface, PROP_COLOR["T_leaf"], (col, col_top), (col, canopy_bottom))


def _draw_bush(surface, screen_x, dist, shift, zbuffer):
    h, w = PROP_SIZE["b"]
    left, right, top, bottom = _billboard_rect(screen_x, dist, h, w, shift)
    _fill_columns(surface, left, right, top, bottom, PROP_COLOR["b"], dist, zbuffer)


def _draw_fern(surface, screen_x, dist, shift, zbuffer):
    h, w = PROP_SIZE["f"]
    left, right, top, bottom = _billboard_rect(screen_x, dist, h, w, shift)
    mid = (left + right) // 2
    _fill_columns(surface, left, mid + 1, bottom - int((bottom - top) * 0.5), bottom, PROP_COLOR["f"], dist, zbuffer)
    _fill_columns(surface, mid - 1, right, top, bottom, PROP_COLOR["f"], dist, zbuffer)


def _draw_rock(surface, screen_x, dist, shift, zbuffer):
    h, w = PROP_SIZE["r"]
    left, right, top, bottom = _billboard_rect(screen_x, dist, h, w, shift)
    _fill_columns(surface, left, right, top + int((bottom - top) * 0.2), bottom, PROP_COLOR["r"], dist, zbuffer)


def _draw_torch(surface, screen_x, dist, shift, prop, zbuffer, time_now):
    h, w = PROP_SIZE["L"]
    left, right, top, bottom = _billboard_rect(screen_x, dist, h, w, shift)
    _fill_columns(surface, left, right, top + int((bottom - top) * 0.35), bottom, PROP_COLOR["L_stick"], dist, zbuffer)

    flicker = 0.8 + 0.2 * math.sin(time_now * 9.0 + (prop.x * 7 + prop.y * 13))
    flame_h = int((bottom - top) * 0.45 * flicker)
    flame_top = top + int((bottom - top) * 0.35) - flame_h
    _fill_columns(surface, left, right, flame_top, top + int((bottom - top) * 0.35), PROP_COLOR["L_flame"], dist, zbuffer)


def render_sprites(surface, player, enemies, props, zbuffer, shift, time_now):
    for dist, diff, kind, obj in _gather_visible_sprites(player, enemies, props):
        screen_x = (0.5 + diff / FOV) * RENDER_W
        if kind == "enemy":
            _draw_enemy(surface, screen_x, dist, shift, obj, zbuffer)
        elif obj.kind == "T":
            _draw_tree(surface, screen_x, dist, shift, zbuffer)
        elif obj.kind == "b":
            _draw_bush(surface, screen_x, dist, shift, zbuffer)
        elif obj.kind == "f":
            _draw_fern(surface, screen_x, dist, shift, zbuffer)
        elif obj.kind == "r":
            _draw_rock(surface, screen_x, dist, shift, zbuffer)
        elif obj.kind == "L":
            _draw_torch(surface, screen_x, dist, shift, obj, zbuffer, time_now)


# ----------------------------------------------------------------------------
# HUD, Waffe & Minimap
# ----------------------------------------------------------------------------
def draw_weapon(screen, player, font):
    cx = SCREEN_W // 2
    jump_lift = int(player.z * 40)
    base_y = SCREEN_H - 40 + jump_lift
    kick = 6 if player.muzzle_flash > 0 else 0

    pygame.draw.rect(screen, (40, 40, 40), (cx - 18, base_y - 60 - kick, 36, 90))
    pygame.draw.rect(screen, (20, 20, 20), (cx - 24, base_y - 5, 70, 35))

    if player.muzzle_flash > 0:
        pygame.draw.circle(screen, (255, 230, 120), (cx, base_y - 95 - kick), 18)
        pygame.draw.circle(screen, (255, 255, 200), (cx, base_y - 95 - kick), 8)

    pygame.draw.line(screen, (200, 200, 200), (cx - 8, SCREEN_H // 2), (cx + 8, SCREEN_H // 2), 2)
    pygame.draw.line(screen, (200, 200, 200), (cx, SCREEN_H // 2 - 8), (cx, SCREEN_H // 2 + 8), 2)


def draw_hud(screen, player, font, enemies_left):
    pygame.draw.rect(screen, (0, 0, 0), (0, SCREEN_H - 30, SCREEN_W, 30))
    health_color = (220, 40, 40) if player.health < 30 else (40, 220, 40)
    health_text = font.render(f"HEALTH: {max(0, player.health)}", True, health_color)
    ammo_text = font.render(f"AMMO: {player.ammo}", True, (220, 200, 60))
    enemies_text = font.render(f"GEGNER: {enemies_left}", True, (200, 200, 200))
    screen.blit(health_text, (10, SCREEN_H - 25))
    screen.blit(ammo_text, (220, SCREEN_H - 25))
    screen.blit(enemies_text, (380, SCREEN_H - 25))


def draw_minimap(screen, player, enemies):
    scale = 5
    ox, oy = SCREEN_W - MAP_W * scale - 10, 10
    overlay = pygame.Surface((MAP_W * scale, MAP_H * scale))
    overlay.set_alpha(190)
    overlay.fill((0, 0, 0))

    for y in range(MAP_H):
        for x in range(MAP_W):
            if GAME_MAP[y][x] != ".":
                pygame.draw.rect(overlay, (150, 150, 150), (x * scale, y * scale, scale, scale))

    for enemy in enemies:
        if enemy.alive:
            pygame.draw.circle(overlay, (220, 40, 40), (int(enemy.x * scale), int(enemy.y * scale)), 3)

    pygame.draw.circle(overlay, (40, 220, 60), (int(player.x * scale), int(player.y * scale)), 3)
    end_x = player.x * scale + math.cos(player.angle) * 8
    end_y = player.y * scale + math.sin(player.angle) * 8
    pygame.draw.line(overlay, (40, 220, 60), (player.x * scale, player.y * scale), (end_x, end_y), 1)

    screen.blit(overlay, (ox, oy))


def draw_centered_text(screen, font_big, font_small, title, subtitle, color=(230, 230, 230)):
    screen.fill((10, 10, 10))
    title_surf = font_big.render(title, True, color)
    sub_surf = font_small.render(subtitle, True, (180, 180, 180))
    screen.blit(title_surf, (SCREEN_W // 2 - title_surf.get_width() // 2, SCREEN_H // 2 - 60))
    screen.blit(sub_surf, (SCREEN_W // 2 - sub_surf.get_width() // 2, SCREEN_H // 2 + 10))


# ----------------------------------------------------------------------------
# Spiel-Setup
# ----------------------------------------------------------------------------
def reset_game():
    player = Player(*PLAYER_START)
    enemies = [Enemy(x, y) for x, y in ENEMY_SPAWNS]
    return player, enemies


# ----------------------------------------------------------------------------
# Hauptschleife
# ----------------------------------------------------------------------------
MENU, PLAYING, GAME_OVER, WIN = "menu", "playing", "game_over", "win"


def main(test_mode=False, test_frames=30):
    pygame.init()
    pygame.display.set_caption("PyDoom - Raycaster")
    screen = pygame.display.set_mode((SCREEN_W, SCREEN_H))
    render_surface = pygame.Surface((RENDER_W, RENDER_H))
    clock = pygame.time.Clock()
    font = pygame.font.SysFont("consolas", 20)
    font_big = pygame.font.SysFont("consolas", 48, bold=True)

    wall_textures = build_wall_textures()
    ceiling_grad, floor_grad = build_gradients()
    props = spawn_props()

    pygame.mouse.set_visible(False)
    pygame.event.set_grab(not test_mode)

    state = MENU
    player, enemies = reset_game()
    zbuffer = [MAX_DEPTH] * RENDER_W

    running = True
    frame_count = 0
    time_now = 0.0
    while running:
        dt = clock.tick(60) / 1000.0
        dt = min(dt, 0.05)
        time_now += dt
        mouse_dx = mouse_dy = 0

        for event in pygame.event.get():
            if event.type == pygame.QUIT:
                running = False
            elif event.type == pygame.KEYDOWN:
                if event.key == pygame.K_ESCAPE:
                    running = False
                elif event.key == pygame.K_RETURN:
                    if state in (MENU, GAME_OVER, WIN):
                        player, enemies = reset_game()
                        state = PLAYING
            elif event.type == pygame.MOUSEMOTION and state == PLAYING:
                mouse_dx += event.rel[0]
                mouse_dy += event.rel[1]
            elif event.type == pygame.MOUSEBUTTONDOWN and state == PLAYING:
                if event.button == 1:
                    player.shoot(enemies)

        if state == PLAYING:
            keys = pygame.key.get_pressed()
            player.update(dt, keys, mouse_dx, mouse_dy)

            for enemy in enemies:
                enemy.update(dt, player, enemies)

            if player.health <= 0:
                state = GAME_OVER
            elif all(not e.alive for e in enemies):
                state = WIN

            shift = int(player.screen_shift())
            render_world(render_surface, player, zbuffer, wall_textures, ceiling_grad, floor_grad, shift)
            render_sprites(render_surface, player, enemies, props, zbuffer, shift, time_now)
            scaled = pygame.transform.scale(render_surface, (SCREEN_W, SCREEN_H))
            screen.blit(scaled, (0, 0))

            draw_weapon(screen, player, font)
            draw_hud(screen, player, font, sum(1 for e in enemies if e.alive))
            draw_minimap(screen, player, enemies)

        elif state == MENU:
            draw_centered_text(
                screen, font_big, font,
                "PYDOOM", "ENTER: Start | WASD+Maus | LEERTASTE: Springen | Klick: Schießen",
            )
        elif state == GAME_OVER:
            draw_centered_text(
                screen, font_big, font,
                "GAME OVER", "ENTER für Neustart", color=(220, 40, 40),
            )
        elif state == WIN:
            draw_centered_text(
                screen, font_big, font,
                "SIEG!", "Alle Gegner besiegt - ENTER für Neustart", color=(40, 220, 80),
            )

        pygame.display.flip()

        if test_mode:
            frame_count += 1
            if frame_count == 5:
                state = PLAYING
            if frame_count == 10:
                player.shoot(enemies)
            if frame_count >= test_frames:
                running = False

    pygame.quit()


if __name__ == "__main__":
    main()
