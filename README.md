# Discord Win-Challenge Bot

Diese Anleitung fuehrt dich komplett durch die Installation. Du musst kein Programmierer sein. Folge einfach der Reihenfolge.

Der Bot macht Win-Challenges in Discord:

- Teams erstellen
- Aufgaben/Spiele eintragen
- Aufgaben waehrend der Challenge abhaken
- Zeiten automatisch mitschreiben
- Am Ende eine Siegerehrung posten

## Ganz kurz: Wie funktioniert das?

Ein Discord-Bot besteht aus zwei Teilen:

1. **Discord-Seite:** Du erstellst im Discord Developer Portal eine Bot-App und laedst sie auf deinen Server ein.
2. **Laufender Bot-Prozess:** Irgendwo muss das Bot-Programm laufen, z.B. auf deinem PC oder besser auf deinem Raspberry Pi.

Wichtig:

- Deine Mitspieler muessen nichts installieren.
- Der Bot laeuft nur, solange das Geraet an ist, auf dem du ihn startest.
- Wenn dein PC aus ist, ist der Bot aus.
- Wenn dein Raspberry Pi an ist, kann der Bot 24/7 laufen.

## Was ist was?

| Begriff              | Bedeutung                                         |
| -------------------- | ------------------------------------------------- |
| `DISCORD_TOKEN`      | Das geheime Passwort deines Bots. Niemals teilen. |
| `CLIENT_ID`          | Die Application ID deiner Discord-App.            |
| `GUILD_ID`           | Die Server-ID deines Discord-Servers.             |
| `.env`               | Lokale Datei, in der Token und IDs stehen.        |
| Slash Command        | Ein Discord-Befehl wie `/setup`.                  |
| Raspberry Pi Service | Startet den Bot automatisch im Hintergrund.       |

## Sehr wichtig: Token geheim halten

Der Bot-Token ist wie ein Passwort.

Mache das nicht:

- Token in Discord posten
- Token hier in den Chat posten
- Token auf GitHub hochladen
- Token in Screenshots zeigen

Wenn du eine Datei `Token.txt` benutzt hast, ist das lokal okay. Besser ist aber:

1. Token in die `.env` kopieren.
2. `Token.txt` danach loeschen.

Der Bot braucht nur die `.env`.

## Voraussetzungen

Du brauchst:

- Einen Discord-Account
- Einen Discord-Server, auf dem du Bots einladen darfst
- Dieses Projekt auf deinem PC oder Raspberry Pi
- Node.js Version 20 oder neuer

Node.js pruefen:

```powershell
node --version
```

Wenn dort z.B. `v22.16.0` steht, ist alles gut.

Auf Windows bitte meistens `npm.cmd` verwenden, nicht nur `npm`.

## Teil A: Bot in Discord erstellen

### 1. Developer Portal oeffnen

Oeffne diese Seite:

```text
https://discord.com/developers/applications
```

### 2. Neue App erstellen

1. Klicke auf `New Application`.
2. Gib einen Namen ein, z.B.:

    ```text
    Win Challenge Bot
    ```

3. Bestaetige.

### 3. Bot erstellen

1. Klicke links auf `Bot`.
2. Falls dort `Add Bot` steht, klicke darauf.
3. Falls schon ein Bot existiert, ist das auch okay.

### 4. Bot-Token kopieren

1. Im Bereich `Bot` suchst du `Token`.
2. Klicke auf `Reset Token` oder `Copy`.
3. Kopiere den Token.
4. Speichere ihn erstmal nur lokal.

Dieser Wert kommt spaeter in die `.env`:

```env
DISCORD_TOKEN=hier_kommt_dein_token_rein
```

## Teil B: IDs finden

Du brauchst zwei IDs:

- `CLIENT_ID`
- `GUILD_ID`

### CLIENT_ID finden

1. Im Developer Portal links auf `General Information`.
2. Suche `Application ID`.
3. Kopiere diese Zahl.

