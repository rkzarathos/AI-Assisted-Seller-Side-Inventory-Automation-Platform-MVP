import { createServer } from "node:http";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Stripe from "stripe";
import nodemailer from "nodemailer";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const publicDir = path.join(__dirname, "public");
const dataDir = path.join(__dirname, "data");
const storePath = path.join(dataDir, "store.json");
const envPath = path.join(__dirname, ".env");

async function loadEnvFile() {
  try {
    const raw = await readFile(envPath, "utf8");
    for (const line of raw.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) {
        continue;
      }

      const separatorIndex = trimmed.indexOf("=");
      if (separatorIndex === -1) {
        continue;
      }

      const key = trimmed.slice(0, separatorIndex).trim();
      if (!key || process.env[key]) {
        continue;
      }

      let value = trimmed.slice(separatorIndex + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }

      process.env[key] = value;
    }
  } catch (error) {
    if (error?.code !== "ENOENT") {
      throw error;
    }
  }
}

await loadEnvFile();

const port = Number(process.env.PORT || 3000);
const stripeSecretKey = process.env.STRIPE_SECRET_KEY || "";
const stripeWebhookSecret = process.env.STRIPE_WEBHOOK_SECRET || "";
const appBaseUrl = process.env.APP_BASE_URL || "";
const smtpHost = process.env.SMTP_HOST || "";
const smtpPort = Number(process.env.SMTP_PORT || 587);
const smtpSecure = String(process.env.SMTP_SECURE || "").toLowerCase() === "true";
const smtpUser = process.env.SMTP_USER || "";
const smtpPass = process.env.SMTP_PASS || "";
const smtpFrom = process.env.SMTP_FROM || "";

// Stripe is initialized only on the server so secret keys never reach the frontend.
const stripe = stripeSecretKey ? new Stripe(stripeSecretKey) : null;
const mailTransport =
  smtpHost && smtpFrom
    ? nodemailer.createTransport({
        host: smtpHost,
        port: smtpPort,
        secure: smtpSecure,
        auth: smtpUser || smtpPass ? { user: smtpUser, pass: smtpPass } : undefined
      })
    : null;

const emptyStore = {
  items: [],
  transactions: [],
  meta: {
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  }
};

async function ensureStore() {
  await mkdir(dataDir, { recursive: true });
  try {
    await readFile(storePath, "utf8");
  } catch {
    await writeStore(emptyStore);
  }
}

async function readStore() {
  await ensureStore();
  const raw = await readFile(storePath, "utf8");
  const parsed = JSON.parse(raw);
  parsed.items = Array.isArray(parsed.items) ? parsed.items : [];
  parsed.transactions = Array.isArray(parsed.transactions)
    ? parsed.transactions.map((transaction) => normalizeTransaction(transaction))
    : [];
  parsed.meta = parsed.meta || {};
  syncAllItemStatuses(parsed);
  return parsed;
}

async function writeStore(store) {
  store.meta = store.meta || {};
  store.meta.updatedAt = new Date().toISOString();
  if (!store.meta.createdAt) {
    store.meta.createdAt = store.meta.updatedAt;
  }
  await writeFile(storePath, JSON.stringify(store, null, 2), "utf8");
}

function sendJson(res, status, payload) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store"
  });
  res.end(JSON.stringify(payload));
}

function sendText(res, status, payload, contentType = "text/plain; charset=utf-8") {
  res.writeHead(status, { "Content-Type": contentType });
  res.end(payload);
}

function generateId(prefix) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function stockStatusForQuantity(quantity) {
  return Number(quantity) > 0 ? "Item Available / Unsold" : "Out of Stock";
}

function syncItemStatus(store, itemId) {
  const item = findItem(store, itemId);
  if (!item) {
    return;
  }
  item.stockStatus = stockStatusForQuantity(item.quantity);
}

function syncAllItemStatuses(store) {
  for (const item of store.items) {
    item.stockStatus = stockStatusForQuantity(item.quantity);
  }
}

function normalizeItem(input, existing) {
  const estimatedUnitPrice = Number(
    input.priceEstimate?.estimatedUnitPrice ?? existing?.priceEstimate?.estimatedUnitPrice
  );
  const quantity = Number(input.quantity || 0);
  const price = Number(
    Number.isFinite(estimatedUnitPrice)
      ? estimatedUnitPrice
      : input.price ?? existing?.price ?? 0
  );
  const now = new Date().toISOString();
  return {
    id: existing?.id || generateId("item"),
    createdAt: existing?.createdAt || now,
    updatedAt: now,
    capturedAt: input.capturedAt || existing?.capturedAt || now,
    photoDataUrl: input.photoDataUrl || existing?.photoDataUrl || "",
    title: String(input.title || "").trim(),
    category: String(input.category || "").trim(),
    description: String(input.description || "").trim(),
    location: String(input.location || "").trim(),
    quantity,
    price,
    priceEstimate: input.priceEstimate || existing?.priceEstimate || null,
    stockStatus: stockStatusForQuantity(quantity)
  };
}

function expectedTransactionAmount(transaction) {
  if (Array.isArray(transaction.lineItems) && transaction.lineItems.length) {
    return transaction.lineItems.reduce(
      (sum, item) => sum + Number(item.quantity || 0) * Number(item.unitPrice || 0),
      0
    );
  }
  return Number(transaction.quantity || 0) * Number(transaction.unitPrice || 0);
}

function expectedTransactionAmountCents(transaction) {
  return Math.round(expectedTransactionAmount(transaction) * 100);
}

