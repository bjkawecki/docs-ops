# Rechteableitung – Lesen und Schreiben

Jedes Dokument gehört genau einem Kontext (Projekt, Prozess, Nutzerspace oder Unterkontext). Der Zugriff wird über **explizite Zuweisung** (Grants) und **abgeleitete Rollen** (isAdmin, Supervisor, TeamLeader, UserSpace-Owner) bestimmt. Im Schema bilden die Tabellen DocumentGrantUser, DocumentGrantTeam und DocumentGrantDepartment die Grants ab; jede Zeile hat eine Rolle vom Typ `GrantRole` (Read oder Write).

## Voraussetzungen

- Nutzer mit gesetztem `deletedAt` (Soft Delete) haben keinen Zugriff; die Prüfung endet in diesem Fall mit „kein Zugriff“.
- Die Implementierung nutzt die Funktionen `canRead(userId, documentId)` bzw. `canWrite(userId, documentId)` (Englisch im Code).

## Leserecht (canRead)

Ein Nutzer hat Leserecht auf ein Dokument, wenn eine der folgenden Bedingungen zutrifft (in dieser Reihenfolge geprüft):

1. **isAdmin:** Der Nutzer hat `isAdmin` gesetzt. Er hat dann Leserecht auf alle Dokumente (und typischerweise auch Schreibrecht).

2. **Supervisor:** Der Nutzer ist Supervisor einer Abteilung. In diesem Fall hat er Leserecht auf alle Dokumente in Kontexten, die dieser Abteilung oder einem ihrer Teams als Owner gehören – also in Prozessen, Projekten und Unterkontexten. Über die Supervisor-Rolle besteht **kein** Leserecht auf Nutzerspaces.

3. **UserSpace-Owner:** Das Dokument gehört zu einem Nutzerspace, dessen Besitzer (`UserSpace.ownerUserId`) der Nutzer ist. Dann hat er Leserecht (und Schreibrecht) auf dieses Dokument.

4. **Explizite Grants:** Das Dokument ist dem Nutzer direkt (DocumentGrantUser mit Read), einem seiner Teams als Mitglied (DocumentGrantTeam mit Read) oder einer seiner Abteilungen (DocumentGrantDepartment mit Read) zugestanden.

Die Prüfung erfolgt in der Reihenfolge: zuerst isAdmin und deletedAt, dann Supervisor, dann UserSpace-Owner, dann explizite Grants.

## Schreibrecht (canWrite)

Ein Nutzer hat Schreibrecht auf ein Dokument, wenn eine der folgenden Bedingungen zutrifft:

1. **isAdmin:** Wie bei Lesen – Nutzer mit `isAdmin` haben Schreibrecht auf alle Dokumente.

2. **UserSpace-Owner:** Der Nutzer ist Besitzer des Nutzerspaces, zu dem das Dokument gehört. Er hat Schreibrecht auf alle Dokumente in diesem Space.

3. **Explizite Grants:** Schreibrecht besteht bei direktem User-Grant (DocumentGrantUser mit Write), bei Team-Grant (DocumentGrantTeam mit Write) nur, wenn der Nutzer **TeamLeader** dieses Teams ist (im Schema: TeamLeader), oder bei Abteilungs-Grant (DocumentGrantDepartment mit Write) für Nutzer dieser Abteilung.

Im Konzept wird der Teamleader oft als „Team-Superuser“ bezeichnet; in der Implementierung entspricht das der Rolle TeamLeader.

## Beispiel

Dokument D1 liegt im Projekt P1; Owner von P1 ist Team T1. Die Zugriffsrechte am Dokument sind: Leser T1, Schreiber T1 (d. h. nur Teamleader von T1 dürfen schreiben). Nutzer Z ist nur Mitglied von T1 – er darf D1 lesen, aber nicht schreiben. Nutzer M ist Mitglied und TeamLeader von T1 – er darf D1 lesen und schreiben.

## Implementierung

Die Prüflogik liegt unter `apps/backend/src/permissions/` (canRead, canWrite, requireDocumentAccess). Dokument-Routen nutzen die Middleware `requireDocumentAccess('read'|'write')`, die diese Funktionen aufruft.
