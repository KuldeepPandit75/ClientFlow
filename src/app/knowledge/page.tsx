"use client";

import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { apiGet, apiSend } from "@/lib/api/client";
import { FileText, Plus, RefreshCw, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

interface KnowledgeDocument {
  id: string;
  title: string;
  content: string;
  source: string;
  tags: string[];
  updatedAt: string;
}

export default function KnowledgePage() {
  const [documents, setDocuments] = useState<KnowledgeDocument[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [tags, setTags] = useState("");
  const [query, setQuery] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const selected = documents.find((item) => item.id === selectedId);
  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return documents;
    return documents.filter((doc) =>
      [doc.title, doc.content, doc.source, doc.tags.join(" ")]
        .some((value) => value.toLowerCase().includes(term)),
    );
  }, [documents, query]);

  const resetForm = () => {
    setSelectedId("");
    setTitle("");
    setContent("");
    setTags("");
  };

  const load = async () => {
    setLoading(true);
    try {
      const data = await apiGet<KnowledgeDocument[]>("/api/knowledge");
      setDocuments(data);
      if (!selectedId && data[0]) {
        setSelectedId(data[0].id);
        setTitle(data[0].title);
        setContent(data[0].content);
        setTags(data[0].tags.join(", "));
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not load knowledge base");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    queueMicrotask(() => void load());
    // Initial fetch only; later mutations call load explicitly.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const chooseDocument = (doc: KnowledgeDocument) => {
    setSelectedId(doc.id);
    setTitle(doc.title);
    setContent(doc.content);
    setTags(doc.tags.join(", "));
    setMessage("");
  };

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setMessage("");
    const payload = {
      title,
      content,
      tags: tags.split(",").map((tag) => tag.trim()).filter(Boolean),
    };
    try {
      if (selectedId) {
        await apiSend(`/api/knowledge/${selectedId}`, "PATCH", payload);
        setMessage("Knowledge document updated");
      } else {
        const created = await apiSend<KnowledgeDocument>("/api/knowledge", "POST", payload);
        setSelectedId(created.id);
        setMessage("Knowledge document created");
      }
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Knowledge document could not be saved");
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!selectedId || !confirm("Delete this knowledge document?")) return;
    setSaving(true);
    try {
      await apiSend(`/api/knowledge/${selectedId}`, "DELETE");
      resetForm();
      setMessage("Knowledge document deleted");
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Knowledge document could not be deleted");
    } finally {
      setSaving(false);
    }
  };

  return (
    <DashboardLayout title="Knowledge Base">
      <div className="grid min-h-[calc(100vh-4rem)] gap-0 md:grid-cols-[340px_1fr]">
        <aside className="border-r border-border bg-card">
          <div className="border-b border-border p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="font-display text-lg font-bold">Knowledge Base</h2>
                <p className="text-xs text-muted-foreground">{documents.length} document{documents.length === 1 ? "" : "s"}</p>
              </div>
              <button onClick={resetForm} className="rounded-lg border border-border p-2 hover:bg-secondary" title="New document">
                <Plus className="h-4 w-4" />
              </button>
            </div>
            <Input className="mt-4" placeholder="Search knowledge" value={query} onChange={(event) => setQuery(event.target.value)} />
          </div>
          <div className="max-h-[calc(100vh-12rem)] overflow-y-auto">
            {loading ? (
              <div className="p-4 text-sm text-muted-foreground">Loading...</div>
            ) : filtered.map((doc) => (
              <button
                key={doc.id}
                onClick={() => chooseDocument(doc)}
                className={`w-full border-b border-border p-4 text-left hover:bg-secondary ${doc.id === selectedId ? "bg-secondary" : ""}`}
              >
                <div className="flex items-start gap-3">
                  <FileText className="mt-0.5 h-4 w-4 text-muted-foreground" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold">{doc.title}</p>
                    <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{doc.content}</p>
                    <p className="mt-2 text-[11px] uppercase text-muted-foreground">{doc.source}</p>
                  </div>
                </div>
              </button>
            ))}
            {!loading && !filtered.length && <div className="p-4 text-sm text-muted-foreground">No documents found.</div>}
          </div>
        </aside>

        <main className="p-5 md:p-8">
          <form onSubmit={save} className="mx-auto max-w-3xl space-y-5">
            <div className="flex items-center justify-between gap-4">
              <div>
                <h2 className="text-xl font-bold">{selected ? "Edit Document" : "New Document"}</h2>
                <p className="text-sm text-muted-foreground">This content is used by AI replies for this workspace only.</p>
              </div>
              <button type="button" onClick={() => void load()} className="rounded-lg border border-border p-2 hover:bg-secondary" title="Refresh">
                <RefreshCw className="h-4 w-4" />
              </button>
            </div>
            <Input placeholder="Title" value={title} onChange={(event) => setTitle(event.target.value)} required />
            <textarea
              value={content}
              onChange={(event) => setContent(event.target.value)}
              rows={14}
              required
              placeholder="Add services, pricing, policies, FAQs, opening hours, handover rules, or any business-specific information."
              className="w-full rounded-lg border border-border bg-background px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-primary/20"
            />
            <Input placeholder="Tags, comma separated" value={tags} onChange={(event) => setTags(event.target.value)} />
            {message && <p className="text-sm text-muted-foreground">{message}</p>}
            <div className="flex items-center justify-between gap-3">
              <Button type="submit" disabled={saving}>{saving ? "Saving..." : selectedId ? "Update Document" : "Create Document"}</Button>
              {selectedId && (
                <button type="button" onClick={remove} disabled={saving} className="inline-flex items-center gap-2 rounded-lg border border-destructive/30 px-4 py-2 text-sm text-destructive hover:bg-destructive/10">
                  <Trash2 className="h-4 w-4" /> Delete
                </button>
              )}
            </div>
          </form>
        </main>
      </div>
    </DashboardLayout>
  );
}
