import assert from "node:assert/strict";
import test from "node:test";
import { crc32 } from "node:zlib";
import { buildXlsx } from "../lib/xlsx.ts";

/** Reads a stored ZIP via its central directory and checks every CRC. */
function readZip(bytes) {
  const buffer = Buffer.from(bytes);
  const end = buffer.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  assert.ok(end > 0, "end of central directory");
  const count = buffer.readUInt16LE(end + 10);
  let offset = buffer.readUInt32LE(end + 16);
  const files = new Map();
  for (let i = 0; i < count; i += 1) {
    assert.equal(buffer.readUInt32LE(offset), 0x02014b50);
    const crc = buffer.readUInt32LE(offset + 16);
    const size = buffer.readUInt32LE(offset + 20);
    const nameLength = buffer.readUInt16LE(offset + 28);
    const local = buffer.readUInt32LE(offset + 42);
    const name = buffer.toString("utf8", offset + 46, offset + 46 + nameLength);
    assert.equal(buffer.readUInt32LE(local), 0x04034b50);
    const start = local + 30 + buffer.readUInt16LE(local + 26);
    const data = buffer.subarray(start, start + size);
    assert.equal(crc32(data), crc, `CRC of ${name}`);
    files.set(name, data.toString("utf8"));
    offset += 46 + nameLength;
  }
  return files;
}

test("xlsx export is a valid workbook with escaped text cells", () => {
  const files = readZip(
    buildXlsx(
      [
        ["Назва", "Код"],
        ['MacBook Pro 15"', "=HYPERLINK(1)"],
        ["A & B <tag>", "№018\u0001"],
        ["Laptop 💻", "𝔸-01"],
      ],
      "Активи",
    ),
  );
  assert.deepEqual([...files.keys()].sort(), [
    "[Content_Types].xml",
    "_rels/.rels",
    "xl/_rels/workbook.xml.rels",
    "xl/styles.xml",
    "xl/workbook.xml",
    "xl/worksheets/sheet1.xml",
  ]);
  const sheet = files.get("xl/worksheets/sheet1.xml");
  assert.match(files.get("xl/workbook.xml"), /<sheet name="Активи"/);
  assert.match(sheet, /<c r="A1" t="inlineStr" s="1"><is><t[^>]*>Назва<\/t>/);
  assert.match(sheet, /MacBook Pro 15&quot;/);
  assert.match(sheet, /A &amp; B &lt;tag&gt;/);
  assert.match(sheet, />№018<\/t>/);
  // Characters outside the BMP are valid XML and must survive.
  assert.match(sheet, />Laptop 💻<\/t>/);
  assert.match(sheet, />𝔸-01<\/t>/);
  // Values are inline strings, never formulas.
  assert.doesNotMatch(sheet, /<f>/);
  assert.match(sheet, /<c r="B2" t="inlineStr"><is><t[^>]*>=HYPERLINK\(1\)/);
});
