# Intranet-Dashboard – URLs und Seitenstruktur

Aktuelle Routen und Seiten der DocsOps-App. Details zu Layout und Sidebar: [Umsetzungs-Todo §6–7](../../plan/Umsetzungs-Todo.md#7-layout--navigation).

---

## 1. Hauptbereiche

| Route                       | Inhalt                                                                                        |
| --------------------------- | --------------------------------------------------------------------------------------------- |
| `/`                         | Home / Dashboard                                                                              |
| `/catalog`                  | Einstieg für alle Dokumente (Tabelle, filter- und suchbar)                                    |
| `/team`                     | Einstieg Team (eigenes Team; rollenabhängig)                                                  |
| `/team/:teamId`             | Team-Kontext (Projekte, Prozesse, Dokumente)                                                  |
| `/department`               | Abteilung(en) (rollenabhängig: ein Department oder aufklappbare Liste)                        |
| `/department/:departmentId` | Abteilungs-Kontext                                                                            |
| `/company`                  | Firma / Company                                                                               |
| `/personal`                 | Persönlicher Bereich (Prozesse, Projekte, Dokumente mit Owner = Nutzer)                       |
| `/shared`                   | Geteilte Kontexte (Dokumente/Kontexte mit Grant für den Nutzer)                               |
| `/settings`                 | Profil, Account, Theme, Sessions, **Storage** (Speicherübersicht pro Scope), DocsOps-Identity |
| `/admin`                    | Admin-Bereich (nur für Admins): Nutzer, Teams, Organisation                                   |

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

## 4. Detailseiten (Kontext, Subcontext, Dokument)

- **Breadcrumbs:** Auf den Detailseiten (Process/Project, Subcontext, Dokument) wird der Pfad als Breadcrumb angezeigt (Scope → Kontext → ggf. Subcontext → Dokument), mit klickbaren Links für jede Ebene.
- **Kontext-Detailseiten** (Process/Project) sind bei Bedarf um Tabs erweiterbar (z. B. Documents | Subcontexts | Settings | History), sobald weitere Bereiche wie Mitglieder, Einstellungen oder Nutzung/History hinzukommen.
- **Dokument-Detailseite (geplant: Kommentar-Sektion):** Unter dem Dokumentinhalt (oder in einer Sidebar) eine **Kommentar-Sektion** – Liste der Kommentare, Formular zum Anlegen, ggf. Threads (Antworten). Sichtbar, Anlegen und Bearbeiten/Löschen eigener Kommentare für alle mit Leserecht; Moderation (Löschen beliebiger Kommentare) für Scope-Lead/Admin. Siehe [Prisma-Schema-Entwurf §9](../../plan/Prisma-Schema-Entwurf.md#9-kommentar-sektion-geplant).

---

## 5. Ausblick (frühere Konzeptideen, noch nicht umgesetzt)

- **Trash & Archive:** Auf den Scope-Seiten **Personal** (`/personal`), **Company** (`/company`), **Department** (`/department/:id`) und **Team** (`/team/:id`) gibt es die Tabs **Trash** (soft-gelöschte Dokumente/Drafts, mit Restore) und **Archive** (archivierte Dokumente, mit Unarchive). Sichtbar für Admin bzw. Scope-Lead (Rechte gelten nach unten: Company Lead sieht Tabs auch in Departments/Teams seiner Firma). Eine eigene Route `/archiv` existiert nicht; Archiv-Inhalte werden über diese Tabs abgebildet.
- Eigenständige Bereiche wie **Knowledge Hub** (`/knowledge`), **Ressourcen** (`/ressourcen`) sind derzeit nicht als eigene Routen umgesetzt; Inhalte können über Catalog, Tags und Kontexte abgebildet werden.
- **Drafts-Card im Overview:** Auf den Overview-Seiten (Personal, Company, Department, Team) eine Card „Drafts“ bzw. „Neueste Dokumente“ mit den neuesten Dokumenten des Scopes; nach Anlegen eines Dokuments (Create → Document) kein Redirect, das neue Dokument erscheint in dieser Card. Nach §15 (draft/published) nur echte Drafts. Vgl. [Umsetzungs-Todo §14](../../plan/Umsetzungs-Todo.md#14-dokumente-in-der-ui).
- **Drafts-Tab** auf den Scope-Seiten (Personal, Company, Department, Team, ggf. Shared): Ein Tab „Drafts“ mit (1) noch nicht veröffentlichten Dokumenten und (2) offenen PRs, die auf Prüfung/Merge warten. Details in [Umsetzungs-Todo §15](../../plan/Umsetzungs-Todo.md#15-versionierung--pr-workflow). Datenmodell für Drafts/Status siehe [Prisma-Schema-Entwurf](../../plan/Prisma-Schema-Entwurf.md) (§3, §8) und §15.
- **Volltextsuche** und erweiterte Tag-Filter sind in der Planung (Umsetzungs-Todo §18).
- **Optional: KI-Assistent (Dokumenten-Frage):** Auf der Startseite ein Suchfeld „Frage an deine Dokumente“, mit dem Nutzer in natürlicher Sprache nur die Dokumente befragen können, auf die sie Leserecht haben. Antwort inkl. **Quellen:** klickbare Links zu den zugrunde liegenden Dokumenten (`/documents/:id`). RAG-basiert (Retrieval + LLM); Backend-Endpoint mit Rechtefilter. Siehe [Umsetzungs-Todo §21](../../plan/Umsetzungs-Todo.md#21-optional-ki-assistent-dokumenten-frage).
