/** The catalogue import's CSV reader: RFC 4180 over the whole file, each record with the file line it starts on. */
import { describe, expect, it } from "bun:test";
import { CsvError, parseCsv, rowsFromCsv } from "../../src/application/import";

const cells = (raw: string) => parseCsv(raw).map((r) => r.cells);

describe("parseCsv — RFC 4180", () => {
  it("reads a doubled quote inside a quoted cell as one quote", () => {
    expect(cells(`code,description\nLHR,"The ""Big Smoke"", by the Thames."`)).toEqual([
      ["code", "description"],
      ["LHR", `The "Big Smoke", by the Thames.`],
    ]);
  });

  it("keeps a line break inside quotes in its cell: one record, not two", () => {
    const rows = parseCsv(`code,description\nLHR,"Two lines,\none place."\nCDG,Paris`);
    expect(rows.map((r) => r.cells)).toEqual([
      ["code", "description"],
      ["LHR", "Two lines,\none place."],
      ["CDG", "Paris"],
    ]);
    // Each record names the line it starts on: the header is line 1, Paris's record line 4.
    expect(rows.map((r) => r.line)).toEqual([1, 2, 4]);
  });

  it("reads CRLF, CR and LF line ends, and a CRLF inside quotes", () => {
    expect(cells(`a,b\r\n1,"x\r\ny"\r\n2,z\r3,w`)).toEqual([
      ["a", "b"],
      ["1", "x\r\ny"],
      ["2", "z"],
      ["3", "w"],
    ]);
  });

  it("trims unquoted cells, keeps quoted ones as written, keeps empty cells", () => {
    expect(cells(`a,b,c,d\n  x  ," y ",,""`)).toEqual([
      ["a", "b", "c", "d"],
      ["x", " y ", "", ""],
    ]);
  });

  it("ignores blank lines and the empty lines at the end, and a byte-order mark", () => {
    const rows = parseCsv(`﻿a,b\n\n1,2\n   \n3,4\n\n\n`);
    expect(rows.map((r) => [r.line, ...r.cells])).toEqual([
      [1, "a", "b"],
      [3, "1", "2"],
      [5, "3", "4"],
    ]);
  });

  it("refuses a quote left open, naming the line its record starts on", () => {
    expect(() => parseCsv(`a,b\n1,2\n3,"open\nstill open`)).toThrow(CsvError);
    try {
      parseCsv(`a,b\n1,2\n3,"open\nstill open`);
    } catch (e) {
      expect((e as CsvError).line).toBe(3);
    }
  });

  it("refuses text after a closing quote", () => {
    expect(() => parseCsv(`a,b\n1,"x"y`)).toThrow(CsvError);
  });
});

describe("rowsFromCsv", () => {
  it("names each value by its header and keeps the record's line", () => {
    expect(rowsFromCsv(`code,city\nLHR,London\n\nCDG,"Paris"`)).toEqual([
      { line: 2, values: { code: "LHR", city: "London" } },
      { line: 4, values: { code: "CDG", city: "Paris" } },
    ]);
  });

  it("a short record leaves its last values empty; a long one is refused with its line", () => {
    expect(rowsFromCsv(`a,b,c\n1,2`)).toEqual([{ line: 2, values: { a: "1", b: "2", c: "" } }]);
    expect(() => rowsFromCsv(`a,b\n1,2\n1,2,3`)).toThrow(CsvError);
  });

  it("a file with only a header has no rows", () => {
    expect(rowsFromCsv(`a,b\n`)).toEqual([]);
    expect(rowsFromCsv(``)).toEqual([]);
  });
});
