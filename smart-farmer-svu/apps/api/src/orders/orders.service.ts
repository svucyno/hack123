import { randomBytes } from 'node:crypto';

import { HttpStatus, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { Model } from 'mongoose';

import { User } from '../auth/schemas/user.schema';
import { ORDER_STAGES, DEV_PAYMENT_METHODS, DEV_PAYMENT_PROVIDERS, type DevPaymentMethod } from '../common/constants';
import { ok, fail } from '../common/http-response';
import {
  serializeAdminOrder,
  serializeCustomerOrder,
  serializeFarmerDashboardOrder,
  serializeNotification,
  serializeUser,
} from '../common/serializers';
import { asIdString, isValidObjectId } from '../common/utils/ids';
import { sendEmailMessage } from '../common/utils/mailer';
import { Crop } from '../marketplace/schemas/crop.schema';
import { Notification } from '../smart/schemas/notification.schema';

import { Order } from './schemas/order.schema';
import { OrderUpdate } from './schemas/order-update.schema';
import {
  assertAllowedOrderTransition,
  buildDispatchSnapshot,
  buildOrderBreakdown,
  computeFulfillmentPriority,
  computeRiskBand,
  normalizeOrderPlacementPayload,
} from './orders.validation';

@Injectable()
export class OrdersService {
  constructor(
    @InjectModel(Order.name) private readonly orderModel: Model<Order>,
    @InjectModel(OrderUpdate.name) private readonly orderUpdateModel: Model<OrderUpdate>,
    @InjectModel(Crop.name) private readonly cropModel: Model<Crop>,
    @InjectModel(User.name) private readonly userModel: Model<User>,
    @InjectModel(Notification.name) private readonly notificationModel: Model<Notification>,
  ) {}

  async placeOrder(customer: any, body: Record<string, unknown>) {
    const payload = normalizeOrderPlacementPayload(body);

    if (!isValidObjectId(payload.cropId)) {
      fail('Crop not found', 'crop_not_found', HttpStatus.NOT_FOUND);
    }

    const existingCrop: any = await this.cropModel.findById(payload.cropId).populate('farmer');
    if (!existingCrop) {
      fail('Crop not found', 'crop_not_found', HttpStatus.NOT_FOUND);
    }

    const minOrderQuantity = Math.max(Number(existingCrop.min_order_quantity || 1), 0.1);
    if (payload.quantity < minOrderQuantity) {
      fail(`Minimum order quantity is ${minOrderQuantity} ${existingCrop.unit || 'kg'}.`, 'below_minimum_order');
    }

    const crop: any = await this.cropModel
      .findOneAndUpdate(
        { _id: payload.cropId, quantity: { $gte: payload.quantity } },
        { $inc: { quantity: -payload.quantity } },
        { new: true },
      )
      .populate('farmer');

    if (!crop) {
      fail('Requested quantity not available', 'insufficient_stock');
    }

    crop.stock_status = this.computeStockStatus(Number(crop.quantity || 0), Number(crop.min_order_quantity || 1));
    await crop.save();

    const farmer = crop.farmer as any;
    const requestedBulk = payload.requestedBulk || payload.quantity >= minOrderQuantity * 10;
    const breakdown = buildOrderBreakdown(Number(crop.price || 0), payload.quantity, Number(crop.delivery_radius_km || 25), requestedBulk);
    const priority = computeFulfillmentPriority(payload.quantity, breakdown.total, Boolean(crop.same_day_available));
    const riskBand = computeRiskBand(payload.paymentMethod, breakdown.total, requestedBulk);
    const deliverySnapshot = buildDispatchSnapshot(payload.quantity, crop.unit || 'kg', priority, Boolean(crop.same_day_available));
    const dispatchDueAt = this.computeDispatchDueAt(priority, Boolean(crop.same_day_available));

    const order = await this.orderModel.create({
      customer: customer._id,
      crop: crop._id,
      quantity: payload.quantity,
      subtotal: breakdown.subtotal,
      delivery_fee: breakdown.deliveryFee,
      platform_fee: breakdown.platformFee,
      discount_amount: breakdown.discountAmount,
      total_price: breakdown.total,
      status: 'Order Placed',
      payment_status: 'pending',
      payment_method: payload.paymentMethod,
      estimated_delivery: this.estimateDelivery(customer, farmer, crop, priority),
      current_location: farmer.city || farmer.state || '',
      is_bulk_order: requestedBulk || breakdown.total >= 5000,
      buyer_note: payload.buyerNote,
      delivery_address: payload.deliveryAddress || [customer.city, customer.district, customer.state, customer.pincode].filter(Boolean).join(', '),
      fulfillment_window: payload.fulfillmentWindow || (crop.same_day_available ? 'Today 5pm-8pm' : 'Next available slot'),
      invoice_number: this.generateInvoiceNumber(),
      tracking_code: this.generateTrackingCode(),
      priority,
      risk_band: riskBand,
      requested_delivery_date: payload.requestedDeliveryDate,
      dispatch_due_at: dispatchDueAt,
      customer_phone: payload.customerPhone || customer.contact || '',
      delivery_snapshot: deliverySnapshot,
    });

    await this.recordOrderUpdate(order._id, 'Order Placed', farmer.city || farmer.state || '', 'Order submitted by customer', 'customer', order.estimated_delivery || '');

    const populatedOrder: any = await this.orderModel
      .findById(order._id)
      .populate('customer')
      .populate({ path: 'crop', populate: { path: 'farmer' } });

    if (!populatedOrder) {
      fail('Order could not be loaded', 'order_not_found', HttpStatus.NOT_FOUND);
    }

    await Promise.all([
      this.notifyFarmerNewOrder(populatedOrder, customer),
      this.createNotification(farmer._id, 'New order request', `You received a new ${priority} priority order for ${crop.name}.`, 'order', {
        order_id: asIdString(order._id),
        crop_id: asIdString(crop._id),
        priority,
      }),
      this.createNotification(customer._id, 'Order placed', `Your order for ${crop.name} has been created. Complete payment to confirm it.`, 'order', {
        order_id: asIdString(order._id),
        crop_id: asIdString(crop._id),
        total_price: breakdown.total,
      }),
    ]);

    return ok('Order placed! Proceed to payment.', {
      order: serializeCustomerOrder(populatedOrder, await this.findUpdatesForOrder(order._id)),
      pricing_breakdown: {
        subtotal: breakdown.subtotal,
        delivery_fee: breakdown.deliveryFee,
        platform_fee: breakdown.platformFee,
        discount_amount: breakdown.discountAmount,
        total: breakdown.total,
      },
      fulfillment: {
        priority,
        risk_band: riskBand,
        dispatch_due_at: dispatchDueAt,
        requested_delivery_date: payload.requestedDeliveryDate,
      },
      order_id: asIdString(order._id),
      redirect: `/checkout/${asIdString(order._id)}`,
    });
  }

  async myOrders(customer: any) {
    const orders = await this.orderModel
      .find({ customer: customer._id })
      .sort({ order_date: -1 })
      .populate('customer')
      .populate({ path: 'crop', populate: { path: 'farmer' } });

    const updatesByOrder = await this.loadUpdatesByOrder(orders.map((order: any) => asIdString(order._id)));
    const serialized = orders.map((order: any) => serializeCustomerOrder(order, updatesByOrder.get(asIdString(order._id)) || []));
    const activeOrders = serialized.filter((order: any) => !['Delivered', 'Cancelled'].includes(String(order.status)));
    const orderHistory = serialized.filter((order: any) => ['Delivered', 'Cancelled'].includes(String(order.status)));
    const pendingPayment = serialized.filter((order: any) => order.payment_status === 'pending').length;
    const urgentOrders = serialized.filter((order: any) => order.priority === 'urgent').length;

    return ok('Orders loaded', {
      active_orders: activeOrders,
      order_history: orderHistory,
      summary: {
        active_count: activeOrders.length,
        completed_count: orderHistory.filter((order: any) => order.status === 'Delivered').length,
        cancelled_count: orderHistory.filter((order: any) => order.status === 'Cancelled').length,
        pending_payment_count: pendingPayment,
        urgent_count: urgentOrders,
        open_value: Number(activeOrders.reduce((sum: number, order: any) => sum + Number(order.total_price || 0), 0).toFixed(2)),
      },
    });
  }

  async myOrdersSummary(customer: any) {
    const orders = await this.orderModel.find({ customer: customer._id }).sort({ order_date: -1 }).lean();
    const statusCounts = new Map<string, number>();
    let totalSpend = 0;
    let bulkOrders = 0;
    let delayed = 0;

    orders.forEach((order: any) => {
      const status = String(order.status || 'Order Placed');
      statusCounts.set(status, (statusCounts.get(status) || 0) + 1);
      totalSpend += Number(order.total_price || 0);
      if (order.is_bulk_order) {
        bulkOrders += 1;
      }
      if (order.dispatch_due_at && new Date(order.dispatch_due_at).getTime() < Date.now() && !['Delivered', 'Cancelled'].includes(status)) {
        delayed += 1;
      }
    });

    return ok('Order summary loaded', {
      total_orders: orders.length,
      total_spend: Number(totalSpend.toFixed(2)),
      bulk_orders: bulkOrders,
      delayed_orders: delayed,
      status_breakdown: [...statusCounts.entries()].map(([status, count]) => ({ status, count })),
      latest_order_at: orders[0]?.order_date || null,
    });
  }

  async farmerQueue(farmer: any) {
    const orders = await this.orderModel
      .find()
      .sort({ order_date: -1 })
      .populate('customer')
      .populate({ path: 'crop', populate: { path: 'farmer' } });

    const owned = orders.filter((order: any) => asIdString(order.crop?.farmer?._id || order.crop?.farmer) === asIdString(farmer._id));
    const queue = owned.map((order: any) => ({
      ...serializeFarmerDashboardOrder(order),
      sla_bucket: this.computeSlaBucket(order),
      needs_attention: this.orderNeedsAttention(order),
    }));

    return ok('Farmer queue loaded', {
      queue,
      summary: {
        total: queue.length,
        awaiting_confirmation: queue.filter((order: any) => order.status === 'Order Placed').length,
        in_transit: queue.filter((order: any) => ['Shipped', 'Out for Delivery'].includes(order.status)).length,
        needs_attention: queue.filter((order: any) => order.needs_attention).length,
      },
    });
  }

  async orderDetail(customer: any, orderId: string) {
    const order = await this.findCustomerOrder(orderId, customer, true);
    if (!order) {
      fail('Order not found', 'order_not_found', HttpStatus.NOT_FOUND);
    }

    const updates = await this.findUpdatesForOrder(order._id);
    return ok('Order loaded', {
      order: serializeCustomerOrder(order, updates),
      payment_gateway: this.buildDevGatewayConfig(order),
      delivery_snapshot: this.buildDeliverySnapshot(order, updates),
    });
  }

  async trackingForUser(user: any, orderId: string) {
    const order = await this.findAccessibleOrder(user, orderId);
    if (!order) {
      fail('Order not found', 'order_not_found', HttpStatus.NOT_FOUND);
    }
    const updates = await this.findUpdatesForOrder(order._id);
    return ok('Tracking loaded', {
      order_id: asIdString(order._id),
      tracking_code: order.tracking_code || '',
      current_location: order.current_location || '',
      status: order.status || 'Order Placed',
      progress_percent: this.computeProgressPercent(String(order.status || 'Order Placed')),
      timeline: updates,
      delivery_snapshot: this.buildDeliverySnapshot(order, updates),
    });
  }

  async invoiceForUser(user: any, orderId: string) {
    const order = await this.findAccessibleOrder(user, orderId);
    if (!order) {
      fail('Order not found', 'order_not_found', HttpStatus.NOT_FOUND);
    }

    const updates = await this.findUpdatesForOrder(order._id);
    const serialized = serializeCustomerOrder(order, updates);
    const crop = order.crop as any;
    const farmer = crop?.farmer as any;
    const customer = order.customer as any;
    const unitPrice = Number(order.quantity || 0) > 0 ? Number(order.subtotal || order.total_price || 0) / Number(order.quantity || 1) : 0;

    return ok('Invoice loaded', {
      order: serialized,
      invoice: {
        invoice_number: order.invoice_number || this.generateInvoiceNumber(),
        order_id: asIdString(order._id),
        customer: serializeUser(customer),
        farmer: serializeUser(farmer),
        crop: {
          id: asIdString(crop?._id),
          name: crop?.name || '',
          unit: crop?.unit || 'kg',
        },
        line_items: [
          {
            label: crop?.name || 'Crop order',
            quantity: Number(order.quantity || 0),
            unit_price: Number(unitPrice.toFixed(2)),
            total: Number(order.subtotal || 0),
          },
          {
            label: 'Delivery fee',
            quantity: 1,
            unit_price: Number(order.delivery_fee || 0),
            total: Number(order.delivery_fee || 0),
          },
          {
            label: 'Platform fee',
            quantity: 1,
            unit_price: Number(order.platform_fee || 0),
            total: Number(order.platform_fee || 0),
          },
          {
            label: 'Discount',
            quantity: 1,
            unit_price: Number(-(Number(order.discount_amount || 0))),
            total: Number(-(Number(order.discount_amount || 0))),
          },
        ],
        subtotal: Number(order.subtotal || 0),
        grand_total: Number(order.total_price || 0),
        payment_status: order.payment_status || 'pending',
        payment_method: order.payment_method || '',
        payment_provider: order.payment_provider || '',
        payment_reference: order.payment_reference || '',
        payment_gateway_details: order.payment_gateway_details || {},
        gateway_mode: 'dev_dummy',
        estimated_delivery: order.estimated_delivery || '',
        fulfillment_window: order.fulfillment_window || '',
        delivery_address: order.delivery_address || '',
        requested_delivery_date: order.requested_delivery_date || '',
        tracking_code: order.tracking_code || '',
        priority: order.priority || 'standard',
      },
    });
  }

  async updateDeliveryAddress(customer: any, orderId: string, body: Record<string, unknown>) {
    const order: any = await this.findCustomerOrder(orderId, customer, true);
    if (!order) {
      fail('Order not found', 'order_not_found', HttpStatus.NOT_FOUND);
    }
    if (!['Order Placed', 'Order Confirmed'].includes(String(order.status || ''))) {
      fail('Delivery address can only be updated before dispatch.', 'delivery_address_locked');
    }

    const deliveryAddress = String(body.delivery_address || '').trim();
    const fulfillmentWindow = String(body.fulfillment_window || order.fulfillment_window || '').trim();
    const requestedDeliveryDate = String(body.requested_delivery_date || order.requested_delivery_date || '').trim();
    if (!deliveryAddress) {
      fail('Delivery address is required', 'delivery_address_required');
    }

    order.delivery_address = deliveryAddress;
    order.fulfillment_window = fulfillmentWindow;
    order.requested_delivery_date = requestedDeliveryDate;
    await order.save();
    await this.recordOrderUpdate(order._id, String(order.status || 'Order Confirmed'), order.current_location || '', 'Delivery details updated by customer', 'customer', order.estimated_delivery || '');

    return ok('Delivery details updated', {
      order: serializeCustomerOrder(order, await this.findUpdatesForOrder(order._id)),
    });
  }

  async cancelOrder(customer: any, orderId: string) {
    const order: any = await this.findCustomerOrder(orderId, customer, true);
    if (!order) {
      fail('Order not found or unauthorized.', 'order_not_found', HttpStatus.NOT_FOUND);
    }
    if (!['Order Placed', 'Order Confirmed', 'Packed'].includes(String(order.status))) {
      fail('Cannot cancel an order that has already been shipped or completed.', 'order_not_cancellable');
    }

    order.status = 'Cancelled';
    order.payment_status = order.payment_status === 'confirmed' ? 'refunding' : 'cancelled';
    await order.save();
    await this.recordOrderUpdate(order._id, 'Cancelled', 'System', 'Order cancelled by customer', 'customer', '');

    const cropDoc: any = await this.cropModel.findById(order.crop?._id || order.crop);
    if (cropDoc) {
      cropDoc.quantity = Number(cropDoc.quantity || 0) + Number(order.quantity || 0);
      cropDoc.stock_status = this.computeStockStatus(Number(cropDoc.quantity || 0), Number(cropDoc.min_order_quantity || 1));
      await cropDoc.save();
    }

    await Promise.all([
      this.createNotification(order.customer, 'Order cancelled', `Order ${order.invoice_number || asIdString(order._id)} has been cancelled.`, 'order', {
        order_id: asIdString(order._id),
      }),
      this.createNotification(order.crop?.farmer?._id || order.crop?.farmer, 'Order cancelled', `A customer cancelled the order for ${order.crop?.name || 'your crop'}.`, 'order', {
        order_id: asIdString(order._id),
      }),
    ]);

    return ok('Order has been cancelled successfully.');
  }

  async confirmPayment(customer: any, body: Record<string, unknown>) {
    const orderId = String(body.order_id || '');
    const order: any = await this.findCustomerOrder(orderId, customer, true);
    if (!order) {
      fail('Order not found', 'order_not_found', HttpStatus.NOT_FOUND);
    }

    const paymentSession = this.createDevPaymentSession(customer, order, body);
    order.payment_status = 'confirmed';
    order.payment_method = paymentSession.method;
    order.payment_provider = paymentSession.provider;
    order.payment_reference = paymentSession.reference;
    order.payment_gateway_details = paymentSession.gatewayDetails;
    order.status = order.status === 'Order Placed' ? 'Order Confirmed' : order.status;
    order.confirmed_at = new Date();
    if (!order.invoice_number) {
      order.invoice_number = this.generateInvoiceNumber();
    }
    if (!order.tracking_code) {
      order.tracking_code = this.generateTrackingCode();
    }
    await order.save();
    await this.recordOrderUpdate(order._id, 'Order Confirmed', order.current_location || 'Payment confirmed', 'Payment approved on sandbox gateway', 'customer', order.estimated_delivery || '');
    await this.notifyCustomerPaymentConfirmed(order, customer);

    const farmerId = order.crop?.farmer?._id || order.crop?.farmer;
    await Promise.all([
      this.createNotification(order.customer, 'Payment confirmed', `Payment for ${order.crop?.name || 'your order'} is confirmed.`, 'payment', {
        order_id: asIdString(order._id),
        method: paymentSession.method,
        provider: paymentSession.provider,
      }),
      this.createNotification(farmerId, 'Buyer payment received', `Payment is confirmed for ${order.crop?.name || 'a crop order'}.`, 'payment', {
        order_id: asIdString(order._id),
        method: paymentSession.method,
        provider: paymentSession.provider,
      }),
    ]);

    return ok('Payment successful! The dev gateway has approved this sandbox transaction.', {
      order: serializeCustomerOrder(order, await this.findUpdatesForOrder(order._id)),
      gateway: {
        mode: 'dev_dummy',
        method: paymentSession.method,
        provider: paymentSession.provider,
        reference: paymentSession.reference,
        authorized_amount: Number(order.total_price || 0),
        status: 'captured',
        test_only: true,
      },
      notification: serializeNotification({ title: 'Payment confirmed', body: `Payment reference ${paymentSession.reference}` }),
    });
  }

  async farmerUpdateOrder(farmer: any, body: Record<string, unknown>) {
    const orderId = String(body.order_id || '');
    const newStatus = String(body.status || 'Order Confirmed');
    const location = String(body.location || '');
    const trackingCode = String(body.tracking_code || '');
    const updateNote = String(body.note || '').trim();

    const order: any = await this.findFarmerOrder(orderId, farmer);
    if (!order) {
      fail('Order not found or unauthorized', 'order_not_found', HttpStatus.NOT_FOUND);
    }

    const previousStatus = String(order.status || '');
    assertAllowedOrderTransition(previousStatus, newStatus);
    order.status = newStatus;
    order.current_location = location || order.current_location || '';
    if (trackingCode) {
      order.tracking_code = trackingCode;
    }
    if (newStatus === 'Shipped' && !order.dispatch_due_at) {
      order.dispatch_due_at = new Date();
    }
    if (newStatus === 'Delivered') {
      order.current_location = 'Delivered';
    }
    await order.save();
    await this.recordOrderUpdate(order._id, newStatus, location || order.current_location || '', updateNote || `Order moved to ${newStatus}`, 'farmer', order.estimated_delivery || '');

    if (newStatus === 'Order Confirmed' && previousStatus !== 'Order Confirmed') {
      await this.notifyCustomerFarmerApproved(order);
    }

    await this.createNotification(order.customer?._id || order.customer, 'Order status updated', `Your order for ${order.crop?.name || 'a crop'} is now ${newStatus}.`, 'order', {
      order_id: asIdString(order._id),
      status: newStatus,
    });

    return ok(`Order #${asIdString(order._id)} status updated to ${newStatus}`, {
      order: serializeFarmerDashboardOrder(order),
    });
  }

  async adminDashboard() {
    const users = await this.userModel.find().sort({ created_at: 1 }).lean();
    const crops = await this.cropModel.find().sort({ created_at: -1 }).populate('farmer');
    const orders = await this.orderModel
      .find()
      .sort({ order_date: -1 })
      .populate('customer')
      .populate({ path: 'crop', populate: { path: 'farmer' } });

    const totalFarmers = users.filter((user: any) => user.role === 'farmer').length;
    const totalCrops = crops.length;
    const totalOrders = orders.length;
    const paidOrders = orders.filter((order: any) => order.payment_status === 'confirmed');
    const totalRevenue = paidOrders.reduce((sum: number, order: any) => sum + Number(order.total_price || 0), 0);
    const bulkRevenue = paidOrders.filter((order: any) => order.is_bulk_order).reduce((sum: number, order: any) => sum + Number(order.total_price || 0), 0);

    const categoryCounter = new Map<string, number>();
    crops.forEach((crop: any) => {
      const category = crop.category || 'Uncategorized';
      categoryCounter.set(category, (categoryCounter.get(category) || 0) + 1);
    });

    const revenueByDay = new Map<string, number>();
    const statusCounter = new Map<string, number>();
    paidOrders.forEach((order: any) => {
      if (order.order_date) {
        const day = this.toKolkataDate(order.order_date);
        revenueByDay.set(day, (revenueByDay.get(day) || 0) + Number(order.total_price || 0));
      }
    });
    orders.forEach((order: any) => {
      const status = String(order.status || 'Order Placed');
      statusCounter.set(status, (statusCounter.get(status) || 0) + 1);
    });

    const revenueTrend = [...revenueByDay.entries()]
      .sort((left, right) => right[0].localeCompare(left[0]))
      .slice(0, 7)
      .map(([day, total]) => [day, total]);

    return ok('Admin dashboard loaded', {
      users: users.map((user: any) => serializeUser(user)),
      crops: crops.map((crop: any) => serializeAdminOrder({ crop })),
      orders: orders.map((order: any) => serializeAdminOrder(order)),
      total_farmers: totalFarmers,
      total_crops: totalCrops,
      total_orders: totalOrders,
      total_revenue: Number(totalRevenue.toFixed(2)),
      bulk_revenue: Number(bulkRevenue.toFixed(2)),
      category_counts: [...categoryCounter.entries()],
      revenue_trend: revenueTrend,
      status_counts: [...statusCounter.entries()],
      urgent_orders: orders.filter((order: any) => order.priority === 'urgent').length,
    });
  }

  async adminUpdateOrder(orderId: string, body: Record<string, unknown>) {
    if (!isValidObjectId(orderId)) {
      fail('Order not found', 'order_not_found', HttpStatus.NOT_FOUND);
    }
    const order = await this.orderModel.findById(orderId);
    if (!order) {
      fail('Order not found', 'order_not_found', HttpStatus.NOT_FOUND);
    }
    const statusValue = String(body.status || order.status);
    assertAllowedOrderTransition(String(order.status || 'Order Placed'), statusValue);
    order.status = statusValue;
    if (statusValue === 'Delivered') {
      order.current_location = 'Delivered';
    }
    await order.save();
    await this.recordOrderUpdate(order._id, statusValue, order.current_location || 'Admin dashboard', 'Order updated by admin', 'admin', order.estimated_delivery || '');
    return ok(`Order #${asIdString(order._id)} status updated to ${statusValue}`);
  }

  private async findCustomerOrder(orderId: string, customer: any, includeCustomer = false) {
    if (!isValidObjectId(orderId)) {
      return null;
    }
    let query: any = this.orderModel.findOne({ _id: orderId, customer: customer._id }).populate({
      path: 'crop',
      populate: { path: 'farmer' },
    });
    if (includeCustomer) {
      query = query.populate('customer');
    }
    return query;
  }

  private async findAccessibleOrder(user: any, orderId: string) {
    if (!isValidObjectId(orderId)) {
      return null;
    }
    const order: any = await this.orderModel
      .findById(orderId)
      .populate('customer')
      .populate({ path: 'crop', populate: { path: 'farmer' } });
    if (!order) {
      return null;
    }
    if (user.role === 'admin') {
      return order;
    }
    if (asIdString(order.customer?._id || order.customer) === asIdString(user._id)) {
      return order;
    }
    if (asIdString(order.crop?.farmer?._id || order.crop?.farmer) === asIdString(user._id)) {
      return order;
    }
    return null;
  }

  private async findFarmerOrder(orderId: string, farmer: any) {
    if (!isValidObjectId(orderId)) {
      return null;
    }
    const order: any = await this.orderModel
      .findById(orderId)
      .populate('customer')
      .populate({ path: 'crop', populate: { path: 'farmer' } });

    if (!order) {
      return null;
    }

    const cropFarmerId = asIdString((order.crop as any)?.farmer?._id || (order.crop as any)?.farmer);
    return cropFarmerId === asIdString(farmer._id) ? order : null;
  }

  private async recordOrderUpdate(orderId: unknown, status: string, location = '', note = '', actorRole = '', etaLabel = '') {
    return this.orderUpdateModel.create({ order: orderId, status, location: location || '', note, actor_role: actorRole, eta_label: etaLabel });
  }

  private async findUpdatesForOrder(orderId: unknown) {
    return this.orderUpdateModel.find({ order: orderId }).sort({ update_date: 1 }).lean();
  }

  private async loadUpdatesByOrder(orderIds: string[]) {
    const result = new Map<string, any[]>();
    if (orderIds.length === 0) {
      return result;
    }

    const updates = await this.orderUpdateModel.find({ order: { $in: orderIds } }).sort({ update_date: 1 }).lean();
    updates.forEach((update: any) => {
      const key = asIdString(update.order);
      const bucket = result.get(key) || [];
      bucket.push(update);
      result.set(key, bucket);
    });
    return result;
  }

  private estimateDelivery(customer: any, farmer: any, crop: any, priority = 'standard'): string {
    let days = 5;
    if (crop?.same_day_available || priority === 'urgent') {
      days = 0;
    } else if (priority === 'priority') {
      days = 2;
    } else if (farmer.state && customer.state && farmer.state === customer.state) {
      days = 3;
      if (farmer.city && customer.city && farmer.city === customer.city) {
        days = 1;
      }
    }

    const targetDate = new Date();
    targetDate.setDate(targetDate.getDate() + days);
    return new Intl.DateTimeFormat('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      timeZone: 'Asia/Kolkata',
    }).format(targetDate);
  }

  private buildDeliverySnapshot(order: any, updates: any[]) {
    return {
      estimated_delivery: order.estimated_delivery || '',
      requested_delivery_date: order.requested_delivery_date || '',
      dispatch_due_at: order.dispatch_due_at || null,
      current_location: order.current_location || '',
      progress_percent: this.computeProgressPercent(String(order.status || 'Order Placed')),
      latest_update: updates.length > 0 ? updates[updates.length - 1] : null,
    };
  }

  private computeDispatchDueAt(priority: string, sameDayAvailable: boolean) {
    const dueAt = new Date();
    const hours = sameDayAvailable ? 4 : priority === 'urgent' ? 8 : priority === 'priority' ? 16 : 24;
    dueAt.setHours(dueAt.getHours() + hours);
    return dueAt;
  }

  private computeProgressPercent(status: string) {
    const index = Math.max(ORDER_STAGES.indexOf(status), 0);
    return Math.round((index / Math.max(ORDER_STAGES.length - 1, 1)) * 100);
  }

  private computeSlaBucket(order: any) {
    if (!order.dispatch_due_at) {
      return 'watch';
    }
    const dueAt = new Date(order.dispatch_due_at).getTime();
    const delta = dueAt - Date.now();
    if (delta <= 0) {
      return 'breach';
    }
    if (delta <= 6 * 60 * 60 * 1000) {
      return 'at_risk';
    }
    return 'healthy';
  }

  private orderNeedsAttention(order: any) {
    return order.payment_status !== 'confirmed' || this.computeSlaBucket(order) !== 'healthy' || String(order.priority || '') === 'urgent';
  }

  private toKolkataDate(value: Date): string {
    return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(value);
  }

  private generateInvoiceNumber(): string {
    return `INV-${Date.now()}-${randomBytes(2).toString('hex').toUpperCase()}`;
  }

  private generateTrackingCode(): string {
    return `TRK-${randomBytes(3).toString('hex').toUpperCase()}`;
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

  private buildDevGatewayConfig(order: any) {
    const currentMethod = this.normalizePaymentMethod(order?.payment_method || 'UPI');
    return {
      mode: 'dev_dummy',
      methods: DEV_PAYMENT_METHODS.map((method) => ({
        method,
        providers: DEV_PAYMENT_PROVIDERS[method],
      })),
      selected_method: currentMethod,
      selected_provider: String(order?.payment_provider || DEV_PAYMENT_PROVIDERS[currentMethod][0] || ''),
      test_notice: 'Sandbox gateway only. Use demo UPI, test card, or bank selectors to simulate success.',
    };
  }

  private createDevPaymentSession(customer: any, order: any, body: Record<string, unknown>) {
    const method = this.normalizePaymentMethod(body.payment_method || order.payment_method || 'UPI');
    const requestedProvider = String(body.payment_provider || order.payment_provider || '').trim();
    const providers = DEV_PAYMENT_PROVIDERS[method];
    const provider = providers.includes(requestedProvider) ? requestedProvider : providers[0];
    const gatewayDetails: Record<string, unknown> = {
      gateway: 'dev_dummy',
      environment: 'sandbox',
      provider,
      method,
      amount: Number(order.total_price || 0),
      approved_at: new Date().toISOString(),
    };

    let reference = String(body.payment_reference || order.payment_reference || '').trim();
    if (method === 'UPI') {
      const upiId = String(body.upi_id || '').trim() || 'demo@upi';
      if (!/^[a-zA-Z0-9._-]{2,}@[a-zA-Z]{2,}$/.test(upiId)) {
        fail('Enter a valid UPI ID for the sandbox gateway.', 'invalid_upi');
      }
      gatewayDetails.upi_id = upiId;
      gatewayDetails.collect_request_id = `COLLECT-${randomBytes(2).toString('hex').toUpperCase()}`;
      gatewayDetails.test_hint = 'Any UPI PIN can be used in dev mode.';
      reference ||= `UPI-${Date.now()}-${randomBytes(2).toString('hex').toUpperCase()}`;
    } else if (method === 'Card') {
      const cardName = String(body.card_name || customer.full_name || customer.username || 'Demo Customer').trim();
      const digits = String(body.card_number || '').replace(/\D+/g, '');
      const expiry = String(body.card_expiry || '').trim();
      if (digits.length < 12) {
        fail('Enter a valid test card number for the sandbox gateway.', 'invalid_card');
      }
      if (!expiry) {
        fail('Enter a valid card expiry for the sandbox gateway.', 'invalid_card_expiry');
      }
      gatewayDetails.card_name = cardName;
      gatewayDetails.card_last4 = digits.slice(-4);
      gatewayDetails.card_network = this.guessCardNetwork(digits);
      gatewayDetails.card_expiry = expiry;
      gatewayDetails.auth_code = randomBytes(2).toString('hex').toUpperCase();
      reference ||= `CARD-${Date.now()}-${digits.slice(-4)}`;
    } else {
      const bankName = String(body.bank_name || provider).trim();
      const accountHolder = String(body.account_holder || customer.full_name || customer.username || 'Demo Customer').trim();
      if (!bankName) {
        fail('Select a bank for sandbox net banking.', 'invalid_bank');
      }
      gatewayDetails.bank_name = bankName;
      gatewayDetails.account_holder = accountHolder;
      gatewayDetails.bank_session_id = `NB-${randomBytes(3).toString('hex').toUpperCase()}`;
      gatewayDetails.test_hint = 'This is a simulated net banking authorization.';
      reference ||= `NB-${Date.now()}-${randomBytes(2).toString('hex').toUpperCase()}`;
    }

    return { method, provider, reference, gatewayDetails };
  }

  private normalizePaymentMethod(value: unknown): DevPaymentMethod {
    const method = String(value || '').trim().toLowerCase();
    if (method === 'card') {
      return 'Card';
    }
    if (method === 'net banking' || method === 'netbanking' || method === 'net_banking') {
      return 'Net Banking';
    }
    return 'UPI';
  }

  private guessCardNetwork(cardNumber: string): string {
    if (cardNumber.startsWith('4')) {
      return 'Visa';
    }
    if (/^(5[1-5]|2[2-7])/.test(cardNumber)) {
      return 'Mastercard';
    }
    if (cardNumber.startsWith('6')) {
      return 'RuPay';
    }
    return 'Test Card';
  }

  private async createNotification(userId: unknown, title: string, body: string, category: string, meta: Record<string, unknown> = {}) {
    if (!userId || !isValidObjectId(String(userId))) {
      return null;
    }
    return this.notificationModel.create({
      user: userId,
      title,
      body,
      category,
      meta,
    });
  }

  private async notifyFarmerNewOrder(order: any, customer: any): Promise<void> {
    const farmer = order.crop?.farmer as any;
    if (!farmer?.email) {
      return;
    }
    await sendEmailMessage(
      farmer.email,
      'New Order Request - Smart Farmer Market',
      [
        `Hello ${farmer.full_name},`,
        '',
        `You have received a new order request for ${order.crop?.name}.`,
        `Quantity: ${order.quantity}`,
        `Buyer: ${customer.full_name || customer.username}`,
        `Priority: ${order.priority || 'standard'}`,
      ].join('
'),
    );
  }

  private async notifyCustomerPaymentConfirmed(order: any, customer: any): Promise<void> {
    if (!customer?.email) {
      return;
    }
    await sendEmailMessage(
      customer.email,
      'Payment Confirmed - Smart Farmer Market',
      [
        `Hello ${customer.full_name || customer.username},`,
        '',
        `Payment for ${order.crop?.name} has been confirmed.`,
        `Invoice: ${order.invoice_number || ''}`,
        `Tracking code: ${order.tracking_code || ''}`,
      ].join('
'),
    );
  }

  private async notifyCustomerFarmerApproved(order: any): Promise<void> {
    const customer = order.customer as any;
    if (!customer?.email) {
      return;
    }
    await sendEmailMessage(
      customer.email,
      'Order Confirmed - Smart Farmer Market',
      [
        `Hello ${customer.full_name || customer.username},`,
        '',
        `Your farmer has confirmed the order for ${order.crop?.name}.`,
        `Tracking code: ${order.tracking_code || ''}`,
      ].join('
'),
    );
  }
}