function normalizeTransaction(input, existing = {}) {
  const now = new Date().toISOString();
  const rawLineItems = Array.isArray(input.lineItems)
    ? input.lineItems
    : Array.isArray(existing.lineItems)
      ? existing.lineItems
      : [];
  const lineItems = rawLineItems.length
    ? rawLineItems.map((item) => ({
        itemId: String(item.itemId || "").trim(),
        itemTitleSnapshot: String(item.itemTitleSnapshot || "").trim(),
        quantity: Number(item.quantity || 0),
        unitPrice: Number(item.unitPrice || 0),
        shippedQuantity: Number(item.shippedQuantity || 0)
      }))
    : [
        {
          itemId: input.itemId || existing.itemId || "",
          itemTitleSnapshot: String(input.itemTitleSnapshot ?? existing.itemTitleSnapshot ?? "").trim(),
          quantity: Number(input.quantity ?? existing.quantity ?? 0),
          unitPrice: Number(input.unitPrice ?? existing.unitPrice ?? 0),
          shippedQuantity: Number(input.shippedQuantity ?? existing.shippedQuantity ?? 0)
        }
      ].filter((item) => item.itemId);
  const quantity = lineItems.reduce((sum, item) => sum + Number(item.quantity || 0), 0);
  const unitPrice = lineItems.length === 1 ? Number(lineItems[0].unitPrice || 0) : 0;
  const computedExpectedAmount = expectedTransactionAmount({ lineItems, quantity, unitPrice });
  const expectedAmount = lineItems.length
    ? computedExpectedAmount
    : Number(input.expectedAmount ?? existing.expectedAmount ?? computedExpectedAmount);
  const itemTitleSnapshot = String(
    input.itemTitleSnapshot ??
      existing.itemTitleSnapshot ??
      lineItems.map((item) => item.itemTitleSnapshot).join(", ")
  ).trim();
  const itemId = input.itemId || existing.itemId || lineItems[0]?.itemId || "";

  return {
    id: input.id || existing.id || generateId("txn"),
    itemId,
    itemTitleSnapshot,
    lineItems,
    quantity,
    unitPrice,
    status: input.status || existing.status || "sold_awaiting_payment",
    buyer: String(input.buyer ?? existing.buyer ?? "").trim(),
    buyerEmail: String(input.buyerEmail ?? existing.buyerEmail ?? "").trim(),
    notes: String(input.notes ?? existing.notes ?? "").trim(),
    createdAt: input.createdAt || existing.createdAt || now,
    updatedAt: input.updatedAt || existing.updatedAt || now,
    paymentStatus: input.paymentStatus || existing.paymentStatus || "payment_pending",
    paymentProvider: input.paymentProvider || existing.paymentProvider || "stripe",
    expectedAmount,
    amountReceived: Number(input.amountReceived ?? existing.amountReceived ?? 0),
    currency: String(input.currency || existing.currency || "usd").toLowerCase(),
    stripeCheckoutSessionId:
      String(input.stripeCheckoutSessionId ?? existing.stripeCheckoutSessionId ?? "").trim(),
    stripePaymentIntentId:
      String(input.stripePaymentIntentId ?? existing.stripePaymentIntentId ?? "").trim(),
    stripeInvoiceId: String(input.stripeInvoiceId ?? existing.stripeInvoiceId ?? "").trim(),
    stripeInvoiceNumber: String(input.stripeInvoiceNumber ?? existing.stripeInvoiceNumber ?? "").trim(),
    stripeInvoicePdfUrl:
      String(input.stripeInvoicePdfUrl ?? existing.stripeInvoicePdfUrl ?? "").trim(),
    stripeHostedInvoiceUrl:
      String(input.stripeHostedInvoiceUrl ?? existing.stripeHostedInvoiceUrl ?? "").trim(),
    stripeReceiptUrl: String(input.stripeReceiptUrl ?? existing.stripeReceiptUrl ?? "").trim(),
    paymentUrl: String(input.paymentUrl ?? existing.paymentUrl ?? "").trim(),
    paidAt: String(input.paidAt ?? existing.paidAt ?? "").trim(),
    paymentVerifiedAt: String(input.paymentVerifiedAt ?? existing.paymentVerifiedAt ?? "").trim(),
    paymentError: String(input.paymentError ?? existing.paymentError ?? "").trim(),
    inventoryRestoredAt: String(input.inventoryRestoredAt ?? existing.inventoryRestoredAt ?? "").trim(),
    paymentEmailSentAt: String(input.paymentEmailSentAt ?? existing.paymentEmailSentAt ?? "").trim(),
    invoiceEmailSentAt: String(input.invoiceEmailSentAt ?? existing.invoiceEmailSentAt ?? "").trim(),
    shippedEmailSentAt: String(input.shippedEmailSentAt ?? existing.shippedEmailSentAt ?? "").trim()
  };
}

function smtpConfigured() {
  return Boolean(mailTransport && smtpFrom);
}

function findItem(store, itemId) {
  return store.items.find((entry) => entry.id === itemId);
}

function applyItemQuantity(item, quantity) {
  item.quantity = Number(quantity || 0);
  item.updatedAt = new Date().toISOString();
}

function restockTransactionItem(store, transaction) {
  if (transaction.inventoryRestoredAt) {
    return;
  }

  const lineItems = Array.isArray(transaction.lineItems) ? transaction.lineItems : [];
  if (lineItems.length) {
    for (const lineItem of lineItems) {
      const item = findItem(store, lineItem.itemId);
      if (!item) {
        continue;
      }
      applyItemQuantity(item, Number(item.quantity || 0) + Number(lineItem.quantity || 0));
      syncItemStatus(store, item.id);
    }
    transaction.inventoryRestoredAt = new Date().toISOString();
    return;
  }

  const item = findItem(store, transaction.itemId);
  if (!item) {
    transaction.inventoryRestoredAt = new Date().toISOString();
    return;
  }

  applyItemQuantity(item, Number(item.quantity || 0) + Number(transaction.quantity || 0));
  syncItemStatus(store, item.id);
  transaction.inventoryRestoredAt = new Date().toISOString();
}

function allLineItemsShipped(transaction) {
  const lineItems = Array.isArray(transaction.lineItems) ? transaction.lineItems : [];
  return lineItems.length > 0 && lineItems.every((item) => Number(item.shippedQuantity || 0) >= Number(item.quantity || 0));
}

async function sendPaymentLinkEmail({ transaction, paymentUrl }) {
  if (!smtpConfigured()) {
    throw new Error(
      "SMTP is not configured. Set SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, and SMTP_FROM."
    );
  }

  await mailTransport.sendMail({
    from: smtpFrom,
    to: transaction.buyerEmail,
    subject: `Payment link for ${transaction.itemTitleSnapshot || "your purchase"}`,
    text: [
      `Hello ${transaction.buyer || "there"},`,
      "",
      `Please complete payment for ${transaction.itemTitleSnapshot || "your purchase"} using this secure Stripe link:`,
      paymentUrl,
      "",
      `Amount due: ${Number(transaction.expectedAmount || 0).toFixed(2)} USD`
    ].join("\n"),
    html: `
      <p>Hello ${transaction.buyer ? String(transaction.buyer) : "there"},</p>
      <p>Please complete payment for <strong>${String(transaction.itemTitleSnapshot || "your purchase")}</strong> using this secure Stripe link:</p>
      <p><a href="${paymentUrl}">${paymentUrl}</a></p>
      <p>Amount due: <strong>${Number(transaction.expectedAmount || 0).toFixed(2)} USD</strong></p>
    `
  });
}

async function sendInvoiceEmail({ transaction }) {
  if (!smtpConfigured()) {
    throw new Error(
      "SMTP is not configured. Set SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, and SMTP_FROM."
    );
  }

  const invoiceLinks = [
    transaction.stripeInvoicePdfUrl ? `Invoice PDF: ${transaction.stripeInvoicePdfUrl}` : "",
    transaction.stripeHostedInvoiceUrl
      ? `Hosted Invoice: ${transaction.stripeHostedInvoiceUrl}`
      : "",
    transaction.stripeReceiptUrl ? `Receipt: ${transaction.stripeReceiptUrl}` : ""
  ].filter(Boolean);

  await mailTransport.sendMail({
    from: smtpFrom,
    to: transaction.buyerEmail,
    subject: `Payment received for ${transaction.itemTitleSnapshot || "your purchase"}`,
    text: [
      `Hello ${transaction.buyer || "there"},`,
      "",
      `We received your payment for ${transaction.itemTitleSnapshot || "your purchase"}.`,
      "",
      ...invoiceLinks,
      "",
      `Amount paid: ${Number(transaction.amountReceived || 0).toFixed(2)} USD`
    ].join("\n"),
    html: `
      <p>Hello ${transaction.buyer ? String(transaction.buyer) : "there"},</p>
      <p>We received your payment for <strong>${String(transaction.itemTitleSnapshot || "your purchase")}</strong>.</p>
      <p>Amount paid: <strong>${Number(transaction.amountReceived || 0).toFixed(2)} USD</strong></p>
      <ul>
        ${
          transaction.stripeInvoicePdfUrl
            ? `<li><a href="${transaction.stripeInvoicePdfUrl}">Download invoice PDF</a></li>`
            : ""
        }
        ${
          transaction.stripeHostedInvoiceUrl
            ? `<li><a href="${transaction.stripeHostedInvoiceUrl}">View hosted invoice</a></li>`
            : ""
        }
        ${
          transaction.stripeReceiptUrl
            ? `<li><a href="${transaction.stripeReceiptUrl}">View Stripe receipt</a></li>`
            : ""
        }
      </ul>
    `
  });
}

