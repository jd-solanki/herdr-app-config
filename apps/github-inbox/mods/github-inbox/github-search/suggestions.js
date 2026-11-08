// shortcut: only the word at the end is completed, and a quoted value with a space in it is not; read the cursor if that matters.
export function lastWord(query) {
  return query.slice(query.lastIndexOf(" ") + 1);
}

export const wantsLabels = (query) => /^-?label:/.test(lastWord(query));

// Completes the last word once it has a `:`: a qualifier, or a label name after label: or -label:.
// Plain words like `in` get none, so Enter never rewrites free text; a finished word gets none either.
export function searchSuggestions(query, qualifiers, labelNames) {
  const word = lastWord(query);
  if (!word.includes(":")) return [];
  const negation = word.startsWith("-") ? "-" : "";
  const typed = word.slice(negation.length).toLowerCase();
  const candidates = typed.startsWith("label:")
    ? labelNames
        .filter((name) =>
          name.toLowerCase().includes(typed.slice("label:".length).replace(/^"/, "")),
        )
        .map((name) => `${negation}label:${name.includes(" ") ? `"${name}"` : name}`)
    : qualifiers
        .filter((qualifier) => qualifier.startsWith(typed))
        .map((qualifier) => negation + qualifier);
  const isFinished = candidates.some((candidate) => candidate.toLowerCase() === word.toLowerCase());
  return isFinished ? [] : candidates;
}

// Search words for gh, one argument each; a quoted value (label:"needs review") stays one word.
export const queryWords = (query) => query.match(/(?:[^\s"]+|"[^"]*")+/g) ?? [];
