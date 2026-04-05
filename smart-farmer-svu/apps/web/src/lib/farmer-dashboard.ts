import type { NextRequest } from "next/server";

type Dict = Record<string, unknown>;

type Crop = Dict & {
  name?: string;
  category?: string;
  quantity?: number | string;
  price?: number | string;
  district?: string;
  state?: string;
  harvest_date?: string;
  quality?: string;
  is_verified?: boolean;
};

type Order = Dict & {
  id?: string;
  status?: string;
  total_price?: number | string;
  quantity?: number | string;
  crop_name?: string;
  customer_name?: string;
  created_at?: string;
  delivery_date?: string;
  district?: string;
  state?: string;
};

const STATUS_BUCKETS = ["pending", "confirmed", "packed", "shipped", "delivered"] as const;

function asNumber(value: unknown): number {
  const n = Number(value || 0);
  return Number.isFinite(n) ? n : 0;
}

function asString(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "general";
}

function normalizeStatus(value: string): string {
  const status = value.trim().toLowerCase();
  if (!status) return "pending";
  if (status.includes("confirm")) return "confirmed";
  if (status.includes("pack")) return "packed";
  if (status.includes("ship") || status.includes("delivery")) return "shipped";
  if (status.includes("deliver") || status.includes("complete")) return "delivered";
  if (status.includes("cancel")) return "cancelled";
  return status;
}

function humanStatus(value: string): string {
  return value
    .split(/[-_\s]+/)
    .map((chunk) => chunk.charAt(0).toUpperCase() + chunk.slice(1))
    .join(" ");
}

function cropStockHealth(quantity: number): { label: string; tone: string } {
  if (quantity >= 250) return { label: "High stock", tone: "success" };
  if (quantity >= 80) return { label: "Balanced stock", tone: "info" };
  if (quantity > 0) return { label: "Low stock", tone: "warning" };
  return { label: "Out of stock", tone: "danger" };
}

function upcomingDays(dateValue: string): number | null {
  if (!dateValue) return null;
  const date = new Date(dateValue);
  if (Number.isNaN(date.getTime())) return null;
  const now = new Date();
  const diff = date.getTime() - now.getTime();
  return Math.round(diff / (1000 * 60 * 60 * 24));
}

function enrichCrop(crop: Crop): Dict {
  const quantity = asNumber(crop.quantity);
  const price = asNumber(crop.price);
  const inventoryValue = quantity * price;
  const health = cropStockHealth(quantity);
  const harvestCountdown = upcomingDays(asString(crop.harvest_date));
  const region = [asString(crop.district), asString(crop.state)].filter(Boolean).join(", ") || "Region pending";
  return {
    ...crop,
    price,
    quantity,
    inventory_value: inventoryValue,
    listing_code: String((crop as Dict).listing_code || `${slugify(asString(crop.name, 'crop'))}-${Math.max(100, Math.round(inventoryValue || quantity || 1))}`),
    stock_health_label: health.label,
    stock_health_tone: health.tone,
    harvest_countdown: harvestCountdown,
    region,
    quality_label: asString(crop.quality, "Standard"),
  };
}

function enrichOrder(order: Order): Dict {
  const total = asNumber(order.total_price);
  const quantity = asNumber(order.quantity);
  const normalizedStatus = normalizeStatus(asString(order.status, "pending"));
  return {
    ...order,
    total_price: total,
    quantity,
    normalized_status: normalizedStatus,
    status_label: humanStatus(normalizedStatus),
    fulfillment_label: quantity >= 250 ? "Bulk" : quantity >= 75 ? "Wholesale" : "Retail",
    route_label: [asString(order.district), asString(order.state)].filter(Boolean).join(", ") || "Delivery route pending",
  };
}

function sortCrops(crops: Dict[], sort: string): Dict[] {
  const next = [...crops];
  switch (sort) {
    case "value":
      return next.sort((a, b) => asNumber(b.inventory_value) - asNumber(a.inventory_value));
    case "stock":
      return next.sort((a, b) => asNumber(b.quantity) - asNumber(a.quantity));
    case "harvest":
      return next.sort((a, b) => asNumber(a.harvest_countdown) - asNumber(b.harvest_countdown));
    default:
      return next.sort((a, b) => String(a.name || "").localeCompare(String(b.name || "")));
  }
}

function groupOrders(orders: Dict[]) {
  return STATUS_BUCKETS.map((bucket) => ({
    key: bucket,
    label: humanStatus(bucket),
    count: orders.filter((order) => order.normalized_status === bucket).length,
    total_value: orders.filter((order) => order.normalized_status === bucket).reduce((sum, order) => sum + asNumber(order.total_price), 0),
    orders: orders.filter((order) => order.normalized_status === bucket).slice(0, 6),
  }));
}

