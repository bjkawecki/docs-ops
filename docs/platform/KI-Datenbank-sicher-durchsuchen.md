# KI – Datenbank sicher durchsuchen

**Frage:** Wie lässt man KI eine DB sicher durchsuchen?

**Kernprinzip:** Die KI (LLM) erhält **keinen direkten Zugriff** auf die Datenbank. Stattdessen durchsucht das **Backend** die DB mit festen, rechtegeprüften APIs und füttert die KI nur mit den Ergebnissen, die der Nutzer ohnehin lesen darf. Zugriff auf die DB erfolgt immer über das Backend – optional kann das Backend einem **Agenten nutzerabhängige Tools** (z. B. über einen MCP-Server) bereitstellen.

---

## 1. Was ist RAG?

**RAG = Retrieval-Augmented Generation** (abruf-verstärkte Erzeugung):

1. **Retrieval:** Aus einer Wissensbasis (hier: die für den Nutzer lesbaren Dokumente) werden **relevante Texte** abgerufen – z. B. Passagen oder Absätze, die zur Nutzerfrage passen.
2. **Augmented:** Der LLM-Prompt wird mit genau diesen Texten **angereichert** (Kontext + Nutzerfrage).
3. **Generation:** Die KI antwortet **ausschließlich auf Basis** dieser Texte, nicht aus dem allgemeinen Training.

Vorteil: Die Antwort ist an die eigenen Dokumente gebunden, aktuell und quellennah; Halluzinationen werden reduziert, wenn die KI angewiesen wird, nur aus dem Kontext zu antworten.

---

## 2. Kein direkter DB-Zugriff durch die KI

- **Nicht:** LLM darf beliebige SQL-Queries ausführen oder direkt auf die DB zugreifen.
- **Sondern:** Nur das Backend (App-Server) führt Abfragen aus. Die KI bekommt ausschließlich **bereits gefilterte Inhalte** (z. B. Dokument-Passagen), die das Backend nach Rechten ermittelt hat.

Damit bleiben Rechte, Schema und Datenkonsistenz in der Hand der App; die KI kann weder Rechte umgehen noch unerwünschte Schreibzugriffe auslösen.

---

## 3. Wie erhält die KI sicher Zugriff auf die DB? (inkl. MCP-Option)

**Option A – Klassisches Backend (ohne Agent):**  
Das Backend übernimmt alles: Nutzerfrage entgegennehmen → lesbare Dokumente ermitteln (`getReadableCatalogScope(userId)`) → Retrieval (Volltext/Vektorsuche nur in dieser Menge) → Prompt bauen → LLM aufrufen → Antwort + Quellen zurückgeben. Die KI „sieht“ die DB nie; sie bekommt nur den fertigen Kontext im Prompt.

**Option B – Agent mit nutzerabhängigen Tools:**  
Ein **Agent** ist ein LLM, das **Tools** aufrufen kann (z. B. `search_documents`, `get_passage`). Diese Tools werden **vom Backend bereitgestellt** und bei jedem Aufruf **mit der aktuellen User-Session/User-ID** ausgeführt. Das Backend implementiert z. B. `search_documents(query)` so, dass intern zuerst die lesbaren Dokument-IDs für diesen User ermittelt werden und die Suche nur in dieser Menge läuft. So hat der Agent **nutzerabhängige Tools** – er kann nur auf Daten zugreifen, die der Nutzer lesen darf. Die DB wird weiterhin ausschließlich vom Backend abgefragt.

**Option C – MCP-Server:**  
Das Backend kann einen **MCP-Server** (Model Context Protocol) hosten, der dem LLM/Agenten **Tools oder Ressourcen** anbietet (z. B. „Suche in Dokumenten“, „Lese Passage“). Entscheidend: Jeder MCP-Tool-Aufruf wird vom Backend mit **User-Kontext** (Session/UserId) verarbeitet. Das Backend prüft Rechte und führt nur Abfragen auf der für diesen Nutzer lesbaren Dokumentmenge aus. Der MCP-Server ist also nur eine Schnittstelle; die Logik und Rechteprüfung bleiben im Backend. So kann die KI „sicher“ auf die DB zugreifen – indem sie ausschließlich über diese nutzerabhängigen MCP-Tools arbeitet.

