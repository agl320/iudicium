import type { SiteAdapter } from "../core/engine";
import { ashby } from "./ashby/adapter";
import { generic } from "./generic/adapter";
import { greenhouse } from "./greenhouse/adapter";
import { lever } from "./lever/adapter";
import { workday } from "./workday/adapter";

/** Most specific first; the generic form scanner is the fallback. */
export const ADAPTERS: SiteAdapter[] = [workday, greenhouse, ashby, lever, generic];

export const adapterFor = (doc: Document) => ADAPTERS.find((a) => a.active(doc));
