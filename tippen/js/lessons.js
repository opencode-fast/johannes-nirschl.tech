// Lesson plan and the German word and sentence pools used to generate drills.
(function () {
  'use strict';

  // Only letters (incl. Ä Ö Ü ä ö ü ß). No spaces, digits, hyphens or punctuation.
  const WORDS = [
    'Haus', 'Straße', 'Übung', 'Öl', 'Ärger', 'groß', 'weiß', 'Fuß', 'Spaß', 'fleißig',
    'Schule', 'Lehrer', 'Schüler', 'Unterricht', 'Hausaufgabe', 'Freund', 'Freundin', 'Familie',
    'Mutter', 'Vater', 'Kind', 'Kinder', 'Mensch', 'Leben', 'Zeit', 'Tag', 'Woche', 'Monat', 'Jahr',
    'Morgen', 'Abend', 'Nacht', 'Wetter', 'Sonne', 'Regen', 'Wind', 'Schnee', 'Wasser', 'Brot',
    'Käse', 'Milch', 'Apfel', 'Gemüse', 'Frühstück', 'Mittagessen', 'Küche', 'Zimmer', 'Fenster',
    'Tür', 'Tisch', 'Stuhl', 'Bett', 'Garten', 'Blume', 'Baum', 'Wald', 'Berg', 'Fluss', 'Meer',
    'Strand', 'Stadt', 'Dorf', 'Land', 'Reise', 'Urlaub', 'Bahnhof', 'Flughafen', 'Fahrrad', 'Auto',
    'Bus', 'Zug', 'Weg', 'Brücke', 'Schlüssel', 'Geld', 'Preis', 'Markt', 'Laden', 'Arbeit', 'Büro',
    'Chef', 'Kollegen', 'Termin', 'Besprechung', 'Computer', 'Handy', 'Nachricht', 'Brief',
    'Geschichte', 'Bücher', 'Bibliothek', 'Musik', 'Lied', 'Konzert', 'Film', 'Theater', 'Gruppe',
    'Verein', 'Sport', 'Mannschaft', 'Spiel', 'Ball', 'Fußball', 'gewinnen', 'Glück', 'Hoffnung',
    'Angst', 'Ärztin', 'Gesundheit', 'Krankenhaus', 'Schmerzen', 'Müdigkeit', 'Schlaf', 'gehen',
    'kommen', 'fahren', 'sprechen', 'hören', 'sehen', 'lesen', 'schreiben', 'lernen', 'wissen',
    'können', 'müssen', 'dürfen', 'wollen', 'machen', 'arbeiten', 'spielen', 'kaufen', 'zahlen',
    'bezahlen', 'fragen', 'antworten', 'helfen', 'erklären', 'verstehen', 'vergessen', 'erinnern',
    'beginnen', 'enden', 'öffnen', 'schließen', 'fühlen', 'denken', 'glauben', 'hoffen', 'kochen',
    'backen', 'waschen', 'säubern', 'schön', 'hübsch', 'schnell', 'langsam', 'früh', 'spät',
    'möglich', 'wichtig', 'schwierig', 'einfach', 'gemütlich', 'müde', 'fröhlich', 'traurig', 'böse',
    'nützlich', 'gefährlich', 'sicher', 'frei', 'heiß', 'kühl', 'warm', 'kalt', 'Wärme', 'Kälte',
    'Größe', 'Gefühl', 'Lösung', 'Übersicht', 'Grüße', 'Süßigkeit', 'Bäcker', 'Metzger', 'Jäger',
    'Hühner', 'Füße'
  ];

  // Only letters, ß, umlauts, spaces and . , ? ! — no digits, quotes, colons, semicolons or hyphens.
  const SENTENCES = [
    'Ich lerne jeden Tag ein wenig Deutsch.',
    'Die Schule beginnt morgen früh um acht Uhr.',
    'Wir fahren im Sommer mit dem Zug an die Küste.',
    'Kannst du mir bitte helfen, diese Aufgabe zu lösen?',
    'Das Wetter ist heute schön, und die Sonne scheint.',
    'Mein Bruder wohnt in einer großen Stadt im Süden.',
    'Er hat keine Zeit, weil er viel arbeiten muss.',
    'Am Wochenende gehen wir gern in den Wald spazieren.',
    'Die Übungen helfen dabei, schneller und genauer zu tippen.',
    'Bitte schließ das Fenster, es ist sehr kalt hier.',
    'Ich habe mein Handy zu Hause vergessen!',
    'Die Kinder spielen fröhlich im Garten bis zum Abend.',
    'Hast du schon gegessen oder soll ich etwas kochen?',
    'Der Bäcker öffnet um sechs Uhr und schließt am Abend.',
    'Im Herbst fallen die Blätter von den Bäumen.',
    'Gestern haben wir einen spannenden Film gesehen.',
    'Ein gutes Frühstück gibt Energie für den ganzen Tag.',
    'Wer früh aufsteht, hat am Morgen mehr Zeit.',
    'Das Buch liegt auf dem Tisch neben dem Fenster.',
    'Heute Abend möchte ich ein Konzert besuchen.',
    'Die Stadtbibliothek hat täglich bis zum späten Abend offen.',
    'Könntest du bitte die Tür für mich öffnen?',
    'Wir müssen uns beeilen, sonst verpassen wir den Bus.',
    'Schöne Grüße aus dem Urlaub an der Nordsee!',
    'Die Lösung dieser Aufgabe ist gar nicht schwierig.',
    'Mit Übung wird das Schreiben am Computer immer leichter.',
    'Die Straße ist nass, weil es die ganze Nacht geregnet hat.',
    'Mama backt am Samstag einen großen Kuchen mit Äpfeln.',
    'Ich wünsche dir einen fröhlichen Tag voller Glück.',
    'Der Fußballplatz liegt gleich hinter dem Wald.',
    'Dürfen wir heute länger draußen bleiben?',
    'Für die Prüfung musst du jeden Tag ein bisschen üben.'
  ];

  const MODULES = {
    base: 'Grundstellung',
    upper: 'Obere Reihe',
    lower: 'Untere Reihe',
    symbols: 'Zahlen & Zeichen',
    practice: 'Praxis'
  };

  // mode: "letters" = random groups of the keys, "words" / "sentences" = real German text,
  // "timed" = endless words for durationSec. newKeys are the characters this lesson introduces.
  const LESSONS = [
    {
      id: 1,
      module: MODULES.base,
      title: 'Zeigefinger',
      description: 'Die beiden Zeigefinger übernehmen F und J. Alles andere kommt Schritt für Schritt dazu.',
      tip: 'Linker Zeigefinger auf F, rechter Zeigefinger auf J. Die kleinen Erhöhungen auf F und J helfen dir, die Grundstellung ohne Hinschauen zu finden.',
      newKeys: ['f', 'j'],
      mode: 'letters'
    },
    {
      id: 2,
      module: MODULES.base,
      title: 'Mittel- und Ringfinger',
      description: 'Die Nachbarfinger kommen dazu: D und S links, K und L rechts.',
      tip: 'Linker Mittelfinger auf D, linker Ringfinger auf S, rechter Mittelfinger auf K, rechter Ringfinger auf L.',
      newKeys: ['d', 'k', 's', 'l'],
      mode: 'letters'
    },
    {
      id: 3,
      module: MODULES.base,
      title: 'Kleiner Finger',
      description: 'Die kleinen Finger übernehmen A auf der linken Seite sowie Ö und Ä auf der rechten.',
      newKeys: ['a', 'ö', 'ä'],
      mode: 'letters'
    },
    {
      id: 4,
      module: MODULES.base,
      title: 'Grundreihe üben',
      description: 'Alle Tasten der Grundreihe in gemischten Gruppen. Lieber langsam und sauber als schnell und falsch.',
      newKeys: [],
      mode: 'letters'
    },
    {
      id: 5,
      module: MODULES.base,
      title: 'Stretch: G und H',
      description: 'Die Zeigefinger strecken sich einen Schritt weiter zu G und H.',
      newKeys: ['g', 'h'],
      mode: 'letters'
    },
    {
      id: 6,
      module: MODULES.upper,
      title: 'E, I, R, U',
      description: 'Der erste Schritt in die obere Reihe: E und R links, I und U rechts.',
      newKeys: ['e', 'i', 'r', 'u'],
      mode: 'letters'
    },
    {
      id: 7,
      module: MODULES.upper,
      title: 'T, O, W, Z',
      description: 'Weiter in der oberen Reihe: T und Z am Zeigefinger, W links, O rechts.',
      newKeys: ['t', 'o', 'w', 'z'],
      mode: 'letters'
    },
    {
      id: 8,
      module: MODULES.upper,
      title: 'Q, P, Ü',
      description: 'Die äußeren Tasten der oberen Reihe. Hier arbeiten die kleinen Finger.',
      newKeys: ['q', 'p', 'ü'],
      mode: 'letters'
    },
    {
      id: 9,
      module: MODULES.lower,
      title: 'C, M, V, N',
      description: 'Die untere Reihe beginnt: C und V links, M und N rechts.',
      newKeys: ['c', 'm', 'v', 'n'],
      mode: 'letters'
    },
    {
      id: 10,
      module: MODULES.lower,
      title: 'B, X, Y, Komma, Punkt',
      description: 'Der Rest der unteren Reihe, dazu Komma und Punkt.',
      newKeys: ['b', 'x', 'y', ',', '.'],
      mode: 'letters'
    },
    {
      id: 11,
      module: MODULES.symbols,
      title: 'Zahlen',
      description: 'Die Zahlenreihe oben: 1 bis 0 mit den Fingern der jeweiligen Buchstabenspalte.',
      newKeys: ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'],
      mode: 'letters'
    },
    {
      id: 12,
      module: MODULES.symbols,
      title: 'Großschreibung',
      description: 'Großbuchstaben tippst du mit der Shift-Taste auf der gegenüberliegenden Seite.',
      tip: 'Halte die Shift-Taste (⇧) auf der anderen Seite gedrückt, bis der Großbuchstabe getippt ist.',
      newKeys: Array.from('ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÜ'),
      mode: 'words'
    },
    {
      id: 13,
      module: MODULES.symbols,
      title: 'Satzzeichen',
      description: 'ß, Fragezeichen, Ausrufezeichen, Semikolon, Doppelpunkt, Bindestrich und Unterstrich.',
      newKeys: ['ß', '!', '?', ';', ':', '-', '_'],
      mode: 'letters'
    },
    {
      id: 14,
      module: MODULES.symbols,
      title: 'Klammern & Symbole',
      description: 'Anführungszeichen, Klammern, Rechen- und Sonderzeichen.',
      newKeys: ['"', '(', ')', '/', '&', '%', '=', '+', '*', '#', "'", '$'],
      mode: 'letters'
    },
    {
      id: 15,
      module: MODULES.symbols,
      title: 'AltGr-Zeichen',
      description: '@, €, geschweifte und eckige Klammern und weitere Zeichen mit der AltGr-Taste.',
      tip: 'AltGr ist auf dem Mac die Option-Taste ⌥.',
      newKeys: ['@', '€', '{', '}', '[', ']', '\\', '|', '~', '²', '³', '<', '>'],
      mode: 'letters'
    },
    {
      id: 16,
      module: MODULES.practice,
      title: 'Wörter',
      description: 'Echte deutsche Wörter mit allen bisher gelernten Tasten.',
      newKeys: [],
      mode: 'words'
    },
    {
      id: 17,
      module: MODULES.practice,
      title: 'Sätze',
      description: 'Vollständige Sätze. Jetzt zählen Tempo und Genauigkeit gleichermaßen.',
      newKeys: [],
      mode: 'sentences'
    },
    {
      id: 18,
      module: MODULES.practice,
      title: 'Sprinttest',
      description: '60 Sekunden, so viele Wörter wie möglich. Hier gibt es keine Bestehensgrenze.',
      newKeys: [],
      mode: 'timed',
      durationSec: 60
    }
  ];

  window.TippLessons = { WORDS, SENTENCES, LESSONS };
})();