async function sendShippedEmail({ transaction, shippedItems = [] }) {
  if (!smtpConfigured()) {
    throw new Error(
      "SMTP is not configured. Set SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, and SMTP_FROM."
    );
  }

  await mailTransport.sendMail({
    from: smtpFrom,
    to: transaction.buyerEmail,
    subject: `Your item has shipped: ${transaction.itemTitleSnapshot || "your purchase"}`,
    text: [
      `Hello ${transaction.buyer || "there"},`,
      "",
      `The following item(s) have been shipped from your order:`,
      ...shippedItems.map(
        (item) => `- ${item.itemTitleSnapshot}: ${item.quantity} shipped`
      ),
      "",
      transaction.notes ? `Notes: ${transaction.notes}` : "",
      "",
      "Thank you for your purchase."
    ]
      .filter(Boolean)
      .join("\n"),
    html: `
      <p>Hello ${transaction.buyer ? String(transaction.buyer) : "there"},</p>
      <p>The following item(s) have been shipped from your order:</p>
      <ul>
        ${shippedItems
          .map(
            (item) =>
              `<li><strong>${String(item.itemTitleSnapshot)}</strong>: ${Number(item.quantity || 0)} shipped</li>`
          )
          .join("")}
      </ul>
      ${transaction.notes ? `<p>Notes: ${String(transaction.notes)}</p>` : ""}
      <p>Thank you for your purchase.</p>
    `
  });
}

async function createStripeCheckoutSession(transaction) {
  const checkoutLineItems =
    Array.isArray(transaction.lineItems) && transaction.lineItems.length
      ? transaction.lineItems
      : [
          {
            itemTitleSnapshot: transaction.itemTitleSnapshot,
            quantity: transaction.quantity,
            unitPrice: transaction.unitPrice
          }
        ];
  return stripe.checkout.sessions.create({
    mode: "payment",
    customer_email: transaction.buyerEmail,
    customer_creation: "always",
    success_url: `${appBaseUrl}/checkout-complete.html`,
    cancel_url: `${appBaseUrl}/checkout-cancelled.html`,
    metadata: {
      transactionId: transaction.id
    },
    invoice_creation: {
      enabled: true,
      invoice_data: {
        description: `Invoice for ${transaction.itemTitleSnapshot || "Inventory item"}`,
        metadata: {
          transactionId: transaction.id
        }
      }
    },
    payment_intent_data: {
      metadata: {
        transactionId: transaction.id
      },
      receipt_email: transaction.buyerEmail,
      description: `Inventory sale for ${transaction.itemTitleSnapshot || "Inventory item"}`
    },
    line_items: checkoutLineItems.map((lineItem) => ({
      quantity: Number(lineItem.quantity || 0),
      price_data: {
        currency: "usd",
        unit_amount: Math.round(Number(lineItem.unitPrice || 0) * 100),
        product_data: {
          name: lineItem.itemTitleSnapshot || "Inventory Item"
        }
      }
    }))
  });
}

function revenueForTransaction(transaction) {
  return expectedTransactionAmount(transaction);
}

function getResponseOutputText(payload) {
  const message = payload.output?.find((item) => item.type === "message");
  const refusal = message?.content?.find((item) => item.type === "refusal");
  if (refusal) {
    throw new Error(refusal.refusal || "The model refused this request.");
  }
  return message?.content?.find((item) => item.type === "output_text")?.text || "";
}

function computeReports(store) {
  const recognizedStatuses = new Set(["payment_processed", "item_shipped"]);
  const pendingStatuses = new Set(["sold_awaiting_payment"]);
  const revenueByItem = {};
  let totalRecognizedRevenue = 0;
  let totalPendingRevenue = 0;
  let totalItemsSold = 0;

  for (const transaction of store.transactions) {
    const total = revenueForTransaction(transaction);
    totalItemsSold += Array.isArray(transaction.lineItems) && transaction.lineItems.length
      ? transaction.lineItems.reduce((sum, item) => sum + Number(item.quantity || 0), 0)
      : Number(transaction.quantity || 0);
    if (recognizedStatuses.has(transaction.status)) {
      totalRecognizedRevenue += total;
      if (Array.isArray(transaction.lineItems) && transaction.lineItems.length) {
        for (const lineItem of transaction.lineItems) {
          const lineTotal = Number(lineItem.quantity || 0) * Number(lineItem.unitPrice || 0);
          revenueByItem[lineItem.itemId] = (revenueByItem[lineItem.itemId] || 0) + lineTotal;
        }
      } else {
        revenueByItem[transaction.itemId] = (revenueByItem[transaction.itemId] || 0) + total;
      }
    } else if (pendingStatuses.has(transaction.status)) {
      totalPendingRevenue += total;
    }
  }

  return {
    totalItems: store.items.length,
    itemsInInventory: store.items.reduce((sum, item) => sum + Number(item.quantity || 0), 0),
    totalUnits: store.items.reduce((sum, item) => sum + Number(item.quantity || 0), 0),
    outOfStockCount: store.items.filter((item) => Number(item.quantity || 0) <= 0).length,
    totalItemsSold,
    totalTransactions: store.transactions.length,
    totalRecognizedRevenue,
    totalPendingRevenue,
    revenueByItem: store.items.map((item) => ({
      itemId: item.id,
      title: item.title,
      category: item.category,
      revenue: revenueByItem[item.id] || 0
    })),
    recentTransactions: [...store.transactions]
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, 8)
  };
}

async function getBodyBuffer(req) {
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

async function getJsonBody(req) {
  const buffer = await getBodyBuffer(req);
  if (!buffer.length) {
    return {};
  }
  return JSON.parse(buffer.toString("utf8"));
}

async function serveStatic(req, res, pathname) {
  const normalized = pathname === "/" ? "/index.html" : pathname;
  const filePath = path.join(publicDir, normalized);

  if (!filePath.startsWith(publicDir)) {
    sendText(res, 403, "Forbidden");
    return true;
  }

  try {
    const content = await readFile(filePath);
    const ext = path.extname(filePath).toLowerCase();
    const types = {
      ".html": "text/html; charset=utf-8",
      ".css": "text/css; charset=utf-8",
      ".js": "application/javascript; charset=utf-8",
      ".json": "application/json; charset=utf-8",
      ".svg": "image/svg+xml",
      ".png": "image/png",
      ".jpg": "image/jpeg",
      ".jpeg": "image/jpeg"
    };
    sendText(res, 200, content, types[ext] || "application/octet-stream");
    return true;
  } catch {
    return false;
  }
}

async function handleAnalyzePhoto(req, res) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    sendJson(res, 400, {
      error: "OPENAI_API_KEY is not set. Add it to your environment before using AI item suggestions."
    });
    return;
  }

  const body = await getJsonBody(req);
  const imageDataUrl = body.imageDataUrl;
  if (!imageDataUrl) {
    sendJson(res, 400, { error: "imageDataUrl is required." });
    return;
  }

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: process.env.OPENAI_VISION_MODEL || "gpt-4.1-mini",
      input: [
        {
          role: "user",
          content: [
            {
              type: "input_text",
              text:
                "Analyze this inventory item photo. Return JSON only with title, category, description, conditionNotes, and priceSuggestion. Keep title concise, category retail-friendly, description factual, and priceSuggestion numeric."
            },
            {
              type: "input_image",
              image_url: imageDataUrl
            }
          ]
        }
      ],
      text: {
        format: {
          type: "json_schema",
          name: "inventory_item_analysis",
          strict: true,
          schema: {
            type: "object",
            additionalProperties: false,
            properties: {
              title: { type: "string" },
              category: { type: "string" },
              description: { type: "string" },
              conditionNotes: { type: "string" },
              priceSuggestion: { type: "number" }
            },
            required: ["title", "category", "description", "conditionNotes", "priceSuggestion"]
          }
        }
      }
    })
  });

  const payload = await response.json();
  if (!response.ok) {
    sendJson(res, response.status, payload);
    return;
  }

  let outputText = "";
  try {
    outputText = getResponseOutputText(payload);
  } catch (error) {
    sendJson(res, 422, { error: error.message || "The model refused this request." });
    return;
  }
  if (!outputText) {
    sendJson(res, 502, { error: "No structured output returned by OpenAI." });
    return;
  }

  const suggestion = JSON.parse(outputText);

  try {
    const priceEstimate = await estimatePriceFromWeb({
      title: suggestion.title,
      category: suggestion.category,
      description: suggestion.description
    });

    if (priceEstimate?.estimatedUnitPrice) {
      suggestion.priceSuggestion = priceEstimate.estimatedUnitPrice;
    }

    sendJson(res, 200, { suggestion, priceEstimate });
  } catch (error) {
    sendJson(res, 200, { suggestion, priceEstimate: null, priceEstimateError: error.message });
  }
}

