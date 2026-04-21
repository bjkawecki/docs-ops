# docs/platform – Plattform-Konzept & Architektur

Konzept und Architektur der internen Dokumentationsplattform. **Einstieg:** [Doc-Platform-Konzept.md](Doc-Platform-Konzept.md).

## Ordnerstruktur

| Ordner              | Inhalt                                                                                                                                                                                          |
| ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **/** (Wurzel)      | [Doc-Platform-Konzept.md](Doc-Platform-Konzept.md) – Grundidee, Organisationsstruktur, Kontexte, Rechte (Hauptdokument).                                                                        |
| **datenmodell/**    | Datenmodell und Rechte-Logik: [Pseudocode Datenmodell](datenmodell/Pseudocode%20Datenmodell.md), [Rechtesystem](datenmodell/Rechtesystem.md).                                                   |
| **versionierung/**  | Versionierung (Snapshots als Full-Version), Lead-gesteuerter Publish und Suggestions; inkl. zugehörige Diagramme (SVG).                                                                         |
| **ui-architektur/** | UI und Nutzung: [Intranet-Dashboard](ui-architektur/Intranet-Dashboard.md) (URLs, Seiten), [Architektur und Workflow](ui-architektur/Architektur-und-Workflow.md).                              |
| **diagramme/**      | Strukturelle Übersichten (Hierarchie, Kontexte, Struktur-Diagramme) als SVG.                                                                                                                    |
| _(Wurzel)_          | [KI – Datenbank sicher durchsuchen](KI-Datenbank-sicher-durchsuchen.md) – Sichere Nutzung der DB für KI-Suche (RAG, kein direkter DB-Zugriff durch LLM).                                        |
| _(Wurzel)_          | [Vergleich DocsOps und Docmost](Vergleich-DocsOps-Docmost.md) – Gegenüberstellung mit Docmost (Notion/Confluence-Alternative); Stärken, Rechte, wann der DocsOps-Ansatz seine Berechtigung hat. |

## Lesereihenfolge (empfohlen)

1. **Doc-Platform-Konzept.md** – Konzept verstehen.
2. **datenmodell/** – Datenmodell und Rechte.
3. **versionierung/** – Versionierung und Freigabe (Publish).
4. **ui-architektur/** – Dashboard (URLs) und Architektur/Workflow.
