import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { apiFetch } from "@/lib/api";
import { buildMarketplaceExperience, normalizeMarketplaceFilters } from "@/lib/commerce-view";
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

export async function marketplacePage(request: NextRequest): Promise<NextResponse> {
  const sessionOrResponse = requireSession(request);
  if (sessionOrResponse instanceof NextResponse) {
    return sessionOrResponse;
  }

  const filters = normalizeMarketplaceFilters(request.nextUrl.searchParams);
  const search = request.nextUrl.search || "";
  const { response, data } = await apiFetch(`/api/marketplace/crops${search}`, { method: "GET" }, sessionOrResponse.token);
  const authRedirect = authFailureRedirect(request, response.status);
  if (authRedirect) {
    return authRedirect;
  }
  if (!response.ok || !data.success) {
    return redirectWithFlash(request, "/", "error", String(data.message || "Unable to load marketplace"));
  }

  let customerSummary: Record<string, unknown> = {};
  if (sessionOrResponse.user?.role === "customer") {
    const orderResult = await apiFetch("/api/orders/my", { method: "GET" }, sessionOrResponse.token);
    if (orderResult.response.ok && orderResult.data.success) {
      customerSummary = asRecord(orderResult.data.summary);
    }
  }

  const experience = buildMarketplaceExperience(asArray(data.crops), asRecord(data.stats), filters, customerSummary);
  const welcomeMessage = sessionOrResponse.hasVisited
    ? tForRequest(request, "marketplace.kicker.welcome_back", "Welcome Back to the network")
    : tForRequest(request, "marketplace.kicker.welcome", "Welcome to the network");

  const rendered = renderTemplate(
    request,
    "index.html",
    {
      ...experience,
      query: filters.query,
      state: filters.state,
      district: filters.district,
      category: filters.category,
      price_min: filters.priceMin,
      price_max: filters.priceMax,
      verified_only: filters.verifiedOnly,
      sort: filters.sort,
      categories: asArray(data.categories),
      states: asArray(data.states),
      stats: asRecord(data.stats),
      sort_options: asArray(data.sort_options),
      welcome_message: welcomeMessage,
      customer_summary: customerSummary,
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
  const quantityValue = Math.max(1, Number.parseFloat(getString(formData, "quantity") || "1"));
  const deliveryAddress = getString(formData, "delivery_address");
  if (!deliveryAddress) {
    return redirectWithFlash(request, "/marketplace", "error", "Add a delivery address before placing the order");
  }

  const { response, data } = await apiFetch(
    "/api/orders/place",
    {
      method: "POST",
      body: {
        crop_id: getString(formData, "crop_id"),
        quantity: String(quantityValue),
        buyer_note: getString(formData, "buyer_note"),
        delivery_address: deliveryAddress,
        fulfillment_window: getString(formData, "fulfillment_window"),
        desired_delivery_date: getString(formData, "desired_delivery_date"),
        payment_method: getString(formData, "payment_method") || "UPI",
        payment_intent: getString(formData, "payment_intent") || "pay_now",
        quality_preference: getString(formData, "quality_preference") || "standard",
        packaging_type: getString(formData, "packaging_type") || "bags",
        preferred_contact_mode: getString(formData, "preferred_contact_mode") || "chat",
        delivery_instructions: getString(formData, "delivery_instructions"),
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
