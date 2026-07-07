const state = {
  items: [],
  transactions: [],
  reports: null,
  photoDataUrl: "",
  photoSuggestionPriceEstimate: null,
  mediaRecorder: null,
  audioChunks: [],
  selectedTransactionItemId: "",
  transactionDraftItems: [],
  editingTransactionOriginalLineItems: [],
  currentTab: "dashboard",
  editingItemId: "",
  editingTransactionId: "",
  inventoryFilters: {
    search: "",
    sortField: "date",
    sortDirection: "desc",
    name: "",
    category: "",
    location: "",
    status: "",
    dateStartOffset: 0,
    dateEndOffset: 0
  },
  inventoryPendingFilters: null,
  transactionFilters: {
    search: "",
    sortField: "date",
    sortDirection: "desc",
    buyer: "",
    assetName: "",
    assetCategory: "",
    status: "",
    dateStartOffset: 0,
    dateEndOffset: 0
  },
  transactionPendingFilters: null
};

const itemForm = document.getElementById("item-form");
const transactionForm = document.getElementById("transaction-form");
const photoInput = document.getElementById("photo-input");
const photoPreview = document.getElementById("photo-preview");
const analyzePhotoBtn = document.getElementById("analyze-photo-btn");
const clearPhotoBtn = document.getElementById("clear-photo-btn");
const heroStats = document.getElementById("hero-stats");
const inventoryList = document.getElementById("inventory-list");
const transactionsList = document.getElementById("transactions-list");
const itemRevenueTable = document.getElementById("item-revenue-table");
const transactionItemSelect = document.getElementById("transaction-item");
const transactionPriceInput = document.getElementById("transaction-price");
const transactionTotalInput = document.getElementById("transaction-total");
const transactionDraftList = document.getElementById("transaction-draft-list");
const addTransactionItemBtn = document.getElementById("add-transaction-item-btn");
const quantityInput = document.getElementById("quantity");
const stockStatusInput = document.getElementById("stock-status");
const audioStatus = document.getElementById("audio-status");
const recordAudioBtn = document.getElementById("record-audio-btn");
const audioUpload = document.getElementById("audio-upload");
const flashMessage = document.getElementById("flash-message");
const itemFormTitle = document.getElementById("item-form-title");
const itemSubmitBtn = document.getElementById("item-submit-btn");
const itemCancelEditBtn = document.getElementById("item-cancel-edit-btn");
const transactionFormTitle = document.getElementById("transaction-form-title");
const transactionSubmitBtn = document.getElementById("transaction-submit-btn");
const transactionCancelEditBtn = document.getElementById("transaction-cancel-edit-btn");
const tabButtons = document.querySelectorAll("[data-tab-target]");
const tabPanels = document.querySelectorAll("[data-tab-panel]");
const inventorySearchInput = document.getElementById("inventory-search");
const inventorySortFieldSelect = document.getElementById("inventory-sort-field");
const inventorySortDirectionBtn = document.getElementById("inventory-sort-direction");
const inventoryFilterName = document.getElementById("inventory-filter-name");
const inventoryFilterCategory = document.getElementById("inventory-filter-category");
const inventoryFilterLocation = document.getElementById("inventory-filter-location");
const inventoryFilterStatus = document.getElementById("inventory-filter-status");
const inventoryDateStartInput = document.getElementById("inventory-date-start");
const inventoryDateEndInput = document.getElementById("inventory-date-end");
const inventoryDateStartTextInput = document.getElementById("inventory-date-start-text");
const inventoryDateEndTextInput = document.getElementById("inventory-date-end-text");
const inventoryDateSliderLabel = document.getElementById("inventory-date-slider-label");
const inventoryApplyFiltersBtn = document.getElementById("inventory-apply-filters");
const inventoryClearFiltersBtn = document.getElementById("inventory-clear-filters");
const inventoryResultsSummary = document.getElementById("inventory-results-summary");
const transactionSearchInput = document.getElementById("transaction-search");
const transactionSortFieldSelect = document.getElementById("transaction-sort-field");
const transactionSortDirectionBtn = document.getElementById("transaction-sort-direction");
const transactionFilterBuyer = document.getElementById("transaction-filter-buyer");
const transactionFilterAssetName = document.getElementById("transaction-filter-asset-name");
const transactionFilterAssetCategory = document.getElementById("transaction-filter-asset-category");
const transactionFilterStatus = document.getElementById("transaction-filter-status");
const transactionDateStartInput = document.getElementById("transaction-date-start");
const transactionDateEndInput = document.getElementById("transaction-date-end");
const transactionDateStartTextInput = document.getElementById("transaction-date-start-text");
const transactionDateEndTextInput = document.getElementById("transaction-date-end-text");
const transactionDateSliderLabel = document.getElementById("transaction-date-slider-label");
const transactionApplyFiltersBtn = document.getElementById("transaction-apply-filters");
const transactionClearFiltersBtn = document.getElementById("transaction-clear-filters");
const transactionResultsSummary = document.getElementById("transaction-results-summary");

function setActiveTab(tabId) {
  state.currentTab = tabId;
  for (const button of tabButtons) {
    const isActive = button.dataset.tabTarget === tabId;
    button.classList.toggle("active", isActive);
    button.setAttribute("aria-selected", String(isActive));
  }
  for (const panel of tabPanels) {
    panel.hidden = panel.dataset.tabPanel !== tabId;
    panel.classList.toggle("active", panel.dataset.tabPanel === tabId);
  }
}

function focusTransactionsTab() {
  setActiveTab("transaction-history");
}

function formatMoney(value) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD"
  }).format(Number(value || 0));
}

function formatDate(value) {
  return new Date(value).toLocaleString();
}

function showFlashMessage(message) {
  if (!message) {
    flashMessage.hidden = true;
    flashMessage.textContent = "";
    return;
  }
  flashMessage.hidden = false;
  flashMessage.textContent = message;
}

function syncFormModes() {
  itemFormTitle.textContent = state.editingItemId ? "Edit Asset" : "Add Asset";
  itemSubmitBtn.textContent = state.editingItemId ? "Save Asset Changes" : "Save Asset";
  itemCancelEditBtn.hidden = !state.editingItemId;

  transactionFormTitle.textContent = state.editingTransactionId
    ? "Edit Sale Transaction"
    : "Create Sale Transaction";
  transactionSubmitBtn.textContent = state.editingTransactionId
    ? "Save Transaction Changes"
    : "Record Transaction";
  transactionCancelEditBtn.hidden = !state.editingTransactionId;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;")
    .replaceAll("'", "&#39;");
}

function setDefaultCapturedAt() {
  const now = new Date();
  now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
  document.getElementById("captured-at").value = now.toISOString().slice(0, 16);
}

function setStatusFromQuantity() {
  stockStatusInput.value =
    Number(quantityInput.value || 0) > 0 ? "Asset Available / Unsold" : "Out of Stock";
}

async function request(path, options = {}) {
  const response = await fetch(path, options);
  const payload = await response.json();
  if (!response.ok) {
    throw new Error(payload.error || "Request failed");
  }
  return payload;
}

async function refreshState() {
  const payload = await request("/api/state");
  state.items = payload.items;
  state.transactions = payload.transactions;
  state.reports = payload.reports;
  render();
}

function renderHeroStats() {
  const reports = state.reports;
  if (!reports) {
    heroStats.innerHTML = "";
    return;
  }

  const stats = [
    ["Revenue Generated", formatMoney(reports.totalRecognizedRevenue)],
    ["Pending Revenue", formatMoney(reports.totalPendingRevenue)],
    ["Available Assets", String(reports.itemsInInventory || 0)],
    ["Transactions", String(reports.totalTransactions || 0)],
    ["Assets Sold", String(reports.totalItemsSold || 0)]
  ];

  heroStats.innerHTML = stats
    .map(
      ([label, value]) =>
        `<div class="hero-stat"><span>${label}</span><strong>${value}</strong></div>`
    )
    .join("");
}

