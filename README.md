# Gemini Library with Supabase

This app stores uploaded library items in Supabase:

- file binaries go to Supabase Storage
- embeddings and metadata go to Postgres with `pgvector`
- chat history stays client-side only

## Setup

1. Create a Supabase project.
2. Run the SQL in `supabase/migrations/20260317_uploaded_items.sql`.
3. Copy `.env.example` to `.env` and set:
   - `GOOGLE_GENERATIVE_AI_API_KEY`
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `SUPABASE_STORAGE_BUCKET` (default: `uploads`)
4. Start the app with `npm run dev`.

## Notes

- The SQL migration creates a public storage bucket named `uploads`. If you use a different bucket name, update the env var and the SQL accordingly.
- Retrieval uses a Postgres RPC function, `match_uploaded_items`, backed by `pgvector`.
- Existing local `data/` contents are ignored.