async function estimatePriceFromWeb(itemLike) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return null;
  }

  const title = String(itemLike.title || "").trim();
  const category = String(itemLike.category || "").trim();
  const description = String(itemLike.description || "").trim();
  if (!title && !category && !description) {
    return null;
  }

  const queryParts = [title, category, description].filter(Boolean);
  const itemSummary = queryParts.join(". ");

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: process.env.OPENAI_PRICE_MODEL || process.env.OPENAI_VISION_MODEL || "gpt-4.1-mini",
      tools: [
        {
          type: "web_search_preview"
        }
      ],
      input: [
        {
          role: "user",
          content: [
            {
              type: "input_text",
              text:
                `Search the web for current resale or market prices for this inventory item and return JSON only. ` +
                `Use multiple relevant listings or references when possible, ignore obvious outliers, and provide your best average estimate for one unit in USD. ` +
                `Include up to three similar-item sources with title, URL, and observed price.\n\n` +
                `Item details: ${itemSummary}`
            }
          ]
        }
      ],
      text: {
        format: {
          type: "json_schema",
          name: "inventory_price_estimate",
          strict: true,
          schema: {
            type: "object",
            additionalProperties: false,
            properties: {
              estimatedUnitPrice: { type: "number" },
              confidence: { type: "string" },
              rationale: { type: "string" },
              sources: {
                type: "array",
                items: {
                  type: "object",
                  additionalProperties: false,
                  properties: {
                    title: { type: "string" },
                    url: { type: "string" },
                    priceObserved: { type: "number" }
                  },
                  required: ["title", "url", "priceObserved"]
                }
              }
            },
            required: ["estimatedUnitPrice", "confidence", "rationale", "sources"]
          }
        }
      }
    })
  });

  const payload = await response.json();
  if (!response.ok) {
    throw new Error(payload.error?.message || payload.message || "Price estimate request failed.");
  }

  let outputText = "";
  outputText = getResponseOutputText(payload);

  if (!outputText) {
    throw new Error("No structured output returned by OpenAI.");
  }

  const estimate = JSON.parse(outputText);
  return {
    estimatedUnitPrice: Number(estimate.estimatedUnitPrice || 0),
    confidence: String(estimate.confidence || "").trim(),
    rationale: String(estimate.rationale || "").trim(),
    estimatedAt: new Date().toISOString(),
    sources: Array.isArray(estimate.sources)
      ? estimate.sources.map((source) => ({
          title: String(source.title || "").trim(),
          url: String(source.url || "").trim(),
          priceObserved: Number(source.priceObserved || 0)
        }))
      : []
  };
}

async function handleTranscribeAudio(req, res) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    sendJson(res, 400, {
      error: "OPENAI_API_KEY is not set. Add it to your environment before using server-side audio transcription."
    });
    return;
  }

  const fileName = new URL(req.url, `http://${req.headers.host}`).searchParams.get("filename") || "speech.webm";
  const contentType = req.headers["content-type"] || "audio/webm";
  const audioBuffer = await getBodyBuffer(req);

  if (!audioBuffer.length) {
    sendJson(res, 400, { error: "Audio payload is required." });
    return;
  }

  const form = new FormData();
  form.append(
    "file",
    new File([audioBuffer], fileName, { type: contentType }),
    fileName
  );
  form.append("model", process.env.OPENAI_TRANSCRIBE_MODEL || "gpt-4o-transcribe");

  const response = await fetch("https://api.openai.com/v1/audio/transcriptions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`
    },
    body: form
  });

  const payload = await response.json();
  if (!response.ok) {
    sendJson(res, response.status, payload);
    return;
  }

  sendJson(res, 200, { text: payload.text || "" });
}

function stripeConfigured() {
  return Boolean(stripe && stripeWebhookSecret && appBaseUrl);
}

function updateTransactionPaymentState(transaction, updates) {
  // Centralize payment status updates so webhook and checkout flows stay consistent.
  transaction.status = updates.status ?? transaction.status;
  transaction.paymentStatus = updates.paymentStatus ?? transaction.paymentStatus;
  transaction.amountReceived = Number(updates.amountReceived ?? transaction.amountReceived ?? 0);
  transaction.currency = String(updates.currency ?? transaction.currency ?? "usd").toLowerCase();
  transaction.paymentProvider = updates.paymentProvider ?? transaction.paymentProvider ?? "stripe";
  transaction.stripeCheckoutSessionId =
    updates.stripeCheckoutSessionId ?? transaction.stripeCheckoutSessionId ?? "";
  transaction.stripePaymentIntentId =
    updates.stripePaymentIntentId ?? transaction.stripePaymentIntentId ?? "";
  transaction.stripeInvoiceId = updates.stripeInvoiceId ?? transaction.stripeInvoiceId ?? "";
  transaction.stripeInvoiceNumber = updates.stripeInvoiceNumber ?? transaction.stripeInvoiceNumber ?? "";
  transaction.stripeInvoicePdfUrl =
    updates.stripeInvoicePdfUrl ?? transaction.stripeInvoicePdfUrl ?? "";
  transaction.stripeHostedInvoiceUrl =
    updates.stripeHostedInvoiceUrl ?? transaction.stripeHostedInvoiceUrl ?? "";
  transaction.stripeReceiptUrl = updates.stripeReceiptUrl ?? transaction.stripeReceiptUrl ?? "";
  transaction.paymentUrl = updates.paymentUrl ?? transaction.paymentUrl ?? "";
  transaction.paidAt = updates.paidAt ?? transaction.paidAt ?? "";
  transaction.paymentVerifiedAt = updates.paymentVerifiedAt ?? transaction.paymentVerifiedAt ?? "";
  transaction.paymentError = updates.paymentError ?? transaction.paymentError ?? "";
  transaction.inventoryRestoredAt = updates.inventoryRestoredAt ?? transaction.inventoryRestoredAt ?? "";
  transaction.paymentEmailSentAt = updates.paymentEmailSentAt ?? transaction.paymentEmailSentAt ?? "";
  transaction.invoiceEmailSentAt = updates.invoiceEmailSentAt ?? transaction.invoiceEmailSentAt ?? "";
  transaction.shippedEmailSentAt = updates.shippedEmailSentAt ?? transaction.shippedEmailSentAt ?? "";
  transaction.updatedAt = new Date().toISOString();
}

