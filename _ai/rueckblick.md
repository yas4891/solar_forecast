# Rückblick für den Vortag

Stand: 2026-09-18. Dieses Dokument beschreibt die bestätigte Funktion.

## 1. Ziel

Die Karte kann optional die Prognose für gestern mit der tatsächlichen Erzeugung vergleichen.

Der Vergleich verwendet die Prognose, die vorgestern um 19:00 Uhr wirksam war.

Die Karte zeigt den Rückblick nur mit zwei konfigurierten und gültigen Entities.

Der Rückblick erscheint links neben heute.

Sein Balken zeigt die tatsächliche Erzeugung mit einem orange-gelben Verlauf.

Eine horizontale schwarze Linie zeigt die damalige Prognose.

Tooltip und Hilfstechnologien nennen beide Werte.

Die interne Architektur unterstützt später drei oder fünf Rückblicktage.

Die erste Oberfläche zeigt ausschließlich gestern.

## 2. Abgrenzung

Dieser Plan ändert keine Dateien außerhalb von `_ai/rueckblick.md`.

Er startet keine automatisierten Prüfungen.

Er startet keine Home-Assistant-Instanz und keinen Container.

Er enthält keine Browser- oder Playwright-Prüfung.

Er plant kein Release.

## 3. Architekturentscheidung

Die Karte nutzt `history/history_during_period` über die vorhandene Home-Assistant-WebSocket-Verbindung.

Diese Schnittstelle liefert den wirksamen Entity-Zustand zu einem bestimmten Zeitpunkt.

Langzeitstatistiken liefern dagegen verdichtete Stundenwerte.

Sie garantieren keinen exakten Zustand um 19:00 Uhr.

Die Karte speichert keine Historie im Browser.

Sie ruft keinen Prognoseanbieter direkt auf.

Ein zusätzlicher Home-Assistant-Helfer bleibt unnötig.

## 4. Konfiguration

Die bestehende Entity `production_today_entity` dient auch als historische Tageserzeugung.

Die Konfiguration erhält dieses neue Feld:

```yaml
history_forecast_entity: sensor.solar_forecast_tomorrow
```

Der Feldname lautet verbindlich `history_forecast_entity`.

Beide Felder aktivieren gemeinsam den Rückblick:

```yaml
type: custom:solar-forecast-card
production_today_entity: sensor.solar_production_today
history_forecast_entity: sensor.solar_forecast_tomorrow
```

`production_today_entity` allein behält das bestehende Verhalten.

Bestehende Konfigurationen bleiben dadurch gültig.

Ein eigenes Aktivierungsfeld ist nicht erforderlich.

Das Löschen von `history_forecast_entity` deaktiviert den Rückblick.

Der visuelle Editor erhält einen zweiten Energie-Entity-Picker.

Der Hilfetext erklärt die erforderliche Sensorsemantik.

Unbekannte YAML-Felder bleiben beim Bearbeiten erhalten.

## 5. Vertrag der Entities

`production_today_entity` liefert die kumulierte Erzeugung des laufenden Kalendertags.

Die Entity setzt ihren Wert täglich nach Home-Assistant-Zeit zurück.

Ein Lebenszeitzähler bleibt entsprechend `PLAN.md` ungeeignet.

`history_forecast_entity` liefert die vollständige Prognose für den nächsten Kalendertag.

Ihr um 19:00 Uhr wirksamer Zustand gilt als damalige Prognose.

Beide Entities müssen dieselben Anlagen wie die Kartensumme abdecken.

Beide Entities müssen Energie in Wh, kWh oder MWh liefern.

Leistung in W oder kW bleibt ungültig.

`unknown`, `unavailable`, negative und nichtnumerische Zustände bleiben ungültig.

Null bleibt ein gültiger Wert.

## 6. Zeitliche Zuordnung

Der Zieltag ist gestern in der Home-Assistant-Zeitzone.

Der Prognosezeitpunkt ist vorgestern um 19:00 Uhr in derselben Zeitzone.

Die tatsächliche Erzeugung ist der wirksame Zustand unmittelbar vor der heutigen lokalen Mitternacht.

Eine Änderung nach 19:00 Uhr zählt nicht zur damaligen Prognose.

Ein Rücksetzungswert exakt um Mitternacht zählt nicht zu gestern.

