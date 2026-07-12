# Lokówka — UX Foundation & Design System

> **curl pod maską, dosłownie.** Lokalny klient API na macOS. 100% prywatnie, zero konta/chmury.
> Zasada nadrzędna: **PROSTOTA + SPEKTAKULARNY wygląd.** Jedno okno, trzy strefy, ⌘K wszędzie.

**Tożsamość marki:** *heat gradient* (róż/magenta → pomarańcz — rozgrzana lokówka), **dark-first**,
typografia **mono** (odpowiedzi/kod/curl) + **sans** (UI chrome), **micro-animacje**.

Ten dokument to kontrakt wizualny. Wszystkie wartości żyją jako tokeny w
[`src/styles/tokens.css`](../../src/styles/tokens.css); style bazowe app-shella w
[`src/styles/base.css`](../../src/styles/base.css). **Komponenty czytają wyłącznie tokeny semantyczne
`--lok-*`** — nigdy surowych hexów — więc zmiana motywu nie dotyka komponentów.

---

## 1. Zasady projektowe

1. **Odpowiedź jest gwiazdą.** Cała hierarchia prowadzi wzrok od wysłania do odpowiedzi. Chrome cichnie, treść świeci.
2. **Dark-first, light równorzędny.** Projektujemy w ciemności; jasny to pełnoprawny wariant, nie afterthought.
3. **Mono = prawda maszyny.** Wszystko co jest requestem/odpowiedzią/curl/timingiem/nagłówkiem → mono, cyfry tabularne.
4. **Heat = akcja i „gorąco".** Gradient rezerwujemy dla akcji (Send), postępu, aktywnego env i marki. Nie maluje wszystkiego — inaczej traci moc.
5. **Motion opowiada stan.** Animacja pokazuje *co się dzieje* (leci request, przyszła odpowiedź, zmienił się env), nie zdobi. Zawsze pod `prefers-reduced-motion`.
6. **App-shell, nie strona.** Okno nigdy się nie scrolluje (100dvh). Scroll żyje w kontenerach treści. Fixed header/sidebar/status.
7. **Sekret nigdy nie widać.** Maskowanie w UI, timeline, historii, Copy-as-curl. Kolor prod = czerwony = „uważaj".
8. **A11y AA to podłoga, nie sufit.** Każdy tekst ≥ AA; focus-visible zawsze widoczny; motion opcjonalne; klawiatura kompletna.

---

## 2. Paleta

### 2.1 Heat ramp — marka

Rozgrzana lokówka: od magenty przez czerwień do pomarańczu. Uporządkowana zimne→gorące.
Kanoniczny gradient marki biegnie od `--lok-heat-500` (magenta) do `--lok-heat-900` (pomarańcz).

| Token | Hex | Rola |
|---|---|---|
| `--lok-heat-300` | `#ff8fb1` | miękki róż — poświaty, jasne akcenty, klucze JSON |
| `--lok-heat-400` | `#ff5c8a` | róż — hover na gorących powierzchniach, link (dark) |
| `--lok-heat-500` | `#ff2e7e` | **magenta — PRIMARY / start gradientu** |
| `--lok-heat-600` | `#ff2d6b` | hot pink — stan wciśnięty brandu |
| `--lok-heat-700` | `#ff5a3c` | czerwono-pomarańczowy — środek gradientu |
| `--lok-heat-800` | `#ff7a2e` | pomarańcz — blisko końca gradientu |
| `--lok-heat-900` | `#ff9d1e` | bursztyn-pomarańcz — koniec gradientu / najgorętszy |

### 2.2 Neutral ink ramp (zimna, lekko fioletowa)

Fioletowy tint chroni ciemne UI przed „błotem" obok ciepłych akcentów.

`--lok-ink-0` `#0a0a0d` (backdrop) → `--lok-ink-50` `#101015` → `100` `#16161d` → `150` `#1c1c24` →
`200` `#24242e` → `300` `#2f2f3b` → `400` `#3d3d4c` → `500` `#55556a` → `600` `#7a7a92` →
`700` `#9a9ab0` → `800` `#c4c4d4` → `900` `#e8e8f0` → `950` `#f6f6fb` → `--lok-white` `#ffffff`.