function renderReportCards() {
  return;
}

const FILTER_START_DATE = new Date("2026-01-01T00:00:00");

function todayDateOnly() {
  const today = new Date();
  return new Date(today.getFullYear(), today.getMonth(), today.getDate());
}

function dayDiff(startDate, endDate) {
  return Math.max(Math.round((endDate.getTime() - startDate.getTime()) / 86400000), 0);
}

function formatDateOnly(value) {
  return value.toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric"
  });
}

function formatDateInputValue(value) {
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  const year = value.getFullYear();
  return `${month}/${day}/${year}`;
}

function parseDateInputValue(value) {
  const match = String(value || "").trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!match) {
    return null;
  }
  const month = Number(match[1]);
  const day = Number(match[2]);
  const year = Number(match[3]);
  const date = new Date(year, month - 1, day);
  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    return null;
  }
  return date;
}

function createDefaultFilters() {
  const maxOffset = dayDiff(FILTER_START_DATE, todayDateOnly());
  return {
    search: "",
    sortField: "date",
    sortDirection: "desc",
    name: "",
    category: "",
    location: "",
    status: "",
    dateStartOffset: 0,
    dateEndOffset: maxOffset
  };
}

function createDefaultTransactionFilters() {
  const maxOffset = dayDiff(FILTER_START_DATE, todayDateOnly());
  return {
    search: "",
    sortField: "date",
    sortDirection: "desc",
    buyer: "",
    assetName: "",
    assetCategory: "",
    status: "",
    dateStartOffset: 0,
    dateEndOffset: maxOffset
  };
}

function cloneFilters(filters) {
  return { ...filters };
}

function offsetToDate(offset) {
  const date = new Date(FILTER_START_DATE);
  date.setDate(date.getDate() + Number(offset || 0));
  return date;
}

function normalizeDateRange(filters) {
  const start = Number(filters.dateStartOffset || 0);
  const end = Number(filters.dateEndOffset || 0);
  if (start <= end) {
    return { ...filters, dateStartOffset: start, dateEndOffset: end };
  }
  return { ...filters, dateStartOffset: end, dateEndOffset: start };
}

function setDateSliderBounds(startInput, endInput) {
  const maxOffset = dayDiff(FILTER_START_DATE, todayDateOnly());
  startInput.min = "0";
  startInput.max = String(maxOffset);
  endInput.min = "0";
  endInput.max = String(maxOffset);
  return maxOffset;
}

state.inventoryFilters = createDefaultFilters();
state.inventoryPendingFilters = cloneFilters(state.inventoryFilters);
state.transactionFilters = createDefaultTransactionFilters();
state.transactionPendingFilters = cloneFilters(state.transactionFilters);

function normalizeValue(value) {
  return String(value ?? "").trim().toLowerCase();
}

function itemStockStatus(item) {
  return item.stockStatus || (Number(item.quantity || 0) > 0 ? "Asset Available / Unsold" : "Out of Stock");
}

function itemDateValue(item) {
  return item.capturedAt || item.createdAt || "";
}

function transactionDateValue(transaction) {
  return transaction.createdAt || transaction.updatedAt || "";
}

function itemDateKey(item) {
  const value = itemDateValue(item);
  return value ? new Date(value).toISOString().slice(0, 10) : "";
}

function transactionDateKey(transaction) {
  const value = transactionDateValue(transaction);
  return value ? new Date(value).toISOString().slice(0, 10) : "";
}

function setSelectOptions(select, values, selectedValue, defaultLabel) {
  select.innerHTML = [
    `<option value="">${defaultLabel}</option>`,
    ...values.map(
      (value) =>
        `<option value="${escapeHtml(value)}"${value === selectedValue ? " selected" : ""}>${escapeHtml(value)}</option>`
    )
  ].join("");
}

function syncInventoryFilterControls() {
  inventorySearchInput.value = state.inventoryFilters.search;
  inventorySortFieldSelect.value = state.inventoryFilters.sortField;
  inventorySortDirectionBtn.textContent = state.inventoryFilters.sortDirection === "asc" ? "↑" : "↓";
  inventorySortDirectionBtn.title =
    state.inventoryFilters.sortDirection === "asc" ? "Ascending" : "Descending";
  inventoryFilterName.value = state.inventoryFilters.name;
  inventoryFilterCategory.value = state.inventoryFilters.category;
  inventoryFilterLocation.value = state.inventoryFilters.location;
  inventoryFilterStatus.value = state.inventoryFilters.status;
  inventoryFilterDate.value = state.inventoryFilters.date;
  inventoryFilterDateFrom.value = state.inventoryFilters.dateFrom;
  inventoryFilterDateTo.value = state.inventoryFilters.dateTo;
}

function syncTransactionFilterControls() {
  transactionSearchInput.value = state.transactionFilters.search;
  transactionSortFieldSelect.value = state.transactionFilters.sortField;
  transactionSortDirectionBtn.textContent = state.transactionFilters.sortDirection === "asc" ? "↑" : "↓";
  transactionSortDirectionBtn.title =
    state.transactionFilters.sortDirection === "asc" ? "Ascending" : "Descending";
  transactionFilterBuyer.value = state.transactionFilters.buyer;
  transactionFilterAssetName.value = state.transactionFilters.assetName;
  transactionFilterAssetCategory.value = state.transactionFilters.assetCategory;
  transactionFilterStatus.value = state.transactionFilters.status;
  transactionFilterDate.value = state.transactionFilters.date;
  transactionFilterDateFrom.value = state.transactionFilters.dateFrom;
  transactionFilterDateTo.value = state.transactionFilters.dateTo;
}

function syncInventoryPendingFilterControls() {
  const filters = normalizeDateRange(state.inventoryPendingFilters);
  state.inventoryPendingFilters = filters;
  const maxOffset = setDateSliderBounds(inventoryDateStartInput, inventoryDateEndInput);
  inventorySearchInput.value = filters.search;
  inventorySortFieldSelect.value = filters.sortField;
  inventorySortDirectionBtn.textContent = filters.sortDirection === "asc" ? "↑" : "↓";
  inventorySortDirectionBtn.title = filters.sortDirection === "asc" ? "Ascending" : "Descending";
  inventoryFilterName.value = filters.name;
  inventoryFilterCategory.value = filters.category;
  inventoryFilterLocation.value = filters.location;
  inventoryFilterStatus.value = filters.status;
  inventoryDateStartInput.value = String(Math.min(filters.dateStartOffset, maxOffset));
  inventoryDateEndInput.value = String(Math.min(filters.dateEndOffset, maxOffset));
  inventoryDateSliderLabel.textContent =
    `${formatDateOnly(offsetToDate(filters.dateStartOffset))} - ${formatDateOnly(offsetToDate(filters.dateEndOffset))}`;
}