Diese Zahl kommt spaeter in die `.env`:

```env
CLIENT_ID=hier_kommt_deine_application_id_rein
```

### GUILD_ID finden

`GUILD_ID` bedeutet: die ID deines Discord-Servers.

Falls du `Server-ID kopieren` nicht siehst:

1. Discord oeffnen.
2. Unten links auf das Zahnrad.
3. Links auf `Entwickler`.
4. `Entwicklermodus` aktivieren.
5. Einstellungen schliessen.
6. Rechtsklick auf dein Server-Icon links in der Server-Leiste.
7. `Server-ID kopieren`.

Diese Zahl kommt spaeter in die `.env`:

```env
GUILD_ID=hier_kommt_deine_server_id_rein
```

## Teil C: Bot auf deinen Discord-Server einladen

### 1. OAuth2 URL Generator oeffnen

Im Developer Portal:

1. Links auf `OAuth2`.
2. Dann auf `URL Generator`.

### 2. Scopes auswaehlen

Bei `Scopes` nur diese beiden ankreuzen:

```text
bot
applications.commands
```

Keine anderen Scopes ankreuzen.

### 3. Bot Permissions auswaehlen

Bei `Bot Permissions` diese Rechte ankreuzen:

```text
Send Messages
Embed Links
Read Message History
Use Slash Commands
```

Auf Deutsch koennen die so heissen:

```text
Nachrichten senden
Links einbetten
Nachrichtenverlauf anzeigen
Slash-Befehle verwenden
```

### 4. Invite-Link benutzen

Unten wird eine lange URL generiert.

1. URL kopieren.
2. Im Browser oeffnen.
3. Deinen Server auswaehlen.
4. Bot autorisieren.

### Wenn Discord eine Weiterleitungs-URI verlangt

Dann ist meistens eine Bot-Einstellung falsch.

Pruefe:

1. Links auf `Bot`.
2. Suche `Requires OAuth2 Code Grant`.
3. Diese Option muss ausgeschaltet sein.
4. Danach wieder zu `OAuth2` -> `URL Generator`.

Du brauchst fuer diesen Bot keine Weiterleitungs-URI.

## Teil D: `.env` Datei erstellen

Im Projektordner muss eine Datei genau so heissen:

```text
.env
```

Nicht:

```text
.env.example
.env copy.example
.env.txt
Token.txt
```

Die `.env` liegt direkt im Hauptordner des Projekts, also neben `README.md` und `package.json`.

Inhalt der `.env`:

```env
DISCORD_TOKEN=dein_bot_token
CLIENT_ID=deine_application_id
GUILD_ID=deine_server_id
```

Beispiel:

```env
DISCORD_TOKEN=MTIz...
CLIENT_ID=123456789012345678
GUILD_ID=987654321098765432
```

Wichtig:

- Keine Anfuehrungszeichen.
- Keine Leerzeichen vor oder nach `=`.
- Jede Zeile genau einmal.
- Token nicht in Klammern setzen.

## Teil E: Bot auf Windows testen

Oeffne PowerShell im Projektordner.

Der Projektordner ist bei dir ungefaehr:

```text
c:\Users\pierr\Documents\Pierre\Privat\Pierre\Discord
```

### 1. Pakete installieren

```powershell
npm.cmd install
```

Das muss nur beim ersten Mal gemacht werden.

### 2. Slash Commands registrieren

```powershell
npm.cmd run register
```

Wenn alles gut ist, steht dort ungefaehr:

```text
Registered 3 guild commands for ...
```

### 3. Bot starten

```powershell
npm.cmd start
```

Wenn alles gut ist, steht dort:

```text
Logged in as ...
```

Jetzt ist der Bot online.

Wichtig: Wenn du PowerShell schliesst, stoppt der Bot. Fuer 24/7 nimm den Raspberry Pi.

## Teil F: Bot in Discord benutzen