### 2.3 Statusy (HTTP / asercje / health)

| Token | Hex (dark) | Znaczenie |
|---|---|---|
| `--lok-c-success` | `#34d399` | 2xx / pass / connected |
| `--lok-c-info` | `#60a5fa` | 3xx / info |
| `--lok-c-warn` | `#fbbf24` | 4xx / warning / wygasa |
| `--lok-c-danger` | `#f87171` | 5xx / fail / error |
| `--lok-c-neutral` | `#9a9ab0` | 1xx / brak statusu / disabled |

> Na jasnym motywie warianty status pogłębiają się do AA-safe na bieli (`--lok-status-*`): sukces `#0f9d63`, info `#2563eb`, warn `#b45309`, danger `#dc2626`.

### 2.4 Semantyka powierzchni (dark → light)

Komponenty używają **tylko** tych nazw.

| Token | Dark | Light | Użycie |
|---|---|---|---|
| `--lok-bg-app` | `#0a0a0d` | `#f4f4f7` | tło okna |
| `--lok-bg-sidebar` | `#101015` | `#ececef` | szyna kolekcji |
| `--lok-bg-surface` | `#16161d` | `#ffffff` | panele edytora/odpowiedzi |
| `--lok-bg-raised` | `#1c1c24` | `#f7f7f9` | karty, toolbary, taby |
| `--lok-bg-overlay` | `#24242e` | `#ffffff` | dropdowny, popovery |
| `--lok-bg-code` | `#101015` | `#fafafc` | pane odpowiedzi / curl -v |
| `--lok-bg-selected` | `rgba(255,46,126,.12)` | `rgba(255,46,126,.10)` | zaznaczenie heat-tinted |
| `--lok-text-primary` | `#f6f6fb` | `#14141a` | tekst główny |
| `--lok-text-secondary` | `#c4c4d4` | `#3d3d4c` | drugorzędny |
| `--lok-text-tertiary` | `#7a7a92` | `#6a6a7d` | meta, placeholdery |
| `--lok-border-default` | `rgba(255,255,255,.10)` | `rgba(10,10,13,.12)` | ramki, dividery |
| `--lok-border-focus` | `#ff2e7e` | `#ff2e7e` | ramka focus |

### 2.5 Heat gradient — dokładne użycie

Zdefiniowane raz w tokenach, spójne w obu motywach:

- **`--lok-gradient-heat`** (`135deg`, `heat-500 → heat-700 → heat-900`) — **przycisk Send** (baza), aktywna pigułka env, badge marki. Klasa `.lok-heat-gradient`.
- **`--lok-gradient-heat-x`** (`90deg`) — **paski postępu** requestu, liniowe metry (np. benchmark load bar).
- **`--lok-gradient-heat-glow`** (radial) — poświata za logo, za sfokusowanym Send, hero empty-state. Klasa `.lok-heat-glow`.
- **`--lok-gradient-heat-text`** (`100deg`, `heat-400 → heat-900`) — **wordmark „Lokówka"**, akcent nagłówka empty-state. Klasa `.lok-heat-text`.

**Dyscyplina:** gradient = akcja/marka/postęp/„gorąco". Nie tłem paneli, nie ramką każdego inputa. Focus inputa dostaje pełną ramkę heat (`.lok-heat-border`) — to jedyny „duży" heat poza Send/env/progress.

### 2.6 Kontrasty (AA)

- Tekst body (`text-primary`) na `bg-surface`: dark `#f6f6fb`/`#16161d` ≈ 15:1; light `#14141a`/`#fff` ≈ 16:1 — ✔ AAA.
- `text-secondary` na `bg-surface`: dark ≈ 9:1, light ≈ 9:1 — ✔ AAA.
- `text-tertiary` (meta) ≥ 4.6:1 — ✔ AA (używać ≥ `--lok-fs-xs`).
- **Tekst na heat-fill:** biały (`--lok-text-on-heat`) na magencie `#ff2e7e` ≈ 3.3:1 → wystarcza dla **large/bold ≥ 18px/600** (Send = 15px semibold OK). Dla mniejszych etykiet na heat: nie schodzić poniżej 14px bold **lub** użyć `--lok-text-inverse` (ciemny) na jaśniejszym końcu gradientu.
- **Prod = czerwony** ma znaczeniowy sens, ale nigdy nie jest jedynym sygnałem: dochodzi etykieta „PROD" + ikona.