function syncTransactionPendingFilterControls() {
  const filters = normalizeDateRange(state.transactionPendingFilters);
  state.transactionPendingFilters = filters;
  const maxOffset = setDateSliderBounds(transactionDateStartInput, transactionDateEndInput);
  transactionSearchInput.value = filters.search;
  transactionSortFieldSelect.value = filters.sortField;
  transactionSortDirectionBtn.textContent = filters.sortDirection === "asc" ? "↑" : "↓";
  transactionSortDirectionBtn.title = filters.sortDirection === "asc" ? "Ascending" : "Descending";
  transactionFilterBuyer.value = filters.buyer;
  transactionFilterAssetName.value = filters.assetName;
  transactionFilterAssetCategory.value = filters.assetCategory;
  transactionFilterStatus.value = filters.status;
  transactionDateStartInput.value = String(Math.min(filters.dateStartOffset, maxOffset));
  transactionDateEndInput.value = String(Math.min(filters.dateEndOffset, maxOffset));
  transactionDateSliderLabel.textContent =
    `${formatDateOnly(offsetToDate(filters.dateStartOffset))} - ${formatDateOnly(offsetToDate(filters.dateEndOffset))}`;
}

function syncInventoryDateTextControls() {
  const filters = normalizeDateRange(state.inventoryPendingFilters);
  inventoryDateStartTextInput.value = formatDateInputValue(offsetToDate(filters.dateStartOffset));
  inventoryDateEndTextInput.value = formatDateInputValue(offsetToDate(filters.dateEndOffset));
}

function syncTransactionDateTextControls() {
  const filters = normalizeDateRange(state.transactionPendingFilters);
  transactionDateStartTextInput.value = formatDateInputValue(offsetToDate(filters.dateStartOffset));
  transactionDateEndTextInput.value = formatDateInputValue(offsetToDate(filters.dateEndOffset));
}

function dateToOffset(date) {
  const clampedMin = FILTER_START_DATE;
  const clampedMax = todayDateOnly();
  const normalized = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  if (normalized < clampedMin) {
    return 0;
  }
  if (normalized > clampedMax) {
    return dayDiff(FILTER_START_DATE, clampedMax);
  }
  return dayDiff(FILTER_START_DATE, normalized);
}

function renderInventoryFilterOptions() {
  const filters = state.inventoryPendingFilters;
  const names = [
    ...new Set(
      state.items
        .filter((item) => inventoryMatchesFilters(item, filters, ["name"]))
        .map((item) => item.title)
        .filter(Boolean)
    )
  ].sort();
  const categories = [
    ...new Set(
      state.items
        .filter((item) => inventoryMatchesFilters(item, filters, ["category"]))
        .map((item) => item.category)
        .filter(Boolean)
    )
  ].sort();
  const locations = [
    ...new Set(
      state.items
        .filter((item) => inventoryMatchesFilters(item, filters, ["location"]))
        .map((item) => item.location)
        .filter(Boolean)
    )
  ].sort();
  const statuses = [
    ...new Set(
      state.items
        .filter((item) => inventoryMatchesFilters(item, filters, ["status"]))
        .map((item) => itemStockStatus(item))
        .filter(Boolean)
    )
  ].sort();

  if (filters.name && !names.includes(filters.name)) {
    filters.name = "";
  }
  if (filters.category && !categories.includes(filters.category)) {
    filters.category = "";
  }
  if (filters.location && !locations.includes(filters.location)) {
    filters.location = "";
  }
  if (filters.status && !statuses.includes(filters.status)) {
    filters.status = "";
  }

  setSelectOptions(
    inventoryFilterName,
    names,
    filters.name,
    "All Assets"
  );
  setSelectOptions(
    inventoryFilterCategory,
    categories,
    filters.category,
    "All Categories"
  );
  setSelectOptions(
    inventoryFilterLocation,
    locations,
    filters.location,
    "All Locations"
  );
  setSelectOptions(
    inventoryFilterStatus,
    statuses,
    filters.status,
    "All Inventory Statuses"
  );
  syncInventoryPendingFilterControls();
  syncInventoryDateTextControls();
}

function renderInventory() {
  renderInventoryFilterOptions();

  if (!state.items.length) {
    inventoryResultsSummary.textContent = "";
    inventoryList.innerHTML =
      '<div class="empty">No asset yet. Use the Add Asset tab to save your first asset.</div>';
    return;
  }

  const filteredItems = applyInventoryFilters();
  inventoryResultsSummary.textContent = `Showing ${filteredItems.length} of ${state.items.length} assets`;

  if (!filteredItems.length) {
    inventoryList.innerHTML = '<div class="empty">No assets match the current search and filters.</div>';
    return;
  }

  const template = document.getElementById("inventory-item-template");
  inventoryList.innerHTML = "";

  for (const item of filteredItems) {
    const clone = template.content.cloneNode(true);
    const article = clone.querySelector(".inventory-card");
    const image = clone.querySelector(".inventory-photo");
    const title = clone.querySelector("h3");
    const pill = clone.querySelector(".pill");
    const meta = clone.querySelector(".meta");
    const description = clone.querySelector(".description");
    const stats = clone.querySelector(".stats");

    if (item.photoDataUrl) {
      image.src = item.photoDataUrl;
      image.alt = item.title;
    } else {
      image.removeAttribute("src");
      image.alt = "No asset photo";
    }

    title.textContent = item.title;
    pill.textContent = itemStockStatus(item);
    pill.classList.toggle("out", Number(item.quantity || 0) <= 0);
    meta.textContent = `${item.category} • ${item.location} • Added ${formatDate(item.capturedAt)}`;
    description.textContent = item.description || "No description provided.";
    const sourceMarkup = (item.priceEstimate?.sources || [])
      .filter((source) => source.url)
      .map(
        (source) =>
          `<a class="stat-chip source-link" href="${escapeHtml(source.url)}" target="_blank" rel="noreferrer">${escapeHtml(source.title || "Similar asset")} ${formatMoney(source.priceObserved)}</a>`
      )
      .join("");
    stats.innerHTML = `
      <span class="stat-chip">Qty ${item.quantity}</span>
      <span class="stat-chip">Price ${formatMoney(item.price)}</span>
      ${
        item.priceEstimate?.confidence
          ? `<span class="stat-chip">Estimate ${escapeHtml(item.priceEstimate.confidence)}</span>`
          : ""
      }
      ${sourceMarkup}
    `;
    stats.insertAdjacentHTML(
      "beforeend",
      `<button class="secondary edit-item" data-id="${item.id}">Edit Asset</button>`
    );

    article.dataset.itemId = item.id;
    inventoryList.appendChild(clone);
  }
}

function nextTransactionStatus(status) {
  if (status === "payment_processed") {
    return "item_shipped";
  }
  return null;
}

function transactionStatusLabel(status) {
  return {
    sold_awaiting_payment: "Asset Sold and Awaiting Payment",
    payment_processed: "Payment Processed",
    item_shipped: "Asset Shipped"
  }[status] || status;
}

function paymentStatusLabel(status) {
  return {
    payment_pending: "Payment Pending",
    paid: "Paid",
    amount_mismatch: "Amount Mismatch",
    payment_cancelled: "Payment Cancelled",
    payment_expired: "Payment Expired",
    payment_failed: "Payment Failed"
  }[status] || status || "Unknown";
}

function transactionLineItems(transaction) {
  if (Array.isArray(transaction.lineItems) && transaction.lineItems.length) {
    return transaction.lineItems;
  }
  return [
    {
      itemId: transaction.itemId,
      itemTitleSnapshot: transaction.itemTitleSnapshot,
      quantity: transaction.quantity,
      unitPrice: transaction.unitPrice
    }
  ];
}

function transactionShipmentSummary(transaction) {
  const lineItems = transactionLineItems(transaction);
  const shippedQuantity = lineItems.reduce(
    (sum, lineItem) => sum + Number(lineItem.shippedQuantity || 0),
    0
  );
  const totalQuantity = lineItems.reduce((sum, lineItem) => sum + Number(lineItem.quantity || 0), 0);
  return {
    shippedQuantity,
    pendingQuantity: Math.max(totalQuantity - shippedQuantity, 0)
  };
}

