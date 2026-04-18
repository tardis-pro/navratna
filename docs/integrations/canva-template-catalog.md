# Canva Template Catalog (PM-22)

Seed reference for Canva templates used by the PixelAgent persona (PM-21).
Template IDs below are **placeholders** — replace with real IDs from your connected Canva account.

| Template Name       | Category          | Canva Template ID (placeholder)  | Size          | Use Case                                         |
|---------------------|-------------------|----------------------------------|---------------|--------------------------------------------------|
| Landing Page Hero   | `landing_page`    | `REPLACE_AFTER_CANVA_CONNECT`    | 1440 × 900 px | SaaS product launch, campaign landing pages      |
| LinkedIn Post       | `social_media`    | `REPLACE_AFTER_CANVA_CONNECT`    | 1200 × 627 px | Thought leadership, product announcements        |
| Twitter / X Post    | `social_media`    | `REPLACE_AFTER_CANVA_CONNECT`    | 1600 × 900 px | Quick updates, feature teasers                   |
| Pitch Deck          | `presentation`    | `REPLACE_AFTER_CANVA_CONNECT`    | 1920 × 1080 px| Investor decks, partner presentations            |
| UI Wireframe        | `whiteboard`      | `REPLACE_AFTER_CANVA_CONNECT`    | 1600 × 1200 px| UX mockups, feature planning, sprint reviews     |

---

## How to populate real template IDs

1. Connect a Canva account via the OAuth flow (see `docs/integrations/canva-setup.md`)
2. Call `GET /api/v1/canva/tools/list-templates?category=<category>` to browse available templates
3. Copy the `id` field from each template response
4. Replace the `REPLACE_AFTER_CANVA_CONNECT` placeholders in this file

---

## Template categories supported by Canva Connect API

| API category value     | Description                |
|------------------------|----------------------------|
| `landing_page`         | Web landing pages          |
| `social_media`         | All social platforms       |
| `presentation`         | Slide decks                |
| `whiteboard`           | Diagrams and wireframes    |
| `marketing`            | Flyers, brochures, banners |
| `video`                | Reels, stories, MP4 videos |
| `document`             | Reports, proposals         |

---

## Notes

- Template IDs are account-scoped — IDs from one Canva account are not portable to another
- Canva's public template library uses different IDs than user-owned templates
- The PixelAgent persona (PM-21) will resolve template IDs from this catalog at generation time
