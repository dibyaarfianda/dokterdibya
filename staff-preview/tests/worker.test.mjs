import test from "node:test";
import assert from "node:assert/strict";
import { runInNewContext } from "node:vm";
import { workerSource } from "../scripts/worker-source.mjs";
function runtime() {
  const handlers = {};
  const deleted = [];
  const self = {
    location: { origin: "https://dokterdibya.com" },
    clients: { claim: async () => {} },
    addEventListener: (key, fn) => (handlers[key] = fn),
  };
  const caches = {
    keys: async () => [
      "sisiwanita-patient-portal-current",
      "dokterdibya-staff-v454",
      "dibya-staff-preview-old",
      "dibya-staff-preview-123456789abc",
    ],
    delete: async (key) => deleted.push(key),
    match: async () => "cached-preview",
  };
  runInNewContext(workerSource("123456789abc", ["/staff-preview/index.html"]), {
    self,
    caches,
    URL,
    fetch: async () => {
      throw new Error("offline");
    },
  });
  return { handlers, deleted };
}
test("preview activation only retires its own older caches", async () => {
  const { handlers, deleted } = runtime();
  let pending;
  handlers.activate({ waitUntil: (p) => (pending = p) });
  await pending;
  assert.deepEqual(deleted, ["dibya-staff-preview-old"]);
});
test("worker never intercepts clinical APIs or other apps and supports offline preview navigation", async () => {
  const { handlers } = runtime();
  for (const url of [
    "https://dokterdibya.com/api/patients",
    "https://dokterdibya.com/staff/public/index-adminlte.html",
    "https://dokterdibya.com/docboard/",
    "https://example.invalid/staff-preview/index.html",
  ]) {
    let intercepted = false;
    handlers.fetch({
      request: { url, method: "GET", mode: "navigate" },
      respondWith: () => (intercepted = true),
    });
    assert.equal(intercepted, false, url);
  }
  let result;
  handlers.fetch({
    request: {
      url: "https://dokterdibya.com/staff-preview/",
      method: "GET",
      mode: "navigate",
    },
    respondWith: (p) => (result = p),
  });
  assert.equal(await result, "cached-preview");
});
