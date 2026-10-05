import { Prisma } from '@prisma/client';
import { officeTypes } from '../files/file-inspection';

export const fileTypes = {
  image: { startsWith: 'image/' },
  pdf: { equals: 'application/pdf' },
  document: { in: [officeTypes.docx, officeTypes.odt] },
  spreadsheet: { in: [officeTypes.xlsx, officeTypes.ods] },
  presentation: { in: [officeTypes.pptx, officeTypes.odp] },
  archive: { equals: 'application/zip' },
  text: { equals: 'text/plain' },
} satisfies Record<string, Prisma.StringFilter>;

export type FileType = keyof typeof fileTypes;
