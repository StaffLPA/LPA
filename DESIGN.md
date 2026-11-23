---
name: Legendary Prep Academy
description: Black card stock, printed rust rules and House of Cards capitals; the LPA brand set as a dugout lineup card.
colors:
  ground: "#050505"
  stock: "#0d0c0b"
  stock-raised: "#151311"
  rust: "#ab562b"
  rust-deep: "#8f4320"
  rust-text: "#db8150"
  rule: "rgba(171, 86, 43, 0.42)"
  rule-soft: "rgba(171, 86, 43, 0.2)"
  row-selected: "rgba(171, 86, 43, 0.1)"
  seafoam: "#40bf9d"
  paper: "#f3eee7"
  muted: "#aaa197"
  ink-on-paper: "#2a211b"
typography:
  display:
    fontFamily: "House of Cards, Arial Narrow, sans-serif"
    fontSize: "clamp(52px, 7vw, 104px)"
    fontWeight: 700
    lineHeight: 0.92
    letterSpacing: "0.005em"
  headline:
    fontFamily: "House of Cards, Arial Narrow, sans-serif"
    fontSize: "clamp(40px, 5vw, 72px)"
    fontWeight: 700
    lineHeight: 0.92
    letterSpacing: "0.005em"
  title:
    fontFamily: "House of Cards, Arial Narrow, sans-serif"
    fontSize: "clamp(22px, 2.1vw, 30px)"
    fontWeight: 700
    lineHeight: 1
    letterSpacing: "0.01em"
  label:
    fontFamily: "House of Cards, Arial Narrow, sans-serif"
    fontSize: "16px"
    fontWeight: 400
    lineHeight: 1.15
    letterSpacing: "0.06em"
  label-small:
    fontFamily: "House of Cards, Arial Narrow, sans-serif"
    fontSize: "13px"
    fontWeight: 400
    lineHeight: 1
    letterSpacing: "0.16em"
  body:
    fontFamily: "-apple-system, BlinkMacSystemFont, Segoe UI, Roboto, Helvetica Neue, Arial, sans-serif"
    fontSize: "16px"
    fontWeight: 400
    lineHeight: 1.55
  numeral:
    fontFamily: "-apple-system, BlinkMacSystemFont, Segoe UI, Roboto, Helvetica Neue, Arial, sans-serif"
    fontSize: "18px"
    fontWeight: 600
    lineHeight: 1
    fontFeature: "tnum"
rounded:
  none: "0px"
spacing:
  page-gutter: "clamp(16px, 4vw, 48px)"
  wrap-max: "1360px"
  row-inset: "24px"
  number-gutter: "64px"
  touch-min: "44px"
components:
  button-primary:
    backgroundColor: "{colors.rust}"
    textColor: "#ffffff"
    typography: "{typography.label}"
    rounded: "{rounded.none}"
    padding: "0 22px"
    height: "44px"
  button-primary-hover:
    backgroundColor: "{colors.rust-deep}"
    textColor: "#ffffff"
  button-primary-big:
    backgroundColor: "{colors.rust}"
    textColor: "#ffffff"
    rounded: "{rounded.none}"
    padding: "0 40px"
    height: "64px"
  link-printed:
    textColor: "{colors.paper}"
    typography: "{typography.label}"
    padding: "12px 0"
  nav-link:
    textColor: "{colors.muted}"
    typography: "{typography.label}"
    padding: "12px 0"
  nav-link-active:
    textColor: "{colors.paper}"
  section-band:
    backgroundColor: "{colors.rust}"
    textColor: "#ffffff"
    rounded: "{rounded.none}"
    padding: "12px 24px 12px 84px"
  lineup-row:
    backgroundColor: "{colors.stock}"
    textColor: "{colors.paper}"
    typography: "{typography.title}"
    height: "68px"
  lineup-row-hover:
    backgroundColor: "{colors.stock-raised}"
  lineup-row-selected:
    backgroundColor: "{colors.row-selected}"
  photo-print:
    backgroundColor: "{colors.paper}"
    rounded: "{rounded.none}"
    padding: "8px"
---

# Design System: Legendary Prep Academy

## Overview

**Creative North Star: "The Dugout Lineup Card"**

The LPA brand (black ground, rust, seafoam, House of Cards, the shield and arch wordmark) is printed onto a single sheet of black card stock. Content is laid out the way a lineup card is: ruled rows, column heads, a numbered left gutter, rust section bands, and a printed footer. Information is dense and tabular on purpose, so the whole staff reads at a glance as one roster. Photographs are physical objects on the card: paper-bordered prints, and a smaller snapshot overlapping the main print.

Depth comes from the sheet itself. The card sits on a near-black ground with one soft drop shadow, and its interior is flat, divided by thin rust rules and double rules. Every printed label, name and heading is set in House of Cards capitals. Running copy, credentials and numerals use the system sans so long reading stays easy. Seafoam is the hand-drawn mark: it circles the selected row and draws the focus ring, and appears nowhere else in the CSS.

