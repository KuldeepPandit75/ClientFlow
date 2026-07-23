export function extractTemplateVariables(body) {
  return Array.from(new Set(
    (String(body || "").match(/\{\{([^}]+)\}\}/g) || [])
      .map((token) => token.replace(/[{}]/g, "").trim())
      .filter(Boolean),
  ));
}

export function applyDottedTemplateValues(context, values) {
  for (const [path, value] of Object.entries(values || {})) {
    if (!path.includes(".") || value === undefined || value === null || value === "") continue;
    const parts = path.split(".").map((part) => part.trim()).filter(Boolean);
    let cursor = context;
    for (let index = 0; index < parts.length - 1; index += 1) {
      const part = parts[index];
      if (!cursor[part] || typeof cursor[part] !== "object" || Array.isArray(cursor[part])) cursor[part] = {};
      cursor = cursor[part];
    }
    if (parts.length) cursor[parts[parts.length - 1]] = String(value);
  }
  return context;
}
