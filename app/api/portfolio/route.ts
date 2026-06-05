import { NextResponse } from 'next/server';
import { createClient } from 'next-sanity';

const client = createClient({
  projectId: 'q2qjj1se',
  dataset: 'production',
  useCdn: true,
  apiVersion: '2026-01-01',
  token: process.env.SANITY_READ_TOKEN,
});

export const revalidate = 60;

const projectQuery = `*[_type == "project" && !(_id in path("drafts.**")) && coalesce(isVisible, true) != false] | order(featured desc, displayOrder asc, _createdAt desc) {
  "id": _id,
  title,
  "category": category->slug.current,
  "categoryTitle": category->title,
  description,
  area,
  location,
  year,
  materials,
  featured,
  mainImagePosition,
  mainImagePositionX,
  mainImagePositionY,
  "mainImage": mainImage.asset->url,
  "mainImageAlt": mainImage.alt,
  "beforeImage": beforeImage.asset->url,
  "galleryGroups": galleryGroups[]{
    "roomType": roomType,
    "title": title,
    "displayOrder": displayOrder,
    "images": images[]{
      "url": asset->url,
      "caption": caption,
      "displayOrder": displayOrder,
      "alt": alt
    }
  },
  "gallery": gallery[]{
    "url": asset->url,
    "roomType": roomType,
    "caption": caption,
    "displayOrder": displayOrder,
    "alt": alt
  }
}`;

const categoryQuery = `*[_type == "category" && coalesce(isVisible, true) != false] | order(displayOrder asc, title asc) {
  "title": title,
  "value": slug.current
}`;

const settingsQuery = `*[_type == "siteSettings"][0]{
  "heroImage": heroImage.asset->url,
  "heroImageAlt": heroImage.alt,
  "heroImage2": heroImage2.asset->url,
  "heroImage2Alt": heroImage2.alt,
  "heroImage3": heroImage3.asset->url,
  "heroImage3Alt": heroImage3.alt,
  heroLabel,
  heroTitle,
  heroDescription,
  primaryButtonLabel,
  secondaryButtonLabel,
  statementLabel,
  statementTitle,
  statementBody,
  projectSectionTitle,
  projectButtonLabel,
  portfolioTitle,
  aboutLabel,
  aboutTitle,
  aboutBody,
  processLabel,
  processTitle,
  locationLabel,
  locationTitle,
  address,
  lotAddress,
  mapLocation{
    lat,
    lng
  },
  phone,
  mapLat,
  mapLng,
  contactLabel,
  contactTitle,
  contactBody,
  consultationEmail,
  consultationPropertyQuestion,
  consultationPropertyOptions,
  consultationAreaQuestion,
  consultationAreaOptions,
  consultationStatusQuestion,
  consultationStatusOptions,
  consultationReasonQuestion,
  consultationReasonOptions,
  consultationBudgetQuestion,
  consultationBudgetOptions,
  consultationTimelineQuestion,
  consultationTimelineOptions,
  consultationPrivacyText,
  representativeName,
  businessNumber,
  companyStartYear,
  kakaoUrl
}`;

export async function GET() {
  try {
    const [projects, categories, settings] = await Promise.all([
      client.fetch(projectQuery, {}, { next: { revalidate: 60 } }),
      client.fetch(categoryQuery, {}, { next: { revalidate: 60 } }),
      client.fetch(settingsQuery, {}, { next: { revalidate: 60 } }),
    ]);

    return NextResponse.json(
      {
        projects: projects || [],
        categories: categories || [],
        settings: settings || null,
      },
      {
        headers: {
          'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300',
        },
      },
    );
  } catch (error) {
    console.error('Failed to load Sanity portfolio data.', error);
    return NextResponse.json(
      {
        error: 'Project 데이터를 불러오지 못했습니다.',
        projects: [],
        categories: [],
        settings: null,
      },
      { status: 500 },
    );
  }
}
