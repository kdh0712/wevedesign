import { NextResponse } from 'next/server';
import { assertManager, managerClient } from '../_utils';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  const authError = assertManager(request);
  if (authError) return authError;

  try {
    const settings = await managerClient.fetch(
      'coalesce(*[_id == "siteSettings"][0], *[_type == "siteSettings"][0]){consultationEmail, representativeName, businessNumber, companyStartYear, phone, safePhone, companyPhone, address, lotAddress, locationLabel, locationTitle, heroLabel, heroTitle, heroDescription, primaryButtonLabel, secondaryButtonLabel, statementLabel, statementTitle, statementBody, projectSectionTitle, projectButtonLabel, portfolioTitle, aboutLabel, aboutTitle, aboutBody, processLabel, processTitle, contactLabel, contactTitle, contactBody, consultationPropertyQuestion, consultationPropertyOptions, consultationAreaQuestion, consultationAreaOptions, consultationStatusQuestion, consultationStatusOptions, consultationReasonQuestion, consultationReasonOptions, consultationBudgetQuestion, consultationBudgetOptions, consultationTimelineQuestion, consultationTimelineOptions, consultationPrivacyText, consultationSurveyConfig, kakaoUrl, kakaoChannelManagerUrl, instagramUrl, blogUrl, naverPlaceUrl, kakaoUnreadCount, naverUnreadCount, popupEnabled, popupLayout, popupPosition, popupWidth, popupImageFit, popupStartDate, popupEndDate, popupTitle, popupBody, popupButtonLabel, popupButtonUrl, popups[]{"_key": _key, enabled, layout, position, width, imageFit, startDate, endDate, title, body, buttonLabel, buttonUrl, imageUrl, "image": coalesce(image.asset->url, imageUrl), elements[]{"_key": _key, type, label, url, src, x, y, width, height, background, color, borderColor, borderRadius, fontSize, opacity}}, "heroImage": heroImage.asset->url, "heroImage2": heroImage2.asset->url, "heroImage3": heroImage3.asset->url, "popupImage": popupImage.asset->url}',
    );
    return NextResponse.json({ settings: settings || null });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Failed to load settings.' }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  const authError = assertManager(request);
  if (authError) return authError;

  try {
    const body = (await request.json()) as Record<string, unknown>;
    const updates: Record<string, unknown> = {};

    const allowedFields = [
      'consultationEmail',
      'representativeName',
      'businessNumber',
      'companyStartYear',
      'phone',
      'safePhone',
      'companyPhone',
      'address',
      'lotAddress',
      'locationLabel',
      'locationTitle',
      'heroLabel',
      'heroTitle',
      'heroDescription',
      'primaryButtonLabel',
      'secondaryButtonLabel',
      'statementLabel',
      'statementTitle',
      'statementBody',
      'projectSectionTitle',
      'projectButtonLabel',
      'portfolioTitle',
      'aboutLabel',
      'aboutTitle',
      'aboutBody',
      'processLabel',
      'processTitle',
      'contactLabel',
      'contactTitle',
      'contactBody',
      'consultationPropertyQuestion',
      'consultationPropertyOptions',
      'consultationAreaQuestion',
      'consultationAreaOptions',
      'consultationStatusQuestion',
      'consultationStatusOptions',
      'consultationReasonQuestion',
      'consultationReasonOptions',
      'consultationBudgetQuestion',
      'consultationBudgetOptions',
      'consultationTimelineQuestion',
      'consultationTimelineOptions',
      'consultationPrivacyText',
      'consultationSurveyConfig',
      'kakaoUrl',
      'kakaoChannelManagerUrl',
      'instagramUrl',
      'blogUrl',
      'naverPlaceUrl',
      'kakaoUnreadCount',
      'naverUnreadCount',
      'popupEnabled',
      'popupLayout',
      'popupPosition',
      'popupWidth',
      'popupImageFit',
      'popupStartDate',
      'popupEndDate',
      'popupTitle',
      'popupBody',
      'popupButtonLabel',
      'popupButtonUrl',
    ];

    for (const field of allowedFields) {
      if (Object.prototype.hasOwnProperty.call(body, field)) {
        updates[field] = String(body[field] || '').trim();
      }
    }

    if (Array.isArray(body.popups)) {
      updates.popups = body.popups.map((popup, index) => {
        const item = popup && typeof popup === 'object' ? (popup as Record<string, unknown>) : {};
        return {
          _type: 'object',
          _key: String(item._key || `popup-${Date.now()}-${index}`).replace(/[^a-zA-Z0-9_-]/g, ''),
          enabled: String(item.enabled || 'false').trim(),
          layout: String(item.layout || 'imageTop').trim(),
          position: String(item.position || 'center').trim(),
          width: String(item.width || '520').trim(),
          imageFit: String(item.imageFit || 'cover').trim(),
          startDate: String(item.startDate || '').trim(),
          endDate: String(item.endDate || '').trim(),
          title: String(item.title || '').trim(),
          body: String(item.body || '').trim(),
          buttonLabel: String(item.buttonLabel || '').trim(),
          buttonUrl: String(item.buttonUrl || '').trim(),
          imageUrl: String(item.imageUrl || item.image || '').trim(),
          elements: Array.isArray(item.elements)
            ? item.elements.map((element, elementIndex) => {
                const entry = element && typeof element === 'object' ? (element as Record<string, unknown>) : {};
                return {
                  _type: 'object',
                  _key: String(entry._key || `popup-element-${index}-${elementIndex}-${Date.now()}`).replace(/[^a-zA-Z0-9_-]/g, ''),
                  type: String(entry.type || 'button').trim(),
                  label: String(entry.label || '').trim(),
                  url: String(entry.url || '').trim(),
                  src: String(entry.src || '').trim(),
                  x: String(entry.x || '50').trim(),
                  y: String(entry.y || '50').trim(),
                  width: String(entry.width || '28').trim(),
                  height: String(entry.height || '12').trim(),
                  background: String(entry.background || '#f1c76a').trim(),
                  color: String(entry.color || '#171512').trim(),
                  borderColor: String(entry.borderColor || 'rgba(255,255,255,0.45)').trim(),
                  borderRadius: String(entry.borderRadius || '8').trim(),
                  fontSize: String(entry.fontSize || '14').trim(),
                  opacity: String(entry.opacity || '100').trim(),
                };
              })
            : [],
        };
      });
    }

    if (typeof updates.consultationEmail === 'string' && updates.consultationEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(updates.consultationEmail)) {
      return NextResponse.json({ error: '올바른 이메일 주소를 입력해주세요.' }, { status: 400 });
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: '저장할 홈페이지 설정을 입력해주세요.' }, { status: 400 });
    }

    const fixedSettings = await managerClient.fetch('*[_id == "siteSettings"][0]{_id}');
    if (!fixedSettings?._id) {
      const existingSettings = await managerClient.fetch('*[_type == "siteSettings"][0]');
      const { _id, _rev, _createdAt, _updatedAt, ...portableSettings } = existingSettings || {};
      await managerClient.createIfNotExists({
        ...portableSettings,
        _id: 'siteSettings',
        _type: 'siteSettings',
        title: portableSettings.title || 'WEVE DESIGN 홈페이지 설정',
      });
    }

    const settings = await managerClient.patch('siteSettings').set(updates).commit();
    return NextResponse.json({ settings });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Failed to save settings.' }, { status: 500 });
  }
}
