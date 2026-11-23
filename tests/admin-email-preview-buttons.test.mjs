import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";
import { translate } from "../lib/i18n.ts";

function findButton(element, label) {
  if (!element || typeof element !== "object") return;
  if (element.type === "button" && element.props.children === label) {
    return element;
  }
  for (const child of [element.props?.children].flat()) {
    const match = findButton(child, label);
    if (match) return match;
  }
}

test("each rendered Ukrainian preview button posts only to its own endpoint with its own intent", async () => {
  const source = await readFile(
    new URL(
      "../components/admin/AnnouncementEmailPreview.tsx",
      import.meta.url,
    ),
    "utf8",
  );
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      jsx: ts.JsxEmit.ReactJSX,
    },
  });
  const makeElement = (type, props) => ({ type, props });
  for (const [label, kind, path] of [
    [
      "Надіслати тестове оголошення",
      "announcement",
      "/api/admin/home/announcement-email-preview",
    ],
    [
      "Надіслати тестове запрошення",
      "invitation",
      "/api/admin/home/invitation-email-preview",
    ],
  ]) {
    const calls = [];
    const stateWrites = [];
    const exports = {};
    const dependencies = {
      react: { useState: (value) => [value, (next) => stateWrites.push(next)] },
      "react/jsx-runtime": { jsx: makeElement, jsxs: makeElement },
      "lucide-react": { Mail: () => null },
      "@/components/LocaleProvider": {
        useI18n: () => ({ t: (key) => translate("uk", key) }),
      },
    };
    vm.runInNewContext(outputText, {
      exports,
      require: (name) => {
        assert.ok(name in dependencies, "Unexpected component dependency");
        return dependencies[name];
      },
      fetch: async (target, init) => {
        calls.push([
          target,
          init.method,
          init.headers["x-incora-email-preview"],
          init.credentials,
          init.body,
        ]);
        return Response.json({
          ok: true,
          kind: kind === "invitation" ? "announcement" : kind,
          messageId: "fake-id",
        });
      },
    });
    const button = findButton(exports.AnnouncementEmailPreview(), label);
    assert.ok(button, label);
    await button.props.onClick();
    assert.deepEqual(calls, [[path, "POST", kind, "same-origin", undefined]]);
    if (kind === "invitation") {
      assert.ok(stateWrites.some((value) => value?.error));
      assert.ok(!stateWrites.some((value) => value?.messageId));
    } else {
      assert.ok(stateWrites.some((value) => value?.messageId === "fake-id"));
    }
  }
});
