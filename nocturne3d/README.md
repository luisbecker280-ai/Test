# NOCTURNE — Nacht 1: „Die Tankstelle"

Story-Horrorspiel in echtem 3D (Three.js/WebGL). Du bist Nachtschicht-
Mitarbeiter einer einsamen Tankstelle an einer Waldstraße — und diese
Nacht endet nicht so, wie sie beginnt.

## Starten

**`index.html` doppelklicken** — läuft in jedem modernen Browser, komplett
offline (Three.js liegt in `lib/` bei, alle Texturen, Sounds und die Musik
werden prozedural erzeugt).

## Die Nacht in 4 Akten

1. **Eine normale Nachtschicht** — Autos ziehen vorbei, Kunden kommen:
   Kaffee brühen, Burger einpacken, kassieren ([E] an Maschine/Theke/Kasse).
2. **Die Warnung** — Ein Polizist warnt dich: Leichen im Wald. Schließ ab
   ([L] an der Eingangstür) und bleib drinnen.
3. **Er ist hier** — Das Licht fällt aus. In der Garage steht ein alter
   Kombi, dem **4 Teile + der Autoschlüssel** fehlen: Batterie (Lager),
   Zündkerzen (Jagdhütte), Ersatzrad (Autowrack), Benzinkanister (an der
   Zapfsäule füllen — laut!) und der Schlüssel… bei deinem Vorgänger.
   Die Minimap zeigt Suchgebiete. **Eine Berührung = Tod + Jumpscare.**
4. **Die Flucht** — Motor starten (er orgelt zweimal…), selbst fahren,
   durch den Tunnel. Schwarzblende. *Du hast überlebt — Nacht 1.*

## Überleben

- **Revolver** (Schublade unterm Tresen): betäubt die Kreatur ~6 s.
  6 Schuss; Nachschub in der Hütte. Der Knall verrät dich.
- **Energieriegel** ([Q]): Ausdauer sofort voll + Sprint-Bonus.
- **Verstecke**: unter dem Tresen, Spind im Lager, Ecke der Jagdhütte.
- **Ton verrät alles**: Ist es still (nur Wind und Blätter), bist du
  sicher. Setzt die Verfolgungsmusik ein — renn.

## Steuerung

| Taste | Aktion |
|---|---|
| WASD / Maus | Gehen / Umsehen (im Auto: Gas, Bremse, Lenken) |
| SHIFT | Rennen |
| E | Benutzen / Aufheben / Einbauen / Verstecken / Einsteigen |
| Klick | Schießen (mit Revolver) |
| F | Taschenlampe |
| Q | Energieriegel essen |
| L | Eingangstür ab-/aufschließen |
| ESC | Pause |

## Technik

- `js/config.js` — Karte (96×64), Kollision, A*, Sichtlinien (Node-testbar)
- `js/textures.js` / `js/geometry.js` — prozedurale Texturen; Tankstelle mit
  Satteldach, Fensterfront, Vordach & Zapfsäulen; Tunnel; Jagdhütte; Wrack;
  **realistischere Bäume** (rekursiv verzweigt, instanziert)
- `js/creature.js` — Kreatur-Redesign (überlange Gliedmaßen, gebeugter
  Gang) + KI: patrouilliert, hört, jagt, sucht, kann betäubt werden
- `js/npc.js` — Kunden, Polizist, Verkehr, fahrbares Auto
- `js/story.js` — Akt-Steuerung, Bestellungen, Polizei-Event, Teile-System
- `js/audio.js` — Wind/Blätter-Stille vs. Verfolgungsmusik, Radio, Motor,
  Zapfsäule, Türglocke, Schuss und der laute Jumpscare-Schrei
- `js/main.js` — Interaktion, HUD, Minimap, Jumpscare-Regie, Finale & Outro

Debug/Test: `index.html?debug` (API `window.NOC`), `?fast` reduziert
Details für Headless-Tests.
