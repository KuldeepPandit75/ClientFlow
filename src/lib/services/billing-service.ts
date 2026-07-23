import { createHmac, timingSafeEqual } from "crypto";
import { ObjectId } from "mongodb";
import type { BusinessPlan, SessionUser } from "@/lib/backend/types";
import { createAuditLog } from "@/lib/audit";
import { getDb } from "@/lib/db/mongodb";
import { PLAN_LIMITS, PLAN_PRICES } from "@/lib/plan-limits";

type CouponStatus = "active" | "disabled";
type DiscountType = "percent" | "fixed";

interface BillingCoupon {
  _id?: ObjectId;
  code: string;
  normalizedCode: string;
  discountType: DiscountType;
  discountValue: number;
  status: CouponStatus;
  expiresAt?: Date | null;
  maxRedemptions?: number | null;
  redeemedCount?: number;
  appliesToPlans?: BusinessPlan[];
}

interface BillingPayment {
  businessId: ObjectId;
  userId: ObjectId | null;
  provider: "razorpay" | "coupon" | "manual";
  razorpayOrderId?: string;
  razorpayPaymentId?: string;
  plan: BusinessPlan;
  previousPlan: BusinessPlan;
  amount: number;
  originalAmount: number;
  discountAmount: number;
  currency: "INR";
  couponCode?: string | null;
  status: "created" | "paid" | "failed" | "applied";
  createdAt: Date;
  updatedAt: Date;
  paidAt?: Date;
}

interface RazorpayPlatformSettings {
  _id: string;
  keyId?: string;
  keySecret?: string;
}

const STATIC_COUPONS: BillingCoupon[] = [
  {
    code: "CLIENTFLOW20",
    normalizedCode: "CLIENTFLOW20",
    discountType: "percent",
    discountValue: 20,
    status: "active",
  },
];

function assertAdmin(user: SessionUser) {
  if (user.role !== "admin" || !user.businessId) {
    throw new Error("Forbidden");
  }
}

function safeObjectId(value?: string | null) {
  return value && ObjectId.isValid(value) ? new ObjectId(value) : null;
}

function normalizeCouponCode(code?: string | null) {
  return code?.trim().toUpperCase() || "";
}

function formatPlan(plan: BusinessPlan) {
  return plan.charAt(0).toUpperCase() + plan.slice(1);
}

function toPlan(value: unknown): BusinessPlan {
  if (typeof value !== "string" || !(value in PLAN_LIMITS)) {
    throw new Error("Choose a valid plan");
  }
  return value as BusinessPlan;
}

async function getRazorpayCredentials() {
  const db = await getDb();
  const settings = await db.collection<RazorpayPlatformSettings>("platform_settings").findOne({ _id: "razorpay" });
  const keyId = settings?.keyId?.trim() || process.env.RAZORPAY_KEY_ID?.trim();
  const keySecret = settings?.keySecret?.trim() || process.env.RAZORPAY_KEY_SECRET?.trim();

  if (!keyId || !keySecret) {
    throw new Error("Razorpay is not configured. Add RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET.");
  }

  return { keyId, keySecret };
}

async function ensureBillingIndexes() {
  const db = await getDb();
  await Promise.all([
    db.collection("billing_payments").createIndex({ businessId: 1, createdAt: -1 }, { name: "billing_payments_business_created" }),
    db.collection("billing_payments").createIndex({ razorpayOrderId: 1 }, { name: "billing_payments_razorpay_order" }),
    db.collection("coupons").createIndex({ normalizedCode: 1 }, { unique: true, name: "coupons_normalized_code_unique" }),
  ]);
}

async function loadBusiness(user: SessionUser) {
  assertAdmin(user);
  const businessId = safeObjectId(user.businessId);
  if (!businessId) throw new Error("Business workspace is missing");

  const db = await getDb();
  const business = await db.collection("businesses").findOne({ _id: businessId });
  if (!business) throw new Error("Business not found");
  if (business.status !== "active") {
    throw new Error("This business workspace is not active");
  }

  return { db, business, businessId };
}

async function getUsage(businessId: ObjectId) {
  const db = await getDb();
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const [agents, whatsappAccounts, customers, monthlyMessages, automations] = await Promise.all([
    db.collection("users").countDocuments({ businessId, role: "sub_agent", status: { $ne: "disabled" } }),
    db.collection("whatsapp_sessions").countDocuments({ businessId }),
    db.collection("customers").countDocuments({ businessId }),
    db.collection("messages").countDocuments({ businessId, createdAt: { $gte: monthStart } }),
    db.collection("automations").countDocuments({ businessId }),
  ]);

  return {
    agents,
    whatsappAccounts,
    customers,
    monthlyMessages,
    automations,
  };
}

