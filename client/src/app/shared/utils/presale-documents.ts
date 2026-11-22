import { DetailDocument } from 'src/app/shared/components/detail-panel/detail-panel.model';

/** An enquiry's presale files as detail-panel documents, tagged so they read as coming from presales. */
export function presaleDocs(enquiry: any): (DetailDocument & { kind: string })[] {
  return presaleFilesOf(enquiry)
    .map((f) => ({ id: f.fileName, name: f.originalname || f.fileName, kind: (f.originalname || f.fileName).split(".").pop().toUpperCase().slice(0, 4), uploadedBy: "Presale" }));
}

/** Raw presale files; accepts a populated enquiry or a one-element lookup array. */
export function presaleFilesOf(enquiry: any): any[] {
  if (Array.isArray(enquiry)) enquiry = enquiry[0];
  return ((enquiry?.preSale?.presaleFiles as any[]) || [])
    .filter((f) => f?.fileName);
}
