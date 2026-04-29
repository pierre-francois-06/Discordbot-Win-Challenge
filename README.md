# Discord Win-Challenge Bot

Dieser Bot dokumentiert Win-Challenges in einem Discord-Textkanal. Er erstellt Teams, Aufgaben, einen laufenden Status und am Ende eine Siegerehrung.

## Kurz erklärt

**Müssen alle Mitspieler etwas installieren?**  
Nein. Nur eine Person lädt den Bot einmal auf den Discord-Server ein. Alle anderen benutzen ihn direkt in Discord.

**Muss PowerShell immer offen bleiben?**  
Nur wenn du den Bot auf deinem Windows-PC laufen lässt. Besser: Du lässt ihn auf deinem Raspberry Pi laufen. Dann bleibt der Bot online, solange der Pi eingeschaltet ist und Internet hat.

**Speichert der Bot Daten?**  
Nur temporär während eine Challenge läuft. Der Bot speichert laufende Challenges in `data/challenges.json`. Sobald die Challenge beendet ist und die Siegerehrung gepostet wurde, wird diese Challenge wieder aus der Datei gelöscht.

**Warum steht kein `WC_STATE...` mehr im Chat?**  
Der Challenge-Stand wird nicht mehr in Discord-Nachrichten versteckt, sondern temporär lokal in der JSON-Datei gespeichert.

## Was du brauchst

- Node.js Version 20 oder neuer
- Einen Discord-Server, auf dem du Bots einladen darfst
- Eine Discord Developer Application mit Bot-Token
- Dieses Projekt auf dem Gerät, auf dem der Bot laufen soll

Prüfe Node.js:

```powershell
node --version
```

Auf Windows nutze am besten immer `npm.cmd` statt `npm`.

## 1. Discord Bot erstellen

1. Öffne <https://discord.com/developers/applications>
2. Klicke auf `New Application`.
3. Gib der App einen Namen, z.B. `Win Challenge Bot`.
4. Öffne links `Bot`.
5. Klicke auf `Add Bot`, falls noch kein Bot existiert.
6. Kopiere den Bot-Token.
7. Behalte den Token geheim.

## 2. IDs kopieren

Du brauchst:

- `DISCORD_TOKEN`: Bot-Token aus dem Bereich `Bot`
- `CLIENT_ID`: Application ID aus `General Information`
- `GUILD_ID`: Server-ID deines Discord-Servers

So findest du die Server-ID:

1. Discord öffnen.
2. Benutzereinstellungen öffnen.
3. Unter `Entwickler` den Entwicklermodus aktivieren.
4. Rechtsklick auf dein Server-Icon.
5. `Server-ID kopieren`.

## 3. Bot auf den Server einladen

Im Developer Portal:

1. Links auf `OAuth2` -> `URL Generator`.
2. Bei `Scopes` auswählen:
   - `bot`
   - `applications.commands`
3. Bei `Bot Permissions` auswählen:
   - `Send Messages`
   - `Embed Links`
   - `Read Message History`
   - `Use Slash Commands`
4. Generierte URL öffnen und Bot auf deinen Server einladen.

Wenn Discord eine Weiterleitungs-URI verlangt, prüfe im Bereich `Bot`, ob `Requires OAuth2 Code Grant` ausgeschaltet ist.

## 4. Projekt einrichten

Pakete installieren:

```powershell
npm.cmd install
```

Erstelle im Projektordner eine Datei `.env`.

Inhalt:

```env
DISCORD_TOKEN=dein_bot_token
CLIENT_ID=deine_application_id
GUILD_ID=deine_server_id
```

Wichtig: Die Datei muss wirklich `.env` heißen, nicht `.env.example`, `.env.txt` oder `.env copy.example`.

## 5. Slash Commands registrieren

```powershell
npm.cmd run register
```

Wenn alles klappt, erscheint ungefähr:

```text
Registered 3 guild commands for ...
```

## 6. Bot lokal starten

```powershell
npm.cmd start
```

Wenn alles klappt:

```text
Logged in as ...
```

Solange du lokal startest, muss dieses Fenster offen bleiben. Für Dauerbetrieb siehe Raspberry-Pi-Abschnitt.

## 7. Bot in Discord benutzen

1. Öffne den Textkanal, in dem Challenges laufen sollen.
2. Schreibe `/setup`.
3. Der Bot postet ein Control Panel.
4. Klicke `Neue Challenge`.
5. Folge dem privaten Setup:
   - Teamanzahl wählen
   - User für jedes Team wählen
   - Sichtbarkeit wählen
   - Aufgaben einzeln hinzufügen
   - Zeitmodus wählen

Aufgaben werden ohne Syntax erstellt:

- Titel: Textfeld
- Anzahl: Zahlenwert im Textfeld
- BxB: Ja/Nein-Schritt, wobei Ja immer `b2b` bedeutet

Während der Challenge klickt jeder Spieler auf `Meine Aufgaben`. Dort sieht er nur offene Aufgaben seines Teams und hakt eine Aufgabe einzeln ab.

## Raspberry Pi: Bot 24/7 laufen lassen

Auf dem Pi muss Node.js installiert sein. Danach kopierst du dieses Projekt auf den Pi, z.B. nach:

```text
/home/pi/discord-win-challenge-bot
```

Auf dem Pi:

```bash
cd /home/pi/discord-win-challenge-bot
npm install
npm run register
npm start
```

Wenn das funktioniert, kannst du den Bot als Dienst einrichten.

### systemd Service einrichten

Die Beispiel-Datei liegt hier:

```text
deploy/win-challenge-bot.service
```

Falls dein Projekt woanders liegt oder dein Pi-User nicht `pi` heißt, passe in der Datei diese Zeilen an:

```ini
WorkingDirectory=/home/pi/discord-win-challenge-bot
User=pi
```

Dann auf dem Pi:

```bash
sudo cp deploy/win-challenge-bot.service /etc/systemd/system/win-challenge-bot.service
sudo systemctl daemon-reload
sudo systemctl enable win-challenge-bot
sudo systemctl start win-challenge-bot
```

Status prüfen:

```bash
sudo systemctl status win-challenge-bot
```

Logs ansehen:

```bash
journalctl -u win-challenge-bot -f
```

Bot stoppen:

```bash
sudo systemctl stop win-challenge-bot
```

Bot nach Änderungen neu starten:

```bash
sudo systemctl restart win-challenge-bot
```

## Tests

```powershell
npm.cmd test
```

## Häufige Probleme

**`npm` geht in PowerShell nicht**  
Nutze `npm.cmd`.

**Slash Commands erscheinen nicht**  
Prüfe `CLIENT_ID` und `GUILD_ID`, dann erneut:

```powershell
npm.cmd run register
```

**Bot ist offline**  
Der Bot läuft nur, wenn der Prozess aktiv ist. Auf dem Raspberry Pi sollte der `systemd`-Service laufen.

**Bot kann nicht schreiben**  
Prüfe die Kanalrechte. Der Bot braucht Schreibrechte, Embed-Rechte und Zugriff auf den Nachrichtenverlauf.

**Challenge ist nach Ende nicht mehr in `data/challenges.json`**  
Das ist gewollt. Die Datei speichert nur laufende Challenges temporär.
