# Intranet-Dashboard – Ordner- und Seitenstruktur

## 1. Home / Dashboard

- URL: /
- Inhalte:
  - Überblick über neue oder aktualisierte Dokumente
  - Quick Links: Repositories, Teams, Prozesse, Firma, Templates
  - Updates / Benachrichtigungen
  - Suche (Volltext + Tags)

---

## 2. Repositories / Projekte

- URL: /repositories/
- Unterseiten pro Repository:

Repositories/

- Projekt-A/
  - README.md # High-Level-Doku
  - Onboarding.md # Einstieg für neue Entwickler
  - SOPs.md # Projekt-spezifische Prozesse

- Projekt-B/
  - README.md
  - Onboarding.md

- Dynamische Aggregation:
  - Tag: repository:Projekt-A → zeigt alle relevanten Seiten auf der Projektseite
  - Tag: onboarding → zeigt alle Onboarding-Dokumente projektübergreifend

---

## 3. Teams / Abteilungen

- URL: /teams/
- Unterseiten pro Team:

Teams/

- Backend/
  - Team-Wiki.md
  - Prozesse.md

- DevOps/
  - Runbooks.md
  - Deploy-Prozesse.md

- QA/
  - Testprozesse.md
  - Automatisierung.md

- Dynamische Aggregation:
  - Tag: team:DevOps → zeigt alle relevanten Dokumente für DevOps
  - Tag: process → zeigt alle teamübergreifenden Prozess-Dokumente

---

## 4. Firma / Unternehmensbereich

- URL: /firma/
- Inhalte:

Firma/

- Richtlinien.md # IT-Sicherheit, Compliance

- Onboarding-Company.md # Generelles Firmen-Onboarding

- IT-Sicherheit.md

- HR-Richtlinien.md

- Zweck: alles, was teamübergreifend gilt, klar sichtbar

---

## 5. Prozesse / SOPs

- URL: /prozesse/
- Struktur:

Prozesse/

- Kritische-Prozesse/
  - Deployment.md
  - Incident-Handling.md

- Regelprozesse/
  - Code-Review.md
  - Feature-Release.md

- Ad-hoc-Prozesse/
  - Notfall-Backup.md

- Dynamische Aggregation:
  - Tags: prozess:deployment oder kritisch
  - Filterbar für Prozessart, Team, Repository

---

## 6. Templates / Vorlagen

- URL: /templates/
- Inhalte:

Templates/

- Process_Template.md

- Repo_Template.md

- Onboarding_Template.md

- Zweck: Einheitliche Struktur für neue Dokumente / SOPs

---

## 7. Knowledge Hub / FAQs

- URL: /knowledge/
- Inhalte:
  - Tipps & Tricks, Best Practices
  - How-Tos für Entwickler und andere Teams
- Dynamische Aggregation:
  - Tag: faq, best-practice, how-to

---

## 8. Archiv / Historie

- URL: /archiv/
- Inhalte:
  - Alte oder veraltete Dokumente
  - Änderungen nachvollziehbar für Audits
- Dynamische Aggregation:
  - Tag: archiv → alte Versionen automatisch ausblenden / filtern

---

## 9. Ressourcen / Tools (optional)

- URL: /ressourcen/
- Inhalte:
  - Links zu Git-Repos, Cloud-Speichern, internen Tools
  - Kurze Beschreibung und Zugriffsrechte

---

## Struktur-Empfehlung

- Feste Hauptseiten: Home, Repositories, Teams, Firma, Prozesse, Templates
- Dynamische Unterseiten & Indizes: per Tags, Projekten, Teams, Prozessart
- Vorteil: Klar für neue Nutzer, flexibel für wachsende Dokumentation
- Navigation: Hauptmenü + Filter / Suche + Tag-basierte Aggregation
