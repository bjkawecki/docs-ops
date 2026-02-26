```python
# Rechteableitung Pseudocode

# 1. Benutzerzugriff prüfen
def kann_lesen(user: Nutzer, dokument: Dokument) -> bool:
    """
    Prüft, ob ein Nutzer ein Dokument lesen darf.
    Regeln:
    - Dokument gehört genau einem Kontext (Projekt, Prozess, Nutzerspace)
    - Zugriff basiert auf expliziter Zuweisung an Teams, Abteilungen oder Nutzer
    - Nur Team-Mitgliedschaft zählt für Zugriff auf Team-Dokumente
    """
    # Direktzugriff prüfen
    if user in dokument.zugriffsrechte.leser:
        return True

    # Team-Zugriff prüfen
    for team in user.teams:
        if team in dokument.zugriffsrechte.leser:
            return True

    # Abteilungszugriff prüfen (nur, wenn explizit gewährt)
    for abteilung in user.abteilungen:
        if abteilung in dokument.zugriffsrechte.leser:
            return True

    # Kein Zugriff
    return False


def kann_schreiben(user: Nutzer, dokument: Dokument) -> bool:
    """
    Prüft, ob ein Nutzer ein Dokument bearbeiten darf.
    Regeln:
    - Schreibrechte nur für Superuser / Team-Manager
    """
    # Direktzugriff prüfen
    if user in dokument.zugriffsrechte.schreiber:
        return True

    # Superuser im Team prüfen
    for team in user.teams:
        if team in dokument.zugriffsrechte.schreiber and user in team.superuser:
            return True

    # Abteilungsrechte nur, wenn explizit gesetzt
    for abteilung in user.abteilungen:
        if abteilung in dokument.zugriffsrechte.schreiber:
            return True

    return False


# 2. Beispiel: Dokument im Projekt P1
# Projekt P1 gehört Team T1
# Dokument D1 gehört Kontext P1
# Zugriffsrechte:
#   Leser: T1
#   Schreiber: T1.Superuser

user_Z = Nutzer(teams=[T1], superuser_teams=[])
user_M = Nutzer(teams=[T1], superuser_teams=[T1])

# Prüfen
kann_lesen(user_Z, D1)      # True
kann_schreiben(user_Z, D1)  # False
kann_schreiben(user_M, D1)  # True
```