function transactionItemRecord(lineItem) {
  return state.items.find((item) => item.id === lineItem.itemId) || null;
}

function transactionItemName(transaction) {
  return transaction.itemTitleSnapshot || transactionLineItems(transaction)[0]?.itemTitleSnapshot || "Asset";
}

function transactionMatchesAssetName(transaction, assetName) {
  return transactionLineItems(transaction).some((lineItem) => lineItem.itemTitleSnapshot === assetName);
}

function transactionMatchesAssetCategory(transaction, category) {
  return transactionLineItems(transaction).some(
    (lineItem) => transactionItemRecord(lineItem)?.category === category
  );
}

function transactionShippingStatus(transaction) {
  const shipmentSummary = transactionShipmentSummary(transaction);
  const totalQuantity = transactionLineItems(transaction).reduce(
    (sum, lineItem) => sum + Number(lineItem.quantity || 0),
    0
  );

  if (!shipmentSummary.shippedQuantity) {
    return "pending";
  }
  if (shipmentSummary.shippedQuantity >= totalQuantity) {
    return "shipped";
  }
  return "partial";
}

function transactionShippingStatusLabel(status) {
  return {
    pending: "Pending Shipment",
    partial: "Partially Shipped",
    shipped: "Fully Shipped"
  }[status] || status;
}

function transactionStatusOptions() {
  return [
    ...new Set(
      state.transactions.map((transaction) => transactionStatusLabel(transaction.status)).filter(Boolean)
    )
  ].sort();
}

function transactionMatchesStatus(transaction, statusLabel) {
  return transactionStatusLabel(transaction.status) === statusLabel;
}

function inventoryMatchesFilters(item, filters, excludedFields = []) {
  const excluded = new Set(excludedFields);
  const search = normalizeValue(filters.search);
  const dateKey = itemDateKey(item);
  const startDateKey = offsetToDate(filters.dateStartOffset).toISOString().slice(0, 10);
  const endDateKey = offsetToDate(filters.dateEndOffset).toISOString().slice(0, 10);
  const matchesSearch =
    !search ||
    [item.title, item.location, item.category].some((value) => normalizeValue(value).includes(search));

  return (
    (excluded.has("search") || matchesSearch) &&
    (excluded.has("name") || !filters.name || item.title === filters.name) &&
    (excluded.has("category") || !filters.category || item.category === filters.category) &&
    (excluded.has("location") || !filters.location || item.location === filters.location) &&
    (excluded.has("status") || !filters.status || itemStockStatus(item) === filters.status) &&
    (excluded.has("dateRange") || !dateKey || (dateKey >= startDateKey && dateKey <= endDateKey))
  );
}

function transactionMatchesFilters(transaction, filters, excludedFields = []) {
  const excluded = new Set(excludedFields);
  const search = normalizeValue(filters.search);
  const dateKey = transactionDateKey(transaction);
  const startDateKey = offsetToDate(filters.dateStartOffset).toISOString().slice(0, 10);
  const endDateKey = offsetToDate(filters.dateEndOffset).toISOString().slice(0, 10);
  const matchesSearch =
    !search ||
    normalizeValue(transaction.buyer).includes(search) ||
    transactionLineItems(transaction).some((lineItem) => {
      const item = transactionItemRecord(lineItem);
      return (
        normalizeValue(lineItem.itemTitleSnapshot).includes(search) ||
        normalizeValue(item?.category).includes(search)
      );
    });

  return (
    (excluded.has("search") || matchesSearch) &&
    (excluded.has("buyer") || !filters.buyer || transaction.buyer === filters.buyer) &&
    (excluded.has("assetName") || !filters.assetName || transactionMatchesAssetName(transaction, filters.assetName)) &&
    (excluded.has("assetCategory") ||
      !filters.assetCategory ||
      transactionMatchesAssetCategory(transaction, filters.assetCategory)) &&
    (excluded.has("status") || !filters.status || transactionMatchesStatus(transaction, filters.status)) &&
    (excluded.has("dateRange") || !dateKey || (dateKey >= startDateKey && dateKey <= endDateKey))
  );
}

function renderTransactionFilterOptions() {
  const filters = state.transactionPendingFilters;
  const buyers = [
    ...new Set(
      state.transactions
        .filter((transaction) => transactionMatchesFilters(transaction, filters, ["buyer"]))
        .map((transaction) => transaction.buyer)
        .filter(Boolean)
    )
  ].sort();
  const assetNames = [
    ...new Set(
      state.transactions
        .filter((transaction) => transactionMatchesFilters(transaction, filters, ["assetName"]))
        .flatMap((transaction) =>
          transactionLineItems(transaction).map((lineItem) => lineItem.itemTitleSnapshot).filter(Boolean)
        )
    )
  ].sort();
  const assetCategories = [
    ...new Set(
      state.transactions
        .filter((transaction) => transactionMatchesFilters(transaction, filters, ["assetCategory"]))
        .flatMap((transaction) =>
          transactionLineItems(transaction)
            .map((lineItem) => transactionItemRecord(lineItem)?.category)
            .filter(Boolean)
        )
    )
  ].sort();
  const statuses = [
    ...new Set(
      state.transactions
        .filter((transaction) => transactionMatchesFilters(transaction, filters, ["status"]))
        .map((transaction) => transactionStatusLabel(transaction.status))
        .filter(Boolean)
    )
  ].sort();

  if (filters.buyer && !buyers.includes(filters.buyer)) {
    filters.buyer = "";
  }
  if (filters.assetName && !assetNames.includes(filters.assetName)) {
    filters.assetName = "";
  }
  if (filters.assetCategory && !assetCategories.includes(filters.assetCategory)) {
    filters.assetCategory = "";
  }
  if (filters.status && !statuses.includes(filters.status)) {
    filters.status = "";
  }

  setSelectOptions(
    transactionFilterBuyer,
    buyers,
    filters.buyer,
    "All Buyers"
  );
  setSelectOptions(
    transactionFilterAssetName,
    assetNames,
    filters.assetName,
    "All Assets"
  );
  setSelectOptions(
    transactionFilterAssetCategory,
    assetCategories,
    filters.assetCategory,
    "All Categories"
  );
  setSelectOptions(
    transactionFilterStatus,
    statuses,
    filters.status,
    "All Transaction Statuses"
  );
  syncTransactionPendingFilterControls();
  syncTransactionDateTextControls();
}

function applyInventoryFilters() {
  const filters = state.inventoryFilters;
  const items = state.items.filter((item) => inventoryMatchesFilters(item, filters));

  return items.sort((left, right) => {
    let comparison = 0;
    if (filters.sortField === "value") {
      comparison = Number(left.price || 0) - Number(right.price || 0);
    } else if (filters.sortField === "quantity") {
      comparison = Number(left.quantity || 0) - Number(right.quantity || 0);
    } else {
      comparison = new Date(itemDateValue(left)).getTime() - new Date(itemDateValue(right)).getTime();
    }
    return filters.sortDirection === "asc" ? comparison : comparison * -1;
  });
}

function applyTransactionFilters() {
  const filters = state.transactionFilters;
  const transactions = state.transactions.filter((transaction) =>
    transactionMatchesFilters(transaction, filters)
  );

  return transactions.sort((left, right) => {
    let comparison = 0;
    if (filters.sortField === "value") {
      comparison = Number(left.expectedAmount || 0) - Number(right.expectedAmount || 0);
    } else {
      comparison =
        new Date(transactionDateValue(left)).getTime() - new Date(transactionDateValue(right)).getTime();
    }
    return filters.sortDirection === "asc" ? comparison : comparison * -1;
  });
}

