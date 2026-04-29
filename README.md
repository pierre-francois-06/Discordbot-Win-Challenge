# Discordbot-Win-Challenge

**Discord Win Challenge Bot / Win Challenge Discord Bot / Discord Challenge Tracker**

Ein Discord-Bot für Win-Challenges, Team-Challenges, Gaming-Challenges und Siegesserien. Dieses GitHub-Repository enthält den kompletten Code für einen Discordbot, der Challenges in einem Discord-Textkanal erstellt, dokumentiert und am Ende eine Siegerehrung postet.

Repository: <https://github.com/pierre-francois-06/Discordbot-Win-Challenge>

Suchbegriffe: `Discordbot-Win-Challenge`, `Discord Win Challenge Bot`, `Win Challenge Discord Bot`, `Discord Challenge Bot`, `Discord Challenge Tracker`, `Discord Gaming Challenge Bot`, `Discord Bot Raspberry Pi`, `discord.js challenge bot`.

Diese Anleitung führt dich komplett durch die Installation. Du musst kein Programmierer sein. Folge einfach der Reihenfolge.

Der Bot macht Win-Challenges in Discord:

- Teams erstellen
- Aufgaben/Spiele eintragen
- Aufgaben während der Challenge abhaken
- Zeiten automatisch mitschreiben
- Am Ende eine Siegerehrung posten

## Ganz kurz: Wie funktioniert das?

Ein Discord-Bot besteht aus zwei Teilen:

1. **Discord-Seite:** Du erstellst im Discord Developer Portal eine Bot-App und lädst sie auf deinen Server ein.
2. **Laufender Bot-Prozess:** Irgendwo muss das Bot-Programm laufen, z.B. auf deinem PC oder besser auf deinem Raspberry Pi.

Wichtig:

- Deine Mitspieler müssen nichts installieren.
- Der Bot läuft nur, solange das Gerät an ist, auf dem du ihn startest.
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
2. `Token.txt` danach löschen.

Der Bot braucht nur die `.env`.

## Voraussetzungen

Du brauchst:

- Einen Discord-Account
- Einen Discord-Server, auf dem du Bots einladen darfst
- Dieses Projekt auf deinem PC oder Raspberry Pi
- Node.js Version 20 oder neuer

Node.js prüfen:

```powershell
node --version
```

Wenn dort z.B. `v22.16.0` steht, ist alles gut.

Auf Windows bitte meistens `npm.cmd` verwenden, nicht nur `npm`.

## Teil A: Bot in Discord erstellen

### 1. Developer Portal öffnen

Öffne diese Seite:

```text
https://discord.com/developers/applications
```

### 2. Neue App erstellen

1. Klicke auf `New Application`.
2. Gib einen Namen ein, z.B.:

    ```text
    Win Challenge Bot
    ```

3. Bestätige.

### 3. Bot erstellen

1. Klicke links auf `Bot`.
2. Falls dort `Add Bot` steht, klicke darauf.
3. Falls schon ein Bot existiert, ist das auch okay.

### 4. Bot-Token kopieren

1. Im Bereich `Bot` suchst du `Token`.
2. Klicke auf `Reset Token` oder `Copy`.
3. Kopiere den Token.
4. Speichere ihn erstmal nur lokal.

Dieser Wert kommt später in die `.env`:

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

Diese Zahl kommt später in die `.env`:

```env
CLIENT_ID=hier_kommt_deine_application_id_rein
```

### GUILD_ID finden

`GUILD_ID` bedeutet: die ID deines Discord-Servers.

Falls du `Server-ID kopieren` nicht siehst:

1. Discord öffnen.
2. Unten links auf das Zahnrad.
3. Links auf `Entwickler`.
4. `Entwicklermodus` aktivieren.
5. Einstellungen schließen.
6. Rechtsklick auf dein Server-Icon links in der Server-Leiste.
7. `Server-ID kopieren`.

Diese Zahl kommt später in die `.env`:

```env
GUILD_ID=hier_kommt_deine_server_id_rein
```

## Teil C: Bot auf deinen Discord-Server einladen

### 1. OAuth2 URL Generator öffnen

Im Developer Portal:

1. Links auf `OAuth2`.
2. Dann auf `URL Generator`.

### 2. Scopes auswählen

Bei `Scopes` nur diese beiden ankreuzen:

```text
bot
applications.commands
```

Keine anderen Scopes ankreuzen.

### 3. Bot Permissions auswählen

Bei `Bot Permissions` diese Rechte ankreuzen:

```text
Send Messages
Embed Links
Read Message History
Use Slash Commands
```

Auf Deutsch können die so heißen:

```text
Nachrichten senden
Links einbetten
Nachrichtenverlauf anzeigen
Slash-Befehle verwenden
```

### 4. Invite-Link benutzen

Unten wird eine lange URL generiert.

1. URL kopieren.
2. Im Browser öffnen.
3. Deinen Server auswählen.
4. Bot autorisieren.

### Wenn Discord eine Weiterleitungs-URI verlangt

Dann ist meistens eine Bot-Einstellung falsch.

Prüfe:

1. Links auf `Bot`.
2. Suche `Requires OAuth2 Code Grant`.
3. Diese Option muss ausgeschaltet sein.
4. Danach wieder zu `OAuth2` -> `URL Generator`.

Du brauchst für diesen Bot keine Weiterleitungs-URI.

## Teil D: `.env` Datei erstellen

Im Projektordner muss eine Datei genau so heißen:

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

