# Edit-System für Team-Dokumentation

## Ziel

Dieses System definiert einen kollaborativen Workflow zur Erstellung und Pflege von Team-Dokumentation mit folgenden Anforderungen:

- Klare Verantwortlichkeit beim Lead
- Paralleles Arbeiten von Autoren möglich
- Keine Merge-Konflikte für Autoren oder Lead
- Expliziter Publish-Prozess für veröffentlichte Inhalte
- Nachvollziehbare Änderungen

---

## Grundprinzip

Das System basiert auf drei klar getrennten Zuständen:

| Zustand         | Beschreibung                                                |
| --------------- | ----------------------------------------------------------- |
| **Published**   | Offizielle, für Leser sichtbare Version                     |
| **Suggestions** | Änderungsvorschläge von Autoren                             |
| **Draft**       | Arbeitsstand des Leads zur Vorbereitung einer neuen Version |

---

## Rollen

### Lead

- Verantwortlich für die veröffentlichte Version
- Entscheidet über Annahme oder Ablehnung von Änderungen
- Erstellt und veröffentlicht Drafts

### Autoren

- Können Vorschläge (Suggestions) erstellen
- Haben keinen direkten Einfluss auf Published oder Draft

### Leser

- Sehen ausschließlich die Published Version
- Optional: Kommentarfunktion

---

## Workflow

### 1. Erstellung von Suggestions (Autoren)

- Autoren arbeiten immer auf Basis der aktuellen **Published Version**
- Änderungen werden nicht direkt übernommen, sondern als **Suggestions** gespeichert
- Eine Suggestion beschreibt eine gezielte Änderung (z.B. Text ersetzen, hinzufügen, löschen)

#### Beispiel

```json
{
  "type": "replace",
  "target": "section_api",
  "range": [120, 180],
  "content": "Neue API Beschreibung",
  "author": "user_123",
  "status": "pending"
}
```

- Autoren reichen ihre Änderungen explizit ein („Änderung vorschlagen“)

---

### 2. Review im Draft (Lead)

Der Lead arbeitet in einem separaten **Draft**, der auf der aktuellen Published Version basiert.

#### Eigenschaften des Drafts

- Der Draft ist **nur für den Lead sichtbar**
- Suggestions werden **nicht automatisch angewendet**
- Der Lead entscheidet aktiv, welche Änderungen übernommen werden

---

### 3. Verarbeitung von Suggestions

Im Draft kann der Lead:

- ✅ Suggestion anwenden (wird Teil des Drafts)
- ❌ Suggestion ablehnen
- 💬 Suggestion kommentieren
- ✏️ Draft manuell bearbeiten

---

### 4. Umgang mit überlappenden Änderungen

Wenn mehrere Suggestions denselben Bereich betreffen:

- System erkennt Überlappung
- Im UI werden alternative Vorschläge angezeigt
- Der Lead entscheidet explizit, welche Variante übernommen wird

Es erfolgt **kein automatischer Merge**.

---

### 5. Publish

- Der Lead veröffentlicht den Draft manuell
- Der Draft wird zur neuen **Published Version**
- Alle angenommenen Suggestions gelten als „übernommen“
- Abgelehnte oder überholte Suggestions werden geschlossen

---

## UX-Prinzipien

### Für Autoren

- Kein Draft-Konzept sichtbar
- Arbeiten direkt im Dokument (Suggestion-Modus)
- Geringe Reibung beim Schreiben
- Keine Konfliktlösung notwendig

---

### Für Leads

- Klare Übersicht über alle offenen Suggestions
- Inline-Review im Dokument
- Möglichkeit zur aktiven Gestaltung der finalen Version
- Expliziter Publish-Schritt

---

## Technisches Modell

### Document

```json
{
  "id": "doc_1",
  "version": 42,
  "sections": [...]
}
```

---

### Suggestion

```json
{
  "id": "sug_1",
  "documentId": "doc_1",
  "baseVersion": 42,
  "target": "section_2",
  "range": [100, 150],
  "type": "replace",
  "content": "...",
  "author": "user_1",
  "status": "pending"
}
```

---

### Draft

```json
{
  "id": "draft_1",
  "documentId": "doc_1",
  "baseVersion": 42,
  "content": {...},
  "appliedSuggestions": ["sug_1", "sug_3"]
}
```

---

## Wichtige Designentscheidungen

### 1. Keine gemeinsamen Drafts für Autoren

- Verhindert versteckte Konflikte
- Hält Verantwortung klar getrennt

---

### 2. Keine automatische Merge-Logik

- Konflikte werden sichtbar gemacht, nicht automatisch gelöst
- Entscheidung liegt beim Lead

---

### 3. Suggestions statt paralleler Dokumentversionen

- Vermeidet komplexe Merge-Prozesse
- Erhöht Transparenz

---

### 4. Draft als Entscheidungsraum

- Draft ist kein Kollaborationsraum
- Sondern ein Werkzeug für den Lead zur Kuratierung

---

## Vorteile

- Klare Verantwortlichkeiten
- Hohe Stabilität der veröffentlichten Inhalte
- Gute Nachvollziehbarkeit von Änderungen
- Skalierbar für größere Teams

---

## Trade-offs

- Lead hat mehr Verantwortung im Review-Prozess
- Änderungen werden nicht sofort sichtbar
- Weniger spontane Kollaboration zwischen Autoren

---

## Zusammenfassung

Das System verschiebt Komplexität bewusst:

- **weg von Autoren** (keine Konflikte)
- **weg vom System** (kein automatisches Merging)
- **hin zum Lead** (bewusste Entscheidungen im Draft)

Dadurch entsteht ein kontrollierter, nachvollziehbarer und stabiler Dokumentationsprozess.
