---
name: Legendary Prep Academy
description: Black ink and LPA rust on a light stone ground, House of Cards capitals over IBM Plex Sans, and one black band.
colors:
  ground: "#f4f4f1"
  surface: "#e9e8e3"
  ink: "#0b0a09"
  muted: "#57524c"
  rust: "#ab562b"
  rust-hover: "#924b27"
  tonal: "#dededb"
  tonal-hover: "#cececb"
  line: "#d6d6d3"
  band: "#0b0a09"
  band-ink: "#f4f4f1"
  band-muted: "#a3a19d"
  band-rust-text: "#d9804f"
  seafoam: "#40bf9d"
typography:
  display:
    fontFamily: "House of Cards, IBM Plex Sans, system-ui, sans-serif"
    fontSize: "clamp(38px, 3.24vw + 25.4px, 72px)"
    fontWeight: 700
    lineHeight: 0.95
    letterSpacing: "0.005em"
  headline:
    fontFamily: "House of Cards, IBM Plex Sans, system-ui, sans-serif"
    fontSize: "clamp(30px, 1.72vw + 23.3px, 48px)"
    fontWeight: 700
    lineHeight: 0.95
    letterSpacing: "0.005em"
  wordmark:
    fontFamily: "House of Cards, IBM Plex Sans, system-ui, sans-serif"
    fontSize: "22px"
    fontWeight: 700
    lineHeight: 1
    letterSpacing: "0.04em"
  lead:
    fontFamily: "IBM Plex Sans, system-ui, sans-serif"
    fontSize: "clamp(17px, .286vw + 15.89px, 20px)"
    fontWeight: 400
    lineHeight: 1.5
  title:
    fontFamily: "IBM Plex Sans, system-ui, sans-serif"
    fontSize: "20px"
    fontWeight: 500
    lineHeight: 1.3
    letterSpacing: "-0.01em"
  body:
    fontFamily: "IBM Plex Sans, system-ui, sans-serif"
    fontSize: "16px"
    fontWeight: 400
    lineHeight: 1.55
  small:
    fontFamily: "IBM Plex Sans, system-ui, sans-serif"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.5
  role:
    fontFamily: "IBM Plex Sans, system-ui, sans-serif"
    fontSize: "14px"
    fontWeight: 500
    lineHeight: 1.5
  label:
    fontFamily: "IBM Plex Sans, system-ui, sans-serif"
    fontSize: "13px"
    fontWeight: 500
    lineHeight: 1.4
    letterSpacing: "0.01em"
  button:
    fontFamily: "IBM Plex Sans, system-ui, sans-serif"
    fontSize: "16px"
    fontWeight: 500
    lineHeight: 1
rounded:
  sm: "8px"
  md: "12px"
  lg: "20px"
  btn: "8px"
spacing:
  s-1: "4px"
  s-2: "8px"
  s-3: "12px"
  s-4: "16px"
  s-5: "24px"
  s-6: "32px"
  s-7: "48px"
  s-8: "64px"
  s-9: "96px"
  s-10: "128px"
  container: "1280px"
  gutter: "24px"
  head-gap: "48px"
components:
  button-primary:
    backgroundColor: "{colors.rust}"
    textColor: "{colors.ground}"
    typography: "{typography.button}"
    rounded: "{rounded.btn}"
    padding: "0 24px"
    height: "44px"
  button-primary-hover:
    backgroundColor: "{colors.rust-hover}"
    textColor: "{colors.ground}"
  button-secondary:
    backgroundColor: "{colors.tonal}"
    textColor: "{colors.ink}"
    typography: "{typography.button}"
    rounded: "{rounded.btn}"
    padding: "0 24px"
    height: "44px"
  button-secondary-hover:
    backgroundColor: "{colors.tonal-hover}"
  button-close:
    backgroundColor: "{colors.rust}"
    textColor: "{colors.ground}"
    rounded: "{rounded.btn}"
    padding: "0 48px"
    height: "clamp(64px, 3vw + 40px, 88px)"
    width: "100%"
  nav-link:
    textColor: "{colors.ink}"
    rounded: "{rounded.sm}"
    padding: "0 12px"
    height: "36px"
  staff-tile:
    textColor: "{colors.ink}"
    typography: "{typography.title}"
    rounded: "{rounded.lg}"
  float-card:
    backgroundColor: "{colors.ground}"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    padding: "16px"
    width: "300px"
  career-row:
    backgroundColor: "{colors.band}"
    textColor: "{colors.band-ink}"
    padding: "16px 0"
