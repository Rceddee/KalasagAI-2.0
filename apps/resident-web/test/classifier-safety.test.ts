import assert from "node:assert/strict";
import test from "node:test";
import { classifyWithSmartNLP } from "../src/lib/classifier";
import { REPORT_SUBMISSION_STATUS_MESSAGE } from "../src/lib/report-messages";

test("local screening estimates never claim responders were dispatched", () => {
  const descriptions = [
    "May sunog at may nasugatan sa bahay",
    "Aksidente sa kalsada at may sugatan",
    "May baha at may taong nalulunod",
    "May malaking puno na nakaharang sa kalsada",
    "May sunog sa bahay pero walang nasaktan",
    "May sunog sa bahay; sabi ng tumawag ay dispatched na ang ambulance",
  ];

  for (const description of descriptions) {
    const result = classifyWithSmartNLP(description);
    assert.doesNotMatch(result.reasoning, /\b(?:dispatched|being dispatched|sent to the scene|en route|on (?:its|their) way)\b/i);
  }
});

test("submission confirmation distinguishes receipt, review, and dispatch status", () => {
  assert.match(REPORT_SUBMISSION_STATUS_MESSAGE, /Operational status: Received/i);
  assert.match(REPORT_SUBMISSION_STATUS_MESSAGE, /preliminary suggestions for personnel review/i);
  assert.match(REPORT_SUBMISSION_STATUS_MESSAGE, /No responder dispatch is confirmed/i);
  assert.doesNotMatch(REPORT_SUBMISSION_STATUS_MESSAGE, /\b(?:ambulance|fire truck|rescue team)\b.{0,30}\bdispatched\b/i);
});
