# Fixture sources

- `my-information.html`, `my-experience.html`: sanitised snapshots of real Workday
  apply pages, from [pixotags/workday-application-autofill](https://github.com/pixotags/workday-application-autofill)
  (`test/fixtures/my-info.blank.html`, `my-experience.blank.html`), MIT License:

  > MIT License
  >
  > Copyright (c) 2026 YOUR NAME  (as published in that repository)
  >
  > Permission is hereby granted, free of charge, to any person obtaining a copy
  > of this software and associated documentation files (the "Software"), to deal
  > in the Software without restriction, including without limitation the rights
  > to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
  > copies of the Software, and to permit persons to whom the Software is
  > furnished to do so, subject to the following conditions:
  >
  > The above copyright notice and this permission notice shall be included in all
  > copies or substantial portions of the Software.
  >
  > THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
  > IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
  > FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
  > AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
  > LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
  > OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
  > SOFTWARE.

- `application-questions.html`, `voluntary-disclosures.html`, `self-identify.html`:
  written for this repo in the same markup (formField containers, listbox buttons,
  multiSelectContainer prompts, dateSection spinners). No real snapshot of these
  steps was available, so verify them on a live application.

The saved pages contain only the closed state of each widget; `test/mocks.js`
adds the behaviour Workday's own scripts provide (open a list, search, Add).