Motion is short and physical. A new selection draws the seafoam ring around its number, wipes the portrait in from the card's edge, drops the snapshot, and lifts the name and credentials into place. Reduced-motion turns all of it off.

**Key Characteristics:**
- Black card stock (stock) on a darker ground, edged by a 1px rust rule.
- Rust works as print: rules, section bands, the primary button, and small type in its lighter text tint.
- House of Cards uppercase for every printed label. System sans for reading.
- Square corners everywhere.
- Seafoam is used only for the selection mark and the focus ring.
- Photos look like prints: paper border, soft drop shadow, overlapping snapshot.

## Colors

A black-and-rust print palette, with paper white for ink and one seafoam marker.

### Primary
- **Saddle Rust** (rust): the brand primary. Fills the section bands and primary buttons, colors every rule line (as rule and rule-soft), marks the active nav item with a 2px underline, and is the text selection color. White on rust measures 5.1:1. Rust on black is only 3.8:1, so it never sets small text.
- **Deep Rust** (rust-deep): hover state for the primary button only.
- **Ember Text** (rust-text): rust lifted for small type on black (6.8:1 on stock). Used for column heads, field labels, positions and titles.

### Secondary
- **Seafoam Marker** (seafoam): the brand accent. Used for the hand-drawn ring around the selected row number and the 2px focus outline, and nowhere else. The shield image carries it as part of the brand mark.

### Neutral
- **Ground** (ground): the page behind the card, and the theme color.
- **Card Stock** (stock): the card's surface, also the sticky column-head background.
- **Raised Stock** (stock-raised): row hover.
- **Rule** (rule) / **Soft Rule** (rule-soft): rust at 42% and 20%. Rule draws structural lines (card edge, column heads, gutter line, field rows). Soft Rule separates entries and list items.
- **Paper** (paper): primary text, photo-print borders, and the skip link.
- **Pencil Grey** (muted): secondary copy, row leads, inactive nav, footer text (7.7:1 on stock).
- **Ink on Paper** (ink-on-paper): captions printed on paper-white mounts.

### Named Rules
**The Marker Rule.** Seafoam is the pen, not the print. In CSS it marks only selection and focus. Every printed element is rust, paper or grey.

**The Rust Legibility Rule.** Use rust as a fill, as a rule, or for display-size type. Small text on black uses rust-text.

## Typography

**Display Font:** House of Cards (self-hosted OTF, 400 and 700; fallback Arial Narrow, sans-serif)
**Body Font:** system sans (-apple-system, Segoe UI, Roboto, Helvetica Neue, Arial)

**Character:** A condensed western-poster face sets everything printed on the card, in uppercase and widely tracked at small sizes. A neutral system sans handles everything people actually read.

### Hierarchy
- **Display** (700, clamp 52–104px, 0.92): the card title. Headings h1–h3 are all uppercase, balanced, at line-height 0.92.
- **Headline** (700, clamp 40–72px, 0.92): the footer ask. The detail-panel name uses the same face at clamp 40–60px (38px on phone).
- **Title** (700, clamp 22–30px, 1): names in lineup rows (24px on phone).
- **Label** (400, 16–20px, tracked 0.06–0.08em, uppercase): positions, detail titles, nav (17px), printed links and buttons (700, 18px, 0.08em; 26px on the big button).
- **Label Small** (400, 13–14px, tracked 0.12–0.16em, uppercase): column heads, field labels, photo captions. Section bands use 700 16px at 0.18em.
- **Body** (400, 16px, 1.55): credentials and copy. Lead paragraphs are 18px, capped at 54ch. Row leads are 14px/1.35.
- **Numeral** (600, 18px, tabular figures): row numbers in the gutter.

### Named Rules
**The Printed Label Rule.** Anything printed on the card (heads, names, positions, bands, buttons, nav) is House of Cards uppercase. Anything someone reads as prose is system sans in sentence case.

**The Tracking Ladder Rule.** The smaller the label, the wider the tracking: 0.01em for names, 0.06–0.08em for 16–20px labels, 0.12–0.18em for 13–16px heads and bands.

## Layout

The page has one centered column, `min(1360px, 100% - 2 × clamp(16px, 4vw, 48px))`, shared by the site bar, the card and the site footer. The card is the page. It has a head (title plus a ruled definition-list of fields), a body, and a footer separated from the body by 3px double rules.

On wide screens the body is two columns: the lineup sheet (fluid) and a sticky frame (minmax 340px, 38%) that shows the selected person. Sheet rows share a five-column grid with the sticky column heads: a 64px number gutter, name, position, career lead, and a 56px "then" thumbnail, with 20px column gaps. A 1px rule runs down the gutter's edge. Rows are at least 68px tall. Section bands indent their text to line up with the name column (84px).