`src/model/dates.ts` erhält sichere lokale Zeitgrenzen.

Die Berechnung berücksichtigt Zeitzonen und Sommerzeitwechsel.

Sie erzeugt für die WebSocket-Abfrage eindeutige ISO-Zeitstempel.

## 7. Datenabruf

Ein neues Modul `src/data/history.ts` kapselt die Historienabfragen.

Es lädt jeden Zieltag unabhängig von der aktuellen Prognose.

Für den Prognosewert fragt es einen kurzen Zeitraum ab 19:00 Uhr ab.

Für die Erzeugung fragt es einen kurzen Zeitraum vor Mitternacht ab.

Beide Abfragen verwenden `include_start_time_state: true`.

Sie verwenden `significant_changes_only: false`.

Sie verwenden `minimal_response: false` und behalten die Attribute.

Der Prognoseparser wählt ausschließlich den um 19:00 Uhr wirksamen Zustand.

Der Erzeugungsparser wählt den letzten Zustand strikt vor Mitternacht.

Ein wirksamer ungültiger Zustand wird nicht durch einen älteren gültigen Zustand ersetzt.

Diese Regel verhindert scheinbar vollständige Rückblicke.

Der bestehende Kartenbetrieb bleibt bei jedem Historienfehler erhalten.

## 8. Zwischenspeicher und Aktualisierung

Der Historienlader teilt laufende Abfragen pro Home-Assistant-Verbindung.

Der Schlüssel enthält beide Entity-IDs, Zeitzone, Zieltag und Rückblickanzahl.

Mehrere gleiche Karten teilen dadurch dieselbe laufende Abfrage.

Erfolgreiche abgeschlossene Rückblickdaten bleiben bis zum lokalen Tageswechsel gültig.

Fehlerhafte Abfragen erhalten nur einen kurzen Zwischenspeicher.

Damit kann eine vorübergehend verspätete Recorder-Antwort später erscheinen.

Ein Tageswechsel erzeugt automatisch einen neuen Schlüssel.

Eine Konfigurationsänderung verwirft verspätete Antworten über die bestehende Anfragengeneration.

Alte Daten erscheinen niemals unter einem neuen Zieltag.

## 9. Datenmodell

`CardConfig` erhält `history_forecast_entity?: string`.

Die Datenebene liefert von Beginn an eine Liste historischer Vergleichstage.

Das Modell benötigt ungefähr diese Form:

```ts
interface HistoricalComparison {
  dateKey: string;
  actualKwh?: number;
  forecastKwh?: number;
  forecastAt: number;
  actualAt?: number;
  complete: boolean;
}

interface HistoryPayload {
  comparisons: HistoricalComparison[];
  issues: DataIssue[];
  fetchedAt: number;
  stale?: boolean;
}
```

`CardViewModel` erhält eine getrennte Liste `historyDays`.

Die bestehenden `days` bleiben für heute und Folgetage zuständig.

Diese Trennung erleichtert spätere drei oder fünf Rückblicktage.

Eine spätere Option könnte `history_days: 1 | 3 | 5` heißen.

Sie benötigt keine neue Datenarchitektur.

## 10. Berechnung und Skalierung

Ein Rückblicktag ist nur mit beiden gültigen Werten vollständig.

Nur vollständige Rückblicktage erscheinen.

Fehlende Werte werden niemals als null behandelt.

Die gemeinsame Skala verwendet folgenden Maximalwert:

```text
max(vollständige Prognosetage, historische Erzeugung, historische Prognose)
```

Liegt die Prognose höher, bestimmt ihre Linie die Skala.

Liegt die Erzeugung höher, bestimmt der Balken die Skala.

Die Linie bleibt deshalb immer innerhalb der Balkenspur.

Historische Werte verändern zunächst weder `periodKwh` noch `averageKwh`.

Der bestehende Zeitraum bleibt dadurch eine Vorwärtssicht.

## 11. Darstellung und Bedienung

Ein vollständiger Rückblick erscheint links von heute.

Der sichtbare Wert über dem Balken zeigt die tatsächliche Erzeugung.

Der Balken nutzt den bestehenden orange-gelben Verlauf.

Eine horizontale schwarze Linie markiert die historische Prognose.

Eine helle Kontur verbessert ihre Sichtbarkeit im dunklen Design.

Die Linie bleibt nicht die einzige Informationsquelle.

