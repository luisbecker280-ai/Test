# NOCTURNE 3D

Echtes 3D-Horrorspiel (Three.js/WebGL) — komplette Neuentwicklung des
Pygame-Raycasters als First-Person-Spiel mit **zwei begehbaren Etagen**.

## Starten

Einfach **`index.html` doppelklicken** (jeder moderne Browser, komplett
offline — Three.js liegt in `lib/` bei, alle Texturen und Sounds werden
prozedural erzeugt).

## Ziel

Finde **3 Schlüssel** (einer liegt im Obergeschoss — die Treppe im
Nordost-Zimmer führt hinauf), entriegle das Gartentor im Süden und entkomme.
Die Kreatur jagt dich durch **beide** Etagen. **Eine Berührung = sofortiger
Tod** mit Jumpscare.

## Steuerung

| Taste | Aktion |
|---|---|
| WASD | Gehen |
| Maus | Umsehen |
| SHIFT | Rennen (Ausdauer) |
| F | Taschenlampe (Akku!) |
| E | Tür öffnen/schließen, Tor entriegeln |
| ESC | Pause |

Die **Minimap oben rechts** zeigt die Wände deiner aktuellen Etage, die
Treppe (blau) und — pulsierend grün — den **AUSGANG**.

## Technik

- `js/config.js` — Grundrisse beider Etagen, Kollision, Treppen-Höhenmodell, A*, Sichtlinien (pur, auch per Node testbar)
- `js/textures.js` — prozedurale Canvas-Texturen (Dielen, Tapete, Putz, Gras, Himmel …)
- `js/geometry.js` — gemergte Wand-/Boden-/Decken-Meshes, Treppenstufen, Türen, Tor, Props
- `js/player.js` — First-Person-Controller; die Etage ergibt sich aus der Höhe (Treppe = Rampe)
- `js/creature.js` — Kreatur-Modell + KI (jagt per A* über die Treppe in beide Etagen)
- `js/audio.js` — WebAudio: Drone, Herzschlag, Schritte, Türknarren, Schrei
- `js/main.js` — Game-States, HUD, Minimap, Jumpscare-Regie
