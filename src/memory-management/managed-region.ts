export const MANAGED_REGION_START = "<!-- reflection:managed:start -->";
export const MANAGED_REGION_END = "<!-- reflection:managed:end -->";

export interface ManagedRegionParseResult {
  hasManagedRegion: boolean;
  beforeManaged: string;
  managedBody: string;
  afterManaged: string;
}

export interface ManagedRegionDriftResult {
  isDrifted: boolean;
  actualContent: string;
  expectedContent: string;
}

function normalizeTrailingNewline(content: string): string {
  if (content === "") {
    return "";
  }

  return content.endsWith("\n") ? content : `${content}\n`;
}

export function parseManagedRegion(content: string): ManagedRegionParseResult {
  const startIndex = content.indexOf(MANAGED_REGION_START);
  const endIndex = content.indexOf(MANAGED_REGION_END);

  if (startIndex === -1 || endIndex === -1 || endIndex < startIndex) {
    return {
      hasManagedRegion: false,
      beforeManaged: content,
      managedBody: "",
      afterManaged: "",
    };
  }

  const beforeManaged = content.slice(0, startIndex);
  const managedContentStart = startIndex + MANAGED_REGION_START.length;
  const managedBody = content
    .slice(managedContentStart, endIndex)
    .replace(/^\n/, "");
  const afterManaged = content
    .slice(endIndex + MANAGED_REGION_END.length)
    .replace(/^\n/, "");

  return {
    hasManagedRegion: true,
    beforeManaged,
    managedBody,
    afterManaged,
  };
}

export function renderManagedRegion(
  originalContent: string,
  managedBody: string
): string {
  const parsed = parseManagedRegion(originalContent);
  const normalizedManagedBody = normalizeTrailingNewline(managedBody);

  if (!parsed.hasManagedRegion) {
    const beforeContent = normalizeTrailingNewline(originalContent);
    const separator = beforeContent === "" || beforeContent.endsWith("\n\n") ? "" : "\n";

    return [
      beforeContent,
      separator,
      MANAGED_REGION_START,
      "\n",
      normalizedManagedBody,
      MANAGED_REGION_END,
      "\n",
    ].join("");
  }

  return [
    parsed.beforeManaged,
    MANAGED_REGION_START,
    "\n",
    normalizedManagedBody,
    MANAGED_REGION_END,
    parsed.afterManaged === "" ? "" : "\n",
    parsed.afterManaged,
  ].join("");
}

export function detectManagedRegionDrift(
  originalContent: string,
  expectedManagedBody: string
): ManagedRegionDriftResult {
  const parsed = parseManagedRegion(originalContent);
  const actualContent = normalizeTrailingNewline(parsed.managedBody);
  const expectedContent = normalizeTrailingNewline(expectedManagedBody);

  return {
    isDrifted: actualContent !== expectedContent,
    actualContent,
    expectedContent,
  };
}
