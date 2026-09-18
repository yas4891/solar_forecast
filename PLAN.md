# Solar Forecast Card – Umsetzungsplan

Stand: 2026-09-18. Dieser Plan beschreibt die Erstellung. Er startet weder Implementierung noch Prüfungen oder Veröffentlichungen.

## 1. Verbindlicher Umfang

- Repository: `yas4891/solar_forecast`; der lokale Repository-Stamm ist bereits korrekt.
- Kartenname: `Solar Forecast Card`.
- Kartentyp: `custom:solar-forecast-card`.
- Auslieferungsdatei: `dist/solar_forecast.js`, passend zum Repository-Namen.
- Gestaltung nach dem Referenzbild: runde Karte, Sonnensymbol, vertikale Balken, Tageswerte und Datumsangaben.
- Heute erhält einen dezent gelben Hintergrund.
- Folgetage erhalten einen orange-gelben Farbverlauf auf grauem Balkenhintergrund.
- Heute zeigt erzeugte Tagesenergie unten in Orange und Restprognose darüber in Gelb.
- Der Tagesenergiesensor ist optional. Ohne Sensor erscheint ausschließlich die Restprognose.
- Keine Legende. Erläuterungen erscheinen bei Hover, Tastaturfokus oder Klick.
- Fehler erscheinen ausschließlich als oranges Warndreieck, sobald sie mindestens drei Minuten ununterbrochen bestehen.
- Die Fehlermeldung erscheint erst bei Fokus, Hover oder Klick auf das Warndreieck.
- Höchstens fünf Kalendertage: heute plus vier Folgetage.
- Nur vorhandene Prognosetage erscheinen. Fehlende Tage erzeugen keine Platzhalter.
- Die Kartenabmessungen ändern sich nicht durch die Anzahl verfügbarer Tage.
- Die Karte passt sich weiterhin der verfügbaren Dashboardbreite an.
- Deutsch und Englisch gelten für sämtliche Texte, einschließlich Editor, Hinweise und Tooltips.

## 2. Datenanbindung

### Grundbetrieb

Die Karte verwendet eine unterstützte Prognoseintegration in Home Assistant.
Sie unterstützt Forecast.Solar und Solcast PV Forecast.
API-Schlüssel bleiben ausschließlich in der jeweiligen Integration.
Der Browser fragt keinen Prognoseanbieter direkt ab.

`forecast_provider` wählt nur den Anbieter.
Die Karte wählt niemals einzelne Einträge, Standorte oder Flächen.

Der Forecast.Solar-Betrieb erfordert keine manuelle Auswahl einzelner Prognosesensoren.
Die Karte erkennt alle eingerichteten, aktivierten Forecast.Solar-Einträge und ihre zugehörigen Sensoren automatisch.
Sie verwendet Integrationszuordnungen und technische Sensorkennungen statt übersetzter Namen oder geratener Entity-IDs.
Die Karte addiert die heutigen Restwerte dieser Einträge.
Der jeweilige Prognosesensor für morgen dient als Rückfall, wenn dessen nutzbare Zeitreihe fehlt.
Der optionale Tagesenergiesensor liefert ausschließlich die heute tatsächlich erzeugte Energie.
Ein kumulativer Lebenszeitzähler ersetzt diesen Tagesenergiesensor nicht.
Die Dokumentation erklärt bei Bedarf einen vorgeschalteten Tageszähler in Home Assistant.

### Weitere Prognosetage

Die Karte verwendet zentral verfügbare Prognosezeitreihen aus Home Assistant für morgen und weitere Tage.

#### Forecast.Solar

Die Architekturprüfung findet `forecast_solar.get_forecast` im Quellstand Home Assistant 2026.9.1.
Das Quellenschema verwendet `config_entry` und unterstützt optional `resolution`.
Die Karte ruft diese Antwortaktion automatisch je erkanntem Eintrag über die vorhandene Home-Assistant-Verbindung auf.
Damit benötigt der reguläre Betrieb keine zusätzliche Prognosezuordnung im Energie-Dashboard.
Die Antwort liefert `wh_period` als Intervallenergie in Wh mit ISO-Zeitstempeln für den Intervallbeginn.

`energy/solar_forecast` dient ausschließlich als Kompatibilitätsrückfall, falls die Antwortaktion nicht verfügbar ist.
Dieser Rückfall liefert nur im Energie-Dashboard zugeordnete Einträge und ersetzt keine vollständige Quellenerkennung.
Fehlende Rückfalldaten bleiben durch die automatisch erkannten Sensoren für heute und morgen abgedeckt.
Home Assistant 2026.9.1 ist das erste Implementierungsziel. Automatisierte Tests verwenden kontrollierte API-Fixtures.

Fehlt der Zugriff auf Zeitreihen, funktioniert der Grundbetrieb weiterhin mit den automatisch erkannten Sensoren.
Weitere Tage erscheinen nur bei tatsächlich gelieferten Daten. Die Karte verlängert den Prognosehorizont nicht künstlich.
Die Karte zählt die Intervalle je Tag und vergleicht sie mit dem am besten abgedeckten Tag derselben Zeitreihe.
Ein Tag mit deutlich weniger Intervallen gilt als abgeschnittener Tag am Prognosehorizont.
Ein solcher Tag bleibt sichtbar und wird gekennzeichnet, damit der letzte Tag nicht grundlos verschwindet.
Er fließt nicht in Zeitraumsumme, Durchschnitt und gemeinsame Skala ein.
Die Karte schreibt eine abgeschnittene Zeitreihe niemals fort und leitet keinen Tageswert aus einem anderen Tag ab.
Eine fortgeschriebene Kurve wäre eine erfundene Zahl in der Gestalt einer Messung und widerspricht diesem Plan.
Die Anbieterverfügbarkeit kann weniger als fünf Tage erlauben.
Forecast.Solar verwendet heute die automatisch erkannten Restsensoren.
Folgetage verwenden pro Eintrag vorrangig dessen Zeitreihe.
Morgen kann ersatzweise dessen Morgensensor dienen.
Sensorwert und Zeitreihe desselben Eintrags werden niemals miteinander addiert.

### Kartenvertrag und API-Fixtures

Die automatisierten API-Fixtures prüfen den Kartenvertrag für Serviceantworten und Quellenerkennung.
Der Serviceaufruf verwendet `config_entry` und kann `resolution` enthalten.
Die Fixtures enthalten vollständige, unvollständige, fehlerhafte und nicht verfügbare Antworten.
Ein Schemafehler wird nicht als vorübergehender Ausfall behandelt.
Er erhält einen eigenen Fehlerzustand ohne Drei-Minuten-Frist, damit eine dauerhaft falsche
Anfrage nicht wie eine Störung aussieht und im Sensorrückfall verschwindet.

Die Karte nutzt `config_entries/get` und `config/entity_registry/list` für die Erkennung.
Normale Nutzerrechte folgen dem angenommenen API-Vertrag.
Das Projekt behauptet keine Prüfung mit einer echten Home-Assistant-Instanz.

### Auswahl und Zusammengehörigkeit

