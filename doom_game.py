#!/usr/bin/env python3
"""
Doom-artiges 3D-Spiel mit Raycasting-Engine (Pseudo-3D, wie das Original Doom/Wolfenstein 3D).

Steuerung:
    Maus bewegen   - Umschauen (Drehen)
    W / S          - Vorwärts / Rückwärts
    A / D          - Seitwärts laufen (Strafe)
    Linksklick     - Schießen
    ESC            - Pause-Menü / Beenden
    ENTER          - Start (im Menü) / Neustart (nach Game Over)
"""

import math
import random
import sys

import pygame

# ----------------------------------------------------------------------------
# Konfiguration
# ----------------------------------------------------------------------------
SCREEN_W, SCREEN_H = 800, 600
RENDER_W, RENDER_H = 400, 300            # interne Auflösung für das Raycasting
SCALE_X, SCALE_Y = SCREEN_W / RENDER_W, SCREEN_H / RENDER_H

FOV = math.radians(66)
HALF_FOV = FOV / 2
MAX_DEPTH = 20.0
TILE = 1.0

MOVE_SPEED = 3.2          # Einheiten pro Sekunde
TURN_SPEED_MOUSE = 0.0028
PLAYER_RADIUS = 0.2

WEAPON_COOLDOWN = 0.35
WEAPON_DAMAGE = 40
WEAPON_RANGE = 12.0
WEAPON_SPREAD = math.radians(4)

ENEMY_SPEED = 1.1
ENEMY_DAMAGE = 8
ENEMY_ATTACK_RANGE = 0.9
ENEMY_ATTACK_COOLDOWN = 1.0
ENEMY_MAX_HEALTH = 100

# Wandfarben je Map-Symbol (Basisfarbe, wird je nach Distanz/Seite abgedunkelt)
WALL_COLORS = {
    "1": (150, 40, 40),    # rote Backsteinwand
    "2": (90, 90, 100),    # Steinwand
    "3": (40, 90, 140),    # blaue Wand
    "#": (60, 60, 60),     # Außenmauer
}

FLOOR_COLOR = (40, 40, 40)
CEILING_COLOR = (15, 15, 25)

# Map: Außenrand muss komplett aus Wänden bestehen.
GAME_MAP = [
    "################",
    "#..............#",
    "#..11....22....#",
    "#..1......2....#",
    "#..1..####2....#",
    "#.........2....#",
    "#...33....######",
    "#...3.....#....#",
    "#...3.....#....#",
    "#.........#....#",
    "#####.######...#",
    "#....2.........#",
    "#....2..11..1..#",
    "#.......1...1..#",
    "#..............#",
    "################",
]
MAP_H = len(GAME_MAP)
MAP_W = len(GAME_MAP[0])


def map_at(x, y):
    ix, iy = int(x), int(y)
    if 0 <= iy < MAP_H and 0 <= ix < MAP_W:
        return GAME_MAP[iy][ix]
    return "#"


def is_wall(x, y):
    return map_at(x, y) != "."


# ----------------------------------------------------------------------------
# Entitäten
# ----------------------------------------------------------------------------
class Player:
    def __init__(self, x, y, angle=0.0):
        self.x = x
        self.y = y
        self.angle = angle
        self.health = 100
        self.ammo = 60
        self.weapon_timer = 0.0
        self.muzzle_flash = 0.0

    def try_move(self, dx, dy):
        nx = self.x + dx
        ny = self.y + dy
        if not is_wall(nx + math.copysign(PLAYER_RADIUS, dx), self.y):
            self.x = nx
        if not is_wall(self.x, ny + math.copysign(PLAYER_RADIUS, dy)):
            self.y = ny

    def update(self, dt, keys, mouse_dx):
        self.angle += mouse_dx * TURN_SPEED_MOUSE
        self.angle %= 2 * math.pi

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

    def take_damage(self, amount):
        self.health -= amount
        self.hit_flash = 0.15
        if self.health <= 0:
            self.alive = False

    def update(self, dt, player):
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

        if dist > ENEMY_ATTACK_RANGE:
            step = ENEMY_SPEED * dt
            nx = self.x + dx / dist * step
            ny = self.y + dy / dist * step
            if not is_wall(nx, self.y):
                self.x = nx
            if not is_wall(self.x, ny):
                self.y = ny
        elif self.attack_timer <= 0:
            player.health -= ENEMY_DAMAGE
            self.attack_timer = ENEMY_ATTACK_COOLDOWN


# ----------------------------------------------------------------------------
# Raycasting (DDA-Algorithmus)
# ----------------------------------------------------------------------------
def cast_ray(px, py, angle):
    """Liefert (perp_distance, wall_symbol, side) für einen Strahl ab (px, py)."""
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
        return MAX_DEPTH, "#", 0

    if side == 0:
        perp_dist = (map_x - px + (1 - step_x) / 2) / ray_dir_x
    else:
        perp_dist = (map_y - py + (1 - step_y) / 2) / ray_dir_y

    return max(perp_dist, 0.0001), wall_symbol, side


