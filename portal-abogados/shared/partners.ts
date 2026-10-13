export const partnerLimits = { count: 40, imageBytes: 48 * 1024, storageBytes: 2 * 1024 * 1024 } as const;
export type PartnerCategory = "company" | "law_firm";
export type PublicPartner = {
  id: string; name: string; category: PartnerCategory; alt: string; linkUrl: string;
  sortOrder: number; version: number; imageUrl: string;
};
export type AdminPartner = PublicPartner & {
  active: boolean; archived: boolean; byteSize: number; updatedAt: string; updatedBy: string;
};
export type PartnerAdminData = {
  partners: AdminPartner[]; storageBytes: number; limits: typeof partnerLimits;
};
