export function extractEvolutionInstanceName(payload) {
  const body = payload && typeof payload === "object" ? payload : {};
  const data = body.data && typeof body.data === "object" ? body.data : body;
  const candidates = [
    body.instance,
    body.instanceName,
    data.instanceName,
    typeof data.instance === "string" ? data.instance : null,
    data.instance?.instanceName,
    data.instance?.name,
  ];

  return candidates.find((value) => typeof value === "string" && value.trim())?.trim() || null;
}

export function extractEvolutionMessageId(payload) {
  const body = payload && typeof payload === "object" ? payload : {};
  const data = body.data && typeof body.data === "object" ? body.data : body;
  const key = data.key && typeof data.key === "object" ? data.key : {};
  return typeof key.id === "string" && key.id.trim() ? key.id.trim() : null;
}

export function buildEvolutionEventKey(payload) {
  const body = payload && typeof payload === "object" ? payload : {};
  const event = String(body.event || body.type || "unknown").toLowerCase();
  const instanceName = extractEvolutionInstanceName(body) || "unknown-instance";
  const messageId = extractEvolutionMessageId(body);
  return messageId ? `${instanceName}:${event}:${messageId}` : null;
}