**Kurz:** Sichere DB-Nutzung = alle Datenzugriffe laufen im Backend mit User-Kontext; ob klassischer RAG-Pipeline, Agent mit Backend-Tools oder MCP-Tools – die KI erhält nur das, was das Backend nach Rechteprüfung ausliefert.

---

## 4. Wie stellt man sicher, dass die KI nur Dokument-Fragen beantwortet und andere abweist?

- **System-Prompt / Guardrails:** Klare Anweisung an die KI: „Antworte nur auf Basis der bereitgestellten Passagen. Wenn die Frage nicht zu den Dokumenten passt oder nichts Relevantes gefunden wurde, sage das und liefere keine allgemeine Antwort.“ So werden Off-Topic-Fragen im Antwortverhalten begrenzt.
- **Vorfilter (Intent-Check):** Vor dem eigentlichen Retrieval/LLM-Call eine kurze Prüfung: Ist die Nutzeranfrage eine dokumentbezogene Frage? (Einfache Heuristik oder kleiner Klassifikator/LLM-Call.) Wenn nein → sofort ablehnen (z. B. „Stelle bitte Fragen zu Ihren Dokumenten.“), ohne Dokumentinhalte an die KI zu senden.
- **Bei Agent mit Tools:** Die einzigen Tools sind z. B. „Suche in Nutzer-Dokumenten“ und „Lese Passage“. Der Agent kann also **nur** dokumentbezogen handeln. Bei Off-Topic-Fragen liefert das Tool „keine Treffer“ oder eine klare Ablehnung; der Agent kann das an den Nutzer weitergeben („Dazu habe ich keine Informationen in Ihren Dokumenten.“). So wird inhaltlich auf Dokumentfragen beschränkt, ohne dass die KI freie Entscheidung über andere Wissensquellen hat.

---

## 5. Wie soll gesucht werden? (z. B. „Wie gehen wir mit neuen Mitarbeitern um?“)

Solche Fragen sind **natürlichsprachig** und können von **mehreren** Dokumenten beantwortet werden. Damit die richtigen Dokumente/Passagen gefunden werden:

- **Vektorsuche / semantische Suche:** Die Nutzerfrage wird in ein **Embedding** überführt und mit Embeddings von Absätzen/Chunks aller **für den Nutzer lesbaren** Dokumente verglichen. So finden sich auch Treffer ohne exakte Stichworte (z. B. „Onboarding“, „Einarbeitung“, „neue Kollegen“). Mehrere Dokumente können so gleichzeitig relevant sein und in den RAG-Kontext aufgenommen werden.
- **Volltext + Query-Erweiterung:** Aus der Frage Schlüsselwörter oder Synonyme ableiten (Thesaurus oder kleiner LLM-Call), dann **Volltextsuche** nur in der lesbaren Dokumentmenge. Mehrere Dokumente erscheinen in den Treffern, wenn sie die erweiterten Begriffe enthalten.
- **Hybrid:** Volltext und Vektorsuche kombinieren (z. B. Treffer mergen/ranken), um sowohl exakte Nennungen als auch semantisch passende Stellen zu nutzen.

In allen Fällen gilt: **Retrieval nur über die bereits gefilterte Menge** (lesbare Dokumente); dann die besten Passagen (evtl. aus zwei oder mehr Dokumenten) in den RAG-Prompt packen, damit die KI eine zusammengefasste Antwort mit Quellenangaben liefern kann.

---

## 6. Agent und nutzerabhängige Tools – Kurzüberblick

- **Agent:** Ein LLM, das **Tools** aufrufen kann. Statt einen einzigen RAG-Prompt zu bauen, kann der Agent z. B. zuerst „search_documents“ aufrufen, dann „get_passage“, und daraus die Antwort formulieren. Der Ablauf bleibt kontrollierbar, weil jedes Tool vom Backend ausgeführt wird.
- **Nutzerabhängige Tools:** Die Tools werden vom Backend angeboten und bei jedem Aufruf **mit der aktuellen User-ID/Session** ausgeführt. Beispiel: `search_documents(userId, query)` – das Backend nutzt `userId` für `getReadableCatalogScope(userId)` und durchsucht nur diese Dokumente. Der Agent erhält also **pro Nutzer** nur Zugriff auf dessen lesbare Inhalte; es gibt keine „globalen“ Tools mit Zugriff auf alle Daten.