Der Benutzer wählt niemals einzelne Prognosequellen aus.
Das gilt auch bei mehreren Anlagen, Einträgen, Standorten oder Flächen.
`forecast_provider` wählt ausschließlich die Anbieterart.
Innerhalb eines Forecast.Solar-Eintrags kombiniert die Integration bereits dessen konfigurierte Flächen.
Die Karte addiert diese fertigen Eintragssummen über alle aktivierten Forecast.Solar-Einträge.
Jede eindeutige Eintrags-ID zählt genau einmal. Bereits enthaltene Flächen werden nicht zusätzlich addiert.
Die Karte schließt den nicht gewählten unterstützten Anbieter aus.
Sie schließt alle weiteren Prognoseanbieter ebenfalls aus.
Neue oder entfernte Einträge aktualisieren die automatisch ermittelte Gesamtheit.
Vorübergehend ausgefallene Einträge gelten weiterhin als erwartet und verschwinden nicht still aus der Berechnung.
Automatische Erkennung folgt dem angenommenen API-Vertrag für normale Dashboardbenutzer.
Ein Zugriffsfehler führt zu einem verzögerten Fehlerhinweis, niemals zur Aufforderung einer manuellen Quellenauswahl.
Restsensor, Morgensensor und Zeitreihe werden intern ihrem jeweiligen Eintrag zugeordnet.
Der optionale Tagesenergiesensor muss die tatsächliche Gesamterzeugung aller berücksichtigten Anlagen abbilden.
Die Aggregation erfolgt innerhalb der Karte. Dafür wird kein zusätzlicher Home-Assistant-Sensor angelegt.

Für jeden Tag addiert die Karte die Werte aller erwarteten Einträge nach Energieumrechnung und Datumszuordnung.
Ein zukünftiger Tag erscheint als Gesamtprognose nur, wenn alle erwarteten Einträge einen gültigen Tageswert liefern.
Unterschiedliche Prognosehorizonte begrenzen deshalb die vollständig darstellbaren Tage.
Fehlende Werte gelten niemals als null. Unerwartete Datenausfälle verwenden die vereinbarte Drei-Minuten-Warnung.
Unvollständige heutige Werte werden entsprechend gekennzeichnet und niemals als vollständige Gesamtsumme ausgegeben.
Doppelte Einträge derselben physischen Anlage lassen sich anhand unterschiedlicher IDs nicht zuverlässig erkennen.
Die englische Dokumentation erklärt deshalb, dass jeder Eintrag eine tatsächlich zusätzlich zu berücksichtigende Anlage repräsentiert.

## 3. Berechnungen

Alle Berechnungen verwenden intern kWh. Eingabewerte in Wh und MWh werden umgerechnet.
Leistungssensoren in W oder kW werden nicht als Energie akzeptiert.

Für einen gültigen Tagesenergiesensor gilt:

`heute = erzeugt_heute + rest_heute`

Ohne konfigurierten Tagesenergiesensor gilt für die Darstellung:

`heute = rest_heute`

Der erzeugte Anteil bleibt dabei unbesetzt. Die Karte reserviert dafür keine erfundene Höhe.
Der Tooltip benennt ausdrücklich, dass nur die Restprognose dargestellt wird.

Die größte dargestellte Tagesenergie bestimmt die gemeinsame Skala:

`maximum = max(dargestellte_tageswerte)`

`balkenanteil = tageswert / maximum`

Beim heutigen Balken teilen erzeugte Energie und Restprognose diese gemeinsame Skala.
Ein Beispiel: 12 kWh Erzeugung und 8 kWh Rest ergeben 20 kWh für heute.
Bei 40 kWh als Maximum erreichen die Segmente 30 Prozent und 20 Prozent der gesamten Balkenhöhe.
Der Tooltip zeigt zusätzlich 60 Prozent bereits erzeugt und 40 Prozent verbleibend.

Bei ausschließlich nullwertigen Tagen bleiben alle Balken leer. Die Berechnung erzeugt keine Division durch null.
Die Karte rundet erst die angezeigten Werte, standardmäßig auf eine Nachkommastelle.

`REST` bezeichnet immer die heutige Restprognose.
`ZEITRAUM` bezeichnet die Summe der dargestellten Tageswerte.
Der Durchschnitt verwendet ausschließlich die Anzahl gültiger dargestellter Tageswerte.
Ohne Erzeugungssensor enthält diese Summe heute nur den Rest. Der zugehörige Tooltip erklärt diese Bedeutung.

## 4. Datum, Aktualisierung und Fehlerzustände

Die Tageszuordnung verwendet die Home-Assistant-Zeitzone, unabhängig von der Browsersprache.
Die Karte berücksichtigt Mitternacht und Sommerzeitwechsel.
Sie summiert Energieintervalle anhand der bestätigten Schnittstellensemantik, ohne kumulative Werte doppelt zu zählen.
Teilweise Zeitreihen gelten nicht ungeprüft als vollständige Tagesprognosen.

Sensoränderungen aktualisieren die Darstellung über das Home-Assistant-Kartenmodell.
Zeitreihen werden beim Laden und anschließend sparsam aktualisiert, zunächst höchstens alle fünf Minuten.
Mehrere Karten teilen identische laufende Zeitreihenabfragen innerhalb derselben Home-Assistant-Verbindung.
Beim Entfernen einer Karte werden deren Timer und Ereignisbeobachter aufgeräumt.
Eine Konfigurationsänderung verwirft verspätete Antworten der vorherigen Datenquelle.
Forecast-Sensoränderungen können innerhalb des Abfragelimits eine Aktualisierung der Zeitreihe anstoßen.

Folgende Zustände erhalten eine definierte Darstellung:

| Zustand                                        | Verhalten                                                                              |
| ---------------------------------------------- | -------------------------------------------------------------------------------------- |
| Tagesenergiesensor fehlt absichtlich           | Nur Restprognose; kein Fehlerhinweis                                                   |
| Konfigurierter Tagesenergiesensor ist ungültig | Restprognose bleibt sichtbar; Hinweis erklärt den fehlenden Messwert                   |
| Restprognose fehlt                             | Keine erfundene Restenergie; Heute wird als unvollständig gekennzeichnet               |
| Zukünftiger Prognosetag fehlt                  | Tag entfällt                                                                           |
| Gültige Prognose beträgt null                  | Tag bleibt mit `0,0 kWh` beziehungsweise `0.0 kWh` sichtbar                            |
| Keine brauchbaren Prognosen vorhanden          | Lokalisierter Leerzustand innerhalb derselben Kartenabmessungen                        |
| Verbindung fällt aus                           | Bestehende Anzeige erhält einen Hinweis; alte Daten gelten nicht als aktuelle Prognose |
| Tageswechsel                                   | Daten des Vortags wandern niemals ungeprüft in den heutigen Balken                     |
| Negative oder nichtnumerische Energie          | Ungültiger Wert mit Hinweis, keine Umdeutung zu null                                   |

