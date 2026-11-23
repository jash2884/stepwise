// The misconception library: every entry, grouped by GATE topic slug.
// See kit.js for what an entry is.
import { OS } from "./os.js";
import { DBMS } from "./dbms.js";
import { CN } from "./cn.js";
import { DSA } from "./dsa.js";
import { THEORY } from "./theory.js";
import { HARDWARE } from "./hardware.js";

export const ALL = [...OS, ...DBMS, ...CN, ...DSA, ...THEORY, ...HARDWARE];

export const BY_TOPIC = ALL.reduce((map, m) => {
  (map[m.topic] ??= []).push(m);
  return map;
}, {});

export const TOPICS_COVERED = Object.keys(BY_TOPIC);
export const misconceptionsFor = (topic) => BY_TOPIC[topic] ?? [];
export const misconceptionById = (topic, id) => misconceptionsFor(topic).find((m) => m.id === id) ?? null;
