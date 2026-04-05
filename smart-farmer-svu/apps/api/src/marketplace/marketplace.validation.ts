import { MARKETPLACE_CATEGORIES, MARKETPLACE_STATES } from '../common/constants';

const SORT_OPTIONS = new Set(['newest', 'price_low', 'price_high', 'demand', 'stock']);
const ALLOWED_UNITS = new Set(['kg', 'quintal', 'ton', 'litre', 'packet', 'dozen', 'piece']);

function cleanText(value: unknown, fallback = ''): string {
  return String(value ?? fallback).trim();
}

function cleanTitle(value: unknown, fallback = ''): string {
  const text = cleanText(value, fallback)
    .replace(/\s+/g, ' ')
    .replace(/[_-]+/g, ' ')
    .trim();
  return text
    .split(' ')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(' ');
}

function toNumber(value: unknown, fallback = 0): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function toBoolean(value: unknown): boolean {
  if (typeof value === 'boolean') {
    return value;
  }
  return ['1', 'true', 'yes', 'on'].includes(String(value ?? '').trim().toLowerCase());
}

function normalizeEnum(value: unknown, options: readonly string[], fallback: string): string {
  const text = cleanText(value, fallback);
  const match = options.find((option) => option.toLowerCase() === text.toLowerCase());
  return match || fallback;
}

export function normalizeMarketplaceQuery(queryParams: Record<string, unknown>) {
  const page = Math.max(1, Math.floor(toNumber(queryParams.page, 1)));
  const perPage = Math.min(24, Math.max(1, Math.floor(toNumber(queryParams.per_page, 12))));
  const sortInput = cleanText(queryParams.sort, 'newest').toLowerCase();

  return {
    query: cleanText(queryParams.query),
    state: normalizeEnum(queryParams.state, MARKETPLACE_STATES, ''),
    district: cleanTitle(queryParams.district),
    category: normalizeEnum(queryParams.category, MARKETPLACE_CATEGORIES, ''),
    sort: SORT_OPTIONS.has(sortInput) ? sortInput : 'newest',
    verifiedOnly: toBoolean(queryParams.verified_only),
    organicOnly: toBoolean(queryParams.organic_only),
    sameDayOnly: toBoolean(queryParams.same_day_only),
    availableOnly: toBoolean(queryParams.available_only),
    priceMin: Number.isFinite(Number(queryParams.price_min)) ? Number(queryParams.price_min) : null,
    priceMax: Number.isFinite(Number(queryParams.price_max)) ? Number(queryParams.price_max) : null,
    page,
    perPage,
  };
}

export function normalizeCropPayload(body: Record<string, unknown>, defaults: Record<string, unknown> = {}) {
  const quantity = Math.max(0, toNumber(body.quantity, toNumber(defaults.quantity, 0)));
  const minOrderQuantity = Math.max(0.1, toNumber(body.min_order_quantity, Math.max(0.1, toNumber(defaults.min_order_quantity, 1))));
  const category = normalizeEnum(body.category, MARKETPLACE_CATEGORIES, cleanText(defaults.category, 'Others') || 'Others');
  const state = normalizeEnum(body.state, MARKETPLACE_STATES, cleanText(defaults.state));
  const unit = cleanText(body.unit, cleanText(defaults.unit, 'kg')).toLowerCase();
  const normalizedUnit = ALLOWED_UNITS.has(unit) ? unit : 'kg';

  const tagsSource = Array.isArray(body.tags) ? body.tags.join(',') : cleanText(body.tags, defaults.tags as string);
  const tags = [...new Set(tagsSource.split(',').map((item) => cleanText(item).toLowerCase()).filter(Boolean))].slice(0, 12);

  const name = cleanTitle(body.name, defaults.name);
  const district = cleanTitle(body.district, defaults.district);
  const village = cleanTitle(body.village, defaults.village);
  const pincode = cleanText(body.pincode, defaults.pincode).replace(/\D+/g, '').slice(0, 6);
  const description = cleanText(body.description, defaults.description).replace(/\s+/g, ' ').trim();

  return {
    name,
    category,
    quantity,
    price: Math.max(0, toNumber(body.price, toNumber(defaults.price, 0))),
    harvest_date: cleanText(body.harvest_date, defaults.harvest_date),
    state,
    district,
    village,
    pincode,
    description,
    quality: cleanTitle(body.quality, defaults.quality || 'Standard') || 'Standard',
    unit: normalizedUnit,
    min_order_quantity: Math.min(quantity || minOrderQuantity, minOrderQuantity),
    same_day_available: toBoolean(body.same_day_available ?? defaults.same_day_available),
    organic: toBoolean(body.organic ?? defaults.organic),
    demand_score: Math.max(0, Math.min(100, toNumber(body.demand_score, toNumber(defaults.demand_score, 50)))),
    price_trend: cleanTitle(body.price_trend, defaults.price_trend || 'Stable') || 'Stable',
    latitude: Number.isFinite(Number(body.latitude)) ? Number(body.latitude) : (Number.isFinite(Number(defaults.latitude)) ? Number(defaults.latitude) : null),
    longitude: Number.isFinite(Number(body.longitude)) ? Number(body.longitude) : (Number.isFinite(Number(defaults.longitude)) ? Number(defaults.longitude) : null),
    delivery_radius_km: Math.max(1, Math.min(300, toNumber(body.delivery_radius_km, toNumber(defaults.delivery_radius_km, 30)))),
    tags,
  };
}

export function buildSearchTerms(input: {
  name?: string;
  category?: string;
  district?: string;
  state?: string;
  village?: string;
  tags?: string[];
}) {
  const raw = [input.name, input.category, input.district, input.state, input.village, ...(input.tags || [])]
    .map((item) => cleanText(item).toLowerCase())
    .filter(Boolean);

  return [...new Set(raw.flatMap((item) => item.split(/\s+/g).filter(Boolean)).filter((item) => item.length > 1))].slice(0, 40);
}

export function buildListingCode(name: string, farmerId: string) {
  const stem = cleanText(name, 'crop')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 12) || 'CROP';
  const suffix = cleanText(farmerId).replace(/[^a-zA-Z0-9]+/g, '').slice(-6).toUpperCase() || 'LOCAL';
  return `${stem}-${suffix}`;
}