---

## 3. Typografia

Dwie rodziny. **Sans** — chrome UI. **Mono** — kod, odpowiedzi, nagłówki (wartości), curl, timingi.

```
--lok-font-sans: -apple-system, "SF Pro Text", "SF Pro Display", system-ui, "Inter", …
--lok-font-mono: "SF Mono", "JetBrains Mono", "Menlo", "Cascadia Code", ui-monospace, monospace
```

macOS bierze SF natywnie; JetBrains Mono to jawny fallback (spójny na maszynach bez SF Mono).

### 3.1 Skala (baza 13px — gęstość macOS)

| Token | rozmiar | użycie |
|---|---|---|
| `--lok-fs-2xs` | 11px | micro-labele, badge, gutter curl -v |
| `--lok-fs-xs` | 12px | meta drugorzędne, komórki tabel |
| `--lok-fs-sm` | **13px** | **BAZA UI** |
| `--lok-fs-md` | 15px | inputy, URL requestu, Send |
| `--lok-fs-lg` | 18px | tytuły sekcji |
| `--lok-fs-xl` | 24px | headline empty-state |
| `--lok-fs-2xl` | 32px | hero / wielki kod statusu |

Wagi: `regular 400`, `medium 500`, `semibold 600`, `bold 700`.
Line-height: `tight 1.2` (nagłówki/statusy), `snug 1.35`, `base 1.5` (UI), `code 1.55` (odpowiedź).
Tracking: `tight -0.01em` (duże liczby), `wide 0.02em` / `caps 0.06em` (ALL-CAPS eyebrow-labele).
Cyfry: `font-feature-settings: "tnum"` na mono → timingi/statusy się nie skaczą.

---

## 4. Spacing / radius / cień

**Spacing** — siatka 4px: `--lok-space-1..16` = 4, 8, 12, 16, 20, 24, 32, 40, 48, 64.
Gęstość desktopowa: padding rzędu listy `space-2`, padding panelu `space-4`, gap sekcji `space-6`.

**Radius**: `xs 3` (chipy/tagi), `sm 5` (**inputy/przyciski/rzędy**), `md 8` (karty/panele/pigułki), `lg 12` (modale/⌘K/HUD), `xl 16`, `full 999` (env-pill, kropki).

**Cienie** (miękkie, zimne, dark-tuned):
`xs` hairline, `sm` dropdown, `md` popover/karta, `lg` modal/palette/HUD,
`--lok-shadow-heat` = poświata magenty pod Send:hover, `--lok-shadow-focus` = ring focusa (3px).

---

## 5. Layout — trzy strefy

```
┌──────────────────────────────────────────────────────────────────────┐
│  ▩▩▩  Lokówka                                    [ env-pill ▾ ]   ⌘K  │  titlebar 40px (drag-region)
├───────────────┬──────────────────────────────────────────────────────┤
│               │  ⟨GET ▾⟩  https://api…/{{env.host}}/users     [ Send ⚡]│  toolbar 44px
│  COLLECTIONS  │  ────────────────────────────────────────────────────  │
│  260px        │  Params · Headers · Body · Auth · Tests   |  ⌗ curl    │  tabbar 34px
│               │                                                        │
│  ▸ auth       │        EDYTOR REQUESTU (two-way: GUI ↔ curl)           │
│  ▾ users      │                                                        │
│    GET  /me   ├──────────────────────────────────────────────────────┤
│    POST /     │  200 OK · 142ms · 4.2KB    [Pretty|Raw|Preview] [⧉jq] │  response header
│  ▸ billing    │                                                        │
│               │        ODPOWIEDŹ  (mono, wirtualizowana)               │  RESPONSE DOCK
│               │  ──────── timeline waterfall (DNS·TCP·TLS·TTFB·DL) ─── │  (dół — patrz 5.1)
├───────────────┴──────────────────────────────────────────────────────┤
│ ● dev   HTTP/2   142ms   cookies:3                              v0.1.0 │  statusbar 26px
└──────────────────────────────────────────────────────────────────────┘
```