---

# Design System: Legendary Prep Academy

## Overview

**Creative North Star: "The Clubhouse Wall"**

The staff hang on a light wall in the academy's colours. A warm off-white ground (#f4f4f1) carries black ink, the LPA studio portraits in rounded frames, and rust in exactly two jobs: the action (every button that books a tour) and each person's role line. The brand's poster face, House of Cards, is set in uppercase for the h1 and h2 and for the wordmark beside the shield. Everything people actually read, buttons included, is IBM Plex Sans.

The page changes ground once. One full-bleed black band carries the coaches' playing careers, and on it every text colour is named explicitly. This system exists because the previous world was black on black and lost text. Depth is flat: no shadows anywhere. Grounds, hairlines and photographs do the separating. The portraits (black LPA polos against warm orange bokeh) bring most of the colour on the page.

Motion is short and done once: the hero's words arrive, a photograph in the black band develops like a print as it scrolls on, and controls ease over 180ms. Reduced motion stills all of it.

**Key Characteristics:**
- Light stone ground, black ink, rust for actions and roles only.
- House of Cards uppercase for h1, h2 and the wordmark; IBM Plex Sans for everything else.
- One black band a page, with every text colour on it set explicitly.
- Soft radius scale: 20px on photographs, 12px on the float card, 8px on buttons.
- Flat: no shadows at rest or on hover.
- Seafoam lives only inside the shield; it is never a UI colour.

## Colors

Black, off-white and saddle rust, with one black band and a seafoam that stays in the mark.

### Primary
- **Saddle Rust** (rust): the LPA brand primary. Fills every primary button and the full-width close button, sets each person's role line (14px/500), draws the focus ring, the peek-row dot and the hero float card's status dot, and backs text selection (white on rust, 5.12:1). Rust on the ground measures 4.65:1, so 14px at 500 is its smallest text size.
- **Rust Hover** (rust-hover): the primary button's hover, rust mixed 14% toward ink in OKLab.

### Secondary
- **Seafoam** (seafoam): a brand colour carried by the shield's cactus. It does not appear in the page CSS. On the light ground it measures 2.08:1, which fails even the 3:1 focus-indicator floor, so it is not used for focus, text, or controls.

### Neutral
- **Stone Ground** (ground): the page, the nav bar, the float card, and the ink on rust buttons.
- **Stone Surface** (surface): the placeholder behind photographs while they load (tile and hero media).
- **Ink** (ink): headings, body copy, names, nav links. 17.95:1 on the ground.
- **Dust** (muted): credential lists, the second half of a two-tone h2, row descriptions, footer column heads and the legal line. 7.02:1 on the ground.
- **Tonal** (tonal) / **Tonal Hover** (tonal-hover): the secondary button's fill, ink mixed 8% and 14% into the ground.
- **Hairline** (line): ink at 11% over the ground. Nav underline, rows, credential dividers, footer rule.

### Black Band
- **Band** (band): the one inverse ground (the playing-careers band). Same black as the ink.
- **Band Ink** (band-ink): every heading, paragraph and name on the band. 17.95:1.
- **Band Muted** (band-muted): career lines on the band. 7.67:1.
- **Band Rust Text** (band-rust-text): the band's accent token, 6.74:1 on black. It is the only rust allowed as text on the band. It is declared and not yet shown on screen.

### Named Rules
**The Named Ink Rule.** Every ground states its own text colour. On the black band, every text element (h1–h3, p, li, dt, dd, span, and links that are not buttons) is set to band-ink, and secondary text to band-muted. Nothing on the band inherits its colour from the page or a host stylesheet. Test: delete the inherited `color` from the band's parent; if any text turns dark, the rule is broken.

**The Two Jobs Rule.** Rust is an action fill or a role line. It is not decoration, not a background band, and not a heading colour.

