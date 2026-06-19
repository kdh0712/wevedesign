import { createClient } from 'next-sanity';
import { projectSlug } from './seo-utils';

export type Category = {
  title: string;
  value: string;
};

export type GalleryImage = {
  url?: string;
  roomType?: string;
  caption?: string;
  displayOrder?: number;
  alt?: string;
};

export type GalleryGroup = {
  roomType?: string;
  title?: string;
  displayOrder?: number;
  images?: GalleryImage[];
};

export type PortfolioProject = {
  id: string;
  title: string;
  category?: string;
  categoryTitle?: string;
  description?: string;
  area?: number;
  location?: string;
  year?: string;
  materials?: string;
  blogUrl?: string;
  featured?: boolean;
  mainImagePosition?: string;
  mainImagePositionX?: number;
  mainImagePositionY?: number;
  mainImage?: string;
  mainImageAlt?: string;
  beforeImage?: string;
  galleryGroups?: GalleryGroup[];
  gallery?: GalleryImage[];
  updatedAt?: string;
  createdAt?: string;
};

export type SiteSettings = {
  heroImage?: string;
  heroImageAlt?: string;
  heroImage2?: string;
  heroImage2Alt?: string;
  heroImage3?: string;
  heroImage3Alt?: string;
  heroLabel?: string;
  heroTitle?: string;
  heroDescription?: string;
  primaryButtonLabel?: string;
  secondaryButtonLabel?: string;
  statementLabel?: string;
  statementTitle?: string;
  statementBody?: string;
  projectSectionTitle?: string;
  projectButtonLabel?: string;
  portfolioTitle?: string;
  aboutLabel?: string;
  aboutTitle?: string;
  aboutBody?: string;
  processLabel?: string;
  processTitle?: string;
  locationLabel?: string;
  locationTitle?: string;
  address?: string;
  lotAddress?: string;
  phone?: string;
  safePhone?: string;
  companyPhone?: string;
  contactLabel?: string;
  contactTitle?: string;
  contactBody?: string;
  consultationEmail?: string;
  representativeName?: string;
  businessNumber?: string;
  companyStartYear?: string;
  kakaoUrl?: string;
  kakaoChannelManagerUrl?: string;
  instagramUrl?: string;
  blogUrl?: string;
  [key: string]: unknown;
};

const client = createClient({
  projectId: 'q2qjj1se',
  dataset: 'production',
  useCdn: true,
  apiVersion: '2026-01-01',
  token: process.env.SANITY_READ_TOKEN,
});

export const revalidateSeconds = 60;

export const projectQuery = `*[_type == "project" && !(_id in path("drafts.**")) && coalesce(isVisible, true) != false] | order(featured desc, displayOrder asc, _createdAt desc) {
  "id": _id,
  title,
  "category": category->slug.current,
  "categoryTitle": category->title,
  description,
  area,
  location,
  year,
  materials,
  blogUrl,
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
  },
  "updatedAt": coalesce(updatedAt, _updatedAt),
  "createdAt": _createdAt
}`;

export const categoryQuery = `*[_type == "category" && coalesce(isVisible, true) != false] | order(displayOrder asc, title asc) {
  "title": title,
  "value": slug.current
}`;

export const settingsQuery = `coalesce(*[_id == "siteSettings"][0], *[_type == "siteSettings"][0]){
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
  mapLocation{lat,lng},
  phone,
  safePhone,
  companyPhone,
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
  consultationSurveyConfig,
  representativeName,
  businessNumber,
  companyStartYear,
  kakaoUrl,
  kakaoChannelManagerUrl,
  instagramUrl,
  blogUrl,
  popupEnabled,
  popupLayout,
  popupPosition,
  popupWidth,
  popupImageFit,
  popupStartDate,
  popupEndDate,
  popupTitle,
  popupBody,
  popupButtonLabel,
  popupButtonUrl,
  popups[]{
    "_key": _key,
    enabled,
    layout,
    position,
    width,
    imageFit,
    startDate,
    endDate,
    title,
    body,
    buttonLabel,
    buttonUrl,
    imageUrl,
    "image": coalesce(image.asset->url, imageUrl),
    elements[]{"_key": _key, type, label, url, src, x, y, width, height, background, color, borderColor, borderRadius, fontSize, opacity}
  },
  "popupImage": popupImage.asset->url
}`;

export async function getPortfolioData() {
  const [projects, categories, settings] = await Promise.all([
    client.fetch<PortfolioProject[]>(projectQuery, {}, { next: { revalidate: revalidateSeconds } }),
    client.fetch<Category[]>(categoryQuery, {}, { next: { revalidate: revalidateSeconds } }),
    client.fetch<SiteSettings | null>(settingsQuery, {}, { next: { revalidate: revalidateSeconds } }),
  ]);

  return {
    projects: projects || [],
    categories: categories || [],
    settings: settings || null,
  };
}

export async function getProjects() {
  return client.fetch<PortfolioProject[]>(projectQuery, {}, { next: { revalidate: revalidateSeconds } });
}

export async function getProjectBySlug(slug: string) {
  const projects = await getProjects();
  return (projects || []).find((project) => projectSlug(project) === slug) || null;
}
