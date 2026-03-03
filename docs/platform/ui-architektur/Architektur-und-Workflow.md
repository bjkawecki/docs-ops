# Architektur & Workflow – Dokumentationsplattform

Kurzfassung: Wie die Plattform Inhalte und Rechte handhabt. Details zu Konzept und Rechten: [Doc-Platform-Konzept](../Doc-Platform-Konzept.md), [Rechtesystem](../datenmodell/Rechtesystem.md).

---

## 1. Markdown als zentrales Format

- Dokumentation (Prozesse, Projekte, persönliche Kontexte) wird als **Markdown** in der Plattform gepflegt.
- Dokumente liegen in der **Datenbank** der App; sie gehören genau einem Kontext (Projekt, Prozess oder Unterkontext).
- Vorteile: einheitliches Format, versionierbar (geplant: Snapshots/Drafts), portabel, gut lesbar und editierbar.

---

## 2. Struktur & Rechte

- **Organisationsstruktur** (Firma → Abteilung → Team) bestimmt **Ownership**, nicht automatisch Zugriff.
- **Zugriffsrechte** werden explizit vergeben (Leser/Schreiber pro Dokument; Nutzer, Team, Abteilung). Leserechte werden nach oben vererbt; Schreibrechte sind lokal (Lead der Owner-Unit oder expliziter Grant).
- Details: [Rechtesystem](../datenmodell/Rechtesystem.md).

---

## 3. Web-Oberfläche

- Einheitliche **Web-App** (React/Fastify): Navigation nach Kontext (Team, Abteilung, Firma, Personal, Shared), Catalog als Einstieg für alle Dokumente, Suche und Filter (geplant/teilweise).
- Authentifizierung (Session, optional LDAP/SSO); rollenabhängige Sicht (Admin, Company Lead, Department Lead, Team Lead, Member).

---

## 4. Ausblick (optionale Erweiterungen)

- **Aggregation externer Quellen:** Markdown aus Git-Repos oder Netzlaufwerken könnte später angebunden werden; der Kern der Plattform bleibt die eigene DB und explizite Rechte.
- **Statische Exporte / Deployment:** Optional z. B. Export zu MkDocs/Docusaurus oder PDF-Export (Pandoc) für bestimmte Kontexte; kein Ersatz für die zentrale App.

---

**Fazit:** Die Plattform ist eine **zentrale Wissensbasis** mit Markdown-Dokumenten in Kontexten, expliziten Rechten und einheitlicher Web-UI. Erweiterungen (Aggregation, Export) bleiben optional.