Der Tooltip nennt tatsächliche Erzeugung und 19-Uhr-Prognose.

Der zugehörige `aria-label` nennt ebenfalls beide Werte.

Hover, Tastaturfokus und Klick öffnen dieselben Informationen.

Escape und ein Klick außerhalb schließen den Tooltip.

Der Wochentag lautet lokalisiert „Gestern“ oder „Yesterday“.

Die vorhandene Datumsdarstellung bleibt erhalten.

Nullwerte bleiben sichtbar.

Eine Prognoselinie bei null erhält am unteren Rand eine erkennbare Position.

Heute behält seinen gelben Hintergrund.

Kartenhöhe und `grid_options` bleiben unverändert.

Die erste Umsetzung zeigt höchstens sechs Spalten.

Responsive Stile verhindern horizontales Überlaufen.

## 12. Fehlerverhalten

| Zustand                            | Verhalten                                                |
| ---------------------------------- | -------------------------------------------------------- |
| Kein neues Historienfeld           | Bestehende Darstellung ohne Historienabfrage             |
| Nur `production_today_entity`      | Bestehende Darstellung ohne Warnung                      |
| Nur `history_forecast_entity`      | Kein Rückblick und verzögerter Konfigurationshinweis     |
| Eine konfigurierte Entity fehlt    | Kein Rückblick und verzögerter Hinweis                   |
| Ein historischer Wert fehlt        | Kein Rückblick und verzögerter Hinweis                   |
| Zustand ist ungültig               | Kein Rückblick und verzögerter Hinweis                   |
| Einheit ist ungültig               | Kein Rückblick und verzögerter Hinweis                   |
| Historienzugriff scheitert         | Aktuelle Prognose bleibt sichtbar                        |
| Antwortschema ist bestätigt falsch | Sofortiger Schemahinweis                                 |
| Gültige alte Daten sind vorhanden  | Rückblick bleibt sichtbar und wird als veraltet gemeldet |
| Tageswechsel mit altem Cache       | Alte Daten bleiben unsichtbar                            |

Normale Historienfehler folgen der bestehenden Drei-Minuten-Frist.

Bestätigte Schemafehler erscheinen entsprechend `PLAN.md` sofort.

Neue `DataIssue`-Codes erhalten eindeutige Schlüssel je Entity und Zieltag.

## 13. Grenzen der Home-Assistant-Historie

Recorder speichert Zustände nur für eingeschlossene Entities.

Die Standardaufbewahrung beträgt zehn Tage.

Nutzer können diesen Wert ändern.

Drei oder fünf Rückblicktage passen gewöhnlich in die Standardaufbewahrung.

Ausgeschlossene oder gelöschte Zustände bleiben nicht wiederherstellbar.

Leserechte gelten ebenfalls für Historienabfragen.

Fehlende Rechte ergeben keine verwendbaren Zustände.

Nach einem Recorder-Ausfall kann der letzte Tageswert fehlen.

Die Dokumentation nennt Recorder und die erforderliche Aufbewahrung ausdrücklich.

Langzeitstatistiken dienen nicht als Rückfall für den 19-Uhr-Wert.

## 14. Lokalisierung

Alle neuen Nutztexte liegen in den bestehenden Locale-Dateien.

Mindestens diese Schlüssel werden ergänzt:

- `yesterday`
- `actualProduction`
- `forecastAt19`
- `historyForecastEntity`
- `historyForecastHelp`
- `historyConfigurationIncomplete`
- `historyUnavailable`
- `historyProductionUnavailable`
- `historyForecastUnavailable`

Englisch und Deutsch bleiben vollständig typisiert.

Datum und Zahlen folgen weiterhin der aufgelösten Kartensprache.

Zeitberechnungen folgen ausschließlich der Home-Assistant-Zeitzone.

## 15. Betroffene Bereiche

