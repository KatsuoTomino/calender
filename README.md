<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/drive/1p2MMylgt6BmlUJZglHFJcGPe3gK7vk8H

## Run Locally

**Prerequisites:**  Node.js


1. Install dependencies:
   `npm install`
2. Set the `GEMINI_API_KEY` in [.env.local](.env.local) to your Gemini API key
   and configure Supabase/R2 environment variables:
   - Client-safe Supabase values: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`
   - Server-only R2 values: `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`,
     `R2_SECRET_ACCESS_KEY`, `R2_BUCKET_NAME`, optional `R2_ENDPOINT`
   
   Do not use `VITE_` for R2 secrets. Vite exposes `VITE_*` values to the
   browser bundle.
3. Run the app:
   `npm run dev`