**The Rust on Black Rule.** Rust (#ab562b) on black is 3.86:1. It may fill a button there, with ground-coloured text, and draw the focus ring. It never sets text on the band; use band-rust-text.

**The Shield Keeps the Seafoam Rule.** Seafoam appears only inside the LPA shield image. The focus ring is rust.

## Typography

**Display Font:** House of Cards Bold (self-hosted OTF, weight 700; fallback IBM Plex Sans, system-ui)
**Body Font:** IBM Plex Sans (Google Fonts, 400–700, width axis 85–100; fallback system-ui)

**Character:** House of Cards is the academy's western-poster face, used big, tight and in capitals so the headings read as the brand. Plex is a plain, slightly technical sans that keeps credentials, roles and buttons easy to read.

### Hierarchy
- **Display** (House of Cards 700, clamp 38–72px, 0.95, uppercase): the h1 only.
- **Headline** (House of Cards 700, clamp 30–48px, 0.95, uppercase): every h2, including the close ("Book a tour"). A section h2 may run into a muted second sentence in the same size (`span.muted`).
- **Wordmark** (House of Cards, 22px, 20px on phone, uppercase, 0.04em): "Legendary Prep" beside the shield in the nav and footer. Hidden below 420px, leaving the shield.
- **Lead** (Plex 400, clamp 17–20px, 1.5, max 42ch): the hero lead. Section-head paragraphs use 18px, 20px from 1024px, at 1.5, max 60ch.
- **Title** (Plex 500, 18px, 20px from 1024px, 1.3, -0.01em): staff names on tiles and person rows. Every h3 on the page is Plex, never House of Cards.
- **Body** (Plex 400, 16px, 1.55): running copy; career names at 500.
- **Small** (Plex 400, 14px): credential lists (muted), row descriptions (muted, max 46ch), career lines, footer links.
- **Role** (Plex 500, 14px, rust): the role line under every name.
- **Label** (Plex 500, 13px, 0.01em): the float card's status and the legal line.
- **Button** (Plex 500, 16px): every button. The full-width close button is Plex 700 at clamp 22–32px (Plex 500, 18px, on phone).

### Named Rules
**The Two Faces Rule.** House of Cards is for the h1, the h2s and the wordmark, always uppercase. Every h3, button, label, list and footer line, including the close button and the footer lede, is IBM Plex Sans in sentence case.

**The Tight Capitals Rule.** House of Cards headings run at line-height 0.95 and 0.005em tracking. The wordmark opens to 0.04em.

## Layout

One 1280px container (`.wrap`) is shared by the nav, every section and the footer, with outer gutters of 80px from 1024px, 48px from 640px, and 24px on phone. A 12-column grid sits inside, with 24px column gaps (12px on phone). Spacing follows a 4/8 scale (4, 8, 12, 16, 24, 32, 48, 64, 96, 128). Each heading sits 48px above its content (32px on phone).

The nav is fixed at 72px (56px on phone): the logo on the left, links centred, and one primary button on the right. Below 1024px the links collapse behind a 44px menu button. Each section is one or two screens tall, padded 120px above and 72px below (96 and 48 on phone). The hero is a split: words in five columns on the left, and the head coach's portrait in six columns on the right, stretched to the hero's height with one float card laid on it. Below 1024px it stacks, with words first.

Staff are shown at three densities. Lead coaches get photo tiles (one 6-column 16:9 tile, two 3-column tiles). Assistant coaches get person rows: a 4:3 portrait in 2 columns beside 4 columns of text, on a subgrid with 32px row gaps. The front office gets 4:5 portrait tiles. On phone, coach tiles go full width at 4:3, and front-office tiles pair up at 6 columns each. The parents section is a peek list beside one photograph, and the photograph changes with the hovered or focused row. Interactive targets are at least 44px.

## Elevation & Depth

The system is flat. No element casts a shadow, at rest or on hover. The float card on the hero photograph is separated by an opaque ground fill and a 1px hairline, not a shadow. Depth comes from three things: the single change of ground to the black band, photographs with rounded corners, and hairline rules.

### Named Rules
**The One Black Band Rule.** A page has the light ground plus exactly one black band (`.ground-inverse`), which carries the page's signature content. A second dark band, or a dark footer, is out.

**The Flat Card Rule.** Cards, tiles, rows and the float card never take a box-shadow. When something must stand off a photograph, give it an opaque ground and a hairline.

## Shapes

The page uses the soft radius scale. Photographs (hero, tiles, person-row portraits, the developing photograph, the peek frame) take 20px. The float card takes 12px. Buttons and the nav menu button take 8px, and nav-link hover areas also take 8px. Lines are 1px hairlines at 11% ink: a rule closes each peek row and divides credential items, a rule sits under the nav, and a rule sits above the legal line. The active peek row's rule darkens to full ink. The only round forms are small dots: the rust peek indicator (8px) and the float card's status dot (7px).

## Components

### Buttons
Tonal pair: a rust fill and a quiet tinted secondary, with no outlines.
- **Shape:** gently rounded (8px), 44px tall, 0 24px padding, Plex 500 16px.
- **Primary:** rust fill, ground-coloured text. In the hero, it ends in a drawn arrow whose stem grows on hover. "Book a tour" is the only primary label used.
- **Phone:** hero buttons stack to full width.
- **Hover / Active / Focus:** hover darkens the fill to rust-hover over 180ms `cubic-bezier(.2, .8, .2, 1)`. A press moves the button 1px down and scales it to 0.985. Focus shows a 2px rust outline at a 2px offset.
- **Secondary (tonal):** tonal fill, ink text, no border; tonal-hover on hover. Used for "Meet the coaches" and "Ask the front office".
- **Close (full width):** used once a page, in the footer close. It runs the width of the container, clamp 64–88px tall, with Plex 700 at clamp 22–32px, the label on the left and an arrow on the right. On phone it is 48px tall with Plex 500 at 18px.

### Navigation
- **Bar:** fixed, opaque ground, one hairline under it. No blur, no shadow, and it never hides on scroll.
- **Logo:** the LPA shield (30px wide) and the House of Cards wordmark.
- **Links:** Plex 500 15px in ink, centred. On hover or focus, a 2px ink underline draws in from the left.
- **Mobile:** below 1024px, a 44px menu button opens a stacked list of 56px rows (20px text) separated by hairlines. Below 360px the bar's Book a tour button is dropped.

### Staff Tile
- **Media:** a photograph with 20px corners (16:9 wide, 4:3 default, 4:5 portrait), cropped high (object-position 50% 12–18%) to keep faces in frame.
- **Text:** name in Title, role line in rust 14/500 pulled 12px up toward the name, then a muted 14px credential list whose items are separated by hairlines (6px gap, 8px top padding).
- **No border, background or shadow:** the photograph is the card.

### Person Row
A denser version of the staff tile: a 4:3 portrait on the left (2 of 6 columns, 4 of 12 on phone) and the name, role and credentials on the right. The last cell in the set is an ask row with the same type and a primary button.

### Float Card (hero)
An opaque ground card, 300px wide, 16px padding, 12px corners and a 1px hairline, placed 24px from the photograph's bottom-left corner. It has one row of muted 14px facts and one Plex 500 16px line with the person's record.

### Peek Rows (parents)
A ruled list beside one framed photograph. Each row has a name (Plex 500) and a muted 14px description. On hover or focus, the row's rule turns ink, a rust dot appears after the name, and the photograph changes to that person. Rows are focusable (`tabindex="0"`). Below 1024px the dots are hidden and the photograph stacks under the list at 4:5.

### Career Rows (black band, signature)
On the black band, five-column subgrid rows each pair a square playing-days photograph (1 column) with a name (band-ink, Plex 500 16px) and a career line (band-muted, 14px), separated by dark hairlines. A large photograph sits beside them in 6 columns, 20px corners and up to 600px tall. It develops once as it comes on screen, the way a film print does: pale and colourless, then darks, then colour, settling from a slight zoom, in about 1.6s. Under reduced motion the photograph simply stands.

### Footer (closing)
The close and the footer share one screen. The close is the "Book a tour" h2, a lead with two underlined inline links, and the full-width close button. Below it are the shield and wordmark, a Plex 700 lead line, four columns of 14px links (muted Plex 500 heads, rust on hover), and a hairline above a 13px muted legal row.

## Do's and Don'ts

### Do:
- **Do** set every text colour explicitly on the black band: band-ink (#f4f4f1) for text and band-muted (#a3a19d) for secondary lines.
- **Do** keep rust to actions and role lines, and keep rust text at 14px/500 or larger on the light ground (4.65:1).
- **Do** draw focus as a 2px rust outline at a 2px offset.
- **Do** set h1 and h2 in House of Cards uppercase at line-height 0.95, and everything else in IBM Plex Sans.
- **Do** give photographs 20px corners and crop portraits high so faces stay in frame.
- **Do** end every page on the Book a tour close, with one full-width rust button.
- **Do** keep the LPA shield beside the wordmark in the nav and footer.

### Don't:
- **Don't** set text on the black band that inherits its colour. The previous world lost text as black on black.
- **Don't** use seafoam (#40bf9d) for focus, text, buttons or fills. It measures 2.08:1 on the ground. It stays in the shield.
- **Don't** set rust text on black. Use band-rust-text (#d9804f).
- **Don't** add a second black band, or put a shadow on a card, tile or float card.
- **Don't** set h3s, buttons or body copy in House of Cards, or replace House of Cards with another display face.
