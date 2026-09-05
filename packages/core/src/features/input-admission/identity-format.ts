// Resource accounting checks byte length after grammar validation (ADR-0006).
// Keep format independent of the schema length bound, so an oversized but
// otherwise valid identity can produce the named identifierBytes failure.
// This scan is iterative even for resource-bounded megabyte-sized strings.
function matchesFormat(value: string, portable: boolean): boolean {
  let needsLetter = true;
  let needsAlphanumeric = false;
  let slashSeen = false;
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    const letter = code >= 97 && code <= 122;
    const digit = code >= 48 && code <= 57;
    if (needsLetter) {
      if (!letter) return false;
      needsLetter = false;
    } else if (needsAlphanumeric) {
      if (!letter && !digit) return false;
      needsAlphanumeric = false;
    } else if (code === 45) needsAlphanumeric = true;
    else if (code === 47 && portable) { needsLetter = true; slashSeen = true; }
    else if (!letter && !digit) return false;
  }
  return !needsLetter && !needsAlphanumeric && (!portable || slashSeen);
}

export function isPortableIdFormat(value: string): boolean {
  return matchesFormat(value, true);
}

export function isLocalTokenFormat(value: string): boolean {
  return matchesFormat(value, false);
}
