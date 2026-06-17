# Managed Hosting (optional, später)

**Status:** Planungsnotiz — **keine Umsetzungspriorität**; wird fortgeführt, wenn Self-hosted-Betrieb (Install, Backup, Update) steht. Keine Einträge in [Umsetzungs-Todo](Umsetzungs-Todo.md) in dieser Phase.

DocsOps ist primär **self-hosted** (Firma betreibt eigenen Stack). Optional kann ein **Managed-Hosting-Angebot** ergänzt werden — ähnlich der Idee von [Coolify](https://coolify.io), aber **deutlich schmaler**: DocsOps-spezifisch, kein generisches PaaS, und typischerweise **ein Server (oder wenige)** statt Multi-Server-Orchestrierung.

Verwandte Pläne: [Infrastruktur & Deployment](Infrastruktur-und-Deployment.md), [Betrieb: Releases, Backup, Update](Plan-Betrieb-Releases-Backup-Update.md).

---

## 1. Zwei Produkte nebeneinander

|                                 | **Self-hosted** (Kern)                       | **Managed** (optional)                      |
| ------------------------------- | -------------------------------------------- | ------------------------------------------- |
| Wer betreibt die Infrastruktur? | Kunde                                        | Anbieter (du / DocsOps-Hosting)             |
| Wer macht Updates & Backup?     | Kunde (mit App-Tools §25–§26)                | Anbieter                                    |
| Wo liegen Daten?                | Beim Kunden (On-Prem / eigener VPS)          | Beim Anbieter oder dediziert pro Kunde      |
| Zielgruppe                      | IT-affine Teams, volle Kontrolle             | „Einfach nutzen, kein Ops“                  |
| Codebasis                       | Gleiche DocsOps-App & gleicher Compose-Stack | Gleicher Stack, automatisiert provisioniert |

**Wichtig:** Managed ist **kein Fork** der App, sondern ein **Betriebsmodell** auf derselben Software.

---

## 2. Abgrenzung zu Coolify

**Coolify** verwaltet **viele Server** (Agents pro Node, Deploy-Ziele, heterogene Apps). Sinnvoll als generische Deployment-Plattform.

**DocsOps Managed** braucht das in der Regel **nicht**:

- Zielgruppe = **interne Dokumentation pro Firma**, moderate Last.
- Ein leistungsfähiger Server (z. B. 8–16 GB RAM) reicht für **mehrere kleine Tenants** oder **einen großen Kunden**.
- Statt Multi-Server-PaaS: **Multi-Instanz auf einem Host** (oder wenigen Hosts).

Coolify-ähnlich wird DocsOps Hosting nur in einem Punkt: **einfache Bereitstellung ohne manuelles Compose** — nicht in der Komplexität (Cluster, viele Nodes).

---

## 3. Zwei Varianten (später wählbar)

### Variante A — DocsOps Cloud (voll managed)

Kunde registriert sich → erhält eine eigene Instanz (Subdomain oder Custom Domain).

- Beispiel: `acme.docsops.example.com` oder `docs.acme.com` (CNAME).
- Anbieter betreibt PostgreSQL, MinIO, App, Worker, TLS, Backups, Updates.
- Kunde verwaltet **Inhalt**: Nutzer, Teams, Rechte, Dokumente.

Geeignet für Firmen ohne eigene Ops-Kapazität.

### Variante B — Control Plane auf Kunden-VPS (Coolify-Nähe)

Kunde bringt **eigenen VPS**; Anbieter liefert ein **schmales Panel**:

- Instanz anlegen, Domain, Env, Health.
- Agent auf dem Server führt `install.sh` / Update-Skript aus (vgl. Updater-Sidecar in [Betriebsplan](Plan-Betrieb-Releases-Backup-Update.md)).

**Managed:** Installation, Updates, Backup-Konfiguration, Monitoring.  
**Nicht managed:** VPS-Rechnung, Hardware, Kunden-Firewall.

**Priorität für DocsOps:** Variante A (ein zentraler Host, viele Tenants) ist der naheliegendere Einstieg; Variante B optional für Kunden mit Daten-Souveränität auf eigenem Server.

---

## 4. Architektur: ein Server, viele Instanzen

Typisches Bild (Variante A):

```text
Ein VPS / Dedicated Server
├── Reverse Proxy (Caddy/Traefik)
│     → tenant-a.docsops.host, tenant-b.docsops.host, …
├── Stack Tenant A (isolierter Compose-Stack / Namespaces)
│     ├── PostgreSQL
│     ├── MinIO
│     ├── App + Worker
├── Stack Tenant B
│     └── …
└── Control Plane (leichtgewichtig, separat von Tenant-Apps)
      ├── Tenant anlegen / sperren / löschen
      ├── Updates (gestaffelt pro Tenant oder global)
      ├── Backup-Policy & Offsite für alle Instanzen
      └── Monitoring, Quotas, Zertifikate
```

### Tenant-Modell

- **Single-Tenant pro Firma:** eigene Postgres-DB, eigene MinIO-Daten/Volumes — **keine** gemeinsame Datenbank für alle Kunden (passt zu Rechten, Compliance, Blast Radius).
- **Kein** Multi-Tenant in einer DB für unterschiedliche Firmen (zu riskant für interne Doku).

### Skalierung

- **Start:** ein Server, manuelles oder halbautomatisches Provisioning.
- **Wachstum:** größere Maschine, zweiter Server, oder **Premium = dedizierter Server** pro großem Kunden.
- **Blast Radius:** Ausfall eines Shared-Servers betrifft alle Tenants auf diesem Host → **Offsite-Backups** und Restore-Prozess zentral kritisch (vgl. Betriebsplan §3 Offsite).

---

## 5. Was ist „gemanaged“?

### Infrastruktur & Betrieb (Anbieter)

- Server, Container, Volumes, Netzwerk
- PostgreSQL, MinIO, App, Worker, Reverse Proxy
- TLS / Zertifikate, Domain-Anbindung
- App-Updates (getestete Releases), Base-Image-Patches
- Backups (DB + Dateien), Retention, **Offsite** (Pflicht bei Shared Host)
- Monitoring (`/health`, `/ready`, Jobs, Disk, Queue)
- Ressourcen-Limits pro Tenant (CPU/RAM/Storage-Quota)

### Optional Premium

- SSO-Einrichtung (Entra ID, …)
- Migration Self-hosted → Managed
- SLA, Support, AV-Vertrag
- EU-Region / dedizierter Server
- Custom Domain inkl. Setup

### Bewusst nicht gemanaged (Kunde)

- Dokumentinhalte, Organisation, Teams
- Nutzer und Rechte (Kunden-Admins)
- Inhaltliche Governance und Compliance-Inhalte
- Optional: Kunde konfiguriert SSO selbst (mit Doku)

---

## 6. Bezug zu Self-hosted-Features

Die geplanten Betriebs-Features im Produkt unterstützen **beide** Modelle:

| Feature (Self-hosted)      | Rolle bei Managed                                             |
| -------------------------- | ------------------------------------------------------------- |
| Backup (§25)               | Pro Tenant automatisiert; zentral überwacht; Offsite vom Host |
| Update (§26)               | Gestaffeltes Rollout aller Tenants vom Control Plane          |
| Version / What's new (§24) | Gleiche Releases; Kunden sehen Changelog in ihrer Instanz     |
| `install.sh` / `update.sh` | Basis für Provisioning-Automation                             |

Managed braucht **zusätzlich** (später, eigenes Projekt/Repo möglich):

- Control Plane (Tenant-Lifecycle, Billing-Hooks)
- Provisioning (Compose-Template pro Tenant, Secrets, Subdomain)
- Zentrales Observability-Dashboard für den Betreiber

---

## 7. Pricing (Denkmodelle, unverbindlich)

- **Pro Instanz / Monat** (einfach: inkl. X Nutzer, Y GB Storage)
- **Pro aktivem Nutzer** (SaaS-klassisch)
- **Tiers:** z. B. Shared Host · Dedicated Server · Enterprise (SSO, SLA)

Konkrete Preise und Limits — später, wenn Self-hosted-Reife und Pilot-Kunden vorliegen.

---

## 8. Empfohlene Reihenfolge (wenn es soweit ist)

1. **Self-hosted produktionsreif:** `install.sh`, Backup, Update, Version-API (Betriebsplan).
2. **Manueller Managed-Pilot:** ein Server, Tenants per Hand (Compose + Subdomain), Erfahrung sammeln.
3. **Leichtes Control Plane:** Tenant anlegen, Backup/Update zentral — **kein** Coolify-Klon.
4. Optional: Kunden-VPS-Agent (Variante B), zweiter Host, Billing-Integration.

**Nicht vorziehen:** Multi-Server-Cluster, generisches App-Hosting, Multi-Tenant in einer DB.

---

## 9. Offene Punkte (für spätere Fortführung)

- Rechtliches: AV-Vertrag, Datenort, Subprozessoren, Löschkonzept pro Tenant.
- Billing: Stripe o. ä., Metriken (Nutzer, Storage).
- Onboarding: erster Admin, E-Mail-Verifikation, Trial.
- Suspend / Delete Tenant: Datenexport (Plattform-Export), Aufbewahrungsfrist.
- Abgrenzung OSS vs. Hosted (welche Features nur Cloud? — möglichst vermeiden).
- Eigenes Repo für Control Plane vs. Monorepo-Erweiterung.

---

## 10. Nächster Schritt in diesem Dokument

Wenn Self-hosted-Betrieb steht: Abschnitt 9 priorisieren, Pilot-Architektur (1 Server, N Tenants) konkretisieren und ggf. ein separates Repo `docsops-hosting` skizzieren. Bis dahin: **nur Planung**, keine Implementierung.
