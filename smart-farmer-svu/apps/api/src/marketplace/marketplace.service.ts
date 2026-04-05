import fs from 'node:fs/promises';

import { HttpStatus, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { Model } from 'mongoose';

import { User } from '../auth/schemas/user.schema';
import { MARKETPLACE_CATEGORIES, MARKETPLACE_STATES } from '../common/constants';
import { ok, fail } from '../common/http-response';
import {
  serializeCrop,
  serializeFarmerDashboardOrder,
  serializeReview,
  serializeUser,
} from '../common/serializers';
import { env } from '../common/utils/env';
import { asIdString, isValidObjectId } from '../common/utils/ids';
import { Order } from '../orders/schemas/order.schema';
import { OrderUpdate } from '../orders/schemas/order-update.schema';
import { Review } from '../reviews/schemas/review.schema';

import { buildListingCode, buildSearchTerms, normalizeCropPayload, normalizeMarketplaceQuery } from './marketplace.validation';
import { Crop } from './schemas/crop.schema';

interface UploadedFile {
  filename: string;
  path: string;
  size: number;
}

@Injectable()
export class MarketplaceService {
  constructor(
    @InjectModel(Crop.name) private readonly cropModel: Model<Crop>,
    @InjectModel(User.name) private readonly userModel: Model<User>,
    @InjectModel(Review.name) private readonly reviewModel: Model<Review>,
    @InjectModel(Order.name) private readonly orderModel: Model<Order>,
    @InjectModel(OrderUpdate.name) private readonly orderUpdateModel: Model<OrderUpdate>,
  ) {}

  async marketplaceFilters() {
    const [districts, priceRange] = await Promise.all([
      this.cropModel.distinct('district', { district: { $ne: '' } }),
      this.cropModel.aggregate([
        {
          $group: {
            _id: null,
            min_price: { $min: '$price' },
            max_price: { $max: '$price' },
          },
        },
      ]),
    ]);

    return ok('Marketplace filters loaded', {
      categories: MARKETPLACE_CATEGORIES,
      states: MARKETPLACE_STATES,
      districts: districts.filter(Boolean).sort(),
      sort_options: [
        { value: 'newest', label: 'Newest' },
        { value: 'demand', label: 'Highest demand' },
        { value: 'stock', label: 'Most stock' },
        { value: 'price_low', label: 'Price: low to high' },
        { value: 'price_high', label: 'Price: high to low' },
      ],
      toggles: ['verified_only', 'organic_only', 'same_day_only', 'available_only'],
      price_range: {
        min: Number(priceRange[0]?.min_price || 0),
        max: Number(priceRange[0]?.max_price || 0),
      },
    });
  }

  async categorySummary() {
    const summary = await this.cropModel.aggregate([
      {
        $group: {
          _id: '$category',
          count: { $sum: 1 },
          avg_price: { $avg: '$price' },
          organic_count: { $sum: { $cond: ['$organic', 1, 0] } },
        },
      },
      { $sort: { count: -1, _id: 1 } },
    ]);

    return ok('Marketplace category summary loaded', {
      categories: summary.map((item: any) => ({
        category: String(item._id || 'Others'),
        count: Number(item.count || 0),
        avg_price: Number(Number(item.avg_price || 0).toFixed(2)),
        organic_count: Number(item.organic_count || 0),
      })),
    });
  }

  async listCrops(queryParams: Record<string, unknown>) {
    const filters = normalizeMarketplaceQuery(queryParams);
    const filter: Record<string, any> = {};
    if (filters.query) {
      const regex = new RegExp(this.escapeRegex(filters.query), 'i');
      filter.$or = [
        { name: regex },
        { description: regex },
        { village: regex },
        { district: regex },
        { state: regex },
        { tags: regex },
        { search_terms: regex },
        { listing_code: regex },
      ];
    }
    if (filters.state) {
      filter.state = filters.state;
    }
    if (filters.district) {
      filter.district = filters.district;
    }
    if (filters.category) {
      filter.category = filters.category;
    }
    if (filters.organicOnly) {
      filter.organic = true;
    }
    if (filters.sameDayOnly) {
      filter.same_day_available = true;
    }
    if (filters.availableOnly) {
      filter.stock_status = { $ne: 'Out of Stock' };
    }
    if (filters.priceMin !== null || filters.priceMax !== null) {
      filter.price = {};
      if (filters.priceMin !== null) {
        filter.price.$gte = filters.priceMin;
      }
      if (filters.priceMax !== null) {
        filter.price.$lte = filters.priceMax;
      }
    }

    const sortBy: Record<string, 1 | -1> =
      filters.sort === 'price_low'
        ? { price: 1, created_at: -1 }
        : filters.sort === 'price_high'
          ? { price: -1, created_at: -1 }
          : filters.sort === 'demand'
            ? { demand_score: -1, created_at: -1 }
            : filters.sort === 'stock'
              ? { quantity: -1, created_at: -1 }
              : { created_at: -1 };

    const totalResults = await this.cropModel.countDocuments(filter);
    let crops: any[] = await this.cropModel
      .find(filter)
      .sort(sortBy)
      .skip((filters.page - 1) * filters.perPage)
      .limit(filters.perPage)
      .populate('farmer');

    if (filters.verifiedOnly) {
      crops = crops.filter((crop: any) => Boolean(crop.farmer?.is_verified));
    }

    const farmerIds = [...new Set(crops.map((crop: any) => asIdString(crop.farmer?._id || crop.farmer)).filter(Boolean))];
    const reviews = farmerIds.length ? await this.reviewModel.find({ farmer: { $in: farmerIds } }).lean() : [];
    const ratingMap = new Map<string, { total: number; count: number }>();
    reviews.forEach((review: any) => {
      const key = asIdString(review.farmer);
      const bucket = ratingMap.get(key) || { total: 0, count: 0 };
      bucket.total += Number(review.rating || 0);
      bucket.count += 1;
      ratingMap.set(key, bucket);
    });

    const serialized = crops.map((crop: any) => {
      const item = serializeCrop(crop) as Record<string, unknown>;
      const farmerId = String(item.farmer_id || '');
      const rating = ratingMap.get(farmerId);
      return {
        ...item,
        farmer_rating: rating && rating.count ? Number((rating.total / rating.count).toFixed(1)) : 0,
      };
    });

    return ok('Marketplace loaded', {
      crops: serialized,
      categories: MARKETPLACE_CATEGORIES,
      states: MARKETPLACE_STATES,
      sort_options: [
        { value: 'newest', label: 'Newest' },
        { value: 'demand', label: 'Highest demand' },
        { value: 'stock', label: 'Most stock' },
        { value: 'price_low', label: 'Price: low to high' },
        { value: 'price_high', label: 'Price: high to low' },
      ],
      stats: {
        total_results: totalResults,
        visible_results: serialized.length,
        verified_results: serialized.filter((crop: any) => Boolean(crop.is_verified)).length,
        organic_results: serialized.filter((crop: any) => Boolean(crop.organic)).length,
        same_day_results: serialized.filter((crop: any) => Boolean(crop.same_day_available)).length,
      },
      pagination: {
        page: filters.page,
        per_page: filters.perPage,
        total_results: totalResults,
        total_pages: Math.max(1, Math.ceil(totalResults / filters.perPage)),
        has_next: filters.page * filters.perPage < totalResults,
      },
      filters: {
        query: filters.query,
        state: filters.state,
        district: filters.district,
        category: filters.category,
        verified_only: filters.verifiedOnly,
        organic_only: filters.organicOnly,
        same_day_only: filters.sameDayOnly,
        available_only: filters.availableOnly,
        price_min: filters.priceMin,
        price_max: filters.priceMax,
        sort: filters.sort,
      },
    });
  }

  async farmerProfile(farmerId: string) {
    if (!isValidObjectId(farmerId)) {
      fail('Farmer not found', 'farmer_not_found', HttpStatus.NOT_FOUND);
    }

    const farmer = await this.userModel.findOne({ _id: farmerId, role: 'farmer' });
    if (!farmer) {
      fail('Farmer not found', 'farmer_not_found', HttpStatus.NOT_FOUND);
    }

    const crops = await this.cropModel.find({ farmer: farmer._id }).sort({ created_at: -1 }).populate('farmer');
    const reviews = await this.reviewModel.find({ farmer: farmer._id }).sort({ created_at: -1 }).populate('customer');
    const avgRating = reviews.length === 0 ? 0 : reviews.reduce((sum: number, review: any) => sum + Number(review.rating || 0), 0) / reviews.length;

    return ok('Farmer profile loaded', {
      farmer: {
        ...serializeUser(farmer),
        trust_score: farmer.is_verified ? 92 : 74,
      },
      crops: crops.map((crop: any) => serializeCrop(crop)),
      reviews: reviews.map((review: any) => serializeReview(review)),
      avg_rating: Number(avgRating.toFixed(2)) || 0,
    });
  }

  async farmerDashboard(user: any) {
    const crops = await this.cropModel.find({ farmer: user._id }).sort({ created_at: -1 }).populate('farmer');
    const cropIds = crops.map((crop: any) => crop._id);
    const orders = cropIds.length
      ? await this.orderModel
          .find({ crop: { $in: cropIds } })
          .sort({ order_date: -1 })
          .populate('customer')
          .populate({ path: 'crop', populate: { path: 'farmer' } })
      : [];

    const serializedCrops = crops.map((crop: any) => serializeCrop(crop));
    const serializedOrders = orders.map((order: any) => serializeFarmerDashboardOrder(order));
    const totalRevenue = serializedOrders.reduce((sum: number, order: any) => sum + Number(order.total_price || 0), 0);
    const lowStockCount = serializedCrops.filter((crop: any) => String(crop.stock_status) === 'Low Stock').length;
    const liveStock = serializedCrops.reduce((sum: number, crop: any) => sum + Number(crop.quantity || 0), 0);

    const topSellingMap = new Map<string, { crop_name: string; total_quantity: number; total_revenue: number }>();
    serializedOrders.forEach((order: any) => {
      const current = topSellingMap.get(order.crop_name) || { crop_name: order.crop_name, total_quantity: 0, total_revenue: 0 };
      current.total_quantity += Number(order.quantity || 0);
      current.total_revenue += Number(order.total_price || 0);
      topSellingMap.set(order.crop_name, current);
    });

    const hotspotMap = new Map<string, { area: string; orders: number }>();
    serializedOrders.forEach((order: any) => {
      const area = [order.customer_district, order.customer_state].filter(Boolean).join(', ') || 'Unknown area';
      const current = hotspotMap.get(area) || { area, orders: 0 };
      current.orders += 1;
      hotspotMap.set(area, current);
    });

    const smartAlerts: Array<{ level: string; title: string; body: string }> = [];
    if (!user.is_verified) {
      smartAlerts.push({
        level: 'warning',
        title: 'Verification pending',
        body: 'Complete farmer verification to improve ranking and trust in the marketplace.',
      });
    }
    if (lowStockCount > 0) {
      smartAlerts.push({
        level: 'warning',
        title: 'Low stock attention',
        body: `${lowStockCount} listing${lowStockCount === 1 ? '' : 's'} are close to stock-out. Refresh quantities to keep buyer confidence high.`,
      });
    }
    if (serializedOrders.filter((order: any) => order.payment_status !== 'confirmed').length > 0) {
      smartAlerts.push({
        level: 'info',
        title: 'Pending payment confirmations',
        body: 'Watch buyer payment confirmations and keep chat open for faster order conversion.',
      });
    }

    return ok('Farmer dashboard loaded', {
      crops: serializedCrops,
      orders: serializedOrders,
      is_verified: Boolean(user.is_verified),
      metrics: {
        total_listings: serializedCrops.length,
        live_stock: Number(liveStock.toFixed(2)),
        total_orders: serializedOrders.length,
        total_revenue: Number(totalRevenue.toFixed(2)),
        pending_orders: serializedOrders.filter((order: any) => !['Delivered', 'Cancelled'].includes(String(order.status))).length,
        low_stock_count: lowStockCount,
      },
      top_selling_crops: [...topSellingMap.values()].sort((left, right) => right.total_revenue - left.total_revenue).slice(0, 5),
      demand_hotspots: [...hotspotMap.values()].sort((left, right) => right.orders - left.orders).slice(0, 6),
      smart_alerts: smartAlerts,
    });
  }

  async createCrop(user: any, body: Record<string, unknown>, files: Record<string, UploadedFile[] | undefined>) {
    const image = files.image?.[0];
    const qualityProof = files.quality_proof?.[0];

    if (this.fileTooLarge(image)) {
      await this.cleanupUploadedFiles(files);
      fail('Crop image too large (Max 2MB)', 'image_too_large');
    }
    if (this.fileTooLarge(qualityProof)) {
      await this.cleanupUploadedFiles(files);
      fail('Quality proof too large (Max 2MB)', 'proof_too_large');
    }

    const normalized = normalizeCropPayload(body, {
      state: user.state,
      district: user.district,
      pincode: user.pincode,
      category: 'Others',
      unit: 'kg',
      quality: 'Standard',
      price_trend: 'Stable',
      demand_score: 50,
      delivery_radius_km: 30,
    });

    if (!normalized.name || normalized.name.length < 2) {
      await this.cleanupUploadedFiles(files);
      fail('Crop name must be at least 2 characters', 'invalid_crop_name');
    }
    if (normalized.quantity <= 0) {
      await this.cleanupUploadedFiles(files);
      fail('Quantity must be greater than zero', 'invalid_crop_quantity');
    }
    if (normalized.price <= 0) {
      await this.cleanupUploadedFiles(files);
      fail('Price must be greater than zero', 'invalid_crop_price');
    }
    if (normalized.min_order_quantity > normalized.quantity) {
      await this.cleanupUploadedFiles(files);
      fail('Minimum order quantity cannot exceed total quantity', 'invalid_min_order_quantity');
    }

    const listingCode = buildListingCode(normalized.name, asIdString(user._id));
    const searchTerms = buildSearchTerms(normalized);
    const crop = await this.cropModel.create({
      farmer: user._id,
      name: normalized.name,
      category: normalized.category,
      listing_code: listingCode,
      search_terms: searchTerms,
      quantity: normalized.quantity,
      price: normalized.price,
      harvest_date: this.toDate(normalized.harvest_date),
      state: normalized.state || String(user.state || ''),
      district: normalized.district || String(user.district || ''),
      village: normalized.village,
      pincode: normalized.pincode || String(user.pincode || ''),
      description: normalized.description,
      quality: normalized.quality,
      image: this.relativeUploadPath(image),
      quality_proof: this.relativeUploadPath(qualityProof),
      unit: normalized.unit,
      min_order_quantity: normalized.min_order_quantity,
      same_day_available: normalized.same_day_available,
      organic: normalized.organic,
      demand_score: normalized.demand_score,
      price_trend: normalized.price_trend,
      stock_status: this.computeStockStatus(normalized.quantity, normalized.min_order_quantity),
      latitude: normalized.latitude,
      longitude: normalized.longitude,
      delivery_radius_km: normalized.delivery_radius_km,
      tags: normalized.tags,
    });

    const populatedCrop = await this.cropModel.findById(crop._id).populate('farmer');
    return ok('Crop added successfully!', { crop: serializeCrop(populatedCrop || crop) });
  }

  async cropDetail(user: any, cropId: string) {
    const crop = await this.getCropForUser(cropId, user);
    if (!crop) {
      fail('Crop not found or unauthorized', 'crop_not_found', HttpStatus.NOT_FOUND);
    }
    return ok('Crop loaded', { crop: serializeCrop(crop) });
  }

  async updateCrop(user: any, cropId: string, body: Record<string, unknown>, files: Record<string, UploadedFile[] | undefined> = {}) {
    const crop: any = await this.getCropForUser(cropId, user);
    if (!crop) {
      await this.cleanupUploadedFiles(files);
      fail('Crop not found or unauthorized', 'crop_not_found', HttpStatus.NOT_FOUND);
    }

    const image = files.image?.[0];
    const qualityProof = files.quality_proof?.[0];
    if (this.fileTooLarge(image)) {
      await this.cleanupUploadedFiles(files);
      fail('Crop image too large (Max 2MB)', 'image_too_large');
    }
    if (this.fileTooLarge(qualityProof)) {
      await this.cleanupUploadedFiles(files);
      fail('Quality proof too large (Max 2MB)', 'proof_too_large');
    }

    const previousImage = String(crop.image || '');
    const previousProof = String(crop.quality_proof || '');
    const normalized = normalizeCropPayload(body, crop.toObject ? crop.toObject() : crop);

    if (!normalized.name || normalized.name.length < 2) {
      await this.cleanupUploadedFiles(files);
      fail('Crop name must be at least 2 characters', 'invalid_crop_name');
    }
    if (normalized.quantity <= 0) {
      await this.cleanupUploadedFiles(files);
      fail('Quantity must be greater than zero', 'invalid_crop_quantity');
    }
    if (normalized.price <= 0) {
      await this.cleanupUploadedFiles(files);
      fail('Price must be greater than zero', 'invalid_crop_price');
    }
    if (normalized.min_order_quantity > normalized.quantity) {
      await this.cleanupUploadedFiles(files);
      fail('Minimum order quantity cannot exceed total quantity', 'invalid_min_order_quantity');
    }

    crop.name = normalized.name;
    crop.category = normalized.category;
    crop.listing_code = crop.listing_code || buildListingCode(normalized.name, asIdString(user._id));
    crop.search_terms = buildSearchTerms(normalized);
    crop.quantity = normalized.quantity;
    crop.price = normalized.price;
    crop.harvest_date = this.toDate(normalized.harvest_date);
    crop.description = normalized.description;
    crop.state = normalized.state || crop.state || '';
    crop.district = normalized.district || crop.district || '';
    crop.village = normalized.village;
    crop.pincode = normalized.pincode || crop.pincode || '';
    crop.unit = normalized.unit;
    crop.min_order_quantity = normalized.min_order_quantity;
    crop.same_day_available = normalized.same_day_available;
    crop.organic = normalized.organic;
    crop.demand_score = normalized.demand_score;
    crop.price_trend = normalized.price_trend;
    crop.quality = normalized.quality;
    crop.latitude = normalized.latitude;
    crop.longitude = normalized.longitude;
    crop.delivery_radius_km = normalized.delivery_radius_km;
    crop.tags = normalized.tags;
    if (image) {
      crop.image = this.relativeUploadPath(image);
    }
    if (qualityProof) {
      crop.quality_proof = this.relativeUploadPath(qualityProof);
    }
    crop.stock_status = this.computeStockStatus(Number(crop.quantity || 0), Number(crop.min_order_quantity || 1));

    await crop.save();
    await Promise.all([
      this.cleanupReplacedFile(previousImage, crop.image),
      this.cleanupReplacedFile(previousProof, crop.quality_proof),
    ]);
    return ok('Crop updated successfully!', { crop: serializeCrop(crop) });
  }

  async deleteCrop(user: any, cropId: string) {
    const crop: any = await this.getCropForUser(cropId, user);
    if (!crop) {
      fail('Crop not found or unauthorized', 'crop_not_found', HttpStatus.NOT_FOUND);
    }

    const orders = await this.orderModel.find({ crop: crop._id }).select('_id').lean();
    const orderIds = orders.map((order: any) => asIdString(order._id));

    if (orderIds.length > 0) {
      await this.orderUpdateModel.deleteMany({ order: { $in: orderIds } });
      await this.reviewModel.deleteMany({ order: { $in: orderIds } });
      await this.orderModel.deleteMany({ _id: { $in: orderIds } });
    }

    await crop.deleteOne();
    return ok('Crop deleted successfully');
  }

  private async getCropForUser(cropId: string, user: any) {
    if (!isValidObjectId(cropId)) {
      return null;
    }
    const crop: any = await this.cropModel.findById(cropId).populate('farmer');
    if (!crop) {
      return null;
    }
    if (user.role === 'admin') {
      return crop;
    }
    const farmerId = asIdString(crop.farmer?._id || crop.farmer);
    return farmerId === asIdString(user._id) ? crop : null;
  }

  private escapeRegex(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\]/g, '\$&');
  }

  private toDate(value: unknown): Date | null {
    const text = String(value || '').trim();
    if (!text) {
      return null;
    }
    const date = new Date(text);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  private computeStockStatus(quantity: number, minOrderQuantity: number): string {
    if (quantity <= 0) {
      return 'Out of Stock';
    }
    if (quantity <= Math.max(minOrderQuantity * 2, 10)) {
      return 'Low Stock';
    }
    return 'Available';
  }

  private fileTooLarge(file?: UploadedFile): boolean {
    return Boolean(file && file.size > 2 * 1024 * 1024);
  }

  private relativeUploadPath(file?: UploadedFile): string {
    return file ? `uploads/${file.filename}` : '';
  }

  private async cleanupReplacedFile(previousPath: string, nextPath: string): Promise<void> {
    if (!previousPath || previousPath === nextPath || !previousPath.startsWith('uploads/')) {
      return;
    }
    try {
      const relative = previousPath.replace(/^uploads\//, '');
      await fs.unlink(`${env.uploadsRoot}/${relative}`);
    } catch {
      // ignore cleanup failures
    }
  }

  private async cleanupUploadedFiles(files: Record<string, UploadedFile[] | undefined>): Promise<void> {
    const allFiles = Object.values(files).flat().filter(Boolean) as UploadedFile[];
    await Promise.all(
      allFiles.map(async (file) => {
        if (!file.path) {
          return;
        }
        try {
          await fs.unlink(file.path);
        } catch {
          // ignore cleanup failures
        }
      }),
    );
  }
}
