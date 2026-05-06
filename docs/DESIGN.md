# Design System Specification

## 1. Overview & Creative North Star: "The Kinetic Atelier"

This design system is built upon the concept of **The Kinetic Atelier**. It represents a space where high-energy innovation (the "Spark") meets the disciplined structure of premium editorial design. We are moving away from the "generic SaaS" aesthetic of rounded blue boxes and toward a layout that feels curated, intentional, and authoritative.

The "Spark" is not just a color; it is a behavior. Our North Star dictates that the UI should feel alive through intentional asymmetry, overlapping elements that break the grid, and a high-contrast typography scale that prioritizes readability and impact. We use breathing room (negative space) as a structural element, not just a gap between components.

---

## 2. Colors: Vibrancy & Tonal Sophistication

The palette balances the high-energy `primary_container` (#FF8C00) with a sophisticated, grounding `secondary` slate. 

### The "No-Line" Rule
To achieve a high-end editorial feel, **1px solid borders are strictly prohibited for sectioning.** Boundaries must be defined through background color shifts. For example, a `surface_container_low` section should sit directly against a `surface` background. The change in tone is the divider.

### Surface Hierarchy & Nesting
Treat the UI as a series of physical layers. Use the surface-container tiers to create depth:
- **Base Layer:** `surface` (#f8f9fa)
- **Secondary Sections:** `surface_container_low` (#f3f4f5)
- **Prominent Cards/Modules:** `surface_container_lowest` (#ffffff) to create a "pop" against darker backgrounds.

### The "Glass & Gradient" Rule
Standard flat colors can feel sterile. For hero sections or primary CTAs, utilize a **Signature Gradient** transitioning from `primary` (#904d00) to `primary_container` (#ff8c00). For floating navigation or overlays, apply **Glassmorphism**: use `surface_container_highest` at 70% opacity with a 20px backdrop-blur to allow the "Spark" energy to bleed through the interface.

---

## 3. Typography: The Editorial Voice

We utilize a dual-font strategy to balance character with utility.

*   **Display & Headlines (Plus Jakarta Sans):** This is our "Editorial" voice. Use `display-lg` and `headline-lg` with tight letter-spacing to create a bold, modern brand presence. The geometric nature of Plus Jakarta Sans mirrors the precision of the Aria logo.
*   **Body & Labels (Inter):** Inter provides a neutral, highly legible foundation for functional information. Use `body-md` for standard reading and `label-md` for metadata.

**Hierarchy Tip:** Always skip a size when creating contrast (e.g., pair a `headline-sm` with a `body-sm`) to ensure the hierarchy is unmistakable and dramatic.

---

## 4. Elevation & Depth: Tonal Layering

We convey importance through "stacking" rather than artificial drop shadows.

*   **The Layering Principle:** Instead of adding a shadow to a card, place a `surface_container_lowest` (#ffffff) card on top of a `surface_container` (#edeeef) background. The subtle 2-3% difference in luminance creates a sophisticated, natural lift.
*   **Ambient Shadows:** When a floating element (like a FAB or Modal) is required, use "Ambient Shadows." Set blur values to 32px or higher with an opacity of 4%-8%. The shadow color should be a tinted version of `on_surface` (#191c1d) to ensure it feels like a natural lighting effect.
*   **The "Ghost Border" Fallback:** If a border is required for accessibility, use the `outline_variant` (#ddc1ae) at 15% opacity. Never use 100% opaque borders.
*   **Glassmorphism:** Use semi-transparent layers for elements that hover over energetic backgrounds, creating a "frosted glass" effect that keeps the layout feeling integrated.

---

## 5. Components

### Buttons
- **Primary:** Gradient-filled (`primary` to `primary_container`), `full` roundedness (9999px). High energy, high impact.
- **Secondary:** `surface_container_highest` background with `on_surface` text. No border.
- **Tertiary:** Text-only using `tertiary` (#006b5c) for a fresh accent "spark."

### Input Fields
- Use `surface_container_low` as the field background. 
- **State Change:** On focus, transition the background to `surface_container_lowest` and add a 2px "Ghost Border" using `primary_container`.

### Cards & Lists
- **Rule:** Forbid the use of divider lines. 
- Use `8` (2rem) or `10` (2.5rem) spacing from the Spacing Scale to separate list items. 
- Group related content within a `surface_container` module to create a "containerless" grouped feel.

### The "Spark" Progress Indicator (Custom Component)
- A bespoke linear progress bar using a `tertiary` (#006b5c) base with a trailing "spark" of `primary_container` (#ff8c00) to indicate motion and energy.

---

## 6. Do's and Don'ts

### Do
- **Do** use intentional asymmetry. Align a headline to the left but "offset" the body text to the right by `8` (2rem) to create visual tension.
- **Do** use the `tertiary_container` (#00bfa5) sparingly as a "fresh" highlight for success states or notifications.
- **Do** lean into the `xl` (1.5rem) roundedness for large containers to soften the "Slate" professional tones.

### Don't
- **Don't** use 1px dividers or borders to separate content. Use space or tonal shifts.
- **Don't** use pure black for text. Always use `on_surface` (#191c1d) to maintain the sophisticated slate palette.
- **Don't** clutter the "Spark." If using the vibrant orange, ensure it is surrounded by ample `background` (#f8f9fa) so it retains its visual power.
- **Don't** use standard "drop shadows." If it doesn't look like natural light, it doesn't belong in this system.