async function getStripeInvoiceDetails({ invoiceId = "", sessionId = "", paymentIntentId = "" }) {
  if (!stripe) {
    return null;
  }

  let invoice = null;
  let receiptUrl = "";

  if (invoiceId) {
    invoice = await stripe.invoices.retrieve(invoiceId);
  } else if (sessionId) {
    const session = await stripe.checkout.sessions.retrieve(sessionId, {
      expand: ["invoice", "payment_intent.latest_charge"]
    });

    if (session.invoice && typeof session.invoice === "object") {
      invoice = session.invoice;
    }

    if (session.payment_intent && typeof session.payment_intent === "object") {
      const latestCharge = session.payment_intent.latest_charge;
      if (latestCharge && typeof latestCharge === "object") {
        receiptUrl = latestCharge.receipt_url || "";
      }
    }
  } else if (paymentIntentId) {
    const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId, {
      expand: ["latest_charge"]
    });
    const latestCharge = paymentIntent.latest_charge;
    if (latestCharge && typeof latestCharge === "object") {
      receiptUrl = latestCharge.receipt_url || "";
    }
  }

  return {
    stripeInvoiceId: invoice?.id || "",
    stripeInvoiceNumber: invoice?.number || "",
    stripeInvoicePdfUrl: invoice?.invoice_pdf || "",
    stripeHostedInvoiceUrl: invoice?.hosted_invoice_url || "",
    stripeReceiptUrl: receiptUrl
  };
}

function applyCheckoutSessionPaymentResult(transaction, object, invoiceDetails = null) {
  const verifiedAt = new Date().toISOString();
  const expectedAmountCents = expectedTransactionAmountCents(transaction);
  const amountTotal = Number(object.amount_total || 0);

  if (object.payment_status === "paid" && amountTotal === expectedAmountCents) {
    updateTransactionPaymentState(transaction, {
      status: "payment_processed",
      paymentStatus: "paid",
      amountReceived: amountTotal / 100,
      currency: object.currency || transaction.currency,
      stripeCheckoutSessionId: object.id || transaction.stripeCheckoutSessionId,
      stripePaymentIntentId: String(object.payment_intent || transaction.stripePaymentIntentId || ""),
      ...invoiceDetails,
      paidAt: verifiedAt,
        paymentVerifiedAt: verifiedAt,
        paymentError: "",
        inventoryRestoredAt: ""
    });
    return true;
  }

  updateTransactionPaymentState(transaction, {
    status: "sold_awaiting_payment",
    paymentStatus: "amount_mismatch",
    currency: object.currency || transaction.currency,
    stripeCheckoutSessionId: object.id || transaction.stripeCheckoutSessionId,
    stripePaymentIntentId: String(object.payment_intent || transaction.stripePaymentIntentId || ""),
    ...invoiceDetails,
    paymentVerifiedAt: verifiedAt,
    paymentError:
      object.payment_status !== "paid"
        ? `Stripe session completed without a paid status. Received "${object.payment_status || "unknown"}".`
        : `Expected ${expectedAmountCents} cents but Stripe reported ${amountTotal} cents.`
  });

  return false;
}

async function syncPendingTransactions(store) {
  if (!stripe) {
    return false;
  }

  let changed = false;

  for (const transaction of store.transactions) {
    if (transaction.inventoryRestoredAt || transaction.paymentStatus === "paid") {
      continue;
    }
    if (!transaction.stripeCheckoutSessionId) {
      continue;
    }

    let session;
    try {
      session = await stripe.checkout.sessions.retrieve(transaction.stripeCheckoutSessionId, {
        expand: ["invoice", "payment_intent.latest_charge"]
      });
    } catch (error) {
      console.error("Stripe session sync failed:", error);
      continue;
    }

    let invoiceDetails = null;
    try {
      invoiceDetails = await getStripeInvoiceDetails({
        invoiceId: typeof session.invoice === "string" ? session.invoice : session.invoice?.id || "",
        sessionId: session.id || "",
        paymentIntentId: String(session.payment_intent || "")
      });
    } catch (error) {
      console.error("Invoice detail lookup failed:", error);
    }

    if (session.payment_status === "paid") {
      applyCheckoutSessionPaymentResult(transaction, session, invoiceDetails);
      syncItemStatus(store, transaction.itemId);
      changed = true;
      if (transaction.buyerEmail && !transaction.invoiceEmailSentAt) {
        try {
          await sendInvoiceEmail({ transaction });
          transaction.invoiceEmailSentAt = new Date().toISOString();
          changed = true;
        } catch (error) {
          transaction.paymentError = `Payment verified, but invoice email failed: ${error.message}`;
          changed = true;
        }
      }
      continue;
    }

    if (session.status === "expired") {
      restockTransactionItem(store, transaction);
      updateTransactionPaymentState(transaction, {
        status: "sold_awaiting_payment",
        paymentStatus: "payment_expired",
        paymentVerifiedAt: new Date().toISOString(),
        paymentError: "Stripe Checkout session expired before payment was completed."
      });
      syncItemStatus(store, transaction.itemId);
      changed = true;
    }
  }

  return changed;
}

async function handleStripeWebhook(req, res) {
  if (!stripe || !stripeWebhookSecret) {
    sendJson(res, 400, { error: "Stripe webhook is not configured." });
    return;
  }

  const signature = req.headers["stripe-signature"];
  if (!signature) {
    sendJson(res, 400, { error: "Missing Stripe signature header." });
    return;
  }

  const rawBody = await getBodyBuffer(req);
  let event;

  try {
    // Webhook signatures must be verified against the raw request body.
    event = stripe.webhooks.constructEvent(rawBody, signature, stripeWebhookSecret);
  } catch (error) {
    sendJson(res, 400, { error: `Webhook signature verification failed: ${error.message}` });
    return;
  }

  const store = await readStore();
  const object = event.data?.object || {};
  const transactionId = object.metadata?.transactionId;

  if (!transactionId) {
    sendJson(res, 200, { received: true, ignored: true });
    return;
  }

  const transaction = store.transactions.find((entry) => entry.id === transactionId);
  if (!transaction) {
    sendJson(res, 200, { received: true, ignored: true });
    return;
  }

  if (event.type === "checkout.session.completed") {
    let invoiceDetails = null;

    try {
      invoiceDetails = await getStripeInvoiceDetails({
        invoiceId: typeof object.invoice === "string" ? object.invoice : object.invoice?.id || "",
        sessionId: object.id || "",
        paymentIntentId: String(object.payment_intent || "")
      });
    } catch (error) {
      console.error("Invoice detail lookup failed:", error);
    }

    // Amount verification is required before moving the transaction into payment_processed.
    applyCheckoutSessionPaymentResult(transaction, object, invoiceDetails);
    syncItemStatus(store, transaction.itemId);
    if (transaction.buyerEmail && !transaction.invoiceEmailSentAt && transaction.paymentStatus === "paid") {
      try {
        await sendInvoiceEmail({ transaction });
        transaction.invoiceEmailSentAt = new Date().toISOString();
      } catch (error) {
        transaction.paymentError = `Payment verified, but invoice email failed: ${error.message}`;
      }
    }

    await writeStore(store);
    sendJson(res, 200, { received: true });
    return;
  }

  if (event.type === "invoice.paid") {
    updateTransactionPaymentState(transaction, {
      stripeInvoiceId: object.id || transaction.stripeInvoiceId,
      stripeInvoiceNumber: object.number || transaction.stripeInvoiceNumber,
      stripeInvoicePdfUrl: object.invoice_pdf || transaction.stripeInvoicePdfUrl,
      stripeHostedInvoiceUrl: object.hosted_invoice_url || transaction.stripeHostedInvoiceUrl,
      paymentVerifiedAt: new Date().toISOString(),
      paymentError: transaction.paymentStatus === "paid" ? "" : transaction.paymentError
    });
    syncItemStatus(store, transaction.itemId);
    if (transaction.buyerEmail && !transaction.invoiceEmailSentAt && transaction.paymentStatus === "paid") {
      try {
        await sendInvoiceEmail({ transaction });
        transaction.invoiceEmailSentAt = new Date().toISOString();
      } catch (error) {
        transaction.paymentError = `Payment verified, but invoice email failed: ${error.message}`;
      }
    }

    await writeStore(store);
    sendJson(res, 200, { received: true });
    return;
  }

  if (event.type === "checkout.session.expired") {
    restockTransactionItem(store, transaction);
    updateTransactionPaymentState(transaction, {
      status: "sold_awaiting_payment",
      paymentStatus: "payment_expired",
      stripeCheckoutSessionId: object.id || transaction.stripeCheckoutSessionId,
      stripePaymentIntentId: String(object.payment_intent || transaction.stripePaymentIntentId || ""),
      paymentVerifiedAt: new Date().toISOString(),
      paymentError: "Stripe Checkout session expired before payment was completed."
    });
    await writeStore(store);
    sendJson(res, 200, { received: true });
    return;
  }

  if (event.type === "payment_intent.payment_failed") {
    restockTransactionItem(store, transaction);
    updateTransactionPaymentState(transaction, {
      status: "sold_awaiting_payment",
      paymentStatus: "payment_failed",
      stripePaymentIntentId: String(object.id || transaction.stripePaymentIntentId || ""),
      paymentVerifiedAt: new Date().toISOString(),
      paymentError:
        object.last_payment_error?.message || "Stripe reported that the payment failed."
    });
    syncItemStatus(store, transaction.itemId);
    await writeStore(store);
    sendJson(res, 200, { received: true });
    return;
  }

  sendJson(res, 200, { received: true, ignored: true });
}