**Strefa 1 — Sidebar kolekcji (260px, `--lok-sidebar-w`).** Drzewo kolekcji/folderów/requestów (drag&drop), search u góry, przełącznik kolekcji. Resizable `200–420px`. Tło `--lok-bg-sidebar`, hairline separator po prawej.

**Strefa 2 — Edytor requestu (środek, elastyczny).** Toolbar (metoda + URL + Send) → tabbar (Params/Headers/Body/Auth/Tests + toggle **curl**). Serce marki: two-way curl — GUI i komenda curl to jeden model, live-sync. Tło `--lok-bg-surface`.

**Strefa 3 — Odpowiedź (dock).** Header (status · czas · rozmiar · Pretty/Raw/Preview · jq) + body (mono, wirtualizowane, fold, breadcrumb) + **timeline waterfall** na dole docka.

### 5.1 Dół vs prawo — decyzja i uzasadnienie

**Domyślnie: odpowiedź na DOLE** (`--lok-response-h: 42%`), z **przełącznikiem na PRAWO** (`--lok-response-w: 480px`) w toolbarze odpowiedzi (i w ⌘K).

Dlaczego dół jako default:
1. **Format odpowiedzi.** JSON/curl -v/waterfall to treść *szeroka i płytko-zagnieżdżona* — czyta się lepiej w pełnej szerokości okna niż w wąskiej kolumnie. Prawy panel dławi długie URL-e w nagłówkach i szerokie tabele timingów.
2. **Naturalny przepływ wzroku.** Request u góry → „naciskam Send" → odpowiedź „spływa" pod spód. Ruch w dół = przyczyna→skutek; animacja przybycia (patrz §12) wykorzystuje ten kierunek.
3. **Waterfall to oś czasu.** Poziomy pasek faz DNS→download jest z natury szeroki; dolny dock daje mu pełną szerokość i czytelną skalę ms.
4. **Węższe okna.** Na 13" MacBooku sidebar 260px + edytor + wąski response = wszystko ściśnięte; dół zostawia edytorowi pełną szerokość.

Kiedy **prawo** wygrywa (dlatego jest przełącznikiem, nie usunięte): szeroki monitor + chęć porównywania request↔response obok siebie, oraz praca GraphQL (drzewo pól po lewej edytora, wynik po prawej). Wybór jest per-workspace i pamiętany. Oba tryby: dock jest **resizable** (splitter), a minimalizacja zwija go do samego headera statusu.

### 5.2 App-shell bez scrolla

Okno = dokładnie `100dvh`, `overflow:hidden` (patrz `base.css`). Scrolluje się tylko wnętrze stref przez `.lok-scroll` (`overscroll-behavior:contain`, `min-height:0` żeby flex dzieci mogły się kurczyć). Titlebar/sidebar/statusbar są fixed. `svh/dvh`, nigdy `vh` — pasek narzędzi macOS nie rozjeżdża layoutu.

---

## 6. Stany komponentów

Wspólna gramatyka interakcji dla wszystkich elementów.

| Stan | Reguła |
|---|---|
| **rest** | tło `--lok-bg-raised` / transparent; tekst `--lok-text-secondary` |
| **hover** | nakładka `--lok-bg-hover` (dark `rgba(255,255,255,.04)`); ikony/tekst → `text-primary`; `--lok-dur-fast` |
| **active/pressed** | `--lok-bg-active`; skala `0.98` na przyciskach; bez cienia |
| **selected** (rząd/tab) | tło `--lok-bg-selected` (heat-tint) + lewa krawędź 2px `--lok-brand` |
| **focus-visible** | `box-shadow: var(--lok-shadow-focus)` (ring heat 3px) — **tylko klawiatura** (`:focus-visible`, nigdy na klik) |
| **disabled** | tekst `--lok-text-disabled`, `cursor:not-allowed`, `opacity` bez zmiany tła |
| **error** | ramka/tekst `--lok-status-danger`, tło `--lok-status-danger-bg` |
| **loading** | shimmer na `--lok-bg-raised`; przycisk Send → animowany heat (`.lok-heat-gradient--animated`) |

