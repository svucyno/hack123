import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { apiFetch } from "@/lib/api";
import { COOKIE_NAMES } from "@/lib/cookies";
import { redirect, redirectWithFlash } from "@/lib/http";
import { renderTemplate } from "@/lib/template";

import { authFailureRedirect, requireSession } from "@/server/session";
import { getString } from "@/server/utils";
import { tForRequest } from "@/server/i18n";

function asArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function asString(value: unknown, fallback = ""): string {
  if (typeof value === "string") {
    return value;
  }
  if (value === null || value === undefined) {
    return fallback;
  }
  return String(value);
}

function asNumber(value: unknown, fallback = 0): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function asBoolean(value: unknown): boolean {
  if (typeof value === "boolean") {
    return value;
  }
  return ["1", "true", "yes", "on"].includes(asString(value).trim().toLowerCase());
}

function normalizeSortOptions(value: unknown): Array<{ value: string; label: string }> {
  const options = Array.isArray(value) ? value : [];
  return options
    .map((option) => {
      const record = asRecord(option);
      return {
        value: asString(record.value, "newest"),
        label: asString(record.label, asString(record.value, "Newest")),
      };
    })
    .filter((option) => option.value);
}

function normalizeMarketplaceCrop(value: unknown): Record<string, unknown> {
  const crop = asRecord(value);
  const farmerName = asString(crop.farmer_name, "Farmer");
  const tags = Array.isArray(crop.tags) ? crop.tags.map((tag) => asString(tag)).filter(Boolean) : [];

  return {
    ...crop,
    id: asString(crop.id),
    farmer_id: asString(crop.farmer_id),
    name: asString(crop.name, "Untitled crop"),
    category: asString(crop.category, "General"),
    image_url: asString(crop.image_url),
    village: asString(crop.village),
    farmer_city: asString(crop.farmer_city),
    district: asString(crop.district),
    state: asString(crop.state),
    price: asNumber(crop.price, 0),
    unit: asString(crop.unit, "kg"),
    stock_status: asString(crop.stock_status, "Available"),
    quantity: asNumber(crop.quantity, 0),
    delivery_eta: asString(crop.delivery_eta, "2-4 days"),
    same_day_available: asBoolean(crop.same_day_available),
    price_trend: asString(crop.price_trend, "Stable"),
    demand_score: asNumber(crop.demand_score, 0),
    min_order_quantity: asNumber(crop.min_order_quantity, 1),
    is_verified: asBoolean(crop.is_verified),
    organic: asBoolean(crop.organic),
    farmer_name: farmerName,
    farmer_initial: farmerName.trim().charAt(0).toUpperCase() || "F",
    tags,
  };
}

export async function marketplacePage(request: NextRequest): Promise<NextResponse> {
  const sessionOrResponse = requireSession(request);
  if (sessionOrResponse instanceof NextResponse) {
    return sessionOrResponse;
  }

  const search = request.nextUrl.search || "";
  const { response, data } = await apiFetch(`/api/marketplace/crops${search}`, { method: "GET" }, sessionOrResponse.token);
  const authRedirect = authFailureRedirect(request, response.status);
  if (authRedirect) {
    return authRedirect;
  }
  if (!response.ok || !data.success) {
    return redirectWithFlash(request, "/", "error", String(data.message || "Unable to load marketplace"));
  }

  const welcomeMessage = sessionOrResponse.hasVisited
    ? tForRequest(request, "marketplace.kicker.welcome_back", "Welcome Back to the network")
    : tForRequest(request, "marketplace.kicker.welcome", "Welcome to the network");

  const rendered = renderTemplate(
    request,
    "index.html",
    {
      crops: asArray(data.crops).map(normalizeMarketplaceCrop),
      query: request.nextUrl.searchParams.get("query") || "",
      state: request.nextUrl.searchParams.get("state") || "",
      district: request.nextUrl.searchParams.get("district") || "",
      category: request.nextUrl.searchParams.get("category") || "",
      price_min: request.nextUrl.searchParams.get("price_min") || "",
      price_max: request.nextUrl.searchParams.get("price_max") || "",
      verified_only: request.nextUrl.searchParams.get("verified_only") === "true",
      sort: request.nextUrl.searchParams.get("sort") || "newest",
      categories: asArray(data.categories).map((item) => asString(item)).filter(Boolean),
      states: asArray(data.states).map((item) => asString(item)).filter(Boolean),
      stats: asRecord(data.stats),
      sort_options: normalizeSortOptions(data.sort_options),
      welcome_message: welcomeMessage,
    },
    "marketplace",
  );
  rendered.cookies.set(COOKIE_NAMES.hasVisited, "1", {
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });
  return rendered;
}

export async function farmerProfilePage(request: NextRequest, farmerId: string): Promise<NextResponse> {
  const { response, data } = await apiFetch(`/api/marketplace/farmers/${farmerId}/profile`, { method: "GET" });
  if (!response.ok || !data.success) {
    return redirectWithFlash(request, "/marketplace", "error", String(data.message || "Farmer not found"));
  }

  const farmer = asRecord(data.farmer);
  const fullName = String(farmer.full_name || farmer.username || "Farmer");
  const renderedFarmer = {
    ...farmer,
    full_name: fullName,
  };

  return renderTemplate(
    request,
    "farmer_profile.html",
    {
      farmer: renderedFarmer,
      crops: asArray(data.crops),
      reviews: asArray(data.reviews),
      avg_rating: Number(data.avg_rating || 0),
    },
    "farmer_profile",
  );
}

export async function placeOrderAction(request: NextRequest): Promise<NextResponse> {
  const sessionOrResponse = requireSession(request, ["customer"]);
  if (sessionOrResponse instanceof NextResponse) {
    return sessionOrResponse;
  }

  const formData = await request.formData();
  const { response, data } = await apiFetch(
    "/api/orders/place",
    {
      method: "POST",
      body: {
        crop_id: getString(formData, "crop_id"),
        quantity: getString(formData, "quantity"),
        buyer_note: getString(formData, "buyer_note"),
        delivery_address: getString(formData, "delivery_address"),
        fulfillment_window: getString(formData, "fulfillment_window"),
        payment_method: getString(formData, "payment_method") || "UPI",
        is_bulk_order: getString(formData, "is_bulk_order") === "on",
      },
    },
    sessionOrResponse.token,
  );
  const authRedirect = authFailureRedirect(request, response.status);
  if (authRedirect) {
    return authRedirect;
  }
  if (!response.ok || !data.success) {
    return redirectWithFlash(request, "/marketplace", "error", String(data.message || "Unable to place order"));
  }
  return redirect(request, String(data.redirect || `/checkout/${data.order_id}`));
}
