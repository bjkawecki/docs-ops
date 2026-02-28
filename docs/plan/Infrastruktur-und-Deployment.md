# Infrastruktur & Deployment

Plan für die technische Umsetzung der internen Dokumentationsplattform (vgl. [Doc-Platform-Konzept](../platform/Doc-Platform-Konzept.md)). Fokus: einfache Installation, Betrieb im internen Netz, optionale Nutzung per VPN.

---

## 1. Open Source & GitHub

- **Ziel:** Plattform ist Open Source, von GitHub herunterladbar, nachvollziehbar und erweiterbar.
- **Umsetzung:**
  - Repository auf GitHub (öffentlich oder als Template).
  - Klare Lizenz (z. B. MIT oder Apache 2.0) im Repo.
  - README mit Kurzbeschreibung, Voraussetzungen, Installations- und Update-Anleitung.
  - Relevante Konfiguration und Skripte im Repo (keine geheimen Defaults).

---

## 2. Installation per Shell-Script

- **Ziel:** Einmalige Installation mit einem Skript, ohne manuelles Zusammenpuzzeln.
- **Umsetzung:**
  - Ein `install.sh` (oder vergleichbar) im Repo.
  - Skript prüft Voraussetzungen (Docker oder Podman, ggf. Docker Compose / Podman Compose).
  - Lädt Quellcode/Artefakte (z. B. `git clone` oder Download eines Releases).
  - Startet Container-Stack per `docker compose up -d` bzw. Podman-Äquivalent.
  - Optional: Anlegen einer minimalen Konfiguration und Hinweis auf Reverse Proxy (siehe Abschnitt 7).
  - Dokumentation: Ablauf im README und ggf. in `docs/install.md`.

---

## 3. Update aus der App

- **Ziel:** Updates möglichst einfach, idealerweise aus der App heraus anstoßbar.
- **Optionen:**
  - **Variante A (komfortabel):** In der App Menüpunkt „Update prüfen“ / „Jetzt aktualisieren“. Backend löst auf dem Host ein Update-Skript aus (z. B. `git pull`, `docker compose pull`, `docker compose up -d`). Dafür ist Zugriff auf den Docker-Socket oder ein kleines Updater-Script auf dem Host nötig (Sicherheit und Rechte beachten).
  - **Variante B (einfacher, weniger privilegiert):** App zeigt nur Hinweis „Neue Version X verfügbar“ und verweist auf manuelles Ausführen von `./scripts/update.sh` auf dem Server.
- **Wichtig:** In der UI immer auf Backup/Snapshot vor dem Update hinweisen. Bei Docker: Daten in Volumes legen, damit Rollback = Start mit vorherigem Image möglich ist.

---

## 4. Container: Docker oder Podman

- **Ziel:** App und ggf. weitere Dienste laufen in Containern; Unterstützung für Docker und Podman.
- **Umsetzung:**
  - Eine oder wenige Images (mindestens: App; optional: Datenbank, Reverse Proxy).
  - `docker-compose.yml` (bzw. kompatible Compose-Datei) für den gesamten Stack.
  - Install-Skript erkennt vorhandene Runtime (Docker vs. Podman) und nutzt die passenden Befehle.
  - Optional: `alias docker=podman`-Hinweis in der Doku für Nutzer, die nur Podman haben.
  - Für eine schlanke Dokumentationsplattform reicht typischerweise ein App-Container plus optional ein DB-Container.

---

## 5. Interner HTTP-Server

- **Ziel:** Die App ist ein normaler HTTP-Server, der im internen Netz erreichbar ist.
- **Umsetzung:**
  - App bindet sich an `0.0.0.0:<Port>` (z. B. 8080), damit sie aus dem LAN erreichbar ist.
  - Keine Annahme eines festen Hostnamens; Konfiguration für Basis-URL optional.
  - Im LAN Zugriff z. B. über `http://<server>:8080` oder über Reverse Proxy (Abschnitt 7).

---

## 6. VPN (WireGuard o. Ä.) für Zugriff von außen

- **Ziel:** Zugriff von außerhalb des LANs nur über VPN; konfigurierbar bzw. dokumentiert.
- **Umsetzung:**
  - Die App selbst benötigt keine VPN-Integration. Sie läuft wie in Abschnitt 5; Zugriff von „außen“ erfolgt über VPN-Clients, die sich im internen Netz „einklinken“.
  - **Konfigurierbar** bedeutet hier vor allem: Dokumentation (und ggf. optionale Skripte) zur Einrichtung von WireGuard (oder Tailscale, ZeroTier o. Ä.) auf dem Server und bei den Clients.
  - Optional: Einstellung in der App oder im Reverse Proxy, Zugriff nur aus bestimmten Netzen (z. B. VPN-Subnetz) zu erlauben.

