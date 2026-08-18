export const MAPLIBRE_WORKER_URL = "/vendor/maplibre/maplibre-gl-worker.mjs";

type MapLibreWorkerConfig = {
  getWorkerUrl?: () => string | undefined;
  setWorkerUrl: (value: string) => void;
};

export function configureMapLibreWorker(maplibre: MapLibreWorkerConfig): void {
  if (maplibre.getWorkerUrl?.() === MAPLIBRE_WORKER_URL) return;
  maplibre.setWorkerUrl(MAPLIBRE_WORKER_URL);
}
