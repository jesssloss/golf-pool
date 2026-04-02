# Design System — Masters Pool

## Color Palette

| Token | Hex | Usage |
|-------|-----|-------|
| `augusta` | `#006747` | Primary brand, headings, buttons, links |
| `augusta-dark` | `#004D35` | Hover states, accents |
| `masters-gold` | `#FEDD00` | Highlights, winner emphasis, timer warnings |
| `cream` | `#FFF8E7` | Page background |
| `cream-dark` | `#F5EDD6` | Card backgrounds, alternating rows |
| `score-red` | `#C41E3A` | Over par, errors, destructive actions |
| `score-green` | `#006747` | Under par, success, paid status |
| `muted-gray` | `#6B7280` | Secondary text, labels, metadata |

## Typography

- **Headings:** Playfair Display (serif). Used for pool names, page titles, scores, rank numbers.
- **Body:** Inter (sans-serif). Used for labels, buttons, descriptions, UI text.
- **Monospace:** System mono. Used for scores, timers, invite codes.

### Heading Scale

| Context | Class |
|---------|-------|
| Homepage title | `text-5xl md:text-6xl font-serif font-bold text-augusta` |
| Page title | `text-3xl font-serif font-bold text-augusta` |
| Section title | `text-2xl font-serif font-bold text-augusta` |
| Card heading | `text-lg font-serif font-semibold` |
| Table header | `font-serif font-bold` (inherits table size) |

## Buttons

### Primary
```
bg-augusta text-white py-3 px-6 rounded-sm font-semibold hover:bg-augusta-dark transition-colors disabled:opacity-50
```
Full-width variant: add `w-full`.

### Secondary (outlined)
```
border-2 border-augusta text-augusta rounded-sm font-semibold hover:bg-augusta hover:text-white transition-colors
```

### Ghost
```
text-sm text-augusta hover:text-augusta-dark font-medium
```

### Destructive
```
text-xs text-score-red hover:text-red-700
```

### Touch Targets
All interactive elements must have `min-h-[44px]` for mobile accessibility.

## Cards

Standard card pattern:
```
bg-white rounded-sm p-4 border border-muted-gray/20
```

Highlighted card (user's own, important):
```
bg-white rounded-sm p-4 border border-augusta/30
```

Winner card:
```
bg-masters-gold/10 border-masters-gold/40
```

## Spacing

- Between major sections: `mb-6`
- Between related elements: `mb-4`
- Between header and content: `mb-2`
- Internal card padding: `p-4` (desktop), `p-3` (compact/mobile)

## Border Radius

Always `rounded-sm`. This is intentional: traditional, clean, not bubbly. The only exception is ceremony components (PatronBadge, GreenJacketCard, TeamCard) which use `rounded-lg`.

## Tables

- Header: `bg-augusta text-cream font-serif font-bold`
- Alternating rows: `bg-white` / `bg-cream`
- Borders: `border-b border-muted-gray/20`
- Score colors: under par = `text-score-green`, over par = `text-score-red`, even = `text-gray-900`

## Loading States

Use `loading-pulse` class on the Masters-copy loading text. Never use a generic spinner.

## Error States

Inline error messages: `bg-red-50 text-score-red p-3 rounded-sm text-sm`. Never use `alert()` or `confirm()`.

## Empty States

Use Masters-flavored copy from `lib/constants/copy.ts`. Always italic serif.

## Responsive

- Mobile breakpoint: `sm:` (640px)
- Data tables become card layouts on mobile (`sm:hidden` / `hidden sm:block`)
- Grid inputs collapse: `grid-cols-2` on desktop, stack on mobile

## Voice

Masters tournament ceremony tone. "A tradition unlike any other." not "Welcome to the app!"
Copy constants live in `src/lib/constants/copy.ts`.
