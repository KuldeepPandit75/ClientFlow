import test from "node:test";
import assert from "node:assert/strict";
import {
  buildEvolutionEventKey,
  extractEvolutionInstanceName,
  extractEvolutionMessageId,
} from "../src/lib/evolution/webhook-routing.mjs";

test("extracts top-level Evolution instance", () => {
  assert.equal(extractEvolutionInstanceName({ instance: "clientflow-owner-primary" }), "clientflow-owner-primary");
});

test("extracts nested Evolution instance", () => {
  assert.equal(
    extractEvolutionInstanceName({ data: { instance: { instanceName: "clientflow-agent-primary" } } }),
    "clientflow-agent-primary",
  );
});

test("does not invent a default instance", () => {
  assert.equal(extractEvolutionInstanceName({ event: "MESSAGES_UPSERT" }), null);
});

test("builds a tenant-specific message event key", () => {
  const payload = {
    event: "MESSAGES_UPSERT",
    instance: "clientflow-owner-primary",
    data: { key: { id: "message-1" } },
  };
  assert.equal(extractEvolutionMessageId(payload), "message-1");
  assert.equal(
    buildEvolutionEventKey(payload),
    "clientflow-owner-primary:messages_upsert:message-1",
  );
});

test("does not deduplicate connection events without a message id", () => {
  assert.equal(buildEvolutionEventKey({ event: "CONNECTION_UPDATE", instance: "one" }), null);
});
