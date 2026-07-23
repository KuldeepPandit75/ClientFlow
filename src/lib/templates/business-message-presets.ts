export interface BusinessMessagePreset {
  id: string;
  name: string;
  category: string;
  description: string;
  body: string;
  placeholders: Array<{
    key: string;
    label: string;
    example: string;
    automatic: boolean;
  }>;
}

const automatic = {
  customerName: { key: "customer.name", label: "Customer name", example: "Priya", automatic: true },
  customerPhone: { key: "customer.phone", label: "Customer phone", example: "+91 98765 43210", automatic: true },
  businessName: { key: "business.name", label: "Business name", example: "Acme Services", automatic: true },
  agentName: { key: "agent.name", label: "Agent name", example: "Rahul", automatic: true },
};

const custom = (key: string, label: string, example: string) => ({ key, label, example, automatic: false });

export const BUSINESS_MESSAGE_PRESETS: BusinessMessagePreset[] = [
  {
    id: "welcome-first-contact",
    name: "First Contact Welcome",
    category: "welcome",
    description: "Warm greeting that asks what the customer needs.",
    body: "Hi {{customer.name}} 👋\n\nThanks for contacting {{business.name}}. How can we help you today?",
    placeholders: [automatic.customerName, automatic.businessName],
  },
  {
    id: "business-hours-away",
    name: "Outside Business Hours",
    category: "support",
    description: "Acknowledges the message and states when the team will return.",
    body: "Hi {{customer.name}}, thanks for messaging {{business.name}}. Our team is currently offline. Our working hours are {{business.hours}}. We received your message and will reply when we reopen.",
    placeholders: [automatic.customerName, automatic.businessName, custom("business.hours", "Business hours", "Mon–Sat, 9 AM–6 PM")],
  },
  {
    id: "lead-qualification",
    name: "Lead Qualification",
    category: "sales",
    description: "Collects the core information required for a useful sales response.",
    body: "Hi {{customer.name}}, thank you for your interest in {{product.name}}. To recommend the right option, could you share your requirement, preferred timeline, location, and approximate budget?",
    placeholders: [automatic.customerName, custom("product.name", "Product or service", "Website development")],
  },
  {
    id: "quotation-follow-up",
    name: "Quotation Follow-up",
    category: "sales",
    description: "Polite follow-up after sending a quotation.",
    body: "Hi {{customer.name}}, just checking whether you had a chance to review quotation {{quote.number}} for {{product.name}}. I’m happy to clarify the scope, price, or next steps.",
    placeholders: [automatic.customerName, custom("quote.number", "Quotation number", "QT-1042"), custom("product.name", "Product or service", "Office renovation")],
  },
  {
    id: "appointment-confirmation",
    name: "Appointment Confirmation",
    category: "appointments",
    description: "Confirms the date, time, location, and rescheduling instructions.",
    body: "Hi {{customer.name}}, your appointment with {{business.name}} is confirmed.\n\n📅 Date: {{appointment.date}}\n🕒 Time: {{appointment.time}}\n📍 Location: {{appointment.location}}\n\nReply RESCHEDULE if you need another time.",
    placeholders: [automatic.customerName, automatic.businessName, custom("appointment.date", "Appointment date", "25 July 2026"), custom("appointment.time", "Appointment time", "3:30 PM"), custom("appointment.location", "Location or meeting link", "Main office")],
  },
  {
    id: "appointment-reminder",
    name: "Appointment Reminder",
    category: "appointments",
    description: "Short reminder suitable for clinics, salons, consultants, and services.",
    body: "Reminder: Hi {{customer.name}}, your appointment is scheduled for {{appointment.date}} at {{appointment.time}}. Reply CONFIRM to confirm or RESCHEDULE to choose another time.",
    placeholders: [automatic.customerName, custom("appointment.date", "Appointment date", "25 July 2026"), custom("appointment.time", "Appointment time", "3:30 PM")],
  },
  {
    id: "order-confirmed",
    name: "Order Confirmation",
    category: "orders",
    description: "Confirms an order without claiming that it has shipped.",
    body: "Hi {{customer.name}}, we’ve received order {{order.number}} for {{order.summary}}. Total: {{payment.amount}}. We’ll update you when its status changes. Thank you for choosing {{business.name}}.",
    placeholders: [automatic.customerName, automatic.businessName, custom("order.number", "Order number", "ORD-2048"), custom("order.summary", "Order summary", "2 × Premium T-shirt"), custom("payment.amount", "Amount", "₹1,499")],
  },
  {
    id: "order-dispatched",
    name: "Order Dispatched",
    category: "orders",
    description: "Shares courier and tracking details.",
    body: "Good news, {{customer.name}}! Order {{order.number}} has been dispatched via {{shipping.courier}}. Track it here: {{shipping.tracking_url}}. Estimated delivery: {{shipping.eta}}.",
    placeholders: [automatic.customerName, custom("order.number", "Order number", "ORD-2048"), custom("shipping.courier", "Courier", "Blue Dart"), custom("shipping.tracking_url", "Tracking link", "https://example.com/track/2048"), custom("shipping.eta", "Estimated delivery", "2–4 working days")],
  },
  {
    id: "payment-reminder",
    name: "Payment Reminder",
    category: "payments",
    description: "Neutral reminder with invoice and payment information.",
    body: "Hi {{customer.name}}, this is a friendly reminder that invoice {{invoice.number}} for {{payment.amount}} is due on {{payment.due_date}}. You can pay here: {{payment.link}}. Please ignore this message if already paid.",
    placeholders: [automatic.customerName, custom("invoice.number", "Invoice number", "INV-778"), custom("payment.amount", "Amount", "₹5,000"), custom("payment.due_date", "Due date", "30 July 2026"), custom("payment.link", "Payment link", "https://example.com/pay")],
  },
  {
    id: "support-ticket",
    name: "Support Ticket Acknowledgement",
    category: "support",
    description: "Acknowledges a support request without promising an unsupported resolution time.",
    body: "Hi {{customer.name}}, we’ve received your support request. Your reference is {{ticket.number}}. Please share screenshots, the steps that caused the issue, and any error message. Our team will review it and update you here.",
    placeholders: [automatic.customerName, custom("ticket.number", "Ticket number", "SUP-309")],
  },
  {
    id: "feedback-request",
    name: "Feedback Request",
    category: "feedback",
    description: "Requests feedback after a completed purchase or service.",
    body: "Hi {{customer.name}}, thank you for choosing {{business.name}}. How was your experience with {{product.name}}? Reply with a rating from 1–5 and any feedback you’d like to share.",
    placeholders: [automatic.customerName, automatic.businessName, custom("product.name", "Product or service", "your recent service")],
  },
  {
    id: "offer-announcement",
    name: "Offer Announcement",
    category: "offers",
    description: "Clear offer message with validity and opt-out language.",
    body: "Hi {{customer.name}}, {{business.name}} is offering {{offer.details}} until {{offer.expiry}}. Use code {{offer.code}}. Terms: {{offer.terms}}. Reply STOP if you don’t want promotional updates.",
    placeholders: [automatic.customerName, automatic.businessName, custom("offer.details", "Offer details", "20% off selected services"), custom("offer.expiry", "Expiry", "31 July 2026"), custom("offer.code", "Offer code", "JULY20"), custom("offer.terms", "Short terms", "One use per customer")],
  },
  {
    id: "human-handover",
    name: "Human Handover",
    category: "support",
    description: "Tells the customer that a team member will continue the conversation.",
    body: "Thanks, {{customer.name}}. I’m handing this conversation to a team member so we can help accurately. {{agent.name}} will continue with you here.",
    placeholders: [automatic.customerName, automatic.agentName],
  },
];

export const COMMON_TEMPLATE_PLACEHOLDERS = [
  automatic.customerName,
  automatic.customerPhone,
  automatic.businessName,
  automatic.agentName,
  { key: "lastMessage.text", label: "Last customer message", example: "I need pricing", automatic: true },
  custom("appointment.date", "Appointment date", "25 July 2026"),
  custom("appointment.time", "Appointment time", "3:30 PM"),
  custom("order.number", "Order number", "ORD-2048"),
  custom("payment.amount", "Amount", "₹1,499"),
  custom("payment.link", "Payment link", "https://example.com/pay"),
  custom("product.name", "Product or service", "Premium service"),
];