| Bereich                            | Geplante Änderung                                          |
| ---------------------------------- | ---------------------------------------------------------- |
| `src/types.ts`                     | Konfiguration, Historienpayload und Vergleichstag ergänzen |
| `src/data/history.ts`              | Historienabruf, Parser und Cache neu anlegen               |
| `src/model/dates.ts`               | Lokale 19-Uhr- und Mitternachtsgrenzen ergänzen            |
| `src/model/energy.ts`              | Historische Zustände über dieselbe Umrechnung verarbeiten  |
| `src/model/view-model.ts`          | Historische Vergleichstage und gemeinsame Skala ergänzen   |
| `src/solar-forecast-card.ts`       | Laden, Balken, Linie, Tooltip und Warnungen ergänzen       |
| `src/editor.ts`                    | Zweiten Entity-Picker und Hilfetext ergänzen               |
| `src/localize/`                    | Deutsche und englische Texte ergänzen                      |
| `tests/fixtures/home-assistant.ts` | Kontrollierte Historienantworten ergänzen                  |
| `tests/`                           | Daten-, Modell-, Karten- und Editor-Fälle ergänzen         |
| `PLAN.md`                          | Freigegebenen Produktvertrag später ergänzen               |
| `README.md`, `docs/`               | Konfiguration, Recorder und Sensorsemantik erklären        |

## 16. Arbeitspakete

### 16.1 Produktvertrag festlegen

Semantik, Feldname und Anzeigegrenzen werden verbindlich festgelegt.

Alle offenen Fragen erhalten eine Antwort oder dokumentierte Standardentscheidung.

### 16.2 Zeit- und Datentypen ergänzen

Provider-neutrale Historientypen und lokale Zeitgrenzen werden ergänzt.

19:00 Uhr und Mitternacht müssen auch an Sommerzeitwechseln funktionieren.

### 16.3 Historienlader implementieren

Der Lader liefert Vergleichstage und strukturierte Fehler.

Er teilt laufende Abfragen und behandelt fehlende Historie unabhängig.

### 16.4 Ansichtsmodell erweitern

Rückblick, Skala und Prognosezeitraum bleiben fachlich getrennt.

Rückblickwerte beeinflussen nur die gemeinsame Skala und ihre Darstellung.

### 16.5 Kartenlebenszyklus integrieren

Die Karte lädt Historie unabhängig von aktuellen Prognosedaten.

Verspätete Antworten und Tageswechsel erhalten klare Regeln.

### 16.6 Rückblick darstellen

Balken, Linie, Tooltip, ARIA-Texte und sechs Spalten werden ergänzt.

Kartenabmessungen bleiben stabil.

### 16.7 Editor ergänzen

Der Prognosesensor wird verständlich und rückwärtskompatibel konfigurierbar.

Setzen und Löschen erzeugen korrekte Konfigurationen.

### 16.8 Fixtures und Dokumentation ergänzen

Fixtures bilden gültige, fehlende, ungültige und veraltete Historienantworten ab.

Öffentliche Texte verwenden einfaches Englisch gemäß den Projektregeln.

## 17. Geplante Prüfungen

Diese Prüfungen laufen erst direkt vor einem freigegebenen Release.

### Datenebene

- Wirksamer Zustand exakt um 19:00 Uhr.
- Letzter Zustand vor 19:00 Uhr.
- Änderung nach 19:00 Uhr.
- Ungültiger Zustand um 19:00 Uhr.
- Letzter Tageswert vor Mitternacht.
- Rücksetzung exakt um Mitternacht.
- Leere oder gefilterte Historienantwort.
- Falsches Antwortschema.
- Wh-, kWh- und MWh-Umrechnung.
- Gültige Nullwerte.
- Sommer- und Winterzeit.
- Gemeinsam genutzte laufende Abfragen.
- Cachewechsel am Tageswechsel.
- Drei und fünf Zieltage im internen Modell.

### Ansichtsmodell

- Rückblick nur mit zwei gültigen Werten.
- Prognose über Erzeugung.
- Erzeugung über Prognose.
- Historischer Wert über allen Zukunftswerten.
- Unveränderte Zeitraumssumme und unveränderter Durchschnitt.
- Unveränderte bestehende Prognosefälle.

### Karte und Editor

- Gestern steht vor heute.
- Balken und Linie besitzen korrekte Höhen.
- Tooltip und `aria-label` enthalten beide Werte.
- Fokus und Klick steuern den Tooltip.
- Sechs Spalten setzen die Tagesanzahl korrekt.
- Beide Picker filtern auf Energiesensoren.
- Löschen des Prognosesensors deaktiviert den Rückblick.
- Englische und deutsche Texte sind vollständig.

Browser- und Playwright-Prüfungen bleiben ausgeschlossen.

