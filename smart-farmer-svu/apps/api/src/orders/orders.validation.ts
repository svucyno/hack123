import { HttpStatus } from '@nestjs/common';

import { ORDER_STAGES } from '../common/constants';
import { fail } from '../common/http-response';

export type OrderPlacementPayload = {
  cropId: string;
  quantity: number;
  buyerNote: string;
  deliveryAddress: string;
  fulfillmentWindow: string;
  requestedBulk: boolean;
  paymentMethod: string;
  requestedDeliveryDate: string;
  customerPhone: string;
};

export function normalizeOrderPlacementPayload(body: Record<string, unknown>): OrderPlacementPayload {
  const cropId = String(body.crop_id || '').trim();
  const quantity = Number(body.quantity || 0);
  const buyerNote = String(body.buyer_note || '').trim().slice(0, 240);
  const deliveryAddress = String(body.delivery_address || '').trim();
  const fulfillmentWindow = String(body.fulfillment_window || '').trim();
  const requestedBulk = toBoolean(body.is_bulk_order);
  const paymentMethod = String(body.payment_method || 'UPI').trim();
  const requestedDeliveryDate = String(body.requested_delivery_date || '').trim();
  const customerPhone = String(body.customer_phone || body.contact || '').trim();

  if (!cropId) {
    fail('Crop not found', 'crop_not_found', HttpStatus.NOT_FOUND);
  }
  if (!Number.isFinite(quantity) || quantity <= 0) {
    fail('Requested quantity must be greater than zero', 'invalid_quantity');
  }
  if (buyerNote.length > 240) {
    fail('Buyer note is too long', 'buyer_note_too_long');
  }

  return {
    cropId,
    quantity: Number(quantity.toFixed(2)),
    buyerNote,
    deliveryAddress,
    fulfillmentWindow,
    requestedBulk,
    paymentMethod,
    requestedDeliveryDate,
    customerPhone,
  };
}

export function assertAllowedOrderTransition(previousStatus: string, nextStatus: string) {
  const fromIndex = ORDER_STAGES.indexOf(previousStatus);
  const toIndex = ORDER_STAGES.indexOf(nextStatus);
  if (nextStatus === 'Cancelled') {
    return;
  }
  if (fromIndex === -1 || toIndex === -1) {
    fail('Unsupported order status', 'invalid_order_status');
  }
  if (toIndex < fromIndex) {
    fail('Order status cannot move backwards', 'invalid_order_transition');
  }
  if (toIndex - fromIndex > 2) {
    fail('Order status jump is too large for this workflow', 'invalid_order_transition');
  }
}

export function computeFulfillmentPriority(quantity: number, totalPrice: number, sameDayAvailable: boolean): 'standard' | 'priority' | 'urgent' {
  if (sameDayAvailable || totalPrice >= 10000) {
    return 'urgent';
  }
  if (quantity >= 50 || totalPrice >= 4000) {
    return 'priority';
  }
  return 'standard';
}

export function computeRiskBand(paymentMethod: string, totalPrice: number, isBulkOrder: boolean): 'low' | 'medium' | 'high' {
  const normalized = String(paymentMethod || '').trim().toLowerCase();
  if (normalized === 'card' && totalPrice > 8000) {
    return 'high';
  }
  if (isBulkOrder || totalPrice > 5000) {
    return 'medium';
  }
  return 'low';
}

export function buildOrderBreakdown(unitPrice: number, quantity: number, deliveryRadiusKm: number, isBulkOrder: boolean) {
  const subtotal = Number((unitPrice * quantity).toFixed(2));
  const platformFee = Number((subtotal * 0.02).toFixed(2));
  const distanceFee = Number(Math.min(Math.max(deliveryRadiusKm, 10), 60) * 2.5);
  const deliveryFee = Number((isBulkOrder ? distanceFee + 90 : distanceFee).toFixed(2));
  const discountAmount = Number((isBulkOrder && subtotal >= 5000 ? subtotal * 0.015 : 0).toFixed(2));
  const total = Number((subtotal + platformFee + deliveryFee - discountAmount).toFixed(2));
  return { subtotal, platformFee, deliveryFee, discountAmount, total };
}

export function buildDispatchSnapshot(quantity: number, unit: string, priority: string, sameDayAvailable: boolean) {
  const packLeadHours = sameDayAvailable ? 4 : quantity >= 50 ? 18 : 8;
  return {
    pack_lead_hours: packLeadHours,
    dispatch_bucket: sameDayAvailable ? 'same_day' : priority === 'urgent' ? 'fast_track' : 'planned',
    unit: unit || 'kg',
  };
}

function toBoolean(value: unknown): boolean {
  if (typeof value === 'boolean') {
    return value;
  }
  return ['1', 'true', 'yes', 'on'].includes(String(value || '').trim().toLowerCase());
}
