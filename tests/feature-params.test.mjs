import test from "node:test";
import assert from "node:assert/strict";
import { validateFeatureParams, validFeatureParamsFixture } from "../src/lib/validation/featureParams.mjs";

const PARAMS = [
  "accountKey",
  "nudgeAfterSeconds",
  "closeAfterSeconds",
  "nudgeMessage",
  "closeMessage",
  "templateName",
  "templateCategory",
  "templateBody",
  "templateStatus",
  "bulkName",
  "templateId",
  "recipients",
  "sendAt",
  "quietHoursEnabled",
  "quietHoursStart",
  "quietHoursEnd",
  "dataEncryptionKey",
  "dataEncryptionKeyVersion",
  "dataEncryptionKeyOld",
  "jobType",
  "runAt",
  "webhookEventId",
  "optIn",
];

for (const param of PARAMS) {
  test(`parameter validation: ${param}`, () => {
    const payload = validFeatureParamsFixture();

    switch (param) {
      case "nudgeAfterSeconds":
      case "closeAfterSeconds":
        payload[param] = 0;
        break;
      case "recipients":
        payload[param] = [];
        break;
      case "quietHoursStart":
      case "quietHoursEnd":
        payload[param] = 24;
        break;
      case "quietHoursEnabled":
      case "optIn":
        payload[param] = "yes";
        break;
      case "dataEncryptionKey":
        payload[param] = "short";
        break;
      case "dataEncryptionKeyVersion":
        payload[param] = "version1";
        break;
      case "dataEncryptionKeyOld":
        payload[param] = null;
        break;
      case "jobType":
        payload[param] = "invalid_job";
        break;
      case "sendAt":
      case "runAt":
        payload[param] = "not-a-date";
        break;
      case "templateStatus":
        payload[param] = "pending";
        break;
      default:
        payload[param] = "";
    }

    const result = validateFeatureParams(payload);
    assert.equal(result.valid, false);
    assert.equal(result.errors.includes(param), true);
  });
}