### 6.1 Przycisk Send (sygnatura)

- **rest:** `.lok-heat-gradient`, tekst `--lok-text-on-heat` (biały) semibold 15px + ikona ⚡; radius `sm`.
- **hover:** `box-shadow: var(--lok-shadow-heat)` (poświata magenty) + subtelny lift.
- **active:** skala `0.98`.
- **sending:** gradient animowany (`--lok-heat-gradient--animated`), pod spodem pasek postępu `--lok-gradient-heat-x`; label „Sending…"; ikona ⚡ pulsuje. Skrót do anulowania (Esc) widoczny.
- **disabled** (brak URL): `--lok-bg-raised`, tekst `--lok-text-disabled`, bez gradientu.
- Klawiatura: **⌘↵** wysyła zawsze.

---

## 7. Env-switcher (pill z kolorem środowiska)

Pigułka w titlebarze (`--lok-radius-full`): **kropka health** (żywy status env) + nazwa env + „▾".
Kolor bierze `--lok-env-accent`, ustawiany atrybutem `[data-env]` na shellu (mapowanie w `base.css`), więc zero inline-styli:

| env | token | hex | znaczenie |
|---|---|---|---|
| local | `--lok-env-local` | `#34d399` zielony | bezpieczne, lokalne |
| dev | `--lok-env-dev` | `#60a5fa` niebieski | dev |
| staging | `--lok-env-staging` | `#fbbf24` bursztyn | uwaga |
| **prod** | `--lok-env-prod` | `#f87171` **czerwony** | **produkcja — ostrożnie** |
| custom | `--lok-env-custom` | `#a78bfa` fiolet | user-defined |

- **Aktywny env:** pigułka wypełniona tłem `--lok-env-accent` @ ~14% + kropka pełnym kolorem; obwódka w kolorze env.
- **Kropka health:** pełna = up, pierścień pulsujący = checking, przekreślona/pusta = down. Kolor kropki = status, nie env (żeby „prod down" był czerwony niezależnie).
- **Quick-look (hover/⌘klik):** popover z listą kluczy env (public/private, sekrety zamaskowane `••••`), przyciskiem „edytuj" i „duplikuj do…".
- **Dropdown (klik):** lista środowisk, każde z własną kropką koloru; **prod ma dodatkowo etykietę „PROD" i ikonę** (kolor nie jest jedynym sygnałem). Zmiana env → animacja §12.

---

## 8. Timeline waterfall (kolory faz)

Poziomy stacked-bar czasu requestu; każda faza ma **stały** kolor (żeby pasek czytał się jako faza wszędzie: timeline, historia, diff, benchmark outlier).

| Faza | token | hex | opis |
|---|---|---|---|
| DNS | `--lok-phase-dns` | `#a78bfa` fiolet | rozwiązywanie nazwy |
| Connect (TCP) | `--lok-phase-connect` | `#60a5fa` niebieski | nawiązanie połączenia |
| TLS | `--lok-phase-tls` | `#22d3ee` cyjan | handshake TLS |
| TTFB (wait) | `--lok-phase-ttfb` | `#ff2e7e` magenta (heat) | oczekiwanie na 1. bajt |
| Download | `--lok-phase-download` | `#ff9d1e` pomarańcz (heat) | pobieranie treści |

TTFB/Download w barwach heat = „gorące" (najważniejsze fazy), reszta w barwach zimnych — spójne z marką i czytelne. Skala w ms pod paskiem, cyfry mono/tabularne. Hover na segmencie → tooltip z dokładnym czasem fazy; klik → skok do logu `curl -v` tej fazy. Przy redirectach: jeden pasek per hop, ułożone kaskadowo (stąd „waterfall").

---

## 9. ⌘K Command palette