### 1. Control Panel erstellen

Gehe in den Textkanal, in dem die Challenge laufen soll.

Schreibe:

```text
/setup
```

Der Bot postet ein Control Panel mit `Neue Challenge`.

### 2. Neue Challenge starten

Klicke auf:

```text
Neue Challenge
```

Dann fuehrt dich der Bot privat durch das Setup.

### 3. Setup-Schritte

Der Bot fragt nacheinander:

1. Wie viele Teams?
2. Welche User sind in Team 1?
3. Welche User sind in Team 2?
4. Ob Gegnerdetails sichtbar sein sollen.
5. Welche Aufgaben es gibt.
6. Ob Zeit nur gezaehlt wird oder ein Zeitlimit gilt.

### 4. Aufgaben hinzufuegen

Du musst keine Syntax mehr lernen.

Pro Aufgabe:

- Titel eintragen
- Anzahl eintragen
- BxB aktivieren oder nicht

BxB bedeutet aktuell:

```text
Ja = b2b
Nein = kein b2b
```

### 5. Aufgabe waehrend der Challenge abhaken

Jeder Spieler klickt:

```text
Meine Aufgaben
```

Dann sieht der Spieler nur die offenen Aufgaben seines Teams.

Wenn eine Aufgabe abgehaakt wurde:

- Zeit wird gespeichert
- Aufgabe verschwindet aus der Auswahl
- Status wird aktualisiert

### 6. Challenge-Ende

Wenn ein Team alle Aufgaben erledigt hat:

- Bot startet eine Abstimmung
- Mehrheit entscheidet
- Danach wird eine Siegerehrung gepostet

Nach dem Ende loescht der Bot die Fortschritts- und Abstimmungsnachrichten dieser Challenge.

Es bleibt nur die Siegerehrung sichtbar.

Alte Siegerehrungen anderer Challenges werden nicht geloescht.

## Teil G: Raspberry Pi 24/7 Betrieb

Das ist die beste Variante, damit du keine PowerShell offen lassen musst.

Der Raspberry Pi muss:

- eingeschaltet sein
- Internet haben
- Node.js installiert haben
- dieses Projekt enthalten

### 1. Projekt auf den Pi kopieren

Empfohlener Ordner auf dem Pi:

```text
/home/pi/discord-win-challenge-bot
```

Wenn du einen anderen User als `pi` hast, ist der Pfad entsprechend anders.

### 2. Auf dem Pi in den Projektordner gehen

```bash
cd /home/pi/discord-win-challenge-bot
```

### 3. `.env` auf dem Pi erstellen

Auch auf dem Pi brauchst du eine `.env`.

Inhalt:

```env
DISCORD_TOKEN=dein_bot_token
CLIENT_ID=deine_application_id
GUILD_ID=deine_server_id
```

### 4. Pakete installieren

```bash
npm install
```

### 5. Slash Commands registrieren

```bash
npm run register
```

### 6. Testweise starten

```bash
npm start
```

Wenn dort `Logged in as ...` steht, funktioniert der Bot.

Beende den Test mit:

```text
STRG + C
```

## Teil H: Raspberry Pi Service einrichten

Damit der Bot automatisch im Hintergrund startet, nutzt du `systemd`.

Die Service-Datei im Projekt heisst:

```text
deploy/win-challenge-bot.service
```

### 1. Service-Datei pruefen

Oeffne:

```text
deploy/win-challenge-bot.service
```

Pruefe diese Zeilen:

```ini
WorkingDirectory=/home/pi/discord-win-challenge-bot
User=pi
```

Wenn dein Projekt woanders liegt oder dein User anders heisst, musst du diese zwei Zeilen anpassen.

### 2. Service installieren

Auf dem Pi im Projektordner:

```bash
sudo cp deploy/win-challenge-bot.service /etc/systemd/system/win-challenge-bot.service
```

Dann:

```bash
sudo systemctl daemon-reload
```

