# Data sources — `airports-reference.tsv`

Every airport with scheduled service and an IATA code (ADR-IMPL-036), built on 6 Oct 2026 from:

- **OurAirports** — <https://ourairports.com/data/> (`airports.csv`, `countries.csv`): codes, names, coordinates,
  countries, keywords. Released into the **public domain**.
- **mwgg/Airports** — <https://github.com/mwgg/Airports> (`airports.json`): the city each airport serves and its IANA
  time zone. **MIT License**, reproduced below. Where it has no zone, the country's single zone is used; airports in
  countries with several zones and no known zone are left out, because a wrong zone would show wrong flight times.

Rows load insert-only (`scripts/airports-reference.ts`): the curated `airports.csv` and the company's catalogue import
keep their own values for any airport they hold.

## MIT License — mwgg/Airports

The MIT License (MIT)

Copyright (c) 2014 mwgg

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated
documentation files (the "Software"), to deal in the Software without restriction, including without limitation the
rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit
persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the
Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE
WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR
COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