export function buildFarmerDashboardView(request: NextRequest, rawCrops: unknown[], rawOrders: unknown[], metrics: Dict = {}) {
  const cropQuery = request.nextUrl.searchParams.get("crop_query")?.trim() || "";
  const stockFilter = request.nextUrl.searchParams.get("stock") || "all";
  const orderStatus = request.nextUrl.searchParams.get("status") || "all";
  const sort = request.nextUrl.searchParams.get("sort") || "value";

  const crops = (Array.isArray(rawCrops) ? rawCrops : []).map((crop) => enrichCrop((crop || {}) as Crop));
  const orders = (Array.isArray(rawOrders) ? rawOrders : []).map((order) => enrichOrder((order || {}) as Order));

  let filteredCrops = crops.filter((crop) => {
    const haystack = `${String(crop.name || "")} ${String(crop.category || "")} ${String(crop.region || "")}`.toLowerCase();
    if (cropQuery && !haystack.includes(cropQuery.toLowerCase())) return false
    return true;
  });

  if (stockFilter === "high") filteredCrops = filteredCrops.filter((crop) => asNumber(crop.quantity) >= 250);
  if (stockFilter === "balanced") filteredCrops = filteredCrops.filter((crop) => asNumber(crop.quantity) >= 80 && asNumber(crop.quantity) < 250);
  if (stockFilter === "low") filteredCrops = filteredCrops.filter((crop) => asNumber(crop.quantity) > 0 && asNumber(crop.quantity) < 80);

  filteredCrops = sortCrops(filteredCrops, sort);

  let filteredOrders = orders;
  if (orderStatus !== "all") {
    filteredOrders = filteredOrders.filter((order) => String(order.normalized_status) === orderStatus);
  }

  const inventoryValue = crops.reduce((sum, crop) => sum + asNumber(crop.inventory_value), 0);
  const openOrders = orders.filter((order) => !["delivered", "cancelled"].includes(String(order.normalized_status))).length;
  const avgTicket = orders.length ? orders.reduce((sum, order) => sum + asNumber(order.total_price), 0) / orders.length : 0;
  const readyToHarvest = crops.filter((crop) => {
    const days = crop.harvest_countdown as number | null;
    return typeof days === "number" && days <= 7;
  }).length;

  const dashboardCards = [
    { label: "Inventory value", value: `₹${Math.round(inventoryValue).toLocaleString('en-IN')}`, hint: `${filteredCrops.length} visible listings`, tone: "soil" },
    { label: "Open orders", value: String(openOrders), hint: `${filteredOrders.length} in current view`, tone: "leaf" },
    { label: "Average ticket", value: `₹${Math.round(avgTicket).toLocaleString('en-IN')}`, hint: `${orders.length} total orders`, tone: "grain" },
    { label: "Ready in 7 days", value: String(readyToHarvest), hint: "Harvest window tracker", tone: "clay" },
  ];

  const districtMap = new Map<string, number>();
  crops.forEach((crop) => {
    const key = String(crop.region || "Region pending");
    districtMap.set(key, (districtMap.get(key) || 0) + 1);
  });
  const districtBreakdown = Array.from(districtMap.entries())
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  const harvestForecast = crops
    .filter((crop) => typeof crop.harvest_countdown === 'number')
    .sort((a, b) => asNumber(a.harvest_countdown) - asNumber(b.harvest_countdown))
    .slice(0, 5)
    .map((crop) => ({
      name: crop.name,
      quantity: crop.quantity,
      region: crop.region,
      in_days: crop.harvest_countdown,
    }));

  const pendingActions = [
    { title: "Review low-stock listings", count: crops.filter((crop) => String(crop.stock_health_tone) === 'warning').length, href: "/farmer/dashboard?stock=low" },
    { title: "Confirm pending orders", count: orders.filter((order) => String(order.normalized_status) === 'pending').length, href: "/farmer/dashboard?status=pending" },
    { title: "Schedule harvest dispatch", count: readyToHarvest, href: "/farmer/dashboard?sort=harvest" },
  ];

  return {
    filters: { crop_query: cropQuery, stock: stockFilter, status: orderStatus, sort },
    filtered_crops: filteredCrops,
    filtered_orders: filteredOrders,
    dashboard_cards: dashboardCards,
    order_board: groupOrders(filteredOrders),
    district_breakdown: districtBreakdown,
    harvest_forecast: harvestForecast,
    pending_actions: pendingActions,
    metrics_snapshot: {
      fulfillment_rate: Number(metrics.fulfillment_rate || (orders.length ? ((orders.filter((order) => String(order.normalized_status) === 'delivered').length / orders.length) * 100).toFixed(0) : 0)),
      repeat_buyers: Number(metrics.repeat_buyers || Math.max(0, Math.round(orders.length / 3))),
      avg_rating: Number(metrics.avg_rating || 4.6),
    },
  };
}