Ein unvollständiger heutiger Gesamtwert fließt nicht unbemerkt in eine scheinbar vollständige Zeitraumssumme ein.
Bei unvollständigen Daten kennzeichnet der Kopfbereich die Summe entsprechend.
Kennzeichnen bedeutet ausdrücklich nicht verbergen. Die Summe der vollständigen Tage bleibt sichtbar.
Sie erhält ein vorangestelltes Zeichen, und der Tooltip erklärt, warum sie nicht alle Tage abdeckt.
Nur unvollständige Tage bleiben aus der Summe und dem Durchschnitt ausgeschlossen.
Ein fehlender oder ungültiger optionaler Tagesenergiesensor entfernt die Summe nicht.
Heute trägt dann seine Restprognose bei, und der Tooltip erklärt diese Bedeutung.
Für sämtliche Fehlerhinweise gilt die folgende Darstellung, entsprechend der PV Payback Card:

- Ein oranges Warndreieck symbolisiert den Fehler. Es gibt keine dauerhaft sichtbaren Fehlermeldungen oder Fehlerbanner.
- Das Warndreieck erscheint erst nach mindestens drei Minuten ununterbrochener Fehlerdauer.
- Fokus, Hover oder Klick auf das Warndreieck öffnen die lokalisierte Fehlermeldung.
- Tastatur und Touchscreen ermöglichen denselben Zugriff auf die Fehlermeldung.
- Jeder Fehler erhält einen eigenen Beginn der Fehlerdauer. Regelmäßige Aktualisierungen starten diese Dauer nicht erneut.
- Verschwindet ein Fehler, endet seine Fehlerdauer sofort. Ein erneutes Auftreten startet eine neue Drei-Minuten-Frist.
- Das Warndreieck verschwindet sofort, sobald kein Fehler mit abgelaufener Frist mehr besteht.
- Mehrere ausreichend lange bestehende Fehler teilen ein Warndreieck. Die Erläuterung nennt alle betreffenden Fehler.
- Eine geänderte Konfiguration verwirft Fehler und Fristen der vorherigen Konfiguration.
- Der Platz für das Warndreieck bleibt reserviert. Sein Erscheinen verändert weder Kartenabmessungen noch Balkenpositionen.

Die Verzögerung betrifft ausschließlich die Fehleranzeige. Ungültige Daten werden auch während dieser Frist nicht als gültige Werte dargestellt.
Die zuvor beschriebenen Fehlerhinweise verwenden dieses Warndreieck und dieselbe Verzögerung.
Normale Leerzustände und die absichtliche Konfiguration ohne Tagesenergiesensor gelten nicht als Fehler.
Die Karte speichert keine dauerhafte Browserhistorie und stellt keine Recorder-Daten wieder her.
Der optionale Rückblick liest jedoch die erforderlichen historischen Entity-Zustände aus Home-Assistant-Recorder.

## 5. Konfiguration und Internationalisierung

| Feld                      | Bedeutung                                    | Standard               |
| ------------------------- | -------------------------------------------- | ---------------------- |
| `type`                    | `custom:solar-forecast-card`                 | Pflicht                |
| `name`                    | Optionaler eigener Kartentitel               | Lokalisierter Titel    |
| `language`                | `de` oder `en`                               | Home-Assistant-Sprache |
| `forecast_provider`       | `forecast_solar` oder `solcast_solar`        | Automatisch            |
| `production_today_entity` | Tatsächlich erzeugte Tagesenergie            | Nicht gesetzt          |
| `history_forecast_entity` | Tagesprognose für den historischen Vergleich | Nicht gesetzt          |

Felder für einzelne Quellen und Prognosesensoren entfallen vollständig.
`forecast_provider` wählt nur Forecast.Solar oder Solcast.
Bei vorhandener Forecast.Solar-Integration genügt diese Konfiguration, auch mit mehreren Einträgen:

```yaml
type: custom:solar-forecast-card
```

Bei ausschließlich vorhandenem Solcast genügt dieselbe Konfiguration.
Bei beiden Integrationen wählt die Automatik Forecast.Solar.
Eine explizite Auswahl verwendet `forecast_provider`.

Für den orangefarbenen Erzeugungsanteil ergänzt der Benutzer optional `production_today_entity`.
Die Einrichtung verlangt weder einen zweiten API-Schlüssel noch Standort- oder Anlagendaten.

Setzt der Benutzer zusätzlich `history_forecast_entity`, zeigt die Karte einen Vergleich für gestern.
Die Karte liest die um 19:00 Uhr wirksame Prognose vorgestern und die letzte Erzeugung vor Mitternacht.
Beide Werte benötigen Recorder-Historie und gültige Energieeinheiten.
Fehlende Werte bleiben unvollständig und erscheinen nicht als null.
Der Rückblick verändert nicht Zeitraum oder Durchschnitt, aber er erweitert die Balkenskala.

Die Konfiguration funktioniert sowohl über YAML als auch über den visuellen Editor.
Die automatische Erkennung und Aggregation gehören zum regulären Betrieb.
Das Löschen des optionalen Tagesenergiesensors funktioniert ausdrücklich.

Ohne `language` entscheidet die Sprache, die der Benutzer in Home Assistant eingestellt hat.
Diese Einstellung ist die bewusste Wahl des Benutzers für seine Home-Assistant-Oberfläche.
Nur wenn Home Assistant keine Sprache meldet, entscheidet die primäre Browsersprache.
Die Sprachauflösung sucht zunächst die genaue unterstützte Sprachkennung, anschließend deren Basissprache und zuletzt Englisch.
Anfangs stehen `de` und `en` zur Verfügung. Weitere Sprachen verwenden denselben Auflösungsweg.
Eine ungültige explizite Sprache erzeugt einen verständlichen Konfigurationshinweis.
Zahlen und Datumsangaben folgen der ausgewählten Sprache.
Eigene Titel werden nicht automatisch übersetzt.
Jede Sprache liegt in einer eigenen Übersetzungsdatei mit gemeinsamen, typisierten Schlüsseln.
Eine Sprachregistrierung definiert verfügbare Sprachen und deren Anzeigenamen für den Editor.
Eine weitere Sprache benötigt nur ihre Übersetzungsdatei und einen Registrierungseintrag.
Kartenlogik, Berechnungen und Editorabläufe benötigen dafür keine Änderungen.
Fehlende Übersetzungsschlüssel verwenden einzeln den englischen Text.
Platzhalter und vollständige Sätze vermeiden sprachabhängige Verkettungen.
Die Releaseprüfungen kontrollieren Schlüssel, Platzhalter und Rückfallverhalten aller registrierten Sprachen.

## 6. Darstellung und Bedienung

Die Karte verwendet Home-Assistant-Themenvariablen für Hintergrund, Text und Umrandung.
Orange und Gelb bleiben die charakteristischen Prognosefarben.
Die Farben erhalten ausreichend erkennbare Grenzen, auch im dunklen Design.

