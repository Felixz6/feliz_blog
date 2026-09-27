function hasClass(node, className) {
  const value = node.properties?.className;
  const classes = Array.isArray(value) ? value : String(value ?? "").split(/\s+/);
  return classes.includes(className);
}

function removeCopyPayload(node, insideCopyControl = false) {
  if (!node || node.type !== "element") {
    for (const child of node?.children ?? []) removeCopyPayload(child, insideCopyControl);
    return;
  }

  const isCopyControl = insideCopyControl || (node.tagName === "div" && hasClass(node, "copy"));
  if (isCopyControl && node.tagName === "button" && node.properties) {
    for (const name of Object.keys(node.properties)) {
      if (name.toLowerCase().replaceAll("-", "") === "datacode") {
        delete node.properties[name];
      }
    }
  }

  for (const child of node.children ?? []) removeCopyPayload(child, isCopyControl);
}

export default function rehypeRemoveExpressiveCodeCopyData() {
  return (tree) => removeCopyPayload(tree);
}
