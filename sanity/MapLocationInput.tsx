import React, { useCallback, useEffect, useRef, useState } from 'react';
import { PatchEvent, set, type ObjectInputProps } from 'sanity';

type MapLocationValue = {
  _type?: string;
  lat?: number;
  lng?: number;
};

const DEFAULT_LOCATION = {
  lat: 37.38104,
  lng: 126.97482,
};

const NAVER_MAP_SCRIPT_ID = 'weve-naver-map-picker';
const NAVER_MAP_SCRIPT_SRC = 'https://openapi.map.naver.com/openapi/v3/maps.js?ncpKeyId=nbfvy94d90';

function loadNaverMapScript() {
  if (typeof window === 'undefined') return Promise.reject(new Error('Window is not available.'));
  if ((window as any).naver?.maps) return Promise.resolve();

  const existingScript = document.getElementById(NAVER_MAP_SCRIPT_ID) as HTMLScriptElement | null;
  if (existingScript) {
    return new Promise<void>((resolve, reject) => {
      existingScript.addEventListener('load', () => resolve(), { once: true });
      existingScript.addEventListener('error', () => reject(new Error('Naver map script failed.')), { once: true });
    });
  }

  return new Promise<void>((resolve, reject) => {
    const script = document.createElement('script');
    script.id = NAVER_MAP_SCRIPT_ID;
    script.src = NAVER_MAP_SCRIPT_SRC;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Naver map script failed.'));
    document.head.appendChild(script);
  });
}

export function MapLocationInput(props: ObjectInputProps<MapLocationValue>) {
  const mapRef = useRef<HTMLDivElement | null>(null);
  const mapInstanceRef = useRef<any>(null);
  const markerRef = useRef<any>(null);
  const [loadError, setLoadError] = useState('');
  const location = {
    lat: props.value?.lat || DEFAULT_LOCATION.lat,
    lng: props.value?.lng || DEFAULT_LOCATION.lng,
  };

  const saveLocation = useCallback(
    (lat: number, lng: number) => {
      props.onChange(
        PatchEvent.from(
          set({
            _type: 'mapLocation',
            lat: Number(lat.toFixed(7)),
            lng: Number(lng.toFixed(7)),
          }),
        ),
      );
    },
    [props],
  );

  useEffect(() => {
    let cancelled = false;

    loadNaverMapScript()
      .then(() => {
        if (cancelled || !mapRef.current) return;

        const naver = (window as any).naver;
        const center = new naver.maps.LatLng(location.lat, location.lng);

        const map = new naver.maps.Map(mapRef.current, {
          center,
          zoom: 17,
          zoomControl: true,
        });
        const marker = new naver.maps.Marker({
          position: center,
          map,
          title: 'WEVE DESIGN',
        });

        mapInstanceRef.current = map;
        markerRef.current = marker;

        naver.maps.Event.addListener(map, 'click', (event: any) => {
          const lat = event.coord.lat();
          const lng = event.coord.lng();
          marker.setPosition(event.coord);
          map.setCenter(event.coord);
          saveLocation(lat, lng);
        });
      })
      .catch(() => {
        if (!cancelled) setLoadError('지도를 불러오지 못했습니다. Sanity Studio 주소가 네이버 지도 사용 도메인에 등록되어 있는지 확인해 주세요.');
      });

    return () => {
      cancelled = true;
    };
  }, [location.lat, location.lng, saveLocation]);

  useEffect(() => {
    const naver = (window as any).naver;
    if (!naver?.maps || !markerRef.current || !mapInstanceRef.current) return;

    const nextLocation = new naver.maps.LatLng(location.lat, location.lng);
    markerRef.current.setPosition(nextLocation);
    mapInstanceRef.current.setCenter(nextLocation);
  }, [location.lat, location.lng]);

  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <div
        style={{
          border: '1px solid rgba(255,255,255,0.14)',
          borderRadius: 12,
          overflow: 'hidden',
          background: '#111318',
        }}
      >
        <div
          style={{
            padding: '14px 16px',
            borderBottom: '1px solid rgba(255,255,255,0.1)',
          }}
        >
          <strong style={{ display: 'block', color: '#fff', fontSize: 15 }}>지도에서 마커 위치 선택</strong>
          <span style={{ display: 'block', marginTop: 4, color: 'rgba(255,255,255,0.64)', fontSize: 13 }}>
            지도에서 정확한 건물 위치를 클릭하면 홈페이지 마커 위치가 저장됩니다.
          </span>
        </div>
        <div ref={mapRef} style={{ height: 420, width: '100%', background: '#ece8df' }} />
      </div>

      {loadError && (
        <div style={{ borderRadius: 8, background: '#3b1d1d', color: '#ffd7d7', padding: 12, fontSize: 13 }}>
          {loadError}
        </div>
      )}

      <div style={{ color: 'rgba(255,255,255,0.72)', fontSize: 13, lineHeight: 1.6 }}>
        현재 저장 위치: 위도 {location.lat}, 경도 {location.lng}
      </div>
    </div>
  );
}