async function findCoupon(code?: string | null, plan?: BusinessPlan) {
  const normalizedCode = normalizeCouponCode(code);
  if (!normalizedCode) return null;

  const db = await getDb();
  const storedCoupon = await db.collection<BillingCoupon>("coupons").findOne({ normalizedCode });
  const coupon = storedCoupon || STATIC_COUPONS.find((item) => item.normalizedCode === normalizedCode);

  if (!coupon) throw new Error("Coupon code is not valid");
  if (coupon.status !== "active") throw new Error("Coupon code is not active");
  if (coupon.expiresAt && new Date(coupon.expiresAt).getTime() < Date.now()) {
    throw new Error("Coupon code has expired");
  }
  if (coupon.maxRedemptions && (coupon.redeemedCount || 0) >= coupon.maxRedemptions) {
    throw new Error("Coupon code has reached its usage limit");
  }
  if (plan && coupon.appliesToPlans?.length && !coupon.appliesToPlans.includes(plan)) {
    throw new Error("Coupon code is not valid for this plan");
  }

  return coupon;
}

async function applyPlan(input: {
  user: SessionUser;
  businessId: ObjectId;
  previousPlan: BusinessPlan;
  plan: BusinessPlan;
  coupon?: BillingCoupon | null;
  metadata?: Record<string, unknown>;
}) {
  const now = new Date();
  const db = await getDb();
  await db.collection("businesses").updateOne(
    { _id: input.businessId },
    {
      $set: {
        plan: input.plan,
        limits: PLAN_LIMITS[input.plan],
        updatedAt: now,
      },
    },
  );

  if (input.coupon?._id) {
    await db.collection("coupons").updateOne(
      { _id: input.coupon._id },
      { $inc: { redeemedCount: 1 }, $set: { updatedAt: now } },
    );
  }

  await createAuditLog({
    businessId: input.businessId,
    actorUser: input.user,
    action: "billing.plan_changed",
    targetType: "business",
    targetId: input.businessId,
    metadata: {
      previousPlan: input.previousPlan,
      plan: input.plan,
      couponCode: input.coupon?.code || null,
      ...input.metadata,
    },
  });
}

export async function getBilling(user: SessionUser) {
  const { db, business, businessId } = await loadBusiness(user);
  const owner = business.ownerUserId
    ? await db.collection("users").findOne({ _id: business.ownerUserId })
    : null;
  const usage = await getUsage(businessId);
  const plan = toPlan(business.plan || "free");
  const limits = business.limits || PLAN_LIMITS[plan];

  return {
    business: {
      id: business._id.toString(),
      name: business.name,
      status: business.status,
      plan,
    },
    owner: owner
      ? {
        name: owner.name,
        email: owner.email,
      }
      : null,
    limits,
    usage,
    plans: Object.entries(PLAN_LIMITS).map(([name, planLimits]) => {
      const planName = name as BusinessPlan;
      return {
        name: planName,
        limits: planLimits,
        current: planName === plan,
        price: PLAN_PRICES[planName],
      };
    }),
  };
}