## 18. Akzeptanzkriterien

- Alte Konfigurationen rendern unverändert.
- `production_today_entity` allein löst keine Historienabfrage aus.
- Beide Entities aktivieren die Historienabfrage.
- Die Karte verwendet gestern nach Home-Assistant-Zeit.
- Die Prognose stammt von vorgestern um 19:00 Uhr.
- Sommerzeitwechsel verändern die lokale Zuordnung nicht.
- Gestern erscheint nur mit beiden gültigen Werten.
- Gestern erscheint links von heute.
- Der Balken zeigt die tatsächliche Erzeugung.
- Die Linie zeigt die 19-Uhr-Prognose.
- Tooltip und `aria-label` nennen beide Werte.
- Hover, Fokus und Klick öffnen dieselben Informationen.
- Die Skala berücksichtigt den höheren historischen Wert.
- Historische Werte verändern Zeitraumssumme und Durchschnitt nicht.
- Nullwerte bleiben gültig.
- Fehlende Daten erscheinen niemals als null.
- Ein Historienfehler entfernt keine aktuelle Prognose.
- Mehrere Karten teilen gleiche laufende Historienabfragen.
- Eine Konfigurationsänderung verwirft alte Antworten.
- Die Architektur verarbeitet später drei oder fünf Vergleichstage als Liste.

## 19. Risiken

- Der Prognosesensor kann fachlich nicht den nächsten Tag darstellen.
- Der Erzeugungssensor kann fälschlich ein Lebenszeitzähler sein.
- Recorder kann eine Entity ausschließen.
- Eine kurze Aufbewahrung kann ältere Rückblicke verhindern.
- Fehlende Rechte können wie fehlende Historie wirken.
- Einheiten können sich zwischen historischen Zuständen ändern.
- Eine langsame Recorder-Datenbank kann Rückblickdaten verzögern.
- Sechs Spalten können sehr schmale Karten belasten.
- Tageswechsel können verspätete Antworten fachlich veralten lassen.
- Gleichzeitige Solcast-Arbeiten können dieselben Modellbereiche ändern.

## 20. Dokumentationsänderungen

`PLAN.md` erhält den freigegebenen Produktvertrag.

`README.md` erhält ein kurzes YAML-Beispiel.

Eine Datendokumentation erklärt Recorder, Aufbewahrung und Entity-Semantik.

Die Architekturdokumentation ergänzt den Historienpfad.

Die Entwicklungsdokumentation beschreibt die kontrollierte Historienfixture.

`CHANGELOG.md` ändert sich erst während eines freigegebenen Releases.

## 21. Offene Fragen

Die Empfehlungen erlauben eine Umsetzung ohne weitere Architekturänderung.

1. Soll `history_forecast_entity` die Prognose für den jeweils nächsten Tag darstellen?
   Empfehlung: Ja.
2. Gilt der um 19:00 Uhr wirksame Wert ohne Änderung exakt um 19:00 Uhr?
   Empfehlung: Ja.
3. Setzt `production_today_entity` täglich nach Home-Assistant-Zeit zurück?
   Empfehlung: Ja, entsprechend dem bestehenden Vertrag.
4. Bleibt gestern außerhalb von Zeitraumssumme und Durchschnitt?
   Empfehlung: Ja.
5. Bleiben vier Folgetage sichtbar, sodass maximal sechs Spalten erscheinen?
   Empfehlung: Ja.
6. Zeigt der sichtbare Wert über gestern die tatsächliche Erzeugung?
   Empfehlung: Ja.
7. Erzeugt fehlende konfigurierte Historie nach drei Minuten eine Warnung?
   Empfehlung: Ja.
8. Zeigt die erste Umsetzung einen Tag und unterstützt intern mehrere Tage?
   Empfehlung: Ja.

## 22. Quellen

- [Home Assistant History WebSocket API](https://github.com/home-assistant/core/blob/dev/homeassistant/components/history/websocket_api.py)
- [Home Assistant Frontend-Historienzugriff](https://github.com/home-assistant/frontend/blob/dev/src/data/history.ts)
- [Home Assistant History](https://www.home-assistant.io/integrations/history/)
- [Home Assistant Recorder](https://www.home-assistant.io/integrations/recorder/)
- [Home Assistant Statistikmodell](https://data.home-assistant.io/docs/statistics/)
