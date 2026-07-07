# AI Assisted Seller-Side Inventory Automation Platform MVP

A dependency-light web application for sellers who need to capture inventory, price assets, create sale transactions, collect payment, track shipment status, and export operating reports from one mobile-friendly interface.

The MVP combines manual inventory operations with optional AI assistance from OpenAI, Stripe-powered buyer checkout, and SMTP email automation.

## Features

- Mobile-friendly asset intake with photo capture or upload.
- Asset records for date/time, title, category, description, storage location, quantity, unit price, and stock status.
- AI-assisted photo analysis that suggests asset title, category, description, condition notes, and price.
- AI web price estimation that stores estimate confidence, rationale, and comparable source links.
- Browser speech-to-text for title, description, and location fields.
- Server-side audio transcription for recorded or uploaded audio notes.
- Searchable and filterable inventory list with asset photos, stock status, quantity, price, location, and edit actions.
- Multi-item sale transaction creation with quantity validation and automatic inventory deduction.
- Stripe Checkout payment links with invoice generation.
- SMTP emails for payment links, payment confirmations, invoice/receipt links, and shipment notices.
- Stripe webhook handling for completed checkout, paid invoices, expired sessions, and failed payments.
- Payment amount verification before recognizing revenue.
- Automatic restocking when payment is cancelled, failed, or expired.
- Partial and full shipment tracking per transaction line item.
- Dashboard metrics for recognized revenue, pending revenue, available assets, total transactions, and assets sold.
- Revenue-by-asset reporting.
- CSV exports for inventory and transaction history.

## Tech Stack

- Node.js built-in HTTP server
- Vanilla HTML, CSS, and JavaScript
- Local JSON file persistence
- OpenAI Responses API and audio transcription API
- Stripe Checkout, invoices, receipts, and webhooks
- Nodemailer SMTP email delivery

## Project Structure

```text
.
├── public/
│   ├── index.html
│   ├── app.js
│   ├── styles.css
│   ├── checkout-complete.html
│   └── checkout-cancelled.html
├── data/
│   └── store.json
├── server.js
├── package.json
├── package-lock.json
└── .env.example
```

`data/store.json` is created and updated locally at runtime. It is ignored by Git because it can contain private inventory, buyer, transaction, and embedded photo data.

## Requirements

- Node.js 20+ recommended
- npm
- Optional: OpenAI API key for AI suggestions and transcription
- Optional: Stripe account for payment links and webhook verification
- Optional: SMTP account for buyer emails

## Setup

Install dependencies:

```powershell
npm install
```

Copy the example environment file and add your own credentials:

```powershell
Copy-Item .env.example .env
```

Start the application:

```powershell
npm start
```

Open:

```text
http://localhost:3000
```

## Environment Variables

```text
OPENAI_API_KEY=
OPENAI_VISION_MODEL=gpt-4.1-mini
OPENAI_PRICE_MODEL=gpt-4.1-mini
OPENAI_TRANSCRIBE_MODEL=gpt-4o-transcribe
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
SMTP_HOST=
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=
SMTP_PASS=
SMTP_FROM=
APP_BASE_URL=http://localhost:3000
PORT=3000
```

Core inventory and transaction tracking works without OpenAI, Stripe, or SMTP. Those integrations are enabled only when the related environment variables are configured.

## API Overview

- `GET /api/state` returns inventory, transactions, and computed reports.
- `POST /api/items` creates an asset.
- `PUT /api/items/:id` updates an asset.
- `POST /api/transactions` creates a sale transaction and deducts inventory.
- `PUT /api/transactions/:id` updates transaction details or shipment progress.
- `POST /api/transactions/:id/email-payment` resends a Stripe payment email.
- `POST /api/transactions/:id/verify-payment` verifies a Stripe Checkout session.
- `POST /api/transactions/:id/payment-cancelled` marks checkout cancellation and restocks inventory.
- `POST /api/stripe/webhook` processes Stripe webhook events.
- `POST /api/analyze-photo` generates OpenAI-assisted asset suggestions.
- `POST /api/transcribe-audio` transcribes audio notes.
- `GET /api/reports/inventory.csv` exports inventory records.
- `GET /api/reports/transactions.csv` exports transaction records.

## MVP Notes

This is a local/single-seller MVP. It does not currently include authentication, role-based access control, a hosted database, or automated tests. Production deployment should add those controls before handling real customer data at scale.