export async function createPlanOrder(user: SessionUser, input: { plan: unknown; couponCode?: string | null }) {
  await ensureBillingIndexes();
  const targetPlan = toPlan(input.plan);
  const { business, businessId } = await loadBusiness(user);
  const previousPlan = toPlan(business.plan || "free");
  const originalAmount = PLAN_PRICES[targetPlan].monthlyAmount;

  if (previousPlan === targetPlan) {
    return {
      requiresPayment: false,
      message: `You are already on the ${formatPlan(targetPlan)} plan.`,
      plan: targetPlan,
      amount: originalAmount,
      originalAmount,
      discountAmount: 0,
      coupon: null,
    };
  }
  const coupon = await findCoupon(input.couponCode, targetPlan);
  const requestedDiscount = coupon
    ? coupon.discountType === "percent"
      ? Math.round(originalAmount * Math.min(Math.max(coupon.discountValue, 0), 100) / 100)
      : Math.max(0, Math.round(coupon.discountValue))
    : 0;
  const discountAmount = Math.min(originalAmount, requestedDiscount);
  const amount = Math.max(0, originalAmount - discountAmount);
  const now = new Date();
  const userId = safeObjectId(user.id);

  // Direct switching is deliberately restricted to local learning environments.
  if (process.env.BILLING_LEARNING_MODE === "true" || amount === 0) {
    await (await getDb()).collection<BillingPayment>("billing_payments").insertOne({
      businessId,
      userId,
      provider: amount === 0 && coupon ? "coupon" : "manual",
      plan: targetPlan,
      previousPlan,
      amount,
      originalAmount,
      discountAmount,
      currency: "INR",
      couponCode: coupon?.code || null,
      status: "applied",
      createdAt: now,
      updatedAt: now,
      paidAt: now,
    });

    await applyPlan({
      user,
      businessId,
      previousPlan,
      plan: targetPlan,
      coupon,
      metadata: { amount, originalAmount, discountAmount, provider: "manual", mode: "learning_or_free" },
    });

    return {
      requiresPayment: false,
      message: `${formatPlan(targetPlan)} plan is now active.`,
      plan: targetPlan,
      amount,
      originalAmount,
      discountAmount,
      coupon: coupon?.code || null,
    };
  }

  const { keyId, keySecret } = await getRazorpayCredentials();
  const orderResponse = await fetch("https://api.razorpay.com/v1/orders", {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${keyId}:${keySecret}`).toString("base64")}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      amount,
      currency: "INR",
      receipt: `plan_${businessId.toString().slice(-10)}_${Date.now()}`,
      notes: { businessId: businessId.toString(), plan: targetPlan },
    }),
  });
  const order = await orderResponse.json() as { id?: string; error?: { description?: string } };
  if (!orderResponse.ok || !order.id) {
    throw new Error(order.error?.description || "Razorpay order could not be created");
  }

  await (await getDb()).collection<BillingPayment>("billing_payments").insertOne({
    businessId,
    userId,
    provider: "razorpay",
    razorpayOrderId: order.id,
    plan: targetPlan,
    previousPlan,
    amount,
    originalAmount,
    discountAmount,
    currency: "INR",
    couponCode: coupon?.code || null,
    status: "created",
    createdAt: now,
    updatedAt: now,
  });

  return {
    requiresPayment: true,
    plan: targetPlan,
    amount,
    originalAmount,
    discountAmount,
    coupon: coupon?.code || null,
    keyId,
    orderId: order.id,
    currency: "INR" as const,
  };
}

export async function verifyPlanPayment(user: SessionUser, input: {
  razorpay_order_id?: string;
  razorpay_payment_id?: string;
  razorpay_signature?: string;
}) {
  await ensureBillingIndexes();
  const { businessId } = await loadBusiness(user);
  const orderId = input.razorpay_order_id?.trim();
  const paymentId = input.razorpay_payment_id?.trim();
  const signature = input.razorpay_signature?.trim();

  if (!orderId || !paymentId || !signature) {
    throw new Error("Payment verification details are missing");
  }

  const { keySecret } = await getRazorpayCredentials();
  const expected = createHmac("sha256", keySecret)
    .update(`${orderId}|${paymentId}`)
    .digest("hex");
  const expectedBuffer = Buffer.from(expected, "hex");
  const actualBuffer = Buffer.from(signature, "hex");

  if (expectedBuffer.length !== actualBuffer.length || !timingSafeEqual(expectedBuffer, actualBuffer)) {
    throw new Error("Payment signature verification failed");
  }

  const db = await getDb();
  const payment = await db.collection<BillingPayment>("billing_payments").findOne({
    businessId,
    razorpayOrderId: orderId,
    provider: "razorpay",
  });

  if (!payment) throw new Error("Payment order was not found");
  if (payment.status === "paid") {
    return {
      message: `${formatPlan(payment.plan)} plan is already active.`,
      plan: payment.plan,
    };
  }

  const now = new Date();
  await db.collection<BillingPayment>("billing_payments").updateOne(
    { _id: (payment as BillingPayment & { _id: ObjectId })._id },
    {
      $set: {
        status: "paid",
        razorpayPaymentId: paymentId,
        updatedAt: now,
        paidAt: now,
      },
    },
  );

  let coupon: BillingCoupon | null = null;
  if (payment.couponCode) {
    try {
      coupon = await findCoupon(payment.couponCode, payment.plan);
    } catch {
      coupon = {
        code: payment.couponCode,
        normalizedCode: normalizeCouponCode(payment.couponCode),
        discountType: "fixed",
        discountValue: payment.discountAmount,
        status: "active",
      };
    }
  }
  await applyPlan({
    user,
    businessId,
    previousPlan: payment.previousPlan,
    plan: payment.plan,
    coupon,
    metadata: {
      amount: payment.amount,
      originalAmount: payment.originalAmount,
      discountAmount: payment.discountAmount,
      razorpayOrderId: orderId,
      razorpayPaymentId: paymentId,
      provider: "razorpay",
    },
  });

  return {
    message: `${formatPlan(payment.plan)} plan is now active.`,
    plan: payment.plan,
  };
}
