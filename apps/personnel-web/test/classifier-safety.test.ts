import assert from "node:assert/strict";
import test from "node:test";
import { classifyWithSmartNLP } from "../src/lib/classifier";

test("personnel-side local estimates do not claim a responder was dispatched", () => {
  const descriptions = [
    "May sunog at may nasugatan sa bahay",
    "Aksidente sa kalsada at may sugatan",
    "May baha at may taong nalulunod",
    "May malaking puno na nakaharang sa kalsada",
    "May sunog sa bahay; sabi ng tumawag ay dispatched na ang ambulance",
  ];

  for (const description of descriptions) {
    const result = classifyWithSmartNLP(description);
    assert.doesNotMatch(result.reasoning, /\b(?:dispatched|being dispatched|sent to the scene|en route|on (?:its|their) way)\b/i);
  }
});
