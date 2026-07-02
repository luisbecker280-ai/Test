# PROMPT: NOCTURNE 3D — Komplette Neuentwicklung als echtes 3D-Horrorspiel

> Dieser Prompt beschreibt die vollständige Neuentwicklung des bisherigen
> Pygame-Raycasters (`doom_game.py`) als **echtes 3D-Spiel**. Er kann so an
> ein KI-Modell oder einen Entwickler übergeben werden.

---

## Auftrag

Entwickle das Horrorspiel **NOCTURNE** von Grund auf neu — nicht mehr als
Pseudo-3D-Raycaster, sondern als **echtes First-Person-3D-Spiel** mit freier
Bewegung in allen drei Dimensionen. Die Programmiersprache ist frei wählbar;
nimm die, mit der das beste Ergebnis erreichbar ist. Es gibt keine Zeit- oder
Umfangsbeschränkung: Gib alles, hol das Maximum heraus.

## Technologie (empfohlen)

- **HTML + CSS + JavaScript mit Three.js (WebGL)** — echte 3D-Engine mit
  Beleuchtung, Schatten, Nebel und Texturen.
- **Keine externen Downloads zur Laufzeit**: Three.js liegt lokal bei, alle
  Texturen und Sounds werden **prozedural** erzeugt (Canvas-Texturen,
  WebAudio). Das Spiel startet per Doppelklick auf `index.html`, komplett
  offline.

## Spielwelt

- Nächtliches Grundstück: Garten mit Zaun, Bäumen und Laternen, in der Mitte
  ein **zweistöckiges Haus**.
- **Echte Etagen**: Erdgeschoss und Obergeschoss sind physisch übereinander
  gebaut. Der Wechsel passiert **nicht** per Teleport, sondern über eine
  **begehbare Treppe** — man läuft sie Stufe für Stufe hoch und runter,
  mit echter Höhenänderung der Kamera. Vom Flur im Obergeschoss blickt man
  durch das Treppenloch nach unten.
- Ausgang: verschlossenes **Gartentor**, das erst mit 3 Schlüsseln aufgeht.
  Einer der Schlüssel liegt **im Obergeschoss** — der Etagenwechsel ist
  Pflicht.

## Gameplay

- **First-Person-Steuerung**: WASD + Maus (Pointer Lock), Shift = Rennen,
  E = Türen öffnen / Aufheben.
- **Taschenlampe (F)** mit Akku; Batterien in der Welt verteilt. Im Dunkeln
  sinkt der **Verstand** (Sanity), bei 0 ist das Spiel verloren.
- **Die Kreatur**: stalkt den Spieler durch beide Etagen (Pfadfindung über
  die Treppe!). Wer sie im Licht ansieht, verlangsamt sie kurz.
- **Sofortiger Tod bei Berührung**: kein Schadenssystem — ein Kontakt genügt.
  Dann folgt ein **Vollbild-Jumpscare** (Großaufnahme, Screen-Shake,
  roter Blitz, Schrei), danach der Game-Over-Bildschirm.

## HUD & Minimap

- **Minimap oben rechts**: zeigt Wände der aktuellen Etage, die Treppe,
  einen Blickrichtungspfeil für den Spieler und — unübersehbar — ein
  **pulsierendes grünes Symbol am Ausgangstor** (nur auf der Etage, auf der
  das Tor liegt). Darunter die aktuelle Etage („Erdgeschoss/Obergeschoss").
- HUD: Schlüsselzähler, Akkuleiste, Verstand-Leiste, Interaktions-Prompts.
- Menü-, Pause-, Game-Over- und Sieg-Bildschirm, alles auf Deutsch.

## Grafik (das Maximum herausholen)

- Prozedurale Texturen: Holzdielen, Tapete, Putz, Steinweg, Gras, Dach.
- Dynamisches Licht: flackernde Laternen, Taschenlampen-Spot **mit echten
  Schatten**, kalter Mondschein, dichter Nebel, Sternenhimmel mit Mond.
- Atmosphäre: Vignette und Filmkorn als Overlay, Kamera-Bobbing beim Gehen,
  Staub/Grusel-Details in den Räumen.
- Die Kreatur als 3D-Modell mit glühenden Augen und unheimlicher Animation.

## Sound (prozedural, WebAudio)

Dunkler Ambient-Drone, Herzschlag der mit der Bedrohung schneller wird,
Schritte, Türknarren, Aufheb-Sound, Jumpscare-Schrei, Sieges-Klang.

## Qualitätskriterien

1. Beide Etagen per BFS auf Erreichbarkeit aller Items geprüft.
2. Läuft flüssig (statische Geometrie gemerged, wenige Draw-Calls).
3. Headless-Tests (z. B. Playwright): keine Konsolenfehler, Screenshots
   aller Zustände (Menü, Erdgeschoss, Treppe, Obergeschoss, Jumpscare,
   Game Over, Sieg).
4. Sauberer, kommentierter Code; keine toten Codepfade.
