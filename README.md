# Olkinyei Expeditions

A cinematic six-page luxury safari experience for Olkinyei Expeditions. The application combines editorial art direction, GSAP storytelling, Framer Motion transitions, a lightweight React Three Fiber atmosphere, an end-to-end booking flow, and an authenticated Supabase-ready operations studio.

## Experience

- Six public routes: Home, Our Story, Safari Experiences, Destinations, Field Notes, and Contact / Booking
- Full-bleed migration film, image parallax, SplitText reveals, ScrollTrigger sequences, SVG morphing, magnetic controls, page transitions, and reduced-motion fallbacks
- Eight detailed safari journeys with galleries, route maps, seasonality, pricing, inclusions, exclusions, and direct booking
- Interactive Kenya and Tanzania destination map
- Filterable masonry gallery, drone film, guest journals, and fullscreen lightbox
- Three-step booking flow with validation, availability guidance, generated references, confirmation output, and booking lookup
- Private operations studio for bookings, pricing, content, media, articles, guides, vehicles, availability, invoices, and analytics
- Supabase persistence, Realtime booking events, authenticated staff access, Storage policies, and email confirmation Edge Function
- Responsive layouts, keyboard focus states, semantic landmarks, reduced motion, OpenGraph, Twitter Cards, JSON-LD, sitemap, robots, and installable manifest

## Local Development

1. Install dependencies with `npm install`.
2. Copy `.env.example` to `.env.local`.
3. Add your Supabase project URL and publishable key.
4. Start the Vite development server with `npm run dev`.

Supabase is required for CMS-managed Pages and Safari Packages. Those records are never seeded or edited only in the browser: when cloud configuration is absent, the CMS shows an actionable configuration error instead of creating a competing local content store.

## Supabase Setup

1. Create a Supabase project.
2. Run the migrations in the order listed in `SCHEMA_AUDIT.md`: schema, auth sync, role canonicalization, CMS settings, Pages, Packages/gallery, Blog, then Bookings.
3. Create the first staff user in Authentication.
4. Add a matching `public.profiles` row with the user's auth UUID and canonical role (`root` for the protected first administrator).
5. Confirm Realtime includes `pages`, `packages`, `blog_posts`, and `bookings`.
6. Deploy `supabase/functions/send-booking-confirmation`.
7. Configure `RESEND_API_KEY`, `BOOKING_TEAM_EMAIL`, and `BOOKING_FROM_EMAIL` as Edge Function secrets.
8. Add the Vite public credentials from `.env.example` to the Vercel project.

The browser receives only Supabase's publishable key. Row-level security limits sensitive reads and updates to authenticated staff. Email provider credentials remain inside the Edge Function.

## Deployment

Deploy the repository to Vercel as a Vite application. `vercel.json` rewrites all six client routes to the application shell and sets baseline security headers. Replace `https://olkinyei.com` in `index.html`, `public/robots.txt`, and `public/sitemap.xml` if the production domain differs.

## Media

The editorial photography and films are delivered from Pexels CDN with explicit image transforms, lazy loading below the fold, deferred gallery video loading, and posters. For production ownership, migrate approved files into the configured `expedition-media` Supabase Storage bucket and update the CMS records.

## Quality Checks

- Production compile: `npm run build`
- Verify keyboard navigation and focus states on all six routes
- Test reduced motion with the operating system preference enabled
- Submit a booking in both local and Supabase modes
- Verify customer and team emails from the deployed Edge Function
- Test staff authentication and booking status updates under RLS