function renderTransactionLineItemChip(lineItem) {
  const shippedQuantity = Number(lineItem.shippedQuantity || 0);
  const pendingQuantity = Math.max(Number(lineItem.quantity || 0) - shippedQuantity, 0);
  return `<span class="stat-chip">${escapeHtml(lineItem.itemTitleSnapshot)} x${lineItem.quantity} @ ${formatMoney(lineItem.unitPrice)} â€¢ Shipped ${shippedQuantity} â€¢ Pending ${pendingQuantity}</span>`;
}

function renderTransactionShipmentBreakdown(transaction) {
  return transactionLineItems(transaction)
    .map((lineItem) => {
      const shippedQuantity = Number(lineItem.shippedQuantity || 0);
      const pendingQuantity = Math.max(Number(lineItem.quantity || 0) - shippedQuantity, 0);
      return `<p class="description">${escapeHtml(lineItem.itemTitleSnapshot)}: shipped ${shippedQuantity}, pending ${pendingQuantity}</p>`;
    })
    .join("");
}

function renderTransactionInvoiceLinks(transaction) {
  const links = [];

  if (transaction.stripeInvoicePdfUrl) {
    links.push(
      `<a class="stat-chip source-link" href="${escapeHtml(transaction.stripeInvoicePdfUrl)}" target="_blank" rel="noreferrer">Invoice PDF</a>`
    );
  }
  if (transaction.stripeHostedInvoiceUrl) {
    links.push(
      `<a class="stat-chip source-link" href="${escapeHtml(transaction.stripeHostedInvoiceUrl)}" target="_blank" rel="noreferrer">Hosted Invoice</a>`
    );
  }
  if (transaction.stripeReceiptUrl) {
    links.push(
      `<a class="stat-chip source-link" href="${escapeHtml(transaction.stripeReceiptUrl)}" target="_blank" rel="noreferrer">Receipt</a>`
    );
  }

  return links.join("");
}

function renderTransactions() {
  renderTransactionFilterOptions();

  if (!state.transactions.length) {
    transactionResultsSummary.textContent = "";
    transactionsList.innerHTML =
      '<div class="empty">No transactions yet. Use the Create Sale tab to record the first sale.</div>';
    return;
  }

  const filteredTransactions = applyTransactionFilters();
  transactionResultsSummary.textContent = `Showing ${filteredTransactions.length} of ${state.transactions.length} transactions`;

  if (!filteredTransactions.length) {
    transactionsList.innerHTML =
      '<div class="empty">No transactions match the current search and filters.</div>';
    return;
  }

  transactionsList.innerHTML = filteredTransactions
    .map((transaction) => {
      const shipmentSummary = transactionShipmentSummary(transaction);
      return `
        <article class="transaction-card">
          <div class="transaction-head">
            <div>
              <h3>${escapeHtml(transactionItemName(transaction))}</h3>
              <p class="meta">${transactionStatusLabel(transaction.status)} • ${formatDate(transaction.createdAt)}</p>
            </div>
            <span class="pill ${transaction.status === "sold_awaiting_payment" ? "out" : ""}">
              ${formatMoney(transaction.expectedAmount)}
            </span>
          </div>
          <div>
            <div class="transaction-meta">
              ${transactionLineItems(transaction)
                .map(
                  (lineItem) =>
                    `<span class="stat-chip">${escapeHtml(lineItem.itemTitleSnapshot)} x${lineItem.quantity} @ ${formatMoney(lineItem.unitPrice)}${Number(lineItem.shippedQuantity || 0) ? ` • Shipped ${lineItem.shippedQuantity}` : ""}</span>`
                )
                .join("")}
              <span class="stat-chip">Qty ${transaction.quantity}</span>
              <span class="stat-chip">Shipped ${shipmentSummary.shippedQuantity}</span>
              <span class="stat-chip">Pending Shipment ${shipmentSummary.pendingQuantity}</span>
              <span class="stat-chip">${transactionShippingStatusLabel(transactionShippingStatus(transaction))}</span>
              <span class="stat-chip">Payment ${paymentStatusLabel(transaction.paymentStatus)}</span>
              <span class="stat-chip">Expected ${formatMoney(transaction.expectedAmount)}</span>
              <span class="stat-chip">Received ${formatMoney(transaction.amountReceived)}</span>
              <span class="stat-chip">Provider ${transaction.paymentProvider || "stripe"}</span>
              <span class="stat-chip">${transaction.buyer || "No buyer noted"}</span>
              ${
                transaction.buyerEmail
                  ? `<span class="stat-chip">${escapeHtml(transaction.buyerEmail)}</span>`
                  : ""
              }
              ${
                transaction.paidAt
                  ? `<span class="stat-chip">Paid ${formatDate(transaction.paidAt)}</span>`
                  : ""
              }
              ${
                transaction.stripeInvoiceNumber
                  ? `<span class="stat-chip">Invoice ${escapeHtml(transaction.stripeInvoiceNumber)}</span>`
                  : ""
              }
              ${
                transaction.inventoryRestoredAt
                  ? `<span class="stat-chip">Restocked ${formatDate(transaction.inventoryRestoredAt)}</span>`
                  : ""
              }
              ${renderTransactionInvoiceLinks(transaction)}
            </div>
            ${renderTransactionShipmentBreakdown(transaction)}
            <p class="description">${transaction.notes || "No notes provided."}</p>
            ${
              transaction.paymentError
                ? `<p class="description">${escapeHtml(transaction.paymentError)}</p>`
                : ""
            }
            ${
              transaction.status === "sold_awaiting_payment" &&
              transaction.paymentStatus !== "paid" &&
              !transaction.inventoryRestoredAt
                ? `
                    ${
                      transaction.buyerEmail
                        ? `<button class="secondary email-payment-link" data-id="${transaction.id}">
                            Resend Payment Email
                          </button>`
                        : ""
                    }
                  `
                : ""
            }
            <button class="secondary edit-transaction" data-id="${transaction.id}">
              Edit Transaction
            </button>
            ${
              (transaction.paymentStatus === "paid" || transaction.status === "payment_processed" || transaction.status === "item_shipped")
                ? transactionLineItems(transaction)
                    .map((lineItem) => {
                      const shippedQuantity = Number(lineItem.shippedQuantity || 0);
                      const remainingQuantity = Number(lineItem.quantity || 0) - shippedQuantity;
                      if (remainingQuantity <= 0) {
                        return "";
                      }
                      return `
                        <div class="actions-inline">
                          <input class="ship-quantity-input" data-item-id="${lineItem.itemId}" type="number" min="1" max="${remainingQuantity}" value="${remainingQuantity}" />
                          <button class="secondary ship-line-item" data-id="${transaction.id}" data-item-id="${lineItem.itemId}">
                            Ship ${escapeHtml(lineItem.itemTitleSnapshot)}
                          </button>
                        </div>
                      `;
                    })
                    .join("")
                : ""
            }
          </div>
        </article>
      `;
    })
    .join("");
}

function renderRevenueTable() {
  const rows = state.reports?.revenueByItem || [];
  if (!rows.length) {
    itemRevenueTable.innerHTML = "";
    return;
  }

  itemRevenueTable.innerHTML = `
    <table>
      <thead>
        <tr>
          <th>Asset</th>
          <th>Category</th>
          <th>Recognized Revenue</th>
        </tr>
      </thead>
      <tbody>
        ${rows
          .map(
            (row) => `
              <tr>
                <td>${row.title}</td>
                <td>${row.category}</td>
                <td>${formatMoney(row.revenue)}</td>
              </tr>
            `
          )
          .join("")}
      </tbody>
    </table>
  `;
}

