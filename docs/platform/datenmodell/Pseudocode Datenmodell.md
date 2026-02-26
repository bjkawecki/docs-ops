# Pseudocode Datenmodell – Interne Dokumentationsplattform

## 1. Organisationsstruktur

class Firma:
id
name
abteilungen: List[Abteilung]

class Abteilung:
id
name
teams: List[Team]
prozesse: List[Prozess]

class Team:
id
name
mitglieder: List[Nutzer]
superuser: List[Nutzer]
projekte: List[Projekt]
prozesse: List[Prozess]

class Nutzer:
id
name
teams: List[Team] # Mitgliedschaft
superuser_teams: List[Team] # Schreibrechte als Superuser

---

## 2. Kontexte

### Basiskontext

class Kontext:
id
name
owner: Abteilung | Team | Nutzer # Zugehörigkeit
dokumente: List[Dokument]

class Prozess(Kontext):
typ: 'Prozess'
dauerhaft: bool = True # Wird selten archiviert

class Projekt(Kontext):
typ: 'Projekt'
zeitlich_begrenzt: bool = True
unterkontexte: List[Unterkontext] = [] # z.B. Protokolle, Meilensteine

class Unterkontext(Kontext):
typ: 'Unterkontext'
parent: Projekt

class Nutzerspace(Kontext):
typ: 'Nutzerspace'
owner: Nutzer # persönlicher Kontext

---

## 3. Dokumente

class Dokument:

- id
- titel
- kontext: Kontext # genau ein Kontext
- inhalt: Markdown
- zugriffsrechte: List[Zugriffsrecht]
- tags: List[Tag]

---

## 4. Zugriffsrechte

class Zugriffsrecht:

- dokument: Dokument
- leser: List[Nutzer | Team | Abteilung] = [] # read
- schreiber: List[Nutzer | Team | Abteilung] = [] # write (Superuser / Team-Manager)
- Nutzer mit Leserechten sollen "Pull-Requests" machen können, die von Nutzern mit Schreibrechten genehmigt werden müssen
  ### Optional: weitere Rollen wie admin, archiv, etc.

### Beispiel-Logik:

- User darf Dokument sehen, wenn:
  - Nutzer ist Mitglied eines Teams oder Abteilung, die in dokument.zugriffsrechte.leser enthalten sind
- User darf Dokument bearbeiten, wenn:
  - Nutzer ist Mitglied eines Teams oder Abteilung, die in dokument.zugriffsrechte.schreiber enthalten sind

---

## 5. Grundprinzipien

1. Dokumente gehören genau einem Kontext (Projekt, Prozess, Nutzerspace).
2. Struktur (Firma, Abteilung, Team) bestimmt Ownership, **nicht automatisch Zugriff**.
3. Teams sind autonome Einheiten; Mitglieder sehen nur eigene Team-Dokumente.
4. Schreibrechte nur für Superuser / Team-Manager.
5. Unterkontexte nur bei Bedarf (z. B. Protokolle für Projekte).
6. Zugriff kann explizit auch für einzelne Nutzer vergeben werden.
7. Tags sind global und könnten z. B. auf Startseite als "Liste der beliebtesten Tags" stehen