def render_world(surface, player, zbuffer):
    surface.fill(CEILING_COLOR, (0, 0, RENDER_W, RENDER_H // 2))
    surface.fill(FLOOR_COLOR, (0, RENDER_H // 2, RENDER_W, RENDER_H // 2))

    start_angle = player.angle - HALF_FOV

    for col in range(RENDER_W):
        ray_angle = start_angle + (col / RENDER_W) * FOV
        dist, wall_symbol, side = cast_ray(player.x, player.y, ray_angle)

        # Fisheye-Korrektur
        corrected = dist * math.cos(ray_angle - player.angle)
        corrected = max(corrected, 0.0001)
        zbuffer[col] = corrected

        wall_height = min(RENDER_H, int(RENDER_H / corrected))
        draw_start = max(0, (RENDER_H - wall_height) // 2)
        draw_end = min(RENDER_H, draw_start + wall_height)

        base_color = WALL_COLORS.get(wall_symbol, (120, 120, 120))
        shade = max(0.25, 1.0 - corrected / MAX_DEPTH)
        if side == 1:
            shade *= 0.75
        color = (
            min(255, int(base_color[0] * shade)),
            min(255, int(base_color[1] * shade)),
            min(255, int(base_color[2] * shade)),
        )
        pygame.draw.line(surface, color, (col, draw_start), (col, draw_end))


def render_enemies(surface, player, enemies, zbuffer):
    visible = []
    for enemy in enemies:
        if not enemy.alive:
            continue
        dx, dy = enemy.x - player.x, enemy.y - player.y
        dist = math.hypot(dx, dy)
        angle_to_enemy = math.atan2(dy, dx)
        diff = (angle_to_enemy - player.angle + math.pi) % (2 * math.pi) - math.pi
        if abs(diff) < HALF_FOV + 0.3 and dist > 0.2:
            visible.append((dist, diff, enemy))

    visible.sort(key=lambda item: item[0], reverse=True)

    for dist, diff, enemy in visible:
        screen_x = (0.5 + diff / FOV) * RENDER_W
        size = min(RENDER_H * 1.4, RENDER_H / dist)
        half = size / 2

        left = int(screen_x - half)
        right = int(screen_x + half)
        top = int(RENDER_H / 2 - half * 0.55)
        bottom = int(RENDER_H / 2 + half * 0.85)

        color = (220, 60, 60) if enemy.hit_flash <= 0 else (255, 230, 230)

        for col in range(max(0, left), min(RENDER_W, right)):
            if dist < zbuffer[col]:
                col_height = bottom - top
                pygame.draw.line(surface, color, (col, top), (col, bottom))

        # einfache "Augen", damit der Gegner als Figur erkennbar ist
        if right - left > 6:
            eye_y = top + int((bottom - top) * 0.25)
            for col in range(max(0, left), min(RENDER_W, right)):
                if dist < zbuffer[col]:
                    rel = (col - left) / max(1, right - left)
                    if 0.25 < rel < 0.4 or 0.6 < rel < 0.75:
                        pygame.draw.line(surface, (10, 10, 10), (col, eye_y), (col, eye_y + 3))

        # Lebensbalken über dem Gegner
        if enemy.health < ENEMY_MAX_HEALTH:
            bar_w = right - left
            if bar_w > 4:
                pygame.draw.rect(surface, (60, 0, 0), (left, top - 6, bar_w, 3))
                ratio = max(0.0, enemy.health / ENEMY_MAX_HEALTH)
                pygame.draw.rect(surface, (0, 200, 0), (left, top - 6, int(bar_w * ratio), 3))


# ----------------------------------------------------------------------------
# HUD & Minimap
# ----------------------------------------------------------------------------
def draw_weapon(screen, player, font):
    cx = SCREEN_W // 2
    base_y = SCREEN_H - 40
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
    scale = 6
    ox, oy = SCREEN_W - MAP_W * scale - 10, 10
    overlay = pygame.Surface((MAP_W * scale, MAP_H * scale))
    overlay.set_alpha(180)
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
def spawn_enemies():
    positions = [(3.5, 2.5), (10.5, 2.5), (4.5, 7.5), (12.5, 12.5), (5.5, 12.5)]
    return [Enemy(x, y) for x, y in positions]


def reset_game():
    player = Player(2.5, 2.5, angle=0.0)
    enemies = spawn_enemies()
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

    pygame.mouse.set_visible(False)
    pygame.event.set_grab(not test_mode)

    state = MENU
    player, enemies = reset_game()
    zbuffer = [MAX_DEPTH] * RENDER_W

    running = True
    frame_count = 0
    while running:
        dt = clock.tick(60) / 1000.0
        dt = min(dt, 0.05)
        mouse_dx = 0

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
            elif event.type == pygame.MOUSEBUTTONDOWN and state == PLAYING:
                if event.button == 1:
                    player.shoot(enemies)

        if state == PLAYING:
            keys = pygame.key.get_pressed()
            player.update(dt, keys, mouse_dx)
            if keys[pygame.K_SPACE]:
                player.shoot(enemies)

            for enemy in enemies:
                enemy.update(dt, player)

            if player.health <= 0:
                state = GAME_OVER
            elif all(not e.alive for e in enemies):
                state = WIN

            render_world(render_surface, player, zbuffer)
            render_enemies(render_surface, player, enemies, zbuffer)
            scaled = pygame.transform.scale(render_surface, (SCREEN_W, SCREEN_H))
            screen.blit(scaled, (0, 0))

            draw_weapon(screen, player, font)
            draw_hud(screen, player, font, sum(1 for e in enemies if e.alive))
            draw_minimap(screen, player, enemies)

        elif state == MENU:
            draw_centered_text(
                screen, font_big, font,
                "PYDOOM", "ENTER zum Starten  |  WASD + Maus + Klick zum Schießen",
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
