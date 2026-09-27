import assert from "node:assert/strict";
import test from "node:test";
import rehypeRemoveExpressiveCodeCopyData from "../src/core/rehype-remove-expressive-code-copy-data.mjs";

test("only Expressive Code copy payloads are removed from the rendered HAST", () => {
  const copyButton = {
    type: "element",
    tagName: "button",
    properties: {
      title: "Copy to clipboard",
      dataCopied: "Copied!",
      dataCode: "source text\u007fnext line",
      ariaLabel: "Copy source"
    },
    children: [{ type: "element", tagName: "div", properties: {}, children: [] }]
  };
  const unrelatedButton = {
    type: "element",
    tagName: "button",
    properties: { "data-code": "unrelated payload", className: ["other-button"] },
    children: [{ type: "text", value: "other" }]
  };
  const tree = {
    type: "root",
    children: [
      {
        type: "element",
        tagName: "figure",
        properties: { className: ["frame"] },
        children: [
          { type: "element", tagName: "pre", properties: {}, children: [] },
          {
            type: "element",
            tagName: "div",
            properties: { className: ["copy"] },
            children: [
              { type: "element", tagName: "div", properties: { ariaLive: "polite" }, children: [] },
              copyButton
            ]
          }
        ]
      },
      unrelatedButton
    ]
  };
  const originalChildren = tree.children;

  rehypeRemoveExpressiveCodeCopyData()(tree as never);

  assert.equal(copyButton.properties.dataCode, undefined);
  assert.deepEqual(copyButton.properties, {
    title: "Copy to clipboard",
    dataCopied: "Copied!",
    ariaLabel: "Copy source"
  });
  assert.equal(unrelatedButton.properties["data-code"], "unrelated payload");
  assert.strictEqual(tree.children, originalChildren);
  assert.strictEqual(tree.children[0].children[1].children[1], copyButton);
});