function renderTransactionItemOptions() {
  const originalReserved = Object.fromEntries(
    state.editingTransactionOriginalLineItems.map((entry) => [entry.itemId, Number(entry.quantity || 0)])
  );
  const availableItems = state.items.filter(
    (item) => Number(item.quantity || 0) + Number(originalReserved[item.id] || 0) > 0
  );
  const hasSelectedItem = availableItems.some((item) => item.id === state.selectedTransactionItemId);
  if (!hasSelectedItem) {
    state.selectedTransactionItemId = "";
  }

  transactionItemSelect.innerHTML = availableItems.length
    ? [
        '<option value="">Select an asset</option>',
        ...availableItems.map(
          (item) =>
            `<option value="${item.id}">${item.title} (${item.quantity} available)</option>`
        )
      ].join("")
    : '<option value="">No assets available</option>';

  transactionItemSelect.value = state.selectedTransactionItemId;
  if (!state.selectedTransactionItemId) {
    transactionPriceInput.value = "";
    transactionPriceInput.placeholder = "Select an asset first";
    transactionPriceInput.title = "";
  } else {
    setTransactionPriceFromItem(state.selectedTransactionItemId);
  }
  transactionPriceInput.disabled = !state.selectedTransactionItemId;
}

function draftReservedQuantity(itemId) {
  return state.transactionDraftItems
    .filter((entry) => entry.itemId === itemId)
    .reduce((sum, entry) => sum + Number(entry.quantity || 0), 0);
}

function availableQuantityForDraft(itemId) {
  const item = state.items.find((entry) => entry.id === itemId);
  const inventoryQty = Number(item?.quantity || 0);
  const originalReserved = state.editingTransactionOriginalLineItems
    .filter((entry) => entry.itemId === itemId)
    .reduce((sum, entry) => sum + Number(entry.quantity || 0), 0);
  return inventoryQty + originalReserved - draftReservedQuantity(itemId);
}

function renderTransactionDraft() {
  if (!state.transactionDraftItems.length) {
    transactionDraftList.innerHTML =
      '<div class="empty">No assets in this transaction yet. Add one or more assets before recording the sale.</div>';
    transactionTotalInput.value = formatMoney(0);
    return;
  }

  transactionDraftList.innerHTML = state.transactionDraftItems
    .map(
      (item, index) => `
        <article class="transaction-card">
          <div class="transaction-head">
            <div>
              <h3>${escapeHtml(item.itemTitleSnapshot)}</h3>
              <p class="meta">Qty ${item.quantity} • Unit ${formatMoney(item.unitPrice)}</p>
            </div>
            <span class="pill">${formatMoney(Number(item.quantity || 0) * Number(item.unitPrice || 0))}</span>
          </div>
          <div class="actions-inline">
            <button type="button" class="secondary remove-draft-item" data-index="${index}">Remove</button>
          </div>
        </article>
      `
    )
    .join("");

  transactionTotalInput.value = formatMoney(
    state.transactionDraftItems.reduce(
      (sum, item) => sum + Number(item.quantity || 0) * Number(item.unitPrice || 0),
      0
    )
  );
}

function render() {
  renderHeroStats();
  renderReportCards();
  renderInventory();
  renderTransactions();
  renderRevenueTable();
  renderTransactionItemOptions();
  renderTransactionDraft();
  syncFormModes();
}

async function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function setTransactionPriceFromItem(itemId) {
  const item = state.items.find((entry) => entry.id === itemId);
  if (!item) {
    transactionPriceInput.value = "";
    transactionPriceInput.placeholder = "Select an asset first";
    return;
  }

  transactionPriceInput.value = String(Number(item.price || 0) + 1);
  transactionPriceInput.placeholder = "Default sale price";
  transactionPriceInput.title = item.priceEstimate?.rationale
    ? `${item.priceEstimate.confidence}: ${item.priceEstimate.rationale}`
    : "";
  transactionPriceInput.disabled = false;
}

function resetItemForm() {
  itemForm.reset();
  state.photoDataUrl = "";
  state.photoSuggestionPriceEstimate = null;
  state.editingItemId = "";
  photoPreview.hidden = true;
  photoPreview.removeAttribute("src");
  setDefaultCapturedAt();
  setStatusFromQuantity();
  syncFormModes();
}

function resetTransactionForm() {
  transactionForm.reset();
  state.selectedTransactionItemId = "";
  state.editingTransactionId = "";
  state.editingTransactionOriginalLineItems = [];
  state.transactionDraftItems = [];
  document.getElementById("transaction-quantity").value = 1;
  transactionPriceInput.value = "";
    transactionPriceInput.placeholder = "Select an asset first";
  transactionPriceInput.title = "";
  transactionPriceInput.disabled = true;
  renderTransactionItemOptions();
  syncFormModes();
}

function startItemEdit(itemId) {
  const item = state.items.find((entry) => entry.id === itemId);
  if (!item) {
    alert("Asset not found.");
    return;
  }

  state.editingItemId = item.id;
  state.photoDataUrl = item.photoDataUrl || "";
  state.photoSuggestionPriceEstimate = item.priceEstimate || null;
  document.getElementById("captured-at").value = item.capturedAt ? item.capturedAt.slice(0, 16) : "";
  document.getElementById("category").value = item.category || "";
  document.getElementById("title").value = item.title || "";
  document.getElementById("description").value = item.description || "";
  document.getElementById("location").value = item.location || "";
  document.getElementById("quantity").value = item.quantity ?? 0;
  document.getElementById("price").value = item.price ?? 0;
  if (state.photoDataUrl) {
    photoPreview.src = state.photoDataUrl;
    photoPreview.hidden = false;
  } else {
    photoPreview.hidden = true;
    photoPreview.removeAttribute("src");
  }
  setStatusFromQuantity();
  syncFormModes();
  setActiveTab("intake");
}

function startTransactionEdit(transactionId) {
  const transaction = state.transactions.find((entry) => entry.id === transactionId);
  if (!transaction) {
    alert("Transaction not found.");
    return;
  }

  state.editingTransactionId = transaction.id;
  state.editingTransactionOriginalLineItems = transactionLineItems(transaction).map((entry) => ({
    itemId: entry.itemId,
    quantity: Number(entry.quantity || 0)
  }));
  state.transactionDraftItems = transactionLineItems(transaction).map((entry) => ({
    itemId: entry.itemId,
    itemTitleSnapshot: entry.itemTitleSnapshot,
    quantity: Number(entry.quantity || 0),
    unitPrice: Number(entry.unitPrice || 0)
  }));
  state.selectedTransactionItemId = "";
  renderTransactionItemOptions();
  renderTransactionDraft();
  document.getElementById("transaction-quantity").value = 1;
  transactionPriceInput.value = "";
  transactionPriceInput.disabled = true;
  document.getElementById("transaction-buyer").value = transaction.buyer || "";
  document.getElementById("transaction-buyer-email").value = transaction.buyerEmail || "";
  document.getElementById("transaction-notes").value = transaction.notes || "";
  syncFormModes();
  setActiveTab("create-transaction");
}

photoInput.addEventListener("change", async () => {
  const file = photoInput.files?.[0];
  if (!file) {
    return;
  }
  state.photoDataUrl = await readFileAsDataUrl(file);
  photoPreview.src = state.photoDataUrl;
  photoPreview.hidden = false;
});

for (const button of tabButtons) {
  button.addEventListener("click", () => {
    setActiveTab(button.dataset.tabTarget);
  });
}