Alle dargestellten Tage behalten dieselbe Balkenbreite innerhalb derselben Bildschirmgröße.
Bei weniger Tagen verteilt die Karte den freien Platz gleichmäßig.
Die Höhe von Kopfbereich, Diagramm und Beschriftungen hängt nicht von der Tagesanzahl ab.
Der Kopfbereich ordnet Icon und Titel links an.
Lange Titel umbrechen vollständig und werden niemals abgeschnitten.
Die Karte zeigt keine sichtbare Restprognose im Kopfbereich.
Die Zeitraumzeile steht links unter dem Titel und Icon.
Sie bleibt einzeilig und öffnet ihre Erläuterung bei Hover, Fokus oder Klick.
Die Karte verwendet `mdi:solar-power` als Icon.
Die Titelgröße entspricht der PV Payback Card mit `font-size: 1.1em` und `font-weight: 600`.
Die Karte unterstützt die Größenangaben für klassische Dashboards und das Sections-Raster.
Der Home-Assistant-Layout-Editor steuert die Kartenhöhe über `grid_options.rows`.
Die Karte verwendet standardmäßig acht Rasterzeilen.
Der Editor erlaubt mindestens vier Rasterzeilen und keine obere Begrenzung.

Unvollständige Tage erhalten eine erkennbare Markierung am Balken, die das Layout nicht verändert.
Der Tooltip nennt bei einem solchen Tag die Anzahl liefernder Quellen von allen erwarteten Quellen.
Bei einem abgeschnittenen Tag nennt er zusätzlich die unvollständige Zeitreihe.

Tooltips erklären Tageswert, Messanteil und Prognoseanteil.
Der Tooltip des Kopfbereichs erklärt die Bedeutung der Werte. Er wiederholt nicht den sichtbaren Text.
Sie öffnen bei Hover oder Tastaturfokus. Klick öffnet dieselben Informationen auf Touchscreens.
Escape und ein Klick außerhalb schließen die Erläuterung.
Beschriftungen für Hilfstechnologien vermitteln die Werte auch ohne Farberkennung.
Bewegungen berücksichtigen die Systemeinstellung für reduzierte Animationen.

## 7. Projektstruktur und Arbeitspakete

Die Umsetzung verwendet TypeScript, Lit und Vite. Vitest bildet die automatisierte Releaseprüfung.
Konkrete Abhängigkeitsversionen werden beim Projektstart geprüft und durch eine Sperrdatei festgehalten.

Geplante Bereiche:

- `src/solar-forecast-card.ts`: Kartenintegration und Darstellung.
- `src/editor.ts`: visueller Konfigurationseditor.
- `src/data/`: Sensorzugriff, Zeitreihen und Aktualisierung.
- `src/model/`: Tageszuordnung, Energieumrechnung und Balkenberechnung.
- `src/localize/`: deutsche und englische Texte.
- `tests/`: Berechnungsfälle, Komponentenfälle und API-Fixtures.
- `docs/`: Konfiguration, Screenshots und Fehlerhilfe.
- `hacs.json`: HACS-Metadaten.
- `CHANGELOG.md`: englische Veröffentlichungshistorie.
- `AGENTS.md`: verbindliche Entwicklungs- und Release-Regeln.

Arbeitspakete werden in dieser Reihenfolge umgesetzt:

1. Architekturabschluss: stabilen Kartenvertrag und Datenformat festlegen.
2. Projektgrundlage: Werkzeuge, Kartenregistrierung, Übersetzungen und Release-Regeln anlegen.
3. Datenmodell: Quellen, Zeiträume, Fehlerzustände und Berechnungen implementieren.
4. Oberfläche: Balken, Kopfbereich, feste Abmessungen und Interaktionen implementieren.
5. Editor: Auswahlfelder, automatische Vorschläge und YAML-Kompatibilität ergänzen.
6. Releasevorbereitung: Tests schreiben, Beispieldaten und Dokumentation vorbereiten.
7. Freigegebenes Release: Prüfungen ausführen, Fehler beheben und Veröffentlichung abschließen.

Der Architekt klärt die technischen Schnittstellen vor Anwendungscodeänderungen.
Der Entwickler implementiert die abgegrenzten Arbeitspakete.
Automatisierte Unit- und Integrationstests laufen ausschließlich direkt vor einem freigegebenen Release.
Das Projekt führt keine Browser-, Playwright- oder ressourcenintensiven Prüfungen aus.
Höchstens zwei gewöhnliche Korrekturrunden folgen auf dieselbe Prüffeststellung.
Danach übernimmt der Architekt beziehungsweise die Hauptaufgabe die Ursachenklärung.

## 8. Versionierung und Changelog

Die Regeln folgen der PV Payback Card. Versionsnummern werden nicht zwischen beiden Projekten gekoppelt.
Die erste freigegebene Veröffentlichung ist `v0.1.0`.

- Fehlerkorrekturen erhöhen die Patch-Version, beispielsweise `0.1.0` auf `0.1.1`.
- Neue kompatible Funktionen erhöhen die Minor-Version, beispielsweise `0.1.1` auf `0.2.0`.
- Inkompatible Änderungen werden ausdrücklich beschrieben und vorab abgestimmt.
- Während `0.x` erhalten inkompatible Änderungen mindestens eine neue Minor-Version und Migrationshinweise.
- Nach `1.0.0` erhöhen inkompatible Änderungen die Major-Version.
- `package.json` und Sperrdatei enthalten dieselbe freigegebene Nummer.
- Die Karte zeigt ihre Version nicht in der Oberfläche an. Die Version ist bei Installation und Aktualisierung über HACS und die Veröffentlichung sichtbar.
- Git-Tag und GitHub-Releasetitel lauten exakt beispielsweise `v0.1.0`.
- Der Release-Commit lautet beispielsweise `Release v0.1.0`.
- Veröffentlichte Tags werden nicht verschoben. Nachträgliche Korrekturen erhalten eine neue Version.

`CHANGELOG.md` erhält beim Release einen Abschnitt mit der freigegebenen Versionsnummer und dem Datum.
Die Datei behält außerdem einen leeren Abschnitt `Unreleased`, entsprechend dem Vergleichsprojekt.
Einträge erscheinen auf Englisch, aus Nutzersicht und mit genau einer Änderung pro Aufzählungspunkt.
Während gewöhnlicher Entwicklung sammeln wir Änderungen in Arbeitsnotizen. Die Changelog-Aktualisierung erfolgt erst beim freigegebenen Release.

GitHub-Releasenotizen verwenden echtes Markdown und tatsächliche Zeilenumbrüche.
Sie erhalten eine kurze Überschrift und anschließend eine Aufzählung mit Leerzeile.
Die Veröffentlichung verwendet eine temporäre Markdown-Datei und `gh release create --notes-file`.

## 9. Entwicklungsprüfungen und Releaseprüfungen

Automatisierte Unit- und Integrationstests laufen ausschließlich direkt vor einem freigegebenen Release.
Schnelle Format-, Lint-, Typ- und lokale Buildprüfungen erfolgen nur im Releaseprozess.
Browser-, Playwright- und andere ressourcenintensive Prüfungen laufen in diesem Projekt niemals.
Das Projekt startet, testet oder verändert keine Home-Assistant-Container und keine vorhandenen Home-Assistant-Instanzen.
Changelog-Aktualisierungen, Commits, Tags, Pushes und GitHub-Veröffentlichungen benötigen weiterhin ein ausdrücklich freigegebenes Release.