Nadrzędna nawigacja (`--lok-z-palette`, ponad wszystkim). Powierzchnia `.lok-glass` + `--lok-radius-lg`, backdrop `--lok-scrim`.

- **Wejście:** ⌘K z dowolnego miejsca; input mono, placeholder „Szukaj requestów, akcji, env…".
- **Wynik:** grupy — *Requesty* (z kolekcji, ikona metody kolorem), *Akcje* (Send, Copy as curl, Copy as…, Toggle theme, Response: dół/prawo), *Środowiska* (przełącz env — kropka koloru), *Historia*.
- **Aktywny wiersz:** tło `--lok-bg-selected` + lewa krawędź heat 2px; podpowiedź skrótu po prawej (`kbd`).
- **Motion:** wejście = scale `0.96→1` + fade, `--lok-dur-base`/`--lok-ease-decelerate`; backdrop fade. Wyjście szybciej (`--lok-dur-fast`/`accelerate`).
- **Klawiatura:** ↑↓ nawigacja, ↵ wykonanie, Esc zamknięcie, Tab przełącza grupę. Pełna obsługa bez myszy.

---

## 10. Empty states (z akcją)

Każdy pusty stan = ikona/ilustracja heat-glow + headline (`--lok-fs-xl`, akcent `.lok-heat-text`) + jedno zdanie + **jedna główna akcja** (przycisk) + skrót klawiszowy.

| Ekran | Headline | Akcja |
|---|---|---|
| Brak kolekcji | „Rozgrzej pierwszą lokówkę" | **Nowy request** (⌘N) · *lub* Importuj (curl / .http / HAR / Postman) |
| Pusty edytor | „Wklej curl albo zacznij od GET" | **Wklej z curl** (⌘V wykrywa) · Nowy request |
| Brak odpowiedzi | „Naciśnij Send i zobacz waterfall" | podpowiedź **⌘↵** + duży, wyświechtany przycisk Send |
| Brak historii | „Twoje requesty pojawią się tutaj" | — (informacyjny) |
| GraphQL bez schematu | „Podaj URL — zrobimy introspekcję" | pole URL + **Introspektuj** |

Ton: krótki, „gorący", zero korpo. Ilustracja: subtelny `--lok-gradient-heat-glow` za monochromatyczną ikoną (lokówka/⚡/curl `~`). Empty-state nigdy nie jest ślepym zaułkiem — zawsze prowadzi do pierwszego sukcesu.

---

## 11. GraphQL explorer (skrót wizualny)

Flagowy ekran: lewa kolumna edytora = **checkboxowe drzewo pól** (introspekcja), środek = edytor query (CodeMirror + cm6-graphql, autocomplete/lint), sync dwukierunkowy. Docs Explorer (Cmd-klik na typ) w overlayu `.lok-glass`. Keyword GraphQL koloruje `--lok-syn-gql` (fiolet). Przy tym ekranie response dock domyślnie **na prawo** (drzewo↔wynik obok siebie). Interpolacja `{{env.x}}` podświetlana w query jako heat-chip.

---

## 12. Motion spec

Motion = biblioteka **Motion** (`motion`, już w zależnościach). Tokeny: `--lok-dur-*`, `--lok-ease-*`.
Trzy **wow-momenty** i mikro-interakcje. **Wszystko pod `prefers-reduced-motion` (twarda bramka w `base.css`).**

### 12.1 Durations / easings

| Token | wartość | użycie |
|---|---|---|
| `--lok-dur-instant` | 80ms | focus ring, checkbox |
| `--lok-dur-fast` | 140ms | hover, zmiana taba |
| `--lok-dur-base` | 220ms | panele/pigułki, swap env, ⌘K |
| `--lok-dur-slow` | 340ms | przybycie odpowiedzi, wejście HUD |
| `--lok-dur-slower` | 520ms | wypełnianie pasków waterfalla |

Easing: `standard` (większość), `decelerate` (rzeczy *przybywające*), `accelerate` (*odchodzące*), `spring` (wow: sukces Send).

### 12.2 Wow-momenty

