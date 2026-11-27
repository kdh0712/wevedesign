// 시공 사례 (Sanity project) records as the manager reads them (app/api/manager/office/route.ts, PROJECTS_QUERY).

export type CategoryOption = {
  _id: string;
  title: string;
  slug?: string;
};

export type ManagedProjectImage = {
  _key?: string;
  assetId?: string;
  url?: string;
  alt?: string;
  caption?: string;
  roomType?: string;
  displayOrder?: number;
};

export type ManagedProjectGalleryGroup = {
  _key?: string;
  roomType?: string;
  title?: string;
  displayOrder?: number;
  images?: ManagedProjectImage[];
};

export type ManagedProject = {
  _id: string;
  // The Sanity revision the list was read at; a save is accepted only on it.
  _rev?: string;
  title?: string;
  description?: string;
  location?: string;
  siteType?: string;
  area?: number;
  year?: string;
  materials?: string;
  blogUrl?: string;
  displayOrder?: number;
  mainImage?: string;
  mainImageAssetId?: string;
  mainImageAlt?: string;
  mainImagePosition?: string;
  mainImagePositionX?: number;
  mainImagePositionY?: number;
  beforeImage?: string;
  beforeImageAssetId?: string;
  featured?: boolean;
  isVisible?: boolean;
  // Set when the project is in the 휴지통 (spec docs/superpowers/specs/2026-11-27-project-trash-design.md).
  deletedAt?: string;
  deletedBy?: string;
  categoryId?: string;
  categoryTitle?: string;
  galleryGroups?: ManagedProjectGalleryGroup[];
  gallery?: ManagedProjectImage[];
};
