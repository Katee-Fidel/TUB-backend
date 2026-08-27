# Tamasha Hub API

Express API for authentication, events, tickets, wallet top-ups, M-Pesa callbacks, and the community feed.

## Local setup

1. Copy `.env.example` to `.env` and fill in every value.
2. Install dependencies with `npm ci`.
3. Start the API with `node server.js`.
4. Check `http://localhost:5000/api/health`.

## Render deployment

Create a new **Web Service** from this GitHub repository. Render detects `render.yaml`; otherwise use build command `npm ci`, start command `node server.js`, and health check `/api/health`.

Set these environment variables in Render:

| Variable | Required value |
|---|---|
| `NODE_ENV` | `production` |
| `MONGODB_URI` | MongoDB Atlas connection string |
| `CLIENT_URL` | Exact Vercel frontend URL, for example `https://tamasha-hub.vercel.app` |
| `JWT_ACCESS_SECRET` | Random secret |
| `JWT_REFRESH_SECRET` | Different random secret |
| `JWT_TICKET_SECRET` | Third random secret |
| `DARAJA_ENV` | `sandbox` until production approval |
| `DARAJA_CONSUMER_KEY`, `DARAJA_CONSUMER_SECRET` | Daraja app credentials |
| `DARAJA_SHORTCODE`, `DARAJA_PASSKEY` | Daraja sandbox values |
| `DARAJA_CALLBACK_URL` | `https://<render-service>.onrender.com/api/mpesa/callback` |
| `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET` | Cloudinary credentials |

After the first deploy, copy the Render service URL into `DARAJA_CALLBACK_URL`, save it, and deploy again. Never commit `.env`.

## Deployment check

Open `https://<render-service>.onrender.com/api/health`; it should return a healthy JSON response. Then set the frontend's `NEXT_PUBLIC_API_URL` to the same Render base URL and redeploy the frontend.
