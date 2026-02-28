# docs/platform – Plattform-Konzept & Architektur

Konzept und Architektur der internen Dokumentationsplattform. **Einstieg:** [Doc-Platform-Konzept.md](Doc-Platform-Konzept.md).

## Ordnerstruktur

| Ordner              | Inhalt                                                                                                                   |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| **/** (Wurzel)      | [Doc-Platform-Konzept.md](Doc-Platform-Konzept.md) – Grundidee, Organisationsstruktur, Kontexte, Rechte (Hauptdokument). |
| **datenmodell/**    | Datenmodell und Rechte-Logik: Pseudocode Datenmodell, Rechteableitung.                                                   |
| **versionierung/**  | Versionierung (Snapshots + Deltas), Pseudo-Git, Pull-Request-Workflow; inkl. zugehörige Diagramme (SVG).                 |
| **ui-architektur/** | UI und Nutzung: Intranet-Dashboard (URLs, Seiten), Intranet-Plattform, Markdown-basierte Dokumentationsplattform.        |
| **diagramme/**      | Strukturelle Übersichten (Hierarchie, Kontexte, Struktur-Diagramme) als SVG.                                             |

## Lesereihenfolge (empfohlen)

1. **Doc-Platform-Konzept.md** – Konzept verstehen.
2. **datenmodell/** – Datenmodell und Rechte.
3. **versionierung/** – Versionierung und PR-Workflow.
4. **ui-architektur/** – Dashboard und Nutzungsszenarien.
