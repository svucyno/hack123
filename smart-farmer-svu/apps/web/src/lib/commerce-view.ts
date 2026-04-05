type LooseRecord = Record<string, unknown>;

type MarketplaceFilters = {
  query: string;
  category: string;
  state: string;
  district: string;
  priceMin: string;
  priceMax: string;
  verifiedOnly: boolean;
  sort: string;
  deliverySpeed: string;
  stockBand: string;
  view: string;
};

type OrderWorkspaceFilters = {
  query: string;
  status: string;
  payment: string;
  tab: string;
  sort: string;
};

function asArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

function asRecord(value: unknown): LooseRecord {
  return value && typeof value === "object" ? (value as LooseRecord) : {};
}

function asString(value: unknown, fallback = ""): string {
  if (typeof value === "string") {
    return value;
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }
  return fallback;
}

function asNumber(value: unknown, fallback = 0): number {
  const numberValue = typeof value === "number" ? value : Number.parseFloat(asString(value));
  return Number.isFinite(numberValue) ? numberValue : fallback;
}

function round(value: number, digits = 1): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function slugify(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

function buildMarketplaceHref(filters: MarketplaceFilters, patch: Partial<MarketplaceFilters>): string {
  const next = { ...filters, ...patch };
  const params = new URLSearchParams();
  if (next.query) params.set("query", next.query);
  if (next.category) params.set("category", next.category);
  if (next.state) params.set("state", next.state);
  if (next.district) params.set("district", next.district);
  if (next.priceMin) params.set("price_min", next.priceMin);
  if (next.priceMax) params.set("price_max", next.priceMax);
  if (next.verifiedOnly) params.set("verified_only", "true");
  if (next.sort && next.sort !== "newest") params.set("sort", next.sort);
  if (next.deliverySpeed) params.set("delivery_speed", next.deliverySpeed);
  if (next.stockBand) params.set("stock_band", next.stockBand);
  if (next.view && next.view !== "grid") params.set("view", next.view);
  const query = params.toString();
  return query ? `/marketplace?${query}` : "/marketplace";
}

export function normalizeMarketplaceFilters(searchParams: URLSearchParams): MarketplaceFilters {
  return {
    query: searchParams.get("query") || "",
    category: searchParams.get("category") || "",
    state: searchParams.get("state") || "",
    district: searchParams.get("district") || "",
    priceMin: searchParams.get("price_min") || "",
    priceMax: searchParams.get("price_max") || "",
    verifiedOnly: searchParams.get("verified_only") === "true",
    sort: searchParams.get("sort") || "newest",
    deliverySpeed: searchParams.get("delivery_speed") || "",
    stockBand: searchParams.get("stock_band") || "",
    view: searchParams.get("view") || "grid",
  };
}

export function buildMarketplaceExperience(
  cropsInput: unknown,
  statsInput: unknown,
  filters: MarketplaceFilters,
  customerSummaryInput?: unknown,
) {
  const rawCrops = asArray<LooseRecord>(cropsInput);
  const stats = asRecord(statsInput);
  const customerSummary = asRecord(customerSummaryInput);

  const enrichedCrops = rawCrops.map((crop, index) => {
    const availableQuantity = asNumber(crop.available_quantity || crop.quantity || crop.stock || 0);
    const pricePerUnit = asNumber(crop.price_per_unit || crop.price || crop.unit_price || 0);
    const unitLabel = asString(crop.unit || crop.measurement_unit || "kg") || "kg";
    const stockHealth = availableQuantity >= 120 ? "high" : availableQuantity >= 40 ? "medium" : "low";
    const stockHealthLabel = stockHealth === "high" ? "Healthy stock" : stockHealth === "medium" ? "Balanced stock" : "Limited stock";
    const deliveryDays = Math.max(1, Math.min(6, index % 5 + 1));
    const deliverySpeed = deliveryDays <= 2 ? "express" : deliveryDays <= 4 ? "standard" : "scheduled";
    const deliverySpeedLabel = deliverySpeed === "express" ? "Fast dispatch" : deliverySpeed === "standard" ? "Standard lane" : "Scheduled harvest";
    const rating = round(asNumber(crop.avg_rating || crop.rating || 4.1, 4.1), 1);
    const reviewCount = Math.max(1, Math.floor(asNumber(crop.review_count || 8 + index * 3)));
    const trustScore = Math.min(99, Math.max(61, Math.round(rating * 20 + (crop.is_verified ? 7 : 0))));
    const priceBand = pricePerUnit >= 120 ? "premium" : pricePerUnit >= 50 ? "core" : "value";
    const inventoryValue = round(availableQuantity * pricePerUnit, 2);
    const searchTerms = [
      asString(crop.name),
      asString(crop.category),
      asString(crop.state),
      asString(crop.district),
      asString(crop.farmer_name || crop.farmer?.full_name),
    ]
      .filter(Boolean)
      .join(" ");

    return {
      ...crop,
      available_quantity: availableQuantity,
      price_per_unit: pricePerUnit,
      unit_label: unitLabel,
      stock_health: stockHealth,
      stock_health_label: stockHealthLabel,
      delivery_speed,
      delivery_speed_label: deliverySpeedLabel,
      delivery_eta_label: `${deliveryDays} day${deliveryDays === 1 ? "" : "s"}`,
      review_count: reviewCount,
      rating,
      trust_score: trustScore,
      trust_label: trustScore >= 88 ? "High trust" : trustScore >= 75 ? "Good trust" : "Emerging trust",
      inventory_value: inventoryValue,
      inventory_value_label: `Rs.${inventoryValue.toFixed(0)}`,
      price_label: `Rs.${pricePerUnit.toFixed(2)}/${unitLabel}`,
      price_band: priceBand,
      listing_code: asString(crop.listing_code || `SF-${slugify(asString(crop.name, "crop"))}-${String(index + 1).padStart(3, "0")}`),
      search_terms: searchTerms,
      packaging_default: availableQuantity >= 100 ? "Crates" : "Bags",
    };
  });

  const filteredCrops = enrichedCrops.filter((crop) => {
    if (filters.deliverySpeed && crop.delivery_speed !== filters.deliverySpeed) {
      return false;
    }
    if (filters.stockBand && crop.stock_health !== filters.stockBand) {
      return false;
    }
    return true;
  });

  const categoryMap = new Map<string, number>();
  const stateMap = new Map<string, number>();
  let expressCount = 0;
  let verifiedCount = 0;
  let totalInventoryValue = 0;

  filteredCrops.forEach((crop) => {
    const category = asString(crop.category, "General");
    const state = asString(crop.state, "Unknown");
    categoryMap.set(category, (categoryMap.get(category) || 0) + 1);
    stateMap.set(state, (stateMap.get(state) || 0) + 1);
    if (crop.delivery_speed === "express") expressCount += 1;
    if (crop.is_verified) verifiedCount += 1;
    totalInventoryValue += asNumber(crop.inventory_value);
  });

  const featuredCategories = Array.from(categoryMap.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([name, count]) => ({
      name,
      count,
      href: buildMarketplaceHref(filters, { category: filters.category === name ? "" : name }),
      active: filters.category === name,
    }));

  const quickFilters = [
    {
      key: "verified",
      label: "Verified only",
      count: verifiedCount,
      href: buildMarketplaceHref(filters, { verifiedOnly: !filters.verifiedOnly }),
      active: filters.verifiedOnly,
    },
    {
      key: "express",
      label: "Express delivery",
      count: expressCount,
      href: buildMarketplaceHref(filters, { deliverySpeed: filters.deliverySpeed === "express" ? "" : "express" }),
      active: filters.deliverySpeed === "express",
    },
    {
      key: "high-stock",
      label: "Healthy stock",
      count: filteredCrops.filter((crop) => crop.stock_health === "high").length,
      href: buildMarketplaceHref(filters, { stockBand: filters.stockBand === "high" ? "" : "high" }),
      active: filters.stockBand === "high",
    },
    {
      key: "scheduled",
      label: "Scheduled harvest",
      count: filteredCrops.filter((crop) => crop.delivery_speed === "scheduled").length,
      href: buildMarketplaceHref(filters, { deliverySpeed: filters.deliverySpeed === "scheduled" ? "" : "scheduled" }),
      active: filters.deliverySpeed === "scheduled",
    },
  ];

  const spotlightCrops = filteredCrops.slice(0, 3);
  const stateLeaders = Array.from(stateMap.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([name, count]) => ({ name, count }));

  const supplySignals = [
    {
      label: "Inventory value",
      value: `Rs.${totalInventoryValue.toFixed(0)}`,
      note: "Estimated live value across visible listings",
    },
    {
      label: "Fast lanes",
      value: `${expressCount}`,
      note: "Listings that can move in 48 hours or less",
    },
    {
      label: "Verified trust",
      value: `${verifiedCount}`,
      note: "Growers with stronger trust and profile signals",
    },
  ];

  const demandBoard = [
    {
      label: "Quick restock",
      note: "Low-friction orders for kitchens and retailers",
      items: filteredCrops.filter((crop) => crop.delivery_speed === "express").slice(0, 3),
    },
    {
      label: "Bulk-friendly",
      note: "Higher stock listings suitable for repeat fulfillment",
      items: filteredCrops.filter((crop) => crop.stock_health === "high").slice(0, 3),
    },
    {
      label: "Premium picks",
      note: "Higher-price produce with stronger trust signals",
      items: filteredCrops.filter((crop) => crop.price_band === "premium").slice(0, 3),
    },
  ];

  const recommendationPanels = [
    {
      title: "Coverage snapshot",
      value: String(stats.total_results || filteredCrops.length),
      note: `${stateLeaders.length} active sourcing zone${stateLeaders.length === 1 ? "" : "s"}`,
      chips: stateLeaders.map((item) => `${item.name} (${item.count})`),
    },
    {
      title: "Customer momentum",
      value: String(customerSummary.active_count || customerSummary.total_orders || 0),
      note: "Open customer orders tied to the current session",
      chips: [
        `Delivered ${customerSummary.completed_count || 0}`,
        `Cancelled ${customerSummary.cancelled_count || 0}`,
      ],
    },
    {
      title: "Category spread",
      value: String(featuredCategories.length),
      note: "Product groups visible in your current filtered view",
      chips: featuredCategories.slice(0, 3).map((item) => item.name),
    },
  ];

  return {
    filters,
    crops: filteredCrops,
    featured_categories: featuredCategories,
    quick_filters: quickFilters,
    spotlight_crops: spotlightCrops,
    supply_signals: supplySignals,
    demand_board: demandBoard,
    recommendation_panels: recommendationPanels,
    marketplace_stats: {
      total_results: filteredCrops.length,
      verified_results: verifiedCount,
      fast_lane_results: expressCount,
      inventory_value: totalInventoryValue,
    },
    delivery_speed: filters.deliverySpeed,
    stock_band: filters.stockBand,
    view_mode: filters.view,
    active_order_count: Number(customerSummary.active_count || 0),
  };
}

export function normalizeOrderWorkspaceFilters(searchParams: URLSearchParams): OrderWorkspaceFilters {
  return {
    query: searchParams.get("query") || "",
    status: searchParams.get("status") || "",
    payment: searchParams.get("payment") || "",
    tab: searchParams.get("tab") || "overview",
    sort: searchParams.get("sort") || "latest",
  };
}

function orderMatchesFilters(order: LooseRecord, filters: OrderWorkspaceFilters): boolean {
  const search = filters.query.trim().toLowerCase();
  const haystack = [
    asString(order.crop_name),
    asString(order.farmer_name),
    asString(order.invoice_number),
    asString(order.tracking_code),
    asString(order.status),
  ]
    .join(" ")
    .toLowerCase();

  if (search && !haystack.includes(search)) {
    return false;
  }
  if (filters.status && asString(order.status) !== filters.status) {
    return false;
  }
  if (filters.payment && asString(order.payment_status) !== filters.payment) {
    return false;
  }
  return true;
}

function enrichOrder(order: LooseRecord, index: number) {
  const status = asString(order.status, "pending");
  const paymentStatus = asString(order.payment_status, "pending");
  const totalPrice = asNumber(order.total_price || order.total || 0);
  const quantity = asNumber(order.quantity || 0);
  const progressPercent = status === "Delivered"
    ? 100
    : status === "Out for Delivery"
      ? 88
      : status === "Shipped"
        ? 72
        : status === "Packed"
          ? 52
          : status === "Order Confirmed"
            ? 34
            : status === "Paid"
              ? 24
              : 12;
  const riskBand = paymentStatus === "confirmed" && progressPercent >= 70
    ? "stable"
    : paymentStatus === "confirmed"
      ? "watch"
      : "action";
  const nextAction = paymentStatus !== "confirmed"
    ? "Complete payment"
    : status === "Delivered"
      ? "Submit review"
      : "Track dispatch";

  const tracking = asArray<LooseRecord>(order.tracking);
  const latestTracking = tracking[tracking.length - 1] || {};

  return {
    ...order,
    total_price: totalPrice,
    quantity,
    progress_percent: progressPercent,
    payment_badge: paymentStatus === "confirmed" ? "Payment locked" : paymentStatus === "pending" ? "Awaiting payment" : paymentStatus,
    risk_band: riskBand,
    risk_band_label: riskBand === "stable" ? "Stable" : riskBand === "watch" ? "Watch" : "Needs action",
    next_action: nextAction,
    delivery_brief: asString(order.current_location || latestTracking.location || order.estimated_delivery || "Awaiting movement"),
    timeline_events: tracking.length,
    order_score: Math.round(totalPrice + progressPercent + index),
  };
}

export function buildOrderWorkspace(
  activeOrdersInput: unknown,
  historyInput: unknown,
  summaryInput: unknown,
  filters: OrderWorkspaceFilters,
) {
  const activeOrders = asArray<LooseRecord>(activeOrdersInput).map(enrichOrder);
  const orderHistory = asArray<LooseRecord>(historyInput).map(enrichOrder);
  const summary = asRecord(summaryInput);

  const filteredActiveOrders = activeOrders.filter((order) => orderMatchesFilters(order, filters));
  const filteredOrderHistory = orderHistory.filter((order) => orderMatchesFilters(order, filters));

  const sorter = (left: LooseRecord, right: LooseRecord) => {
    if (filters.sort === "amount") {
      return asNumber(right.total_price) - asNumber(left.total_price);
    }
    if (filters.sort === "progress") {
      return asNumber(right.progress_percent) - asNumber(left.progress_percent);
    }
    return asNumber(right.order_score) - asNumber(left.order_score);
  };

  filteredActiveOrders.sort(sorter);
  filteredOrderHistory.sort(sorter);

  const boardColumns = [
    {
      key: "payment",
      title: "Payments to close",
      note: "Orders that still need payment confirmation",
      items: filteredActiveOrders.filter((order) => asString(order.payment_status) !== "confirmed").slice(0, 4),
    },
    {
      key: "shipping",
      title: "Moving now",
      note: "Orders currently in dispatch or last-mile motion",
      items: filteredActiveOrders.filter((order) => ["Shipped", "Out for Delivery"].includes(asString(order.status))).slice(0, 4),
    },
    {
      key: "review",
      title: "Ready for review",
      note: "Delivered orders ready for invoice or feedback follow-up",
      items: filteredOrderHistory.filter((order) => asString(order.status) === "Delivered").slice(0, 4),
    },
  ];

  const paymentWatchlist = filteredActiveOrders
    .filter((order) => asString(order.payment_status) !== "confirmed")
    .slice(0, 5)
    .map((order) => ({
      id: order.id,
      crop_name: order.crop_name,
      amount: `Rs.${asNumber(order.total_price).toFixed(0)}`,
      eta: order.estimated_delivery,
      next_action: order.next_action,
    }));

  const workspaceMetrics = [
    {
      label: "Active orders",
      value: String(summary.active_count || filteredActiveOrders.length),
      note: "Orders still progressing through payment or delivery",
    },
    {
      label: "Delivered",
      value: String(summary.completed_count || filteredOrderHistory.filter((order) => asString(order.status) === "Delivered").length),
      note: "Orders that reached completion successfully",
    },
    {
      label: "Pending payments",
      value: String(paymentWatchlist.length),
      note: "Orders that need payment confirmation or verification",
    },
    {
      label: "Visible GMV",
      value: `Rs.${[
        ...filteredActiveOrders,
        ...filteredOrderHistory,
      ].reduce((total, order) => total + asNumber(order.total_price), 0).toFixed(0)}`,
      note: "Combined order value in the current filtered workspace",
    },
  ];

  return {
    active_orders: filteredActiveOrders,
    order_history: filteredOrderHistory,
    board_columns: boardColumns,
    payment_watchlist: paymentWatchlist,
    workspace_metrics: workspaceMetrics,
    filters,
    order_search: filters.query,
    selected_status: filters.status,
    selected_payment: filters.payment,
    selected_tab: filters.tab,
    selected_sort: filters.sort,
  };
}
