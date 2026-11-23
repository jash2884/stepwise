// The AI tool-schema registry: for every visualiser, the URL parameters it reads
// and a validate() that runs its engine. Used by the /ask feature on the server
// (to check what a model filled in) and by tests. One file per subject in
// schemas/; see schema-kit.js for the shape. Pure ES modules, no DOM.
import { SCHEMAS as DSA } from "./schemas/dsa.js";
import { SCHEMAS as OS } from "./schemas/os.js";
import { SCHEMAS as DBMS } from "./schemas/dbms.js";
import { SCHEMAS as CN } from "./schemas/cn.js";
import { SCHEMAS as TOC } from "./schemas/toc.js";
import { SCHEMAS as CD } from "./schemas/cd.js";
import { SCHEMAS as DIGITAL_LOGIC } from "./schemas/digital-logic.js";
import { SCHEMAS as COA } from "./schemas/coa.js";
import { SCHEMAS as DISCRETE_MATHS } from "./schemas/discrete-maths.js";
import { SCHEMAS as MATHS } from "./schemas/maths.js";
import { SCHEMAS as AI } from "./schemas/ai.js";
export { check, coerce, describe, toUrl } from "./schema-kit.js";

export const SCHEMAS = [...DSA, ...OS, ...DBMS, ...CN, ...TOC, ...CD, ...DIGITAL_LOGIC, ...COA, ...DISCRETE_MATHS, ...MATHS, ...AI];
export const SCHEMA_BY_SLUG = new Map(SCHEMAS.map((s) => [s.slug, s]));
