import React, { useMemo } from 'react';
import type { StringInputProps } from 'sanity';

type HomepagePreviewOptions = {
  previewTitle?: string;
  previewBody?: string;
  sectionId?: string;
};

export function HomepagePreview(props: StringInputProps) {
  const options = (props.schemaType.options || {}) as HomepagePreviewOptions;
  const sectionId = options.sectionId || 'home';
  const previewUrl = useMemo(() => {
    const origin = typeof window === 'undefined' ? '' : window.location.origin;
    return `${origin}/#${sectionId}`;
  }, [sectionId]);

  return (
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
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
          padding: '14px 16px',
          borderBottom: '1px solid rgba(255,255,255,0.1)',
        }}
      >
        <div>
          <strong style={{ display: 'block', color: '#fff', fontSize: 15 }}>
            {options.previewTitle || '홈페이지 화면 미리보기'}
          </strong>
          {options.previewBody && (
            <span style={{ display: 'block', marginTop: 4, color: 'rgba(255,255,255,0.64)', fontSize: 13 }}>
              {options.previewBody}
            </span>
          )}
        </div>
        <a
          href={previewUrl}
          target="_blank"
          rel="noreferrer"
          style={{
            flex: '0 0 auto',
            border: '1px solid rgba(255,255,255,0.22)',
            borderRadius: 8,
            color: '#fff',
            padding: '8px 10px',
            textDecoration: 'none',
            fontSize: 13,
          }}
        >
          크게 보기
        </a>
      </div>
      <iframe
        title={options.previewTitle || '홈페이지 미리보기'}
        src={previewUrl}
        style={{
          display: 'block',
          width: '100%',
          height: 360,
          border: 0,
          background: '#fff',
        }}
      />
    </div>
  );
}