Damit kann man durchaus einen Agenten laufen lassen und ihm nutzerabhängige Tools bereitstellen; die Sicherheit kommt davon, dass das Backend jede Tool-Ausführung an den User-Kontext und die Rechte knüpft.

---

## 7. Ablauf „sichere KI-Suche“ (RAG) – zusammengefasst

1. **Nutzer stellt Frage** (z. B. über Suchseite im KI-Modus).
2. **Backend ermittelt lesbare Dokumente** für den Nutzer (z. B. `getReadableCatalogScope`, Kontext-Rechte + Grants).
3. **Retrieval:** Backend durchsucht **nur diese** Dokumente (Volltext und/oder Vektorsuche, vgl. §5) und extrahiert relevante Passagen. Keine Rohdaten aus anderen Tabellen.
4. **RAG:** Backend baut aus den Passagen (und ggf. Metadaten wie Titel, Dokument-ID) einen Prompt und ruft die LLM-API auf. Die LLM sieht nur diesen Ausschnitt.
5. **Antwort + Quellen:** Backend liefert Antworttext und Quellen-Liste (documentId, title, excerpt); Quellen nur aus Dokumenten, die der Nutzer lesen darf. Optional: Guardrails/Vorfilter (§4), damit nur dokumentbezogene Fragen beantwortet werden.

Bei **Agent-Variante:** Schritt 3/4 werden durch Tool-Aufrufe (vom Backend mit User-Kontext ausgeführt) ersetzt; das Prinzip bleibt: KI sieht nur das, was das Backend nach Rechteprüfung bereitstellt.

---

## 8. Konkrete Maßnahmen

| Aspekt                     | Umsetzung                                                                                                                                                                                                                     |
| -------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Rechte**                 | Vor dem Retrieval: feste Funktionen wie `getReadableCatalogScope(userId)` nutzen; nur Dokument-IDs/Inhalte aus dieser Menge in den Prompt bzw. in Tool-Ergebnisse.                                                            |
| **Kein SQL durch LLM**     | Keine „Text-to-SQL“-Funktion, bei der die KI SQL generiert und die App es ausführt. Wenn später strukturierte Abfragen nötig sind: nur vordefinierte Parameter aus dem Prompt parsen und über sichere API-Parameter abfragen. |
| **Nur Dokument-Fragen**    | System-Prompt/Guardrails; optional Vorfilter (Intent-Check); bei Agent: nur dokumentbezogene Tools.                                                                                                                           |
| **Audit**                  | Optional: Anfragen und genutzte Dokument-IDs pro User loggen (für Admin Chat-History / Token-Verbrauch und Compliance).                                                                                                       |
| **Token-/Kostenkontrolle** | Token-Verbrauch pro User erfassen; Rate-Limits und Admin-Übersicht (vgl. Umsetzungs-Todo §9, §21).                                                                                                                            |

---

## 9. Kurzfassung

- **RAG** = Retrieval (relevante Passagen aus lesbaren Dokumenten) + Anreicherung des Prompts + Generation der Antwort nur aus diesem Kontext.
- **DB sicher durchsuchen** = Backend durchsucht die DB mit bestehenden, rechtegeprüften APIs; die KI erhält nur die bereits gefilterten Treffer (RAG oder Agent-Tool-Ergebnisse), keinen direkten DB-Zugriff.
- **Agent / MCP:** Ein Agent mit nutzerabhängigen Tools (ggf. über MCP-Server) ist möglich; Sicherheit dadurch, dass das Backend jede Tool-Ausführung mit User-Kontext und Rechten durchführt.
- **Nur Dokument-Fragen:** Durch Prompt/Guardrails, Vorfilter oder ausschließlich dokumentbezogene Tools.

Siehe auch: [Umsetzungs-Todo §21 (KI-Assistent)](../plan/Umsetzungs-Todo.md#21-optional-ki-assistent-dokumenten-frage).
