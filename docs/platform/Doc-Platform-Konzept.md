# Interne Dokumentationsplattform – konzeptionelle Zusammenfassung

## 1. Grundidee

- Plattform für interne Dokumentation, ähnlich Backstage, aber auf Informationsverwaltung fokussiert.
- Markdown-Dokumente als zentrale Inhalte.
- Struktur: Firma → Abteilung → Team.
- Dokumente gehören genau einem Kontext (Projekt, Prozess, Nutzerspace).
- Rechte werden explizit vergeben, Struktur bestimmt nur Ownership, nicht automatisch Zugriff.

---

## 2. Organisationsstruktur

- **Firma**
  - Oberste Organisationseinheit.
- **Abteilung**
  - Besteht aus Teams.
  - Kann Prozesse besitzen.
- **Team**
  - Dynamisch, kann neu zusammengebaut werden.
  - Kann Projekte besitzen.
  - Mitglieder haben Leserechte auf Team-Dokumente.
  - Schreibrechte nur für Superuser/Team-Manager.
- Ownership von Projekten/Prozessen immer eindeutig: Abteilung oder Team.

---

## 3. Kontexte

### 3.1 Prozess

- Beispiele: Onboarding.
- Dauerhaft, wird selten archiviert, kontinuierlich aktualisiert.
- Dokumente hängen direkt am Prozess.
- Zugehörigkeit: Team oder Abteilung.
- Unterkontexte selten notwendig.

### 3.2 Projekt

- Zeitlich begrenzt, wird irgendwann archiviert.
- Gehört zu einem Team (oder Abteilung, wenn teamübergreifend).
- Unterkontexte möglich:
  - Protokolle/Meeting-Minuten
  - Meilensteine
  - Module/Subsysteme
- Dokumente hängen direkt am Projekt.
- Zugriff explizit für Teams oder Nutzer, Superuser schreiben.

### 3.3 Nutzerspace

- Persönliche Dokumente einzelner Nutzer.
- Zugriff optional für andere Nutzer, Teams oder Abteilungen.

### 3.4 Dokumente

- Einzelne inhaltliche Einheit.
- Beispiele: Richtlinien, Vorlagen, Ressourcen (als Tags).
- Können direkt an Prozess, Projekt oder Nutzerspace hängen.
- Besitzen explizite Zugriffsrechte.

---

## 4. Zugriffsrechte

- Grundprinzip: **Teams sind autonome Zellen.**
  - Mitglieder sehen alle Team-Dokumente.
  - Schreibrechte nur für Superuser / Team-Manager.
- Rechte explizit für:
  - Teams
  - Abteilungen
  - Einzelne Nutzer
- Ownership bestimmt Verantwortlichkeit, nicht automatisch Zugriff.
- Zugriff auf Unterkontexte kann vererbt oder explizit gesetzt werden.

---

## 5. Ownership vs. Zugriff

- **Ownership:** wer ist organisatorisch verantwortlich? (Abteilung oder Team)
- **Zugriff:** wer darf Inhalte lesen oder schreiben? (explizit definiert)
- Vorteile: klare Trennung, konsistente Rechteableitung, verständlich für Admins.

---

## 6. Zusammenfassung der Designprinzipien

1. Dokumente gehören genau einem Kontext.
2. Struktur bestimmt Ownership, nicht automatisch Rechte.
3. Teams sind autonome Einheiten; Abteilungsmitglieder haben keine impliziten Teamrechte.
4. Kontexte:
   - Prozesse → dauerhaft, fachlich, direkte Dokumente
   - Projekte → temporär, Unterkontexte möglich
   - Nutzerspace → persönliche Dokumente, optional freigegeben
5. Rechte immer explizit; Schreibrechte auf Superuser beschränkt.
6. Unterkontexte nur dort, wo sinnvoll für Organisation oder Filterung.
7. Struktur + Kontext + Rechte bilden ein konsistentes, vorhersehbares System.