### 3. Automatischen Start aktivieren

```bash
sudo systemctl enable win-challenge-bot
```

### 4. Bot starten

```bash
sudo systemctl start win-challenge-bot
```

### 5. Status pruefen

```bash
sudo systemctl status win-challenge-bot
```

Gut ist, wenn dort steht:

```text
active (running)
```

### 6. Logs ansehen

```bash
journalctl -u win-challenge-bot -f
```

Beenden mit:

```text
STRG + C
```

### 7. Bot neu starten

Nach Code-Aenderungen:

```bash
sudo systemctl restart win-challenge-bot
```

### 8. Bot stoppen

```bash
sudo systemctl stop win-challenge-bot
```

## Daten und Speicherung

Laufende Challenges stehen hier:

```text
data/challenges.json
```

Diese Datei ist nur temporaer.

Wenn eine Challenge abgeschlossen ist:

- Siegerehrung bleibt in Discord
- Challenge-Daten werden aus `data/challenges.json` geloescht

Wenn der Bot waehrend einer laufenden Challenge neu startet:

- Bot liest `data/challenges.json`
- laufende Challenge kann weitergehen

## Tests ausfuehren

Auf Windows:

```powershell
npm.cmd test
```

Auf Raspberry Pi/Linux:

```bash
npm test
```

Wenn alles gut ist, steht am Ende:

```text
pass
```

## Haeufige Probleme

### `npm` funktioniert in PowerShell nicht

Nutze:

```powershell
npm.cmd install
npm.cmd start
```

### Bot ist offline

Pruefe:

- Ist `npm.cmd start` noch offen?
- Oder laeuft auf dem Pi der Service?
- Hat das Geraet Internet?
- Ist der Token in `.env` richtig?

Pi pruefen:

```bash
sudo systemctl status win-challenge-bot
```

### Slash Commands erscheinen nicht

Pruefe:

- `CLIENT_ID` richtig?
- `GUILD_ID` richtig?
- Bot mit `applications.commands` eingeladen?

Dann nochmal:

```powershell
npm.cmd run register
```

Auf Pi:

```bash
npm run register
```

### Bot kann nicht schreiben

Pruefe im Discord-Kanal die Rechte des Bots:

- Nachrichten senden
- Links einbetten
- Nachrichtenverlauf anzeigen
- Slash-Befehle verwenden

### Invite-Link will eine Weiterleitungs-URI

Pruefe im Developer Portal:

1. Links auf `Bot`.
2. `Requires OAuth2 Code Grant` ausschalten.
3. Zurueck zu `OAuth2` -> `URL Generator`.
4. Nur `bot` und `applications.commands` auswaehlen.

### `.env` wird nicht erkannt

Pruefe:

- Datei heisst wirklich `.env`
- Datei liegt neben `package.json`
- Datei ist nicht `.env.txt`
- Inhalt hat keine Anfuehrungszeichen
- Keine Leerzeichen um `=`

### Bot startet, aber `/setup` geht nicht

Pruefe:

1. Wurde `npm.cmd run register` ausgefuehrt?
2. Ist `GUILD_ID` die richtige Server-ID?
3. Wurde der Bot auf genau diesen Server eingeladen?

## Normale Reihenfolge fuer Windows

Wenn du alles einmal eingerichtet hast, brauchst du meistens nur:

```powershell
npm.cmd start
```

Beim ersten Setup oder nach Command-Aenderungen:

```powershell
npm.cmd install
npm.cmd run register
npm.cmd start
```

## Normale Reihenfolge fuer Raspberry Pi

Einmalig:

```bash
npm install
npm run register
sudo cp deploy/win-challenge-bot.service /etc/systemd/system/win-challenge-bot.service
sudo systemctl daemon-reload
sudo systemctl enable win-challenge-bot
sudo systemctl start win-challenge-bot
```

Danach laeuft der Bot automatisch im Hintergrund.