---

## 7. Reverse Proxy als Entry Point

- **Ziel:** Ein zentraler Einstiegspunkt, optional mit TLS; geringer Aufwand auf einem einfachen Server.
- **Umsetzung:**
  - Reverse Proxy (z. B. Caddy oder Traefik) auf dem Host oder als Container auf Port 80/443.
  - Proxy leitet auf den App-Container (z. B. Port 8080) weiter.
  - Vorteile: TLS-Terminierung, zentrale Logs, später einfache Erweiterung um weitere Dienste.
  - **Minimalvariante:** Kein Proxy; App direkt auf Port 80 oder 8080 – ausreichend für reines Intranet ohne HTTPS. Für VPN-Zugriff von außen ist HTTPS empfehlenswert, dann reicht ein Reverse Proxy.

---

## 8. Einfacher Server (Ressourcen)

- **Ziel:** Plattform läuft auf schlichtem Server (z. B. kleiner VPS oder Rechner im LAN), ohne hohe Anforderungen.
- **Umsetzung:**
  - Keine besonderen Hardware-Anforderungen; Ressourcenbedarf der App und ggf. DB dokumentieren.
  - Persistente **Volumes** für Daten und Konfiguration in der Compose-Datei vorsehen.
  - **Backup:** Konzept für DB und ggf. hochgeladene/erzeugte Dateien festhalten (inkl. Hinweis in der App vor Updates, siehe Abschnitt 3).

---

## 9. Entwicklungsumgebung

- **Ziel:** Lokal so entwickeln, dass das Verhalten dem Server möglichst nahekommt; Install-Skript testbar machen.
- **Zwei Modi:**
  - **Schnell-Dev (täglich):** Backend und Frontend auf dem Host mit `npm run dev`; nur **PostgreSQL 18 + MinIO** in Docker (z. B. `docker compose up db minio` oder kleines `compose.dev.yml`). Schnell, wenig Ressourcen.
  - **Prod-nah (regelmäßig / vor Release):** Vollständiger Stack mit **Caddy** starten (`docker compose up`). App mit Volume-Mount und Watch (nodemon/tsx); Zugriff über **http://localhost:5000** wie auf dem Server. So werden Proxy, Basis-URL und Routing früh abgeglichen.
- **Umsetzung:** Eine `docker-compose.yml` (oder Basis + Override); Dev-Override mit Volume-Mounts und Dev-Command für die App. Ab Abschnitt 6 (Frontend-Basis): **Caddy routet nach Pfad** – `/api/*` an die App (Backend), `/` an den Frontend-Service (eine Origin, Session-Cookie ohne CORS). Frontend als eigener Service im Stack (Vite-Dev-Server oder Build).

---

## 10. Test des Install-Skripts

- **Problem:** `install.sh` lässt sich auf der lokalen Dev-Maschine nicht realistisch testen (Repo und Dienste sind schon da).
- **Empfehlung:** **CI (z. B. GitHub Actions)** auf einem frischen Runner: Repo auschecken, Voraussetzungen (Docker) sicherstellen, `install.sh` ausführen (oder die gleichen Schritte: `docker compose up -d`), danach **Health-Check** (z. B. `curl http://localhost:5000/health`). Bei Erfolg ist der Install-Pfad getestet. Optional: VM (Vagrant/Multipass) oder Container als „Mini-Server“ für manuellen Test; Shellcheck für das Skript.
- **Umsetzung:** CI-Job in `.github/workflows/` (oder vergleichbar), der bei Push/PR den Install-Ablauf durchspielt und die Erreichbarkeit der App prüft.

---

## Nächste Schritte (Plan)

- [x] Technologie-Stack festlegen (Sprache/Framework, DB, Reverse Proxy) – siehe [Technologie-Stack](Technologie-Stack.md).
- [ ] Repository-Struktur und `docker-compose.yml` entwerfen (inkl. Dev-Override für Entwicklungsumgebung).
- [ ] `install.sh` und ggf. `scripts/update.sh` spezifizieren.
- [ ] CI-Job zum Test des Install-Skripts (frischer Runner, install.sh, Health-Check).
- [ ] Doku zu VPN (WireGuard o. Ä.) und Reverse Proxy in `docs/` planen.
