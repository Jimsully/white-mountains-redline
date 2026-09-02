type MapStartupErrorInput = {
  hasLoaded: boolean;
  nodeEnv?: string;
  errorMessage?: string;
};

export const MAP_LOAD_ERROR_MESSAGE = "Map could not be loaded.";

export function startupMapErrorMessage({
  hasLoaded,
  nodeEnv,
  errorMessage,
}: MapStartupErrorInput): string | null {
  if (hasLoaded) return null;
  if (nodeEnv === "development" && errorMessage) return `${MAP_LOAD_ERROR_MESSAGE} ${errorMessage}`;
  return MAP_LOAD_ERROR_MESSAGE;
}
