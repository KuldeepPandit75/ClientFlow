import type {
  BackendState,
} from "@/lib/backend/types";

const state: BackendState = {
  whatsapp: {
    provider: "evolution",
    connected: false,
    businessNumber: "",
    webhookUrl: "http://host.docker.internal:3000/api/webhooks/evolution",
    cloudinaryEnabled: false,
  },
  currentUser: {
    id: "u-admin-1",
    name: "Akash Sharma",
    email: "akash@company.com",
    role: "admin",
    businessId: "legacy-business",
    status: "active",
    permissions: [],
  },
  users: [
    {
      id: "u-admin-1",
      name: "Akash Sharma",
      email: "akash@company.com",
      role: "admin",
      businessId: "legacy-business",
      status: "active",
      permissions: [],
      password: "admin123",
    },
  ],
};

export function getState() {
  return state;
}
