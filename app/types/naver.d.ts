export {};

declare global {
  interface Window {
    naver?: {
      maps: {
        LatLng: new (lat: number, lng: number) => unknown;
        Map: new (
          target: string | HTMLElement,
          options: Record<string, unknown>,
        ) => NaverMap;
        Marker: new (options: Record<string, unknown>) => unknown;
        InfoWindow: new (options: Record<string, unknown>) => NaverInfoWindow;
        Service?: {
          Status: {
            OK: string;
          };
          geocode: (
            options: { query: string },
            callback: (
              status: string,
              response?: {
                v2?: {
                  addresses?: Array<{
                    x: string;
                    y: string;
                  }>;
                };
              },
            ) => void,
          ) => void;
        };
        Event: {
          addListener: (target: unknown, eventName: string, listener: () => void) => void;
        };
      };
    };
  }
}

type NaverMap = Record<string, unknown>;

type NaverInfoWindow = {
  open: (map: NaverMap, marker?: unknown) => void;
  close: () => void;
  getMap: () => NaverMap | null;
};