1. **Wysłanie requestu.** Klik/⌘↵ → Send: skala `0.98` (press) → gradient przełącza się w `--lok-heat-gradient--animated`, pod spodem pasek postępu `--lok-gradient-heat-x` sunie od 0. Ikona ⚡ delikatnie pulsuje. Poświata heat pod przyciskiem intensyfikuje się. Esc = anuluj (pasek cofa się z `accelerate`).
2. **Przybycie odpowiedzi.** Dock „spływa"/rozjaśnia się z dołu: fade+translateY(8px→0), `--lok-dur-slow`/`decelerate`. Kod statusu wjeżdża z krótkim `spring`, w kolorze status-hue. **Waterfall** wypełnia się fazami *po kolei* (staggered, `--lok-dur-slower`) — widać przyczynowość DNS→…→download. Duża/wolna odpowiedź (> np. 1.2s): **glass HUD** (`.lok-glass`) zjeżdża od dołu z podsumowaniem + „drag body do Findera".
3. **Zmiana env.** Pigułka: crossfade koloru accentu (`--lok-dur-base`), kropka health „przeskakuje" (spring), krótki heat-sweep po obramowaniu pigułki. Prod: dodatkowy, mocniejszy błysk czerwieni jako świadome ostrzeżenie.

### 12.3 Mikro-interakcje

Tab switch: podkreślenie-heat przesuwa się (layout animation). Row hover: tło + ikona akcji fade-in 140ms. Copy: ikona ⧉ → ✓ z krótkim spring. Toast: slide-in od dołu-prawej. Splitter: cursor `col/row-resize`, krawędź podświetla heat na drag.

### 12.4 prefers-reduced-motion

`base.css` zeruje `animation-duration`/`transition-duration` (0.01ms), wyłącza animowany gradient (ustawia statyczną pozycję), `scroll-behavior:auto`. Stan zawsze komunikowany **bez** ruchu: opacity/kolor/label zmieniają się natychmiast, waterfall pojawia się od razu wypełniony, HUD po prostu jest. Żadna informacja nie ginie przy wyłączonym motion.

---

## 13. A11y (checklist)

- **Kontrast:** cały tekst ≥ AA (§2.6); tekst na heat tylko large/bold lub `--lok-text-inverse`.
- **Focus:** `:focus-visible` = ring heat 3px, zawsze widoczny, nigdy na klik myszą.
- **Klawiatura:** ⌘K, ⌘↵ (Send), ↑↓/↵/Esc w palette i listach, Tab-order logiczny; pełna obsługa bez myszy.
- **Kolor nie jedynym sygnałem:** prod = kolor **+** etykieta „PROD" + ikona; statusy HTTP = kolor **+** liczba; asercje = kolor **+** ikona ✓/✗.
- **Motion:** `prefers-reduced-motion` respektowane w 100% (§12.4).
- **Cel dotyku/klik:** interaktywne ≥ 28×28px (desktop-dense, ale nie mniej).
- **Mono a11y:** cyfry tabularne + `font-variant-ligatures:none` w kodzie (czytelność `0/O`, `1/l`).
- **Sekrety:** maskowane `••••` w UI/timeline/historii; ujawnienie tylko świadomą akcją (Touch ID / reveal).

---

## 14. Pliki

| Plik | Zawartość |
|---|---|
| [`src/styles/tokens.css`](../../src/styles/tokens.css) | wszystkie tokeny `--lok-*` (`:root` dark + `[data-theme="light"]`) |
| [`src/styles/base.css`](../../src/styles/base.css) | reset, app-shell 100dvh (no-scroll), scrollbary, selection, focus ring, `.lok-heat-gradient`/`.lok-heat-text`/`.lok-glass`, mapowanie `[data-env]`, `prefers-reduced-motion` |
| `docs/design/ux-foundation.md` | ten dokument (kontrakt wizualny) |

**Kolejność importu** (w entry aplikacji): `tokens.css` → `base.css`. Motyw: `document.documentElement` bez atrybutu = dark; `data-theme="light"` = jasny. Aktywne env: `[data-env="local|dev|staging|prod|custom"]` na shellu.
