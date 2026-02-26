# Intranet-Plattform für IT-Dokumentation – Architekturübersicht

## 1. Quellen: Markdown-Dateien

- Alle Dokumentationen (Repository-Dokus, Prozessbeschreibungen, SOPs) werden in **Markdown** gepflegt.
- Speicherorte:
  - Git-Repositories (GitHub Enterprise, GitLab, interne Git-Server)
  - Interne Cloud-Laufwerke (SharePoint, interne Netzlaufwerke)
- Vorteile:
  - Versionierung & Nachvollziehbarkeit
  - Portabel und standardisiert
  - Entwickler können direkt arbeiten, keine neue Software nötig

---

## 2. Zentralisierung & Aggregation

- **Aggregator-Service** sammelt Inhalte aus verschiedenen Quellen:
  - Repos → Markdown-Dateien
  - SharePoint / Netzlaufwerke → Markdown oder PDF-Konvertierung
- Aufbau einer **einheitlichen Struktur**:
  - Tags / Kategorien (z. B. Team, Prozess, Repository)
  - Metadaten für Versionierung, Autor, Datum
- Ziel: eine **übersichtliche, konsistente Wissensbasis** für alle Teams

---

## 3. Deployment auf Intranet-Webserver

- **Statische Website aus Markdown**:
  - Tools: MkDocs, Docusaurus oder GitBook
  - Markdown → HTML → Deployment auf internen Webserver (z. B. Apache / Nginx)
- Vorteile:
  - Schnell und portabel
  - Keine externe Cloud nötig
  - Zugriff via Intranet, optional VPN für Remote-Mitarbeiter
- Optional: CI/CD-Pipeline für automatisches Deployment bei Änderungen

---

## 4. Web-Oberfläche / Dashboard

- Minimalistisch und selbsterklärend, für alle Teams nutzbar
- Funktionen:
  - Suche (Volltext) über alle Dokumente
  - Navigation nach Tags / Kategorien / Teams
  - Anzeige von Updates / zuletzt geändert
  - Zugriff auf Vorlagen / Templates
- Entwickler pflegen Markdown in Repos → Dashboard aggregiert automatisch

---

## 5. Authentifizierung & Sicherheit

- Zugriff nur für interne Mitarbeiter:
  - LDAP / Active Directory / SSO
- Optional rollenbasierte Rechte:
  - Admins: Struktur & Templates verwalten
  - Teams: Inhalte pflegen / kommentieren
  - Alle: Zugriff auf Dokumentationen

---

## 6. Integrationen (optional)

- Benachrichtigungen über Änderungen: Slack, Teams
- Monitoring / Reporting: Welche Dokumente aktuell, welche veraltet
- Automatische Dead-Link-Prüfung
- Export / Download für Offline-Nutzung

---

## 7. Minimal-Launch-Strategie für Neustarter

1. Markdown-Dokumente aus bestehenden Quellen sammeln
2. Aggregator-Service oder einfache Struktur-Skripte einrichten
3. Statische Website mit MkDocs / Docusaurus auf Intranet deployen
4. Einfaches Dashboard für Suche / Navigation bereitstellen
5. Pilotprojekt mit einem Team durchführen → Feedback einholen
6. Schrittweise erweitern: Templates, Benachrichtigungen, Reporting

---

**Fazit:**  
Diese Architektur ermöglicht es, **alle Dokumentationen zentral, versioniert und leicht zugänglich** zu machen, ohne neue Software aufzuzwingen.  
Du kannst als Dienstleister **Struktur, Templates, Prozess-Reviews und Wartung** übernehmen, während Entwickler und Teams weiterhin ihre Kernaufgaben fokussiert erledigen.