Vor jedem Push wird die konkrete Versionsnummer vorgeschlagen und freigegeben.
Eine bestehende Freigabe für dasselbe Release wird nicht erneut abgefragt.
Gewöhnliche Entwicklungsanfragen gelten nicht automatisch als Releaseauftrag.

GitHub erhält keine Prüfungen auf gewöhnlichen `push`- oder `pull_request`-Ereignissen.
Die vorhandene PV-Payback-Workflowdatei wird deshalb nicht unverändert übernommen.
Eine optionale GitHub-Prüfung ist ausschließlich manuell startbar.
Der manuelle Workflow `.github/workflows/hacs-validation.yml` führt `hacs/action@main` mit `category: plugin` aus.
Er startet nur bei `workflow_dispatch` und verwendet weder Secrets noch zusätzliche Prüfungen.
Der verbindliche Releaseprozess prüft vor Tag und Push den endgültigen lokalen Stand.
HACS-Validierung läuft ausschließlich auf ausdrückliche Anforderung, auch bei Releases.

Der freigegebene Releaseprozess umfasst:

1. Gewünschten Umfang festhalten und die freigegebene Versionsnummer in den Versionsdateien setzen.
2. Formatprüfung, Linting, Typprüfung und automatisierte Tests ausführen.
3. Die Auslieferungsdatei bauen.
4. Fehler korrigieren und betroffene automatisierte Prüfungen innerhalb derselben Freigabe wiederholen.
5. README und Konfigurationsbeispiele gegen das fertige Verhalten prüfen.
6. Versionsdateien, Changelog und Releasenotizen fertigstellen.
7. Der Abschlussprüfer bewertet den endgültigen Stand und erteilt `RELEASE READY`.
8. Commit und Tag erstellen, anschließend das freigegebene Release pushen und veröffentlichen.
9. Tag-Ziel, Release, Auslieferungsdatei und sauberen Git-Status überprüfen.

Neue Änderungen nach einer Prüfung lösen nur die dadurch betroffenen Prüfungen erneut aus.
Ungeklärte Fehler verhindern die Veröffentlichung. Bestehende Benutzeränderungen werden niemals überschrieben.

## 10. Geplante Release-Testfälle

- Zwei, drei und fünf Tage; zusätzliche Tage außerhalb des Fensters.
- Erzeugung plus Rest, ausschließlich Rest und vollständig erzeugter Tag.
- Exakte Normierung und korrekte Segmentanteile.
- Nullwerte, ungültige Werte, fehlende Sensoren und ausgefallene Verbindungen.
- Fehlerdauer unter drei Minuten, exakt drei Minuten und über drei Minuten, geprüft mit kontrollierter Testzeit.
- Fehlerbehebung vor Fristablauf, erneutes Auftreten und unabhängige Fristen für mehrere Fehler.
- Sofortiges Entfernen behobener Warnungen und Zurücksetzen bei Konfigurationsänderungen.
- Fehlermeldungen am Warndreieck über Fokus, Hover und Klick, einschließlich Deutsch und Englisch.
- Unverändertes Layout beim Erscheinen und Verschwinden des Warndreiecks.
- Energieumrechnung zwischen Wh, kWh und MWh.
- Tageswechsel, unterschiedliche Zeitzonen und Sommerzeitwechsel.
- Sprachvorgabe, Home-Assistant-Sprache, englische Rückfallsprache und vollständige Übersetzungen.
- Editor speichern, erneut öffnen und optionalen Sensor entfernen.
- Automatische Einrichtung und Addition mehrerer Forecast.Solar-Einträge ohne Quellenauswahl.
- Bereits aggregierte Flächen, eindeutige Eintrags-IDs und Ausschluss anderer Prognoseanbieter.
- Unterschiedliche Prognosehorizonte, ausgefallene Einträge und Vermeidung scheinbar vollständiger Teilsummen.
- Abgeschnittener letzter Prognosetag: sichtbar, gekennzeichnet und außerhalb von Summe, Durchschnitt und Skala.
- Echter niedriger Tag mit voller Intervallabdeckung, der nicht fälschlich als abgeschnitten gilt.
- Gekennzeichnete, aber weiterhin sichtbare Zeitraumsumme bei unvollständigen Tagen.
- Erhaltene Zeitraumsumme bei ungültigem optionalem Tagesenergiesensor.
- Quellenanzahl im Tooltip eines unvollständigen Tages.
- Sprachwahl aus Home Assistant, Vorrang der Kartenkonfiguration und Rückfall auf die Browsersprache.
- Einzelnes unlesbares Intervall, das die übrige Zeitreihe nicht verwirft.
- Unbeteiligte Zustandsänderung in Home Assistant, die keine Neuberechnung auslöst.
- Neue Sprachregistrierung, fehlende Übersetzungsschlüssel und unveränderte Kartenlogik.
- Umbenannte Sensoren, normale Benutzerrechte und gespeicherte Zuordnungen ohne erneute manuelle Sensorauswahl.
- Tooltip-Zustände über Komponentenprüfungen.
- Unveränderte Kartenabmessungen bei wechselnder Tagesanzahl.
- Antwortaktion ohne Energie-Dashboard-Zuordnung sowie Kompatibilitätsrückfall mit und ohne solche Zuordnung.
- Normales Benutzerkonto ohne administrative Laufzeitrechte.
- Laden des fertigen JavaScript-Artefakts als Home-Assistant-Dashboardressource.

## 11. GitHub und HACS

README, Wiki, Changelog, Releasenotizen und sämtliche öffentliche Anleitungen verwenden ausschließlich einfaches Englisch.
Die README verwendet ASD-STE100 Simplified Technical English mit einheitlichen technischen Begriffen.
Kurze Sätze, konkrete Schritte und erklärte Begriffe halten die Dokumentation leicht verständlich.
Die Dokumentation erklärt Einrichtung, automatische Aggregation, Sprache, Tagesenergiesensor, Prognosehorizont und Installation.
Eine zusätzliche deutsche Anleitung ist nicht vorgesehen. Die Kartenoberfläche unterstützt weiterhin Deutsch und Englisch.
Eine MIT-Lizenz entspricht dem Vergleichsprojekt.

`hacs.json` benennt `Solar Forecast Card` und `solar_forecast.js` als Auslieferungsdatei.
Die gebaute Datei liegt unter `dist/` und erscheint zusätzlich als GitHub-Releaseanhang.
Die README enthält den HACS-Installationsbutton für `yas4891/solar_forecast`.
Die dokumentierte HACS-Ressource lautet `/hacsfiles/solar_forecast/solar_forecast.js`.

Das erste Release ermöglicht die Installation als benutzerdefiniertes HACS-Repository.
Eine Aufnahme in das allgemeine HACS-Verzeichnis gehört zu einem späteren, gesonderten Auftrag.
Der manuelle GitHub-Workflow `HACS validation` prüft die Kategorie `plugin` mit `hacs/action@main`.
Er startet ausschließlich über `workflow_dispatch` und benötigt keine Secrets.