At 1100px and below, the career column drops out, the gutter narrows to 56px, and the nav collapses behind a ruled Menu button. At 860px and below, the card is one column, the frame is hidden, and each row becomes a disclosure that opens its career underneath (48px gutter, name and position stacked). At 480px and below, the brand reads "LPA" and the card padding is 16px. Interactive targets are at least 44px tall.

## Elevation & Depth

The interior of the card is flat. Depth only appears where a physical object sits on the card: the card on the ground, and photo prints in the frame. Every shadow is soft, drops downward with a negative spread, and is near-black.

### Shadow Vocabulary
- **Card lift** (`box-shadow: 0 30px 60px -30px rgba(0,0,0,.9)`): the card sheet on the ground.
- **Print** (`box-shadow: 0 18px 36px -14px rgba(0,0,0,.85)`): the main portrait print.
- **Snapshot** (`box-shadow: 0 14px 28px -10px rgba(0,0,0,.8)`): the smaller print overlapping it.

### Named Rules
**The Objects-Only Rule.** Shadows belong to paper objects on the card, never to rows, bands, buttons or text. Structure is drawn with rust rules.

## Shapes

All corners are square (0px), on the card, buttons, bands, prints, thumbnails and the menu button. Lines carry the form: 1px rust rules for structure, 20% rules between entries, and 3px double rules where the card divides into head, body and foot. The only curve is the seafoam ring, a loose hand-drawn SVG path (stroke 2.4, round caps) drawn around the row number. Photos are mounted on paper: an 8px paper border on the portrait, a 6px mount with a caption strip on the snapshot, and a 2px paper border on row thumbnails.

## Components

### Buttons
Solid printed blocks.
- **Shape:** square (0px), at least 44px tall.
- **Primary:** rust fill, white House of Cards 700 18px uppercase at 0.08em, 0 22px padding.
- **Big:** 64px tall, 0 40px padding, 26px text. Full width on phone. Used for the card's footer call to action.
- **Hover / Active:** fades to deep rust over 0.2s. Pressing it moves it down 1px.
- **Printed link (secondary action):** paper House of Cards 18px uppercase with a 1px rust underline. Hover turns it rust-text.

### Navigation
- **Desktop:** House of Cards 17px uppercase at 0.06em in muted grey, turning paper on hover. The current page is paper with a 2px rust underline (an inset shadow).
- **Tablet and phone:** a square ruled "Menu" button (1px rule border, paper border when open) opens a stacked list of 20px links separated by soft rules. The current page is shown in rust-text.

### Lineup Row (signature)
The core repeating unit is a full-width button row on the five-column sheet grid.
- **Default:** transparent on stock, a numeral in grey, the name as Title, the position as Label in rust-text, the lead as 14px grey body, and a 44×56 thumbnail with a 2px paper border at 35% grayscale. A row with no photo shows a 28px rule stub.
- **Hover:** raised stock, and the thumbnail regains full color.
- **Selected / open:** 10% rust wash, the numeral turns paper, and the seafoam ring draws itself around it (stroke-dashoffset 150 to 0, 0.5s).
- **Plain (no career):** not interactive, with no hover.

### Section Band
A full-width rust strip with a white House of Cards 700 16px uppercase heading at 0.18em on the left and a count on the right (weight 400). It divides the roster into groups.

### Card Fields
A ruled definition list in the card head: rust-text 14px labels at 0.12em on the left, and paper House of Cards 700 19px values on the right. Each pair sits between 1px rules.

### Detail Frame
A sticky panel beside the sheet. It holds the paper-mounted portrait (4:5) bleeding past the card's right edge, an overlapping "Playing days" snapshot (34% wide, offset bottom-left), the name as Headline, the title in rust-text, credentials as a soft-ruled list, and a printed "Next in the lineup" link. On selection the portrait wipes in from the right (clip-path, 0.6s), the snapshot drops in (0.5s, 0.15s delay), and the text rises 8px (0.45s). All of these use `cubic-bezier(.16, 1, .3, 1)`.

## Do's and Don'ts

### Do:
- **Do** draw structure with rust rules (1px at 42%, 20% between entries, 3px double at major divisions) instead of boxes or shadows.
- **Do** set every printed label in House of Cards uppercase, and prose in system sans.
- **Do** use rust-text (#db8150) for any rust text under display size.
- **Do** reserve seafoam for the selection ring and the 2px focus outline (3px offset).
- **Do** mount photographs as paper prints with a paper border and a soft downward shadow.
- **Do** keep corners square and touch targets at least 44px.
- **Do** keep the LPA shield in the site bar and the rust arch wordmark in the site footer.

### Don't:
- **Don't** set small rust (#ab562b) text on black. It measures 3.8:1.
- **Don't** use seafoam as a fill, a band, a button or decoration.
- **Don't** round corners or put shadows on rows, bands or buttons.
- **Don't** replace House of Cards with another display face, or set body copy in it.