inventorySearchInput.addEventListener("input", () => {
  state.inventoryPendingFilters.search = inventorySearchInput.value;
  renderInventoryFilterOptions();
});

[
  [inventoryFilterName, "name"],
  [inventoryFilterCategory, "category"],
  [inventoryFilterLocation, "location"],
  [inventoryFilterStatus, "status"],
  [inventorySortFieldSelect, "sortField"]
].forEach(([element, key]) => {
  element.addEventListener("change", () => {
    state.inventoryPendingFilters[key] = element.value;
    renderInventoryFilterOptions();
  });
});

[inventoryDateStartInput, inventoryDateEndInput].forEach((element) => {
  element.addEventListener("input", () => {
    state.inventoryPendingFilters.dateStartOffset = Number(inventoryDateStartInput.value || 0);
    state.inventoryPendingFilters.dateEndOffset = Number(inventoryDateEndInput.value || 0);
    syncInventoryPendingFilterControls();
    syncInventoryDateTextControls();
    renderInventoryFilterOptions();
  });
});

[
  [inventoryDateStartTextInput, "dateStartOffset"],
  [inventoryDateEndTextInput, "dateEndOffset"]
].forEach(([element, key]) => {
  element.addEventListener("change", () => {
    const parsedDate = parseDateInputValue(element.value);
    if (!parsedDate) {
      syncInventoryDateTextControls();
      return;
    }
    state.inventoryPendingFilters[key] = dateToOffset(parsedDate);
    syncInventoryPendingFilterControls();
    syncInventoryDateTextControls();
    renderInventoryFilterOptions();
  });
});

transactionSearchInput.addEventListener("input", () => {
  state.transactionPendingFilters.search = transactionSearchInput.value;
  renderTransactionFilterOptions();
});

[
  [transactionFilterBuyer, "buyer"],
  [transactionFilterAssetName, "assetName"],
  [transactionFilterAssetCategory, "assetCategory"],
  [transactionFilterStatus, "status"],
  [transactionSortFieldSelect, "sortField"]
].forEach(([element, key]) => {
  element.addEventListener("change", () => {
    state.transactionPendingFilters[key] = element.value;
    renderTransactionFilterOptions();
  });
});

[transactionDateStartInput, transactionDateEndInput].forEach((element) => {
  element.addEventListener("input", () => {
    state.transactionPendingFilters.dateStartOffset = Number(transactionDateStartInput.value || 0);
    state.transactionPendingFilters.dateEndOffset = Number(transactionDateEndInput.value || 0);
    syncTransactionPendingFilterControls();
    syncTransactionDateTextControls();
    renderTransactionFilterOptions();
  });
});

[
  [transactionDateStartTextInput, "dateStartOffset"],
  [transactionDateEndTextInput, "dateEndOffset"]
].forEach(([element, key]) => {
  element.addEventListener("change", () => {
    const parsedDate = parseDateInputValue(element.value);
    if (!parsedDate) {
      syncTransactionDateTextControls();
      return;
    }
    state.transactionPendingFilters[key] = dateToOffset(parsedDate);
    syncTransactionPendingFilterControls();
    syncTransactionDateTextControls();
    renderTransactionFilterOptions();
  });
});

inventorySortDirectionBtn.addEventListener("click", () => {
  state.inventoryPendingFilters.sortDirection =
    state.inventoryPendingFilters.sortDirection === "asc" ? "desc" : "asc";
  syncInventoryPendingFilterControls();
  syncInventoryDateTextControls();
});

transactionSortDirectionBtn.addEventListener("click", () => {
  state.transactionPendingFilters.sortDirection =
    state.transactionPendingFilters.sortDirection === "asc" ? "desc" : "asc";
  syncTransactionPendingFilterControls();
  syncTransactionDateTextControls();
});

inventoryApplyFiltersBtn.addEventListener("click", () => {
  state.inventoryFilters = normalizeDateRange(cloneFilters(state.inventoryPendingFilters));
  renderInventory();
});

transactionApplyFiltersBtn.addEventListener("click", () => {
  state.transactionFilters = normalizeDateRange(cloneFilters(state.transactionPendingFilters));
  renderTransactions();
});

inventoryClearFiltersBtn.addEventListener("click", () => {
  state.inventoryPendingFilters = createDefaultFilters();
  state.inventoryFilters = cloneFilters(state.inventoryPendingFilters);
  renderInventory();
});

transactionClearFiltersBtn.addEventListener("click", () => {
  state.transactionPendingFilters = createDefaultTransactionFilters();
  state.transactionFilters = cloneFilters(state.transactionPendingFilters);
  renderTransactions();
});

clearPhotoBtn.addEventListener("click", () => {
  photoInput.value = "";
  state.photoDataUrl = "";
  state.photoSuggestionPriceEstimate = null;
  photoPreview.hidden = true;
  photoPreview.removeAttribute("src");
});

analyzePhotoBtn.addEventListener("click", async () => {
  if (!state.photoDataUrl) {
    alert("Add a photo first.");
    return;
  }
  analyzePhotoBtn.disabled = true;
  analyzePhotoBtn.textContent = "Analyzing...";
  try {
    const payload = await request("/api/analyze-photo", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ imageDataUrl: state.photoDataUrl })
    });
    document.getElementById("title").value = payload.suggestion.title;
    document.getElementById("category").value = payload.suggestion.category;
    document.getElementById("description").value = `${payload.suggestion.description}\nCondition: ${payload.suggestion.conditionNotes}`.trim();
    document.getElementById("price").value = payload.suggestion.priceSuggestion;
    state.photoSuggestionPriceEstimate = payload.priceEstimate || null;
  } catch (error) {
    alert(error.message);
  } finally {
    analyzePhotoBtn.disabled = false;
    analyzePhotoBtn.textContent = "Suggest From Photo";
  }
});

quantityInput.addEventListener("input", setStatusFromQuantity);

itemForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const formData = new FormData(itemForm);
  const payload = Object.fromEntries(formData.entries());
  payload.photoDataUrl = state.photoDataUrl;
  payload.priceEstimate = state.photoSuggestionPriceEstimate;

  try {
    await request(state.editingItemId ? `/api/items/${state.editingItemId}` : "/api/items", {
      method: state.editingItemId ? "PUT" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    resetItemForm();
    await refreshState();
  } catch (error) {
    alert(error.message);
  }
});

itemCancelEditBtn.addEventListener("click", () => {
  resetItemForm();
});

transactionItemSelect.addEventListener("change", () => {
  state.selectedTransactionItemId = transactionItemSelect.value;
  transactionPriceInput.title = "";
  if (!state.selectedTransactionItemId) {
    transactionPriceInput.value = "";
    transactionPriceInput.placeholder = "Select an asset first";
    transactionPriceInput.disabled = true;
    return;
  }

  setTransactionPriceFromItem(state.selectedTransactionItemId);
});

addTransactionItemBtn.addEventListener("click", () => {
  const itemId = transactionItemSelect.value;
  if (!itemId) {
    alert("Select an asset first.");
    return;
  }

  const quantity = Number(document.getElementById("transaction-quantity").value || 0);
  const unitPrice = Number(transactionPriceInput.value || 0);
  if (!Number.isFinite(quantity) || quantity <= 0) {
    alert("Quantity must be greater than zero.");
    return;
  }
  if (!Number.isFinite(unitPrice) || unitPrice <= 0) {
    alert("Unit price must be greater than zero.");
    return;
  }
  if (quantity > availableQuantityForDraft(itemId)) {
      alert("Not enough stock available for that asset quantity.");
    return;
  }

  const item = state.items.find((entry) => entry.id === itemId);
  const existing = state.transactionDraftItems.find((entry) => entry.itemId === itemId);
  if (existing) {
    existing.quantity += quantity;
    existing.unitPrice = unitPrice;
  } else {
    state.transactionDraftItems.push({
      itemId,
      itemTitleSnapshot: item?.title || "Asset",
      quantity,
      unitPrice
    });
  }

  state.selectedTransactionItemId = "";
  transactionItemSelect.value = "";
  document.getElementById("transaction-quantity").value = 1;
  transactionPriceInput.value = "";
    transactionPriceInput.placeholder = "Select an asset first";
  transactionPriceInput.disabled = true;
  renderTransactionItemOptions();
  renderTransactionDraft();
});

transactionForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!state.transactionDraftItems.length) {
      alert("Add at least one asset to the transaction.");
    return;
  }
  const payload = {
    lineItems: state.transactionDraftItems,
    status: document.getElementById("transaction-status").value,
    buyer: document.getElementById("transaction-buyer").value,
    buyerEmail: document.getElementById("transaction-buyer-email").value,
    notes: document.getElementById("transaction-notes").value
  };
  try {
    await request(
      state.editingTransactionId
        ? `/api/transactions/${state.editingTransactionId}`
        : "/api/transactions",
      {
        method: state.editingTransactionId ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      }
    );
    resetTransactionForm();
    await refreshState();
    focusTransactionsTab();
  } catch (error) {
    alert(error.message);
  }
});

transactionCancelEditBtn.addEventListener("click", () => {
  resetTransactionForm();
});

inventoryList.addEventListener("click", (event) => {
  const editButton = event.target.closest(".edit-item");
  if (!editButton) {
    return;
  }
  startItemEdit(editButton.dataset.id);
});

transactionDraftList.addEventListener("click", (event) => {
  const removeDraftButton = event.target.closest(".remove-draft-item");
  if (removeDraftButton) {
    state.transactionDraftItems.splice(Number(removeDraftButton.dataset.index), 1);
    renderTransactionItemOptions();
    renderTransactionDraft();
    return;
  }
});

transactionsList.addEventListener("click", async (event) => {
  const editButton = event.target.closest(".edit-transaction");
  if (editButton) {
    startTransactionEdit(editButton.dataset.id);
    return;
  }

  const emailButton = event.target.closest(".email-payment-link");
  if (emailButton) {
    try {
      await request(`/api/transactions/${emailButton.dataset.id}/email-payment`, {
        method: "POST"
      });
      showFlashMessage("Payment email sent.");
      await refreshState();
    } catch (error) {
      alert(error.message);
    }
    return;
  }

  const shipButton = event.target.closest(".ship-line-item");
  if (shipButton) {
    const quantityInput = shipButton.parentElement?.querySelector(
      `.ship-quantity-input[data-item-id="${shipButton.dataset.itemId}"]`
    );
    const shipQuantity = Number(quantityInput?.value || 0);
    try {
      await request(`/api/transactions/${shipButton.dataset.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          shipItemId: shipButton.dataset.itemId,
          shipQuantity
        })
      });
      await refreshState();
    } catch (error) {
      alert(error.message);
    }
    return;
  }

  const button = event.target.closest(".advance-transaction");
  if (!button) {
    return;
  }
  try {
    await request(`/api/transactions/${button.dataset.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: button.dataset.status })
    });
    await refreshState();
  } catch (error) {
    alert(error.message);
  }
});

function dictationSupported() {
  return "webkitSpeechRecognition" in window || "SpeechRecognition" in window;
}

function startDictation(targetId) {
  if (!dictationSupported()) {
    alert("Browser speech recognition is not available on this device.");
    return;
  }
  const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  const recognition = new Recognition();
  recognition.lang = "en-US";
  recognition.interimResults = false;
  recognition.maxAlternatives = 1;
  recognition.onresult = (event) => {
    const transcript = event.results[0][0].transcript;
    const field = document.getElementById(targetId);
    field.value = field.value ? `${field.value} ${transcript}` : transcript;
  };
  recognition.start();
}

document.querySelectorAll("[data-dictate-target]").forEach((button) => {
  button.addEventListener("click", () => startDictation(button.dataset.dictateTarget));
});

async function transcribeBlob(blob, filename) {
  audioStatus.textContent = "Transcribing audio...";
  try {
    const response = await fetch(`/api/transcribe-audio?filename=${encodeURIComponent(filename)}`, {
      method: "POST",
      headers: { "Content-Type": blob.type || "audio/webm" },
      body: blob
    });
    const payload = await response.json();
    if (!response.ok) {
      throw new Error(payload.error || "Transcription failed");
    }
    const description = document.getElementById("description");
    description.value = description.value
      ? `${description.value}\n${payload.text}`.trim()
      : payload.text;
    audioStatus.textContent = "Transcription added to description.";
  } catch (error) {
    audioStatus.textContent = error.message;
  }
}

recordAudioBtn.addEventListener("click", async () => {
  if (!state.mediaRecorder || state.mediaRecorder.state === "inactive") {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    state.audioChunks = [];
    state.mediaRecorder = new MediaRecorder(stream);
    state.mediaRecorder.ondataavailable = (event) => {
      if (event.data.size > 0) {
        state.audioChunks.push(event.data);
      }
    };
    state.mediaRecorder.onstop = async () => {
      const blob = new Blob(state.audioChunks, { type: state.mediaRecorder.mimeType || "audio/webm" });
      for (const track of stream.getTracks()) {
        track.stop();
      }
      await transcribeBlob(blob, "recording.webm");
      recordAudioBtn.textContent = "Record";
    };
    state.mediaRecorder.start();
    recordAudioBtn.textContent = "Stop Recording";
    audioStatus.textContent = "Recording...";
    return;
  }

  if (state.mediaRecorder.state === "recording") {
    state.mediaRecorder.stop();
  }
});

audioUpload.addEventListener("change", async () => {
  const file = audioUpload.files?.[0];
  if (!file) {
    return;
  }
  await transcribeBlob(file, file.name);
  audioUpload.value = "";
});

async function handlePaymentReturnParams() {
  const params = new URLSearchParams(window.location.search);
  const paymentState = params.get("payment");
  const transactionId = params.get("transaction");
  const sessionId = params.get("session_id");

  if (paymentState === "success") {
    if (transactionId && sessionId) {
      try {
        await request(`/api/transactions/${transactionId}/verify-payment`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sessionId })
        });
        showFlashMessage("Payment verified.");
      } catch (error) {
        showFlashMessage(error.message || "Payment returned, but verification is still pending.");
      }
    } else {
      showFlashMessage("Payment submitted. Waiting for verification.");
    }
    focusTransactionsTab();
  } else if (paymentState === "cancelled") {
    showFlashMessage("Payment was cancelled. Transaction remains awaiting payment.");
    focusTransactionsTab();
    if (transactionId) {
      try {
        await request(`/api/transactions/${transactionId}/payment-cancelled`, {
          method: "POST"
        });
      } catch (error) {
        console.error(error);
      }
    }
  } else {
    return;
  }

  if (transactionId) {
    state.selectedTransactionItemId = "";
  }

  window.history.replaceState({}, document.title, window.location.pathname);
}

setDefaultCapturedAt();
setStatusFromQuantity();
setActiveTab(state.currentTab);
syncFormModes();
handlePaymentReturnParams()
  .then(() => refreshState())
  .catch((error) => {
    console.error(error);
    alert(error.message);
  });

window.setInterval(() => {
  refreshState().catch((error) => console.error("Periodic refresh failed:", error));
}, 30000);
