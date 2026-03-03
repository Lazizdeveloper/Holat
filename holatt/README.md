# HOLAT Frontend

Frontend app for HOLAT platform (React + Vite).

## Setup

1. Install dependencies:
   - `npm install`
2. Run dev server:
   - `npm run dev`
   - User panel (`http://localhost:5173/`): `npm run dev:user`
   - Government panel (`http://localhost:5174/`): `npm run dev:gov`
3. Build:
   - `npm run build`

## Backend API

- Default API base: `http://localhost:4000/api`
- Override with env:
  - `.env` file:
    - `VITE_API_BASE_URL=http://localhost:4000/api`

## Portal URLs

- Combined portal (existing): `/`
- Citizen portal: `/citizen.html`
- Government portal: `/gov.html`
