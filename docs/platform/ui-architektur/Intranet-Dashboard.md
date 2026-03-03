# Intranet-Dashboard – URLs und Seitenstruktur

Aktuelle Routen und Seiten der DocsOps-App. Details zu Layout und Sidebar: [Umsetzungs-Todo §6–7](../../plan/Umsetzungs-Todo.md#7-layout--navigation).

---

## 1. Hauptbereiche

| Route                       | Inhalt                                                                  |
| --------------------------- | ----------------------------------------------------------------------- |
| `/`                         | Home / Dashboard                                                        |
| `/catalog`                  | Einstieg für alle Dokumente (Tabelle, filter- und suchbar)              |
| `/team`                     | Einstieg Team (eigenes Team; rollenabhängig)                            |
| `/team/:teamId`             | Team-Kontext (Projekte, Prozesse, Dokumente)                            |
| `/department`               | Abteilung(en) (rollenabhängig: ein Department oder aufklappbare Liste)  |
| `/department/:departmentId` | Abteilungs-Kontext                                                      |
| `/company`                  | Firma / Company                                                         |
| `/personal`                 | Persönlicher Bereich (Prozesse, Projekte, Dokumente mit Owner = Nutzer) |
| `/shared`                   | Geteilte Kontexte (Dokumente/Kontexte mit Grant für den Nutzer)         |
| `/settings`                 | Profil, Account, Theme, Sessions, DocsOps-Identity                      |
| `/admin`                    | Admin-Bereich (nur für Admins): Nutzer, Teams, Organisation             |

---

## 2. Redirects

- `/repositories` → `/catalog`
- `/processes` → `/catalog`
- `/templates` → `/`

---

## 3. Navigation (Sidebar)

- **Oben:** Logo, dann Home, Catalog, Team/Department/Company (rollenabhängig), Personal, Shared.
- **Unten:** Account-Dropdown mit Admin (nur bei isAdmin), Settings, Log out.
- Rollenabhängige Darstellung: Team-Member sieht sein Team; Department-Lead sieht Department + Teams; Company-Lead/Admin sieht aufklappbare Departments mit Teams.

---

## 4. Ausblick (frühere Konzeptideen, noch nicht umgesetzt)

- Eigenständige Bereiche wie **Knowledge Hub** (`/knowledge`), **Archiv** (`/archiv`), **Ressourcen** (`/ressourcen`) sind derzeit nicht als eigene Routen umgesetzt; Inhalte können über Catalog, Tags und Kontexte abgebildet werden.
- **Drafts-Tab** auf den Scope-Seiten (Personal, Company, Department, Team, ggf. Shared): Ein Tab „Drafts“ mit (1) noch nicht veröffentlichten Dokumenten und (2) offenen PRs, die auf Prüfung/Merge warten. Details in [Umsetzungs-Todo §15](../../plan/Umsetzungs-Todo.md#15-versionierung--pr-workflow).
- **Volltextsuche** und erweiterte Tag-Filter sind in der Planung (Umsetzungs-Todo §15, §17).