## 12. Abnahme und noch benötigte Umgebung

Die Umsetzung gilt erst nach erfolgreicher Releaseprüfung und überprüfter Veröffentlichung als vollständig ausgeliefert.
Eine Implementierung ohne Releasefreigabe wird als Entwicklungsstand mit den tatsächlich ausgeführten Prüfungen gemeldet.
Ausstehende automatisierte Releaseprüfungen werden ausdrücklich genannt.

Automatisierte API-Fixtures prüfen den Serviceumschlag und die Erkennungsberechtigungen.
Sie verwenden keine Home-Assistant-Instanz, keine Produktionsdaten und keine Zugangsdaten.

## Quellen

- [PV-Payback-Release-Regeln](/Users/medic/projects/pv-payback-card/AGENTS.md)
- [PV-Payback-Changelog](/Users/medic/projects/pv-payback-card/CHANGELOG.md)
- [Home Assistant Forecast.Solar](https://www.home-assistant.io/integrations/forecast_solar/)
- [Home Assistant Energy WebSocket API](https://github.com/home-assistant/core/blob/master/homeassistant/components/energy/websocket_api.py)
- [Solcast PV Forecast](https://github.com/BJReplay/ha-solcast-solar)
- [Solcast-Manifest](https://github.com/BJReplay/ha-solcast-solar/blob/main/custom_components/solcast_solar/manifest.json)
- [Solcast-Aktionsvertrag](https://github.com/BJReplay/ha-solcast-solar/blob/main/custom_components/solcast_solar/actions.py)
- [Solcast-Prognoseberechnung](https://github.com/BJReplay/ha-solcast-solar/blob/main/custom_components/solcast_solar/forecast.py)
- [Solcast-Sensorvertrag](https://github.com/BJReplay/ha-solcast-solar/blob/main/custom_components/solcast_solar/sensor.py)
- [Solcast-Prognosemodus](https://github.com/BJReplay/ha-solcast-solar/blob/main/custom_components/solcast_solar/select.py)
- [HACS-Anforderungen für Dashboardkarten](https://hacs.xyz/docs/publish/plugin/)

## 13. Release-Status `v0.2.0`

Der Benutzer hat Release `v0.2.0` freigegeben.
Die automatisierte Releaseprüfung ist abgeschlossen.
Alle 45 Tests in 11 Dateien bestanden.
Formatprüfung, Linting, Typprüfung und Build bestanden.
Sie prüft Serviceantworten, Quellenerkennung und Kartenverhalten mit kontrollierten API-Fixtures.
Sie startet oder verändert keine Home-Assistant-Instanz.
Sie enthält keine Browser-, Playwright- oder Sichtprüfung.

## 13.1 Release-Status `v0.3.0`

Der Benutzer hat Release `v0.3.0` freigegeben.
Die lokale Releaseprüfung ist abgeschlossen.
Formatprüfung, Linting, Typprüfung, Build und `git diff --check` bestanden.
Alle 65 Tests in 14 Dateien bestanden.
Die Auslieferungsdatei lautet `dist/solar_forecast.js`.
Sie hat 71.136 Bytes und eine gzip-Größe von 19,71 kB.
Ihre SHA-256 lautet `2b6618b7fbc62433a75e419dfd543c4cf3d8bae89aca4118d1e7dd91c0121332`.
Kein Browser, Playwright, HACS, Home Assistant oder Container lief.
Es gibt noch keinen Veröffentlichungs-, Commit-, Tag- oder Remote-Nachweis.

## 14. Geplante Solcast-Erweiterung

Dieser Abschnitt erweitert den bestehenden Produktvertrag.
Er plant Solcast-Unterstützung ohne Implementierung oder Veröffentlichung.

### 14.1 Anbieterwahl

Die Kartenkonfiguration erhält das optionale Feld `forecast_provider`.
Zulässige Werte sind `forecast_solar` und `solcast_solar`.
Ein fehlendes Feld bedeutet automatische Auswahl.

```yaml
type: custom:solar-forecast-card
forecast_provider: solcast_solar
```

Der visuelle Editor zeigt Automatisch, Forecast.Solar und Solcast PV Forecast.
Die Auswahl Automatisch entfernt `forecast_provider` aus der Konfiguration.
Bestehende Konfigurationen bleiben dadurch unverändert gültig.

Die automatische Auswahl folgt dieser festen Reihenfolge:

| Forecast.Solar  | Solcast         | Gewählter Anbieter |
| --------------- | --------------- | ------------------ |
| vorhanden       | beliebig        | Forecast.Solar     |
| nicht vorhanden | vorhanden       | Solcast            |
| nicht vorhanden | nicht vorhanden | Keiner             |

Vorhanden bedeutet ein aktivierter Home-Assistant-Konfigurationseintrag.
Ein ungeladener Eintrag bleibt vorhanden.
Ein vorübergehender Fehler ändert deshalb niemals die Anbieterwahl.
Die Karte vermischt beide Anbieter niemals.

Scheitert die Forecast.Solar-Erkennung im Automatikmodus, ist der Vorrang unbekannt.
Die Karte wählt dann Solcast nicht stillschweigend.
Sie zeigt stattdessen den bestehenden Erkennungsfehler.

Eine explizite Auswahl verwendet ausschließlich den gewählten Anbieter.
Sie fällt bei Fehlern nicht auf den anderen Anbieter zurück.
Ein fehlender gewählter Anbieter erzeugt einen lokalisierten Konfigurationsfehler.
Sein Warndreieck folgt der bestehenden Drei-Minuten-Frist.
Der automatische Modus ohne Anbieter zeigt den bestehenden Leerzustand.

Jede Karteninstanz darf einen eigenen Anbieter wählen.
Eine Karte kann Forecast.Solar verwenden, während eine zweite Karte Solcast verwendet.

### 14.2 Unterstützter Solcast-Vertrag

Das erste Ziel ist `BJReplay/ha-solcast-solar` mit der Domain `solcast_solar`.
Die Planung basiert auf Version `4.6.1`.
Andere Forks oder Domains gehören nicht automatisch zum Umfang.

Solcast erlaubt laut Manifest genau einen Konfigurationseintrag.
Die Integration kombiniert alle berücksichtigten Solcast-Standorte bereits selbst.
Die Karte behandelt diese Gesamtsumme als genau eine Quelle.
Sie addiert keine Standort- oder Diagnosesensoren hinzu.
Ausgeschlossene Standorte folgen ausschließlich der Solcast-Konfiguration.

Die Erkennung verwendet Domain, Konfigurationseintrag, Plattform und `unique_id`.
Anzeigenamen und generierte Entity-IDs spielen keine Rolle.
Die Erkennung berücksichtigt folgende technische Entitäten:

- Heutiger Rest: `get_remaining_today`.
- Morgen: `total_kwh_forecast_tomorrow`.
- Weitere Tage: `total_kwh_forecast_d3` bis `total_kwh_forecast_d5`.
- Prognosemodus: `estimate_mode`.

Version `4.6.1` erzeugt `get_remaining_today`.
Nur tatsächlich aktivierte Tagesentitäten dienen als Sensorrückfall.

`estimate_mode` liefert `estimate`, `estimate10` oder `estimate90`.
Die Karte ordnet diese Werte den folgenden Antwortfeldern zu:

| Solcast-Modus | Antwortfeld     |
| ------------- | --------------- |
| `estimate`    | `pv_estimate`   |
| `estimate10`  | `pv_estimate10` |
| `estimate90`  | `pv_estimate90` |

Die Karte ruft `solcast_solar.query_forecast_data` mit Start und Ende auf.
Der Bereich umfasst mindestens sechs Tage ab dem aktuellen Zeitpunkt.
Die Antwort muss `response.data` als Liste enthalten.
Jede Zeile muss `period_start` und das gewählte Leistungsfeld enthalten.

Der WebSocket-Aufruf verwendet diesen Vertrag:

```yaml
type: call_service
domain: solcast_solar
service: query_forecast_data
service_data:
  start_date_time: <ISO-Zeitstempel>
  end_date_time: <ISO-Zeitstempel>
return_response: true
```

Die Karte lässt `site` weg und erhält dadurch Solcasts kombinierte Gesamtsumme.
Sie lässt `undampened` weg und übernimmt dadurch die konfigurierte Dämpfung.

Solcast liefert durchschnittliche Leistung in kW für halbstündliche Intervalle.
Die Karte berechnet daraus Intervallenergie mit dieser Formel:

`intervall_kWh = leistung_kW * 0,5 Stunden`

Die Tageszuordnung verwendet weiterhin die Home-Assistant-Zeitzone.
Die Karte gruppiert nur gültige Intervalle.
Negative oder nichtnumerische Werte bleiben ungültig.

Die Aktion liest den lokalen Solcast-Zwischenspeicher.
Die Karte startet keine Solcast-Aktualisierung.
Sie ruft niemals `update_forecasts` oder `force_update_forecasts` auf.
Der Browser kontaktiert Solcast niemals direkt.

Die Karte ruft `solcast_solar.get_options` niemals auf.
Diese Aktion kann den API-Schlüssel unmaskiert zurückgeben.
Die Karte liest oder speichert deshalb keinen Solcast-API-Schlüssel.

### 14.3 Einheitliche Datenarchitektur

Die Datenebene erhält eine kleine, anbieterneutrale Adaptergrenze.
Ein neues allgemeines Framework ist nicht erforderlich.

Der Forecast.Solar-Adapter bewahrt das bestehende Verhalten.
Er erkennt weiterhin alle aktivierten Einträge.
Er zählt jede Eintragsgesamtsumme genau einmal.

Der Solcast-Adapter liefert genau eine kombinierte Quelle.
Er normalisiert Restwert, Zeitreihe und Tagesrückfälle auf das bestehende Modell.
Das Ansichtsmodell bleibt möglichst anbieterneutral.

`ForecastPayload` enthält den tatsächlich gewählten Anbieter.
Quellen und Fehler enthalten ebenfalls ihren Anbieter.
Fehlerschlüssel enthalten den Anbieter als Namensraum.
Warnfristen verschiedener Anbieter kollidieren dadurch nicht.

Der Daten-Zwischenspeicher verwendet folgende Schlüssel:

- Home-Assistant-Verbindung.
- Gewählter Anbieter.
- Solcast-Prognosemodus bei Solcast.

Gleiche laufende Anfragen bleiben gemeinsam nutzbar.
Unterschiedliche Anbieter teilen keine Antwort oder veraltete Daten.
Ein geänderter Solcast-Prognosemodus verwirft seine bisherige Projektion.
Verspätete Antworten einer früheren Kartenkonfiguration bleiben wirkungslos.

Die Karte beobachtet alle tatsächlich verwendeten Entitäten.
Dazu gehört bei Solcast auch `estimate_mode`.
Eine Modusänderung aktualisiert die Darstellung ohne Seitenneuladen.

### 14.4 Datenquellen und Rückfälle

Forecast.Solar behält seinen bestehenden Datenfluss.
`forecast_solar.get_forecast` bleibt die primäre Zeitreihenquelle.
`energy/solar_forecast` bleibt dessen Kompatibilitätsrückfall.

Solcast verwendet vorrangig `solcast_solar.query_forecast_data`.
Ein fehlender Aktionsdienst erlaubt `energy/solar_forecast` als Kompatibilitätsrückfall.
Dieser Rückfall verwendet nur den gewählten Solcast-Konfigurationseintrag.
Er verlangt eine passende Zuordnung im Energie-Dashboard.

Aktivierte Solcast-Tagessensoren bilden den letzten Rückfall.
Der Restsensor bleibt für heute maßgeblich.
Der Morgensensor kann einen fehlenden morgigen Zeitreihenwert ersetzen.
Weitere aktivierte Tagessensoren können die Tage drei bis fünf ersetzen.

Ein Schemafehler überspringt alle Rückfälle.
Er erscheint sofort als bestehender `forecast_schema_invalid`-Fehler.
Vorübergehende Aktionsfehler folgen der Drei-Minuten-Frist.
Veraltete Daten bleiben ausschließlich innerhalb desselben Anbieters erhalten.

Die Karte wechselt bei Laufzeitfehlern niemals den Anbieter.
Diese Regel verhindert überraschende Zahlenwechsel und doppelte Summen.

### 14.5 Vollständigkeit und Anzeige

Solcasts kombinierte Reihe gilt als eine erwartete Quelle.
Forecast.Solar behält seine Anzahl erwarteter Einträge.
Das Ansichtsmodell verwendet beide Varianten mit denselben Vollständigkeitsregeln.

Fehlende Werte sind niemals null.
Fehlende zukünftige Tage entfallen weiterhin.
Heute und abgeschnittene Horizonttage bleiben sichtbar und markiert.
Markierte Tage bleiben aus Zeitraumssumme, Durchschnitt und gemeinsamer Skala ausgeschlossen.

Die Intervallprüfung berücksichtigt halbstündliche Solcast-Werte.
Prüffälle decken Tage mit 46, 48 und 50 Intervallen ab.
Damit bleiben Sommerzeitwechsel korrekt.

Die heutige Darstellung behält ihre bisherige Bedeutung.
Sie addiert erzeugte Energie und verbleibende Prognose.
Der konfigurierte Tagesenergiesensor muss weiterhin alle angezeigten Anlagen abdecken.
Ein Anbieterwechsel kann diese fachliche Zuordnung verändern.
Die Dokumentation erklärt diese Folge ausdrücklich.

Layout, Kartenabmessungen und Bedienung bleiben unverändert.
Die Karte zeigt weiterhin höchstens heute und vier Folgetage.
Alle neuen Texte liegen auf Englisch und Deutsch vor.

### 14.6 Fehlerzustände

Folgende neue Zustände erhalten lokalisierte Meldungen:

| Zustand                                 | Verhalten                               |
| --------------------------------------- | --------------------------------------- |
| Ungültiger `forecast_provider`          | Konfigurationsfehler nach drei Minuten  |
| Explizit gewählter Anbieter fehlt       | Konfigurationsfehler nach drei Minuten  |
| Mehrere aktivierte Solcast-Einträge     | Mehrdeutigkeitsfehler nach drei Minuten |
| `estimate_mode` fehlt oder ist ungültig | Prognosemodusfehler nach drei Minuten   |
| Solcast-Antwortschema ist falsch        | Sofortiger Schemafehler                 |
| Solcast-Aktion fällt vorübergehend aus  | Datenfehler nach drei Minuten           |

Mehrere Solcast-Einträge bleiben ein defensiver Fehlerfall.
Die Solcast-Aktion besitzt keinen Parameter für einen Konfigurationseintrag.
Die Karte darf deshalb keinen Eintrag erraten.

Ohne gültigen Prognosemodus verarbeitet die Karte keine Solcast-Aktionszeitreihe.
Die Karte errät niemals `pv_estimate` als Ersatzmodus.
Anbieterprojizierte Energiedaten bleiben als begrenzter Rückfall erlaubt.
Aktivierte Gesamtsensoren bleiben ebenfalls als begrenzter Rückfall erlaubt.

Normale Dashboardrechte für die Solcast-Aktion sind noch nicht real geprüft.
Die Dokumentation behauptet keine Prüfung mit einer echten Home-Assistant-Instanz.
Kontrollierte API-Fixtures bleiben die verbindliche Prüfung.

### 14.7 Umsetzungspakete

Die Umsetzung folgt diesen abgegrenzten Paketen:

1. Produktvertrag und Typen ergänzen.
   `forecast_provider`, Anbieterkennungen und Fehlerzustände werden festgelegt.
2. Anbieterwahl und Erkennung trennen.
   Forecast.Solar und Solcast erhalten getrennte Erkennungswege.
3. Den Forecast.Solar-Datenfluss in einen Adapter verschieben.
   Sein bestehendes Verhalten bleibt unverändert.
4. Den Solcast-Adapter implementieren.
   Er normalisiert Aktion, Sensoren und Energie-Rückfall.
5. Zwischenspeicher und Kartenlebenszyklus erweitern.
   Anbieter und Solcast-Modus trennen alle Zustände.
6. Editor und Lokalisierung ergänzen.
   Automatisch, Forecast.Solar und Solcast werden auswählbar.
7. Kontrollierte Fixtures und Regressionstests ergänzen.
   Beide Anbieter erhalten vollständige Vertragsfälle.
8. README und Datendokumentation aktualisieren.
   Auswahl, Priorität, Grenzen und Datenschutz werden erklärt.

Der Architekt prüft den Vertrag erneut vor Quellcodeänderungen.
Entwickler bearbeiten getrennte, klar begrenzte Dateibereiche.
Automatisierte Prüfungen laufen nur direkt vor einem freigegebenen Release.

### 14.8 Geplante Abnahmetests

- Bestehende Konfigurationen mit Forecast.Solar wählen weiterhin Forecast.Solar.
- Eine reine Solcast-Installation funktioniert ohne Kartenkonfiguration.
- Beide Anbieter im Automatikmodus wählen Forecast.Solar.
- Ein deaktivierter Forecast.Solar-Eintrag blockiert Solcast nicht.
- Ein aktivierter, ungeladener Forecast.Solar-Eintrag behält Vorrang.
- Explizites Solcast verwendet niemals Forecast.Solar.
- Explizites Forecast.Solar verwendet niemals Solcast.
- Beide Anbieter werden niemals addiert.
- Mehrere Forecast.Solar-Einträge werden weiterhin einmal summiert.
- Mehrere Solcast-Standorte werden nur als Gesamtsumme gezählt.
- Umbenannte Solcast-Entitäten bleiben über `unique_id` erkennbar.
- Alle drei Solcast-Prognosemodi verwenden das passende Antwortfeld.
- Zwei 30-Minuten-Werte werden korrekt in kWh umgerechnet.
- Sommerzeit-Tage mit 46, 48 und 50 Intervallen bleiben vollständig.
- Ungültige Zeitstempel und Energiewerte bleiben sichtbar unvollständig.
- Ein falsches Antwortschema erzeugt sofort eine Warnung.
- Ein fehlender Aktionsdienst nutzt nur erlaubte Rückfälle.
- Eine fehlende Energie-Dashboard-Zuordnung verhindert nicht die primäre Solcast-Aktion.
- Zwei Karten mit verschiedenen Anbietern teilen keine Daten.
- Ein Wechsel des Solcast-Modus verwirft dessen alten Zwischenspeicher.
- Ein Anbieterwechsel verwirft Antworten und Warnfristen der vorherigen Auswahl.
- Die Karte ruft keine Solcast-Aktualisierungsaktion auf.
- Die Karte ruft `solcast_solar.get_options` niemals auf.
- Editor und YAML bewahren unbekannte Konfigurationsfelder.
- Automatisch entfernt `forecast_provider` aus der Editor-Konfiguration.
- Englische und deutsche Übersetzungen bleiben vollständig.
- Bestehende Forecast.Solar-Regressionsfälle bleiben unverändert erfolgreich.
- Eine gescheiterte Forecast.Solar-Erkennung wählt Solcast niemals still aus.
- Ein explizit fehlender Anbieter warnt nach drei Minuten.
- Ein ungültiger `forecast_provider` warnt nach drei Minuten.
- Mehrere Solcast-Einträge führen niemals zu einer geratenen Auswahl.
- Ein fehlender Prognosemodus verwendet keinen geratenen Modus.
- Schemafehler verhindern sämtliche Rückfälle.
- Der Energie-Rückfall akzeptiert nur den gewählten Solcast-Eintrag.
- Deaktivierte Solcast-Tagessensoren bleiben ausgeschlossen.
- Vorübergehende Solcast-Fehler behalten nur Solcast-Daten als veraltet.
- Gleiche laufende Solcast-Anfragen werden zusammengeführt.

### 14.9 Dokumentation und Kompatibilität

Die README erhält Beispiele für Automatik und explizite Auswahl.
Sie erklärt den festen Vorrang von Forecast.Solar.
Sie erklärt den fehlenden Laufzeitwechsel bei Fehlern.

Die Dokumentation nennt `BJReplay/ha-solcast-solar` als unterstützte Integration.
Sie nennt Version `4.6.1` als ersten geprüften Vertrag.
Ältere Versionen gelten nur bei gleichem technischen Vertrag als kompatibel.

Die Dokumentation erklärt die kombinierte Solcast-Gesamtsumme.
Sie erklärt Solcast-Ausschlüsse als Aufgabe der Integration.
Sie verlangt keinen zusätzlichen API-Schlüssel für die Karte.

Eine spätere Forecast.Solar-Installation ändert die automatische Auswahl.
Forecast.Solar erhält dann beim nächsten Erkennen Vorrang.
Eine explizite Auswahl verhindert diesen Wechsel.

Diese Erweiterung benötigt keine persistente Datenmigration.
Sie benötigt keine Änderung an Home Assistant oder Solcast.
Eine Veröffentlichung erfolgt nur nach einer gesonderten Releasefreigabe.