- Keine Anführungszeichen.
- Keine Leerzeichen vor oder nach `=`.
- Jede Zeile genau einmal.
- Token nicht in Klammern setzen.

## Teil E: Bot auf Windows testen

Öffne PowerShell im Projektordner.

Der Projektordner ist bei dir ungefähr:

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

Wenn alles gut ist, steht dort ungefähr:

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

Wichtig: Wenn du PowerShell schließt, stoppt der Bot. Für 24/7 nimm den Raspberry Pi.

## Teil F: Bot in Discord benutzen

### 1. Challenge-Zentrale erstellen

Gehe in den Textkanal, in dem die Challenge laufen soll.

Schreibe:

```text
/setup
```

Der Bot postet eine dauerhafte Challenge-Zentrale mit dem Button `Neue Challenge`.

### 2. Neue Challenge starten

Du hast zwei Möglichkeiten:

```text
Neue Challenge
```

oder direkt:

```text
/startchallenge
```

Beide Wege starten denselben Setup-Flow. Danach führt dich der Bot mit Popups durch das Setup. Discord nennt diese Popups auch `Modals`.

Wichtig: Discord erlaubt nicht zuverlässig, direkt aus einem abgeschickten Popup sofort das nächste Popup zu öffnen. Deshalb zeigt der Bot zwischen manchen Popups kurz einen privaten `Weiter`-Button. Die eigentlichen Eingaben bleiben trotzdem in Popups.

### 3. Setup-Schritte

Der Bot fragt nacheinander:

1. Wie viele Teams?
2. Welche User sind in Team 1?
3. Welche User sind in Team 2?
4. Ob Gegnerdetails sichtbar sein sollen.
5. Welche Aufgaben es gibt.
6. Ob Zeit nur gezählt wird oder ein Zeitlimit gilt.

Diese Abfragen erscheinen als Popups. Bei Team-Usern kannst du Discord-User direkt im Popup auswählen.

### 4. Aufgaben hinzufügen

Du musst keine Syntax mehr lernen.

Pro Aufgabe:

- Titel eintragen
- Anzahl eintragen
- BxB per Checkbox aktivieren oder nicht

BxB bedeutet aktuell:

```text
Checkbox aktiv = b2b
Checkbox aus = kein b2b
```

### 5. Aufgabe während der Challenge abhaken

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

Nach dem Ende löscht der Bot die Fortschritts- und Abstimmungsnachrichten dieser Challenge.

Es bleibt nur die Siegerehrung sichtbar.

Alte Siegerehrungen anderer Challenges werden nicht gelöscht.

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

### 1. Service-Datei prüfen

Öffne:

```text
deploy/win-challenge-bot.service
```

Prüfe diese Zeilen:

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

### 5. Status prüfen

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

Nach Code-Änderungen:

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

Diese Datei ist nur temporär.

Wenn eine Challenge abgeschlossen ist:

- Siegerehrung bleibt in Discord
- Challenge-Daten werden aus `data/challenges.json` gelöscht

Wenn der Bot während einer laufenden Challenge neu startet:

- Bot liest `data/challenges.json`
- laufende Challenge kann weitergehen

## Tests ausführen

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

## Häufige Probleme

### `npm` funktioniert in PowerShell nicht

Nutze:

```powershell
npm.cmd install
npm.cmd start
```

### Bot ist offline

Prüfe:

- Ist `npm.cmd start` noch offen?
- Oder läuft auf dem Pi der Service?
- Hat das Gerät Internet?
- Ist der Token in `.env` richtig?

Pi prüfen:

```bash
sudo systemctl status win-challenge-bot
```

### Slash Commands erscheinen nicht

Prüfe:

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

Prüfe im Discord-Kanal die Rechte des Bots:

- Nachrichten senden
- Links einbetten
- Nachrichtenverlauf anzeigen
- Slash-Befehle verwenden

### Invite-Link will eine Weiterleitungs-URI

Prüfe im Developer Portal:

1. Links auf `Bot`.
2. `Requires OAuth2 Code Grant` ausschalten.
3. Zurück zu `OAuth2` -> `URL Generator`.
4. Nur `bot` und `applications.commands` auswählen.

### `.env` wird nicht erkannt

Prüfe:

- Datei heisst wirklich `.env`
- Datei liegt neben `package.json`
- Datei ist nicht `.env.txt`
- Inhalt hat keine Anführungszeichen
- Keine Leerzeichen um `=`

### Bot startet, aber `/setup` oder `/startchallenge` geht nicht

Prüfe:

1. Wurde `npm.cmd run register` ausgeführt?
2. Ist `GUILD_ID` die richtige Server-ID?
3. Wurde der Bot auf genau diesen Server eingeladen?
4. Nach Updates mit neuen Commands musst du `npm.cmd run register` erneut ausführen.

## Normale Reihenfolge für Windows

Wenn du alles einmal eingerichtet hast, brauchst du meistens nur:

```powershell
npm.cmd start
```

Beim ersten Setup oder nach Command-Änderungen:

```powershell
npm.cmd install
npm.cmd run register
npm.cmd start
```

## Normale Reihenfolge für Raspberry Pi

Einmalig:

```bash
npm install
npm run register
sudo cp deploy/win-challenge-bot.service /etc/systemd/system/win-challenge-bot.service
sudo systemctl daemon-reload
sudo systemctl enable win-challenge-bot
sudo systemctl start win-challenge-bot
```

Danach läuft der Bot automatisch im Hintergrund.
