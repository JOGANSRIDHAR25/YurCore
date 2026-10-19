export type ConsentView = {
  id: string;
  practitionerName: string;
  practitionerInitials: string;
  action: string;
  duration: string;
  recordTypes: string[];
  expiresAt: string | null;
  createdAt: string;
};
