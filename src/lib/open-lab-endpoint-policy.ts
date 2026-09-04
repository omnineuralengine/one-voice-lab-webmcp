const ACCOUNT_DATA_FAMILIES = new Set([
  "Projects",
  "Requests",
  "Usage",
  "Billing",
  "Administration",
]);

export type OpenLabEndpointDescriptor = {
  family: string;
  pathTemplate: string;
};

export function isOpenLabAccountDataEndpoint(endpoint: OpenLabEndpointDescriptor): boolean {
  return ACCOUNT_DATA_FAMILIES.has(endpoint.family)
    || endpoint.pathTemplate === "/v1/projects"
    || endpoint.pathTemplate.startsWith("/v1/projects/");
}
