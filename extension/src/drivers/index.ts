import type { FieldDriver } from "../core/types";
import { checkboxDriver, checkboxGroupDriver, fileDriver, radioDriver, selectDriver, textDriver } from "./basic";
import { listboxDriver } from "./listbox";

/** Generic drivers, most specific first. Site adapters put their own in front. */
export const GENERIC_DRIVERS: FieldDriver[] = [
  listboxDriver,
  radioDriver,
  checkboxGroupDriver,
  checkboxDriver,
  selectDriver,
  fileDriver,
  textDriver,
];

export function driverFor(el: Element, drivers: FieldDriver[]): FieldDriver | undefined {
  return drivers.find((d) => d.detect(el));
}
