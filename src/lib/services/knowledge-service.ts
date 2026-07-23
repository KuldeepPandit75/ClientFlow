import { ObjectId } from "mongodb";
import { getDb } from "@/lib/db/mongodb";
import { canManageKnowledge } from "@/lib/permissions";
import type { SessionUser } from "@/lib/backend/types";

function requireAdmin(user: SessionUser): asserts user is SessionUser & { businessId: string } {
  if (!canManageKnowledge(user) || !user.businessId) throw new Error("Forbidden");
}

export async function listKnowledgeDocuments(user: SessionUser) {
  requireAdmin(user);
  const db = await getDb();
  const docs = await db.collection("knowledge_documents")
    .find({ businessId: new ObjectId(user.businessId) })
    .sort({ updatedAt: -1 })
    .toArray();

  return docs.map((doc) => ({
    id: doc._id.toString(),
    title: String((doc as Record<string, unknown>).title || "Untitled"),
    content: String((doc as Record<string, unknown>).content || ""),
    source: String((doc as Record<string, unknown>).source || "manual"),
    tags: Array.isArray((doc as Record<string, unknown>).tags) ? (doc as Record<string, unknown>).tags : [],
    createdAt: (doc as Record<string, unknown>).createdAt,
    updatedAt: (doc as Record<string, unknown>).updatedAt,
  }));
}

export async function createKnowledgeDocument(user: SessionUser, input: { title: string; content: string; tags?: string[]; source?: string }) {
  requireAdmin(user);
  const title = String(input.title || "").trim();
  const content = String(input.content || "").trim();
  if (!title) throw new Error("title is required");
  if (!content) throw new Error("content is required");

  const now = new Date();
  const doc = {
    businessId: new ObjectId(user.businessId),
    title,
    content,
    tags: Array.isArray(input.tags) ? input.tags.map((t) => String(t).trim()).filter(Boolean) : [],
    source: String(input.source || "manual"),
    createdByUserId: new ObjectId(user.id),
    createdAt: now,
    updatedAt: now,
  };
  const db = await getDb();
  const result = await db.collection("knowledge_documents").insertOne(doc);
  return { id: result.insertedId.toString(), ...doc };
}

export async function importKnowledgeDocumentFromTextFile(user: SessionUser, input: {
  fileName: string;
  content: string;
  tags?: string[];
}) {
  const fileName = String(input.fileName || "Uploaded Document");
  const title = fileName.replace(/\.[a-z0-9]+$/i, "").trim() || "Uploaded Document";
  return createKnowledgeDocument(user, {
    title,
    content: input.content,
    tags: input.tags,
    source: "upload",
  });
}

export async function updateKnowledgeDocument(user: SessionUser, id: string, input: { title?: string; content?: string; tags?: string[] }) {
  requireAdmin(user);
  if (!ObjectId.isValid(id)) throw new Error("Invalid document id");
  const patch: Record<string, unknown> = { updatedAt: new Date() };
  if (typeof input.title === "string") patch.title = input.title.trim();
  if (typeof input.content === "string") patch.content = input.content.trim();
  if (Array.isArray(input.tags)) patch.tags = input.tags.map((t) => String(t).trim()).filter(Boolean);

  const db = await getDb();
  const result = await db.collection("knowledge_documents").findOneAndUpdate(
    { _id: new ObjectId(id), businessId: new ObjectId(user.businessId) },
    { $set: patch },
    { returnDocument: "after" },
  );
  if (!result) throw new Error("Document not found");

  return {
    id: result._id.toString(),
    title: String((result as Record<string, unknown>).title || "Untitled"),
    content: String((result as Record<string, unknown>).content || ""),
    tags: Array.isArray((result as Record<string, unknown>).tags) ? (result as Record<string, unknown>).tags : [],
    updatedAt: (result as Record<string, unknown>).updatedAt,
  };
}

export async function deleteKnowledgeDocument(user: SessionUser, id: string) {
  requireAdmin(user);
  if (!ObjectId.isValid(id)) throw new Error("Invalid document id");
  const db = await getDb();
  const result = await db.collection("knowledge_documents").deleteOne({
    _id: new ObjectId(id),
    businessId: new ObjectId(user.businessId),
  });
  if (!result.deletedCount) throw new Error("Document not found");
  return { deleted: true, id };
}

export async function buildKnowledgeContextForBusiness(businessId: string, limit = 5) {
  if (!ObjectId.isValid(businessId)) return "";
  const db = await getDb();
  const docs = await db.collection("knowledge_documents")
    .find({ businessId: new ObjectId(businessId) })
    .sort({ updatedAt: -1 })
    .limit(Math.max(1, Math.min(limit, 10)))
    .toArray();

  if (!docs.length) return "";

  return docs
    .map((doc, idx) => {
      const title = String((doc as Record<string, unknown>).title || `Doc ${idx + 1}`);
      const content = String((doc as Record<string, unknown>).content || "").trim();
      return `- ${title}: ${content}`;
    })
    .join("\n");
}
