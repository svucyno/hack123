type Dict = Record<string, unknown>;

function asNumber(value: unknown): number {
  const n = Number(value || 0);
  return Number.isFinite(n) ? n : 0;
}

function asString(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function buildReviewBreakdown(reviews: Dict[]) {
  const counts = [5, 4, 3, 2, 1].map((rating) => {
    const count = reviews.filter((review) => asNumber(review.rating) === rating).length;
    return { rating, count, width: `${reviews.length ? Math.round((count / reviews.length) * 100) : 0}%` };
  });
  return counts;
}

export function buildFarmerProfileView(farmer: Dict, rawCrops: unknown[], rawReviews: unknown[], avgRating: number) {
  const crops = (Array.isArray(rawCrops) ? rawCrops : []).map((crop) => {
    const item = (crop || {}) as Dict;
    const quantity = asNumber(item.quantity);
    const price = asNumber(item.price);
    return {
      ...item,
      quantity,
      price,
      inventory_value: quantity * price,
      region: [asString(item.district), asString(item.state)].filter(Boolean).join(", ") || asString(item.city, "Farm cluster"),
      quality_label: asString(item.quality, "Standard"),
      availability_label: quantity >= 250 ? "Ready for bulk orders" : quantity >= 75 ? "Balanced supply" : "Limited availability",
    };
  });

  const reviews = (Array.isArray(rawReviews) ? rawReviews : []).map((review) => ({
    ...(review || {}) as Dict,
    rating: asNumber(((review || {}) as Dict).rating),
    customer_name: asString(((review || {}) as Dict).customer_name, 'Verified customer'),
  }));

  const verified = Boolean(farmer.is_verified);
  const trustSignals = [
    { label: "Verification", value: verified ? "Verified" : "Pending", tone: verified ? "success" : "warning" },
    { label: "Listed products", value: String(crops.length), tone: "info" },
    { label: "Average rating", value: (avgRating || 0).toFixed(1), tone: "grain" },
  ];

  const categoryMixMap = new Map<string, number>();
  crops.forEach((crop) => {
    const category = asString(crop.category, 'General');
    categoryMixMap.set(category, (categoryMixMap.get(category) || 0) + 1);
  });
  const categoryMix = Array.from(categoryMixMap.entries()).map(([label, count]) => ({ label, count })).sort((a, b) => b.count - a.count);

  const profileStats = {
    total_inventory: crops.reduce((sum, crop) => sum + asNumber(crop.quantity), 0),
    inventory_value: crops.reduce((sum, crop) => sum + asNumber(crop.inventory_value), 0),
    response_sla: verified ? 'Under 2 hours' : 'Under 6 hours',
  };

  const reviewHighlights = reviews.slice(0, 4);

  return {
    farmer,
    crops,
    reviews,
    trust_signals: trustSignals,
    profile_stats: profileStats,
    category_mix: categoryMix,
    review_breakdown: buildReviewBreakdown(reviews),
    review_highlights: reviewHighlights,
  };
}