function csvEscape(value) {
  const text = String(value ?? "");
  if (text.includes(",") || text.includes("\"") || text.includes("\n")) {
    return `"${text.replaceAll("\"", "\"\"")}"`;
  }
  return text;
}

function toCsv(rows) {
  if (!rows.length) {
    return "";
  }
  const headers = Object.keys(rows[0]);
  const lines = [headers.join(",")];
  for (const row of rows) {
    lines.push(headers.map((header) => csvEscape(row[header])).join(","));
  }
  return lines.join("\n");
}

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const { pathname } = url;

    if (req.method === "POST" && pathname === "/api/stripe/webhook") {
      await handleStripeWebhook(req, res);
      return;
    }

    if (req.method === "GET" && pathname === "/api/state") {
      const store = await readStore();
      const changed = await syncPendingTransactions(store);
      if (changed) {
        await writeStore(store);
      }
      sendJson(res, 200, { ...store, reports: computeReports(store) });
      return;
    }

    if (req.method === "POST" && pathname === "/api/items") {
      const store = await readStore();
      const body = await getJsonBody(req);
      const item = normalizeItem(body);
      store.items.unshift(item);
      syncItemStatus(store, item.id);
      await writeStore(store);
      sendJson(res, 201, { item, reports: computeReports(store) });
      return;
    }

    if (req.method === "PUT" && pathname.startsWith("/api/items/")) {
      const itemId = pathname.split("/").pop();
      const body = await getJsonBody(req);
      const store = await readStore();
      const index = store.items.findIndex((item) => item.id === itemId);
      if (index === -1) {
        sendJson(res, 404, { error: "Item not found." });
        return;
      }
      const item = normalizeItem(body, store.items[index]);
      store.items[index] = item;
      syncItemStatus(store, item.id);
      await writeStore(store);
      sendJson(res, 200, { item, reports: computeReports(store) });
      return;
    }

    if (req.method === "POST" && pathname === "/api/transactions") {
      const body = await getJsonBody(req);
      const store = await readStore();
      const rawLineItems = Array.isArray(body.lineItems) ? body.lineItems : [];
      if (!rawLineItems.length) {
        sendJson(res, 400, { error: "Add at least one item before recording a transaction." });
        return;
      }
      const lineItems = [];
      for (const rawLineItem of rawLineItems) {
        const item = store.items.find((entry) => entry.id === rawLineItem.itemId);
        if (!item) {
          sendJson(res, 404, { error: "One of the selected items no longer exists." });
          return;
        }
        const quantity = Number(rawLineItem.quantity || 0);
        const unitPrice = Number(rawLineItem.unitPrice || 0);
        if (!Number.isFinite(quantity) || quantity <= 0) {
          sendJson(res, 400, { error: "Each item quantity must be greater than zero." });
          return;
        }
        if (!Number.isFinite(unitPrice) || unitPrice <= 0) {
          sendJson(res, 400, { error: "Each item unit price must be greater than zero." });
          return;
        }
        if (quantity > Number(item.quantity || 0)) {
          sendJson(res, 400, { error: `Not enough stock available for ${item.title}.` });
          return;
        }
        lineItems.push({
          itemId: item.id,
          itemTitleSnapshot: item.title,
          quantity,
          unitPrice
        });
      }

      for (const lineItem of lineItems) {
        const item = store.items.find((entry) => entry.id === lineItem.itemId);
        item.quantity = Number(item.quantity || 0) - Number(lineItem.quantity || 0);
        item.updatedAt = new Date().toISOString();
      }

      const transaction = normalizeTransaction({
        id: generateId("txn"),
        itemId: lineItems[0].itemId,
        itemTitleSnapshot: lineItems.map((entry) => entry.itemTitleSnapshot).join(", "),
        lineItems,
        status: "sold_awaiting_payment",
        buyer: String(body.buyer || "").trim(),
        buyerEmail: String(body.buyerEmail || "").trim(),
        notes: String(body.notes || "").trim(),
        paymentStatus: "payment_pending",
        paymentProvider: "stripe",
        expectedAmount: lineItems.reduce(
          (sum, entry) => sum + Number(entry.quantity || 0) * Number(entry.unitPrice || 0),
          0
        ),
        amountReceived: 0,
        currency: "usd",
        stripeCheckoutSessionId: "",
        stripePaymentIntentId: "",
        stripeInvoiceId: "",
        stripeInvoiceNumber: "",
        stripeInvoicePdfUrl: "",
        stripeHostedInvoiceUrl: "",
        stripeReceiptUrl: "",
        paymentUrl: "",
        paidAt: "",
        paymentVerifiedAt: "",
        paymentError: "",
        inventoryRestoredAt: "",
        paymentEmailSentAt: "",
        invoiceEmailSentAt: "",
        shippedEmailSentAt: ""
      });

      store.transactions.unshift(transaction);
      if (stripeConfigured() && smtpConfigured() && transaction.buyerEmail) {
        try {
          const session = await createStripeCheckoutSession(transaction);
          updateTransactionPaymentState(transaction, {
            status: "sold_awaiting_payment",
            paymentStatus: "payment_pending",
            paymentProvider: "stripe",
            currency: "usd",
            stripeCheckoutSessionId: session.id,
            stripePaymentIntentId: String(
              session.payment_intent || transaction.stripePaymentIntentId || ""
            ),
            paymentUrl: session.url || "",
            paymentError: ""
          });
          await sendPaymentLinkEmail({ transaction, paymentUrl: session.url });
          transaction.paymentEmailSentAt = new Date().toISOString();
        } catch (error) {
          transaction.paymentError = `Payment link email failed: ${error.message}`;
        }
      }
      for (const lineItem of lineItems) {
        syncItemStatus(store, lineItem.itemId);
      }
      await writeStore(store);
      sendJson(res, 201, { transaction, reports: computeReports(store) });
      return;
    }

    if (req.method === "POST" && pathname.match(/^\/api\/transactions\/[^/]+\/email-payment$/)) {
      if (!stripeConfigured()) {
        sendJson(res, 400, {
          error:
            "Stripe is not configured. Set STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, and APP_BASE_URL."
        });
        return;
      }
      if (!smtpConfigured()) {
        sendJson(res, 400, {
          error:
            "SMTP is not configured. Set SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, and SMTP_FROM."
        });
        return;
      }

      const transactionId = pathname.split("/")[3];
      const store = await readStore();
      const transaction = store.transactions.find((entry) => entry.id === transactionId);
      if (!transaction) {
        sendJson(res, 404, { error: "Transaction not found." });
        return;
      }
      if (!transaction.buyerEmail) {
        sendJson(res, 400, { error: "Buyer email is required before sending a payment link." });
        return;
      }
      if (transaction.inventoryRestoredAt) {
        sendJson(res, 400, { error: "This transaction has already been returned to inventory." });
        return;
      }

      const expectedAmountCents = expectedTransactionAmountCents(transaction);
      if (!Number.isFinite(expectedAmountCents) || expectedAmountCents <= 0) {
        sendJson(res, 400, { error: "Transaction amount must be greater than zero." });
        return;
      }

      const session = await createStripeCheckoutSession(transaction);

      updateTransactionPaymentState(transaction, {
        stripeCheckoutSessionId: session.id,
        paymentUrl: session.url,
        paymentError: "",
        paymentEmailSentAt: ""
      });

      await sendPaymentLinkEmail({ transaction, paymentUrl: session.url });
      transaction.paymentEmailSentAt = new Date().toISOString();
      await writeStore(store);
      sendJson(res, 200, { sent: true });
      return;
    }

    if (req.method === "POST" && pathname.match(/^\/api\/transactions\/[^/]+\/payment-cancelled$/)) {
      const transactionId = pathname.split("/")[3];
      const store = await readStore();
      const transaction = store.transactions.find((entry) => entry.id === transactionId);
      if (!transaction) {
        sendJson(res, 404, { error: "Transaction not found." });
        return;
      }

      restockTransactionItem(store, transaction);
      updateTransactionPaymentState(transaction, {
        status: "sold_awaiting_payment",
        paymentStatus: "payment_cancelled",
        paymentVerifiedAt: new Date().toISOString(),
        paymentError: "Buyer cancelled Stripe Checkout before payment completed."
      });
      syncItemStatus(store, transaction.itemId);

      await writeStore(store);
      sendJson(res, 200, { transaction, reports: computeReports(store) });
      return;
    }

    if (req.method === "POST" && pathname.match(/^\/api\/transactions\/[^/]+\/verify-payment$/)) {
      if (!stripe) {
        sendJson(res, 400, { error: "Stripe is not configured." });
        return;
      }

      const transactionId = pathname.split("/")[3];
      const body = await getJsonBody(req);
      const sessionId = String(body.sessionId || "").trim();
      if (!sessionId) {
        sendJson(res, 400, { error: "sessionId is required." });
        return;
      }

      const store = await readStore();
      const transaction = store.transactions.find((entry) => entry.id === transactionId);
      if (!transaction) {
        sendJson(res, 404, { error: "Transaction not found." });
        return;
      }

      const session = await stripe.checkout.sessions.retrieve(sessionId, {
        expand: ["invoice", "payment_intent.latest_charge"]
      });

      if (String(session.metadata?.transactionId || "") !== transaction.id) {
        sendJson(res, 400, { error: "Checkout session does not belong to this transaction." });
        return;
      }

      let invoiceDetails = null;
      try {
        invoiceDetails = await getStripeInvoiceDetails({
          invoiceId: typeof session.invoice === "string" ? session.invoice : session.invoice?.id || "",
          sessionId: session.id || "",
          paymentIntentId: String(session.payment_intent || "")
        });
      } catch (error) {
        console.error("Invoice detail lookup failed:", error);
      }

      applyCheckoutSessionPaymentResult(transaction, session, invoiceDetails);
      syncItemStatus(store, transaction.itemId);
      if (transaction.buyerEmail && !transaction.invoiceEmailSentAt && transaction.paymentStatus === "paid") {
        try {
          await sendInvoiceEmail({ transaction });
          transaction.invoiceEmailSentAt = new Date().toISOString();
        } catch (error) {
          transaction.paymentError = `Payment verified, but invoice email failed: ${error.message}`;
        }
      }
      await writeStore(store);
      sendJson(res, 200, { transaction, reports: computeReports(store) });
      return;
    }

    if (req.method === "PUT" && pathname.startsWith("/api/transactions/")) {
      const transactionId = pathname.split("/").pop();
      const body = await getJsonBody(req);
      const store = await readStore();
      const transaction = store.transactions.find((entry) => entry.id === transactionId);
      if (!transaction) {
        sendJson(res, 404, { error: "Transaction not found." });
        return;
      }

      const isLineItemShipment = Boolean(body.shipItemId);
      const requestedStatus = body.status || transaction.status;
      if (requestedStatus === "payment_processed" && !isLineItemShipment) {
        sendJson(res, 400, { error: "Stripe webhook verification must confirm payment first." });
        return;
      }
      if (
        requestedStatus === "item_shipped" &&
        !isLineItemShipment &&
        transaction.status !== "payment_processed"
      ) {
        sendJson(res, 400, { error: "Payment must be processed before shipping." });
        return;
      }

      const item = findItem(store, transaction.itemId);
      const editingFinalizedTransaction =
        transaction.paymentStatus === "paid" || transaction.status === "item_shipped";
      const lineItemsProvided = Array.isArray(body.lineItems);
      const quantityProvided = body.quantity !== undefined;
      const unitPriceProvided = body.unitPrice !== undefined;

      if ((quantityProvided || unitPriceProvided || lineItemsProvided) && editingFinalizedTransaction) {
        sendJson(res, 400, {
          error: "Paid or shipped transactions can only update notes and buyer details."
        });
        return;
      }

      if ((quantityProvided || lineItemsProvided) && transaction.inventoryRestoredAt) {
        sendJson(res, 400, {
          error: "This transaction has already been returned to inventory. Create a new transaction instead."
        });
        return;
      }

      if (lineItemsProvided) {
        const currentLineItems =
          Array.isArray(transaction.lineItems) && transaction.lineItems.length
            ? transaction.lineItems
            : [
                {
                  itemId: transaction.itemId,
                  itemTitleSnapshot: transaction.itemTitleSnapshot,
                  quantity: transaction.quantity,
                  unitPrice: transaction.unitPrice
                }
              ];
        const availability = new Map();
        for (const inventoryItem of store.items) {
          availability.set(inventoryItem.id, Number(inventoryItem.quantity || 0));
        }
        for (const existingLineItem of currentLineItems) {
          availability.set(
            existingLineItem.itemId,
            Number(availability.get(existingLineItem.itemId) || 0) +
              Number(existingLineItem.quantity || 0)
          );
        }

        const nextLineItems = [];
        for (const rawLineItem of body.lineItems) {
          const inventoryItem = findItem(store, rawLineItem.itemId);
          if (!inventoryItem) {
            sendJson(res, 404, { error: "One of the selected items no longer exists." });
            return;
          }
          const nextQty = Number(rawLineItem.quantity || 0);
          const nextUnitPrice = Number(rawLineItem.unitPrice || 0);
          if (!Number.isFinite(nextQty) || nextQty <= 0) {
            sendJson(res, 400, { error: "Each item quantity must be greater than zero." });
            return;
          }
          if (!Number.isFinite(nextUnitPrice) || nextUnitPrice <= 0) {
            sendJson(res, 400, { error: "Each item unit price must be greater than zero." });
            return;
          }
          if (nextQty > Number(availability.get(rawLineItem.itemId) || 0)) {
            sendJson(res, 400, { error: `Not enough stock available for ${inventoryItem.title}.` });
            return;
          }
          availability.set(
            rawLineItem.itemId,
            Number(availability.get(rawLineItem.itemId) || 0) - nextQty
          );
          nextLineItems.push({
            itemId: inventoryItem.id,
            itemTitleSnapshot: inventoryItem.title,
            quantity: nextQty,
            unitPrice: nextUnitPrice
          });
        }

        for (const inventoryItem of store.items) {
          if (availability.has(inventoryItem.id)) {
            applyItemQuantity(inventoryItem, Number(availability.get(inventoryItem.id) || 0));
            syncItemStatus(store, inventoryItem.id);
          }
        }

        transaction.lineItems = nextLineItems;
        transaction.itemId = nextLineItems[0]?.itemId || transaction.itemId;
        transaction.itemTitleSnapshot = nextLineItems
          .map((entry) => entry.itemTitleSnapshot)
          .join(", ");
        transaction.quantity = nextLineItems.reduce(
          (sum, entry) => sum + Number(entry.quantity || 0),
          0
        );
        transaction.unitPrice = nextLineItems.length === 1 ? Number(nextLineItems[0].unitPrice || 0) : 0;
        transaction.expectedAmount = nextLineItems.reduce(
          (sum, entry) => sum + Number(entry.quantity || 0) * Number(entry.unitPrice || 0),
          0
        );
      }

      let nextQuantity = Number(transaction.quantity || 0);
      if (quantityProvided) {
        nextQuantity = Number(body.quantity);
        if (!Number.isFinite(nextQuantity) || nextQuantity <= 0) {
          sendJson(res, 400, { error: "Quantity must be greater than zero." });
          return;
        }
      }

      let nextUnitPrice = Number(transaction.unitPrice || 0);
      if (unitPriceProvided) {
        nextUnitPrice = Number(body.unitPrice);
        if (!Number.isFinite(nextUnitPrice) || nextUnitPrice <= 0) {
          sendJson(res, 400, { error: "Unit price must be greater than zero." });
          return;
        }
      }

      if (item && quantityProvided && !lineItemsProvided) {
        const delta = nextQuantity - Number(transaction.quantity || 0);
        if (delta > 0 && delta > Number(item.quantity || 0)) {
          sendJson(res, 400, { error: "Not enough stock available for this update." });
          return;
        }
        applyItemQuantity(item, Number(item.quantity || 0) - delta);
      }

      transaction.status = requestedStatus;
      if (!lineItemsProvided) {
        transaction.quantity = nextQuantity;
        transaction.unitPrice = nextUnitPrice;
        transaction.expectedAmount = nextQuantity * nextUnitPrice;
      }
      transaction.buyer = String(body.buyer ?? transaction.buyer ?? "").trim();
      transaction.buyerEmail = String(body.buyerEmail ?? transaction.buyerEmail ?? "").trim();
      transaction.notes = String(body.notes ?? transaction.notes ?? "").trim();
      transaction.updatedAt = new Date().toISOString();
      if (isLineItemShipment) {
        if (!Array.isArray(transaction.lineItems) || !transaction.lineItems.length) {
          sendJson(res, 400, { error: "This transaction does not contain line items." });
          return;
        }
        if (transaction.paymentStatus !== "paid" && transaction.status !== "payment_processed") {
          sendJson(res, 400, { error: "Payment must be processed before shipping items." });
          return;
        }
        const shipLineItem = transaction.lineItems.find((entry) => entry.itemId === body.shipItemId);
        if (!shipLineItem) {
          sendJson(res, 404, { error: "Selected transaction item not found." });
          return;
        }
        const shipQuantity = Number(body.shipQuantity || 0);
        const remainingQuantity =
          Number(shipLineItem.quantity || 0) - Number(shipLineItem.shippedQuantity || 0);
        if (!Number.isFinite(shipQuantity) || shipQuantity <= 0) {
          sendJson(res, 400, { error: "Ship quantity must be greater than zero." });
          return;
        }
        if (shipQuantity > remainingQuantity) {
          sendJson(res, 400, { error: "Ship quantity exceeds the remaining unshipped quantity." });
          return;
        }

        shipLineItem.shippedQuantity = Number(shipLineItem.shippedQuantity || 0) + shipQuantity;
        transaction.status = allLineItemsShipped(transaction) ? "item_shipped" : "payment_processed";

        if (transaction.buyerEmail) {
          try {
            await sendShippedEmail({
              transaction,
              shippedItems: [
                {
                  itemTitleSnapshot: shipLineItem.itemTitleSnapshot,
                  quantity: shipQuantity
                }
              ]
            });
            transaction.shippedEmailSentAt = new Date().toISOString();
          } catch (error) {
            transaction.paymentError = `Shipment email failed: ${error.message}`;
          }
        }
      } else if (requestedStatus === "item_shipped" && transaction.buyerEmail && !transaction.shippedEmailSentAt) {
        try {
          await sendShippedEmail({
            transaction,
            shippedItems: (transaction.lineItems || []).map((entry) => ({
              itemTitleSnapshot: entry.itemTitleSnapshot,
              quantity: Number(entry.quantity || 0) - Number(entry.shippedQuantity || 0)
            }))
          });
          transaction.shippedEmailSentAt = new Date().toISOString();
        } catch (error) {
          transaction.paymentError = `Shipment email failed: ${error.message}`;
        }
      }
      syncItemStatus(store, transaction.itemId);
      await writeStore(store);
      sendJson(res, 200, { transaction, reports: computeReports(store) });
      return;
    }

    if (req.method === "GET" && pathname === "/api/reports/inventory.csv") {
      const store = await readStore();
      const csv = toCsv(store.items);
      res.writeHead(200, {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": "attachment; filename=inventory-report.csv"
      });
      res.end(csv);
      return;
    }

    if (req.method === "GET" && pathname === "/api/reports/transactions.csv") {
      const store = await readStore();
      const csv = toCsv(store.transactions.map((transaction) => ({
        ...transaction,
        total: revenueForTransaction(transaction)
      })));
      res.writeHead(200, {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": "attachment; filename=transaction-report.csv"
      });
      res.end(csv);
      return;
    }

    if (req.method === "POST" && pathname === "/api/analyze-photo") {
      await handleAnalyzePhoto(req, res);
      return;
    }

    if (req.method === "POST" && pathname === "/api/transcribe-audio") {
      await handleTranscribeAudio(req, res);
      return;
    }

    if (await serveStatic(req, res, pathname)) {
      return;
    }

    sendJson(res, 404, { error: "Not found." });
  } catch (error) {
    console.error(error);
    sendJson(res, 500, { error: error.message || "Internal server error." });
  }
});

await ensureStore();

server.listen(port, () => {
  console.log(`Inventory app running on http://localhost:${port}`);
});
