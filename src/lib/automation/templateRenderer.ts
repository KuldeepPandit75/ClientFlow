/**
 * Safely replaces template variables in messages.
 * Supported: {{customer.name}}, {{customer.phone}}, {{business.name}},
 *            {{agent.name}}, {{lastMessage.text}}
 */

interface TemplateContext {
  customer?: {
    name?: string;
    phone?: string;
    [key: string]: unknown;
  };
  business?: {
    name?: string;
    [key: string]: unknown;
  };
  agent?: {
    name?: string;
    [key: string]: unknown;
  };
  lastMessage?: {
    text?: string;
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

function getNestedValue(obj: Record<string, unknown>, path: string): string {
  const parts = path.split(".");
  let current: unknown = obj;

  for (const part of parts) {
    if (current == null || typeof current !== "object") return "";
    current = (current as Record<string, unknown>)[part];
  }

  if (current == null) return "";
  return String(current);
}

export function renderTemplate(template: string, context: TemplateContext): string {
  if (!template) return "";

  return template.replace(/\{\{([^}]+)\}\}/g, (_match, path: string) => {
    const trimmedPath = path.trim();
    const value = getNestedValue(context as unknown as Record<string, unknown>, trimmedPath);
    return value || `{{${trimmedPath}}}`;
  });
}
